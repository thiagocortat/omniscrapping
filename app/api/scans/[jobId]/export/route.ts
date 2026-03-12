import { NextResponse } from "next/server";
import { getJob } from "@/lib/job-store";
import { csvEscape } from "@/lib/utils";

export async function GET(
  request: Request,
  context: { params: Promise<{ jobId: string }> }
) {
  const { jobId } = await context.params;
  const url = new URL(request.url);
  const format = url.searchParams.get("format") ?? "csv";
  const job = getJob(jobId);

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
    "status",
    "tecnologias",
    "detalhes",
    "confianca_media",
    "erro",
    "data_analise"
  ];

  const rows = job.items.map((item) => {
    const detections = item.result?.detections ?? [];
    const technologies = detections
      .filter((detection) => detection.status !== "not_found")
      .map((detection) => detection.technology)
      .join(" | ");

    const details = detections
      .map((detection) => `${detection.technology} (${detection.status} - ${detection.confidence}%)`)
      .join(" | ");

    const confidenceAverage = detections.length
      ? Math.round(
          detections.reduce((acc, detection) => acc + detection.confidence, 0) /
            detections.length
        )
      : 0;

    return [
      item.normalizedUrl,
      item.status,
      technologies,
      details,
      confidenceAverage,
      item.error ?? "",
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
}
