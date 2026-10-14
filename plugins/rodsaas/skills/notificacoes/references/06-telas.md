# 06 · Telas

Tudo com os componentes do projeto (shadcn), a marca do `rodsaas.json` e os padrões de estado e feedback da base (`skills/frontend/references/05-estados-e-feedback.md`). A frase de cada notificação é montada dos `segments` (texto + `<strong>`), **nunca** com `innerHTML`/`dangerouslySetInnerHTML`.

## Rotas

| Rota | Tela |
|---|---|
| (sino) | painel flutuante, em qualquer tela da casca |
| `/notificacoes` | caixa de entrada completa (rota global, sem menu de app) |
| `/configuracoes/notificacoes` | preferências (aba em Configurações, todos os papéis) |
| `/notificacoes/descadastrar?token=` | pública, fora da casca, sem login |

## Hook `useNotifications()`

- `unreadCount` e `byApp` do `GET /v1/notifications/unread-count`: ao montar, **ao focar a janela**, a cada 60 s (só com a aba visível, `document.visibilityState`) e depois de cada ação.
- Lista do painel e da página com React Query (`useInfiniteQuery`, cursor); abrir o painel recarrega a primeira página.
- Ações otimistas (ler, não lida, todas, remover): mudam a lista e o contador na hora; erro desfaz e mostra toast com o motivo.
- **Título da aba** com o número (`documentTitle`: "(3) Tarefas · Acme"); some com 0.
- Fuso de quem vê: `me.organization.timezone` para `dayBucket` e `relativeTime` (da lib).

## Sino

- **Desktop**: no trilho, entre Buscar e Configurações (`skills/frontend/references/12-casca-e-apps.md`); no menu clássico, no rodapé do menu. **Celular**: no topo, ao lado da busca.
- Botão 40×40 com ícone `Bell`, `aria-label` "Notificações" + ", 3 não lidas" quando houver; tooltip "Notificações".
- **Contador** (`notifications-badge`): bolinha vermelha com `badgeText` (1…99, "99+"); some com 0 (não mostra "0"). Contador que falhou ao carregar some (não mostra erro no trilho).
- Clicar abre o **painel**; `Esc`, clique fora ou escolher um item fecha. Na própria `/notificacoes`, o sino só leva ao topo da lista.

## Painel (`notifications-panel`)

Popover de 400 × até 600 px ao lado do trilho (no celular, `Sheet` de baixo em tela cheia), com:

1. **Cabeçalho**: "Notificações", **Marcar todas como lidas** (`notifications-mark-all`, desabilitado sem não lidas; manda `before` = hora em que a lista carregou) e engrenagem (`notifications-settings`) → `/configuracoes/notificacoes`.
2. **Abas** Não lidas (`notifications-tab-unread`) · Todas (`notifications-tab-all`), com `aria-selected`; abre em **Não lidas** quando há alguma, senão em Todas.
3. **Lista** em grupos **Hoje · Ontem · Anteriores** (`notifications-group`, `data-bucket="today|yesterday|older"`), cada item (`notification-item`, `data-id`, `data-type`, `data-unread="true|false"`):
   - avatar do ator (ou ícone do app quando o ator é nulo), com o ícone pequeno do app no canto;
   - frase (`notification-text`) com os destaques em negrito, até 2 linhas; trecho (`snippet`) em cinza, 1 linha;
   - hora relativa (`notification-time`, `relativeTime`, com a data completa no `title`);
   - bolinha da cor da marca quando não lida;
   - ações no hover/foco: **Marcar como lida/não lida** (`notification-toggle-read`) e **Remover** (`notification-remove`).
   - O item inteiro é um link para `url`: clicar marca como lida (otimista) e navega; com Ctrl/⌘ ou botão do meio, abre em nova aba e marca como lida.
4. **Rodapé**: **Ver todas** (`notifications-see-all`) → `/notificacoes`.
5. Rolagem infinita dentro do painel (20 por vez).

Teclado: setas sobem/descem entre itens, Enter abre, `R` alterna lida, `Esc` fecha e devolve o foco ao sino. `role="dialog"` com `aria-label="Notificações"`.

## Página `/notificacoes` (`notifications-page`)

- Título "Notificações" com o número de não lidas.
- Filtros: **Não lidas** (`notifications-filter-unread`) · **Todas** (`notifications-filter-all`); **App** (`notifications-filter-app`: Select com "Todos os apps", "Geral" e cada app instalado e ligado, opções `notifications-filter-app-option` com `data-value`); **Tipo** (`notifications-filter-type`, tipos do app escolhido, `notifications-filter-type-option` com `data-value`). Filtros na URL (`?status=unread&app=tarefas`).
- **Marcar todas como lidas** (`notifications-page-mark-all`), respeitando os filtros (manda `app`/`type`/`before`).
- A mesma lista do painel (mesmos `notification-item`, grupos Hoje/Ontem/Anteriores), em largura de leitura (até 720 px), rolagem infinita com "Carregando mais…" e fim "Isso é tudo".
- Seleção em massa (checkbox por item, aparece no hover e no celular com toque longo): marcar como lidas/não lidas, remover.
- Item de registro que não existe mais ou sem acesso: ao abrir, a tela do app mostra o `not-found` da casca; a notificação fica lida.

## Preferências `/configuracoes/notificacoes` (`notification-prefs`)

1. **E-mail** (`notification-prefs-email-mode`, `role="radiogroup"`): **Na hora** (`notification-prefs-email-mode-IMMEDIATE`) · **Resumo diário** (`notification-prefs-email-mode-DAILY`) · **Não enviar e-mail** (`notification-prefs-email-mode-OFF`), cada opção `role="radio"` com `aria-checked` e uma linha de explicação ("Juntamos os avisos de 1–3 minutos num e-mail só").
2. **Hora do resumo** (`notification-prefs-digest-hour`, Select 0–23 h, "no fuso da empresa: São Paulo"), visível com Resumo diário ou com algum tipo em resumo.
3. **Por tipo**, agrupado por app (título do app com ícone), uma linha por tipo (`notification-pref-row`, `data-type`): rótulo, descrição, **No app** (`notification-pref-inapp`, Switch `role="switch"` com `aria-checked`) e **E-mail** (`notification-pref-email`, Select com "Padrão (na hora)" mostrando o efetivo, "Na hora", "Resumo diário", "Não enviar"; opções `notification-pref-email-option` com `data-value` `DEFAULT|IMMEDIATE|DAILY|OFF`). Tipo obrigatório: controles **desabilitados** com cadeado e "Aviso obrigatório".
4. Salva sozinho a cada mudança (otimista, `PUT` só com o que mudou), toast "Preferências salvas"; erro desfaz.
5. "Restaurar padrão" (confirmação) volta tudo ao padrão.

Celular: cada linha vira um cartão com os dois controles embaixo do rótulo.

## Descadastro `/notificacoes/descadastrar?token=` (`unsubscribe-page`)

Página simples com a marca, sem casca e sem login:
- Carrega `GET /v1/public/notifications/unsubscribe?token=` e mostra (`unsubscribe-description`): "Parar de receber e-mails de **Seu papel mudou** da **Acme** em r***@exemplo.com?" (ou "todos os e-mails de notificação" para `"*"`).
- Botão **Parar de receber** (`unsubscribe-confirm`) → `POST`; depois mostra (`unsubscribe-done`) "Pronto, você não vai mais receber esses e-mails. O sino no app continua." com **Desfazer** (`unsubscribe-undo`) e "Ajustar todas as preferências" (→ `/configuracoes/notificacoes`, que pede login).
- Token inválido ou vencido (`unsubscribe-invalid`): "Link inválido ou vencido" + link para as preferências.
- **Abrir a página não descadastra** (só o botão).

## Estados

| Tela | Carregando | Vazio | Erro |
|---|---|---|---|
| Painel | 5 linhas skeleton | Não lidas: "Você está em dia" com ícone; Todas: "Nenhuma notificação ainda" (`notifications-empty`) | "Não foi possível carregar" + Tentar de novo |
| Página | skeleton da lista | por filtro: "Nada por aqui com esses filtros" + Limpar filtros (`notifications-empty`) | idem |
| Preferências | skeleton das linhas | — | idem |
| Descadastro | spinner | — | `unsubscribe-invalid` |

## Contrato testável

| testid | Onde |
|---|---|
| `notifications-bell`, `notifications-badge` | sino e contador (o contador só existe com não lidas) |
| `notifications-panel`, `notifications-tab-unread`, `notifications-tab-all`, `notifications-mark-all`, `notifications-settings`, `notifications-see-all` | painel |
| `notifications-group` (`data-bucket`), `notification-item` (`data-id`, `data-type`, `data-unread`), `notification-text`, `notification-time`, `notification-toggle-read`, `notification-remove`, `notifications-empty` | lista (painel e página) |
| `notifications-page`, `notifications-filter-unread`, `notifications-filter-all`, `notifications-filter-app`, `notifications-filter-app-option` (`data-value`), `notifications-filter-type`, `notifications-filter-type-option`, `notifications-page-mark-all` | página |
| `notification-prefs`, `notification-prefs-email-mode`, `notification-prefs-email-mode-IMMEDIATE`/`-DAILY`/`-OFF`, `notification-prefs-digest-hour`, `notification-pref-row` (`data-type`), `notification-pref-inapp`, `notification-pref-email`, `notification-pref-email-option` (`data-value`) | preferências |
| `unsubscribe-page`, `unsubscribe-description`, `unsubscribe-confirm`, `unsubscribe-done`, `unsubscribe-undo`, `unsubscribe-invalid` | descadastro |

Nenhum testid de controle aparece duas vezes no DOM ao mesmo tempo (o painel fecha ao navegar; desktop e celular renderizam o sino em lugares diferentes, nunca os dois).
