import { NextResponse } from "next/server";
import {
  analyzeHotelForIntegration,
  type AnalyzeHotelIntegrationPayload,
  type HotelIntegrationErrorResponse
} from "@/lib/hotel-integration";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

function getIntegrationApiKey(): string {
  return (
    process.env.N8N_HOTEL_API_KEY ??
    process.env.HOTEL_INTEGRATION_API_KEY ??
    ""
  );
}

function buildErrorResponse(
  status: number,
  requestId: string | null,
  code: HotelIntegrationErrorResponse["error"]["code"],
  message: string
) {
  return NextResponse.json<HotelIntegrationErrorResponse>(
    {
      requestId,
      status: "failed",
      error: {
        code,
        message
      }
    },
    { status }
  );
}

export async function POST(request: Request) {
  let payload: AnalyzeHotelIntegrationPayload | null = null;

  try {
    const configuredApiKey = getIntegrationApiKey();
    if (!configuredApiKey) {
      return buildErrorResponse(
        500,
        null,
        "SERVER_ERROR",
        "N8N_HOTEL_API_KEY não configurada."
      );
    }

    const providedApiKey = request.headers.get("x-api-key");
    if (providedApiKey !== configuredApiKey) {
      return buildErrorResponse(
        401,
        null,
        "UNAUTHORIZED",
        "Credenciais inválidas para a integração."
      );
    }

    try {
      payload = (await request.json()) as AnalyzeHotelIntegrationPayload;
    } catch {
      return buildErrorResponse(400, null, "INVALID_JSON", "Body JSON inválido.");
    }

    if (!payload?.url || typeof payload.url !== "string") {
      return buildErrorResponse(
        400,
        payload?.requestId ?? null,
        "INVALID_URL",
        "Informe uma URL válida para análise."
      );
    }

    const response = await analyzeHotelForIntegration(payload);
    return NextResponse.json(response, { status: 200 });
  } catch (error) {
    if (error instanceof Error && error.message === "INVALID_URL") {
      return buildErrorResponse(
        400,
        payload?.requestId ?? null,
        "INVALID_URL",
        "URL inválida ou bloqueada pela política de segurança."
      );
    }

    return buildErrorResponse(
      500,
      payload?.requestId ?? null,
      "SERVER_ERROR",
      error instanceof Error
        ? error.message
        : "Falha ao executar a análise de hotel."
    );
  }
}
