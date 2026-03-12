import { NextResponse } from "next/server";
import { createJob } from "@/lib/job-store";
import { compactUnique, isSafeTargetUrl, normalizeUrl } from "@/lib/utils";
import type { CreateScanPayload } from "@/lib/types";

const MAX_URLS_PER_JOB = 1000;

export async function POST(request: Request) {
  try {
    const payload = (await request.json()) as CreateScanPayload;

    const normalizedUrls = compactUnique(payload.urls ?? [])
      .map((url) => ({ input: url, normalized: normalizeUrl(url) }))
      .filter((entry) => entry.normalized)
      .map((entry) => entry.normalized as string)
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

    const mode = payload.mode === "specific" ? "specific" : "all";
    const targets = compactUnique(payload.targets ?? []);

    if (mode === "specific" && !targets.length) {
      return NextResponse.json(
        { error: "Informe ao menos uma tecnologia para o modo específico." },
        { status: 400 }
      );
    }

    const job = await createJob({
      urls: normalizedUrls,
      mode,
      targets
    });

    return NextResponse.json({ job }, { status: 201 });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Falha ao criar job de varredura."
      },
      { status: 500 }
    );
  }
}
