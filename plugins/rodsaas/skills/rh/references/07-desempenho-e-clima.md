# 07 · Desempenho, metas, feedback e clima

Tudo desta referência exige `rh_performance` (desempenho, 1:1, feedback, PDI, metas) ou `rh_surveys` (clima) no modelo de planos; com a Suíte RH, está incluído.

## Ciclos de avaliação

### Criar (RH)

1. **Básico**: nome ("Avaliação 2026.2"), modelo (`ReviewTemplate`), público (todos ativos, áreas, admitidos antes de uma data — padrão: quem tem 90+ dias de casa).
2. **Tipos**: autoavaliação, gestor (sempre), pares (a pessoa indica até `peerMax`, o gestor aprova), liderados (avaliação do gestor pela equipe — respostas agregadas e sem nome, mínimo 3).
3. **Fases com datas** (`phases`): `autoavaliacao` → `pares` → `gestor` → `calibracao` → liberação. Fases podem se sobrepor (auto e pares juntas). A tela mostra a linha do tempo.
4. **Revisar e lançar**: prévia de quantas avaliações serão criadas por tipo e quem ficou de fora (sem gestor → aviso: "3 pessoas sem gestor: a avaliação do gestor vai para o RH").

`currentPhase(phases, hoje)` decide o que cada um pode fazer: enviar fora da fase → 409 `PHASE_CLOSED` (o RH pode reabrir uma avaliação específica com motivo).

### Responder

- Formulário por seções; perguntas de escala 1–5 com rótulos ("1 · Muito abaixo do esperado … 5 · Muito acima"), descrição da competência e exemplos de comportamento; perguntas abertas com contador; **salva sozinho** (rascunho a cada 2 s, "Salvo às 14:32").
- O gestor vê a autoavaliação da pessoa **depois de enviar a dele** (opção do ciclo: "gestor vê a autoavaliação antes") para não ancorar.
- Enviar exige as obrigatórias; calcula `reviewScore` (ponderada pelos pesos das competências) e grava `score`.
- Pares podem **recusar** ("não trabalho o suficiente com essa pessoa"), com motivo, e o avaliado indica outro.

### Calibração (RH e gestores)

- Tabela por área: pessoa, auto, pares (média), gestor, nota final editável (com motivo quando difere da do gestor), **potencial** (baixo/médio/alto) e a **9-box** (`nineBox(finalScore, potential)`) em grade 3×3 com arrastar para mudar de quadrante (muda a nota/potencial e pede motivo). Distribuição por quadrante e por área (sem curva forçada).
- `calibrationNote` só para RH e gestores da calibração; nunca liberada para a pessoa.

### Liberação e devolutiva

- **Liberar** (RH, por área ou geral): a pessoa vê a nota final, a avaliação do gestor (com nome), a autoavaliação dela, os pares **agregados e sem nome** (média por competência e comentários embaralhados, só se 2+ pares responderam), o resumo do gestor e o PDI sugerido. Liderados: o gestor vê a média e os comentários só com 3+ respostas.
- O gestor registra a **conversa de devolutiva** (data, resumo) e cria as ações do PDI junto com a pessoa.
- Ficha → aba Desempenho: histórico de ciclos com a nota e o quadrante (RH e gestor), evolução por competência.

## 1:1

- Gestor agenda (data/hora, recorrência semanal/quinzenal/mensal) — se a Agenda estiver instalada, oferece criar o evento nas duas agendas.
- **Pauta compartilhada**: os dois adicionam assuntos antes; itens não discutidos passam para a próxima.
- **Notas compartilhadas** e **nota privada** (só o gestor; o RH **não** vê — avisado na tela).
- **Combinados** (ação, dono, prazo, feito) que aparecem nas próximas 1:1 até concluídos.
- Histórico por pessoa; indicador para o gestor: "Última 1:1 com Bia há 32 dias".
- Aviso na véspera (`rh.one_on_one.soon`).

## Feedback contínuo e reconhecimento

- **Dar feedback**: para qualquer colega; tipo elogio (pode ser público no mural, ligado a um **valor da empresa**) ou construtivo (sempre privado: a pessoa e o gestor dela); texto com dica de estrutura (situação · comportamento · impacto).
- **Pedir feedback**: escolhe pessoas e um tema ("sobre a apresentação de ontem"); elas respondem pelo aviso.
- **Mural** (Feedback → Reconhecimentos): elogios públicos em ordem, reação com 👏 (contador), filtro por valor e área. Sem ranking de pessoas.
- Feedbacks recebidos aparecem na avaliação do ciclo para o gestor (opção do ciclo).

## PDI

Ações de desenvolvimento por pessoa (curso, projeto, mentoria, leitura, outro), competência ligada, prazo, status; criadas pela pessoa ou pelo gestor; o RH vê todas. Aparece na ficha (aba Desempenho), nas 1:1 e na devolutiva.

## Metas e OKRs

- **Níveis**: empresa (RH/`RH_ADMIN`), área (responsável da área ou RH), individual (a pessoa e o gestor). Cada objetivo pode se **alinhar** a um de nível acima (árvore na tela "Metas da empresa").
- **Resultados-chave**: número, %, moeda ou sim/não, com início, alvo (inclusive reduzir: de 10 para 2) e atual; peso; dono.
- **Check-in**: novo valor, confiança (alta/média/baixa) e comentário; histórico em gráfico de linha; aviso semanal para quem não atualizou.
- **Progresso**: `krProgress` (0–100, limitado) e `objectiveProgress` (média ponderada); **situação** `goalStatus` contra o esperado linear do período: no ritmo (verde), atenção (amarelo), atrasado (vermelho), concluído, não atingido, não iniciado.
- Visibilidade: metas da empresa e de área para todos; individuais `COMPANY` (padrão) ou `PRIVATE` (pessoa, gestor, RH).
- Fechar o período: congela o progresso, pede o comentário final, permite copiar para o próximo período.

## Clima e eNPS

### Criar e lançar (RH)

- Tipos: **Clima** (modelo pronto com 8 dimensões, 3–4 perguntas de escala cada + eNPS + 2 abertas), **eNPS** (1 pergunta 0–10 + "por quê?"), **Pulso** (3–5 perguntas, recorrente, cada rodada abre e fecha sozinha), **Desligamento** (enviada no desligamento), **Personalizada**.
- Público (todos, áreas, locais, contratos), período de abertura, **recorte do resultado** (área ou local), mínimo por recorte (padrão 5, nunca menos que 3).
- **Anônima** (padrão) ou **identificada** (só Desligamento e Personalizada; a tela de resposta diz em destaque "Esta pesquisa é identificada").
- Lançar avisa o público (`rh.survey.open`); lembrete automático a quem não respondeu (sem dizer quem respondeu a ninguém) na metade do prazo e no último dia.

### Responder

Tela limpa no celular, uma pergunta por vez ou todas (escolha da pessoa), escala com rótulos, eNPS 0–10 em botões, abertas opcionais, aviso de anonimato: **"Suas respostas não são ligadas ao seu nome. O RH só vê resultados de grupos com 5 ou mais pessoas."** Enviar não tem volta (sem edição).

### Anonimato de verdade (não negociável)

1. `SurveyParticipation` (quem respondeu, só o **dia**) e `SurveyResponse` (o que respondeu, **sem pessoa, sem horário, id aleatório**) — tabelas separadas, gravadas na mesma transação; não há chave que ligue uma à outra.
2. A resposta guarda só o **recorte** (área ou local) e a faixa de tempo de casa, no momento da resposta.
3. **Não existe rota** que liste respostas individuais — nem para o owner, nem para o `RH_ADMIN`, nem exportação "bruta".
4. Resultados só pelo `groupResults`: recorte com menos que o mínimo não aparece; se os escondidos somarem menos que o mínimo, o menor recorte mostrado também vai para "Outros" (para não descobrir por subtração); geral só com o mínimo.
5. Comentários abertos: só com o geral liberado, embaralhados, sem recorte, sem data; o RH pode ocultar um comentário que identifique alguém (fica registrado quem ocultou).
6. Filtros cruzados (área × tempo de casa) só se cada célula tiver o mínimo; senão, desabilitados com explicação.
7. Taxa de resposta por recorte só quando o recorte tem o mínimo de **convidados**.
8. Logs da aplicação não registram o corpo da resposta nem o usuário na rota de resposta (o middleware de log tem a rota na lista de exclusão).

### Resultado (RH; gestor só a própria área se a pesquisa permitir e houver o mínimo)

- Resumo: respostas/convidados e taxa, **eNPS** (`enps`: % promotores − % detratores, com as três barras) e o histórico das rodadas, nota média por dimensão (barras) e por pergunta.
- **Mapa de calor**: dimensões × recortes (só os que passaram do mínimo), cores por faixa de nota.
- Comentários (com as regras acima).
- Exportar PDF/CSV **do agregado**.
- Plano de ação: o RH cria ações a partir de uma dimensão ("Comunicação: reunião mensal com a diretoria"), com dono e prazo (são `DevelopmentAction` da empresa).

## Testes obrigatórios

- Ciclo: lançar gera auto + gestor por pessoa do público; enviar fora da fase 409; nota ponderada; avaliado não vê nada antes de liberar; depois de liberar vê pares sem nome.
- 9-box na calibração grava o quadrante certo.
- 1:1: liderado não recebe `privateNotes`.
- Metas: check-in atualiza progresso e situação.
- Clima: 4 respostas → `overall: null`; 5 → aparece; responder duas vezes 409; resultado sem nenhum campo de pessoa (`userId`, `employeeId`, e-mail); recorte com 2 respostas não aparece; schema de `SurveyResponse` sem coluna de pessoa/horário.
