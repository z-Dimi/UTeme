# Webhooks

URL por integração: `POST {APP_URL}/api/webhooks/{provider}/{integrationId}` (`provider` = `cakto` | `custom`).

## Pipeline

```
HTTP -> resolve integration (404 se inexistente/inativa/provider errado)
     -> verify (401, nada é gravado)
     -> adapter.parse (valida e normaliza, sem regra de negócio)
     -> grava webhook_events (payload sem credenciais)   <- unique(integration_id, fingerprint)
     -> applyOrderEvent (state machine + compare-and-set) -> orders / order_items / order_events
     -> webhook_events.status = processed | ignored | failed
```

Depois que o evento é gravado a resposta é sempre `2xx`: falhas ficam visíveis no inbox (`status = failed`) e um reenvio
do mesmo evento reprocessa (`attempt_count + 1`). A Cakto não faz retry automático de respostas não-2xx.

## Idempotência

- Cakto: chave `"{event}:{data.id}"` (o mesmo pedido gera eventos distintos: aprovado, reembolso, ...). Entregas V2
  (array) usam a junção dos ids.
- Custom: `event_id`.
- Reentrega de evento `processed`/`ignored` é descartada (`duplicate: true`). Mesmo que passasse, a state machine
  torna a repetição um no-op.

## State machine de pedidos

`pending -> approved | cancelled | failed`, `approved -> refunded | chargeback`, `failed -> pending | approved`.
Qualquer outra transição é rejeitada (evento atrasado não regride pedido) e registrada em `order_events` como `rejected`.

## Cakto

Contrato: <https://docs.cakto.com.br/conceitos/webhooks>

- Assinatura: `X-Cakto-Signature: v1=<hmac-sha256>` sobre `"{X-Cakto-Timestamp}.{corpo cru}"`, tolerância de 5 min.
  Se o header existir e for inválido, não há fallback. Sem header, valida o `secret` do corpo (comparação em tempo constante).
- Eventos de pedido: `purchase_approved` (approved), `pix_gerado`/`boleto_gerado`/`picpay_gerado`/`openfinance_nubank_gerado`
  (pending), `purchase_refused` (failed), `refund` (refunded), `chargeback` (chargeback).
- Ignorados (gravados com motivo): `initiate_checkout`, `checkout_abandonment`, `refund_requested`, todos `subscription_*`
  (assinaturas ainda não modeladas) e eventos desconhecidos.
- Dinheiro: `amount`/`baseAmount`/`fees` chegam como número e `discount` como string; tudo vira centavos inteiros.
- Reembolso/chargeback são tratados como totais (o payload documentado não traz valor parcial).
- `fees` informado pela Cakto fica apenas no payload bruto; as taxas do projeto virão do motor de taxas (Fase 3).

## Webhook personalizado

Assinatura igual (`X-Webhook-Timestamp`, `X-Webhook-Signature: v1=<hmac-sha256(secret, "{ts}.{body}")>`), dinheiro em centavos inteiros:

```json
{
  "event_id": "evt_123",
  "order_id": "ord_1",
  "status": "approved",
  "occurred_at": "2026-06-01T10:00:00Z",
  "currency": "BRL",
  "gross_amount": 19700,
  "discount_amount": 0,
  "payment_method": "pix",
  "installments": 1,
  "customer": { "name": "Ana", "email": "ana@exemplo.com" },
  "products": [{ "id": "p1", "name": "Curso", "quantity": 1, "unit_amount": 19700 }],
  "tracking": { "utm_source": "fb" }
}
```

`status`: `pending | approved | refunded | chargeback | cancelled | failed`.

## Segurança

- Segredos cifrados com AES-256-GCM (`ENCRYPTION_KEY`), coluna fora dos grants de `authenticated`.
- `secret` e headers de assinatura são removidos antes de gravar o payload.
- Limite de 1 MB por requisição. Rate limit: pendente (Fase de hardening).

## Testes

`npm test` (adapters, assinatura, normalização, cripto) e `npm run test:e2e` (contra um deploy + Supabase real:
idempotência, refund, regressão bloqueada, assinatura inválida, chargeback fora de ordem, payload sem credenciais).
