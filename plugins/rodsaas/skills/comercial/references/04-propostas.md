# 04 · Propostas

Do rascunho ao aceite. Todas as contas são do `comercial-lib` portado (`api/src/modules/comercial/lib/`); o front só mostra o que o servidor devolve (a prévia ao vivo do editor usa a **mesma** lib importada no front, e o servidor recalcula ao salvar — o número salvo é sempre o do servidor).

## Ciclo de vida

```
DRAFT ──(desconto acima do limite)──► PENDING_APPROVAL ──approve──► DRAFT (aprovada) ──send──► SENT ──(cliente abre)──► VIEWED
  │                                        └──reject (comentário)──► DRAFT (com o motivo)          │                         │
  └──send──────────────────────────────────────────────────────────────────────────────────────────┘                         │
SENT/VIEWED ──accept──► ACCEPTED (imutável)        SENT/VIEWED ──reject (motivo)──► REJECTED
SENT/VIEWED ──validUntil < hoje──► EXPIRED          qualquer não decidida ──cancel──► CANCELED
SENT/VIEWED/EXPIRED/REJECTED ──new-version──► SUPERSEDED (a nova versão nasce DRAFT, mesmo número)
```

- A situação é sempre `proposalStatus(p, hoje)` (fuso da empresa), nunca uma coluna gravada à mão: vencer não precisa de job.
- `canDecide` decide o que o cliente pode fazer; a página pública mostra a frase de cada código (abaixo).

## Editor

Página `/comercial/propostas/nova` e `/comercial/propostas/[id]/editar` (só `DRAFT`/`PENDING_APPROVAL`; senão a tela mostra "Proposta enviada — para mudar, crie uma nova versão" com o botão).

1. **Cliente**: buscar no CRM (contato/empresa; preenche nome, empresa, CPF/CNPJ, e-mail, telefone e liga `crmContactId`) ou digitar. Documento validado na hora (`documentType`; mostra "CPF"/"CNPJ" ao lado e formata com `formatDocument`); e-mail obrigatório para enviar.
2. **Título** (padrão "Proposta para {cliente}") e **vendedor** (só `COM_ADMIN` troca; `SELLER` é sempre ele mesmo).
3. **Itens** (tabela que vira cartões no celular; arrastar para reordenar):
   - descrição, detalhe (texto rico curto), quantidade (aceita "1,5"; até 3 casas), unidade (livre: "h", "un", "mês"), preço unitário (campo de moeda em centavos), desconto (alternar **%** / **R$**; nunca os dois — `DISCOUNT_INVALID`), recorrência (Avulso · Mensal · Anual), **opcional** (o cliente marca na página; com "já vem marcado").
   - "Adicionar do catálogo": produtos do CRM (se instalado) e itens usados nas últimas propostas.
   - subtotal da linha ao vivo (`lines[i].netCents`).
4. **Desconto geral** (% ou R$) — vale **só sobre o avulso**; a tela diz isso embaixo do campo.
5. **Totais** sempre visíveis (rodapé fixo): Avulso (bruto, descontos, total), Mensal, Anual e o desconto efetivo. Se `needsApproval` com a configuração disser que precisa, faixa amarela "Desconto de 22% acima do seu limite de 15% — vai para aprovação" (o `COM_ADMIN` não vê a faixa: as dele não precisam).
6. **Plano de pagamento** do avulso: À vista · Parcelado (2–60) · Entrada + parcelas; 1º vencimento; prévia do cronograma (`paymentPlan`), com o centavo da diferença na 1ª parcela. Sem avulso (só recorrentes) → o plano some. Recorrentes têm a frase "Cobrado mensalmente a partir de {data}" (data do 1º vencimento).
7. **Validade** (padrão: envio + `proposalValidityDays`; pode fixar uma data), **modelo de apresentação** (`PROPOSAL`; o padrão da empresa vem marcado), **observações** (aparecem para o cliente), **condições** (padrão: `ComSettings.defaultTerms`), **anexos** (uploads; PDF, imagem).
8. Salva sozinho (rascunho, debounce de 1 s, "Salvo" discreto); erros do servidor no campo pelo `path` (`items.2.qty`).
9. Botões: **Pré-visualizar** (abre a página como o cliente vê, sem registrar visualização), **Enviar** (abaixo) ou **Enviar para aprovação** quando precisa.

## Aprovação de desconto

- Ao salvar, o servidor roda `needsApproval(totals, settings)`; se `required` e quem salva não é `COM_ADMIN`: `approvalStatus = PENDING`, `approvalReasons` gravados, aviso `com.approval.requested` aos `COM_ADMIN`.
- Sem a feature `com_approvals` (Free): não existe aprovação — o vendedor fica limitado ao desconto máximo (salvar acima → 422 `DISCOUNT_ABOVE_LIMIT` com a mensagem do `needsApproval`).
- O admin vê em Início → "Para aprovar" e na proposta: itens, desconto efetivo, motivos, histórico do cliente (propostas anteriores e o que foi aceito). **Aprovar** (comentário opcional) ou **Recusar** (comentário obrigatório → 400 `COMMENT_REQUIRED`). Recusada volta a `DRAFT` com o comentário no topo do editor; aprovar libera o envio.
- Mudar itens/descontos de uma proposta aprovada recalcula: se ainda passa do limite e o desconto **aumentou**, volta a `PENDING`; se diminuiu, continua aprovada.
- `send` com `approvalStatus = PENDING` → 409 `NEEDS_APPROVAL` com `reasons`.

## Envio

`POST /v1/com/proposals/:id/send` (limite `comProposalsMonthly`, contado por **propostas enviadas no mês**, versões novas também contam):

1. Confere: rascunho (senão 409 `PROPOSAL_LOCKED`), sem aprovação pendente, `validateItems` ok, e-mail do cliente.
2. Grava `sentAt`, `validUntil` (se vazio), gera o token (32 bytes; `tokenHash` + `tokenEnc` + `ComProposalLookup`), renderiza o modelo e guarda o **SHA-256 do HTML enviado** no evento `SENT`.
3. E-mail ao cliente (se `sendEmail`, padrão sim): assunto "{empresa} enviou a proposta {código}", mensagem do vendedor, resumo (total avulso, mensal, validade) e o botão "Ver proposta" → `{painel}/proposta/<token>`; `reply-to` = e-mail do vendedor. Diálogo de envio mostra o e-mail que vai sair e o link para copiar (WhatsApp).
4. Evento no CRM (se ligada a um negócio): "Proposta P-0001 enviada (R$ X)"; o negócio pode mudar de etapa se a configuração do CRM mapear.

## Página pública `/proposta/[token]`

Sem login, sem casca, com a marca da empresa (logo, cor primária), mobile primeiro.

- Topo: logo, código e título, "Válida até 30/10/2026" (ou o aviso de situação), vendedor com e-mail.
- Corpo: o **modelo renderizado** (`html`) — capa, apresentação, escopo — e a tabela de itens com os **opcionais em caixas de marcar**; marcar/desmarcar recalcula os totais na tela (mesma lib) e o servidor recalcula no aceite.
- Totais, plano de pagamento (cronograma), observações, condições, anexos para baixar.
- Botões fixos no rodapé: **Aceitar proposta** e **Recusar**; "Tenho uma dúvida" (comentário → aviso `com.proposal.commented` ao vendedor; a resposta da tela interna aparece na página).
- Situações sem decisão possível (a página mostra a proposta com uma faixa e sem os botões):

| Código (`canDecide`) | Faixa |
|---|---|
| `ALREADY_DECIDED` (aceita) | "Proposta aceita por {nome} em {data}" + baixar PDF |
| `ALREADY_DECIDED` (recusada) | "Proposta recusada em {data}" |
| `PROPOSAL_EXPIRED` | "Esta proposta venceu em {data}. Fale com {vendedor} para receber uma nova." |
| `PROPOSAL_CANCELED` | "Esta proposta foi cancelada." |
| `PROPOSAL_SUPERSEDED` | "Há uma versão mais nova desta proposta." (o link novo chega por e-mail; não mostra o token novo) |

### Rastreio (feature `com_tracking`)

- A página cria um `session` aleatório (sessionStorage) e chama `GET ...?session=`: uma linha `ComProposalView` por sessão (IP, navegador); a **primeira** visualização grava `viewedAt` e avisa o vendedor (`com.proposal.viewed`), as seguintes não avisam de novo no mesmo dia.
- Com a aba visível, `ping` a cada 15 s soma `seconds` (no máximo 15 por ping; ignorado se a sessão não existe).
- Prévia interna e o vendedor logado abrindo o link **não** contam (cabeçalho de sessão do painel ou `?preview=1` com token interno).
- O detalhe mostra `viewSummary`: aberturas, sessões, tempo total de leitura, primeira e última; sem a feature, só "Aberta em {data}" (a primeira visualização sempre é registrada, porque muda a situação).

### Aceite

Diálogo: resumo do que está sendo aceito (itens marcados e totais), **nome completo**, **CPF ou CNPJ** (máscara automática), caixa "Li e concordo com a proposta e as condições", botão "Aceitar". O servidor, nesta ordem:

1. `canDecide` → 409 com o código (a tela troca para a faixa).
2. `validateAcceptance` → 400 com `errors` no campo.
3. Aplica `selectedOptionalIds` (ids que não são opcionais da proposta são ignorados), recalcula `proposalTotals` e o `paymentPlan` com o novo total.
4. Grava, numa transação com `SELECT … FOR UPDATE` (dois cliques não aceitam duas vezes): `acceptedAt`, `acceptance = { name, document (só dígitos), ip, userAgent, selectedOptionalIds, totals, paymentPlan, documentSha256 }` (hash do HTML renderizado com os opcionais marcados) e o evento `ACCEPTED`.
5. Depois do commit (fila; falha não desfaz o aceite): aviso ao vendedor e aos admins (`com.proposal.accepted`), e-mail de confirmação ao cliente com o PDF, integrações.

### Recusa

Motivo obrigatório (lista: preço, prazo, escolhemos outro fornecedor, não é o momento, outro + texto). Grava `rejectedAt`, `rejectionReason`; aviso `com.proposal.rejected`; anotação no negócio do CRM.

## Integrações no aceite

| App | Faz | Idempotência |
|---|---|---|
| **CRM** (negócio ligado) | marca o negócio como **ganho** com o valor aceito (avulso + 12 × mensal + anual, configurável) e a data; evento "Proposta aceita por {nome}" | chave `com-accept:<proposalId>` |
| **CRM** (sem negócio) | cria o contato/empresa pelo documento do aceite se não existir | idem |
| **Financeiro** (`onAcceptCreateReceivables`) | uma conta a receber por parcela do `paymentPlan` (descrição "P-0001 · Parcela 1/3", categoria "Vendas de serviços", contato criado/achado pelo documento) e, para os recorrentes, uma recorrência mensal/anual a partir do 1º vencimento; com `onAcceptCreateCharges`, a cobrança de cada uma | `externalRef = com:<proposalId>:<n>` |

Falha (app desligado no meio, erro de validação no outro app) → a proposta continua aceita, a integração vai para "Integrações com problema" (Início do admin) com o erro e **Tentar de novo**.

## Versões, encerrar, cancelar, duplicar

- **Nova versão** (`new-version`): copia tudo para `version + 1` em `DRAFT` (mesmo número, `previousId`), marca a anterior com `supersededById` (o link dela passa a responder `PROPOSAL_SUPERSEDED`). Não vale em proposta aceita (409 `ALREADY_DECIDED`). O detalhe mostra o seletor de versões com o que mudou (itens adicionados, removidos, preços).
- **Encerrar** (`expire`): `validUntil` = ontem; **mudar validade** (`validity`): data ≥ hoje (só se não decidida; reabre uma vencida).
- **Cancelar**: motivo; não vale em aceita.
- **Duplicar**: número novo, v1, `DRAFT`, para outro cliente (o cliente vem vazio).

## PDF

`GET /:id/pdf`: o mesmo HTML da página (sem botões), com cabeçalho/rodapé (código, página X de Y) — `07-modelos-e-pdf.md`. Aceita: inclui a caixa do aceite (nome, documento formatado, data, IP, SHA-256).

## Testes obrigatórios

- Totais: 2 × R$ 1.000 com 10% + 1,5 × R$ 200 com R$ 50 de desconto + opcional não marcado + recorrente mensal R$ 300 → avulso e mensal exatos; desconto geral só no avulso.
- Itens inválidos → 400 com `items.N.campo`; desconto % e R$ juntos → 400.
- Vendedor com 20% → `PENDING_APPROVAL`; enviar → 409 `NEEDS_APPROVAL`; admin recusa sem comentário 400; aprova → envia.
- Enviada: `PATCH` 409 `PROPOSAL_LOCKED`; página pública sem login devolve os itens e registra `viewedAt`.
- Aceite: documento inválido 400; ok → `ACCEPTED` com os totais do opcional marcado; aceitar de novo 409 `ALREADY_DECIDED`; `acceptance` com IP e `documentSha256`.
- Vencida → 409 `PROPOSAL_EXPIRED`; recusa sem motivo 400; nova versão → link antigo 409 `PROPOSAL_SUPERSEDED`, mesmo número, `version` 2.
- Integrações (CRM e Financeiro instalados): negócio ganho e contas a receber iguais ao cronograma; repetir o job não duplica.
