# Architecture Checklist

## Contexto
- Objetivos de negócio e métricas de sucesso definidos.
- Escopo funcional e fronteiras do sistema claros.
- Restrições explícitas (prazo, custo, compliance, tecnologia).

## Qualidade e Operação
- Requisitos de disponibilidade, latência e throughput definidos.
- Metas de resiliência e estratégia de recuperação descritas.
- Plano de observabilidade com logs, métricas, tracing e alertas.

## Segurança e Dados
- Modelo de autenticação e autorização definido.
- Classificação de dados e exigências de privacidade mapeadas.
- Estratégia de criptografia em trânsito e em repouso definida.
- Políticas de retenção e auditoria de dados estabelecidas.

## Arquitetura da Solução
- Limites de domínio e responsabilidades por componente definidos.
- Contratos de integração e versionamento especificados.
- Estratégia de consistência de dados e tratamento de falhas definida.
- Dependências externas mapeadas com plano de contingência.

## Entrega e Evolução
- Estratégia de deploy, rollback e migração de schema estabelecida.
- Riscos técnicos priorizados com mitigação prática.
- Dívida técnica inicial aceitável e monitorada.
- Decisões de alto impacto registradas em ADR.
