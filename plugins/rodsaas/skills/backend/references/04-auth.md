# Auth: JWT + refresh feito à mão

## Visão geral

| Token | Formato | Vida | Onde fica |
|---|---|---|---|
| Access | JWT assinado | 15 min | cookie `access_token` (httpOnly, path `/`) |
| Refresh | string aleatória opaca (32 bytes, base64url) | 30 dias | cookie `refresh_token` (httpOnly, path `/v1/auth`) |

Os dois tokens vão em **cookies httpOnly**, nunca no body para o front guardar. Assim um XSS no front não consegue roubar sessão. O front e a API ficam no mesmo domínio pai (`app.seusaas.com` e `api.seusaas.com`, cookie com `domain=.seusaas.com`).

Atributos dos cookies: `httpOnly`, `secure` (em produção), `sameSite: 'lax'`, `domain` do env, cookies assinados com `COOKIE_SECRET`. Em dev (`localhost`), **não** defina `domain`: o cookie fica no host `localhost` e vale para as portas 3000 e 3333 (cookie não separa por porta), enquanto `domain=localhost` tem comportamento inconsistente entre navegadores.

**Validade do cookie ≠ validade do token.** O JWT vence em 15 min, mas o cookie `access_token` deve ter `Max-Age` igual ao do refresh (30 dias). Se o cookie sumisse junto com o token, a API receberia uma request **sem** token e responderia `UNAUTHORIZED` em vez de `TOKEN_EXPIRED`, e o front nunca tentaria renovar (o usuário seria jogado para o login a cada 15 min). Com o cookie durando mais, a API vê o JWT vencido e responde `TOKEN_EXPIRED`, que dispara o refresh.

### `session_hint` (para o front)

Além dos dois tokens, grave um terceiro cookie **sem segredo nenhum**: `session_hint=1`, **não** httpOnly, path `/`, mesmo domínio e mesma validade do refresh. Grave em login, cadastro e refresh; apague em logout, logout-all e quando o refresh falhar. O guard de rota do Next usa a presença dele só para decidir redirecionamentos rápidos (o servidor do Next não consegue validar o access token). Ele não autoriza nada: quem autoriza é a API.

## Payload do access token

```json
{ "sub": "<userId>", "org": "<organizationId | null>", "role": "OWNER|ADMIN|MEMBER", "ver": 3, "iat": ..., "exp": ..., "iss": "<API_URL>", "aud": "<APP_URL>" }
```

- `org` e `role` refletem a **organização ativa**. Trocar de organização emite um novo access token.
- `ver` é o `tokenVersion` da membership no momento da emissão.
- Algoritmo fixo na configuração (ex.: HS256 com `JWT_ACCESS_SECRET`); a verificação aceita **só** esse algoritmo e valida `iss`, `aud` e `exp`.
- `org: null` é permitido (usuário que saiu de todas as organizações). Rotas de tenant devolvem 403 `NO_ACTIVE_ORGANIZATION`; continuam acessíveis `/me`, listar/criar organização, aceitar convite e trocar de organização.

## Models

```prisma
model RefreshToken {
  id           String    @id @default(uuid(7)) @db.Uuid
  userId       String    @db.Uuid
  familyId     String    @db.Uuid          // todos os tokens de uma mesma sessão
  tokenHash    String    @unique           // sha256 do token; o token em si nunca é salvo
  expiresAt    DateTime
  revokedAt    DateTime?
  replacedById String?   @db.Uuid
  userAgent    String?
  ip           String?
  createdAt    DateTime  @default(now())
  user         User      @relation(fields: [userId], references: [id], onDelete: Cascade)
  @@index([userId])
  @@index([familyId])
}

model VerificationToken {
  id        String           @id @default(uuid(7)) @db.Uuid
  userId    String           @db.Uuid
  type      VerificationType // EMAIL_VERIFY | PASSWORD_RESET
  tokenHash String           @unique
  expiresAt DateTime
  usedAt    DateTime?
  createdAt DateTime         @default(now())
  user      User             @relation(fields: [userId], references: [id], onDelete: Cascade)
}
```

`User`, `Organization`, `Membership` e `Invitation` estão em `05-multi-tenant.md`.

## Rotas

| Rota | Pública | Faz |
|---|---|---|
| `POST /v1/auth/register` | sim | cria `User` + `Organization` + `Membership(owner)` numa transação; envia e-mail de verificação; já devolve os cookies (login direto) |
| `POST /v1/auth/login` | sim | valida senha; emite access + refresh (nova família) |
| `POST /v1/auth/refresh` | sim (usa o cookie de refresh) | rotação (abaixo) |
| `POST /v1/auth/logout` | sim | revoga a família do refresh atual; limpa cookies; 204 |
| `POST /v1/auth/logout-all` | não | revoga todos os refresh do usuário; 204 |
| `POST /v1/auth/verify-email` | sim | consome token `EMAIL_VERIFY` |
| `POST /v1/auth/resend-verification` | não | reenvia (rate limit forte) |
| `POST /v1/auth/forgot-password` | sim | **sempre 204**, existindo ou não o e-mail |
| `POST /v1/auth/reset-password` | sim | consome `PASSWORD_RESET`, troca a senha e **revoga todos os refresh** |
| `POST /v1/auth/switch-organization` | não | valida membership e emite novo access token |
| `GET /v1/me` | não · `tenant: false` | usuário (com `emailVerified`) + organização ativa + papel + lista de organizações (com o papel em cada) + **plano efetivo da organização ativa** (`plan`, `features`, `limits`, `usage`, `status`, `paymentIssue`). Todo membro precisa disso para a interface saber o que mostrar; só owner/admin acessam os detalhes de cobrança em `/v1/billing/subscription`. **A organização ativa e o papel vêm do banco, não do token**: se a membership da organização do token não existe mais (pessoa removida), `organization` volta `null` e o front leva para `/sem-empresa` na hora, sem esperar os 15 min do token |
| `PATCH /v1/users/me` | não · `tenant: false` | atualiza nome (e-mail não muda na v1) |
| `POST /v1/users/me/password` | não · `tenant: false` | `{ currentPassword, newPassword }`; confere a atual; revoga os **outros** refresh do usuário (mantém a sessão atual) |

Organização ativa no login: a última usada (`User.lastOrganizationId`) se ainda for membro; senão a primeira membership; senão `null`.

### Formatos fixos (contrato do `/rodsaas:verify`)

Os nomes de campos abaixo são fixos, porque a bateria de testes do `/rodsaas:verify` (e o front) dependem deles. A tabela completa está em `skills/verify/references/contrato.md`.

- `POST /v1/auth/register`: `{ name, email, password, organizationName }`, ou `{ name, email, password, invitationToken }` — com convite, `organizationName` não é exigido e **nenhuma** empresa nova é criada: a pessoa entra só na empresa do convite.
- `POST /v1/auth/login`: `{ email, password }` · `POST /v1/auth/switch-organization`: `{ organizationId }` · `POST /v1/organizations`: `{ name }` (a nova vira a ativa e um access token novo é emitido).
- `GET /v1/me`: `{ user: { id, name, email, emailVerified }, organization: { id, name, role } | null, organizations: [{ id, name, role }], plan: { id, name, limits, features, usage } }`.
- `GET /v1/members`: `{ data: [{ id, role, user: { id, name, email } }], meta }` · `PATCH /v1/members/:id`: `{ role }` · `POST /v1/invitations`: `{ email, role }`.
- `GET /v1/billing/plans`: `[{ id, name, limits, features }]` (limite ilimitado = `null`).

## Rotação do refresh (o coração da segurança)

```
POST /v1/auth/refresh  (cookie refresh_token)
1. hash = sha256(token); busca RefreshToken por tokenHash
2. não existe ou expirado         → 401, limpa cookies
3. revokedAt != null  (REUSO!)    → revoga TODA a família (familyId), loga alerta de segurança, 401
4. válido:
   - numa transação: marca o atual como revogado (revokedAt = now, replacedById = novo.id)
     e cria o novo com o mesmo familyId
   - recalcula org/role/ver a partir do banco (não do token antigo)
   - grava os dois cookies novos
```

Por que o passo 3 importa: se alguém roubou um refresh e usou, o dono legítimo vai usar o mesmo token depois (ou vice-versa). O segundo uso de um token já revogado só acontece em caso de roubo, então a sessão inteira cai.

Concorrência: duas abas podem chamar `/refresh` ao mesmo tempo com o mesmo token, e a segunda seria vista como reuso. Para evitar falso positivo, um token revogado **há menos de ~10 segundos** (e substituído por rotação, não por logout) não derruba a família: emita um novo par na mesma família normalmente. Como o token cru nunca é salvo, não dá para "devolver o sucessor"; emitir um novo é o caminho. Implemente essa janela de tolerância explicitamente e cubra com teste.

## Senhas

- argon2id com os parâmetros padrão recomendados pela lib.
- Política mínima: 8+ caracteres; rejeite senhas iguais ao e-mail. (Sem regras de "1 maiúscula, 1 símbolo".)
- Login com e-mail inexistente também roda um `argon2.verify` contra um hash fixo, para o tempo de resposta não revelar se o e-mail existe.
- Erro de login sempre `401 INVALID_CREDENTIALS`, igual para e-mail inexistente e senha errada.

## Bloqueio de força bruta

- Rate limit por IP nas rotas de auth (ex.: 10/min em login, 3/min em forgot-password).
- Contador por e-mail: após 5 falhas seguidas, exige espera crescente (1 min, 5 min, 15 min). Zera no login com sucesso.

## Plugin `authenticate`

Hook `onRequest` registrado globalmente:
- se `routeOptions.config.public === true` → segue sem auth;
- senão, verifica o JWT do cookie `access_token`; inválido → 401 `UNAUTHORIZED`; expirado → 401 `TOKEN_EXPIRED` (o front usa esse código para chamar `/refresh` e repetir a request);
- preenche `request.auth = { userId, orgId, role, ver }`.

```ts
// types/fastify.d.ts
declare module 'fastify' {
  interface FastifyRequest {
    auth: { userId: string; orgId: string | null; role: Role | null; ver: number | null }
  }
  interface FastifyContextConfig {
    public?: boolean
    roles?: Role[]
    feature?: Feature
    limit?: LimitKey
    idempotent?: boolean
    tenant?: boolean // padrão true; false para rotas que funcionam sem organização ativa
  }
}
```

## Revogação rápida: `tokenVersion`

O access token vale 15 min mesmo se a pessoa for removida da organização. Para as ações que importam:

- `Membership.tokenVersion` é incrementado ao **remover** o membro ou **mudar o papel**.
- O plugin `authorize` (rotas com `config.roles`) busca a membership `(userId, orgId)` e confere que existe e que `tokenVersion === auth.ver`. Se não bater → 401 `TOKEN_EXPIRED`, o front faz refresh e recebe o papel atualizado (ou perde o acesso).
- Rotas sem `roles` confiam no token pelos 15 minutos. É uma troca consciente: custo de uma query vs. janela curta.

## E-mails de auth

Verificação, reset e convite são enviados via fila (pg-boss), nunca dentro da request. Links apontam para o front (`APP_URL/verify-email?token=...`), e o front chama a API. Tokens de e-mail: 32 bytes aleatórios, salvos como sha256, uso único, validade de 24h (verificação) e 1h (reset).
