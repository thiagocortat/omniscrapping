import IORedis from "ioredis";
import { Queue, Worker } from "bullmq";
import { scanWebsite } from "@/lib/scan-engine";
import type { AnalysisMode, ScanItem, ScanJob, ScanStatus } from "@/lib/types";
import { normalizeUrl, toSlug } from "@/lib/utils";

const QUEUE_NAME = "techstack-scans";
const MAX_ATTEMPTS = 3;
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

interface ScanTaskPayload {
  scanId: string;
  itemId: string;
}

interface ScanMeta {
  id: string;
  mode: AnalysisMode;
  targets: string[];
  createdAt: string;
  updatedAt: string;
  status: ScanJob["status"];
  total: number;
  counts: {
    pending: number;
    running: number;
    completed: number;
    failed: number;
  };
  aborted: boolean;
}

function recalculateCountsFromItems(items: ScanItem[]): ScanMeta["counts"] {
  return items.reduce(
    (acc, item) => {
      if (item.status === "pending") {
        acc.pending += 1;
      } else if (item.status === "running") {
        acc.running += 1;
      } else if (item.status === "completed") {
        acc.completed += 1;
      } else if (item.status === "failed") {
        acc.failed += 1;
      }
      return acc;
    },
    {
      pending: 0,
      running: 0,
      completed: 0,
      failed: 0
    }
  );
}

const globalStore = globalThis as typeof globalThis & {
  __techstackRedis?: IORedis;
  __techstackQueue?: Queue;
  __techstackWorkerStarted?: boolean;
};

function getRedisUrl(): string {
  const url = process.env.REDIS_URL;
  if (!url) {
    throw new Error("REDIS_URL não configurada.");
  }
  return url;
}

function getRedis(): IORedis {
  if (!globalStore.__techstackRedis) {
    globalStore.__techstackRedis = new IORedis(getRedisUrl(), {
      maxRetriesPerRequest: null,
      enableReadyCheck: true
    });
  }
  return globalStore.__techstackRedis;
}

function getQueue(): Queue {
  if (!globalStore.__techstackQueue) {
    globalStore.__techstackQueue = new Queue(QUEUE_NAME, {
      connection: {
        url: getRedisUrl()
      },
      defaultJobOptions: {
        attempts: MAX_ATTEMPTS,
        backoff: {
          type: "exponential",
          delay: RETRY_BASE_DELAY_MS
        },
        removeOnComplete: 2000,
        removeOnFail: 5000
      }
    });
  }
  return globalStore.__techstackQueue;
}

function keyMeta(scanId: string): string {
  return `scan:${scanId}:meta`;
}

function keyItems(scanId: string): string {
  return `scan:${scanId}:items`;
}

function keyOrder(scanId: string): string {
  return `scan:${scanId}:order`;
}

function makeJobId(): string {
  return `job_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

function shouldRetry(error?: string): boolean {
  if (!error) {
    return false;
  }
  return RETRYABLE_ERROR_PATTERNS.some((pattern) => pattern.test(error));
}

function parseIntSafe(value: string | null | undefined): number {
  if (!value) {
    return 0;
  }
  const parsed = Number.parseInt(value, 10);
  return Number.isNaN(parsed) ? 0 : parsed;
}

async function readMeta(scanId: string): Promise<ScanMeta | undefined> {
  const redis = getRedis();
  const meta = await redis.hgetall(keyMeta(scanId));
  if (!meta?.id) {
    return undefined;
  }

  return {
    id: meta.id,
    mode: (meta.mode as AnalysisMode) ?? "all",
    targets: meta.targets ? (JSON.parse(meta.targets) as string[]) : [],
    createdAt: meta.createdAt,
    updatedAt: meta.updatedAt,
    status: (meta.status as ScanJob["status"]) ?? "queued",
    total: parseIntSafe(meta.total),
    counts: {
      pending: parseIntSafe(meta.pending),
      running: parseIntSafe(meta.running),
      completed: parseIntSafe(meta.completed),
      failed: parseIntSafe(meta.failed)
    },
    aborted: meta.aborted === "1"
  };
}

async function writeMeta(meta: ScanMeta): Promise<void> {
  const redis = getRedis();
  await redis.hset(keyMeta(meta.id), {
    id: meta.id,
    mode: meta.mode,
    targets: JSON.stringify(meta.targets),
    createdAt: meta.createdAt,
    updatedAt: meta.updatedAt,
    status: meta.status,
    total: String(meta.total),
    pending: String(meta.counts.pending),
    running: String(meta.counts.running),
    completed: String(meta.counts.completed),
    failed: String(meta.counts.failed),
    aborted: meta.aborted ? "1" : "0"
  });
}

async function readItem(scanId: string, itemId: string): Promise<ScanItem | undefined> {
  const redis = getRedis();
  const raw = await redis.hget(keyItems(scanId), itemId);
  if (!raw) {
    return undefined;
  }
  return JSON.parse(raw) as ScanItem;
}

async function writeItem(scanId: string, item: ScanItem): Promise<void> {
  const redis = getRedis();
  await redis.hset(keyItems(scanId), item.id, JSON.stringify(item));
}

async function readItems(scanId: string): Promise<ScanItem[]> {
  const redis = getRedis();
  const ids = await redis.lrange(keyOrder(scanId), 0, -1);
  if (!ids.length) {
    return [];
  }

  const itemPayloads = await redis.hmget(keyItems(scanId), ...ids);
  return itemPayloads
    .filter((payload): payload is string => Boolean(payload))
    .map((payload) => JSON.parse(payload) as ScanItem);
}

function deriveStatus(meta: ScanMeta): ScanJob["status"] {
  if (
    !meta.aborted &&
    meta.counts.pending > 0 &&
    meta.counts.running === 0 &&
    meta.counts.completed === 0 &&
    meta.counts.failed === 0
  ) {
    return "queued";
  }
  if (meta.aborted && meta.counts.running === 0) {
    return "aborted";
  }
  if (meta.counts.failed > 0 && meta.counts.completed > 0 && meta.counts.pending === 0 && meta.counts.running === 0) {
    return "partial";
  }
  if (meta.counts.pending === 0 && meta.counts.running === 0 && meta.counts.failed === 0) {
    return "completed";
  }
  if (meta.counts.pending === 0 && meta.counts.running === 0 && meta.counts.completed === 0) {
    return "failed";
  }
  if (meta.aborted) {
    return "aborted";
  }
  return "running";
}

function transition(meta: ScanMeta, from: ScanStatus, to: ScanStatus): void {
  if (from === to) {
    return;
  }

  const countKeys: Array<ScanStatus> = ["pending", "running", "completed", "failed"];
  if (countKeys.includes(from) && meta.counts[from] > 0) {
    meta.counts[from] -= 1;
  }
  if (countKeys.includes(to)) {
    meta.counts[to] += 1;
  }
}

async function enqueueScanItem(scanId: string, itemId: string): Promise<void> {
  const queue = getQueue();
  await queue.add("scan-url", { scanId, itemId });
}

async function processScanItem(scanId: string, itemId: string): Promise<void> {
  const meta = await readMeta(scanId);
  if (!meta) {
    return;
  }

  const item = await readItem(scanId, itemId);
  if (!item) {
    return;
  }

  const now = new Date().toISOString();

  if (meta.aborted) {
    if (item.status === "pending") {
      transition(meta, "pending", "failed");
      item.status = "failed";
      item.error = "Processamento abortado pelo usuário.";
      item.finishedAt = now;
      item.nextRetryAt = undefined;
      meta.updatedAt = now;
      meta.status = deriveStatus(meta);
      await Promise.all([writeItem(scanId, item), writeMeta(meta)]);
    }
    return;
  }

  if (item.status === "completed") {
    return;
  }

  const previousStatus = item.status;
  item.status = "running";
  item.startedAt = now;
  item.nextRetryAt = undefined;
  item.attempts += 1;
  transition(meta, previousStatus, "running");
  meta.updatedAt = now;
  meta.status = "running";
  await Promise.all([writeItem(scanId, item), writeMeta(meta)]);

  const result = await scanWebsite({
    url: item.url,
    normalizedUrl: item.normalizedUrl,
    mode: meta.mode,
    targets: meta.targets
  });

  item.result = result;
  item.error = result.error;
  item.finishedAt = result.finishedAt;

  if (result.status === "failed") {
    const retryable = shouldRetry(result.error) && item.attempts < item.maxAttempts;

    if (retryable) {
      transition(meta, "running", "pending");
      item.status = "pending";
      item.error = `Falha transitória. Reagendado (${item.attempts}/${item.maxAttempts}): ${result.error}`;
      item.nextRetryAt = new Date(Date.now() + RETRY_BASE_DELAY_MS * 2 ** (item.attempts - 1)).toISOString();
      meta.updatedAt = new Date().toISOString();
      meta.status = deriveStatus(meta);
      await Promise.all([writeItem(scanId, item), writeMeta(meta)]);
      throw new Error(result.error ?? "Falha transitória");
    }

    transition(meta, "running", "failed");
    item.status = "failed";
  } else {
    transition(meta, "running", "completed");
    item.status = "completed";
  }

  meta.updatedAt = new Date().toISOString();
  meta.status = deriveStatus(meta);
  await Promise.all([writeItem(scanId, item), writeMeta(meta)]);
}

function startWorkerInternal(force = false): void {
  if (globalStore.__techstackWorkerStarted) {
    return;
  }

  if (!force && process.env.NODE_ENV === "production" && process.env.START_WORKER_IN_WEB !== "true") {
    return;
  }

  globalStore.__techstackWorkerStarted = true;

  const worker = new Worker<ScanTaskPayload>(
    QUEUE_NAME,
    async (job) => {
      await processScanItem(job.data.scanId, job.data.itemId);
    },
    {
      connection: {
        url: getRedisUrl()
      },
      concurrency: Number(process.env.SCAN_WORKER_CONCURRENCY ?? 8)
    }
  );

  worker.on("error", (error) => {
    console.error("[scan-worker] worker error", error);
  });
}

export function ensureScanWorker(): void {
  startWorkerInternal(false);
}

export function startDedicatedScanWorker(): void {
  startWorkerInternal(true);
}

export async function createJob(input: CreateJobInput): Promise<ScanJob> {
  ensureScanWorker();

  const scanId = makeJobId();
  const now = new Date().toISOString();

  const items: ScanItem[] = input.urls.map((url) => ({
    id: toSlug(url) || Math.random().toString(36).slice(2, 8),
    url,
    normalizedUrl: normalizeUrl(url) ?? url,
    status: "pending",
    attempts: 0,
    maxAttempts: MAX_ATTEMPTS
  }));

  const meta: ScanMeta = {
    id: scanId,
    mode: input.mode,
    targets: input.targets,
    createdAt: now,
    updatedAt: now,
    status: "queued",
    total: items.length,
    counts: {
      pending: items.length,
      running: 0,
      completed: 0,
      failed: 0
    },
    aborted: false
  };

  const redis = getRedis();
  const multi = redis.multi();
  multi.hset(keyMeta(scanId), {
    id: meta.id,
    mode: meta.mode,
    targets: JSON.stringify(meta.targets),
    createdAt: meta.createdAt,
    updatedAt: meta.updatedAt,
    status: meta.status,
    total: String(meta.total),
    pending: String(meta.counts.pending),
    running: String(meta.counts.running),
    completed: String(meta.counts.completed),
    failed: String(meta.counts.failed),
    aborted: "0"
  });

  if (items.length > 0) {
    const itemPairs = items.flatMap((item) => [item.id, JSON.stringify(item)]);
    multi.hset(keyItems(scanId), ...itemPairs);
    multi.rpush(keyOrder(scanId), ...items.map((item) => item.id));
  }

  await multi.exec();

  for (const item of items) {
    await enqueueScanItem(scanId, item.id);
  }

  return {
    ...meta,
    items
  };
}

export async function getJob(jobId: string): Promise<ScanJob | undefined> {
  const meta = await readMeta(jobId);
  if (!meta) {
    return undefined;
  }

  const items = await readItems(jobId);
  const recalculatedCounts = recalculateCountsFromItems(items);
  const effectiveMeta: ScanMeta = {
    ...meta,
    total: Math.max(meta.total, items.length),
    counts: recalculatedCounts
  };
  effectiveMeta.status = deriveStatus(effectiveMeta);

  // Sincroniza contadores recalculados para reduzir drift após concorrência alta.
  if (
    meta.counts.pending !== recalculatedCounts.pending ||
    meta.counts.running !== recalculatedCounts.running ||
    meta.counts.completed !== recalculatedCounts.completed ||
    meta.counts.failed !== recalculatedCounts.failed ||
    meta.status !== effectiveMeta.status
  ) {
    effectiveMeta.updatedAt = new Date().toISOString();
    await writeMeta(effectiveMeta);
  }

  return {
    id: effectiveMeta.id,
    mode: effectiveMeta.mode,
    targets: effectiveMeta.targets,
    createdAt: effectiveMeta.createdAt,
    updatedAt: effectiveMeta.updatedAt,
    status: effectiveMeta.status,
    total: effectiveMeta.total,
    counts: effectiveMeta.counts,
    items
  };
}

export async function retryFailedItems(jobId: string): Promise<ScanJob | undefined> {
  const meta = await readMeta(jobId);
  if (!meta) {
    return undefined;
  }

  if (meta.counts.running > 0) {
    return getJob(jobId);
  }

  const items = await readItems(jobId);
  const failedItems = items.filter((item) => item.status === "failed");

  if (!failedItems.length) {
    return getJob(jobId);
  }

  meta.aborted = false;

  for (const item of failedItems) {
    transition(meta, "failed", "pending");
    item.status = "pending";
    item.attempts = 0;
    item.error = undefined;
    item.startedAt = undefined;
    item.finishedAt = undefined;
    item.nextRetryAt = undefined;
    item.result = undefined;
    await writeItem(jobId, item);
    await enqueueScanItem(jobId, item.id);
  }

  meta.updatedAt = new Date().toISOString();
  meta.status = deriveStatus(meta);
  await writeMeta(meta);

  return getJob(jobId);
}

export async function abortJob(jobId: string): Promise<ScanJob | undefined> {
  const meta = await readMeta(jobId);
  if (!meta) {
    return undefined;
  }

  meta.aborted = true;
  meta.status = "aborted";

  const items = await readItems(jobId);
  const now = new Date().toISOString();

  for (const item of items) {
    if (item.status === "pending") {
      transition(meta, "pending", "failed");
      item.status = "failed";
      item.error = "Processamento abortado pelo usuário.";
      item.finishedAt = now;
      item.nextRetryAt = undefined;
      await writeItem(jobId, item);
    }
  }

  meta.updatedAt = now;
  meta.status = deriveStatus(meta);
  await writeMeta(meta);

  const queue = getQueue();
  const candidates = await queue.getJobs(["waiting", "delayed", "prioritized"]);
  await Promise.all(
    candidates
      .filter((job) => job.data?.scanId === jobId)
      .map((job) => job.remove())
  );

  return getJob(jobId);
}
