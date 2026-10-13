---
name: module
description: Cria, altera ou remove um módulo de negócio num projeto rodsaas — a partir de uma descrição como "cliente com nome, CPF, telefone e endereço" gera o model com RLS, migration, rotas REST com Zod e OpenAPI, telas de lista/detalhe/criar/editar com filtros e paginação, item no menu, limite de plano e testes de isolamento, tudo no padrão do projeto. Use sempre que o usuário pedir para criar um cadastro, CRUD, módulo, entidade, tela ou recurso novo num projeto rodsaas ("cria um módulo de agendamentos", "preciso cadastrar produtos", "adiciona o campo CNPJ em clientes"), ou chamar /rodsaas:module.
---

# rodsaas · module

Adiciona uma funcionalidade de negócio a um projeto rodsaas, **na API e no painel ao mesmo tempo**, seguindo exatamente os padrões que as skills `backend` e `frontend` estabeleceram. É a skill do dia a dia: depois da base pronta, quase tudo que o produto ganha passa por aqui.

O caminho é sempre: **descrição em linguagem natural → especificação (`rodsaas/modules/<nome>.json`) → validação → aprovação → geração em camadas → testes**.

## Pré-requisitos

- Projeto rodsaas com `api/`, `web/` e `rodsaas.json`, e com typecheck, lint, build e testes **passando**. Base vermelha: conserte antes.
- Referência de código: o módulo de exemplo `projects`, se ainda existir. Se foi removido (por exemplo pelo preset `notion`), siga as referências das skills `backend` (`references/08-modulos.md`) e `frontend` (`references/05` a `09`), que descrevem o mesmo padrão.

## 1. Entender o pedido e montar a especificação

Leia o pedido e proponha a especificação completa, preenchendo o que der para deduzir e usando os padrões da tabela abaixo. Pergunte **só** o que for ambíguo e mudar o resultado (de preferência numa única rodada).

| Item | Padrão |
|---|---|
| Nome no código | inglês, plural, camelCase (`appointments`); model no singular PascalCase (`Appointment`) |
| Nome na interface | português, singular/plural e gênero (`Agendamento`/`Agendamentos`, masculino) |
| Rota | português, kebab-case (`/agendamentos`) |
| Ícone do menu | um ícone do lucide coerente |
| Campos | os que o usuário citou, com o tipo mais específico (`references/01-especificacao.md`) |
| Campo de título | o primeiro campo de texto (aparece no detalhe, na busca, nos selects de relação) |
| Busca | campos de texto principais |
| Ordenação padrão | mais recentes primeiro (`createdAt desc`), ou a data principal se houver |
| Visões | tabela; **+ quadro (kanban)** se houver campo de status |
| Permissões | ver, criar e editar: todos; excluir: owner e admin |
| Limite de plano | não, a menos que o usuário peça ou o módulo seja o "produto principal" |
| Auditoria | sim (criar, editar, excluir) |

Grave a especificação em `rodsaas/modules/<nome>.json` (formato em `references/01-especificacao.md`) e rode o validador:

```bash
node "${CLAUDE_PLUGIN_ROOT}/skills/module/scripts/validate-spec.mjs" rodsaas/modules/<nome>.json
```

(Sem `CLAUDE_PLUGIN_ROOT`, use o caminho desta skill.) Corrija até passar.

**Mostre um resumo legível e espere a aprovação** antes de gerar código, porque é muito mais barato corrigir um campo na especificação do que em seis camadas:

```
Agendamentos  ·  /agendamentos  ·  ícone CalendarClock
┌───────────────┬──────────────┬─────────────┬───────────────────────────┐
│ Campo         │ Tipo         │ Obrigatório │ Lista / filtro / busca    │
├───────────────┼──────────────┼─────────────┼───────────────────────────┤
│ Título        │ texto        │ sim         │ lista · busca             │
│ Cliente       │ → Clientes   │ sim         │ lista · filtro            │
│ Início        │ data e hora  │ sim         │ lista · filtro · ordena   │
│ Valor         │ dinheiro     │ não         │ lista                     │
│ Status        │ status       │ sim         │ lista · filtro · quadro   │
└───────────────┴──────────────┴─────────────┴───────────────────────────┘
Visões: tabela + quadro (por Status) · Excluir: owner/admin · Limite de plano: não
Ao excluir um cliente com agendamentos: bloquear
```

Se ninguém estiver acompanhando, siga com a especificação proposta e registre no topo do trabalho as escolhas feitas.

## 2. Gerar

Em fases, cada uma terminando com typecheck, lint, testes da fase e commit (`feat(<nome>): ...`):

1. **API** — model, migration com RLS, schemas, repository, service, rotas, registro no app, contador de limite, testes. → `references/02-backend.md`
2. **Contrato** — `npm run openapi:export` na API e `npm run api:types` no front.
3. **Painel** — hooks, colunas, formulário, filtros, páginas (lista, detalhe, quadro), item no menu. → `references/03-frontend.md`
4. **Fechamento** — checklist de `references/05-checklist.md`; registre o módulo em `rodsaas.json` (`modules`).

## Alterar ou remover um módulo

Pedidos como "adiciona o campo CNPJ em clientes", "tira o campo observação", "o status ganhou a opção Cancelado" ou "remove o módulo de agendamentos": atualize a especificação, valide e siga `references/04-alterar-e-remover.md`. Mudanças que podem perder dados (remover campo, trocar tipo, remover módulo) **sempre** pedem confirmação explícita, mostrando o que será perdido.

## Princípios

- **Igual aos outros módulos.** Mesma estrutura de pastas, mesmos nomes de arquivo, mesmos componentes. Quem conhece um módulo do projeto conhece todos.
- **Segurança herdada, nunca relaxada.** RLS com `FORCE`, `organizationId` do token, relações que **não conseguem** apontar para registro de outra empresa (garantido no banco), schemas de entrada estritos e de saída explícitos.
- **A especificação é a fonte.** O que está no JSON é o que existe no código. Mudou o módulo, muda a especificação primeiro.
- **Português de verdade na interface.** Rótulos, mensagens, concordância de gênero ("Novo agendamento", "Nova consulta"), máscaras e formatos brasileiros.
- **Nada pela metade.** Se um tipo de campo pedido depende de algo que o projeto não tem (ex.: arquivo sem o add-on de uploads), diga isso e proponha alternativa; não gere um campo que não funciona.

## Relatório final

Uma mensagem curta: o que foi criado (rota da API, tela, item do menu), decisões tomadas na especificação, como testar ("abra /agendamentos, crie um, tente acessar com outra empresa"), e próximos passos naturais (outro módulo relacionado, um campo que ficou para depois).

## Mapa das referências

| Arquivo | Quando ler |
|---|---|
| `references/01-especificacao.md` | Passo 1 — formato do JSON, tipos de campo, relações, permissões |
| `references/02-backend.md` | Geração da API |
| `references/03-frontend.md` | Geração do painel |
| `references/04-alterar-e-remover.md` | Mudar ou remover um módulo existente |
| `references/05-checklist.md` | Fechamento |
