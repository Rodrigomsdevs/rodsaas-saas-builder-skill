# 02 · Design

Direção: **moderno, limpo e vendável**. O produto é o herói: prints grandes e nítidos, bastante respiro, tipografia forte, uma cor de marca usada com intenção. Se a skill `frontend-design` estiver disponível, leia antes de começar e siga a direção dela dentro destas regras.

## Marca (igual ao painel)

- Cores, fonte, raio e logo vêm do `rodsaas.json` (seção de marca gravada pelo `/rodsaas:frontend`) e viram tokens CSS em `globals.css` (`--primary`, `--background`, `--foreground`, `--muted`, `--border`, `--radius`), nos dois temas.
- **Uma cor de destaque** (a primária da marca) para CTAs, links e detalhes. O resto é neutro (cinzas do tema). Cor de categoria só nos ícones dos apps (paleta suave, uma por categoria do catálogo).
- Fonte: a do painel via `next/font` (sem carregar fonte de CDN). Títulos com peso 600–700 e letter-spacing levemente negativo; texto 400.

## Grade e ritmo

- Conteúdo em `max-w-6xl` (≈1152 px) centralizado; texto corrido em até ~65 caracteres por linha.
- Seções com `py-24` no computador e `py-16` no celular; margem lateral mínima de 16 px no celular.
- Escala tipográfica: hero 48–64 px (celular 36–40), título de seção 32–40 (celular 28), subtítulo 18–20, texto 16–17, legenda 14.
- Cards: borda de 1 px (`--border`), raio da marca, sombra bem suave só no hover; nada de sombra pesada.

## Componentes (todos existem e são usados)

| Componente | Uso |
|---|---|
| `Nav` | topo fixo com fundo translúcido ao rolar; menu "Apps" com categorias; no celular, Sheet com os mesmos itens |
| `Hero` | título, subtítulo, 2 CTAs, linha de segurança, print do produto em `BrowserFrame` com brilho suave da cor da marca atrás |
| `BrowserFrame` | moldura de navegador (barra com 3 pontos e o endereço `app.<dominio>`) em volta de prints e vídeos do computador |
| `PhoneFrame` | moldura de celular para prints/vídeos `device: mobile` |
| `ThemedShot` | `<picture>` com a versão clara e a escura do print (troca com o tema do site), `srcset` 1x/2x, `width`/`height`, `alt` da legenda |
| `DemoVideo` | `<video muted playsinline loop autoplay preload="none" poster>` que só carrega e toca quando entra na tela (IntersectionObserver); com `prefers-reduced-motion`, mostra só o pôster com botão de play |
| `AppStrip` | faixa de ícones dos apps disponíveis + "e mais N em breve" |
| `AppCard` / `AppGrid` | grade (bento) de apps por categoria; card com ícone na cor da categoria, nome, tagline, selo "Em breve" quando for o caso |
| `FeatureRow` | bloco texto + mídia, alternando lados; empilha no celular (mídia depois do texto) |
| `IntegrationFlow` | diagrama SVG do fluxo entre apps disponíveis (setas e ícones), legível nos dois temas |
| `Steps` | "como funciona" em 3 passos numerados |
| `PlatformGrid` | itens de `catalog.platform` com ícone |
| `PricingCards` + `PricingCalculator` + `PriceTable` | página de preços (`03-estrutura.md`) |
| `FAQ` | acordeão acessível (Radix/shadcn) |
| `CTABand` | faixa final na cor da marca |
| `ComingSoonHero` | hero das páginas "Em breve": ilustração com o ícone grande e a cor da categoria, selo, CTA de lista de espera |
| `Footer` | colunas + razão social e CNPJ |

Ícones: `lucide-react` (os nomes do catálogo são ícones Lucide).

## Movimento

- Entrada suave das seções (opacidade + 8–12 px de deslocamento, 250–400 ms, uma vez só) com `motion`; nada de parallax pesado, carrossel automático ou contador animado de números.
- Hover discreto em cards e botões (mudança de borda/sombra, 150 ms).
- `prefers-reduced-motion: reduce` desliga tudo isso e o autoplay dos vídeos.

## Tema claro e escuro

- Segue o sistema por padrão, com alternância no rodapé ou no topo; sem piscar ao carregar (script inline que aplica a classe antes da pintura).
- Prints e vídeos têm versão clara e escura (`04-capturas.md`): o `ThemedShot` mostra a do tema atual.

## Acessibilidade

- Contraste AA em textos e botões nos dois temas; foco visível em tudo; "pular para o conteúdo"; um `h1` por página e títulos em ordem; `alt` descritivo nos prints (a legenda do catálogo); vídeos decorativos com `aria-hidden` e texto equivalente ao lado.

## O que deixa o site com cara de genérico (evite)

- Gradiente roxo/azul em tudo, vidro fosco em cada card, blobs flutuando.
- Emojis como ícones, ilustrações de banco de imagens com pessoas sorrindo, foto de aperto de mão.
- "Dashboard" desenhado à mão no lugar do print real; mockup com dados lorem.
- Muitos tamanhos e pesos de fonte, cinco cores de destaque, botões de estilos diferentes.
- Seções inteiras centralizadas com texto longo; parágrafos de 6 linhas no hero.
- Seção de depoimentos/logos vazia ou de mentira.

## Revisão visual (Fase 6)

Tire prints da própria landing com o `capture.mjs` (config sem `login`, `baseURL` do site servido localmente, `waitFor: "site-hero"` etc.), **abra e olhe** cada um no computador e no celular, claro e escuro, e corrija: alinhamentos, espaçamentos irregulares, textos quebrando feio, imagens borradas ou cortadas, contraste, seções que parecem vazias, CTA que some. Repita até ficar bonito de verdade.
