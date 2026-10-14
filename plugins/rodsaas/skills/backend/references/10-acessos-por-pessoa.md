# 10 · Acessos da pessoa (convite, ajuste e pedido)

Quem convida escolhe **ali mesmo** tudo o que a pessoa vai usar: os apps e, em cada app, o papel ou a configuração básica (atendente do Suporte, vendedor do Comercial, papel no Financeiro…). Ao aceitar o convite, tudo é aplicado e a pessoa já entra usando. Depois, um lugar só por pessoa liga e desliga apps e papéis. O que quem convida **não pode dar** (papel que ele mesmo não dá dentro do app, ou assento pago que só o owner aprova) **não trava o convite**: vira um **pedido de acesso** criado sozinho no aceite, que o owner aprova com um clique.

Regras puras em `scripts/member-access-lib.mjs` (porte para `api/src/modules/access/lib/` com os testes).

## Por que existe

Usar um app pode depender de três camadas: ser membro da empresa (papel OWNER/ADMIN/MEMBER), ter acesso ao app (`AppAccess` da workstation, que no modelo por app é assento pago) e ter a configuração de dentro do app (ser atendente do Suporte, ter papel no Financeiro, ser anfitrião na Agenda…). Cada camada mora num lugar diferente; sem este módulo, o owner convida, a pessoa entra sem nada, pede acesso app por app e ainda falta a configuração de dentro de cada app.

**Fonte da verdade**: o convite e o pedido guardam a **intenção**. Depois de aplicado, quem manda é cada app (a tabela de atendentes, o papel do Financeiro, o `AppAccess`…). A tela da pessoa lê de cada app (`read`), nunca de uma cópia: a tela de atendentes do Suporte, "Pessoas com acesso" da loja e "Acessos da pessoa" nunca se desencontram.

## Registro por app (`registerMemberAccess`)

`api/src/modules/access/registry.ts`. Cada preset registra o dele no boot (mesmo espírito do `registerAppActivation`); a tela de convite e a da pessoa **não conhecem nenhum app**: desenham os campos a partir da descrição.

```ts
registerMemberAccess('helpdesk', {
  label: 'Suporte',
  fields: [                                     // tipos fixos: boolean | select | multiselect (validateFieldDefs no boot)
    { key: 'isAgent', type: 'boolean', label: 'É atendente', default: true },
    { key: 'queueIds', type: 'multiselect', label: 'Filas', source: 'queues', showIf: 'isAgent' },
  ],
  sources: async (tx, orgId) => ({ queues: [{ value: id, label: nome }, …] }),   // listas dos selects
  validate: async (tx, orgId, value) => errors,  // regras do app (limite de atendentes do plano…), além do validateAccessValue
  canGrant: (actor, value) => boolean,           // actor: { orgRole, appRole }; quem dá só dá o que poderia dar dentro do app
  countsSeat: (value) => boolean,                // opcional (workstation): o valor ocupa assento? (padrão: sim nos apps por pessoa)
  read: async (tx, orgId, userId) => value | null,          // null = não usa
  apply: async (tx, orgId, userId, value, actorId) => void, // idempotente; null em value = revoke
  revoke: async (tx, orgId, userId, actorId) => void,
})
```

- **Campos**: `validateAccessValue` (padrões, campos escondidos por `showIf`, opções da fonte) e `normalizeAccess` (mapa inteiro, caminhos `access.<app>.<campo>` nos erros) do `member-access-lib`. App sem campos = "usa o app" (só faz sentido com a workstation, pelo `AppAccess`).
- **`canGrant`**: OWNER dá tudo. ADMIN dá o que os papéis dele dentro do app permitem (ex.: ADMIN da empresa que não é `FIN_ADMIN` não dá `FIN_ADMIN`). Não pode → o app vai para o pedido com o motivo `NOT_GRANTABLE` (nunca erro).
- **Política de concessão** (`registerGrantPolicy`, opcional, uma só): a workstation registra a dela para decidir assentos e valor (`skills/workstation/references/04-acesso-e-direitos.md`). Sem workstation, tudo o que passa no `canGrant` vale.

### O que cada preset registra

| App (preset) | Campos | `canGrant` | Observação |
|---|---|---|---|
| Suporte (`helpdesk`) | `isAgent` (padrão sim), `queueIds` (fila padrão se vazio) | OWNER/ADMIN | `validate` confere o limite `helpdeskAgents` |
| Agenda (`agenda`) | `isHost` (atende clientes), `eventTypeIds` | OWNER/ADMIN | anfitrião com a disponibilidade padrão da empresa; limite `agendaHosts` |
| Tarefas (`tarefas`) | `privateProjectIds` | OWNER/ADMIN ou membro dono do projeto | só com `private_projects` |
| Pessoas (`rh`) | `role` (`RH_ADMIN`/`RH`/`FINANCE`/nenhum), `employee` (`none` · `link` com `employeeId` de ficha sem login · `admission`, que inicia a pré-admissão) | papel: só `RH_ADMIN`/owner; ficha: RH | o colaborador conta na Suíte RH |
| Financeiro (`financeiro`) | `role` (`FIN_ADMIN`/`FIN`/`VIEWER`, padrão `VIEWER`) | `FIN_ADMIN` ou owner | dados financeiros nunca entram sozinhos (nem no Completo) |
| Comercial (`comercial`) | `role` (`COM_ADMIN`/`SELLER`/`VIEWER`, padrão `SELLER`) | `COM_ADMIN` ou owner | `SELLER`/`COM_ADMIN` contam como vendedor (assento) |
| CRM, Forms, Páginas | nenhum ("usa o app") | — | com a workstation, só o `AppAccess` |

## Modelo

```prisma
model Invitation {
  // … campos da base (05-multi-tenant.md)
  access        Json?                    // { [appId]: options } — o que vale no aceite (grant do planGrant)
  requests      Json?                    // { [appId]: { options, reason } } — vira AccessRequest no aceite
  confirmedById String?  @db.Uuid        // owner que confirmou o novo valor (workstation, modelo por app)
  confirmedAt   DateTime?
}

model AccessRequest {
  id             String    @id @default(uuid(7)) @db.Uuid
  organizationId String    @db.Uuid
  userId         String    @db.Uuid                    // quem vai ganhar o acesso
  appId          String
  options        Json      @default("{}")             // validadas pelo registro do app
  sources        String[]                              // MEMBER (pediu) | INVITE (veio do convite) | ADMIN (ajuste sem poder dar)
  reason         String?                               // NOT_GRANTABLE | NO_SEAT | APPLY_FAILED
  detail         String?                               // erro do apply (APPLY_FAILED) ou mensagem de quem pediu
  requestedById  String    @db.Uuid                    // quem convidou/ajustou, ou a própria pessoa
  invitationId   String?   @db.Uuid
  status         String    @default("PENDING")         // PENDING | APPROVED | DECLINED | CANCELED
  decidedById    String?   @db.Uuid
  decidedAt      DateTime?
  declineReason  String?
  createdAt      DateTime  @default(now())
  @@index([organizationId, status])
}
// índice único parcial (migration SQL): (organizationId, userId, appId) WHERE status = 'PENDING'  → mergeRequest
```

RLS `FORCE` no `AccessRequest`. Membro removido → os pedidos dele viram `CANCELED`.

## Rotas

Erros novos: `UNKNOWN_APP` · `APP_DISABLED` · `UNKNOWN_FIELD` · `OPTION_INVALID` · `VALUE_INVALID` · `REQUIRED` (400, dentro de `VALIDATION_ERROR.errors` com o caminho), `CONFIRM_REQUIRED` (409, da workstation), `OWNER_APPROVAL_REQUIRED` (403, ADMIN aprovando o que muda o valor), `ACCESS_NOT_GRANTABLE` (403, aprovar sem poder dar), `ALREADY_HAS_ACCESS` (409), `NOT_PENDING` (409).

| Rota | Quem | Faz |
|---|---|---|
| ★ `GET /v1/access/options` | owner, admin | **`{ apps: [{ appId, name, usesAppAccess, included, fields: [{ key, type, label, required, default, showIf, options: [{ value, label }] }] }] }`**: os apps ligados com campos (com as `sources` já resolvidas); `included: true` quando o modelo dá o app a todos (teste/Completo/plano antigo) |
| ★ `POST /v1/invitations/check` | owner, admin | **`{ role, access }`** → **`{ grant: [appId], request: [{ appId, reason }], confirm: null \| { newMonthly, amountDueNow, apps: [appId] }, errors }`** (a tela chama a cada mudança, com debounce; não grava nada) |
| ★ `POST /v1/invitations` | owner, admin · `limit: 'members'` · idempotente | **`{ email, role, access?, confirm? }`** → `normalizeAccess` (400 com `access.<app>.<campo>`) → política → `planGrant`; owner com valor novo sem `confirm` → 409 `CONFIRM_REQUIRED` `{ newMonthly, amountDueNow, apps }`; grava `access`, `requests` e a confirmação → 201 **`{ id, email, role, access: { grant: [appId], request: [{ appId, reason }] } }`** |
| aceite (`POST /v1/invitations/accept` e `register` com `invitationToken`) | — | ordem abaixo; a resposta não muda |
| ★ `GET /v1/members/:id/access` | owner, admin, a própria pessoa | **`{ memberId, userId, apps: { [appId]: options \| null }, requests: [{ id, appId, options, reason, status, createdAt }] }`** (cada app pelo `read`) |
| ★ `PUT /v1/members/:id/access` | owner, admin (ninguém altera a si mesmo, menos o owner) | **`{ access: { [appId]: { options } \| null }, confirm? }`** → `diffAccess`; o que muda passa pela mesma política: pode → aplica; não pode → vira pedido (`ADMIN`); owner com valor novo sem `confirm` → 409 `CONFIRM_REQUIRED` → **`{ applied: [appId], removed: [appId], requested: [{ appId, reason }], access }`** |
| ★ `POST /v1/access/requests` | membro (para si) | **`{ appId, options?, message? }`** → valida → já tem igual → 409 `ALREADY_HAS_ACCESS`; `mergeRequest` (201 novo, 200 juntou ao pendente) → aviso `org.access_requested` a quem pode aprovar |
| ★ `GET /v1/access/requests` | owner, admin (todos); membro (`?mine=1`, os próprios) | `?status=PENDING` (padrão) → **`{ data: [{ id, user: { id, name, email }, appId, appName, options, sources, reason, detail, requestedBy: { id, name }, status, createdAt }] }`** |
| ★ `POST /v1/access/requests/:id/approve` | quem pode dar (`canGrant` + política) | **`{ options?, confirm? }`** (pode ajustar as opções) → ADMIN sem assento → 403 `OWNER_APPROVAL_REQUIRED`; owner com valor novo sem `confirm` → 409 `CONFIRM_REQUIRED`; aplica (`apply` + `AppAccess`) → `APPROVED` → aviso `org.access_decided` à pessoa |
| ★ `POST /v1/access/requests/:id/decline` | idem | `{ reason? }` → `DECLINED` → aviso `org.access_decided` |

## Aceite do convite (ordem e falhas)

1. **Transação 1**: cria a membership (como hoje). Nunca falha por causa de um app.
2. **Por app de `access`**, cada um num `SAVEPOINT`: roda a política de novo (o assento reservado pelo convite continua valendo; se o owner reduziu, o app vira pedido `NO_SEAT`), `validate` e `apply` (com o `AppAccess` quando o app usa). Erro → volta só aquele app e cria o pedido com `reason: APPLY_FAILED` e o erro em `detail` (aprovar o pedido = tentar de novo).
3. **Pedidos** de `requests` (e os do passo 2): `AccessRequest` com `sources: ["INVITE"]`, `requestedById` = quem convidou, `invitationId`. A pessoa **não precisa fazer nada**.
4. **Depois do commit** (fila): sincronizar assentos (workstation, idempotente), avisos: `org.member_joined` (base), `org.access_requested` a quem pode aprovar (um aviso por pessoa, listando os apps), `org.access_issue` a quem convidou quando algum app falhou.

Quem aceitou vê no Início "Seu acesso ao {app} foi pedido ao responsável" enquanto houver pedido pendente.

## Um serviço para todos os convites

`createInvitation(tx, { orgId, actor, email, role, access, confirm })` é o único caminho: a tela de Membros, o onboarding da workstation (`invites` com os apps escolhidos), o "convidar para o autoatendimento" do Pessoas (`invite: true` com `access`) e qualquer preset que convide alguém usam o mesmo serviço e a mesma seção na tela.

## Testes obrigatórios

- `member-access-lib` portado com os testes.
- Opções: só apps ligados, com as listas resolvidas; app desconhecido/desligado e opção inválida → 400 com o caminho.
- Convite do owner com Suporte (atendente) e Comercial (vendedor) → aceita → a pessoa usa os dois sem pedir nada; `GET /v1/members/:id/access` mostra os dois.
- ADMIN convidando com um papel que não dá (`FIN_ADMIN`) → convite criado, o app em `request`; no aceite nasce o pedido `INVITE`/`NOT_GRANTABLE`; o owner aprova → aplicado; a pessoa recebe o aviso.
- Falha de um app no aceite (ex.: fila apagada antes do aceite) → a pessoa entra, os outros apps valem, pedido `APPLY_FAILED`.
- Ajuste: tirar o Comercial corta o acesso (403 no app); dar o Financeiro libera; membro não ajusta (403).
- Pedido pela própria pessoa: repetir não duplica; quem já tem → 409; recusar avisa.
