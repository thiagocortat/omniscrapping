# React Architecture Patterns

## Objetivo

Usar este guia para definir estrutura de frontend React com baixa friccao de manutencao.

## 1. Estrutura de pastas

Preferir estrutura por feature quando o produto tiver varias telas e regras de negocio:

```text
src/
  app/
  features/
    auth/
      components/
      hooks/
      services/
      types/
      pages/
  shared/
    components/
    hooks/
    lib/
    types/
```

Usar estrutura por camadas apenas em escopos pequenos ou quando o legado exigir.

## 2. Composicao de componentes

Separar:
- componentes de apresentacao: focar em renderizacao e interacao local
- componentes de orquestracao: carregar dados, controlar fluxo e compor blocos

Evitar componentes muito grandes com regra de negocio, IO e layout misturados.

## 3. Estado e dados

Usar regra pratica:
- estado local: interacoes da tela
- estado compartilhado: contexto global (tema, sessao, preferencia)
- server state: dados de API com cache e revalidacao

Evitar duplicar server state em estado global sem necessidade.

## 4. Integracao com API

Definir camada de servico para chamadas HTTP.

Padronizar retorno de erro e mensagens para UI.

Tratar loading, erro e vazio explicitamente em cada fluxo critico.

## 5. Performance

Aplicar somente quando houver necessidade observavel:
- memoizacao de calculos caros
- code-splitting por rota
- lazy load de componentes pesados
- virtualizacao em listas extensas

Evitar otimizacao prematura.

## 6. Testabilidade

Garantir:
- componentes com entradas previsiveis
- funcoes puras para transformacoes
- desacoplamento de adaptadores externos

Priorizar testes em comportamento do usuario, nao em detalhes internos.
