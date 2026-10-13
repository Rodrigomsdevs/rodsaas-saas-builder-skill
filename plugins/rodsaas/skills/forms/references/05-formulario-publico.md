# Formulário público (`/f/[slug]`)

Página fora do grupo `(app)`: sem casca, sem guard, sem TanStack Query de sessão. Renderização no servidor do Next com os dados de `GET /v1/public/forms/:slug` (metadata: título do formulário, `robots: noindex` por padrão, imagem de compartilhamento com a capa) e interação no navegador. Componente único `PublicForm` usado também pela **prévia do construtor** (mesmo visual nos dois lugares).

## Estrutura e acessibilidade (obrigatório)

- `<main data-testid="public-form">` com o tema aplicado em variáveis CSS (cor principal da marca ou do formulário; contraste conferido: texto do botão em branco ou preto conforme a cor).
- Cada pergunta é um bloco `data-testid="public-field"` com `data-field-id`, com **`<label>` ligado ao campo** (`htmlFor`/`id`), descrição em `aria-describedby`, `aria-required` e `aria-invalid` quando houver erro, e a mensagem de erro em `data-testid="public-field-error"` dentro do bloco (`role="alert"`). Escolhas como `fieldset` + `legend`, cada opção um `<input type="radio|checkbox">` com label próprio.
- Asterisco nas obrigatórias e o aviso "* obrigatória" no topo.
- Funciona sem mouse: Tab, setas nas opções, Enter avança.

## Layout clássico

- Capa e logo (se houver), título e descrição.
- Boas-vindas (se ligada) como primeira tela com o botão de começar.
- Uma página por vez com **barra de progresso** ("Página 2 de 3", calculada com `visiblePages`); botões **Voltar** e **Próxima** (`public-form-next`), e **Enviar** (`public-form-submit`) na última página visível.
- "Próxima" valida só a página atual; "Enviar" valida tudo. Erros: mensagem em cada campo, rolagem até o primeiro com foco nele, e resumo no topo ("Corrija 2 respostas").

## Uma pergunta por vez

- Uma pergunta por tela, centralizada, com transição curta (desligada com `prefers-reduced-motion`); passos de `stepsOf(schema, answers)` (recalculados a cada resposta, então a lógica muda os próximos passos na hora).
- Enter avança (Shift+Enter quebra linha no texto longo); em escolhas, letras A, B, C… marcam a opção e a escolha única avança sozinha depois de 300 ms; setas ↑/↓ no rodapé voltam e avançam; barra de progresso fina no topo.
- Mesmos testids: o botão de avançar é `public-form-next` e, no último passo, `public-form-submit`.

## Comportamento dos campos

| Tipo | Na tela |
|---|---|
| texto curto / longo | input / textarea com contador quando houver limite |
| e-mail | `type="email"`, `inputmode="email"`, sugestão de correção de domínio comum ("gmial.com" → "gmail.com?") |
| telefone | máscara BR (`(00) 00000-0000`), `inputmode="tel"` |
| CPF / CNPJ | máscara (CNPJ aceita letras), validação dos dígitos ao sair do campo |
| endereço | CEP primeiro; ao completar, busca o endereço (serviço público de CEP, como no frontend) e preenche rua, bairro, cidade e UF, editáveis; número e complemento |
| número / valor | teclado numérico; valor em R$ com a máscara de moeda da base (guarda centavos) |
| estrelas / NPS / escala | botões grandes clicáveis (NPS de 0 a 10 com as cores neutras e os rótulos "Nada provável" / "Muito provável") |
| escolha única / múltipla | cartões de opção; "Outro" abre o campo de texto; ordem aleatória por sessão se ligado |
| lista suspensa | combobox com busca quando houver mais de 8 opções |
| sim/não | dois botões |
| data / horário | seletor nativo no celular e calendário no computador, respeitando mínimo/máximo |
| arquivo | área de arrastar e soltar + clique, progresso por arquivo, remover, tipos e tamanho avisados antes; upload pela API pública (`/uploads`) |
| consentimento | checkbox com o texto (links permitidos) |
| texto informativo | parágrafo (markdown simples: negrito, itálico, link) |

## Lógica ao vivo

Cada mudança de resposta recalcula `visibleFieldIds`. Pergunta que some perde a resposta digitada **na tela** só depois do envio (se voltar a aparecer antes de enviar, o valor está lá); ela não é enviada enquanto estiver escondida.

## Envio

1. `validateAnswers` no front (mesmo do back) antes de enviar.
2. `POST /v1/public/forms/:slug/responses` com `answers`, `hidden` (de `pickHidden` com a URL atual), `startedAt`, `browserKey` (id aleatório guardado no `localStorage` do formulário), `_ts` (quando a página abriu), `_gotcha` (campo isca invisível: fora da tela, `tabindex=-1`, `autocomplete=off`, `aria-hidden`) e o header `Idempotency-Key` (gerado uma vez por tentativa de envio; reenviar depois de erro de rede usa a mesma chave).
3. Botão com loading e desabilitado; "Enviando…".
4. **400** → mostra os erros de cada `answers.<id>` no campo certo (e vai para a página/passo dele). **409 ALREADY_RESPONDED** → tela "Você já respondeu este formulário". **410** → tela de encerrado. Erro de rede → mensagem com **Tentar de novo**, sem perder nada.
5. Sucesso → **tela de agradecimento** (`public-form-thanks`) com título, texto, botão com link e redirecionamento com contagem regressiva, se configurado; limpa o rascunho local.

## Rascunho local

Respostas guardadas no `localStorage` por formulário e versão (em try/catch, sem arquivos) a cada mudança; ao voltar, "Continuar de onde parou?" com **Continuar** e **Começar de novo**. Versão publicada mudou → descarta o rascunho com aviso.

## Estados

| Situação | Tela |
|---|---|
| carregando | skeleton com título e 3 perguntas |
| não existe / rascunho | 404 simples "Formulário não encontrado" |
| encerrado (410) | `public-form-closed` com a mensagem do formulário (ou a genérica no limite do plano) |
| só membros, deslogado | "Este formulário é só para membros da {empresa}" + **Entrar** (volta para o formulário) |
| só membros, logado em outra empresa | "Você não tem acesso a este formulário" + trocar de empresa |
| já respondeu | "Você já respondeu este formulário" |
| erro da API | mensagem + **Tentar de novo** (com o `requestId` discreto) |

## Incorporar

`/f/[slug]?embed=1`: sem fundo de página e sem rodapé de navegação, fundo transparente; envia `postMessage({ type: 'rodsaas-form:height', height })` ao mudar de altura e `rodsaas-form:submitted` ao enviar, para o site que incorpora. Cabeçalhos: o formulário público pode ser incorporado em qualquer site (`Content-Security-Policy: frame-ancestors *` **só** nessa rota); o resto do app continua com `frame-ancestors 'self'`.

## Rodapé e privacidade

Rodapé "Feito com {produto}" (link para o site do produto) quando `showBranding`. Texto "Nunca envie senhas por formulários." pequeno no rodapé. Link para a política de privacidade do `rodsaas.json` se existir.
