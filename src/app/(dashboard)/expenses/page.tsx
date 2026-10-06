import Link from "next/link";
import { Button } from "@/components/ui/button";
import { deleteExpense } from "@/features/expenses/actions";
import { CATEGORY_LABEL, ExpenseForm } from "@/features/expenses/expense-form";
import { todayInTz } from "@/lib/dates";
import { formatCurrency } from "@/lib/formatting";
import { createClient } from "@/lib/supabase/server";
import { getWorkspace } from "@/server/services/workspace";

export const metadata = { title: "Despesas" };

const PAGE_SIZE = 25;

type Row = { id: string; name: string; category: string; amount: number; incurred_on: string; note: string | null };

export default async function ExpensesPage({ searchParams }: { searchParams: Promise<{ page?: string }> }) {
  const page = Math.max(1, Number.parseInt((await searchParams).page ?? "1", 10) || 1);
  const workspace = await getWorkspace();
  const supabase = await createClient();
  const { data, count } = await supabase
    .from("expenses")
    .select("id, name, category, amount, incurred_on, note", { count: "exact" })
    .eq("project_id", workspace.activeProject.id)
    .order("incurred_on", { ascending: false })
    .order("created_at", { ascending: false })
    .range((page - 1) * PAGE_SIZE, page * PAGE_SIZE - 1)
    .overrideTypes<Row[], { merge: false }>();

  const rows = data ?? [];
  const totalPages = Math.max(1, Math.ceil((count ?? 0) / PAGE_SIZE));
  const t = todayInTz(new Date(), workspace.activeProject.timezone);
  const today = `${t.y}-${String(t.m).padStart(2, "0")}-${String(t.d).padStart(2, "0")}`;
  const canWrite = ["owner", "admin", "analyst"].includes(workspace.activeOrganization.role);

  return (
    <div className="mx-auto max-w-5xl space-y-5">
      <header>
        <h2 className="text-lg font-semibold tracking-tight">Despesas</h2>
        <p className="text-muted">Custos manuais que entram no lucro e no ROI. Não afetam o ROAS.</p>
      </header>

      {canWrite ? <ExpenseForm today={today} /> : null}

      <section aria-label="Despesas registradas" className="overflow-x-auto rounded-xl border border-border bg-card">
        {rows.length === 0 ? (
          <p className="p-8 text-center text-muted">Nenhuma despesa registrada.</p>
        ) : (
          <table className="w-full min-w-[640px] text-left text-[13px]">
            <thead className="text-xs text-muted">
              <tr className="border-b border-border">
                {["Data", "Nome", "Categoria", "Valor", ""].map((h) => (
                  <th key={h} scope="col" className="px-3 py-2.5 font-medium">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id} className="border-b border-border last:border-0 hover:bg-card-hover">
                  <td className="whitespace-nowrap px-3 py-2.5 text-muted">{r.incurred_on.split("-").reverse().join("/")}</td>
                  <td className="px-3 py-2.5">
                    {r.name}
                    {r.note ? <span className="ml-2 text-xs text-muted">{r.note}</span> : null}
                  </td>
                  <td className="px-3 py-2.5 text-muted">{CATEGORY_LABEL[r.category] ?? r.category}</td>
                  <td className="px-3 py-2.5 tabular-nums">{formatCurrency(r.amount)}</td>
                  <td className="px-3 py-2.5 text-right">
                    {canWrite ? (
                      <form action={deleteExpense}>
                        <input type="hidden" name="id" value={r.id} />
                        <Button type="submit" variant="ghost" size="sm">
                          Excluir
                        </Button>
                      </form>
                    ) : null}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      {totalPages > 1 ? (
        <nav aria-label="Paginação" className="flex items-center justify-between text-xs text-muted">
          <span>
            Página {page} de {totalPages}
          </span>
          <div className="flex gap-2">
            {page > 1 ? <Link href={`/expenses?page=${page - 1}`} className="rounded-md border border-border px-3 py-1.5 hover:border-border-hover">Anterior</Link> : null}
            {page < totalPages ? <Link href={`/expenses?page=${page + 1}`} className="rounded-md border border-border px-3 py-1.5 hover:border-border-hover">Próxima</Link> : null}
          </div>
        </nav>
      ) : null}
    </div>
  );
}
