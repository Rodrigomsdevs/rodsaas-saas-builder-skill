---
name: agenda
description: Preset que soma ao projeto rodsaas o app Agenda, de agendamento online e operação do balcão para serviços (barbearia, salão, clínica, odonto, pet, consultoria) — tipos com duração, preço e local, equipe (rodízio, todos juntos, cliente escolhe), turmas, recursos (cadeira, sala), combos, bloqueios, recorrência, lista de espera, sinal no Pix pelo Financeiro, confirmação e mensagens de WhatsApp, página pública no fuso do cliente sem marcar duas vezes (trava no banco), recepção do dia com chegada e conclusão, comissões, clube de assinatura, fidelidade, fila do dia, convênio, anamnese e retorno, perfis de segmento com vocabulário próprio, relatórios, .ics, Google/Outlook, CRM, Forms e webhooks. Use depois do /rodsaas:backend e /rodsaas:frontend quando o usuário pedir agendamento, agenda online, marcação de horário, sistema de barbearia, salão ou clínica, clone do Calendly/Trinks, ou chamar /rodsaas:agenda.
---

# rodsaas · agenda

Acrescenta ao projeto o app **Agenda**: a empresa define o que pode ser marcado e quando, compartilha um link, e o cliente escolhe o horário sozinho, sem troca de mensagens. A equipe vê tudo numa agenda por profissional, marca encaixes, confirma presença e recebe lembretes. No balcão, a **recepção do dia** registra quem chegou, conclui o atendimento com serviços e produtos, calcula as **comissões**, cuida da **fila** de quem chegou sem hora, do **clube** de assinatura e da **fidelidade**; na clínica, de **convênios**, **anamnese** e **retornos**. Um **perfil de segmento** (barbearia, salão, clínica, odonto…) adapta as palavras e o que já vem ligado, sem duplicar o app. O preset **soma**: entra como um app na casca de apps (`skills/frontend/references/12-casca-e-apps.md`), sem mexer nos outros apps.

Tudo da base continua valendo: auth, empresas com RLS, membros, planos, padrão REST, erros RFC 9457, cursor, OpenAPI → tipos do front, estados de tela, marca, contrato de testids.

## Pré-requisitos

1. `api/`, `web/` e `rodsaas.json` verdes e já na casca de apps (existe `web/src/config/apps.ts`; senão, `/rodsaas:apps` antes).
2. Extensão **`btree_gist`** no Postgres (trava contra dois agendamentos no mesmo horário). É uma extensão confiável: o dono do banco criado pelo `/rodsaas:db` consegue criar na migration. Se o banco recusar, rode como superusuário (`CREATE EXTENSION btree_gist;`) e siga.
3. Mesma regra de versões das outras skills: `npm view` + doc atual para cada pacote novo (calendário da agenda interna, dnd-kit, `googleapis`/Microsoft Graph se a fase de integrações for feita).
4. **Add-on `notificacoes`** (sino, e-mails de aviso para a equipe, preferências): se `rodsaas.json` não tiver `notificacoes` em `addons`, rode o fluxo da skill `notificacoes` primeiro (leia o `SKILL.md` dela) e volte. Os avisos deste preset são registrados no catálogo dele e disparados pelo `notify()` dele (`skills/notificacoes/references/04-catalogo.md`, seção do app); nenhum aviso para membro é gravado ou enviado por conta própria.
5. Se o preset `forms` existir, reaproveite o `forms-lib` dele para as perguntas do agendamento; se não existir, copie `skills/forms/scripts/forms-lib.mjs` (com os testes) para o projeto.
6. **Operação com outros apps (opcional, cada um liga uma parte)**: `financeiro` (sinal, clube, receita do atendimento, contas a pagar das comissões), `erp` (produto vendido no atendimento baixa o estoque), `comercial` (termo de consentimento), `forms` (anamnese), `crm`. Sem o app, a opção correspondente aparece desligada com a explicação; nada do núcleo depende deles. `AGENDA_ENCRYPTION_KEY` passa a ser obrigatória (tokens de gerenciar criptografados para o "copiar link" e o WhatsApp).

## Como trabalhar (obrigatório)

1. **Leia a referência da fase inteira antes de começar a fase**, do início ao fim, não por amostragem nem resumo. Cada fase aponta o arquivo (→ `references/...`).
2. **Tudo o que está nas referências é escopo da v1**, exceto o que está marcado como fora da v1. Nada de "versão simplificada", "básico por enquanto" ou "dá para melhorar depois": uma agenda só com horários fixos, sem equipe, sem fuso do cliente, sem reserva temporária ou sem a trava no banco **não é** a Agenda desta skill.
3. **O contrato testável (testids e rotas ★) é o mínimo que o `/rodsaas:verify` consegue conferir, não o escopo.** Passar no verify não significa que a fase acabou.
4. **Conferência ao fim de cada fase**: antes do commit, monte uma tabela com **cada item** da referência da fase (cada linha de tabela e cada marcador) e o status ✅ feito / ❌ faltando, com o arquivo onde está. Só avance com tudo ✅; o que não der para fazer vira pendência explícita no relatório final, com o motivo. Use o "Pronto quando" de cada fase abaixo como mínimo.
5. Se o usuário pedir para pular ou cortar algo, registre como desvio no relatório final.

## Projeto que já tem a Agenda (revisão)

Se `rodsaas.json → presets` já tem `agenda` (ou existe `api/src/modules/agenda`), rode em **modo revisão** em vez de instalar de novo:

1. Leia todas as referências inteiras.
2. Compare item a item com o código (API, telas, testes) e monte a tabela de lacunas: item da referência · ✅/❌ · onde está ou o que falta. Comece pelo "Pronto quando" das fases 3, 5, 6, 8 e 9 (é onde mais se simplifica: horários calculados à mão em vez do `computeSlots`, sem os modos de equipe e turmas, página pública sem fuso/reserva/gerenciar, agenda interna sem colunas por profissional e sem arrastar; e, na operação, recurso que não trava no banco, sinal sem segurar o horário, comissão calculada no front, clube que não conta usos, fila sem previsão, palavras fixas em vez do perfil). Projeto feito antes da operação (sem `segment`, recursos, recepção): as fases 8 e 9 são a lacuna inteira — faça-as como instalação nova, com migrations aditivas.
3. Mostre a tabela ao usuário e complete o que falta **fase por fase**, sem reescrever o que já está certo e sem perder dados (migrations só aditivas).
4. Feche com `references/08-checklist.md` e o `/rodsaas:verify` (`-g "Agenda"`).

## Decisões padrão (confirme numa rodada só)

| Decisão | Padrão |
|---|---|
| Para quê | **reuniões e serviços num modelo só**: "tipo de agendamento" com duração, preço opcional e quem atende |
| Quem atende | uma pessoa · qualquer um da equipe (rodízio) · todos juntos · o cliente escolhe o profissional |
| Turmas | sim: tipo com **vagas** por horário (aula, workshop, avaliação em grupo) |
| Videochamada | **sala Jitsi automática** (grátis, sem conta), link fixo por tipo, ou **Google Meet** quando a pessoa conectou o Google |
| Google Agenda e Outlook | fase **opcional**: só liga quando houver credenciais OAuth no `.env`; sem elas, tudo funciona com convite `.ics` e feed de agenda |
| Feriados | nacionais bloqueados automaticamente; pontos facultativos (Carnaval, Corpus Christi) desligados por padrão; feriados municipais e da empresa à mão |
| Endereços públicos | `/agendar/<empresa>`, `/agendar/<empresa>/<tipo>`, `/agendar/<empresa>/p/<pessoa>` no domínio do painel; o cliente gerencia em `/agendamento/<token>` |
| Pagamento | mostra o preço e "pagamento no local"; **sinal** opcional por tipo (ou para quem faltou 2 vezes) cobrado pelo `/rodsaas:financeiro` (Pix/cartão no Stripe da própria empresa), 30 min para pagar, devolvido se o cliente cancelar com 24 h |
| Perfil | perguntado na primeira abertura (ou vindo do onboarding da workstation): barbearia, salão, clínica, odonto, pet, consultoria ou geral (`09`) |
| Confirmação | lembrete de 24 h pede "confirmo presença"; mensagens de WhatsApp prontas pelo link `wa.me` (envio automático só com o add-on `whatsapp`) |
| Comissões | padrão 40% em serviços e 10% em produtos, com exceções por pessoa e serviço; regime "salão parceiro" (contas a pagar em serviços de terceiros) |
| Nome do app | **Agenda** |
| Planos | Free: 2 tipos, 1 pessoa com agenda, 50 agendamentos/mês, combos, bloqueios, confirmação, recepção, fila e ficha; Pro: tipos ilimitados, 10 pessoas, 2.000/mês, equipe, aprovação, turmas, integrações, sem rodapé, **recursos, recorrência, lista de espera, sinal, comissões, clube, fidelidade e clínica**; Business: pessoas ilimitadas, 20.000/mês |

Fora da v1 (registre no README do projeto): **prontuário, odontograma, receituário e evolução clínica** (app Clínica, futuro), faturamento TISS de convênio, envio automático de WhatsApp sem o add-on, pacotes de sessões pré-pagos (use série + sinal ou clube), TEF/maquininha integrada, app nativo, Zoom/Teams, SMS, totem de check-in, sincronização completa de mão dupla (a v1 lê os ocupados e cria o evento).

## Fases

Cada fase termina com typecheck, lint, build, testes da fase e commit (`feat(agenda): ...`). Não avance com fase quebrada. Use a lista de tarefas.

1. **Integração e regras** — registro do preset e do **app Agenda**, planos, porte de `scripts/agenda-lib.mjs` (com os testes) para o back: o motor de horários é o coração. → `references/01-escopo-e-integracao.md`
   - *Pronto quando*: app no trilho, planos, `agenda-lib` portado com os testes passando (o motor de horários vem dele, nunca reescrito à mão).
2. **Modelo** — models com RLS, **trava no banco** contra sobreposição, reservas temporárias, tabelas de busca pública sem RLS, conteúdo inicial. → `references/02-modelo.md`
   - *Pronto quando*: restrição `EXCLUDE` no lugar (dois compromissos sobrepostos inseridos à mão no banco falham), reservas `HELD`, tabelas de busca pública e conteúdo inicial.
3. **API interna** — configurações, disponibilidades, tipos, agendamentos (encaixe, remarcar, aprovar, cancelar, presença), bloqueios, clientes, relatórios. → `references/03-api.md`
   - *Pronto quando*: encaixe (com e sem disponibilidade), remarcar, aprovar/recusar, cancelar, presença, bloqueios, clientes e relatórios; os quatro modos de quem atende e turmas.
4. **API pública** — página, horários livres, reserva, agendar, gerenciar pelo token, `.ics`, feed. → `references/03-api.md`
   - *Pronto quando*: horários pelo `computeSlots`, reserva de 5 min, agendar com `isSlotAvailable` na transação, gerenciar pelo token, `.ics` e feed.
5. **Página pública** — passo a passo, calendário, fuso do cliente, formulário, confirmação, remarcar e cancelar, incorporação. → `references/04-pagina-publica.md`
   - *Pronto quando*: passo a passo completo do `04` (profissional, dia, horário, dados, confirmação) no fuso do cliente, reserva com contador, perguntas, Google Agenda/.ics, gerenciar com remarcar e cancelar, incorporação.
6. **App interno** — agenda por profissional, lista, painel do agendamento, tipos, disponibilidade, clientes, relatórios, configurações. → `references/05-app-interno.md`
   - *Pronto quando*: agenda dia/semana/mês com colunas por profissional e arrastar, painel do agendamento com todas as ações, lista com abas, tipos com todas as abas de edição, disponibilidade com exceções e feriados, clientes, relatórios e configurações; todos os testids da seção "Contrato testável".
7. **Avisos e integrações** — e-mails com `.ics`, lembretes, resumo do dia, CRM, Forms, webhooks, feed; e, se houver credenciais, Google Agenda e Outlook. → `references/06-avisos-e-integracoes.md`
8. **Operação** — recursos (com a trava no banco), combos, bloqueios, encaixe no passado, recorrência, lista de espera, sinal pelo Financeiro, confirmação pelo cliente, mensagens de WhatsApp, ficha do cliente. → `references/02-modelo.md`, `03-api.md`, `04-pagina-publica.md`, `06-avisos-e-integracoes.md`
   - *Pronto quando*: `computeSlots` com `resources` e a restrição `EXCLUDE` do recurso; combo pelo `combo` nos horários e no agendamento; série pelo `recurrenceStarts` com conflitos listados; lista de espera pelo `waitlistCandidates` com oferta segurando o horário; sinal (`depositRequired`/`depositAmount`/`depositRefund`) segurando o horário em `AWAITING_PAYMENT` e confirmando pelo webhook do Financeiro; confirmar pelo link; `whatsapp.links` no detalhe; ficha com `clientSummary`.
9. **Balcão e perfis** — recepção do dia, check-in, concluir com serviços/produtos/pagamentos, comissões e fechamento, clube, fidelidade, fila do dia, convênios, anamnese, termo, retornos e perfis de segmento. → `references/09-perfis-de-segmento.md`, `references/10-atendimento-e-comissoes.md`
   - *Pronto quando*: recepção com colunas por profissional e as ações do cartão; conclusão com `commissionFor` gravado na linha e integração com o Financeiro/ERP; extrato pelo `commissionStatement` e fechamento que trava; clube pelo `clubCoverage`/`clubPeriodOf` com recorrência no Financeiro; fidelidade pelo `loyaltyStatus`; fila pelo `queueEstimate`; convênio pelo `insurancePrice`; retorno pelo `recallDate`; palavras do perfil (`vocabulary`) em todas as telas, e-mails e página pública.
10. **Interações e estados** — arrastar, otimismo, atalhos e todos os estados. → `references/07-interacoes-e-estados.md`
11. **Fechamento** — `references/08-checklist.md`, testes ponta a ponta, `/rodsaas:verify` (tem duas partes da Agenda: `-g "Agenda"` roda as duas; elas exigem os testids de `04-pagina-publica.md` e `05-app-interno.md`, os rótulos **Nome**/**E-mail** da página pública e os formatos ★ de `03-api.md`), README do projeto.

## Princípios

- **Nunca marcar duas vezes.** O motor esconde horário ocupado, o service confere de novo dentro da transação e o banco recusa sobreposição (restrição `EXCLUDE`). Mesmo dois clientes clicando no mesmo segundo, só um consegue.
- **Fuso certo em todo lugar.** Banco em UTC; disponibilidade no fuso de cada pessoa; página no fuso do cliente; e-mails com o fuso escrito por extenso. Todo cálculo de horário passa pelo `agenda-lib` (testado com horário de verão).
- **O cliente não precisa de conta.** Agendar, remarcar e cancelar funcionam pelo link com token secreto; nada de senha.
- **A agenda da equipe é a fonte da verdade.** Encaixe e bloqueio feitos por dentro valem na hora para a página pública.
- **Segurança da base, sem exceção.** RLS `FORCE` em tudo (as tabelas de busca pública sem RLS guardam só slug/hash → ids, com justificativa no README); dados do cliente visíveis só para a equipe da empresa; tokens só como hash; credenciais de agenda externa criptografadas.
- **Dinheiro e regras no servidor.** Preço do combo, sinal, clube, convênio, comissão e fidelidade saem do `agenda-lib` na API; o front só mostra. Comissão gravada na conclusão não muda depois; período fechado não se mexe.
- **Um app, vários negócios.** O perfil muda palavras e o que vem ligado; nada de telas ou tabelas duplicadas por segmento.
- **Todo estado tem tela e toda ação tem feedback** (`references/07-interacoes-e-estados.md`).

## Relatório final

O que foi adicionado (app, telas, endereços públicos), planos e limites novos, o perfil escolhido, como testar em 5 minutos (ajustar o horário semanal → criar o tipo "Consulta 30 min" → abrir o link numa aba anônima → agendar → ver na agenda → remarcar pelo link do e-mail no Mailpit → marcar compareceu; no balcão: corte + barba com sinal → pagar no modo de teste → chegou → concluir com uma pomada no Pix → ver a comissão → pôr alguém na fila e chamar), se a integração Google/Outlook foi ligada (e quais variáveis faltam), o resultado do `/rodsaas:verify`, o que ficou fora da v1 e desvios por versão de pacote.

## Mapa das referências

| Arquivo | Quando ler |
|---|---|
| `references/01-escopo-e-integracao.md` | Fase 1: escopo, app na casca, papéis, planos |
| `references/02-modelo.md` | Fases 2 e 8: models, trava contra sobreposição (pessoa e recurso), reservas, tokens, operação |
| `references/03-api.md` | Fases 3, 4, 8 e 9: rotas internas e públicas, erros, testes |
| `references/04-pagina-publica.md` | Fase 5 |
| `references/05-app-interno.md` | Fase 6 |
| `references/06-avisos-e-integracoes.md` | Fase 7 |
| `references/07-interacoes-e-estados.md` | Fase 10 |
| `references/08-checklist.md` | Fase 11 |
| `references/09-perfis-de-segmento.md` | Fase 9: perfis, vocabulário, o que cada segmento liga |
| `references/10-atendimento-e-comissoes.md` | Fase 9: chegada, conclusão, comissões, clube, fidelidade, fila, ficha |
| `scripts/agenda-lib.mjs` + `agenda-lib.test.mjs` | motor de horários (`computeSlots`, com recursos), fusos, feriados, rodízio, `.ics`, lembretes, política de cancelamento, tokens, Jitsi, combos, recorrência, lista de espera, sinal, WhatsApp, ficha, comissão, clube, fidelidade, fila, convênio, retorno e perfis: porte para TS com os testes |
