---
name: landing
description: Cria (ou atualiza) o site de vendas de um produto rodsaas — landing moderna, limpa e vendável em site/ (Next.js exportado como estático), com home, página de todos os apps (os prontos e os futuros como "Em breve" com lista de espera), página de cada app, preços com calculadora de verdade, segurança, contato, termos e privacidade; prints e vídeos do sistema real tirados com Playwright (claro/escuro, computador/celular), SEO completo (Open Graph, sitemap, JSON-LD), checagem automática do site antes de publicar e publicação no domínio raiz pelo /rodsaas:domain. Use quando o usuário pedir landing page, site de vendas, página inicial do produto, página de preços, site institucional, divulgar o SaaS, ou chamar /rodsaas:landing. Rode de novo a cada app novo: ele vira "disponível" e ganha prints.
---

# rodsaas · landing

Gera o **site de vendas** do produto na pasta `site/` do projeto (ao lado de `api/` e `web/`): o site que mora no domínio raiz (ex.: `usebancada.app`), enquanto o painel fica em `app.` e a API em `api.`. O conteúdo de cada app vem de um **catálogo único** com todos os apps do rodsaas, prontos e futuros (`assets/catalogo.json`): quando um preset novo é instalado, rodar esta skill de novo troca o "Em breve" por "Disponível", tira os prints e atualiza preços e páginas.

```
site/
├── src/content/catalogo.json      ← cópia do catálogo (textos, preços, prints de cada app)
├── src/content/site.json          ← nome, domínios, contato, dados legais, redes (perguntado na Fase 1)
├── src/lib/catalog-lib.ts         ← porte do scripts/catalog-lib.mjs (status, preço, calculadora, links)
├── src/app/…                      ← páginas (home, /apps, /apps/[slug], /precos, /seguranca, /contato, legais)
├── capture/config.json + seed.mjs ← prints e vídeos do sistema real
├── public/shots/                  ← saída do capture (WebP 2x/1x, mp4/webm, pôster, manifest.json)
└── out/                           ← build estático → /var/www/rodsaas-<projeto>-site (domain.sh SITE_*)
```

## Antes de começar

- Projeto rodsaas com `rodsaas.json` (nome, domínios, marca do `/rodsaas:frontend`) e o painel rodando localmente (para os prints).
- Mesma regra de versões das outras skills: `npm view` + doc atual (Next.js, Tailwind, shadcn/ui, `motion`, Playwright, sharp). Se a doc atual contradiz a skill, a doc vence e o desvio vai para o relatório.
- `ffmpeg` do sistema para os vídeos (`apt install ffmpeg`); sem ele, só prints.

## Como trabalhar (obrigatório)

1. **Leia a referência da fase inteira antes de começar a fase**, do início ao fim, não por amostragem nem resumo. Cada fase aponta o arquivo (→ `references/...`).
2. **Tudo o que está nas referências é escopo**, exceto o que está marcado como fora do escopo. Nada de "versão simplificada", "básico por enquanto" ou "dá para melhorar depois": uma página só, sem as páginas dos apps, sem calculadora, sem prints do sistema real ou sem SEO **não é** o site desta skill.
3. **O que o `check-site.mjs` confere é o mínimo, não o escopo.** Passar na checagem não significa que o site está bom: a revisão visual (Fase 6) também precisa estar feita.
4. **Conferência ao fim de cada fase**: antes do commit, monte uma tabela com **cada item** da referência da fase e o status ✅ feito / ❌ faltando, com o arquivo onde está. Só avance com tudo ✅; o que não der para fazer vira pendência explícita no relatório final, com o motivo. Use o "Pronto quando" de cada fase abaixo como mínimo.
5. Se o usuário pedir para pular ou cortar algo, registre como desvio no relatório final.

## Site que já existe (atualização e revisão)

Se `site/` já existe, **não gere de novo**:

1. Leia todas as referências inteiras.
2. Compare o `src/content/catalogo.json` do site com o `assets/catalogo.json` da skill (apps novos, textos, preços sugeridos) e o status de cada app com o `rodsaas.json` atual (presets/add-ons novos = app que passa a "Disponível").
3. Monte a tabela de lacunas (item da referência · ✅/❌ · onde está ou o que falta), mostre ao usuário e complete **fase por fase**, preservando o que o usuário editou à mão (textos próprios, depoimentos, cores).
4. Para cada app que virou disponível: prints e vídeo (Fase 4), página trocando "Em breve" por "Disponível", preço na calculadora, lista de espera desligada (avise quem se inscreveu: e-mail pelo `Mailer`).
5. Feche com `check-site.mjs` verde e a revisão visual.

## Perguntas (uma rodada só, com padrões)

| Pergunta | Padrão |
|---|---|
| Nome do produto e domínio do site | `rodsaas.json → product.name`; site no domínio raiz (`usebancada.app`), painel em `app.` |
| Para quem é (segmento principal) | PMEs brasileiras de serviços (clínicas, agências, comércio); define exemplos e a ordem dos apps na home |
| Preços | os do catálogo (sugestão: CRM R$ 39/vendedor, Suporte R$ 39/atendente, Agenda R$ 19/profissional, Tarefas R$ 12, Páginas R$ 9, Forms a partir de R$ 29, Suíte RH R$ 5/colaborador, Completo R$ 69/usuário, grátis até 2 usuários, anual = 10 meses); se o projeto já tem `config/plans.ts`, os de lá vencem |
| Dados legais | razão social, CNPJ, endereço, e-mail de contato e do encarregado (LGPD). **Sem isso, termos e privacidade não são publicados** |
| Prova social real | nenhuma (seção não aparece). Depoimentos e logos só com autorização por escrito, em `src/content/depoimentos.json` |
| Contato | e-mail de suporte do `/rodsaas:email` (`RESEND_SUPPORT_EMAIL`); WhatsApp comercial opcional |
| Análise de visitas | nenhuma; opcional Plausible ou Umami (sem cookies) |
| Lista de espera dos apps "Em breve" | formulário do app Forms do próprio produto, se instalado; senão rota `POST /v1/public/waitlist` na API (`03-estrutura.md`) |

## Fases

Cada fase termina com `npm run build` do `site/` passando, lint e commit (`feat(site): ...`).

1. **Mensagem e conteúdo** — catálogo copiado e status pelo `rodsaas.json`, preços confirmados, `site.json`, `MENSAGEM.md` (público, promessa, pilares, objeções). → `references/01-estrategia-e-copy.md`
   - *Pronto quando*: `catalogo.json` no site com status certo de cada app e `validateCatalog` sem erros; preços confirmados com o usuário; `MENSAGEM.md` com título e subtítulo da home, os 3 pilares, as objeções respondidas e o texto de cada CTA.
2. **Projeto e design** — Next.js estático, Tailwind, shadcn/ui, `motion`, tokens da marca do `rodsaas.json`, componentes de seção. → `references/02-design.md` e `references/03-estrutura.md`
   - *Pronto quando*: `output: "export"` gerando `out/`; tokens de cor, fonte e raio iguais aos do painel; claro/escuro; todos os componentes da lista do `02` existem e são usados.
3. **Páginas** — home, `/apps`, `/apps/[slug]` de **todos** os apps do catálogo, `/precos` com calculadora, `/seguranca`, `/contato`, `/termos`, `/privacidade`, `404`. → `references/03-estrutura.md`
   - *Pronto quando*: todas as rotas da tabela do `03`; uma página por app do catálogo (disponível com CTA de teste, "Em breve" com lista de espera e sem print); calculadora com os contratos `site-pricing-*` funcionando; links de cadastro com `apps`, `plano` e UTMs.
4. **Prints e vídeos do sistema real** — conta e empresa de demonstração com dados fictícios bonitos, `capture.mjs`, imagens no site com moldura e versão clara/escura. → `references/04-capturas.md`
   - *Pronto quando*: cada app disponível tem os prints do catálogo (claro e escuro; celular onde marcado) e o vídeo quando houver; `manifest.json` gerado; nenhuma tela inventada; vídeos com até ~1,5 MB e pôster.
5. **SEO, performance e publicação** — metadata, Open Graph por página, sitemap, robots, JSON-LD, orçamento de performance, build, `check-site.mjs`, cópia para o servidor e `domain.sh` com `SITE_DOMAIN`. → `references/05-seo-e-publicacao.md`
   - *Pronto quando*: `check-site.mjs` sem erros; Lighthouse ≥ 90 em performance e ≥ 95 em acessibilidade, boas práticas e SEO na home e em `/precos` (celular); site no ar em HTTPS com `www` redirecionando.
6. **Revisão visual e fechamento** — prints da própria landing (computador e celular, claro e escuro) com o `capture.mjs`, olhar cada um e corrigir; `references/06-checklist.md`.
   - *Pronto quando*: você **abriu e olhou** os prints de todas as páginas principais e corrigiu o que estava feio, desalinhado ou genérico; checklist inteira ✅.

## Princípios

- **Vende com verdade.** Nada de depoimento, logo de cliente, número ("+10 mil empresas"), nota ou selo inventado. Sem prova real, a seção não existe. Comparação com concorrente sem citar marca e sem número que você não possa provar.
- **O produto de verdade aparece.** Prints e vídeos são do sistema rodando, com dados fictícios de demonstração. App que ainda não existe não ganha tela de mentira: tem ícone, texto e "Em breve".
- **Todo app tem página.** Disponível vende e leva ao teste; futuro mostra o que vem e coleta interessados. O roadmap inteiro já fica no site.
- **Uma marca só.** Cores, fonte e raio do painel; quem clica em "Começar" não sente que mudou de produto.
- **Rápido e no celular primeiro.** Site estático, imagens WebP com tamanho certo, vídeo só quando aparece na tela, nada de rolagem horizontal.
- **Cada página, um objetivo.** Um CTA principal por seção, sempre com verbo ("Começar grátis", "Testar o CRM").

## Relatório final

Páginas publicadas (com URL), apps disponíveis e em breve, preços usados, prints e vídeos gerados, resultado do `check-site.mjs` e do Lighthouse, o que ficou pendente (dados legais, prova social, analytics), como atualizar (rodar `/rodsaas:landing` de novo depois de cada preset) e como publicar de novo (`npm run build` + `rsync`).

## Mapa das referências

| Arquivo | Quando ler |
|---|---|
| `references/01-estrategia-e-copy.md` | Fase 1 e ao escrever qualquer texto |
| `references/02-design.md` | Fase 2 e ao montar qualquer seção |
| `references/03-estrutura.md` | Fases 2 e 3: projeto, rotas, componentes, calculadora, lista de espera |
| `references/04-capturas.md` | Fase 4 |
| `references/05-seo-e-publicacao.md` | Fase 5 |
| `references/06-checklist.md` | Fase 6 |
| `assets/catalogo.json` | todos os apps (prontos e futuros): textos, ícones, preços sugeridos, prints e vídeos |
| `scripts/catalog-lib.mjs` + `catalog-lib.test.mjs` | status, preço, calculadora, link de cadastro, JSON-LD: porte para o site com os testes |
| `scripts/capture.mjs` | prints e vídeos com Playwright (sistema e a própria landing) |
| `scripts/check-site.mjs` | checagem do site estático antes de publicar |
