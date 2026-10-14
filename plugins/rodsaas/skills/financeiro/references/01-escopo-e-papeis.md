# 01 · Escopo, papéis e integração

## Escopo da v1 por área

| Área | Inclui |
|---|---|
| **Lançamentos** | a receber e a pagar; descrição, contato, categoria, centro de custo, conta prevista, valor, **vencimento** e **competência** (mês do resultado), emissão, número do documento, observações, anexos (`uploads`), etiquetas; parcelamento (2–360 parcelas, semanal, quinzenal, mensal, trimestral, semestral, anual); recorrência (mesmos intervalos, "a cada N", até uma data ou N vezes, fim do mês respeitado); baixa parcial e total com conta, data, forma (Pix, boleto, cartão, TED/DOC, dinheiro, débito automático, outro), juros, multa e desconto; estorno de baixa; cancelamento com motivo; duplicar; ações em massa (baixar, mudar categoria/vencimento, cancelar, exportar); histórico de alterações |
| **Aprovação de pagamentos** | contas a pagar lançadas por `FIN` acima do limite ficam "Aguardando aprovação" até um `FIN_ADMIN` aprovar ou recusar (com motivo); `FIN_ADMIN` não precisa de aprovação |
| **Contas** | conta corrente, poupança, caixa, cartão de crédito (fatura com fechamento e vencimento), investimento e Stripe (criada ao conectar); banco, agência, número, cor; saldo inicial na data; saldo de hoje e projetado; transferências entre contas (não são receita nem despesa); arquivar |
| **Contatos** | clientes e fornecedores (ou os dois) com CPF/CNPJ válido e único na empresa, e-mail, telefone, endereço, chave Pix do fornecedor, observações; histórico de lançamentos e cobranças; ligação com o contato/empresa do CRM se instalado |
| **Plano de contas** | categorias de receita e despesa em árvore (2 níveis), cada uma ligada a um grupo da DRE; centros de custo; arquivar o que tem uso |
| **Fluxo de caixa** | por dia (30/60/90 dias) ou mês (12 meses), entradas e saídas realizadas, previstas, saldo do período e acumulado; vencidos entram em "hoje" com destaque; filtros por conta, categoria, centro de custo; exportar |
| **DRE e relatórios** | DRE gerencial por competência (padrão) ou caixa, mês a mês e acumulado, com margens; contas a pagar e a receber por período; inadimplência por faixa (a vencer, 1–30, 31–60, 61–90, 90+) e por cliente; despesas por categoria e por centro de custo; recebimentos por contato; exportação CSV para a contabilidade (lançamentos com plano de contas, baixas, transferências) e envio por e-mail ao contador |
| **Conciliação** | importar OFX (1.x SGML e 2.x XML) e CSV por conta; deduplicação por FITID; transações pendentes com sugestões (valor, data, nome), conciliar com um ou mais lançamentos do mesmo valor total, criar lançamento a partir da transação (já baixado), reconhecer transferência entre contas próprias, ignorar (com motivo), desfazer; regras automáticas; saldo do extrato × saldo do sistema |
| **Cobranças** | conectar a conta Stripe da empresa (Connect); cobrar um lançamento a receber por boleto, Pix e/ou cartão; link de pagamento `/pagar/<token>` com a marca da empresa (para mandar por e-mail ou WhatsApp); e-mail da cobrança; baixa automática pelo webhook (na conta "Stripe", com a tarifa lançada em "Tarifas bancárias e de cobrança"); régua de lembretes (antes, no dia, depois); cancelar e gerar nova; segunda via com novo vencimento e multa/juros; cobrança recorrente de clientes (assinatura mensal/anual por cartão ou boleto: cada fatura paga vira lançamento baixado); repasse da Stripe para o banco como transferência |

## App na casca

`web/src/features/financeiro/app.tsx` e `config/apps.ts`:

```ts
export const financeiroApp: AppDef = {
  id: 'financeiro', name: 'Financeiro', description: 'Contas a pagar e a receber, fluxo de caixa, DRE e cobranças',
  icon: Wallet, category: 'financeiro', order: 70, defaultPinned: true,
  match: ['/financeiro'], home: '/financeiro',
  Sidebar: FinanceiroSidebar,
  action: { label: 'Lançamento', onSelect: openNewEntry },
  useBadge: useFinBadge,                        // vencendo hoje + vencidos + aprovações pendentes (FIN_ADMIN) + a conciliar
  visible: (me) => !!me.financeiro?.role,
  widgets: [balancesWidget, dueTodayWidget, cashflow30Widget],
  search: finSearchProvider,                    // lançamentos (descrição, número), contatos, cobranças
  settings: { label: 'Financeiro', href: '/financeiro/configuracoes' },
}
```

`/v1/me` passa a devolver `financeiro: { role }`. Acrescente `{ id: 'financeiro', name: 'Financeiro', home: '/financeiro' }` em `rodsaas.json → apps` e `"financeiro"` em `presets`.

**Menu do app**: Início · Lançamentos (A receber · A pagar · Todos) · Fluxo de caixa · DRE · Relatórios · Conciliação (contador do que falta) · Cobranças · Assinaturas · Contas · Contatos · Configurações (`FIN_ADMIN`).

A página pública `/pagar/[token]` fica fora do grupo `(app)`: sem casca e sem login.

## Papéis

`FinRole { userId, role }` (um por pessoa), independente do papel na empresa: o admin da empresa **não** vê o financeiro só por ser admin. O owner é sempre `FIN_ADMIN`.

| Ação | `FIN_ADMIN` | `FIN` | `VIEWER` | Sem papel |
|---|---|---|---|---|
| ver lançamentos, contas, fluxo, DRE, relatórios | ✅ | ✅ | ✅ | — (app escondido; API → 403 `NOT_FIN_MEMBER`) |
| criar/editar lançamentos, baixar, estornar, cancelar | ✅ | ✅ (a pagar acima do limite → aguardando aprovação) | — | — |
| aprovar/recusar pagamentos | ✅ (o que um `FIN` lançou; o que o próprio `FIN_ADMIN` lança não precisa de aprovação) | — | — | — |
| contas financeiras, transferências | ✅ | transferências ✅; criar/arquivar contas — | — | — |
| conciliação (importar, conciliar, regras) | ✅ | ✅ (regras: só `FIN_ADMIN`) | — | — |
| cobranças e assinaturas de clientes | ✅ | ✅ | — | — |
| conectar/desconectar a Stripe, régua, plano de contas, centros de custo, aprovação, papéis, contador | ✅ | — | — | — |
| exportar | ✅ | ✅ | ✅ | — |

Registro de outra empresa → 404. Escrita sem permissão → 403 `FORBIDDEN`.

## Planos (modelo de planos da base)

Acrescente em **todos** os planos de `config/plans.ts` (preservando o que existe):

| | Free | Pro | Business |
|---|---|---|---|
| limite `finAccounts` (contas financeiras ativas, sem contar a Stripe) | 2 | 10 | ilimitado |
| lançamentos, parcelas, contatos, plano de contas, fluxo de caixa, baixa manual | ✅ | ✅ | ✅ |
| feature `fin_reconciliation` (OFX/CSV, regras) | — | ✅ | ✅ |
| feature `fin_charges` (Stripe Connect, cobranças, régua, assinaturas de clientes) | — | ✅ | ✅ |
| feature `fin_reports` (DRE, inadimplência, relatórios, exportação para a contabilidade) | — | ✅ | ✅ |
| feature `fin_recurring` (recorrências) | — | ✅ | ✅ |
| feature `fin_approvals` (aprovação de pagamentos) | — | ✅ | ✅ |

Rebaixar não apaga nada: contas acima do limite ficam só leitura; cobranças pendentes continuam valendo até vencer (a baixa automática segue funcionando), mas não dá para criar novas; recorrências pausam.

## Workstation

Com a `/rodsaas:workstation` (`billing.model: "apps"`):

- Catálogo: um app `financeiro` (preset `financeiro`, categoria `financeiro`, `pricing: { unit: "empresa", price: 49, note: "+ tarifas da Stripe nas cobranças, pagas pela empresa direto à Stripe" }`). Features `fin_*` e o limite `finAccounts` entram pelo prefixo `fin` em `FEATURE_PREFIXES` (→ `financeiro`).
- **Acesso** vem do papel do app (`FinRole`), não do `AppAccess`: o guard de app consulta `hasFinanceiroAccess` (o preset registra a regra, como o Pessoas). Cobrado por empresa: não há assento.
- `registerAppRoutes('financeiro', ['/v1/fin'])` (as rotas públicas `/v1/public/fin/...` e o webhook ficam fora do guard: cobrança pendente de app bloqueado continua dando baixa, o dinheiro é do cliente da empresa), `registerAppActivation('financeiro', seedFinanceiro)`.
- App bloqueado: só leitura; régua de lembretes e recorrências pausam (`isAppActive`).

## Integrações (quando os outros apps existirem)

| App | Integração |
|---|---|
| CRM | negócio ganho → "Gerar a receber" (valor, contato, parcelas) com o link de volta; o contato do Financeiro aponta para o contato/empresa do CRM (busca de CNPJ do `crm-lib` reaproveitada) |
| Agenda | agendamento com preço → "Lançar a receber" (e cobrar pelo link) |
| Pessoas | reembolso aprovado de despesas → conta a pagar ao colaborador (com a chave Pix do grupo `bank`); "pago" no Financeiro marca o reembolso como pago |
| Tarefas | nada na v1 |

Cada integração é um botão/ação do lado do outro app chamando a API do Financeiro (`POST /v1/fin/entries` com `source: { app, id, url }`); o lançamento mostra a origem.

## Avisos

Tipos no catálogo do add-on `notificacoes` (`skills/notificacoes/references/04-catalogo.md`, seção "Financeiro"; frases em `notifications-lib` → `PRESET_TYPES` com `appId: "financeiro"`). Nunca coloque saldo de conta no texto do aviso; valores de lançamento podem aparecer para quem tem papel.

E-mails para **clientes da empresa** (cobrança com o link, lembretes da régua, recibo de pagamento) saem pelo app (transporte de e-mail da base / Resend), com nome, logo e cor da empresa, `reply-to` com o e-mail financeiro da empresa e rodapé "Enviado por {empresa} usando {produto}".

## Testes obrigatórios

- Sem papel → 403 `NOT_FIN_MEMBER`; `VIEWER` lê e não escreve; `FIN` escreve; `FIN_ADMIN` configura.
- Plano Free: 3ª conta financeira → 403 `PLAN_LIMIT_REACHED`; conciliação sem `fin_reconciliation` → 403 `FEATURE_NOT_IN_PLAN`.
- Workstation (se instalada): sem papel → `APP_ACCESS_DENIED`; app bloqueado → GET 200, POST 403 `APP_NOT_ACTIVE`; webhook da cobrança continua baixando.
