import { TECHNOLOGY_SIGNATURES } from "@/lib/signatures";
import { isSafeTargetUrl, roundConfidence } from "@/lib/utils";
import type { AnalysisMode, DetectionEvidence, DetectionResult, UrlScanResult } from "@/lib/types";

const FETCH_TIMEOUT_MS = 12000;

interface EngineInput {
  url: string;
  normalizedUrl: string;
  mode: AnalysisMode;
  targets: string[];
}

function normalizeMatcher(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]/g, "");
}

function parseScriptSources(html: string): string[] {
  const matches = html.matchAll(
    /<script[^>]+(?:src|data-defer-src|data-src)=["']([^"']+)["'][^>]*>/gi
  );
  return Array.from(
    new Set(Array.from(matches, (match) => match[1]))
  );
}

function findFromRegexPool(
  source: string,
  patterns: RegExp[] | undefined,
  type: DetectionEvidence["type"],
  location: string,
  weight: number
): DetectionEvidence[] {
  if (!patterns?.length) {
    return [];
  }

  const evidences: DetectionEvidence[] = [];
  for (const pattern of patterns) {
    const match = source.match(pattern);
    if (match?.[0]) {
      evidences.push({
        type,
        location,
        value: match[0].slice(0, 130),
        weight
      });
    }
  }
  return evidences;
}

function summarizeEvidences(evidences: DetectionEvidence[]): string {
  if (!evidences.length) {
    return "Sem evidências confiáveis.";
  }

  const primary = evidences[0];
  return `${primary.type} em ${primary.location}: ${primary.value}`;
}

function computeStatus(evidences: DetectionEvidence[]): DetectionResult["status"] {
  if (!evidences.length) {
    return "not_found";
  }

  const score = evidences.reduce((acc, evidence) => acc + evidence.weight, 0);
  if (score >= 1.2) {
    return "found";
  }
  return "inconclusive";
}

function computeConfidence(evidences: DetectionEvidence[]): number {
  const weightedScore = evidences.reduce((acc, evidence) => acc + evidence.weight, 0);
  if (!evidences.length) {
    return 0;
  }
  return roundConfidence(Math.min(1, weightedScore / 1.8));
}

function detectSpecificFallback(target: string, html: string, scripts: string[]): DetectionResult {
  const escaped = target.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const regex = new RegExp(escaped, "i");

  const evidences: DetectionEvidence[] = [];
  const htmlMatch = html.match(regex);
  if (htmlMatch?.[0]) {
    evidences.push({
      type: "custom",
      location: "html",
      value: htmlMatch[0],
      weight: 0.8
    });
  }

  for (const src of scripts) {
    const scriptMatch = src.match(regex);
    if (scriptMatch?.[0]) {
      evidences.push({
        type: "custom",
        location: "script-src",
        value: src,
        weight: 1
      });
    }
  }

  const status = computeStatus(evidences);
  return {
    technology: target,
    category: "custom",
    status,
    confidence: computeConfidence(evidences),
    summary: summarizeEvidences(evidences),
    evidences
  };
}

export async function scanWebsite(input: EngineInput): Promise<UrlScanResult> {
  const controller = new AbortController();
  const timeoutHandle = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

  try {
    if (!isSafeTargetUrl(input.normalizedUrl)) {
      return {
        url: input.url,
        normalizedUrl: input.normalizedUrl,
        status: "failed",
        error: "URL bloqueada por política de segurança (SSRF).",
        finishedAt: new Date().toISOString(),
        detections: []
      };
    }

    const response = await fetch(input.normalizedUrl, {
      signal: controller.signal,
      headers: {
        "user-agent": "TechStackScannerBot/1.0"
      },
      redirect: "follow"
    });

    const html = await response.text();
    const scripts = parseScriptSources(html);
    const cookies = response.headers.get("set-cookie") ?? "";

    const candidateSignatures =
      input.mode === "specific"
        ? TECHNOLOGY_SIGNATURES.filter((signature) => {
            const signatureKeys = [
              normalizeMatcher(signature.name),
              ...(signature.aliases ?? []).map(normalizeMatcher)
            ];

            return input.targets.some((target) => {
              const targetKey = normalizeMatcher(target);
              return signatureKeys.some(
                (key) => key.includes(targetKey) || targetKey.includes(key)
              );
            });
          })
        : TECHNOLOGY_SIGNATURES;

    const detections: DetectionResult[] = [];

    for (const signature of candidateSignatures) {
      const evidences: DetectionEvidence[] = [];

      evidences.push(
        ...findFromRegexPool(html, signature.htmlPatterns, "html", "document", 0.5)
      );
      evidences.push(
        ...findFromRegexPool(
          html,
          signature.strongHtmlPatterns,
          "html",
          "document",
          1.3
        )
      );

      for (const src of scripts) {
        evidences.push(
          ...findFromRegexPool(src, signature.scriptPatterns, "script", "script-src", 1)
        );
        evidences.push(
          ...findFromRegexPool(
            src,
            signature.strongScriptPatterns,
            "script",
            "script-src",
            1.35
          )
        );
      }

      if (signature.headerPatterns?.length) {
        for (const headerPattern of signature.headerPatterns) {
          const headerValue = response.headers.get(headerPattern.header) ?? "";
          if (headerValue && headerPattern.pattern.test(headerValue)) {
            evidences.push({
              type: "header",
              location: headerPattern.header,
              value: headerValue.slice(0, 130),
              weight: 1
            });
          }
        }
      }

      evidences.push(
        ...findFromRegexPool(cookies, signature.cookiePatterns, "cookie", "set-cookie", 0.8)
      );

      const status = computeStatus(evidences);
      if (input.mode === "all" && status === "not_found") {
        continue;
      }

      detections.push({
        technology: signature.name,
        category: signature.category,
        status,
        confidence: computeConfidence(evidences),
        summary: summarizeEvidences(evidences),
        evidences
      });
    }

    if (input.mode === "specific") {
      for (const target of input.targets) {
        const targetKey = normalizeMatcher(target);
        const alreadyIncluded = detections.some(
          (detection) =>
            normalizeMatcher(detection.technology).includes(targetKey) ||
            targetKey.includes(normalizeMatcher(detection.technology))
        );

        if (!alreadyIncluded) {
          detections.push(detectSpecificFallback(target, html, scripts));
        }
      }
    }

    const finishedAt = new Date().toISOString();

    return {
      url: input.url,
      normalizedUrl: input.normalizedUrl,
      status: "completed",
      finishedAt,
      detections
    };
  } catch (error) {
    return {
      url: input.url,
      normalizedUrl: input.normalizedUrl,
      status: "failed",
      error: error instanceof Error ? error.message : "Falha desconhecida",
      finishedAt: new Date().toISOString(),
      detections: []
    };
  } finally {
    clearTimeout(timeoutHandle);
  }
}
