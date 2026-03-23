import { NextResponse } from "next/server";
import { getHotelScanJob } from "@/lib/hotel-job-store";

export async function GET(
  request: Request,
  context: { params: Promise<{ jobId: string }> }
) {
  try {
    const { jobId } = await context.params;
    const job = await getHotelScanJob(jobId);

    if (!job) {
      return NextResponse.json({ error: "Job não encontrado." }, { status: 404 });
    }

    const url = new URL(request.url);
    const view = url.searchParams.get("view");

    if (view === "summary") {
      const summarizedJob = {
        ...job,
        items: job.items.map((item) => ({
          ...item,
          result: item.result
            ? {
                ...item.result,
                technologies: item.result.technologies.map((finding) => ({
                  ...finding,
                  evidences: []
                })),
                booking: {
                  ...item.result.booking,
                  evidence: []
                }
              }
            : undefined
        }))
      };

      return NextResponse.json({ job: summarizedJob });
    }

    return NextResponse.json({ job });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Falha ao consultar job de hotel."
      },
      { status: 500 }
    );
  }
}
