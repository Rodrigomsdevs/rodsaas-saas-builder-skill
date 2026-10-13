# Construtor e telas internas

Dentro do app **Forms** da casca de apps. Componentes, estados e formulários da skill `frontend`. Código em `web/src/features/forms/`.

## Rotas

| Rota | Tela |
|---|---|
| `/forms` | todos os formulários |
| `/forms/respostas` | respostas recentes de todos os formulários que a pessoa vê |
| `/forms/modelos` | modelos do sistema e da empresa |
| `/forms/f/[id]` | redireciona para `editar` (editor) ou `respostas` (só leitura) |
| `/forms/f/[id]/editar` | construtor |
| `/forms/f/[id]/respostas` | tabela de respostas (`?r=<id>` abre o detalhe no painel lateral) |
| `/forms/f/[id]/resumo` | resumo e funil |
| `/forms/f/[id]/compartilhar` | link, incorporar, QR code |
| `/forms/f/[id]/configuracoes` | layout, tema, boas-vindas, agradecimento, limites, acesso, avisos, LGPD, colaboradores |
| `/forms/f/[id]/integracoes` | webhooks e CRM |
| `/f/[slug]` | formulário público (fora da casca, `05-formulario-publico.md`) |

Dentro de um formulário, o topo da tela tem: voltar, **título editável no lugar**, selo de status (Rascunho · Publicado · Publicado com alterações · Encerrado), abas **Editar · Respostas (N) · Resumo · Compartilhar · Configurações · Integrações** (as que a pessoa pode ver) e, à direita, o botão principal do momento: **Publicar** / **Publicar alterações** / **Reabrir**.

## Lista (`/forms`)

- Cartões ou tabela (preferência salva): título, status, respostas (com não lidas em destaque), última resposta, dono, atualizado; estrela; menu ⋯ (abrir link, copiar link, duplicar, salvar como modelo, encerrar/reabrir, excluir).
- Filtros: status, meus, favoritos, busca; ordenação.
- **+ Formulário** (`forms-new`) abre o diálogo **Novo formulário**: "Em branco" (`forms-template-blank`) e os modelos em cartões (`forms-template` com `data-template`), cada um com prévia das perguntas ao passar o mouse. Clicar num cartão cria o formulário (título do modelo, ou "Formulário sem título") e abre o construtor; o título se edita no topo do construtor.

## Construtor (`/forms/f/[id]/editar`)

Três colunas (no celular, uma por vez com abas Perguntas · Prévia · Propriedades):

1. **Estrutura** (esquerda, 260 px): lista das perguntas e páginas na ordem, com ícone do tipo, número, texto curto, selos (obrigatória, com condição); arrastar para reordenar (dnd-kit, com teclado); clicar seleciona; páginas como separadores com título. Botão **+ Adicionar pergunta** (`forms-add-field`) no fim e um "+" entre itens ao passar o mouse.
2. **Prévia editável** (centro): o formulário como o respondente vê, com o tema; clicar numa pergunta seleciona e permite editar o texto **direto na prévia**; pergunta selecionada com contorno da marca e barra de ações (duplicar, mover para cima/baixo, excluir com desfazer). Alternar **computador / celular** e **clássico / uma por vez** só na prévia (sem mudar a configuração). Página atual navegável.
3. **Propriedades** (direita, 320 px) da pergunta selecionada (cada pergunta do construtor tem `forms-field` com `data-field-id`):
   - **Tipo** (trocar mantém o texto; trocar entre escolhas mantém as opções; outros pedem confirmação se houver respostas).
   - **Pergunta** (`forms-field-label`), **descrição**, **placeholder**, **obrigatória** (`forms-field-required`, interruptor).
   - **Opções** (escolhas): lista arrastável, colar várias linhas de uma vez vira várias opções, "Outro" com texto livre, ordem aleatória, mínimo/máximo de escolhas (múltipla).
   - **Validação** por tipo: tamanho do texto; mínimo/máximo e inteiro (número); mínimo/máximo em R$; datas (a partir de hoje, até hoje, intervalo); estrelas (3 a 10); escala (mín., máx. e rótulos das pontas); arquivo (quantidade, tipos: imagem, PDF, documento, planilha; tamanho).
   - **Condição** (`forms-logic`, feature `forms_logic`; sem ela, selo Pro e `UpgradeDialog`): "Mostrar esta pergunta quando [todas | qualquer] destas forem verdade" + linhas `[pergunta anterior] [operador] [valor]`; o seletor de valor muda com o tipo (opções da pergunta, sim/não, número, data); operadores em português (é, não é, contém, maior que, menor ou igual, foi respondida, não foi respondida). O mesmo editor existe para **páginas**. Condição que ficou inválida (pergunta usada foi excluída ou movida para depois) aparece em vermelho e bloqueia a publicação com o motivo.
   - Sem pergunta selecionada: propriedades do **formulário** (título, descrição de abertura) e dos **campos ocultos** (lista de nomes, com a explicação "venha de ?utm_source=... no link").

**Paleta de tipos** (ao adicionar): diálogo com busca e grupos do `FIELD_TYPES` (Texto, Contato, Escolha, Números e avaliação, Data e hora, Estrutura, Avançado), cada tipo com ícone, nome e exemplo; tipos de feature fora do plano com selo Pro. Cada opção tem `forms-field-type-<tipo>` (ex.: `forms-field-type-short_text`). Atalho: digitar `/` na prévia vazia abre a paleta.

**Salvamento automático**: cada mudança salva o rascunho (`PUT /draft`) com espera de 800 ms, um envio por vez, em fila; indicador no topo (`forms-save-status`): "Salvando…" → "Salvo" → "Erro ao salvar · Tentar de novo". Conflito de versão → diálogo "Ana salvou este formulário às 14:32" com **Recarregar a versão dela** ou **Manter a minha e sobrescrever**. Desfazer/refazer (`Ctrl+Z`/`Ctrl+Shift+Z`) local, até 50 passos.

**Publicar** (`forms-publish`): valida no front com `validateSchema` (lista dos problemas com link para a pergunta) e chama a API; sucesso abre o diálogo "Formulário publicado!" com o link (`forms-public-link`, texto e botão copiar), abrir em nova aba e QR code. Com alterações não publicadas, o topo mostra "Há alterações não publicadas" + **Descartar alterações**.

## Configurações (`/forms/f/[id]/configuracoes`)

Seções numa página com índice lateral, salvando por seção (botão com loading e "Descartar"):
- **Layout**: clássico × uma por vez (com miniaturas).
- **Tema**: marca do produto ou próprio (cor principal, fundo, capa e logo por upload; feature `forms_branding`); prévia ao lado; rodapé "Feito com {produto}" (desligar exige a feature).
- **Boas-vindas** (liga/desliga, título, texto, botão) e **Agradecimento** (título, texto, botão com link, redirecionar depois de N segundos).
- **Respostas**: limite de respostas, encerrar em data e hora (fuso da empresa), uma resposta por pessoa (nenhuma · navegador · e-mail · login), mensagem de encerrado.
- **Acesso**: público · só membros da empresa.
- **Avisos**: e-mail para mim e colaboradores (cada resposta · resumo diário · desligado); resposta automática (assunto, texto com variáveis `{nome}` e `{formulario}`, incluir cópia das respostas; precisa de uma pergunta de e-mail, senão mostra como adicionar).
- **Privacidade**: apagar respostas depois de N dias (desligado, 30, 90, 180, 365); lembrete de incluir uma pergunta de consentimento quando houver dados pessoais.
- **Colaboradores** (dono e owner/admin): adicionar membros como editor ou leitor.
- **Zona de perigo**: encerrar, excluir (digitando o título).

## Compartilhar (`/forms/f/[id]/compartilhar`)

Só depois de publicado (antes, estado vazio com **Publicar**):
- **Link**: endereço completo, copiar, abrir, editar o final do endereço (slug) com checagem de disponibilidade e aviso de que o link antigo para de funcionar.
- **Campos ocultos**: montador de link com valores ("utm_source = instagram") que gera a URL pronta.
- **Incorporar**: código do iframe com altura automática (o formulário manda a altura por `postMessage`; snippet de 3 linhas que ajusta) e opção "largura total"; prévia.
- **QR code**: imagem para baixar (PNG e SVG) com o link.
- **Enviar por WhatsApp/e-mail**: botões que abrem com o texto e o link.

## Respostas, resumo e integrações

Telas em `06-respostas-e-integracoes.md`.

## Contrato testável (data-testid)

A bateria do `/rodsaas:verify` (`suite/tests/11-forms.spec.ts`) roda quando `rodsaas.json` tem `forms` em `presets`. Lista canônica em `skills/verify/contract.json` (`presets.forms`):

| testid | Elemento |
|---|---|
| `forms-new` | "+ Formulário" na lista |
| `forms-template-blank`, `forms-template` | "Em branco" e cartões de modelo (`data-template`) no diálogo de novo formulário |
| `forms-title-input` | título do formulário editável no topo |
| `forms-add-field` | adicionar pergunta (abre a paleta) |
| `forms-field-type-<tipo>` | opção da paleta (ex.: `forms-field-type-email`) |
| `forms-field` | pergunta na estrutura/prévia, com `data-field-id` |
| `forms-field-label`, `forms-field-required` | texto da pergunta selecionada e interruptor de obrigatória (nas propriedades) |
| `forms-save-status` | indicador de salvamento |
| `forms-publish`, `forms-public-link` | publicar e o link público mostrado depois |
| `forms-status` | selo de status, com `data-status` (`DRAFT`, `PUBLISHED`, `CLOSED`) |
| `forms-responses-table`, `forms-response-row` | tabela de respostas e cada linha |
| `forms-summary` | área do resumo |
| `public-form`, `public-field` (`data-field-id`), `public-field-error`, `public-form-next`, `public-form-submit`, `public-form-thanks`, `public-form-closed` | formulário público (`05-formulario-publico.md`) |
