import { scanWebsite } from "@/lib/scan-engine";
import type { AnalysisMode, ScanJob, ScanItem } from "@/lib/types";
import { normalizeUrl, toSlug } from "@/lib/utils";

const CONCURRENCY = 6;
const DEFAULT_MAX_ATTEMPTS = 3;
const RETRY_BASE_DELAY_MS = 1500;
const RETRYABLE_ERROR_PATTERNS = [
  /timed? ?out/i,
  /abort/i,
  /fetch failed/i,
  /network/i,
  /econnreset/i,
  /enotfound/i,
  /429/,
  /5\d{2}/
];

interface CreateJobInput {
  urls: string[];
  mode: AnalysisMode;
  targets: string[];
}

interface GlobalState {
  jobs: Map<string, ScanJob>;
  runningJobs: Set<string>;
}

const globalStore = globalThis as typeof globalThis & {
  __techStackScannerState?: GlobalState;
};

if (!globalStore.__techStackScannerState) {
  globalStore.__techStackScannerState = {
    jobs: new Map<string, ScanJob>(),
    runningJobs: new Set<string>()
  };
}

const state = globalStore.__techStackScannerState;

function makeJobId(): string {
  return `job_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

function createItems(urls: string[]): ScanItem[] {
  return urls.map((url) => ({
    id: toSlug(url) || Math.random().toString(36).slice(2, 8),
    url,
    normalizedUrl: normalizeUrl(url) ?? url,
    status: "pending",
    attempts: 0,
    maxAttempts: DEFAULT_MAX_ATTEMPTS
  }));
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

function isRetryableError(error?: string): boolean {
  if (!error) {
    return false;
  }
  return RETRYABLE_ERROR_PATTERNS.some((pattern) => pattern.test(error));
}

function shouldRetry(item: ScanItem): boolean {
  return (
    item.status === "failed" &&
    item.attempts < item.maxAttempts &&
    isRetryableError(item.error)
  );
}

function nextRetryDelayMs(attempt: number): number {
  return RETRY_BASE_DELAY_MS * 2 ** Math.max(0, attempt - 1);
}

function recalculateCounts(job: ScanJob): void {
  job.counts = {
    pending: job.items.filter((item) => item.status === "pending").length,
    running: job.items.filter((item) => item.status === "running").length,
    completed: job.items.filter((item) => item.status === "completed").length,
    failed: job.items.filter((item) => item.status === "failed").length
  };

  if (job.counts.failed > 0 && job.counts.completed > 0 && job.counts.pending === 0 && job.counts.running === 0) {
    job.status = "partial";
  } else if (job.counts.pending === 0 && job.counts.running === 0 && job.counts.failed === 0) {
    job.status = "completed";
  } else if (job.counts.pending === 0 && job.counts.running === 0 && job.counts.completed === 0) {
    job.status = "failed";
  }

  job.updatedAt = new Date().toISOString();
}

async function runJob(jobId: string): Promise<void> {
  if (state.runningJobs.has(jobId)) {
    return;
  }

  const existingJob = state.jobs.get(jobId);
  if (!existingJob) {
    return;
  }
  const job = existingJob;
  state.runningJobs.add(jobId);

  try {
    job.status = "running";
    job.updatedAt = new Date().toISOString();

    const queue = job.items.map((_, index) => index);

    async function workerLoop(): Promise<void> {
      while (true) {
        const index = queue.shift();
        if (index === undefined) {
          break;
        }

        const item = job.items[index];
        if (!item) {
          break;
        }

        if (!normalizeUrl(item.url)) {
          item.status = "failed";
          item.error = "URL inválida após normalização.";
          item.finishedAt = new Date().toISOString();
          recalculateCounts(job);
          continue;
        }

        item.status = "running";
        item.nextRetryAt = undefined;
        item.startedAt = new Date().toISOString();
        item.attempts += 1;
        recalculateCounts(job);

        const result = await scanWebsite({
          url: item.url,
          normalizedUrl: item.normalizedUrl,
          mode: job.mode,
          targets: job.targets
        });

        item.result = result;
        item.status = result.status === "failed" ? "failed" : "completed";
        item.error = result.error;
        item.finishedAt = result.finishedAt;

        if (shouldRetry(item)) {
          const retryDelay = nextRetryDelayMs(item.attempts);
          item.status = "pending";
          item.nextRetryAt = new Date(Date.now() + retryDelay).toISOString();
          item.error = `Falha transitória. Reagendado (${item.attempts}/${item.maxAttempts}): ${result.error}`;
          recalculateCounts(job);
          await delay(retryDelay);
          queue.push(index);
          continue;
        }

        recalculateCounts(job);
      }
    }

    await Promise.all(Array.from({ length: CONCURRENCY }, () => workerLoop()));
    recalculateCounts(job);
  } finally {
    state.runningJobs.delete(jobId);
  }
}

export function createJob(input: CreateJobInput): ScanJob {
  const jobId = makeJobId();
  const now = new Date().toISOString();

  const job: ScanJob = {
    id: jobId,
    mode: input.mode,
    targets: input.targets,
    createdAt: now,
    updatedAt: now,
    status: "queued",
    total: input.urls.length,
    counts: {
      pending: input.urls.length,
      running: 0,
      completed: 0,
      failed: 0
    },
    items: createItems(input.urls)
  };

  state.jobs.set(jobId, job);

  void runJob(jobId);

  return job;
}

export function getJob(jobId: string): ScanJob | undefined {
  return state.jobs.get(jobId);
}

export function retryFailedItems(jobId: string): ScanJob | undefined {
  const job = state.jobs.get(jobId);
  if (!job) {
    return undefined;
  }

  if (state.runningJobs.has(jobId)) {
    return job;
  }

  for (const item of job.items) {
    if (item.status === "failed") {
      item.status = "pending";
      item.error = undefined;
      item.nextRetryAt = undefined;
      item.startedAt = undefined;
      item.finishedAt = undefined;
      item.result = undefined;
      item.attempts = 0;
    }
  }

  job.status = "queued";
  recalculateCounts(job);
  void runJob(jobId);

  return job;
}
