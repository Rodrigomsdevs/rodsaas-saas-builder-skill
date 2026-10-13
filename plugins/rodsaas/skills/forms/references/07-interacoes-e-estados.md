# Interações e estados

Parte do escopo, não acabamento.

## Construtor

| Ação | Comportamento |
|---|---|
| editar texto, opções, propriedades | aplica na prévia na hora; salvamento automático com espera de 800 ms e indicador "Salvando… / Salvo" |
| adicionar pergunta | entra depois da selecionada (ou no fim), já selecionada, com o texto em foco |
| duplicar | cópia logo abaixo com ids novos (`newId`), condições mantidas |
| excluir pergunta | some na hora + toast "Pergunta excluída" com **Desfazer**; se outras condições dependiam dela, o toast avisa ("2 condições ficaram inválidas") |
| arrastar pergunta | reordena com animação; soltar antes de uma pergunta que ela usa na condição deixa a condição inválida (vermelho) e explica |
| desfazer/refazer | `Ctrl+Z` / `Ctrl+Shift+Z` (fora de campos de texto, onde vale o desfazer do navegador) |
| publicar | botão com loading; problemas listados com link para a pergunta |
| sair com salvamento pendente | espera o salvamento ou avisa (`beforeunload`) |

Atalhos (fora de campos de texto): `/` ou `A` adiciona pergunta · `D` duplica · `Delete` exclui (com desfazer) · `↑/↓` seleciona a anterior/próxima · `Alt+↑/↓` move · `Ctrl+Enter` publica · `?` mostra os atalhos.

## Respostas e resumo

| Ação | Comportamento |
|---|---|
| abrir resposta | marca como lida (otimista); contadores do menu e do trilho atualizam |
| estrela, lida/não lida | otimista; erro desfaz + toast |
| excluir (uma ou em massa) | confirmação → toast com **Desfazer** |
| exportar | botão "Gerando…" → download; erro com tentar de novo |
| novas respostas chegando | a tabela recarrega ao focar a janela e a cada 30 s; aviso "3 novas respostas · Mostrar" no topo em vez de pular a lista |

## Estados

### Carregando (skeleton com o formato real)
Lista de formulários (cartões), construtor (três colunas com blocos cinza), tabela de respostas (cabeçalho + 8 linhas), detalhe (pares pergunta/resposta), resumo (cartões e barras), formulário público (título + 3 perguntas).

### Vazio, sempre com a próxima ação
| Onde | Mensagem | Ação |
|---|---|---|
| nenhum formulário | "Crie formulários, pesquisas e inscrições em minutos" | **+ Formulário** e 3 modelos em destaque |
| filtro sem resultado | "Nenhum formulário com esses filtros" | **Limpar filtros** |
| formulário sem perguntas | "Comece adicionando uma pergunta" | **+ Adicionar pergunta** (paleta aberta) |
| sem respostas (publicado) | "Ainda sem respostas. Compartilhe o link para começar a receber." | **Copiar link** · **Compartilhar** |
| sem respostas (rascunho) | "Publique o formulário para receber respostas" | **Publicar** |
| resumo sem dados | "O resumo aparece com as primeiras respostas" | — |
| respostas recentes (menu) | "Nenhuma resposta nova" | — |
| webhooks | "Envie cada resposta para outro sistema (Zapier, Make, n8n, seu backend)" | **Adicionar webhook** |

### Erro
- Bloco com mensagem do `ApiError` e **Tentar de novo**, sem derrubar a tela.
- Formulário não encontrado ou sem acesso → `not-found` com a casca.
- Sem permissão para editar → construtor em modo leitura com aviso "Peça para {dono} adicionar você como editor".
- Feature fora do plano → selo Pro e `UpgradeDialog` (lógica, arquivo, tema próprio, integrações).
- Limite de publicados → **Publicar** avisa antes e abre o `UpgradeDialog`.
- Conflito de rascunho → diálogo com as duas opções.

### Botões com loading (mantendo a largura)
Criar formulário · Publicar / Publicar alterações · Descartar alterações · Encerrar / Reabrir · Salvar configurações · Duplicar · Exportar · Adicionar/Testar webhook · Salvar CRM · Apagar dados do titular · Enviar (público).

## Detalhes que fazem diferença
- Status sempre com cor e texto (nunca só cor): Rascunho (neutro), Publicado (sucesso), Publicado com alterações (aviso), Encerrado (destrutivo).
- Copiar link mostra "Link copiado" no próprio botão por 2 s.
- Título da aba: "Orçamento · Respostas · {Produto}"; com não lidas, "(3) Orçamento…".
- Celular: lista em cartões; construtor com abas; tabela de respostas vira lista de cartões (data + 2 primeiras respostas); formulário público pensado primeiro para o celular (alvos de toque de 44 px, teclado certo por tipo).
- O formulário público carrega rápido: sem os pacotes do app logado (bundle separado), fontes do tema com `display=swap`.
