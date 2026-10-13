# Plano e cobrança (`/configuracoes/plano`)

Esta tela é onde o SaaS ganha dinheiro: tem que funcionar em **todas** as situações, inclusive sem Stripe configurada (modo de teste). Nunca esconda um botão em silêncio — se a pessoa não pode agir, diga por quê.

Dados: `GET /v1/me` (`plan`, `billing.mode`, `billing.canManage`), `GET /v1/billing/plans`, `GET /v1/billing/subscription` (owner/admin).

## Layout

1. **Aviso de modo** (`billing-mode-banner`), no topo, quando aplicável:
   - `fake`: "Modo de teste: as mudanças de plano são aplicadas na hora e nenhuma cobrança é feita." (cor de aviso, discreto)
   - `disabled`: "A cobrança ainda não foi configurada neste ambiente." (para o owner, com a dica de configurar a Stripe)
2. **Resumo da assinatura**: plano atual, ciclo (mensal/anual), status, próxima cobrança ou "termina em 12/11/2026" se cancelado, aviso de pagamento com problema, e **uso dos limites** (`usage-bar`, uma barra por limite: "3 de 5 membros").
3. **Ciclo de cobrança** (`billing-cycle-toggle`): Mensal | Anual — só se algum plano tiver preço anual; mostra a economia ("2 meses grátis", calculada dos preços).
4. **Cards dos planos** (`plan-card` com `data-plan`), na ordem da API: nome, descrição, preço do ciclo escolhido (formatado em R$, "/mês" ou "/ano"; "Grátis" no free), limites e features em lista, selo "Mais escolhido" (`highlight`), selo **Plano atual** (`plan-current`) e o botão de ação do card.
5. **Ações da assinatura** (owner, quem já assina): **Gerenciar cobrança** (`billing-portal`, só modo `stripe`), **Cancelar assinatura** (`billing-cancel`) ou **Retomar assinatura** (`billing-resume`) se o cancelamento estiver agendado.

## Botão de cada card (`plan-subscribe`, com `data-plan`)

| Quem / situação | Card do plano atual | Card de outro plano pago | Card do Free |
|---|---|---|---|
| **Owner no Free** | "Plano atual" (sem botão) | **Assinar {plano}** → checkout | — |
| **Owner com plano pago** | "Plano atual" | **Mudar para {plano}** (upgrade ou downgrade) → diálogo de troca | **Voltar para o Free** → mesmo fluxo de cancelar |
| **Owner, cancelamento agendado** | "Plano atual · termina em {data}" | **Mudar para {plano}** (retoma e troca) | — |
| **Admin** | "Plano atual" | sem botão; texto "Só o responsável pela {empresa} pode mudar o plano" (`billing-owner-only`) | idem |
| **Membro** | não acessa a tela: `forbidden-state` ("Fale com o responsável pela {empresa}") e o item some do menu | — | — |
| **Modo `disabled`** (owner) | "Plano atual" | botão **desabilitado** com tooltip "Cobrança não configurada" | — |

Todos os botões são `LoadingButton` (`disabled` + `aria-busy` durante a ação).

## Fluxos

### Assinar (saindo do Free)
1. Clique em **Assinar Pro** → `POST /v1/billing/checkout-sessions { plan, interval }` com `Idempotency-Key`.
2. Resposta `{ url }` → `window.location.assign(url)`.
   - modo `stripe`: vai para o Checkout da Stripe;
   - modo `fake`: a URL é a própria tela com `?status=success` (o plano já mudou).

### Voltar do pagamento (`?status=success` / `?status=canceled`)
- `success` + modo `fake`: toast "Plano Pro ativado" e atualiza `me` e a assinatura na hora.
- `success` + modo `stripe`: estado **`billing-pending`** "Confirmando seu pagamento…" e rebusca `me`/assinatura a cada 2 s por até ~30 s até o plano mudar → toast de sucesso. Não mudou no prazo, ou `subscription.pending === true`: "O pagamento foi recebido pela Stripe, mas a confirmação ainda não chegou. Isso costuma levar poucos minutos." (em dev, acrescente: "Confira se o `stripe listen` está rodando").
- `canceled`: toast neutro "Pagamento não concluído. Nada foi cobrado."
- Em todos os casos, remova o `?status` da URL ao final (`router.replace`).

### Mudar de plano (quem já assina)
1. **Mudar para Business** abre o **diálogo de troca** (`plan-change-dialog`) e busca a prévia (`GET /v1/billing/change-plan/preview`), com skeleton enquanto carrega.
2. O diálogo mostra: de → para, ciclo, **valor proporcional cobrado agora** (upgrade) ou crédito (downgrade), e a próxima cobrança.
3. **Downgrade acima do limite** (`overLimits` na prévia): aviso em destaque — "Vocês têm 8 membros e o plano Pro permite 3. Ninguém será removido, mas não será possível adicionar mais até ficar dentro do limite."
4. **Confirmar troca** (`plan-change-confirm`) → `POST /v1/billing/change-plan` → toast "Plano alterado para Business" → atualiza `me` e assinatura (limites e features mudam no app inteiro).

### Cancelar / voltar para o Free
`billing-cancel` (ou "Voltar para o Free") → `ConfirmDialog`: "A assinatura continua ativa até {data}. Depois disso, a {empresa} volta para o plano Free e os limites dele passam a valer." → `POST /v1/billing/cancel`. A tela passa a mostrar "termina em {data}" e o botão **Retomar** (`billing-resume`) → `POST /v1/billing/resume`.

### Gerenciar cobrança
`billing-portal` → `POST /v1/billing/portal-sessions` → redireciona ao portal da Stripe (cartão, faturas, dados de cobrança). Só aparece no modo `stripe` e quando já existe customer.

### Pagamento com problema
Banner global (já previsto) + na tela: "Não conseguimos cobrar o último pagamento" com **Atualizar forma de pagamento** (portal).

## Plano escolhido antes do cadastro

`/cadastro?plano=pro&ciclo=month` (vindo de uma página de preços ou link de divulgação):
- o cadastro mostra o plano escolhido num quadro ("Você está criando a conta no plano Pro — R$ 99/mês");
- após o cadastro com sucesso, chama `checkout-sessions` com o plano e redireciona para a URL (stripe: pagamento; fake: plano já aplicado e a pessoa vai para `/configuracoes/plano?status=success`);
- plano inválido ou free na URL: ignora e segue o cadastro normal.

## Erros

| code | Mensagem |
|---|---|
| `BILLING_NOT_CONFIGURED` | "A cobrança ainda não está disponível. Tente novamente mais tarde." |
| `ALREADY_SUBSCRIBED` | recarrega a assinatura e abre o diálogo de troca |
| `NOT_SUBSCRIBED` | recarrega e usa o fluxo de assinar |
| `SAME_PLAN` | "Este já é o seu plano." |
| `FORBIDDEN` | "Só o responsável pela {empresa} pode mudar o plano." |

## Estados da tela

Carregando: skeleton dos cards e do resumo. Erro ao carregar planos ou assinatura: `error-state` com tentar de novo. Planos sem preço anual: sem o seletor de ciclo. Tudo funciona em celular (cards empilhados).

## Testids (contrato)

`plan-card` (+`data-plan`), `plan-current`, `plan-subscribe` (+`data-plan`), `usage-bar`, `billing-mode-banner`, `billing-cycle-toggle`, `plan-change-dialog`, `plan-change-confirm`, `billing-cancel`, `billing-resume`, `billing-portal`, `billing-pending`, `billing-owner-only`.
