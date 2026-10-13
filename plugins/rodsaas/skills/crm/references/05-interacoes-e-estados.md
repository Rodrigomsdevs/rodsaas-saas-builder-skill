# Interações e estados

Esta parte é escopo, não acabamento. Cada item tem que estar funcionando para a fase 8 terminar.

## Arrastar e soltar

- dnd-kit (ou o equivalente atual), com **sensor de teclado** e anúncios para leitor de tela ("Negócio Acme movido para Negociação, posição 2").
- Quadro: entre etapas (muda a etapa) e dentro (ordem). Áreas de rodapé ao arrastar: **Ganho** (ganha na hora, toast com Desfazer), **Perdido** (abre o diálogo do motivo; cancelar devolve o card), **Excluir** (confirmação).
- Calendário de atividades: arrastar reagenda (dia e hora).
- Etapas e funis nas configurações; itens de produto no negócio.
- **Otimista**: move na hora, totais das duas colunas atualizam na hora (subtrai de uma, soma na outra); erro → volta e toast "Não foi possível mover Acme. Desfeito.".
- Sem arrastar: menu "Mover para…" no card e na barra de etapas do negócio; essencial no celular.

## Otimismo e desfazer

| Ação | Comportamento |
|---|---|
| mudar etapa (quadro ou barra de etapas) | otimista; erro desfaz + toast |
| ganhar | otimista; animação curta de comemoração (respeitando `prefers-reduced-motion`); toast "Negócio ganho! R$ 12.000,00" + **Desfazer** (reabre) e sugestão "Agendar próxima atividade?" para pós-venda |
| perder | diálogo → otimista; toast + **Desfazer** |
| concluir atividade (agenda, card, negócio) | otimista, risca e some da aba de pendentes após 1 s; toast "Ligação concluída" + **Desfazer**; em seguida pergunta "Agendar a próxima?" (abre o compositor já no negócio) quando o negócio ficou sem pendente |
| atribuir, etiquetar, mudar previsão, editar campo no lugar | otimista; erro desfaz |
| anotação | aparece na hora com estado "enviando"; erro → "Tentar de novo" e o texto não se perde |
| excluir negócio/lead/contato/empresa/atividade | confirmação → toast "Excluído" + **Desfazer** (restaura) |
| converter lead | botão com loading; sucesso navega para o negócio |
| ações em massa | "Aplicando a 12 negócios…" → toast + **Desfazer** por 8 s |

Toda mutação invalida as consultas afetadas (negócio, quadro e totais, listas, agenda, contadores do menu, widgets da home) sem recarregar a página.

## Ligar e WhatsApp com registro

- **WhatsApp**: abre `https://wa.me/<telefone com DDI>?text=<modelo>` (`crm-lib whatsappLink`, modelo das configurações com `{primeiro_nome}`, `{nome}`, `{empresa}`, `{vendedor}`) em nova aba. Ao voltar para a aba do CRM (evento `visibilitychange`), aparece o toast "Registrar conversa no WhatsApp com Ana?" com **Registrar** (cria atividade WHATSAPP concluída no negócio/contato, com campo de anotação opcional) e **Agora não**.
- **Ligar**: `tel:` (abre o discador no celular ou o app no computador); mesmo toast "Como foi a ligação?" com opções rápidas **Atendeu** / **Não atendeu** / **Deixei recado** que registram a atividade CALL concluída com essa anotação.
- **E-mail**: `mailto:` + registro opcional (atividade EMAIL concluída).
- Telefone sem DDD ou inválido: botões desabilitados com tooltip "Telefone incompleto".

## Atalhos de teclado

Ativos quando o foco **não** está num campo de texto. `?` abre a folha de atalhos.

| Tecla | Ação |
|---|---|
| `N` | novo negócio (no funil atual) |
| `A` | nova atividade (no negócio aberto) |
| `O` | nova anotação (no negócio aberto) |
| `G` | ganhar · `P` perder (no negócio aberto) |
| `Ctrl+K` | busca global (e-mail, telefone, CNPJ inteiros abrem direto) |
| `/` | focar a busca da tela |
| `J` / `K` | próximo / anterior na lista |
| `Enter` | abrir |
| `Esc` | fechar painel / limpar seleção |
| `Ctrl+Enter` | salvar anotação ou atividade |

## Atualização sem tempo real

- Quadro, listas, agenda e negócio aberto recarregam **ao focar a janela** e a cada **30 s** (só com a aba visível), mantendo rolagem, seleção e o que está sendo digitado.
- Contadores do menu (leads novos, atividades atrasadas) a cada 60 s e ao focar.
- Se o negócio aberto mudou por outra pessoa, os campos atualizam; campo em edição não é sobrescrito (aviso "Ana alterou este campo" com opção de recarregar).

## Estados por tela

### Carregando (primeira vez): skeleton com o formato real
| Onde | Skeleton |
|---|---|
| Quadro | cabeçalho com totais em cinza + colunas com 3 cards cada |
| Lista / contatos / empresas / leads | cabeçalho + 8 linhas com as colunas |
| Negócio | cabeçalho, barra de etapas, coluna de detalhes com 6 linhas, 3 itens de histórico |
| Contato / empresa | cabeçalho + detalhes + abas |
| Agenda | abas com contadores em cinza + 6 linhas |
| Calendário | grade da semana com 3 blocos |
| Relatórios | cartões + retângulos dos gráficos |
| Widgets da home | o formato de cada widget |

Recarregando (troca de filtro, funil, aba ou página): mantém o conteúdo anterior com indicador fino no topo; nunca volta para o skeleton.

### Vazio: sempre com a próxima ação
| Onde | Mensagem | Ação |
|---|---|---|
| Funil sem negócios (primeira vez) | "Organize suas vendas em etapas" | **+ Negócio** · **Importar contatos** · **Carregar dados de exemplo** (owner/admin) |
| Coluna vazia | "Solte aqui" ao arrastar; senão só o "+ Adicionar" | — |
| Filtro sem resultado | "Nenhum negócio com esses filtros" | **Limpar filtros** |
| Leads (Meus) | "Nenhum lead novo. Conecte o formulário do seu site para receber leads aqui." | **Configurar captura** (owner/admin) · **+ Lead** |
| Leads descartados / convertidos | "Nada por aqui" | — |
| Contatos | "Sua agenda de clientes começa aqui" | **+ Contato** · **Importar** |
| Empresas | "Cadastre empresas pelo CNPJ e os dados vêm sozinhos" | **+ Empresa** |
| Agenda · Atrasadas | "Nada atrasado. Ótimo trabalho!" | — |
| Agenda · Hoje | "Nenhuma atividade para hoje" | **Ver negócios sem atividade** (filtro) |
| Negócio sem atividade pendente | aviso discreto "Nenhuma próxima atividade. Negócios sem próximo passo esfriam." | **Agendar** |
| Histórico | "Registre a primeira anotação ou atividade" | foco no compositor |
| Produtos | "Cadastre produtos e serviços para montar propostas mais rápido" | **+ Produto** |
| Relatórios sem dados | "Os gráficos aparecem quando houver negócios no período" | mudar período |
| Busca | "Nada encontrado para 'xyz'" | criar contato/empresa com esse nome |

### Erro
- **Bloco** (coluna, lista, painel, histórico, gráfico): mensagem do `ApiError` + **Tentar de novo** no próprio bloco; o resto da tela continua.
- **Não encontrado** (404, inclusive negócio de outro vendedor no modo restrito): "Negócio não encontrado ou você não tem acesso" com a casca e link para o funil.
- **Duplicado**: aviso com link para o existente, sem perder o formulário.
- **Sem permissão**: botões ocultos ou desabilitados com tooltip ("Só owner e admin editam os funis").
- **Feature fora do plano**: `PlanGate` (produtos, captura, relatórios) e `UpgradeDialog` ao tentar.
- **Limite** (funis, contatos, campos): o botão avisa antes ("Seu plano permite 1 funil"); a tentativa abre o `UpgradeDialog`.
- **Busca de CNPJ falhou**: mensagem discreta no campo ("Não encontramos os dados deste CNPJ, preencha à mão"), nunca bloqueia.
- **Sem conexão**: banner global; mutações otimistas que falharem desfazem com aviso; anotação fica com "Tentar de novo".

### Botões com loading (mantendo a largura)
Criar/salvar negócio, contato, empresa, lead, produto, atividade · Ganho/Perdido/Reabrir · Converter · Salvar anotação · Aplicar em massa · Importar (com progresso) · Desfazer importação · Exportar ("Gerando…") · Criar chave de captura · Salvar configurações · Carregar/apagar dados de exemplo.

### Formulários e alterações não salvas
- `FormSheet` de negócio, contato, empresa, lead, produto e atividade: validação no campo, erros da API no campo certo (inclusive `customFields.<key>`), "Descartar alterações?" ao fechar com mudanças.
- Rascunho da anotação guardado por registro no `localStorage` (em try/catch); some ao salvar.
- Campos de moeda aceitam "1500", "1.500", "1.500,00" e "R$ 1.500,00" (`crm-lib parseMoneyBR`); telefone aceita com ou sem DDI.

## Detalhes que fazem diferença
- Valores sempre `R$ 1.234,56`; nos cards e totais grandes, forma curta com o valor cheio no tooltip ("R$ 184,5 mil").
- Datas: "Hoje", "Amanhã", "Ontem", dia da semana se na semana, senão `14 out`; previsão vencida em vermelho.
- Selo da próxima atividade com cor e ícone consistentes em toda parte (atrasada = destrutivo, hoje = aviso, futura = neutro, sem = alerta tracejado).
- Telefone exibido formatado (`(44) 99999-1234`); copiar com um clique; e-mail idem.
- Avatares com iniciais e cor estável por pessoa.
- Título da aba do navegador: "Acme · R$ 12.000 · {Produto}".
- Celular: botão flutuante "+" (negócio no funil, atividade na agenda); quadro com uma coluna por vez; listas viram cards; botões Ligar/WhatsApp grandes no topo do contato e do negócio; atalhos de teclado desligados.
