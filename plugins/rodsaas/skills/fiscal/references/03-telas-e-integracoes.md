# 03 · Telas e ligação com os apps

## Telas

| Rota | Tela |
|---|---|
| ★ `/configuracoes/fiscal` | **Emitente** (owner/admin): status (`fiscal-issuer-status`, `data-status` `CONFIGURED`/`PENDING`); formulário (`fiscal-issuer-form`): CNPJ (`fiscal-cnpj`, máscara, busca a razão social se houver connector de CNPJ — opcional), razão social (`fiscal-legal-name`), IE (`fiscal-ie`, com "ISENTO"), UF (`fiscal-uf`), código do município (`fiscal-city-code`, com a busca pelo nome), endereço, regime (`fiscal-regime`: Simples / Simples com excesso / Normal), provedor (`fiscal-driver`, `<select>` com os drivers registrados; "Teste (simulado)" = falso) e os campos de credencial que o driver declara (certificado A1 em arquivo + senha, token…), CSC da NFC-e, séries e próximos números, prazos de cancelamento, limite de identificação da NFC-e, ambiente (produção pede o CNPJ digitado); **Salvar** (`fiscal-save`), erro no campo pelo padrão da base (`field-error-cnpj`, `field-error-ie`…). **Regras de imposto** (`fiscal-rule-row`, `data-review`), com o aviso "Confira com o seu contador" e edição em formulário (quando: operação, destino, consumidor final, NCM que começa com; aplica: CFOP, CSOSN/CST, alíquotas, IBS/CBS) |
| ★ `/fiscal` | **Notas** (quem emite): faixa "Ambiente de homologação: notas sem valor fiscal" (`fiscal-test-banner`) quando `environment = 2`; filtros (modelo, status, período, busca); lista (`fiscal-doc-row`, `data-status`, `data-model`, `data-number`: número, destinatário, valor, status com cor, origem com link para o pedido); **Emitir nota** (`fiscal-new`) abre o formulário (`fiscal-doc-form`): modelo (`fiscal-model`), destinatário (`fiscal-recipient-doc`, `fiscal-recipient-name`, `fiscal-recipient-uf`; busca nos clientes do ERP quando instalado), itens (`fiscal-item-description`, `fiscal-item-ncm`, `fiscal-item-unit`, `fiscal-item-qty`, `fiscal-item-price`; busca nos produtos do ERP preenchendo o NCM), frete, desconto, pagamentos, informações complementares, prévia dos totais e do CFOP que a regra vai aplicar; **Emitir** (`fiscal-emit`); erros no campo de cada `path` |
| ★ `/fiscal/:id` | **Detalhe**: status (`fiscal-doc-status`, `data-status`), chave formatada em grupos de 4 (`fiscal-doc-key`), protocolo, motivo da rejeição em português com **Corrigir e reenviar** (`fiscal-rejection`), totais e impostos por item, **XML** (`fiscal-doc-xml`), **DANFE** (`fiscal-doc-danfe`), **Cancelar** (`fiscal-cancel` → diálogo com a justificativa `fiscal-cancel-reason`, contador de caracteres e o prazo que resta, `fiscal-cancel-confirm`), **Carta de correção** (só NF-e; lista das anteriores), histórico de eventos; contingência mostra "Emitida em contingência — será transmitida quando a SEFAZ voltar" |
| `/fiscal/inutilizar` | modelo, série, de/até, justificativa; lista das faixas inutilizadas |

Estados: sem emitente → vazio que ensina ("Configure o emitente para emitir notas" com o botão); driver falso → faixa "Modo de teste: as notas são simuladas" e o botão **Simular SEFAZ fora do ar** (chama `/fake/outage`); rejeição/contingência → notificação para quem emitiu e para os admins (`fiscal.rejected`, `fiscal.contingency`).

## Ligação com os apps

| App | O que faz |
|---|---|
| **ERP — pedido** | ★ `POST /v1/erp/orders/:id/invoice` **`{ model?: 55 }`** → pedido `CONFIRMED`/`PICKING`/`DELIVERED` (senão 409 `INVALID_TRANSITION`) → itens do pedido com o NCM, a unidade e a descrição do cadastro do produto (sem NCM → 400 em `items.N.ncm` "Cadastre o NCM de <produto>"), desconto da linha e o geral/frete rateados, cliente (documento, nome, endereço/UF) do cadastro, pagamento do pedido, `ref: { app: "erp", entity: "order", id }` → **201 nota**; segunda nota ativa → 409 `ALREADY_INVOICED`. A visão de pedido ganha **`invoice: { id, model, number, status, key } \| null`**; o detalhe do pedido tem **Emitir NF-e** (`erp-order-invoice`) e o selo com o status da nota. Configuração `ErpSettings.invoiceOnDeliver` (padrão desligado) emite sozinho na entrega |
| **ERP — PDV** | `ErpSettings.pdvIssueNfce` (padrão desligado; ligado só com emitente configurado): cada venda do PDV emite a NFC-e com os pagamentos da venda e o CPF se informado ("CPF na nota?" no pagamento); o comprovante vira o DANFE NFC-e com o QR Code; SEFAZ fora → contingência sem travar o caixa; rejeição avisa o `ERP_ADMIN` e a venda continua registrada |
| **ERP — devolução** | devolução de pedido com nota autorizada pergunta: cancelar a nota (no prazo) ou emitir a nota de devolução (operação `RETURN`, CFOP 1202/2202, referenciando a chave) |
| **Financeiro** | conta a receber gerada pelo pedido mostra o número da nota; a **NFS-e** de serviço vem no refactor do Financeiro usando este motor (`01`, "NFS-e") |
| **Comercial** | proposta aceita que vira pedido no ERP segue o fluxo do ERP (nada direto) |

App não instalado: a ligação some; a emissão avulsa pela tela `/fiscal` continua.

## Contrato testável (testids)

| testid | Onde |
|---|---|
| `fiscal-issuer-status` (`data-status`), `fiscal-issuer-form`, `field-error-<campo>`, `fiscal-cnpj`, `fiscal-legal-name`, `fiscal-ie`, `fiscal-uf`, `fiscal-city-code`, `fiscal-regime`, `fiscal-driver`, `fiscal-save`, `fiscal-rule-row` (`data-review`) | Configurações → Fiscal |
| `fiscal-test-banner`, `fiscal-doc-row` (`data-status`, `data-model`, `data-number`), `fiscal-new`, `fiscal-doc-form`, `fiscal-model`, `fiscal-recipient-doc`, `fiscal-recipient-name`, `fiscal-recipient-uf`, `fiscal-item-description`, `fiscal-item-ncm`, `fiscal-item-unit`, `fiscal-item-qty`, `fiscal-item-price`, `fiscal-emit` | Notas |
| `fiscal-doc-status` (`data-status`), `fiscal-doc-key`, `fiscal-rejection`, `fiscal-doc-xml`, `fiscal-doc-danfe`, `fiscal-cancel`, `fiscal-cancel-reason`, `fiscal-cancel-confirm` | Detalhe |
| `erp-order-invoice` | Detalhe do pedido no ERP |
