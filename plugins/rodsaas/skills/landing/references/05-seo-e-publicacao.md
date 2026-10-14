# 05 · SEO, performance e publicação

## SEO em cada página

- `metadata` com `title` único (padrão `"<Página> · <Produto>"`; home: `"<Produto> · <promessa curta>"`, até ~60 caracteres) e `description` única de 120–160 caracteres com o benefício.
- `alternates.canonical` absoluto (`https://<SITE_DOMAIN>/<rota>`), `<html lang="pt-BR">`.
- Open Graph e Twitter: título, descrição e imagem 1200×630 por página. Gere com `opengraph-image.tsx` (`ImageResponse`, no build) usando nome do app, tagline, ícone e a cor da marca; se a versão instalada do Next não exportar imagens no modo estático, crie uma rota `/og/[slug]` (noindex) e gere os PNG com o `capture.mjs` (sem login, `clip` do card).
- JSON-LD: `SoftwareApplication` na home (`productJsonLd()`), `FAQPage` nas páginas com FAQ, `BreadcrumbList` nas páginas de app.
- `sitemap.ts` com todas as páginas (inclusive as de apps "Em breve") e `robots.ts` com `Sitemap:`; nada de `localhost`.
- Favicon e ícones (`icon.svg`/`apple-icon.png`) a partir do logo.
- Páginas de app com o termo que o cliente procura no título ("CRM para pequenas empresas", "Agendamento online para clínicas") sem encher de palavra-chave.

## Orçamento de performance

| Métrica (celular, 4G) | Meta |
|---|---|
| LCP | < 2,5 s |
| CLS | < 0,05 |
| JS da home (gzip) | < 150 KB |
| Peso total da home sem vídeo | < 1,2 MB |

- Print do hero com `fetchpriority="high"` e sem `loading="lazy"`; o resto com `loading="lazy"` e `width`/`height`.
- Vídeos com `preload="none"` e carregados só ao entrar na tela.
- Fonte local com `next/font` e `display: swap`; nada de bibliotecas pesadas (carrossel, animação de scroll).
- Lighthouse (Chrome DevTools ou `npx lighthouse`) na home e em `/precos`, modo celular: performance ≥ 90; acessibilidade, boas práticas e SEO ≥ 95.

## Checagem antes de publicar

```bash
cd site && npm run build
node ${CLAUDE_PLUGIN_ROOT}/skills/landing/scripts/check-site.mjs --dir out --catalog src/content/catalogo.json --rodsaas ../rodsaas.json
```

Confere páginas, títulos, descrições, canonical, Open Graph, `h1`, `alt`, recursos quebrados, erros de console, rolagem horizontal no celular, textos proibidos, vídeos, links de cadastro, página de cada app, "Em breve" sem print, preços e calculadora, sitemap, robots, JSON-LD, 404, favicon, prova social autorizada e páginas legais. **Só publique com zero erros.**

## Publicação

1. DNS: registro A do domínio raiz e do `www` para o servidor (o `.app` só abre com HTTPS: o certificado é obrigatório).
2. Copiar o build para a pasta servida pelo nginx (legível pelo usuário do nginx; nunca em `/root` ou `/tmp`):
   ```bash
   sudo mkdir -p /var/www/rodsaas-<projeto>-site
   sudo rsync -a --delete site/out/ /var/www/rodsaas-<projeto>-site/
   sudo chmod -R a+rX /var/www/rodsaas-<projeto>-site
   ```
3. `/rodsaas:domain` com `SITE_DOMAIN=<dominio>` (e `SITE_WWW=true`) no config: `check` → `nginx` → `ssl` → `env` → `verify`. O nginx serve o site estático com cache certo, `404.html` e `www` redirecionando.
4. Publicar de novo = `npm run build` + o `rsync` (sem mexer no nginx).
5. Depois do ar: enviar o sitemap no Google Search Console e conferir a prévia do link (Open Graph) colando a URL no WhatsApp.
