# 03 · Projeto, rotas e componentes

## Projeto

- `site/` com Next.js (versão atual, App Router, TypeScript), Tailwind, shadcn/ui, `motion`, `lucide-react`. `next.config`: `output: "export"`, `images: { unoptimized: true }` (as imagens já saem otimizadas do `capture.mjs`), `trailingSlash: false`.
- Sem servidor: tudo é gerado no build. O que precisa de dados vivos (lista de espera) chama a API do produto pelo navegador.
- Dev: `npm run dev` numa porta livre (`rodsaas.json → ports.site`, padrão 3002, conferindo se está livre como o backend faz).
- Dependências de captura e checagem em `devDependencies`: `playwright`, `sharp`.

```
site/src/
├── app/
│   ├── layout.tsx          # fonte, tema, Nav, Footer, metadata base (metadataBase = https://<SITE_DOMAIN>)
│   ├── page.tsx            # home
│   ├── apps/page.tsx       # todos os apps por categoria
│   ├── apps/[slug]/page.tsx  # generateStaticParams com TODOS os apps do catálogo
│   ├── precos/page.tsx
│   ├── seguranca/page.tsx
│   ├── contato/page.tsx
│   ├── termos/page.tsx · privacidade/page.tsx
│   ├── not-found.tsx       # vira 404.html
│   ├── sitemap.ts · robots.ts   # export const dynamic = "force-static"
│   └── opengraph-image.tsx (+ por rota)  # 05-seo-e-publicacao.md
├── components/             # lista do 02-design.md
├── content/catalogo.json · site.json · depoimentos.json (opcional)
└── lib/catalog-lib.ts      # porte do scripts/catalog-lib.mjs + testes (Vitest)
```

## site.json

```json
{
  "name": "Bancada",
  "siteUrl": "https://usebancada.app",
  "appUrl": "https://app.usebancada.app",
  "apiUrl": "https://api.usebancada.app",
  "segment": "PMEs brasileiras de serviços",
  "contact": { "email": "support@usebancada.app", "whatsapp": null },
  "legal": { "razaoSocial": "", "cnpj": "", "endereco": "", "encarregadoEmail": "" },
  "analytics": null,
  "waitlist": { "mode": "forms", "formUrl": "https://app.usebancada.app/f/<id>" }
}
```

`siteUrl`/`appUrl`/`apiUrl` vêm do `rodsaas.json → domains` (o `domain.sh env` grava `domains.site`). Em dev, use os locais.

## Rotas

| Rota | Conteúdo | Testids mínimos |
|---|---|---|
| `/` | home (`01-estrategia-e-copy.md`) | `site-hero`, `site-app-card` |
| `/apps` | todos os apps por categoria, filtros por categoria e "Disponíveis / Em breve" | `site-app-card` (`data-app`, `data-status`) |
| `/apps/[slug]` | página do app disponível ou "Em breve" (uma para cada app do catálogo) | `site-app-hero` (`data-status`) |
| `/precos` | cartões, calculadora, tabela, add-ons, FAQ de cobrança | `site-pricing-*` (abaixo) |
| `/seguranca` | como os dados são protegidos (isolamento por empresa, HTTPS, senhas com argon2, backups se houver, LGPD, encarregado) — só o que é verdade no projeto | — |
| `/contato` | e-mail de suporte, WhatsApp (se houver), formulário (Forms do produto, se instalado) | — |
| `/termos`, `/privacidade` | modelos com os dados do `site.json → legal`; aviso no topo do arquivo-fonte: "revisar com advogado". Sem razão social e CNPJ, **não publique** (o check-site avisa) | — |
| 404 | página própria com busca de apps e link para a home | — |

## Links de cadastro

Sempre com `signupUrl()` do `catalog-lib`: `https://app.<dominio>/cadastro?apps=crm,agenda&plano=completo&ciclo=anual&utm_source=…`.

- UTMs da visita (lidas da URL na chegada e guardadas em `sessionStorage`, em try/catch) vão para todos os CTAs.
- Se o `/cadastro` do painel ainda não lê `?apps=`, acrescente no `web/`: guarda o valor e, depois do cadastro, fixa esses apps no trilho (`PUT /v1/me/preferences { pinnedApps }`). Ignorar ids desconhecidos.

## Calculadora de preços (contrato testável)

Usa o `quote()` do `catalog-lib` com o catálogo e os apps disponíveis. Estado na URL (`/precos?apps=crm:3,agenda:2&ciclo=anual`) para compartilhar.

| Testid | O que é |
|---|---|
| `site-pricing-calculator` | o bloco inteiro |
| `site-pricing-app` (`data-app`, `role="switch"`, `aria-checked`) | liga/desliga cada app disponível |
| `site-pricing-seats` (`data-app`, `type="number"`) | pessoas naquele app (aparece com o app ligado; mínimo 1) |
| `site-pricing-employees` | colaboradores (aparece quando um app da Suíte RH está ligado) |
| `site-pricing-users` | pessoas que usam o sistema (para o Completo e o grátis) |
| `site-pricing-cycle` (`role="switch"`) | mensal / anual |
| `site-pricing-total` | **total avulso por mês** em R$ (sem desconto do anual) |
| `site-pricing-completo` | total do Completo por mês |
| `site-pricing-best` | recomendação: "Grátis", "Avulso" ou "Completo (economize R$ X)" |
| `site-pricing-annual` | valor do anual (total e por mês) |

O `check-site.mjs` liga um app por pessoa e confere que o total muda exatamente o preço do app, e que mudar o número de pessoas multiplica.

## Lista de espera dos apps "Em breve"

- **Com o app Forms instalado** (preferido): crie no próprio produto, numa empresa "da casa", o formulário "Lista de espera" (e-mail obrigatório, nome, empresa, campo oculto `app`) e use o link público com `?app=<slug>`. As respostas chegam no Forms e podem virar lead no CRM.
- **Sem Forms**: acrescente na API a rota pública `POST /v1/public/waitlist { email, appId, name?, company?, utm? }` (rate limit da base, e-mail normalizado, `appId` validado contra o catálogo, dedupe por e-mail+app, tabela de sistema `Waitlist` sem RLS e aviso para `RESEND_SUPPORT_EMAIL`), com CORS liberado para o `siteUrl`. O botão abre um diálogo com o formulário.
- Quando o app sair (rodar `/rodsaas:landing` de novo), avise os inscritos por e-mail pelo `Mailer` ("O <app> chegou") com link para testar.

## Analytics (opcional)

Plausible ou Umami (sem cookies) com o script carregado só em produção. Eventos: clique em CTA (`data-cta`), app ligado na calculadora, envio da lista de espera. Nada de Google Analytics/Meta Pixel sem banner de consentimento.
