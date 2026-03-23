import { NextResponse } from "next/server";
import { createHotelScanJob } from "@/lib/hotel-job-store";
import { compactUnique, isSafeTargetUrl, normalizeUrl } from "@/lib/utils";
import type { CreateHotelScanPayload } from "@/lib/hotel-types";

const MAX_URLS_PER_JOB = 300;

export async function POST(request: Request) {
  try {
    const payload = (await request.json()) as CreateHotelScanPayload;

    const normalizedUrls = compactUnique(payload.urls ?? [])
      .map((url) => normalizeUrl(url))
      .filter((url): url is string => Boolean(url))
      .filter((url) => isSafeTargetUrl(url));

    if (!normalizedUrls.length) {
      return NextResponse.json(
        { error: "Nenhuma URL válida e segura foi enviada." },
        { status: 400 }
      );
    }

    if (normalizedUrls.length > MAX_URLS_PER_JOB) {
      return NextResponse.json(
        { error: `Limite excedido: máximo de ${MAX_URLS_PER_JOB} URLs por job.` },
        { status: 400 }
      );
    }

    const job = await createHotelScanJob(normalizedUrls);
    return NextResponse.json({ job }, { status: 201 });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Falha ao criar job de análise de hotel."
      },
      { status: 500 }
    );
  }
}
