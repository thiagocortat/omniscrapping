# Arquitetura Inicial — TechStack Scanner

## 1) Contexto e suposicoes
- Objetivo: entregar MVP funcional para scan unitario/lote com deteccao ampla e especifica.
- Time-to-market e simplicidade operacional sao prioridade sobre escalabilidade extrema.
- Escopo atual: app web unica, API e processamento de jobs em memoria.
- Suposicao: ambiente inicial de uso interno/demo, sem necessidade imediata de multi-tenant.

## 2) Drivers arquiteturais priorizados
- Velocidade de entrega
- Robustez basica em lote (falha por URL nao derruba job)
- Evolucao incremental para fila persistente e worker separado
- Observabilidade minima (status por item, erros por URL)

## 3) Opcoes consideradas e trade-offs

### Opcao A: Monolito modular em Next.js (recomendada para inicio)
- Pro: entrega mais rapida, menos moving parts, custo operacional baixo.
- Pro: frontend e API no mesmo repositorio, onboarding simples.
- Contra: fila em memoria limita confiabilidade em restart.
- Contra: throughput limitado para lotes muito grandes.

### Opcao B: Next.js + backend separado (NestJS) desde o dia 1
- Pro: melhor separacao de responsabilidades e escalabilidade.
- Pro: fila e workers mais naturais desde inicio.
- Contra: maior custo de setup, maior superficie de falha.
- Contra: reduz velocidade da primeira entrega.

### Opcao C: Event-driven completo com servicos dedicados
- Pro: alta escalabilidade e isolamento.
- Contra: over-engineering para MVP, custo operacional e cognitivo alto.

## 4) Arquitetura recomendada
- Frontend: Next.js App Router + Tailwind.
- API: route handlers em `/app/api/*`.
- Engine de deteccao: modulo dedicado (`lib/scan-engine.ts`) com catalogo de assinaturas (`lib/signatures.ts`).
- Orquestracao de jobs: `lib/job-store.ts` (estado em memoria + concorrencia controlada).
- Persistencia (proxima fase): Postgres + Prisma para jobs/resultados e Redis/BullMQ para fila.

### Limites de dominio
- `Scan Intake`: validacao/normalizacao de URLs, escolha de modo.
- `Scan Execution`: fetch, parsing, matching, scoring.
- `Job Orchestration`: fila, progresso, retry.
- `Reporting`: tabela consolidada e exportacao CSV.

## 5) Riscos e mitigacao
- Reinicio de processo perde jobs em andamento.
  - Mitigacao: migrar para Redis/BullMQ + banco na fase seguinte.
- Bloqueio anti-bot / timeout em dominios.
  - Mitigacao: timeout por URL, status de erro isolado, retry manual.
- Falso positivo/negativo por heuristica simples.
  - Mitigacao: expandir assinatura, pesos por evidencia e feedback loop.

## 6) Plano incremental
1. MVP atual: scan unitario/lote, modo all/specific, retry, export CSV.
2. Persistencia: Postgres + Prisma para historico e auditoria.
3. Processamento robusto: BullMQ + worker dedicado + Redis.
4. Deteccao avancada: renderizacao headless opcional (Playwright) e catalogo ampliado.
5. Exportacao XLSX real e filtros avancados.

## 7) ADR resumido
- Decisao: iniciar com monolito modular em Next.js.
- Motivacao: reduzir lead time e validar fluxo de negocio rapidamente.
- Consequencia: necessidade planejada de migrar fila/persistencia para componentes dedicados.
