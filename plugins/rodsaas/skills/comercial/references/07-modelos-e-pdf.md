# 07 · Modelos e PDF

## Variáveis

Sintaxe: `{{caminho}}` ou `{{caminho|filtro}}` (espaços dentro das chaves são aceitos). Só os caminhos da lista do tipo do modelo valem: o salvar roda `validateTemplate(bodyHtml, VARIABLES[kind])` → 400 `UNKNOWN_VARIABLE` / `UNKNOWN_FILTER` / `UNCLOSED_VARIABLE` com `errors: [{ path, message }]`. Não há laços nem condicionais (as partes repetidas — itens, parcelas, assinaturas — são **blocos**, abaixo).

★ `GET /v1/com/templates/variables` devolve `{ PROPOSAL: [...], CONTRACT: [...], AMENDMENT: [...], filters: FILTERS, blocks: BLOCKS }` com as listas abaixo (copie exatamente; a tela de modelos monta o menu "Inserir variável" a partir dela, agrupado pelo prefixo).

| Grupo | Caminhos | Tipos |
|---|---|---|
| empresa | `empresa.nome`, `empresa.razaoSocial`, `empresa.documento`, `empresa.endereco`, `empresa.email`, `empresa.telefone` | todos |
| datas | `hoje` (YYYY-MM-DD) | todos |
| vendedor | `vendedor.nome`, `vendedor.email`, `vendedor.telefone` | todos |
| cliente | `cliente.nome`, `cliente.empresa`, `cliente.documento`, `cliente.email`, `cliente.telefone` | todos (no contrato = o contratante) |
| proposta | `proposta.codigo`, `proposta.titulo`, `proposta.avulso`, `proposta.mensal`, `proposta.anual`, `proposta.desconto`, `proposta.validade`, `proposta.pagamento`, `proposta.observacoes`, `proposta.condicoes` | PROPOSAL; CONTRACT/AMENDMENT (vazias se o contrato não veio de proposta) |
| contrato | `contrato.codigo`, `contrato.titulo`, `contrato.valor`, `contrato.recorrencia`, `contrato.valorTotal`, `contrato.inicio`, `contrato.fim`, `contrato.meses`, `contrato.aviso`, `contrato.renovacao`, `contrato.indice` | CONTRACT, AMENDMENT |
| partes | `contratante.nome`, `contratante.documento`, `contratante.email`, `contratada.nome`, `contratada.documento`, `contratada.email` | CONTRACT, AMENDMENT |
| aditivo | `aditivo.numero`, `aditivo.titulo`, `aditivo.valor`, `aditivo.fim` | AMENDMENT |

Valores e tipos (o serviço monta o objeto `data` com eles; `renderTemplate(bodyHtml, data)`):

- dinheiro em **centavos** (`proposta.avulso`, `proposta.mensal`, `proposta.anual`, `proposta.desconto` = desconto total do avulso, `contrato.valor`, `contrato.valorTotal`, `aditivo.valor`) → use `|moeda` ou `|extenso`;
- datas `YYYY-MM-DD` (`hoje`, `proposta.validade`, `contrato.inicio`, `contrato.fim`, `aditivo.fim`) → `|data`;
- documentos só dígitos (`*.documento`) → `|documento`;
- textos prontos: `proposta.pagamento` ("Entrada de R$ 1.000,00 em 05/11/2026 + 3 parcelas mensais de R$ 1.000,00"), `contrato.recorrencia` ("mensal" / "anual" / "pagamento único"), `contrato.renovacao` ("renovação automática por 12 meses" / "sem renovação automática"), `contrato.meses` e `contrato.aviso` (números).

Filtros (`FILTERS`): `moeda` (12345 → "R$ 123,45"), `data` ("2026-11-01" → "01/11/2026"), `extenso` (104500 → "mil e quarenta e cinco reais"; 150 → "um real e cinquenta centavos"), `documento` (CPF/CNPJ formatado; inválido fica como veio), `maiusculas`.

Cláusula típica: `O CONTRATANTE pagará {{contrato.valor|moeda}} ({{contrato.valor|extenso}}) por mês, de {{contrato.inicio|data}} a {{contrato.fim|data}}.`

**Escape**: `renderTemplate` escapa todo valor (um cliente chamado `<script>` aparece como texto). O HTML do modelo em si é sanitizado no salvar.

**Faltando**: variável sem valor vira texto vazio e entra em `missing`. A prévia lista ("Faltam: contrato.indice, cliente.documento") e enviar para assinatura com faltas → 422 `MISSING_VARIABLES` (proposta: só aviso, não bloqueia — observações vazias são normais).

## Blocos

Elementos que o editor insere como "cartões" e o servidor troca por HTML gerado **depois** do `renderTemplate` (os valores do bloco também são escapados):

| Bloco (`<div data-block="…"></div>`) | Gera | Tipos |
|---|---|---|
| `itens` | tabela de itens (descrição, detalhe, qtd + unidade, unitário, desconto, total), opcionais marcados com "(opcional)"; recorrentes numa segunda tabela "Mensalidades" | PROPOSAL, CONTRACT (se veio da proposta) |
| `totais` | avulso (bruto, descontos, total), mensal, anual | PROPOSAL, CONTRACT |
| `pagamento` | cronograma do `paymentPlan` (parcela, vencimento, valor) | PROPOSAL, CONTRACT |
| `aceite` | na proposta aceita: nome, documento formatado, data/hora, IP e SHA-256; antes do aceite, nada | PROPOSAL |
| `assinaturas` | linhas de assinatura das partes e testemunhas (nome, documento) — no PDF final a prova é o manifesto | CONTRACT, AMENDMENT |
| `quebra` | quebra de página no PDF | todos |

Bloco desconhecido ou fora do tipo → 400 `UNKNOWN_BLOCK` no salvar (`validateBlocks(bodyHtml, kind)`). As listas `VARIABLES` e `BLOCKS` estão no `comercial-lib` — a API devolve exatamente elas.

## Editor de modelos

`/comercial/modelos` (`COM_ADMIN`; outros veem e usam): lista por tipo, "padrão" marcado, prontos com selo "Pronto" (não editáveis: **Duplicar para editar**).

- Editor rico (o mesmo do app de Páginas/Suporte se existir, senão TipTap): títulos, negrito, itálico, sublinhado, listas, tabela simples, alinhamento, cor de texto, imagem (upload), link, linha horizontal; **Inserir variável** (menu com busca, por grupo; insere `{{caminho}}` como um "chip" não editável que mostra o rótulo — "Nome do cliente") com escolha de filtro; **Inserir bloco**.
- Painel de **prévia** ao lado: escolher uma proposta/contrato real (ou "dados de exemplo") → `POST /templates/:id/preview` → HTML + faltas. No celular, abas Editar · Prévia.
- Salvar valida (erros do servidor listados com a variável e o "Remover"/"Trocar").
- Sanitização (`sanitize-html`) com lista fechada: `p h1 h2 h3 h4 strong em u s ul ol li table thead tbody tr th td img a hr br blockquote span div`; atributos `href` (http, https, mailto), `src` (só URLs do storage do projeto ou `data:image/`), `style` só com `color`, `text-align`, `width` (tabelas); `div` só com `data-block` da lista. Sem `script`, `iframe`, `on*`, `style` externo.

## Modelos prontos (`seedComercial`)

1. **Proposta comercial** (`PROPOSAL`, padrão): capa (logo, `{{proposta.titulo}}`, "Preparada para {{cliente.nome}} · {{cliente.empresa}}", `{{hoje|data}}`), "Sobre a {{empresa.nome}}" (texto editável), escopo (`itens`), investimento (`totais`, `pagamento`), condições (`{{proposta.condicoes}}`), validade ("Proposta válida até {{proposta.validade|data}}"), contato do vendedor, `aceite`.
2. **Contrato de prestação de serviços** (`CONTRACT`, padrão): qualificação das partes (`{{contratante.nome}}`, inscrito no CPF/CNPJ sob o nº `{{contratante.documento|documento}}`…; idem contratada), 1. Objeto (com `itens`), 2. Preço e pagamento (`{{contrato.valor|moeda}}` (`{{contrato.valor|extenso}}`), `{{contrato.recorrencia}}`, `pagamento`), 3. Vigência (`{{contrato.inicio|data}}` a `{{contrato.fim|data}}`, `{{contrato.meses}}` meses, `{{contrato.renovacao}}`), 4. Reajuste (anual pelo `{{contrato.indice}}`), 5. Obrigações das partes, 6. Rescisão (aviso prévio de `{{contrato.aviso}}` dias), 7. Confidencialidade e LGPD, 8. Foro, local e data, `assinaturas`. Texto genérico com o aviso "revise com seu jurídico" na tela de modelos (não no documento).
3. **Aditivo contratual** (`AMENDMENT`): referência ao contrato (`{{contrato.codigo}}`, `{{contrato.titulo}}`), cláusula de alteração (novo valor `{{aditivo.valor|moeda}}`, novo fim `{{aditivo.fim|data}}`), ratificação das demais cláusulas, `assinaturas`.

## PDF

Job `com.pdf` (pg-boss), cache pelo SHA-256 do HTML de entrada (mesmo HTML → mesmo arquivo, sem regerar).

- **Motor** (`COM_PDF_ENGINE`):
  - `gotenberg` (padrão em produção): `POST {GOTENBERG_URL}/forms/chromium/convert/html` com `index.html` (+ `header.html`/`footer.html` com `<span class="pageNumber">`/`totalPages`), A4 (`paperWidth=8.27`, `paperHeight=11.7`), margens 2 cm, `printBackground=true`. Serviço `gotenberg` no `docker-compose` (imagem oficial; confira a tag atual) sem porta pública. Bloqueie rede externa no Chromium do Gotenberg (lista de bloqueio/permissão da doc atual) e embuta logo e imagens como `data:` antes de mandar.
  - `chromium`: `playwright-core` no worker (`page.setContent` + `page.pdf({ format: 'A4', printBackground: true, displayHeaderFooter: true })`), para quem não quer o container.
  - `basic` (dev/CI sem Docker): `pdf-lib` escreve o texto puro (título, itens, totais) — feio, mas determinístico; o `/rodsaas:verify` roda com ele.
- CSS de impressão próprio (`print.css`): fonte do sistema de marca, tabelas que não quebram linha no meio (`break-inside: avoid`), `quebra` → `break-after: page`, cabeçalho com logo e código, rodapé "Página X de Y · {código}".
- **Proposta**: o HTML da página pública sem os botões; aceita → inclui o bloco `aceite`.
- **Contrato**: `bodyHtml` renderizado; ao enviar para assinatura, esse PDF é congelado (`documentSha256`).
- **PDF final**: PDF enviado + folha de assinaturas (gerada pelo mesmo motor a partir de HTML com `manifestLines`) unidos com `pdf-lib` (`06-assinatura.md`). Nunca regere o documento original na conclusão: o hash do enviado tem de bater.

## Testes obrigatórios

- Salvar com `{{cliente.cpf}}` → 400 `UNKNOWN_VARIABLE` com `path: "cliente.cpf"`; `{{proposta.avulso|dinheiro}}` → `UNKNOWN_FILTER`; `{{cliente.nome` → `UNCLOSED_VARIABLE`; `<script>` some no salvar.
- Prévia com `data: { contrato: { valor: 104500 }, cliente: { documento: "11144477735" } }` → "R$ 1.045,00", "mil e quarenta e cinco reais", "111.444.777-35"; variável sem valor em `missing`.
- Valor com `<b>` aparece escapado.
- PDF: mesmo HTML → mesmo arquivo (cache); contrato enviado tem `documentSha256` igual ao SHA-256 do arquivo salvo.
