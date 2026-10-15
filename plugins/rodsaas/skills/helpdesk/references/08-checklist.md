# Checklist final

Confira **usando o app** (API e front rodando), com um owner, um MEMBER atendente, um MEMBER que não é atendente, uma segunda empresa e uma aba anônima para o portal. Use o Mailpit para os e-mails.

## Base e integração
- [ ] typecheck, lint, build e todos os testes (base + presets + helpdesk, com os do `helpdesk-lib` portados) verdes
- [ ] `unaccent` e a configuração `pt_unaccent` criadas pela migration (ou o desvio registrado no README)
- [ ] `rodsaas.json` com `helpdesk` em `presets` e o app em `apps`
- [ ] app Suporte no trilho só para atendentes, menu com visões e contadores, contador no trilho, widgets no Início, busca no Ctrl+K (por número, assunto, contato, artigo)
- [ ] empresa nova nasce com portal, fila Suporte, owner atendente, macros e artigo de exemplo em rascunho

## Chamados e caixa de entrada
- [ ] criar pelo portal, pela equipe (pedido do cliente e mensagem para o cliente), pela API com chave e por e-mail
- [ ] números sequenciais por empresa, sem repetir (20 simultâneos)
- [ ] visões, filtros, busca por `#N`/texto/e-mail, ordenação por prazo, visões salvas, ações em massa, mesclar, spam
- [ ] resposta pública (e-mail com `[#N]`), nota interna (nunca sai), menção, macro com variáveis e ações, anexos, colar imagem, rascunho que sobrevive a recarregar, colisão

## E-mail
- [ ] modo RESEND (com o `/rodsaas:email`): endereço `<slug>@RESEND_DOMAIN` por empresa, handler `helpdesk` no roteador de entrada, encaminhamento do Gmail chegando como chamado e a resposta do cliente voltando para o mesmo chamado
- [ ] caixa IMAP real (Gmail com senha de app ou outra) lendo e respondendo; caixa por webhook com o provedor ou `curl`
- [ ] resposta do cliente pelo cliente de e-mail entra no mesmo chamado (Gmail e Outlook), sem a citação
- [ ] `[#N]` de quem não participa vira chamado novo; resposta automática e devolução não geram confirmação nem loop; nosso endereço não abre chamado
- [ ] imagens externas bloqueadas até "mostrar imagens"; HTML perigoso sanitizado; e-mail com problema aparece em "E-mails com problema" e reprocessa
- [ ] SPF/DKIM explicados no README

## SLA e automação
- [ ] prazos por prioridade em horário comercial (almoço, fim de semana, feriado) e Urgente 24 h; selo com o estado; pausa em Aguardando cliente e retomada; aviso de prazo vencendo e estourado (rode o job com o relógio adiantado)
- [ ] distribuição por rodízio e por carga, só disponíveis, limite de abertos
- [ ] gatilhos com condições e ações; inativo não roda; ordem respeitada
- [ ] fechamento automático, lembrete ao cliente, resolução automática (se ligada)

## Portal, chamado do cliente e widget
- [ ] central com busca em português sem acento, categorias, artigo com "isso ajudou?", relacionados; rascunho e interno nunca aparecem
- [ ] abrir chamado com sugestões, erros nos campos, anexos, confirmação com número; e-mail de confirmação
- [ ] chamado do cliente: só mensagens públicas, responder (reabre), "isso resolveu", avaliação (GET do e-mail não grava), fechado → chamado novo
- [ ] meus chamados por link mágico
- [ ] widget num HTML de teste: abrir, buscar, abrir chamado, `RodsaasHelpdesk.open()`

## Relatórios e integrações
- [ ] relatórios conferidos com poucos dados (números batem com a lista); CSV
- [ ] CRM: contato ligado, aba Chamados, abrir chamado do CRM
- [ ] Forms: campos do chamado; formulário vira chamado
- [ ] webhooks assinados, sem notas internas por padrão; chave da API mostrada uma vez e revogável

## Operação avançada (`09`)
- [ ] clientes por domínio (nunca gratuito) com SLA próprio e piso de prioridade; selo do cliente no chamado
- [ ] contrato de horas: lançar tempo, saldo do ciclo, aviso aos 80%, excedente com valor (e faturar no Financeiro quando instalado)
- [ ] dividir chamado pela tela; aprovação de membro e de fora pelo link; prazo pausado enquanto espera
- [ ] categorias com campos no portal, no widget e na equipe; sugestão de artigos no chamado e no portal
- [ ] WhatsApp pelo motor: mensagem abre ou entra no chamado, resposta pública sai (modelo fora da janela), nota nunca
- [ ] chat no widget: online/offline, conversa vira chamado `CHAT`, visão "Chats ao vivo"

## Perfis (`10`)
- [ ] cada perfil aplica vocabulário e categorias uma vez só; trocar não apaga nada
- [ ] assistência técnica: OS com equipamento, fluxo, orçamento com peças do ERP, aprovação do cliente, baixa na entrega, garantia, comprovante de entrada
- [ ] software: bug vira tarefa e a conclusão volta para o chamado; TI interno e condomínio com as categorias e a aprovação

## Segurança
- [ ] outra empresa não vê nada (404); membro que não é atendente recebe 403; visibilidade por fila
- [ ] token de um chamado não abre outro; cada destinatário com o seu link; links sem dados de outros clientes
- [ ] senhas de caixa criptografadas, tokens e chaves só como hash

## Estados e acabamento
- [ ] cada linha das tabelas de `07-interacoes-e-estados.md` conferida
- [ ] claro/escuro, 360 px, teclado (atalhos)
- [ ] `/rodsaas:verify` verde, incluindo a parte do Suporte (`-g "Helpdesk"` roda só ela)
- [ ] README do projeto atualizado (o que o Suporte faz, tabelas públicas sem RLS, variáveis, como conectar o e-mail, SPF/DKIM, fora da v1)
- [ ] **conferência final**: tabela item a item de `04-portal-e-widget.md` e `05-app-interno.md` com ✅/❌; nenhum ❌ sem pendência registrada no relatório
