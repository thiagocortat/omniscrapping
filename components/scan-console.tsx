"use client";

import { useEffect, useMemo, useState } from "react";
import type { ChangeEvent } from "react";
import type { AnalysisMode, ScanItem, ScanJob } from "@/lib/types";
import { StatusPill } from "@/components/status-pill";

type InputMode = "single" | "batch" | "file";
type CsvDelimiter = "," | ";";

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
  if (suggestedColumnIndex < 0) {
    suggestedColumnIndex = 0;
  }

  return {
    columns,
    rows: dataRows,
    suggestedColumnIndex
  };
}

function progressPercentage(job?: ScanJob): number {
  if (!job || job.total === 0) {
    return 0;
  }
  return Math.round(((job.counts.completed + job.counts.failed) / job.total) * 100);
}

export function ScanConsole() {
  const [inputMode, setInputMode] = useState<InputMode>("single");
  const [singleUrl, setSingleUrl] = useState("");
  const [urlsText, setUrlsText] = useState("");
  const [fileUrls, setFileUrls] = useState<string[]>([]);
  const [csvColumns, setCsvColumns] = useState<string[]>([]);
  const [csvRows, setCsvRows] = useState<string[][]>([]);
  const [selectedCsvColumnIndex, setSelectedCsvColumnIndex] = useState(0);
  const [mode, setMode] = useState<AnalysisMode>("all");
  const [targetsText, setTargetsText] = useState("RD Station");
  const [job, setJob] = useState<ScanJob | null>(null);
  const [selectedItemId, setSelectedItemId] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const selectedItem = useMemo<ScanItem | undefined>(() => {
    if (!job || !selectedItemId) {
      return undefined;
    }
    return job.items.find((item) => item.id === selectedItemId);
  }, [job, selectedItemId]);

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
        const response = await fetch(`/api/scans/${job.id}?view=summary`);
        const data = await response.json();

        if (response.ok) {
          setJob(data.job);
          return;
        }

        if (response.status === 404) {
          setError(
            "Job não encontrado neste nó de execução. Em produção, use armazenamento persistente (Redis/Postgres) para filas grandes."
          );
          return;
        }

        setError(data.error ?? "Falha ao atualizar progresso do job.");
      } catch {
        setError("Falha temporária ao atualizar progresso do job.");
      }
    }, 1500);

    return () => window.clearInterval(poll);
  }, [job]);

  const targets = useMemo(() => splitByLine(targetsText), [targetsText]);
  const csvPreviewRows = useMemo(() => csvRows.slice(0, 5), [csvRows]);

  useEffect(() => {
    if (!csvRows.length) {
      setFileUrls([]);
      return;
    }

    const extracted = csvRows
      .map((row) => (row[selectedCsvColumnIndex] ?? "").trim())
      .filter(Boolean)
      .filter((value) => !isUrlColumnLabel(value));

    setFileUrls(extracted);
  }, [csvRows, selectedCsvColumnIndex]);

  async function handleFileUpload(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) {
      return;
    }

    if (!file.name.toLowerCase().endsWith(".csv")) {
      setCsvColumns([]);
      setCsvRows([]);
      setFileUrls([]);
      setError("No MVP atual, apenas upload CSV está habilitado.");
      return;
    }

    const content = await file.text();
    const parsed = parseCsv(content);
    if (!parsed.rows.length || !parsed.columns.length) {
      setCsvColumns([]);
      setCsvRows([]);
      setFileUrls([]);
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

      const payload = {
        urls,
        mode,
        targets: mode === "specific" ? targets : []
      };

      const response = await fetch("/api/scans", {
        method: "POST",
        headers: {
          "content-type": "application/json"
        },
        body: JSON.stringify(payload)
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

    const response = await fetch(`/api/scans/${job.id}/retry`, {
      method: "POST"
    });
    const data = await response.json();

    if (response.ok) {
      setJob(data.job);
    }
  }

  async function abortCurrentJob() {
    if (!job) {
      return;
    }

    const response = await fetch(`/api/scans/${job.id}/abort`, {
      method: "POST"
    });
    const data = await response.json();

    if (response.ok) {
      setJob(data.job);
      return;
    }

    setError(data.error ?? "Falha ao abortar job.");
  }

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-7xl flex-col gap-6 px-4 pb-12 pt-8 md:px-8">
      <section className="anim-rise relative overflow-hidden rounded-3xl bg-panel px-6 py-8 text-slate-50 shadow-pulse md:px-10">
        <div className="absolute -right-16 -top-14 h-52 w-52 rounded-full bg-accent/20 blur-3xl" />
        <div className="absolute bottom-0 left-0 h-1 w-full bg-gradient-to-r from-transparent via-accent to-transparent" />
        <p className="font-mono text-xs uppercase tracking-[0.28em] text-accentSoft">TechStack Scanner</p>
        <h1 className="mt-3 max-w-2xl text-3xl font-bold leading-tight md:text-5xl">
          Descubra a stack de qualquer website com evidência real
        </h1>
        <p className="mt-4 max-w-2xl text-sm text-slate-300 md:text-base">
          Rode scans unitários ou em lote, valide tecnologias específicas e exporte resultados prontos para times de produto, growth e vendas.
        </p>
      </section>

      <section className="anim-rise grid gap-5 md:grid-cols-12">
        <div className="rounded-3xl border border-ink/10 bg-surface p-5 md:col-span-5">
          <h2 className="text-xl font-bold text-ink">Nova análise</h2>
          <p className="mt-1 text-sm text-muted">Escolha a entrada, configure o modo e inicie o job.</p>

          <div className="mt-4 grid grid-cols-3 gap-2 rounded-2xl bg-accentSoft/70 p-1">
            {(["single", "batch", "file"] as InputMode[]).map((option) => (
              <button
                key={option}
                type="button"
                className={`rounded-xl px-2 py-2 text-sm font-semibold capitalize transition ${
                  inputMode === option ? "bg-panel text-slate-50" : "text-ink hover:bg-white/80"
                }`}
                onClick={() => setInputMode(option)}
              >
                {option === "single" ? "URL única" : option === "batch" ? "Lista" : "CSV"}
              </button>
            ))}
          </div>

          <div className="mt-4 space-y-3">
            {inputMode === "single" && (
              <label className="block text-sm">
                <span className="mb-1 block font-semibold text-ink">URL</span>
                <input
                  value={singleUrl}
                  onChange={(event) => setSingleUrl(event.target.value)}
                  placeholder="https://exemplo.com"
                  className="w-full rounded-xl border border-ink/15 bg-white px-3 py-2 outline-none ring-accent transition focus:ring-2"
                />
              </label>
            )}

            {inputMode === "batch" && (
              <label className="block text-sm">
                <span className="mb-1 block font-semibold text-ink">Uma URL por linha</span>
                <textarea
                  value={urlsText}
                  onChange={(event) => setUrlsText(event.target.value)}
                  rows={6}
                  placeholder="acme.com\nopenai.com\nnotion.so"
                  className="w-full rounded-xl border border-ink/15 bg-white px-3 py-2 outline-none ring-accent transition focus:ring-2"
                />
              </label>
            )}

            {inputMode === "file" && (
              <div className="rounded-2xl border border-dashed border-ink/25 bg-white/80 p-3">
                <label className="block text-sm font-semibold text-ink">Upload CSV</label>
                <input
                  type="file"
                  accept=".csv"
                  onChange={handleFileUpload}
                  className="mt-2 block w-full text-sm file:mr-3 file:rounded-lg file:border-0 file:bg-panel file:px-3 file:py-2 file:text-slate-50"
                />
                {csvColumns.length > 0 && (
                  <label className="mt-3 block text-sm">
                    <span className="mb-1 block font-semibold text-ink">
                      Coluna com URL
                    </span>
                    <select
                      value={selectedCsvColumnIndex}
                      onChange={(event) =>
                        setSelectedCsvColumnIndex(Number(event.target.value))
                      }
                      className="w-full rounded-xl border border-ink/15 bg-white px-3 py-2 outline-none ring-accent transition focus:ring-2"
                    >
                      {csvColumns.map((column, index) => (
                        <option key={`${column}-${index}`} value={index}>
                          {column}
                        </option>
                      ))}
                    </select>
                  </label>
                )}
                <p className="mt-2 text-xs text-muted">URLs carregadas: {fileUrls.length}</p>
                {csvColumns.length > 0 && (
                  <p className="mt-1 text-xs text-muted">
                    Coluna ativa:{" "}
                    <span className="font-semibold text-ink">
                      {csvColumns[selectedCsvColumnIndex] ?? "Coluna 1"}
                    </span>
                  </p>
                )}
                {csvPreviewRows.length > 0 && (
                  <div className="mt-2 overflow-x-auto rounded-xl border border-ink/10 bg-white">
                    <table className="min-w-full text-left text-xs">
                      <thead className="bg-slate-100 text-muted">
                        <tr>
                          {csvColumns.map((column, index) => (
                            <th
                              key={`preview-${column}-${index}`}
                              className={`px-2 py-1 ${
                                selectedCsvColumnIndex === index
                                  ? "bg-amber-100 text-ink"
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
                                className={`max-w-[140px] truncate px-2 py-1 ${
                                  selectedCsvColumnIndex === colIndex
                                    ? "bg-amber-50 font-medium text-ink"
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

          <div className="mt-5 grid grid-cols-2 gap-2 rounded-2xl bg-slate-100 p-1 text-sm">
            {(["all", "specific"] as AnalysisMode[]).map((option) => (
              <button
                key={option}
                type="button"
                onClick={() => setMode(option)}
                className={`rounded-xl px-3 py-2 font-semibold transition ${
                  mode === option ? "bg-white text-ink shadow" : "text-muted"
                }`}
              >
                {option === "all" ? "Detectar tudo" : "Modo específico"}
              </button>
            ))}
          </div>

          {mode === "specific" && (
            <label className="mt-3 block text-sm">
              <span className="mb-1 block font-semibold text-ink">Tecnologias-alvo (uma por linha)</span>
              <textarea
                value={targetsText}
                onChange={(event) => setTargetsText(event.target.value)}
                rows={4}
                className="w-full rounded-xl border border-ink/15 bg-white px-3 py-2 outline-none ring-accent transition focus:ring-2"
              />
            </label>
          )}

          {error && <p className="mt-3 rounded-lg bg-rose-100 px-3 py-2 text-sm text-rose-700">{error}</p>}

          <button
            type="button"
            onClick={startScan}
            disabled={isSubmitting}
            className="mt-4 w-full rounded-xl bg-accent px-4 py-3 text-sm font-bold uppercase tracking-wide text-white transition hover:brightness-95 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {isSubmitting ? "Iniciando..." : "Iniciar análise"}
          </button>
        </div>

        <div className="rounded-3xl border border-ink/10 bg-surface p-5 md:col-span-7">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="text-xl font-bold text-ink">Job atual</h2>
              <p className="text-sm text-muted">Acompanhe progresso e exporte os resultados.</p>
            </div>
            {job && <StatusPill status={job.status} />}
          </div>

          {!job && (
            <div className="mt-6 rounded-2xl border border-dashed border-ink/20 p-8 text-center text-sm text-muted">
              Nenhum job ativo. Configure um scan e execute.
            </div>
          )}

          {job && (
            <div className="mt-4 space-y-4">
              <div className="grid gap-3 sm:grid-cols-4">
                <MetricCard label="Total" value={String(job.total)} />
                <MetricCard label="Concluídos" value={String(job.counts.completed)} />
                <MetricCard label="Falhas" value={String(job.counts.failed)} />
                <MetricCard label="Progresso" value={`${progressPercentage(job)}%`} />
              </div>

              <div className="h-2 overflow-hidden rounded-full bg-slate-200">
                <div
                  className="h-full bg-gradient-to-r from-accent to-[#ff9f58] transition-all"
                  style={{ width: `${progressPercentage(job)}%` }}
                />
              </div>

              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={abortCurrentJob}
                  disabled={!["queued", "running"].includes(job.status)}
                  className="rounded-lg bg-rose-600 px-3 py-2 text-xs font-semibold uppercase tracking-wide text-white disabled:opacity-40"
                >
                  Abortar job
                </button>
                <button
                  type="button"
                  onClick={retryFailed}
                  disabled={job.counts.failed === 0 || ["running", "queued"].includes(job.status)}
                  className="rounded-lg bg-panel px-3 py-2 text-xs font-semibold uppercase tracking-wide text-slate-50 disabled:opacity-40"
                >
                  Reprocessar erros
                </button>
                <a
                  href={`/api/scans/${job.id}/export?format=csv`}
                  className="rounded-lg border border-ink/15 bg-white px-3 py-2 text-xs font-semibold uppercase tracking-wide text-ink"
                >
                  Exportar CSV
                </a>
              </div>

              <div className="overflow-x-auto rounded-2xl border border-ink/10">
                <table className="min-w-full text-left text-sm">
                  <thead className="bg-slate-100 text-xs uppercase tracking-wide text-muted">
                    <tr>
                      <th className="px-3 py-2">URL</th>
                      <th className="px-3 py-2">Status</th>
                      <th className="px-3 py-2">Tecnologias</th>
                    </tr>
                  </thead>
                  <tbody>
                    {job.items.map((item) => (
                      <tr
                        key={item.id}
                        className={`cursor-pointer border-t border-ink/10 transition hover:bg-slate-50 ${
                          selectedItemId === item.id ? "bg-amber-50" : ""
                        }`}
                        onClick={() => setSelectedItemId(item.id)}
                      >
                        <td className="max-w-[320px] truncate px-3 py-2 font-mono text-xs text-ink">{item.normalizedUrl}</td>
                        <td className="px-3 py-2">
                          <StatusPill status={item.status} />
                        </td>
                        <td className="px-3 py-2 text-xs text-muted">
                          {item.status === "running" || item.status === "pending"
                            ? `tentativa ${item.attempts}/${item.maxAttempts}`
                            : `${item.result?.detections.filter((d) => d.status !== "not_found").length ?? 0} detectadas`}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      </section>

      {selectedItem && (
        <section className="anim-rise rounded-3xl border border-ink/10 bg-surface p-5">
          <h3 className="text-lg font-bold text-ink">Detalhes da URL</h3>
          <p className="mt-1 font-mono text-xs text-muted">{selectedItem.normalizedUrl}</p>

          {selectedItem.error && (
            <p className="mt-3 rounded-lg bg-rose-100 px-3 py-2 text-sm text-rose-700">{selectedItem.error}</p>
          )}

          {(selectedItem.status === "running" || selectedItem.status === "pending") && (
            <div className="mt-4 rounded-2xl border border-ink/10 bg-white p-4">
              <div className="flex items-center gap-3">
                <span className="h-3 w-3 animate-pulse rounded-full bg-accent" />
                <p className="text-sm font-semibold text-ink">
                  {selectedItem.status === "running"
                    ? "Analisando esta URL agora"
                    : "URL aguardando na fila"}
                </p>
              </div>
              <p className="mt-2 text-xs text-muted">
                Tentativa {selectedItem.attempts}/{selectedItem.maxAttempts}
                {selectedItem.nextRetryAt
                  ? ` • próximo retry em ${new Date(selectedItem.nextRetryAt).toLocaleTimeString("pt-BR")}`
                  : ""}
              </p>
            </div>
          )}

          <div className="mt-4 grid gap-3 md:grid-cols-2">
            {(selectedItem.result?.detections ?? []).map((detection) => (
              <article key={`${detection.technology}-${detection.summary}`} className="rounded-2xl border border-ink/10 bg-white p-4">
                <div className="flex items-center justify-between gap-2">
                  <h4 className="font-semibold text-ink">{detection.technology}</h4>
                  <StatusPill status={detection.status} />
                </div>
                <p className="mt-1 text-xs uppercase tracking-wide text-muted">{detection.category}</p>
                <p className="mt-2 text-sm text-ink/90">{detection.summary}</p>
                <p className="mt-2 text-xs font-semibold text-muted">Confiança: {detection.confidence}%</p>
              </article>
            ))}

            {(selectedItem.result?.detections ?? []).length === 0 && !selectedItem.error && (
              <div className="rounded-2xl border border-dashed border-ink/20 p-5 text-sm text-muted">
                Nenhuma tecnologia identificada para esta URL.
              </div>
            )}
          </div>
        </section>
      )}
    </main>
  );
}

function MetricCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-ink/10 bg-white p-3">
      <p className="text-xs uppercase tracking-wide text-muted">{label}</p>
      <p className="mt-1 text-2xl font-bold text-ink">{value}</p>
    </div>
  );
}
