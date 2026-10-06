# ROI Meta

Plataforma SaaS de performance, atribuição e financeiro para operações de Meta Ads.
Meta fornece investimento e conversões atribuídas; o gateway de pagamento fornece a verdade financeira.
As duas fontes são sempre mostradas separadamente.

## Stack

Next.js 16 (App Router) · React 19 · TypeScript · Tailwind v4 · Supabase (Postgres, Auth, RLS) · Zod · Recharts · Motion · Vitest

## Setup local

```bash
npm install
cp .env.example .env.local   # preencha as chaves do Supabase
npm run dev
```

### Supabase

1. Crie um projeto no Supabase e copie URL, anon key e service role key para `.env.local`.
2. Aplique as migrations em `supabase/migrations/` (SQL editor, ou `supabase db push` com a CLI).
3. Em Authentication → URL Configuration, adicione `APP_URL/auth/callback` às Redirect URLs.

`SUPABASE_SERVICE_ROLE_KEY` é usada somente no servidor (`src/lib/supabase/admin.ts`).

## Scripts

| Comando | O que faz |
| --- | --- |
| `npm run dev` | servidor de desenvolvimento |
| `npm run lint` | ESLint |
| `npm run typecheck` | `tsc --noEmit` (rode `next build` uma vez para gerar os tipos de rotas) |
| `npm test` | testes unitários (Vitest) |
| `npm run build` | build de produção |

## Estrutura

```
src/app/            rotas (auth, onboarding, dashboard, api)
src/features/       ações e UI por domínio
src/components/     ui/ (primitivas) e layout/
src/lib/            supabase, formatting, validation
src/server/         services, repositories, adapters, jobs
supabase/migrations schema + RLS
docs/               arquitetura e definições financeiras
```

Regras visuais de ROI/lucro (sinal sempre visível, verde/vermelho/neutro, `—` para dado indisponível) vivem em
`src/lib/formatting` e não devem ser duplicadas em componentes.

## Status

Implementado e testado: auth, organizações/projetos com RLS, webhooks Cakto e personalizado (HMAC, idempotência, state
machine), pedidos com snapshot financeiro, motor de taxas/impostos/custos com simulador, resumo (receita líquida,
reembolsos, taxas, pendentes, resultado por horário), despesas, relatórios CSV, eventos com reprocessamento e
notificações.

Depende de credenciais/decisões: conexão Meta Ads (OAuth, sincronização, métricas, funil), Krowk Pay (precisa da
documentação do webhook). Itens ainda não disponíveis aparecem como "Em breve" ou `—`.

Veja `docs/ARCHITECTURE.md`, `docs/WEBHOOKS.md`, `docs/FINANCE.md` e `docs/DEPLOYMENT.md`.
