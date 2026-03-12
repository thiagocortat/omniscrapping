interface StatusPillProps {
  status: string;
}

const statusColor: Record<string, string> = {
  queued: "bg-slate-200 text-slate-700",
  running: "bg-amber-100 text-amber-800",
  completed: "bg-emerald-100 text-emerald-800",
  partial: "bg-orange-100 text-orange-800",
  failed: "bg-rose-100 text-rose-800",
  pending: "bg-slate-200 text-slate-700"
};

export function StatusPill({ status }: StatusPillProps) {
  return (
    <span
      className={`inline-flex items-center rounded-full px-2.5 py-1 text-xs font-semibold uppercase tracking-wide ${
        statusColor[status] ?? "bg-slate-100 text-slate-700"
      }`}
    >
      {status}
    </span>
  );
}
