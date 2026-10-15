# Checklist final

Confira **usando o app** (API e front rodando), com dois usuários de papéis diferentes e uma segunda empresa.

## Base e integração
- [ ] typecheck, lint, build e todos os testes (base + presets + tarefas) verdes
- [ ] `rodsaas.json` com `tarefas` em `presets` e `uploads` em `addons`
- [ ] app Tarefas no trilho e na grade "Todos os apps", menu do app sem misturar com outros apps; contador no trilho
- [ ] widgets na home, provedor no Ctrl+K, cronômetro e sino no topo
- [ ] workspace novo nasce com o projeto "Primeiros passos"

## Projetos e fluxo
- [ ] criar (chave sugerida e checada), editar, trocar chave (link antigo abre), arquivar, excluir
- [ ] fluxo: criar, renomear, reordenar, mudar categoria, excluir com destino; não deixa ficar sem TODO/DONE
- [ ] projeto privado: não membro não vê em lugar nenhum (lista, busca, minhas tarefas, link direto → 404, notificações)

## Tarefas
- [ ] adição rápida com todos os atalhos, chips, desfazer chip, menção ambígua, etiqueta nova
- [ ] todos os campos editáveis no painel e na lista; histórico registra cada mudança
- [ ] descrição com autosave, imagem colada, conflito em duas abas
- [ ] subtarefas (1 nível), checklist (converter em subtarefa), vínculos (bloqueada aparece)
- [ ] mover entre projetos (código novo, link antigo redireciona), duplicar, arquivar, lixeira e restaurar
- [ ] 50 tarefas criadas rápido no mesmo projeto: códigos sem repetir nem pular

## Visões
- [ ] quadro: arrastar entre colunas e na coluna, várias de uma vez, raias, concluídas limitadas, teclado
- [ ] lista: grupos, colunas, edição na linha, seleção e massa com desfazer
- [ ] calendário: arrastar muda prazo, criar no dia, painel sem prazo
- [ ] minhas tarefas: buckets corretos no fuso da empresa
- [ ] filtros e visões salvas na URL; voltar do navegador funciona

## Colaboração e notificações
- [ ] comentar com menção → mencionado recebe no sino e por e-mail (Mailpit em dev); autor não recebe
- [ ] editar/excluir comentário, reações, seguir/deixar de seguir
- [ ] resumo diário e lembrete de prazo (rodar o job manualmente em dev)
- [ ] preferências desligam o que devem
- [ ] nenhum `Notification` gravado direto: tudo pelo `notify()` do add-on, com os tipos `task.*`/`sprint.*` registrados no catálogo

## Anexos e horas
- [ ] anexar por arrastar, clicar e colar; pré-visualizar imagem e PDF; excluir; limite/cota com mensagem certa
- [ ] cronômetro: iniciar, trocar de tarefa (para o anterior), recarregar a página e continuar, parar; >12 h pergunta
- [ ] lançamento manual com "1h30", "90min", "1,5"; editar/excluir; total × estimativa
- [ ] folha da semana editável; relatório e CSV (Pro) abrindo certo no Excel

## Sprints e relatórios (Pro)
- [ ] criar, planejar no backlog com somas, iniciar (só uma), concluir movendo pendentes, resumo
- [ ] burndown e velocidade com dados reais; relatórios do projeto
- [ ] no Free: tudo isso mostra o selo/upgrade em vez de quebrar

## Operação avançada (`07`)
- [ ] recorrência: editor com resumo em português, dia útil com feriados, próxima criada ao concluir (uma vez só), checklist desmarcado, fim por data ou contagem, ocorrências futuras esmaecidas no calendário
- [ ] modelos: criar, salvar tarefa como modelo, aplicar com início e papéis; datas em dias úteis, vínculos, checklist e subtarefas
- [ ] campos personalizados: 9 tipos, até 50, valores validados, filtro `cf.`, colunas e soma na lista, obrigatório cobrado ao concluir
- [ ] Gantt: barras, setas, arrastar/esticar com cascata e desfazer, folga, ciclo recusado, caminho crítico, linha de hoje
- [ ] automações: construtor quando/se/então, liga/desliga, histórico de execuções, erro registrado sem desfazer a ação, profundidade 3
- [ ] carga: capacidade por pessoa, feriados, semanas estouradas, reatribuir arrastando, carga no seletor de responsável
- [ ] convidado: convite por e-mail, portal com a marca, só o visível ao cliente, aprovar/pedir ajustes (com comentário), revogar

## Perfis (`08`)
- [ ] perfil aplicado sem desligar nada, vocabulário trocado, modelos sugeridos
- [ ] contábil: catálogo (com a regra vigente conferida), carteira, gerar mês idempotente, prazo legal × interno, painel com atrasadas, job do dia 1
- [ ] agência: conta com cliente, valores por hora, arredondamento, prévia, faturar no Financeiro uma vez só, lançamento faturado travado
- [ ] obras: item com foto obrigatória (câmera no celular), checklist exigido para concluir, modelos do perfil

## Estados e acabamento
- [ ] cada linha das tabelas de estados de `05-interacoes-e-estados.md` conferida
- [ ] atalhos de teclado e folha de atalhos (`?`)
- [ ] claro/escuro, 360 px de largura, navegação por teclado
- [ ] README do projeto atualizado (o que o módulo faz, decisões, fora da v1)
- [ ] **conferência final**: tabela item a item de `04-telas.md` com ✅/❌; nenhum ❌ sem pendência registrada no relatório
