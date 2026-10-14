# 06 · Integração e migração

## Empresas que já existem

Migration de dados (idempotente, com relatório):

| Situação | Vira |
|---|---|
| Free da base | `model: free` + **teste de 14 dias de presente** (`model: trial`, `trialEndsAt`), `onboardingCompletedAt` preenchido (não força o onboarding) e aviso "Conheça os apps: teste grátis liberado" |
| Plano pago ativo da base | `model: legacy` (continua no plano e no preço antigos; nada muda na Stripe). A Assinatura mostra "Você está no plano Pro antigo" com **Migrar para os apps** (prévia do novo valor; a troca cancela a assinatura antiga e cria a nova com crédito proporcional) |
| Conteúdo inicial já criado | `AppActivation` para os apps que têm dados (não roda de novo) |
| Membros | `AppAccess` para todos os membros em todos os apps ligados (ninguém perde acesso na migração) |

## Base (backend e frontend)

- `rodsaas.json → billing.model: "apps"` (sem o campo = `"plans"`, o modelo antigo).
- `config/plans.ts` continua existindo: é de onde sai o `featureMap` e o que vale para `legacy`.
- `GET /v1/billing/plans` continua respondendo (planos antigos, para `legacy`); as telas novas usam `/v1/workstation/catalog`.
- `/configuracoes/plano` → redireciona para `/configuracoes/assinatura`.
- A tela de planos da base (`frontend/references/11-plano-e-cobranca.md`) só existe para `legacy`.

## Landing

- O `/rodsaas:landing` lê preços e regras de `api/src/config/catalogo.json` (o mesmo que a workstation usa) e a calculadora do site dá o mesmo valor que a Assinatura.
- CTAs: `/cadastro?apps=…&plano=…&ciclo=…` (o `intent` do cadastro).

## Presets e módulos

- Cada preset registra: `registerAppRoutes(appId, prefixos)`, `registerAppActivation(appId, gancho)` e as features/limites dele já entram pelo `featureMap` (prefixos de `FEATURE_PREFIXES`; preset novo com feature de outro nome → acrescente o prefixo).
- **Unidade que não é "pessoa com acesso"**: o preset registra `registerSeatCounter(appId, (tx, orgId) => número)` e a quantidade comprada do item é comparada com esse contador em vez do `AppAccess` (mesmo `CONFIRM_REQUIRED` quando passa). Hoje: Suíte RH (`/rodsaas:rh`) conta **colaboradores ativos** (`countBillableEmployees`) e o acesso ao app Pessoas vem de ser colaborador (`hasPessoasAccess`), sem `AppAccess`. O Financeiro (`/rodsaas:financeiro`, cobrado por empresa) também não usa `AppAccess`: o acesso vem do papel do app (`hasFinanceiroAccess`), e o webhook das cobranças fica fora do guard. O Comercial (`/rodsaas:comercial`, cobrado por vendedor) conta quem tem papel `SELLER` ou `COM_ADMIN` (`countComSellers`), com o acesso pelo papel (`hasComercialAccess`); as páginas públicas de proposta, assinatura e verificação ficam fora do guard.
- Jobs que mandam algo para fora (lembretes da Agenda, avisos do Suporte, webhooks do Forms) conferem `isAppActive(orgId, appId)`.
- **Módulos do `/rodsaas:module`** (Cadastros): incluídos em qualquer modelo, sem cobrança própria (vivem no app Cadastros). Se o usuário quiser vender um módulo como app, ele vira entrada nova no catálogo com preço e o módulo registra o `appId` dele.
- Preset futuro (Fase 3+): já está no catálogo como "em breve"; ao instalar, aparece na loja e na landing como disponível.

## Notificações

- Tipos novos no catálogo de notificações: `workstation.access_requested` (owners), e os da base `billing.trial_ending`, `billing.payment_failed` passam a ser disparados pela workstation.
- `notify()` não cria aviso de app `locked`.

## Verify

- Parte nova `19-workstation.spec.ts` (`-g "Workstation"`), quando `rodsaas.json → addons` tem `workstation`: teste no cadastro, catálogo público, onboarding, checkout por app e Completo (modo de teste), acesso por pessoa e assento, fim do teste com só leitura, telas do onboarding, da loja e da assinatura.
- A parte antiga de planos (`07-billing.spec.ts`) é **pulada** com o motivo quando `billing.model = "apps"`.
- Os testes dos presets continuam iguais: empresa nova está em teste (tudo liberado).
