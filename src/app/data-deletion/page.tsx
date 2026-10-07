export const metadata = { title: "Exclusão de dados" };

export default async function DataDeletionPage({ searchParams }: { searchParams: Promise<{ code?: string }> }) {
  const { code } = await searchParams;
  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col justify-center gap-3 px-4">
      <h1 className="text-xl font-semibold tracking-tight">Exclusão de dados</h1>
      <p className="text-muted">
        Os dados recebidos da Meta associados à sua conta (conexão, token de acesso, campanhas e métricas
        sincronizadas) foram excluídos.
      </p>
      {code ? (
        <p className="text-xs text-muted">
          Código de confirmação: <span className="font-mono text-foreground">{code.replace(/[^a-f0-9]/gi, "").slice(0, 32)}</span>
        </p>
      ) : null}
    </main>
  );
}
