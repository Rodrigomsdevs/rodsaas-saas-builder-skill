# 11 · Perfis de segmento (indústria: EPI e NR; saúde: registro no conselho; varejo: rodízio de folgas e folguista)

O Pessoas é **um só**; o perfil decide o que já vem ligado, as palavras e os modelos. Recurso que serve a mais de um segmento fica no núcleo (`10`).

## Onde fica

- `RhSettings.segment` da empresa (`GENERAL` · `INDUSTRY` · `HEALTH` · `RETAIL`), escolhido no onboarding da workstation (`peopleProfileFor`: indústria → `INDUSTRY`; saúde e odonto → `HEALTH`; comércio → `RETAIL`) ou na primeira abertura. Muda em `/pessoas/configuracoes` → Perfil (`rh-segment`).
- ★ `GET /v1/rh/segment` · ★ `PATCH /v1/rh/segment { segment }` (RH_ADMIN) aplica o perfil (`peopleSegment(id).on`) **sem desligar nada** → **`{ segment, words, on }`**.

## O que cada perfil liga

| Perfil | Liga | O que muda |
|---|---|---|
| `GENERAL` | — | — |
| `INDUSTRY` (fábrica, distribuidora, obra) | escala, treinamentos, EPI, NRs, comunicados | **ficha de EPI e treinamentos de NR** (abaixo); vocabulário "planta" |
| `HEALTH` (clínica, hospital, laboratório) | escala, treinamentos, registro no conselho, comunicados | **registro profissional com validade** (abaixo); vocabulário "profissional" |
| `RETAIL` (loja, rede, supermercado) | escala, rodízio de folgas, folguista, vagas, comunicados | **rodízio de folgas com domingo e folguista** (abaixo); vocabulário "loja" |

## Indústria: EPI e NR (`INDUSTRY`)

- Aplicar o perfil cria os treinamentos de **NR** do catálogo `NR_TRAININGS` (NR-05, NR-10, NR-11, NR-12, NR-33, NR-35 com a validade da reciclagem — **confira a norma vigente antes de portar**; é dado, não código) sem duplicar os que já existem.
- Catálogo de EPI: `POST /v1/rh/epis` **`{ name, ca, caExpiresOn, lifeDays? }`** (CA de 3 a 6 dígitos, validade do CA, vida útil em dias) → 201.
- ★ `POST /v1/rh/employees/:id/epi-deliveries` **`{ deliveredOn, items: [{ epiId, qty }], signature: true | signatureFileId }`** → 201: `validateEpiDelivery` — **CA vencido na data da entrega** (`CA_EXPIRED`), EPI sem CA, quantidade fora de 1–100, data no futuro e **sem assinatura da ficha** → 400 com `errors[].path` (`items.N.epiId`, `signature`). A ficha de EPI da pessoa (NR-06) sai em PDF com as entregas e as assinaturas.
- ★ `GET /v1/rh/epi-replacements` → **`{ data: [{ employee: { id, name }, epi: { id, name }, dueOn, overdue }] }`** (`epiReplacements`: a última entrega de cada EPI + vida útil, 15 dias antes).
- Tela: aba "EPI" na ficha (`rh-epi-delivery`), painel de trocas (`rh-epi-due` com `data-overdue`).

## Saúde: registro no conselho (`HEALTH`)

- ★ `PUT /v1/rh/employees/:id/council` **`{ council, number, uf, expiresOn?, required }`** (RH) → o registro com **`status`**: `validateCouncil` (conselho da lista `COUNCILS`, número, UF, data) → 400; `required` marca que o cargo exige registro.
- ★ `GET /v1/rh/councils?status=expired|expiring|missing|active` → **`{ data: [{ employee: { id, name }, council, number, uf, expiresOn, status, canAttend }] }`** (`councilStatus`, `canAttend`: quem exige registro e está vencido ou sem registro **não pode atender** — a Agenda deixa de oferecer o profissional e mostra o motivo ao RH).
- Job diário: aviso 30 dias antes do vencimento à pessoa e ao RH (`rh.training.expiring` com o tipo "registro").
- Tela: bloco "Registro profissional" na ficha (`rh-council` com `data-status`), painel de vencimentos.

## Varejo: rodízio de folgas e folguista (`RETAIL`)

- ★ `POST /v1/rh/day-off-rotation` **`{ employeeIds, start (segunda-feira), weeks (1–12), sundayEvery?, folguistaIds?, apply? }`** → **`{ daysOff: { [employeeId]: [datas] }, coverage: { [data]: [{ employeeId, coveredBy }] }, sundayGaps: [ids] }`** — `rotateDaysOff` (uma folga por semana girando o dia, **domingo a cada `sundayEvery` semanas**, padrão 3 — comércio: **confira a convenção coletiva**), `folguistaPlan` (o folguista cobre o posto de quem folga, um por dia, nunca na própria folga) e `sundayGaps`; `start` que não é segunda → 400. Com `apply: true` grava as folgas na escala (`kind: DAY_OFF`) — escalar alguém na folga passa a dar 409 `ON_LEAVE`.
- Tela: "Gerar rodízio" na escala (`rh-rotation`), prévia com os domingos destacados e quem cobre cada folga (`rh-rotation-cell` com `data-covered-by`).

## Testids

| testid | Onde |
|---|---|
| `rh-segment` | `/pessoas/configuracoes` → Perfil |
| `rh-schedule`, `rh-schedule-cell` (`data-employee`, `data-date`, `data-conflict`) | escala |
| `rh-candidate-card` (`data-stage`), `job-apply-form`, `job-apply-submit`, `job-apply-done` | vagas |
| `rh-announcement` (`data-acked`), `rh-announcement-ack` | comunicados |
| `rh-training-cell` (`data-status`) | treinamentos |
| `rh-celebration` (`data-type`) | Início |
| `rh-epi-delivery`, `rh-epi-due` (`data-overdue`) | indústria |
| `rh-council` (`data-status`) | saúde |
| `rh-rotation`, `rh-rotation-cell` (`data-covered-by`) | varejo |

## Testes obrigatórios

- Aplicar cada perfil liga o que ele pede sem desligar nada; indústria cria as NRs sem duplicar.
- EPI: CA vencido na entrega 400; sem assinatura 400; troca vencida no painel.
- Conselho: registro inválido 400; vencido não pode atender; vencendo avisa.
- Rodízio: domingo a cada 3 semanas; folguista cobre sem cobrir a própria folga; começo fora da segunda 400; aplicado bloqueia escalar na folga.
