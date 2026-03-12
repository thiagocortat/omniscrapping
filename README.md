# TechStack Scanner

MVP baseado no PRD para detectar tecnologias de websites com modo amplo e modo especifico.

## Stack
- Next.js 16 + React 19 + TypeScript
- Tailwind CSS
- API Routes no App Router
- Redis + BullMQ para fila distribuida

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
- Abortar job em execução/lote
- Exportacao CSV
- Exemplo dedicado para deteccao de RD Station com heuristicas reforcadas

## Como rodar
```bash
npm install
npm run dev
npm run worker:scan
```

Acesse `http://localhost:3000`.

Configure `REDIS_URL` no ambiente para API e worker.

## Observacoes do MVP
- Jobs e resultados ficam em Redis (sem dependência de banco relacional).
- Exportacao XLSX ainda nao implementada.
- Deteccao usa heuristicas iniciais por assinaturas.
- URLs privadas/locais sao bloqueadas por seguranca (SSRF guard).
- Limite de 1000 URLs por job.
- Cada URL possui tentativas automáticas (resiliência em lote).
- Para produção em Vercel, execute o worker em processo separado (Railway/Render/Fly/VPS) apontando para o mesmo `REDIS_URL`.

## Deploy em VPS com Docker Compose
Pré-requisitos:
- Docker + Docker Compose plugin

Subir stack completa (web + worker + redis):
```bash
docker compose up -d --build
```

Ver logs:
```bash
docker compose logs -f web worker
```

Parar stack:
```bash
docker compose down
```

A aplicação ficará em `http://IP_DA_VPS:3000`.
