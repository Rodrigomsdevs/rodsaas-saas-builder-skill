<p align="center">
  <img src="assets/logo.svg" width="120" alt="rodsaas" />
</p>

<h1 align="center">rodsaas</h1>

<p align="center">
  <b>Seu SaaS B2B do zero ao ar, com o Claude Code.</b><br/>
  Login, empresas, planos com Stripe, painel com a sua marca e domínio com HTTPS — prontos, seguros e sempre no mesmo padrão.
</p>

<p align="center">
  <img src="https://img.shields.io/badge/Claude_Code-plugin-D97757?style=for-the-badge&logo=claude&logoColor=white" alt="Claude Code plugin" />
  <img src="https://img.shields.io/badge/versão-0.11-7C3AED?style=for-the-badge" alt="versão 0.11" />
  <img src="https://img.shields.io/badge/status-rascunho-F59E0B?style=for-the-badge" alt="status rascunho" />
</p>

<p align="center">
  <img src="https://img.shields.io/badge/TypeScript-3178C6?logo=typescript&logoColor=white" alt="TypeScript" />
  <img src="https://img.shields.io/badge/Fastify-000000?logo=fastify&logoColor=white" alt="Fastify" />
  <img src="https://img.shields.io/badge/PostgreSQL-4169E1?logo=postgresql&logoColor=white" alt="PostgreSQL" />
  <img src="https://img.shields.io/badge/Prisma-2D3748?logo=prisma&logoColor=white" alt="Prisma" />
  <img src="https://img.shields.io/badge/Stripe-635BFF?logo=stripe&logoColor=white" alt="Stripe" />
  <img src="https://img.shields.io/badge/Next.js-000000?logo=nextdotjs&logoColor=white" alt="Next.js" />
  <img src="https://img.shields.io/badge/Tailwind-06B6D4?logo=tailwindcss&logoColor=white" alt="Tailwind CSS" />
  <img src="https://img.shields.io/badge/nginx-009639?logo=nginx&logoColor=white" alt="nginx" />
  <img src="https://img.shields.io/badge/Let's_Encrypt-003A70?logo=letsencrypt&logoColor=white" alt="Let's Encrypt" />
</p>

---

## ⚡ Instalar

### 🧩 No VS Code (extensão do Claude Code)

1. Abra o painel do Claude e digite **`/plugins`**
2. Na aba **Marketplaces**, adicione: `Rodrigomsdevs/rodsaas-saas-builder-skill`
3. Na aba **Plugins**, procure **rodsaas** e clique em **Install**

> [!TIP]
> Atalho: cole este link no navegador e o VS Code abre direto na instalação.
> ```
> vscode://anthropic.claude-code/install-plugin?plugin=rodsaas&marketplace=Rodrigomsdevs/rodsaas-saas-builder-skill
> ```

### 💻 No terminal

```bash
claude plugin marketplace add Rodrigomsdevs/rodsaas-saas-builder-skill
claude plugin install rodsaas@rodsaas
```

Já está dentro do Claude Code? Use os mesmos comandos com barra: `/plugin marketplace add ...` e `/plugin install rodsaas@rodsaas`.

---

## 🧭 Comandos

Digite no Claude Code (painel do VS Code ou terminal), **nesta ordem**:

| | Comando | O que faz |
|:-:|---|---|
| 1️⃣ | **`/rodsaas:backend`** | Cria a API completa na pasta `api/` (já prepara o banco sozinho) |
| 2️⃣ | **`/rodsaas:frontend`** | Cria o painel na pasta `web/`, com a sua cor, logo e estilo |
| 3️⃣ | **`/rodsaas:domain`** | Coloca no ar no seu domínio, com nginx e HTTPS |
| 🧩 | **`/rodsaas:module`** | Cria (ou altera) uma funcionalidade nova na API e no painel: *"cria um cadastro de clientes com nome, CPF, telefone e endereço"* |
| 💼 | **`/rodsaas:crm`** | *Opcional*: soma ao projeto um **CRM de vendas** estilo Pipedrive (funil, leads, contatos, empresas pelo CNPJ, atividades, WhatsApp, captura do site, importação, relatórios) |
| 📋 | **`/rodsaas:forms`** | *Opcional*: soma o app **Forms** (estilo Typeform/Google Forms): construtor, lógica condicional, link público, respostas com gráficos e NPS, Excel, webhooks e envio para o CRM |
| 📅 | **`/rodsaas:agenda`** | *Opcional*: soma o app **Agenda** (estilo Calendly + agenda de clínica/salão): link público de agendamento, disponibilidade com feriados, equipe com rodízio, turmas, aprovação, lembretes, `.ics`, Google Agenda/Outlook e CRM |
| 🎧 | **`/rodsaas:helpdesk`** | *Opcional*: soma o app **Suporte** (estilo Zendesk/Movidesk): chamados por e-mail, portal e widget, caixa de entrada com visões, resposta e nota interna, SLA com horário comercial, distribuição automática, gatilhos, satisfação e base de conhecimento |
| ✅ | **`/rodsaas:tarefas`** | *Opcional*: soma ao projeto um **gestor de tarefas** completo (quadro, lista, calendário, sprints, comentários, anexos, horas, notificações) |
| 📎 | **`/rodsaas:uploads`** | Envio de arquivos (local ou S3/R2/MinIO) com limite por plano — o `tarefas` e o `crm` já instalam sozinhos |
| 🔔 | **`/rodsaas:notificacoes`** | Sino com contador, central de notificações, preferências por tipo (no app, e-mail na hora, resumo diário), e-mail agrupado com descadastro de um clique — um só serviço para todos os apps; `tarefas`, `crm`, `forms`, `agenda` e `helpdesk` já instalam sozinhos |
| 📝 | **`/rodsaas:notion`** | *Opcional*, depois do frontend: transforma o projeto numa **réplica do Notion** (páginas, editor de blocos, databases, busca, link público) |
| 🧪 | **`/rodsaas:verify`** | Testa o projeto **de verdade no navegador**: cadastro, login, criar e trocar de empresa, convites, papéis, estados de tela… e corrige até ficar tudo verde |
| 🧭 | **`/rodsaas:apps`** | Atualiza um projeto já gerado para o **menu novo com trilho de apps** (cada módulo no seu app, sem misturar) |
| 🗄️ | **`/rodsaas:db`** | Cria o banco e os usuários do Postgres (o backend já chama; use sozinho para o banco de produção) |

> [!NOTE]
> **Já instalou um preset antes?** Rode o mesmo comando de novo (por exemplo `/rodsaas:crm`, `/rodsaas:tarefas`, `/rodsaas:notion`): ele entra em **modo revisão**, compara item por item o que a skill pede com o que existe no projeto, mostra a tabela do que falta e completa sem refazer o que está certo. Funciona no Claude, no Gemini e no ChatGPT (skills em `.agents/skills`).

> [!TIP]
> Não precisa decorar nada. Pedir em português também funciona:
> *"quero começar um SaaS com login e planos"*, *"cria o painel com a cor do meu logo"*, *"cria um módulo de agendamentos ligado a clientes"*, *"adiciona gestão de tarefas com sprints"*, *"quero um CRM com funil de vendas"*, *"cria uma pesquisa NPS"*, *"testa se está tudo funcionando"*, *"coloca no ar em app.meusaas.com.br"*.

### 🚀 Do zero ao ar

```bash
mkdir meu-saas && cd meu-saas
claude                # ou abra a pasta no VS Code e use o painel do Claude
```

```
/rodsaas:backend   →   /rodsaas:frontend   →   /rodsaas:verify   →   (/rodsaas:crm · /rodsaas:forms · /rodsaas:agenda · /rodsaas:helpdesk · /rodsaas:tarefas · /rodsaas:notion)   →   /rodsaas:domain
```

Cada comando faz algumas perguntas antes de começar (nome, portas, cores, domínio…). **Tudo tem resposta padrão**: na dúvida, é só apertar enter.

---

## ✨ O que o rodsaas faz

| | | |
|:-:|---|---|
| 🔐 | **Contas e login** | Cadastro, login, "esqueci a senha", confirmação de e-mail e sessão segura |
| 🏢 | **Várias empresas** | Cada cliente tem a sua conta, com equipe, convites e papéis (dono, admin, membro) |
| 💳 | **Planos e Stripe** | Assinar, trocar de plano (com o valor proporcional), cancelar e retomar **dentro do app**, limites por plano. Sem Stripe configurada, funciona em **modo de teste**; com Stripe, um comando (`billing:sync`) cria produtos, preços e portal |
| 🧭 | **Trilho de apps** | Cada módulo (Páginas, Tarefas, CRM…) é um app: o menu mostra só o app em que você está, recolhe com `[`, abre flutuando com o mouse por cima, tem "Todos os apps" com busca e ⭐ para fixar, e barra de apps no celular. [Veja o simulador](plugins/rodsaas/skills/frontend/assets/simulador-navegacao.html) |
| 🎨 | **Painel com a sua marca** | Você escolhe cor, logo e estilo, vê uma prévia e aprova antes de gerar as telas |
| 🧱 | **Telas caprichadas** | Carregando, vazio, erro, página não encontrada, confirmações e botões com loading em tudo |
| 🛡️ | **Segurança de verdade** | Um cliente nunca vê dados de outro — com trava no próprio banco de dados |
| 📄 | **API documentada** | Página `/docs` gerada sozinha, com todas as rotas para testar |
| 🗄️ | **Banco pronto** | Postgres com usuários separados e senhas fortes geradas, sem aparecer no chat |
| 🌐 | **No ar com HTTPS** | nginx configurado, cadeado no navegador e renovação automática do certificado |
| 🇧🇷 | **Feito para o Brasil** | Português, R$, datas BR, CPF, CNPJ (inclusive o novo alfanumérico), telefone e CEP |
| 🧪 | **Verificado no navegador** | 51 testes de ponta a ponta (Playwright) clicam no painel como um usuário: cadastro, sessão, troca de empresa, convites, papéis, troca de plano, estados de erro, celular (+6 da casca de apps, +18 do CRM, +14 do Forms, +18 da Agenda, +19 do Suporte, +15 do Tarefas, +13 do Páginas, +4 do uploads e +7 das notificações, quando instalados). Funciona até em projeto feito por outra IA |
| 💼 | **CRM de vendas** *(opcional)* | Funil em quadro com totais em R$, leads com conversão, empresas preenchidas pelo CNPJ, contatos com WhatsApp, atividades com agenda, produtos no negócio, captura de leads do site e do Meta Ads, importação de planilha sem duplicar, visibilidade por vendedor e relatórios de conversão e previsão |
| 📋 | **Formulários e pesquisas** *(opcional)* | 20 tipos de pergunta (CPF, CNPJ, CEP, R$, NPS, estrelas, arquivo, LGPD), páginas e lógica, clássico ou uma pergunta por vez, link, incorporar e QR code, respostas em tabela, resumo com gráficos, exportar para Excel, avisos, webhooks e leads no CRM |
| 📅 | **Agendamento online** *(opcional)* | Link para o cliente marcar sozinho (escolhe o dia, o horário e o profissional, no fuso dele), sem nunca marcar duas vezes o mesmo horário, agenda por profissional com arrastar para remarcar, feriados nacionais, turmas com vagas, aprovação manual, lembretes por e-mail, convite para Google Agenda/Outlook, remarcar e cancelar pelo link e relatórios de comparecimento |
| 🎧 | **Central de atendimento** *(opcional)* | Cada pedido de cliente vira um chamado com número, dono e prazo: e-mail da empresa conectado (as respostas voltam para o mesmo chamado), portal de ajuda e widget no site, caixa de entrada com visões, notas internas que nunca vazam, respostas prontas, SLA em horário comercial com feriados, rodízio entre atendentes, regras automáticas, pesquisa de satisfação, base de conhecimento com busca em português e relatórios de tempo de resposta |
| ✅ | **Gestor de tarefas** *(opcional)* | Projetos com código (MKT-123), quadro, lista, calendário, sprints com burndown, subtarefas, comentários com menções, anexos, cronômetro de horas e adição rápida (*"Revisar contrato @ana !alta amanhã"*) |
| 📝 | **Réplica do Notion** *(opcional)* | Páginas aninhadas, editor com "/", autosave, favoritos, lixeira, busca, databases em tabela e quadro e página pública |
| 🧩 | **Módulos em minutos** | Descreva o cadastro em português e o `/rodsaas:module` cria API, telas, filtros, quadro, permissões e testes — com campos brasileiros (CPF, CNPJ, CEP, telefone, R$) |

---

## 📋 Você precisa de

**Claude Code** · **Linux** (ou WSL / VPS) · **Node.js** LTS · **PostgreSQL** ou Docker · conta **Stripe** (modo teste é grátis) · e, para colocar no ar, **um domínio**.

> [!IMPORTANT]
> No `/rodsaas:domain`, o painel e a API precisam ser do **mesmo domínio** — por exemplo `app.meusaas.com.br` e `api.meusaas.com.br`. É isso que mantém o login funcionando entre os dois.

---

<details>
<summary><b>❓ Problemas comuns</b></summary>
<br/>

| Problema | Solução |
|---|---|
| O comando `/rodsaas:...` não aparece | Confira a instalação e reinicie o Claude Code |
| Pediu senha do `sudo` no banco | Rode com um usuário que tenha `sudo`, ou peça para usar um usuário admin do Postgres |
| Site abre com erro **502** | O nginx está ok; a API ou o painel não estão rodando |
| O HTTPS não foi emitido | O domínio ainda não aponta para o servidor (registro **A**) ou há um registro **AAAA** errado |
| Quero trocar a cor depois | Edite `brand` no `rodsaas.json` e peça *"aplica a marca de novo"* |
| Quero mudar um plano | Peça: *"muda o plano Pro para permitir 20 usuários"* |
| O menu está misturando módulos (projeto antigo) | Rode **`/rodsaas:apps`** para passar para o trilho de apps |

</details>

<details>
<summary><b>🧪 Verificar um projeto feito por outra IA (Gemini, ChatGPT…)</b></summary>
<br/>

Com a API, o painel e o Mailpit rodando, no terminal do servidor:

```bash
git clone https://github.com/Rodrigomsdevs/rodsaas-saas-builder-skill /tmp/rodsaas
node /tmp/rodsaas/plugins/rodsaas/skills/verify/scripts/audit.mjs /caminho/do/projeto   # o que falta no contrato
bash /tmp/rodsaas/plugins/rodsaas/skills/verify/scripts/run.sh /caminho/do/projeto      # roda os testes
```

O relatório (com print, vídeo e passo a passo de cada falha) fica em `rodsaas-verify-report/` dentro do projeto. Entregue o resumo para a IA corrigir.

</details>

<details>
<summary><b>🔄 Atualizar o rodsaas</b></summary>
<br/>

```bash
claude plugin marketplace update rodsaas
```

</details>

<details>
<summary><b>🛠️ Para quem quer mexer nas skills</b></summary>
<br/>

```
plugins/rodsaas/skills/
├── backend/    SKILL.md + references/       → API em 8 fases
├── db/         SKILL.md + scripts/          → provision.sh
├── frontend/   SKILL.md + references/ + scripts/brand.mjs + assets/simulador-navegacao.html
├── apps/       SKILL.md                     → migra projetos antigos para o trilho de apps
├── module/     SKILL.md + references/ + scripts/validate-spec.mjs
├── notion/     SKILL.md + references/       → preset réplica do Notion
├── verify/     SKILL.md + contract.json + suite/ (Playwright) + scripts/run.sh
├── tarefas/    SKILL.md + references/ + scripts/parsers.mjs (+ testes)
├── crm/        SKILL.md + references/ + scripts/crm-lib.mjs (+ testes)
├── forms/      SKILL.md + references/ + scripts/forms-lib.mjs (+ testes) + templates.json
├── helpdesk/   SKILL.md + references/ + scripts/helpdesk-lib.mjs (+ testes)
├── agenda/     SKILL.md + references/ + scripts/agenda-lib.mjs (+ testes)
├── uploads/    SKILL.md + references/       → add-on de arquivos
├── notificacoes/ SKILL.md + references/ + scripts/notifications-lib.mjs (+ testes) → add-on de notificações
└── domain/     SKILL.md + scripts/          → domain.sh + template do nginx
```

```bash
claude plugin validate .                  # valida o marketplace e o plugin
claude --plugin-dir ./plugins/rodsaas     # testa as skills sem instalar
```

Nova skill = nova pasta em `plugins/rodsaas/skills/<nome>/` → vira `/rodsaas:<nome>`.

</details>

<p align="center"><sub>Feito por <b>Rodrigo</b> com o Claude Code</sub></p>
