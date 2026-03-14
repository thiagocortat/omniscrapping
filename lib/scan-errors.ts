import type { ScanItem } from "@/lib/types";

function compactMessage(message: string): string {
  const withoutCallLog = message.split(/\bCall log:\s*/i)[0] ?? message;
  const firstLine = withoutCallLog.split("\n").map((line) => line.trim()).find(Boolean) ?? "";

  return firstLine
    .replace(/^Falha transit[oó]ria\.\s*Reagendado\s*\([^)]*\):\s*/i, "")
    .replace(/^page\.goto:\s*/i, "")
    .replace(/^Error:\s*/i, "")
    .replace(/^net::/i, "")
    .trim();
}

export function mapScanErrorToFriendly(errorMessage: string): string {
  const compact = compactMessage(errorMessage);
  const normalized = compact.toUpperCase();

  if (!compact) {
    return "Falha durante o scraping.";
  }

  if (normalized.includes("ERR_NAME_NOT_RESOLVED")) {
    return "Dominio nao resolvido (DNS). Verifique se a URL existe e esta correta.";
  }
  if (normalized.includes("ERR_CONNECTION_TIMED_OUT") || normalized.includes("ETIMEDOUT")) {
    return "Tempo limite de conexao excedido ao tentar acessar o site.";
  }
  if (normalized.includes("ERR_CONNECTION_REFUSED")) {
    return "Conexao recusada pelo servidor.";
  }
  if (normalized.includes("ERR_CERT") || normalized.includes("CERTIFICATE")) {
    return "Erro de certificado HTTPS ao acessar o site.";
  }
  if (normalized.includes("ERR_TOO_MANY_REDIRECTS")) {
    return "Redirecionamentos excessivos detectados no site.";
  }
  if (normalized.includes("ERR_ABORTED")) {
    return "Navegacao interrompida antes da leitura da pagina.";
  }
  if (/\bHTTP\s+(429|5\d\d)\b/i.test(compact)) {
    return "Site indisponivel ou limitando acesso no momento (HTTP 429/5xx).";
  }
  if (compact.toLowerCase().includes("abort")) {
    return "Processamento interrompido antes de concluir a analise.";
  }

  return compact;
}

export function getFriendlyScanItemError(item: ScanItem): string {
  const rawError = item.error ?? item.result?.error ?? "";
  return rawError ? mapScanErrorToFriendly(rawError) : "";
}
