import { analyzeHotelWebsite } from "@/lib/hotel-scan-engine";
import type { HotelWebsiteAnalysis } from "@/lib/hotel-types";
import { isSafeTargetUrl, normalizeUrl } from "@/lib/utils";

export interface HotelIntegrationRequestOptions {
  includeEvidence?: boolean;
}

export interface AnalyzeHotelIntegrationPayload {
  url: string;
  requestId?: string;
  options?: HotelIntegrationRequestOptions;
}

export interface HotelIntegrationSuccessResponse {
  requestId: string | null;
  status: "completed" | "failed";
  result: HotelWebsiteAnalysis;
  meta: {
    durationMs: number;
    includeEvidence: boolean;
  };
}

export interface HotelIntegrationErrorResponse {
  requestId: string | null;
  status: "failed";
  error: {
    code: "INVALID_JSON" | "INVALID_URL" | "UNAUTHORIZED" | "SERVER_ERROR";
    message: string;
  };
}

function cloneWithoutEvidence(result: HotelWebsiteAnalysis): HotelWebsiteAnalysis {
  return {
    ...result,
    technologies: result.technologies.map((technology) => ({
      ...technology,
      evidences: []
    })),
    booking: {
      ...result.booking,
      evidence: []
    }
  };
}

export function validateAndNormalizeHotelIntegrationUrl(url: string): string | null {
  const normalizedUrl = normalizeUrl(url);

  if (!normalizedUrl || !isSafeTargetUrl(normalizedUrl)) {
    return null;
  }

  return normalizedUrl;
}

export async function analyzeHotelForIntegration(
  payload: AnalyzeHotelIntegrationPayload
): Promise<HotelIntegrationSuccessResponse> {
  const includeEvidence = payload.options?.includeEvidence === true;
  const normalizedUrl = validateAndNormalizeHotelIntegrationUrl(payload.url);

  if (!normalizedUrl) {
    throw new Error("INVALID_URL");
  }

  const startedAt = Date.now();
  const result = await analyzeHotelWebsite({
    url: payload.url,
    normalizedUrl
  });

  return {
    requestId: payload.requestId ?? null,
    status: result.status,
    result: includeEvidence ? result : cloneWithoutEvidence(result),
    meta: {
      durationMs: Date.now() - startedAt,
      includeEvidence
    }
  };
}
