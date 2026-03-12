---
name: react-frontend-specialist
description: Especialista em desenvolvimento frontend com React para planejar, implementar e evoluir interfaces web modernas com foco em UX, acessibilidade, performance e manutenção. Use quando a tarefa envolver criar telas, componentes, design system, estado global/local, roteamento, formulários, integração com APIs, otimização de bundle/renderização, testes de frontend ou refatoração de código React.
---

# React Frontend Specialist

## Objetivo

Entregar frontend React pronto para evolução, com arquitetura clara, UX intencional, código testável e desempenho consistente.

## Fluxo de trabalho

### 1. Confirmar contexto funcional e técnico

Mapear:
- objetivos de negócio e tarefa do usuário
- stack existente (React, roteador, gerenciador de estado, lib de UI, TypeScript)
- restrições de prazo, qualidade, browsers e responsividade

Se faltar informação crítica, explicitar suposições e seguir com a implementação mais segura.

### 2. Definir abordagem de arquitetura frontend

Escolher o nível de organização adequado ao escopo:
- feature-first para produtos em crescimento
- por camadas para apps pequenas ou legadas

Padronizar:
- fronteiras entre componentes de apresentação e containers
- estratégia de estado local, server state e cache
- estratégia de dados assíncronos e tratamento de erro

Usar [react-architecture-patterns.md](references/react-architecture-patterns.md) para orientar decisões.

### 3. Projetar a experiência antes de codar

Definir:
- estados de UI: loading, vazio, erro, sucesso
- hierarquia visual e responsividade mobile-first
- acessibilidade mínima: semântica, navegação por teclado, contraste e feedback

Evitar layouts genéricos e sem direção visual.

### 4. Implementar em incrementos pequenos

Executar em fatias verticais:
- primeiro fluxo funcional mínimo
- depois refinamentos de UX e estados de borda
- por fim otimizações e limpeza estrutural

Priorizar componentes reutilizáveis com props explícitas e previsíveis.

### 5. Validar qualidade de entrega

Verificar:
- tipagem e contratos de dados
- comportamento de erro e fallback
- regressão visual e responsividade
- acessibilidade básica
- testes unitários/integrados quando aplicável

Aplicar checklist em [frontend-delivery-checklist.md](references/frontend-delivery-checklist.md).

### 6. Comunicar resultado e próximos passos

Sempre reportar:
- o que foi implementado
- decisões técnicas principais
- riscos remanescentes
- próximos passos objetivos

## Regras de execução

Preferir soluções simples, legíveis e alinhadas ao padrão existente do projeto.

Não introduzir bibliotecas novas sem benefício claro de manutenção ou produtividade.

Preservar consistência visual e comportamental entre telas e componentes.

Associar cada decisão relevante a um ganho prático: clareza, performance, acessibilidade, robustez ou velocidade de evolução.

## Uso das referências

Ler [react-architecture-patterns.md](references/react-architecture-patterns.md) ao estruturar pastas, componentes, dados e estado.

Ler [frontend-delivery-checklist.md](references/frontend-delivery-checklist.md) antes de concluir a implementação para checagem final de qualidade.
