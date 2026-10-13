# Interações e estados

Parte do escopo, não acabamento.

## Otimismo e desfazer

| Ação | Comportamento |
|---|---|
| status, prioridade, fila, responsável, etiquetas no chamado | muda na hora; API em segundo plano; erro volta o valor com toast explicando (ex.: 400 do responsável que não é da fila) |
| enviar resposta pública | a mensagem aparece na hora com "Enviando…"; ao confirmar, "Enviada"; falha de entrega depois aparece na mensagem com **Reenviar**; toast com **Desfazer** por 8 s (o e-mail só sai depois do prazo) |
| adicionar nota | aparece na hora; erro mantém o texto no editor |
| ações em massa | aplica nas linhas visíveis; resumo "12 atualizados, 1 falhou (ver)" |
| mesclar | confirmação mostrando os dois chamados e o que acontece com cada um; sem desfazer |
| marcar spam | some da lista com **Desfazer** |
| atribuir a mim | otimista; se outro atendente pegou no mesmo instante, volta e avisa "Bia já assumiu este chamado" |
| publicar artigo | botão com loading; "Publicado · Ver no portal" |

Toda mutação invalida a lista, os contadores das visões, o contador do trilho e os widgets do Início.

## Atalhos (caixa de entrada e chamado, fora de campos de texto)

`J`/`K` próximo/anterior · `Enter` abre · `X` seleciona · `R` responder · `N` nota interna · `A` atribuir a mim · `S` status · `P` prioridade · `M` macros · `Ctrl+Enter` envia · `Esc` fecha · `G` depois `I` caixa de entrada · `?` atalhos.

## Colisão

- Presença a cada 10 s enquanto o chamado está aberto; avatar de quem está vendo no cabeçalho; "Bia está respondendo…" quando ela digita.
- Antes de enviar, se chegou mensagem nova (do cliente ou de outro atendente) depois que o rascunho começou: diálogo "Chegou uma mensagem nova. Ver antes de enviar?" com **Ver** e **Enviar mesmo assim**.

## Estados

### Carregando (skeleton com o formato real)
Lista (10 linhas com selo de status e SLA), chamado (cabeçalho, 3 mensagens, painel de propriedades), contatos, artigos (cartões), relatórios (cartões e retângulos), portal (busca + categorias + 5 linhas), chamado do cliente (cabeçalho + 2 mensagens).

### Vazio, sempre com a próxima ação
| Onde | Mensagem | Ação |
|---|---|---|
| caixa de entrada sem chamados (empresa nova) | "Nenhum chamado ainda. Divulgue sua central ou conecte o e-mail do suporte." | **Copiar link da central** · **Conectar e-mail** |
| visão sem resultados | "Nada aqui. 🎉" (Meus abertos) / "Nenhum chamado nesta visão" | limpar filtros |
| busca sem resultados | "Nenhum chamado para “boleto”" | buscar nos fechados |
| base de conhecimento | "Escreva respostas para as dúvidas mais comuns" | **+ Artigo** (e publicar o exemplo) |
| contatos | "Os contatos aparecem quando alguém abre um chamado" | — |
| relatórios | "Os números aparecem com os primeiros chamados" | — |
| portal sem artigos publicados | só a busca e **Abrir chamado** (sem seção de categorias vazia) | — |
| portal: busca sem resultado | "Não encontramos nada sobre “x”." | **Abrir chamado** (assunto preenchido com o termo) |

### Erro
- Bloco com mensagem e **Tentar de novo**; a caixa de entrada continua navegável.
- Chamado não encontrado/sem acesso → `not-found` com a casca.
- Não é atendente → o app não aparece; link direto mostra "Você não é atendente do Suporte. Peça a um administrador." (403 `NOT_AN_AGENT`).
- Sem permissão → ações ocultas ou desabilitadas com tooltip ("Só owner e admin mudam as filas").
- Feature fora do plano → selo Pro e `UpgradeDialog`; limite (atendentes, caixas) → aviso antes e `UpgradeDialog`; chamados acima do limite mensal com faixa "Acima do plano — faça upgrade para ver".
- Caixa de e-mail com problema → faixa no topo para owner/admin com **Corrigir**.

### Botões com loading (mantendo a largura)
Enviar resposta · Adicionar nota · Aplicar em massa · Mesclar · Salvar artigo/Publicar · Testar conexão · Salvar SLA · Exportar · (portal) Enviar chamado · Enviar resposta · Enviar avaliação · Enviar link.

## Detalhes que fazem diferença
- Horários relativos ("há 5 min") com o absoluto no tooltip; prazos do SLA em linguagem natural ("vence em 1 h 20 min úteis", `formatDuration`).
- Status e prioridade com cor **e** texto; Urgente com ícone.
- Título da aba: "(3) Suporte · {Produto}" com os meus abertos; no chamado, "#1024 Boleto · Suporte".
- Mensagem do cliente com o fuso e a data por extenso no tooltip.
- Portal e chamado do cliente pensados primeiro para o celular: alvos de 44 px, uma coluna.
- Acessibilidade: lista com `role="grid"`/linhas navegáveis por teclado, mensagens com rótulo do autor e da data, editor com `aria-label`, selos com texto (não só cor).
