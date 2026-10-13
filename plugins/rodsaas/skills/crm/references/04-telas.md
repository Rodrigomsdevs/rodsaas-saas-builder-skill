# Telas

Todas dentro do app CRM na casca de apps (`skills/frontend/references/12-casca-e-apps.md`), seguindo os componentes, estados e formulários da skill `frontend` (máscaras de CPF/CNPJ/telefone/CEP/moeda, `LoadingButton`, `FormSheet`, `ConfirmDialog`, `PlanGate`, `UpgradeDialog`, `DataTable` com cards no celular). Estados detalhados em `05-interacoes-e-estados.md`. Código em `web/src/features/crm/`.

## Rotas

| Rota | Tela |
|---|---|
| `/crm` | redireciona para `/crm/negocios` |
| `/crm/negocios` | funil (`?funil=<id>&visao=quadro\|lista`, padrão: funil padrão no quadro) |
| `/crm/negocios/[id]` | negócio |
| `/crm/leads` | caixa de leads (abre o lead no painel lateral com `?lead=<id>`) |
| `/crm/contatos` · `/crm/contatos/[id]` | contatos · contato |
| `/crm/empresas` · `/crm/empresas/[id]` | empresas · empresa |
| `/crm/atividades` | agenda (`?aba=atrasadas\|hoje\|proximas\|concluidas\|calendario`) |
| `/crm/produtos` | catálogo |
| `/crm/relatorios` | relatórios |
| `/crm/importar` | importação em passos |
| `/crm/configuracoes` | configurações do CRM (`?aba=funis\|motivos\|origens\|etiquetas\|campos\|captura\|geral`) |

Filtros, ordenação, aba e visão ficam na URL (nuqs); voltar do navegador funciona.

## Funil (`/crm/negocios`)

**Cabeçalho**: seletor de funil (`crm-pipeline-select`) · totais do funil ("32 negócios · R$ 184.500,00 · ponderado R$ 71.230,00") · visão Quadro/Lista · **+ Negócio** (`crm-deal-new`) · ⋯ (editar funil, importar, exportar).

**Barra de filtros**: responsável ("Meus", pessoas), etiqueta, origem, previsão (vencida, este mês, próximo mês, sem), próxima atividade (atrasada, hoje, sem), parados, valor, busca, campos personalizados. "Limpar filtros" quando houver algum.

### Quadro (`crm-board`)
- Uma coluna por etapa (`crm-stage-column` com `data-stage-id`), na ordem: nome, probabilidade discreta (50%), quantidade e **total em R$** (`crm-stage-total`) e o ponderado no tooltip.
- Card (`crm-deal-card` com `data-deal-id`): título (2 linhas), empresa ou contato, valor, avatar do responsável, etiquetas (até 2), até 2 campos personalizados marcados "mostrar no card", previsão (vermelha se vencida) e o **selo da próxima atividade** (`crm-next-activity` com `data-state="overdue|today|future|none"`): ícone do tipo + "Hoje 14:00" / "Atrasada há 2 dias" / ⚠ "Sem atividade agendada". Parado: borda/fundo de alerta e "Parado há 12 dias".
- Clique abre o negócio; o ícone de relógio no card abre direto o "Agendar atividade".
- Arrastar entre colunas muda a etapa; dentro da coluna, a ordem. Ao arrastar aparecem, no rodapé fixo, as áreas **Ganho** · **Perdido** · **Excluir** (soltar em Perdido abre o diálogo do motivo; em Excluir, confirmação).
- "+ Adicionar" no fim de cada coluna: adição rápida com título e valor (Enter cria e mantém aberto).
- Colunas com muitas cartas: 50 por vez, "Carregar mais" no fim da coluna.
- Celular: uma coluna por tela com encaixe e abas das etapas no topo; menu "Mover para…" no card (sem arrastar).

### Lista
Tabela com colunas configuráveis (título, valor, etapa, status, empresa, contato, responsável, previsão, próxima atividade, origem, etiquetas, criado, campos personalizados); filtro de status (Abertos, Ganhos, Perdidos, Todos); seleção múltipla com barra de ações em massa (responsável, etapa, etiquetas, previsão, excluir); totais no rodapé; edição na linha de responsável, etapa e previsão.

## Negócio (`/crm/negocios/[id]`)

1. **Cabeçalho**: título editável no lugar (`crm-deal-title`), valor (clique edita; com produtos mostra "soma dos produtos"), responsável, selo de status (`crm-deal-status` com `data-status="OPEN|WON|LOST"`), botões **Ganho** (`crm-deal-won`) e **Perdido** (`crm-deal-lost`) em verde/vermelho; fechado mostra "Ganho em 12/10" ou "Perdido: Preço" + **Reabrir** (`crm-deal-reopen`). ⋯: duplicar, mudar de funil, copiar link, excluir.
2. **Barra de etapas**: uma etapa após a outra (`crm-stage-step` com `data-stage-id` e `aria-current="step"` na atual), as anteriores preenchidas; clicar numa etapa move para ela (otimista); tooltip com "3 dias nesta etapa" e o histórico de passagem.
3. **Coluna de detalhes** (esquerda; no celular, acima):
   - **Resumo**: valor, probabilidade (da etapa ou própria, editável), ponderado, previsão de fechamento, origem, etiquetas, criado por/em.
   - **Pessoa**: contato com cargo, telefone (botões **Ligar** `tel:` e **WhatsApp** `wa.me`), e-mail (`mailto:`); trocar/remover; "+ Vincular contato" (busca com criar novo).
   - **Empresa**: nome, CNPJ, cidade/UF; trocar/remover.
   - **Produtos** (feature Pro): tabela de itens (produto/descrição, qtd, preço, desconto %, total), "+ Adicionar produto" (busca no catálogo ou item avulso), subtotal, descontos e total; aviso "O valor do negócio é a soma dos produtos" com opção de voltar para valor manual. Sem a feature: `PlanGate` compacto.
   - **Campos personalizados**: em grupo, editáveis no lugar.
   - **Lead de origem** (se veio de conversão): link + UTM.
4. **Área principal** (direita):
   - **Compositor** em abas: **Anotação** (`crm-note-input` + `crm-note-submit`, `@` menciona, Ctrl+Enter salva) · **Atividade** (`crm-activity-new`: tipo em botões com ícone, assunto sugerido pelo tipo — "Ligar para Ana" —, data com atalhos Hoje/Amanhã/Próx. semana, hora opcional, duração, responsável, anotação; "Marcar como feita" para registrar o que já aconteceu) · **Arquivo** (Dropzone).
   - **Planejado**: atividades pendentes deste negócio (concluir com um clique, editar, reagendar).
   - **Histórico** (`crm-timeline`, itens `crm-timeline-item`): filtros Tudo · Anotações · Atividades · Mudanças · Arquivos; fixadas no topo; anotações com autor, hora, menções, editar/excluir/fixar; atividades concluídas com quem e quando; mudanças em texto discreto ("Ana moveu de Proposta para Negociação · há 2 h"); arquivos com pré-visualização. "Carregar anteriores".

## Leads (`/crm/leads`)

- Abas: **Meus** · **Não atribuídos** · **Todos** (owner/admin ou modo aberto) · **Descartados** · **Convertidos**, com contadores.
- Linhas (`crm-lead-row`): bolinha de "novo" (não visto), título, pessoa, empresa, e-mail/telefone (botão WhatsApp), origem e via (ícone de API/formulário/importação), responsável, recebido há X, próxima atividade, selo "Já é contato" quando houver correspondência.
- Ações na linha e em massa: **Converter** (`crm-lead-convert`), atribuir, etiquetar, descartar.
- **Painel do lead** (`?lead=`): dados editáveis, mensagem do formulário, UTM e campos extras recebidos, aviso de correspondência ("Já existe Ana Souza · 2 negócios" com link), compositor (anotação/atividade/arquivo) e histórico.
- **Diálogo de conversão** (`crm-convert-dialog`): título, valor, funil e etapa, responsável; **Contato**: "Vincular a Ana Souza (existente)" (pré-selecionado quando casar) · "Criar novo" · "Sem contato"; **Empresa**: idem; botão **Converter** (`crm-convert-confirm`) → abre o negócio criado com toast "Lead convertido".
- "+ Lead" manual no cabeçalho.

## Contatos e empresas

### Listas (`/crm/contatos`, `/crm/empresas`)
`DataTable` com busca (nome, e-mail, telefone, CNPJ), filtros (responsável, etiqueta, cidade/UF, com negócio aberto, campos personalizados), colunas configuráveis, seleção e ações em massa (responsável, etiquetas, excluir), **Exportar CSV** (owner/admin), **Importar**, **+ Contato** (`crm-contact-new`) / **+ Empresa** (`crm-company-new`).

### Formulário de contato (`FormSheet`)
Nome (`field-name`), e-mail (`field-email`), telefone com "é WhatsApp" (`field-phone`), cargo, empresa (busca com criar nova), CPF, aniversário, responsável, etiquetas, campos personalizados. Enquanto digita e-mail/telefone/CPF (com espera de 400 ms) consulta `/v1/crm/duplicates`; se existir, mostra **`crm-duplicate-warning`**: "Já existe um contato com este e-mail: **Ana Souza**" com **Abrir** (`crm-duplicate-open`). Se o envio responder `CONTACT_DUPLICATE`, mostra o mesmo aviso (e o erro no campo) sem fechar o formulário.

### Formulário de empresa
CNPJ primeiro (`field-cnpj`): ao completar um CNPJ válido, busca os dados (spinner no campo) e preenche razão social, nome fantasia, segmento, telefone, e-mail e endereço, tudo editável, com aviso se a situação não for ativa; falha não trava. Depois nome, site, responsável, etiquetas, campos. Duplicado: mesmo aviso do contato.

### Página do contato / empresa
Cabeçalho com nome, cargo/CNPJ, etiquetas, responsável, ações (WhatsApp, ligar, e-mail, editar, ⋯ excluir). Coluna de detalhes (dados, endereço, campos personalizados, empresas ligadas ou contatos da empresa com "principal"). Área principal com abas **Negócios** (abertos com total, ganhos, perdidos; "+ Negócio" já preenchido) · **Histórico** (mesmo componente do negócio, reunindo os negócios ligados) · **Atividades**.

## Atividades (`/crm/atividades`)

- Abas **Atrasadas** (vermelho) · **Hoje** · **Próximas** · **Concluídas** · **Calendário**, com contadores; filtro de responsável (eu por padrão; owner/admin escolhem pessoas ou "todos"), tipo e período.
- Linha (`crm-activity-row`): checkbox **concluir** (`crm-activity-done`), ícone do tipo, assunto, hora ("14:00" ou "Dia inteiro"), negócio/lead/contato ligado (link), telefone com botões Ligar/WhatsApp quando houver contato, responsável, duração.
- Agrupada por dia nas Próximas ("Amanhã", "qui, 16/10").
- **Calendário**: semana (padrão) e mês; atividades com hora nos horários, de dia inteiro no topo; arrastar reagenda; clicar num horário vazio cria (pede o negócio/contato).
- "+ Atividade" no cabeçalho (exige escolher um negócio, lead, contato ou empresa).

## Produtos (`/crm/produtos`)
Tabela (nome, código, preço, unidade, ativo, usado em X negócios), busca, filtro ativos/inativos, "+ Produto" (owner/admin). Sem a feature: `PlanGate` com prévia.

## Relatórios (`/crm/relatorios`)
Filtros no topo (funil, período com atalhos, vendedor). Cartões: ganhos no período (valor e qtd), taxa de ganho, ticket médio, ciclo médio, aberto ponderado. Gráficos com o padrão de gráficos do projeto e as cores do tema: **funil de conversão** (barras horizontais decrescentes com % entre etapas), **ganhos × perdidos por mês**, **previsão** (barras empilhadas total × ponderado), **ranking de vendedores** (tabela ordenável), **motivos de perda** (barras), **tempo por etapa** (barras com média e mediana), **atividades por vendedor**. Cada bloco com "Exportar CSV". Sem a feature: prévia borrada com `PlanGate`.

## Importação (`/crm/importar`)
Assistente em 4 passos, detalhado em `06-captura-e-importacao.md`: **Arquivo** → **Colunas** → **Prévia** → **Resultado**, com histórico das importações (data, quem, tipo, criados/atualizados/pulados/erros, **Desfazer** por 24 h, baixar erros).

## Configurações (`/crm/configuracoes`, owner/admin)
Abas:
- **Funis**: lista de funis (arrastar ordem, padrão, arquivar, excluir com destino) e etapas de cada um (arrastar, nome, probabilidade, dias de alerta, excluir com destino); limite do plano visível.
- **Motivos de perda** · **Origens** · **Etiquetas**: listas ordenáveis com criar/renomear/arquivar.
- **Campos personalizados**: por entidade (Empresa, Contato, Negócio/Lead); criar com tipo, opções (cores), obrigatório, mostrar na lista, mostrar no card (máx. 2); arquivar; excluir de vez digitando o nome; uso do limite do plano.
- **Captura de leads** (feature Pro): chaves e formulários (`06-captura-e-importacao.md`).
- **Geral**: visibilidade (Todos veem tudo / Cada vendedor vê os seus, com explicação do que muda), exigir motivo de perda, modelo da mensagem do WhatsApp (com variáveis `{primeiro_nome}`, `{nome}`, `{empresa}`, `{vendedor}` e prévia), dados de exemplo (carregar/apagar).

## Contrato testável (data-testid)

O `/rodsaas:verify` tem uma parte só do CRM (`skills/verify/suite/tests/09-crm.spec.ts`), que roda quando `rodsaas.json` tem `crm` em `presets`. Ela depende destes testids (lista canônica em `skills/verify/contract.json`, grupo `crm`), além dos da base (`form-sheet`, `form-submit`, `field-*`, `field-error-*`, `confirm-dialog`, `empty-state`…):

| testid | Elemento |
|---|---|
| `crm-pipeline-select` | seletor de funil |
| `crm-board` | quadro |
| `crm-stage-column` | coluna, com `data-stage-id` |
| `crm-stage-total` | total em R$ da coluna (dentro dela) |
| `crm-deal-card` | card, com `data-deal-id` |
| `crm-next-activity` | selo da próxima atividade no card, com `data-state` (`overdue`, `today`, `future`, `none`) |
| `crm-deal-new` | "+ Negócio"; abre `form-sheet` com `field-title` (erro em `field-error-title`), `field-value` (moeda, aceita "1.500,00") e `form-submit` |
| `crm-deal-title`, `crm-deal-status` | título e selo de status do negócio (`data-status`) |
| `crm-stage-step` | etapa na barra de etapas, com `data-stage-id`; a atual com `aria-current="step"` |
| `crm-deal-won`, `crm-deal-lost`, `crm-deal-reopen` | ganhar, perder, reabrir |
| `crm-lost-dialog`, `crm-lost-reason`, `crm-lost-reason-option`, `crm-lost-confirm` | diálogo de perda: gatilho do seletor de motivo, cada opção, confirmar |
| `crm-activity-new` | aba/botão de nova atividade; o formulário usa `field-subject` e `form-submit` (data padrão: hoje) |
| `crm-activity-row`, `crm-activity-done` | linha da agenda e a checkbox de concluir dentro dela |
| `crm-activities-tab-overdue`, `crm-activities-tab-today`, `crm-activities-tab-upcoming` | abas da agenda |
| `crm-note-input`, `crm-note-submit`, `crm-timeline`, `crm-timeline-item` | anotação e histórico |
| `crm-contact-new`, `crm-company-new` | "+ Contato", "+ Empresa" |
| `crm-duplicate-warning`, `crm-duplicate-open` | aviso de duplicado no formulário e o link para o existente |
| `crm-lead-row`, `crm-lead-convert` | linha do lead e o botão converter (na linha ou no painel) |
| `crm-convert-dialog`, `crm-convert-confirm` | diálogo de conversão e o botão converter |

## Home (widgets)
- **Minhas atividades de hoje** (até 6, concluir direto, atrasadas no topo em vermelho).
- **Negócios parados** (os 5 mais parados, com dias).
- **Meu funil**: barras por etapa com valor aberto.
- **Leads novos** (contador e os 3 mais recentes).
