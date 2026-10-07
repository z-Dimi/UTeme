export const metadata = { title: "Exclusão de dados" };

export default async function DataDeletionPage({ searchParams }: { searchParams: Promise<{ code?: string }> }) {
  const { code } = await searchParams;
  const confirmation = code?.replace(/[^a-f0-9]/gi, "").slice(0, 32);

  return (
    <main className="mx-auto flex min-h-screen max-w-xl flex-col justify-center gap-4 px-4 py-10">
      <h1 className="text-xl font-semibold tracking-tight">Exclusão de dados</h1>

      {confirmation ? (
        <p role="status" className="rounded-lg border border-border bg-card p-3 text-[13px]">
          Sua solicitação foi recebida e os dados recebidos da Meta associados à sua conta (conexão, token de acesso,
          campanhas e métricas sincronizadas) foram excluídos. Código de confirmação:{" "}
          <span className="font-mono">{confirmation}</span>
        </p>
      ) : null}

      <section className="space-y-2 text-[13px] text-muted">
        <h2 className="text-sm font-medium text-foreground">Como excluir os dados que recebemos da Meta</h2>
        <ol className="list-decimal space-y-1.5 pl-5">
          <li>Acesse o Facebook em Configurações e privacidade → Configurações → Integrações de negócios.</li>
          <li>Localize o aplicativo UTeme e clique em Remover.</li>
          <li>Marque a opção para excluir também as informações já compartilhadas e confirme.</li>
        </ol>
        <p>
          Ao remover o aplicativo, a Meta nos envia uma solicitação automática e excluímos a sua conexão, o token de
          acesso e as campanhas, anúncios e métricas sincronizados por meio dela.
        </p>
        <p>
          Dados de vendas recebidos de plataformas de pagamento não vêm da Meta e são geridos pelo administrador da sua
          organização no UTeme.
        </p>
      </section>
    </main>
  );
}
