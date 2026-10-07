export const metadata = { title: "Política de Privacidade" };

const UPDATED = "07/10/2026";

export default function PrivacyPolicyPage() {
  const contact = process.env.PRIVACY_CONTACT_EMAIL;

  return (
    <main className="mx-auto max-w-2xl space-y-6 px-4 py-12 text-[13px] leading-relaxed text-muted">
      <header className="space-y-1">
        <h1 className="text-xl font-semibold tracking-tight text-foreground">Política de Privacidade</h1>
        <p className="text-xs">Última atualização: {UPDATED}</p>
      </header>

      <p>
        O UTeme é uma plataforma de acompanhamento de desempenho de anúncios e vendas. Esta política explica quais dados
        tratamos, para quê, por quanto tempo e quais são os seus direitos, em conformidade com a Lei Geral de Proteção de
        Dados (LGPD).
      </p>

      <section className="space-y-2">
        <h2 className="text-sm font-medium text-foreground">1. Dados que tratamos</h2>
        <ul className="list-disc space-y-1 pl-5">
          <li>
            <span className="text-foreground">Conta:</span> nome, e-mail e senha (armazenada apenas de forma protegida por
            criptografia/hash pelo provedor de autenticação).
          </li>
          <li>
            <span className="text-foreground">Dados da Meta (Facebook/Instagram), mediante sua autorização:</span> identificador
            e nome do seu perfil, contas de anúncios, Pixels, campanhas, conjuntos, anúncios e métricas de desempenho
            (investimento, impressões, cliques, conversões). Solicitamos somente a permissão de leitura de anúncios
            (<span className="font-mono">ads_read</span>). Não publicamos nem alteramos nada na sua conta.
          </li>
          <li>
            <span className="text-foreground">Dados de vendas:</span> pedidos enviados pelas plataformas de pagamento que você
            conectar, incluindo valores, status, forma de pagamento e dados do comprador (nome, e-mail, telefone e documento,
            quando enviados pela plataforma).
          </li>
          <li>
            <span className="text-foreground">Dados técnicos:</span> cookies de sessão necessários para manter você conectado e
            registros de segurança e auditoria.
          </li>
        </ul>
      </section>

      <section className="space-y-2">
        <h2 className="text-sm font-medium text-foreground">2. Para que usamos</h2>
        <p>
          Exclusivamente para operar o serviço: exibir indicadores, calcular receita líquida, lucro, ROI e ROAS, sincronizar
          campanhas e registrar vendas. Não vendemos dados, não os usamos para publicidade própria e não os compartilhamos
          com terceiros para fins de marketing.
        </p>
      </section>

      <section className="space-y-2">
        <h2 className="text-sm font-medium text-foreground">3. Com quem compartilhamos</h2>
        <p>
          Apenas com provedores de infraestrutura que processam os dados em nosso nome: hospedagem (Vercel) e banco de dados e
          autenticação (Supabase). Os dados de cada organização são isolados logicamente das demais.
        </p>
      </section>

      <section className="space-y-2">
        <h2 className="text-sm font-medium text-foreground">4. Segurança</h2>
        <p>
          Tokens de acesso da Meta e segredos de integração são armazenados criptografados e nunca são exibidos no navegador.
          O acesso aos dados é restrito por organização com controle de acesso em nível de linha no banco de dados. As
          comunicações usam HTTPS.
        </p>
      </section>

      <section className="space-y-2">
        <h2 className="text-sm font-medium text-foreground">5. Retenção e exclusão</h2>
        <p>
          Mantemos os dados enquanto a conta estiver ativa. Você pode desconectar a Meta a qualquer momento nas configurações
          de integração. Ao remover o aplicativo UTeme nas configurações do seu Facebook (Integrações de negócios), recebemos
          o aviso da Meta e excluímos a conexão, o token e os dados sincronizados por meio dela. As instruções estão em{" "}
          <a href="/data-deletion" className="text-info hover:underline">
            /data-deletion
          </a>
          .
        </p>
      </section>

      <section className="space-y-2">
        <h2 className="text-sm font-medium text-foreground">6. Seus direitos (LGPD)</h2>
        <p>
          Você pode solicitar confirmação de tratamento, acesso, correção, anonimização, portabilidade, eliminação dos dados e
          informações sobre compartilhamento, além de revogar o consentimento a qualquer momento.
          {contact ? (
            <>
              {" "}
              Para exercer seus direitos, escreva para <span className="text-foreground">{contact}</span>.
            </>
          ) : null}
        </p>
      </section>

      <section className="space-y-2">
        <h2 className="text-sm font-medium text-foreground">7. Alterações</h2>
        <p>Esta política pode ser atualizada. A data da última revisão consta no topo da página.</p>
      </section>
    </main>
  );
}
