import {
  BOOKING_SUBMIT_KEYWORDS,
  HOTEL_SIGNATURES,
  RESERVE_KEYWORDS,
  RESERVE_NEGATIVE_KEYWORDS
} from "@/lib/hotel-catalog";
import type {
  BookingFieldCoverage,
  HotelBookingAnalysis,
  HotelPageSnapshot,
  HotelPerformanceMetrics,
  HotelSeoMetrics,
  HotelTechnologyEvidence,
  HotelTechnologyFinding,
  HotelWebsiteAnalysis
} from "@/lib/hotel-types";
import { isSafeTargetUrl } from "@/lib/utils";

const BROWSER_GOTO_TIMEOUT_MS = Number(process.env.HOTEL_BROWSER_GOTO_TIMEOUT_MS ?? 22000);
const BROWSER_NETWORK_IDLE_WAIT_MS = Number(process.env.HOTEL_BROWSER_NETWORK_IDLE_WAIT_MS ?? 5000);
const ACTION_TIMEOUT_MS = Number(process.env.HOTEL_BROWSER_ACTION_TIMEOUT_MS ?? 7000);

interface EngineInput {
  url: string;
  normalizedUrl: string;
}

interface RequestStats {
  requestUrls: Set<string>;
  requestCount: number;
  transferredBytes: number;
}

interface DomSummary {
  title: string;
  html: string;
  text: string;
  scripts: string[];
  iframes: string[];
  links: Array<{ href: string; text: string }>;
  headings: string[];
  meta: Record<string, string>;
  h1Count: number;
  imageCount: number;
  imagesWithAlt: number;
  structuredDataTypes: string[];
  openGraphTags: string[];
  canonicalUrl: string;
  viewportContent: string;
}

interface PerformanceSnapshot {
  timeToFirstByteMs: number | null;
  firstContentfulPaintMs: number | null;
  domContentLoadedMs: number | null;
  loadMs: number | null;
}

interface FetchFallbackPayload {
  finalUrl: string;
  html: string;
  cookies: string;
  elapsedMs: number;
}

interface CandidateDescriptor {
  index: number;
  label: string;
  href: string;
  score: number;
}

interface BookingFieldDescriptor {
  index: number;
  tagName: string;
  intent: "hotelSelector" | "checkIn" | "checkOut" | "guests" | "children";
}

type EvidenceSource = {
  type: HotelTechnologyEvidence["type"];
  source: string;
  value: string;
};

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function normalizeText(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

function scoreFromThresholds(
  value: number | null,
  thresholds: Array<{ max: number; points: number }>,
  fallback = 0
): number {
  if (value === null) {
    return fallback;
  }
  const match = thresholds.find((item) => value <= item.max);
  return match?.points ?? 0;
}

function buildEvidence(
  type: HotelTechnologyEvidence["type"],
  source: string,
  value: string,
  weight: number
): HotelTechnologyEvidence {
  return {
    type,
    source,
    value: value.slice(0, 160),
    weight
  };
}

function summarizeEvidence(evidences: HotelTechnologyEvidence[]): string {
  const primary = [...evidences].sort((a, b) => b.weight - a.weight)[0];
  if (!primary) {
    return "Sem evidência suficiente.";
  }
  return `${primary.type} em ${primary.source}: ${primary.value}`;
}

function computeConfidence(evidences: HotelTechnologyEvidence[]): number {
  const total = evidences.reduce((acc, evidence) => acc + evidence.weight, 0);
  return clamp(Math.round((total / 3.5) * 100), 1, 100);
}

function detectTechnologies(sources: EvidenceSource[]): HotelTechnologyFinding[] {
  const findings: HotelTechnologyFinding[] = [];

  for (const signature of HOTEL_SIGNATURES) {
    const evidences: HotelTechnologyEvidence[] = [];
    const aliasEvidences: HotelTechnologyEvidence[] = [];

    for (const source of sources) {
      for (const pattern of signature.patterns) {
        const match = source.value.match(pattern);
        if (!match?.[0]) {
          continue;
        }

        const baseWeight =
          source.type === "request"
            ? 1.25
            : source.type === "script"
            ? 1.1
            : source.type === "runtime"
            ? 1.05
            : source.type === "cookie"
            ? 0.8
            : 0.95;

        evidences.push(buildEvidence(source.type, source.source, match[0], baseWeight));
      }

      for (const pattern of signature.aliasPatterns ?? []) {
        const match = source.value.match(pattern);
        if (!match?.[0]) {
          continue;
        }

        const baseWeight =
          source.type === "request"
            ? 0.82
            : source.type === "script"
            ? 0.72
            : source.type === "runtime"
            ? 0.65
            : source.type === "cookie"
            ? 0.55
            : 0.6;

        aliasEvidences.push(buildEvidence(source.type, `${source.source}:alias`, match[0], baseWeight));
      }
    }

    const mergedEvidences = [...evidences, ...aliasEvidences];
    if (!mergedEvidences.length) {
      continue;
    }

    const strongEvidenceCount = evidences.length;
    const aliasEvidenceCount = aliasEvidences.length;
    const confidenceBase = computeConfidence(mergedEvidences);
    const confidenceBoost =
      strongEvidenceCount > 0 && aliasEvidenceCount > 0
        ? 12
        : strongEvidenceCount === 0 && aliasEvidenceCount >= 2
        ? 6
        : 0;
    const confidencePenalty = strongEvidenceCount === 0 ? 14 : 0;

    findings.push({
      name: signature.name,
      category: signature.category,
      confidence: clamp(confidenceBase + confidenceBoost - confidencePenalty, 1, 100),
      summary:
        strongEvidenceCount > 0
          ? summarizeEvidence(mergedEvidences)
          : `evidência indireta (${aliasEvidenceCount} sinais): ${summarizeEvidence(mergedEvidences)}`,
      evidences: mergedEvidences.slice(0, 5)
    });
  }

  return findings.sort((a, b) => b.confidence - a.confidence || a.name.localeCompare(b.name));
}

function attachRequestTracking(page: import("playwright").Page, stats: RequestStats): void {
  page.on("request", (request) => {
    stats.requestUrls.add(request.url());
    stats.requestCount += 1;
  });

  page.on("response", async (response) => {
    const parsed = Number(response.headers()["content-length"]);
    if (!Number.isNaN(parsed) && parsed > 0) {
      stats.transferredBytes += parsed;
    }
  });
}

async function waitForSettledLoad(page: import("playwright").Page): Promise<void> {
  await page.waitForLoadState("domcontentloaded", { timeout: ACTION_TIMEOUT_MS }).catch(() => undefined);
  await page.waitForLoadState("networkidle", { timeout: BROWSER_NETWORK_IDLE_WAIT_MS }).catch(() => undefined);
}

async function collectDomSummary(page: import("playwright").Page): Promise<DomSummary> {
  return page.evaluate(() => {
    const metaEntries: Array<[string, string]> = [];
    for (const element of Array.from(document.querySelectorAll("meta"))) {
      const key =
        element.getAttribute("name") ??
        element.getAttribute("property") ??
        element.getAttribute("http-equiv") ??
        "";
      const content = (element.getAttribute("content") ?? "").replace(/\s+/g, " ").trim();
      if (key) {
        metaEntries.push([key.toLowerCase(), content]);
      }
    }

    const scripts = Array.from(
      new Set(
        Array.from(document.querySelectorAll<HTMLScriptElement>("script[src]"))
          .map((element) => (element.getAttribute("src") ?? "").replace(/\s+/g, " ").trim())
          .filter(Boolean)
      )
    );

    const iframes = Array.from(
      new Set(
        Array.from(document.querySelectorAll<HTMLIFrameElement>("iframe[src]"))
          .map((element) => (element.getAttribute("src") ?? "").replace(/\s+/g, " ").trim())
          .filter(Boolean)
      )
    );

    const links = Array.from(document.querySelectorAll<HTMLAnchorElement>("a[href]"))
      .map((element) => ({
        href: (element.href ?? "").replace(/\s+/g, " ").trim(),
        text:
          (element.textContent ?? element.getAttribute("aria-label") ?? element.getAttribute("title") ?? "")
            .replace(/\s+/g, " ")
            .trim()
      }))
      .filter((link) => Boolean(link.href));

    const headings = Array.from(document.querySelectorAll("h1, h2, h3"))
      .map((element) => (element.textContent ?? "").replace(/\s+/g, " ").trim())
      .filter(Boolean);

    const structuredDataTypes = Array.from(
      new Set(
        Array.from(document.querySelectorAll<HTMLScriptElement>('script[type="application/ld+json"]'))
          .flatMap((element) =>
            Array.from(
              ((element.innerHTML ?? "").replace(/\s+/g, " ")).matchAll(/"@type"\s*:\s*"([^"]+)"/g),
              (match) => match[1]
            )
          )
          .filter(Boolean)
      )
    );

    const openGraphTags = Array.from(
      new Set(
        Array.from(document.querySelectorAll('meta[property^="og:"]'))
          .map((element) => (element.getAttribute("property") ?? "").replace(/\s+/g, " ").trim())
          .filter(Boolean)
      )
    );

    return {
      title: document.title ?? "",
      html: document.documentElement.outerHTML,
      text: (document.body?.innerText ?? "").replace(/\s+/g, " ").trim(),
      scripts,
      iframes,
      links,
      headings,
      meta: Object.fromEntries(metaEntries),
      h1Count: document.querySelectorAll("h1").length,
      imageCount: document.images.length,
      imagesWithAlt: Array.from(document.images).filter((image) => image.alt.trim().length > 0).length,
      structuredDataTypes,
      openGraphTags,
      canonicalUrl: (document.querySelector('link[rel="canonical"]')?.getAttribute("href") ?? "")
        .replace(/\s+/g, " ")
        .trim(),
      viewportContent: (document.querySelector('meta[name="viewport"]')?.getAttribute("content") ?? "")
        .replace(/\s+/g, " ")
        .trim()
    };
  });
}

async function collectPerformanceSnapshot(page: import("playwright").Page): Promise<PerformanceSnapshot> {
  return page.evaluate(() => {
    const nav = performance.getEntriesByType("navigation")[0] as PerformanceNavigationTiming | undefined;
    const paints = performance.getEntriesByType("paint");
    const fcp = paints.find((entry) => entry.name === "first-contentful-paint");

    return {
      timeToFirstByteMs: nav ? Math.round(nav.responseStart) : null,
      firstContentfulPaintMs: fcp ? Math.round(fcp.startTime) : null,
      domContentLoadedMs: nav ? Math.round(nav.domContentLoadedEventEnd) : null,
      loadMs: nav ? Math.round(nav.loadEventEnd || nav.duration) : null
    };
  });
}

function buildPerformanceMetrics(
  snapshot: PerformanceSnapshot,
  requestStats: RequestStats
): HotelPerformanceMetrics {
  const notes: string[] = [];
  const transferSizeKb =
    requestStats.transferredBytes > 0 ? Math.round(requestStats.transferredBytes / 1024) : null;

  const score =
    scoreFromThresholds(snapshot.timeToFirstByteMs, [
      { max: 800, points: 24 },
      { max: 1400, points: 18 },
      { max: 2200, points: 10 }
    ]) +
    scoreFromThresholds(snapshot.firstContentfulPaintMs, [
      { max: 1800, points: 24 },
      { max: 3000, points: 18 },
      { max: 4500, points: 10 }
    ]) +
    scoreFromThresholds(snapshot.domContentLoadedMs, [
      { max: 2200, points: 22 },
      { max: 3600, points: 16 },
      { max: 5200, points: 8 }
    ]) +
    scoreFromThresholds(snapshot.loadMs, [
      { max: 3200, points: 20 },
      { max: 5200, points: 14 },
      { max: 8000, points: 6 }
    ]) +
    scoreFromThresholds(requestStats.requestCount, [
      { max: 45, points: 10 },
      { max: 85, points: 7 },
      { max: 130, points: 4 }
    ]);

  if ((snapshot.timeToFirstByteMs ?? 0) > 1400) {
    notes.push("TTFB alto para a home.");
  }
  if ((snapshot.firstContentfulPaintMs ?? 0) > 3000) {
    notes.push("Primeiro conteúdo visível demora a aparecer.");
  }
  if ((snapshot.loadMs ?? 0) > 5200) {
    notes.push("Tempo total de carregamento acima do ideal.");
  }
  if (requestStats.requestCount > 90) {
    notes.push("Quantidade alta de requests na primeira navegação.");
  }

  return {
    score: clamp(score, 1, 100),
    timeToFirstByteMs: snapshot.timeToFirstByteMs,
    firstContentfulPaintMs: snapshot.firstContentfulPaintMs,
    domContentLoadedMs: snapshot.domContentLoadedMs,
    loadMs: snapshot.loadMs,
    requestCount: requestStats.requestCount,
    transferSizeKb,
    notes
  };
}

function buildSeoMetrics(dom: DomSummary): HotelSeoMetrics {
  const issues: string[] = [];
  const titleLength = dom.title.trim().length;
  const metaDescriptionLength = (dom.meta.description ?? "").trim().length;

  if (titleLength < 15 || titleLength > 65) {
    issues.push("Title fora da faixa recomendada (15-65 caracteres).");
  }
  if (metaDescriptionLength < 70 || metaDescriptionLength > 170) {
    issues.push("Meta description ausente ou fora da faixa ideal.");
  }
  if (!dom.canonicalUrl) {
    issues.push("Canonical não identificada.");
  }
  if (!dom.viewportContent) {
    issues.push("Meta viewport ausente.");
  }
  if (dom.h1Count === 0) {
    issues.push("Nenhum H1 identificado.");
  }
  if (dom.imageCount > 0 && dom.imagesWithAlt / dom.imageCount < 0.85) {
    issues.push("Cobertura de alt text abaixo do ideal.");
  }
  if (!dom.structuredDataTypes.length) {
    issues.push("Structured data não identificado.");
  }

  const score = clamp(100 - issues.length * 12, 1, 100);

  return {
    score,
    title: dom.title,
    titleLength,
    metaDescriptionLength,
    hasCanonical: Boolean(dom.canonicalUrl),
    hasRobots: Boolean(dom.meta.robots),
    hasViewport: Boolean(dom.viewportContent),
    h1Count: dom.h1Count,
    imageCount: dom.imageCount,
    imagesWithAlt: dom.imagesWithAlt,
    structuredDataTypes: dom.structuredDataTypes,
    openGraphTags: dom.openGraphTags,
    issues
  };
}

function stripTags(value: string): string {
  return value
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function decodeEntities(value: string): string {
  return value
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, "\"")
    .replace(/&#39;/gi, "'")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">");
}

function extractAttribute(tag: string, attribute: string): string {
  const match = tag.match(new RegExp(`${attribute}=["']([^"']+)["']`, "i"));
  return match?.[1]?.trim() ?? "";
}

function parseDomSummaryFromHtml(html: string): DomSummary {
  const title = decodeEntities(html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1] ?? "").trim();
  const metaMatches = Array.from(html.matchAll(/<meta\s+[^>]*?(?:name|property|http-equiv)=["']([^"']+)["'][^>]*content=["']([^"']*)["'][^>]*>/gi));
  const meta = Object.fromEntries(
    metaMatches.map((match) => [match[1].toLowerCase(), decodeEntities(match[2]).trim()])
  );
  const scripts = Array.from(html.matchAll(/<script[^>]+src=["']([^"']+)["'][^>]*>/gi), (match) => match[1].trim());
  const links = Array.from(html.matchAll(/<a[^>]+href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi), (match) => ({
    href: match[1].trim(),
    text: decodeEntities(stripTags(match[2]))
  }));
  const iframeSrcs = Array.from(html.matchAll(/<iframe[^>]+src=["']([^"']+)["'][^>]*>/gi), (match) => match[1].trim());
  const headings = Array.from(html.matchAll(/<h[1-3][^>]*>([\s\S]*?)<\/h[1-3]>/gi), (match) =>
    decodeEntities(stripTags(match[1]))
  ).filter(Boolean);
  const structuredDataTypes = Array.from(html.matchAll(/"@type"\s*:\s*"([^"]+)"/gi), (match) => match[1]);
  const openGraphTags = Array.from(html.matchAll(/<meta[^>]+property=["'](og:[^"']+)["'][^>]*>/gi), (match) => match[1]);
  const imageTags = Array.from(html.matchAll(/<img\b[^>]*>/gi), (match) => match[0]);
  const imagesWithAlt = imageTags.filter((tag) => /alt=["'][^"']*["']/i.test(tag)).length;

  return {
    title,
    html,
    text: decodeEntities(stripTags(html)),
    scripts,
    iframes: iframeSrcs,
    links,
    headings,
    meta,
    h1Count: (html.match(/<h1\b/gi) ?? []).length,
    imageCount: imageTags.length,
    imagesWithAlt,
    structuredDataTypes: Array.from(new Set(structuredDataTypes)),
    openGraphTags: Array.from(new Set(openGraphTags)),
    canonicalUrl: extractAttribute(html.match(/<link[^>]+rel=["']canonical["'][^>]*>/i)?.[0] ?? "", "href"),
    viewportContent: meta.viewport ?? ""
  };
}

async function collectWithFetchFallback(normalizedUrl: string): Promise<FetchFallbackPayload> {
  const startedAt = Date.now();
  const response = await fetch(normalizedUrl, {
    redirect: "follow",
    headers: {
      "user-agent": "HotelWebsiteScannerBot/1.0 (fallback)"
    }
  });

  const html = await response.text();
  return {
    finalUrl: response.url,
    html,
    cookies: response.headers.get("set-cookie") ?? "",
    elapsedMs: Date.now() - startedAt
  };
}

function buildFallbackPerformance(elapsedMs: number, html: string): HotelPerformanceMetrics {
  const approxTransferKb = html ? Math.round(Buffer.byteLength(html, "utf8") / 1024) : null;
  const notes = ["Resultado estimado via fallback estático; métricas de browser podem estar indisponíveis."];

  if (elapsedMs > 2500) {
    notes.push("Tempo de resposta do fetch acima do ideal.");
  }

  return {
    score: clamp(100 - Math.round(elapsedMs / 80) - (approxTransferKb ? Math.round(approxTransferKb / 120) : 0), 1, 100),
    timeToFirstByteMs: elapsedMs,
    firstContentfulPaintMs: null,
    domContentLoadedMs: null,
    loadMs: null,
    requestCount: 1,
    transferSizeKb: approxTransferKb,
    notes
  };
}

function isReserveCtaCandidate(label: string, href = ""): boolean {
  const normalizedLabel = normalizeText(label);
  const normalizedHref = normalizeText(href);

  const hasPositive = RESERVE_KEYWORDS.some((keyword) => normalizedLabel.includes(keyword));
  if (!hasPositive) {
    return false;
  }

  const hasNegative = RESERVE_NEGATIVE_KEYWORDS.some(
    (keyword) => normalizedLabel.includes(keyword) || normalizedHref.includes(keyword)
  );

  return !hasNegative;
}

async function analyzeHotelWebsiteWithFetchFallback(
  input: EngineInput,
  browserError?: unknown
): Promise<HotelWebsiteAnalysis> {
  const fallback = await collectWithFetchFallback(input.normalizedUrl);
  const dom = parseDomSummaryFromHtml(fallback.html);
  const snapshot: HotelPageSnapshot = {
    url: fallback.finalUrl,
    title: dom.title,
    html: dom.html,
    text: dom.text,
    scripts: dom.scripts,
    links: dom.links,
    headings: dom.headings,
    meta: dom.meta
  };

  const findings = detectTechnologies(
    sourcesFromPage(fallback.finalUrl, dom, fallback.cookies, {
      requestUrls: new Set<string>(),
      requestCount: 1,
      transferredBytes: Buffer.byteLength(fallback.html, "utf8")
    }, [dom.canonicalUrl])
  );

  const bookingEngine =
    findings.find((finding) => finding.category === "booking-engine")?.name ??
    (dom.links.find((link) => normalizeText(link.text).includes("reserv")) ? null : null);
  const reserveLinks = dom.links.filter((link) => isReserveCtaCandidate(link.text, link.href));

  const booking: HotelBookingAnalysis = {
    status: reserveLinks.length || bookingEngine ? "detected" : "not_found",
    reserveLabels: reserveLinks.map((link) => link.text).filter(Boolean),
    reserveEntryPoints: reserveLinks.map((link) => link.href),
    actions: ["Fallback estático acionado após falha no browser runtime."],
    warnings: browserError ? [`Browser runtime falhou: ${browserError instanceof Error ? browserError.message : "erro desconhecido"}`] : [],
    fields: {
      hotelSelector: /hotel|property|destino|unidade/i.test(dom.html),
      checkIn: /check[\s-_]?in|entrada/i.test(dom.html),
      checkOut: /check[\s-_]?out|sa[ií]da|departure/i.test(dom.html),
      guests: /guest|adult|hospede|hóspede|ocupac/i.test(dom.html),
      children: /children|crianca|criança|kids/i.test(dom.html)
    },
    bookingEngine,
    finalUrl: reserveLinks[0]?.href ?? fallback.finalUrl,
    evidence: bookingEngine ? [`Motor identificado por HTML/link: ${bookingEngine}.`] : []
  };

  const performance = buildFallbackPerformance(fallback.elapsedMs, fallback.html);
  const seo = buildSeoMetrics(dom);
  const summary = summarizeByCategory(findings);
  const overallScore = clamp(
    Math.round(performance.score * 0.35 + seo.score * 0.4 + (booking.bookingEngine || booking.reserveEntryPoints.length ? 80 : 40) * 0.25),
    1,
    100
  );

  return {
    url: input.url,
    normalizedUrl: input.normalizedUrl,
    status: "completed",
    finishedAt: new Date().toISOString(),
    pagesVisited: Array.from(new Set([snapshot.url, booking.finalUrl].filter(Boolean) as string[])),
    performance,
    seo,
    technologies: findings,
    booking,
    summary: {
      ...summary,
      overallScore,
      bookingEngines: booking.bookingEngine
        ? Array.from(new Set([...summary.bookingEngines, booking.bookingEngine]))
        : summary.bookingEngines
    }
  };
}

async function collectReserveCandidates(page: import("playwright").Page): Promise<CandidateDescriptor[]> {
  const locator = page.locator('a, button, [role="button"], input[type="submit"], input[type="button"]');

  return locator.evaluateAll(
    (elements, payload) => {
      const candidates = elements
        .map((element, index) => {
          const html = element as HTMLElement;
          const label =
            html.innerText?.trim() ||
            html.getAttribute("aria-label") ||
            html.getAttribute("title") ||
            html.getAttribute("value") ||
            "";
          const href = html instanceof HTMLAnchorElement ? html.href : html.getAttribute("href") || "";
          const rect = html.getBoundingClientRect();
          const visible = rect.width > 1 && rect.height > 1;
          const normalized = label
            .normalize("NFD")
            .replace(/[\u0300-\u036f]/g, "")
            .toLowerCase()
            .trim();
          const normalizedHref = href
            .normalize("NFD")
            .replace(/[\u0300-\u036f]/g, "")
            .toLowerCase()
            .trim();
          const score = payload.positive.findIndex((keyword) => normalized.includes(keyword));
          const isNegative = payload.negative.some(
            (keyword) => normalized.includes(keyword) || normalizedHref.includes(keyword)
          );

          return {
            index,
            label,
            href,
            visible,
            score: score === -1 || isNegative ? -1 : 100 - score
          };
        })
        .filter((item) => item.visible && item.score >= 0)
        .sort((a, b) => {
          const aHasHref = a.href ? 1 : 0;
          const bHasHref = b.href ? 1 : 0;
          if (b.score !== a.score) {
            return b.score - a.score;
          }
          if (bHasHref !== aHasHref) {
            return bHasHref - aHasHref;
          }
          return a.index - b.index;
        });

      return candidates;
    },
    {
      positive: RESERVE_KEYWORDS.map(normalizeText),
      negative: RESERVE_NEGATIVE_KEYWORDS.map(normalizeText)
    }
  );
}

async function discoverBookingFields(page: import("playwright").Page): Promise<BookingFieldDescriptor[]> {
  const locator = page.locator("input, select");

  return locator.evaluateAll((elements) => {
    return elements
      .map((element, index) => {
        const html = element as HTMLInputElement | HTMLSelectElement;
        const descriptor =
          html.getAttribute("aria-label") ||
          html.getAttribute("placeholder") ||
          html.getAttribute("name") ||
          html.getAttribute("id") ||
          "";
        const normalized = descriptor
          .normalize("NFD")
          .replace(/[\u0300-\u036f]/g, "")
          .toLowerCase();
        let intent: BookingFieldDescriptor["intent"] | null = null;
        if (/(hotel|property|resort|destino|unidade)/.test(normalized)) {
          intent = "hotelSelector";
        } else if (/(checkin|check-in|arrival|entrada)/.test(normalized)) {
          intent = "checkIn";
        } else if (/(checkout|check-out|departure|saida|saída)/.test(normalized)) {
          intent = "checkOut";
        } else if (/(guest|guests|adult|adults|hospede|hospedes|pax|ocupacao|ocupação)/.test(normalized)) {
          intent = "guests";
        } else if (/(child|children|crianca|criancas|criança|crianças|kids|infant)/.test(normalized)) {
          intent = "children";
        }
        if (!intent) {
          return null;
        }

        return {
          index,
          tagName: html.tagName,
          intent
        };
      })
      .filter(Boolean) as BookingFieldDescriptor[];
  });
}

async function selectBestOption(locator: import("playwright").Locator): Promise<boolean> {
  const value = await locator.evaluate((element) => {
    if (!(element instanceof HTMLSelectElement)) {
      return "";
    }
    let option: HTMLOptionElement | undefined;
    for (let index = 0; index < element.options.length; index += 1) {
      const candidate = element.options[index];
      const text = candidate.textContent?.trim().toLowerCase() ?? "";
      if (
        index > 0 &&
        !candidate.disabled &&
        candidate.value.trim() &&
        !/(select|selecione|choose)/.test(text)
      ) {
        option = candidate;
        break;
      }
    }
    return option?.value ?? "";
  });

  if (!value) {
    return false;
  }

  await locator.selectOption(value).catch(() => undefined);
  return true;
}

async function fillBookingFields(
  page: import("playwright").Page,
  actions: string[]
): Promise<BookingFieldCoverage> {
  const fields = await discoverBookingFields(page);
  const coverage: BookingFieldCoverage = {
    hotelSelector: fields.some((field) => field.intent === "hotelSelector"),
    checkIn: fields.some((field) => field.intent === "checkIn"),
    checkOut: fields.some((field) => field.intent === "checkOut"),
    guests: fields.some((field) => field.intent === "guests"),
    children: fields.some((field) => field.intent === "children")
  };

  const locator = page.locator("input, select");
  const checkIn = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
  const checkOut = new Date(Date.now() + 3 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);

  for (const field of fields) {
    const target = locator.nth(field.index);

    if (field.intent === "hotelSelector" && field.tagName === "SELECT") {
      if (await selectBestOption(target)) {
        actions.push("Selecionou hotel/unidade em um seletor.");
      }
      continue;
    }

    if (field.intent === "checkIn") {
      await target.fill(checkIn).catch(() => undefined);
      actions.push("Tentou preencher check-in.");
      continue;
    }

    if (field.intent === "checkOut") {
      await target.fill(checkOut).catch(() => undefined);
      actions.push("Tentou preencher check-out.");
      continue;
    }

    if (field.intent === "guests") {
      if (field.tagName === "SELECT") {
        await target.selectOption("2").catch(() => undefined);
      } else {
        await target.fill("2").catch(() => undefined);
      }
      actions.push("Tentou configurar hóspedes/adultos.");
      continue;
    }

    if (field.intent === "children") {
      if (field.tagName === "SELECT") {
        await target.selectOption("0").catch(() => undefined);
      } else {
        await target.fill("0").catch(() => undefined);
      }
      actions.push("Tentou configurar crianças.");
    }
  }

  return coverage;
}

async function clickSubmitCandidate(
  page: import("playwright").Page,
  actions: string[]
): Promise<boolean> {
  const locator = page.locator('button, input[type="submit"], a, [role="button"]');

  const candidate = await locator.evaluateAll(
    (elements, keywords) => {
      const found = elements.findIndex((element) => {
        const html = element as HTMLElement;
        const label =
          html.innerText?.trim() ||
          html.getAttribute("aria-label") ||
          html.getAttribute("title") ||
          html.getAttribute("value") ||
          "";
        const rect = html.getBoundingClientRect();
        const normalized = label
          .normalize("NFD")
          .replace(/[\u0300-\u036f]/g, "")
          .toLowerCase()
          .trim();
        return rect.width > 1 && rect.height > 1 && keywords.some((keyword) => normalized.includes(keyword));
      });

      return found;
    },
    BOOKING_SUBMIT_KEYWORDS.map(normalizeText)
  );

  if (candidate < 0) {
    return false;
  }

  const popupPromise = page.waitForEvent("popup", { timeout: ACTION_TIMEOUT_MS }).catch(() => null);
  const beforeUrl = page.url();
  const target = locator.nth(candidate);

  const clicked = await target.click({ timeout: ACTION_TIMEOUT_MS }).then(
    () => true,
    async () => {
      return target.evaluate((element) => {
        if (element instanceof HTMLElement) {
          element.click();
          return true;
        }
        return false;
      });
    }
  );

  if (!clicked) {
    return false;
  }

  const popup = await popupPromise;
  const activePage = popup ?? page;
  await waitForSettledLoad(activePage);
  if (popup || activePage.url() !== beforeUrl) {
    actions.push(`Tentou avançar o fluxo de reserva para ${activePage.url()}.`);
  }

  return true;
}

function sourcesFromPage(
  url: string,
  dom: DomSummary,
  cookies: string,
  requestStats: RequestStats,
  runtimeSignals: string[]
): EvidenceSource[] {
  return [
    { type: "runtime", source: "page-url", value: url },
    { type: "cookie", source: "cookies", value: cookies },
    { type: "html", source: "document", value: dom.html },
    { type: "runtime", source: "visible-text", value: dom.text },
    ...dom.scripts.map((value) => ({ type: "script" as const, source: "script-src", value })),
    ...dom.iframes.map((value) => ({ type: "link" as const, source: "iframe-src", value })),
    ...dom.links.map((link) => ({ type: "link" as const, source: "anchor", value: `${link.href} ${link.text}` })),
    ...Array.from(requestStats.requestUrls).map((value) => ({ type: "request" as const, source: "network", value })),
    ...runtimeSignals.map((value) => ({ type: "runtime" as const, source: "runtime", value }))
  ];
}

function summarizeByCategory(findings: HotelTechnologyFinding[]): HotelWebsiteAnalysis["summary"] {
  const bookingEngines = findings
    .filter((finding) => finding.category === "booking-engine")
    .map((finding) => finding.name);

  const tagManagers = findings
    .filter((finding) => finding.name.includes("Tag Manager"))
    .map((finding) => finding.name);

  const analyticsTools = findings
    .filter((finding) => ["Google Analytics", "Hotjar"].includes(finding.name))
    .map((finding) => finding.name);

  const crmTools = findings
    .filter((finding) => finding.category === "crm")
    .map((finding) => finding.name);

  const adsTags = findings
    .filter(
      (finding) =>
        finding.category === "ads" &&
        !analyticsTools.includes(finding.name) &&
        !tagManagers.includes(finding.name)
    )
    .map((finding) => finding.name);

  return {
    overallScore: 0,
    adsTags,
    crmTools,
    analyticsTools,
    tagManagers,
    bookingEngines
  };
}

async function analyzeBookingFlow(
  page: import("playwright").Page,
  requestStats: RequestStats,
  initialFindings: HotelTechnologyFinding[]
): Promise<HotelBookingAnalysis> {
  const reserveLabels: string[] = [];
  const reserveEntryPoints: string[] = [];
  const actions: string[] = [];
  const warnings: string[] = [];
  const evidence: string[] = [];
  const initialBookingEngine =
    initialFindings.find((finding) => finding.category === "booking-engine")?.name ?? null;

  const candidates = await collectReserveCandidates(page);
  if (!candidates.length) {
    if (initialBookingEngine) {
      return {
        status: "detected",
        reserveLabels,
        reserveEntryPoints,
        actions,
        warnings,
        fields: {
          hotelSelector: false,
          checkIn: false,
          checkOut: false,
          guests: false,
          children: false
        },
        bookingEngine: initialBookingEngine,
        finalUrl: page.url(),
        evidence: [`Motor detectado por sinais técnicos: ${initialBookingEngine}.`]
      };
    }

    return {
      status: "not_found",
      reserveLabels,
      reserveEntryPoints,
      actions,
      warnings: ["CTA de reserva não encontrado na navegação principal."],
      fields: {
        hotelSelector: false,
        checkIn: false,
        checkOut: false,
        guests: false,
        children: false
      },
      bookingEngine: null,
      finalUrl: page.url(),
      evidence
    };
  }

  reserveLabels.push(...Array.from(new Set(candidates.map((candidate) => candidate.label).filter(Boolean))));
  reserveEntryPoints.push(...Array.from(new Set(candidates.map((candidate) => candidate.href).filter(Boolean))));

  let chosenCandidate = candidates[0];
  let targetPage: import("playwright").Page = page;
  let fields: BookingFieldCoverage = {
    hotelSelector: false,
    checkIn: false,
    checkOut: false,
    guests: false,
    children: false
  };
  let submitted = false;
  let bookingEngine: string | null = initialBookingEngine;

  for (const candidate of candidates.slice(0, 3)) {
    chosenCandidate = candidate;
    actions.push(`CTA de reserva identificado: "${candidate.label}".`);

    const clickable = page
      .locator('a, button, [role="button"], input[type="submit"], input[type="button"]')
      .nth(candidate.index);
    const popupPromise = page.waitForEvent("popup", { timeout: ACTION_TIMEOUT_MS }).catch(() => null);
    const beforeUrl = page.url();

    try {
      await clickable.click({ timeout: ACTION_TIMEOUT_MS });
    } catch {
      await clickable
        .evaluate((element) => {
          if (element instanceof HTMLElement) {
            element.click();
          }
        })
        .catch(() => {
          warnings.push(`Não foi possível acionar automaticamente o CTA "${candidate.label}".`);
        });
    }

    const popup = await popupPromise;
    targetPage = popup ?? page;
    attachRequestTracking(targetPage, requestStats);
    await waitForSettledLoad(targetPage);

    fields = await fillBookingFields(targetPage, actions).catch(() => ({
      hotelSelector: false,
      checkIn: false,
      checkOut: false,
      guests: false,
      children: false
    }));

    submitted = await clickSubmitCandidate(targetPage, actions).catch(() => false);
    const dom = await collectDomSummary(targetPage);
    const findings = detectTechnologies(
      sourcesFromPage(targetPage.url(), dom, "", requestStats, candidate.href ? [candidate.href] : [])
    );
    bookingEngine =
      findings.find((finding) => finding.category === "booking-engine")?.name ?? initialBookingEngine;

    if (bookingEngine || submitted || targetPage.url() !== beforeUrl) {
      break;
    }
  }

  if (bookingEngine) {
    evidence.push(`Motor de reservas identificado: ${bookingEngine}.`);
  }

  if (!bookingEngine && !submitted) {
    warnings.push("O fluxo de reserva não navegou para uma etapa confirmável.");
  }

  return {
    status: bookingEngine ? (submitted ? "configured" : "detected") : submitted ? "configured" : "detected",
    reserveLabels,
    reserveEntryPoints,
    actions,
    warnings,
    fields,
    bookingEngine,
    finalUrl: targetPage.url(),
    evidence: chosenCandidate?.href && !evidence.includes(chosenCandidate.href) ? [...evidence, chosenCandidate.href] : evidence
  };
}

export async function analyzeHotelWebsite(input: EngineInput): Promise<HotelWebsiteAnalysis> {
  if (!isSafeTargetUrl(input.normalizedUrl)) {
    return {
      url: input.url,
      normalizedUrl: input.normalizedUrl,
      status: "failed",
      finishedAt: new Date().toISOString(),
      error: "URL bloqueada por política de segurança (SSRF).",
      pagesVisited: [],
      performance: {
        score: 1,
        timeToFirstByteMs: null,
        firstContentfulPaintMs: null,
        domContentLoadedMs: null,
        loadMs: null,
        requestCount: 0,
        transferSizeKb: null,
        notes: []
      },
      seo: {
        score: 1,
        title: "",
        titleLength: 0,
        metaDescriptionLength: 0,
        hasCanonical: false,
        hasRobots: false,
        hasViewport: false,
        h1Count: 0,
        imageCount: 0,
        imagesWithAlt: 0,
        structuredDataTypes: [],
        openGraphTags: [],
        issues: []
      },
      technologies: [],
      booking: {
        status: "failed",
        reserveLabels: [],
        reserveEntryPoints: [],
        actions: [],
        warnings: [],
        fields: {
          hotelSelector: false,
          checkIn: false,
          checkOut: false,
          guests: false,
          children: false
        },
        bookingEngine: null,
        finalUrl: null,
        evidence: []
      },
      summary: {
        overallScore: 1,
        adsTags: [],
        crmTools: [],
        analyticsTools: [],
        tagManagers: [],
        bookingEngines: []
      }
    };
  }

  let playwrightModule: typeof import("playwright");

  try {
    playwrightModule = await import("playwright");
  } catch {
    console.error("[hotel-scan] playwright import failed, using fetch fallback", {
      url: input.normalizedUrl
    });
    try {
      return await analyzeHotelWebsiteWithFetchFallback(
        input,
        new Error("Playwright não disponível. Execute: npx playwright install chromium")
      );
    } catch (fallbackError) {
      return {
        url: input.url,
        normalizedUrl: input.normalizedUrl,
        status: "failed",
        finishedAt: new Date().toISOString(),
        error:
          fallbackError instanceof Error
            ? fallbackError.message
            : "Playwright não disponível. Execute: npx playwright install chromium",
        pagesVisited: [],
        performance: {
          score: 1,
          timeToFirstByteMs: null,
          firstContentfulPaintMs: null,
          domContentLoadedMs: null,
          loadMs: null,
          requestCount: 0,
          transferSizeKb: null,
          notes: []
        },
        seo: {
          score: 1,
          title: "",
          titleLength: 0,
          metaDescriptionLength: 0,
          hasCanonical: false,
          hasRobots: false,
          hasViewport: false,
          h1Count: 0,
          imageCount: 0,
          imagesWithAlt: 0,
          structuredDataTypes: [],
          openGraphTags: [],
          issues: []
        },
        technologies: [],
        booking: {
          status: "failed",
          reserveLabels: [],
          reserveEntryPoints: [],
          actions: [],
          warnings: [],
          fields: {
            hotelSelector: false,
            checkIn: false,
            checkOut: false,
            guests: false,
            children: false
          },
          bookingEngine: null,
          finalUrl: null,
          evidence: []
        },
        summary: {
          overallScore: 1,
          adsTags: [],
          crmTools: [],
          analyticsTools: [],
          tagManagers: [],
          bookingEngines: []
        }
      };
    }
  }

  let browser: import("playwright").Browser | undefined;
  let context: import("playwright").BrowserContext | undefined;
  let page: import("playwright").Page | undefined;

  try {
    browser = await playwrightModule.chromium.launch({
      headless: true,
      args: ["--no-sandbox", "--disable-setuid-sandbox"]
    });

    context = await browser.newContext({
      ignoreHTTPSErrors: true,
      locale: "pt-BR",
      userAgent: "HotelWebsiteScannerBot/1.0"
    });

    page = await context.newPage();
    const requestStats: RequestStats = {
      requestUrls: new Set<string>(),
      requestCount: 0,
      transferredBytes: 0
    };
    attachRequestTracking(page, requestStats);

    await page.goto(input.normalizedUrl, {
      waitUntil: "domcontentloaded",
      timeout: BROWSER_GOTO_TIMEOUT_MS
    });
    await waitForSettledLoad(page);

    const [dom, performanceSnapshot, cookies] = await Promise.all([
      collectDomSummary(page),
      collectPerformanceSnapshot(page),
      context.cookies().then((items) => items.map((item) => `${item.name}=${item.value}`).join("; "))
    ]);

    const snapshot: HotelPageSnapshot = {
      url: page.url(),
      title: dom.title,
      html: dom.html,
      text: dom.text,
      scripts: dom.scripts,
      links: dom.links,
      headings: dom.headings,
      meta: dom.meta
    };

    const findings = detectTechnologies(
      sourcesFromPage(page.url(), dom, cookies, requestStats, [
        dom.meta.generator ?? "",
        dom.canonicalUrl
      ])
    );
    const booking = await analyzeBookingFlow(page, requestStats, findings);
    const performance = buildPerformanceMetrics(performanceSnapshot, requestStats);
    const seo = buildSeoMetrics(dom);
    const summary = summarizeByCategory(findings);
    const overallScore = clamp(
      Math.round(performance.score * 0.4 + seo.score * 0.35 + (booking.bookingEngine || booking.reserveLabels.length ? 85 : 35) * 0.25),
      1,
      100
    );

    return {
      url: input.url,
      normalizedUrl: input.normalizedUrl,
      status: "completed",
      finishedAt: new Date().toISOString(),
      pagesVisited: Array.from(new Set([snapshot.url, booking.finalUrl].filter(Boolean) as string[])),
      performance,
      seo,
      technologies: findings,
      booking,
      summary: {
        ...summary,
        overallScore,
        bookingEngines: booking.bookingEngine
          ? Array.from(new Set([...summary.bookingEngines, booking.bookingEngine]))
          : summary.bookingEngines
      }
    };
  } catch (error) {
    console.error("[hotel-scan] browser analysis failed, using fetch fallback", {
      url: input.normalizedUrl,
      error: error instanceof Error ? error.message : String(error)
    });

    try {
      return await analyzeHotelWebsiteWithFetchFallback(input, error);
    } catch (fallbackError) {
      return {
        url: input.url,
        normalizedUrl: input.normalizedUrl,
        status: "failed",
        finishedAt: new Date().toISOString(),
        error:
          fallbackError instanceof Error
            ? fallbackError.message
            : error instanceof Error
            ? error.message
            : "Falha desconhecida na análise do hotel.",
        pagesVisited: [],
        performance: {
          score: 1,
          timeToFirstByteMs: null,
          firstContentfulPaintMs: null,
          domContentLoadedMs: null,
          loadMs: null,
          requestCount: 0,
          transferSizeKb: null,
          notes: []
        },
        seo: {
          score: 1,
          title: "",
          titleLength: 0,
          metaDescriptionLength: 0,
          hasCanonical: false,
          hasRobots: false,
          hasViewport: false,
          h1Count: 0,
          imageCount: 0,
          imagesWithAlt: 0,
          structuredDataTypes: [],
          openGraphTags: [],
          issues: []
        },
        technologies: [],
        booking: {
          status: "failed",
          reserveLabels: [],
          reserveEntryPoints: [],
          actions: [],
          warnings: [],
          fields: {
            hotelSelector: false,
            checkIn: false,
            checkOut: false,
            guests: false,
            children: false
          },
          bookingEngine: null,
          finalUrl: null,
          evidence: []
        },
        summary: {
          overallScore: 1,
          adsTags: [],
          crmTools: [],
          analyticsTools: [],
          tagManagers: [],
          bookingEngines: []
        }
      };
    }
  } finally {
    await page?.close().catch(() => undefined);
    await context?.close().catch(() => undefined);
    await browser?.close().catch(() => undefined);
  }
}
