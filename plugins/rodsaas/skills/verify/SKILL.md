---
name: verify
description: Verifica de verdade se um projeto rodsaas funciona — audita o contrato (data-testid, rotas, formatos da API) e roda uma bateria de testes ponta a ponta no navegador (Playwright) contra a API e o painel rodando, cobrindo cadastro, login, sessão e refresh, criar e trocar de empresa, isolamento entre empresas, convites, papéis, remoção de membro, módulo de exemplo, estados de tela, plano e celular; depois corrige o projeto até ficar verde. Funciona com projetos feitos por qualquer IA (Claude, Gemini, ChatGPT). Use quando o usuário pedir para testar, validar, verificar, conferir se está funcionando, achar bugs no projeto rodsaas, ou chamar /rodsaas:verify; também é a etapa final obrigatória do /rodsaas:backend e do /rodsaas:frontend.
---

# rodsaas · verify

Prova que o básico do SaaS funciona, clicando no painel como um usuário de verdade. Não confia no que o código "parece" fazer: cria contas, troca de empresa, convida gente, lê os e-mails no Mailpit, derruba a API de propósito para ver o estado de erro, e confere cada resultado na tela **e** na API.

A mesma bateria roda em qualquer projeto rodsaas, porque todos seguem o **contrato testável** (`contract.json`, explicado em `references/contrato.md`): `data-testid` fixos nos elementos-chave, rotas com nomes fixos e formatos de API combinados.

## Passo a passo

### 1. Subir o ambiente
A bateria testa o projeto **rodando**. Confira e, se precisar, suba (em segundo plano, com log em arquivo):

- Postgres e Mailpit (docker compose do `api/`, ou os serviços da máquina);
- API: `cd api && npm run dev` (porta de `rodsaas.json → ports.api`);
- painel: `cd web && npm run dev` (porta `ports.web`);
- a fila de e-mails (pg-boss) precisa estar processando: os testes de convite e senha leem o e-mail no Mailpit.

O `run.sh` faz uma pré-checagem e diz exatamente o que está fora do ar.

### 2. Auditar o contrato
```bash
node "${CLAUDE_PLUGIN_ROOT}/skills/verify/scripts/audit.mjs" <pasta-do-projeto>
```
Lista `data-testid` faltando por área, rotas do painel ausentes e divergências da API (rota ou campo do corpo com outro nome, conferido no `api/openapi.json`).

**Se houver pendências, adapte o projeto antes de testar:**
- testids: acrescente o atributo no elemento certo (`references/contrato.md` diz qual é cada um). É uma mudança sem efeito visual; faça direto.
- rota ou campo de API com outro nome: ajuste para o nome do contrato (backend + front + `openapi:export` + `api:types`). Se a mudança for grande, mostre o que vai mudar antes.
- se o projeto não tem uma funcionalidade inteira (ex.: não existe tela de convite), **não invente às pressas**: registre como falha conhecida e pergunte se é para implementar seguindo a skill `frontend`/`backend`.
- faltando quase todo o grupo `apps` (trilho, "Todos os apps"…): o projeto é anterior à casca de apps. A correção é a skill **`apps`** (`/rodsaas:apps`), não testids soltos; pergunte se é para rodar.

Rode a auditoria até sair "✓ contrato completo".

### 3. Rodar a bateria
```bash
bash "${CLAUDE_PLUGIN_ROOT}/skills/verify/scripts/run.sh" <pasta-do-projeto>
```
(Sem `CLAUDE_PLUGIN_ROOT`, use o caminho desta skill. Fora do Claude Code — Gemini, ChatGPT ou terminal — rode o mesmo comando apontando para a pasta `skills/verify` do repositório.)

- Primeira vez: instala a bateria e o Chromium num cache (`~/.cache/rodsaas-verify`), fora do projeto.
- Leva alguns minutos: os testes criam várias contas e **respeitam o rate limit** de cadastro/login (esperam o `Retry-After` em vez de desligar a proteção).
- Filtros úteis: `--project=api` (só API, sem navegador), `--project=ui`, `-g "trocar"` (por nome), `--last-failed`.
- Resultado: resumo em português no terminal e relatório em `<projeto>/rodsaas-verify-report/` (HTML com **vídeo, print e trace** de cada falha). Garanta que essa pasta está no `.gitignore` do projeto.

### 4. Corrigir até ficar verde
Para cada falha (`references/cenarios.md` explica o que cada teste prova e as causas mais comuns):
1. leia a mensagem (ela diz o que era esperado e o que veio);
2. veja o print/vídeo/trace no relatório (`npx playwright show-report <projeto>/rodsaas-verify-report/html`) ou o `error-context.md` em `rodsaas-verify-report/artifacts/`;
3. ache a **causa no código do projeto** e corrija ali. **Nunca altere a bateria para passar** — se um teste parecer errado para aquele projeto, explique ao usuário e pergunte;
4. rode de novo só o que falhou (`--last-failed`), e no fim a bateria inteira.

Pare e pergunte quando a correção exigir uma decisão de produto ou uma mudança grande de arquitetura.

## Relatório final

Tabela curta por área (API, autenticação, sessão, empresas, membros, módulo, estados, plano, celular/tema e presets instalados, como CRM) com ✓/✗/○, a lista do que foi corrigido (arquivo e motivo, uma linha cada), o que ficou pulado e por quê, e o que ainda falha (se algo ficou pendente com o usuário).

## O que a bateria cobre

| Área | Testes |
|---|---|
| **API** | health; erro RFC 9457 com `code` e `requestId`; 401 sem login; `VALIDATION_ERROR` com `errors[]`; CSRF por Origin; cookies httpOnly, refresh em `/v1/auth`, `session_hint`, cookie do access durando como o refresh; `/v1/me` completo; criar empresa vira a ativa; trocar; não troca para empresa alheia; isolamento (404); último owner protegido; membro não convida; rotação e reuso do refresh derrubando a família; logout |
| **Autenticação** | cadastro pela tela; sair; rota protegida → login → volta para onde estava; senha errada; `next` externo ignorado; esqueci a senha (resposta genérica, e-mail, redefinir, senha antiga para de funcionar); verificação de e-mail; nenhum token acessível ao JavaScript |
| **Sessão** | access token sumiu → renova **uma** vez com várias requests e continua; sessão inválida → login sem loop; voltar do navegador após sair não reabre a área logada |
| **Empresas** | criar pelo seletor (vira a ativa, aparece na lista); trocar (tela e sessão, persiste ao recarregar); dados de uma não aparecem na outra (lista e link direto → 404 com a casca); **cache limpo na troca** (nada da anterior aparece nem por um instante); renomear reflete no seletor |
| **Membros** | convidar pela tela → e-mail → criar conta pelo convite (sem empresa própria, papel MEMBER) → aparece na lista; membro não vê ações de admin nem cobrança; promover a admin libera; remover corta o acesso na hora (`/sem-empresa`) |
| **Módulo de exemplo** | vazio com ação; criar com erro no campo, editar, excluir com confirmação; clique duplo cria uma vez só e o botão fica desabilitado; busca na URL e após recarregar; limite do plano → upgrade |
| **Estados** | 404 dentro do app; erro da API com código e "tentar de novo"; skeleton com API lenta; API inacessível sem tela branca nem stack |
| **Plano e cobrança** | API: preços, modo de cobrança no `/v1/me`, free não comprável, membro não assina; no modo de teste: assinar, já-assina (409), mesmo plano (400), prévia, trocar, cancelar e retomar. Tela: cards, selo do atual, uso, **botão de assinar sempre visível para o owner**, aviso de modo; assinar → trocar (diálogo com prévia) → cancelar → retomar; admin sem botões e com aviso; cadastro com `?plano=` já sai assinando |
| **Celular e tema** | menu vira gaveta; sem rolagem horizontal nas telas principais; claro/escuro |
| **Forms** (preset `forms`) | API: link público só com a versão publicada (rascunho não vaza), envio público sem Origin com erro em cada campo, e-mail normalizado e campos ocultos declarados, lógica condicional (pergunta escondida não exigida nem gravada), limite de respostas e encerrar/reabrir (410), campo isca, respostas só para dono/colaborador (membro e outra empresa → 404), todos os tipos de pergunta com validação brasileira e o resumo (opções, NPS, sim/não, média), CSV com BOM e fórmula neutralizada. Tela: paleta com todos os tipos, montar pelo construtor com salvamento automático que sobrevive ao recarregar e publicar, responder o formulário público com erro no campo e ver a resposta na tabela, uma pergunta por vez com Enter, lógica ao vivo, aviso de encerrado |
| **Agenda** (preset `agenda`) | API: horários públicos só dentro da disponibilidade e no fuso pedido, sem login e sem Origin; agendar pelo link (201 com link de gerenciar) e **nunca marcar duas vezes** (mesmo horário → 409 `SLOT_TAKEN`, 5 pedidos simultâneos → 1); reserva temporária segura o horário; remarcar e cancelar pelo token liberam o horário (cancelar de novo → 409 `CHANGE_NOT_ALLOWED`); antecedência mínima e janela máxima (inclusive agendando direto pela API); aprovação manual (pendente segura o horário, aprovar/recusar); campo isca; tipo desligado → 410; isolamento entre empresas e página pública sem dados da equipe nem de clientes, rodízio da equipe, turma com vagas, encaixe interno fora da disponibilidade só com confirmação. Tela: página pública (fim de semana desabilitado, dia → horário → Nome/E-mail → confirmado) com a linha na lista da empresa, compromisso no calendário abrindo o painel, aprovar e cancelar pelo painel, cliente cancela pelo link, link indisponível, criar tipo pela tela e a semana com 7 dias |
| **Suporte** (preset `helpdesk`) | API: chamado pelo portal sem login e sem Origin com erro em cada campo, **numeração sequencial por empresa** (5 simultâneos → números seguidos; outra empresa com a própria), resposta pública chega por e-mail com `[#N]` e **nota interna nunca vaza** (link do cliente e e-mails), cliente responde/resolve/reabre e equipe não fecha à mão, **e-mail recebido** vira chamado (sem duplicar pelo Message-ID), resposta por e-mail entra no mesmo chamado sem a citação, `[#N]` de quem não participa vira chamado novo, resposta automática ignorada sem confirmação, SLA (prazo pela prioridade, nota não conta, resposta cumpre, aguardando pausa), rodízio só entre disponíveis, gatilho sem acento, satisfação só depois de resolver, base de conhecimento (rascunho e interno nunca no portal, busca sem acento), chave da API, isca, membro não atendente (403) e outra empresa (404), macro com variáveis sem gravar, mesclar mantendo o link do cliente. Tela: abrir chamado no portal com erro no campo e ver na caixa de entrada, nota/resposta/atribuir/status no chamado com o cliente vendo só a resposta e respondendo, "isso resolveu" e avaliação, busca e artigo com "isso ajudou?" e sugestão ao abrir chamado, visões com contadores |
| **Tarefas** (preset `tarefas`) | API: fluxo padrão e projeto "Primeiros passos", **código sequencial** (5 simultâneas → 1..5), quadro com uma coluna por status, mover para concluído preenche/limpa a conclusão, subtarefas (1 nível), checklist e vínculos (com o lado invertido e "bloqueada") no detalhe, descrição com versão (409), menção notifica o mencionado e nunca o autor, cronômetro único por pessoa que lança as horas (mínimo 1 min), edição em massa tudo ou nada, projeto privado inexistente para quem não é membro (404), sprint com uma ativa e pendências para o backlog. Tela: projeto novo com chave sugerida, adição rápida com `@`/`!`/datas/`#` e arrastar o card mudando o status, painel com subtarefa, checklist e comentário salvos, cronômetro no topo que sobrevive a recarregar, minhas tarefas com concluir pela linha, lista e calendário no dia certo |
| **Páginas** (preset `notion`) | API: "Comece aqui" e o database de exemplo, árvore com breadcrumbs e mover sem ciclo (`INVALID_MOVE`) e reordenar, autosave com versão (409 sem sobrescrever), busca em português no conteúdo e lixeira em lote (some da busca e da árvore, restaurar volta tudo), database com validação por tipo (seleção, número, pessoa do workspace) e filtro da visão no servidor, link público (403 sem a feature, só os campos públicos, desligar para na hora), links `javascript:` removidos, isolamento. Tela: criar página e escrever no **editor de blocos** com autosave que sobrevive a recarregar e título na árvore, sub-página pelo +, conflito entre duas abas avisando em vez de sobrescrever, excluir e restaurar pela lixeira, quadro com arrastar mudando o Status, tabela com linha nova e side peek, publicar e abrir o link sem login |
| **RH / Pessoas** (preset `rh`) | API: colaborador com CPF válido e **único por empresa**, gestor sem ciclo (`INVALID_MANAGER`), **ficha projetada por permissão** (colega só vê o público; gestor sem salário; a pessoa vê o próprio salário sem as anotações do RH; RH vê tudo) e diretório sem CPF nem salário; saldo de férias pela CLT com faltas (6 faltas → 24 dias) e situações (vencida, disponível, em aquisição); cada regra do pedido (sexta-feira, 5 dias, 14 dias, venda de 1/3, saldo, período incompleto); pedido vai ao gestor, quem pede não aprova, recusa exige comentário, pendente reserva, aprovação desconta e recusa devolve, sem gestor cai no RH; atestado aparece como ausência médica para o gestor e falta só pelo RH; despesa acima do limite exige justificativa e relatório acima de R$ 1.000 passa pelo financeiro; documentos com validade só para o RH e a pessoa; holerites em lote casados pelo CPF e cada um vê só os seus; pesquisa anônima com mínimo de 5 e "outros" contra subtração, sem dado de quem respondeu; pré-admissão pelo link público até a efetivação com checklist. Telas: pedido de férias com o erro da CLT no trecho e aprovação na caixa do gestor; ficha com abas por permissão, organograma e Início por papel |
| **Workstation** (`/rodsaas:workstation`) | cadastro nasce em teste de 14 dias; catálogo público com apps disponíveis (com preço) e "em breve"; onboarding liga só os escolhidos, convida e não duplica o conteúdo inicial; assinar por app soma igual à calculadora e o Completo cobra no mínimo 3 usuários; sem acesso ao app é 403 na API; dar acesso além dos assentos pede confirmação; fim do teste vira grátis com o app pago só leitura (dados ficam) e limite de 2 pessoas; telas do onboarding (apps da landing marcados), banner do teste, assinatura com prévia e aviso de app bloqueado. Com `billing.model: "apps"`, a parte antiga de planos é pulada |
| **E-mail** (`/rodsaas:email`) | webhook do Resend: sem assinatura, outro segredo, corpo alterado ou assinatura de 10 min atrás → 401; válido → 200, repetido e tipo desconhecido não quebram; devolução definitiva e spam colocam o endereço na lista de supressão (o "esqueci a senha" não chega mais), devolução temporária não. Assina os eventos com o `RESEND_WEBHOOK_SECRET` do `api/.env` |
| **Notificações** (add-on `notificacoes`) | API: convite aceito avisa owners/admins e não quem entrou, **dois aceites viram uma notificação agrupada** (ator mais recente, `segments` com destaque); papel alterado avisa o membro e não quem alterou; e-mail imediato com `List-Unsubscribe` + `List-Unsubscribe-Post` e **descadastro de um clique sem login e sem Origin** (sino continua); ler, não lida, todas, remover, `unread=true` antigo; notificação de outra pessoa ou empresa = 404 sem alterar nada; preferências por tipo (no app desligado não cria; obrigatório não desliga; formato antigo `disabledTypes`); catálogo por papel e com os tipos dos presets instalados; página de descadastro só no botão, desfazer, token adulterado → 400. Telas: sino com contador, painel com Não lidas e Hoje, abrir marca como lida e leva à url, marcar todas zera, sino no celular; `/notificacoes` com filtros de status e app; preferências salvam (no app, e-mail do tipo, e-mail geral), aviso obrigatório travado e só para o owner |
| **Casca de apps** | menu clássico com 1 app e trilho com 2+; cada app abre o próprio menu e fica ativo no trilho (e depois de recarregar); recolher com escolha salva; menu flutuante com o mouse por cima; "Todos os apps" com busca e estrela salva no servidor; app desligado pela empresa some e a rota dá não encontrado (com 2 apps, volta ao menu clássico); celular sem trilho no DOM, barra de apps e gaveta com o menu do app. Usa `rodsaas.json → apps`; sem essa lista, a parte é pulada com o aviso de rodar `/rodsaas:apps` |
| **CRM** (preset `crm`) | API: funil padrão, criar e mover negócio, totais do quadro, ganhar/reabrir/perder com motivo obrigatório, isolamento entre empresas, modo "cada vendedor vê os seus" (404 e quadro), contato duplicado (409 com o existente), captura por chave **sem Origin**, chave errada/revogada, conversão reaproveitando o contato e gravando o lead de origem, negócio com pessoa e empresa aparecendo nos dois lados (desvincular, empresa principal preenchida, relação de outra empresa recusada), produtos somando o valor no servidor. Tela: criar negócio com erro no campo e total da coluna, barra de etapas, ganhar/reabrir/perder com motivo, agendar atividade → selo no card → concluir pela agenda, aviso de duplicado com link, converter lead (com a pessoa e o lead de origem no negócio), vincular pessoa e empresa no negócio (Ligar/WhatsApp, card com a empresa), "+ Negócio" com empresa e pessoa nova pelo seletor, "+ Negócio" na página do contato, produtos pela tela com o valor somado, membro sem o negócio do owner no quadro e no link direto |

Testes que dependem de algo opcional (módulo `projects`, limite de plano baixo, preset `crm`) são **pulados** com o motivo, não reprovados. Presets e add-ons instalados (`rodsaas.json → presets` e `addons`) acrescentam a parte deles ao contrato e à auditoria (`contract.json → presets`); `-g "CRM"` roda só a do CRM (`-g "Agenda"`, só a da Agenda; `-g "Helpdesk"`, só a do Suporte; `-g "Tarefas"`, `-g "Páginas"`, `-g "Uploads"`, `-g "Notificações"`, `-g "E-mail"`, `-g "Workstation"` e `-g "RH"`, só a deles).

## Mapa

| Arquivo | Para quê |
|---|---|
| `contract.json` | contrato em formato de máquina (usado pela auditoria) |
| `references/contrato.md` | cada testid, rota e formato de API, e onde vai |
| `references/cenarios.md` | o que cada teste prova e causas comuns de falha |
| `scripts/run.sh` | pré-checagem + auditoria + bateria + resumo |
| `scripts/audit.mjs` | só a auditoria do contrato |
| `suite/` | a bateria Playwright (copiada para o cache pelo `run.sh`) |
