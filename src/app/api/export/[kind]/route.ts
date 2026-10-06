import { NextResponse, type NextRequest } from "next/server";
import { centsToDecimal, toCsv } from "@/lib/csv";
import { isPreset, resolvePeriod } from "@/lib/dates";
import { createClient } from "@/lib/supabase/server";
import { getWorkspace } from "@/server/services/workspace";

export const dynamic = "force-dynamic";

const MAX_ROWS = 10_000;
const PAGE = 1000;

type OrderRow = {
  ordered_at: string;
  external_order_id: string;
  provider: string;
  status: string;
  payment_method: string | null;
  installments: number | null;
  currency: string;
  gross_amount: number;
  gateway_fee_amount: number;
  tax_amount: number;
  product_cost_amount: number;
  refund_amount: number;
  chargeback_amount: number;
  net_amount: number;
  customers: { name: string | null; email: string } | null;
  order_items: { name: string }[];
};

/** Authenticated CSV export. RLS (user-scoped client) decides which rows exist; project comes from the server. */
export async function GET(request: NextRequest, ctx: { params: Promise<{ kind: string }> }) {
  const { kind } = await ctx.params;
  if (kind !== "sales" && kind !== "expenses") return NextResponse.json({ error: "not_found" }, { status: 404 });

  const workspace = await getWorkspace();
  const sp = request.nextUrl.searchParams;
  const presetParam = sp.get("period") ?? undefined;
  const period = resolvePeriod({
    preset: isPreset(presetParam) ? presetParam : "last_30",
    tz: workspace.activeProject.timezone,
    customFrom: sp.get("from") ?? undefined,
    customTo: sp.get("to") ?? undefined,
  });
  const supabase = await createClient();
  const tz = workspace.activeProject.timezone;
  const localDate = (d: Date) =>
    new Intl.DateTimeFormat("en-CA", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit" }).format(d);
  const stamp = `${localDate(period.from)}_${localDate(new Date(period.to.getTime() - 1))}`;

  let csv: string;
  if (kind === "sales") {
    const rows: OrderRow[] = [];
    for (let offset = 0; offset < MAX_ROWS; offset += PAGE) {
      const { data, error } = await supabase
        .from("orders")
        .select(
          "ordered_at, external_order_id, provider, status, payment_method, installments, currency, gross_amount, gateway_fee_amount, tax_amount, product_cost_amount, refund_amount, chargeback_amount, net_amount, customers(name, email), order_items(name)",
        )
        .eq("project_id", workspace.activeProject.id)
        .gte("ordered_at", period.from.toISOString())
        .lt("ordered_at", period.to.toISOString())
        .order("ordered_at", { ascending: false })
        .range(offset, offset + PAGE - 1)
        .overrideTypes<OrderRow[], { merge: false }>();
      if (error) return NextResponse.json({ error: "export_failed" }, { status: 500 });
      rows.push(...data);
      if (data.length < PAGE) break;
    }
    csv = toCsv(
      ["data", "pedido", "plataforma", "cliente", "email", "produto", "pagamento", "parcelas", "moeda", "bruto", "taxas", "impostos", "custo_produto", "reembolso", "chargeback", "liquido", "status"],
      rows.map((o) => [
        new Intl.DateTimeFormat("sv-SE", { timeZone: tz, dateStyle: "short", timeStyle: "medium" }).format(new Date(o.ordered_at)),
        o.external_order_id,
        o.provider,
        o.customers?.name,
        o.customers?.email,
        o.order_items[0]?.name,
        o.payment_method,
        o.installments,
        o.currency,
        centsToDecimal(o.gross_amount),
        centsToDecimal(o.gateway_fee_amount),
        centsToDecimal(o.tax_amount),
        centsToDecimal(o.product_cost_amount),
        centsToDecimal(o.refund_amount),
        centsToDecimal(o.chargeback_amount),
        centsToDecimal(o.net_amount),
        o.status,
      ]),
    );
  } else {
    const { data, error } = await supabase
      .from("expenses")
      .select("incurred_on, name, category, amount, note")
      .eq("project_id", workspace.activeProject.id)
      .gte("incurred_on", localDate(period.from))
      .lt("incurred_on", localDate(period.to))
      .order("incurred_on", { ascending: false })
      .limit(MAX_ROWS);
    if (error) return NextResponse.json({ error: "export_failed" }, { status: 500 });
    csv = toCsv(
      ["data", "nome", "categoria", "valor", "observacao"],
      data.map((e) => [e.incurred_on, e.name, e.category, centsToDecimal(e.amount), e.note]),
    );
  }

  return new NextResponse(csv, {
    headers: {
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": `attachment; filename="${kind}_${stamp}.csv"`,
      "cache-control": "no-store",
    },
  });
}
