# 01 · Escopo, papéis e integração

## Escopo da v1 por área

| Área | Inclui |
|---|---|
| **Propostas** | número por empresa (`P-0001`) e versão (v1, v2…), título, cliente (nome, empresa, CPF/CNPJ, e-mail, telefone — ou um contato do CRM), vendedor, itens (descrição, detalhe, quantidade com até 3 casas, unidade, preço, desconto em % ou R$, recorrência mensal/anual, opcional), desconto geral sobre o avulso, totais (avulso, mensal, anual) e desconto efetivo, plano de pagamento (à vista, parcelado, entrada + parcelas) com o cronograma, validade, observações e condições, anexos, modelo de apresentação (capa, sobre a empresa, escopo), aprovação de desconto, envio por e-mail, link público, rastreio (aberta quando, quantas vezes, por quanto tempo), comentários do cliente, aceite online, recusa com motivo, encerrar, cancelar, duplicar, nova versão, PDF |
| **Modelos** | modelos de proposta (blocos de apresentação) e de contrato (cláusulas), editor rico com inserção de variáveis por lista, filtros (`moeda`, `data`, `extenso`, `documento`, `maiusculas`), validação ao salvar, prévia com dados de uma proposta/contrato real, modelo padrão por tipo |
| **Contratos** | número (`C-0001`), título, modelo, proposta de origem, partes (contratante, contratada, intervenientes) com CPF/CNPJ, objeto, valor e recorrência (única, mensal, anual), vigência (início + meses → fim), aviso prévio, renovação automática (por N meses), reajuste por índice (com histórico), aditivos (cada um com assinatura), encerramento/rescisão com data e motivo, anexos, contrato existente já assinado (PDF), lista por situação e avisos de vencimento |
| **Assinatura** | envelope de um contrato, aditivo ou PDF avulso; signatários (parte, testemunha, aprovador) com e-mail, CPF/CNPJ opcional/obrigatório, ordem (mesma ordem = paralelo); link por signatário (também copiável para WhatsApp); código de 6 dígitos por e-mail; assinar (nome + documento + concordância), recusar com motivo; lembretes automáticos e manuais; cancelar; validade; PDF final (documento + folha de assinaturas) com SHA-256 e código de verificação; download para todos; verificação pública por código ou arquivo |

## App na casca

`web/src/features/comercial/app.tsx` e `config/apps.ts`:

```ts
export const comercialApp: AppDef = {
  id: 'comercial', name: 'Comercial', description: 'Propostas, contratos e assinatura eletrônica',
  icon: FileSignature, category: 'vendas', order: 25, defaultPinned: true,
  match: ['/comercial'], home: '/comercial',
  Sidebar: ComercialSidebar,
  action: { label: 'Proposta', onSelect: openNewProposal },
  useBadge: useComBadge,                         // aprovações pendentes (admin) + propostas aceitas não vistas + contratos vencendo
  visible: (me) => !!me.comercial?.role,
  widgets: [pipelineWidget, awaitingSignatureWidget, expiringContractsWidget],
  search: comSearchProvider,                     // propostas (número, título, cliente), contratos, modelos
  settings: { label: 'Comercial', href: '/comercial/configuracoes' },
}
```

`/v1/me` passa a devolver `comercial: { role }`. Acrescente `{ id: 'comercial', name: 'Comercial', home: '/comercial' }` em `rodsaas.json → apps` e `"comercial"` em `presets`.

**Menu**: Início · Propostas (Rascunhos · Enviadas · Aceitas · Todas) · Contratos (Vigentes · Vencendo · Aguardando assinatura · Todos) · Assinaturas (envelopes) · Modelos · Configurações (`COM_ADMIN`).

Páginas públicas `/proposta/[token]`, `/assinar/[token]` e `/verificar/[codigo]` ficam fora do grupo `(app)`: sem casca e sem login.

## Papéis

`ComRole { userId, role }`; o owner é sempre `COM_ADMIN`.

| Ação | `COM_ADMIN` | `SELLER` | `VIEWER` | Sem papel |
|---|---|---|---|---|
| ver propostas | todas | **só as próprias** (as de outro vendedor → 404) | todas | — (API 403 `NOT_COM_MEMBER`) |
| criar/editar/enviar propostas | ✅ (de qualquer vendedor; pode trocar o vendedor) | as próprias | — | — |
| aprovar desconto acima do limite | ✅ (as propostas do próprio admin não precisam de aprovação) | — | — | — |
| modelos | criar, editar, padrão | usar | ver | — |
| contratos | todos | os das próprias propostas e os que criou | ver | — |
| enviar para assinatura, cancelar envelope, lembrar | ✅ | dos próprios contratos | — | — |
| configurações, papéis, limites | ✅ | — | — | — |

## Planos (modelo de planos da base)

| | Free | Pro | Business |
|---|---|---|---|
| limite `comProposalsMonthly` (propostas enviadas no mês) | 10 | ilimitado | ilimitado |
| limite `comEnvelopesMonthly` (envelopes enviados no mês) | 0 | 50 | 500 |
| propostas, itens, opcionais, plano de pagamento, link e aceite online, modelos padrão, PDF | ✅ | ✅ | ✅ |
| feature `com_contracts` (contratos, vigência, renovação, reajuste, aditivos) | — | ✅ | ✅ |
| feature `com_signatures` (assinatura eletrônica) | — | ✅ | ✅ |
| feature `com_approvals` (aprovação de desconto) | — | ✅ | ✅ |
| feature `com_templates` (modelos próprios) | — | ✅ | ✅ |
| feature `com_tracking` (rastreio de visualização) | — | ✅ | ✅ |
| sinal no aceite, envio por WhatsApp, catálogo do ERP, reajuste por índice (`10`) | ✅ | ✅ | ✅ (WhatsApp com o add-on; sinal cobrado com o Financeiro) |
| feature `com_reports` (relatório de conversão, `10`) | — | ✅ | ✅ |
| features `com_rentals`, `com_measurements`, `com_enrollments` (perfis, `11`) | — | ✅ | ✅ |

Limite atingido → 403 `PLAN_LIMIT_REACHED` no enviar (rascunhos continuam livres). Rebaixar não apaga nada: envelopes em andamento seguem até concluir.

## Workstation

- Catálogo: um app `comercial` (preset `comercial`, categoria `vendas`, `pricing: { unit: "vendedor", price: 29, note: "inclui 50 envelopes de assinatura por mês; pacotes extras" }`); features `com_*` e limites `com…` pelo prefixo `com` em `FEATURE_PREFIXES` (→ `comercial`).
- **Acesso** vem do papel (`hasComercialAccess`); **assento** = pessoas com papel `SELLER` ou `COM_ADMIN` (`registerSeatCounter('comercial', countComSellers)`); `VIEWER` não conta. Dar papel de vendedor além dos assentos → 409 `CONFIRM_REQUIRED` (mesma regra da workstation).
- Rotas públicas (`/v1/public/com/...`) fora do guard: link de proposta e de assinatura continuam funcionando com o app bloqueado (só leitura do lado de dentro; nada novo é enviado).
- `registerAppRoutes('comercial', ['/v1/com'])`, `registerAppActivation('comercial', seedComercial)`.

## Acessos no convite (`registerMemberAccess('comercial', …)`)

O registro é da base (`skills/backend/references/10-acessos-por-pessoa.md`): a tela de convite e a de "Acessos da pessoa" desenham estes campos sem conhecer o app; `read` lê da fonte da verdade do app (nunca de uma cópia) e `apply` é idempotente.

| Campo | Tipo | Padrão | Aplica |
|---|---|---|---|
| `role` | select "Papel no Comercial" (`COM_ADMIN`, `SELLER`, `VIEWER`) | `SELLER` | `ComRole` |

- `canGrant`: `COM_ADMIN` ou owner; o admin da empresa dá `SELLER`/`VIEWER`, e `COM_ADMIN` só se for `COM_ADMIN`.
- `countsSeat`: `SELLER` e `COM_ADMIN` (vendedor); `VIEWER` não. Sem assento livre, o admin gera pedido e o owner aprova com o valor.

## Integrações

| App | Integração |
|---|---|
| CRM | "Criar proposta" no negócio (cliente, itens dos produtos do negócio, vendedor = responsável); a proposta mostra o negócio e o negócio mostra as propostas e a situação; **aceite → negócio ganho** com o valor aceito (evento no CRM); recusa → anotação no negócio com o motivo |
| Financeiro | **aceite → contas a receber** do plano de pagamento (uma por parcela, categoria "Vendas/Serviços", contato com o documento do aceite) e, se a configuração pedir, a **cobrança** de cada uma; contrato recorrente → recorrência no Financeiro até o fim da vigência; renovação estende |
| Uploads | anexos, PDF de contrato existente, PDF avulso para assinar, PDF final |

Cada integração só aparece se o outro app estiver instalado e ligado; falha na integração não desfaz o aceite (fica na lista "Integrações com problema" com tentar de novo).

## Avisos

Tipos no catálogo do add-on `notificacoes` (`skills/notificacoes/references/04-catalogo.md`, seção "Comercial"; frases em `notifications-lib` → `PRESET_TYPES` com `appId: "comercial"`). E-mails para **clientes e signatários** (proposta, lembrete de validade, código de assinatura, convite para assinar, lembrete, documento concluído, recusa) saem pelo app com a marca da empresa e `reply-to` = e-mail do vendedor.

## Testes obrigatórios

- Sem papel → 403 `NOT_COM_MEMBER` (com a workstation, o guard de app pode responder `APP_ACCESS_DENIED`); `VIEWER` lê e não escreve; vendedor não vê a proposta de outro (404) nem aprova.
- Free: 11ª proposta enviada no mês → 403 `PLAN_LIMIT_REACHED`; enviar para assinatura sem `com_signatures` → 403 `FEATURE_NOT_IN_PLAN`.
- Integrações (com CRM e Financeiro instalados): aceite ganha o negócio e cria as contas a receber com os valores do plano.
- Convite com `comercial: { role: "SELLER" }` → a pessoa entra como vendedora; tirar pelo ajuste da pessoa → 403 no app.
