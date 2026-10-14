# 04 · Prints e vídeos do sistema real

Tudo com `scripts/capture.mjs` (Playwright/Chromium), rodando contra o painel local com uma **empresa de demonstração**. Nunca desenhe telas à mão nem use mockups: o que aparece no site é o produto.

## 1. Conta e dados de demonstração

- Crie um usuário e uma empresa só para isso (ex.: "Clínica Bem Estar", usuária "Ana Lima"), no plano que libera todos os apps disponíveis (modo de teste da cobrança).
- Escreva `site/capture/seed.mjs` (export default `async ({ api }) => {}`) usando as rotas reais da API (confira no `openapi.json`) para encher cada app com dados **fictícios, brasileiros e bonitos**:
  - **CRM**: 8–12 negócios espalhados pelas etapas com valores realistas em R$, empresas e contatos com nomes inventados (nunca marcas reais), atividades de hoje e atrasadas.
  - **Suporte**: 6–10 chamados em status diferentes, um com SLA vencendo, 2 artigos na base.
  - **Agenda**: semana com 10–15 atendimentos de 2–3 profissionais, um pendente de aprovação.
  - **Tarefas**: projeto com 10–15 tarefas em todas as colunas, responsáveis, prazos e etiquetas.
  - **Páginas**: 5 páginas com conteúdo de verdade (processo de atendimento, onboarding) e um database.
  - **Forms**: formulário de pesquisa com 30–50 respostas (para o resumo com gráficos e NPS).
- Datas relativas a `fixedTime` do config (todos os prints mostram o mesmo "hoje").
- O seed é idempotente o bastante para rodar de novo sem duplicar tudo (confira antes de criar, ou recrie a empresa).

## 2. config.json

```json
{
  "baseURL": "http://localhost:3000",
  "apiURL": "http://localhost:3333",
  "login": { "email": "demo@usebancada.app", "password": "…" },
  "catalog": "../src/content/catalogo.json",
  "rodsaas": "../../rodsaas.json",
  "seed": "seed.mjs",
  "out": "../public/shots",
  "fixedTime": "2026-10-13T10:30:00-03:00",
  "public": { "agenda": "/agendar/clinica-bem-estar", "forms": "/f/<id>", "helpdesk": "/ajuda/clinica-bem-estar" },
  "hide": ["[data-sonner-toaster]", "nextjs-portal"],
  "shots": [],
  "videos": []
}
```

- Os prints e vídeos de cada app disponível vêm do catálogo (`shots`, `video`); `shots`/`videos` do config acrescentam ou trocam por `id` (`"skip": true` desliga).
- Passos aceitos: `goto`, `waitFor`, `click`, `hover`, `fill`, `type` (digita como gente), `press`, `pause`, `scroll`, `dragTo` (de um testid para outro; `testid:N` = N-ésimo).
- A senha da conta de demonstração fica só no `config.json` local: ponha `site/capture/config.json` no `.gitignore` e versione um `config.example.json`.

## 3. Rodar

```bash
cd site
node ${CLAUDE_PLUGIN_ROOT}/skills/landing/scripts/capture.mjs --config capture/config.json            # prints
node ${CLAUDE_PLUGIN_ROOT}/skills/landing/scripts/capture.mjs --config capture/config.json --videos   # + vídeos
node ${CLAUDE_PLUGIN_ROOT}/skills/landing/scripts/capture.mjs --config capture/config.json --only crm-funil --no-seed
```

- Prints: claro e escuro, computador (1440×900 @2x) e celular (390×844 @3x) quando marcado, em WebP 2x e 1x; animações desligadas; barras de rolagem e cursor de texto escondidos.
- Vídeos: screencast do Chromium + ffmpeg do sistema (mp4 H.264 e webm VP9, 30 fps, pôster WebP), com uma bolinha de cursor visível, movimentos suaves, começando já com a tela pronta.
- Falhou? O script salva `_falha-<id>.png` com o que estava na tela; corrija o seed ou o passo e rode de novo só aquele `--only`.
- Saída em `public/shots/manifest.json`, que o `ThemedShot` e o `DemoVideo` usam (largura/altura certas, sem salto de layout).

## 4. Regras de qualidade

- Cada vídeo conta **uma ação** em 5–12 s (arrastar o negócio de etapa, aplicar resposta pronta, cliente marcando horário no celular), sem erro de digitação, terminando num estado bonito. Até ~1,5 MB.
- Nada de dado pessoal real, e-mail real, marca real ou foto de pessoa real nos dados de demonstração.
- Sem toasts, banners de "modo de teste" ou erros visíveis no print (`hide` no config ou ajuste o seed).
- Revise **cada** imagem gerada (abra e olhe): tela vazia, carregando, cortada ou com dado feio volta para o seed.
- App "Em breve" não tem print nem vídeo (o capture pula sozinho; o check-site reprova se aparecer).
