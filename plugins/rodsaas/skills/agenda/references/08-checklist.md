# Checklist final

Confira **usando o app** (API e front rodando), com um owner, um MEMBER que atende, uma segunda empresa e uma aba anônima para a página pública. Use o Mailpit para os e-mails.

## Base e integração
- [ ] typecheck, lint, build e todos os testes (base + presets + agenda, com os do `agenda-lib` portados) verdes
- [ ] `btree_gist` criada pela migration; restrição `EXCLUDE` no lugar (tente inserir dois compromissos sobrepostos à mão no banco: precisa falhar)
- [ ] `rodsaas.json` com `agenda` em `presets` e o app em `apps`
- [ ] app Agenda no trilho, menu do app, contador de pendentes, widgets no Início, busca no Ctrl+K
- [ ] empresa nova nasce com página, agenda padrão do owner e o tipo de exemplo inativo

## Disponibilidade e tipos
- [ ] semana com dois intervalos no dia, copiar para dias úteis, fuso; exceção de folga e de horário especial; feriado nacional bloqueado e liberado por exceção; facultativo só quando ligado
- [ ] tipo com várias durações, preço, cada tipo de local, intervalos, antecedência, janela, máximo por dia, perguntas, aprovação, turma, política, lembretes
- [ ] quem atende: uma pessoa, qualquer um (rodízio equilibrado), todos juntos (só horários comuns), cliente escolhe

## Página pública
- [ ] passo a passo completo no celular e no computador; fuso do cliente (troque o fuso do navegador); URL com o estado
- [ ] reserva de 5 min (dois navegadores no mesmo horário: o segundo não consegue); horário pego enquanto preenchia volta para a escolha sem perder os dados
- [ ] confirmação com Google Agenda e `.ics` (importe num calendário real); pedido pendente sem link de vídeo
- [ ] gerenciar pelo link: remarcar (o `.ics` novo atualiza o evento no calendário), cancelar, fora da política bloqueado
- [ ] página indisponível (tipo inativo, limite do plano) e sem horários
- [ ] iframe com altura automática e botão flutuante num HTML de teste

## App interno
- [ ] agenda dia/semana/mês, colunas por profissional, arrastar para outro horário e outra pessoa, redimensionar, encaixe, bloqueio, feriado e fora da disponibilidade visíveis
- [ ] painel: aprovar, recusar, remarcar, cancelar com aviso, compareceu/faltou, anotações, histórico, turma com presença individual
- [ ] lista com abas e ações rápidas; clientes com histórico e faltas; relatórios conferidos com poucos dados
- [ ] MEMBER só vê/edita o que deve; owner/admin mexem em todas as agendas

## Avisos e integrações
- [ ] e-mails de confirmação, pendente, aprovado, recusado, lembretes (rode os jobs com o relógio adiantado), remarcado, cancelado, pós-atendimento; equipe recebe novo/pendente/cancelado e o resumo do dia
- [ ] feed `.ics` assinado num calendário real; regenerar invalida o antigo
- [ ] com credenciais: conectar Google e Outlook, ocupados somem da página, evento criado (com Meet), remarcar/cancelar atualizam; sem credenciais, a tela explica
- [ ] com o CRM: contato ligado, atividade "Reunião", botão de enviar link no negócio
- [ ] webhooks com assinatura e novas tentativas

## Operação (núcleo novo)
- [ ] recurso: dois profissionais e uma sala → o segundo no mesmo horário não consegue; segunda sala libera; restrição `EXCLUDE` do recurso testada à mão no banco
- [ ] combo: corte + barba soma duração e preço na página e na agenda
- [ ] bloqueio some da página; encaixe no passado lança o atendimento que já aconteceu
- [ ] série semanal com um conflito (pula e lista); cancelar "esta e as próximas"
- [ ] lista de espera: cancelar oferece ao primeiro, aceitar agenda, oferta vencida passa ao próximo
- [ ] sinal: aguarda pagamento segurando o horário, pago confirma (Financeiro em modo de teste), vencido libera; faltou N vezes → sinal; devolução pela antecedência
- [ ] confirmação pelo link do lembrete; selo na agenda; mensagens de WhatsApp abrindo o app com o texto e o link certos
- [ ] recepção do dia: colunas por profissional, chegou, atrasado, concluir com serviço + produto + forma de pagamento
- [ ] ficha do cliente com o resumo, fidelidade, clube, convênio e anotações

## Perfis e balcão
- [ ] trocar o perfil (barbearia → odonto) muda as palavras nas telas, nos e-mails e na página; nada some
- [ ] comissões: regra mais específica, extrato por pessoa, fechar o período trava e gera as contas a pagar
- [ ] clube: assinante agenda e sai por R$ 0; esgotou cobra; em atraso não cobre; recorrência no Financeiro
- [ ] fidelidade: a 10ª libera o prêmio, resgatar zera o serviço sem comissão
- [ ] fila do dia: posição e previsão, chamar vira atendimento, tela de TV
- [ ] clínica: convênio aceito/recusado e preço do convênio, anamnese na primeira vez, termo pelo Comercial, retorno sugerido na lista com o link
- [ ] produto vendido na conclusão baixa o estoque do ERP (se instalado)

## Segurança
- [ ] 20 agendamentos simultâneos no mesmo horário → 1 criado; coletiva com uma pessoa ocupada → nenhum; turma respeita as vagas
- [ ] outra empresa não vê nada; página pública não expõe dados da equipe nem de outros clientes; token de um agendamento não abre outro
- [ ] tokens e credenciais só como hash/criptografados no banco

## Estados e acabamento
- [ ] cada linha das tabelas de `07-interacoes-e-estados.md` conferida
- [ ] claro/escuro, 360 px, teclado
- [ ] `/rodsaas:verify` verde, incluindo a parte da Agenda (`-g "Agenda"` roda só ela)
- [ ] README do projeto atualizado (o que a Agenda faz, tabelas públicas sem RLS, variáveis do Google/Outlook, fora da v1)
- [ ] **conferência final**: tabela item a item de `04-pagina-publica.md`, `05-app-interno.md`, `09-perfis-de-segmento.md` e `10-atendimento-e-comissoes.md` com ✅/❌; nenhum ❌ sem pendência registrada no relatório
