# Casca de apps: trilho, menu do app e "Todos os apps"

Todo projeto rodsaas organiza a área logada em **apps**. O módulo de exemplo e os cadastros do `/rodsaas:module` formam o app **Cadastros**; cada preset (`notion` → **Páginas**, `tarefas`, `crm`…) acrescenta o seu. A casca mostra só o app em que a pessoa está, então os apps nunca se misturam no menu.

**Referência visual:** `assets/simulador-navegacao.html` (nesta skill). Abra no navegador antes de começar: ele mostra exatamente o comportamento descrito aqui, inclusive com 1 app, com 3, com mais de 30, no notebook e no celular. Siga o simulador no comportamento; no visual, siga a marca e os componentes do projeto (shadcn).

```
┌────┬──────────────────┬──────────────────────────────┐
│ AC │  Tarefas    + «  │ Tarefas › Minhas tarefas  🔍 ☀│
│────│  Minhas tarefas  │                              │
│ 🏠 │  Horas           │                              │
│ ── │  ── Projetos ──  │       conteúdo da tela       │
│ 📝 │  ● Marketing     │                              │
│ ✅ │  ● Financeiro    │                              │
│ 💼 │                  │                              │
│ ⊞  │                  │                              │
│    │                  │                              │
│ 🔍 │                  │                              │
│ 🔔 │                  │                              │
│ ⚙️ │                  │                              │
│ RO │                  │                              │
└────┴──────────────────┴──────────────────────────────┘
trilho  menu do app        topo + conteúdo
```

## Dois modos, escolhidos sozinhos

| Apps registrados (sem contar o Início) | Casca |
|---|---|
| **1** | **menu clássico**, sem trilho: seletor de empresa no topo, "Início", o menu do app, e embaixo busca, sino, configurações e usuário. É o padrão de um projeto recém-gerado (só o app Cadastros) |
| **2 ou mais** | **trilho de apps + menu do app** (o resto deste documento) |

O modo é decidido pelo registro (`config/apps.ts`, filtrado pelos apps ativos da empresa e pelo papel). Instalar o segundo app faz o trilho aparecer sem mexer em mais nada; desligar até sobrar um volta ao menu clássico.

## Registro de apps (`web/src/config/apps.ts`)

Um registro único. A casca, o Início, a busca (Ctrl+K), o sino, a grade "Todos os apps" e Configurações → Apps leem daqui. **Presets e módulos acrescentam o próprio app e nunca editam o de outro.**

```ts
export type AppCategory = 'geral' | 'trabalho' | 'conhecimento' | 'vendas' | 'atendimento' | 'pessoas' | 'comunicacao' | 'financeiro'

export type AppDef = {
  id: string                         // 'cadastros', 'paginas', 'tarefas', 'crm' (slug estável: vai para o banco nos fixados)
  name: string                       // 'Tarefas'
  description: string                // uma linha, aparece na grade e em Configurações → Apps
  icon: LucideIcon
  category: AppCategory
  match: string[]                    // prefixos de rota do app: ['/tarefas'] · Cadastros: ['/projetos', '/clientes', …]
  home: string                       // para onde o app abre na primeira vez: '/tarefas'
  Sidebar: ComponentType             // conteúdo do menu do app (usa SidebarSection / SidebarItem / SidebarTree)
  action?: { label: string; href?: string; onSelect?: () => void }   // "+" no topo do menu e no celular
  useBadge?: () => number | 'dot' | undefined                         // contador no ícone do trilho (TanStack Query)
  feature?: string                   // feature do plano que libera o app (sem ela: selo "Pro" e UpgradeDialog)
  roles?: Role[]                     // papéis que veem o app
  widgets?: HomeWidget[]             // blocos do Início
  search?: SearchProvider            // provedor do Ctrl+K
  settings?: { label: string; href: string }   // aba em Configurações (ex.: Configurações do CRM)
  defaultPinned?: boolean            // fixado por padrão no trilho
  order: number                      // ordem padrão (grade e fixados iniciais)
}

export const apps: AppDef[] = [cadastrosApp /*, paginasApp, tarefasApp, crmApp … */]
```

- Cada app mora em `web/src/features/<app>/app.tsx` e exporta o seu `AppDef`; `config/apps.ts` só importa e lista.
- `config/home-widgets.ts` e `config/search-providers.ts` (de projetos antigos) passam a ser **derivados** do registro (`apps.flatMap(a => a.widgets ?? [])`).
- **App ativo** = o app cujo `match` tem o prefixo mais longo que casa com a URL atual. Rotas globais (`/inicio`, `/configuracoes/*`, `/perfil`, `/notificacoes`, `/sem-empresa`) não pertencem a app nenhum.
- Grave a lista em `rodsaas.json → apps` (`[{ id, name, home }]`) sempre que o registro mudar: o `/rodsaas:verify` usa essa lista.
- Hook `useApps()` devolve os apps **visíveis** (registro − desligados pela empresa − sem papel), os fixados do usuário, o app ativo e `mode: 'single' | 'rail'`.

### App Cadastros (todo projeto nasce com ele)

`id: 'cadastros'`, categoria `geral`, ícone `Database`, descrição "Cadastros e módulos da empresa", `match` com a rota de cada módulo (`/projetos` no início), `home: '/projetos'`. O menu lista os módulos (ícone + rótulo plural). O `/rodsaas:module` acrescenta o módulo novo **aqui** (item no menu + prefixo em `match`), a menos que o usuário peça para colocá-lo dentro de outro app (ex.: "agendamento" dentro do CRM: aí o módulo entra no `Sidebar` e no `match` daquele app).

## Trilho (desktop, ≥ 768 px)

Faixa de **60 px** sempre visível, de cima para baixo:

1. **Seletor de empresa** (`org-switcher`): quadrado com a inicial/logo da empresa na cor da marca; o nome completo fica num `<span data-testid="org-switcher-current" class="sr-only">` e no tooltip. Abre o mesmo dropdown de sempre (`08-overlays.md`).
2. **Início** (`app-rail-item`, `data-app="inicio"`).
3. Separador e **apps fixados** do usuário, na ordem dele.
4. **App aberto que não está fixado**: aparece temporariamente depois dos fixados, com contorno tracejado, até a pessoa sair dele.
5. **Todos os apps** (`app-launcher-open`, ícone de grade).
6. Espaço flexível. A área dos apps rola sozinha se a tela for baixa (sem barra visível).
7. **Buscar** (abre o Ctrl+K) · **Notificações** (sino com contador) · **Configurações** · **Abrir menu** (só quando o menu está recolhido) · **usuário** (`user-menu`: avatar → Perfil, Tema, Ajuda, Sair com `user-menu-logout`).

Detalhes:
- Cada botão: 40×40, raio 10, ícone 18 px, **tooltip à direita** com o nome (e o atalho, quando houver). Botão de app é um link (`<Link>`), com `aria-label` e `aria-current="page"` no ativo.
- **Ativo**: fundo `--sidebar-accent`/cor da marca suave, ícone na cor da marca e uma barrinha de 3 px na borda esquerda.
- **Contador** (`useBadge`): bolinha vermelha com número (até 99+) ou só ponto. Só os apps visíveis no trilho consultam; atualização ao focar a janela e a cada 60 s.
- Clicar num app abre a **última tela que a pessoa usou nele** (mapa `appId → caminho` no `localStorage`, por empresa, em try/catch); sem histórico ou caminho inválido → `home`.

## Menu do app (coluna de 256 px)

- Cabeçalho: nome do app, **+** (`action`, quando houver) e **«** (`sidebar-collapse`, "Recolher menu · [").
- Corpo: o `Sidebar` do app, montado com os blocos compartilhados `SidebarSection` (título em caixa alta pequena, botão + opcional), `SidebarItem` (ícone ou bolinha de cor ou emoji, rótulo, contador, ativo pela URL) e `SidebarTree` (árvore com abrir/fechar, usada pelo Páginas). Item ativo com fundo da marca suave e texto em negrito.
- Rodapé opcional do app (ex.: uso de armazenamento).
- A coluna inteira tem `data-testid="sidebar"` e `data-app="<id>"`.
- **Início** tem menu próprio: "Visão geral" e a lista **Seus apps** (todos os visíveis, com ícone: atalho e descoberta). **Configurações, Perfil e Notificações** não têm menu do app: a coluna some e o conteúdo usa a largura toda (Configurações tem a navegação própria, por abas).

### Recolher e menu flutuante

- **Recolher**: «, tecla `[` (fora de campos de texto) ou o botão do trilho alternam. Recolhido, sobra só o trilho e o conteúdo ganha a tela; o trilho mostra o botão **»** (`sidebar-expand`).
- A escolha fica no `localStorage` (por dispositivo, em try/catch). Sem escolha salva: **recolhido em telas com menos de 1280 px**, aberto nas maiores.
- **Mouse por cima (só recolhido e só em dispositivos com mouse, `(hover: hover)`)**: parar **200 ms** sobre o ícone de um app abre o menu daquele app **flutuando por cima do conteúdo** (`app-flyout`, `data-app`), ao lado do trilho, com sombra. Ele fecha **300 ms** depois que o mouse sai do ícone e do menu, ou com `Esc`. Dentro dele, o alfinete (`sidebar-expand`) fixa o menu aberto de novo. Clicar no ícone navega normalmente e mantém recolhido.
- Telas de foco podem recolher sozinhas e restaurar ao sair (ex.: editor de página do Páginas em largura total), respeitando a escolha da pessoa se ela abrir de novo.
- Recolhido, o tooltip do ícone de app não aparece (o menu flutuante já mostra o nome); nos outros botões, sim.

## Todos os apps (`app-launcher`)

Painel aberto pelo botão de grade, ao lado do trilho (largura até 720 px, altura da tela), com:
- busca no topo (`app-launcher-search`, foco automático): filtra por nome, descrição e categoria ("férias", "contrato", "funil");
- apps **agrupados por categoria** na ordem: Geral, Trabalho, Conhecimento, Vendas e marketing, Atendimento, Pessoas (RH), Comunicação, Financeiro e operação; cada um num cartão (`app-launcher-item`, `data-app`) com ícone num quadrado na cor da categoria, nome e descrição;
- **estrela** em cada cartão (`app-pin`, `aria-pressed`) para fixar/desafixar no trilho, sem abrir o app;
- app fora do plano: selo "Pro" no cartão; abrir mostra o `UpgradeDialog`;
- rodapé: dica da estrela e, para owner/admin, **Gerenciar apps da empresa** (→ `/configuracoes/apps`);
- `Esc`, clique fora ou escolher um app fecha. Teclado: setas navegam, Enter abre.

Fixados:
- Guardados **no servidor, por usuário e empresa** (`PUT /v1/me/preferences { pinnedApps }`, ver backend): seguem a pessoa entre computador e celular.
- Sem escolha (`pinnedApps: null`): os apps com `defaultPinned`, senão os primeiros por `order`, **até 6**. Com 6 ou menos apps, todos aparecem.
- Reordenar: arrastando no trilho (dnd-kit) ou em Configurações → Apps → "Meu trilho".
- Atualização otimista (o ícone aparece/some na hora; erro desfaz com toast).

## Configurações → Apps (`/configuracoes/apps`)

Duas partes:
1. **Apps da empresa** (owner/admin; os outros veem sem os interruptores): lista por categoria com ícone, nome, descrição e de qual preset veio; interruptor (`app-toggle`, `data-app`, `role="switch"`, `aria-checked`) liga/desliga o app **para a empresa inteira** (`PATCH /v1/organizations/current { disabledApps }`). Desligar pede confirmação ("Ninguém da Acme verá o CRM. Os dados continuam guardados."). O Início e o último app ligado não podem ser desligados.
2. **Meu trilho** (todos): os fixados do usuário em ordem arrastável, com remover, e "Restaurar padrão".

App desligado: some do trilho, da grade, da barra do celular, do Início, do Ctrl+K e das notificações; acessar uma rota dele mostra o `not-found` com a casca. Os dados não são apagados, e a API continua protegendo por papel e plano (desligar é organização da interface, não segurança).

## Topo

Breadcrumb à esquerda (ícone do app › título da página, vindo do `PageHeader`/metadata), à direita o ponto de extensão `topbarItems` (ex.: o cronômetro ativo do Tarefas, visível em qualquer app), a busca (`Buscar em tudo… Ctrl K`) e o **alternar tema** (`theme-toggle`). Banners globais logo abaixo do topo. O usuário e o sino ficam no trilho (no menu clássico, no rodapé do menu).

## Busca global (Ctrl+K)

Junta os provedores de todos os apps visíveis, agrupados por app, e também lista **os próprios apps** ("Abrir CRM") e as telas dos menus ("CRM › Leads"). Vazio mostra recentes. Setas, Enter, Esc.

## Celular (< 768 px)

- **Sem trilho e sem coluna**: o trilho e o menu do desktop **não são renderizados** (use o hook de tela do shadcn, `useIsMobile`), não só escondidos por CSS. Isso evita elementos repetidos no DOM (dois `org-switcher`, dois `sidebar`).
- **Topo** de 54 px: ☰ (`sidebar-toggle`), ícone + título da tela, busca, sino.
- **Gaveta** (☰): `Sheet` da esquerda com `data-testid="sidebar"` e `data-app`, contendo o seletor de empresa, o menu do app atual (no modo clássico: Início + menu do app) e, no rodapé, configurações e usuário.
- **Barra de apps embaixo** (`app-tabbar`, só no modo trilho): Início + os 3 primeiros fixados + **Apps** (abre a grade em tela cheia); cada item `app-tabbar-item` com `data-app`, ícone, nome curto e contador. Respeite a área segura (`env(safe-area-inset-bottom)`).
- Ação principal da tela vira botão flutuante acima da barra.

## Teclado e acessibilidade

- Atalhos (fora de campos de texto): `[` recolher/abrir o menu · `Ctrl/⌘+K` busca · `Esc` fecha flutuante, grade, gaveta e popovers.
- Trilho é um `<nav aria-label="Apps">`; menu do app é `<nav aria-label="<nome do app>">`. Foco visível em tudo; ordem de tabulação: trilho → menu → conteúdo.
- Tooltips também no foco do teclado. Animações curtas (≤ 150 ms) e desligadas com `prefers-reduced-motion`.

## Estados

- Sessão carregando: skeleton da casca (trilho com 5 quadrados, coluna com 6 linhas, topo).
- Contador que falhou: some (não mostra erro no trilho).
- Fixar/desligar com erro: desfaz e mostra toast com o motivo.
- App sem permissão de papel: não aparece; rota → `not-found`.

## Contrato testável

Além dos testids da casca que já existiam (`app-shell`, `sidebar`, `sidebar-toggle`, `org-switcher`, `org-switcher-current`, `org-switcher-item`, `org-switcher-create`, `user-menu`, `user-menu-logout`, `theme-toggle`):

| testid | Onde |
|---|---|
| `app-rail` | o trilho (só existe no modo trilho, no desktop) |
| `app-rail-item` | cada botão de app no trilho, com `data-app` (inclui `inicio`) e `aria-current="page"` no ativo |
| `app-launcher-open`, `app-launcher`, `app-launcher-search`, `app-launcher-item`, `app-pin` | grade de apps |
| `sidebar-collapse`, `sidebar-expand` | recolher (no menu) e abrir (no trilho e no menu flutuante) |
| `app-flyout` | menu flutuante, com `data-app` |
| `app-tabbar`, `app-tabbar-item` | barra do celular, com `data-app` |
| `app-toggle` | interruptor de app em `/configuracoes/apps`, com `data-app` e `aria-checked` |

Nenhum testid pode aparecer duas vezes no DOM ao mesmo tempo (desktop e celular renderizam peças diferentes; o menu flutuante e a coluna nunca aparecem juntos).
