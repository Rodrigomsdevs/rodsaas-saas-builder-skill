# Portal de ajuda, chamado do cliente e widget

Fora do grupo `(app)`: sem casca, sem guard. Renderização no servidor do Next para os artigos (título, descrição e `robots` indexável — a central de ajuda aparece no Google), interação no navegador. Bundle separado do app logado. Marca do produto ou da empresa (`helpdesk_branding`); rodapé "Feito com {produto}" no Free.

## Rotas

| Rota | Tela |
|---|---|
| `/ajuda/[portal]` | início da central (`helpdesk-portal`): título, **busca** grande (`helpdesk-portal-search`), categorias (cartões com quantidade), artigos populares, botões **Abrir chamado** (`helpdesk-portal-new`) e **Meus chamados** |
| `/ajuda/[portal]/busca?q=` | resultados (`helpdesk-portal-article` com `data-slug`: título, trecho com o termo destacado, categoria); vazio com "Não achou? Abra um chamado" |
| `/ajuda/[portal]/c/[categoria]` | artigos da categoria |
| `/ajuda/[portal]/artigo/[slug]` | artigo (`helpdesk-article-view`): título, data de atualização, conteúdo, **Isso ajudou?** (`helpdesk-article-helpful` sim/não, com "Obrigado!" e, no "não", link para abrir chamado), relacionados |
| `/ajuda/[portal]/novo` | abrir chamado (abaixo) |
| `/ajuda/[portal]/meus-chamados` | pede o e-mail → "Enviamos um link para você"; com o link (`?s=<token>`), lista dos chamados do contato com status e última atualização |
| `/chamado/[token]` | chamado do cliente (abaixo) |
| `/ajuda/[portal]/widget` | conteúdo do widget (iframe) |

## Abrir chamado (`/ajuda/[portal]/novo`)

Formulário `helpdesk-portal-form` com `<label>` ligado a cada campo, rótulos exatos **Nome**, **E-mail**, **Assunto** e **Descrição** (o verify usa), depois os campos do portal (componente `PublicField` do Forms), anexos (arrastar ou escolher; limite e tipos mostrados) e texto de privacidade.

- **Sugestões** (`helpdesk-portal-suggestions`): enquanto a pessoa digita o assunto (debounce 400 ms, a partir de 3 letras), até 3 artigos ("Talvez isto ajude"); clicar abre o artigo em nova aba. Conte quantos chamados foram evitados (evento `deflected` quando abre a sugestão e não envia).
- Botão **Enviar** (`helpdesk-portal-submit`, com loading e `Idempotency-Key`); campo isca invisível e `_ts`.
- Erros: 400 → mensagem embaixo do campo (`helpdesk-portal-field-error` com `data-field` = `name`, `email`, `subject`, `description` ou o id do campo), foco no primeiro; os dados digitados ficam.
- Sucesso (`helpdesk-portal-created`): "Recebemos seu chamado **#1024**", "Enviamos uma cópia para ana@exemplo.com", botão **Acompanhar chamado** (o `ticketUrl`).
- Pré-preenchimento por URL (`?nome=&email=&assunto=`), usado pelo widget e por links do produto do cliente.

## Chamado do cliente (`/chamado/[token]`, `helpdesk-customer-ticket`)

- Cabeçalho: número, assunto, status em português com cor (Aberto · Aguardando sua resposta · Em andamento · Resolvido · Fechado), aberto em (data por extenso).
- **Conversa** em ordem cronológica: cada mensagem pública (`helpdesk-customer-message` com `data-author` = `AGENT` ou `CUSTOMER`) com nome (atendente pelo primeiro nome e a empresa), data, conteúdo (HTML sanitizado) e anexos. Nota interna nunca chega aqui (a API nem devolve).
- **Responder**: campo com rótulo **Sua resposta** (`helpdesk-customer-reply`), anexos, botão **Enviar resposta** (`helpdesk-customer-reply-submit`). A mensagem aparece na hora e o status volta para Aberto.
- **Isso resolveu meu problema** (`helpdesk-customer-solve`) quando o chamado está aberto ou aguardando: marca como Resolvido na hora (com "Desfazer" por 8 s, que só responde reabrindo) e mostra a pesquisa.
- Resolvido/fechado com pesquisa disponível: "Como foi o atendimento?" com **👍 Bom** (`helpdesk-csat-good`) e **👎 Ruim** (`helpdesk-csat-bad`), comentário opcional, **Enviar avaliação** (`helpdesk-csat-submit`) → "Obrigado pela avaliação!" (`helpdesk-csat-thanks`). Chegando pelo link do e-mail (`?avaliar=bom|ruim`), a nota vem marcada e só grava ao clicar em Enviar.
- Fechado: aviso "Este chamado foi fechado. Se precisar, responda abaixo e abriremos um novo." — responder cria o chamado novo e leva até ele.
- Token inválido: "Chamado não encontrado" com link para a central.

## Widget

Script para o site do cliente (tela "Widget" nas configurações mostra o código):

```html
<script src="https://app.seusaas.com.br/ajuda-widget.js" data-portal="acme" data-cor="#4F46E5" async></script>
```

- Botão flutuante "Ajuda" (canto configurável) que abre um painel com iframe de `/ajuda/[portal]/widget`: busca nos artigos, artigo aberto dentro do painel, **Abrir chamado** (mesmo formulário, `source: 'WIDGET'`) e "Seus chamados" (os abertos neste navegador, guardados no `localStorage` do widget com try/catch).
- Comunicação por `postMessage` com origem conferida (`rodsaas-helpdesk:open`, `:close`, `:created`); o site pode abrir o widget por `window.RodsaasHelpdesk.open({ assunto, email, nome })`.
- `frame-ancestors *` **só** em `/ajuda/[portal]/widget`; o resto do app segue `'self'`. Script pequeno, sem dependências, sem cookies de terceiros.

## Detalhes

- Página do artigo com `<h1>` único, índice automático para artigos longos (h2/h3), imagens com `loading="lazy"`, código com botão copiar.
- Busca acessível: `role="search"`, resultados anunciados ("5 artigos encontrados").
- Alvos de 44 px e layout de uma coluna no celular; teclado: `/` foca a busca.
- `sitemap.xml` do portal com os artigos publicados; `<link rel="canonical">`.
