# 02 · Cadastro, teste e onboarding

## Cadastro (`POST /v1/auth/register`, mesmo formato da base)

- Aceita os extras opcionais `intent: { apps?: string[], plan?: "completo" | "apps", cycle?: "month" | "year", utm?: { utm_source…utm_content } }` (o front lê da URL `?apps=crm,agenda&plano=completo&ciclo=anual&utm_*` e manda junto). Valores inválidos são ignorados, nunca dão erro.
- Na mesma transação do cadastro da base: `Subscription { model: "trial", trialEndsAt: agora + trialDays }`, `WorkstationProfile { organizationId, intentApps, intentPlan, intentCycle, utm, onboardingCompletedAt: null }`.
- Cadastro **por convite** não cria empresa (como hoje) e não passa pelo onboarding da empresa; a pessoa entra com acesso aos apps que o convite definir (padrão: os apps do modelo — no `apps`, nenhum até o owner dar acesso; no `trial`/`completo`, todos).
- Criar **outra empresa** pelo seletor (`POST /v1/organizations`) também nasce em `trial` e vai para o onboarding.

```prisma
model WorkstationProfile {
  organizationId        String    @id @db.Uuid
  segment               String?
  teamSize              String?
  intentApps            String[]  @default([])
  intentPlan            String?
  intentCycle           String?
  utm                   Json?
  onboardingCompletedAt DateTime?
  trialReminderSentAt   Json      @default("{}")   // { "3": iso, "1": iso } — avisos já enviados
  createdAt             DateTime  @default(now())
}

model AppActivation {                               // conteúdo inicial de cada app roda uma vez por empresa
  organizationId String   @db.Uuid
  appId          String
  activatedAt    DateTime @default(now())
  @@id([organizationId, appId])
}
```

Ambas com RLS `FORCE` por `organizationId`.

## Onboarding (`/boas-vindas`)

O cadastro pela tela termina em `/boas-vindas`. **Não é uma trava**: enquanto `onboardingCompletedAt` for nulo, todos os apps disponíveis ficam ligados e o Início do owner mostra o cartão "Termine de configurar a <empresa>" (`onboarding-resume`) levando de volta ao onboarding; qualquer rota do painel abre normalmente (links diretos, convites e testes continuam funcionando). "Pular" marca o onboarding como feito com os apps sugeridos ligados (refazer em Configurações → Apps → "Refazer a escolha").

Passos (cada um numa tela, com voltar e o progresso no topo):

1. **Sua empresa**: tipo de negócio (`SEGMENTS`, cartões com ícone) e tamanho da equipe (`TEAM_SIZES`).
2. **Seus apps**: `suggestApps({ segment, available, preselected: intentApps })` — os sugeridos já marcados, os outros disponíveis abaixo, "em breve" no fim com selo (não selecionáveis). Cada cartão com ícone, nome, tagline e o preço (`priceLabel`) com "grátis no teste". Rodapé com a estimativa do mês depois do teste (`quote` com 1 pessoa por app e o tamanho da equipe), sem compromisso.
3. **Sua equipe** (opcional): até 20 e-mails para convidar (o papel MEMBER; acesso aos apps escolhidos). Mostra o limite do teste (10 pessoas).
4. **Pronto**: `POST /v1/workstation/onboarding` e vai para o primeiro app escolhido.

★ `POST /v1/workstation/onboarding` (owner) `{ segment, teamSize?, apps: [], invites: [] }` → `validateOnboarding` →

1. grava segmento e tamanho no `WorkstationProfile`; com a Agenda entre os apps, o perfil dela nasce do segmento (`agendaProfileFor`: barbearia → `BARBERSHOP`, odonto → `DENTAL`, clínica → `CLINIC`, salão → `SALON`, pet → `PET`, agência → `CONSULTING`; o resto `GENERAL`), com os tipos de exemplo e o que o perfil liga (`skills/agenda/references/09-perfis-de-segmento.md`);
2. **liga os apps escolhidos**: tira de `disabledApps`; os outros disponíveis entram em `disabledApps` (podem ser ligados depois pela loja); `activateApp()` de cada um (abaixo); acesso padrão (`defaultAccess`: no teste, todos os membros);
3. fixa os escolhidos no trilho do owner (`pinnedApps`);
4. cria os convites pelo serviço da base (`createInvitation`, com `access` = os apps escolhidos, sem papéis de dentro dos apps), respeitando o limite de pessoas do modelo;
5. `onboardingCompletedAt = agora`;
6. responde `{ redirectTo: "<home do primeiro app>", apps: [...], invited: n }`.

Idempotente: chamar de novo (refazer a escolha) liga/desliga sem duplicar conteúdo inicial.

## Conteúdo inicial só quando o app é ligado (`activateApp`)

Hoje cada preset cria o conteúdo inicial **no cadastro da empresa** (funil padrão do CRM, fila e artigos do Suporte, agenda padrão, projeto "Primeiros passos", página "Comece aqui"). Com a workstation, isso vira um **gancho de ativação**:

```ts
// cada preset registra: registerAppActivation('crm', async (tx, orgId, actorId) => { /* conteúdo inicial */ })
activateApp(tx, orgId, appId, actorId):
  AppActivation(orgId, appId) já existe → nada (idempotente)
  roda o gancho do app na mesma transação → grava AppActivation
```

- Mova o código de "conteúdo inicial na criação da empresa" de cada preset instalado para o gancho (sem mudar o que ele cria). Empresas antigas: grave `AppActivation` para os apps que já têm conteúdo (migração, `06`).
- Ligar um app pela loja, no onboarding ou pela troca de modelo chama `activateApp`.

## Primeiros passos

Widget no Início (por app ligado, 2–3 itens cada, marcados sozinhos quando acontecem): "Crie seu primeiro negócio", "Publique seu link de agendamento", "Convide sua equipe", "Escolha seus apps antes do fim do teste". Some quando tudo estiver feito ou a pessoa fechar.

## Testes obrigatórios

- Cadastro cria empresa em `trial` com `trialEndsAt` em 14 dias e o `intent` guardado (inválidos ignorados).
- Onboarding: valida; liga só os escolhidos; `disabledApps` com o resto; conteúdo inicial uma vez (chamar duas vezes não duplica); convites criados com e-mail; limite de pessoas respeitado; membro (não owner) → 403.
- Cadastro pela tela termina em `/boas-vindas`; sem onboarding feito, as rotas do painel abrem normalmente e o Início mostra `onboarding-resume` só para o owner.
