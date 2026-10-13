# Geração do painel

Siga os padrões da skill `frontend` (estados, formulários, tabelas, overlays). Antes de começar: `npm run openapi:export` (API) e `npm run api:types` (web), para os tipos do módulo existirem.

## Arquivos

```
web/src/features/<name>/
├── api.ts                    # query keys + useList, useDetail, useOptions, useCreate, useUpdate, useDelete
├── schemas.ts                # Zod do formulário (mesmas regras da API)
├── columns.tsx               # colunas da DataTable (campos com list: true)
├── labels.ts                 # rótulos, gênero, opções de status com cor
└── components/
    ├── <model>-form.tsx      # formulário (criar e editar)
    ├── <model>-filters.tsx   # filtros da toolbar (campos com filter: true)
    ├── <model>-board.tsx     # quadro, se views tiver "board"
    └── <model>-fields.tsx    # exibição dos campos no detalhe
web/src/app/(app)/<route>/
├── page.tsx                  # lista (tabela | quadro)
├── loading.tsx
└── [id]/page.tsx             # detalhe
```

E: registro do módulo no app **Cadastros** (`features/cadastros/app.tsx`: item no menu com rótulo plural, ícone e `roles` se nem todos podem ver, e a rota em `match`) ou, se o usuário pediu, no app de um preset (ex.: agendamento dentro do CRM: item no `Sidebar` e rota no `match` daquele app). Veja `skills/frontend/references/12-casca-e-apps.md`. Também as abas de relação no detalhe dos módulos alvo. Projeto com `config/navigation.ts` antigo: rode antes o `/rodsaas:apps`.

## Componente por tipo

| Tipo | No formulário | Na lista | No detalhe |
|---|---|---|---|
| `text` | `Input` | texto (truncado com tooltip) | texto |
| `longtext` | `Textarea` com contador | — | texto com quebras |
| `integer` / `decimal` / `percent` | input numérico pt-BR | número formatado à direita | formatado |
| `money` | input de moeda (guarda centavos) | `R$ 1.234,56` à direita | idem |
| `boolean` | `Switch` | ícone ✓ | Sim/Não |
| `date` / `datetime` | `Popover` + `Calendar` (+ hora) | `12/10/2026` (+ `14:30`) | idem + relativo |
| `status` | `Select` com bolinha de cor | `Badge` na cor | `Badge` |
| `select` | `Select` | texto | texto |
| `tags` | input de etiquetas (Enter adiciona) | chips (até 3 + "+2") | chips |
| `email` | input email | link `mailto:` | idem |
| `phone` | máscara de telefone | formatado + botão WhatsApp | idem |
| `url` | input url | link externo (ícone) | idem |
| `cpf` / `cnpj` / `cpfCnpj` | máscara + validação de dígitos | formatado | idem |
| `cep` | máscara | formatado | idem |
| `address` | grupo: CEP (busca e preenche) + rua, número, complemento, bairro, cidade, UF | cidade/UF | endereço completo + link de mapa |
| `relation` | `RelationSelect`: `Command` com busca chamando `/options` do alvo, mostra o título | título como link para o detalhe do alvo | idem |
| `user` | `MemberSelect`: membros da empresa com avatar | avatar + nome | idem |

Crie `RelationSelect` e `MemberSelect` em `components/app/` na primeira vez que forem necessários e reutilize nos módulos seguintes.

## Lista (`page.tsx`)

- `PageHeader`: título plural, contagem quando disponível, botão "Novo/Nova <singular>" (respeitando `permissions.create` e o limite do plano).
- **Abas de visão** quando houver quadro: Tabela | Quadro, guardadas na URL (`?visao=quadro`).
- Toolbar: busca (`q`), filtros do módulo, "Limpar filtros". Tudo na URL (nuqs).
- `DataTable` com as colunas, ordenação nas colunas `sort`, menu ⋯ por linha (Editar, Excluir conforme permissão e `onlyOwnRecords`), clique na linha → detalhe.
- Estados completos: skeleton, vazio ("Nenhum agendamento ainda" + ação), vazio por filtro, erro.

## Quadro

- Uma coluna por opção do `boardField`, na ordem das opções, com a cor dela e a contagem.
- Cada coluna carrega a lista filtrada por aquele status (cursor + "Carregar mais").
- Cards: título + até 3 campos de `list`.
- **Arrastar entre colunas** muda o status (`PATCH`), otimista e desfazendo se falhar; alternativa por teclado: "Mover para…" no menu do card.
- Ordem dentro da coluna segue `defaultSort` (sem ordem manual nesta versão).
- Se já existir um componente de kanban no projeto (ex.: do preset `notion`), reutilize.

## Formulário

- `FormSheet` para criar e editar ("Novo agendamento" / "Editar agendamento", com o gênero do `label`).
- Campos na ordem da especificação; obrigatórios marcados; `help` como descrição.
- `Idempotency-Key` na criação; erros da API nos campos (`applyApiErrors`); alterações não salvas protegidas.
- Valores padrão da especificação no criar. Ao criar a partir da aba de um alvo (ex.: dentro do cliente), a relação já vem preenchida e travada.

## Detalhe (`[id]/page.tsx`)

- Cabeçalho: valor do `titleField`, `Badge` de status (se houver), ações (Editar, Excluir).
- Grade com os campos (rótulo + valor formatado), `longtext` e `address` ocupando a largura toda.
- "Criado por Ana em 12/10/2026 · atualizado há 5 min".
- **Abas de relação**: para cada módulo que aponta para este, uma aba com a lista filtrada e o botão de criar já ligado.
- 404 → `notFound()` (com a casca); 403 → estado de sem permissão.

## Excluir

`ConfirmDialog` destrutivo com o título do registro. Se módulos dependentes usam `cascade`, o texto avisa ("Os 3 agendamentos deste cliente também serão excluídos"); com `restrict`, mostre a mensagem 409 da API explicando o que impede.

## Testes

- Componente: o formulário valida os campos especiais e mostra erro da API no campo.
- Ponta a ponta (Playwright): criar, editar, filtrar, mudar no quadro, excluir; criar pela aba de um registro relacionado.
