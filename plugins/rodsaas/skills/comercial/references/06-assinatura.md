# 06 · Assinatura eletrônica

Feature `com_signatures`, limite `comEnvelopesMonthly` (envelopes **enviados** no mês). Um **envelope** = um documento congelado (PDF + SHA-256) + signatários com ordem + eventos. Serve para contrato, aditivo ou PDF avulso.

## Base legal (o que a tela e o README dizem)

- **Assinatura eletrônica** (não é a digital com certificado ICP-Brasil): válida entre as partes que aceitam o meio — MP 2.200-2/2001, art. 10, §2º. Para entes públicos, a Lei 14.063/2020 classifica como "simples" ou "avançada" conforme as evidências; aqui: e-mail + código + nome + CPF/CNPJ + IP + horário + hash do documento.
- Documentos que exigem ICP-Brasil ou cartório (escritura de imóvel, alguns atos societários) **não** são o caso de uso; o diálogo de envio tem a linha "Assinatura eletrônica com validade jurídica entre as partes (MP 2.200-2/2001). Não substitui certificado ICP-Brasil quando a lei exigir."
- Não use "assinatura digital" nos textos (é outra coisa).

## Signatários e ordem

| Campo | Regra |
|---|---|
| `name`, `email` | obrigatórios; e-mail válido; o mesmo e-mail não pode aparecer duas vezes no envelope (400 `DUPLICATE_SIGNER`) |
| `role` | `SIGNER` (parte), `WITNESS` (testemunha), `APPROVER` (aprova o texto antes, normalmente o jurídico interno) |
| `document` / `requireDocument` | CPF/CNPJ exigido por padrão para partes e testemunhas (o signatário digita na hora; se veio preenchido, tem de bater — 400 `DOCUMENT_MISMATCH`) |
| `order` | inteiro ≥ 1; **mesma ordem = em paralelo**; a ordem seguinte só começa quando todos da anterior assinaram (`currentTurn`) |

- Padrão ao enviar um contrato: as partes do contrato em ordem 1 (contratada primeiro se "a empresa assina antes" estiver ligado em Configurações), testemunhas em ordem 2.
- Pelo menos 1 `SIGNER` (400 `NO_SIGNERS`); no máximo 20 signatários.
- O diálogo mostra a ordem como colunas ("1º: Ana, Bruno · 2º: Carla (testemunha)") com arrastar entre colunas.

## Enviar para assinatura

`POST /v1/com/contracts/:id/send-for-signature` (ou `POST /v1/com/envelopes` com um PDF avulso):

1. Contrato em `DRAFT`/`IN_REVIEW` (senão 409 `CONTRACT_LOCKED`), sem variáveis faltando (422 `MISSING_VARIABLES` com a lista) e sem envelope em andamento.
2. Gera o PDF do `bodyHtml` (`07-modelos-e-pdf.md`) → upload → `documentFileId`, **`documentSha256`** (do arquivo exato).
3. Cria `ComEnvelope` (`expiresAt` = agora + `expiresInDays ?? envelopeExpiryDays`), os `ComSigner` com token (32 bytes; `tokenHash` + `tokenEnc` + `ComSignerLookup`), eventos `CREATED` e `SENT`; contrato → `AWAITING_SIGNATURE`.
4. E-mail **só para quem está na vez** (`currentTurn`): "{remetente} da {empresa} enviou {título} para você assinar" + mensagem + botão "Revisar e assinar" → `{painel}/assinar/<token>`. Os das ordens seguintes recebem quando chega a vez deles.

## Página `/assinar/[token]`

Sem login, sem casca, marca da empresa, mobile primeiro.

1. `GET /v1/public/com/sign/:token` → registra `VIEWED` (uma vez por signatário por dia). Mostra título, empresa, o documento (`documentHtml` rolável ou o PDF), quem já assinou e quem falta.
2. Estados sem assinatura possível (faixa no topo, documento só leitura):

| Situação | Faixa |
|---|---|
| `canSignNow: false` + `waitingFor` | "Aguardando {nomes} assinarem primeiro. Você receberá um e-mail quando chegar sua vez." |
| `ALREADY_SIGNED` | "Você assinou em {data}." (+ baixar PDF se concluído) |
| envelope `COMPLETED` | "Documento concluído em {data}" + baixar PDF final + código de verificação |
| `REFUSED` | "Documento recusado por {nome} em {data}." |
| `CANCELED` | "Este documento foi cancelado pelo remetente." |
| `EXPIRED` | "O prazo para assinar terminou em {data}. Fale com {remetente}." |

3. **Assinar** (botão fixo no rodapé, habilitado com `canSignNow`): diálogo em 2 passos —
   - **Código**: "Enviamos um código de 6 dígitos para a***@empresa.com" (`POST .../code` → `{ sentTo }`; reenviar depois de 60 s, 429 antes). O e-mail tem só o código e o título (sem link, para não virar phishing).
   - **Confirmar**: código, nome completo (pré-preenchido, editável), CPF/CNPJ (se `requireDocument`), caixa "Li o documento e concordo em assiná-lo eletronicamente", botão "Assinar".
4. **Recusar**: motivo obrigatório → envelope `REFUSED`.

## Assinar (servidor)

`POST /v1/public/com/sign/:token/sign`, numa transação com `FOR UPDATE` no envelope:

1. `envelopeStatus` ≠ `IN_PROGRESS` → 409 `ENVELOPE_CANCELED` / `ENVELOPE_REFUSED` / `ENVELOPE_EXPIRED` (concluído → `ALREADY_SIGNED`).
2. `canSign(signerId, signers)` → 409 com o código (`NOT_YOUR_TURN`, `ALREADY_SIGNED`).
3. `checkOtp({ code, expected, createdAt: otpCreatedAt, now, attempts: otpAttempts })` comparando **hashes** (o banco só tem `otpHash`; compare `sha256(code)` com tempo constante) → 400 com o código; `INVALID_CODE` **incrementa** `otpAttempts` (commit mesmo com o erro); `TOO_MANY_ATTEMPTS` exige pedir outro código (novo código zera as tentativas).
4. Nome com 2+ palavras, documento válido e igual ao cadastrado (se havia), `agree: true` → 400 com `errors`.
5. Grava `status = SIGNED`, `signedAt`, `signedName`, `signedDocument`, `ip`, `userAgent`; apaga `otpHash`; evento `SIGNED`.
6. Se a ordem atual terminou: e-mail para a próxima ordem. Se **todos** assinaram: conclusão (abaixo).
7. Resposta `{ status: "SIGNED", envelopeStatus }`.

Com `requireSignerCode = false` (Configurações, só `COM_ADMIN`, com aviso de que enfraquece a prova) o passo do código some e o evento `SIGNED` registra "sem código".

## Conclusão: PDF final, manifesto e verificação

1. **Manifesto** (folha de assinaturas): página(s) A4 com logo da empresa, título, `documentSha256`, data de conclusão e, para cada signatário, nome, e-mail, papel, documento formatado, data/hora de Brasília, IP; depois a linha do tempo (`manifestLines(events)`: criou, enviou, abriu, recebeu o código, assinou…); rodapé "Verifique em {painel}/verificar/{código}" + QR code do link.
2. **PDF final** = PDF enviado (bytes originais, sem regerar) + folha de assinaturas, unidos com `pdf-lib` (`PDFDocument.load` + `copyPages`), metadados (título, produtor "{App}", data). Grava `finalFileId`, **`finalSha256`** (do arquivo final) e `verificationCode = verificationCode(finalSha256)`.
   - O código vai **no manifesto**, mas o hash final é do arquivo com o manifesto: gere o manifesto com o código calculado a partir do **`documentSha256` + id do envelope** (`verificationCode(sha256(documentSha256 + envelopeId))`), grave esse código; e guarde `finalSha256` do arquivo pronto. Em `ComVerification`: `code` → envelope e `sha256 = finalSha256` (as duas buscas funcionam).
3. Envelope `COMPLETED`, `completedAt`; evento `COMPLETED`; contrato `SIGNED` (`signedAt`, `signedFileId`); aviso `com.envelope.completed`.
4. E-mail para **todos** os signatários e o remetente com o PDF final anexado (até 10 MB; maior → link de download de 30 dias) e o código.

## Verificação pública `/verificar/[codigo]`

- Por código: `GET /v1/public/com/verify/:code` (aceita minúsculas e sem hífen; normaliza para `XXXX-XXXX-XXXX`).
- Por arquivo: a página `/verificar` tem "Enviar o PDF": o navegador calcula o SHA-256 com `crypto.subtle.digest` (o arquivo **não sobe**) e chama `POST /v1/public/com/verify { sha256 }`.
- Encontrado → selo "Documento válido": título, concluído em, SHA-256, signatários (nome, papel, data/hora). Não mostra e-mail, documento completo nem IP (privacidade). Não encontrado → 404 `NOT_FOUND` e a página diz "Nenhum documento assinado com este código/arquivo. Se o arquivo foi alterado (até reimpresso), o hash muda."
- Rate limit: 30/min por IP.

## Lembretes, prazo, cancelamento

- Job `com.envelopes.remind` (10 h): a cada `reminderEveryDays` (padrão 3) desde o último envio/lembrete, e-mail a quem está na vez e não assinou (evento `REMINDED`); para nos envelopes concluídos/cancelados/recusados/vencidos. Lembrar agora (`POST /:id/remind`): no máximo 1 por signatário por hora (429).
- Vencimento: `expiresAt` passou → `envelopeStatus` responde `EXPIRED`; o job grava `status = EXPIRED`, avisa o remetente (`com.envelope.expired`) e devolve o contrato a `DRAFT`. "Reenviar" cria um envelope novo (o antigo fica no histórico).
- Cancelar (`POST /:id/cancel`, motivo opcional): `canceledAt`, evento `CANCELED`, links param (a página mostra a faixa), e-mail avisando quem já assinou; contrato → `DRAFT`. Concluído não cancela (409 `ALREADY_COMPLETED`).
- Recusa: envelope `REFUSED`, contrato → `DRAFT`, aviso `com.envelope.refused` com o motivo; e-mail a quem já assinou.

## Detalhe interno do envelope

Situação, prazo, signatários por ordem com situação (Aguardando a vez · Na vez · Abriu · Assinou {data} · Recusou), **copiar link** de cada um (para WhatsApp; o código continua indo só por e-mail), lembrar, cancelar, linha do tempo, baixar o PDF enviado e o final, o código de verificação.

## Segurança

- Token por signatário (nunca reutilizado entre signatários); o link sozinho **não assina** (precisa do código do e-mail dele).
- Código: 6 dígitos de `crypto.randomInt`, só o hash no banco, 10 min, 5 tentativas, 1 envio por minuto, 10 por hora por signatário.
- Páginas públicas sem dados internos (sem ids de usuário, sem outros envelopes); `emailMasked` (a***@dominio).
- Evidências gravadas no servidor (IP do `X-Forwarded-For` confiável da base, `User-Agent`, horário do servidor em UTC; exibição em Brasília).

## Testes obrigatórios

- A e B em ordem 1 e testemunha em ordem 2: testemunha antes → 409 `NOT_YOUR_TURN`; A e B em qualquer ordem entre si.
- Código errado → 400 `INVALID_CODE` e `otpAttempts` + 1; 6ª tentativa → `TOO_MANY_ATTEMPTS`; código vencido → `CODE_EXPIRED`; assinar sem pedir código → `CODE_NOT_SENT`.
- Assinatura com o código lido do e-mail (Mailpit); último a assinar → `COMPLETED`, `finalSha256` (64 hex) e `verificationCode` no formato.
- Verificação por código e por `sha256` → `valid: true` com os signatários; código inexistente 404.
- Recusa → `REFUSED` e contrato `DRAFT`; cancelado → assinar 409 `ENVELOPE_CANCELED`.
- Sem `com_signatures` → 403 `FEATURE_NOT_IN_PLAN`.
