---
name: comercial
description: Preset que soma ao projeto rodsaas o app Comercial, do orçamento ao contrato assinado no estilo PandaDoc/Proposify/ZapSign/Clicksign — propostas com itens, quantidade fracionada, desconto por item e geral, opcionais que o cliente marca, recorrentes, plano de pagamento, validade, versões, aprovação de desconto, link público com rastreio de visualização e aceite online (nome, CPF/CNPJ, IP, hash); modelos com variáveis e valor por extenso; contratos com partes, vigência, aviso prévio, renovação automática, reajuste e aditivos; assinatura eletrônica com ordem (sequencial/paralela), testemunhas, código por e-mail, recusa, PDF final com manifesto e verificação pública por código; integra com CRM e Financeiro. Use depois do /rodsaas:backend e /rodsaas:frontend quando o usuário pedir propostas, orçamentos, contratos, assinatura eletrônica, aceite online, gestão de contratos, renovação, ou chamar /rodsaas:comercial.
---

# rodsaas · comercial (app Comercial)

Acrescenta ao projeto o app **Comercial**: o caminho entre "o cliente quer" e "está assinado". O vendedor monta a **proposta** em minutos (itens, descontos, opcionais, parcelas), manda um link bonito com a marca da empresa, vê quando o cliente abriu e recebe o **aceite online**. A proposta aceita vira **contrato** pelo modelo da empresa, que vai para **assinatura eletrônica** com ordem, testemunhas e código por e-mail, e termina num PDF com manifesto que qualquer um verifica pelo código. O preset **soma**: entra como um app na casca de apps (`skills/frontend/references/12-casca-e-apps.md`), sem mexer nos outros apps.

| # | Área | O que resolve |
|---|---|---|
| 1 | **Propostas** | itens com quantidade fracionada, desconto por item (% ou R$) e geral, opcionais que o cliente marca, itens recorrentes (mensal/anual) separados do avulso, plano de pagamento (à vista, parcelado, entrada + parcelas), validade, versões, aprovação de desconto acima do limite, envio por e-mail com link, rastreio de visualização, aceite online com nome, CPF/CNPJ e concordância (com IP, data e hash do que foi aceito), recusa com motivo, PDF |
| 2 | **Modelos** | modelos de proposta e de contrato em texto rico com variáveis (`{{cliente.nome}}`, `{{proposta.total|moeda}}`, `{{proposta.total|extenso}}`…), validação das variáveis, prévia com dados reais |
| 3 | **Contratos** | a partir da proposta aceita ou do zero; partes, vigência (início + meses), aviso prévio, renovação automática, valor e recorrência, reajuste por índice, aditivos, encerramento; contratos antigos já assinados cadastrados com o PDF; avisos de vencimento |
| 4 | **Assinatura eletrônica** | envelope com signatários (partes, testemunhas, aprovadores) em ordem sequencial ou paralela, link por pessoa, código de 6 dígitos por e-mail, recusa com motivo, lembretes, cancelamento, PDF final congelado com folha de assinaturas (manifesto) e SHA-256, verificação pública por código ou pelo arquivo |

Tudo da base continua valendo: auth, empresas com RLS, membros, planos (ou a workstation), padrão REST, erros RFC 9457, cursor, OpenAPI → tipos do front, estados de tela, marca, contrato de testids.

## Pré-requisitos

1. `api/`, `web/` e `rodsaas.json` verdes e já na casca de apps (existe `web/src/config/apps.ts`; senão, `/rodsaas:apps` antes).
2. Add-on **`uploads`** (anexos, PDFs de contratos antigos, documentos para assinar e o PDF final): sem ele, rode o `/rodsaas:uploads` antes.
3. Add-on **`notificacoes`**: sem ele, rode o fluxo da skill `notificacoes` primeiro. Os avisos deste preset passam pelo catálogo e pelo `notify()` dele (`references/01-escopo-e-papeis.md`, seção "Avisos").
4. Add-on **`email`** (o `backend` já instala): proposta, código de assinatura, lembretes e o PDF final vão para **clientes e signatários** pelo Resend, com a marca da empresa.
5. **Gerador de PDF**: HTML → PDF por **Gotenberg** (container no `docker-compose`, recomendado) ou Chromium headless (`playwright-core`) num job; leia `references/07-modelos-e-pdf.md`.
6. Fila de jobs da base (pg-boss): PDFs, lembretes de assinatura, vencimento de propostas e contratos, renovação automática.
7. Mesma regra de versões das outras skills: `npm view` + doc atual para cada pacote novo (`pdf-lib` para juntar o manifesto ao PDF, editor de texto rico — o mesmo do Páginas/Suporte se existir, senão TipTap —, `sanitize-html`).
8. Com a `/rodsaas:workstation`, o app é cobrado por vendedor; leia `references/01-escopo-e-papeis.md`, seção "Workstation".

## Como trabalhar (obrigatório)

1. **Leia a referência da fase inteira antes de começar a fase**, do início ao fim, não por amostragem nem resumo. Cada fase aponta o arquivo (→ `references/...`).
2. **Tudo o que está nas referências é escopo da v1**, exceto o que está marcado como fora da v1. Nada de "versão simplificada", "básico por enquanto" ou "dá para melhorar depois": proposta que muda depois de aceita, desconto sem aprovação, aceite sem nome e documento, assinatura sem código, sem ordem ou sem manifesto **não são** o Comercial desta skill.
3. **O contrato testável (testids e rotas ★) é o mínimo que o `/rodsaas:verify` consegue conferir, não o escopo.** Passar no verify não significa que a fase acabou.
4. **Conferência ao fim de cada fase**: antes do commit, monte uma tabela com **cada item** da referência da fase (cada linha de tabela e cada marcador) e o status ✅ feito / ❌ faltando, com o arquivo onde está. Só avance com tudo ✅; o que não der para fazer vira pendência explícita no relatório final, com o motivo. Use o "Pronto quando" de cada fase abaixo como mínimo.
5. Se o usuário pedir para pular ou cortar algo, registre como desvio no relatório final.

## Projeto que já tem o Comercial (revisão)

Se `rodsaas.json → presets` já tem `comercial` (ou existe `api/src/modules/comercial`), rode em **modo revisão** em vez de instalar de novo:

1. Leia todas as referências inteiras.
2. Compare item a item com o código (API, telas, testes) e monte a tabela de lacunas: item da referência · ✅/❌ · onde está ou o que falta. Comece pelo "Pronto quando" das fases 3, 5 e 6 (é onde mais se simplifica: total calculado no front, proposta editável depois de enviada, aceite que não guarda o que foi aceito, assinatura que qualquer um com o link faz sem código, ordem de assinatura ignorada, PDF final sem manifesto nem hash).
3. Mostre a tabela ao usuário e complete o que falta **fase por fase**, sem reescrever o que já está certo e sem perder dados (migrations só aditivas).
4. Feche com `references/09-checklist.md` e o `/rodsaas:verify` (`-g "Comercial"`).

## Decisões padrão (confirme numa rodada só)

| Decisão | Padrão |
|---|---|
| Nome do app | **Comercial** (rotas `/comercial/...`, API `/v1/com/...`, id do app `comercial`, preset `comercial`); páginas públicas `/proposta/[token]`, `/assinar/[token]` e `/verificar/[codigo]` |
| Papéis | `COM_ADMIN` (tudo, modelos, aprovar descontos, contratos de todos), `SELLER` (as próprias propostas e os contratos delas), `VIEWER` (vê tudo, não muda); o owner é sempre `COM_ADMIN` |
| Dinheiro | **centavos inteiros**; quantidade com até 3 casas (1,5 hora); o total é sempre calculado no servidor (`proposalTotals`) |
| Desconto | limite do vendedor **15%** de desconto efetivo (configurável); acima disso a proposta espera aprovação de um `COM_ADMIN` antes de enviar |
| Validade | 15 dias a partir do envio (configurável por proposta); vence no fim do dia |
| Depois de enviada | a proposta **não muda**: mudar = nova versão (a anterior vira "substituída" e o link antigo deixa de aceitar) |
| Aceite | nome completo, CPF/CNPJ válido e "li e concordo"; guarda IP, navegador, data, os itens marcados e o SHA-256 do documento aceito |
| Contratos | vigência em meses, aviso prévio de 30 dias, renovação automática desligada por padrão, reajuste anual manual pelo índice informado (IPCA/IGP-M são digitados, sem consulta automática) |
| Assinatura | assinatura eletrônica (MP 2.200-2/2001 art. 10 §2º — válida entre as partes que aceitam o meio; Lei 14.063/2020 para entes públicos); código de 6 dígitos por e-mail (10 min, 5 tentativas); envelope vence em 30 dias; lembrete a cada 3 dias |
| PDF | Gotenberg; PDF final = documento + folha de assinaturas, SHA-256 gravado, código de verificação `XXXX-XXXX-XXXX` |
| Integrações | CRM (proposta do negócio; aceite ganha o negócio), Financeiro (aceite gera as contas a receber do plano de pagamento e, se ligado, a cobrança) |
| Planos (modelo de planos) | Free: 10 propostas/mês, modelos padrão, aceite online; Pro: propostas ilimitadas, + contratos, assinatura (50 envelopes/mês), aprovação de desconto, modelos próprios, rastreio de visualização; Business: 500 envelopes/mês |
| Workstation | app **por vendedor** (quem tem papel `SELLER` ou `COM_ADMIN`), com envelopes inclusos e pacotes extras |

Fora da v1 (registre no README do projeto): assinatura digital com certificado ICP-Brasil (qualificada), validação de identidade por selfie/documento, assinatura por WhatsApp/SMS, pagamento dentro da proposta (o Financeiro cobra depois do aceite), edição colaborativa em tempo real, consulta automática de índices de reajuste, CPQ com regras de preço complexas, nota fiscal.

## Fases

Cada fase termina com typecheck, lint, build, testes da fase e commit (`feat(comercial): ...`). Não avance com fase quebrada. Use a lista de tarefas.

1. **Integração e regras** — registro do preset e do **app Comercial**, papéis, planos (ou workstation), avisos, porte de `scripts/comercial-lib.mjs` (com os testes) para `api/src/modules/comercial/lib/`. → `references/01-escopo-e-papeis.md`
   - *Pronto quando*: app no trilho só para quem tem papel, `COM_ADMIN`/`SELLER`/`VIEWER` checados na API (vendedor só vê o que é dele), planos ou workstation, tipos de aviso registrados, `comercial-lib` portado com os testes passando.
2. **Modelo** — modelos, propostas (versões, itens, aceite), visualizações, contratos (vigências, aditivos), envelopes, signatários, eventos, lookups públicos; RLS `FORCE`; numeração; conteúdo inicial. → `references/02-modelo.md`
   - *Pronto quando*: models com RLS `FORCE`, numeração por empresa sem buraco (`P-0001`, `C-0001`), lookups públicos só com hash do token, proposta aceita e envelope concluído imutáveis (trigger), conteúdo inicial (modelos padrão).
3. **Propostas** — API e telas: criar, itens, totais, plano de pagamento, aprovação de desconto, enviar, versão, encerrar, cancelar, página pública com rastreio, aceite e recusa. → `references/03-api.md` e `references/04-propostas.md`
   - *Pronto quando*: totais pelo `proposalTotals`, aprovação pelo `needsApproval`, envio bloqueado com aprovação pendente, travada depois de enviada (409 `PROPOSAL_LOCKED`), versão substitui a anterior, página pública sem login com visualização registrada, aceite pelo `validateAcceptance`/`canDecide` com IP e hash, integrações CRM/Financeiro.
4. **Modelos e PDF** — editor de modelos com variáveis, validação, prévia, geração de PDF de proposta e contrato. → `references/07-modelos-e-pdf.md`
   - *Pronto quando*: `validateTemplate` no salvar (400 `UNKNOWN_VARIABLE`), `renderTemplate` com filtros e escape, prévia com dados reais e aviso de variáveis faltando, PDF pelo Gotenberg na fila.
5. **Contratos** — do zero, da proposta, existente já assinado; vigência, aviso, renovação, reajuste, aditivos, encerramento, avisos de vencimento. → `references/05-contratos.md`
   - *Pronto quando*: `contractTerm`/`contractStatus`/`renewTerm`/`readjust` no servidor, lista por situação (vigente, vencendo, renovando, encerrado), renovação automática no job, aditivo com nova assinatura, contrato existente com o PDF.
6. **Assinatura eletrônica** — envelopes, signatários com ordem, link por pessoa, código por e-mail, assinar, recusar, cancelar, lembretes, PDF final com manifesto e hash, verificação pública. → `references/06-assinatura.md`
   - *Pronto quando*: `currentTurn`/`canSign` (409 `NOT_YOUR_TURN`), `checkOtp` (tentativas contadas), evidências gravadas (IP, navegador, horário, documento), envelope concluído gera PDF final + manifesto + SHA-256 + `verificationCode`, verificação pública por código e por hash, recusa encerra.
7. **Telas** — Início, propostas (lista, editor, detalhe com linha do tempo), modelos, contratos, envelopes, configurações, páginas públicas. → `references/08-telas.md`
   - *Pronto quando*: todas as rotas e testids da seção "Contrato testável", total ao vivo no editor, páginas públicas no celular com a marca da empresa.
8. **Fechamento** — `references/09-checklist.md`, testes ponta a ponta, `/rodsaas:verify` (parte do Comercial: `-g "Comercial"`; exige os formatos ★ de `03-api.md` e os testids de `08-telas.md`), README do projeto.

## Princípios

- **O que foi aceito é o que vale.** Proposta enviada não muda; aceite guarda os itens marcados, o total e o SHA-256 do documento; contrato assinado não muda (aditivo é outro documento).
- **Conta no servidor.** Totais, descontos, parcelas, vigência e situação saem do `comercial-lib` portado; o front mostra.
- **Quem assina é quem recebeu.** Link por signatário + código no e-mail dele + nome e documento; ordem respeitada; tudo com IP, navegador e horário no manifesto.
- **Qualquer um confere.** PDF final com folha de assinaturas, SHA-256 e código; a página `/verificar/<código>` (ou enviando o arquivo) diz se é o mesmo documento e quem assinou quando.
- **Vendedor vende, admin controla.** Vendedor vê as próprias propostas; desconto acima do limite e modelos são do admin.
- **Segurança da base, sem exceção.** RLS `FORCE` em tudo; tokens públicos só como hash; HTML de modelo sanitizado; páginas públicas sem dados internos.
- **Todo estado tem tela e toda ação tem feedback** (`references/08-telas.md`).

## Relatório final

O que foi adicionado (app, telas, páginas públicas), papéis, planos ou workstation, como testar em 5 minutos (criar uma proposta com 2 itens, um opcional e 10% de desconto → enviar → abrir o link numa aba anônima → aceitar marcando o opcional → gerar o contrato pelo modelo → mandar para assinatura de 2 pessoas e uma testemunha → assinar com o código do Mailpit → verificar pelo código), como subir o Gotenberg, o resultado do `/rodsaas:verify`, o que ficou fora da v1 e desvios por versão de pacote.

## Mapa das referências

| Arquivo | Quando ler |
|---|---|
| `references/01-escopo-e-papeis.md` | Fase 1: escopo por área, app na casca, papéis, planos, workstation, integrações, avisos |
| `references/02-modelo.md` | Fase 2: models, RLS, numeração, imutabilidade, conteúdo inicial |
| `references/03-api.md` | Fases 3–6: rotas, formatos ★, erros, jobs, testes |
| `references/04-propostas.md` | Fase 3 |
| `references/05-contratos.md` | Fase 5 |
| `references/06-assinatura.md` | Fase 6 |
| `references/07-modelos-e-pdf.md` | Fase 4 |
| `references/08-telas.md` | Fase 7: rotas do front, telas, estados, contrato de testids |
| `references/09-checklist.md` | Fase 8 |
| `scripts/comercial-lib.mjs` + `comercial-lib.test.mjs` | itens e totais, aprovação, plano de pagamento, modelos (variáveis e blocos por tipo) e filtros, valor por extenso, situação e aceite da proposta, visualizações, vigência/renovação/reajuste, ordem de assinatura, código por e-mail, código de verificação, manifesto: porte para TS com os testes |
