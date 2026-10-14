---
name: workstation
description: Transforma um projeto rodsaas numa workstation (estilo Zoho One/Bitrix24) — cada empresa entra, faz um onboarding que pergunta o tipo de negócio e sugere os apps, testa tudo grátis por 14 dias, escolhe os apps que vai usar e paga por app (por pessoa que usa) ou o Completo por usuário, com plano grátis para começar. Cobre do cadastro ao cancelamento: links da landing com apps e plano, teste grátis sem cartão, loja de apps no painel, assinatura com vários itens na Stripe (ou modo de teste) e valor proporcional ao mudar, acesso por pessoa em cada app (cada acesso é um assento), apps bloqueados ficando só leitura sem perder dados, fim do teste, cobrança com problema, e os presets continuando a funcionar sem mudança. Use quando o usuário pedir workstation, cobrança por app, loja de apps, módulos à la carte, onboarding com escolha de apps, teste grátis, ou chamar /rodsaas:workstation.
---

# rodsaas · workstation

Muda o modelo comercial do projeto de **"um plano para tudo"** para **"cada empresa liga os apps que usa"**. A jornada inteira passa a ser:

```
landing (/precos, /apps/crm) ──▶ /cadastro?apps=crm,agenda&plano=completo&ciclo=anual
  cadastro (empresa nasce em TESTE de 14 dias, sem cartão, tudo liberado)
  └▶ /boas-vindas: tipo de empresa → apps sugeridos → convidar equipe → abre o primeiro app
       teste: banner com os dias, loja de apps, acesso por pessoa
       └▶ Assinatura: por app (pessoas por app) ou Completo (por usuário), mensal ou anual
            └▶ Stripe Checkout com um item por app (ou modo de teste)
                 ├ ligar/desligar app, mudar pessoas → valor proporcional (prévia antes)
                 ├ pagamento falhou → aviso, depois bloqueio
                 └ cancelar → no fim do período vira Grátis
  fim do teste sem assinar → Grátis: apps do grátis seguem; os outros ficam SÓ LEITURA (nada é apagado)
```

Os presets (CRM, Suporte, Agenda, Tarefas, Páginas, Forms e os próximos) **não mudam**: continuam pedindo `config: { feature }` e `config: { limit }`; a workstation calcula essas features e limites a partir dos apps ativos de cada empresa.

## Pré-requisitos

1. Base rodsaas com cobrança (`backend` Fase 5), casca de apps (`web/src/config/apps.ts`) e pelo menos dois apps instalados.
2. O catálogo do `/rodsaas:landing` (`skills/landing/assets/catalogo.json`): é a fonte dos preços sugeridos e da calculadora, a mesma no site e no painel. Se o projeto ainda não tem `site/`, use o catálogo direto da skill.
3. `/rodsaas:notificacoes` e `/rodsaas:email` (avisos de fim de teste, cobrança e convites).
4. Mesma regra de versões: `npm view` + doc atual da Stripe (assinatura com vários itens, prévia de fatura, preços por volume).

## Como trabalhar (obrigatório)

1. **Leia a referência da fase inteira antes de começar a fase**, do início ao fim, não por amostragem nem resumo. Cada fase aponta o arquivo (→ `references/...`).
2. **Tudo o que está nas referências é escopo**, exceto o que está marcado como fora do escopo. Nada de "versão simplificada", "básico por enquanto" ou "dá para melhorar depois": cobrança por app sem acesso por pessoa, teste sem fim de teste, loja sem valor proporcional ou bloqueio que apaga dados **não é** a workstation desta skill.
3. **O contrato testável (rotas ★ e testids) é o mínimo que o `/rodsaas:verify` consegue conferir, não o escopo.**
4. **Conferência ao fim de cada fase**: antes do commit, monte uma tabela com **cada item** da referência da fase e o status ✅ feito / ❌ faltando, com o arquivo onde está. Só avance com tudo ✅; o que não der para fazer vira pendência explícita no relatório final, com o motivo. Use o "Pronto quando" de cada fase abaixo como mínimo.
5. Se o usuário pedir para pular ou cortar algo, registre como desvio no relatório final.

## Projeto que já tem a workstation (revisão)

Se `rodsaas.json → addons` tem `workstation` (ou existe `api/src/modules/workstation`), rode em **modo revisão**: leia tudo, compare item a item, mostre a tabela de lacunas (comece pelo "Pronto quando" das fases 2, 3 e 4: é onde mais se simplifica — acesso por pessoa só na tela, prévia sem valor proporcional, fim do teste que não roda, bloqueio que esconde os dados) e complete fase por fase, **sem mexer em assinaturas existentes na Stripe** sem confirmação. Feche com `references/07-checklist.md` e o `/rodsaas:verify` (`-g "Workstation"`).

**Empresas que já existem** quando a workstation é instalada (migração, `references/06-integracao.md`): quem está no Free vira **Grátis** com um teste de 14 dias de presente; quem assina um plano pago **continua no plano antigo** (modelo `legacy`) até o owner escolher os apps — nada muda na cobrança sem ele pedir.

## Decisões padrão (confirme numa rodada só)

| Decisão | Padrão |
|---|---|
| Preços | os do catálogo (CRM R$ 39/vendedor, Suporte R$ 39/atendente, Agenda R$ 19/profissional, Tarefas R$ 12, Páginas R$ 9, Forms R$ 29/59 por empresa, Suíte RH R$ 5/colaborador mín. R$ 79, Completo R$ 69/usuário mín. 3) |
| Teste | **14 dias**, tudo liberado (como o Completo), **sem cartão**, até 10 pessoas |
| Grátis | até **2 pessoas**, apps Tarefas, Páginas e Forms (100 respostas/mês) |
| Anual | paga **10 meses** (2 grátis) |
| Por app | conta **cada pessoa com acesso** ao app (assento); apps por empresa (Forms) e Suíte RH (colaboradores) têm a própria unidade |
| App bloqueado | **só leitura**: vê e exporta; não cria nem edita; dados nunca apagados |
| Fim do teste sem assinar | vira Grátis; aviso 3 dias e 1 dia antes; o owner escolhe os apps a qualquer momento |
| Pagamento com problema | aviso no topo; a Stripe tenta de novo; se cancelar de vez, vira Grátis |
| Quem mexe na assinatura | só o **owner**; admin vê e gerencia o acesso das pessoas (sem mudar valor) |

Fora do escopo (registre no README): cupons e parceiros/revenda, cobrança por uso automática de WhatsApp (fica a cargo do add-on), nota fiscal (fora da v1, inclusive do `/rodsaas:financeiro`), apps de terceiros na loja.

## Fases

Cada fase termina com typecheck, lint, testes e commit (`feat(workstation): ...`).

1. **Modelo e regras** — porte do `workstation-lib` (com os testes) e do `catalog-lib` do landing, `config/workstation.ts` (preços do catálogo + `featureMap` montado do `config/plans.ts`), decisões confirmadas. → `references/01-modelo-e-decisoes.md`
   - *Pronto quando*: as duas libs portadas com todos os testes passando; `config/workstation.ts` com cada app disponível, preço, unidade e as features/limites de cada um (`buildFeatureMap` sem feature órfã); decisões gravadas no README.
2. **Cadastro, teste e onboarding** — empresa nasce em teste, `?apps=` e `?plano=` guardados, `/boas-vindas`, conteúdo inicial de cada app só quando ele é ligado, convites. → `references/02-cadastro-e-onboarding.md`
   - *Pronto quando*: cadastro cria a empresa em teste de 14 dias; onboarding com segmento, apps sugeridos (vindos da landing primeiro), convites e "Primeiros passos"; ligar um app roda o conteúdo inicial dele uma vez; empresa sem onboarding vai para `/boas-vindas`.
3. **Cobrança por app** — `Subscription` com modelo, `SubscriptionItem`, `AppAccess`, sync de produtos/preços na Stripe, checkout com vários itens, mudança com prévia e valor proporcional, assentos sincronizados com o acesso, fim do teste, webhooks e modo de teste. → `references/03-cobranca.md`
   - *Pronto quando*: todas as rotas ★ do `03`; checkout por app e Completo (Stripe e modo de teste); prévia com valor proporcional antes de qualquer mudança; dar/tirar acesso muda a quantidade; job do fim do teste; webhooks idempotentes; testes da API do `03` passando.
4. **Acesso e direitos** — `getEntitlements` da workstation, guard de app em todas as rotas dos apps, só leitura para bloqueado, acesso por pessoa, limite de pessoas do grátis e do teste. → `references/04-acesso-e-direitos.md`
   - *Pronto quando*: rota de app bloqueado responde 403 `APP_NOT_ACTIVE` em escrita e funciona em leitura; sem acesso → 403 `APP_ACCESS_DENIED` em tudo; presets sem nenhuma mudança nos guards; `GET /v1/me` com `workstation`.
5. **Telas** — cadastro com o que veio da landing, `/boas-vindas`, banner do teste, loja (Todos os apps + Configurações → Apps), Assinatura, acesso por pessoa, tela de app bloqueado, avisos e e-mails. → `references/05-telas.md`
   - *Pronto quando*: todas as telas e testids da seção "Contrato testável" do `05`; calculadora da Assinatura igual à da landing; prévia antes de confirmar; tudo funciona no celular.
6. **Integração e fechamento** — migração das empresas existentes, landing lendo os preços daqui, presets e módulos novos entrando na loja, notificações, `/rodsaas:verify -g "Workstation"`, `references/07-checklist.md`. → `references/06-integracao.md`
   - *Pronto quando*: migração testada (Free → Grátis com teste; pago → legacy intacto); `rodsaas.json → addons` com `workstation` e `billing.model: "apps"`; verify verde (a parte antiga de planos é pulada sozinha).

## Princípios

- **Experimentar sem atrito.** Teste com tudo, sem cartão; a pessoa conhece a integração entre os apps antes de pagar.
- **Paga pelo que usa, e vê antes de pagar.** Toda mudança mostra o valor novo e o proporcional antes de confirmar; nada é cobrado em silêncio.
- **Nunca refém dos dados.** Bloquear é só leitura; nada é apagado por falta de pagamento.
- **Uma conta só.** Site, painel e Stripe usam o mesmo catálogo e o mesmo cálculo (`quote`).
- **Os apps não sabem de cobrança.** Presets pedem feature e limite; quem decide é a workstation. App novo entra na loja sem mudar a cobrança.
- **Segurança da base, sem exceção.** RLS `FORCE` nas tabelas novas, idempotência nos pagamentos, só o owner mexe em valores.

## Relatório final

Modelo adotado e preços, como fica a jornada (com prints do onboarding e da assinatura), produtos/preços criados na Stripe (ou modo de teste), migração das empresas existentes, como testar em 5 minutos (cadastrar pela landing → onboarding → ligar um app → dar acesso a alguém → assinar no modo de teste → simular fim do teste), resultado do `/rodsaas:verify`, desvios.

## Mapa das referências

| Arquivo | Quando ler |
|---|---|
| `references/01-modelo-e-decisoes.md` | Fase 1: modelos, estados, jornada completa e casos de borda |
| `references/02-cadastro-e-onboarding.md` | Fase 2 |
| `references/03-cobranca.md` | Fase 3: dados, Stripe, rotas ★, erros, testes |
| `references/04-acesso-e-direitos.md` | Fase 4 |
| `references/05-telas.md` | Fase 5: telas e contrato testável |
| `references/06-integracao.md` | Fase 6: migração, landing, presets, módulos, notificações, verify |
| `references/07-checklist.md` | Fechamento |
| `scripts/workstation-lib.mjs` + `workstation-lib.test.mjs` | segmentos, teste, modelo efetivo, estado dos apps, direitos, acesso, assentos, itens, diferença, proporcional, featureMap: porte para TS com os testes (usa o `catalog-lib` do landing) |
