#!/usr/bin/env bash
# rodsaas · roda a bateria de verificação contra um projeto rodsaas.
#
# Uso:
#   run.sh [pasta-do-projeto] [opções do playwright...]
#   run.sh /home/rodsaas/gemini                    # tudo
#   run.sh /home/rodsaas/gemini --project=api      # só a API
#   run.sh /home/rodsaas/gemini --project=ui       # só o navegador
#   run.sh /home/rodsaas/gemini -g "trocar"        # só testes com "trocar" no nome
#   run.sh /home/rodsaas/gemini --last-failed      # só o que falhou da última vez
#
# A bateria fica num cache (~/.cache/rodsaas-verify), nunca dentro do projeto.
# Relatório: <projeto>/rodsaas-verify-report/

set -euo pipefail

SKILL_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PROJECT_DIR="$(cd "${1:-$PWD}" && pwd)"
shift || true
CACHE="${RODSAAS_VERIFY_HOME:-$HOME/.cache/rodsaas-verify}"
SUITE="$CACHE/suite"

say() { printf '%s\n' "$*"; }
die() { printf 'ERRO: %s\n' "$*" >&2; exit 2; }

command -v node >/dev/null || die "node não encontrado"
command -v npm >/dev/null || die "npm não encontrado"
[[ -f "$PROJECT_DIR/rodsaas.json" ]] || say "! $PROJECT_DIR/rodsaas.json não existe: usando portas padrão (3000/3333) ou RODSAAS_WEB_URL/RODSAAS_API_URL"

# ---------------------------------------------------------------- bateria no cache
mkdir -p "$SUITE"
for item in package.json tsconfig.json playwright.config.ts support tests; do
  rm -rf "${SUITE:?}/$item"
  cp -R "$SKILL_DIR/suite/$item" "$SUITE/$item"
done

if [[ ! -d "$SUITE/node_modules/@playwright/test" ]]; then
  say "→ instalando a bateria (primeira vez)…"
  (cd "$SUITE" && npm install --no-audit --no-fund --loglevel=error)
fi

# navegador: usa um Chromium já instalado se houver; senão baixa o do Playwright
if [[ -z "${PW_CHROMIUM_PATH:-}" ]]; then
  if ! (cd "$SUITE" && node -e "const {chromium}=require('@playwright/test');require('fs').accessSync(chromium.executablePath())" 2>/dev/null); then
    say "→ baixando o Chromium do Playwright…"
    if [[ "$(id -u)" -eq 0 ]]; then (cd "$SUITE" && npx playwright install --with-deps chromium)
    else (cd "$SUITE" && npx playwright install chromium) || say "! se faltar biblioteca do sistema: sudo npx playwright install-deps chromium"
    fi
  fi
fi

# ---------------------------------------------------------------- configuração e pré-checagem
export RODSAAS_PROJECT_DIR="$PROJECT_DIR"
CFG="$(cd "$SUITE" && node support/config.mjs)"
WEB="$(node -e "console.log(JSON.parse(process.argv[1]).webURL)" "$CFG")"
API="$(node -e "console.log(JSON.parse(process.argv[1]).apiURL)" "$CFG")"
MAIL="$(node -e "console.log(JSON.parse(process.argv[1]).mailpitURL)" "$CFG")"

say "Projeto:  $PROJECT_DIR"
say "Painel:   $WEB"
say "API:      $API"
say "Mailpit:  $MAIL"

FAIL=0
probe() { local c; c="$(curl -s -o /dev/null -w '%{http_code}' --max-time 8 "$1" 2>/dev/null)" || true; printf '%s' "${c:-000}"; }
code="$(probe "$API/health")"; [[ "$code" == "200" ]] && say "  ✓ API no ar" || { say "  ✗ API não respondeu em $API/health (HTTP $code). Suba: cd api && npm run dev"; FAIL=1; }
code="$(probe "$WEB/entrar")"; [[ "$code" =~ ^(200|30[78])$ ]] && say "  ✓ painel no ar" || { say "  ✗ painel não respondeu em $WEB/entrar (HTTP $code). Suba: cd web && npm run dev"; FAIL=1; }
code="$(probe "$MAIL/api/v1/info")"; [[ "$code" == "200" ]] && say "  ✓ Mailpit no ar" || say "  ! Mailpit não respondeu em $MAIL (testes de e-mail vão falhar). Suba: docker compose up -d mailpit  (ou MAILPIT_URL=...)"
[[ "$FAIL" -eq 0 ]] || die "suba a API e o painel antes de rodar a verificação"

# ---------------------------------------------------------------- auditoria do contrato
say ""
node "$SKILL_DIR/scripts/audit.mjs" "$PROJECT_DIR" || say "! há pendências no contrato: os testes ligados a elas vão falhar (veja acima)"

# ---------------------------------------------------------------- bateria
say ""
say "→ rodando a bateria (leva alguns minutos: o rate limit de cadastro/login é respeitado de propósito)…"
mkdir -p "$PROJECT_DIR/rodsaas-verify-report"
set +e
(cd "$SUITE" && npx playwright test "$@")
set -e
node "$SKILL_DIR/scripts/summary.mjs" "$PROJECT_DIR/rodsaas-verify-report/results.json"
