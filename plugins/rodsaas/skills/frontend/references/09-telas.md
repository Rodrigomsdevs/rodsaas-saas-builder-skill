# Telas

Cada tela lista: o que mostra, de onde vêm os dados (rota da API) e os estados especiais. Os estados genéricos (loading, vazio, erro) seguem `05-estados-e-feedback.md` sempre.

## Autenticação (`(auth)`)

Layout dividido: à esquerda, painel na cor da marca com logo, nome e tagline (some no celular); à direita, o formulário centralizado. Link discreto para o suporte se configurado.

| Tela | API | Detalhes |
|---|---|---|
| **Entrar** `/entrar` | `POST /v1/auth/login` | e-mail, senha (mostrar/ocultar), "Esqueci minha senha", link para cadastro. Erro `INVALID_CREDENTIALS` em alerta no formulário. Bloqueio por tentativas → mensagem com o tempo de espera. Sucesso → `?next` (validado: só caminhos internos) ou `/inicio` |
| **Cadastro** `/cadastro` | `POST /v1/auth/register` | nome, e-mail, senha, nome da {empresa}. Com `?convite=<token>`: sem o campo de empresa, e-mail pré-preenchido e travado, entra na empresa do convite. Com `?plano=pro&ciclo=month`: mostra o plano escolhido e, após o cadastro, segue para a assinatura (`11-plano-e-cobranca.md`). Texto de termos/privacidade se houver |
| **Esqueci a senha** `/esqueci-senha` | `POST /v1/auth/forgot-password` | e-mail → **sempre** a mesma tela de sucesso ("Se existir uma conta com esse e-mail, enviamos um link") — não revela se o e-mail existe |
| **Redefinir** `/redefinir-senha?token=` | `POST /v1/auth/reset-password` | nova senha + confirmação. Token inválido/expirado → estado próprio com "Pedir novo link". Sucesso → entrar (todas as sessões foram encerradas pela API; avise) |
| **Verificar e-mail** `/verificar-email?token=` | `POST /v1/auth/verify-email` | dispara ao abrir; estados: verificando, verificado (→ início), link inválido (→ reenviar se logado) |
| **Convite** `/convite?token=` | `GET /v1/invitations/preview`, `POST /v1/invitations/accept` | mostra "{Fulano} convidou você para {Empresa}". Logado com o e-mail certo → **Aceitar**. Logado com outro e-mail → explica e oferece sair. Deslogado → **Criar conta** (cadastro com o token) ou **Já tenho conta** (entrar e voltar). Expirado/revogado → mensagem e sugestão de pedir novo convite |
| **Sem empresa** `/sem-empresa` | `POST /v1/organizations` | "Você não faz parte de nenhuma {empresa}" → criar uma, ou aguardar convite. Lista convites pendentes para o e-mail, se a API oferecer |

## Casca do app (`(app)/layout.tsx`)

Especificação completa em **`12-casca-e-apps.md`** (e o comportamento no `assets/simulador-navegacao.html`). Resumo:
- **Um app só** (projeto recém-gerado, app Cadastros): menu clássico com `OrgSwitcher` no topo, Início, o menu do app e, no rodapé, busca, sino, configurações e usuário.
- **Dois ou mais apps**: **trilho** (empresa, Início, apps fixados, "Todos os apps", busca, sino, configurações, usuário) + **menu do app** atual, recolhível (`[`) com menu flutuante ao passar o mouse; no celular, gaveta com o menu do app e barra de apps embaixo.
- **Topo**: breadcrumb (app › página), busca (Ctrl+K) e alternar tema. Ajuda (suporte do `rodsaas.json`), Perfil e Sair ficam no `UserMenu`.
- **Banners globais** abaixo do topo.
- Skeleton da casca enquanto a sessão carrega.

## Início `/inicio`

Só dados reais desde o primeiro dia:

| Bloco | API | Conteúdo |
|---|---|---|
| Boas-vindas | `me` | "Olá, Ana" + nome da {empresa} |
| **Primeiros passos** | `me`, membros, assinatura | checklist: confirmar e-mail, convidar a equipe, criar o primeiro projeto, escolher um plano. Cada item com ação; some quando tudo estiver feito (ou "dispensar") |
| **Uso do plano** | `me` (limites) + contagens | barras "3 de 5 membros", "2 de 5 projetos", plano atual, link para upgrade se perto do limite (≥ 80%) |
| **Atividade recente** | `GET /v1/audit` (se a feature `audit_log` estiver no plano) | últimas 5–10 ações com quem, o quê e quando (relativo); sem a feature, `PlanGate` |
| Atalhos | — | botões para as ações mais comuns ("Novo projeto", "Convidar membro") |

Cada app registrado acrescenta os seus blocos (`widgets` do `AppDef`) depois destes, na ordem dos apps. O menu do Início lista "Visão geral" e **Seus apps**.

## Configurações (`/configuracoes/*`)

Layout com abas laterais (ou topo no celular), itens filtrados por papel.

| Tela | API | Detalhes |
|---|---|---|
| **{Empresa}** `/configuracoes/empresa` | `GET/PATCH /v1/organizations/current` (conforme o backend) | nome e dados da {empresa}; owner vê "Zona de perigo" com excluir {empresa} (confirmação digitando o nome) |
| **Membros** `/configuracoes/membros` | `GET /v1/members`, `PATCH/DELETE /v1/members/:id`, convites, `GET /v1/access/options`, `POST /v1/invitations/check`, `/v1/access/requests` | três abas: **Membros** (nome, e-mail, papel, desde quando; ações: mudar papel, **Acessos** (`member-access-open`, leva à tela da pessoa), remover — respeitando as regras: não mexer no último owner, admin não mexe em owner, ninguém altera a si mesmo), **Convites pendentes** (reenviar, revogar; mostra os apps escolhidos) e **Pedidos de acesso** (`access-request-row`, com o contador; quem pediu, app, opções, motivo — "veio do convite de Ana", "sem assento livre", "Ana não pode dar este papel", "falhou ao aplicar: …" —, **Aprovar** `access-request-approve` (mostra o novo valor e confirma quando muda a assinatura) e **Recusar** `access-request-decline`). Botão **Convidar** abre o dialog: e-mail + papel (sem OWNER) + a seção **"O que essa pessoa vai usar"** (abaixo). Uso do limite visível ("3 de 5"); no limite, o botão abre o `UpgradeDialog`. "Sair da {empresa}" para quem não é o último owner |
| **Acessos da pessoa** `/configuracoes/membros/[id]` | `GET/PUT /v1/members/:id/access` | cabeçalho com nome, e-mail e papel; a **mesma seção** do convite preenchida com o que a pessoa usa hoje (cada app pelo `read`), pedidos pendentes dela, "Copiar acessos de outra pessoa" (escolhe um membro e preenche); **Salvar** (`member-access-save`) mostra antes o que muda e, no modelo por app, o novo valor; o que quem salva não pode dar vira pedido (aviso no toast). A própria pessoa vê a tela só leitura ("Meus acessos", com **Pedir acesso** por app) |
| **Plano e cobrança** `/configuracoes/plano` | `GET /v1/billing/plans`, `GET /v1/billing/subscription`, checkout, troca, cancelar/retomar, portal | **especificação completa em `11-plano-e-cobranca.md`**: aviso de modo (teste/não configurado), resumo e uso, ciclo mensal/anual, cards com o botão certo para cada papel e situação (Assinar / Mudar para / Voltar para o Free), diálogo de troca com prévia do valor, cancelar e retomar, gerenciar cobrança, retorno do pagamento. Owner age; admin vê sem botões e com o aviso; membro não acessa |
| **Apps** `/configuracoes/apps` | `GET /v1/me`, `PATCH /v1/organizations/current { disabledApps }`, `PUT /v1/me/preferences { pinnedApps }` | apps da empresa com interruptor (owner/admin) e "Meu trilho" (fixados em ordem, todos); detalhes em `12-casca-e-apps.md` |
| **Atividade** `/configuracoes/atividade` | `GET /v1/audit` | feed com "Carregar mais", filtro por tipo de ação e por pessoa; sem a feature → `PlanGate` |

## Perfil `/perfil`

`GET /v1/me`, `PATCH /v1/users/me`, troca de senha. Nome, e-mail (somente leitura na v1), trocar senha (atual + nova), **Sair de todos os dispositivos** (`POST /v1/auth/logout-all`, com confirmação), preferência de tema.

## Módulo de exemplo: Projetos (o molde)

| Tela | API | Detalhes |
|---|---|---|
| **Lista** `/projetos` | `GET /v1/projects` | `PageHeader` ("Projetos" + "Novo projeto"), `DataTable` com busca (`q`), filtro de status, paginação por cursor, ações por linha (editar, arquivar, excluir só para owner/admin). Estados completos. Limite do plano antes de abrir o formulário |
| **Criar / editar** | `POST /v1/projects` (idempotente), `PATCH /v1/projects/:id` | `FormSheet` com nome e descrição, erros nos campos, alterações não salvas |
| **Detalhe** `/projetos/[id]` | `GET /v1/projects/:id` | cabeçalho com nome, status (badge) e ações; abas ("Visão geral" e um espaço para o que o módulo real tiver); 404 → `notFound()` com a casca |
| **Excluir** | `DELETE /v1/projects/:id` | `ConfirmDialog` destrutivo; no detalhe, volta para a lista |
| **Arquivar** | `PATCH` status | otimista + toast com "Desfazer" |

Quando o `/rodsaas:module` criar um módulo novo, ele copia esta estrutura (`features/projects` + `app/(app)/projetos`) e registra o módulo no app **Cadastros** (item no menu + rota em `match`), ou no app que o usuário escolher.

## Seção "O que essa pessoa vai usar" (convite e acessos da pessoa)

Componente único (`MemberAccessForm`), usado no convite, na tela da pessoa e em qualquer convite de preset (onboarding da workstation, "convidar para o autoatendimento" do Pessoas). Não conhece nenhum app: desenha a partir de `GET /v1/access/options` (`skills/backend/references/10-acessos-por-pessoa.md`).

- Contêiner `invite-access`. Um cartão por app com a **caixa de marcar** (`invite-access-app`, `data-app`, um `<input type="checkbox">` ou `role="checkbox"` com `aria-checked`), o nome e o ícone; apps que o modelo dá a todos (`included`) aparecem marcados e travados com "incluído no {modelo}".
- Marcado → os campos do app abaixo do nome (`invite-access-field`, `data-app`, `data-key`, no próprio controle): `boolean` = caixa de marcar, `select` = `<select>` nativo (acessível e testável no celular), `multiselect` = grupo de caixas (`invite-access-option`, `data-value`) dentro do campo; `showIf` esconde o campo; o padrão vem marcado (a pessoa "entra usando").
- A cada mudança (debounce de 400 ms): `POST /v1/invitations/check` → por app, uma nota (`invite-access-note`, `data-app`, `data-kind`): `request` "Sem assento livre: vai como pedido ao responsável quando a pessoa entrar" / "Você não pode dar este papel: vai como pedido ao owner"; `confirm` "+1 assento · +R$ 39/mês" (owner, modelo por app). Total do efeito no valor (`invite-access-total`) quando houver.
- Enviar: owner com valor novo → diálogo de confirmação (`confirm-dialog`) com o valor e o proporcional → reenvia com `confirm: true`. Erros do servidor no campo pelo caminho (`access.<app>.<campo>`).
- No celular, cartões empilhados; o rodapé com o total e o botão fica fixo.

