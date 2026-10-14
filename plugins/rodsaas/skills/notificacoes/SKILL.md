---
name: notificacoes
description: Add-on de notificações para projetos rodsaas — um módulo único que todos os apps usam (Tarefas, CRM, Forms, Agenda, Suporte e os próximos): sino no trilho com contador, painel Não lidas/Todas em Hoje/Ontem/Anteriores, página /notificacoes com filtros por app e tipo, marcar como lida/não lida/todas, agrupamento ("Ana e mais 2 comentaram"), preferências por tipo e canal (no app, e-mail na hora, resumo diário, desligado), e-mail agrupado e resumo diário no fuso da empresa, descadastro de um clique sem login (RFC 8058), catálogo de tipos com frases padrão, notify() que nunca avisa quem fez a ação nem quem não pode ver, avisos da base (membro entrou, papel mudou, pagamento recusado) e ponto de extensão para WhatsApp e push. Use quando o usuário pedir notificações, sino, avisos, alertas, resumo por e-mail ou preferências de notificação num projeto rodsaas, ou chamar /rodsaas:notificacoes. Os presets tarefas, crm, forms, agenda e helpdesk dependem dele.
---

# rodsaas · notificacoes

Dá ao projeto **um só lugar para avisar as pessoas**. Cada app chama `notify()` quando algo acontece; o add-on decide quem recebe (nunca quem fez a ação, nunca quem não pode ver), junta eventos parecidos, mostra no sino e manda e-mail conforme a preferência de cada pessoa: na hora, num resumo diário ou nunca. É um add-on de infraestrutura com telas próprias (sino, página de notificações, preferências, descadastro) que a casca de apps já reserva.

## Como funciona

```
app (tarefas, crm…) ── notify({ type, actorId, recipients, entity, data, url }) ─▶ dentro da MESMA transação da mudança
   │   catálogo do tipo → resolveRecipients (sem ator, só membros, só quem vê) → channelsFor (preferência)
   │   agrupa com a aberta (mesma chave, não lida, e-mail não enviado, janela) ou cria Notification
   ▼
sino / painel / /notificacoes ◀── GET /v1/notifications, unread-count (ao focar a janela e a cada 60 s)
e-mail imediato ◀── job notifications.email (espera 60 s de silêncio, no máximo 3 min) → um e-mail por pessoa
resumo diário   ◀── job notifications.digest (a cada 15 min, envia às 8 h no fuso da empresa para quem escolheu)
descadastro     ◀── link no e-mail + List-Unsubscribe-Post (um clique, sem login)
```

## Antes de começar

- Projeto rodsaas com `api/`, `web/` e `rodsaas.json`, tudo verde, já na casca de apps (existe `web/src/config/apps.ts`; senão, `/rodsaas:apps` antes).
- Fila de jobs da base (pg-boss) e `Mailer` funcionando (Mailpit em dev).
- Mesma regra de versões das outras skills: `npm view` + doc atual para cada pacote novo (este add-on não exige nenhum além da base).

## Como trabalhar (obrigatório)

1. **Leia a referência da fase inteira antes de começar a fase**, do início ao fim, não por amostragem nem resumo. Cada fase aponta o arquivo (→ `references/...`).
2. **Tudo o que está nas referências é escopo da v1**, exceto o que está marcado como fora da v1. Nada de "versão simplificada", "básico por enquanto" ou "dá para melhorar depois": um sino sem agrupamento, sem preferências por tipo, sem resumo diário ou sem descadastro pelo e-mail **não é** o add-on desta skill.
3. **O contrato testável (testids e rotas ★) é o mínimo que o `/rodsaas:verify` consegue conferir, não o escopo.** Passar no verify não significa que a fase acabou.
4. **Conferência ao fim de cada fase**: antes do commit, monte uma tabela com **cada item** da referência da fase (cada linha de tabela e cada marcador) e o status ✅ feito / ❌ faltando, com o arquivo onde está. Só avance com tudo ✅; o que não der para fazer vira pendência explícita no relatório final, com o motivo. Use o "Pronto quando" de cada fase abaixo como mínimo.
5. Se o usuário pedir para pular ou cortar algo, registre como desvio no relatório final.

## Projeto que já tem notificações (revisão)

Se `rodsaas.json → addons` já tem `notificacoes`, **ou** existe `api/src/modules/notifications` (projetos em que o `tarefas`, o `crm` ou o `forms` criaram o módulo por conta própria), rode em **modo revisão** em vez de instalar de novo:

1. Leia todas as referências inteiras.
2. Compare item a item com o código (API, jobs, telas, testes) e monte a tabela de lacunas: item da referência · ✅/❌ · onde está ou o que falta. Comece pelo "Pronto quando" das fases 2, 3 e 4 (é onde mais se simplifica: sem agrupamento, `notify()` espalhado em cada app em vez de um serviço só, ator recebendo aviso da própria ação, preferência só liga/desliga, e-mail um por evento, resumo diário em UTC, sem descadastro).
3. Mostre a tabela ao usuário e complete o que falta **fase por fase**, sem reescrever o que já está certo e sem perder dados: migrations só aditivas (`references/02-modelo.md`, seção "Vindo do módulo antigo"), e as rotas antigas continuam respondendo no mesmo formato.
4. Troque as chamadas diretas de cada app para o `notify()` do add-on e registre os tipos de cada app no catálogo (`references/04-catalogo.md`).
5. Feche com `references/07-checklist.md` e o `/rodsaas:verify` (`-g "Notificações"`).

## Decisões padrão (confirme numa rodada só)

| Decisão | Padrão |
|---|---|
| Canais na v1 | **no app** (sino, painel, página) e **e-mail** (imediato agrupado ou resumo diário) |
| E-mail padrão de quem entra | **imediato**; cada tipo pode ter padrão menor (ex.: "alguém entrou na empresa" vai no resumo) |
| Resumo diário | **8 h no fuso da empresa**, só quando há novidade não lida; a pessoa escolhe a hora |
| Agrupamento | eventos iguais no mesmo registro em **2 min** (janela deslizante, até 60 min); alguns tipos agrupam por chave ("3 tarefas atribuídas a você") |
| Retenção | lidas somem depois de **90 dias**, não lidas depois de **180** |
| Avisos obrigatórios | só **pagamento recusado** (não dá para desligar) |
| Planos | notificações em **todos os planos**, sem limite (aviso não é recurso pago) |
| WhatsApp e push no navegador | fora da v1; o registro de canais (`references/05-email-e-jobs.md`) fica pronto para o add-on `whatsapp` e para push |

Fora da v1 (registre no README do projeto): push no navegador/celular (Web Push), WhatsApp e SMS (add-on), tempo real por WebSocket/SSE (a v1 consulta ao focar a janela e a cada 60 s), horário silencioso, "lembrar mais tarde" (adiar), notificações para quem não é membro (clientes externos usam os e-mails de cada app).

## Fases

Cada fase termina com typecheck, lint, testes da fase e commit (`feat(notificacoes): ...`). Não avance com fase quebrada. Use a lista de tarefas.

1. **Integração e regras** — registro do add-on, porte de `scripts/notifications-lib.mjs` (com os testes) para `api/src/modules/notifications/lib/`, catálogo com os tipos da base e de cada app instalado, variáveis de ambiente, fuso da empresa. → `references/01-escopo-e-integracao.md` e `references/04-catalogo.md`
   - *Pronto quando*: `notifications-lib` portado com todos os testes passando, catálogo montado com `catalogFor` e validado no boot (`validateCatalog` sem erros), `NOTIFICATIONS_UNSUBSCRIBE_SECRET` no env validado, fuso por empresa disponível.
2. **Modelo** — `Notification`, `NotificationPreference` com RLS, índices, trava de agrupamento, migração do módulo antigo. → `references/02-modelo.md`
   - *Pronto quando*: os dois models com **todos** os campos do `02`, RLS `FORCE`, índices de lista e de agrupamento, migração aditiva do formato antigo testada.
3. **Serviço e API** — `notify()`, `retract()`, rotas da caixa de entrada, contador, ler/não lida/todas, remover, catálogo, preferências, descadastro público, avisos da base. → `references/03-api.md`
   - *Pronto quando*: `notify()` único na mesma transação (nunca o ator, só membros, só quem vê, preferência por tipo, agrupamento com trava), todas as rotas ★ nos formatos do `03`, descadastro com e sem login, avisos `org.member_joined` e `org.role_changed` disparando, e os testes da API do `03` passando.
4. **E-mail e jobs** — e-mail imediato agrupado, resumo diário no fuso, descadastro com um clique, limpeza, registro de canais. → `references/05-email-e-jobs.md`
   - *Pronto quando*: imediato espera o silêncio e junta os prontos da pessoa num e-mail só, não envia o que já foi lido, resumo às `digestHour` no fuso da empresa só com não lidas, `List-Unsubscribe` + `List-Unsubscribe-Post` em todo e-mail, rede de segurança para jobs perdidos, limpeza diária.
5. **Telas** — sino com contador no trilho e no topo do celular, painel, página `/notificacoes`, preferências, descadastro, título da aba, estados. → `references/06-telas.md`
   - *Pronto quando*: sino com contador (99+) e painel com Não lidas/Todas, Hoje/Ontem/Anteriores, marcar todas, ações por item; página com filtros por app e tipo e rolagem infinita; preferências por tipo e canal agrupadas por app com e-mail geral e hora do resumo; página de descadastro com desfazer; todos os testids da seção "Contrato testável".
6. **Ligar os apps** — cada preset instalado passa a usar `notify()` e registra os seus tipos; app desligado some das notificações. → `references/04-catalogo.md`
   - *Pronto quando*: nenhum app grava `Notification` direto; cada app instalado registra os tipos da tabela do `04` e chama `notify()` nos eventos da tabela; notificações de app desligado não aparecem nem contam.
7. **Fechamento** — `references/07-checklist.md`, testes ponta a ponta e `/rodsaas:verify` (tem uma parte só das notificações: `-g "Notificações"`; ela usa os avisos da base, as rotas ★ de `03-api.md` e os testids de `06-telas.md`). Registrar `notificacoes` em `rodsaas.json → addons`.

## Princípios

- **Um serviço só.** Todo aviso passa pelo `notify()`; nenhum app grava `Notification` direto nem manda e-mail de aviso por conta própria. É assim que as regras (ator, acesso, preferência, agrupamento) valem para todos.
- **Aviso nasce com a mudança.** A notificação é gravada na mesma transação da ação; se a ação desfaz, o aviso some junto. E-mail sai depois, pela fila, e nunca derruba a ação.
- **Nunca avisar quem fez, nem quem não pode ver.** O ator nunca recebe; quem não é membro ativo ou não tem acesso ao registro (projeto privado, negócio de outro no modo "só os meus", formulário sem acesso) também não.
- **Menos barulho.** Eventos parecidos viram uma notificação; vários avisos prontos viram um e-mail; resumo vazio não é enviado; o que já foi lido no app não vai por e-mail.
- **A pessoa manda.** Cada tipo tem liga/desliga no app e no e-mail; todo e-mail tem "parar de receber" com um clique, sem login.
- **Ninguém lê aviso de outro.** Além do RLS por empresa, toda leitura e escrita filtra `userId` do usuário logado; id de outra pessoa = 404.
- **Texto seguro.** A frase vem em pedaços (`segments`) e o front monta com `<strong>`, nunca `innerHTML`; o e-mail escapa cada pedaço.

## Relatório final

O que foi adicionado (sino, página, preferências, descadastro), tipos registrados por app, como testar em 5 minutos (convidar alguém numa aba anônima → aceitar → ver o sino do owner com "Fulano entrou na empresa" → mudar o papel do convidado → ver a notificação e o e-mail dele no Mailpit → clicar em "parar de receber" no e-mail), variáveis a preencher em produção (`NOTIFICATIONS_UNSUBSCRIBE_SECRET`, URL pública da API para o descadastro), o resultado do `/rodsaas:verify`, o que ficou fora da v1 e desvios.

## Mapa das referências

| Arquivo | Quando ler |
|---|---|
| `references/01-escopo-e-integracao.md` | Fase 1: escopo, registro, env, fuso, casca |
| `references/02-modelo.md` | Fase 2: models, RLS, índices, migração do módulo antigo |
| `references/03-api.md` | Fase 3: `notify()`, `retract()`, rotas ★, erros, testes |
| `references/04-catalogo.md` | Fases 1 e 6: tipos da base e de cada app, quem recebe, chaves de agrupamento |
| `references/05-email-e-jobs.md` | Fase 4: imediato, resumo, descadastro, canais, limpeza |
| `references/06-telas.md` | Fase 5: sino, painel, página, preferências, descadastro, estados, testids |
| `references/07-checklist.md` | Fase 7 |
| `scripts/notifications-lib.mjs` + `notifications-lib.test.mjs` | catálogo, preferências, destinatários, agrupamento, prazo do e-mail, resumo no fuso, frase em pedaços, dia e hora relativos, contador, cursor, token de descadastro: porte para TS com os testes |
