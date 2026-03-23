import { NextResponse } from "next/server";
import { getHotelScanJob } from "@/lib/hotel-job-store";
import { csvEscape } from "@/lib/utils";

export async function GET(
  request: Request,
  context: { params: Promise<{ jobId: string }> }
) {
  try {
    const { jobId } = await context.params;
    const job = await getHotelScanJob(jobId);
    const url = new URL(request.url);
    const format = url.searchParams.get("format") ?? "csv";

    if (!job) {
      return NextResponse.json({ error: "Job não encontrado." }, { status: 404 });
    }

    if (format !== "csv") {
      return NextResponse.json(
        { error: "No momento, apenas exportação CSV está disponível." },
        { status: 400 }
      );
    }

    const header = [
      "url",
      "status",
      "score_geral",
      "score_performance",
      "score_seo",
      "motor_reservas",
      "status_reserva",
      "ads",
      "crm",
      "analytics",
      "tag_manager",
      "tecnologias",
      "paginas_visitadas",
      "erro",
      "data_analise"
    ];

    const rows = job.items.map((item) => {
      const result = item.result;
      return [
        item.normalizedUrl,
        item.status,
        result?.summary.overallScore ?? "",
        result?.performance.score ?? "",
        result?.seo.score ?? "",
        result?.booking.bookingEngine ?? "",
        result?.booking.status ?? "",
        result?.summary.adsTags.join(" | ") ?? "",
        result?.summary.crmTools.join(" | ") ?? "",
        result?.summary.analyticsTools.join(" | ") ?? "",
        result?.summary.tagManagers.join(" | ") ?? "",
        result?.technologies.map((finding) => finding.name).join(" | ") ?? "",
        result?.pagesVisited.join(" | ") ?? "",
        item.error ?? "",
        item.finishedAt ?? ""
      ];
    });

    const csv = [header, ...rows]
      .map((row) => row.map((column) => csvEscape(column)).join(","))
      .join("\n");

    return new NextResponse(csv, {
      status: 200,
      headers: {
        "content-type": "text/csv; charset=utf-8",
        "content-disposition": `attachment; filename=hotel-scan-${job.id}.csv`
      }
    });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Falha ao exportar job de hotel."
      },
      { status: 500 }
    );
  }
}
