# 04 · Checklist final

Confira **usando o app** com o driver falso, uma segunda empresa e a Agenda (se instalada).

- [ ] typecheck, lint, build e testes (com os do `whatsapp-lib` e a bateria de contrato do driver) verdes
- [ ] `rodsaas.json → addons` com `whatsapp`; `WHATSAPP_ENCRYPTION_KEY` no `.env` (32 bytes em base64)
- [ ] conectar pela tela com o driver de teste; segredo do webhook mostrado uma vez; modelos do sistema criados
- [ ] mandar modelo com variáveis; texto livre bloqueado fora da janela e liberado depois de o cliente responder
- [ ] webhook com assinatura errada recusado; repetido não duplica; status ✓ → ✓✓ → lida, nunca para trás
- [ ] PARAR bloqueia em todos os apps; VOLTAR libera
- [ ] número sem WhatsApp falha com o motivo em português; erro que repete tenta de novo sozinho
- [ ] Agenda: agendar com telefone manda a confirmação; responder "1" confirma a presença
- [ ] CRM/Suporte/Comercial/Financeiro: cada ligação de `03` conferida (ou pendência registrada se o app não está instalado)
- [ ] segunda empresa não vê nada; credenciais só criptografadas no banco
- [ ] `/rodsaas:verify -g "WhatsApp"` verde
- [ ] README do projeto: como trocar de driver (Meta, Zenvia, RodTicket), variáveis, o que ficou fora
