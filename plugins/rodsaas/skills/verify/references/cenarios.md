# Cenários e causas comuns de falha

Cada teste prova um comportamento que o usuário percebe. Quando falhar, comece pela coluna "causas comuns" — são os erros que aparecem com mais frequência em projetos gerados por IA.

## Pré-requisitos que derrubam vários testes de uma vez

| Sintoma | Causa | Correção |
|---|---|---|
| quase todos falham no primeiro `expect(app-shell)` | testids ausentes | rode `audit.mjs` e acrescente os atributos |
| cadastro/login pela API dá 403 | a checagem de Origin não aceita o `APP_URL` do `.env` da API | `APP_URL` igual ao endereço do painel (mesmo host e porta) |
| login funciona na API mas a tela continua deslogada | painel e API em hosts diferentes (`localhost` × `127.0.0.1`): cookie não é compartilhado | use o mesmo host nos dois (`rodsaas.json → domains`) |
| todos os testes de e-mail falham | Mailpit fora, SMTP apontando para outro lugar, ou fila (pg-boss) sem worker | suba o Mailpit; `SMTP_HOST/PORT` da API; worker de e-mail registrado no boot |
| testes demoram muito e acabam em "rate limit persistente" | limite de cadastro/login baixíssimo ou sem `Retry-After` | limites da skill backend (`07-seguranca.md`) e header `Retry-After` no 429 |

## API (`00-api.spec.ts`)

| Teste | Causas comuns |
|---|---|
| RFC 9457 em rota inexistente | `setNotFoundHandler` não registrado; content-type `application/json` em vez de `application/problem+json`; sem `requestId` |
| 401 UNAUTHORIZED sem login | plugin de auth devolvendo 403 ou mensagem sem `code` |
| VALIDATION_ERROR | erro do type provider Zod caindo no 500 genérico; `errors[]` ausente |
| CSRF | checagem de Origin não implementada ou aplicada só em algumas rotas |
| cookies | `refresh_token` com path `/`; `session_hint` httpOnly (o front não lê); **cookie do access com Max-Age de 15 min** (o front nunca renova: ver `04-auth.md` da skill backend) |
| /v1/me completo | `organization` lida do token e não do banco; `plan` ausente para membros |
| criar empresa vira a ativa | criou a empresa mas não emitiu novo access token com o `org` novo |
| não troca para empresa alheia | `switch-organization` sem validar membership |
| isolamento 404 | repository sem filtro de `organizationId` (`findUnique` por id); RLS desligado ou API conectando como dono do banco |
| último owner | regra de "pelo menos um owner" não implementada |
| membro não convida | rota de convite sem `config.roles` |
| reuso do refresh | refresh sem rotação, ou sem revogar a família no reuso |
| logout | logout limpando cookie mas sem revogar o refresh no banco |

## Autenticação (`01-auth.spec.ts`)

| Teste | Causas comuns |
|---|---|
| cadastro leva ao início | redireciona para `/` ou `/dashboard`; seletor sem `org-switcher-current` |
| volta para onde estava | guard não grava `?next=`; login ignora o `next` |
| senha errada | erro só em toast, sem `login-error`; resposta 400 em vez de 401 |
| next externo | `router.push(next)` sem validar que começa com `/` (open redirect) |
| esqueci a senha | tela diferente para e-mail inexistente (revela cadastro); e-mail sem link absoluto; reset sem revogar sessões |
| verificação de e-mail | link apontando para a API em vez do painel; página não chama a API |
| tokens no JavaScript | token devolvido no body e guardado em `localStorage` |

## Sessão (`02-session.spec.ts`)

| Teste | Causas comuns |
|---|---|
| renova uma vez só | o client só renova em `TOKEN_EXPIRED` e ignora `UNAUTHORIZED` com `session_hint`; cada request faz o próprio refresh (sem a promise compartilhada) |
| sem loop | refresh falhando e o client tentando de novo indefinidamente; guard e client brigando por redirecionamento |
| voltar após sair | logout sem `queryClient.clear()`; tela montada com dado em cache |

## Empresas (`03-organizations.spec.ts`)

| Teste | Causas comuns |
|---|---|
| criar pelo seletor | diálogo cria mas não troca; seletor não invalida `me` |
| trocar e persistir | troca só no estado do React, sem chamar `switch-organization`; ao recarregar volta para a anterior |
| dados não aparecem na outra | igual ao isolamento da API; ou página de detalhe sem `notFound()` no 404 |
| cache limpo na troca | troca sem `queryClient.clear()`: a lista da empresa anterior aparece do cache antes de recarregar — o bug mais comum |
| renomear reflete no seletor | salvar sem invalidar `me`/organizações |

## Membros (`04-members.spec.ts`)

| Teste | Causas comuns |
|---|---|
| convite completo | link do e-mail sem `token`; tela de convite exigindo login antes de mostrar a empresa; cadastro por convite criando empresa própria (não passa `invitationToken`) ou não preenchendo o e-mail |
| membro sem ações de admin | botões só desabilitados (devem sumir) ou visíveis; tela de plano acessível a membro |
| promover a admin | select do papel sem salvar; front com papel em cache (não relê `me`) |
| remover corta o acesso | `/v1/me` devolvendo a organização do token; front sem ir para `/sem-empresa` quando `organization` é `null` |

## Módulo de exemplo (`05-module.spec.ts`)

| Teste | Causas comuns |
|---|---|
| estado vazio | lista vazia renderizando tabela sem linhas, sem `empty-state` |
| erro no campo | erro só em toast; `field-error-name` ausente |
| clique duplo | `LoadingButton` sem `disabled` durante o envio; sem `Idempotency-Key` |
| busca na URL | busca em `useState` em vez de na URL (nuqs) |
| upgrade no limite | `PLAN_LIMIT_REACHED` mostrado como toast genérico, sem `upgrade-dialog` |

## Estados, plano, celular (`06`–`08`)

| Teste | Causas comuns |
|---|---|
| 404 interno | sem `app/(app)/not-found.tsx` |
| erro com código e tentar de novo | componente de erro sem `requestId`; erro derrubando a página inteira (`error.tsx`) em vez do bloco |
| skeleton | spinner genérico ou tela em branco enquanto carrega |
| API inacessível | mensagem crua do `fetch` ("Failed to fetch") na tela |
| plano | cards fixos no front em vez de vir de `/v1/billing/plans`; sem `data-plan` |
| celular | menu fixo ocupando a tela; tabela larga sem virar cards |
| tema | `next-themes` sem `attribute="class"` |
