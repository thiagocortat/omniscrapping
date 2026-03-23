export type HotelScanItemStatus = "pending" | "running" | "completed" | "failed";

export type HotelJobStatus =
  | "queued"
  | "running"
  | "completed"
  | "partial"
  | "failed"
  | "aborted";

export interface HotelTechnologyEvidence {
  type: "html" | "script" | "request" | "cookie" | "link" | "runtime";
  value: string;
  source: string;
  weight: number;
}

export interface HotelTechnologyFinding {
  name: string;
  category: string;
  confidence: number;
  summary: string;
  evidences: HotelTechnologyEvidence[];
}

export interface HotelPageSnapshot {
  url: string;
  title: string;
  html: string;
  text: string;
  scripts: string[];
  links: Array<{ href: string; text: string }>;
  headings: string[];
  meta: Record<string, string>;
}

export interface HotelPerformanceMetrics {
  score: number;
  timeToFirstByteMs: number | null;
  firstContentfulPaintMs: number | null;
  domContentLoadedMs: number | null;
  loadMs: number | null;
  requestCount: number;
  transferSizeKb: number | null;
  notes: string[];
}

export interface HotelSeoMetrics {
  score: number;
  title: string;
  titleLength: number;
  metaDescriptionLength: number;
  hasCanonical: boolean;
  hasRobots: boolean;
  hasViewport: boolean;
  h1Count: number;
  imageCount: number;
  imagesWithAlt: number;
  structuredDataTypes: string[];
  openGraphTags: string[];
  issues: string[];
}

export interface BookingFieldCoverage {
  hotelSelector: boolean;
  checkIn: boolean;
  checkOut: boolean;
  guests: boolean;
  children: boolean;
}

export interface HotelBookingAnalysis {
  status: "detected" | "configured" | "not_found" | "failed";
  reserveLabels: string[];
  reserveEntryPoints: string[];
  actions: string[];
  warnings: string[];
  fields: BookingFieldCoverage;
  bookingEngine: string | null;
  finalUrl: string | null;
  evidence: string[];
}

export interface HotelAnalysisSummary {
  overallScore: number;
  adsTags: string[];
  crmTools: string[];
  analyticsTools: string[];
  tagManagers: string[];
  bookingEngines: string[];
}

export interface HotelWebsiteAnalysis {
  url: string;
  normalizedUrl: string;
  status: "completed" | "failed";
  finishedAt: string;
  error?: string;
  pagesVisited: string[];
  performance: HotelPerformanceMetrics;
  seo: HotelSeoMetrics;
  technologies: HotelTechnologyFinding[];
  booking: HotelBookingAnalysis;
  summary: HotelAnalysisSummary;
}

export interface HotelScanItem {
  id: string;
  url: string;
  normalizedUrl: string;
  status: HotelScanItemStatus;
  attempts: number;
  maxAttempts: number;
  nextRetryAt?: string;
  startedAt?: string;
  finishedAt?: string;
  error?: string;
  result?: HotelWebsiteAnalysis;
}

export interface HotelScanJob {
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
  items: HotelScanItem[];
}

export interface CreateHotelScanPayload {
  urls: string[];
}
