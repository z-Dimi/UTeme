import Link from "next/link";
import { HourlyChart } from "@/components/charts/hourly-chart";
import { MetricCard } from "@/components/dashboard/metric-card";
import { PeriodFilter } from "@/components/dashboard/period-filter";
import {
  UNAVAILABLE,
  formatCurrency,
  formatNumber,
  formatSignedCurrency,
  formatSignedNumber,
  formatSignedPercent,
  getMetricColor,
  getMetricSemantic,
} from "@/lib/formatting";
import { isPreset, resolvePeriod, type Preset } from "@/lib/dates";
import { FunnelCard } from "@/features/funnel/funnel-card";
import { getConversionFunnel } from "@/lib/funnel";
import { calculateCPA } from "@/lib/finance";
import { getMetaPeriod } from "@/server/services/meta-summary";
import { getSummary } from "@/server/services/summary";
import { getWorkspace } from "@/server/services/workspace";

export const metadata = { title: "Resumo" };

const ymd = (d: Date, tz: string) =>
  new Intl.DateTimeFormat("en-CA", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit" }).format(d);

export default async function SummaryPage({
  searchParams,
}: {
  searchParams: Promise<{ period?: string; from?: string; to?: string }>;
}) {
  const sp = await searchParams;
  const workspace = await getWorkspace();
  const tz = workspace.activeProject.timezone;
  const preset: Preset = isPreset(sp.period) ? sp.period : "last_7";
  const period = resolvePeriod({ preset, tz, customFrom: sp.from, customTo: sp.to });

  // Meta numbers come from our synced tables. Not connected = unavailable (null), never zero.
  const meta = await getMetaPeriod({ projectId: workspace.activeProject.id, period, tz });
  const ready = meta.state === "ready" ? meta : null;
  const importing = meta.state === "importing";
  const result = await getSummary({
    projectId: workspace.activeProject.id,
    period,
    adSpend: ready ? ready.totals.spend : null,
    metaAdsTax: ready ? ready.metaAdsTax : null,
    tz,
  });

  const lastDay = new Date(period.to.getTime() - 1);
  const filter = (
    <PeriodFilter period={period} defaultFrom={ymd(period.from, tz)} defaultTo={ymd(lastDay, tz)} />
  );

  if ("error" in result) {
    return (
      <div className="space-y-4">
        {filter}
        <p role="alert" className="rounded-xl border border-border bg-card p-4 text-danger">
          Não foi possível carregar o resumo. Tente novamente em instantes.
        </p>
      </div>
    );
  }

  const { summary: s, hourly } = result;
  const noAds = "Conecte a Meta Ads para calcular.";
  const adsFormula = (text: string) => `${text} Requer investimento da Meta${s.adSpend === null ? " (não conectado)" : ""}.`;
  const hasSales = s.approvedOrders + s.pendingOrders + s.refundOrders + s.chargebackOrders > 0;

  return (
    <div className="space-y-5">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold tracking-tight">Resumo</h2>
          <p className="text-xs text-muted">
            {period.label} · {ymd(period.from, tz)} a {ymd(lastDay, tz)} · fuso {tz}
          </p>
        </div>
        {filter}
      </header>

      {!hasSales ? (
        <div className="rounded-xl border border-border bg-card p-4 text-muted">
          Nenhuma venda neste período.{" "}
          <Link href="/integrations" className="text-info hover:underline">
            Conecte uma plataforma de vendas
          </Link>{" "}
          ou escolha outro período.
        </div>
      ) : null}
      {importing ? (
        <div role="status" className="rounded-xl border border-border bg-card p-4 text-muted">
          Sincronizando os dados da Meta… Gastos, ROAS, lucro e ROI aparecem assim que a importação terminar.{" "}
          <Link href="/integrations/meta" className="text-info hover:underline">
            Ver progresso
          </Link>
        </div>
      ) : s.adSpend === null ? (
        <div className="rounded-xl border border-border bg-card p-4 text-muted">
          Nenhuma conta Meta conectada.{" "}
          <Link href="/integrations/meta" className="text-info hover:underline">
            Conecte para começar
          </Link>
          . Gastos, ROAS, lucro, ROI e margem aparecem como {UNAVAILABLE} até a conexão, para não superestimar o resultado.
        </div>
      ) : null}
      {ready?.hasError ? (
        <div role="alert" className="rounded-xl border border-danger/30 bg-danger/5 p-3 text-xs text-danger">
          Não foi possível atualizar os dados da Meta. Os números abaixo são da última sincronização bem-sucedida.
        </div>
      ) : null}

      <section aria-label="Indicadores" className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <MetricCard
          label="Faturamento Líquido"
          value={formatCurrency(s.netRevenue)}
          formula="Receita aprovada − reembolsos − chargebacks − taxas do gateway − impostos. Vendas aprovadas no período."
          sub={`${formatNumber(s.approvedOrders)} vendas aprovadas`}
        />
        <MetricCard
          label="Gastos com anúncios"
          value={s.adSpend === null ? UNAVAILABLE : formatCurrency(s.adSpend)}
          loading={importing}
          formula={`Soma do investimento (spend) da Meta Ads no período. ${s.adSpend === null ? noAds : ""}`}
        />
        <MetricCard
          label="ROAS"
          value={s.roas === null ? UNAVAILABLE : formatNumber(s.roas, 2)}
          loading={importing}
          formula={adsFormula("Receita aprovada (após reembolsos e chargebacks) ÷ investimento em anúncios (ROAS Cash). O ROAS Meta usa o valor de compra atribuído pela Meta.")}
          sub={ready && ready.totals.spend > 0 ? `ROAS Meta ${formatNumber(ready.totals.purchaseValue / ready.totals.spend, 2)}` : undefined}
        />
        <MetricCard
          label="Lucro"
          value={formatSignedCurrency(s.profit)}
          colorClass={getMetricColor(getMetricSemantic(s.profit))}
          loading={importing}
          formula={adsFormula("Receita líquida − anúncios − imposto Meta − custos de produto − despesas.")}
          sub={`despesas ${formatCurrency(s.expenses)}`}
        />

        <MetricCard
          label="CPA"
          value={ready ? formatCurrency(calculateCPA(ready.totals.spend, ready.totals.purchases)) : UNAVAILABLE}
          loading={importing}
          formula="Investimento ÷ compras atribuídas pela Meta (CPA Meta). Sem compras no período, fica indisponível."
          sub={ready ? `${formatNumber(ready.totals.purchases)} compras Meta` : undefined}
        />
        <MetricCard
          label="Vendas Pendentes"
          value={formatCurrency(s.pendingAmount)}
          formula="Soma bruta dos pedidos ainda pendentes de pagamento, criados no período."
          sub={`${formatNumber(s.pendingOrders)} pedidos`}
        />
        <MetricCard
          label="ROI"
          value={formatSignedNumber(s.roi)}
          colorClass={getMetricColor(getMetricSemantic(s.roi))}
          loading={importing}
          formula={adsFormula("Lucro ÷ custos totais (anúncios + imposto Meta + taxas + impostos + custos de produto + despesas).")}
        />
        <MetricCard
          label="Custos de Produto"
          value={formatCurrency(s.productCosts)}
          formula="Soma dos custos de produto configurados em Taxas, congelados em cada venda aprovada."
        />

        <MetricCard
          label="Imposto Meta Ads"
          value={s.metaAdsTax === null ? UNAVAILABLE : formatCurrency(s.metaAdsTax)}
          loading={importing}
          formula={`Percentual configurado em Taxas aplicado sobre o investimento em anúncios, não sobre o faturamento. ${s.adSpend === null ? noAds : ""}`}
        />
        <MetricCard
          label="Vendas Reembolsadas"
          value={formatSignedCurrency(-s.refunds)}
          colorClass={s.refunds > 0 ? "text-danger" : "text-muted"}
          formula="Valor reembolsado das vendas aprovadas no período. Chargebacks são contados à parte."
          sub={`${formatNumber(s.refundOrders)} pedidos · chargeback ${formatSignedCurrency(-s.chargebacks)}`}
        />
        <MetricCard
          label="Margem"
          value={s.margin === null ? UNAVAILABLE : formatSignedPercent(s.margin)}
          colorClass={getMetricColor(getMetricSemantic(s.margin))}
          loading={importing}
          formula={adsFormula("Lucro ÷ receita líquida.")}
        />
        <MetricCard
          label="Taxas"
          value={formatCurrency(s.gatewayFees)}
          formula="Soma das taxas de gateway resolvidas pelas regras de Taxas e congeladas em cada venda. Impostos sobre receita à parte."
          sub={`impostos ${formatCurrency(s.taxes)}`}
        />
      </section>

      <FunnelCard
        stages={getConversionFunnel(
          ready
            ? {
                clicks: ready.totals.linkClicks,
                landingPageViews: ready.totals.landingPageViews,
                initiateCheckouts: ready.totals.initiateCheckouts,
                metaPurchases: ready.totals.purchases,
              }
            : null,
          s.approvedOrders,
        )}
      />

      <section aria-label="Resultado por horário" className="rounded-xl border border-border bg-card p-4">
        <div className="mb-2 flex items-baseline justify-between gap-2">
          <h3 className="text-[13px] font-semibold">Resultado por horário</h3>
          <p className="text-[11px] text-muted">
            Receita líquida − custo de produto por hora de aprovação. Investimento em anúncios não é rateado por hora.
          </p>
        </div>
        {hourly.some((h) => h.orders > 0) ? (
          <HourlyChart data={hourly} />
        ) : (
          <p className="py-10 text-center text-muted">Sem vendas aprovadas no período.</p>
        )}
      </section>

      <p className="text-[11px] text-muted">
        Valores agrupados pela data de aprovação da venda; um reembolso posterior altera o período da venda original.
      </p>
    </div>
  );
}
