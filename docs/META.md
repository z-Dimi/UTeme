# Meta Ads

## Conexão (OAuth manual, servidor)

1. `GET /api/meta/connect` (sessão obrigatória, owner/admin): gera `state` aleatório, grava em cookie httpOnly
   (`state.projectId`, 10 min) e redireciona para `https://www.facebook.com/{versão}/dialog/oauth` com
   `scope=ads_read`.
2. `GET /api/meta/callback`: confere `state` (tempo constante) e o projeto ativo, troca `code` -> token curto -> token longo
   (~60 dias, `fb_exchange_token`), confere as permissões concedidas e grava o token **cifrado** (AES-GCM).
   A coluna do token não tem `GRANT` para clientes.
3. `/integrations/meta`: lista contas de anúncio (`/me/adaccounts`) e Pixels (`/{act}/adspixels`). A seleção é
   revalidada no servidor contra o que o token enxerga (nunca confia no formulário) e exige moeda igual à do projeto.
4. Ao concluir, o backfill de 30 dias roda em segundo plano (`after()`), em 5 janelas de 7 dias, mais recente primeiro,
   com progresso persistido em `backfill_progress` (a tela consulta `/api/meta/status`).

Configuração no app Meta (Facebook Login → Settings):

| Campo | Valor |
| --- | --- |
| Valid OAuth Redirect URIs | `{APP_URL}/api/meta/callback` |
| Deauthorize Callback URL | `{APP_URL}/api/meta/deauthorize` |
| Data Deletion Request URL | `{APP_URL}/api/meta/data-deletion` |

`deauthorize` e `data-deletion` validam o `signed_request` (HMAC-SHA256 com o App Secret). A exclusão apaga conexão,
token, campanhas, conjuntos, anúncios e métricas daquele usuário Meta (pedidos do gateway não são dados da Meta).

## Dados

- `meta_metrics_daily`: um registro por anúncio/dia (dia = fuso da **conta de anúncios**), dinheiro em centavos.
- Ações: para cada evento (compra, IC, add to cart...) usa-se **um único** `action_type` por prioridade
  (`omni_*` > nome padrão > `offsite_conversion.fb_pixel_*`). Somar tipos repetiria a mesma conversão.
- `reach`/`frequency` são guardados mas não somados em agregações (não são aditivos).
- Dashboard e tabelas leem só do nosso banco; a Meta nunca é consultada no carregamento da página.

## Sincronização

| Modo | Janela | Gatilho |
| --- | --- | --- |
| live | só hoje (nas primeiras 3 h do dia também ontem) | **automático a cada ~60 s** enquanto o Resumo/Meta Ads estiver aberto e visível; `GET /api/cron/meta/live` para agendador externo. Uma chamada leve, sem estrutura; só deixa registro em `sync_runs` se falhar |
| recent | hoje + ontem + nomes de campanhas/anúncios | botão Atualizar (cooldown 15 s) ou `GET /api/cron/meta/recent` |
| reconcile | 7 dias | `GET /api/cron/meta/reconcile` |
| deep | 30 dias | `GET /api/cron/meta/deep` |

Rotas de cron exigem `Authorization: Bearer $CRON_SECRET`. Para agendar na Vercel, adicione `vercel.json`
(frequências de 15 min exigem plano que permita):

```json
{ "crons": [
  { "path": "/api/cron/meta/recent", "schedule": "*/15 * * * *" },
  { "path": "/api/cron/meta/reconcile", "schedule": "0 * * * *" },
  { "path": "/api/cron/meta/deep", "schedule": "0 5 * * *" }
] }
```

Upserts são idempotentes (`unique(project_id, date, ad_id)`), então reexecutar ou retomar um backfill interrompido é seguro.
Erros transitórios da Meta (códigos 1, 2, 4, 17, 32, 341, 613 e HTTP 5xx) têm até 3 tentativas com backoff;
erro 190 (token) marca a conexão como `error` e gera notificação (uma por dia).

## Testes

`npm run test:integration` roda o motor de sincronização contra o Supabase real com a Graph API simulada
(paginação, mapeamento em centavos, idempotência, reatribuição, falha/notificação, token fora dos logs, RLS).
