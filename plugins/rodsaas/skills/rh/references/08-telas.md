# 08 · Telas

Tudo em `web/src/features/rh/` (rotas em `app/(app)/pessoas/...`), com os componentes da base (tabelas, diálogos, `LoadingButton`, estados vazios, skeletons, toasts) e o menu do app (`01-escopo-e-papeis.md`). **Celular primeiro** no autoatendimento (Início, Minhas férias, Holerites, Despesas, Pesquisa, Aprovações): a maior parte dos colaboradores abre pelo celular, com o link do aviso. Toda tela respeita `visibleGroups`/papel: item que a pessoa não pode usar **não aparece** (não fica desabilitado sem explicação).

## Rotas

| Rota | Tela | Quem |
|---|---|---|
| ★ `/pessoas` | **Início** por papel (abaixo) | todos |
| `/pessoas/eu` | Meu perfil: dados (edita contatos; pedir alteração de endereço/banco/dependentes/emergência), "Quem acessou meus dados sensíveis", Baixar meus dados | todos |
| ★ `/pessoas/ferias` | Minhas férias: saldo por período, pedir, pedidos, aviso de férias para ciência | todos (com regime ≠ none) |
| ★ `/pessoas/ausencias` | calendário (mês/lista) + "Lançar ausência" | todos (conteúdo por papel) |
| ★ `/pessoas/aprovacoes` | Para aprovar · Meus pedidos · Todas (RH) · delegação | todos |
| `/pessoas/aprovacoes/[id]` | detalhe com linha do tempo | pedinte, aprovadores, RH |
| ★ `/pessoas/colaboradores` | diretório | todos |
| ★ `/pessoas/colaboradores/[id]` | ficha com abas | todos (abas por grupo) |
| `/pessoas/colaboradores/importar` | importação CSV com prévia | RH |
| ★ `/pessoas/organograma` | organograma | todos |
| `/pessoas/admissoes` · `/pessoas/admissoes/[id]` | pipeline e conferência; desligamentos em andamento | RH |
| `/pre-admissao/[token]` | página pública da pré-admissão (fora do `(app)`) | candidato |
| ★ `/pessoas/documentos` | meus documentos + documentos da empresa para ciência; RH: vencendo, políticas | todos |
| ★ `/pessoas/holerites` | meus holerites; RH: lotes | todos |
| `/pessoas/holerites/lotes/[id]` | prévia/atribuição/publicação e quem viu | RH |
| `/pessoas/despesas` · `/pessoas/despesas/[id]` | minhas despesas e relatórios; financeiro: a pagar | todos (`rh_expenses`) |
| `/pessoas/solicitacoes/nova` | nova solicitação personalizada | todos |
| `/pessoas/desempenho` | minhas avaliações (a fazer, sobre mim), ciclos (RH) | todos (`rh_performance`) |
| `/pessoas/desempenho/ciclos/[id]` | acompanhamento por fase, calibração 9-box, liberar | RH, gestores |
| `/pessoas/desempenho/avaliacoes/[id]` | formulário da avaliação | avaliador / avaliado (liberada) |
| `/pessoas/metas` | empresa · minha área · minhas; árvore de alinhamento | todos |
| `/pessoas/feedback` | recebidos · dados · reconhecimentos (mural) · pedir | todos |
| `/pessoas/one-on-ones` · `/[id]` | lista e 1:1 com pauta | gestor e liderado |
| ★ `/pessoas/clima` | pesquisas para responder; RH: todas | todos |
| ★ `/pessoas/clima/[id]/responder` | responder | público-alvo |
| `/pessoas/clima/[id]` | resultado | RH (gestor: a área, se permitido) |
| `/pessoas/relatorios` | indicadores | RH, gestores (equipe) |
| `/pessoas/fechamento` | fechamento do mês (escolhe o mês, prévia, CSV, enviar ao contador) | RH, `FINANCE` |
| `/pessoas/configuracoes/...` | geral, papéis, áreas, cargos, locais e feriados, regimes de férias, fluxos de aprovação, tipos de solicitação, ausências, despesas, admissão (documentos exigidos), checklists, categorias de documentos, modelos de avaliação, pesquisas, privacidade | `RH_ADMIN` |

## Início (`/pessoas`, `rh-home` com `data-role`)

| Bloco | Colaborador | Gestor (+) | RH (+) |
|---|---|---|---|
| Pendências | documentos para dar ciência, holerite novo, avaliação para fazer, pesquisa aberta, tarefas do checklist, aviso de férias para ciência | **Para aprovar** (contador e os 3 mais antigos com aprovar/recusar ali) | pré-admissões enviadas, documentos vencendo, férias vencendo/vencidas, pedidos parados |
| Férias | saldo do período mais antigo com situação e "Pedir férias" | quem da equipe está fora hoje/esta semana | — |
| Pessoas | aniversários e tempo de casa do mês (se ligado) | 1:1 desta semana, liderados sem 1:1 há 30+ dias | admissões e desligamentos do mês, quadro atual |
| Desenvolvimento | metas com situação, feedbacks recentes | metas da equipe com risco | ciclos em andamento com % por fase |
| Boas-vindas | durante o onboarding: primeiro dia, padrinho, tarefas | — | — |

Cada bloco com estado vazio que ensina ("Nenhum pedido para aprovar. Bom trabalho!").

## Minhas férias (`/pessoas/ferias`)

- Cartões por período (`vacation-balance`, `data-period`, `data-status`): selo da situação (`04-ferias-e-ausencias.md`), "x dias disponíveis", prazo para marcar, barra usado/vendido/disponível.
- **Pedir férias** (`vacation-request-new`) abre o formulário (`vacation-request-form`, diálogo no desktop, tela cheia no celular): período, trechos (`vacation-segment-start`/`vacation-segment-days` com `data-index`; "+ Trecho" até 3), venda de dias (`vacation-abono`, com o máximo), adiantamento do 13º, observação. Validação ao vivo: erros (`vacation-violation`, `data-code`) no trecho, avisos (`vacation-warning`, `data-code`), resumo (`vacation-summary`: fim, retorno, pagamento, saldo que sobra, "2 de 8 da equipe fora"). Calendário de apoio com feriados e dias em que não pode começar riscados. **Enviar** (`vacation-request-submit`) só habilita sem erro.
- Pedidos (`vacation-request-item`, `data-status`): datas, dias, situação (com quem está a aprovação), cancelar (pendente), ciência do aviso (aprovado).

## Aprovações (`/pessoas/aprovacoes`)

Abas (`approvals-tab` com `data-tab="to_me|mine|all"`), contador (`approvals-count`). Linha (`approval-item`, `data-kind`, `data-status`, `data-id`): ícone do tipo, título, quem pediu, quando, etapa, dados de decisão (`05-aprovacoes-e-despesas.md`). Ações: **Aprovar** (`approval-approve`), **Recusar** (`approval-reject` → campo `approval-comment` obrigatório e `approval-reject-confirm`), seleção em massa (`approval-select` + `approval-bulk-approve`). Depois de decidir, a linha sai da aba com toast "Férias de Bia aprovadas" e desfazer **não** existe (decisão é definitiva — o diálogo de recusa avisa). "Ausente? Delegue suas aprovações" (`approval-delegate`).

## Diretório e ficha

- Diretório (`/pessoas/colaboradores`): busca (`employee-search`), filtros, alternar lista/cartões, linha (`employee-row`, `data-id`) com foto, nome, cargo, área, gestor, selo "Fora hoje"; RH: **+ Colaborador** (`employee-new`), Importar, Exportar.
- **Novo colaborador** (RH, diálogo em passos): pessoal (nome, nome social, CPF com máscara e validação ao vivo, nascimento, e-mail pessoal), contrato (tipo, admissão, cargo, área, gestor com busca, local, jornada, salário), acesso (e-mail de trabalho + "Convidar para o autoatendimento"). Erros do servidor no campo (`CPF_TAKEN` no CPF: "Já existe um colaborador com este CPF").
- **Ficha** (`employee-profile`, `data-id`): cabeçalho (foto, nome de exibição, cargo, área, gestor clicável, tempo de casa, situação, ações do RH: Editar, Registrar promoção/mudança, Desligar, Convidar). Abas (`employee-tab`, `data-tab`) **só as permitidas**:

| Aba (`data-tab`) | Grupo | Conteúdo |
|---|---|---|
| `resumo` | public | contatos de trabalho, local, aniversário, equipe (gestor e liderados), "fora hoje" |
| `pessoal` | personal (+ bank) | documentos de identificação, endereço, contatos, emergência, dependentes, dados bancários (mascarados com "mostrar") |
| `contrato` | job | contrato, jornada, admissão, centro de custo, campos personalizados |
| `remuneracao` | compensation | salário atual (`employee-salary`), faixa do cargo, histórico com motivo (RH: "Nova vigência") |
| `documentos` | documents/health | pasta por categoria com validade (`document-item`, `data-expiry`) |
| `ausencias` | absences | saldo de férias por período, pedidos e ausências do ano |
| `desempenho` | performance | ciclos (nota, quadrante para RH/gestor), metas, PDI, feedbacks, 1:1 (gestor) |
| `historico` | job | linha do tempo de eventos; RH_ADMIN e a pessoa: acessos a dados sensíveis |

Editar é por seção (lápis em cada bloco), com "data de vigência" e "motivo" quando o campo muda o histórico (cargo, área, gestor, salário).

## Organograma (`/pessoas/organograma`)

Árvore de cima para baixo a partir de quem não tem gestor (ou de uma pessoa escolhida: "Ver a partir de mim"), nós (`org-node`, `data-id`) com foto, nome, cargo e número de liderados; recolher/expandir (`org-toggle`), zoom e arrastar, busca que centraliza no nó, filtro por área, exportar PNG. Clicar no nó abre o cartão com o link da ficha. No celular, vira lista em níveis com "subir/descer". Mais de 300 nós: carrega os níveis sob demanda.

## Holerites, documentos e pesquisa (autoatendimento)

- **Meus holerites**: lista por ano (`payslip-item`, `data-id`, `data-viewed`), abrir (visualizador de PDF da base ou nova aba), "Confirmar recebimento" (`payslip-ack`).
- **Meus documentos**: pasta própria (enviar certificado), e **Para dar ciência** (`company-doc-item`, `data-acked`) com o leitor e "Li e concordo" (`company-doc-ack`, habilita depois de abrir/rolar).
- **Responder pesquisa**: aviso de anonimato (`survey-anonymous-note`), perguntas (`survey-question`, `data-id`), escala (`survey-scale`), eNPS (`survey-enps` com botões 0–10), abertas, **Enviar** (`survey-submit`) → tela "Obrigado! Sua resposta foi registrada de forma anônima." (`survey-done`). Já respondida → mesma tela de obrigado.

## Pré-admissão pública (`/pre-admissao/[token]`)

Marca da empresa (logo, cor), passos com barra de progresso (`preadmission-step`, `data-step`), salva sozinho ("Rascunho salvo"), envio de documento com câmera (`preadmission-doc`, `data-key`, `data-status`), revisão e **Enviar para o RH** (`preadmission-submit`) → tela de confirmação. Link inválido → página explicando e o contato do RH (e-mail da empresa, se configurado).

## Estados e interações (valem para todas as telas)

- Carregando: skeleton com o formato do conteúdo; erro: `error-state` com tentar de novo; vazio que ensina e oferece a ação ("Ainda não há colaboradores. Importe uma planilha ou cadastre o primeiro").
- Ações com `LoadingButton`; toasts com o que aconteceu ("Pedido de férias enviado para Ana"); erros de regra (422) aparecem **no lugar** do problema, não só em toast.
- Plano/suíte: recurso fora do plano mostra o selo Pro/Suíte RH com "Conheça" (owner) ou "Fale com o responsável"; app bloqueado mostra o aviso de só leitura da workstation.
- Atalhos: `G` `P` (Pessoas), `A` (aprovações) — os mesmos padrões da casca.
- Acessibilidade: abas com teclado, calendário navegável por setas, cores de situação sempre com texto, foco visível.
- Celular sem rolagem lateral em todas as rotas; tabelas viram cartões abaixo de 640 px.

## Contrato testável (testids)

| Testid | Onde |
|---|---|
| `rh-home` (`data-role="colaborador\|gestor\|rh"`) | Início |
| `vacation-balance` (`data-period`, `data-status`), `vacation-request-new`, `vacation-request-form`, `vacation-segment-start` / `vacation-segment-days` (`data-index`), `vacation-abono`, `vacation-violation` (`data-code`), `vacation-warning` (`data-code`), `vacation-summary`, `vacation-request-submit`, `vacation-request-item` (`data-status`) | Minhas férias |
| `approvals-tab` (`data-tab`), `approvals-count`, `approval-item` (`data-kind`, `data-status`, `data-id`), `approval-approve`, `approval-reject`, `approval-comment`, `approval-reject-confirm`, `approval-select`, `approval-bulk-approve`, `approval-delegate` | Aprovações |
| `employee-search`, `employee-row` (`data-id`), `employee-new` | Diretório |
| `employee-profile` (`data-id`), `employee-tab` (`data-tab`), `employee-salary`, `document-item` (`data-expiry`) | Ficha |
| `org-node` (`data-id`), `org-toggle` | Organograma |
| `absence-calendar`, `absence-item` (`data-kind`, `data-type`) | Ausências |
| `payslip-item` (`data-id`, `data-viewed`), `payslip-ack`, `company-doc-item` (`data-acked`), `company-doc-ack` | Holerites e documentos |
| `survey-anonymous-note`, `survey-question` (`data-id`), `survey-scale`, `survey-enps`, `survey-submit`, `survey-done` | Responder pesquisa |
| `preadmission-step` (`data-step`), `preadmission-doc` (`data-key`, `data-status`), `preadmission-submit` | Pré-admissão |

Os rótulos visíveis são livres (português claro); os testids e as rotas ★ não mudam.
