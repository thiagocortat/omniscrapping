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
- Endpoint síncrono para integração n8n na análise de hotel
- Modo `Detectar tudo`
- Modo `Detectar tecnologia especifica`
- Estrategia de scan `static` (HTML) ou `browser` (Playwright)
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
npx playwright install chromium
npm run dev
npm run worker:scan
```

Acesse `http://localhost:3000`.

Configure `REDIS_URL` no ambiente para API e worker.
Para a integração n8n do scanner de hotel, configure também `N8N_HOTEL_API_KEY`.

## Endpoint n8n para hotel
Endpoint:
```bash
POST /api/integrations/n8n/hotel/analyze
```

Headers:
```bash
x-api-key: $N8N_HOTEL_API_KEY
content-type: application/json
```

Payload:
```json
{
  "url": "https://hotel-exemplo.com.br",
  "requestId": "lead-123",
  "options": {
    "includeEvidence": false
  }
}
```

Resposta de sucesso:
```json
{
  "requestId": "lead-123",
  "status": "completed",
  "result": {
    "url": "https://hotel-exemplo.com.br",
    "normalizedUrl": "https://hotel-exemplo.com.br",
    "finishedAt": "2026-03-24T12:00:00.000Z",
    "pagesVisited": [],
    "performance": {},
    "seo": {},
    "technologies": [],
    "booking": {},
    "summary": {}
  },
  "meta": {
    "durationMs": 1820,
    "includeEvidence": false
  }
}
```

Resposta de erro:
```json
{
  "requestId": "lead-123",
  "status": "failed",
  "error": {
    "code": "INVALID_URL",
    "message": "URL inválida ou bloqueada pela política de segurança."
  }
}
```

## Observacoes do MVP
- Jobs e resultados ficam em Redis (sem dependência de banco relacional).
- Exportacao XLSX ainda nao implementada.
- Deteccao usa heuristicas iniciais por assinaturas.
- URLs privadas/locais sao bloqueadas por seguranca (SSRF guard).
- Limite de 1000 URLs por job.
- Cada URL possui tentativas automáticas (resiliência em lote).
- O modo `browser` executa JavaScript real e captura sinais de runtime (mais preciso, com maior custo de CPU/RAM).
- Para produção em Vercel, execute o worker em processo separado (Railway/Render/Fly/VPS) apontando para o mesmo `REDIS_URL`.

## Deploy em VPS com Docker Compose
Pré-requisitos:
- Docker + Docker Compose plugin

Subir stack completa (web + worker + redis):
```bash
docker compose up -d --build
```

Rodar local com porta publicada no host (`localhost:3000`):
```bash
docker compose -f docker-compose.yml -f docker-compose.local.yml up -d --build
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

Notas de ambiente:
- `docker-compose.yml` (base) usa `expose` para evitar conflito de porta em ambientes com proxy (Dokploy).
- `docker-compose.local.yml` publica `3000:3000` apenas para desenvolvimento local.
