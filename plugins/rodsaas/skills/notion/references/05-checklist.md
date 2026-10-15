# Checklist final

Confira cada item **usando o app** (API e front rodando), não só lendo o código.

## Base intacta
- [ ] typecheck, lint, build e todos os testes (os da base + os novos) verdes
- [ ] login, convites, troca de workspace, plano e Stripe continuam funcionando
- [ ] `projects` removido por completo (rotas, tabela, telas, menu, contador), se foi essa a escolha
- [ ] `tenantLabel` "Workspace" com concordância certa nos textos

## Páginas
- [ ] workspace novo nasce com "Comece aqui" e o database "Tarefas"
- [ ] criar, renomear, aninhar em vários níveis, reordenar e mover por arrastar e por "Mover para…"
- [ ] arrastar para dentro de um descendente é bloqueado (front e API)
- [ ] duplicar copia os descendentes
- [ ] ícone, capa (degradê e URL) e largura cheia salvam e aparecem no menu e no início
- [ ] breadcrumbs corretos e clicáveis

## Editor e salvamento
- [ ] todos os blocos da tabela de `03-editor.md` funcionam pelo "/" e pelos atalhos
- [ ] arrastar blocos reordena
- [ ] digitar e esperar → "Salvo"; recarregar a página mantém tudo
- [ ] fechar a aba logo depois de digitar → nada se perde (salvamento imediato ou recuperação do rascunho)
- [ ] internet desligada → indicador "Sem conexão" e salvamento automático quando volta
- [ ] duas abas editando a mesma página → a segunda recebe o diálogo de conflito, e as duas opções funcionam
- [ ] link `javascript:` não sobrevive ao salvar
- [ ] claro e escuro legíveis no editor (texto, cores, código, callout)

## Organização e busca
- [ ] favoritar/desfavoritar e reordenar favoritos
- [ ] recentes no início refletem as visitas
- [ ] excluir manda para a lixeira com as filhas; restaurar devolve o lote; excluir de vez some de verdade
- [ ] Ctrl+K acha por título e por palavra do conteúdo, com trecho destacado; não mostra lixeira nem outro workspace

## Databases
- [ ] criar propriedade de cada tipo e editar células de cada tipo
- [ ] pessoa só lista membros do workspace
- [ ] filtro e ordenação aplicam e ficam salvos na visão
- [ ] quadro: arrastar entre colunas muda o status; "Sem status" funciona
- [ ] side peek abre, edita propriedades e conteúdo com autosave, e o link `?linha=` abre direto

## Compartilhar
- [ ] no plano sem `public_pages`: switch bloqueado com upgrade
- [ ] ligado: link abre sem login, somente leitura, só aquela página
- [ ] desligado ou página na lixeira: link dá 404

## Operação avançada (`06`)
- [ ] comentários: no bloco com trecho, na página, respostas, menções avisam, resolver/reabrir, editar só o autor, conversa órfã
- [ ] histórico: versão por save com a regra dos 10 minutos, lista com autor e resumo, prévia, restaurar como versão nova, retenção do plano
- [ ] arquivos: arrastar, colar e "/arquivo"; imagem com legenda, PDF embutido, card de arquivo; só da empresa e concluído
- [ ] modelos: salvar página como modelo, modelos do perfil, aplicar com variáveis e sub-páginas, modelo de linha
- [ ] permissão: níveis, restrita, herança, cadeado na árvore, some da árvore/busca/favoritos/recentes, 403 nas ações sem nível
- [ ] databases: lista, calendário (arrastar de dia), galeria com capa; filtro e ordenação no servidor
- [ ] relação de mão dupla e rollup calculado; excluir a relação avisa e limpa
- [ ] exportar PDF (tema de impressão), HTML e Markdown, ZIP com sub-páginas

## Perfis (`07`)
- [ ] perfil aplicado sem desligar nada, vocabulário e modelos do perfil
- [ ] manual de processos: verificar com prazo, selo, painel "Para revisar", aviso de vencida, "li e entendi" com pendentes
- [ ] base pública: publicar com endereço único, filhas juntas, navegação, busca, voto, sitemap, despublicar
- [ ] atas: to-dos viram tarefas (responsável, prazo, sem repetir), selo com o código, concluir a tarefa marca o to-do

## Celular
- [ ] menu vira drawer; árvore, editor, busca e side peek usáveis em 360px

## Entrega
- [ ] README do projeto: o que o app faz, como rodar, o que ficou fora da v1 (tempo real, integrações, IA, domínio próprio)
- [ ] testes ponta a ponta: criar página → escrever → recarregar; arrastar na árvore; conflito em duas abas; database em quadro; link público
- [ ] **conferência final**: tabela item a item de `03-editor.md` e `04-frontend.md` com ✅/❌; nenhum ❌ sem pendência registrada no relatório
