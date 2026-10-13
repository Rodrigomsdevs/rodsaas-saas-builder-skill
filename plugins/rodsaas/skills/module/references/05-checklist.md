# Checklist do módulo

## Especificação
- [ ] `rodsaas/modules/<name>.json` passa no validador
- [ ] resumo aprovado pelo usuário (ou escolhas registradas, se ninguém acompanhava)
- [ ] módulo listado em `rodsaas.json` (`modules`)

## API
- [ ] migration com `ENABLE` + `FORCE` RLS e policy; trigger de mesma empresa em cada relação
- [ ] schemas de entrada estritos e de saída com nome no OpenAPI
- [ ] repository sempre com `organizationId`; service monta dados campo a campo
- [ ] rotas com `roles`, `audit`, `idempotent` e `limit` conforme a especificação
- [ ] `/options` funcionando (usado pelos selects de relação)
- [ ] testes: CRUD, paginação, isolamento, relação cruzada, restrict/cascade, permissões, validações por tipo, unique por empresa, filtros, limite

## Painel
- [ ] tipos regenerados (`api:types`) e nenhum tipo do módulo declarado à mão
- [ ] item no menu com ícone e permissão
- [ ] lista: busca, filtros e ordenação na URL; estados completos; celular vira cards
- [ ] quadro (se houver): arrastar muda o status e desfaz em erro
- [ ] formulário: máscaras BR, erros no campo, alterações não salvas, gênero certo no título
- [ ] detalhe: campos formatados, abas de relação com criar já ligado, 404 com casca
- [ ] excluir: confirmação com aviso de cascade ou mensagem do restrict

## Verificação no app (abra e teste)
- [ ] criar, editar, filtrar, buscar, ordenar e excluir
- [ ] usuário de outra empresa não vê nem acessa por URL (404)
- [ ] MEMBER sem permissão não vê os botões e recebe 403 se tentar pela API
- [ ] typecheck, lint, build e todos os testes verdes; commit feito
