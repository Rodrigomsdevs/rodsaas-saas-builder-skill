# Estados e feedback

## Estados de página (App Router)

| Arquivo | Quando | O que mostra |
|---|---|---|
| `app/not-found.tsx` | rota inexistente fora do app | logo, "Página não encontrada", botão para o início (ou entrar, se deslogado) |
| `app/(app)/not-found.tsx` | rota inexistente ou recurso 404 **dentro** do app | mesma mensagem **mantendo a casca** (menu e topo) |
| `app/(app)/error.tsx` | erro inesperado em uma tela | "Algo deu errado" + **Tentar de novo** (`reset()`) + código do erro (`requestId` se for `ApiError`) para mandar ao suporte |
| `app/global-error.tsx` | quebra do layout raiz | HTML mínimo, sem depender de providers nem de tema |
| `app/(app)/loading.tsx` | navegação entre telas | skeleton da área de conteúdo (cabeçalho + bloco) |
| `<rota>/loading.tsx` | telas com formato conhecido | skeleton daquele formato (lista: cabeçalho + toolbar + linhas) |

Recurso 404 vindo da API dentro de uma tela de detalhe: chame `notFound()` do Next a partir do erro (`ApiError.status === 404`), para cair no `not-found` com a casca.

403 da API numa tela inteira: componente `ErrorState` com variante "sem permissão": "Você não tem permissão para ver isto. Fale com um administrador da {empresa}."

## Estados de dados (todo bloco que busca dado)

| Estado | Como mostrar |
|---|---|
| **Carregando (primeira vez)** | skeleton **com o formato do conteúdo** (linhas, cards); nunca spinner de tela cheia, nunca layout pulando quando o dado chega |
| **Atualizando** (refetch, troca de página/filtro) | mantém o dado anterior (`keepPreviousData`), indicador discreto (barra fina no topo do bloco ou opacidade leve) |
| **Vazio, nunca teve dado** | `EmptyState`: ícone, título, uma frase explicando e **o botão da ação** ("Nenhum projeto ainda" → **Criar primeiro projeto**). Se o papel não pode criar, sem botão e frase adequada |
| **Vazio por filtro/busca** | outro texto: "Nada encontrado para "joão"" + **Limpar filtros** |
| **Erro** | `ErrorState` no próprio bloco: mensagem do `ApiError` + **Tentar de novo** (`refetch`). Não derruba a página inteira |
| **Sem permissão / feature fora do plano** | `PlanGate` ou mensagem de papel, no lugar do bloco |

Padrão de componente:

```tsx
if (query.isPending) return <ProjectsTableSkeleton />
if (query.isError) return <ErrorState error={query.error} onRetry={query.refetch} />
if (query.data.data.length === 0) return hasFilters ? <NoResults onClear={clear} /> : <ProjectsEmpty />
return <ProjectsTable data={query.data} isFetching={query.isFetching} />
```

## Ações e botões

- **`LoadingButton`** em toda ação assíncrona: mostra spinner, fica `disabled` com `aria-busy="true"` e **mantém a largura** (o texto troca para "Salvando…", "Excluindo…" sem o botão pular). Usa `mutation.isPending`. (Os testes do `/rodsaas:verify` conferem `disabled` e que o clique duplo não manda duas requests.)
- Desabilitado durante o envio = sem clique duplo. Em criação, a `Idempotency-Key` cobre o caso de rede lenta.
- **Toast de sucesso** curto e específico: "Projeto criado", "Convite enviado para ana@…". Nada de "Operação realizada com sucesso".
- **Toast de erro** com a mensagem do `ApiError`. Erro de validação vai **nos campos**, não em toast (ver formulários).
- **Atualização otimista** só em ações simples e reversíveis (trocar status, arquivar, marcar favorito): muda na hora, desfaz e avisa se a API falhar.
- **Ação destrutiva** sempre passa por `ConfirmDialog` (ver overlays). Depois de excluir: toast + volta para a lista se estava no detalhe.

## Limite de plano e upgrade

- `PLAN_LIMIT_REACHED` em qualquer mutation abre o `UpgradeDialog` (pelo `MutationCache`): "Você chegou ao limite de 5 projetos do plano Free" + comparação curta do plano seguinte + **Ver planos** (owner) ou "Peça ao responsável pela {empresa} para fazer o upgrade" (demais papéis).
- Onde dá para saber antes (uso já está no `me`), avise antes de o usuário preencher o formulário: botão "Novo projeto" com aviso "Limite do plano atingido" e o dialog ao clicar.
- Feature fora do plano: `PlanGate` mostra o recurso com selo **Pro** e uma explicação curta, em vez de esconder (é vitrine para o upgrade).

## Banners globais (topo da casca)

Em ordem de prioridade, no máximo um por vez, cada um com ação:

1. **Pagamento com problema** (`paymentIssue`): "Não conseguimos processar o último pagamento." → **Atualizar forma de pagamento** (owner) / aviso para os outros.
2. **E-mail não confirmado**: "Confirme seu e-mail para não perder o acesso." → **Reenviar e-mail**.
3. **Sem conexão** (evento `offline` do navegador): "Você está sem internet. Algumas ações podem falhar."

## Toasts

- `Toaster` do sonner no layout raiz, posição inferior direita (superior no celular), tema seguindo o claro/escuro.
- Sucesso some sozinho; erro fica um pouco mais; nunca empilhe vários iguais (use `id` do toast para substituir).

## Navegação

- Barra de progresso fina no topo durante transições de rota.
- Prefetch dos links do menu (padrão do `<Link>`).
- Título da aba por página: "Projetos · {Produto}" (metadata do App Router).
- Páginas do app com `robots: noindex`.

## Acessibilidade e responsivo

- Tudo operável por teclado; foco visível (o `--ring` do tema).
- Ícone sem texto sempre com `aria-label` ou tooltip.
- Skeleton com `aria-busy` no container; toasts são anunciados pelo sonner.
- No celular, o menu do app vira gaveta e os apps vão para a barra de baixo (`12-casca-e-apps.md`); alvos de toque com pelo menos 40px.
- Respeitar `prefers-reduced-motion` nas animações.

## Formatação BR (`lib/format.ts`)

| Função | Exemplo |
|---|---|
| `formatDate(d)` | 12/10/2026 |
| `formatDateTime(d)` | 12/10/2026 às 14:30 |
| `formatRelative(d)` | há 5 minutos · ontem às 14:30 |
| `formatMoney(cents)` | R$ 1.234,56 (`Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' })`) |
| `formatNumber(n)` | 1.234 |

Fuso: o do `rodsaas.json` (padrão `America/Sao_Paulo`). Datas da API chegam em UTC (ISO); converta só na exibição.
