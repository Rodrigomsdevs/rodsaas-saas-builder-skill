# 06 · Checklist final

Marque olhando o site e rodando, não de memória. O que ficar ❌ vai para o relatório final com o motivo.

## Conteúdo
- [ ] `MENSAGEM.md` aprovado; título e subtítulo da home com benefício concreto
- [ ] catálogo no site válido (`validateCatalog`), status de cada app igual ao `rodsaas.json`
- [ ] preços confirmados com o usuário (ou vindos de `config/plans.ts`)
- [ ] nenhum depoimento, logo, número, nota ou selo inventado; prova social só com autorização em `depoimentos.json`
- [ ] nenhuma promessa de recurso que a skill do app não entrega
- [ ] termos e privacidade com razão social, CNPJ, contato e encarregado

## Páginas
- [ ] home com todas as seções do `01` (sem a de prova social se não houver material real)
- [ ] `/apps` e uma página para **cada** app do catálogo (disponível com CTA de teste; "Em breve" com lista de espera, sem print)
- [ ] `/precos` com cartões, calculadora (`site-pricing-*`), tabela e add-ons
- [ ] `/seguranca`, `/contato`, `/termos`, `/privacidade`, 404 próprio
- [ ] links de cadastro com `apps`/`plano`/`ciclo`/UTMs; `/cadastro` do painel aplica `?apps=`
- [ ] lista de espera funcionando (Forms ou `POST /v1/public/waitlist`)

## Design
- [ ] tokens de marca iguais aos do painel; claro e escuro sem piscar
- [ ] todos os componentes do `02` existem e são usados; nada da lista "cara de genérico"
- [ ] celular sem rolagem horizontal, menu em Sheet, mídia empilhada
- [ ] movimento discreto e desligado com `prefers-reduced-motion`
- [ ] contraste AA, foco visível, `alt` nos prints

## Prints e vídeos
- [ ] seed com dados fictícios bonitos; prints de todos os apps disponíveis (claro/escuro; celular onde marcado)
- [ ] vídeos curtos (5–12 s, até ~1,5 MB) com pôster, carregando só quando aparecem
- [ ] **abri e olhei** cada print e vídeo

## SEO, performance e publicação
- [ ] metadata, canonical, Open Graph (imagem por página), JSON-LD, sitemap, robots, favicon
- [ ] Lighthouse no celular: performance ≥ 90; acessibilidade, boas práticas e SEO ≥ 95 (home e `/precos`)
- [ ] `check-site.mjs` com **zero erros**
- [ ] site no ar em HTTPS pelo `domain.sh` com `SITE_DOMAIN`, `www` redirecionando, `verify` verde

## Fechamento
- [ ] revisão visual: prints da própria landing (computador/celular, claro/escuro) abertos e corrigidos
- [ ] README do `site/`: como rodar, capturar, checar e publicar
- [ ] **conferência final**: tabela item a item de todas as referências (01–05) com ✅/❌ e o arquivo onde está
