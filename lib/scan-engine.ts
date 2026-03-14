import { TECHNOLOGY_SIGNATURES } from "@/lib/signatures";
import { isSafeTargetUrl, roundConfidence } from "@/lib/utils";
import type { AnalysisMode, DetectionEvidence, DetectionResult, ScanStrategy, UrlScanResult } from "@/lib/types";

const FETCH_TIMEOUT_MS = 12000;
const BROWSER_GOTO_TIMEOUT_MS = Number(process.env.SCAN_BROWSER_GOTO_TIMEOUT_MS ?? 20000);
const BROWSER_NETWORK_IDLE_WAIT_MS = Number(process.env.SCAN_BROWSER_NETWORK_IDLE_WAIT_MS ?? 5000);

interface EngineInput {
  url: string;
  normalizedUrl: string;
  mode: AnalysisMode;
  scanStrategy: ScanStrategy;
  targets: string[];
}

interface CollectedPageData {
  html: string;
  scripts: string[];
  cookies: string;
  runtimeSignals: string[];
  getHeader: (name: string) => string;
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

function evidenceStrength(weight: number): "alta" | "media" | "baixa" {
  if (weight >= 1.25) {
    return "alta";
  }
  if (weight >= 0.9) {
    return "media";
  }
  return "baixa";
}

function evidenceTypePriority(type: DetectionEvidence["type"]): number {
  if (type === "script") {
    return 5;
  }
  if (type === "header") {
    return 4;
  }
  if (type === "cookie") {
    return 3;
  }
  if (type === "html") {
    return 2;
  }
  return 1;
}

function pickPrimaryEvidence(evidences: DetectionEvidence[]): DetectionEvidence | undefined {
  if (!evidences.length) {
    return undefined;
  }

  const ranked = [...evidences].sort((a, b) => {
    if (b.weight !== a.weight) {
      return b.weight - a.weight;
    }
    return evidenceTypePriority(b.type) - evidenceTypePriority(a.type);
  });

  return ranked[0];
}

function summarizeEvidences(evidences: DetectionEvidence[]): string {
  if (!evidences.length) {
    return "Sem evidências confiáveis.";
  }

  const primary = pickPrimaryEvidence(evidences) ?? evidences[0];
  return `evidência ${evidenceStrength(primary.weight)} (${primary.type} em ${primary.location}): ${primary.value}`;
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

function buildDetectionSource(html: string, runtimeSignals: string[]): string {
  if (!runtimeSignals.length) {
    return html;
  }
  return `${html}\n${runtimeSignals.join("\n")}`;
}

async function collectWithFetch(normalizedUrl: string): Promise<CollectedPageData> {
  const controller = new AbortController();
  const timeoutHandle = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

  try {
    const response = await fetch(normalizedUrl, {
      signal: controller.signal,
      headers: {
        "user-agent": "TechStackScannerBot/1.0"
      },
      redirect: "follow"
    });

    if (!response.ok && (response.status === 429 || response.status >= 500)) {
      throw new Error(`HTTP ${response.status} ao buscar a URL.`);
    }

    const html = await response.text();
    return {
      html,
      scripts: parseScriptSources(html),
      cookies: response.headers.get("set-cookie") ?? "",
      runtimeSignals: [],
      getHeader: (name: string) => response.headers.get(name) ?? ""
    };
  } finally {
    clearTimeout(timeoutHandle);
  }
}

async function collectWithPlaywright(normalizedUrl: string): Promise<CollectedPageData> {
  let playwrightModule: typeof import("playwright");

  try {
    playwrightModule = await import("playwright");
  } catch {
    throw new Error("Modo browser requer a dependência 'playwright'. Execute: npm install playwright");
  }

  let browser: import("playwright").Browser | undefined;
  let context: import("playwright").BrowserContext | undefined;
  let page: import("playwright").Page | undefined;

  try {
    browser = await playwrightModule.chromium.launch({
      headless: true,
      args: ["--no-sandbox", "--disable-setuid-sandbox"]
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    if (message.toLowerCase().includes("executable")) {
      throw new Error("Chromium do Playwright não encontrado. Execute: npx playwright install chromium");
    }
    throw error;
  }

  try {
    context = await browser.newContext({
      userAgent: "TechStackScannerBot/1.0 (browser)",
      ignoreHTTPSErrors: true
    });
    page = await context.newPage();

    const requestUrls = new Set<string>();
    page.on("request", (request) => {
      requestUrls.add(request.url());
    });

    const mainResponse = await page.goto(normalizedUrl, {
      waitUntil: "domcontentloaded",
      timeout: BROWSER_GOTO_TIMEOUT_MS
    });

    try {
      await page.waitForLoadState("networkidle", {
        timeout: BROWSER_NETWORK_IDLE_WAIT_MS
      });
    } catch {
      // Muitos sites mantêm conexões abertas; seguimos com o estado atual da página.
    }

    const html = await page.content();
    const domScriptSources = await page.$$eval("script[src]", (elements) =>
      Array.from(
        new Set(
          elements
            .map((element) => element.getAttribute("src") ?? "")
            .map((value) => value.trim())
            .filter(Boolean)
        )
      )
    );

    const runtimeFlags = await page.evaluate(() => {
      const win = window as typeof window & {
        RDStationForms?: unknown;
        RdIntegration?: unknown;
      };

      return {
        hasRdStationForms: typeof win.RDStationForms !== "undefined",
        hasRdIntegration: typeof win.RdIntegration !== "undefined"
      };
    });

    const cookies = (await context.cookies())
      .map((cookie) => `${cookie.name}=${cookie.value}`)
      .join("; ");

    const headerMap = mainResponse?.headers() ?? {};
    const runtimeSignals = Array.from(requestUrls);
    if (runtimeFlags.hasRdStationForms) {
      runtimeSignals.push("RDStationForms");
    }
    if (runtimeFlags.hasRdIntegration) {
      runtimeSignals.push("RdIntegration");
    }

    return {
      html,
      scripts: Array.from(new Set([...parseScriptSources(html), ...domScriptSources])),
      cookies,
      runtimeSignals,
      getHeader: (name: string) => headerMap[name.toLowerCase()] ?? ""
    };
  } finally {
    await page?.close().catch(() => undefined);
    await context?.close().catch(() => undefined);
    await browser?.close().catch(() => undefined);
  }
}

export async function scanWebsite(input: EngineInput): Promise<UrlScanResult> {
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

    const collected =
      input.scanStrategy === "browser"
        ? await collectWithPlaywright(input.normalizedUrl)
        : await collectWithFetch(input.normalizedUrl);

    const detectionSource = buildDetectionSource(collected.html, collected.runtimeSignals);

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
        ...findFromRegexPool(detectionSource, signature.htmlPatterns, "html", "document", 0.5)
      );
      evidences.push(
        ...findFromRegexPool(
          detectionSource,
          signature.strongHtmlPatterns,
          "html",
          "document",
          1.3
        )
      );

      for (const src of collected.scripts) {
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
          const headerValue = collected.getHeader(headerPattern.header);
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
        ...findFromRegexPool(collected.cookies, signature.cookiePatterns, "cookie", "set-cookie", 0.8)
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
          detections.push(detectSpecificFallback(target, detectionSource, collected.scripts));
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
  }
}
