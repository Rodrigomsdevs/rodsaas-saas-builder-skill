#!/usr/bin/env bash
# rodsaas · provisiona o banco de um projeto no PostgreSQL.
#
# Uso:
#   provision.sh --check <config>   mostra o que já existe (não altera nada)
#   provision.sh <config>           cria/atualiza usuários, bancos e grava o .env
#
# <config> é um arquivo KEY=valor (chmod 600) com as variáveis descritas em
# config.example. Ele contém senhas: crie com mktemp e apague logo após usar.
# Nenhuma senha é impressa por este script.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SQL_DIR="$SCRIPT_DIR/sql"

die()  { printf 'ERRO: %s\n' "$*" >&2; exit 1; }
info() { printf '%s\n' "$*"; }

# ---------------------------------------------------------------- argumentos
MODE=provision
if [[ "${1:-}" == "--check" ]]; then MODE=check; shift; fi
CONFIG="${1:-}"
[[ -n "$CONFIG" && -f "$CONFIG" ]] || die "informe o arquivo de configuração (veja config.example)"

# shellcheck disable=SC1090
source "$CONFIG"

ADMIN_MODE="${ADMIN_MODE:-sudo}"            # sudo | docker | url
DB_NAME="${DB_NAME:-}"
OWNER_USER="${OWNER_USER:-}"
OWNER_PASSWORD="${OWNER_PASSWORD:-}"
APP_USER="${APP_USER:-}"
APP_PASSWORD="${APP_PASSWORD:-}"
OWNER_CREATEDB="${OWNER_CREATEDB:-true}"    # true em dev (shadow db do prisma), false em produção
CREATE_TEST_DB="${CREATE_TEST_DB:-true}"
TEST_DB_NAME="${TEST_DB_NAME:-${DB_NAME}_test}"
DB_HOST="${DB_HOST:-localhost}"             # host que a APLICAÇÃO usa para conectar
DB_PORT="${DB_PORT:-5432}"
DB_SSLMODE="${DB_SSLMODE:-}"                # ex.: require (servidor remoto)
ENV_FILE="${ENV_FILE:-.env}"
ENV_TEST_FILE="${ENV_TEST_FILE:-.env.test}"
DOCKER_COMPOSE_FILE="${DOCKER_COMPOSE_FILE:-docker-compose.yml}"
DOCKER_SERVICE="${DOCKER_SERVICE:-postgres}"
DOCKER_SUPERUSER="${DOCKER_SUPERUSER:-postgres}"
ADMIN_HOST="${ADMIN_HOST:-}"
ADMIN_PORT="${ADMIN_PORT:-5432}"
ADMIN_USER="${ADMIN_USER:-}"
ADMIN_PASSWORD="${ADMIN_PASSWORD:-}"
ADMIN_SSLMODE="${ADMIN_SSLMODE:-prefer}"

# ---------------------------------------------------------------- validação
IDENT_RE='^[a-z_][a-z0-9_]{0,62}$'
PASS_RE='^[A-Za-z0-9._~-]{16,128}$'          # só caracteres seguros em URL de conexão
RESERVED='^(postgres|template0|template1|pg_.*|public)$'

for pair in "DB_NAME:$DB_NAME" "OWNER_USER:$OWNER_USER" "APP_USER:$APP_USER"; do
  key="${pair%%:*}"; val="${pair#*:}"
  [[ "$val" =~ $IDENT_RE ]] || die "$key inválido: use minúsculas, números e _ (começando com letra ou _)"
  [[ ! "$val" =~ $RESERVED ]] || die "$key não pode ser '$val' (nome reservado)"
done
if [[ "$CREATE_TEST_DB" == "true" ]]; then
  [[ "$TEST_DB_NAME" =~ $IDENT_RE ]] || die "TEST_DB_NAME inválido"
  [[ "$TEST_DB_NAME" != "$DB_NAME" ]] || die "TEST_DB_NAME deve ser diferente de DB_NAME"
fi
[[ "$OWNER_USER" != "$APP_USER" ]] || die "OWNER_USER e APP_USER precisam ser usuários diferentes"
[[ "$OWNER_CREATEDB" =~ ^(true|false)$ ]] || die "OWNER_CREATEDB deve ser true ou false"
[[ "$ADMIN_MODE" =~ ^(sudo|docker|url)$ ]] || die "ADMIN_MODE deve ser sudo, docker ou url"
[[ "$DB_PORT" =~ ^[0-9]+$ ]] || die "DB_PORT inválida"

gen_password() { head -c 64 /dev/urandom | base64 | tr -dc 'A-Za-z0-9' | cut -c1-32; }

if [[ "$MODE" == "provision" ]]; then
  OWNER_PW_GENERATED=false; APP_PW_GENERATED=false
  if [[ -z "$OWNER_PASSWORD" ]]; then OWNER_PASSWORD="$(gen_password)"; OWNER_PW_GENERATED=true; fi
  if [[ -z "$APP_PASSWORD" ]];   then APP_PASSWORD="$(gen_password)";   APP_PW_GENERATED=true; fi
  [[ "$OWNER_PASSWORD" =~ $PASS_RE ]] || die "OWNER_PASSWORD: mínimo 16 caracteres, apenas letras, números e . _ ~ -"
  [[ "$APP_PASSWORD" =~ $PASS_RE ]]   || die "APP_PASSWORD: mínimo 16 caracteres, apenas letras, números e . _ ~ -"
  [[ "$OWNER_PASSWORD" != "$APP_PASSWORD" ]] || die "as duas senhas precisam ser diferentes"
fi

# ---------------------------------------------------------------- psql como admin
WORK_DIR="$(mktemp -d)"
chmod 700 "$WORK_DIR"
trap 'rm -rf "$WORK_DIR"' EXIT

# Executa SQL lido do stdin com um usuário administrador.
# Senhas nunca vão para a linha de comando (ficariam visíveis no `ps`).
admin_psql() {
  local opts=(-X -q -v ON_ERROR_STOP=1 "$@")
  case "$ADMIN_MODE" in
    sudo)
      if [[ "$(id -u)" -eq 0 ]]; then
        runuser -u postgres -- psql "${opts[@]}" -d postgres
      else
        sudo -n -u postgres psql "${opts[@]}" -d postgres
      fi ;;
    docker)
      docker compose -f "$DOCKER_COMPOSE_FILE" exec -T "$DOCKER_SERVICE" \
        psql "${opts[@]}" -U "$DOCKER_SUPERUSER" -d postgres ;;
    url)
      PGHOST="$ADMIN_HOST" PGPORT="$ADMIN_PORT" PGUSER="$ADMIN_USER" \
      PGPASSWORD="$ADMIN_PASSWORD" PGSSLMODE="$ADMIN_SSLMODE" PGDATABASE=postgres \
        psql "${opts[@]}" ;;
  esac
}

# Arquivo com as variáveis psql comuns (nomes e, no provisionamento, senhas).
VARS="$WORK_DIR/vars.sql"
{
  printf "\\set owner_user '%s'\n" "$OWNER_USER"
  printf "\\set app_user '%s'\n" "$APP_USER"
  printf "\\set owner_createdb %s\n" "$OWNER_CREATEDB"
  if [[ "$MODE" == "provision" ]]; then
    printf "\\set owner_password '%s'\n" "$OWNER_PASSWORD"
    printf "\\set app_password '%s'\n" "$APP_PASSWORD"
  fi
} > "$VARS"
chmod 600 "$VARS"

# Uma consulta que devolve um único valor (texto puro).
admin_value() {  # $1 = SQL usando :'owner_user' etc.
  { cat "$VARS"; printf '%s\n' "$1"; } | admin_psql -t -A
}

# ---------------------------------------------------------------- pré-checagem
case "$ADMIN_MODE" in
  sudo)
    command -v psql >/dev/null || die "psql não encontrado. O PostgreSQL está instalado?"
    if [[ "$(id -u)" -ne 0 ]] && ! sudo -n true 2>/dev/null; then
      die "este usuário precisa de sudo sem senha para agir como 'postgres' (ou rode com ADMIN_MODE=url)"
    fi ;;
  docker)
    command -v docker >/dev/null || die "docker não encontrado"
    [[ -f "$DOCKER_COMPOSE_FILE" ]] || die "não achei $DOCKER_COMPOSE_FILE" ;;
  url)
    command -v psql >/dev/null || die "psql (cliente) não encontrado"
    [[ -n "$ADMIN_HOST" && -n "$ADMIN_USER" ]] || die "ADMIN_HOST e ADMIN_USER são obrigatórios no modo url" ;;
esac

admin_value "SELECT 1" >/dev/null 2>"$WORK_DIR/err" || {
  cat "$WORK_DIR/err" >&2
  die "não consegui conectar ao PostgreSQL como administrador (modo $ADMIN_MODE)"
}

IS_SUPER="$(admin_value "SELECT rolsuper OR rolcreaterole FROM pg_roles WHERE rolname = current_user")"
[[ "$IS_SUPER" == "t" ]] || die "o usuário administrador precisa ser superuser ou ter CREATEROLE"

role_status() { admin_value "SELECT CASE WHEN EXISTS (SELECT 1 FROM pg_roles WHERE rolname = '$1') THEN 'existe' ELSE 'não existe' END"; }
db_owner()    { admin_value "SELECT pg_get_userbyid(datdba) FROM pg_database WHERE datname = '$1'"; }

OWNER_STATUS="$(role_status "$OWNER_USER")"
APP_STATUS="$(role_status "$APP_USER")"
MAIN_DB_OWNER="$(db_owner "$DB_NAME")"
TEST_DB_OWNER=""
[[ "$CREATE_TEST_DB" == "true" ]] && TEST_DB_OWNER="$(db_owner "$TEST_DB_NAME")"

describe_db() { [[ -z "$2" ]] && echo "$1: não existe" || echo "$1: existe (dono: $2)"; }

if [[ "$MODE" == "check" ]]; then
  info "usuário $OWNER_USER: $OWNER_STATUS"
  info "usuário $APP_USER: $APP_STATUS"
  info "banco $(describe_db "$DB_NAME" "$MAIN_DB_OWNER")"
  [[ "$CREATE_TEST_DB" == "true" ]] && info "banco $(describe_db "$TEST_DB_NAME" "$TEST_DB_OWNER")"
  exit 0
fi

# Banco existente com outro dono: não mexemos (poderia ser de outro sistema).
for pair in "$DB_NAME:$MAIN_DB_OWNER" "$TEST_DB_NAME:$TEST_DB_OWNER"; do
  name="${pair%%:*}"; owner="${pair#*:}"
  [[ "$name" == "$TEST_DB_NAME" && "$CREATE_TEST_DB" != "true" ]] && continue
  if [[ -n "$owner" && "$owner" != "$OWNER_USER" ]]; then
    die "o banco '$name' já existe e pertence a '$owner'. Escolha outro nome ou transfira a posse manualmente."
  fi
done

# ---------------------------------------------------------------- provisionamento
info "→ usuários"
{ cat "$VARS"; cat "$SQL_DIR/roles.sql"; } | admin_psql

provision_db() {  # $1 = nome do banco, $2 = dono atual ("" se não existe)
  local exists=false
  [[ -n "$2" ]] && exists=true
  info "→ banco $1"
  {
    cat "$VARS"
    printf "\\set target_db '%s'\n" "$1"
    printf "\\set db_exists %s\n" "$exists"
    cat "$SQL_DIR/database.sql"
  } | admin_psql
}

provision_db "$DB_NAME" "$MAIN_DB_OWNER"
[[ "$CREATE_TEST_DB" == "true" ]] && provision_db "$TEST_DB_NAME" "$TEST_DB_OWNER"

# ---------------------------------------------------------------- .env
db_url() {  # $1 user, $2 senha, $3 banco
  local url="postgresql://$1:$2@$DB_HOST:$DB_PORT/$3"
  [[ -n "$DB_SSLMODE" ]] && url="$url?sslmode=$DB_SSLMODE"
  printf '%s' "$url"
}

set_env() {  # $1 arquivo, $2 chave, $3 valor (substitui a linha se já existir)
  local file="$1" key="$2" value="$3" tmp
  mkdir -p "$(dirname "$file")"
  touch "$file"
  chmod 600 "$file"
  tmp="$WORK_DIR/env.tmp"
  grep -v -E "^${key}=" "$file" > "$tmp" || true
  printf '%s="%s"\n' "$key" "$value" >> "$tmp"
  cat "$tmp" > "$file"
}

ensure_gitignored() {  # $1 arquivo .env
  local dir base gi
  dir="$(dirname "$1")"; base="$(basename "$1")"; gi="$dir/.gitignore"
  touch "$gi"
  grep -qxF "$base" "$gi" || printf '%s\n' "$base" >> "$gi"
}

info "→ $ENV_FILE"
set_env "$ENV_FILE" DATABASE_URL           "$(db_url "$APP_USER" "$APP_PASSWORD" "$DB_NAME")"
set_env "$ENV_FILE" MIGRATION_DATABASE_URL "$(db_url "$OWNER_USER" "$OWNER_PASSWORD" "$DB_NAME")"
ensure_gitignored "$ENV_FILE"

if [[ "$CREATE_TEST_DB" == "true" ]]; then
  info "→ $ENV_TEST_FILE"
  set_env "$ENV_TEST_FILE" DATABASE_URL           "$(db_url "$APP_USER" "$APP_PASSWORD" "$TEST_DB_NAME")"
  set_env "$ENV_TEST_FILE" MIGRATION_DATABASE_URL "$(db_url "$OWNER_USER" "$OWNER_PASSWORD" "$TEST_DB_NAME")"
  ensure_gitignored "$ENV_TEST_FILE"
fi

# ---------------------------------------------------------------- validação
# Conecta como cada usuário, do jeito que a aplicação vai conectar.
as_user_psql() {  # $1 user, $2 senha, $3 banco, $4 SQL
  if command -v psql >/dev/null && [[ "$ADMIN_MODE" != "docker" || -n "$(docker compose -f "$DOCKER_COMPOSE_FILE" port "$DOCKER_SERVICE" 5432 2>/dev/null)" ]]; then
    PGHOST="$DB_HOST" PGPORT="$DB_PORT" PGUSER="$1" PGPASSWORD="$2" PGDATABASE="$3" \
    PGSSLMODE="${DB_SSLMODE:-prefer}" psql -X -q -t -A -v ON_ERROR_STOP=1 -c "$4"
  else
    # Sem cliente psql no host: valida de dentro do container (somente dev).
    docker compose -f "$DOCKER_COMPOSE_FILE" exec -T -e PGPASSWORD="$2" "$DOCKER_SERVICE" \
      psql -X -q -t -A -v ON_ERROR_STOP=1 -h localhost -U "$1" -d "$3" -c "$4"
  fi
}

info "→ validação"
FAILED=false

if ! as_user_psql "$OWNER_USER" "$OWNER_PASSWORD" "$DB_NAME" "SELECT 1" >/dev/null 2>"$WORK_DIR/err"; then
  cat "$WORK_DIR/err" >&2
  info "  ✗ $OWNER_USER não conseguiu conectar em $DB_HOST:$DB_PORT (confira listen_addresses e pg_hba.conf)"
  FAILED=true
else
  info "  ✓ $OWNER_USER conecta"
fi

if ! FLAGS="$(as_user_psql "$APP_USER" "$APP_PASSWORD" "$DB_NAME" \
    "SELECT (rolsuper OR rolbypassrls OR rolcreatedb OR rolcreaterole)::text FROM pg_roles WHERE rolname = current_user" 2>"$WORK_DIR/err")"; then
  cat "$WORK_DIR/err" >&2
  info "  ✗ $APP_USER não conseguiu conectar em $DB_HOST:$DB_PORT (confira listen_addresses e pg_hba.conf)"
  FAILED=true
else
  info "  ✓ $APP_USER conecta"
  if [[ "$FLAGS" == "false" ]]; then
    info "  ✓ $APP_USER sem superuser, bypassrls, createdb e createrole"
  else
    info "  ✗ $APP_USER tem privilégios que não deveria ter"; FAILED=true
  fi
  if as_user_psql "$APP_USER" "$APP_PASSWORD" "$DB_NAME" \
      "CREATE TABLE public.__rodsaas_probe (id int); DROP TABLE public.__rodsaas_probe;" >/dev/null 2>&1; then
    info "  ✗ $APP_USER conseguiu criar tabela em public (não deveria)"; FAILED=true
  else
    info "  ✓ $APP_USER não cria tabelas (só lê e grava dados)"
  fi
fi

# ---------------------------------------------------------------- resumo
info ""
info "Resumo"
status_word() { [[ "$1" == "existe" ]] && echo "atualizado" || echo "criado"; }
info "  usuários: $OWNER_USER (migrations, $(status_word "$OWNER_STATUS")), $APP_USER (aplicação, $(status_word "$APP_STATUS"))"
info "  bancos:   $DB_NAME$([[ "$CREATE_TEST_DB" == "true" ]] && echo ", $TEST_DB_NAME")"
info "  senhas:   $OWNER_USER $([[ $OWNER_PW_GENERATED == true ]] && echo gerada || echo informada), $APP_USER $([[ $APP_PW_GENERATED == true ]] && echo gerada || echo informada) — gravadas só no $ENV_FILE$([[ "$CREATE_TEST_DB" == "true" ]] && echo " e $ENV_TEST_FILE")"

[[ "$FAILED" == "false" ]] || die "provisionado, mas a validação falhou (veja acima)"
info "OK"
