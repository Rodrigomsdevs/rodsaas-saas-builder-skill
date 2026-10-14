# 09 · Checklist final

Confira **usando o app** (API e front rodando), com: o owner (`COM_ADMIN`), uma pessoa `SELLER`, outra `SELLER`, uma `VIEWER`, um membro sem papel, uma segunda empresa, abas anônimas para a proposta e a assinatura, o Mailpit e o Gotenberg. Cada item ✅ com o arquivo/tela onde está; o que faltar vira pendência no relatório.

## Base e integração
- [ ] typecheck, lint, build e todos os testes (base + presets + comercial, com os do `comercial-lib` portados) verdes
- [ ] `rodsaas.json` com `comercial` em `presets` e o app em `apps`; `COM_ENCRYPTION_KEY`, `COM_PDF_ENGINE`, `GOTENBERG_URL` no `.env.example` com instrução; Gotenberg no `docker-compose`
- [ ] app só para quem tem papel; menu e badge; widgets no Início; busca no Ctrl+K
- [ ] ativação cria configurações, modelos prontos e o papel do owner (uma vez só)
- [ ] avisos registrados no catálogo e disparados nos eventos; e-mails a clientes/signatários com a marca da empresa e `reply-to` do vendedor
- [ ] planos (`comProposalsMonthly`, `comEnvelopesMonthly`, `com_*`) ou workstation (por vendedor, acesso pelo papel, rotas públicas fora do guard)
- [ ] **nenhum `Float`** no schema nem `parseFloat` no caminho do dinheiro; quantidade `Decimal(12,3)`

## Propostas
- [ ] itens com quantidade fracionada, unidade, desconto % ou R$ (nunca os dois), recorrentes separados, opcionais (marcado ou não)
- [ ] desconto geral só no avulso; totais do servidor iguais à prévia do editor
- [ ] plano à vista, parcelado e entrada + parcelas, com o centavo certo e mesmo dia do mês
- [ ] vendedor acima do limite → aguardando aprovação; admin aprova/recusa (comentário obrigatório na recusa); enviar bloqueado antes
- [ ] enviar: e-mail com link, validade gravada, numeração `P-0001` sem buraco; limite do plano no enviar
- [ ] enviada não muda (409); nova versão (mesmo número, link antigo "substituída"); encerrar, mudar validade, cancelar, duplicar
- [ ] página pública no celular com a marca, opcionais recalculando, PDF
- [ ] rastreio: primeira visualização avisa o vendedor; tempo de leitura somado; prévia interna não conta
- [ ] aceite com nome completo, CPF/CNPJ válido, concordância; grava IP, navegador, opcionais, totais e SHA-256; dois cliques não aceitam duas vezes
- [ ] recusa com motivo; comentários do cliente e resposta
- [ ] integrações: negócio ganho no CRM; contas a receber (e cobranças, se ligado) no Financeiro iguais ao cronograma; falha vai para "Integrações com problema" com tentar de novo

## Modelos e PDF
- [ ] editor com inserir variável (lista da API) e blocos; prévia com proposta/contrato real
- [ ] variável/filtro/bloco inválido → 400 no salvar; HTML sanitizado (sem `script`, `on*`, `iframe`)
- [ ] filtros `moeda`, `data`, `extenso`, `documento`, `maiusculas`; valores escapados; faltando listado
- [ ] modelos prontos de proposta, contrato e aditivo
- [ ] PDF pelo Gotenberg (A4, cabeçalho, rodapé com página, quebra de página), cache pelo hash

## Contratos
- [ ] da proposta aceita (partes e valor do aceite), do zero e existente com PDF (e importação CSV)
- [ ] vigência e aviso prévio calculados; situações vigente, vencendo, renovando, encerrado
- [ ] editar só em rascunho (409 depois); renovação manual e automática (job idempotente); reajuste com histórico
- [ ] aditivo com assinatura própria; encerramento com data e motivo; Financeiro acompanha (estende, reajusta, para)
- [ ] aviso de vencimento uma vez por período

## Assinatura
- [ ] envelope com partes, testemunhas e aprovadores; ordem sequencial e paralela; e-mail só para quem está na vez
- [ ] link por signatário (copiar para WhatsApp); código de 6 dígitos só no e-mail (hash no banco, 10 min, 5 tentativas, 1 por minuto)
- [ ] assinar com nome, documento e concordância; evidências (IP, navegador, horário) gravadas
- [ ] recusa encerra e devolve o contrato a rascunho; cancelar; lembretes automáticos e manuais; vencimento
- [ ] conclusão: PDF final = original intacto + folha de assinaturas com manifesto, SHA-256 e código; e-mail com o PDF para todos
- [ ] verificação pública por código e por arquivo (hash no navegador), sem dados pessoais além de nomes e datas
- [ ] texto jurídico correto ("assinatura eletrônica", MP 2.200-2/2001), nunca "assinatura digital"

## Telas e qualidade
- [ ] todas as rotas e testids do contrato (`08-telas.md`)
- [ ] celular sem rolagem lateral (inclusive as páginas públicas); tema escuro; cor nunca sozinha
- [ ] estados de carregando, vazio, erro e sem permissão
- [ ] papéis: vendedor não vê o do outro (404), `VIEWER` não escreve, sem papel 403
- [ ] RLS: a segunda empresa não vê nada (API, telas e links públicos de outra empresa não vazam ids)
- [ ] `/rodsaas:verify -g "Comercial"` verde (e a bateria completa sem regressão)
- [ ] README do projeto: o que o Comercial faz, papéis, como subir o Gotenberg, validade jurídica da assinatura (e o que fica fora: ICP-Brasil), o que ficou fora da v1
