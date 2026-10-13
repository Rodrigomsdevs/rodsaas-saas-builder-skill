# Contrato testável

Para a mesma bateria de testes funcionar em qualquer projeto rodsaas — gerado pelo Claude, Gemini ou ChatGPT — o projeto precisa expor **pontos fixos**: atributos `data-testid` nos elementos-chave, rotas com nomes fixos e formatos de API combinados. A lista canônica está em `contract.json` (é o que a auditoria confere); aqui está o significado de cada um.

`data-testid` não muda nada visualmente nem de comportamento. Ele só dá aos testes um jeito estável de achar o elemento, independente de texto, classe CSS ou idioma.

## Rotas do painel

`/entrar` · `/cadastro` · `/esqueci-senha` · `/redefinir-senha?token=` · `/verificar-email?token=` · `/convite?token=` · `/inicio` · `/sem-empresa` · `/configuracoes/empresa` · `/configuracoes/membros` · `/configuracoes/plano` · `/perfil` · módulo de exemplo `/projetos` e `/projetos/[id]`.

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
| `sidebar` | menu lateral (no celular, só existe/visível quando aberto) |
| `sidebar-toggle` | botão que abre o menu no celular |
| `org-switcher` | gatilho do seletor de empresa |
| `org-switcher-current` | texto com o **nome da empresa ativa** |
| `org-switcher-item` | cada empresa da lista (inclui o nome no texto) |
| `org-switcher-create` | "Criar nova empresa" |
| `create-org-name`, `create-org-submit` | diálogo de criar empresa |
| `user-menu`, `user-menu-logout` | menu do usuário e "Sair" |
| `theme-toggle` | alternar tema (se abrir um menu, as opções usam `theme-option-light` / `theme-option-dark`) |

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
| `GET /v1/me` | — | `{ user: { id, name, email, emailVerified }, organization: { id, name, role } \| null, organizations: [{ id, name, role }], plan: { id, name, limits, features, usage, cancelAtPeriodEnd }, billing: { mode, canManage } }` |
| `POST /v1/organizations` | `{ name }` | `{ id, name }` e a nova empresa vira a ativa |
| `GET /v1/members` | — | `{ data: [{ id, role, user: { id, name, email } }], meta }` |
| `PATCH /v1/members/:id` | `{ role }` | — |
| `POST /v1/invitations` | `{ email, role }` | convite + e-mail com link `APP_URL/convite?token=...` |
| `GET /v1/billing/plans` | — | lista (ou `{ data }`) de `{ id, name, prices: { month, year } \| null, limits, features }`; limite ilimitado = `null` |
| `POST /v1/billing/checkout-sessions` | `{ plan, interval }` | `{ url }`; no modo de teste o plano já muda |
| `GET /v1/billing/change-plan/preview?plan=&interval=` | — | `{ amountDue, currency, overLimits }` |
| `POST /v1/billing/change-plan` · `/cancel` · `/resume` | `{ plan, interval }` / — / — | o `/v1/me` reflete na hora (modo de teste) |
| `GET/POST /v1/projects` (exemplo) | `{ name, description? }` | `{ id, name, ... }` / `{ data, meta }` |

E-mails (verificação, reset, convite) chegam no **Mailpit** em dev, com links absolutos para o painel.
