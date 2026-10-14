# 07 · Checklist final

Marque cada item olhando o código e rodando, não de memória. O que ficar ❌ vai para o relatório final com o motivo.

## Regras e serviço
- [ ] `notifications-lib` portado para TS com **todos** os testes da lib passando
- [ ] catálogo montado no boot, `validateCatalog` sem erros (boot falha se tiver)
- [ ] nenhum app grava `Notification` direto (procure `notification.create` fora do módulo) nem manda e-mail de aviso para membro por conta própria
- [ ] `notify()` na mesma transação da mudança; tipo desconhecido lança; `url` absoluta recusada
- [ ] ator nunca recebe; não membro e quem não vê não recebem; repetidos viram um
- [ ] app desligado: não cria, não lista, não conta, não manda e-mail
- [ ] preferência por tipo (no app / e-mail) e geral respeitadas; obrigatório não desliga
- [ ] agrupamento com trava: 5 simultâneos → 1 com `count = 5`; lida ou e-mail enviado abre nova
- [ ] `retract()` chamado ao apagar registro e ao perder acesso, em cada app
- [ ] avisos da base: convite aceito (owners/admins), papel alterado (o membro), pagamento recusado, fim do teste, armazenamento (com `uploads`)

## API
- [ ] todas as rotas ★ do `03-api.md` nos formatos do `03` (`text`, `segments`, `actor`, `count`, `url`, `read`…)
- [ ] lista por `updatedAt` com cursor estável, filtros `status`/`unread`/`app`/`type`
- [ ] `unread-count` com `byApp`
- [ ] ler, não lida, todas com `before`, remover; outra pessoa/empresa = 404 sem alterar nada
- [ ] preferências: formato novo e antigo, validação, por empresa
- [ ] descadastro: GET mostra, POST JSON e form One-Click sem Origin, idempotente, desfazer, token ruim → 400

## E-mail e jobs
- [ ] imediato espera 60 s de silêncio e sai em até 3 min; um e-mail por pessoa com os prontos juntos
- [ ] lida antes do envio não manda; preferência desligada depois não manda; dois workers não duplicam
- [ ] resumo às `digestHour` no fuso da empresa, uma vez por dia, só não lidas, vazio não envia
- [ ] `List-Unsubscribe` + `List-Unsubscribe-Post` + `Auto-Submitted` em todo e-mail; link do rodapé abre a página (GET não descadastra)
- [ ] `notifications.sweep` recolhe jobs perdidos; `notifications.cleanup` respeita a retenção
- [ ] registro de canais com o e-mail registrado (ponto de extensão do WhatsApp/push)

## Telas
- [ ] sino no trilho (desktop), no rodapé do menu clássico e no topo do celular; sem o add-on, nenhum sino
- [ ] contador 1…99/99+, some com 0; título da aba com o número; atualiza ao focar e a cada 60 s
- [ ] painel: abas, grupos Hoje/Ontem/Anteriores no fuso, ações por item, marcar todas, ver todas, teclado
- [ ] página: filtros (status, app, tipo) na URL, marcar todas com filtros, seleção em massa, rolagem infinita
- [ ] preferências: e-mail geral, hora do resumo, por tipo agrupado por app, obrigatório travado, salva sozinho
- [ ] descadastro: confirma com botão, desfazer, link inválido
- [ ] todos os estados da tabela do `06` (carregando, vazio, erro)
- [ ] frase montada dos `segments` (procure `dangerouslySetInnerHTML` no módulo: nenhum)
- [ ] todos os testids do "Contrato testável" do `06`

## Fechamento
- [ ] `rodsaas.json → addons` com `notificacoes`
- [ ] README do projeto: o que foi adicionado, como testar, variáveis de produção, fora da v1
- [ ] `/rodsaas:verify -g "Notificações"` verde (e a bateria inteira)
- [ ] **conferência final**: tabela item a item de todas as referências (01–06) com ✅/❌ e o arquivo onde está
