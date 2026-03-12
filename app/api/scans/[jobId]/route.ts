import { NextResponse } from "next/server";
import { getJob } from "@/lib/job-store";

export async function GET(
  request: Request,
  context: { params: Promise<{ jobId: string }> }
) {
  try {
    const { jobId } = await context.params;
    const job = await getJob(jobId);

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
                detections: item.result.detections.map((detection) => ({
                  ...detection,
                  evidences: []
                }))
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
            : "Falha ao consultar job."
      },
      { status: 500 }
    );
  }
}
