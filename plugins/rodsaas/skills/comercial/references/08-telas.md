# 08 · Telas

Tudo em `web/src/features/comercial/` (rotas em `app/(app)/comercial/...`; públicas em `app/(public)/proposta`, `assinar`, `verificar`), com os componentes da base (tabelas, diálogos, `LoadingButton`, estados vazios, skeletons, toasts) e o menu do app (`01-escopo-e-papeis.md`). Dinheiro com `Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' })` a partir dos centavos; entrada de valor por **campo de moeda em centavos** (digitar "150000" → R$ 1.500,00; colar "1.500,00" funciona; nunca `parseFloat`); quantidade aceita vírgula ("1,5"). `VIEWER` vê tudo sem botões de escrita; `SELLER` só vê as próprias propostas e contratos.

## Rotas

| Rota | Tela |
|---|---|
| ★ `/comercial` | **Início**: funil do mês (rascunhos, enviadas, vistas, aceitas — quantidade e valor), taxa de aceite, para aprovar (admin), aguardando assinatura, contratos vencendo (30 dias), propostas vencendo em 2 dias sem resposta, "Integrações com problema" (admin) |
| ★ `/comercial/propostas` | lista com abas Rascunhos · Enviadas · Aceitas · Todas, filtros (situação, vendedor, período, busca por número/título/cliente), totais do filtro, "+ Proposta" |
| ★ `/comercial/propostas/nova` · ★ `/comercial/propostas/[id]/editar` | editor (`04-propostas.md`) |
| ★ `/comercial/propostas/[id]` | detalhe: situação, cliente, itens e totais, plano, validade, aprovação, link público (copiar), rastreio (`viewSummary`), comentários do cliente (responder), aceite (nome, documento, data, IP, hash), versões, linha do tempo, ações (enviar, nova versão, encerrar, mudar validade, cancelar, duplicar, PDF, gerar contrato) |
| ★ `/comercial/contratos` · `/comercial/contratos/novo` · ★ `/comercial/contratos/[id]` | lista por situação; formulário (do zero, existente); detalhe (`05-contratos.md`) |
| ★ `/comercial/assinaturas` · ★ `/comercial/assinaturas/[id]` | envelopes (Em andamento · Concluídos · Recusados/cancelados/vencidos) e detalhe (`06-assinatura.md`) |
| ★ `/comercial/modelos` · `/comercial/modelos/[id]` | modelos por tipo e editor com prévia (`07-modelos-e-pdf.md`) |
| ★ `/comercial/configuracoes` | geral (limite de desconto, teto, validade, aviso prévio, prazo e lembretes de assinatura, código obrigatório, "a empresa assina antes"), condições padrão, integrações (contas a receber, cobranças), papéis (`COM_ADMIN`) |
| ★ `/proposta/[token]` · ★ `/assinar/[token]` · ★ `/verificar` · `/verificar/[codigo]` | páginas públicas (fora do `(app)`, sem casca e sem login) |

## Lista de propostas

Linha (`com-proposal-row`, `data-id`, `data-status`): código ("P-0012 v2"), título, cliente, vendedor (avatar), total avulso + "/mês" se houver, validade (vermelho com rótulo "Vence hoje"/"Vencida"), selo da situação (Rascunho, Aguardando aprovação, Enviada, Vista, Aceita, Recusada, Vencida, Cancelada, Substituída) e "vista há 2 h" quando houver. Vazio: "Nenhuma proposta ainda" com "+ Proposta" e "Usar o modelo pronto". No celular, cartões.

## Editor

Duas colunas no desktop (formulário · resumo fixo com os totais); uma coluna no celular com os totais num rodapé fixo. Linhas de item são cartões no celular. O total (`com-proposal-total`, `data-cents` = `oneTime.totalCents`) e o mensal (`com-proposal-monthly`, `data-cents`) mudam a cada tecla (lib no front); o salvo é o do servidor. Faixa de aprovação (`com-approval-warning`) quando `needsApproval`. Erros do servidor no campo pelo `path` (`com-field-error`, `data-path="items.0.qty"`). "Salvar" (`com-proposal-save`) cria/atualiza e leva ao detalhe.

## Página pública da proposta

Mobile primeiro, marca da empresa. Opcionais com caixa (`prop-optional`, `data-id`) que recalcula o total (`prop-total`, `data-cents`). Rodapé fixo com **Aceitar** (`prop-accept`) e **Recusar** (`prop-reject`). Diálogo do aceite: nome (`prop-accept-name`), CPF/CNPJ com máscara (`prop-accept-document`), "Li e concordo" (`prop-accept-agree`), confirmar (`prop-accept-confirm`); erros no campo (`prop-field-error`, `data-path`). Aceita: tela de sucesso (`prop-accepted`) com "Baixar PDF". Faixas de situação (`prop-status`, `data-code` com o código do `canDecide` ou `OK`).

## Página de assinatura

Mobile primeiro. Documento rolável (`sign-document`); faixa de situação (`sign-status`, `data-status` = situação do envelope ou `WAITING`/`SIGNED` do signatário) com quem falta (`sign-waiting`). **Assinar** (`sign-start`) abre o diálogo: "Enviar código" (`sign-send-code`; contagem de 60 s para reenviar), código com 6 caixas ou um campo numérico com `autocomplete="one-time-code"` (`sign-code`), nome (`sign-name`), CPF/CNPJ (`sign-document-number`, só se exigido), concordância (`sign-agree`), "Assinar" (`sign-confirm`); erro do servidor (`sign-error`, `data-code`: `INVALID_CODE` → "Código incorreto. Restam N tentativas."). Assinado: `sign-done` ("Assinatura registrada. Você receberá o documento final por e-mail quando todos assinarem."). **Recusar** (`sign-refuse`) com motivo.

## Verificação

`/verificar` (`verify-page`): campo do código (`verify-code-input`) com "Verificar" e "ou envie o PDF" (`verify-file`, hash no navegador). Resultado (`verify-result`, `data-valid="true|false"`) com os signatários (`verify-signer`).

## Estados e interações

- Carregando: skeleton com o formato; erro: `error-state` com tentar de novo; vazio que ensina.
- Toda ação com `LoadingButton` e toast; "Desfazer" quando dá (cancelar rascunho → restaurar).
- Ações irreversíveis (enviar, cancelar envelope, encerrar contrato) com confirmação dizendo o que acontece ("O cliente recebe o e-mail com o link; depois de enviada, a proposta não muda").
- Plano: recurso Pro com selo e "Conheça" (owner) ou "Fale com o responsável"; limite atingido mostra quantas enviadas no mês.
- Atalhos: `N` nova proposta, `/` busca.
- Celular sem rolagem lateral em todas as rotas (inclusive públicas); tabelas viram cartões abaixo de 640 px; tema escuro; cor nunca sozinha (selo sempre com texto).

## Contrato testável (testids)

| Testid | Onde |
|---|---|
| `com-home`, `com-to-approve`, `com-awaiting-signature`, `com-expiring` | Início |
| `com-proposals-tab` (`data-tab="rascunhos\|enviadas\|aceitas\|todas"`), `com-proposal-new`, `com-proposal-row` (`data-id`, `data-status`) | Lista de propostas |
| `com-proposal-form`, `com-proposal-title`, `com-client-name`, `com-client-email`, `com-client-document`, `com-item-add`, `com-item-row` (`data-index`), `com-item-description`, `com-item-qty`, `com-item-price`, `com-item-discount`, `com-item-recurring`, `com-item-optional`, `com-global-discount`, `com-proposal-total` (`data-cents`), `com-proposal-monthly` (`data-cents`), `com-approval-warning`, `com-field-error` (`data-path`), `com-proposal-save` | Editor |
| `com-proposal-detail`, `com-proposal-status` (`data-status`), `com-proposal-send`, `com-send-confirm`, `com-public-link` (`data-url`), `com-copy-link`, `com-new-version`, `com-approve`, `com-reject-approval`, `com-views`, `com-timeline` | Detalhe da proposta |
| `prop-page`, `prop-status` (`data-code`), `prop-total` (`data-cents`), `prop-optional` (`data-id`), `prop-accept`, `prop-accept-name`, `prop-accept-document`, `prop-accept-agree`, `prop-accept-confirm`, `prop-field-error` (`data-path`), `prop-accepted`, `prop-reject` | Página pública da proposta |
| `com-template-row` (`data-id`, `data-kind`), `com-template-new`, `com-template-editor`, `com-template-variable`, `com-template-preview`, `com-template-error` | Modelos |
| `com-contract-row` (`data-id`, `data-status`), `com-contract-new`, `com-contract-form`, `com-contract-term`, `com-contract-detail`, `com-contract-send-signature`, `com-contract-renew`, `com-contract-readjust` | Contratos |
| `com-envelope-detail`, `com-signer-row` (`data-id`, `data-status`, `data-order`), `com-signer-copy-link`, `com-envelope-remind`, `com-envelope-cancel`, `com-verification-code` | Envelope |
| `sign-page`, `sign-document`, `sign-status` (`data-status`), `sign-waiting`, `sign-start`, `sign-send-code`, `sign-code`, `sign-name`, `sign-document-number`, `sign-agree`, `sign-confirm`, `sign-error` (`data-code`), `sign-done`, `sign-refuse` | Página de assinatura |
| `verify-page`, `verify-code-input`, `verify-file`, `verify-result` (`data-valid`), `verify-signer` | Verificação |

Os rótulos visíveis são livres (português claro); os testids e as rotas ★ não mudam.
