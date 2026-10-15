# 10 · Sinal no aceite, envio por WhatsApp, reajuste pelo Banco Central, catálogo do ERP e relatório de conversão

O que o vendedor pede depois de mandar a primeira proposta: **receber o sinal** na hora do aceite, **mandar pelo WhatsApp** (onde o cliente responde), **reajustar** o contrato pelo índice certo sem abrir o site do IBGE, **montar a proposta com os produtos do estoque** e saber **quantas propostas viram venda**. Tudo **núcleo** (vale para qualquer perfil; `11-perfis-de-segmento.md` decide o que já vem ligado). Regras no `comercial-lib` (seção "operação avançada"). Formatos ★ fazem parte do contrato (grupo `presets.comercial`).

## Modelo (somar ao `02-modelo.md`)

```prisma
// ComProposal ganha deposit Json? ({ pct?, amountCents?, dueDays? }), depositState Json? ({ amountCents, status, entryId, chargeId, paidAt }), erpOrderId String?
// ComProposalItem ganha source String? ("erp" | "crm"), productId String?
// ComContract ganha readjustFloorZero Boolean @default(true), autoReadjust Boolean @default(false), lastReadjustMonth String?
// ComSettings ganha segment, depositDefault Json?, contractAfterDeposit (false), erpOrderOnAccept (false), whatsappEnabled (true quando o add-on está)
model ComIndexValue { code String; month String; pct Decimal; source String; fetchedAt DateTime @default(now()); @@id([code, month]) }   // global (não é por empresa): cache do SGS
model ComMessage { id String @id @default(uuid()); orgId String; proposalId String?; envelopeId String?; signerId String?; channel String; to String; providerMessageId String?; status String; at DateTime @default(now()) }
```

## Sinal no aceite

- Proposta com **`deposit: { pct? | amountCents?, dueDays? }`** (`validateDeposit`: um dos dois; % de 0 a 100; centavos > 0 e não maiores que a base; prazo de 0 a 30 dias; 400 com `path: "deposit.*"`). A base é o **avulso** (sem avulso: a 1ª mensalidade; `depositBase`). O plano de pagamento passa a valer para o **restante** (`planAfterDeposit`).
- ★ No aceite (`POST /v1/public/com/proposals/:token/accept`), com os opcionais marcados: `depositAmount` → a resposta ganha **`deposit: { amountCents, status: "PENDING", payUrl } | null`**:
  - com o Financeiro e `fin_charges`: lança a receita "Sinal P-0001" (vencimento hoje + `dueDays`) e cria a **cobrança** (boleto/Pix/cartão; modo de teste com "simular") — `payUrl` é a página `/pagar/<token>` do Financeiro; a página da proposta aceita mostra **Pagar sinal** (`proposal-deposit-pay`);
  - sem o Financeiro: `status: "MANUAL"` e `payUrl: null` (o vendedor marca como recebido: `POST /v1/com/proposals/:id/deposit/received`).
- Pagamento confirmado (webhook do Financeiro) → `depositState.status = "PAID"`, `paidAt`, aviso `com.deposit.paid` ao dono da proposta. ★ A visão da proposta mostra **`deposit: { amountCents, status, payUrl, paidAt } | null`**.
- `contractAfterDeposit` ligado: contrato a partir da proposta com sinal não pago → 409 **`DEPOSIT_PENDING`**.

## Envio por WhatsApp (add-on `whatsapp`)

- ★ `POST /v1/com/proposals/:id/send` aceita **`{ channel: "whatsapp", phone? }`** (padrão: `client.phone`): mesmo fluxo do envio (aprovação, validade, token) e a mensagem sai pelo **motor de WhatsApp** (`whatsapp.send`, `ref: { app: "comercial", entity: "proposal", id }`) com o texto de `whatsappProposalText` (primeiro nome, empresa, código, valores, validade e o link). Telefone inválido → 400 `path: "phone"`, `code: "PHONE_INVALID"` (`toE164Br`); WhatsApp não conectado → 409 **`WHATSAPP_NOT_CONNECTED`** (nada é enviado e a proposta continua rascunho); fora da janela de 24 h vai o modelo de sistema `proposta_enviada` ("Olá {{1}}, a {{2}} enviou a proposta {{3}}: {{4}}" — primeiro nome, empresa, código, link; criado aprovado na conexão do motor).
- A proposta registra o envio (**`messages: [{ channel, to, status, at }]`** na visão) e o vendedor vê "entregue/lida" quando o motor informa.
- Signatário: ★ `POST /v1/com/envelopes/:id/signers/:signerId/whatsapp` manda o link de assinatura dele pelo WhatsApp (modelo `assinatura_link` fora da janela; o código de 6 dígitos continua só por e-mail); signatário sem telefone → 400 `path: "phone"`. Resposta do cliente no WhatsApp cai na caixa do motor ligada à proposta.

## Reajuste pelo índice do Banco Central

- Índices: **`INDEX_SERIES`** (IPCA 433, IGP-M 189, INPC 188, IGP-DI 190 — séries mensais do SGS). O job `com.indexes.fetch` (dia 15, 9 h) busca os últimos meses (`sgsUrl`, `parseSgs`; o SGS devolve `data` DD/MM/AAAA e `valor` texto) e grava no cache global `ComIndexValue`. SGS fora do ar → o job tenta de novo no dia seguinte; o `COM_ADMIN` pode lançar o mês à mão.
- ★ `GET /v1/com/indexes/:code` **`?from=AAAA-MM&to=AAAA-MM`** → **`{ code, series: [{ month, pct, source }] }`**; ★ `PUT /v1/com/indexes/:code` (`COM_ADMIN`) **`{ series: [{ month, pct }] }`** (lançamento manual: `source: "manual"`; o SGS não sobrescreve o manual).
- ★ `POST /v1/com/contracts/:id/readjust` aceita, além de `{ pct }`, **`{ index?, month? }`**: índice do contrato (`readjustIndex`) ou o informado; mês do reajuste = o informado ou o próximo aniversário (`anniversaryMonth`); **`accumulatedIndex`** dos 12 meses anteriores (encadeado, 4 casas); `readjustFloorZero` (padrão ligado) não deixa a deflação reduzir o valor. Mês faltando → 409 **`INDEX_UNAVAILABLE`** com `missing`; o mesmo mês duas vezes → 409 `ALREADY_READJUSTED`. → contrato com o evento **`READJUSTED: { index, pct, rawPct, from, to, valueBefore, valueAfter }`**; com o Financeiro, as recorrências futuras do contrato passam ao valor novo.
- `autoReadjust`: o job do aniversário aplica sozinho quando o índice do mês anterior já saiu e avisa `com.contract.readjusted` (dono e `COM_ADMIN`); sem índice, avisa que está pendente.

## Catálogo do ERP

- ★ `GET /v1/com/catalog` **`?q=`** → **`{ data: [{ source: "erp" | "crm", productId, name, sku, unit, unitCents, available }] }`**: produtos vendáveis do ERP (preço da tabela padrão, saldo disponível) e do CRM; sem ERP, só os do CRM.
- Item da proposta com **`source: "erp", productId`**: sem `unitCents`, o preço vem do ERP; `unit` e descrição também (editáveis). Produto inexistente → 400 `items.N.productId`.
- `erpOrderOnAccept` ligado: no aceite, os itens do ERP viram um **pedido no ERP** para o cliente (cadastro pelo documento do aceite, criado se não existir), confirmado (reserva o estoque) quando há saldo; sem saldo fica orçamento e o vendedor é avisado. ★ A visão da proposta mostra **`erpOrder: { id, code, status } | null`**.

## Relatório de conversão

- ★ `GET /v1/com/reports/conversion` **`?from&to&ownerId?`** (`com_reports`) → **`{ sent, viewed, accepted, rejected, expired, open, conversionPct, viewRatePct, avgDaysToAccept, avgTicketCents, acceptedCents, avgDiscountAcceptedPct, bySeller: [{ sellerId, name, ...os mesmos }] }`** (`conversionReport`: propostas **enviadas** no período; taxa = aceitas ÷ decididas (aceitas + recusadas + vencidas); ticket com a mensalidade × 12; `SELLER` só vê a dele).
- Tela `/comercial/relatorios` com o funil (`com-conversion`, `com-conversion-seller` com `data-seller`).

## Planos, avisos e erros

Feature nova `com_reports` (Pro e Business); sinal, WhatsApp, catálogo e reajuste por índice dentro de `com_proposals`/`com_contracts`; WhatsApp exige o add-on `whatsapp`; a cobrança do sinal exige o Financeiro com `fin_charges`. Avisos novos: `com.deposit.paid`, `com.contract.readjusted`. Erros novos: `DEPOSIT_PENDING`, `WHATSAPP_NOT_CONNECTED`, `INDEX_UNAVAILABLE`, `ALREADY_READJUSTED` (409), `PHONE_INVALID`, `DEPOSIT_INVALID` (400).

## Testes obrigatórios

- Sinal: validação; 30% do avulso com opcionais marcados no aceite; cobrança no Financeiro e pagamento simulado marcando `PAID`; contrato antes do sinal → 409 com `contractAfterDeposit`.
- WhatsApp: telefone inválido 400; sem conexão 409 e nada enviado; enviado pelo motor com o link no texto e o `ref`.
- Reajuste: série manual; 12 meses encadeados; mês faltando 409; deflação não reduz; mesmo mês duas vezes 409.
- Catálogo: produto do ERP com preço da tabela; item com o preço do ERP; pedido no ERP no aceite.
- Conversão: números de um cenário conhecido; vendedor só vê a dele.
