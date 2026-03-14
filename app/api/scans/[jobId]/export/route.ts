import { NextResponse } from "next/server";
import { getJob } from "@/lib/job-store";
import { csvEscape } from "@/lib/utils";
import { getFriendlyScanItemError } from "@/lib/scan-errors";
import type { DetectionResult, DetectionStatus, ScanStatus } from "@/lib/types";

function toScanStatusLabel(status: ScanStatus): string {
  switch (status) {
    case "completed":
      return "concluido";
    case "failed":
      return "falhou";
    case "running":
      return "em_andamento";
    case "pending":
      return "pendente";
    default:
      return status;
  }
}

function toDetectionStatusLabel(status: DetectionStatus): string {
  switch (status) {
    case "found":
      return "encontrado";
    case "not_found":
      return "nao_encontrado";
    case "inconclusive":
      return "inconclusivo";
    default:
      return status;
  }
}

function normalizeKey(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]/g, "");
}

function isDetectionForTarget(detection: DetectionResult, target: string): boolean {
  const detectionKey = normalizeKey(detection.technology);
  const targetKey = normalizeKey(target);
  return detectionKey.includes(targetKey) || targetKey.includes(detectionKey);
}

function buildTargetResults(targets: string[], detections: DetectionResult[]): string {
  if (!targets.length) {
    return "";
  }

  return targets
    .map((target) => {
      const targetDetections = detections.filter((detection) => isDetectionForTarget(detection, target));

      if (!targetDetections.length) {
        return `${target}: nao_encontrado`;
      }

      const best = [...targetDetections].sort((a, b) => b.confidence - a.confidence)[0];
      return `${target}: ${toDetectionStatusLabel(best.status)} (${best.confidence}%)`;
    })
    .join(" | ");
}

export async function GET(
  request: Request,
  context: { params: Promise<{ jobId: string }> }
) {
  try {
    const { jobId } = await context.params;
    const url = new URL(request.url);
    const format = url.searchParams.get("format") ?? "csv";
    const job = await getJob(jobId);

    if (!job) {
      return NextResponse.json({ error: "Job não encontrado." }, { status: 404 });
    }

    if (format !== "csv") {
      return NextResponse.json(
        { error: "No MVP atual, apenas exportação CSV está disponível." },
        { status: 400 }
      );
    }

    const header = [
      "url",
      "status_scan",
      "modo",
      "alvos",
      "resultado_alvos",
      "tecnologias_detectadas",
      "detalhes_deteccao",
      "confianca_media",
      "erro_resumido",
      "data_analise"
    ];

    const rows = job.items.map((item) => {
      const detections = item.result?.detections ?? [];
      const positiveDetections = detections.filter((detection) => detection.status !== "not_found");

      const technologies = positiveDetections
        .map((detection) => detection.technology)
        .join(" | ");

      const details = positiveDetections
        .map(
          (detection) =>
            `${detection.technology} (${toDetectionStatusLabel(detection.status)} - ${detection.confidence}%): ${detection.summary}`
        )
        .join(" | ");

      const confidenceAverage = positiveDetections.length
        ? Math.round(
            positiveDetections.reduce((acc, detection) => acc + detection.confidence, 0) /
              positiveDetections.length
          )
        : 0;

      const friendlyError = getFriendlyScanItemError(item);
      const targetResults = job.mode === "specific" ? buildTargetResults(job.targets, detections) : "";

      return [
        item.normalizedUrl,
        toScanStatusLabel(item.status),
        job.mode,
        job.targets.join(" | "),
        targetResults,
        technologies,
        details,
        confidenceAverage,
        friendlyError,
        item.finishedAt ?? ""
      ];
    });

    const csv = [header, ...rows]
      .map((row) => row.map((column) => csvEscape(column)).join(","))
      .join("\n");

    const filename = `techstack-scan-${job.id}.csv`;

    return new NextResponse(csv, {
      status: 200,
      headers: {
        "content-type": "text/csv; charset=utf-8",
        "content-disposition": `attachment; filename=${filename}`
      }
    });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Falha ao exportar dados do job."
      },
      { status: 500 }
    );
  }
}
