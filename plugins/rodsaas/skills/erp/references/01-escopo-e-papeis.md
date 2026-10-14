# 01 · Escopo, papéis e integração

## Escopo da v1 por área

| Área | Inclui |
|---|---|
| **Produtos** | tipos `SIMPLE`, `VARIANT` (pai da grade, sem estoque) com as `VARIATION` (filhas vendáveis), `KIT` e `SERVICE`; nome, descrição, categoria (árvore de 2 níveis), marca, unidade, SKU, código de barras (EAN-8/13/GTIN-14 validado ou interno gerado), fotos (até 6, a primeira é a capa), preço base, custo (manual ou médio), estoque mínimo/máximo, ativo/inativo, campos fiscais opcionais (NCM, CEST, origem, unidade tributável — guardados para a nota futura), observações; duplicar; importar e exportar CSV; imprimir etiquetas |
| **Preços** | tabelas de preço (Varejo padrão; outras com % sobre o base ou preço fixo por produto), faixas por quantidade por produto, preço da variação (herda do pai ou próprio), margem e markup ao vivo, reajuste em lote (% numa categoria/marca/tabela, com prévia) |
| **Estoque** | depósitos, movimentações, saldo por depósito, reservado, disponível, custo médio, transferências, inventário (contagem por depósito, com aplicar ajustes), mínimo e máximo, sugestão de compra, histórico por produto, posição valorizada |
| **Clientes e fornecedores** | cadastro único (`CUSTOMER`, `SUPPLIER` ou os dois), PF/PJ com CPF/CNPJ validado e único, nome fantasia, IE, e-mail, telefones, endereço por CEP, tabela de preço do cliente, limite de crédito, condição de pagamento padrão, observações, histórico (vendas, compras, em aberto no Financeiro) |
| **Vendas** | orçamento (`QUOTE`) com validade, pedido confirmado (reserva), separação, entrega (baixa), cancelamento (libera), devolução parcial; canal (balcão, pedido, PDV, Comercial); vendedor; tabela de preço; desconto por item e geral; frete; condição de pagamento; impressão (orçamento e pedido em PDF); duplicar; enviar por e-mail |
| **PDV** | caixas (terminais), sessão de caixa por pessoa, venda de balcão, leitor de código de barras, busca, cliente ou consumidor final, desconto, pagamento misto com troco, comprovante, suprimento, sangria, fechamento cego, reabrir comprovante e devolver pela venda |
| **Compras** | pedido de compra (rascunho, enviado), recebimento parcial, frete e despesas rateados, custo médio, contas a pagar, cancelamento |
| **Relatórios** | vendas (período, vendedor, cliente, produto, canal), curva ABC, posição de estoque valorizada, giro e dias de estoque, produtos parados, sugestão de compra, caixas (por sessão e forma de pagamento), exportar CSV |

## App na casca

`web/src/features/erp/app.tsx` e `config/apps.ts`:

```ts
export const erpApp: AppDef = {
  id: 'erp', name: 'ERP', description: 'Produtos, estoque, vendas, PDV e compras',
  icon: Boxes, category: 'financeiro', order: 35, defaultPinned: true,
  match: ['/erp'], home: '/erp',
  Sidebar: ErpSidebar,
  action: { label: 'Venda', onSelect: openNewOrder },
  useBadge: useErpBadge,                       // pedidos a separar (STOCK/ADMIN) + estoque baixo (ADMIN/STOCK)
  visible: (me) => !!me.erp?.roles?.length,
  widgets: [salesTodayWidget, lowStockWidget, toPickWidget],
  search: erpSearchProvider,                   // produtos (nome, SKU, código de barras), clientes, pedidos (número)
  settings: { label: 'ERP', href: '/erp/configuracoes' },
}
```

`/v1/me` passa a devolver `erp: { roles }`. Acrescente `{ id: 'erp', name: 'ERP', home: '/erp' }` em `rodsaas.json → apps` e `"erp"` em `presets`.

**Menu** (cada item só para quem tem o papel): Início · Vendas (Orçamentos · Pedidos · A separar · Devoluções) · **PDV** (abre em tela cheia) · Produtos (Produtos · Categorias · Tabelas de preço · Etiquetas) · Estoque (Posição · Movimentações · Transferências · Inventários) · Compras · Clientes e fornecedores · Relatórios · Configurações (`ERP_ADMIN`).

## Papéis

`ErpRole { userId, roles: String[] }` (mais de um por pessoa); o owner é sempre `ERP_ADMIN`.

| Ação | `ERP_ADMIN` | `SELLER` | `STOCK` | `CASHIER` | `VIEWER` | Sem papel |
|---|---|---|---|---|---|---|
| ver produtos e preços | ✅ | ✅ | ✅ | ✅ | ✅ | — (API 403 `NOT_ERP_MEMBER`) |
| ver **custo, margem, posição valorizada** | ✅ | — (`null`) | ✅ | — (`null`) | — | — |
| criar/editar produtos, tabelas, faixas, reajuste | ✅ | — | — | — | — | — |
| movimentar estoque, transferir, inventário | ✅ | — | ✅ | — | — | — |
| clientes e fornecedores | ✅ | clientes | fornecedores | criar cliente rápido no PDV | ver | — |
| orçamentos e pedidos | todos | os próprios (e os sem vendedor) | ver, separar e entregar | — | ver | — |
| desconto acima do limite (`maxDiscountPct`) | ✅ | — (422 `DISCOUNT_ABOVE_LIMIT`) | — | — | — | — |
| PDV | ✅ | — | — | o próprio caixa | — | — |
| ver todos os caixas, reabrir comprovante, cancelar venda do PDV | ✅ | — | — | — | — | — |
| compras e recebimento | ✅ | — | ✅ | — | ver | — |
| relatórios | todos | vendas próprias | estoque | o próprio caixa | todos sem custo | — |
| configurações, papéis, depósitos, caixas | ✅ | — | — | — | — | — |

Escrita sem papel → 403 `FORBIDDEN`. Pedido de outro vendedor para `SELLER` → 404.

## Planos (modelo de planos da base)

| | Free | Pro | Business |
|---|---|---|---|
| limite `erpProducts` (produtos ativos, variações não contam) | 50 | ilimitado | ilimitado |
| limite `erpWarehouses` | 1 | 5 | ilimitado |
| limite `erpRegisters` (caixas do PDV) | 0 | 2 | ilimitado |
| produtos, grade, kit, estoque, clientes, orçamentos, pedidos, devolução | ✅ | ✅ | ✅ |
| feature `erp_pdv` (PDV) | — | ✅ | ✅ |
| feature `erp_purchases` (compras) | — | ✅ | ✅ |
| feature `erp_pricing` (tabelas extras e faixas por quantidade) | — | ✅ | ✅ |
| feature `erp_reports` (relatórios além do resumo do Início) | — | ✅ | ✅ |

Limite → 403 `PLAN_LIMIT_REACHED`; feature → 403 `FEATURE_NOT_IN_PLAN`. Rebaixar não apaga nada: tabelas extras param de ser aplicadas (vale o Varejo) e o PDV fica só leitura.

## Workstation

- Catálogo: app `erp` (preset `erp`, categoria `financeiro`, `pricing: { unit: "empresa", price: 79 }`); features `erp_*` e limites `erp…` pelo prefixo `erp` em `FEATURE_PREFIXES`.
- **Acesso** vem do papel (`hasErpAccess`), sem `AppAccess`; cobrança por empresa (sem assento: `countsSeat` falso).
- `registerAppRoutes('erp', ['/v1/erp'])`, `registerAppActivation('erp', seedErp)`.

## Acessos no convite (`registerMemberAccess('erp', …)`)

O registro é da base (`skills/backend/references/10-acessos-por-pessoa.md`): a tela de convite e a de "Acessos da pessoa" desenham estes campos sem conhecer o app; `read` lê do `ErpRole` (nunca de uma cópia) e `apply` é idempotente.

| Campo | Tipo | Padrão | Aplica |
|---|---|---|---|
| `roles` | multiselect "Papéis no ERP" (`ERP_ADMIN`, `SELLER`, `STOCK`, `CASHIER`, `VIEWER`) | `["SELLER"]` | `ErpRole.roles` |

- `canGrant`: `ERP_ADMIN` ou owner dão qualquer papel; o admin da empresa sem papel no ERP dá `SELLER`, `CASHIER` e `VIEWER`, nunca `ERP_ADMIN`/`STOCK` (custo é dado sensível) — o que não pode vira pedido ao owner.
- `countsSeat`: não (por empresa).

## Integrações

| App | Integração |
|---|---|
| Financeiro | venda **entregue** → contas a receber (uma por parcela; categoria do Financeiro de chave `vendas` ("Vendas de produtos"); descrição com o código, ex.: "V-0012 · Parcela 1/3"; contato = cliente pelo documento); venda do PDV → lançamentos já baixados na conta "Caixa PDV" (dinheiro) ou "Recebimentos" (cartão/Pix), um por forma de pagamento; devolução → estorno ou crédito; compra **recebida** → contas a pagar (categoria de chave `mercadorias`, "Compra de mercadorias"); fiado (`ON_ACCOUNT`) → conta a receber em aberto no cliente (conta no limite de crédito) |
| Comercial | itens da proposta escolhidos dos produtos do ERP (preço da tabela); **proposta aceita** → pedido de venda `CONFIRMED` (reserva) com os itens e o plano de pagamento aceitos |
| CRM | com o ERP instalado, o catálogo de produtos do CRM passa a ser o do ERP (o CRM lê os produtos ativos); negócio ganho com itens → orçamento no ERP (opcional, configuração) |
| Uploads | fotos de produto, anexos de compra, CSV de importação |

Cada integração só aparece se o outro app estiver instalado e ligado; falha na integração não desfaz a venda (fica em "Integrações com problema" com tentar de novo, como no Comercial).

## Avisos

Tipos no catálogo do add-on `notificacoes` (`skills/notificacoes/references/04-catalogo.md`, seção "ERP"; frases em `notifications-lib` → `PRESET_TYPES` com `appId: "erp"`).

## Testes obrigatórios

- Sem papel → 403 `NOT_ERP_MEMBER` (com a workstation, o guard de app pode responder `APP_ACCESS_DENIED`); `SELLER` e `CASHIER` recebem `costCents: null`; `CASHIER` não cria produto; `SELLER` não vê o pedido de outro vendedor (404).
- Free: 51º produto → 403 `PLAN_LIMIT_REACHED`; abrir caixa sem `erp_pdv` → 403 `FEATURE_NOT_IN_PLAN`.
- Convite com `erp: { roles: ["SELLER", "CASHIER"] }` pelo owner → a pessoa entra com os dois papéis; admin da empresa pedindo `ERP_ADMIN` → vira pedido.
