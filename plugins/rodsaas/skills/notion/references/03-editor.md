# Página e editor de blocos

## Editor

Use um editor de blocos pronto no estilo Notion, não construa um do zero. Recomendação: **BlockNote** (sobre ProseMirror/TipTap), que já traz menu "/", alça de arrastar blocos, barra de formatação e atalhos markdown. Antes de instalar, confira na doc atual:

- a **licença de cada pacote**: use só os pacotes centrais de licença livre; pacotes "pro"/XL (multi-colunas, exportação, IA) costumam ter licença restritiva ou paga — não use sem o usuário decidir;
- se existe a integração de UI com **shadcn/ui** (combina com o resto do painel); senão, a integração padrão, com o tema ajustado;
- o **dicionário em português** para os textos do editor (menu "/", placeholders). Se não houver, traduza os itens que aparecem.

Alternativa aceitável, se o BlockNote não servir na versão atual: TipTap com as extensões equivalentes. Registre a escolha no relatório.

### Blocos e atalhos

| Bloco | Atalho markdown | No menu "/" |
|---|---|---|
| Parágrafo | — | Texto |
| Título 1, 2, 3 | `#`, `##`, `###` + espaço | Título 1/2/3 |
| Lista com marcadores | `-` ou `*` + espaço | Lista |
| Lista numerada | `1.` + espaço | Lista numerada |
| To-do | `[]` + espaço | Lista de tarefas |
| Toggle | `>` + espaço | Toggle |
| Citação | `"` + espaço | Citação |
| Callout | — | Destaque |
| Divisor | `---` | Divisor |
| Código | ` ``` ` | Código |
| Imagem (URL) | — | Imagem |
| Link para página | `@` ou `[[` | Página / Link para página |
| Sub-página | — | Página (cria filha e insere o link) |

Formatação inline: Ctrl+B, Ctrl+I, Ctrl+U, Ctrl+Shift+S (tachado), Ctrl+E (código), Ctrl+K (link, só dentro do editor; fora dele, Ctrl+K abre a busca).

Bloco que o editor não suporta nativamente (callout, link de página): use os mecanismos de bloco customizado do próprio editor, com aparência dos tokens da marca.

### Aparência

- Coluna de conteúdo centralizada (~720px); com "Largura cheia" ligado, ocupa a área toda.
- Tema do editor ligado aos tokens (`--foreground`, `--muted`, `--primary-text`, `--border`…) e trocando junto com claro/escuro.
- Cores de texto e de fundo do editor: paleta própria do editor mapeada para versões legíveis nos dois temas.
- Carregue o editor só no navegador (import dinâmico, sem SSR) e com skeleton das linhas enquanto carrega.
- Monte uma instância por página (`key` = id da página); trocar de página não pode misturar conteúdos.

## Topo da página

- **Breadcrumbs** (ancestrais clicáveis; no meio corta com "…" quando ficar comprido).
- "Editado há 3 min por Ana" (relativo, atualizando).
- **Indicador de salvamento**: "Salvando…" / "Salvo" / "Sem conexão — vamos salvar quando voltar" / "Erro ao salvar — tentar de novo".
- ⭐ Favoritar, **Compartilhar**, menu ⋯ (Largura cheia, Copiar link, Duplicar, Mover para…, Excluir).

Acima do título, ao passar o mouse: "Adicionar ícone" e "Adicionar capa".

- **Ícone**: seletor de emoji com busca (use uma lib mantida e leve; confira a licença) e "Remover".
- **Capa**: galeria de degradês gerados das cores da marca (`gradient:1`…`gradient:8`) e "Link de imagem" (só `https`). Botões "Trocar" e "Remover" ao passar o mouse.
- **Título**: campo grande, placeholder "Sem título"; Enter leva o foco para o primeiro bloco; o título também vai no autosave.

## Autosave (o mais importante desta fase)

Objetivo: o usuário nunca perde texto e nunca sobrescreve outra pessoa sem saber.

```
estado local: content, title, version, dirty, saving
a cada mudança:   dirty = true; agenda save em 800 ms (reinicia a cada tecla), no máximo a cada 5 s
save():
  se saving → marca "salvar de novo quando terminar" e sai (uma request por vez, nunca paralelas)
  envia PATCH { version, title, content }
  sucesso   → version = resposta.version; dirty = false (se não houve mudança durante o envio)
  409       → pausa o autosave e abre o diálogo de conflito
  rede/5xx  → mantém dirty, tenta de novo com espera crescente (2 s, 5 s, 10 s, 30 s), mostra o estado
ao trocar de página, fechar a aba ou perder o foco da janela → salva na hora o que estiver pendente
```

- **Rascunho local**: enquanto `dirty`, guarde `{ title, content, version }` no `localStorage` por página (em try/catch). Ao abrir a página, se houver rascunho mais novo que a versão do servidor e diferente dela, ofereça "Recuperar alterações não salvas".
- `beforeunload` avisa se houver algo pendente.
- Atualize o título na árvore do menu de forma otimista enquanto digita.

### Conflito (`VERSION_CONFLICT`)

Diálogo: "Ana editou esta página às 14:32 enquanto você escrevia."

- **Ver a versão mais nova**: copia o seu conteúdo para a área de transferência (avisa), recarrega a página do servidor.
- **Manter a minha**: reenvia com a `currentVersion` que veio no erro (sobrescreve, e o usuário escolheu isso conscientemente).

Sem edição colaborativa em tempo real na v1. Esse diálogo é a proteção.

## Segurança do conteúdo

- Links: o front só aceita `http`, `https`, `mailto` e links internos; o backend também sanitiza (defesa em dobro).
- Imagens: só URL `https`; sem upload na v1 (desligue a opção de upload do editor).
- Nenhum bloco de HTML cru. O conteúdo é renderizado pelo editor, nunca por `dangerouslySetInnerHTML`.
- Página pública usa o mesmo editor em **modo somente leitura**.

## Teclado e acessibilidade

- Ctrl+K: busca (fora do editor). Ctrl+\\: recolher o menu do app (o `[` da casca não funciona dentro do texto).
- Todos os controles do topo acessíveis por teclado e com rótulo.
- Diálogo de conflito com foco em "Ver a versão mais nova".
