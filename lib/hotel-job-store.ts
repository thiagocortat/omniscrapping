import IORedis from "ioredis";
import { Queue, Worker } from "bullmq";
import { analyzeHotelWebsite } from "@/lib/hotel-scan-engine";
import type {
  HotelJobStatus,
  HotelScanItem,
  HotelScanItemStatus,
  HotelScanJob
} from "@/lib/hotel-types";
import { normalizeUrl, toSlug } from "@/lib/utils";

const QUEUE_NAME = "hotel-website-scans";
const MAX_ATTEMPTS = 2;
const RETRY_BASE_DELAY_MS = 2500;
const RUNNING_ITEM_STALE_MS = Number(
  process.env.HOTEL_RUNNING_ITEM_STALE_MS ?? 12 * 60 * 1000
);

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

interface HotelScanMeta {
  id: string;
  createdAt: string;
  updatedAt: string;
  status: HotelJobStatus;
  total: number;
  counts: {
    pending: number;
    running: number;
    completed: number;
    failed: number;
  };
  aborted: boolean;
}

interface HotelScanTaskPayload {
  scanId: string;
  itemId: string;
}

const globalStore = globalThis as typeof globalThis & {
  __hotelScanRedis?: IORedis;
  __hotelScanQueue?: Queue;
  __hotelScanWorkerStarted?: boolean;
  __hotelScanWorkers?: Array<Worker<HotelScanTaskPayload>>;
};

function getRedisUrl(): string {
  const url = process.env.REDIS_URL;
  if (!url) {
    throw new Error("REDIS_URL não configurada.");
  }
  return url;
}

function getRedis(): IORedis {
  if (!globalStore.__hotelScanRedis) {
    globalStore.__hotelScanRedis = new IORedis(getRedisUrl(), {
      maxRetriesPerRequest: null,
      enableReadyCheck: true
    });
  }
  return globalStore.__hotelScanRedis;
}

function getQueue(): Queue {
  if (!globalStore.__hotelScanQueue) {
    globalStore.__hotelScanQueue = new Queue(QUEUE_NAME, {
      connection: {
        url: getRedisUrl()
      },
      defaultJobOptions: {
        attempts: MAX_ATTEMPTS,
        backoff: {
          type: "exponential",
          delay: RETRY_BASE_DELAY_MS
        },
        removeOnComplete: 1000,
        removeOnFail: 2000
      }
    });
  }

  return globalStore.__hotelScanQueue;
}

function keyMeta(scanId: string): string {
  return `hotel-scan:${scanId}:meta`;
}

function keyItems(scanId: string): string {
  return `hotel-scan:${scanId}:items`;
}

function keyOrder(scanId: string): string {
  return `hotel-scan:${scanId}:order`;
}

function makeJobId(): string {
  return `hotel_job_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

function parseIntSafe(value: string | null | undefined): number {
  if (!value) {
    return 0;
  }
  const parsed = Number.parseInt(value, 10);
  return Number.isNaN(parsed) ? 0 : parsed;
}

function shouldRetry(error?: string): boolean {
  if (!error) {
    return false;
  }
  return RETRYABLE_ERROR_PATTERNS.some((pattern) => pattern.test(error));
}

function recalculateCountsFromItems(items: HotelScanItem[]): HotelScanMeta["counts"] {
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

function deriveStatus(meta: HotelScanMeta): HotelJobStatus {
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
  if (
    meta.counts.failed > 0 &&
    meta.counts.completed > 0 &&
    meta.counts.pending === 0 &&
    meta.counts.running === 0
  ) {
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

function transition(
  meta: HotelScanMeta,
  from: HotelScanItemStatus,
  to: HotelScanItemStatus
): void {
  if (from === to) {
    return;
  }

  const keys: HotelScanItemStatus[] = ["pending", "running", "completed", "failed"];
  if (keys.includes(from) && meta.counts[from] > 0) {
    meta.counts[from] -= 1;
  }
  if (keys.includes(to)) {
    meta.counts[to] += 1;
  }
}

function isRunningItemStale(item: HotelScanItem, nowMs: number): boolean {
  if (item.status !== "running" || !item.startedAt) {
    return false;
  }
  const startedAtMs = Date.parse(item.startedAt);
  if (Number.isNaN(startedAtMs)) {
    return false;
  }
  return nowMs - startedAtMs > RUNNING_ITEM_STALE_MS;
}

async function readMeta(scanId: string): Promise<HotelScanMeta | undefined> {
  const meta = await getRedis().hgetall(keyMeta(scanId));
  if (!meta?.id) {
    return undefined;
  }

  return {
    id: meta.id,
    createdAt: meta.createdAt,
    updatedAt: meta.updatedAt,
    status: (meta.status as HotelJobStatus) ?? "queued",
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

async function writeMeta(meta: HotelScanMeta): Promise<void> {
  await getRedis().hset(keyMeta(meta.id), {
    id: meta.id,
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

async function readItem(scanId: string, itemId: string): Promise<HotelScanItem | undefined> {
  const raw = await getRedis().hget(keyItems(scanId), itemId);
  if (!raw) {
    return undefined;
  }
  return JSON.parse(raw) as HotelScanItem;
}

async function writeItem(scanId: string, item: HotelScanItem): Promise<void> {
  await getRedis().hset(keyItems(scanId), item.id, JSON.stringify(item));
}

async function readItems(scanId: string): Promise<HotelScanItem[]> {
  const ids = await getRedis().lrange(keyOrder(scanId), 0, -1);
  if (!ids.length) {
    return [];
  }
  const payloads = await getRedis().hmget(keyItems(scanId), ...ids);
  return payloads
    .filter((payload): payload is string => Boolean(payload))
    .map((payload) => JSON.parse(payload) as HotelScanItem);
}

async function recoverStaleRunningItems(
  scanId: string,
  meta: HotelScanMeta,
  items: HotelScanItem[]
): Promise<{ meta: HotelScanMeta; items: HotelScanItem[] }> {
  const nowMs = Date.now();
  const now = new Date(nowMs).toISOString();
  let changed = false;

  for (const item of items) {
    if (!isRunningItemStale(item, nowMs)) {
      continue;
    }

    item.status = "failed";
    item.finishedAt = now;
    item.nextRetryAt = undefined;
    item.error =
      "Execução interrompida por timeout interno. Reprocesse este item para tentar novamente.";
    await writeItem(scanId, item);
    changed = true;
  }

  if (!changed) {
    return { meta, items };
  }

  const updatedMeta: HotelScanMeta = {
    ...meta,
    counts: recalculateCountsFromItems(items),
    total: Math.max(meta.total, items.length),
    updatedAt: now
  };
  updatedMeta.status = deriveStatus(updatedMeta);
  await writeMeta(updatedMeta);
  return { meta: updatedMeta, items };
}

async function enqueueItem(scanId: string, itemId: string): Promise<void> {
  await getQueue().add("hotel-scan-url", { scanId, itemId });
}

async function processItem(scanId: string, itemId: string): Promise<void> {
  const meta = await readMeta(scanId);
  const item = await readItem(scanId, itemId);
  if (!meta || !item) {
    return;
  }

  const now = new Date().toISOString();

  if (meta.aborted) {
    if (item.status === "pending") {
      transition(meta, "pending", "failed");
      item.status = "failed";
      item.error = "Processamento abortado pelo usuário.";
      item.finishedAt = now;
      await Promise.all([writeItem(scanId, item), writeMeta({ ...meta, updatedAt: now, status: deriveStatus(meta) })]);
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

  const result = await analyzeHotelWebsite({
    url: item.url,
    normalizedUrl: item.normalizedUrl
  });

  item.result = result;
  item.error = result.error;
  item.finishedAt = result.finishedAt;

  if (result.status === "failed") {
    console.error("[hotel-scan-worker] scan failed", {
      url: item.normalizedUrl,
      attempts: item.attempts,
      error: result.error
    });

    const retryable = shouldRetry(result.error) && item.attempts < item.maxAttempts;
    if (retryable) {
      transition(meta, "running", "pending");
      item.status = "pending";
      item.error = `Falha transitória. Reagendado (${item.attempts}/${item.maxAttempts}): ${result.error}`;
      item.nextRetryAt = new Date(
        Date.now() + RETRY_BASE_DELAY_MS * 2 ** (item.attempts - 1)
      ).toISOString();
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
  if (globalStore.__hotelScanWorkerStarted) {
    return;
  }

  if (
    !force &&
    process.env.NODE_ENV === "production" &&
    process.env.START_WORKER_IN_WEB !== "true"
  ) {
    return;
  }

  globalStore.__hotelScanWorkerStarted = true;

  const worker = new Worker<HotelScanTaskPayload>(
    QUEUE_NAME,
    async (job) => {
      await processItem(job.data.scanId, job.data.itemId);
    },
    {
      connection: {
        url: getRedisUrl()
      },
      concurrency: Math.max(1, Number(process.env.HOTEL_SCAN_WORKER_CONCURRENCY ?? 2))
    }
  );

  worker.on("error", (error) => {
    console.error("[hotel-scan-worker] worker error", error);
  });

  globalStore.__hotelScanWorkers = [worker];
}

export function ensureHotelScanWorker(): void {
  startWorkerInternal(false);
}

export function startDedicatedHotelScanWorker(): void {
  startWorkerInternal(true);
}

export async function createHotelScanJob(urls: string[]): Promise<HotelScanJob> {
  ensureHotelScanWorker();

  const id = makeJobId();
  const now = new Date().toISOString();
  const items: HotelScanItem[] = urls.map((url) => ({
    id: toSlug(url) || Math.random().toString(36).slice(2, 8),
    url,
    normalizedUrl: normalizeUrl(url) ?? url,
    status: "pending",
    attempts: 0,
    maxAttempts: MAX_ATTEMPTS
  }));

  const meta: HotelScanMeta = {
    id,
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
  multi.hset(keyMeta(id), {
    id,
    createdAt: now,
    updatedAt: now,
    status: meta.status,
    total: String(meta.total),
    pending: String(meta.counts.pending),
    running: String(meta.counts.running),
    completed: String(meta.counts.completed),
    failed: String(meta.counts.failed),
    aborted: "0"
  });

  if (items.length > 0) {
    multi.hset(keyItems(id), ...items.flatMap((item) => [item.id, JSON.stringify(item)]));
    multi.rpush(keyOrder(id), ...items.map((item) => item.id));
  }

  await multi.exec();

  for (const item of items) {
    await enqueueItem(id, item.id);
  }

  return {
    ...meta,
    items
  };
}

export async function getHotelScanJob(jobId: string): Promise<HotelScanJob | undefined> {
  const meta = await readMeta(jobId);
  if (!meta) {
    return undefined;
  }

  const items = await readItems(jobId);
  const recovered = await recoverStaleRunningItems(jobId, meta, items);
  const counts = recalculateCountsFromItems(recovered.items);
  const effectiveMeta: HotelScanMeta = {
    ...recovered.meta,
    counts,
    total: Math.max(recovered.meta.total, recovered.items.length)
  };
  effectiveMeta.status = deriveStatus(effectiveMeta);

  if (
    effectiveMeta.counts.pending !== recovered.meta.counts.pending ||
    effectiveMeta.counts.running !== recovered.meta.counts.running ||
    effectiveMeta.counts.completed !== recovered.meta.counts.completed ||
    effectiveMeta.counts.failed !== recovered.meta.counts.failed ||
    effectiveMeta.status !== recovered.meta.status
  ) {
    effectiveMeta.updatedAt = new Date().toISOString();
    await writeMeta(effectiveMeta);
  }

  return {
    id: effectiveMeta.id,
    createdAt: effectiveMeta.createdAt,
    updatedAt: effectiveMeta.updatedAt,
    status: effectiveMeta.status,
    total: effectiveMeta.total,
    counts: effectiveMeta.counts,
    items: recovered.items
  };
}

export async function retryFailedHotelScanItems(
  jobId: string
): Promise<HotelScanJob | undefined> {
  const meta = await readMeta(jobId);
  if (!meta) {
    return undefined;
  }

  if (meta.counts.running > 0) {
    return getHotelScanJob(jobId);
  }

  const items = await readItems(jobId);
  const failedItems = items.filter((item) => item.status === "failed");

  if (!failedItems.length) {
    return getHotelScanJob(jobId);
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
    await enqueueItem(jobId, item.id);
  }

  meta.updatedAt = new Date().toISOString();
  meta.status = deriveStatus(meta);
  await writeMeta(meta);

  return getHotelScanJob(jobId);
}

export async function abortHotelScanJob(jobId: string): Promise<HotelScanJob | undefined> {
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

  const candidates = await getQueue().getJobs(["waiting", "delayed", "prioritized"]);
  await Promise.all(
    candidates
      .filter((job) => job.data?.scanId === jobId)
      .map((job) => job.remove())
  );

  return getHotelScanJob(jobId);
}
