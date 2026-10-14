---
name: domain
description: Publica um projeto rodsaas nos domínios reais — configura o nginx como proxy reverso para o frontend e a API, emite o HTTPS com Let's Encrypt (certbot) com renovação automática, e ajusta .env da API e do front, cookies de sessão, CORS e rodsaas.json. Pede o domínio do frontend e o da API e valida DNS, portas, firewall e conflitos antes de mexer. Use sempre que o usuário pedir para configurar domínio, nginx, SSL/HTTPS, certificado, certbot, "colocar no ar com meu domínio", ou chamar /rodsaas:domain.
---

# rodsaas · domain

Coloca o SaaS no ar nos domínios do usuário, num servidor Linux, com:

```
https://app.meusaas.com.br  ──nginx──▶  127.0.0.1:<ports.web>   (frontend Next.js)
https://api.meusaas.com.br  ──nginx──▶  127.0.0.1:<ports.api>   (API Fastify)
```

O trabalho é do script `scripts/domain.sh` (testado: gera o site, valida com `nginx -t`, desfaz sozinho se der erro, convive com vários SaaS no mesmo servidor). **Não escreva config de nginx à mão**: use o script.

Esta skill **não sobe as aplicações** (build, migrations, processo rodando em produção). Ela aponta o domínio para as portas; se nada estiver rodando nelas, o site responde 502 até as aplicações subirem. Avise isso, sem tentar resolver por conta própria além do que está aqui.

## 1. Perguntar

Leia o `rodsaas.json` (nome do projeto, `ports.web`, `ports.api`). Se não tiver `ports`, pergunte e grave (com a checagem de porta livre do `/rodsaas:backend`).

Pergunte, numa mensagem só:

- **Domínio do frontend** — ex.: `app.meusaas.com.br` (ou o domínio raiz `meusaas.com.br`, se preferir o app na raiz).
- **Domínio da API** — ex.: `api.meusaas.com.br`.
- **E-mail** para o Let's Encrypt (avisos de vencimento do certificado).

Regra que não tem exceção: **os dois domínios precisam ser do mesmo domínio registrado** (`app.meusaas.com.br` + `api.meusaas.com.br`). Os cookies de login são compartilhados entre os dois; com domínios de sites diferentes (`meusaas.com` + `meusaas-api.com`), o login simplesmente não funciona. Se o usuário propuser isso, explique em uma frase e sugira os subdomínios.

Aceite o que o usuário digitar com `https://` ou barra no final, mas limpe antes de usar.

## 2. Diagnóstico (não altera nada)

Monte a configuração num arquivo temporário (chaves em `scripts/config.example`) e rode:

```bash
CFG="$(mktemp)"
cat > "$CFG" <<EOF
PROJECT=meusaas
WEB_DOMAIN=app.meusaas.com.br
API_DOMAIN=api.meusaas.com.br
WEB_PORT=3000
API_PORT=3333
LE_EMAIL=voce@meusaas.com.br
API_ENV_FILE=api/.env
WEB_ENV_FILE=web/.env.production
RODSAAS_JSON=rodsaas.json
EOF
"${CLAUDE_PLUGIN_ROOT}/skills/domain/scripts/domain.sh" check "$CFG"
```

(Sem `CLAUDE_PLUGIN_ROOT`, use o caminho desta skill.)

O `check` verifica e explica cada item. Saída com `BLOQUEIOS` = pare e resolva com o usuário:

| Bloqueio | O que fazer |
|---|---|
| domínio sem registro **A** ou apontando para outro IP | peça para criar/corrigir o registro A no painel do domínio (Registro.br, Cloudflare, Hostinger…) apontando para o IP mostrado. Propagação pode levar de minutos a algumas horas; rode o `check` de novo depois. Na Cloudflare, deixe a nuvem **cinza** (só DNS) pelo menos até o certificado sair |
| registro **AAAA** que não é deste servidor | remover o AAAA (ou apontar para o IPv6 deste servidor): o Let's Encrypt tenta IPv6 primeiro e falha |
| porta 80/443 ocupada por outro programa (geralmente Apache) | perguntar se pode parar/desativar o Apache ou movê-lo de porta. Nunca pare um serviço sem confirmação: pode haver outros sites nele |
| nginx ou certbot não instalados | oferecer a instalação (nginx pelo gerenciador de pacotes; certbot pelo método que o site oficial recomenda para a distribuição), com confirmação |
| ufw ativo sem 80/443 | oferecer `ufw allow 'Nginx Full'`, com confirmação |
| outro site do nginx já usa o domínio | mostrar qual arquivo; perguntar se é para substituir |
| domínios de sites diferentes | ver a regra acima |

Avisos (`!`) não bloqueiam, mas comente os relevantes. Em especial: **portas das aplicações abertas no firewall** devem ser fechadas (com o nginx na frente, só 80 e 443 ficam públicas; a API e o front escutam em `127.0.0.1`).

## 3. nginx

```bash
"${CLAUDE_PLUGIN_ROOT}/skills/domain/scripts/domain.sh" nginx "$CFG"
```

- Gera `rodsaas-<projeto>.conf` (em `sites-available` + link em `sites-enabled`, ou em `conf.d`, conforme a distribuição), com nomes de upstream únicos por projeto: vários SaaS no mesmo servidor não colidem.
- Recusa mexer se o nginx **já estiver com erro antes**; testa com `nginx -t` depois de escrever e **restaura o estado anterior** se falhar; recarrega sem derrubar os outros sites.
- Rodar de novo faz backup do arquivo anterior. Se o arquivo já tiver HTTPS do certbot, recusa sem `FORCE=true`; com `FORCE=true`, rode o passo 4 em seguida (o certificado existente é reaproveitado).
- Servidor sem IPv6: gera só com IPv4 automaticamente.

O que vai no site: proxy com `X-Forwarded-*` (a API usa para IP real e HTTPS), limite de body compatível com a API, timeouts, suporte a WebSocket no front, cabeçalhos de segurança no front e HSTS (vale depois do HTTPS).

## 4. HTTPS

```bash
"${CLAUDE_PLUGIN_ROOT}/skills/domain/scripts/domain.sh" ssl "$CFG"
```

Emite **um certificado** com os dois domínios (`--cert-name rodsaas-<projeto>`), instala no nginx, liga o redirecionamento HTTP → HTTPS e confere a renovação automática (timer ou cron do certbot). Se falhar, a causa quase sempre é DNS (volte ao passo 2) ou porta 80 bloqueada no firewall do provedor (painel da VPS, não só o ufw).

Não rode o `ssl` repetidamente em caso de erro: o Let's Encrypt tem limite de tentativas. Diagnostique primeiro.

## 5. Variáveis de ambiente

```bash
"${CLAUDE_PLUGIN_ROOT}/skills/domain/scripts/domain.sh" env "$CFG"; rm -f "$CFG"
```

Atualiza, preservando as outras linhas:

| Arquivo | Variáveis |
|---|---|
| `api/.env` | `APP_URL=https://<front>` (CORS e links dos e-mails), `API_URL`, `COOKIE_DOMAIN=<domínio registrado>`, `TRUST_PROXY=true`, `HOST=127.0.0.1`, `PORT` |
| `web/.env.production` | `NEXT_PUBLIC_API_URL`, `NEXT_PUBLIC_APP_URL` |
| `rodsaas.json` | `domains` e `ports` |

Depois diga ao usuário, claramente, o que **ele precisa fazer** (ou faça, se ele pedir e as aplicações estiverem gerenciadas nesta máquina):

1. **Reiniciar a API** para ler o `.env` novo.
2. **Rodar `npm run build` no `web/` e reiniciar o front**: as variáveis `NEXT_PUBLIC_*` entram no build; sem rebuild, o front continua chamando o endereço antigo.
3. **Stripe** (se for cobrar de verdade): com a chave de produção no `api/.env`, rodar `npm run billing:sync -- --webhook https://<api>/v1/billing/webhook` no `api/`. Ele cria produtos, preços, o portal do cliente e o webhook, e mostra o `STRIPE_WEBHOOK_SECRET` (uma única vez) para colocar no `.env`. Sem chave, a produção fica com a cobrança `disabled` (planos visíveis, botões desabilitados com aviso).
4. **Resend** (e-mail de produção): `RESEND_*` preenchidas no `api/.env` (domínio verificado no Resend, ver README do plugin, seção "E-mails com Resend") e, no `api/`, `npm run email:setup -- --webhook https://<api>/v1/webhooks/resend --test <seu e-mail>`. Ele confere o domínio e os registros DNS, cria o webhook (entrega, supressão e recebimento) e mostra o `RESEND_WEBHOOK_SECRET` uma única vez. Sem isso, a API de produção não sobe com `MAIL_DRIVER=resend` (o boot exige o segredo).
5. Em produção: `NODE_ENV=production` e `DOCS_ENABLED=false` no `api/.env`, se ainda não estiverem.

## 6. Verificar

Com as aplicações rodando:

```bash
"${CLAUDE_PLUGIN_ROOT}/skills/domain/scripts/domain.sh" verify "$CFG"
```

Confere: HTTP redireciona para HTTPS, certificado válido (e até quando), `https://<api>/health` responde 200, o front responde, e o CORS da API aceita o domínio do front. 502/504 = nginx certo, aplicação parada naquela porta.

## Relatório final

Curto: URLs no ar, validade do certificado e renovação automática, arquivos alterados, e a lista do que falta o usuário fazer (passo 5). Se as aplicações não estavam rodando, deixe isso como primeiro item.

## Notas

- Domínio raiz + `www`: se o front for `meusaas.com.br`, pergunte se quer também `www.meusaas.com.br` redirecionando para a raiz; nesse caso, inclua o `www` no certificado (adicione `-d www...` ao comando do certbot) e um bloco de redirecionamento — registre no relatório que foi um ajuste manual.
- Trocar de domínio depois: rode a skill de novo com os domínios novos; o certificado antigo pode ser removido com `certbot delete --cert-name ...` (pergunte antes).
- Nada aqui expõe as portas das aplicações: elas continuam só em `127.0.0.1`.
