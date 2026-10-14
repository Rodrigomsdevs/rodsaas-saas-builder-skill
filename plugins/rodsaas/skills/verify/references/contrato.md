# Contrato testável

Para a mesma bateria de testes funcionar em qualquer projeto rodsaas — gerado pelo Claude, Gemini ou ChatGPT — o projeto precisa expor **pontos fixos**: atributos `data-testid` nos elementos-chave, rotas com nomes fixos e formatos de API combinados. A lista canônica está em `contract.json` (é o que a auditoria confere); aqui está o significado de cada um.

`data-testid` não muda nada visualmente nem de comportamento. Ele só dá aos testes um jeito estável de achar o elemento, independente de texto, classe CSS ou idioma.

## Rotas do painel

`/entrar` · `/cadastro` · `/esqueci-senha` · `/redefinir-senha?token=` · `/verificar-email?token=` · `/convite?token=` · `/inicio` · `/sem-empresa` · `/configuracoes/empresa` · `/configuracoes/membros` · `/configuracoes/membros/[id]` · `/configuracoes/plano` · `/configuracoes/apps` · `/perfil` · módulo de exemplo `/projetos` e `/projetos/[id]`.

## data-testid

### Autenticação
| testid | Elemento |
|---|---|
| `login-email`, `login-password`, `login-submit` | campos e botão de entrar |
| `login-error` | alerta de erro do login (credenciais, bloqueio, rate limit) |
| `signup-name`, `signup-email`, `signup-password`, `signup-org-name`, `signup-submit` | cadastro; `signup-org-name` **não é renderizado** quando o cadastro vem de convite; `signup-email` vem preenchido e travado |
| `forgot-email`, `forgot-submit`, `forgot-success` | esqueci a senha; `forgot-success` é a tela de "se existir, enviamos" (igual para e-mail existente ou não) |
| `reset-password`, `reset-submit`, `reset-success` | redefinir senha; se houver confirmação de senha, ela usa `reset-password-confirm` (preenchida pelos testes quando existir) |
| `verify-email-success` | resultado positivo da verificação de e-mail |
| `invite-org-name` | nome da empresa na tela de convite |
| `invite-create-account`, `invite-login`, `invite-accept` | criar conta / já tenho conta (deslogado) / aceitar (logado com o e-mail certo) |

### Casca do app
| testid | Elemento |
|---|---|
| `app-shell` | contêiner da área logada (existe em todas as telas do app, inclusive 404 interno) |
| `sidebar` | menu do app atual (no celular, só existe quando a gaveta está aberta); detalhes em "Casca de apps" abaixo |
| `sidebar-toggle` | botão que abre o menu no celular |
| `org-switcher` | gatilho do seletor de empresa |
| `org-switcher-current` | texto com o **nome da empresa ativa** |
| `org-switcher-item` | cada empresa da lista (inclui o nome no texto) |
| `org-switcher-create` | "Criar nova empresa" |
| `create-org-name`, `create-org-submit` | diálogo de criar empresa |
| `user-menu`, `user-menu-logout` | menu do usuário e "Sair" |
| `theme-toggle` | alternar tema, clicável direto no topo (se abrir um menu, as opções usam `theme-option-light` / `theme-option-dark`) |

### Casca de apps (`skills/frontend/references/12-casca-e-apps.md`)
| testid | Elemento |
|---|---|
| `app-rail` | trilho de apps (só no modo trilho, no desktop) |
| `app-rail-item` | botão de app no trilho, com `data-app` (inclui `inicio`) e `aria-current="page"` no ativo |
| `sidebar` | menu do app atual (coluna no desktop, gaveta no celular, menu clássico com 1 app), com `data-app` |
| `sidebar-collapse`, `sidebar-expand` | recolher (no menu) e abrir (no trilho e no menu flutuante) |
| `app-flyout` | menu flutuante (recolhido + mouse por cima), com `data-app` |
| `app-launcher-open`, `app-launcher`, `app-launcher-search`, `app-launcher-item`, `app-pin` | "Todos os apps": botão, painel, busca, cartão (`data-app`) e estrela (`aria-pressed`) |
| `app-tabbar`, `app-tabbar-item` | barra de apps do celular, com `data-app` |
| `app-toggle` | interruptor do app em `/configuracoes/apps`, com `data-app` e `aria-checked` |

`org-switcher-current` pode ser texto só para leitor de tela (`sr-only`) no trilho. **Nenhum testid aparece duas vezes no DOM**: desktop e celular renderizam peças diferentes. A lista de apps do projeto fica em `rodsaas.json → apps` (`[{ id, name, home }]`); é dela que os testes tiram quais apps esperar.

### Estados
| testid | Elemento |
|---|---|
| `page-not-found` | conteúdo de "não encontrado" (global e dentro do app) |
| `error-state` | bloco de erro; contém `error-retry` (botão) e `error-request-id` (código para o suporte, quando houver) |
| `empty-state`, `empty-state-action` | estado vazio e sua ação principal |
| `skeleton` | contêiner de carregamento (com `aria-busy="true"`) |
| `forbidden-state` | "você não tem permissão" |
| `confirm-dialog`, `confirm-dialog-confirm` | diálogo de confirmação e o botão que confirma |

Botões de ação (`LoadingButton`): durante a ação ficam **`disabled`** e com **`aria-busy="true"`**.

### Empresa, membros e plano
| testid | Elemento |
|---|---|
| `org-settings-name`, `org-settings-save` | nome da empresa em Configurações |
| `members-table` | lista de membros |
| `member-row` | linha de membro (contém o e-mail no texto) |
| `member-role-select` | gatilho para mudar o papel, dentro da linha; opções `role-option-OWNER`, `role-option-ADMIN`, `role-option-MEMBER` |
| `member-remove` | remover, dentro da linha (abre `confirm-dialog`) |
| `invite-button`, `invite-email`, `invite-role`, `invite-submit` | convidar (papel padrão MEMBER) |
| `invitation-row` | linha de convite pendente (contém o e-mail) |
| `invite-access`, `invite-access-app` (`data-app`), `invite-access-field` (`data-app`, `data-key`), `invite-access-note` (`data-app`, `data-kind`: `request` \| `confirm`), `invite-access-total` | seção "O que essa pessoa vai usar" no convite e na tela da pessoa (`skills/frontend/references/09-telas.md`) |
| `member-access-open` | "Acessos", dentro da linha do membro |
| `member-access-save` | salvar na tela `/configuracoes/membros/[id]` |
| `access-request-row` (`data-app`), `access-request-approve`, `access-request-decline` | aba "Pedidos de acesso" |
| `plan-card` | card de plano, com atributo **`data-plan="<id do plano>"`** |
| `plan-current` | selo "plano atual" dentro do card |
| `plan-subscribe` | botão de ação do card ("Assinar" / "Mudar para"), com **`data-plan`**; para o owner **nunca some** (desabilitado no modo `disabled`); admin não tem |
| `usage-bar` | barra de uso de limite |
| `billing-mode-banner` | aviso de modo de teste ou cobrança não configurada |
| `plan-change-dialog`, `plan-change-confirm` | diálogo de troca de plano (com a prévia do valor) e o botão de confirmar |
| `billing-cancel`, `billing-resume` | cancelar a assinatura (abre `confirm-dialog`) / retomar o cancelamento agendado |
| `billing-owner-only` | aviso para o admin de que só o owner muda o plano |
| `billing-portal`, `billing-pending`, `billing-cycle-toggle` | recomendados: gerenciar cobrança (Stripe), "confirmando pagamento", seletor mensal/anual |

### Módulo de exemplo (`projects`, se existir)
| testid | Elemento |
|---|---|
| `page-header-action` | botão principal do cabeçalho ("Novo projeto") |
| `data-table-row` | linha (ou card no celular), contém o nome |
| `row-actions`, `row-action-edit`, `row-action-delete` | menu da linha |
| `search-input` | busca da lista |
| `form-sheet`, `form-submit` | drawer do formulário e botão de salvar |
| `field-<campo>`, `field-error-<campo>` | campo e mensagem de erro dele (ex.: `field-name`, `field-error-name`) |
| `upgrade-dialog` | diálogo de upgrade (limite do plano) |

Os módulos gerados pelo `/rodsaas:module` seguem o mesmo padrão de testids.

## Formatos da API usados pelos testes

| Rota | Entrada | Saída (o que os testes leem) |
|---|---|---|
| `POST /v1/auth/register` | `{ name, email, password, organizationName }` ou `{ name, email, password, invitationToken }` (sem `organizationName`: entra na empresa do convite, não cria outra) | cookies de sessão |
| `POST /v1/auth/login` | `{ email, password }` | cookies |
| `POST /v1/auth/switch-organization` | `{ organizationId }` | novo access token |
| `GET /v1/me` | — | `{ user: { id, name, email, emailVerified }, organization: { id, name, role, disabledApps } \| null, organizations: [{ id, name, role }], preferences: { pinnedApps }, plan: { id, name, limits, features, usage, cancelAtPeriodEnd }, billing: { mode, canManage } }` |
| `PUT /v1/me/preferences` | `{ pinnedApps: string[] \| null }` | fixados do usuário na empresa ativa |
| `PATCH /v1/organizations/current` | `{ name?, disabledApps? }` | apps desligados para a empresa (owner/admin) |
| `POST /v1/organizations` | `{ name }` | `{ id, name }` e a nova empresa vira a ativa |
| `GET /v1/members` | — | `{ data: [{ id, role, user: { id, name, email } }], meta }` |
| `PATCH /v1/members/:id` | `{ role }` | — |
| `POST /v1/invitations` | `{ email, role, access?, confirm? }` | convite + e-mail com link `APP_URL/convite?token=...`; com `access`: `{ id, access: { grant: [appId], request: [{ appId, reason }] } }` |
| `GET /v1/access/options` · `POST /v1/invitations/check` | — · `{ role, access }` | campos de cada app · `{ grant, request, confirm, errors }` (`skills/backend/references/10-acessos-por-pessoa.md`) |
| `GET/PUT /v1/members/:id/access` | — · `{ access, confirm? }` | `{ memberId, userId, apps, requests }` · `{ applied, removed, requested, access }` |
| `GET/POST /v1/access/requests` · `POST …/:id/approve` · `…/decline` | `{ appId, options? }` · `{ options?, confirm? }` · `{ reason? }` | pedidos de acesso (`{ data: [{ id, user, appId, options, sources, reason, status }] }`) |
| `GET /v1/billing/plans` | — | lista (ou `{ data }`) de `{ id, name, prices: { month, year } \| null, limits, features }`; limite ilimitado = `null` |
| `POST /v1/billing/checkout-sessions` | `{ plan, interval }` | `{ url }`; no modo de teste o plano já muda |
| `GET /v1/billing/change-plan/preview?plan=&interval=` | — | `{ amountDue, currency, overLimits }` |
| `POST /v1/billing/change-plan` · `/cancel` · `/resume` | `{ plan, interval }` / — / — | o `/v1/me` reflete na hora (modo de teste) |
| `GET/POST /v1/projects` (exemplo) | `{ name, description? }` | `{ id, name, ... }` / `{ data, meta }` |

E-mails (verificação, reset, convite) chegam no **Mailpit** em dev, com links absolutos para o painel.

## Presets

Quando `rodsaas.json → presets` (ou `addons`) tem um item listado em `contract.json → presets`, a auditoria passa a exigir as rotas, testids e rotas de API dele, e a bateria roda a parte correspondente.

| Preset | Onde está o contrato | Testes |
|---|---|---|
| `crm` | `skills/crm/references/04-telas.md` (seção "Contrato testável") e os formatos ★ de `skills/crm/references/03-api.md` e `06-captura-e-importacao.md` | `suite/tests/09-crm.spec.ts` |
| `forms` | `skills/forms/references/04-construtor.md` (seção "Contrato testável"), `05-formulario-publico.md` (acessibilidade e testids do público) e os formatos ★ de `03-api.md` | `suite/tests/11-forms.spec.ts` |
| `agenda` | `skills/agenda/references/05-app-interno.md` (seção "Contrato testável", inclusive recepção, fila, clube, comissões e recursos), `04-pagina-publica.md` (rótulos e testids da página pública, combo, sinal, lista de espera, confirmação) e os formatos ★ de `03-api.md` | `suite/tests/12-agenda.spec.ts` e `25-agenda-operacao.spec.ts` |
| `helpdesk` | `skills/helpdesk/references/05-app-interno.md` (seção "Contrato testável"), `04-portal-e-widget.md` (rótulos e testids do portal e do chamado do cliente) e os formatos ★ de `03-api.md` | `suite/tests/13-helpdesk.spec.ts` |
| `tarefas` | `skills/tarefas/references/04-telas.md` (seção "Contrato testável") e os formatos ★ de `03-api.md` | `suite/tests/14-tarefas.spec.ts` |
| `notion` | `skills/notion/references/04-frontend.md` (seção "Contrato testável"), `03-editor.md` e os formatos ★ de `02-api.md` | `suite/tests/15-paginas.spec.ts` |
| `uploads` (add-on) | rotas ★ de `skills/uploads/references/01-backend.md` | `suite/tests/16-uploads.spec.ts` |
| `email` (add-on, o `backend` já instala) | `skills/email/references/02-webhooks-e-supressao.md` (rota `POST /v1/webhooks/resend`, fora do OpenAPI, e as rotas de e-mails com problema e supressão) | `suite/tests/18-email.spec.ts` (assina os eventos com o `RESEND_WEBHOOK_SECRET` do `api/.env`) |
| `workstation` (add-on) | `skills/workstation/references/05-telas.md` (seção "Contrato testável") e as rotas ★ de `03-cobranca.md` e `02-cadastro-e-onboarding.md`; com `billing.model: "apps"` a parte antiga de planos é pulada | `suite/tests/19-workstation.spec.ts` |
| `rh` (app Pessoas) | `skills/rh/references/08-telas.md` (seção "Contrato testável") e os formatos ★ de `03-api.md` (inclui a pré-admissão pública `/v1/public/rh/admissions/{token}`) | `suite/tests/20-rh.spec.ts` |
| `financeiro` (app Financeiro) | `skills/financeiro/references/07-telas.md` (seção "Contrato testável") e os formatos ★ de `03-api.md` (inclui a página pública de pagamento `/v1/public/fin/charges/{token}` e o pagamento simulado do modo de teste) | `suite/tests/21-financeiro.spec.ts` |
| `comercial` (app Comercial) | `skills/comercial/references/08-telas.md` (seção "Contrato testável") e os formatos ★ de `03-api.md` (inclui a proposta pública `/v1/public/com/proposals/{token}`, a assinatura pública `/v1/public/com/sign/{token}` e a verificação `/v1/public/com/verify`) | `suite/tests/22-comercial.spec.ts` |
| `erp` (app ERP) | `skills/erp/references/09-telas.md` (seção "Contrato testável") e os formatos ★ de `03-api.md` (produtos com grade e kit, preço, estoque, vendas, PDV, compras e curva ABC) | `suite/tests/24-erp.spec.ts` |
| `notificacoes` (add-on) | `skills/notificacoes/references/06-telas.md` (seção "Contrato testável") e os formatos ★ de `03-api.md` (inclui o descadastro público e os avisos da base `org.member_joined`/`org.role_changed`) | `suite/tests/17-notificacoes.spec.ts` |

Em todos os presets, o contrato é o **mínimo** que dá para conferir de fora; o escopo de cada um é a referência inteira da skill (cada SKILL.md tem "Como trabalhar" e "Pronto quando" por fase).

Rotas dinâmicas do contrato (`/crm/negocios/[id]`) aceitam qualquer nome de parâmetro na pasta (`[dealId]`).
