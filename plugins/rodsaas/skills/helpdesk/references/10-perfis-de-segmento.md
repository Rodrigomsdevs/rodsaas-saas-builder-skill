# 10 · Perfis de segmento (assistência técnica, TI interno, software, condomínio)

O Suporte é **um só**. O perfil muda as palavras, as categorias com seus campos, o que vem ligado e os recursos de nicho. Mesma ideia dos perfis da Agenda e do CRM.

## Onde fica

- `HelpdeskSettings.segment` (`GENERAL` · `TECH_REPAIR` · `IT_INTERNAL` · `SOFTWARE` · `CONDO`), escolhido no onboarding da workstation (segmento → perfil: "Tecnologia e software" → `SOFTWARE`; os outros perguntam) ou na primeira vez que alguém abre o Suporte. Muda em Configurações → Perfil.
- ★ `GET /v1/helpdesk/settings` devolve **`segment`** e **`vocabulary`** (`{ ticket: [singular, plural], requester: [...] }`, `helpdeskSegment`); telas, portal e e-mails usam as palavras do perfil.
- ★ `PATCH /v1/helpdesk/settings { segment }` (owner/admin) **aplica** o perfil de forma idempotente: cria as **categorias** do perfil com os campos (`profileKey`; não duplica ao reaplicar), liga o que o perfil pede e devolve **`{ ...settings, applied: { categories } }`**. Trocar de perfil não apaga nada.

## O que cada perfil monta

| Perfil | Palavras | Categorias (campos) | Recursos |
|---|---|---|---|
| `GENERAL` | chamado · cliente | Dúvida, Problema | — |
| `TECH_REPAIR` | ordem de serviço · cliente | **Conserto** (defeito relatado*, senha do aparelho, acessórios), **Garantia** (OS anterior) | **ordem de serviço** com equipamento, orçamento com peças do ERP, aprovação do cliente pelo link, baixa das peças, **garantia** por número de série (abaixo) |
| `IT_INTERNAL` | chamado · colaborador | **Acesso** (sistema*), **Equipamento** (patrimônio, tipo*), **Compra** (valor estimado) | solicitantes são os **membros da empresa** (portal interno com login, sem e-mail de fora); **Compra** pede **aprovação** do gestor automaticamente; catálogo de serviços no portal |
| `SOFTWARE` | chamado · cliente | **Bug** (versão*, ambiente*, passos para reproduzir*), Dúvida, **Pedido de melhoria** (impacto) | **bug → tarefa** no Tarefas (abaixo); contrato de horas ligado por padrão |
| `CONDO` | ocorrência · morador | **Manutenção** (bloco, unidade*, local*), **Barulho ou convivência** (unidade*), **Encomenda** (unidade*) | moradores como contatos com bloco/unidade; despesa de manutenção pede **aprovação** do síndico; reserva de área comum pela Agenda quando instalada |

(* obrigatório)

## Assistência técnica: ordem de serviço

O chamado do perfil é uma **OS**: tem equipamento, status próprio e orçamento.

| Rota | Faz |
|---|---|
| ★ `POST /v1/helpdesk/tickets` | aceita **`equipment: { type, brand?, model?, serial?, accessories?, condition? }`** (`validateEquipment`, 400 com `path`); com `serial`, `warrantyStatus` sobre as OS entregues: dentro do prazo → **`warranty: { inWarranty: true, until, orderId }`** na OS, etiqueta "garantia" e orçamento zerado por padrão |
| ★ `PUT /v1/helpdesk/tickets/:id/os-status` | **`{ status }`** pelo `OS_FLOW` (Recebido → Em diagnóstico → Aguardando aprovação → Em reparo → Pronto para retirada → Entregue; cancelar até o reparo) → 409 `INVALID_OS_TRANSITION`; **Pronto** avisa o cliente (e-mail/WhatsApp); **Entregue** grava `deliveredOn` e o prazo de garantia (`warrantyDays`, padrão 90) |
| ★ `PUT /v1/helpdesk/tickets/:id/quote` | **`{ items: [{ kind: "PART" \| "LABOR", productId?, description?, qty, unitCents, discountCents? }], validUntil? }`** → `validateQuote` → peça com `productId` do ERP (preço do cadastro quando não vem; estoque disponível conferido → 409 `INSUFFICIENT_STOCK`) → `quoteTotals` → **`{ quote: { items, totals, status: "DRAFT" } }`** |
| ★ `POST /v1/helpdesk/tickets/:id/quote/send` | manda ao cliente o link de aprovação (token) → OS em **Aguardando aprovação** |
| ★ `POST /v1/public/helpdesk/quotes/:token` | **`{ decision: "APPROVED" \| "REJECTED", comment? }`** → aprovado: OS vai para **Em reparo** e as peças ficam **reservadas** no ERP; reprovado: volta para diagnóstico com a nota |
| entrega | **Entregue** dá baixa das peças no ERP (movimento `OUT` com `refType: "SERVICE_ORDER"`, custo médio) e, com o Financeiro, cria a conta a receber do total; com o add-on `fiscal`, oferece a nota (NFS-e da mão de obra quando existir; NF-e das peças) |
| `GET /v1/helpdesk/tickets/:id/os-receipt` | comprovante de entrada (HTML A4/80 mm): cliente, equipamento, defeito, acessórios, termos ("aparelho não retirado em 90 dias…") e assinatura |

Tela da OS: cabeçalho com o status da OS (`hd-os-status`, `data-status`) e os botões do próximo passo; quadro do equipamento (`hd-equipment`); orçamento (`hd-quote`, linhas `hd-quote-item`, total `hd-quote-total`, enviar `hd-quote-send`); selo **Em garantia** (`hd-warranty`). Quadro `/suporte/os` em colunas por status da OS.

## Software: bug vira tarefa

★ `POST /v1/helpdesk/tickets/:id/task` **`{ projectId, title? }`** (Tarefas instalado; senão 409 `TASKS_NOT_INSTALLED`) → cria a tarefa (título = assunto, descrição = campos do bug + link do chamado), liga os dois (`taskId` no chamado, link no Tarefas) → **201 `{ task: { id, key, url } }`**; segunda vez → 409 `TASK_EXISTS`. Quando a tarefa vai para **Feito**, o chamado ganha a nota "Correção concluída na tarefa X" e o responsável é avisado (o atendente decide responder e resolver). Vários chamados podem apontar para a mesma tarefa (`{ taskId }` em vez de `projectId`).

## Testids

| testid | Onde |
|---|---|
| `hd-segment` | Configurações → Perfil |
| `hd-os-status` (`data-status`), `hd-equipment`, `hd-quote`, `hd-quote-item`, `hd-quote-total`, `hd-quote-send`, `hd-warranty` | OS (assistência técnica) |
| `hd-ticket-task` | chamado (software) |

## Testes obrigatórios

- Aplicar cada perfil: vocabulário, categorias com os campos certos, sem duplicar ao reaplicar, trocar não apaga.
- OS: equipamento obrigatório, fluxo da OS (pular etapa 409), orçamento com peça do ERP e mão de obra, aprovação do cliente pelo link (reserva), entrega com baixa no estoque, garantia pelo número de série.
- Bug → tarefa: cria e liga, segunda vez 409, tarefa feita deixa a nota no chamado.
