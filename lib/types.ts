export type AnalysisMode = "all" | "specific";

export type DetectionStatus = "found" | "not_found" | "inconclusive";

export type ScanStatus = "pending" | "running" | "completed" | "failed";

export type JobStatus =
  | "queued"
  | "running"
  | "completed"
  | "partial"
  | "failed"
  | "aborted";

export interface DetectionEvidence {
  type: "html" | "script" | "header" | "cookie" | "custom";
  location: string;
  value: string;
  weight: number;
}

export interface DetectionResult {
  technology: string;
  category: string;
  status: DetectionStatus;
  confidence: number;
  summary: string;
  evidences: DetectionEvidence[];
}

export interface UrlScanResult {
  url: string;
  normalizedUrl: string;
  status: ScanStatus;
  finishedAt?: string;
  error?: string;
  detections: DetectionResult[];
}

export interface ScanItem {
  id: string;
  url: string;
  normalizedUrl: string;
  status: ScanStatus;
  attempts: number;
  maxAttempts: number;
  nextRetryAt?: string;
  startedAt?: string;
  finishedAt?: string;
  error?: string;
  result?: UrlScanResult;
}

export interface ScanJob {
  id: string;
  mode: AnalysisMode;
  targets: string[];
  createdAt: string;
  updatedAt: string;
  status: JobStatus;
  total: number;
  counts: {
    pending: number;
    running: number;
    completed: number;
    failed: number;
  };
  items: ScanItem[];
}

export interface CreateScanPayload {
  urls: string[];
  mode: AnalysisMode;
  targets?: string[];
}
