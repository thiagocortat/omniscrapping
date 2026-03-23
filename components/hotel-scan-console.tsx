"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import type { ChangeEvent, ReactNode } from "react";
import { StatusPill } from "@/components/status-pill";
import type { HotelScanItem, HotelScanJob } from "@/lib/hotel-types";

type InputMode = "single" | "batch" | "file";
type CsvDelimiter = "," | ";";
type DetailSection = "overview" | "booking" | "performance" | "seo" | "stack";

function splitByLine(value: string): string[] {
  return value
    .split(/\r?\n/g)
    .map((item) => item.trim())
    .filter(Boolean);
}

function parseCsvLine(line: string, delimiter: CsvDelimiter): string[] {
  if (!line.trim()) {
    return [];
  }

  const values: string[] = [];
  let current = "";
  let inQuotes = false;

  for (let i = 0; i < line.length; i += 1) {
    const char = line[i];

    if (char === "\"") {
      if (inQuotes && line[i + 1] === "\"") {
        current += "\"";
        i += 1;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }

    if (!inQuotes && char === delimiter) {
      values.push(current.trim());
      current = "";
      continue;
    }

    current += char;
  }

  values.push(current.trim());
  return values.map((value) => value.replace(/^"|"$/g, ""));
}

function detectDelimiter(firstRow: string): CsvDelimiter {
  const commas = (firstRow.match(/,/g) ?? []).length;
  const semicolons = (firstRow.match(/;/g) ?? []).length;
  return semicolons > commas ? ";" : ",";
}

function looksLikeUrl(value: string): boolean {
  return /^(https?:\/\/)?([a-z0-9-]+\.)+[a-z]{2,}(\/|$)/i.test(value.trim());
}

function isUrlColumnLabel(value: string): boolean {
  return /^(url|urls|domain|domains|dominio|dominios|website|site|link)$/i.test(
    value.trim()
  );
}

function parseCsv(content: string): {
  columns: string[];
  rows: string[][];
  suggestedColumnIndex: number;
} {
  const rows = content.split(/\r?\n/g).filter((row) => row.trim().length > 0);
  if (!rows.length) {
    return { columns: [], rows: [], suggestedColumnIndex: 0 };
  }

  const delimiter = detectDelimiter(rows[0]);
  const parsedRows = rows.map((row) => parseCsvLine(row, delimiter));
  const firstRow = parsedRows[0] ?? [];
  const secondRow = parsedRows[1] ?? [];

  const hasHeader =
    firstRow.some(isUrlColumnLabel) ||
    (!firstRow.some(looksLikeUrl) && secondRow.some(looksLikeUrl));

  const columns = hasHeader
    ? firstRow.map((value, index) => value || `Coluna ${index + 1}`)
    : firstRow.map((_, index) => `Coluna ${index + 1}`);

  const dataRows = hasHeader ? parsedRows.slice(1) : parsedRows;

  let suggestedColumnIndex = columns.findIndex(isUrlColumnLabel);
  if (suggestedColumnIndex === -1) {
    let bestScore = -1;
    for (let col = 0; col < columns.length; col += 1) {
      const sample = dataRows.slice(0, 30);
      const score = sample.filter((row) => looksLikeUrl(row[col] ?? "")).length;
      if (score > bestScore) {
        bestScore = score;
        suggestedColumnIndex = col;
      }
    }
  }

  return {
    columns,
    rows: dataRows,
    suggestedColumnIndex: Math.max(0, suggestedColumnIndex)
  };
}

function progressPercentage(job?: HotelScanJob | null): number {
  if (!job || job.total === 0) {
    return 0;
  }

  return Math.round(
    ((job.counts.completed + job.counts.failed) / job.total) * 100
  );
}

function scoreTone(score: number): string {
  if (score >= 80) {
    return "text-emerald-600";
  }
  if (score >= 55) {
    return "text-amber-500";
  }
  return "text-rose-500";
}

function scoreSurface(score: number): string {
  if (score >= 80) {
    return "border-emerald-200 bg-emerald-50";
  }
  if (score >= 55) {
    return "border-amber-200 bg-amber-50";
  }
  return "border-rose-200 bg-rose-50";
}

function humanizeMs(value: number | null): string {
  return value === null ? "-" : `${value} ms`;
}

function selectedResult(item?: HotelScanItem) {
  return item?.result;
}

function summarizeInput(mode: InputMode, count: number): string {
  if (mode === "single") {
    return "Valide um hotel com foco total na jornada de reserva.";
  }

  if (mode === "batch") {
    return count > 0
      ? `${count} URLs prontas para comparação no mesmo lote.`
      : "Cole uma URL por linha para comparar concorrentes ou portfólio.";
  }

  return count > 0
    ? `${count} URLs importadas. Revise a coluna antes de iniciar.`
    : "Importe uma planilha e deixe a ferramenta sugerir a melhor coluna.";
}

function bookingCoverage(items: { value: boolean }[]): string {
  const available = items.filter((entry) => entry.value).length;
  return `${available}/${items.length}`;
}

function detailSummaryLabel(section: DetailSection): string {
  switch (section) {
    case "booking":
      return "Fluxo de reserva";
    case "performance":
      return "Performance";
    case "seo":
      return "SEO";
    case "stack":
      return "Stack";
    default:
      return "Visão geral";
  }
}

export function HotelScanConsole() {
  const [inputMode, setInputMode] = useState<InputMode>("single");
  const [detailSection, setDetailSection] = useState<DetailSection>("overview");
  const [singleUrl, setSingleUrl] = useState("");
  const [urlsText, setUrlsText] = useState("");
  const [csvColumns, setCsvColumns] = useState<string[]>([]);
  const [csvRows, setCsvRows] = useState<string[][]>([]);
  const [selectedCsvColumnIndex, setSelectedCsvColumnIndex] = useState(0);
  const [job, setJob] = useState<HotelScanJob | null>(null);
  const [selectedItemId, setSelectedItemId] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const csvPreviewRows = useMemo(() => csvRows.slice(0, 5), [csvRows]);
  const fileUrls = useMemo(
    () =>
      csvRows
        .map((row) => (row[selectedCsvColumnIndex] ?? "").trim())
        .filter(Boolean)
        .filter((value) => !isUrlColumnLabel(value)),
    [csvRows, selectedCsvColumnIndex]
  );
  const inputCount = useMemo(() => {
    if (inputMode === "single") {
      return singleUrl.trim() ? 1 : 0;
    }

    if (inputMode === "batch") {
      return splitByLine(urlsText).length;
    }

    return fileUrls.length;
  }, [fileUrls.length, inputMode, singleUrl, urlsText]);

  const selectedItem = useMemo(() => {
    if (!job || !selectedItemId) {
      return undefined;
    }

    return job.items.find((item) => item.id === selectedItemId);
  }, [job, selectedItemId]);
  const result = selectedResult(selectedItem);
  const bookingFields = result
    ? [
        { label: "Hotel", value: result.booking.fields.hotelSelector },
        { label: "Check-in", value: result.booking.fields.checkIn },
        { label: "Check-out", value: result.booking.fields.checkOut },
        { label: "Hóspedes", value: result.booking.fields.guests },
        { label: "Crianças", value: result.booking.fields.children }
      ]
    : [];

  useEffect(() => {
    if (
      !job ||
      ["completed", "partial", "failed"].includes(job.status) ||
      (job.status === "aborted" && job.counts.running === 0)
    ) {
      return;
    }

    const poll = window.setInterval(async () => {
      try {
        const response = await fetch(`/api/hotel-scans/${job.id}?view=summary`);
        const data = await response.json();

        if (response.ok) {
          setJob(data.job);
          return;
        }

        setError(data.error ?? "Falha ao atualizar progresso do job.");
      } catch {
        setError("Falha temporária ao atualizar progresso do job.");
      }
    }, 2000);

    return () => window.clearInterval(poll);
  }, [job]);

  useEffect(() => {
    if (!job || job.items.length === 0) {
      setSelectedItemId(null);
      return;
    }

    const currentSelectionExists = selectedItemId
      ? job.items.some((item) => item.id === selectedItemId)
      : false;

    if (!currentSelectionExists) {
      setSelectedItemId(job.items[0]?.id ?? null);
    }
  }, [job, selectedItemId]);

  useEffect(() => {
    setDetailSection("overview");
  }, [selectedItemId]);

  async function handleFileUpload(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) {
      return;
    }

    if (!file.name.toLowerCase().endsWith(".csv")) {
      setCsvColumns([]);
      setCsvRows([]);
      setError("No momento, apenas upload CSV está habilitado.");
      return;
    }

    const content = await file.text();
    const parsed = parseCsv(content);
    if (!parsed.rows.length || !parsed.columns.length) {
      setCsvColumns([]);
      setCsvRows([]);
      setError("CSV vazio ou sem linhas válidas para leitura.");
      return;
    }

    setCsvColumns(parsed.columns);
    setCsvRows(parsed.rows);
    setSelectedCsvColumnIndex(parsed.suggestedColumnIndex);
    setError(null);
  }

  function collectUrls(): string[] {
    if (inputMode === "single") {
      return [singleUrl.trim()].filter(Boolean);
    }

    if (inputMode === "batch") {
      return splitByLine(urlsText);
    }

    return fileUrls;
  }

  async function startScan() {
    setIsSubmitting(true);
    setError(null);

    try {
      const urls = collectUrls();
      if (!urls.length) {
        setError("Adicione pelo menos uma URL antes de iniciar.");
        return;
      }

      const response = await fetch("/api/hotel-scans", {
        method: "POST",
        headers: {
          "content-type": "application/json"
        },
        body: JSON.stringify({ urls })
      });

      const data = await response.json();
      if (!response.ok) {
        setError(data.error ?? "Falha ao iniciar análise.");
        return;
      }

      setJob(data.job);
      setSelectedItemId(data.job.items[0]?.id ?? null);
    } catch {
      setError("Falha de rede ao iniciar análise.");
    } finally {
      setIsSubmitting(false);
    }
  }

  async function retryFailed() {
    if (!job) {
      return;
    }

    const response = await fetch(`/api/hotel-scans/${job.id}/retry`, {
      method: "POST"
    });
    const data = await response.json();
    if (response.ok) {
      setJob(data.job);
      setError(null);
      return;
    }

    setError(data.error ?? "Falha ao reprocessar itens.");
  }

  async function abortCurrentJob() {
    if (!job) {
      return;
    }

    const response = await fetch(`/api/hotel-scans/${job.id}/abort`, {
      method: "POST"
    });
    const data = await response.json();

    if (response.ok) {
      setJob(data.job);
      setError(null);
      return;
    }

    setError(data.error ?? "Falha ao abortar job.");
  }

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-[1500px] flex-col gap-5 px-4 pb-10 pt-4 md:px-8">
      <section className="anim-rise relative overflow-hidden rounded-[2rem] border border-[#203246] bg-[#08131e] text-slate-50 shadow-[0_32px_90px_rgba(8,19,30,0.28)]">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(244,121,32,0.18),transparent_30%),radial-gradient(circle_at_78%_18%,rgba(114,180,255,0.12),transparent_24%),linear-gradient(180deg,rgba(255,255,255,0.02),transparent)]" />
        <div className="relative flex flex-col gap-6 px-5 py-5 md:px-7">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div className="min-w-0">
              <p className="font-mono text-[11px] uppercase tracking-[0.34em] text-[#f5cba8]">
                Hotel Intelligence Console
              </p>
              <h1 className="mt-3 max-w-4xl text-3xl font-bold leading-[0.98] md:text-[3.3rem]">
                Diagnóstico operacional de sites hoteleiros
              </h1>
              <p className="mt-3 max-w-3xl text-sm text-slate-300 md:text-base">
                Configure o lote na esquerda, acompanhe o job no centro e aprofunde o hotel
                selecionado no workspace da direita.
              </p>
            </div>

            <div className="flex flex-wrap gap-3">
              <TopMiniCard label="Entrada" value={inputCount > 0 ? `${inputCount} URLs` : "Sem lote"} />
              <TopMiniCard
                label="Foco"
                value={result ? detailSummaryLabel(detailSection) : "Setup"}
              />
              <Link
                href="/"
                className="inline-flex items-center rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm font-semibold text-white transition hover:bg-white/10"
              >
                Scanner geral
              </Link>
            </div>
          </div>
        </div>
      </section>

      <section className="anim-rise grid gap-5 xl:grid-cols-[360px_minmax(0,1fr)]">
        <aside className="space-y-5 xl:sticky xl:top-5 xl:self-start">
          <section className="rounded-[2rem] border border-[#d8d1c6] bg-[#fcfaf6] p-5 shadow-[0_12px_40px_rgba(19,36,51,0.08)]">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.26em] text-muted">
                  Missão
                </p>
                <h2 className="mt-2 text-2xl font-bold text-ink">Montar lote</h2>
                <p className="mt-1 text-sm text-muted">
                  Primeiro passo da operação. Sem distração, sem blocos explicativos extras.
                </p>
              </div>
              <div className="rounded-[1.25rem] border border-ink/10 bg-white px-3 py-2 text-right">
                <p className="text-[11px] uppercase tracking-[0.22em] text-muted">Pronto</p>
                <p className="mt-1 text-2xl font-bold text-ink">{inputCount}</p>
              </div>
            </div>

            <div className="mt-5 grid grid-cols-3 gap-2 rounded-2xl bg-[#efe8dc] p-1">
              {(["single", "batch", "file"] as InputMode[]).map((option) => (
                <button
                  key={option}
                  type="button"
                  className={`rounded-xl px-2 py-2.5 text-sm font-semibold transition ${
                    inputMode === option
                      ? "bg-[#08131e] text-white shadow-[0_10px_20px_rgba(8,19,30,0.18)]"
                      : "text-ink hover:bg-white"
                  }`}
                  onClick={() => setInputMode(option)}
                >
                  {option === "single" ? "URL" : option === "batch" ? "Lista" : "CSV"}
                </button>
              ))}
            </div>

            <div className="mt-4 rounded-[1.5rem] border border-ink/10 bg-white p-4">
              <p className="text-[11px] font-semibold uppercase tracking-[0.26em] text-muted">
                Modo ativo
              </p>
              <p className="mt-2 text-lg font-bold text-ink">
                {inputMode === "single"
                  ? "Auditoria unitária"
                  : inputMode === "batch"
                    ? "Comparação em lote"
                    : "Importação de base"}
              </p>
              <p className="mt-2 text-sm text-muted">
                {summarizeInput(inputMode, inputCount)}
              </p>
            </div>

            <div className="mt-4 space-y-3">
              {inputMode === "single" && (
                <label className="block text-sm">
                  <span className="mb-1.5 block font-semibold text-ink">Website do hotel</span>
                  <input
                    value={singleUrl}
                    onChange={(event) => setSingleUrl(event.target.value)}
                    placeholder="https://hotel-exemplo.com.br"
                    className="w-full rounded-2xl border border-ink/15 bg-white px-4 py-3 outline-none ring-accent transition focus:ring-2"
                  />
                </label>
              )}

              {inputMode === "batch" && (
                <label className="block text-sm">
                  <span className="mb-1.5 block font-semibold text-ink">Uma URL por linha</span>
                  <textarea
                    value={urlsText}
                    onChange={(event) => setUrlsText(event.target.value)}
                    rows={9}
                    placeholder={"hotel1.com.br\nhotel2.com.br\nhotel3.com.br"}
                    className="w-full rounded-2xl border border-ink/15 bg-white px-4 py-3 outline-none ring-accent transition focus:ring-2"
                  />
                </label>
              )}

              {inputMode === "file" && (
                <div className="rounded-[1.5rem] border border-dashed border-ink/20 bg-white p-4">
                  <label className="block text-sm font-semibold text-ink">Upload CSV</label>
                  <input
                    type="file"
                    accept=".csv"
                    onChange={handleFileUpload}
                    className="mt-3 block w-full text-sm file:mr-3 file:rounded-xl file:border-0 file:bg-[#08131e] file:px-4 file:py-2.5 file:text-white"
                  />

                  {csvColumns.length > 0 && (
                    <label className="mt-4 block text-sm">
                      <span className="mb-1.5 block font-semibold text-ink">Coluna com URL</span>
                      <select
                        value={selectedCsvColumnIndex}
                        onChange={(event) =>
                          setSelectedCsvColumnIndex(Number(event.target.value))
                        }
                        className="w-full rounded-2xl border border-ink/15 bg-white px-4 py-3 outline-none ring-accent transition focus:ring-2"
                      >
                        {csvColumns.map((column, index) => (
                          <option key={`${column}-${index}`} value={index}>
                            {column}
                          </option>
                        ))}
                      </select>
                    </label>
                  )}

                  <div className="mt-4 grid gap-3 sm:grid-cols-2">
                    <MiniMetric label="URLs válidas" value={String(fileUrls.length)} />
                    <MiniMetric
                      label="Coluna ativa"
                      value={csvColumns[selectedCsvColumnIndex] ?? "Coluna 1"}
                    />
                  </div>

                  {csvPreviewRows.length > 0 && (
                    <div className="mt-4 overflow-x-auto rounded-2xl border border-ink/10 bg-[#fcfaf6]">
                      <table className="min-w-full text-left text-xs">
                        <thead className="bg-[#f1ece3] text-muted">
                          <tr>
                            {csvColumns.map((column, index) => (
                              <th
                                key={`${column}-${index}`}
                                className={`px-3 py-2 ${
                                  selectedCsvColumnIndex === index
                                    ? "bg-[#ffdcbf] text-ink"
                                    : ""
                                }`}
                              >
                                {column}
                              </th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {csvPreviewRows.map((row, rowIndex) => (
                            <tr key={`row-${rowIndex}`} className="border-t border-ink/10">
                              {csvColumns.map((_, colIndex) => (
                                <td
                                  key={`cell-${rowIndex}-${colIndex}`}
                                  className={`max-w-[160px] truncate px-3 py-2 ${
                                    selectedCsvColumnIndex === colIndex
                                      ? "bg-[#fff0e0] font-medium text-ink"
                                      : "text-muted"
                                  }`}
                                >
                                  {row[colIndex] ?? "-"}
                                </td>
                              ))}
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              )}
            </div>

            {error && (
              <div className="mt-4 rounded-[1.5rem] border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
                {error}
              </div>
            )}

            <button
              type="button"
              onClick={startScan}
              disabled={isSubmitting}
              className="mt-5 w-full rounded-2xl bg-[#ff7a1a] px-4 py-3.5 text-sm font-bold uppercase tracking-[0.24em] text-white transition hover:brightness-95 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {isSubmitting ? "Iniciando..." : "Rodar diagnóstico"}
            </button>
          </section>

          <section className="rounded-[2rem] border border-[#d8d1c6] bg-[#131f2c] p-5 text-slate-50">
            <p className="text-xs font-semibold uppercase tracking-[0.26em] text-[#c8d3de]">
              Leitura da tela
            </p>
            <div className="mt-4 space-y-4 text-sm text-slate-300">
              <p>
                O job aparece como uma linha de comando visual no topo do workspace. A lista de
                hotéis fica sempre visível.
              </p>
              <p>
                O diagnóstico detalhado usa seções alternáveis. O usuário aprofunda só o assunto
                que precisa, sem consumir a página inteira de uma vez.
              </p>
            </div>
          </section>
        </aside>

        <div className="space-y-5">
          <section className="rounded-[2rem] border border-[#d8d1c6] bg-[#fcfaf6] p-4 shadow-[0_12px_40px_rgba(19,36,51,0.07)] md:p-5">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
              <div className="min-w-0">
                <p className="text-xs font-semibold uppercase tracking-[0.26em] text-muted">
                  Workspace
                </p>
                <h2 className="mt-2 text-2xl font-bold text-ink">Monitor do job</h2>
                <p className="mt-1 text-sm text-muted">
                  Estado do lote, comparação rápida entre hotéis e aprofundamento do item atual.
                </p>
              </div>

              {job ? (
                <div className="flex flex-wrap gap-2">
                  <StatusPill status={job.status} />
                  <button
                    type="button"
                    onClick={retryFailed}
                    disabled={job.counts.failed === 0 || ["running", "queued"].includes(job.status)}
                    className="rounded-xl border border-ink/10 bg-white px-3 py-2 text-sm font-semibold text-ink transition hover:bg-slate-50 disabled:opacity-40"
                  >
                    Reprocessar
                  </button>
                  <a
                    href={`/api/hotel-scans/${job.id}/export?format=csv`}
                    className="rounded-xl border border-ink/10 bg-white px-3 py-2 text-sm font-semibold text-ink transition hover:bg-slate-50"
                  >
                    Exportar CSV
                  </a>
                  <button
                    type="button"
                    onClick={abortCurrentJob}
                    disabled={!["queued", "running"].includes(job.status)}
                    className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm font-semibold text-rose-700 transition hover:bg-rose-100 disabled:opacity-40"
                  >
                    Abortar
                  </button>
                </div>
              ) : (
                <div className="rounded-2xl border border-dashed border-ink/15 px-4 py-3 text-sm text-muted">
                  aguardando início
                </div>
              )}
            </div>

            <div className="mt-5 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
              <WorkspaceMetric label="Lote" value={String(job?.total ?? 0)} />
              <WorkspaceMetric label="Concluídos" value={String(job?.counts.completed ?? 0)} />
              <WorkspaceMetric label="Falhas" value={String(job?.counts.failed ?? 0)} />
              <WorkspaceMetric
                label="Progresso"
                value={`${progressPercentage(job)}%`}
                accent
              />
            </div>

            <div className="mt-4 overflow-hidden rounded-full bg-[#e5ded3]">
              <div
                className="h-3 rounded-full bg-[linear-gradient(90deg,#ff7a1a_0%,#ff9f52_50%,#ffd0a5_100%)] transition-all"
                style={{ width: `${progressPercentage(job)}%` }}
              />
            </div>
          </section>

          {!job && (
            <section className="rounded-[2rem] border border-[#d8d1c6] bg-[#08131e] p-8 text-slate-50 shadow-[0_24px_60px_rgba(8,19,30,0.16)]">
              <div className="grid gap-8 xl:grid-cols-[minmax(0,1.1fr)_340px]">
                <div>
                  <p className="font-mono text-[11px] uppercase tracking-[0.34em] text-[#f5cba8]">
                    Estado vazio
                  </p>
                  <h3 className="mt-3 text-3xl font-bold leading-tight">
                    A análise começa na coluna da esquerda
                  </h3>
                  <p className="mt-3 max-w-2xl text-sm text-slate-300 md:text-base">
                    Esta área só recebe conteúdo quando existe um lote rodando. A partir daí ela
                    vira um workspace comparativo: fila de hotéis, score destacado e navegação por
                    seções do diagnóstico.
                  </p>

                  <div className="mt-6 grid gap-3 md:grid-cols-3">
                    <FlowStep step="01" title="Inserir URLs" text="URL única, lista ou CSV." />
                    <FlowStep step="02" title="Executar job" text="Monitorar fila e progresso." />
                    <FlowStep step="03" title="Abrir hotel" text="Ler cada diagnóstico em contexto." />
                  </div>
                </div>

                <div className="rounded-[1.8rem] border border-white/10 bg-white/5 p-5">
                  <p className="text-xs uppercase tracking-[0.26em] text-[#c8d3de]">
                    O que muda quando o job começar
                  </p>
                  <ul className="mt-4 space-y-3 text-sm text-slate-300">
                    <li>Uma lista de hotéis aparece para comparação imediata.</li>
                    <li>O hotel selecionado abre com visão geral e seções temáticas.</li>
                    <li>O estado do lote permanece visível o tempo todo.</li>
                  </ul>
                </div>
              </div>
            </section>
          )}

          {job && (
            <section className="grid gap-5 2xl:grid-cols-[320px_minmax(0,1fr)]">
              <section className="rounded-[2rem] border border-[#d8d1c6] bg-[#fffdf9]">
                <div className="border-b border-ink/10 px-4 py-4">
                  <p className="text-xs font-semibold uppercase tracking-[0.26em] text-muted">
                    Fila de hotéis
                  </p>
                  <h3 className="mt-2 text-lg font-bold text-ink">Selecione um site</h3>
                </div>

                <div className="max-h-[980px] overflow-y-auto">
                  {job.items.map((item, index) => {
                    const isSelected = selectedItemId === item.id;
                    const overallScore = item.result?.summary.overallScore;

                    return (
                      <button
                        key={item.id}
                        type="button"
                        onClick={() => setSelectedItemId(item.id)}
                        className={`w-full border-b border-ink/10 px-4 py-4 text-left transition last:border-b-0 ${
                          isSelected ? "bg-[#fff1e5]" : "hover:bg-[#fcfaf6]"
                        }`}
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <p className="text-[11px] uppercase tracking-[0.24em] text-muted">
                              Item {index + 1}
                            </p>
                            <p className="mt-2 truncate text-sm font-semibold text-ink">
                              {item.normalizedUrl}
                            </p>
                          </div>
                          <StatusPill status={item.status} />
                        </div>

                        <div className="mt-3 flex items-center gap-2">
                          <span
                            className={`rounded-full border px-2.5 py-1 text-xs font-semibold ${
                              overallScore !== undefined
                                ? scoreSurface(overallScore)
                                : "border-slate-200 bg-slate-100 text-slate-600"
                            }`}
                          >
                            Score {overallScore ?? "-"}
                          </span>
                          <span className="truncate text-xs text-muted">
                            {item.result?.booking.bookingEngine ?? "motor não identificado"}
                          </span>
                        </div>
                      </button>
                    );
                  })}
                </div>
              </section>

              <section className="rounded-[2rem] border border-[#d8d1c6] bg-[#fffdf9] p-4 md:p-5">
                {!selectedItem && (
                  <div className="rounded-[1.5rem] border border-dashed border-ink/15 bg-white p-8 text-center text-sm text-muted">
                    Selecione um hotel para abrir o diagnóstico.
                  </div>
                )}

                {selectedItem && (
                  <div className="space-y-5">
                    <div className="rounded-[1.8rem] bg-[#08131e] p-5 text-slate-50">
                      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                        <div className="min-w-0">
                          <p className="text-xs font-semibold uppercase tracking-[0.26em] text-[#f5cba8]">
                            Hotel selecionado
                          </p>
                          <h3 className="mt-2 break-all text-2xl font-bold">
                            {selectedItem.normalizedUrl}
                          </h3>
                          <p className="mt-2 text-sm text-slate-300">
                            Navegue por uma visão de cada vez. O objetivo aqui é leitura acionável,
                            não um dump de métricas.
                          </p>
                        </div>
                        <StatusPill status={selectedItem.status} />
                      </div>

                      {result && (
                        <div className="mt-5 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                          <ScoreTile
                            label="Score geral"
                            value={String(result.summary.overallScore)}
                            score={result.summary.overallScore}
                          />
                          <ScoreTile
                            label="Performance"
                            value={String(result.performance.score)}
                            score={result.performance.score}
                          />
                          <ScoreTile
                            label="SEO"
                            value={String(result.seo.score)}
                            score={result.seo.score}
                          />
                          <ScoreTile
                            label="Cobertura reserva"
                            value={bookingCoverage(bookingFields)}
                            subtitle={result.booking.bookingEngine ?? result.booking.status}
                          />
                        </div>
                      )}
                    </div>

                    {!result && (
                      <div className="rounded-[1.5rem] border border-dashed border-ink/15 bg-white p-6 text-sm text-muted">
                        Este item ainda não terminou. Quando houver resultado, o workspace será
                        preenchido automaticamente.
                      </div>
                    )}

                    {result && (
                      <>
                        <div className="grid gap-2 rounded-[1.5rem] border border-ink/10 bg-[#f6f1e8] p-2 md:grid-cols-5">
                          {(
                            [
                              ["overview", "Visão geral"],
                              ["booking", "Reserva"],
                              ["performance", "Performance"],
                              ["seo", "SEO"],
                              ["stack", "Stack"]
                            ] as Array<[DetailSection, string]>
                          ).map(([section, label]) => (
                            <button
                              key={section}
                              type="button"
                              onClick={() => setDetailSection(section)}
                              className={`rounded-[1.1rem] px-3 py-3 text-sm font-semibold transition ${
                                detailSection === section
                                  ? "bg-[#08131e] text-white shadow-[0_10px_24px_rgba(8,19,30,0.14)]"
                                  : "text-ink hover:bg-white"
                              }`}
                            >
                              {label}
                            </button>
                          ))}
                        </div>

                        {detailSection === "overview" && (
                          <div className="grid gap-4 xl:grid-cols-[minmax(0,1.1fr)_minmax(0,0.9fr)]">
                            <Panel
                              eyebrow="Síntese"
                              title="Resumo executivo do hotel"
                              description="Leitura rápida para decidir se vale aprofundar ou agir."
                            >
                              <div className="grid gap-3 md:grid-cols-2">
                                <MiniMetric
                                  label="Motor detectado"
                                  value={result.booking.bookingEngine ?? "Não identificado"}
                                />
                                <MiniMetric label="Reserva" value={result.booking.status} />
                                <MiniMetric
                                  label="Páginas visitadas"
                                  value={String(result.pagesVisited.length)}
                                />
                                <MiniMetric
                                  label="Tecnologias"
                                  value={String(result.technologies.length)}
                                />
                              </div>

                              <SignalList
                                title="Sinais principais"
                                items={[
                                  ...result.performance.notes.slice(0, 2),
                                  ...result.seo.issues.slice(0, 2),
                                  ...result.booking.warnings.slice(0, 2)
                                ]}
                                emptyLabel="Sem alertas críticos combinados na leitura inicial."
                              />
                            </Panel>

                            <Panel
                              eyebrow="Cobertura"
                              title="Campos críticos da reserva"
                              description="Verificação direta do que existe ou não no fluxo."
                            >
                              <div className="grid gap-2 sm:grid-cols-2">
                                {bookingFields.map((field) => (
                                  <span
                                    key={field.label}
                                    className={`rounded-2xl px-3 py-3 text-sm font-semibold ${
                                      field.value
                                        ? "bg-emerald-100 text-emerald-800"
                                        : "bg-slate-100 text-slate-600"
                                    }`}
                                  >
                                    {field.label}: {field.value ? "sim" : "não"}
                                  </span>
                                ))}
                              </div>
                            </Panel>
                          </div>
                        )}

                        {detailSection === "booking" && (
                          <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
                            <Panel
                              eyebrow="Reserva"
                              title="Jornada até o motor"
                              description="Onde o usuário entrou, como a navegação reagiu e em que estado terminou."
                            >
                              <div className="grid gap-3 md:grid-cols-2">
                                <MiniMetric label="Status" value={result.booking.status} />
                                <MiniMetric
                                  label="Motor"
                                  value={result.booking.bookingEngine ?? "Não identificado"}
                                />
                                <MiniMetric
                                  label="URL final"
                                  value={result.booking.finalUrl ?? "Não encontrada"}
                                />
                                <MiniMetric
                                  label="Entradas"
                                  value={String(result.booking.reserveEntryPoints.length)}
                                />
                              </div>

                              <SignalList
                                title="Ações executadas"
                                items={result.booking.actions}
                                emptyLabel="Nenhuma ação registrada."
                              />
                            </Panel>

                            <Panel
                              eyebrow="Evidências"
                              title="Provas coletadas durante a tentativa"
                              description="Evidências positivas e alertas do fluxo."
                            >
                              <SignalList
                                title="Evidências"
                                items={result.booking.evidence}
                                emptyLabel="Nenhuma evidência adicional registrada."
                              />

                              <SignalList
                                title="Alertas"
                                items={result.booking.warnings}
                                emptyLabel="Nenhum alerta do fluxo de reserva."
                                tone="danger"
                              />
                            </Panel>
                          </div>
                        )}

                        {detailSection === "performance" && (
                          <Panel
                            eyebrow="Performance"
                            title="Métricas de carregamento"
                            description="Indicadores técnicos e observações sobre experiência inicial."
                          >
                            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                              <MiniMetric
                                label="TTFB"
                                value={humanizeMs(result.performance.timeToFirstByteMs)}
                              />
                              <MiniMetric
                                label="FCP"
                                value={humanizeMs(result.performance.firstContentfulPaintMs)}
                              />
                              <MiniMetric
                                label="DOMContentLoaded"
                                value={humanizeMs(result.performance.domContentLoadedMs)}
                              />
                              <MiniMetric
                                label="Load"
                                value={humanizeMs(result.performance.loadMs)}
                              />
                              <MiniMetric
                                label="Requests"
                                value={String(result.performance.requestCount)}
                              />
                              <MiniMetric
                                label="Transferência"
                                value={
                                  result.performance.transferSizeKb === null
                                    ? "-"
                                    : `${result.performance.transferSizeKb} KB`
                                }
                              />
                            </div>

                            <SignalList
                              title="Observações"
                              items={result.performance.notes}
                              emptyLabel="Nenhum alerta crítico de performance na navegação inicial."
                            />
                          </Panel>
                        )}

                        {detailSection === "seo" && (
                          <Panel
                            eyebrow="SEO"
                            title="Estrutura semântica e cobertura básica"
                            description="Campos críticos da home para leitura orgânica e compartilhamento."
                          >
                            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                              <MiniMetric
                                label="Title"
                                value={`${result.seo.titleLength} chars`}
                              />
                              <MiniMetric
                                label="Description"
                                value={`${result.seo.metaDescriptionLength} chars`}
                              />
                              <MiniMetric label="H1" value={String(result.seo.h1Count)} />
                              <MiniMetric
                                label="Canonical"
                                value={result.seo.hasCanonical ? "sim" : "não"}
                              />
                              <MiniMetric
                                label="Viewport"
                                value={result.seo.hasViewport ? "sim" : "não"}
                              />
                              <MiniMetric
                                label="Alt em imagens"
                                value={`${result.seo.imagesWithAlt}/${result.seo.imageCount}`}
                              />
                            </div>

                            <SignalList
                              title="Issues"
                              items={result.seo.issues}
                              emptyLabel="Checklist base de SEO atendido na home."
                            />
                          </Panel>
                        )}

                        {detailSection === "stack" && (
                          <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
                            <Panel
                              eyebrow="Stack"
                              title="Ferramentas comerciais detectadas"
                              description="Sinais de operação de mídia, CRM e mensuração."
                            >
                              <div className="grid gap-3 md:grid-cols-2">
                                <MiniMetric
                                  label="Ads"
                                  value={result.summary.adsTags.join(", ") || "Não encontrado"}
                                />
                                <MiniMetric
                                  label="CRM"
                                  value={result.summary.crmTools.join(", ") || "Não encontrado"}
                                />
                                <MiniMetric
                                  label="Analytics"
                                  value={
                                    result.summary.analyticsTools.join(", ") ||
                                    "Não encontrado"
                                  }
                                />
                                <MiniMetric
                                  label="Tag manager"
                                  value={
                                    result.summary.tagManagers.join(", ") ||
                                    "Não encontrado"
                                  }
                                />
                              </div>
                            </Panel>

                            <Panel
                              eyebrow="Tecnologias"
                              title="Tags e frameworks encontrados"
                              description="Lista resumida das tecnologias identificadas."
                            >
                              <div className="flex flex-wrap gap-2">
                                {result.technologies.length > 0 ? (
                                  result.technologies.map((finding) => (
                                    <span
                                      key={`${finding.category}-${finding.name}`}
                                      className="rounded-full border border-[#ffd6b2] bg-[#fff1e4] px-3 py-1.5 text-xs font-semibold text-ink"
                                    >
                                      {finding.name}
                                    </span>
                                  ))
                                ) : (
                                  <span className="text-sm text-muted">
                                    Nenhuma tecnologia específica destacada.
                                  </span>
                                )}
                              </div>
                            </Panel>
                          </div>
                        )}

                        <Panel
                          eyebrow="Navegação"
                          title="Páginas visitadas"
                          description="Rastro das URLs percorridas durante a análise."
                        >
                          <div className="flex flex-col gap-2 text-sm text-muted">
                            {result.pagesVisited.length > 0 ? (
                              result.pagesVisited.map((pageUrl) => (
                                <span
                                  key={pageUrl}
                                  className="rounded-2xl bg-[#f6f1e8] px-3 py-3 break-all text-ink"
                                >
                                  {pageUrl}
                                </span>
                              ))
                            ) : (
                              <span>Nenhuma página visitada foi registrada.</span>
                            )}
                          </div>
                        </Panel>
                      </>
                    )}
                  </div>
                )}
              </section>
            </section>
          )}
        </div>
      </section>
    </main>
  );
}

function TopMiniCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3">
      <p className="text-[11px] uppercase tracking-[0.26em] text-slate-400">{label}</p>
      <p className="mt-1 text-sm font-semibold text-white">{value}</p>
    </div>
  );
}

function WorkspaceMetric({
  label,
  value,
  accent = false
}: {
  label: string;
  value: string;
  accent?: boolean;
}) {
  return (
    <div
      className={`rounded-[1.5rem] border p-4 ${
        accent
          ? "border-[#ffcc9a] bg-[linear-gradient(180deg,#fff9f1_0%,#fff3e6_100%)]"
          : "border-ink/10 bg-white"
      }`}
    >
      <p className="text-[11px] uppercase tracking-[0.26em] text-muted">{label}</p>
      <p className="mt-2 text-3xl font-bold text-ink">{value}</p>
    </div>
  );
}

function ScoreTile({
  label,
  value,
  subtitle,
  score
}: {
  label: string;
  value: string;
  subtitle?: string;
  score?: number;
}) {
  return (
    <div className="rounded-[1.45rem] border border-white/10 bg-white/5 p-4 backdrop-blur">
      <p className="text-[11px] uppercase tracking-[0.26em] text-slate-400">{label}</p>
      <p className={`mt-2 text-3xl font-bold ${score !== undefined ? scoreTone(score) : "text-white"}`}>
        {value}
      </p>
      {subtitle && <p className="mt-1 text-sm text-slate-300">{subtitle}</p>}
    </div>
  );
}

function FlowStep({
  step,
  title,
  text
}: {
  step: string;
  title: string;
  text: string;
}) {
  return (
    <div className="rounded-[1.5rem] border border-white/10 bg-white/5 p-4">
      <p className="font-mono text-[11px] uppercase tracking-[0.3em] text-[#f5cba8]">{step}</p>
      <p className="mt-2 text-lg font-bold text-white">{title}</p>
      <p className="mt-2 text-sm text-slate-300">{text}</p>
    </div>
  );
}

function MiniMetric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-[1.25rem] border border-ink/10 bg-white p-3">
      <p className="text-[11px] uppercase tracking-[0.24em] text-muted">{label}</p>
      <p className="mt-1 break-words text-sm font-semibold text-ink">{value}</p>
    </div>
  );
}

function Panel({
  eyebrow,
  title,
  description,
  children
}: {
  eyebrow: string;
  title: string;
  description: string;
  children: ReactNode;
}) {
  return (
    <section className="rounded-[1.8rem] border border-ink/10 bg-white p-4 md:p-5">
      <p className="text-[11px] font-semibold uppercase tracking-[0.26em] text-muted">
        {eyebrow}
      </p>
      <h4 className="mt-2 text-xl font-bold text-ink">{title}</h4>
      <p className="mt-1 text-sm text-muted">{description}</p>
      <div className="mt-4">{children}</div>
    </section>
  );
}

function SignalList({
  title,
  items,
  emptyLabel,
  tone = "neutral"
}: {
  title: string;
  items: string[];
  emptyLabel: string;
  tone?: "neutral" | "danger";
}) {
  const cardClass =
    tone === "danger"
      ? "border-rose-200 bg-rose-50 text-rose-700"
      : "border-ink/10 bg-[#f6f1e8] text-ink";

  return (
    <div className="mt-4">
      <p className="text-[11px] font-semibold uppercase tracking-[0.26em] text-muted">{title}</p>

      {items.length === 0 ? (
        <p className="mt-3 text-sm text-muted">{emptyLabel}</p>
      ) : (
        <ul className="mt-3 space-y-2 text-sm">
          {items.map((item) => (
            <li key={item} className={`rounded-2xl border px-3 py-3 ${cardClass}`}>
              {item}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
