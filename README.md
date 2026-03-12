# TechStack Scanner

MVP baseado no PRD para detectar tecnologias de websites com modo amplo e modo especifico.

## Stack
- Next.js 15 + React 19 + TypeScript
- Tailwind CSS
- API Routes no App Router

## Funcionalidades implementadas
- Analise por URL unica
- Analise em lote (lista manual)
- Upload CSV (primeira coluna)
- Modo `Detectar tudo`
- Modo `Detectar tecnologia especifica`
- Score de confianca por evidencia
- Fila assíncrona com workers concorrentes
- Retry automático com backoff para falhas transitórias
- Progresso de job e retry manual de falhas
- Exportacao CSV
- Exemplo dedicado para deteccao de RD Station com heuristicas reforcadas

## Como rodar
```bash
npm install
npm run dev
```

Acesse `http://localhost:3000`.

## Observacoes do MVP
- Jobs e resultados ficam em memoria (reinicio apaga estado).
- Exportacao XLSX ainda nao implementada.
- Deteccao usa heuristicas iniciais por assinaturas.
- URLs privadas/locais sao bloqueadas por seguranca (SSRF guard).
- Limite de 1000 URLs por job.
- Cada URL possui tentativas automáticas (resiliência em lote).
