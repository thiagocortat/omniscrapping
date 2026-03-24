# Integração n8n - Hotel Analyze

## Objetivo
Este endpoint foi criado para uso via n8n no fluxo de análise unitária de hotéis.

Cada chamada envia uma única URL de hotel e recebe uma única resposta JSON com o resultado completo da análise.

O endpoint não usa o fluxo de jobs em lote da interface `/hotel`.

## Endpoint
```http
POST /api/integrations/n8n/hotel/analyze
```

Exemplo em produção:
```text
https://SEU-DOMINIO/api/integrations/n8n/hotel/analyze
```

## Autenticação
Enviar o header:

```http
x-api-key: SUA_CHAVE
```

A chave deve ser igual ao valor de `N8N_HOTEL_API_KEY` configurado no ambiente da aplicação.

Em outras palavras:
- você escolhe um valor secreto, por exemplo `minha-chave-super-segura`
- configura esse valor como `N8N_HOTEL_API_KEY` no container ou servidor da aplicação
- envia esse mesmo valor no header `x-api-key` da chamada feita pelo n8n

Se a chave estiver ausente ou inválida, a API responde `401`.

Exemplo de configuração no ambiente da aplicação:
```bash
N8N_HOTEL_API_KEY=minha-chave-super-segura
```

## Headers obrigatórios
```http
content-type: application/json
x-api-key: SUA_CHAVE
```

## Body da requisição
```json
{
  "url": "https://hotel-exemplo.com.br",
  "requestId": "lead-123",
  "options": {
    "includeEvidence": false
  }
}
```

## Campos do body
- `url`: obrigatório. URL pública do hotel.
- `requestId`: opcional. ID de correlação do fluxo no n8n, CRM ou outra origem.
- `options.includeEvidence`: opcional. Quando `true`, devolve evidências detalhadas de tecnologias e booking. Quando omitido ou `false`, a resposta fica mais enxuta.

## Regras de URL
- A URL pode ser enviada com ou sem protocolo.
- A API normaliza a URL internamente.
- URLs privadas, locais ou bloqueadas por política SSRF são recusadas.

Exemplos inválidos:
- `http://localhost:3000`
- `http://127.0.0.1`
- `http://10.0.0.1`

## Resposta de sucesso
Status HTTP: `200`

O campo `status` dentro do JSON pode ser:
- `completed`: análise concluída
- `failed`: a análise terminou, mas o site não pôde ser processado corretamente

Exemplo:
```json
{
  "requestId": "lead-123",
  "status": "completed",
  "result": {
    "url": "https://hotel-exemplo.com.br",
    "normalizedUrl": "https://hotel-exemplo.com.br",
    "status": "completed",
    "finishedAt": "2026-03-24T12:00:00.000Z",
    "pagesVisited": [
      "https://hotel-exemplo.com.br"
    ],
    "performance": {
      "score": 82,
      "timeToFirstByteMs": 420,
      "firstContentfulPaintMs": 1300,
      "domContentLoadedMs": 1800,
      "loadMs": 2600,
      "requestCount": 38,
      "transferSizeKb": 690,
      "notes": []
    },
    "seo": {
      "score": 76,
      "title": "Hotel Exemplo",
      "titleLength": 13,
      "metaDescriptionLength": 124,
      "hasCanonical": true,
      "hasRobots": true,
      "hasViewport": true,
      "h1Count": 1,
      "imageCount": 18,
      "imagesWithAlt": 17,
      "structuredDataTypes": [
        "Hotel"
      ],
      "openGraphTags": [
        "og:title"
      ],
      "issues": []
    },
    "technologies": [
      {
        "name": "Google Tag Manager",
        "category": "tag-manager",
        "confidence": 96,
        "summary": "script em script-src: googletagmanager.com",
        "evidences": []
      }
    ],
    "booking": {
      "status": "configured",
      "reserveLabels": [
        "Reservar"
      ],
      "reserveEntryPoints": [
        "https://booking.engine/exemplo"
      ],
      "actions": [
        "Tentou preencher check-in."
      ],
      "warnings": [],
      "fields": {
        "hotelSelector": true,
        "checkIn": true,
        "checkOut": true,
        "guests": true,
        "children": false
      },
      "bookingEngine": "Omnibees",
      "finalUrl": "https://booking.engine/exemplo",
      "evidence": []
    },
    "summary": {
      "overallScore": 81,
      "adsTags": [],
      "crmTools": [],
      "analyticsTools": [
        "Google Analytics"
      ],
      "tagManagers": [
        "Google Tag Manager"
      ],
      "bookingEngines": [
        "Omnibees"
      ]
    }
  },
  "meta": {
    "durationMs": 1820,
    "includeEvidence": false
  }
}
```

## Respostas de erro

### 401 Unauthorized
```json
{
  "requestId": null,
  "status": "failed",
  "error": {
    "code": "UNAUTHORIZED",
    "message": "Credenciais inválidas para a integração."
  }
}
```

### 400 Invalid JSON
```json
{
  "requestId": null,
  "status": "failed",
  "error": {
    "code": "INVALID_JSON",
    "message": "Body JSON inválido."
  }
}
```

### 400 Invalid URL
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

### 500 Server Error
```json
{
  "requestId": "lead-123",
  "status": "failed",
  "error": {
    "code": "SERVER_ERROR",
    "message": "Falha ao executar a análise de hotel."
  }
}
```

## Configuração sugerida no n8n

### Nó HTTP Request
- Method: `POST`
- URL: `https://SEU-DOMINIO/api/integrations/n8n/hotel/analyze`
- Send Headers: `true`
- Header `content-type`: `application/json`
- Header `x-api-key`: valor da chave compartilhada
- Send Body: `true`
- Body Content Type: `JSON`

### Body JSON sugerido
```json
{
  "url": "={{ $json.url }}",
  "requestId": "={{ $json.id }}",
  "options": {
    "includeEvidence": false
  }
}
```

## Exemplo de teste com curl
Se a aplicação estiver publicada em `http://localhost:3000`:

```bash
curl -X POST "http://localhost:3000/api/integrations/n8n/hotel/analyze" \
  -H "content-type: application/json" \
  -H "x-api-key: minha-chave-super-segura" \
  -d '{
    "url": "https://www.villagroup.com.mx/",
    "requestId": "teste-manual-001",
    "options": {
      "includeEvidence": false
    }
  }'
```

Se estiver usando Docker Compose com variável de ambiente, um fluxo típico é:

```bash
export N8N_HOTEL_API_KEY=minha-chave-super-segura

curl -X POST "http://localhost:3000/api/integrations/n8n/hotel/analyze" \
  -H "content-type: application/json" \
  -H "x-api-key: ${N8N_HOTEL_API_KEY}" \
  -d '{
    "url": "https://www.villagroup.com.mx/",
    "requestId": "teste-manual-001",
    "options": {
      "includeEvidence": false
    }
  }'
```

## Recomendações para o fluxo no n8n
- Tratar HTTP `200` como resposta técnica bem-sucedida.
- Avaliar o campo `status` do JSON para decidir o próximo passo do fluxo.
- Se `status = completed`, seguir com persistência, CRM, enriquecimento ou alertas.
- Se `status = failed`, tratar como falha de negócio e registrar `error.message` ou `result.error`.
- Para payloads grandes, manter `includeEvidence = false`.

## Observações operacionais
- A análise é síncrona e pode levar vários segundos, dependendo do site.
- O endpoint tenta usar browser runtime; se isso falhar, pode cair em fallback estático.
- O resultado pode vir com `status = failed` mesmo com HTTP `200`, quando a chamada chegou corretamente mas o site analisado falhou.
