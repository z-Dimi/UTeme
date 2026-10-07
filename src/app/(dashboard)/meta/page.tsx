import Link from "next/link";
import { MetricCard } from "@/components/dashboard/metric-card";
import { PeriodFilter } from "@/components/dashboard/period-filter";
import { isPreset, resolvePeriod, type Preset } from "@/lib/dates";
import { calculateCPA, calculateROAS } from "@/lib/finance";
import { RefreshButton } from "@/features/meta/refresh-button";
import { UNAVAILABLE, formatCurrency, formatNumber, formatPercent, formatRelativeTime } from "@/lib/formatting";
import {
  SORT_KEYS,
  buildMetaTree,
  sortNodes,
  type MetaNode,
  type NameStatus,
  type RollupRow,
  type SortKey,
} from "@/lib/meta/tree";
import { createClient } from "@/lib/supabase/server";
import { cn } from "@/lib/utils";
import { getMetaPeriod } from "@/server/services/meta-summary";
import { getWorkspace } from "@/server/services/workspace";

export const metadata = { title: "Meta Ads" };

const PAGE_SIZE = 25;

const STATUS: Record<string, string> = { ACTIVE: "Ativo", PAUSED: "Pausado", ARCHIVED: "Arquivado", DELETED: "Excluído" };

const COLUMNS: { key: SortKey; label: string }[] = [
  { key: "spend", label: "Investimento" },
  { key: "impressions", label: "Impressões" },
  { key: "clicks", label: "Cliques" },
  { key: "ctr", label: "CTR" },
  { key: "cpc", label: "CPC" },
  { key: "cpm", label: "CPM" },
  { key: "purchases", label: "Compras Meta" },
  { key: "purchaseValue", label: "Receita Meta" },
  { key: "cpa", label: "CPA" },
  { key: "roas", label: "ROAS" },
];

const GRID = "grid grid-cols-[minmax(240px,2.4fr)_88px_repeat(10,minmax(88px,1fr))] items-center gap-x-2";

// Kept outside the component body: the React purity lint rejects calling the clock during render.
const currentTime = () => new Date();

const ymd = (d: Date, tz: string) =>
  new Intl.DateTimeFormat("en-CA", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit" }).format(d);

function cells(n: MetaNode) {
  return [
    formatCurrency(n.sums.spend),
    formatNumber(n.sums.impressions),
    formatNumber(n.sums.clicks),
    n.derived.ctr === null ? UNAVAILABLE : formatPercent(n.derived.ctr),
    n.derived.cpc === null ? UNAVAILABLE : formatCurrency(n.derived.cpc),
    n.derived.cpm === null ? UNAVAILABLE : formatCurrency(n.derived.cpm),
    formatNumber(n.sums.purchases),
    formatCurrency(n.sums.purchaseValue),
    n.derived.cpa === null ? UNAVAILABLE : formatCurrency(n.derived.cpa),
    n.derived.roas === null ? UNAVAILABLE : formatNumber(n.derived.roas, 2),
  ];
}

function StatusPill({ status }: { status: string | null }) {
  if (!status) return <span className="text-muted">—</span>;
  const active = status === "ACTIVE";
  return (
    <span className={cn("w-fit rounded px-1.5 py-0.5 text-[10px]", active ? "bg-success/10 text-success" : "bg-surface text-muted")}>
      {STATUS[status] ?? status.toLowerCase().replaceAll("_", " ")}
    </span>
  );
}

function Row({ node, level }: { node: MetaNode; level: 0 | 1 | 2 }) {
  return (
    <div className={cn(GRID, "px-3 py-2 text-[13px]")}>
      <div className="min-w-0" style={{ paddingLeft: level * 18 }}>
        <p className="truncate font-medium" title={node.name}>
          {node.name}
        </p>
        <p className="truncate font-mono text-[10px] text-muted">{node.id}</p>
      </div>
      <StatusPill status={node.status} />
      {cells(node).map((c, i) => (
        <span key={i} className="text-right tabular-nums">
          {c}
        </span>
      ))}
    </div>
  );
}

export default async function MetaPage({
  searchParams,
}: {
  searchParams: Promise<{ period?: string; from?: string; to?: string; sort?: string; dir?: string; q?: string; page?: string }>;
}) {
  const sp = await searchParams;
  const workspace = await getWorkspace();
  const tz = workspace.activeProject.timezone;
  const preset: Preset = isPreset(sp.period) ? sp.period : "today";
  const period = resolvePeriod({ preset, tz, customFrom: sp.from, customTo: sp.to });
  const sort: SortKey = SORT_KEYS.includes(sp.sort as SortKey) ? (sp.sort as SortKey) : "spend";
  const dir = sp.dir === "asc" ? "asc" : "desc";
  const q = (sp.q ?? "").trim().toLowerCase().slice(0, 80);
  const page = Math.max(1, Number.parseInt(sp.page ?? "1", 10) || 1);

  const meta = await getMetaPeriod({ projectId: workspace.activeProject.id, period, tz });
  const lastDay = new Date(period.to.getTime() - 1);
  const filter = (
    <PeriodFilter
      basePath="/meta"
      period={period}
      defaultFrom={ymd(period.from, tz)}
      defaultTo={ymd(lastDay, tz)}
      trailing={
        meta.state === "ready" ? (
          <RefreshButton lastSyncLabel={meta.hasError ? "Falha na última atualização" : `Atualizado ${formatRelativeTime(meta.lastSyncAt, currentTime())}`} />
        ) : null
      }
    />
  );

  const header = (
    <header className="flex flex-wrap items-center justify-between gap-3">
      <h2 className="text-lg font-semibold tracking-tight">Meta Ads</h2>
      {filter}
    </header>
  );

  if (meta.state !== "ready") {
    return (
      <div className="space-y-4">
        {header}
        <div className="rounded-xl border border-border bg-card p-8 text-center text-muted">
          {meta.state === "importing" ? "Sincronizando os dados da Meta…" : "Nenhuma conta Meta conectada. Conecte sua conta para começar."}{" "}
          <Link href="/integrations/meta" className="text-info hover:underline">
            {meta.state === "importing" ? "Ver progresso" : "Conectar Meta"}
          </Link>
        </div>
      </div>
    );
  }

  const supabase = await createClient();
  const pid = workspace.activeProject.id;
  const [rollup, campaigns, adsets, ads] = await Promise.all([
    supabase.rpc("meta_rollup", { p_project: pid, p_from: ymd(period.from, tz), p_to: ymd(period.to, tz) }),
    supabase.from("meta_campaigns").select("external_id, name, status").eq("project_id", pid),
    supabase.from("meta_adsets").select("external_id, name, status").eq("project_id", pid),
    supabase.from("meta_ads").select("external_id, name, status").eq("project_id", pid),
  ]);
  const toMap = (rows: { external_id: string; name: string; status: string | null }[] | null) =>
    new Map<string, NameStatus>((rows ?? []).map((r) => [r.external_id, { name: r.name, status: r.status }]));

  let tree = buildMetaTree((rollup.data ?? []) as RollupRow[], {
    campaigns: toMap(campaigns.data),
    adsets: toMap(adsets.data),
    ads: toMap(ads.data),
  });
  if (q) {
    const hit = (n: MetaNode): boolean => n.name.toLowerCase().includes(q) || n.id.includes(q) || n.children.some(hit);
    tree = tree.filter(hit);
  }
  tree = sortNodes(tree, sort, dir).map((c) => ({
    ...c,
    children: sortNodes(c.children, sort, dir).map((a) => ({ ...a, children: sortNodes(a.children, sort, dir) })),
  }));

  const totalPages = Math.max(1, Math.ceil(tree.length / PAGE_SIZE));
  const visible = tree.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
  const t = meta.totals;
  const qs = (over: Record<string, string>) =>
    `/meta?${new URLSearchParams({ period: preset, ...(sp.from ? { from: sp.from } : {}), ...(sp.to ? { to: sp.to } : {}), sort, dir, ...(q ? { q } : {}), ...over })}`;

  return (
    <div className="space-y-5">
      {header}

      <section aria-label="Indicadores Meta" className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <MetricCard label="Investimento" value={formatCurrency(t.spend)} formula="Soma do spend informado pela Meta no período." />
        <MetricCard label="Receita Meta" value={formatCurrency(t.purchaseValue)} formula="Valor de compras atribuído pela Meta (um único tipo de ação por evento, sem somar duplicatas). Pode divergir das vendas reais do gateway." />
        <MetricCard label="Compras Meta" value={formatNumber(t.purchases)} formula="Compras atribuídas pela Meta, conforme a janela de atribuição da conta." />
        <MetricCard label="CPA" value={formatCurrency(calculateCPA(t.spend, t.purchases))} formula="Investimento ÷ compras Meta. Indisponível sem compras." />
        <MetricCard label="ROAS Meta" value={formatNumber(calculateROAS(t.purchaseValue, t.spend), 2)} formula="Receita Meta ÷ investimento. O ROAS financeiro (com vendas aprovadas) está no Resumo." />
        <MetricCard label="CTR" value={t.impressions > 0 ? formatPercent(t.clicks / t.impressions) : UNAVAILABLE} formula="Cliques ÷ impressões." />
        <MetricCard label="CPC" value={t.clicks > 0 ? formatCurrency(Math.round(t.spend / t.clicks)) : UNAVAILABLE} formula="Investimento ÷ cliques." />
        <MetricCard label="CPM" value={t.impressions > 0 ? formatCurrency(Math.round((t.spend / t.impressions) * 1000)) : UNAVAILABLE} formula="Investimento ÷ impressões × 1000." />
      </section>

      <section aria-label="Campanhas" className="rounded-xl border border-border bg-card">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border p-3">
          <form action="/meta" className="flex items-center gap-2">
            <input type="hidden" name="period" value={preset} />
            {sp.from ? <input type="hidden" name="from" value={sp.from} /> : null}
            {sp.to ? <input type="hidden" name="to" value={sp.to} /> : null}
            <label className="sr-only" htmlFor="q">Buscar campanha, conjunto ou anúncio</label>
            <input
              id="q"
              name="q"
              defaultValue={q}
              placeholder="Buscar campanha, conjunto ou anúncio"
              className="h-8 w-72 max-w-full rounded-md border border-border bg-surface px-3 text-xs placeholder:text-muted/70 hover:border-border-hover"
            />
            <button type="submit" className="h-8 rounded-md border border-border bg-surface px-3 text-xs hover:border-border-hover">
              Buscar
            </button>
          </form>
          <p className="text-[11px] text-muted">Alcance não é somado entre dias/anúncios e por isso não aparece nas agregações.</p>
        </div>

        {visible.length === 0 ? (
          <p className="p-8 text-center text-muted">{q ? "Nenhum resultado para a busca." : "Sem dados de campanhas neste período."}</p>
        ) : (
          <div className="overflow-x-auto">
            <div className="min-w-[1280px]">
              <div className={cn(GRID, "border-b border-border px-3 py-2 text-[11px] text-muted")}>
                <Link href={qs({ sort: "name", dir: sort === "name" && dir === "asc" ? "desc" : "asc", page: "1" })}>Nome</Link>
                <span>Status</span>
                {COLUMNS.map((c) => (
                  <Link
                    key={c.key}
                    href={qs({ sort: c.key, dir: sort === c.key && dir === "desc" ? "asc" : "desc", page: "1" })}
                    aria-sort={sort === c.key ? (dir === "asc" ? "ascending" : "descending") : undefined}
                    className={cn("text-right hover:text-foreground", sort === c.key && "text-foreground")}
                  >
                    {c.label}
                    {sort === c.key ? (dir === "asc" ? " ↑" : " ↓") : ""}
                  </Link>
                ))}
              </div>

              {visible.map((campaign) => (
                <details key={campaign.id} className="group border-b border-border last:border-0">
                  <summary className="cursor-pointer list-none hover:bg-card-hover [&::-webkit-details-marker]:hidden">
                    <Row node={campaign} level={0} />
                  </summary>
                  {campaign.children.map((adset) => (
                    <details key={adset.id} className="bg-surface/40">
                      <summary className="cursor-pointer list-none hover:bg-card-hover [&::-webkit-details-marker]:hidden">
                        <Row node={adset} level={1} />
                      </summary>
                      {adset.children.map((ad) => (
                        <div key={ad.id} className="bg-surface/70">
                          <Row node={ad} level={2} />
                        </div>
                      ))}
                    </details>
                  ))}
                </details>
              ))}
            </div>
          </div>
        )}
      </section>

      {totalPages > 1 ? (
        <nav aria-label="Paginação" className="flex items-center justify-between text-xs text-muted">
          <span>
            Página {page} de {totalPages} · {tree.length} campanhas
          </span>
          <div className="flex gap-2">
            {page > 1 ? <Link href={qs({ page: String(page - 1) })} className="rounded-md border border-border px-3 py-1.5 hover:border-border-hover">Anterior</Link> : null}
            {page < totalPages ? <Link href={qs({ page: String(page + 1) })} className="rounded-md border border-border px-3 py-1.5 hover:border-border-hover">Próxima</Link> : null}
          </div>
        </nav>
      ) : null}
    </div>
  );
}
