# 09 · Perfis de segmento (B2B, imobiliária, escola, varejo)

O CRM é **um só**. O que muda por segmento é o **perfil**: as palavras das telas, o funil que nasce, os campos, as mensagens prontas, a sequência e as automações sugeridas e o que o menu destaca. Recurso que serve a mais de um segmento entra no núcleo (`08`); o perfil só decide se ele já vem montado. Mesma ideia dos perfis da Agenda (`skills/agenda/references/09-perfis-de-segmento.md`).

## Onde fica

- `CrmSettings.segment` (`GENERAL` · `B2B` · `REAL_ESTATE` · `EDUCATION` · `RETAIL`), escolhido no onboarding da workstation (o segmento da empresa vira o perfil pelo `crmProfileFor` do `workstation-lib`) ou na primeira vez que alguém abre o CRM ("Como você vende?"). Muda depois em Configurações → Perfil.
- Regras e textos vêm do `crm-lib` (`CRM_SEGMENTS`, `crmSegment`): ★ `GET /v1/crm/settings` devolve **`segment`** e **`vocabulary`** (`{ deal: [singular, plural], contact: [...], company: [...] }`); o front usa as palavras do perfil (`useCrmWords()`) em títulos, botões, vazios e e-mails do CRM — nunca "negócio" fixo.
- ★ `PATCH /v1/crm/settings { segment }` (owner/admin) **aplica** o perfil numa transação, de forma idempotente (cada item leva `profileKey = "<perfil>:<nome>"`; o que já existe não é recriado):
  - **funil** do perfil criado (nome e etapas com probabilidade e dias de alerta); vira o padrão só se o padrão atual não tem negócios;
  - **campos personalizados** criados (respeitando `crmCustomFields`; o que não couber vira pendência na resposta, `skipped`);
  - **mensagens prontas** de WhatsApp criadas;
  - **sequência** e **automações** sugeridas criadas **desligadas** (o dono liga quando quiser), com a etapa resolvida pelo nome no funil do perfil.
  - Resposta: **`{ ...settings, applied: { pipelineId, customFields, snippets, sequences, automations }, skipped: [...] }`**.
- Trocar de perfil **nunca apaga** nada (funis, campos e negócios ficam); só muda as palavras, o padrão (se vazio) e o que o menu destaca.

## O que cada perfil monta

| Perfil | Palavras | Funil | Campos | Também |
|---|---|---|---|---|
| `GENERAL` | negócio · contato · empresa | o padrão (Prospecção → Fechamento) | — | mensagem "Primeiro contato" |
| `B2B` | oportunidade · contato · conta | **Vendas B2B**: Prospecção → Qualificação → Diagnóstico → Proposta → Negociação | Funcionários (conta), Decisor, Concorrente | sequência **Prospecção em 5 toques** (e-mail, ligação, WhatsApp, caso de sucesso, última tentativa em 14 dias); automação "Proposta → follow-up em 3 dias"; **Gerar proposta** no negócio quando o Comercial está instalado (a proposta nasce com o cliente e os itens; aceite ganha o negócio) |
| `REAL_ESTATE` | negociação · cliente · empresa | **Imóveis**: Novo lead → Atendimento → Visita agendada → Proposta → Documentação | Finalidade (comprar/alugar), Forma de pagamento, Renda familiar | **cadastro de imóveis** e **imóveis compatíveis** (abaixo); sequência "Lead de portal" (responder em minutos); automação "Visita agendada → atividade de visita"; mensagens "Imóveis selecionados" e "Confirmar visita" |
| `EDUCATION` | matrícula · responsável · empresa | **Matrículas**: Interessado → Visita ou aula experimental → Matrícula em andamento → Documentação | Curso ou série, Turno, Nome do aluno | sequência "Campanha de matrícula"; visita/aula experimental agendada pela Agenda quando instalada; matrícula ganha oferece gerar o contrato (Comercial) e a cobrança recorrente (Financeiro) |
| `RETAIL` | venda · cliente · empresa | **Vendas da loja**: Novo → Em atendimento → Orçamento enviado | Aniversário, Preferências (contato) | mensagens "Orçamento" e "Chegou novidade"; automação "Venda ganha → oferecer recompra em 30 dias"; **Gerar pedido no ERP** no negócio ganho quando o ERP está instalado (itens viram linhas do pedido; produto do CRM casado pelo código/SKU) |

Recurso pago (feature de plano) aparece com o selo e o `UpgradeDialog`; o perfil não liga nada que o plano não tem (sequência e automações sugeridas ficam guardadas para quando o plano permitir).

## Imobiliária: imóveis e compatíveis

| Rota | Faz |
|---|---|
| ★ `GET /v1/crm/properties` · ★ `POST` · `PATCH/DELETE /:id` | **`{ code, title, purpose: "SALE" \| "RENT", type: APARTMENT \| HOUSE \| LAND \| COMMERCIAL \| RURAL, neighborhood, city, bedrooms?, areaM2?, priceCents, status?: AVAILABLE \| RESERVED \| SOLD \| RENTED, photos? }`** → código repetido 409 `PROPERTY_CODE_TAKEN`; preço > 0 (400 em `priceCents`) → 201 **`{ id, code, title, purpose, type, neighborhood, city, bedrooms, areaM2, priceCents, status }`**; filtros `purpose`, `type`, `status`, `neighborhood`, faixa de preço |
| ★ `PATCH /v1/crm/deals/:id` | aceita **`interest: { purpose, types?, neighborhoods?, minBedrooms?, maxPriceCents?, minPriceCents? }`** (o perfil de busca do cliente) |
| ★ `GET /v1/crm/deals/:id/property-matches` | **`{ data: [{ property, score, reasons }] }`** pelo `matchProperties` (só disponíveis; bairro desejado primeiro); negócio sem `interest` → `data: []` |
| `PUT /v1/crm/deals/:id/properties/:propertyId` · `DELETE` | imóveis oferecidos/visitados no negócio (`{ status: "OFFERED" \| "VISITED" \| "LIKED" \| "DISCARDED" }`) |

Negócio ganho com imóvel marcado → o imóvel vai para `SOLD`/`RENTED` (pergunta antes). Tela `/crm/imoveis` (lista com foto, filtros, cadastro) e, no negócio, a seção **Perfil de busca** + **Imóveis compatíveis** (`crm-property-match`) com "Mandar pelo WhatsApp" (mensagem pronta com os links).

## Testids

| testid | Onde |
|---|---|
| `crm-segment` (`<select>` em Configurações → Perfil), `crm-vocab-deal` (título da tela do funil com a palavra do perfil) | Configurações / funil |
| `crm-property-row`, `crm-property-new`, `crm-property-match` (`data-id`) | Imóveis / negócio |

## Testes obrigatórios

- Aplicar cada perfil: vocabulário em `/settings`, funil com as etapas, campos e mensagens criados; aplicar de novo não duplica; trocar de perfil não apaga negócios nem funis; o padrão só muda se estava vazio.
- Automações e sequência do perfil nascem desligadas e com a etapa certa.
- Imóveis: compatíveis respeitam finalidade, tipo, quartos, faixa de preço e disponibilidade, com o bairro desejado primeiro; código repetido 409.
