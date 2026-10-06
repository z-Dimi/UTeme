import { Plug } from "lucide-react";

export const metadata = { title: "Resumo" };

export default function SummaryPage() {
  return (
    <section className="mx-auto max-w-3xl pt-10">
      <div className="rounded-xl border border-border bg-card p-8 text-center">
        <div className="mx-auto mb-3 grid h-9 w-9 place-items-center rounded-lg bg-surface text-muted">
          <Plug className="h-4 w-4" aria-hidden />
        </div>
        <h2 className="text-base font-semibold">Nenhuma conta Meta conectada</h2>
        <p className="mt-1 text-muted">
          Conecte sua conta para começar. Os indicadores aparecem aqui assim que houver dados reais.
        </p>
      </div>
    </section>
  );
}
