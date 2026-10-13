# Checklist final

Confira **usando o app** (API e front rodando), com um owner, um MEMBER e uma segunda empresa.

## Base e integração
- [ ] typecheck, lint, build e todos os testes (base + presets + crm) verdes
- [ ] `rodsaas.json` com `crm` em `presets` e `uploads` em `addons`
- [ ] seção "Vendas" no menu sem quebrar o resto (inclusive com `tarefas`/`notion` instalados); contadores de leads e atividades
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

## Estados e acabamento
- [ ] cada linha das tabelas de estados de `05-interacoes-e-estados.md` conferida
- [ ] atalhos e folha de atalhos (`?`)
- [ ] claro/escuro, 360 px de largura, navegação por teclado
- [ ] `/rodsaas:verify` verde, incluindo a parte do CRM (`-g "CRM"` roda só ela)
- [ ] README do projeto atualizado (o que o CRM faz, decisões de visibilidade e da tabela sem RLS da captura, fora da v1)
