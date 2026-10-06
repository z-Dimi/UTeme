# Definições financeiras

Dinheiro é sempre inteiro em centavos (`bigint`). Nunca float.

| Métrica | Fórmula |
| --- | --- |
| Gross Revenue | vendas aprovadas antes de deduções (mantido para auditoria mesmo após reembolso) |
| Net Revenue | receita aprovada − reembolsos − chargebacks − taxas de gateway − impostos |
| Profit | Net Revenue − Ad Spend − Custos de produto − Despesas |
| ROAS | Receita / Ad Spend (`—` se Ad Spend = 0) |
| ROI | Profit / Custos totais (`—` se custos = 0). Exibido como razão: 0,25 → `+0,25` |
| Margin | Profit / Net Revenue |
| CPA Meta | spend / compras Meta |
| ROAS Meta | valor de compra Meta / spend |

## Regras de exibição

- ROI/lucro > 0: verde, com `+`. < 0: vermelho, **sempre** com `-`. = 0 (após arredondamento): cinza, sem sinal.
- Dado indisponível (`null`) → `—`. Zero real → `0`. Nunca confundir.
- Variação de período respeita a direção da métrica (CPA subir é ruim; spend é neutro).
- Implementação única em `src/lib/formatting`; testes em `formatting.test.ts`.

As funções de cálculo (`calculateProfit`, `calculateROI`, …) serão adicionadas em `src/lib/finance` na Fase 2/3, com testes.
