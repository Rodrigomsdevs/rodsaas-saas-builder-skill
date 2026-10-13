---
name: db
description: Provisiona o banco PostgreSQL de um projeto rodsaas num servidor Linux — cria o banco (e o de teste), o usuário dono das migrations e o usuário da aplicação sem privilégios (sem BYPASSRLS), aplica os grants certos para RLS, cria o schema do pg-boss e grava DATABASE_URL e MIGRATION_DATABASE_URL no .env. Use sempre que o usuário pedir para criar/configurar banco, usuário ou senha do Postgres de um SaaS, provisionar o banco de produção, "preparar o banco", ou chamar /rodsaas:db; também é a Fase 2 do /rodsaas:backend.
---

# rodsaas · db

Prepara o PostgreSQL para um projeto rodsaas com **dois usuários separados**:

| Usuário | Exemplo | Para quê | Privilégios |
|---|---|---|---|
| dono | `meusaas_owner` | roda as migrations, é dono das tabelas | dono do banco e do schema `public`; `CREATEDB` só em dev |
| aplicação | `meusaas_app` | usado pela API em runtime | só `SELECT/INSERT/UPDATE/DELETE`; **sem** superuser, `BYPASSRLS`, `CREATEDB`, `CREATEROLE` |

Por que dois: no Postgres, o dono da tabela e o superuser **ignoram RLS**. Se a API conectasse como dono, todo o isolamento entre tenants do rodsaas existiria só no papel.

O trabalho pesado é do script `scripts/provision.sh`, já testado e idempotente. Esta skill decide o modo, pergunta o que precisa, monta a configuração e roda o script. **Não reescreva o SQL à mão**: use o script.

## 1. Descobrir onde está o Postgres

Rode, sem alterar nada:

```bash
command -v psql; pg_lsclusters 2>/dev/null; systemctl is-active postgresql 2>/dev/null
ls docker-compose.yml api/docker-compose.yml 2>/dev/null
```

Escolha o `ADMIN_MODE`:

| Situação | Modo |
|---|---|
| Postgres instalado nesta máquina Linux | `sudo` (vira o usuário de sistema `postgres`; precisa ser root ou ter `sudo` sem senha) |
| Postgres no docker compose do projeto | `docker` |
| Servidor que já existe em outra máquina (VPS, RDS, Supabase...) | `url` (pede um usuário admin) |

Se não há Postgres nenhum: pergunte se o usuário quer instalar nesta máquina (`apt install postgresql` em Debian/Ubuntu, com a versão estável que o repositório oferecer) ou usar docker. Não instale sem confirmação.

Se o modo for `sudo` e o usuário atual não for root nem tiver `sudo -n`, explique e ofereça o modo `url` com um usuário admin.

## 2. Perguntar (uma vez, tudo junto)

Use a ferramenta de perguntas se existir; senão, uma única mensagem. Sugira padrões derivados do nome do projeto:

- **Nome do banco** — padrão: nome do projeto em snake_case (`meusaas`).
- **Usuário dono** — padrão: `<banco>_owner`.
- **Usuário da aplicação** — padrão: `<banco>_app`.
- **Senhas** — para cada usuário: **gerar uma senha forte** (padrão, recomendado) ou **digitar a minha**.
  - Gerada: o script cria 32 caracteres aleatórios e grava direto no `.env`. Ela nunca aparece no chat.
  - Digitada: mínimo 16 caracteres, só letras, números e `. _ ~ -` (para não quebrar a URL de conexão). Avise em uma linha que **o que é digitado no chat fica no histórico da conversa**.
- **Ambiente** — dev ou produção:
  - dev: `OWNER_CREATEDB=true` (o `prisma migrate dev` precisa criar um shadow database) e `CREATE_TEST_DB=true`;
  - produção: `OWNER_CREATEDB=false`, `CREATE_TEST_DB=false`, e normalmente `DB_SSLMODE=require` se a API conectar por rede.
- **Onde gravar o `.env`** — padrão: `api/.env` (e `api/.env.test` em dev).
- Modo `url`: host, porta, usuário admin e senha do admin (mesmo aviso sobre o histórico), e o host/porta que **a aplicação** vai usar (pode ser diferente, ex.: rede interna).

Não pergunte o que já sabe pelo contexto (ex.: o `/rodsaas:backend` já informou nome do projeto, pasta e ambiente).

## 3. Checar o que já existe

Monte o arquivo de configuração **num arquivo temporário protegido**, nunca dentro do projeto:

```bash
CFG="$(mktemp)"; chmod 600 "$CFG"
cat > "$CFG" <<'EOF'
ADMIN_MODE=sudo
DB_NAME=meusaas
OWNER_USER=meusaas_owner
OWNER_PASSWORD=
APP_USER=meusaas_app
APP_PASSWORD=
OWNER_CREATEDB=true
CREATE_TEST_DB=true
DB_HOST=localhost
DB_PORT=5432
ENV_FILE=api/.env
ENV_TEST_FILE=api/.env.test
EOF
```

Todas as chaves estão documentadas em `scripts/config.example`. Senha vazia = gerar.

Então rode a checagem (não altera nada):

```bash
"${CLAUDE_PLUGIN_ROOT}/skills/db/scripts/provision.sh" --check "$CFG"
```

(Se `CLAUDE_PLUGIN_ROOT` não estiver definido, use o caminho desta skill.)

Se algum **usuário já existe**, avise antes de seguir: o script vai **redefinir a senha** dele, e qualquer coisa que use a senha atual (outra instância da API, um cliente de banco) para de conectar até receber a nova. Siga só com confirmação.

Se um **banco já existe com outro dono**, o script se recusa a mexer (pode ser de outro sistema). Proponha outro nome.

## 4. Provisionar

```bash
"${CLAUDE_PLUGIN_ROOT}/skills/db/scripts/provision.sh" "$CFG"; rm -f "$CFG"
```

Apague o arquivo de configuração **sempre**, mesmo se o script falhar.

O script:
1. cria ou atualiza os dois usuários com os privilégios da tabela acima;
2. cria o banco (e o de teste) com o dono certo, fecha o acesso de `PUBLIC`, entrega o schema `public` ao dono;
3. configura privilégios padrão para que as tabelas criadas pelas migrations no futuro já deem só DML ao usuário da aplicação;
4. cria o schema `pgboss` pertencente ao usuário da aplicação;
5. grava `DATABASE_URL` (aplicação) e `MIGRATION_DATABASE_URL` (dono) no `.env`/`.env.test`, com `chmod 600`, preservando as outras linhas e garantindo que estão no `.gitignore`;
6. valida conectando como cada usuário e confirmando que o da aplicação não tem privilégios especiais e não consegue criar tabelas.

Nunca imprima, leia em voz alta ou copie para o chat o conteúdo do `.env`. Se precisar mostrar uma URL, mascare a senha (`postgresql://user:***@host/db`).

## 5. Se a validação falhar

| Sintoma | Causa provável | O que fazer |
|---|---|---|
| usuário não conecta em `localhost` | `pg_hba.conf` sem regra `host` com senha para 127.0.0.1 | mostre a linha necessária (`host all all 127.0.0.1/32 scram-sha-256`), peça confirmação para editar e recarregue o Postgres |
| conecta local, mas a API remota não | `listen_addresses` só em localhost / firewall | explique; não abra o banco para a internet sem o usuário pedir explicitamente |
| `sudo: a password is required` | usuário sem sudo sem senha | modo `url` com usuário admin |
| admin sem permissão | admin não é superuser nem tem `CREATEROLE` | pedir outro usuário admin |

## 6. Relatório final

Curto, sem senhas:
- usuários e bancos criados ou atualizados;
- onde as URLs foram gravadas;
- se alguma senha foi digitada no chat, recomende trocá-la depois rodando a skill de novo com senha gerada;
- produção: lembre que o **mesmo script** serve para provisionar o servidor de produção (`ADMIN_MODE=url` ou `sudo` lá), e que as migrations rodam com `MIGRATION_DATABASE_URL` (`prisma migrate deploy`) enquanto a API usa `DATABASE_URL`;
- próximo passo natural: rodar as migrations do projeto.

## Notas

- Extensões que exigem superuser (`CREATE EXTENSION`) não podem ser criadas pelo dono. Se o projeto precisar de alguma, crie com o admin no próprio banco, uma vez, e registre no README do projeto.
- O script não coloca senha em argumento de linha de comando (que apareceria no `ps`); passa tudo por stdin e variáveis de ambiente. A única exceção é a validação no modo `docker` quando não há `psql` no host, que passa a senha para dentro do container por `-e` (aceitável só em dev). Mantenha assim se alterar o script.
- Testado com PostgreSQL 16 no modo `sudo`. Os modos `docker` e `url` usam o mesmo SQL, mas valide na primeira execução real.
