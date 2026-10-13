# Frontend: app Páginas, árvore, databases e página pública

O preset **não troca a casca**. Ele registra o app **Páginas** na casca de apps (`skills/frontend/references/12-casca-e-apps.md`; comportamento no `skills/frontend/assets/simulador-navegacao.html`). Continuam iguais: sessão, guard de rota, trilho, banners, `UpgradeDialog`, toasts, estados de tela, tema.

```ts
// web/src/features/pages/app.tsx
export const paginasApp: AppDef = {
  id: 'paginas', name: 'Páginas', description: 'Documentos e databases (estilo Notion)',
  icon: FileText, category: 'conhecimento', order: 10, defaultPinned: true,
  match: ['/paginas'], home: '/paginas',
  Sidebar: PagesSidebar,                        // "Menu do app" abaixo
  action: { label: 'Nova página', onSelect: createRootPage },
  widgets: [recentPagesWidget, favoritePagesWidget],
  search: pagesSearchProvider,
}
```

Acrescente em `config/apps.ts` e em `rodsaas.json → apps`.

## Rotas

| Rota | Tela |
|---|---|
| `/paginas` | início do app: recentes e favoritos em cards, botão "Nova página" |
| `/paginas/[id]` | página (documento ou database) |
| `/pagina/[id]` | **redireciona** para `/paginas/[id]` (links antigos e conteúdo já salvo) |
| `/publico/[token]` | página pública, fora do app (sem login, sem casca) |
| `/inicio` | o Início global da casca, com os widgets "Páginas recentes" e "Favoritos" |

Remova `/projetos` (se o usuário confirmou a remoção do exemplo).

## Menu do app

De cima para baixo (no menu clássico, quando é o único app, abaixo do "Início"):

1. **Buscar** (abre o Ctrl+K já filtrado em páginas) · **Atualizações** (opcional, páginas editadas por outros).
2. **Favoritos** (some se vazio), reordenáveis.
3. **Páginas**: a árvore do workspace, com **+** no título da seção.
4. **Modelos** (se houver) · **Lixeira** (abre um popover/painel).

O seletor de workspace, o Início, as configurações e o usuário ficam no trilho (casca), não aqui.

Comportamento:
- Recolher com `[` ou « (padrão da casca); dentro do editor, `Ctrl+\\` também recolhe. Abrir uma página em "largura total" pode recolher sozinho e restaurar ao sair.
- Estado aberto/fechado de cada item da árvore guardado no `localStorage` por workspace (em try/catch).
- Página atual destacada e com os ancestrais abertos.

### Árvore de páginas

- Dados: `GET /v1/pages/tree` (TanStack Query), atualizado de forma **otimista** em criar, renomear, mover, arquivar e restaurar.
- Cada item: seta de abrir/fechar (só se tiver filhos), ícone (ou ícone padrão de página/database), título ("Sem título" em cinza).
- Ao passar o mouse: **+** (criar sub-página e abrir) e **⋯** (Renomear, Duplicar, Mover para…, Copiar link, Favoritar, Excluir).
- **Arrastar e soltar** (dnd-kit ou equivalente atual): soltar entre itens reordena; soltar sobre um item torna filha. Indicador visual de onde vai cair. Bloqueie no front o que o backend recusaria (soltar dentro de um descendente). Erro da API → desfaz e toast.
- "Mover para…" (alternativa por teclado e celular): `Command` com busca de páginas destino.

## Busca (provedor do Ctrl+K global)

O Ctrl+K é da casca (busca em todos os apps); o Páginas registra o provedor `pagesSearchProvider` no `AppDef`. Os resultados do grupo "Páginas":
- Vazio → páginas recentes.
- Digitando (debounce 250 ms) → `GET /v1/search`, cada resultado com ícone, título, caminho (pais) e trecho com o termo destacado (escapando o texto; só as marcas viram `<mark>`).
- Enter abre; setas navegam; estados de carregando, nada encontrado e erro.

## Início do app (`/paginas`)

"Bom dia, Ana" (saudação pela hora), **Visitadas recentemente** (cards com capa/ícone e título, rolagem horizontal), **Favoritos**, e "Nova página". Workspace novo mostra "Comece aqui" em destaque.

## Lixeira

Popover ou painel com busca por título, lista das páginas excluídas (com o caminho original), **Restaurar** e **Excluir de vez** (com `ConfirmDialog`). Texto: "Páginas na lixeira há mais de 30 dias são excluídas automaticamente."

Abrir uma página arquivada pelo link mostra um aviso no topo: "Esta página está na lixeira" + Restaurar / Excluir de vez, com o conteúdo somente leitura.

## Databases

A página de database mostra: título/ícone/capa como qualquer página, **abas das visões** (+ nova visão), barra com **Filtro**, **Ordenar**, busca e **Novo**.

### Tabela

- Colunas = título + propriedades visíveis; largura redimensionável (salva na visão); cabeçalho com menu (renomear, tipo, ordenar, ocultar, excluir).
- **Células editáveis no lugar**: texto/número/URL (input), seleção/múltipla (popover com busca e "Criar opção"), data (calendário), checkbox (clique), pessoa (membros do workspace).
- Salvamento por célula, otimista, desfaz se a API recusar (com o erro do campo).
- "+ Nova" no fim cria linha; "+" no cabeçalho cria propriedade.
- Clique no título (ou ícone "Abrir") abre a linha no **side peek**.
- Paginação por cursor com "Carregar mais" no fim da tabela.

### Quadro (kanban)

- Colunas = opções da propriedade de agrupamento (na ordem delas) + "Sem status"; contagem em cada coluna.
- Cards com título e as propriedades visíveis.
- **Arrastar entre colunas e dentro da coluna**: otimista, desfaz se falhar. Alternativa por teclado: menu do card "Mover para…".
- "+ Novo" no fim de cada coluna cria linha já com aquele status.
- Sem propriedade de seleção: estado vazio explicando e botão "Criar propriedade Status".

### Side peek

O `FormSheet` da base em versão larga, abrindo pela direita com a linha como página: título, propriedades (editáveis, em lista), e o editor do conteúdo com o mesmo autosave. Botão para abrir em página inteira. A URL guarda `?linha=<id>` (voltar fecha; link abre direto).

## Compartilhar

Botão no topo da página → popover:
- "Publicar na web" (switch). Sem a feature `public_pages` no plano: switch desabilitado com selo do plano e o `UpgradeDialog` ao clicar.
- Ligado: link com "Copiar" e aviso "Qualquer pessoa com o link pode ver esta página".
- Desligar pede confirmação ("O link atual vai parar de funcionar").

## Página pública (`/publico/[token]`)

Fora do grupo `(app)`, sem guard e sem casca:
- capa, ícone, título e o conteúdo no editor **somente leitura**;
- rodapé discreto "Feito com {produto}";
- 404 amigável se o link não existir mais;
- metadata com o título da página e `noindex`.

## Estados (lembrete)

Toda área que carrega dados tem skeleton com o formato, vazio com ação, erro com "tentar de novo" (`05-estados-e-feedback.md` do frontend). Árvore vazia: "Nenhuma página ainda" + "Criar a primeira página". Database sem linhas: "Nenhuma linha" + "Nova".
