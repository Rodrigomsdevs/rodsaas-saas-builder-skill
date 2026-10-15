# Cenários e causas comuns de falha

Cada teste prova um comportamento que o usuário percebe. Quando falhar, comece pela coluna "causas comuns" — são os erros que aparecem com mais frequência em projetos gerados por IA.

## Pré-requisitos que derrubam vários testes de uma vez

| Sintoma | Causa | Correção |
|---|---|---|
| quase todos falham no primeiro `expect(app-shell)` | testids ausentes | rode `audit.mjs` e acrescente os atributos |
| cadastro/login pela API dá 403 | a checagem de Origin não aceita o `APP_URL` do `.env` da API | `APP_URL` igual ao endereço do painel (mesmo host e porta) |
| login funciona na API mas a tela continua deslogada | painel e API em hosts diferentes (`localhost` × `127.0.0.1`): cookie não é compartilhado | use o mesmo host nos dois (`rodsaas.json → domains`) |
| todos os testes de e-mail falham | Mailpit fora, SMTP apontando para outro lugar, fila (pg-boss) sem worker, ou `RESEND_API_KEY` preenchida em dev (o e-mail vai pelo Resend, não pelo Mailpit: use `MAIL_DRIVER=smtp`) | suba o Mailpit; `SMTP_HOST/PORT` da API; worker de e-mail registrado no boot |
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

## Acessos da pessoa (`23-acessos.spec.ts`, base: `skills/backend/references/10-acessos-por-pessoa.md`)

| Teste | Causas comuns |
|---|---|
| opções e validação | `GET /v1/access/options` ausente (projeto anterior aos acessos: rode o backend/frontend em modo revisão); campos sem tipo `boolean`/`select`/`multiselect`; convite aceitando app ou papel inexistente |
| convite do owner | convite guardando os acessos mas o aceite não aplicando (a pessoa entra sem nada); um app esquecido no aceite; papel de dentro do app (atendente, Financeiro, Comercial) não aplicado; tela da pessoa lendo uma cópia em vez do app |
| ajuste por pessoa | desmarcar não revoga; membro ajustando os próprios acessos |
| admin sem poder dar | admin da empresa dando papel que não dá dentro do app; pedido não criado no aceite (ou sem a origem `INVITE`); admin aprovando o próprio pedido; aprovar não aplica |
| pedido da pessoa | dois pedidos abertos iguais; pedir o que já tem; membro listando os pedidos de todos; recusa que deixa o pedido aberto; aprovar duas vezes |
| workstation | assento ignorado (admin passa do comprado); owner convidando sem confirmar o valor; convite pendente que não reserva assento ou que reserva o próprio no aceite; assento que não sobe no aceite; aprovação sem confirmar o valor |
| tela | convite sem a seção "O que essa pessoa vai usar"; seção desenhada mas não enviada; sem o link "Acessos" na linha do membro; desmarcar na tela da pessoa sem mandar `null` |

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
| botão de assinar | tela feita só como vitrine (sem `plan-subscribe`); botão escondido quando a Stripe não está configurada (deve aparecer: modo de teste em dev, desabilitado com aviso em produção) |
| assinar/trocar/cancelar pela tela | backend sem modo de teste (exige Stripe até em dev); troca só pelo portal da Stripe; tela não relê `me` depois da mudança; `?status=success` esquecido na URL |
| admin com aviso | admin vendo botões de pagamento, ou tela inteira escondida em vez do aviso `billing-owner-only` |
| cadastro com plano | `?plano=` ignorado pelo cadastro |
| celular | menu fixo ocupando a tela; tabela larga sem virar cards |
| tema | `next-themes` sem `attribute="class"` |

## CRM (`09-crm.spec.ts`, preset `crm`)

| Teste | Causas comuns |
|---|---|
| funil padrão | empresa criada sem o conteúdo inicial (gancho de "empresa criada" não chama o seed do CRM); empresas antigas sem o script de instalação |
| totais do quadro | soma feita no front com a página carregada (só 50 cards) em vez de agregação no servidor; negócios ganhos/perdidos somando na coluna |
| perder sem motivo | `requireLostReason` ignorado; motivo validado só na tela |
| outra empresa | busca por `findUnique({ id })` sem `organizationId`; trigger de mesma empresa ausente em `stageId`/`pipelineId` |
| cada vendedor vê os seus | helper de visibilidade aplicado no detalhe mas esquecido no quadro, na lista ou nos totais; 403 em vez de 404; regra "atividade atribuída dá visão" não implementada |
| contato duplicado | e-mail não normalizado (maiúsculas passam); índice único sem `WHERE "deletedAt" IS NULL`; 409 sem `existing` |
| captura sem Origin | a checagem de Origin (CSRF) da base aplicada também à rota pública; rota exigindo cookie |
| chave errada/revogada | revogar só marca `revokedAt` mas a busca ignora; mensagens diferentes para errada e revogada |
| conversão reaproveita contato | conversão sempre cria contato novo; procura por e-mail sem normalizar; `leadId` não gravado no negócio |
| pessoa e empresa nos dois lados | negócio sem `companyId`/`contactId` no model ou no `DealCard`; detalhe do contato/empresa sem `deals`; `contactId: null` ignorado no PATCH; pessoa com empresa principal não preenche a empresa; relação de outra empresa aceita (falta validar no service e o trigger de mesma empresa) |
| produtos somam o valor | total do item calculado no front ou sem desconto (`itemTotal`); valor do negócio não recalculado; `valueMode` não muda para `ITEMS`; valor manual aceito com produtos |
| criar negócio pela tela | campo de moeda mandando "1.500,00" como texto ou 1.5; erro de validação só em toast |
| barra de etapas | clique só muda a tela (sem chamar `move`); `aria-current` fixo na primeira etapa |
| atividade de hoje | data padrão calculada em UTC (vira amanhã à noite no Brasil); próxima atividade não recalculada ao concluir; agenda filtrando por outro responsável |
| aviso de duplicado | formulário fecha ou mostra só um toast genérico no 409 |
| converter lead pela tela | conversão sem navegar para o negócio; lead continua `OPEN`; negócio sem a pessoa do lead ou sem "Lead de origem" (`crm-deal-lead-origin`) |
| vincular pessoa e empresa pela tela | página do negócio **sem as seções Pessoa e Empresa** (versão simplificada); seletor sem `crm-relation-search`/`crm-relation-option` com `data-id`; WhatsApp sem o número normalizado (`wa.me/55…`); card do quadro sem o nome da empresa |
| + Negócio com empresa e pessoa nova | `FormSheet` só com título e valor (sem `field-contact`/`field-company`); seletor sem "Criar «texto»" (`crm-relation-create`) |
| + Negócio no contato | botão abre o formulário vazio, sem a pessoa |
| produtos pela tela | sem a seção de produtos no negócio; escolher produto não preenche o preço; valor do cabeçalho (`crm-deal-value`) não acompanha a resposta da API |
| modo restrito na tela | quadro buscando de uma rota sem o filtro de visibilidade; página do negócio mostrando erro genérico em vez de "não encontrado" |

## CRM · vendas (`28-crm-vendas.spec.ts`, preset `crm`)

| Teste | Causas comuns |
|---|---|
| metas | ganho contado pela data de criação; reaberto continua contando (`wonAt` não limpo); meta da pessoa somando a equipe; ritmo calculado sem contar o dia de hoje; membro vendo a meta individual de outro |
| automação | roda em qualquer etapa (gatilho sem `stageId`); condição ignorada; automação desligada rodando; ação executada duas vezes (sem a chave de idempotência); dono errado na atividade; mover na tela sem disparar o evento |
| sequência | passo seguinte não nasce ao concluir; prazo em dias corridos; ganho sem parar a sequência; pendente fica na agenda depois de parar; inscrição duplicada; negócio fechado aceito |
| mesclar | só copia os campos e deixa os negócios na origem; origem continua aparecendo; escolha do campo ignorada; contato de outra empresa aceito |
| modelos de e-mail | variável desconhecida salva; mandado com "Olá ," quando falta dado; e-mail sem virar atividade |
| pontuação | sem teto/piso; temperatura com limites fixos; não recalcula ao editar; lista sem ordenar no servidor |
| WhatsApp do negócio | link sem o texto da mensagem pronta; sem motor quebrando em vez de devolver o link; texto livre fora da janela; resposta do cliente sem parar a sequência; mensagem sem o `ref` do negócio |
| perfis | funil e mensagens duplicados ao aplicar de novo; padrão trocado com negócios no funil antigo; automação do perfil já ligada ou com a etapa de outro funil; vocabulário fixo |
| imóveis | código repetido aceito; vendido ou acima do preço nos compatíveis; bairro desejado sem prioridade |
| telas | meta em reais lida como centavos; "Parar" sem chamar a API; mesclar invertendo destino e origem |
