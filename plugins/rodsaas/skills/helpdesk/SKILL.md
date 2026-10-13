---
name: helpdesk
description: Preset que soma ao projeto rodsaas o app Suporte, um helpdesk de atendimento ao cliente no estilo Zendesk/Freshdesk/Movidesk — chamados com número, status, prioridade, fila e responsável, vindos do e-mail (caixa conectada por IMAP/SMTP ou webhook de recebimento, com encadeamento das respostas e sem loop de resposta automática), do portal de ajuda, do widget no site, da API com chave e criados pela equipe; caixa de entrada com visões e contadores, conversa com resposta pública e nota interna, @menções, respostas prontas (macros), anexos, aviso de colisão, mesclar chamados, SLA com horário comercial e feriados (pausa quando aguarda o cliente), distribuição automática (rodízio ou por carga), gatilhos automáticos, pesquisa de satisfação (CSAT), fechamento automático, portal do cliente com base de conhecimento (busca em português, "isso ajudou?", sugestões antes de abrir chamado) e acompanhamento pelo link sem senha, relatórios, CRM, Forms e webhooks. Use depois do /rodsaas:backend e /rodsaas:frontend quando o usuário pedir helpdesk, suporte, atendimento ao cliente, chamados, tickets, central de ajuda, base de conhecimento, SAC, clone do Zendesk/Freshdesk/Movidesk, ou chamar /rodsaas:helpdesk.
---

# rodsaas · helpdesk

Acrescenta ao projeto o app **Suporte**: tudo o que os clientes da empresa pedem (por e-mail, pelo portal de ajuda, pelo widget do site ou pela API) vira um **chamado** com número, dono e prazo, e a equipe atende numa caixa de entrada única até resolver. O cliente acompanha pelo link, sem senha, e encontra respostas sozinho na base de conhecimento. O preset **soma**: entra como um app na casca de apps (`skills/frontend/references/12-casca-e-apps.md`), sem mexer nos outros apps.

Tudo da base continua valendo: auth, empresas com RLS, membros, planos, padrão REST, erros RFC 9457, cursor, OpenAPI → tipos do front, estados de tela, marca, contrato de testids.

## Pré-requisitos

1. `api/`, `web/` e `rodsaas.json` verdes e já na casca de apps (existe `web/src/config/apps.ts`; senão, `/rodsaas:apps` antes).
2. Add-on **`uploads`** para anexos: se `rodsaas.json` não tiver `uploads`, rode as fases do `/rodsaas:uploads` antes (como o `tarefas` e o `crm` fazem).
3. Fila de jobs da base (pg-boss) rodando: e-mails, leitura das caixas IMAP, prazos de SLA, fechamento automático e webhooks dependem dela.
4. Mesma regra de versões das outras skills: `npm view` + doc atual para cada pacote novo (`imapflow`, `mailparser`, `nodemailer` se ainda não houver, `sanitize-html`, editor de texto rico — o mesmo do Notion/Tarefas se o projeto já tiver, senão TipTap).
5. Se o preset `forms` existir, reaproveite o `forms-lib` dele para os **campos do chamado** e a assinatura dos webhooks; se não existir, copie `skills/forms/scripts/forms-lib.mjs` (com os testes) para o projeto.

## Decisões padrão (confirme numa rodada só)

| Decisão | Padrão |
|---|---|
| Nome do app | **Suporte** (rotas `/suporte/...`) |
| Canais na v1 | **e-mail** (caixa conectada por IMAP/SMTP, ou webhook de recebimento de Postmark/Mailgun/SendGrid/Cloudflare), **portal de ajuda**, **widget** no site do cliente, **API com chave** e chamado criado pela equipe (telefone, balcão) |
| WhatsApp e chat ao vivo | fora da v1; o ponto de extensão `ingestMessage(channel, ...)` fica pronto para o add-on `whatsapp` |
| Status | Aberto · Aguardando cliente · Em espera · Resolvido · Fechado (fechado é definitivo; resposta depois disso abre um chamado novo ligado ao antigo) |
| Prioridades | Baixa · Normal · Alta · Urgente |
| Filas | uma fila "Suporte" pronta; a empresa cria outras ("Financeiro", "Técnico") com seus atendentes |
| Quem atende | membros marcados como **atendentes** (o owner já nasce atendente); quem não é atendente não vê o app |
| Visibilidade | todos os atendentes veem todos os chamados (opção: só os das suas filas) |
| SLA | metas por prioridade em **horário comercial** (seg–sex 08–12 e 13–18, fuso da empresa, feriados nacionais), Urgente contando 24 h; o prazo de solução **pausa** enquanto aguarda o cliente |
| Distribuição | manual por padrão; automática por fila (rodízio ou por carga) com o botão "Disponível" de cada atendente |
| Fechamento automático | Resolvido vira Fechado depois de **4 dias** sem resposta do cliente |
| Pesquisa de satisfação | 👍/👎 com comentário, enviada ao resolver |
| Endereços públicos | portal `/ajuda/<empresa>` (artigos, abrir chamado, meus chamados) e o chamado do cliente em `/chamado/<token>`, no domínio do painel |
| Planos | Free: 2 atendentes, 1 caixa de e-mail, 100 chamados/mês; Pro: 10 atendentes, 5 caixas, 5.000/mês, SLA, automações, CSAT, integrações, sem rodapé; Business: atendentes e caixas ilimitados, 50.000/mês |

Fora da v1 (registre no README do projeto): chat ao vivo e WhatsApp (add-on), telefonia/URA, redes sociais, chamados filhos/dividir chamado, aprovações, central com domínio próprio do cliente (CNAME), vários idiomas na base de conhecimento, assistente de IA para sugerir respostas, contrato de horas por cliente.

## Fases

Cada fase termina com typecheck, lint, build, testes da fase e commit (`feat(helpdesk): ...`). Não avance com fase quebrada. Use a lista de tarefas.

1. **Integração e regras** — registro do preset e do **app Suporte**, papéis, planos, porte de `scripts/helpdesk-lib.mjs` (com os testes) para o back: horário comercial, SLA, encadeamento de e-mail, distribuição e gatilhos saem dali. → `references/01-escopo-e-integracao.md`
2. **Modelo** — models com RLS, numeração por empresa sem buracos nem repetição, tokens do cliente, tabelas de busca pública sem RLS, busca em português, conteúdo inicial. → `references/02-modelo.md`
3. **API interna** — chamados, mensagens, visões, filas, atendentes, macros, gatilhos, SLA, contatos, base de conhecimento, relatórios. → `references/03-api.md`
4. **API pública e e-mail** — portal, chamado pelo token, respostas e CSAT do cliente, recebimento de e-mail (IMAP e webhook), envio com encadeamento, API com chave. → `references/03-api.md` e `references/06-email-e-integracoes.md`
5. **Portal e widget** — central de ajuda, artigos, abrir chamado com sugestões, chamado do cliente, meus chamados, widget. → `references/04-portal-e-widget.md`
6. **App interno** — caixa de entrada, chamado (conversa, resposta, painel lateral), contatos, base de conhecimento, relatórios, configurações. → `references/05-app-interno.md`
7. **E-mail e integrações** — caixas de e-mail, avisos, SLA e fechamento automático na fila, CRM, Forms, webhooks. → `references/06-email-e-integracoes.md`
8. **Interações e estados** — atalhos, otimismo, colisão, todos os estados. → `references/07-interacoes-e-estados.md`
9. **Fechamento** — `references/08-checklist.md`, testes ponta a ponta, `/rodsaas:verify` (tem uma parte só do Suporte: `-g "Helpdesk"`; ela exige os testids de `05-app-interno.md` e `04-portal-e-widget.md`, os rótulos do formulário do portal e os formatos ★ de `03-api.md`), README do projeto.

## Princípios

- **Nenhum pedido se perde.** Todo e-mail recebido vira chamado ou entra no chamado certo; erro ao processar fica numa lista de "e-mails com problema" com reprocessar, nunca some. Confirmação para o cliente sempre com o número.
- **O cliente não precisa de conta.** Abrir, acompanhar, responder e avaliar funcionam pelo link com token secreto (um por destinatário) ou respondendo o e-mail.
- **Prazo é a régua.** SLA calculado pelo `helpdesk-lib` (fuso, almoço, fim de semana, feriado, pausa); a caixa de entrada ordena pelo que vence primeiro.
- **Sem loop de e-mail.** Respostas automáticas, listas e devoluções nunca geram confirmação; nossos próprios endereços nunca abrem chamado; limite de confirmações por remetente.
- **Nota interna nunca vaza.** Nota não vai por e-mail, não aparece no portal, no widget, na API pública nem nos webhooks públicos.
- **Segurança da base, sem exceção.** RLS `FORCE` em tudo (as tabelas de busca pública sem RLS guardam só slug/hash → ids, com justificativa no README); HTML de e-mail sempre sanitizado e imagens externas bloqueadas até o atendente pedir; senhas de caixa criptografadas; tokens e chaves só como hash.
- **Todo estado tem tela e toda ação tem feedback** (`references/07-interacoes-e-estados.md`).

## Relatório final

O que foi adicionado (app, telas, endereços públicos), planos e limites novos, como testar em 5 minutos (abrir um chamado pelo portal numa aba anônima → ver a confirmação no Mailpit → responder pela caixa de entrada → responder como cliente pelo link do e-mail → resolver → avaliar), como conectar a caixa de e-mail real (IMAP/SMTP ou webhook do provedor), o resultado do `/rodsaas:verify`, o que ficou fora da v1 e desvios por versão de pacote.

## Mapa das referências

| Arquivo | Quando ler |
|---|---|
| `references/01-escopo-e-integracao.md` | Fase 1: escopo, app na casca, papéis, planos |
| `references/02-modelo.md` | Fase 2: models, numeração, tokens, busca, conteúdo inicial |
| `references/03-api.md` | Fases 3 e 4: rotas internas e públicas, regras, erros, testes |
| `references/04-portal-e-widget.md` | Fase 5 |
| `references/05-app-interno.md` | Fase 6 |
| `references/06-email-e-integracoes.md` | Fases 4 e 7 |
| `references/07-interacoes-e-estados.md` | Fase 8 |
| `references/08-checklist.md` | Fase 9 |
| `scripts/helpdesk-lib.mjs` + `helpdesk-lib.test.mjs` | horário comercial, SLA (prazos, situação, pausa), estados, e-mail (endereços, assunto, encadeamento, citação, resposta automática), distribuição, gatilhos, macros, CSAT, relatórios, busca: porte para TS com os testes |
