# Telas

Cada tela lista: o que mostra, de onde vêm os dados (rota da API) e os estados especiais. Os estados genéricos (loading, vazio, erro) seguem `05-estados-e-feedback.md` sempre.

## Autenticação (`(auth)`)

Layout dividido: à esquerda, painel na cor da marca com logo, nome e tagline (some no celular); à direita, o formulário centralizado. Link discreto para o suporte se configurado.

| Tela | API | Detalhes |
|---|---|---|
| **Entrar** `/entrar` | `POST /v1/auth/login` | e-mail, senha (mostrar/ocultar), "Esqueci minha senha", link para cadastro. Erro `INVALID_CREDENTIALS` em alerta no formulário. Bloqueio por tentativas → mensagem com o tempo de espera. Sucesso → `?next` (validado: só caminhos internos) ou `/inicio` |
| **Cadastro** `/cadastro` | `POST /v1/auth/register` | nome, e-mail, senha, nome da {empresa}. Com `?convite=<token>`: sem o campo de empresa, e-mail pré-preenchido e travado, entra na empresa do convite. Texto de termos/privacidade se houver |
| **Esqueci a senha** `/esqueci-senha` | `POST /v1/auth/forgot-password` | e-mail → **sempre** a mesma tela de sucesso ("Se existir uma conta com esse e-mail, enviamos um link") — não revela se o e-mail existe |
| **Redefinir** `/redefinir-senha?token=` | `POST /v1/auth/reset-password` | nova senha + confirmação. Token inválido/expirado → estado próprio com "Pedir novo link". Sucesso → entrar (todas as sessões foram encerradas pela API; avise) |
| **Verificar e-mail** `/verificar-email?token=` | `POST /v1/auth/verify-email` | dispara ao abrir; estados: verificando, verificado (→ início), link inválido (→ reenviar se logado) |
| **Convite** `/convite?token=` | `GET /v1/invitations/preview`, `POST /v1/invitations/accept` | mostra "{Fulano} convidou você para {Empresa}". Logado com o e-mail certo → **Aceitar**. Logado com outro e-mail → explica e oferece sair. Deslogado → **Criar conta** (cadastro com o token) ou **Já tenho conta** (entrar e voltar). Expirado/revogado → mensagem e sugestão de pedir novo convite |
| **Sem empresa** `/sem-empresa` | `POST /v1/organizations` | "Você não faz parte de nenhuma {empresa}" → criar uma, ou aguardar convite. Lista convites pendentes para o e-mail, se a API oferecer |

## Casca do app (`(app)/layout.tsx`)

- **Menu lateral**: `OrgSwitcher` no topo, itens de `config/navigation.ts`, seção de configurações embaixo, recolhível (só ícones, com tooltip), drawer no celular. Item ativo destacado.
- **Topo**: breadcrumb/título da página, botão de ajuda (suporte do `rodsaas.json`), alternar tema, `UserMenu` (nome, e-mail, Perfil, Sair).
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

Módulos novos podem registrar cards de indicador aqui depois.

## Configurações (`/configuracoes/*`)

Layout com abas laterais (ou topo no celular), itens filtrados por papel.

| Tela | API | Detalhes |
|---|---|---|
| **{Empresa}** `/configuracoes/empresa` | `GET/PATCH /v1/organizations/current` (conforme o backend) | nome e dados da {empresa}; owner vê "Zona de perigo" com excluir {empresa} (confirmação digitando o nome) |
| **Membros** `/configuracoes/membros` | `GET /v1/members`, `PATCH/DELETE /v1/members/:id`, convites | duas abas: **Membros** (nome, e-mail, papel, desde quando; ações: mudar papel, remover — respeitando as regras: não mexer no último owner, admin não mexe em owner, ninguém altera a si mesmo) e **Convites pendentes** (reenviar, revogar). Botão **Convidar** abre dialog com e-mail + papel (sem OWNER). Uso do limite visível ("3 de 5"); no limite, o botão abre o `UpgradeDialog`. "Sair da {empresa}" para quem não é o último owner |
| **Plano e cobrança** `/configuracoes/plano` | `GET /v1/billing/plans`, `GET /v1/billing/subscription`, checkout, portal | plano atual, status, próxima cobrança/fim do período, aviso de cancelamento agendado, uso dos limites; cards dos planos com o atual marcado e **Assinar**/**Mudar de plano**; **Gerenciar cobrança** abre o portal da Stripe (cartão, faturas, cancelar). Retorno do checkout com o polling descrito em `04-api-e-sessao.md`. Só owner paga; admin vê sem botões de pagamento |
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

Quando o `/rodsaas:module` criar um módulo novo, ele copia esta estrutura (`features/projects` + `app/(app)/projetos`) e adiciona o item no menu.
