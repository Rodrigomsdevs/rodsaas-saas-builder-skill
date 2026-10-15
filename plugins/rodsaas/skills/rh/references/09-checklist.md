# 09 · Checklist final

Confira **usando o app** (API e front rodando), com: o owner (`RH_ADMIN`), uma pessoa `RH`, uma `FINANCE`, um gestor com 2 liderados, um colaborador comum, um colaborador sem login, uma segunda empresa e uma aba anônima para a pré-admissão. Use o Mailpit para os e-mails. Cada item ✅ com o arquivo/tela onde está; o que faltar vira pendência no relatório.

## Base e integração
- [ ] typecheck, lint, build e todos os testes (base + presets + rh, com os do `rh-lib` portados) verdes
- [ ] `rodsaas.json` com `rh` em `presets` e o app `pessoas` em `apps`; `RH_ENCRYPTION_KEY` no `.env.example` com instrução
- [ ] app Pessoas no trilho para todo colaborador com login; menu por papel; contador de aprovações; widgets no Início; busca no Ctrl+K (pessoas, pedidos)
- [ ] ativação do app cria configurações, fluxos padrão, categorias, modelos e a ficha do owner (uma vez só)
- [ ] avisos registrados no catálogo de notificações e disparados nos eventos da tabela (nenhum com salário, CID ou nota)
- [ ] planos (`rhEmployees` e features `rh_*`) ou Suíte RH na workstation (contagem por colaborador, `CONFIRM_REQUIRED`, só leitura quando bloqueado)

## Colaboradores, organograma e LGPD
- [ ] criar com CPF válido; inválido e repetido barrados; mesmo CPF em outra empresa ok
- [ ] gestor sem ciclo (serviço e trigger); desligar com liderados exige novo gestor
- [ ] ficha projetada por `visibleGroups`: colega (só público), gestor (sem salário, sem saúde), a pessoa (tudo menos anotações do RH), RH (tudo), `FINANCE` (público + banco); conferido **no JSON da API**, não só na tela
- [ ] leitura de salário e download de documento sensível no registro de acesso; a pessoa vê quem acessou
- [ ] histórico de cargo/área/gestor/salário com vigência e motivo
- [ ] importação CSV com prévia linha a linha e aplicação; exportação só com os campos permitidos
- [ ] autoatendimento: editar contato direto; alteração de endereço/banco vai para aprovação e aplica ao aprovar; baixar meus dados
- [ ] organograma com recolher, busca, "a partir de mim", exportar PNG e versão de celular
- [ ] anonimizar desligado

## Aprovações
- [ ] fluxos padrão; edição de fluxo com condição por valor (Pro/Suíte)
- [ ] quem pede não aprova; sem gestor → RH; etapas repetidas viram uma; `all` exige todos
- [ ] delegação por período (novos e pendentes); lembrete após 2 dias úteis
- [ ] recusa com comentário obrigatório; decisão definitiva; RH decide por cima com motivo
- [ ] snapshot: trocar o gestor depois não muda o pedido em andamento
- [ ] caixa com abas, dados para decidir na linha, aprovar em massa
- [ ] solicitações personalizadas: tipo com campos, pedido, aprovação e resolução com arquivo

## Férias e ausências
- [ ] períodos aquisitivos/concessivos com faltas e situações (rode com datas que gerem disponível, vencendo e vencida)
- [ ] pedido com validação ao vivo e no servidor: 2 dias antes do descanso/feriado, fracionamento (3 trechos, 5 e 14 dias), venda de 1/3, saldo, antecedência (aviso), fora do concessivo (aviso)
- [ ] regime livre para estágio/PJ e "sem férias" para autônomo
- [ ] pendente reserva saldo, recusa/cancelamento devolvem, aprovação desconta; aviso de férias para ciência
- [ ] coletivas com prévia de impacto e lançamento para todos
- [ ] ausências: atestado (sensível: gestor vê "Ausência médica"), licenças com dias legais e Empresa Cidadã, falta pelo RH mudando o direito do período
- [ ] calendário com feriados nacionais e do local, conflito "x de y da equipe fora", visão por papel
- [ ] avisos de férias vencendo e de quem sai na semana (rode os jobs com o relógio adiantado)

## Despesas
- [ ] despesa pelo celular com foto do recibo; km calculado no servidor
- [ ] limite com justificativa, recibo obrigatório, datas, possível duplicada
- [ ] relatório → aprovação (financeiro acima de R$ 1.000) → fila do financeiro → pago com aviso → CSV

## Admissão, documentos e holerites
- [ ] pré-admissão: e-mail com link, página pública no celular, rascunho, documentos com câmera, enviar; conferência com recusa e reenvio; efetivar (ativo, documentos na pasta, checklist, convite); link morto depois
- [ ] checklists de admissão e desligamento com responsáveis e prazos; boas-vindas no Início da pessoa
- [ ] desligamento: data futura, acesso removido no dia, pendentes cancelados, entrevista enviada
- [ ] pasta com validade (vencendo/vencido) e avisos; documentos sensíveis invisíveis ao gestor
- [ ] políticas com ciência (versão, data, IP), painel de quem falta, nova versão pede de novo
- [ ] holerites: lote de vários PDFs e de um PDF único separado por página; prévia casada/sem dono/ambígua/faltando; publicar; cada um vê só os seus; quem abriu/confirmou; substituição por novo lote

## Desempenho, metas, feedback e clima
- [ ] ciclo com fases, pares indicados e aprovados, formulário com rascunho automático, envio na fase, nota ponderada
- [ ] calibração com 9-box e motivo; liberação com pares sem nome; devolutiva e PDI
- [ ] 1:1 com pauta compartilhada, nota privada só do gestor, combinados que seguem
- [ ] feedback privado/público com valores, pedir feedback, mural
- [ ] metas em três níveis com alinhamento, check-in, progresso e situação, fechar período
- [ ] pesquisa anônima: participação e resposta separadas, sem rota de respostas individuais, mínimo por recorte, "outros" contra subtração, comentários sem recorte, eNPS e histórico, mapa de calor, pulso recorrente
- [ ] pesquisa identificada só onde permitido e avisada na tela

## Indicadores e fechamento
- [ ] quadro, admissões/desligamentos, rotatividade, absenteísmo, tempo de casa, férias vencidas, documentos vencendo (RH e gestor da equipe)
- [ ] fechamento do mês com eventos do mês, alterações e reembolsos; CSV abre certo no Excel (acentos, `;`); envio ao contador por e-mail

## Operação avançada (`10`)
- [ ] escala: turnos (inclusive noturno), grade semanal, copiar semana, bloqueios (cruzados, férias/ausência/folga) e avisos (interjornada, semana longa, 7º dia), cobertura, publicar com aviso, minha escala no celular
- [ ] vagas: página pública com formulário, consentimento LGPD, currículo, sem candidatura repetida, quadro por etapa, funil e tempo até contratar, contratado abre a pré-admissão, reprovado recebe e-mail
- [ ] comunicados: público por área/local/pessoas, ciência idempotente, pendentes, cobrar ciência, aviso ao gestor depois do prazo
- [ ] treinamentos: catálogo com validade, regras por cargo/área, registro com certificado, matriz, aviso 30 dias antes
- [ ] celebrações: aniversários (respeita quem esconde) e tempo de casa no Início

## Perfis (`11`)
- [ ] perfil aplicado sem desligar nada, vocabulário trocado
- [ ] indústria: NRs com a norma vigente conferida, catálogo de EPI com CA, entrega com assinatura, ficha de EPI em PDF, trocas
- [ ] saúde: registro no conselho com validade, painel de vencimentos, Agenda não oferece quem está vencido
- [ ] varejo: rodízio com domingo (convenção coletiva conferida), folguista, aplicar na escala

## Telas e qualidade
- [ ] todas as rotas e testids do contrato (`08-telas.md`)
- [ ] Início diferente para colaborador, gestor e RH
- [ ] celular sem rolagem lateral em todas as rotas; tema escuro
- [ ] estados de carregando, vazio, erro e sem permissão em todas as telas
- [ ] RLS: a segunda empresa não vê nada (API e telas)
- [ ] `/rodsaas:verify -g "RH"` verde (e a bateria completa sem regressão)
- [ ] README do projeto: o que o Pessoas faz, papéis, LGPD (o que é sensível e quem vê), como enviar holerites, como ligar o contador, data da conferência das regras da CLT, o que ficou fora da v1
