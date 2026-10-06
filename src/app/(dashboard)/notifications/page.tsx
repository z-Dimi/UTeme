import Link from "next/link";
import { Button } from "@/components/ui/button";
import { markAllNotificationsRead } from "@/features/notifications/actions";
import { createClient } from "@/lib/supabase/server";
import { getWorkspace } from "@/server/services/workspace";

export const metadata = { title: "Notificações" };

type Row = { id: string; type: string; title: string; body: string | null; link: string | null; read_at: string | null; created_at: string };

export default async function NotificationsPage() {
  const workspace = await getWorkspace();
  const supabase = await createClient();
  const { data } = await supabase
    .from("notifications")
    .select("id, type, title, body, link, read_at, created_at")
    .eq("project_id", workspace.activeProject.id)
    .order("created_at", { ascending: false })
    .limit(100)
    .overrideTypes<Row[], { merge: false }>();
  const rows = data ?? [];
  const unread = rows.filter((r) => !r.read_at).length;
  const fmt = (iso: string) =>
    new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short", timeZone: workspace.activeProject.timezone }).format(new Date(iso));

  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <header className="flex items-end justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold tracking-tight">Notificações</h2>
          <p className="text-muted">Falhas de webhook, chargebacks e outros alertas do projeto.</p>
        </div>
        {unread > 0 ? (
          <form action={markAllNotificationsRead}>
            <Button type="submit" variant="secondary" size="sm">
              Marcar todas como lidas
            </Button>
          </form>
        ) : null}
      </header>

      <section className="overflow-hidden rounded-xl border border-border bg-card">
        {rows.length === 0 ? (
          <p className="p-8 text-center text-muted">Nenhuma notificação.</p>
        ) : (
          <ul className="divide-y divide-border">
            {rows.map((n) => (
              <li key={n.id} className="flex gap-3 px-4 py-3">
                <span
                  aria-label={n.read_at ? "Lida" : "Não lida"}
                  className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${n.read_at ? "bg-transparent" : n.type === "chargeback_received" || n.type === "webhook_failed" ? "bg-danger" : "bg-info"}`}
                />
                <div className="min-w-0 flex-1">
                  <p className="text-[13px] font-medium">{n.title}</p>
                  {n.body ? <p className="text-xs text-muted">{n.body}</p> : null}
                  <p className="mt-0.5 text-[11px] text-muted">
                    {fmt(n.created_at)}
                    {n.link ? (
                      <>
                        {" · "}
                        <Link href={n.link} className="text-info hover:underline">
                          Ver detalhes
                        </Link>
                      </>
                    ) : null}
                  </p>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
