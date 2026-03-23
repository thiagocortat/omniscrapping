import { NextResponse } from "next/server";
import { retryFailedHotelScanItems } from "@/lib/hotel-job-store";

export async function POST(
  _request: Request,
  context: { params: Promise<{ jobId: string }> }
) {
  try {
    const { jobId } = await context.params;
    const job = await retryFailedHotelScanItems(jobId);

    if (!job) {
      return NextResponse.json({ error: "Job não encontrado." }, { status: 404 });
    }

    return NextResponse.json({ job });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Falha ao reprocessar job de hotel."
      },
      { status: 500 }
    );
  }
}
