# ADR 0001 — Monolito modular em Next.js para o MVP

## Status
Aceito

## Contexto
O produto precisa validar rapidamente o fluxo principal de scan de tecnologias por URL unica e em lote, com baixo custo operacional inicial.

## Decisao
Adotar arquitetura monolitica modular com Next.js (frontend + API) e motor de deteccao interno.

## Consequencias
- Positivas:
  - Entrega acelerada e menor complexidade operacional no inicio.
  - Base unica para evolucao de UI e backend.
- Negativas:
  - Processamento de jobs em memoria nao persiste entre reinicios.
  - Escalabilidade horizontal limitada sem fila externa.

## Plano de revisao
Revisar esta decisao quando houver:
- necessidade de historico persistente de scans,
- volume continuo de lotes grandes,
- necessidade de SLO mais rigido para processamento assincrono.
