# 01 · Escopo e integração

## O que entra na v1

| Área | Entrega |
|---|---|
| **Serviço** | `notify()` e `retract()` únicos para todos os apps, na mesma transação da mudança |
| **Regras** | nunca o ator; só membros ativos; só quem vê o registro; preferência por tipo e canal; agrupamento por registro ou por chave; tipos obrigatórios |
| **Sino** | no trilho (desktop) e no topo (celular), contador com 99+, título da aba com o número, painel com Não lidas/Todas, Hoje/Ontem/Anteriores, marcar todas como lidas, ações por item |
| **Página** | `/notificacoes`: filtros Não lidas/Todas, por app e por tipo, rolagem infinita, ações em massa ("marcar todas deste app") |
| **Preferências** | `/configuracoes/notificacoes`: e-mail geral (imediato / resumo diário / desligado), hora do resumo, e para cada tipo, agrupado por app: no app liga/desliga e e-mail (padrão / imediato / resumo / desligado) |
| **E-mail** | imediato (espera 60 s sem evento novo, no máximo 3 min, junta tudo o que está pronto da pessoa num e-mail só), resumo diário no fuso da empresa, marca do produto, link para a coisa, para as preferências e "parar de receber este tipo" |
| **Descadastro** | link sem login (`/notificacoes/descadastrar?token=`), um clique pelo cliente de e-mail (RFC 8058), desfazer |
| **Avisos da base** | alguém entrou na empresa, seu papel mudou, pagamento recusado, fim do teste, armazenamento quase cheio (com `uploads`) |
| **Catálogo** | tipos com rótulo, descrição, frase padrão, agrupamento e e-mail padrão; cada app registra os dele |
| **Extensão** | registro de canais para o add-on `whatsapp` e para push, sem mudar os apps |

## Registro do add-on

1. `rodsaas.json → addons` recebe `"notificacoes"` (ao final, na Fase 7).
2. Backend: `api/src/modules/notifications/` (plugin de rotas registrado no `app.ts`), com:
   - `lib/` — porte de `scripts/notifications-lib.mjs` para TS, com os testes portados (Vitest) passando;
   - `catalog.ts` — `registerNotificationTypes(appId, types)` e `getCatalog()`; no boot, registra `BASE_TYPES` e cada módulo de app registra os seus (`PRESET_TYPES` filtrado pelo app). O boot **falha** se `validateCatalog` devolver erro (tipo repetido, frase com chave desconhecida);
   - `service.ts` — `notify()`, `retract()`, `markRead()`… (`03-api.md`);
   - `channels.ts` — registro de canais (`05-email-e-jobs.md`);
   - `jobs.ts` — filas `notifications.email`, `notifications.sweep`, `notifications.digest`, `notifications.cleanup`;
   - `emails.ts` — templates (imediato, agrupado, resumo).
3. Frontend: `web/src/features/notifications/` com o sino, o painel, as páginas e o hook `useNotifications()`; a casca já reserva o lugar do sino no trilho e no topo do celular (`skills/frontend/references/12-casca-e-apps.md`). Sem o add-on, o sino **não aparece** (não fica um sino morto).
4. Rotas globais da casca: `/notificacoes` (sem menu de app, conteúdo em largura total), `/configuracoes/notificacoes` (aba em Configurações, para todos os papéis) e a pública `/notificacoes/descadastrar` (fora da casca, sem login).

## Variáveis de ambiente

| Variável | Uso |
|---|---|
| `NOTIFICATIONS_UNSUBSCRIBE_SECRET` | assina o token de descadastro (HMAC). Validado no boot com **pelo menos 32 caracteres**; o `.env.example` traz um valor gerado e o README diz como gerar outro (`openssl rand -base64 48`) |
| `API_PUBLIC_URL` (da base) | monta a URL de um clique (`List-Unsubscribe`) |
| `WEB_URL` (da base) | links dos e-mails (para a coisa, para as preferências, para a página de descadastro) |
| `NOTIFICATIONS_EMAIL_QUIET_SECONDS` | opcional, padrão 60 |
| `NOTIFICATIONS_EMAIL_MAX_DELAY_SECONDS` | opcional, padrão 180 |

## Fuso da empresa

O resumo diário, os grupos Hoje/Ontem do painel e os avisos de prazo dos apps usam o **fuso da empresa**:

- `Organization.timezone` (texto IANA, ex.: `America/Sao_Paulo`). Se o projeto ainda não tem o campo, crie (migration aditiva, padrão `rodsaas.json → timezone` ou `America/Sao_Paulo`) com o seletor em Configurações → Empresa (owner/admin), validado com `Intl.DateTimeFormat` (fuso inválido → 400 `VALIDATION_ERROR`).
- `GET /v1/me` passa a devolver `organization.timezone` (o front usa no `dayBucket` e no `relativeTime`).

## Quem recebe cada coisa

- Só **membros ativos** da empresa (quem saiu ou foi removido para de receber na hora, e não vê as antigas: a leitura filtra pela empresa ativa e pelo usuário).
- O app diz quem são os candidatos (responsável, seguidores, mencionados, owners/admins…) e como saber se cada um **pode ver** o registro (`canSee`); o add-on aplica as regras (`03-api.md`).
- **App desligado** pela empresa (`disabledApps`): as notificações daquele app não aparecem na lista, não contam no sino e não vão por e-mail enquanto ele estiver desligado (os dados ficam). O tipo também some das preferências.
- **App sem papel** para a pessoa (ex.: Suporte só para atendentes): o app não manda para ela (é o `canSee` do app), e o tipo some das preferências dela.

## Planos

Notificações não são recurso pago: todos os planos têm sino, e-mail e resumo, sem limite. Nada em `config/plans.ts`.

## Fora da v1

Push no navegador/celular (Web Push), WhatsApp e SMS (add-on `whatsapp` usa o registro de canais), tempo real por WebSocket/SSE, horário silencioso, adiar ("lembrar mais tarde"), notificação para quem não é membro.
