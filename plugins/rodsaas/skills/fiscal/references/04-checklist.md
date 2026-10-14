# 04 · Checklist final

Confira **usando o app** com o driver falso em homologação, uma segunda empresa e o ERP (se instalado).

- [ ] typecheck, lint, build e testes (com os do `fiscal-lib` e a bateria de contrato do driver) verdes
- [ ] `rodsaas.json → addons` com `fiscal`; `FISCAL_ENCRYPTION_KEY` no `.env` (32 bytes em base64)
- [ ] configurar o emitente pela tela; CNPJ errado aponta o campo; regras do Simples criadas; credenciais nunca aparecem de volta
- [ ] emitir NF-e dentro e fora do estado: CFOP certo, chave de 44 dígitos com DV, números seguidos, totais com desconto e frete, XML e DANFE abrem
- [ ] NCM `00000000` rejeita com o motivo em português; corrigir e reenviar autoriza com o mesmo número
- [ ] NFC-e com QR Code; outro estado, acima do limite sem CPF e pagamento menor barrados antes de numerar
- [ ] cancelar no prazo, recusar fora do prazo e repetido; carta de correção só na NF-e, com sequência
- [ ] inutilizar faixa livre; faixa com número usado recusada com a lista; numeração pula a faixa
- [ ] "SEFAZ fora": NFC-e em contingência (tpEmis 9) e autorizada quando volta; NF-e espera; a venda do PDV não trava
- [ ] dois cliques em Emitir não gastam dois números (Idempotency-Key); duas emissões ao mesmo tempo não repetem número (trava)
- [ ] ERP: pedido → NF-e com NCM e cliente; segunda vez recusada; produto sem NCM aponta o item; PDV emite NFC-e quando ligado
- [ ] regime normal: regras marcadas para revisar e emissão bloqueada até revisar; IBS/CBS no XML quando obrigatório
- [ ] segunda empresa não vê nada; certificado/token/CSC só criptografados no banco e fora do log
- [ ] `/rodsaas:verify -g "Fiscal"` verde
- [ ] README do projeto: como trocar de driver (provedor ou SEFAZ), como ir para produção, variáveis, o que ficou fora
