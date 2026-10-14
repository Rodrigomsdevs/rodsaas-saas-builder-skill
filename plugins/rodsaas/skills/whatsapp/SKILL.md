---
name: whatsapp
description: Add-on que dá ao projeto rodsaas um motor de WhatsApp com drivers trocáveis — o projeto guarda conversas, mensagens, janela de 24 h, modelos com variáveis, descadastro (PARAR/VOLTAR), status que só anda para frente, roteamento do que chega para o app certo, fila com nova tentativa e webhook assinado; cada provedor é só um driver com o mesmo contrato (driver falso para dev e testes agora; Meta Cloud API, Zenvia e RodTicket depois). Liga na Agenda (confirmação e lembrete com resposta "1 = confirmo"), no CRM (conversa na linha do tempo), no Suporte (WhatsApp como canal de chamado), no Comercial e no Financeiro. Use quando o usuário pedir WhatsApp, mandar mensagem automática, confirmar agendamento pelo WhatsApp, atender pelo WhatsApp, integrar com a API da Meta/Zenvia/RodTicket num projeto rodsaas, ou chamar /rodsaas:whatsapp.
---

# rodsaas · whatsapp

Um **motor** de WhatsApp para todos os apps do projeto. O motor é dono das regras e dos dados; o provedor é só a peça que transmite. Trocar de provedor (ou ter um por empresa) não mexe em nenhum app.

```
app ── whatsapp.send({ orgId, to, text | template, ref: { app, entity, id } }) ──▶ motor
        número (normalizePhone) · descadastrado? · janela (windowState/chooseSendMode) · modelo (renderTemplate)
        → WhatsAppMessage QUEUED → fila wa.send → driver da empresa (fake | meta | zenvia | rodticket).send()
        → SENT (providerMessageId) | erro → normalizeError → retryDelay | FAILED
provedor ── POST /v1/public/whatsapp/webhook/<token> (corpo cru + assinatura) ──▶ driver.verifyWebhook + parseWebhook
        → eventos internos: message (entrada) | status → dedupe pelo id do provedor
        entrada: abre a janela · PARAR/VOLTAR · routeInbound → handler do app (Agenda, Suporte, CRM…) ou caixa
        status: nextStatus (só para frente)
```

## Antes de começar

- Projeto rodsaas com `api/` e `web/` verdes, fila pg-boss e o add-on `notificacoes` (avisos para a equipe).
- **Não precisa de conta em provedor nenhum**: a instalação sai com o driver **falso** (`fake`), que simula envio, entrega, leitura, resposta e erros — é o que o dev e o `/rodsaas:verify` usam. O provedor de verdade é escolha do usuário, perguntada uma vez; credenciais só ele informa.
- Mesma regra de versões das outras skills (`npm view` + doc atual do provedor ao escrever um driver real).

## Como trabalhar (obrigatório)

1. **Leia a referência da fase inteira antes de começar a fase**, do início ao fim. Cada fase aponta o arquivo (→ `references/...`).
2. **Tudo o que está nas referências é escopo**, exceto o que está marcado como fora. Nada de "versão simplificada": mandar direto para a API do provedor sem a fila, sem a janela de 24 h, sem descadastro, webhook sem assinatura ou status que volta para trás **não é** o motor desta skill. **Nenhum app chama provedor direto** — sempre `whatsapp.send()`.
3. **O contrato testável (rotas ★, testids) é o mínimo que o `/rodsaas:verify` confere, não o escopo.**
4. **Conferência ao fim de cada fase**: tabela com cada item da referência e ✅/❌ com o arquivo; só avance com tudo ✅ (o resto vira pendência no relatório). Use o "Pronto quando" como mínimo.
5. Se o usuário pedir para pular algo, registre como desvio no relatório final.

## Projeto que já tem WhatsApp (revisão)

Se `rodsaas.json → addons` tem `whatsapp`, ou o projeto já manda WhatsApp (chamada direta a uma API de provedor, links `wa.me` espalhados), rode em **modo revisão**: leia todas as referências, monte a tabela de lacunas (comece pelo "Pronto quando" das fases 1 e 2: chamada direta ao provedor sem driver, sem janela, sem descadastro, webhook sem assinatura) e complete fase por fase. A integração que existe vira um **driver** (nada se perde); links `wa.me` dos apps continuam como o nível "sem motor" quando a empresa não conectou nada. Feche com `references/04-checklist.md` e `/rodsaas:verify -g "WhatsApp"`.

## Decisões padrão (confirme numa rodada só)

| Decisão | Padrão |
|---|---|
| Driver na instalação | **falso** (`fake`); os reais entram quando o usuário escolher (`references/01-motor-e-drivers.md` diz como escrever cada um) |
| Um número por empresa | sim (cada empresa conecta o próprio; a conexão guarda driver, número e credenciais criptografadas) |
| Modelos do sistema | criados na conexão: `agenda_confirmacao`, `agenda_lembrete`, `agenda_sinal`, `espera_vaga`, `cobranca_link`, `suporte_atualizacao` (categoria UTILITY, pt_BR) |
| Para onde vai o que chega | resposta a mensagem nossa → app que mandou; senão o último app em 72 h; senão chamado aberto (Suporte); senão o app padrão da empresa; senão a caixa do WhatsApp |
| Descadastro | "PARAR"/"SAIR"/"STOP" param tudo daquele número na empresa (menos o que o próprio cliente pedir depois); "VOLTAR" reativa |
| Planos | add-on da base: limite `whatsappMessagesMonthly` (Free 100, Pro 5.000, Business 50.000); o custo do provedor é da empresa |

Fora (registre no README): chamadas de voz, grupos, catálogo/carrinho do WhatsApp, chatbot com IA, campanhas em massa de marketing (só mensagens ligadas a um atendimento ou a um cliente com relação), WhatsApp não oficial por QR Code dentro do motor (pode ser um driver de terceiro, por conta e risco da empresa).

## Fases

Cada fase termina com typecheck, lint, testes e commit (`feat(whatsapp): ...`).

1. **Motor** — porte do `whatsapp-lib` (com os testes), models, serviço `whatsapp.send()`, fila `wa.send` com `retryDelay`, registro de drivers (`validateDriver`) e o driver **falso**. → `references/01-motor-e-drivers.md`
   - *Pronto quando*: `send` passa por número, descadastro, janela e modelo antes de enfileirar; driver falso com envio, status, resposta e erros simuláveis; nova tentativa só nos erros que repetem; limite mensal.
2. **API e webhook** — conexão, modelos, conversas, mensagens, webhook público assinado com dedupe e roteamento. → `references/02-api-e-webhook.md`
   - *Pronto quando*: rotas ★; webhook confere a assinatura no corpo cru antes de tudo, ignora repetido, status pelo `nextStatus`, PARAR/VOLTAR, `routeInbound` com handlers dos apps.
3. **Telas e apps** — Configurações → WhatsApp (conexão, modelos), caixa de conversas, e as ligações com Agenda, CRM, Suporte, Comercial e Financeiro. → `references/03-telas-e-integracoes.md`
   - *Pronto quando*: conectar e testar pela tela; caixa com janela aberta/fechada e resposta; Agenda manda a confirmação e o lembrete e entende "1"; os outros apps ligados conforme a referência (ou com a pendência explicada se o app não está instalado).
4. **Fechamento** — `references/04-checklist.md`, `rodsaas.json → addons` com `whatsapp`, README (como trocar de driver, variáveis), `/rodsaas:verify -g "WhatsApp"`.

## Princípios

- **Motor dono das regras, driver só transmite.** Janela, descadastro, modelos, status e roteamento são do motor; o driver traduz para o provedor e de volta.
- **Webhook é porta aberta.** Assinatura no corpo cru antes de qualquer coisa; repetido não reprocessa; erro nosso nunca vira 500 em loop.
- **Respeito ao cliente.** Nada de mensagem sem relação; descadastro vale na hora para todos os apps.
- **Nada se perde.** O que chega e ninguém pegou fica na caixa; mensagem que falhou mostra o motivo em português e o botão de tentar de novo.

## Relatório final

Driver ativo (e como trocar), número conectado, modelos criados e o status de cada um, apps ligados, limite do plano, variáveis que faltam, resultado do `/rodsaas:verify -g "WhatsApp"`, desvios.

## Mapa das referências

| Arquivo | Quando ler |
|---|---|
| `references/01-motor-e-drivers.md` | Fase 1: modelo de dados, serviço, fila, contrato do driver, driver falso, como escrever Meta/Zenvia/RodTicket |
| `references/02-api-e-webhook.md` | Fase 2: rotas ★, webhook, dedupe, roteamento, erros |
| `references/03-telas-e-integracoes.md` | Fase 3: telas, testids, ligação com cada app |
| `references/04-checklist.md` | Fase 4 |
| `scripts/whatsapp-lib.mjs` + `whatsapp-lib.test.mjs` | telefone, janela, modo de envio, modelos, status, descadastro, respostas rápidas, texto longo, erros por driver, nova tentativa, assinatura, roteamento, contrato do driver: porte para TS com os testes |
