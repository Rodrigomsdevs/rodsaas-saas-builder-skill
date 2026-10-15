# Checklist final

Confira **usando o app** (API e front rodando), com um owner, um MEMBER e uma segunda empresa.

## Base e integração
- [ ] typecheck, lint, build e todos os testes (base + presets + crm) verdes
- [ ] `rodsaas.json` com `crm` em `presets` e `uploads` em `addons`
- [ ] app CRM no trilho (e na grade "Todos os apps"), menu do app sem misturar com outros apps; contador no trilho; com o CRM como único app, menu clássico
- [ ] widgets na home, provedor no Ctrl+K (e-mail, telefone e CNPJ inteiros abrem direto), sino
- [ ] empresa nova nasce com funil "Vendas", motivos e origens; empresas antigas receberam o mesmo na instalação
- [ ] dados de exemplo carregam e apagam sem deixar resto

## Cadastros
- [ ] empresa pelo CNPJ (dados preenchidos; serviço fora não trava; CNPJ alfanumérico aceito à mão)
- [ ] contato com WhatsApp; e-mail/CPF duplicado mostra o aviso com link; telefone repetido só avisa
- [ ] contato em duas empresas, troca de principal
- [ ] excluir e desfazer; excluído não bloqueia cadastro novo com o mesmo e-mail

## Funil e negócios
- [ ] quadro: arrastar entre etapas e na etapa, totais das colunas e do funil corretos, áreas Ganho/Perdido/Excluir, teclado, "Mover para…" no celular
- [ ] selo da próxima atividade (atrasada, hoje, futura, sem) e "parado há X dias"
- [ ] negócio: barra de etapas, ganhar (comemoração + desfazer), perder com motivo obrigatório, reabrir
- [ ] **+ Negócio** com pessoa e empresa (busca e "Criar «texto»"); pessoa com empresa principal preenche a empresa
- [ ] página do negócio com as quatro partes do `04-telas.md`: cabeçalho (valor, responsável, ganhar/perder) · barra de etapas · coluna de detalhes (**Resumo, Pessoa com Ligar/WhatsApp, Empresa, Produtos, campos, lead de origem**) · compositor, planejado e histórico
- [ ] vincular, trocar e remover pessoa e empresa no negócio; o card do quadro mostra empresa ou pessoa
- [ ] contato e empresa com a aba Negócios e "+ Negócio" já preenchido
- [ ] produtos no negócio: soma vira o valor, desconto, voltar para manual (Pro)
- [ ] lista com filtros, colunas, massa com desfazer; filtros na URL
- [ ] vários funis (Pro), excluir etapa/funil com destino, não deixa ficar sem funil/etapa

## Leads e atividades
- [ ] lead manual, aviso de contato existente, converter reaproveitando contato/empresa, descartar e restaurar
- [ ] atividade criada no negócio aparece na agenda (Hoje), concluir com desfazer, sugestão da próxima
- [ ] calendário: arrastar reagenda; buckets corretos no fuso da empresa
- [ ] WhatsApp e ligar oferecem registrar a atividade ao voltar
- [ ] anotação com menção → mencionado recebe no sino e por e-mail (Mailpit em dev); fixar no topo

## Captura, importação, exportação
- [ ] chave de API: `curl` cria lead (sem Origin), chave revogada para na hora, rodízio distribui
- [ ] formulário do site: snippet funciona de um arquivo HTML servido numa origem autorizada; origem estranha recusada; isca descarta
- [ ] importar CSV do Excel brasileiro (Windows-1252, `;`) e `.xlsx`; prévia com duplicados e erros; resultado; desfazer
- [ ] exportar abre certo no Excel (acentos, colunas, valores)

## Visibilidade e permissões
- [ ] modo "cada vendedor vê os seus": MEMBER não vê negócio de outro em lugar nenhum (quadro, totais, busca, relatórios, link direto → 404); passa a ver ao receber uma atividade nele
- [ ] MEMBER não acessa configurações, importação, exportação
- [ ] segunda empresa não enxerga nada da primeira

## Relatórios (Pro)
- [ ] funil de conversão, ganhos × perdidos, previsão, vendedores, motivos, tempo por etapa batem com os dados de exemplo
- [ ] no Free: `PlanGate` em vez de quebrar

## Vendas avançadas (`08`)
- [ ] meta do mês por vendedor e da equipe com o ritmo (atrás/no ritmo/à frente) e o widget no Início; ganho reaberto sai da conta
- [ ] automação de etapa cria a atividade com prazo e dono; condição barra; desligada não roda; histórico de execuções com falhas explicadas; laço para em 3
- [ ] sequência: inscrever, concluir o passo cria o próximo (dias úteis), último encerra, ganho/perda/resposta do cliente param e tiram a pendente
- [ ] mesclar dois contatos (e duas empresas): negócios, atividades, anotações, anexos e leads vão para o destino; origem some com o aviso; grupos de duplicados
- [ ] e-mail pelo CRM com modelo: variáveis preenchidas, dado faltando avisado antes de mandar, resposta vai para o vendedor, atividade registrada
- [ ] pontuação de lead: regras, temperatura na caixa, ordenação, aviso de lead quente
- [ ] WhatsApp: mensagem pronta da etapa; pelo motor quando conectado (janela de 24 h respeitada), senão o link; atividade nos dois

## Perfis (`09`)
- [ ] escolher cada perfil monta funil, campos, mensagens, sequência e automações (desligadas) uma vez só; trocar não apaga nada
- [ ] telas, vazios e e-mails com as palavras do perfil
- [ ] imobiliária: cadastro de imóveis, perfil de busca e imóveis compatíveis no negócio
- [ ] B2B/escola com o Comercial e varejo com o ERP ligados quando instalados (ou pendência explicada)

## Estados e acabamento
- [ ] cada linha das tabelas de estados de `05-interacoes-e-estados.md` conferida
- [ ] atalhos e folha de atalhos (`?`)
- [ ] claro/escuro, 360 px de largura, navegação por teclado
- [ ] `/rodsaas:verify` verde, incluindo a parte do CRM (`-g "CRM"` roda só ela)
- [ ] README do projeto atualizado (o que o CRM faz, decisões de visibilidade e da tabela sem RLS da captura, fora da v1)
- [ ] **conferência final**: tabela item a item de `04-telas.md` (cada tela e cada marcador) com ✅/❌; nenhum ❌ sem pendência registrada no relatório
