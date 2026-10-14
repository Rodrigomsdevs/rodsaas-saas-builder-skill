# 05 · Telas

Componentes, marca e estados da base. A calculadora e o texto de preço usam o mesmo `catalog-lib` da landing (porte no `web/`).

## Cadastro

- Lê `?apps=`, `?plano=`, `?ciclo=` e UTMs; mostra um quadro "Você vai testar **CRM** e **Agenda** grátis por 14 dias, sem cartão" (ou "Teste grátis de 14 dias com todos os apps" sem `apps`) e manda `intent` no cadastro.
- Depois do cadastro vai para `/boas-vindas` (não mais direto para o checkout como no modelo de planos). Sem onboarding feito, o Início do owner mostra o cartão `onboarding-resume`.

## `/boas-vindas` (`onboarding-wizard`)

- Tela cheia, sem casca, com o logo; progresso no topo (`onboarding-step`, `data-step`); voltar e pular (`onboarding-skip`).
- Passo 1: cartões de segmento (`onboarding-segment`, `data-segment`, `aria-pressed`) e tamanho (`onboarding-team-size`).
- Passo 2: cartões de app (`onboarding-app`, `data-app`, `aria-pressed`; "em breve" com `aria-disabled`), estimativa do mês (`onboarding-estimate`).
- Passo 3: e-mails (`onboarding-invite-email`, um campo por linha com "+ adicionar").
- Avançar `onboarding-next`; concluir `onboarding-finish` (`LoadingButton`) → vai para o primeiro app.
- Celular: um passo por tela, cartões em lista.

## Banner do teste e de cobrança (`trial-banner`)

- Faixa discreta no topo do conteúdo durante o teste: "Teste grátis: **12 dias** restantes" (`trial-days`) + **Escolher meus apps** (`trial-choose` → Assinatura). Nos 3 últimos dias, cor de aviso. Owner vê o botão; os outros veem "Fale com o responsável".
- Depois do teste no grátis: "O teste terminou. Apps fora do grátis estão só para leitura." + **Assinar**.
- `paymentIssue`: banner de erro "Não conseguimos cobrar o último pagamento" + **Atualizar pagamento** (portal).

## Loja de apps

A grade **Todos os apps** (`app-launcher`) e **Configurações → Apps** passam a ser a loja:

- Cartão (`app-store-card`, `data-app`, `data-state`: `active` | `trial` | `free` | `locked` | `soon` | `no-access`) com ícone, nome, tagline, preço (`priceLabel`) e o estado ("Ativo · 3 pessoas", "No teste", "Grátis", "Só leitura", "Em breve", "Sem acesso").
- Ações: **Ligar** (`app-activate`) — no por app abre a prévia (`ws-preview-dialog`) antes de criar o item; **Desligar** (`app-deactivate`) com confirmação e escolha de quando; **Pessoas** (`app-access-open`); **Pedir acesso** para quem não tem; **Quero ser avisado** nos "em breve".
- O interruptor `app-toggle` de Configurações → Apps continua existindo (desligar da interface), agora ao lado das ações de cobrança.

## Pessoas com acesso (`app-access-dialog`)

- Lista de membros com interruptor (`app-access-member`, `data-user`, `role="switch"`, `aria-checked`), busca e "todos".
- No por app, rodapé com os assentos e o efeito no valor: "3 de 3 assentos · R$ 117/mês" ou "4 pessoas: +1 assento, +R$ 39/mês" (`app-access-delta`); salvar (`app-access-save`) mostra a prévia com o proporcional quando passa dos assentos comprados e confirma.

## Assinatura (`/configuracoes/assinatura`, substitui `/configuracoes/plano`)

- Resumo (`ws-summary`): modelo, ciclo, itens (`ws-item`, `data-app`: nome, pessoas, preço, total, "sai em 12/11" se agendado), total do mês, próxima cobrança, aviso de modo de teste (`billing-mode-banner` da base).
- Escolha do modelo: **Por app** (`ws-model-apps`) · **Completo** (`ws-model-completo`), com alternância mensal/anual (`ws-cycle`, "2 meses grátis").
- Calculadora (por app): cada app disponível com interruptor (`ws-app-toggle`, `data-app`) e pessoas (`ws-seats`, `data-app`; pré-preenchido com o número de pessoas com acesso), colaboradores para a Suíte RH (`ws-employees`), total (`ws-total`), recomendação (`ws-best`: "No Completo sairia R$ X").
- Pré-preenchida no primeiro acesso com os apps ligados e o `intent` da landing.
- Botão principal (`ws-checkout`): "Assinar" (sem assinatura → checkout) ou "Revisar mudanças" (com assinatura → prévia `ws-preview-dialog` com o valor proporcional e `ws-preview-confirm`).
- Ações: cancelar (`ws-cancel`) / retomar (`ws-resume`), gerenciar pagamento (`billing-portal`).
- Admin vê tudo sem os botões de valor (`billing-owner-only`); membro não acessa.
- `/configuracoes/plano` redireciona para cá.

## App bloqueado (`app-locked`)

- Ao abrir um app `locked`: o app funciona em leitura, com faixa fixa no topo "Este app está só para leitura: assine para voltar a criar e editar" + **Assinar o <app>** (`app-locked-cta`, owner) ou "Fale com o responsável" (outros). Botões de criar/editar desabilitados com tooltip, e qualquer 403 `APP_NOT_ACTIVE` mostra o mesmo aviso (nunca um erro genérico).
- Sem acesso (`APP_ACCESS_DENIED`): tela "Você não tem acesso ao <app>" (`app-no-access`) com **Pedir acesso**.

## Avisos e e-mails

| Quando | Para | Como |
|---|---|---|
| 3 e 1 dia antes do fim do teste | owners | notificação `billing.trial_ending` + e-mail com resumo e botão |
| teste terminou | owners | notificação + e-mail |
| app ligado/desligado, pessoas mudaram (com valor) | owners | entrada no `AuditLog` + e-mail de confirmação do novo valor |
| pedido de acesso a um app | owners | notificação (tipo novo `workstation.access_requested`, registrado no catálogo de notificações) |
| pagamento falhou | owners | o da base (`billing.payment_failed`) |

## Contrato testável

| Testids | Onde |
|---|---|
| `onboarding-resume` | cartão no Início enquanto o onboarding não foi feito |
| `onboarding-wizard`, `onboarding-step`, `onboarding-segment`, `onboarding-team-size`, `onboarding-app`, `onboarding-estimate`, `onboarding-invite-email`, `onboarding-next`, `onboarding-finish`, `onboarding-skip` | `/boas-vindas` |
| `trial-banner`, `trial-days`, `trial-choose` | banner |
| `app-store-card`, `app-activate`, `app-deactivate`, `app-access-open` | loja |
| `app-access-dialog`, `app-access-member`, `app-access-delta`, `app-access-save` | pessoas com acesso |
| `ws-summary`, `ws-item`, `ws-model-apps`, `ws-model-completo`, `ws-cycle`, `ws-app-toggle`, `ws-seats`, `ws-employees`, `ws-total`, `ws-best`, `ws-checkout`, `ws-preview-dialog`, `ws-preview-confirm`, `ws-cancel`, `ws-resume` | assinatura |
| `app-locked`, `app-locked-cta`, `app-no-access` | app bloqueado / sem acesso |
