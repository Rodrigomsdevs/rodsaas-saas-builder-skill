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
| 💼 | **`/rodsaas:crm`** | *Opcional*: soma ao projeto um **CRM de vendas** estilo Pipedrive (funil, leads, contatos, empresas pelo CNPJ, atividades, WhatsApp, captura do site, importação, relatórios), com **metas por vendedor**, **automações por etapa**, **sequências de follow-up**, **mesclar duplicados**, **modelos de e-mail**, **pontuação de lead** e **perfis** de B2B, imobiliária (imóveis compatíveis), escola e varejo |
| 📋 | **`/rodsaas:forms`** | *Opcional*: soma o app **Forms** (estilo Typeform/Google Forms): construtor, lógica condicional, link público, respostas com gráficos e NPS, Excel, webhooks e envio para o CRM; **respostas parciais** com desistências, **cálculo e quiz**, **pagamento na resposta**, **assinatura desenhada**, **agendar no fim** e resposta que abre **chamado**; **perfis** de pesquisas (NPS por mês, CSAT, retorno ao detrator), eventos (vagas, lista de espera, ingresso e check-in) e saúde (ficha e anamnese com respostas sensíveis e alertas) |
| 📅 | **`/rodsaas:agenda`** | *Opcional*: soma o app **Agenda** (estilo Calendly + Trinks/AppBarber/Simples Dental): link público de agendamento, disponibilidade com feriados, equipe com rodízio, turmas, aprovação, **cadeiras e salas sem conflito**, **combos**, bloqueios, **séries**, **lista de espera**, **sinal no Pix**, confirmação com mensagem pronta de WhatsApp; **recepção do dia** com chegada e conclusão (serviço + produto), **comissões** com fechamento, **clube de assinatura**, **fidelidade**, **fila** de quem chega sem hora; na clínica, **convênio, anamnese e retornos**; **perfis** de barbearia, salão, clínica, odonto, pet e consultoria; lembretes, `.ics`, Google Agenda/Outlook e CRM |
| 🎧 | **`/rodsaas:helpdesk`** | *Opcional*: soma o app **Suporte** (estilo Zendesk/Movidesk): chamados por e-mail, portal e widget, caixa de entrada com visões, resposta e nota interna, SLA com horário comercial, distribuição automática, gatilhos, satisfação e base de conhecimento; **WhatsApp** (pelo motor) e **chat ao vivo** no widget, **clientes com SLA próprio** e **contrato de horas**, dividir chamado, aprovação, campos por categoria, sugestão de artigos e **perfis** de assistência técnica (ordem de serviço com orçamento, peças do ERP e garantia), TI interno, software (bug vira tarefa) e condomínio |
| ✅ | **`/rodsaas:tarefas`** | *Opcional*: soma ao projeto um **gestor de tarefas** completo (quadro, lista, calendário, sprints, comentários, anexos, horas, notificações); **recorrência** com dia útil e feriados, **modelos** com datas e dependências, **campos personalizados**, **Gantt** com caminho crítico, **automações**, **carga por pessoa** e **cliente convidado que aprova**; **perfis** de escritório contábil (obrigações mensais com prazo legal), agência (horas faturadas no Financeiro) e obras (checklist com foto) |
| 👥 | **`/rodsaas:rh`** | *Opcional*: soma o app **Pessoas**, um RH completo (estilo Factorial/Sólides): colaboradores com ficha e organograma, **férias pela CLT** (período aquisitivo, faltas, fracionamento, venda de 1/3, coletivas), aprovações com gestor e delegação, pré-admissão pelo celular, documentos com validade, **holerites em lote pelo CPF**, avaliação de desempenho com 9-box, 1:1, metas, **pesquisa de clima anônima** e despesas, com autoatendimento. Folha e ponto ficam de fora (exporta o fechamento para a contabilidade) |
| 💰 | **`/rodsaas:financeiro`** | *Opcional*: soma o app **Financeiro** (estilo Conta Azul/Omie): contas a pagar e a receber com **parcelas no centavo certo** e recorrência, baixa parcial com juros e multa, contas com saldo do dia, **fluxo de caixa** realizado e previsto, **DRE** gerencial, inadimplência, **conciliação bancária por OFX** com sugestões e regras, e **cobrança por boleto, Pix e cartão na Stripe da própria empresa** (Connect) com baixa automática e régua de lembretes; **NFS-e** pelo motor fiscal com retenções, **rateio**, **orçado × realizado**, **fatura de cartão de crédito**, **mês fechado** para o contador e exportação contábil em partidas, e **perfis** de prestador de serviço (nota na baixa), comércio (maquininha com taxa, repasse e antecipação) e clínica (convênio com lote, glosa e recurso) |
| 🤝 | **`/rodsaas:comercial`** | *Opcional*: soma o app **Comercial** (estilo PandaDoc/ZapSign): **propostas** com itens, desconto por item e geral, opcionais que o cliente marca, recorrentes e parcelas, **aprovação de desconto**, link com a marca da empresa, aviso quando o cliente abre e **aceite online** com CPF/CNPJ, IP e hash; modelos com variáveis e valor por extenso; **contratos** com vigência, aviso prévio, renovação e reajuste; **assinatura eletrônica** com ordem, testemunhas, código por e-mail e PDF final com manifesto e verificação pública; aceite ganha o negócio no CRM e gera as contas a receber no Financeiro; **sinal** cobrado no aceite, envio por **WhatsApp**, **reajuste pelo IPCA/IGP-M do Banco Central**, **catálogo do ERP** com pedido no aceite e **relatório de conversão**; **perfis** de locação (diárias, disponibilidade e devolução), reforma/obra (etapas e medição com retenção) e escola (matrícula com anuidade, irmão e pontualidade) |
| 🧾 | **`/rodsaas:erp`** | *Opcional*: soma o app **ERP** (estilo Bling/Tiny): **produtos** simples, com **variações** (grade cor × tamanho com SKU e código por variação), **kits** e serviços; código de barras EAN validado ou interno; **tabelas de preço** e **faixas por quantidade** com margem ao vivo; **estoque** por depósito como livro de movimentações (custo médio, reserva, transferência, inventário com leitor, mínimo e sugestão de compra); clientes e fornecedores; **orçamentos e pedidos** com limite de crédito e desconto do vendedor; **PDV** com leitor, pagamento misto, troco e fechamento cego; compras com frete no custo; curva ABC; vendas a prazo viram contas a receber no Financeiro; **NF-e e NFC-e** pelo motor fiscal, **comissão** de vendedor, **lote e validade** (FEFO, vencido não sai), **promoções** (leve 3 pague 2, % e preço fixo, por período e dia da semana), **troca e vale-troca**, **carnê do fiado** com multa e juros, **produção** com receita e custo, e **perfis** de mercado/padaria (etiqueta de balança), loja de roupa, material de construção (unidade de venda) e distribuidora (múltiplo e pedido mínimo) |
| 📎 | **`/rodsaas:uploads`** | Envio de arquivos (local ou S3/R2/MinIO) com limite por plano — o `tarefas` e o `crm` já instalam sozinhos |
| 📧 | **`/rodsaas:email`** | Todos os e-mails pelo **Resend** (envio, status de entrega, lista de supressão e recebimento), Mailpit em dev — o `backend` já instala sozinho; em projeto antigo, roda em modo revisão. Passo a passo em [E-mails com Resend](#-e-mails-com-resend-envio-e-recebimento) |
| 🧰 | **`/rodsaas:workstation`** | Transforma o projeto numa **workstation** (estilo Zoho One): cada empresa faz o onboarding, testa tudo grátis por 14 dias, escolhe os apps e paga por app (por pessoa que usa) ou o Completo, com loja de apps, acesso por pessoa e app bloqueado só para leitura. Do cadastro ao cancelamento |
| 🛍️ | **`/rodsaas:landing`** | Cria o **site de vendas** (`site/`): home, página de cada app (os prontos e os futuros como "Em breve" com lista de espera), preços com calculadora, prints e vídeos tirados do sistema de verdade, SEO, checagem automática e publicação no domínio raiz. Rode de novo a cada app novo |
| 🔔 | **`/rodsaas:notificacoes`** | Sino com contador, central de notificações, preferências por tipo (no app, e-mail na hora, resumo diário), e-mail agrupado com descadastro de um clique — um só serviço para todos os apps; `tarefas`, `crm`, `forms`, `agenda` e `helpdesk` já instalam sozinhos |
| 💬 | **`/rodsaas:whatsapp`** | Motor de WhatsApp para todos os apps, com **drivers trocáveis** (falso para dev e testes; Meta Cloud API, Zenvia e RodTicket como próximos): conversas, janela de 24 h, modelos com variáveis, descadastro (PARAR/VOLTAR), status que só anda para frente, webhook assinado e roteamento do que chega — a Agenda já confirma pelo WhatsApp ("1 = confirmo") |
| 🧾 | **`/rodsaas:fiscal`** | Motor de **NF-e e NFC-e** para todos os apps, com **drivers trocáveis** (falso em homologação para dev e testes; provedores como Focus NFe, NFE.io, PlugNotas e Nuvem Fiscal, ou a SEFAZ direta, depois): emitente, regras de imposto (Simples pronto, IBS/CBS da reforma), numeração sem buraco, chave com DV, validação antes de numerar, rejeição corrigível com o mesmo número, cancelamento no prazo, carta de correção, inutilização, contingência da NFC-e, QR Code e XML — o ERP já fatura o pedido em NF-e
| 📝 | **`/rodsaas:notion`** | *Opcional*, depois do frontend: transforma o projeto numa **réplica do Notion** (páginas, editor de blocos, databases, busca, link público) |
| 🧪 | **`/rodsaas:verify`** | Testa o projeto **de verdade no navegador**: cadastro, login, criar e trocar de empresa, convites, papéis, estados de tela… e corrige até ficar tudo verde |
| 🔄 | **`/rodsaas:atualizar`** | Traz um projeto que já existe para a versão nova de **todas** as skills de uma vez: roda o modo revisão de cada parte instalada (base, add-ons e apps), um módulo por vez, com a tabela do que falta, migrations só aditivas, testes e commit por módulo, e um arquivo de progresso para retomar de onde parou. `/rodsaas:atualizar agenda` atualiza só a Agenda |
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
/rodsaas:backend   →   /rodsaas:frontend   →   /rodsaas:verify   →   (/rodsaas:crm · /rodsaas:forms · /rodsaas:agenda · /rodsaas:helpdesk · /rodsaas:tarefas · /rodsaas:notion · /rodsaas:rh · /rodsaas:financeiro · /rodsaas:comercial · /rodsaas:erp)   →   /rodsaas:workstation   →   /rodsaas:landing   →   /rodsaas:domain
```

Cada comando faz algumas perguntas antes de começar (nome, portas, cores, domínio…). **Tudo tem resposta padrão**: na dúvida, é só apertar enter.

---

## ✨ O que o rodsaas faz

| | | |
|:-:|---|---|
| 🔐 | **Contas e login** | Cadastro, login, "esqueci a senha", confirmação de e-mail e sessão segura |
| 🏢 | **Várias empresas** | Cada cliente tem a sua conta, com equipe, convites e papéis (dono, admin, membro). **No convite já se escolhe o que a pessoa vai usar** (apps e o papel em cada um: atendente, vendedor, financeiro…): ela entra usando; o que quem convida não pode dar vira pedido ao dono, aprovado com um clique |
| 💳 | **Planos e Stripe** | Assinar, trocar de plano (com o valor proporcional), cancelar e retomar **dentro do app**, limites por plano. Sem Stripe configurada, funciona em **modo de teste**; com Stripe, um comando (`billing:sync`) cria produtos, preços e portal |
| 🧭 | **Trilho de apps** | Cada módulo (Páginas, Tarefas, CRM…) é um app: o menu mostra só o app em que você está, recolhe com `[`, abre flutuando com o mouse por cima, tem "Todos os apps" com busca e ⭐ para fixar, e barra de apps no celular. [Veja o simulador](plugins/rodsaas/skills/frontend/assets/simulador-navegacao.html) |
| 🎨 | **Painel com a sua marca** | Você escolhe cor, logo e estilo, vê uma prévia e aprova antes de gerar as telas |
| 🧱 | **Telas caprichadas** | Carregando, vazio, erro, página não encontrada, confirmações e botões com loading em tudo |
| 🛡️ | **Segurança de verdade** | Um cliente nunca vê dados de outro — com trava no próprio banco de dados |
| 📧 | **E-mails com Resend** | Todos os e-mails saem pelo Resend com o seu domínio, numa fila que respeita o limite e não manda duplicado; endereço que devolve ou marca como spam para de receber; e-mails que chegam no seu domínio vão para o app certo (Suporte) ou são encaminhados para a sua caixa |
| 📄 | **API documentada** | Página `/docs` gerada sozinha, com todas as rotas para testar |
| 🗄️ | **Banco pronto** | Postgres com usuários separados e senhas fortes geradas, sem aparecer no chat |
| 🌐 | **No ar com HTTPS** | nginx configurado, cadeado no navegador e renovação automática do certificado |
| 🇧🇷 | **Feito para o Brasil** | Português, R$, datas BR, CPF, CNPJ (inclusive o novo alfanumérico), telefone e CEP |
| 🧪 | **Verificado no navegador** | 58 testes de ponta a ponta (Playwright) clicam no painel como um usuário: cadastro, sessão, troca de empresa, convites com os acessos de cada app, pedidos de acesso, papéis, troca de plano, estados de erro, celular (+6 da casca de apps, +18 do CRM (+12 das vendas avançadas), +14 do Forms (+12 da operação avançada), +37 da Agenda, +19 do Suporte (+14 da operação avançada), +15 do Tarefas (+14 da operação avançada), +13 do Páginas, +4 do uploads, +7 das notificações, +2 do e-mail com Resend, +7 da workstation, +10 do RH, +11 do Financeiro (+13 da operação avançada), +11 do Comercial (+11 da operação avançada), +15 do ERP (+12 da operação avançada), +10 do WhatsApp e +12 do Fiscal, quando instalados). Funciona até em projeto feito por outra IA |
| 💼 | **CRM de vendas** *(opcional)* | Funil em quadro com totais em R$, leads com conversão, empresas preenchidas pelo CNPJ, contatos com WhatsApp, atividades com agenda, produtos no negócio, captura de leads do site e do Meta Ads, importação de planilha sem duplicar, visibilidade por vendedor e relatórios de conversão e previsão; meta de cada vendedor com o ritmo do mês, próxima tarefa criada sozinha ao mudar de etapa, sequência de follow-up que para quando o cliente responde, duplicados mesclados sem perder nada, e-mail e WhatsApp com o nome do cliente preenchido e leads quentes primeiro |
| 📋 | **Formulários e pesquisas** *(opcional)* | 20 tipos de pergunta (CPF, CNPJ, CEP, R$, NPS, estrelas, arquivo, LGPD), páginas e lógica, clássico ou uma pergunta por vez, link, incorporar e QR code, respostas em tabela, resumo com gráficos, exportar para Excel, avisos, webhooks e leads no CRM |
| 📅 | **Agendamento e balcão** *(opcional)* | Link para o cliente marcar sozinho (serviço com adicionais, profissional, dia e horário, no fuso dele), sem nunca marcar duas vezes o mesmo horário nem a mesma sala, sinal no Pix para quem falta, lista de espera que oferece a vaga que abriu, confirmação no lembrete e mensagem pronta no WhatsApp; no balcão, recepção do dia por profissional, fila de quem chega sem hora, concluir com produto e forma de pagamento, comissão de cada um, clube de assinatura e cartão fidelidade; na clínica, convênios, anamnese, retornos e séries de sessões |
| 🎧 | **Central de atendimento** *(opcional)* | Cada pedido de cliente vira um chamado com número, dono e prazo: e-mail da empresa conectado (as respostas voltam para o mesmo chamado), portal de ajuda e widget no site, caixa de entrada com visões, notas internas que nunca vazam, respostas prontas, SLA em horário comercial com feriados, rodízio entre atendentes, regras automáticas, pesquisa de satisfação, base de conhecimento com busca em português e relatórios de tempo de resposta; o cliente também fala pelo WhatsApp ou pelo chat do site, cliente importante tem prazo menor e as horas do contrato são controladas no próprio chamado |
| ✅ | **Gestor de tarefas** *(opcional)* | Projetos com código (MKT-123), quadro, lista, calendário, sprints com burndown, subtarefas, comentários com menções, anexos, cronômetro de horas e adição rápida (*"Revisar contrato @ana !alta amanhã"*) |
| 📝 | **Réplica do Notion** *(opcional)* | Páginas aninhadas, editor com "/", autosave, favoritos, lixeira, busca, databases em tabela e quadro e página pública |
| 🧩 | **Módulos em minutos** | Descreva o cadastro em português e o `/rodsaas:module` cria API, telas, filtros, quadro, permissões e testes — com campos brasileiros (CPF, CNPJ, CEP, telefone, R$) |

---

## 📧 E-mails com Resend (envio e recebimento)

Todo projeto rodsaas manda e recebe e-mail pelo [Resend](https://resend.com) em produção e pelo **Mailpit** em dev (`http://localhost:8025`). Quem cuida disso é o `/rodsaas:email` (o `/rodsaas:backend` já chama; em projeto antigo, rode `/rodsaas:email` e ele entra em modo revisão).

**1. Variáveis em `api/.env`**

```bash
RESEND_API_KEY=re_xxxxxxxx
RESEND_DOMAIN="mock-lab.dev"
RESEND_FROM="Rodsaas Claude <no-reply@mock-lab.dev>"
RESEND_REPLY_TO="Rodsaas Claude <support@mock-lab.dev>"
RESEND_SUPPORT_EMAIL="Rodsaas Claude <support@mock-lab.dev>"
RESEND_SUPPORT_NAME="Rodsaas Claude"
RESEND_WEBHOOK_SECRET=whsec_xxxxxxxx          # o passo 4 gera
RESEND_INBOUND_FORWARD_TO="voce@gmail.com"    # opcional: recebe o que chegou e nenhum app pegou
```

| Variável | Para quê |
|---|---|
| `RESEND_API_KEY` | chave da API (resend.com → API Keys). Com recebimento, use **Full access** (a API busca o conteúdo dos e-mails recebidos) |
| `RESEND_DOMAIN` | domínio verificado no Resend. Todo remetente precisa ser dele |
| `RESEND_FROM` | remetente padrão de todos os e-mails (cadastro, convite, senha, notificações…) |
| `RESEND_REPLY_TO` | para onde vai quem clica em "Responder" num e-mail automático |
| `RESEND_SUPPORT_EMAIL` / `RESEND_SUPPORT_NAME` | contato de suporte mostrado no rodapé dos e-mails e no app |
| `RESEND_WEBHOOK_SECRET` | confere que o webhook veio mesmo do Resend |
| `RESEND_INBOUND_FORWARD_TO` | caixa real (fora do domínio do Resend) que recebe os e-mails que nenhum app pegou |
| `MAIL_DRIVER` | opcional: vazio = Resend quando há chave, Mailpit quando não há. Em dev, `MAIL_DRIVER=smtp` força o Mailpit mesmo com a chave preenchida |

> [!WARNING]
> Sem `;` no fim da linha e com aspas fechadas: `RESEND_DOMAIN="mock-lab.dev";` vira o valor `"mock-lab.dev";` e a API não sobe (ela avisa qual linha está errada). Em dev, deixe `RESEND_API_KEY` vazio ou use `MAIL_DRIVER=smtp`: o `/rodsaas:verify` lê os e-mails do Mailpit.

**2. Domínio no Resend (DNS)**

1. resend.com → **Domains** → *Add domain* → copie os registros que o painel mostrar (DKIM e o SPF/MX de retorno do envio) para o seu DNS e espere **Verified**.
2. Crie o **DMARC** (TXT em `_dmarc`): `v=DMARC1; p=none; rua=mailto:voce@seudominio` para começar. Gmail e Yahoo exigem para quem manda em volume.
3. **Recebimento**: na página do domínio, ligue **Receiving** e crie o registro **MX** que aparecer. Se o domínio já recebe e-mail em outro lugar (Google Workspace, Microsoft 365, Locaweb…), use um **subdomínio** para o Resend (ex.: `in.mock-lab.dev`) — o MX de menor prioridade leva todos os e-mails do domínio.

**3. O que acontece com os e-mails que chegam**

| Endereço | Vai para |
|---|---|
| `RESEND_SUPPORT_EMAIL` (ex.: `support@`) | encaminhado para `RESEND_INBOUND_FORWARD_TO`; com o Suporte instalado e `HELPDESK_HOUSE_ORG_ID`, vira chamado (o suporte do próprio SaaS) |
| `RESEND_FROM` (`no-reply@`) | encaminhado igual, e quem escreveu recebe 1x por dia o aviso "este endereço não é lido, escreva para o suporte" |
| `<empresa>@mock-lab.dev` (Suporte instalado) | chamado na empresa dona do endereço; o cliente dela só encaminha o `suporte@empresa.com.br` para esse endereço |
| qualquer outro | encaminhado para `RESEND_INBOUND_FORWARD_TO` (ou fica registrado como "sem dono" para reprocessar) |

Respostas automáticas, devoluções e e-mails do próprio domínio nunca são encaminhados (sem loop).

**4. Webhook (status de entrega + recebimento)**

Com a API no ar no domínio de produção:

```bash
cd api
npm run email:setup -- --webhook https://api.seudominio.com.br/v1/webhooks/resend --test voce@gmail.com
```

O comando confere o domínio (e mostra os registros DNS que faltam), cria o webhook com os eventos certos — `email.received`, `email.delivered`, `email.delivery_delayed`, `email.bounced`, `email.complained`, `email.failed`, `email.suppressed` — e mostra **uma vez** o segredo para pôr em `RESEND_WEBHOOK_SECRET`. Depois, reinicie a API. Prefere pelo painel? resend.com → **Webhooks** → *Add endpoint* com a mesma URL e esses eventos. `npm run email:check` só confere, sem criar nada.

O que o webhook faz:
- **entregue / atrasado / falhou** → status do envio (Configurações → E-mails mostra os que deram problema);
- **devolução definitiva, spam ou suprimido** → o endereço entra na lista de supressão e não recebe mais (protege a reputação do domínio); o membro aparece com "E-mail não entrega";
- **recebido** → a API busca o e-mail completo no Resend e entrega para quem cuida daquele endereço (tabela acima).

Para testar o webhook em dev: `cloudflared tunnel --url http://localhost:3333` e um webhook **separado** no Resend para a URL do túnel (outro segredo).

---

## 📋 Você precisa de

**Claude Code** · **Linux** (ou WSL / VPS) · **Node.js** LTS · **PostgreSQL** ou Docker · conta **Stripe** (modo teste é grátis) · conta **Resend** para e-mail em produção (em dev usa o Mailpit) · e, para colocar no ar, **um domínio**.

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
├── backend/    SKILL.md + references/ + scripts/member-access-lib.mjs (+ testes) → API em 8 fases, acessos da pessoa
├── db/         SKILL.md + scripts/          → provision.sh
├── frontend/   SKILL.md + references/ + scripts/brand.mjs + assets/simulador-navegacao.html
├── apps/       SKILL.md                     → migra projetos antigos para o trilho de apps
├── module/     SKILL.md + references/ + scripts/validate-spec.mjs
├── notion/     SKILL.md + references/       → preset réplica do Notion
├── verify/     SKILL.md + contract.json + suite/ (Playwright) + scripts/run.sh
├── atualizar/  SKILL.md                    → atualiza todos os módulos do projeto para a versão nova (modo revisão, um por vez)
├── tarefas/    SKILL.md + references/ + scripts/parsers.mjs (+ testes)
├── crm/        SKILL.md + references/ + scripts/crm-lib.mjs (+ testes)
├── forms/      SKILL.md + references/ + scripts/forms-lib.mjs (+ testes) + templates.json
├── helpdesk/   SKILL.md + references/ + scripts/helpdesk-lib.mjs (+ testes)
├── agenda/     SKILL.md + references/ + scripts/agenda-lib.mjs (+ testes) → agendamento, recepção, comissões, clube, clínica
├── rh/        SKILL.md + references/ + scripts/rh-lib.mjs (+ testes) → app Pessoas: CLT, aprovações, holerites, clima
├── financeiro/ SKILL.md + references/ + scripts/financeiro-lib.mjs (+ testes) → contas, fluxo, DRE, OFX, cobranças Stripe
├── comercial/ SKILL.md + references/ + scripts/comercial-lib.mjs (+ testes) → propostas, aceite, contratos, assinatura eletrônica
├── erp/       SKILL.md + references/ + scripts/erp-lib.mjs (+ testes) → produtos, grade, kit, preços, estoque, vendas, PDV, compras
├── uploads/    SKILL.md + references/       → add-on de arquivos
├── workstation/ SKILL.md + references/ + scripts/workstation-lib.mjs (+ testes) → cobrança por app, onboarding, loja
├── landing/    SKILL.md + references/ + assets/catalogo.json (todos os apps) + scripts/ (catalog-lib, capture, check-site)
├── email/      SKILL.md + references/ + scripts/email-lib.mjs (+ testes) → Resend: envio, webhook, recebimento
├── notificacoes/ SKILL.md + references/ + scripts/notifications-lib.mjs (+ testes) → add-on de notificações
├── whatsapp/   SKILL.md + references/ + scripts/whatsapp-lib.mjs (+ testes) → motor de WhatsApp com drivers (falso, Meta, Zenvia, RodTicket)
├── fiscal/     SKILL.md + references/ + scripts/fiscal-lib.mjs (+ testes) → motor de NF-e/NFC-e com drivers (falso, provedores, SEFAZ)
└── domain/     SKILL.md + scripts/          → domain.sh + template do nginx
```

```bash
claude plugin validate .                  # valida o marketplace e o plugin
claude --plugin-dir ./plugins/rodsaas     # testa as skills sem instalar
```

Nova skill = nova pasta em `plugins/rodsaas/skills/<nome>/` → vira `/rodsaas:<nome>`.

</details>

<p align="center"><sub>Feito por <b>Rodrigo</b> com o Claude Code</sub></p>
