# 01 · Motor e drivers

Módulo `api/src/modules/fiscal/`: `lib/` (porte do `scripts/fiscal-lib.mjs` com os testes), `service.ts` (`fiscal.issue`, eventos), `numbering.ts`, `drivers/` (registro + `fake.ts`), `queue.ts`. Variável nova: `FISCAL_ENCRYPTION_KEY` (32 bytes em base64; AES-256-GCM para certificado, senha, token e CSC).

## Modelo de dados (Prisma)

```prisma
model FiscalIssuer {            // um por empresa
  orgId            String   @id
  cnpj             String               // só dígitos, isValidCnpj
  legalName        String
  tradeName        String?
  ie               String               // ou "ISENTO"
  im               String?              // inscrição municipal (NFS-e)
  uf               String
  cityCode         String               // IBGE, 7 dígitos
  address          Json                 // { street, number, complement?, district, city, cityCode, uf, zip }
  regime           FiscalRegime         // SIMPLES | SIMPLES_EXCESSO | NORMAL
  environment      Int      @default(2) // 2 homologação · 1 produção
  driver           String   @default("fake")
  credentialsEnc   String?              // JSON criptografado do driver (certificado A1 + senha, token…)
  nfceCscIdEnc     String?
  nfceCscEnc       String?
  series           Json     @default("{\"55\":1,\"65\":1}")
  cancelWindowMin  Json     @default("{\"55\":1440,\"65\":30}")
  nfceIdentifyAboveCents Int @default(1000000)
  ibsCbsMode       String   @default("AUTO")   // AUTO (ibsCbsRequired) | ALWAYS | OFF
  updatedAt        DateTime @updatedAt
}
model FiscalSequence {          // numeração sem buraco
  orgId  String
  model  Int
  series Int
  next   Int    @default(1)
  @@id([orgId, model, series])
}
model FiscalRule {
  id        String  @id @default(uuid())
  orgId     String
  name      String
  when      Json    // { operation?, destination?, consumerFinal?, regime?, ncmPrefix? }
  set       Json    // { cfop, csosn? | cst?, icmsRate?, icmsReductionPct?, icmsCreditRate?, ipiRate?, pisCst, pisRate, cofinsCst, cofinsRate, ibsCbs? }
  review    Boolean @default(false)       // regime normal: criada para o contador revisar; não emite enquanto true
  active    Boolean @default(true)
  position  Int
}
model FiscalDocument {
  id             String   @id @default(uuid())
  orgId          String
  model          Int                      // 55 | 65 (NFS-e entra como "NFSE" no Financeiro)
  series         Int
  number         Int
  key            String                   // 44 dígitos; muda só o tpEmis na contingência
  code           String                   // cNF
  emissionType   Int      @default(1)     // 1 normal · 9 contingência offline NFC-e
  environment    Int
  status         FiscalStatus             // DRAFT PROCESSING AUTHORIZED REJECTED DENIED CONTINGENCY CANCELED
  natureOfOperation String @default("VENDA")
  operation      String   @default("SALE")
  issuer         Json                     // retrato do emitente na emissão
  recipient      Json?
  lines          Json                     // itens já calculados (regra aplicada, impostos)
  totals         Json
  payments       Json     @default("[]")
  additionalInfo String?
  xml            String                   // sem assinatura; o autorizado (procNFe) fica em authorizedXml
  authorizedXml  String?
  qrCodeUrl      String?
  protocol       String?
  authorizedAt   DateTime?
  rejectionCode  Int?
  rejectionMessage String?
  lastError      String?
  attempts       Int      @default(0)
  refApp         String?
  refEntity      String?
  refId          String?
  canceledAt     DateTime?
  cancelJustification String?
  cancelProtocol String?
  idempotencyKey String?
  createdById    String?
  createdAt      DateTime @default(now())
  events         FiscalEvent[]
  @@unique([orgId, model, series, number])
  @@unique([key])
  @@index([orgId, status, createdAt])
  @@index([orgId, refApp, refId])
}
model FiscalEvent {            // cancelamento e cartas de correção
  id         String  @id @default(uuid())
  documentId String
  type       String  // CANCEL | CORRECTION
  sequence   Int     @default(1)
  text       String
  protocol   String?
  at         DateTime @default(now())
}
model FiscalVoid {             // inutilização
  id String @id @default(uuid())
  orgId String
  model Int
  series Int
  from Int
  to Int
  justification String
  protocol String?
  at DateTime @default(now())
}
```

## `fiscal.issue()` (o único caminho — API e apps)

Numa transação:

1. Emitente configurado (senão 409 `ISSUER_NOT_CONFIGURED`); feature e limite do plano.
2. Destino (`destinationOf`), e para cada item: `pickTaxRule({ operation, destination, consumerFinal, regime, ncm }, regras ativas)` → sem regra → 422 `NO_TAX_RULE` com `items.N`; regra `review` → 422 `RULES_NEED_REVIEW`. CFOP digitado pelo usuário só se `cfopMatches` (senão o da regra). IBS/CBS: `ibsCbsMode` AUTO usa `ibsCbsRequired(regime, hoje)`; a regra traz `ibsCbs` (padrão `IBS_CBS_2026`).
3. Desconto e frete da nota rateados por `allocate` sobre o bruto de cada item; `itemTaxes`; `documentTotals`.
4. `validateDocument(doc, { nfceIdentifyAboveCents, requireIbsCbs })` → 400 com `errors` (`path`, `code`, `message`). **Nada foi numerado ainda.**
5. Número: `SELECT … FOR UPDATE` em `FiscalSequence`, `nextNumber(next, faixas inutilizadas)`, grava `next = número + 1`. Nunca `max()+1`.
6. `numericCode(número)`, `accessKey`, `buildXml`; NFC-e: `nfceQrCodeUrl` com o CSC do emitente (driver falso: CSC de teste).
7. Grava `PROCESSING` e enfileira `fiscal.transmit` (o driver falso responde na hora; a API espera até 5 s pelo resultado para devolver o status final — provedor lento devolve `PROCESSING` e a tela acompanha).

`Idempotency-Key` obrigatório no `POST`: clique duplo não gasta dois números. Um app (`ref`) com nota ativa (`PROCESSING`, `AUTHORIZED`, `CONTINGENCY`) → 409 `ALREADY_INVOICED`.

## Transmitir (`fiscal.transmit`)

`driver.authorize(doc, { xml, credentials })` → resultado normalizado:

| Driver diz | Motor faz |
|---|---|
| `AUTHORIZED` (100/150) | `AUTHORIZED`, `protocol`, `authorizedAt`, `authorizedXml`; avisa o app (`onAuthorized`) |
| `REJECTED` (código) | `REJECTED`, `rejectionCode`, `rejectionMessage` = `sefazResult(código).message` (+ o texto do provedor); notificação `fiscal.rejected`. Corrigir (`PATCH`) e reenviar usa **o mesmo número** |
| `DENIED` (110/301/302) | `DENIED` (número usado para sempre; não cancela, não reenvia) |
| `UNAVAILABLE` (108/109, timeout, 5xx) | NFC-e: **contingência offline** — mesma série e número, `emissionType 9`, chave nova (`accessKey` com tpEmis 9), XML e QR de novo, status `CONTINGENCY`, DANFE com "EMITIDA EM CONTINGÊNCIA"; a fila tenta de novo (5 min, 15 min, 1 h…) até autorizar (prazo legal: transmitir em até 24 h; notificação `fiscal.contingency` se passar de 12 h). NF-e: fica `PROCESSING` com `lastError`, nova tentativa na fila; notificação depois de 3 tentativas. (Contingência SVC da NF-e fica para o driver nativo.) |
| `PROCESSING` (assíncrono) | fica `PROCESSING`; `driver.status()` pela fila ou o webhook do provedor |

Transições sempre por `canTransition` (409 `INVALID_TRANSITION`).

## Eventos

- **Cancelar**: `cancelCheck({ status, model, authorizedAt, justification, windowMinutes: cancelWindowMin[model] })` → `driver.cancel` → `CANCELED`, `FiscalEvent CANCEL`; o app é avisado (`onCanceled`: o ERP **não** estorna a venda sozinho — a tela pergunta).
- **Carta de correção**: `correctionCheck({ …, previousCount })` → `driver.correct(doc, texto, sequência)` → `FiscalEvent CORRECTION`. Não corrige valores, impostos, destinatário nem data (avise isso na tela).
- **Inutilizar**: `voidCheck({ from, to, used: números já gravados na série, justification })` → `driver.voidRange` → `FiscalVoid`; a numeração passa a pular a faixa (`nextNumber`).

## Contrato do driver

```ts
interface FiscalDriver {
  id: string;                         // validateDriver
  name: string;                       // "Teste (simulado)", "Focus NFe", "SEFAZ direta"…
  capabilities: { nfe?: boolean; nfce?: boolean; nfse?: boolean; contingency?: boolean; correction?: boolean; void?: boolean; xml?: boolean; danfe?: boolean };
  credentialFields: { key: string; label: string; type: "text" | "password" | "file" }[];   // a tela monta os campos
  connect?(issuer, credentials): Promise<{ ok: true } | { ok: false; message: string }>;
  authorize(doc, ctx): Promise<{ result: "AUTHORIZED" | "REJECTED" | "DENIED" | "UNAVAILABLE" | "PROCESSING"; code?: number; message?: string; protocol?: string; authorizedAt?: string; xml?: string }>;
  status(doc, ctx): Promise<same>;
  cancel(doc, justification, ctx): Promise<{ ok: boolean; code?: number; message?: string; protocol?: string; unavailable?: boolean }>;
  correct?(doc, text, sequence, ctx): Promise<{ ok: boolean; protocol?: string; message?: string }>;
  voidRange?(range, ctx): Promise<{ ok: boolean; protocol?: string; message?: string }>;
  webhook?(raw, headers, ctx): Promise<{ documentKey: string; result: … }[]>;                 // provedores assíncronos
}
```

Registro: `registerFiscalDriver(d)` roda `validateDriver(d)` no boot (erro derruba o boot). **A mesma bateria de contrato** (`drivers/contract.test.ts`: autoriza, rejeita, cancela no prazo, corrige, inutiliza, cai e volta) roda contra cada driver — o falso sempre; os reais no modo homologação com credenciais de teste quando existirem.

## Driver falso (`fake`)

Responde na hora, sem rede. Regras fixas (o `/rodsaas:verify` depende delas):

| Situação | Resposta |
|---|---|
| algum item com NCM `00000000` | `REJECTED` 778 "NCM inexistente" |
| nome do destinatário começando com `DENEGAR` | `DENIED` 302 |
| "SEFAZ fora" ligado (`POST /v1/fiscal/fake/outage { on: true }`) | `UNAVAILABLE` 108 em autorizar e cancelar |
| o resto | `AUTHORIZED` 100, protocolo `1` + 14 dígitos, `authorizedAt` agora |
| cancelar/corrigir/inutilizar | `ok` com protocolo (135/102) |

`/v1/fiscal/fake/*` só existe com o driver falso ativo e fora de produção (senão 404). CSC de teste: id `1`, valor `TESTE-CSC-RODSAAS`.

## Como escrever os drivers reais (quando o usuário escolher)

- **Provedores (Focus NFe, NFE.io, PlugNotas, Nuvem Fiscal…)**: recebem JSON (ou o XML) e assinam do lado deles com o certificado enviado uma vez; quase todos são assíncronos (webhook ou consulta). O driver traduz `doc.lines/totals` para o formato do provedor, guarda o id do provedor em `protocol` até autorizar, e mapeia os códigos de retorno para `REJECTED`/`DENIED`/`UNAVAILABLE`. Leia a documentação atual de cada um antes; credenciais: token por ambiente.
- **SEFAZ direta (`sefaz`)**: assinatura XMLDSig do `infNFe` com o certificado A1 (PFX + senha), SOAP 1.2 com TLS mútuo nos web services do autorizador da UF (próprio ou SVRS/SVAN), serviços `NFeAutorizacao4`/`NFeRetAutorizacao4`/`NFeRecepcaoEvento4`/`NFeInutilizacao4`/`NFeStatusServico4`/`NFeConsultaProtocolo4`, contingência SVC-AN/SVC-RS para NF-e e offline para NFC-e; validação com os XSDs oficiais antes de enviar. Endereços e versões mudam por nota técnica: buscar no Portal Nacional da NF-e na hora de escrever.
- **NFS-e**: o Financeiro usa este motor com `model: "NFSE"`, regras de ISS por serviço (código de tributação nacional, alíquota, retenção) e um driver do padrão nacional (ou de provedor). O contrato do driver é o mesmo (`authorize`, `cancel`, `status`); chave, CFOP e QR são da NF-e e não se aplicam.
