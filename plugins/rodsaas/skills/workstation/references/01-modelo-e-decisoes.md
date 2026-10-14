# 01 · Modelo, estados e jornada

## Modelos de uma empresa

| Modelo | Como entra | Apps | Pessoas | Cobra |
|---|---|---|---|---|
| `trial` | todo cadastro novo (14 dias) | todos os disponíveis (menos os de uso) | até 10 | nada |
| `free` | fim do teste sem assinar, cancelamento, pagamento cancelado de vez | só os do grátis (Tarefas, Páginas, Forms com 100 respostas); o resto **só leitura** | até 2 | nada |
| `apps` | assinou por app | os assinados (cada um com as pessoas que têm acesso) + os do grátis com os limites do grátis | sem limite (cada assento é pago) | soma dos itens |
| `completo` | assinou o Completo | todos os disponíveis (menos os de uso) | sem limite | usuários × R$ 69 (mín. 3) |
| `legacy` | empresa que já pagava um plano antigo quando a workstation foi instalada | como o plano antigo | como o plano antigo | o plano antigo, até o owner migrar |

`effectiveModel()` resolve o modelo **agora** (teste vencido = `free`; assinatura cancelada = `free`; `past_due` mantém com `paymentIssue`). `legacy` usa o `getEntitlements` antigo da base, intacto.

## Estado de cada app (`appStates`)

| Estado | Quando | O que a pessoa consegue |
|---|---|---|
| `active` | item pago do app (ou da suíte), Completo, ou app incluído | tudo (com as features e limites do app pago) |
| `trial` | modelo `trial` | tudo |
| `free` | app do grátis fora de um item pago | tudo, com os limites do grátis |
| `locked` | o resto | **só leitura** (vê e exporta); escrita → 403 `APP_NOT_ACTIVE`; a tela mostra o aviso com o botão de assinar |

Separado disso: o app pode estar **desligado da interface** pela empresa (`disabledApps`, como hoje) e a pessoa pode **não ter acesso** ao app (`AppAccess`) → 403 `APP_ACCESS_DENIED` em qualquer método.

## Jornada completa (o que precisa existir em cada passo)

| # | Momento | O que acontece | Referência |
|---|---|---|---|
| 1 | Landing | CTA leva a `/cadastro?apps=…&plano=…&ciclo=…&utm_*` | landing `03-estrutura.md` |
| 2 | Cadastro | mostra o que veio da landing ("Você vai testar CRM e Agenda"); cria usuário + empresa em `trial` (14 dias); guarda `apps`, `plano`, `ciclo` e UTMs em `WorkstationProfile` | `02` |
| 3 | Confirmação de e-mail | como na base (não bloqueia o uso) | backend `04-auth.md` |
| 4 | Onboarding | segmento + tamanho → apps sugeridos (landing primeiro) → convites → liga os apps (conteúdo inicial de cada um), fixa no trilho, abre o primeiro | `02` |
| 5 | Teste | banner com os dias; loja; acesso por pessoa; "Primeiros passos" no Início | `05` |
| 6 | 3 e 1 dia antes do fim | notificação `billing.trial_ending` + e-mail para os owners com o resumo do uso e o link da Assinatura | `03` |
| 7 | Assinar | Assinatura com a calculadora (`quote`), pré-preenchida com os apps ligados e as pessoas com acesso (e com o `plano`/`ciclo` da landing) → checkout | `03`, `05` |
| 8 | Usando | ligar app (item novo), dar/tirar acesso (quantidade), trocar faixa do Forms, mudar para Completo e voltar — sempre com prévia | `03` |
| 9 | Fim do teste sem assinar | job muda para `free`; apps fora do grátis ficam só leitura; pessoas além de 2 continuam entrando (ninguém é expulso), mas não dá para convidar mais | `03`, `04` |
| 10 | Pagamento falhou | `paymentIssue` → banner global "Atualize a forma de pagamento"; a Stripe tenta de novo; cancelado de vez → `free` | `03` |
| 11 | Cancelar | no fim do período vira `free`; retomar antes disso desfaz | `03` |
| 12 | Voltar a assinar | dados continuam lá; app volta a `active` na hora | `03` |

## Casos de borda (decididos)

| Caso | Decisão |
|---|---|
| Empresa no grátis com 5 pessoas (vieram do teste) | ninguém perde acesso à conta; só não dá para convidar mais (`PLAN_LIMIT_REACHED` com `limit: members`) até assinar ou remover pessoas |
| Assentos comprados × usados | a quantidade do item é **max(comprados, pessoas com acesso)**: dá para comprar assentos a mais (dar acesso depois sem nova cobrança); dar acesso além do comprado aumenta a quantidade (com prévia e confirmação); tirar acesso libera o assento, e o owner reduz a quantidade na Assinatura (nunca abaixo de quem tem acesso) |
| Tirar o acesso da última pessoa de um app assinado | pergunta se quer **remover o app da assinatura** (item sai no fim do período, ou na hora com crédito proporcional — padrão: fim do período) |
| Membro removido da empresa | sai de todos os `AppAccess` (o assento fica livre; a quantidade só muda se o owner reduzir) |
| Owner sem acesso a um app | pode se dar acesso (é ele quem paga); a loja mostra o app mesmo sem acesso |
| Desligar app da interface (`disabledApps`) com item pago | pergunta se quer também tirar da assinatura; desligar não cancela cobrança sozinho |
| Completo → por app | prévia mostra o novo total; os apps sem item ficam `locked` no fim do período (padrão) ou na hora |
| Por app → Completo | troca imediata com valor proporcional |
| Mensal ↔ anual | troca no próximo ciclo (padrão) ou na hora com proporcional (Stripe) |
| App novo instalado no projeto | aparece na loja como disponível; no Completo e no teste já vem ativo; no por app, `locked` até assinar |
| App "em breve" | na loja com selo e "Quero ser avisado" (lista de espera da landing) |
| Suíte RH com 8 colaboradores | cobra o mínimo (R$ 79); a prévia explica |
| Forms passou do limite da faixa | respostas além do limite são recusadas no formulário público com mensagem amigável; aviso ao owner com o botão para subir de faixa (o Forms já faz isso com `forms.limit`) |
| Modo de cobrança `disabled` (produção sem Stripe) | teste e grátis funcionam; botões de assinar desabilitados com "Cobrança não configurada" |

## `config/workstation.ts`

```ts
import catalog from './catalogo.json'               // cópia do catálogo do landing (preços confirmados com o dono)
import { plans, PLAN_ORDER } from './plans'
import { buildFeatureMap } from '../modules/workstation/lib'

export const workstation = {
  catalog,                                          // apps, categorias, pricing (free, completo, suites, anual)
  trialDays: 14,
  trialMaxUsers: 10,
  featureMap: buildFeatureMap(plans, PLAN_ORDER),   // features/limites de cada app (do plano mais alto) e do grátis
  onboarding: { maxSuggested: 4 },
}
```

- Disponível = app registrado no projeto (`rodsaas.json → apps` / presets e add-ons instalados); o resto do catálogo aparece como "em breve".
- **Mudar preço** = editar `catalogo.json` e rodar `npm run billing:sync` (preço novo para novas assinaturas; quem já assina continua no antigo, como a Stripe recomenda). O `/rodsaas:landing` copia os preços daqui na próxima rodada.
- Conferir no boot: toda feature e limite do `plans.ts` tem dono no `featureMap` (o `classifyFeature` manda o que não reconhece para `_paid`; liste no log o que caiu lá para o dono decidir).
