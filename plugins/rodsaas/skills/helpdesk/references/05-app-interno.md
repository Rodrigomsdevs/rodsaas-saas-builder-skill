# App interno (telas)

Dentro do app **Suporte** da casca de apps. Componentes, estados e formulários da skill `frontend`. Código em `web/src/features/helpdesk/`.

## Rotas

| Rota | Tela |
|---|---|
| `/suporte` | caixa de entrada — `?visao=mine\|unassigned\|open\|pending\|on_hold\|breaching\|solved\|closed\|spam\|all\|<id>` (padrão `open`), filtros e busca na URL |
| `/suporte/chamados/[id]` | chamado (aceita também o número: `/suporte/chamados/1024` redireciona) |
| `/suporte/novo` | novo chamado pela equipe |
| `/suporte/contatos` · `/suporte/contatos/[id]` | contatos |
| `/suporte/artigos` · `/suporte/artigos/[id]` | base de conhecimento · editor do artigo |
| `/suporte/relatorios` | relatórios |
| `/suporte/configuracoes` | geral, portal e widget, filas e atendentes, horário e SLA, caixas de e-mail, macros, gatilhos, campos do chamado, satisfação, API e webhooks (owner/admin; "Minha assinatura e macros" para todos) |

## Caixa de entrada (`/suporte`)

- **Visões** no menu do app (`helpdesk-view` com `data-view` e o contador `helpdesk-view-count`); a ativa com `aria-current`.
- Lista (`helpdesk-ticket-list`) com uma linha por chamado (`helpdesk-ticket-row` com `data-ticket-id` e `data-status`): caixa de seleção, número, assunto (negrito quando o cliente respondeu e ninguém viu), solicitante, fila, responsável (avatar), prioridade, status (selo com cor e texto), **selo do SLA** (`helpdesk-sla-badge` com `data-state`: "vence em 25 min", "estourado há 2 h", pausado), atualizado há. Celular: cartões.
- Filtros (status, prioridade, fila, responsável, canal, etiqueta, período) e busca (`#1024`, texto, e-mail); ordenação: prazo (padrão), atualizado, criado. "Salvar visão".
- Ações em massa na seleção: atribuir, status, prioridade, fila, etiquetas, mesclar (2+), spam.
- Recarrega a cada 20 s e ao focar a janela, sem perder seleção nem rolagem; chamado novo entra com destaque breve.
- **+ Chamado** (`helpdesk-ticket-new`) abre `/suporte/novo`.

## Chamado (`/suporte/chamados/[id]`, `helpdesk-ticket` com `data-status`)

Três colunas no desktop (conversa no centro, propriedades à direita, histórico do contato recolhível), uma no celular.

- **Cabeçalho**: número (`helpdesk-ticket-number`), assunto editável, canal, criado em, botões ⋯ (mesclar, spam, imprimir, ver original do e-mail, excluir).
- **Propriedades** (salvam na hora, otimistas): status (`helpdesk-ticket-status`, um `<select>` ou menu com os quatro status que a equipe pode escolher), prioridade (`helpdesk-ticket-priority`), fila, responsável (`helpdesk-ticket-assignee`) com **Atribuir a mim** (`helpdesk-assign-me`), etiquetas (com sugestões), CC, campos personalizados, SLA (primeira resposta e solução com o estado e o horário), satisfação (quando houver).
- **Conversa**: mensagens em ordem (`helpdesk-message` com `data-kind` = `PUBLIC`, `NOTE` ou `SYSTEM`): pública com fundo neutro, **nota interna com fundo amarelo e o texto "Nota interna"**, eventos do sistema em linha discreta ("Bia mudou a prioridade para Alta · 10:32"); autor, data, anexos, "mostrar imagens" quando o e-mail tinha imagens externas, "ver e-mail original", falha de envio com **Reenviar**. Mensagens longas citadas recolhidas ("…").
- **Responder** (fixo embaixo):
  - abas **Resposta pública** (`helpdesk-reply-mode-public`) e **Nota interna** (`helpdesk-reply-mode-note`) — a nota muda a cor do editor e o botão;
  - editor rico (`helpdesk-reply-editor`, um elemento com `role="textbox"` e `aria-label="Resposta"`): negrito, itálico, lista, link, código, colar imagem (vira anexo inline), anexos, `@` para mencionar (só em nota), `/` para macros;
  - **Macros** (`helpdesk-macro-open` → lista com busca, `helpdesk-macro-item`): aplica o texto (com variáveis preenchidas) e as ações no rascunho;
  - **Artigos**: buscar e inserir o link de um artigo publicado;
  - botão **Enviar** (`helpdesk-reply-submit`) com o status junto: "Enviar como Aguardando cliente ▾" (menu: Aberto, Aguardando cliente, Em espera, Resolvido); nota: "Adicionar nota";
  - rascunho salvo por chamado (sobrevive a recarregar; apaga ao enviar);
  - aviso de colisão no topo do editor: "Bia está vendo este chamado" / "Bia está respondendo…" (presença a cada 10 s); se chegou mensagem nova do cliente enquanto escrevia, aviso "Nova mensagem do cliente — ver" antes de enviar.
- **Histórico do solicitante**: nome, e-mail, empresa, outros chamados (abertos primeiro), notas do contato, link para o CRM.
- Fechado: editor só com nota; banner "Chamado fechado" com **Abrir chamado novo para este cliente**.

## Novo chamado (`/suporte/novo`)

Solicitante (busca de contato ou novo nome/e-mail), assunto, mensagem, "Isto é": **pedido do cliente** (registrar, padrão — telefone/balcão) · **mensagem para o cliente** (manda e-mail) · nota; canal (telefone, interno), prioridade, fila, responsável, etiquetas, campos. Usa `form-sheet`/página com `field-*` da base.

## Contatos

Tabela com nome, e-mail, empresa, chamados (abertos/total), último chamado; detalhe com chamados, notas, **Bloquear remetente**, **Novo chamado**, link do CRM.

## Base de conhecimento (`/suporte/artigos`)

- Categorias à esquerda (arrastar para ordenar), lista de artigos (`helpdesk-article-row`: título, status Rascunho/Publicado/Interno, visualizações, % "ajudou", atualizado); **+ Artigo** (`helpdesk-article-new`).
- Editor (`/suporte/artigos/[id]`): título, endereço (slug com checagem), categoria, editor rico com autosave, "Só para a equipe", **Publicar**/**Despublicar**, **Ver no portal**; prévia como o cliente vê.

## Relatórios (`/suporte/relatorios`)

Filtros (período, fila, atendente, canal). Cartões: criados, resolvidos, abertos agora, primeira resposta (mediana), solução (mediana), SLA cumprido, satisfação. Gráficos (padrão do projeto, cores do tema): criados × resolvidos por dia, fila acumulada, por canal, por prioridade, etiquetas mais usadas, mapa de calor dia × hora; tabela por atendente (resolvidos, primeira resposta, solução, SLA, satisfação). Exportar CSV.

## Configurações (`/suporte/configuracoes`)

- **Geral**: visibilidade, fechamento automático, lembrete ao cliente, campos do chamado (editor de perguntas do Forms, marcando quais aparecem no portal), lista de bloqueio.
- **Portal e widget**: título, endereço (`portalSlug`), cores e logo (`helpdesk_branding`), código do widget, link.
- **Filas e atendentes**: filas com distribuição (manual, rodízio, por carga, limite), atendentes (ativar/desativar, filas, disponível), contagem no limite do plano.
- **Horário e SLA**: horário semanal (mesmo componente da disponibilidade da Agenda: linhas por dia com intervalos), exceções, feriados nacionais, metas por prioridade (primeira resposta e solução, horário comercial ou 24 h) com frase de exemplo ("Urgente: responder em até 30 min, a qualquer hora").
- **Caixas de e-mail**: lista com status e última leitura; nova caixa (IMAP/SMTP com presets Gmail, Outlook/Microsoft 365, Zoho, Locaweb, KingHost, HostGator e "outro"; ou webhook com o endereço para colar no provedor), testar conexão, e-mails com problema.
- **Macros**, **Gatilhos** (editor "Quando… Se… Então…" com condições e ações em linguagem natural, ativar/desativar, ordem), **Satisfação** (ligar, texto), **API e webhooks**.

## Início e trilho

Widgets: **Minha fila** (meus abertos e sem responsável, com os que vencem primeiro), **Prazos em risco** (estourando nas próximas 2 h), **Satisfação da semana**. Contador no trilho: meus abertos + sem responsável nas minhas filas.

## Contrato testável (data-testid)

A bateria do `/rodsaas:verify` (`suite/tests/13-helpdesk.spec.ts`) roda quando `rodsaas.json` tem `helpdesk` em `presets`. Lista canônica em `skills/verify/contract.json` (`presets.helpdesk`):

| testid | Elemento |
|---|---|
| `helpdesk-view` (`data-view`), `helpdesk-view-count` | visões e contadores |
| `helpdesk-ticket-list`, `helpdesk-ticket-row` (`data-ticket-id`, `data-status`), `helpdesk-sla-badge` (`data-state`) | caixa de entrada |
| `helpdesk-ticket-new` | novo chamado |
| `helpdesk-ticket` (`data-status`), `helpdesk-ticket-number`, `helpdesk-ticket-status`, `helpdesk-ticket-priority`, `helpdesk-ticket-assignee`, `helpdesk-assign-me` | chamado e propriedades |
| `helpdesk-message` (`data-kind`) | mensagens |
| `helpdesk-reply-editor`, `helpdesk-reply-mode-public`, `helpdesk-reply-mode-note`, `helpdesk-reply-submit`, `helpdesk-macro-open`, `helpdesk-macro-item` | responder |
| `helpdesk-article-new`, `helpdesk-article-row` | base de conhecimento |
| `helpdesk-portal`, `helpdesk-portal-search`, `helpdesk-portal-article` (`data-slug`), `helpdesk-article-view`, `helpdesk-article-helpful`, `helpdesk-portal-new`, `helpdesk-portal-form`, `helpdesk-portal-field-error` (`data-field`), `helpdesk-portal-submit`, `helpdesk-portal-created`, `helpdesk-portal-suggestions` | portal (`04-portal-e-widget.md`) |
| `helpdesk-customer-ticket`, `helpdesk-customer-message` (`data-author`), `helpdesk-customer-reply`, `helpdesk-customer-reply-submit`, `helpdesk-customer-solve`, `helpdesk-csat-good`, `helpdesk-csat-bad`, `helpdesk-csat-submit`, `helpdesk-csat-thanks` | chamado do cliente |
