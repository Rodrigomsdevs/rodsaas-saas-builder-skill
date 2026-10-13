# Tabelas e listas

## `DataTable` (`components/app/data-table/`)

Um componente genérico usado por todas as listas. Partes:

| Parte | Faz |
|---|---|
| `DataTableToolbar` | busca, filtros (chips/select), botão "Limpar filtros", ação principal à direita ("Novo projeto") |
| `DataTable` | cabeçalho fixo ao rolar, linhas clicáveis (vão ao detalhe), menu de ações por linha (⋯), ordenação no cabeçalho quando a API suportar |
| `DataTablePagination` | **Anterior / Próxima** + seletor de itens por página (20 / 50 / 100) |
| `DataTableSkeleton` | mesmas colunas, N linhas de skeleton (primeira carga) |
| `DataTableMobile` | abaixo do breakpoint `md`, a tabela vira **lista de cards** (título, 2–3 campos, ações) |

Colunas declaradas por feature (`features/<x>/columns.tsx`). Use TanStack Table se precisar de ordenação/seleção; para lista simples, colunas tipadas e render direto bastam.

## Estado na URL (nuqs)

Tudo que define o que a lista mostra fica na URL:

```
/projetos?q=site&status=ACTIVE&limit=20&cursor=MDE5Mm...
```

```ts
const [params, setParams] = useQueryStates({
  q: parseAsString.withDefault(''),
  status: parseAsStringLiteral(['ACTIVE', 'ARCHIVED']),
  limit: parseAsInteger.withDefault(20),
  cursor: parseAsString,
})
```

- Busca com **debounce de ~300 ms** antes de atualizar a URL/request.
- Mudar busca, filtro ou `limit` **zera o cursor** (volta ao início).
- Botão voltar do navegador volta para a página/filtro anterior.
- Link copiado abre a mesma lista.

## Paginação por cursor

A API pagina por cursor (`meta.nextCursor`, `meta.hasMore`). Não existe "página 7 de 12" nem total; isso é escolha do backend (rápido e estável em tabelas grandes).

- **Próxima**: habilitada se `hasMore`; navega com `cursor = nextCursor`.
- **Anterior**: mantém uma **pilha de cursores** visitados (no estado da URL ou em memória da tela). Primeira página → desabilitado.
- Texto auxiliar: "Mostrando 21–40" (calculado pela posição na pilha × `limit`).
- `keepPreviousData` na query: a tabela não pisca ao trocar de página; mostre indicador leve de "atualizando".
- Ao voltar de um detalhe, a lista volta para o mesmo cursor (está na URL).

Para feeds/timelines (atividade, comentários), use **"Carregar mais"** com `useInfiniteQuery` em vez de Anterior/Próxima.

## Ações por linha

- Menu ⋯ com ações permitidas para o papel (`Can`).
- Ação destrutiva no menu em cor `destructive`, separada das outras, e sempre com `ConfirmDialog`.
- Clique na linha abre o detalhe; o menu ⋯ não propaga o clique.

## Estados (ver `05-estados-e-feedback.md`)

Primeira carga → `DataTableSkeleton`. Vazio → `EmptyState` com ação. Vazio por filtro → "Nada encontrado" + limpar. Erro → `ErrorState` com tentar de novo, mantendo a toolbar.

## Densidade

Altura da linha e tamanho de fonte vêm de `config/ui.ts` (estilo da marca). No estilo **denso**, números com `tabular-nums` e colunas numéricas alinhadas à direita.

## Kanban (quando um módulo pedir)

Não faz parte da v1, mas o padrão é: colunas = status, cards = registros, arrastar muda o status com **atualização otimista** (desfaz e avisa se a API falhar), teclado como alternativa ao arraste (menu "Mover para…"), e a mesma busca/filtros na URL da tabela.
