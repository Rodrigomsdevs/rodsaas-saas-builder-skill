# rodsaas

**Skills para o Claude Code criarem a base de um SaaS B2B pra você: login, empresas, usuários, planos e pagamento com Stripe, já do jeito certo e seguro.**

Você descreve o seu SaaS e o Claude monta o backend e o painel inteiros seguindo um padrão testado. Você foca no que o seu produto faz de diferente.

> **Status: rascunho (v0.3).** Banco, backend, frontend e domínio prontos para teste.

---

## O que é isso, em 30 segundos

Todo SaaS precisa das mesmas coisas antes de ter qualquer funcionalidade própria: cadastro, login, "empresas" com vários usuários, convites, planos, cobrança, segurança. Fazer isso do zero toda vez cansa e é fácil errar algo grave, como um cliente conseguir ver os dados de outro.

O **rodsaas** é um pacote de *skills* para o Claude Code. Uma skill é um manual de instruções que o Claude segue quando você pede algo. Com ele instalado, você digita um comando e o Claude cria tudo isso pra você, sempre no mesmo padrão.

## O que você ganha

Rodando as skills, você termina com uma API e um painel funcionando, com:

- ✅ Cadastro, login, "esqueci minha senha" e confirmação de e-mail
- ✅ **Empresas (multi-tenant):** cada cliente tem sua conta, com vários usuários dentro
- ✅ Convites por e-mail e papéis (dono, admin, membro)
- ✅ **Planos e pagamento com Stripe** (assinatura, troca de plano, portal do cliente)
- ✅ Limites por plano (ex.: "plano Free permite 3 usuários")
- ✅ Documentação da API gerada sozinha, numa página bonita em `/docs`
- ✅ Segurança séria: um cliente **nunca** vê dados de outro, senhas protegidas, proteção contra ataques comuns
- ✅ **Painel com a cara do seu produto:** você escolhe nome, cor, logo e estilo, vê uma prévia e aprova antes
- ✅ Todos os detalhes de tela prontos: carregando, vazio, erro, página não encontrada, confirmações, botões com loading
- ✅ Máscaras e validações brasileiras (CPF, CNPJ — inclusive o novo alfanumérico —, telefone, CEP com busca de endereço)
- ✅ **No ar com o seu domínio:** nginx e HTTPS (Let's Encrypt) configurados e renovando sozinhos
- ✅ Testes automáticos já prontos

A stack usada: **Node.js + TypeScript + Fastify + PostgreSQL + Prisma + Stripe** no backend e **Next.js + Tailwind + shadcn/ui** no painel. Você não precisa dominar nada disso para começar.

---

## Antes de começar

Você precisa de:

| O quê | Pra quê | Como conseguir |
|---|---|---|
| **Claude Code** | é quem executa as skills | [docs.claude.com](https://docs.claude.com/en/docs/claude-code/overview) |
| **Linux** (ou WSL no Windows, ou um servidor/VPS) | onde o projeto roda | — |
| **Node.js** (versão LTS) | roda o backend | [nodejs.org](https://nodejs.org) |
| **PostgreSQL** ou **Docker** | o banco de dados | `sudo apt install postgresql` (Ubuntu/Debian) ou [docker.com](https://www.docker.com) |
| **Conta na Stripe** (modo teste) | pagamentos | [stripe.com](https://stripe.com) — é grátis no modo teste |
| **Um domínio** *(só para colocar no ar)* | endereço do seu SaaS | Registro.br, Cloudflare, Hostinger… |

Não tem o Postgres? Tudo bem: a skill de banco percebe e pergunta se você quer instalar.

---

## Instalação (uma vez só)

Abra o Claude Code e digite estes dois comandos:

```
/plugin marketplace add Rodrigomsdevs/rodsaas-saas-builder-skill
/plugin install rodsaas@rodsaas
```

Pronto. Para conferir se funcionou, digite `/rodsaas` e veja se aparecem as opções `/rodsaas:db`, `/rodsaas:backend` e `/rodsaas:frontend`.

<details>
<summary>Prefere instalar pelo terminal?</summary>

```bash
claude plugin marketplace add Rodrigomsdevs/rodsaas-saas-builder-skill
claude plugin install rodsaas@rodsaas
```
</details>

---

## Criando seu SaaS, passo a passo

### 1. Crie uma pasta para o projeto e abra o Claude nela

```bash
mkdir meu-saas
cd meu-saas
claude
```

### 2. Peça o backend

Dentro do Claude Code, digite:

```
/rodsaas:backend
```

O Claude vai te fazer algumas perguntas antes de começar:

- **Nome do projeto** (ex.: `agendafacil`)
- **Quais planos você quer** e o que cada um permite. Se ainda não sabe, ele usa planos de exemplo (Free / Pro / Business) e você muda depois.
- **Portas** em que a API e o painel vão rodar. O padrão é 3333 e 3000; se já tiver outro sistema usando, ele percebe e sugere outra.
- Dados do **banco de dados**: nome do banco e dos usuários, e se você quer que ele **gere as senhas**.

> 💡 **Dica:** deixe ele gerar as senhas. Elas vão direto para o arquivo `.env` e nunca aparecem no chat. Tudo o que você digita no chat fica salvo no histórico da conversa.

Depois disso, ele trabalha sozinho, em **8 fases**. Você acompanha pela lista de tarefas. Cada fase só termina quando tudo compila e os testes passam. Pode levar um tempo; é normal.

### 3. Preencha as chaves que só você tem

No final, o Claude te diz quais variáveis você precisa preencher no arquivo `api/.env`, como as chaves da Stripe (que você pega no painel da Stripe, em modo teste) e o servidor de e-mail.

### 4. Rode o projeto

```bash
cd api
npm run dev
```

E abra no navegador: **http://localhost:3333/docs**

Lá você vê todas as rotas da sua API e pode testar cada uma direto pela página.

### 5. Peça o painel (frontend)

Com a API pronta, digite:

```
/rodsaas:frontend
```

Ele pergunta a **identidade visual** do seu produto (tudo tem resposta padrão, pode só apertar enter):

- **Cor principal** — um código (`#2563eb`), o nome de uma cor ("verde petróleo") ou "me sugere"
- **Logo** — se você mandar, ele tira a cor do próprio logo; se não tiver, cria um provisório
- **Estilo** — *corporativo* (sóbrio), *moderno* (arredondado e leve) ou *denso* (cabe mais informação, ideal para sistemas de gestão)
- **Como chamar seus clientes** — Empresa, Clínica, Loja, Escritório… O sistema inteiro passa a usar essa palavra

Antes de construir as telas, ele gera uma **prévia** (`web/brand-preview.html`) com botões, tabela e menu no tema claro e escuro. Abra no navegador, aprove ou peça ajustes.

Depois:

```bash
cd web
npm run dev
```

E abra **http://localhost:3000** (com a API rodando em outro terminal). Crie uma conta e explore: convites, troca de empresa, planos, tudo funcionando.

### 6. Coloque no ar com o seu domínio

No servidor onde o SaaS vai rodar, digite:

```
/rodsaas:domain
```

Ele pergunta:

- **Domínio do painel** — ex.: `app.meusaas.com.br`
- **Domínio da API** — ex.: `api.meusaas.com.br`
- **Seu e-mail** — para avisos do certificado

> ⚠️ **Os dois precisam ser do mesmo domínio** (`app.` e `api.` do mesmo `meusaas.com.br`). É isso que faz o login funcionar entre o painel e a API.

Antes de mexer em qualquer coisa, ele confere se os domínios já apontam para o servidor (registro **A** no painel do seu domínio), se não tem outro programa (como o Apache) ocupando o lugar, e se o firewall está certo. Se faltar algo, ele explica o que fazer.

Depois configura o **nginx**, emite o **HTTPS** (cadeado no navegador, renovando sozinho) e atualiza as configurações da API e do painel com os endereços novos. No final, ele te diz o que falta: reiniciar a API, refazer o build do painel e cadastrar o endereço de produção na Stripe.

### 7. Agora é com o seu produto

A base está pronta. Daqui pra frente, peça ao Claude as funcionalidades do **seu** SaaS, em português normal mesmo:

> "Cria um módulo de agendamentos, com API e telas, onde cada clínica cadastra horários e pacientes, seguindo o padrão do projeto"

O projeto já vem com um módulo de exemplo (`projects`) na API e no painel, que o Claude usa como molde. Assim o que ele criar segue os mesmos padrões de segurança e de tela.

---

## As skills

| Comando | O que faz | Quando usar |
|---|---|---|
| `/rodsaas:backend` | Cria a pasta `api/` com o backend completo | No começo de um SaaS novo |
| `/rodsaas:db` | Cria o banco de dados e os usuários do Postgres, e grava a conexão no `.env` | O `backend` já chama sozinho. Use direto para preparar o banco de **produção** ou de um projeto que já existe |
| `/rodsaas:frontend` | Cria a pasta `web/` com o painel completo, com a sua marca | Depois do backend |
| `/rodsaas:domain` | Configura nginx + HTTPS para o domínio do painel e da API, e ajusta as configurações | Para colocar no ar, no servidor |
| `/rodsaas:module` | *(em breve)* Adiciona um módulo novo no padrão | — |
| `/rodsaas:audit` | *(em breve)* Revisa a segurança de um projeto | — |

**Você não precisa decorar os comandos.** As skills também são ativadas quando você pede em linguagem normal, por exemplo:

- "quero começar um SaaS novo com login e planos"
- "configura o banco postgres desse projeto"
- "agora cria o painel com a cor do meu logo"
- "coloca no ar no domínio app.meusaas.com.br"
- "prepara o banco de produção no meu servidor"

---

## Mini glossário (pra quem está começando)

| Termo | Em português claro |
|---|---|
| **SaaS B2B** | Software vendido por assinatura para empresas |
| **Multi-tenant** | Um sistema só atendendo vários clientes, cada um com seus dados separados |
| **Tenant** | Cada cliente/empresa dentro do sistema |
| **RLS** | Uma trava no próprio banco de dados que impede uma empresa de ver dados de outra, mesmo se o código tiver um bug |
| **JWT / refresh token** | O "crachá" que prova que o usuário está logado, e o jeito de renovar esse crachá sem pedir a senha de novo |
| **Migration** | Um arquivo que descreve uma mudança nas tabelas do banco |
| **Webhook** | Quando a Stripe avisa o seu sistema que algo aconteceu (pagamento aprovado, assinatura cancelada…) |
| **`.env`** | Arquivo com senhas e chaves do projeto. **Nunca** vai para o GitHub |

---

## Problemas comuns

**"O comando `/rodsaas:backend` não aparece"**
Confira se instalou com os dois comandos da seção [Instalação](#instalação-uma-vez-só). Depois feche e abra o Claude Code de novo.

**"Deu erro de permissão no banco / pediu senha do sudo"**
A skill de banco precisa agir como administrador do Postgres. Rode o Claude com um usuário que tenha `sudo`, ou diga a ele que você quer usar um usuário admin do Postgres (modo servidor).

**"O usuário do banco não consegue conectar"**
Normalmente é a configuração de acesso do Postgres (`pg_hba.conf`). A skill identifica isso e te explica o que mudar.

**"O site abre com erro 502"**
O nginx está funcionando, mas a API ou o painel não estão rodando na porta configurada. Suba as aplicações e teste de novo.

**"O certificado (HTTPS) não foi emitido"**
Quase sempre é DNS: o domínio ainda não aponta para o servidor (pode levar algumas horas para propagar) ou existe um registro AAAA (IPv6) apontando para outro lugar. Rode `/rodsaas:domain` de novo que ele mostra o que está errado.

**"Quero trocar a cor ou o estilo depois"**
Edite a parte `brand` do arquivo `rodsaas.json` (na raiz do projeto) e peça ao Claude: *"aplica a marca de novo"*.

**"Quero mudar um plano ou um limite"**
Os planos ficam no arquivo `api/src/config/plans.ts`. Peça ao Claude: *"muda o plano Pro para permitir 20 usuários"*.

---

## Atualizando

Quando houver versão nova das skills:

```
/plugin marketplace update rodsaas
```

---

<details>
<summary><b>Para desenvolvedores: estrutura do repositório</b></summary>

```
rodsaas-saas-builder-skill/
├── .claude-plugin/
│   └── marketplace.json         # catálogo (pode listar mais plugins no futuro)
└── plugins/
    └── rodsaas/
        ├── .claude-plugin/plugin.json
        └── skills/
            ├── backend/
            │   ├── SKILL.md      # fluxo em 8 fases
            │   └── references/   # API, auth, multi-tenant, billing, segurança, módulos, testes
            ├── db/
            │   ├── SKILL.md
            │   └── scripts/
            │       ├── provision.sh   # provisionamento testado e idempotente
            │       ├── config.example
            │       └── sql/
            ├── frontend/
            │   ├── SKILL.md      # fluxo em 8 fases, começando pela marca
            │   ├── references/   # marca, API e sessão, estados, formulários, tabelas, overlays, telas
            │   └── scripts/
            │       └── brand.mjs # cor → tema claro/escuro + prévia, com checagem de contraste
            └── domain/
                ├── SKILL.md
                └── scripts/
                    ├── domain.sh            # check · nginx · ssl · env · verify
                    ├── nginx-site.conf.tpl
                    └── config.example
```

Novas skills entram em `plugins/rodsaas/skills/<nome>/` e viram `/rodsaas:<nome>` automaticamente.

```bash
claude plugin validate .                  # valida marketplace e plugin
claude --plugin-dir ./plugins/rodsaas     # testa as skills localmente sem instalar
```
</details>
