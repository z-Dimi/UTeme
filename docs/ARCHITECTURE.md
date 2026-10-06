# Arquitetura

## Camadas

```
src/app          rotas (Server Components + route handlers), sem regra de negócio
src/features     server actions + UI de cada domínio (auth, fees, expenses, integrations, events, settings)
src/server       adapters (gateways), services (ingestão, regras, resumo, notificações), webhooks
src/lib          funções puras e testáveis: finance, formatting, dates, money, csv, crypto, validation
supabase         migrations (schema + RLS + RPCs)
```

Regra: dinheiro e métricas só são calculados em `src/lib/finance`; só são formatados em `src/lib/formatting`.

## Multi-tenant

`organization -> projects`. Toda tabela de negócio carrega `organization_id` e `project_id`.
- **Leitura:** cliente do usuário (JWT) + RLS (`is_org_member`). Funções SQL de agregação são `SECURITY INVOKER`.
- **Escrita:** apenas servidor (service role) depois de checar papel; `organization_id`/`project_id` vêm do workspace
  resolvido no servidor, nunca do formulário.
- A coluna de segredo de `integrations` não tem `GRANT` para `authenticated`.
- Teste de isolamento: `npm run test:rls`.

## Fluxo de dinheiro

1. Webhook -> `webhook_events` (cru, sem credenciais) -> adapter -> evento normalizado (centavos).
2. `applyOrderEvent`: state machine + compare-and-set; na aprovação resolve regras (`fee_rules`) pela vigência e
   especificidade e congela `fee_snapshot`.
3. `orders` guarda bruto, taxa, imposto, custo de produto, reembolso, chargeback e líquido.
4. Resumo agrega `orders` (por data de aprovação) + `expenses` via RPCs e calcula ROI/ROAS/margem em `lib/finance`.

## Decisões

- Next 16: `proxy.ts` no lugar de `middleware.ts`; Cache Components desativado (app todo autenticado).
- Regras financeiras são imutáveis: mudar uma taxa encerra a regra (`valid_until`) e cria outra. Vendas antigas
  mantêm o snapshot.
- Reembolso/chargeback: receita e imposto são revertidos; a taxa do gateway permanece (gateways normalmente a retêm).
- Sem Meta conectada: gastos, ROAS, lucro, ROI e margem ficam `—` (lucro sem anúncios superestimaria o resultado).

## Pendente

Meta (OAuth, sync, métricas, funil), motor de recálculo em lote de histórico, rate limiting, API keys, assinaturas
do gateway, seed de desenvolvimento.
