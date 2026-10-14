# 05 · Contratos

Feature `com_contracts` (Pro). Um contrato nasce de três jeitos: **da proposta aceita**, **do zero** (modelo `CONTRACT`) ou **existente** (já assinado fora, cadastrado com o PDF para controlar a vigência). As datas e a situação saem do `comercial-lib` (`contractTerm`, `contractStatus`, `renewTerm`, `readjust`).

## Situações

| Gravada (`status`) | Derivada (`contractStatus(c, hoje)`) | Significado | Onde aparece |
|---|---|---|---|
| `DRAFT` | `DRAFT` | rascunho, editável | Rascunhos |
| `IN_REVIEW` | `IN_REVIEW` | enviado para revisão interna/do cliente (link de leitura, sem assinatura) | Rascunhos |
| `AWAITING_SIGNATURE` | `AWAITING_SIGNATURE` | envelope em andamento | Aguardando assinatura |
| `SIGNED` | `SCHEDULED` | assinado, começa no futuro | Vigentes |
| `SIGNED` | `ACTIVE` | vigente | Vigentes |
| `SIGNED` | `EXPIRING` | dentro do aviso prévio, **sem** renovação automática | Vencendo |
| `SIGNED` | `RENEWING` | dentro do aviso (ou vencido) **com** renovação automática, aguardando o job | Vencendo |
| `SIGNED` | `ENDED` | passou do fim sem renovar | Encerrados |
| `CANCELED` | `CANCELED` | rascunho descartado | Todos |
| `TERMINATED` | `TERMINATED` | rescindido/encerrado antes do fim, com data e motivo | Encerrados |

`GET /v1/com/contracts?status=` filtra pela **derivada** (o serviço calcula `noticeDate`/`endDate` e filtra no SQL: `EXPIRING` = `status='SIGNED' AND NOT autoRenew AND hoje BETWEEN noticeDate AND endDate`, etc.).

## Vigência

- `contractTerm({ startDate, months, noticeDays })`: fim = início + meses − 1 dia (início 15/01 + 12 → 14/01 do ano seguinte; 31/01 + 1 → 28/02 ou 29/02, mantendo o dia âncora); aviso = fim − dias de aviso.
- `noticeDays` padrão = `ComSettings.contractNoticeDays` (30). O formulário mostra ao vivo: "Vigência: 01/11/2026 a 31/10/2027 · aviso prévio a partir de 01/10/2027".
- Recorrência do valor: única (`once`), mensal (`month`) ou anual (`year`); o detalhe mostra o **valor total do contrato** (mensal × meses) além do valor por período.

## Da proposta aceita

"Gerar contrato" na proposta aceita (ou no detalhe do negócio no CRM):

- Só aceita → 409 `PROPOSAL_NOT_ACCEPTED`.
- Partes: **contratante** = cliente do aceite (nome e documento **do aceite**, e-mail da proposta); **contratada** = a empresa (razão social e CNPJ de Configurações da empresa); o formulário permite intervenientes.
- Valor: mensal aceito se houver recorrente (recorrência `month`), senão o total avulso aceito (`once`); vigência padrão 12 meses a partir de hoje (editável).
- Modelo: o `CONTRACT` padrão; o texto é renderizado com as variáveis da proposta e do contrato (`07-modelos-e-pdf.md`) e fica **editável** no rascunho (o texto renderizado vira o `bodyHtml` do contrato; mudar o modelo depois pergunta "substituir o texto atual?").
- O contrato fica ligado (`proposalId`) e a proposta mostra "Contrato C-0003".

## Do zero

Modelo `CONTRACT` (ou em branco), partes (cada uma com papel, nome, CPF/CNPJ validado, e-mail), valor, recorrência, início, meses, aviso, renovação automática (+ meses da renovação, padrão = meses), índice de reajuste (texto livre: "IPCA", "IGP-M"). Variáveis faltando (`renderTemplate.missing`) aparecem em amarelo antes de enviar para assinatura ("Faltam: contrato.indice").

## Existente (já assinado)

`existing: { signedAt, fileId? }`: título, partes, valor, início, meses, aviso, renovação e o PDF (upload). Nasce `SIGNED`, `existing: true`, evento `CREATED` com "cadastrado como existente". Serve para trazer a carteira antiga: a importação em lote por CSV (título, cliente, documento, valor, recorrência, início, meses, aviso, renovação) cria vários de uma vez com o relatório de linhas com problema.

## Edição e travas

- `PATCH` só em `DRAFT`/`IN_REVIEW`; depois disso → 409 `CONTRACT_LOCKED`. Mudança em contrato assinado é **aditivo**.
- Ao enviar para assinatura, o `bodyHtml` é congelado (o envelope guarda o PDF e o SHA-256); cancelar o envelope devolve o contrato a `DRAFT` (o texto volta a ser editável).
- Envelope concluído → `status = SIGNED`, `signedAt`, `signedFileId` = PDF final, evento `SIGNED`.

## Renovação

- **Manual** (`POST /:id/renew`, qualquer situação assinada, inclusive `ENDED`): `renewTerm(c)` → novo período começando no dia seguinte ao fim, com `renewalMonths ?? months`; grava evento `RENEWED` `{ from: { startDate, endDate }, to: { startDate, endDate } }` e atualiza `endDate`. O contrato continua o mesmo (mesmo número).
- **Automática** (job `com.contracts.renew`, diário): contratos `autoRenew` com `endDate < hoje` → `renewTerm`, evento, aviso `com.contract.renewed` ao dono; idempotente (só renova se `endDate < hoje`).
- **Financeiro**: contrato recorrente ligado a recorrência no Financeiro → a renovação estende a recorrência até o novo fim (mesma chave `com:contract:<id>`).

## Reajuste

- `POST /:id/readjust { pct, effectiveDate? }` → `readjust(valueCents, pct)` (arredonda ao centavo: R$ 1.000,00 × 4,5% = R$ 1.045,00); evento `READJUSTED` `{ from, to, pct, index, effectiveDate }`; atualiza `valueCents`. `pct` entre −50 e 100 (400 `PCT_INVALID`).
- Aviso no aniversário do contrato (job `com.contracts.notice`): "C-0003 faz aniversário em 01/11: aplicar reajuste (IPCA)?" com o botão que abre o diálogo com o índice digitado.
- Financeiro: as próximas parcelas/recorrência em aberto a partir de `effectiveDate` passam ao novo valor (as já pagas não mudam).

## Aditivos

`POST /:id/amendments { title, templateId?, bodyHtml?, changes?: { valueCents?, endDate? } }`: documento `AMENDMENT` ligado ao contrato, com envelope próprio (mesmo fluxo de assinatura; signatários padrão = as partes do contrato). Concluído: evento `AMENDMENT` e, se `changes`, aplica o valor/fim no contrato. O detalhe lista os aditivos com o PDF de cada um.

## Encerramento

`POST /:id/terminate { date, reason }` (data ≥ início): `status = TERMINATED`, `terminatedAt`, motivo, evento; recorrência no Financeiro para depois da data (parcelas futuras em aberto canceladas, com confirmação mostrando quantas).

## Avisos de vencimento

Job `com.contracts.notice` (8 h): contratos que **entram hoje** no aviso prévio → `com.contract.expiring` (dono e `COM_ADMIN`) com "Renovar" / "Encerrar"; os com renovação automática recebem "C-0003 será renovado automaticamente em {data}". Uma vez por contrato e período (chave `notice:<id>:<endDate>`).

## Lista e detalhe

- Lista com abas Vigentes · Vencendo · Aguardando assinatura · Encerrados · Todos; colunas: código, título, contratante, valor (/mês), fim, situação, renovação; filtros por vendedor, índice, período de fim.
- Detalhe: dados, partes, vigência com barra de progresso (início → aviso → fim), texto/PDF, envelope (situação de cada signatário), aditivos, linha do tempo (`ComContractEvent`), proposta de origem, lançamentos no Financeiro.

## Testes obrigatórios

- `contractTerm`: 2026-11-01 + 12 meses → fim 2027-10-31, aviso 2027-10-01; contrato existente com fim daqui a 10 dias → `EXPIRING` (com `autoRenew` → `RENEWING`).
- Da proposta: só aceita (409 `PROPOSAL_NOT_ACCEPTED`); partes e valor do aceite.
- `PATCH` em contrato assinado → 409 `CONTRACT_LOCKED`.
- Renovar estende (`endDate` + 12 meses, evento `RENEWED`); job de renovação não renova duas vezes.
- Reajuste 100000 × 4,5% = 104500, evento com de/para.
- Encerrar → `TERMINATED` e lista "Encerrados".
