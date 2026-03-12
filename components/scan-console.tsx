"use client";

import { useEffect, useMemo, useState } from "react";
import type { ChangeEvent } from "react";
import type { AnalysisMode, ScanItem, ScanJob } from "@/lib/types";
import { StatusPill } from "@/components/status-pill";

type InputMode = "single" | "batch" | "file";

function splitByLine(value: string): string[] {
  return value
    .split(/\r?\n/g)
    .map((item) => item.trim())
    .filter(Boolean);
}

function parseFirstCsvField(line: string, delimiter: "," | ";"): string {
  if (!line.trim()) {
    return "";
  }

  let value = "";
  let inQuotes = false;

  for (let i = 0; i < line.length; i += 1) {
    const char = line[i];

    if (char === "\"") {
      if (inQuotes && line[i + 1] === "\"") {
        value += "\"";
        i += 1;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }

    if (!inQuotes && char === delimiter) {
      break;
    }

    value += char;
  }

  return value.trim();
}

function detectDelimiter(firstRow: string): "," | ";" {
  const commas = (firstRow.match(/,/g) ?? []).length;
  const semicolons = (firstRow.match(/;/g) ?? []).length;
  return semicolons > commas ? ";" : ",";
}

function parseCsvFirstColumn(content: string): string[] {
  const rows = content.split(/\r?\n/g).filter((row) => row.trim().length > 0);
  if (!rows.length) {
    return [];
  }

  const delimiter = detectDelimiter(rows[0]);

  return rows
    .map((row) => parseFirstCsvField(row, delimiter))
    .map((value) => value.replace(/^"|"$/g, ""))
    .filter(
      (item): item is string =>
        Boolean(item) && !/^(url|domain|website)$/i.test(item)
    );
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
    if (!job || ["completed", "partial", "failed"].includes(job.status)) {
      return;
    }

    const poll = window.setInterval(async () => {
      try {
        const response = await fetch(`/api/scans/${job.id}`);
        const data = await response.json();

        if (response.ok) {
          setJob(data.job);
        }
      } catch {
        setError("Falha temporária ao atualizar progresso do job.");
      }
    }, 1500);

    return () => window.clearInterval(poll);
  }, [job]);

  const targets = useMemo(() => splitByLine(targetsText), [targetsText]);

  async function handleFileUpload(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) {
      return;
    }

    if (!file.name.toLowerCase().endsWith(".csv")) {
      setError("No MVP atual, apenas upload CSV está habilitado.");
      return;
    }

    const content = await file.text();
    const parsed = parseCsvFirstColumn(content);
    setFileUrls(parsed);
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
                <p className="mt-2 text-xs text-muted">URLs carregadas: {fileUrls.length}</p>
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
                  onClick={retryFailed}
                  disabled={job.counts.failed === 0 || job.status === "running"}
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
                          {item.result?.detections.filter((d) => d.status !== "not_found").length ?? 0} detectadas
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
