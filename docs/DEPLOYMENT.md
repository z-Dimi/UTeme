# Deploy (Vercel + Supabase)

1. **Supabase:** crie o projeto, rode `supabase link --project-ref <ref>` e `supabase db push` (aplica `supabase/migrations`).
   Em Authentication → URL Configuration: Site URL = `APP_URL` e Redirect URLs com `APP_URL/auth/callback`.
2. **Vercel:** importe o repositório (Framework: Next.js) e configure as variáveis abaixo.
3. **Domínio:** adicione o domínio em *Settings → Domains* de **um único** projeto Vercel que faça deploy deste repositório.

| Variável | Observação |
| --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` / `NEXT_PUBLIC_SUPABASE_ANON_KEY` | chave publishable |
| `SUPABASE_SERVICE_ROLE_KEY` | segredo, somente servidor |
| `APP_URL` | URL pública (usada nas URLs de webhook e e-mails de auth) |
| `ENCRYPTION_KEY` | 32 bytes em base64 (`openssl rand -base64 32`). Trocar invalida segredos já salvos |
| `CRON_SECRET` | para os jobs da Meta (fase seguinte) |
| `META_APP_ID`, `META_APP_SECRET`, `META_REDIRECT_URI` | quando a conexão Meta for habilitada |

## Verificação pós-deploy

```bash
BASE_URL=https://seu-dominio npm run test:e2e   # webhooks, idempotência, taxas, notificações (cria e apaga dados de teste)
npm run test:rls                                 # isolamento entre organizações
```
