const STYLES: Record<string, { label: string; className: string }> = {
  processed: { label: "Processado", className: "bg-success/10 text-success" },
  ignored: { label: "Ignorado", className: "bg-surface text-muted" },
  failed: { label: "Erro", className: "bg-danger/10 text-danger" },
  processing: { label: "Processando", className: "bg-info/10 text-info" },
  received: { label: "Recebido", className: "bg-info/10 text-info" },
};

export function StatusBadge({ status }: { status: string }) {
  const s = STYLES[status] ?? { label: status, className: "bg-surface text-muted" };
  return <span className={`rounded px-1.5 py-0.5 text-[11px] ${s.className}`}>{s.label}</span>;
}
