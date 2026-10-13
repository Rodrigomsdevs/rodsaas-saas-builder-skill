#!/usr/bin/env bash
# rodsaas · publica frontend e API em domínios próprios com nginx + certbot.
#
# Uso:
#   domain.sh check  <config>   diagnóstico (DNS, portas, nginx, certbot, firewall, cookies) — não altera nada
#   domain.sh nginx  <config>   gera e ativa o site no nginx (HTTP), testa e recarrega
#   domain.sh ssl    <config>   emite/instala o certificado (Let's Encrypt) e liga o redirecionamento HTTPS
#   domain.sh env    <config>   atualiza .env da API, .env.production do front e rodsaas.json
#   domain.sh verify <config>   testa HTTPS, redirecionamento, /health e validade do certificado
#
# <config> é um arquivo KEY=valor (veja config.example).

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
TEMPLATE="$SCRIPT_DIR/nginx-site.conf.tpl"

die()  { printf 'ERRO: %s\n' "$*" >&2; exit 1; }
ok()   { printf '  ✓ %s\n' "$*"; }
warn() { printf '  ! %s\n' "$*"; }
bad()  { printf '  ✗ %s\n' "$*"; BLOCKERS=$((BLOCKERS + 1)); }
BLOCKERS=0

CMD="${1:-}"; CONFIG="${2:-}"
[[ "$CMD" =~ ^(check|nginx|ssl|env|verify)$ ]] || die "comando inválido. Use: check | nginx | ssl | env | verify"
[[ -n "$CONFIG" && -f "$CONFIG" ]] || die "informe o arquivo de configuração (veja config.example)"
# shellcheck disable=SC1090
source "$CONFIG"

PROJECT="${PROJECT:-}"
WEB_DOMAIN="$(printf '%s' "${WEB_DOMAIN:-}" | tr '[:upper:]' '[:lower:]')"
API_DOMAIN="$(printf '%s' "${API_DOMAIN:-}" | tr '[:upper:]' '[:lower:]')"
WEB_PORT="${WEB_PORT:-}"
API_PORT="${API_PORT:-}"
LE_EMAIL="${LE_EMAIL:-}"
API_ENV_FILE="${API_ENV_FILE:-api/.env}"
WEB_ENV_FILE="${WEB_ENV_FILE:-web/.env.production}"
RODSAAS_JSON="${RODSAAS_JSON:-rodsaas.json}"
FORCE="${FORCE:-false}"

# ---------------------------------------------------------------- validação
DOMAIN_RE='^([a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$'
[[ "$PROJECT" =~ ^[a-z0-9][a-z0-9-]{0,40}$ ]] || die "PROJECT inválido (minúsculas, números e hífen)"
[[ "$WEB_DOMAIN" =~ $DOMAIN_RE ]] || die "WEB_DOMAIN inválido: '$WEB_DOMAIN' (sem http://, sem barra no fim)"
[[ "$API_DOMAIN" =~ $DOMAIN_RE ]] || die "API_DOMAIN inválido: '$API_DOMAIN'"
[[ "$WEB_DOMAIN" != "$API_DOMAIN" ]] || die "frontend e API precisam de domínios diferentes (ex.: app.meusaas.com.br e api.meusaas.com.br)"
for p in "$WEB_PORT" "$API_PORT"; do
  [[ "$p" =~ ^[0-9]+$ && "$p" -ge 1024 && "$p" -le 65535 ]] || die "porta inválida: '$p'"
done
[[ "$WEB_PORT" != "$API_PORT" ]] || die "WEB_PORT e API_PORT precisam ser diferentes"

PID="$(printf '%s' "$PROJECT" | tr '-' '_')"
CONF_NAME="rodsaas-$PROJECT.conf"
CERT_NAME="rodsaas-$PROJECT"

# Domínio registrável (o que se compra): meusaas.com.br, meusaas.com, meusaas.app...
MULTI_SUFFIXES=" com.br net.br org.br app.br dev.br art.br blog.br eco.br emp.br ind.br inf.br log.br med.br nom.br srv.br tec.br tv.br edu.br gov.br adv.br eng.br arq.br com.ar com.mx com.co com.pe com.uy com.py co.uk org.uk com.au co.jp co.za com.pt "
registrable() {
  local d="$1" last2 last3
  last2="$(printf '%s' "$d" | awk -F. '{print $(NF-1)"."$NF}')"
  if [[ "$MULTI_SUFFIXES" == *" $last2 "* ]]; then
    last3="$(printf '%s' "$d" | awk -F. 'NF>=3 {print $(NF-2)"."$(NF-1)"."$NF}')"
    printf '%s' "$last3"
  else
    printf '%s' "$last2"
  fi
}
WEB_REG="$(registrable "$WEB_DOMAIN")"
API_REG="$(registrable "$API_DOMAIN")"
COOKIE_DOMAIN="$WEB_REG"

as_root() {
  if [[ "$(id -u)" -eq 0 ]]; then "$@"
  elif sudo -n true 2>/dev/null; then sudo -n "$@"
  else die "precisa de root ou sudo sem senha para: $*"
  fi
}

nginx_dirs() {
  if [[ -d /etc/nginx/sites-available ]]; then
    CONF_PATH="/etc/nginx/sites-available/$CONF_NAME"
    ENABLED_PATH="/etc/nginx/sites-enabled/$CONF_NAME"
  else
    CONF_PATH="/etc/nginx/conf.d/$CONF_NAME"
    ENABLED_PATH=""
  fi
}

resolve() {  # $1 domínio, $2 A|AAAA
  if command -v dig >/dev/null; then
    dig +short "$2" "$1" @1.1.1.1 2>/dev/null | grep -E '^[0-9a-f.:]+$' || true
  elif [[ "$2" == "A" ]]; then
    getent ahostsv4 "$1" 2>/dev/null | awk '{print $1}' | sort -u || true
  fi
}

listening() { ss -ltnH "sport = :$1" 2>/dev/null | grep -q . ; }
port_owner() { ss -ltnpH "sport = :$1" 2>/dev/null | grep -oE 'users:\(\("[^"]+' | head -1 | sed 's/users:(("//'; }

# ---------------------------------------------------------------- check
cmd_check() {
  echo "Projeto $PROJECT"
  echo "  frontend: https://$WEB_DOMAIN  →  127.0.0.1:$WEB_PORT"
  echo "  API:      https://$API_DOMAIN  →  127.0.0.1:$API_PORT"
  echo

  echo "Domínios e cookies"
  if [[ "$WEB_REG" == "$API_REG" ]]; then
    ok "os dois domínios são de $WEB_REG → cookies de sessão com domain=$COOKIE_DOMAIN"
  else
    bad "domínios de sites diferentes ($WEB_REG e $API_REG): o navegador não envia o cookie de login entre eles. Use subdomínios do mesmo domínio (ex.: app.$WEB_REG e api.$WEB_REG)"
  fi

  echo "DNS"
  local ip4="" ip6=""
  ip4="$(curl -4 -fsS --max-time 6 https://api.ipify.org 2>/dev/null || curl -4 -fsS --max-time 6 https://ifconfig.me 2>/dev/null || true)"
  ip6="$(curl -6 -fsS --max-time 4 https://api64.ipify.org 2>/dev/null || true)"
  [[ -n "$ip4" ]] && ok "IP público deste servidor: $ip4" || warn "não consegui descobrir o IP público deste servidor (sem saída para a internet?)"
  for d in "$WEB_DOMAIN" "$API_DOMAIN"; do
    local a aaaa
    a="$(resolve "$d" A | tr '\n' ' ')"
    aaaa="$(resolve "$d" AAAA | tr '\n' ' ')"
    if [[ -z "$a" ]]; then
      bad "$d não tem registro A. Crie um registro A apontando para ${ip4:-o IP deste servidor}"
    elif [[ -n "$ip4" && " $a " != *" $ip4 "* ]]; then
      bad "$d aponta para $a, mas este servidor é $ip4"
    else
      ok "$d → $a"
    fi
    if [[ -n "$aaaa" && ( -z "$ip6" || " $aaaa " != *" $ip6 "* ) ]]; then
      bad "$d tem registro AAAA ($aaaa) que não é deste servidor. O Let's Encrypt prefere IPv6 e a validação vai falhar: remova o AAAA ou aponte para ${ip6:-o IPv6 deste servidor}"
    fi
  done

  echo "Aplicações"
  for pair in "frontend:$WEB_PORT" "API:$API_PORT"; do
    local name="${pair%%:*}" port="${pair#*:}"
    if listening "$port"; then ok "$name escutando na porta $port ($(port_owner "$port" || echo '?'))"
    else warn "nada escutando na porta $port ($name). O nginx vai responder 502 até a aplicação subir"
    fi
  done

  echo "Servidor web"
  if command -v nginx >/dev/null; then ok "nginx instalado ($(nginx -v 2>&1 | sed 's/.*nginx\///'))"
  else bad "nginx não instalado (Debian/Ubuntu: apt install nginx)"
  fi
  for port in 80 443; do
    local owner; owner="$(port_owner "$port" || true)"
    if [[ -n "$owner" && "$owner" != "nginx" ]]; then
      bad "a porta $port está ocupada por '$owner' (Apache?). Ele precisa sair da 80/443 ou o nginx não sobe"
    fi
  done
  if command -v certbot >/dev/null; then ok "certbot instalado"
  else bad "certbot não instalado (veja o método recomendado em certbot.eff.org para esta distribuição)"
  fi
  nginx_dirs
  if [[ -f "$CONF_PATH" ]]; then
    if grep -q "# managed by Certbot" "$CONF_PATH"; then warn "já existe $CONF_PATH com HTTPS configurado (rodar 'nginx' de novo exige FORCE=true e depois 'ssl')"
    else warn "já existe $CONF_PATH (será substituído, com backup)"
    fi
  fi
  local clash
  local wre are
  wre="${WEB_DOMAIN//./\\.}"; are="${API_DOMAIN//./\\.}"
  clash="$(grep -rlE "server_name[^;]*[[:space:]]($wre|$are)([[:space:]]|;)" /etc/nginx 2>/dev/null | grep -v "$CONF_NAME" || true)"
  [[ -n "$clash" ]] && bad "outro site do nginx já usa esses domínios: $(echo "$clash" | tr '\n' ' ')"

  echo "Firewall"
  if command -v ufw >/dev/null && as_root ufw status 2>/dev/null | grep -q "Status: active"; then
    if as_root ufw status | grep -qE '(80|443|Nginx Full)'; then ok "ufw ativo e liberando HTTP/HTTPS"
    else bad "ufw ativo sem liberar 80/443 (ufw allow 'Nginx Full')"
    fi
    for port in "$WEB_PORT" "$API_PORT"; do
      as_root ufw status | grep -qE "^$port(/tcp)?\s+ALLOW" && warn "a porta $port está aberta no firewall; com o nginx na frente ela não precisa (e não deve) ficar pública"
    done
  else
    warn "ufw inativo ou ausente: confira o firewall do provedor (80 e 443 abertas; portas das aplicações fechadas)"
  fi

  echo
  if [[ "$BLOCKERS" -gt 0 ]]; then echo "BLOQUEIOS: $BLOCKERS (resolva antes de seguir)"; exit 2; fi
  echo "OK para seguir"
}

# ---------------------------------------------------------------- nginx
cmd_nginx() {
  command -v nginx >/dev/null || die "nginx não instalado"
  nginx_dirs
  local pre_out
  if ! pre_out="$(as_root nginx -t 2>&1)"; then
    printf '%s\n' "$pre_out" >&2
    die "o nginx já está com erro ANTES desta mudança (veja acima). Corrija isso primeiro; não vou mexer em nada"
  fi
  local rendered backup=""
  rendered="$(mktemp)"
  sed -e "s/{{PROJECT}}/$PROJECT/g" -e "s/{{PID}}/$PID/g" \
      -e "s/{{WEB_DOMAIN}}/$WEB_DOMAIN/g" -e "s/{{API_DOMAIN}}/$API_DOMAIN/g" \
      -e "s/{{WEB_PORT}}/$WEB_PORT/g" -e "s/{{API_PORT}}/$API_PORT/g" "$TEMPLATE" > "$rendered"
  # Servidor sem IPv6: `listen [::]:80` derrubaria o nginx inteiro.
  if [[ ! -s /proc/net/if_inet6 ]]; then
    sed -i '/listen \[::\]:80;/d' "$rendered"
    echo "→ servidor sem IPv6: site configurado só com IPv4"
  fi

  if [[ -f "$CONF_PATH" ]]; then
    if grep -q "# managed by Certbot" "$CONF_PATH" && [[ "$FORCE" != "true" ]]; then
      rm -f "$rendered"
      die "$CONF_PATH já tem HTTPS do certbot. Para regerar: FORCE=true e depois rode 'ssl' de novo (o certificado existente é reaproveitado)"
    fi
    backup="$CONF_PATH.bak-$(date +%Y%m%d%H%M%S)"
    as_root cp "$CONF_PATH" "$backup"
    echo "→ backup: $backup"
  fi

  as_root install -m 644 "$rendered" "$CONF_PATH"
  rm -f "$rendered"
  [[ -n "$ENABLED_PATH" ]] && as_root ln -sf "$CONF_PATH" "$ENABLED_PATH"
  echo "→ $CONF_PATH"

  local test_out
  if ! test_out="$(as_root nginx -t 2>&1)"; then
    printf '%s\n' "$test_out" >&2
    echo "nginx -t falhou; restaurando o estado anterior" >&2
    if [[ -n "$backup" ]]; then as_root cp "$backup" "$CONF_PATH"
    else as_root rm -f "$CONF_PATH" ${ENABLED_PATH:+"$ENABLED_PATH"}
    fi
    die "configuração inválida (veja a saída do nginx -t acima)"
  fi

  if command -v systemctl >/dev/null && systemctl is-active --quiet nginx 2>/dev/null; then as_root systemctl reload nginx
  elif pgrep -x nginx >/dev/null; then as_root nginx -s reload
  else as_root nginx
  fi
  echo "OK: nginx servindo $WEB_DOMAIN e $API_DOMAIN em HTTP (próximo passo: ssl)"
}

# ---------------------------------------------------------------- ssl
cmd_ssl() {
  command -v certbot >/dev/null || die "certbot não instalado"
  [[ "$LE_EMAIL" =~ ^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$ ]] || die "LE_EMAIL inválido (o Let's Encrypt avisa vencimentos nesse e-mail)"
  as_root certbot --nginx \
    -d "$WEB_DOMAIN" -d "$API_DOMAIN" \
    --cert-name "$CERT_NAME" \
    --non-interactive --agree-tos -m "$LE_EMAIL" \
    --redirect --keep-until-expiring
  as_root nginx -t >/dev/null 2>&1 || die "nginx -t falhou depois do certbot"
  echo "→ renovação automática:"
  if systemctl list-timers 2>/dev/null | grep -qi certbot; then ok "timer do certbot ativo"
  elif [[ -f /etc/cron.d/certbot ]]; then ok "cron do certbot presente"
  else warn "não achei timer/cron de renovação; confira com 'certbot renew --dry-run'"
  fi
  echo "OK: HTTPS ativo para $WEB_DOMAIN e $API_DOMAIN"
}

# ---------------------------------------------------------------- env
set_env() {  # $1 arquivo, $2 chave, $3 valor
  local file="$1" key="$2" value="$3" tmp
  mkdir -p "$(dirname "$file")"; touch "$file"; chmod 600 "$file"
  tmp="$(mktemp)"
  grep -v -E "^${key}=" "$file" > "$tmp" || true
  printf '%s="%s"\n' "$key" "$value" >> "$tmp"
  cat "$tmp" > "$file"; rm -f "$tmp"
}

cmd_env() {
  [[ "$WEB_REG" == "$API_REG" ]] || die "domínios de sites diferentes; cookies não funcionariam (rode 'check')"
  local app="https://$WEB_DOMAIN" api="https://$API_DOMAIN"

  if [[ -f "$API_ENV_FILE" ]]; then
    set_env "$API_ENV_FILE" APP_URL "$app"
    set_env "$API_ENV_FILE" API_URL "$api"
    set_env "$API_ENV_FILE" COOKIE_DOMAIN "$COOKIE_DOMAIN"
    set_env "$API_ENV_FILE" TRUST_PROXY "true"
    set_env "$API_ENV_FILE" HOST "127.0.0.1"
    set_env "$API_ENV_FILE" PORT "$API_PORT"
    ok "$API_ENV_FILE: APP_URL, API_URL, COOKIE_DOMAIN=$COOKIE_DOMAIN, TRUST_PROXY, HOST, PORT"
  else
    warn "$API_ENV_FILE não existe; pulei a API"
  fi

  set_env "$WEB_ENV_FILE" NEXT_PUBLIC_API_URL "$api"
  set_env "$WEB_ENV_FILE" NEXT_PUBLIC_APP_URL "$app"
  ok "$WEB_ENV_FILE: NEXT_PUBLIC_API_URL, NEXT_PUBLIC_APP_URL"

  if [[ -f "$RODSAAS_JSON" ]]; then
    command -v node >/dev/null || die "node não encontrado para atualizar $RODSAAS_JSON"
    APP="$app" API="$api" WP="$WEB_PORT" AP="$API_PORT" node -e '
      const fs = require("fs"); const f = process.argv[1];
      const j = JSON.parse(fs.readFileSync(f, "utf8"));
      j.domains = { ...(j.domains || {}), app: process.env.APP, api: process.env.API };
      j.ports = { ...(j.ports || {}), web: Number(process.env.WP), api: Number(process.env.AP) };
      fs.writeFileSync(f, JSON.stringify(j, null, 2) + "\n");
    ' "$RODSAAS_JSON"
    ok "$RODSAAS_JSON: domains e ports"
  else
    warn "$RODSAAS_JSON não existe; pulei"
  fi
}

# ---------------------------------------------------------------- verify
cmd_verify() {
  local code
  echo "Verificação"
  for d in "$WEB_DOMAIN" "$API_DOMAIN"; do
    code="$(curl -s -o /dev/null -w '%{http_code}' --max-time 10 "http://$d/" || echo 000)"
    [[ "$code" =~ ^30[178]$ ]] && ok "http://$d redireciona para HTTPS ($code)" || bad "http://$d respondeu $code (esperado redirecionamento 301/308)"
    local end
    end="$(echo | timeout 10 openssl s_client -servername "$d" -connect "$d:443" 2>/dev/null | openssl x509 -noout -enddate 2>/dev/null | cut -d= -f2 || true)"
    [[ -n "$end" ]] && ok "certificado de $d válido até $end" || bad "não consegui ler o certificado de $d"
  done
  code="$(curl -s -o /dev/null -w '%{http_code}' --max-time 10 "https://$API_DOMAIN/health" || echo 000)"
  case "$code" in
    200) ok "https://$API_DOMAIN/health → 200" ;;
    502|504) bad "https://$API_DOMAIN/health → $code (nginx ok, mas a API não está rodando na porta $API_PORT)" ;;
    *) bad "https://$API_DOMAIN/health → $code" ;;
  esac
  code="$(curl -s -o /dev/null -w '%{http_code}' --max-time 10 "https://$WEB_DOMAIN/" || echo 000)"
  case "$code" in
    200|30[178]) ok "https://$WEB_DOMAIN → $code" ;;
    502|504) bad "https://$WEB_DOMAIN → $code (nginx ok, mas o frontend não está rodando na porta $WEB_PORT)" ;;
    *) bad "https://$WEB_DOMAIN → $code" ;;
  esac
  local cors
  cors="$(curl -s -o /dev/null -D - --max-time 10 -X OPTIONS -H "Origin: https://$WEB_DOMAIN" -H 'Access-Control-Request-Method: POST' "https://$API_DOMAIN/v1/auth/login" | grep -i '^access-control-allow-origin' | tr -d '\r' || true)"
  [[ "$cors" == *"https://$WEB_DOMAIN"* ]] && ok "CORS da API aceita https://$WEB_DOMAIN" || warn "CORS da API não confirmou https://$WEB_DOMAIN (a API foi reiniciada com o .env novo?)"
  echo
  [[ "$BLOCKERS" -eq 0 ]] && echo "OK" || { echo "FALHAS: $BLOCKERS"; exit 2; }
}

"cmd_$CMD"
