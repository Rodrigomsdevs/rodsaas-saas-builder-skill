# Checklist final

Confira **usando o app** (API e front rodando), com um owner, um MEMBER, uma segunda empresa e uma aba anônima para o formulário público.

## Base e integração
- [ ] typecheck, lint, build e todos os testes (base + presets + forms, incluindo os do `forms-lib` portados) verdes
- [ ] `rodsaas.json` com `forms` em `presets`, o app em `apps` e `uploads` em `addons`
- [ ] app Forms no trilho e na grade "Todos os apps", menu do app, contador de não lidas, widgets no Início, busca no Ctrl+K
- [ ] os 8 modelos aparecem e criam formulários válidos

## Construtor
- [ ] adicionar cada um dos 20 tipos, editar na prévia e nas propriedades, duplicar, excluir com desfazer, arrastar, atalhos
- [ ] opções: colar várias linhas, "Outro", aleatória, mínimo/máximo
- [ ] condição em pergunta e em página; condição inválida bloqueia a publicação com o motivo
- [ ] salvamento automático, indicador, conflito em duas abas, desfazer/refazer
- [ ] publicar, publicar alterações (o link só muda depois), descartar alterações, encerrar e reabrir
- [ ] configurações: layout, tema (cor, capa, logo), boas-vindas, agradecimento com redirecionamento, limites, acesso, avisos, resposta automática, retenção, colaboradores
- [ ] compartilhar: copiar link, slug editável, montador de link com ocultos, iframe com altura automática num HTML de teste, QR code

## Formulário público
- [ ] clássico com várias páginas e progresso; uma por vez com Enter, letras e voltar
- [ ] lógica ao vivo (modelo Orçamento: "Empresa" mostra CNPJ)
- [ ] máscaras e validação BR (telefone, CPF, CNPJ alfanumérico, CEP com busca, R$), datas com mínimo, arquivo com progresso
- [ ] erros no campo certo vindos do front e da API; rascunho local ao recarregar
- [ ] agradecimento; encerrado; limite; só membros (deslogado e de outra empresa); já respondeu
- [ ] leitor de tela/teclado: labels, `aria-invalid`, foco no primeiro erro
- [ ] 20 envios simultâneos com `maxResponses: 5` → exatamente 5 gravados

## Respostas e integrações
- [ ] tabela com colunas por pergunta, filtros na URL, lidas/estrela, detalhe com anterior/próxima, excluir com desfazer
- [ ] resposta de versão antiga mostra as perguntas daquela versão; exportação traz a coluna removida
- [ ] resumo e NPS conferidos à mão com poucas respostas; funil por página
- [ ] CSV e Excel abrindo certo no Excel pt-BR
- [ ] e-mail de resposta nova (Mailpit), resumo diário (rodar o job), resposta automática com cópia
- [ ] webhook recebendo num servidor de teste, assinatura conferida, falha → novas tentativas e histórico; URL interna recusada
- [ ] com o CRM: resposta vira lead com mapeamento, origem e responsável; sem o CRM a aba não aparece

## Segurança e LGPD
- [ ] membro sem ser dono/colaborador não vê respostas em lugar nenhum (lista, resumo, busca, notificações, link direto → não encontrado)
- [ ] outra empresa não vê nada; rota pública não devolve nada além do formulário publicado
- [ ] isca e envio rápido não gravam; rate limit por IP
- [ ] exclusão por e-mail do titular; retenção apagando respostas antigas (job)

## Estados e acabamento
- [ ] cada linha das tabelas de `07-interacoes-e-estados.md` conferida
- [ ] claro/escuro, 360 px, teclado
- [ ] `/rodsaas:verify` verde, incluindo a parte do Forms (`-g "Forms"` roda só ela)
- [ ] README do projeto atualizado (o que o Forms faz, tabela pública sem RLS, fora da v1)
- [ ] **conferência final**: tabela item a item de `04-construtor.md`, `05-formulario-publico.md` e `06-respostas-e-integracoes.md` com ✅/❌; nenhum ❌ sem pendência registrada no relatório

## Operação avançada (`09`)
- [ ] parcial: salvar com token, retomar, sem dado pessoal antes do consentimento, vence em 30 dias, envio fecha; desistências por pergunta
- [ ] cálculo: fórmula segura validada, valores das perguntas (pontos das opções), escondida = 0, ao vivo no público e gravado pelo servidor
- [ ] quiz: gabarito, pontos, múltipla inteira certa, aprovação e resultado por faixa
- [ ] pagamento: valor fixo ou do cálculo, resposta aguardando, cobrança no Financeiro, pago pelo webhook libera avisos e integrações; sem Financeiro não publica
- [ ] assinatura: quadro, limpar, nome, PNG até 150 KB, arquivo com hash
- [ ] agendar no fim: horários da Agenda, contato da resposta, ocupado 409, já agendado 409
- [ ] chamado: resposta abre chamado no Suporte com assunto e texto

## Perfis (`10`)
- [ ] perfil aplicado sem desligar nada; modelos sugeridos
- [ ] NPS por mês no fuso, CSAT, retorno ao detrator (chamado ou tarefa)
- [ ] vagas por formulário e por opção, lista de espera, cancelar promove, ingresso com QR por e-mail, check-in único, lista de presença
- [ ] respostas sensíveis cifradas e mascaradas, papel "vê dados de saúde", alertas da ficha, validade com aviso na Agenda
