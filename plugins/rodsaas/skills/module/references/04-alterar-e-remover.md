# Alterar ou remover um módulo

Sempre na mesma ordem:

1. **Atualize a especificação** (`rodsaas/modules/<name>.json`) e rode o validador.
2. **Mostre o que muda** e, se houver risco de perder dados, quanto ("o campo Observação tem conteúdo em 128 clientes").
3. Migration com `--create-only`, **revise o SQL** gerado pelo Prisma (ele às vezes faz `DROP` + `ADD` onde deveria renomear), ajuste e aplique.
4. Atualize todas as camadas: schemas, service, repository, rotas, OpenAPI → tipos do front → formulário, colunas, filtros, detalhe.
5. Testes e commit (`feat(<name>): ...` ou `refactor(<name>): ...`).

## Casos

| Pedido | Como fazer |
|---|---|
| **Adicionar campo opcional** | coluna nullable; nada quebra |
| **Adicionar campo obrigatório** numa tabela com dados | pergunte o valor para os registros existentes; migration: adiciona nullable → preenche → `SET NOT NULL` |
| **Renomear campo** | `ALTER TABLE ... RENAME COLUMN` (nunca drop + add, que apaga os dados) |
| **Remover campo** | confirme mostrando quantos registros têm valor; com confirmação, remova do código primeiro e da tabela na mesma entrega (projeto ainda sem deploy contínuo); em produção com deploy, faça em duas entregas: para de usar → depois remove a coluna |
| **Trocar o tipo** | só conversões seguras automáticas (`text` → `longtext`, `integer` → `decimal`, `select` → `status`); outras exigem um SQL de conversão revisado e confirmação, mostrando o que não converte |
| **Nova opção de status/select** | `ALTER TYPE ... ADD VALUE` (status) ou só a especificação (select); atualize rótulo e cor |
| **Remover opção** | pergunte para qual opção mover os registros que a usam; migra antes de remover |
| **Tornar `unique`** | verifique duplicados por empresa antes; se houver, mostre e peça para resolver |
| **Relação nova** | coluna nullable (ou obrigatória com valor para os existentes) + trigger de mesma empresa |
| **Mudar `onDelete`** | troca a constraint; avise o efeito (cascade passa a apagar dependentes) |
| **Ligar `planLimit`** | contador em `usage.ts`, chave em todos os planos, aviso se alguma empresa já passa do limite (ela não perde dados; só não cria mais) |
| **Mudar permissões** | só `config.roles` nas rotas e o `Can` nas telas; teste de permissão atualizado |
| **Novo índice / ordenação** | `sort: true` só em campo obrigatório; índice `(organizationId, campo, id)` |

## Remover o módulo inteiro

1. Liste o que depende dele: relações de outros módulos para ele, itens de plano, menu, audit, dados existentes (quantidade).
2. Se outro módulo tem `relation` para ele, isso precisa ser resolvido primeiro (remover o campo de relação lá, com a mesma confirmação).
3. Confirmação explícita do usuário, com a quantidade de registros que serão apagados.
4. Remova: rotas, service, repository, schemas, testes, registro no app, contador e chave de plano, telas, feature do front, item no menu do app (e a rota em `match`; app Cadastros sem módulos sai do registro), abas de relação em outros módulos, e a tabela (migration com `DROP TABLE` e do enum de status, se houver).
5. Apague a especificação e tire o módulo de `rodsaas.json`.
