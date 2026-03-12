import { NextResponse } from "next/server";
import { retryFailedItems } from "@/lib/job-store";

export async function POST(
  _request: Request,
  context: { params: Promise<{ jobId: string }> }
) {
  const { jobId } = await context.params;
  const job = retryFailedItems(jobId);

  if (!job) {
    return NextResponse.json({ error: "Job não encontrado." }, { status: 404 });
  }

  return NextResponse.json({ job });
}
