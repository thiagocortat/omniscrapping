# PRD — Plataforma de Detecção de Tecnologias de Websites

## 1. Visão geral

**Nome do produto**  
TechStack Scanner

**Tipo de produto**  
Web app SaaS / ferramenta interna de análise de websites

**Objetivo principal**  
Permitir que um usuário descubra, de forma simples e escalável, quais tecnologias um ou mais sites utilizam, seja em modo de detecção ampla (“quais tecnologias este site usa?”) ou em modo de detecção específica (“este site usa GTM?”, “usa React?”, “usa Cloudflare?”, “usa script X?”).

**Resumo executivo**  
O produto deve receber uma URL única, uma lista manual de URLs ou uma planilha com múltiplos domínios e executar uma análise automatizada para identificar tecnologias presentes em cada site. A solução deve suportar análise unitária e em lote, com fila de processamento e workers/agentes para iterar sobre grandes volumes. O sistema também deve permitir um modo de busca direcionada por tecnologia específica, retornando presença, evidências e nível de confiança.

---

## 2. Problema

Hoje, identificar a stack tecnológica de um site em escala costuma exigir ferramentas pagas, extensões manuais de navegador ou investigação técnica demorada. Isso gera atrito para casos como:

- benchmark competitivo
- prospecção comercial
- auditoria técnica
- análise de parceiros
- validação de uso de scripts específicos
- enriquecimento de base de leads

O problema piora quando o usuário precisa analisar dezenas ou centenas de URLs de uma vez, ou quando precisa responder perguntas objetivas como:

- “esses sites usam Google Tag Manager?”
- “quais usam React?”
- “quais usam Hotjar?”
- “quais usam Cloudflare?”
- “quais carregam o script X?”

---

## 3. Oportunidade

Existe valor claro em uma ferramenta que combine:

- **entrada flexível**: 1 URL, várias URLs ou planilha
- **varredura automatizada**: com workers/agentes
- **dois modos de análise**:
  - descoberta completa da stack
  - validação de tecnologia específica
- **saída operacional**:
  - tabela
  - exportação
  - evidências encontradas
  - score de confiança

Essa oportunidade é especialmente forte para times de produto, growth, marketing, vendas, partnerships e engenharia.

---

## 4. Objetivos do produto

### Objetivo principal
Reduzir drasticamente o tempo para descobrir ou validar tecnologias usadas por websites.

### Objetivos secundários
- Permitir análise em escala de listas grandes de domínios
- Gerar resultados auditáveis com evidências
- Suportar filtros e exportação para uso comercial e analítico
- Viabilizar automação futura com agentes e rotinas recorrentes

---

## 5. Perfis de usuário

### 5.1 Product Manager / Product Ops
Quer mapear stacks de concorrentes, parceiros ou clientes.

### 5.2 Time de vendas / SDR / RevOps
Quer enriquecer listas de empresas com sinais tecnológicos.

### 5.3 Marketing / Growth
Quer identificar tags, pixels, analytics e ferramentas de automação instaladas.

### 5.4 Engenharia / Arquitetura / Solutions
Quer validar frameworks, CDNs, CMS, provedores e bibliotecas carregadas.

### 5.5 Consultor / agência / analista
Quer gerar relatórios técnicos em lote para clientes.

---

## 6. Proposta de valor

**Para análise individual:**  
“Cole uma URL e descubra rapidamente a stack do site.”

**Para análise em lote:**  
“Suba uma planilha e deixe o sistema iterar automaticamente por todos os domínios.”

**Para validação específica:**  
“Informe uma tecnologia ou script e veja quais sites usam, com evidências.”

---

## 7. Escopo do MVP

## 7.1 Funcionalidades principais

### A. Análise por URL única
Usuário informa uma URL e recebe:
- status da análise
- lista de tecnologias detectadas
- categoria da tecnologia
- evidência da detecção
- score de confiança

### B. Análise de múltiplas URLs
Usuário pode:
- colar várias URLs manualmente
- subir arquivo `.csv` ou `.xlsx`
- acompanhar progresso por linha/processamento

### C. Modo “Detectar tudo”
Para cada domínio, sistema tenta identificar o máximo possível de tecnologias.

Exemplos de categorias:
- CMS
- framework frontend
- biblioteca JS
- analytics
- tag manager
- chat / suporte
- pixel / ads
- CDN / WAF
- hospedagem / edge
- mapa / vídeo / widgets
- A/B testing
- consentimento / cookies

### D. Modo “Detectar tecnologia específica”
Usuário informa uma ou mais tecnologias-alvo.

Exemplos:
- Google Tag Manager
- Meta Pixel
- Hotjar
- React
- Vue
- Angular
- Cloudflare
- WordPress
- Shopify
- script customizado

Saída esperada:
- encontrado / não encontrado / inconclusivo
- evidência
- local da evidência
- score de confiança

### E. Upload de planilha
Sistema aceita planilha com:
- coluna obrigatória de URL/domínio
- colunas opcionais de ID, nome da empresa, segmento etc.

### F. Processamento assíncrono com fila
Para listas grandes, a análise roda em background via jobs/workers/agentes.

### G. Resultado consolidado
Tabela com:
- URL
- status
- tecnologias detectadas
- tecnologia específica encontrada?
- score de confiança
- data da análise
- observações / erro

### H. Exportação
Exportar resultado em:
- CSV
- XLSX

---

## 8. Escopo fora do MVP

Não entra na primeira versão:

- crawling profundo de múltiplas páginas internas por site
- login em sites protegidos
- análise autenticada
- screenshot avançado com evidência visual
- monitoramento contínuo automático
- enriquecimento com dados firmográficos
- comparação histórica entre scans
- API pública externa
- browser extension

---

## 9. Casos de uso prioritários

### Caso 1 — URL única
Como usuário, quero informar uma URL para descobrir rapidamente as tecnologias do site.

### Caso 2 — Lista manual
Como usuário, quero colar várias URLs para analisar várias empresas de uma só vez.

### Caso 3 — Upload de planilha
Como usuário, quero subir uma planilha com domínios para o sistema iterar automaticamente sobre a lista.

### Caso 4 — Busca por tecnologia específica
Como usuário, quero verificar se um grupo de sites usa uma tecnologia específica.

### Caso 5 — Prospecção comercial
Como SDR, quero exportar uma lista de empresas que usam determinada tecnologia.

### Caso 6 — Auditoria de script
Como analista, quero descobrir quais sites carregam um script específico.

---

## 10. Requisitos funcionais

## 10.1 Entrada

### RF-01
O sistema deve permitir informar uma URL única.

### RF-02
O sistema deve permitir colar múltiplas URLs em textarea.

### RF-03
O sistema deve permitir upload de CSV e XLSX.

### RF-04
O sistema deve validar formato de URL/domínio antes do processamento.

### RF-05
O sistema deve normalizar URLs antes do scan:
- adicionar protocolo quando necessário
- remover espaços
- tratar duplicados

---

## 10.2 Modos de análise

### RF-06
O sistema deve oferecer modo “Detectar tudo”.

### RF-07
O sistema deve oferecer modo “Detectar tecnologia específica”.

### RF-08
No modo específico, o usuário pode pesquisar por:
- nome de tecnologia cadastrada
- padrão de script
- domínio de script
- palavra-chave técnica

### RF-09
O sistema deve permitir selecionar múltiplas tecnologias-alvo em uma mesma execução.

---

## 10.3 Execução do scan

### RF-10
O sistema deve buscar o HTML inicial da página.

### RF-11
O sistema deve inspecionar:
- HTML
- headers HTTP
- scripts carregados
- metatags
- cookies
- DOM renderizado quando necessário
- recursos externos referenciados

### RF-12
O sistema deve aplicar heurísticas baseadas em assinaturas.

### RF-13
O sistema deve registrar evidência por tecnologia detectada.

### RF-14
O sistema deve gerar score de confiança por detecção.

### RF-15
O sistema deve marcar resultados inconclusivos quando não houver evidência suficiente.

---

## 10.4 Lote / fila / agentes

### RF-16
O sistema deve criar um job para execuções em lote.

### RF-17
O sistema deve processar URLs em fila.

### RF-18
O sistema deve permitir reprocessar URLs com erro.

### RF-19
O sistema deve exibir progresso:
- total
- concluídos
- em processamento
- com erro
- pendentes

### RF-20
O sistema deve suportar paralelismo controlado por workers/agentes.

---

## 10.5 Resultado

### RF-21
O sistema deve exibir tabela consolidada de resultados.

### RF-22
Ao clicar em um domínio, o sistema deve mostrar detalhe da análise.

### RF-23
O detalhe deve exibir:
- tecnologias encontradas
- categoria
- evidência
- score
- timestamp
- logs resumidos

### RF-24
O sistema deve permitir filtrar resultados por:
- tecnologia
- status
- confiança
- encontrado / não encontrado

### RF-25
O sistema deve permitir exportação em CSV e XLSX.

---

## 11. Heurísticas de detecção

O motor de detecção deve combinar múltiplas estratégias.

### 11.1 Assinaturas por HTML/DOM
Exemplo:
- classes, ids e comentários típicos
- meta generator
- atributos específicos
- estruturas conhecidas de CMS/framework

### 11.2 Assinaturas por script
Exemplo:
- URLs de scripts conhecidos
- nomes de arquivos JS
- padrões inline
- inicializadores globais em `window`

### 11.3 Assinaturas por headers
Exemplo:
- `server`
- `x-powered-by`
- headers específicos de CDN/WAF/framework

### 11.4 Assinaturas por cookies/storage
Exemplo:
- cookies com prefixos conhecidos
- chaves de analytics/chat/A-B testing

### 11.5 Assinaturas por recursos externos
Exemplo:
- domínios de fornecedores
- endpoints específicos
- chamadas de tracking

### 11.6 Renderização opcional
Quando necessário, usar browser headless para detectar scripts carregados apenas após execução do JS.

---

## 12. Lógica de confiança

Cada tecnologia detectada deve ter um score, por exemplo:

- **Alta confiança**: múltiplas evidências fortes
- **Média confiança**: uma evidência forte ou várias médias
- **Baixa confiança**: evidência fraca / indireta
- **Inconclusivo**: sem evidência suficiente

Exemplo de evidências fortes:
- script oficial carregado do domínio do fornecedor
- objeto global conhecido
- header específico
- meta generator inequívoca

Exemplo de evidências fracas:
- nome genérico em HTML
- classe CSS parecida
- menção textual sem uso real

---

## 13. Arquitetura proposta do produto

## 13.1 Componentes

### Frontend
Aplicação web para:
- input de URL(s)
- upload de planilha
- seleção do modo de análise
- acompanhamento de jobs
- visualização e exportação

### Backend API
Responsável por:
- criar jobs
- validar entrada
- orquestrar processamento
- consolidar resultados
- expor dados para frontend

### Engine de detecção
Módulo central com:
- catálogo de assinaturas
- parser de HTML/headers/scripts
- motor de scoring
- matching de tecnologias

### Fila e workers/agentes
Responsáveis por:
- processar listas grandes
- controlar concorrência
- retry
- timeouts
- isolamento de falhas

### Banco de dados
Para armazenar:
- jobs
- URLs
- resultados
- evidências
- catálogo de tecnologias
- logs

---

## 14. Fluxo do usuário

### Fluxo A — URL única
1. Usuário cola a URL
2. Seleciona “detectar tudo” ou “detectar tecnologia específica”
3. Clica em analisar
4. Sistema processa
5. Usuário vê resultado detalhado

### Fluxo B — Lote manual
1. Usuário cola múltiplas URLs
2. Seleciona modo
3. Inicia job
4. Sistema processa em fila
5. Usuário acompanha progresso
6. Exporta resultado

### Fluxo C — Planilha
1. Usuário sobe CSV/XLSX
2. Mapeia coluna de URL
3. Seleciona modo de análise
4. Inicia job
5. Sistema itera pelos domínios
6. Usuário acompanha e exporta

---

## 15. Requisitos não funcionais

### RNF-01 Performance
Para URL única, primeira resposta deve começar em poucos segundos.

### RNF-02 Escalabilidade
Sistema deve suportar processamento em lote com centenas ou milhares de URLs via fila.

### RNF-03 Robustez
Falha em uma URL não pode interromper o job inteiro.

### RNF-04 Observabilidade
Sistema deve registrar logs de execução e motivos de erro.

### RNF-05 Segurança
Sanitizar entradas, validar arquivos e evitar SSRF inseguro.

### RNF-06 Resiliência
Implementar retry com limites e timeout por domínio.

### RNF-07 Governança
Registrar data/hora da varredura e versão do catálogo de assinaturas.

### RNF-08 Usabilidade
Interface simples, orientada a tabela, filtros e exportação.

---

## 16. Riscos e limitações

### 16.1 Bloqueios anti-bot
Alguns sites podem bloquear scraping ou headless browser.

### 16.2 Falsos positivos
Uma tecnologia pode aparecer por resquício de código e não estar realmente ativa.

### 16.3 Falsos negativos
Tecnologias podem ficar ocultas por minificação, renderização tardia ou proteção.

### 16.4 Ambiguidade de frameworks
Algumas bibliotecas são difíceis de identificar com alta confiança.

### 16.5 Custo computacional
Renderização com browser headless em lote pode ser cara.

---

## 17. Estratégia de MVP

### Fase 1
- URL única
- múltiplas URLs por colagem
- detectar tudo
- detectar tecnologia específica
- tabela de resultados
- export CSV

### Fase 2
- upload XLSX
- fila e workers
- reprocessamento de erros
- score de confiança mais refinado
- export XLSX

### Fase 3
- browser renderizado opcional
- catálogo expandido de tecnologias
- histórico de scans
- agendamento/monitoramento recorrente

---

## 18. Métricas de sucesso

### Métricas de produto
- taxa de jobs concluídos com sucesso
- tempo médio por URL
- taxa de exportação
- número médio de URLs por job
- taxa de reprocessamento

### Métricas de qualidade
- precisão percebida pelo usuário
- taxa de falso positivo reportado
- taxa de falso negativo reportado
- cobertura do catálogo de tecnologias

### Métricas de adoção
- usuários ativos
- jobs por usuário
- retenção semanal/mensal
- uso do modo específico vs modo amplo

---

## 19. Critérios de aceite do MVP

O MVP será considerado pronto quando:

1. usuário conseguir analisar uma URL única  
2. usuário conseguir colar uma lista de URLs  
3. usuário conseguir subir CSV com URLs  
4. sistema conseguir detectar conjunto inicial de tecnologias  
5. sistema conseguir validar tecnologia específica  
6. sistema exibir evidências e score  
7. sistema suportar jobs em lote sem quebrar toda a execução  
8. usuário conseguir exportar resultado  

---

## 20. Stack sugerida para desenvolvimento

Pensando em Vibe Coding e velocidade de entrega:

### Frontend
- Next.js
- Tailwind
- shadcn/ui

### Backend
- Next.js API routes ou NestJS
- fila com BullMQ / Redis

### Scraping / análise
- Playwright
- Cheerio
- Axios/fetch
- parser de headers / cookies / scripts

### Banco
- PostgreSQL
- Prisma

### Infra
- Vercel para frontend
- worker separado em Railway / Render / Fly.io / VPS
- Redis gerenciado

---

## 21. Estrutura inicial de dados

### Tabela: scan_jobs
- id
- user_id
- mode
- target_technologies
- source_type
- total_urls
- processed_urls
- status
- created_at
- finished_at

### Tabela: scan_targets
- id
- job_id
- original_url
- normalized_url
- status
- error_message

### Tabela: scan_results
- id
- target_id
- technology_name
- category
- confidence_score
- confidence_level
- found
- evidence_type
- evidence_value
- detected_at

### Tabela: technology_catalog
- id
- name
- category
- signatures_json
- active

---

## 22. Experiência de interface

A UI deve ser simples e operacional, com 4 áreas:

### 1. Entrada
- URL única
- múltiplas URLs
- upload planilha

### 2. Configuração
- detectar tudo
- detectar tecnologia específica
- seleção de tecnologias
- concorrência/processamento avançado opcional

### 3. Progresso
- cards de status
- barra de progresso
- contadores

### 4. Resultados
- tabela
- filtros
- detalhes
- exportação

---

## 23. Evoluções futuras

- API pública para integração
- monitoramento periódico
- alertas de mudança de stack
- comparação “antes vs depois”
- enriquecimento com company data
- classificação por segmento
- templates de auditoria comercial
- relatório PDF para clientes
- marketplace de detectores/plugins

---

## 24. Resumo de posicionamento

**O que é**  
Uma plataforma para detectar tecnologias e scripts usados em websites.

**Para quem**  
PMs, vendas, marketing, engenharia, agências e analistas.

**Diferencial**  
Combina análise unitária, lote por planilha, busca específica por tecnologia e execução escalável com agentes/workers.

**Valor prático**  
Transforma uma investigação técnica manual em um fluxo operacional simples e exportável.
