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

## Casca de apps (`10-apps.spec.ts`)

| Teste | Causas comuns |
|---|---|
| pulado: "rodsaas.json sem apps" | projeto anterior ao modelo de apps; rode `/rodsaas:apps` (ou o registro não grava `rodsaas.json → apps`) |
| modo certo | trilho aparecendo com um app só (ou o contrário); seções de vários presets empilhadas num menu só; dois `sidebar`/`org-switcher` no DOM |
| cada app abre o próprio menu | `match` do app sem a rota da tela (app ativo errado); menu montado por seções e não pelo app ativo; `aria-current` ausente no trilho |
| recolher | estado só em `useState` (perde ao recarregar); `localStorage` sem try/catch quebrando a casca |
| menu flutuante | sem atraso de abertura/fechamento; flutuante e coluna aparecendo juntos; só abre com clique |
| Todos os apps | fixados só no `localStorage` (não chama `PUT /v1/me/preferences`); estrela abrindo o app em vez de só fixar; busca só pelo nome exato |
| app desligado | desligar só esconde do trilho (rota ainda abre); `disabledApps` fora do `/v1/me`; com 2 apps não volta ao menu clássico |
| celular | trilho só escondido por CSS (continua no DOM); gaveta sem `data-app`; barra de apps ausente |

## Forms (`11-forms.spec.ts`, preset `forms`)

| Teste | Causas comuns |
|---|---|
| link público só com o publicado | rota pública lendo `draft` em vez da versão publicada; publicar sem copiar o esquema para `FormVersion` |
| envio sem Origin | checagem de Origin/CSRF da base aplicada à rota pública; rota pública exigindo cookie |
| erro em cada campo | validação só no front; erro sem `path: "answers.<id>"`; e-mail não normalizado; campos ocultos não declarados gravados |
| lógica condicional | backend validando com todos os campos (ignora `visibleIf`); resposta de pergunta escondida gravada |
| limite e encerrar | contagem sem trava (corrida passa do limite); `maxResponses` só checado no front; encerrado respondendo 404 em vez de 410 `FORM_CLOSED` |
| campo isca | isca ignorada ou respondendo erro (o robô aprende) |
| respostas só para quem pode ver | rota de respostas sem o helper `canSeeResponses`; 403 em vez de 404 |
| construtor | salvamento automático só mudando o indicador (não chama `PUT /draft`); título não salvo; publicar sem salvar antes |
| formulário público | `<label>` sem ligação com o campo (`for`/`id`); erro da API mostrado só em toast; sem `data-field-id` no bloco |
| uma pergunta por vez | Enter não avança; mostra todas as perguntas |
| lógica ao vivo | condição calculada só no envio; opções sem `<input type="radio">` acessível |
| encerrado | tela branca ou formulário aberto em formulário encerrado |

## Agenda (`12-agenda.spec.ts`, preset `agenda`)

| Teste | Causas comuns |
|---|---|
| horários dentro da disponibilidade | motor próprio em vez do `computeSlots` do `agenda-lib`; fuso da agenda ignorado (horários 3 h deslocados); `days` agrupado em UTC e não no `timeZone` pedido; `PATCH /schedules` sem gravar `weekly`/`timeZone` |
| sem login e sem Origin | checagem de Origin/CSRF da base aplicada às rotas `/v1/public/agenda/*`; página pública exigindo cookie |
| nunca marcar duas vezes | sem a restrição `EXCLUDE` (ou sem `btree_gist`); checar e gravar fora da mesma transação; `23P01` virando 500 em vez de 409 `SLOT_TAKEN`; horário ocupado continuando na página (busy sem os agendamentos) |
| reserva temporária | reserva não entra no `busy` do motor; reserva sem validade; quem reservou também barrado (o próprio `holdId` não é descontado) |
| remarcar e cancelar pelo link | token comparado em texto puro ou sem `AgendaTokenLookup`; cancelar sem tirar o `active` do `AppointmentHost` (horário continua preso); remarcar gerando token novo; cancelar duas vezes sem `CHANGE_NOT_ALLOWED` |
| antecedência e janela | regras só no front (a API aceita qualquer horário); `isSlotAvailable` não chamado no agendar |
| aprovação manual | pendente fora do `busy` (dois pedidos no mesmo horário); recusar sem liberar; link de videochamada enviado antes de aprovar; `requiresApproval` sem a feature `agenda_team` no plano |
| campo isca | isca ignorada ou respondendo erro (o robô aprende) |
| tipo desligado | tipo inativo respondendo 200 ou 404 em vez de 410 `AGENDA_UNAVAILABLE`; tipo inativo ainda listado na página |
| outra empresa | consulta sem `withTenant`/RLS; 403 em vez de 404; página pública devolvendo e-mail da equipe ou dados de clientes |
| página pública | dias sem horário clicáveis; `data-start` ausente; `<label>` sem ligação com o campo ou com outro texto (use **Nome**, **E-mail**, **WhatsApp**); envio rápido demais tratado como robô mesmo depois de 2 s (`_ts` medido errado) |
| calendário e painel | `?data=` ignorado (abre na semana atual); evento sem `data-appointment-id`; painel sem o nome do cliente |
| aprovar e cancelar pelo painel | botão só muda a tela sem chamar a API; cancelar sem `confirm-dialog` |
| cliente cancela pelo link | falta o passo de confirmação `agenda-manage-cancel-confirm`; tela de cancelado aparece mesmo com erro da API |
| criar tipo pela tela | `FormSheet` sem `field-name`/`form-submit`; tipo criado sem a pessoa que criou como quem atende; cartão sem o link público |

## Suporte (`13-helpdesk.spec.ts`, preset `helpdesk`)

| Teste | Causas comuns |
|---|---|
| chamado pelo portal | checagem de Origin/CSRF da base nas rotas `/v1/public/helpdesk/*`; validação só no front; erro sem `path`; e-mail do solicitante não normalizado; `_ts` checado antes da validação (envio vazio rápido vira sucesso falso) |
| número sequencial | `max(number) + 1` fora de trava (simultâneos repetem); contador global em vez de por empresa (`HelpdeskSettings.nextNumber` com `UPDATE … RETURNING`) |
| nota interna nunca vaza | rota pública devolvendo todas as mensagens; e-mail disparado para qualquer mensagem; webhook com notas |
| resposta por e-mail | e-mail não sai pela fila; assunto sem `[#N]`; link do cliente ausente |
| cliente responde, resolve e reabre | resposta do cliente sem `onCustomerReply` (status não volta para Aberto); equipe conseguindo fechar à mão (`canSetStatus`) |
| e-mail recebido | dedupe por `Message-ID` ausente (provedor reenvia e duplica); encadeamento só pelo número (qualquer um escreve num chamado alheio) ou sem conferir o remetente; citação não removida (`stripQuotedReply`); resposta automática abrindo chamado e gerando confirmação (loop) |
| SLA | prazo calculado em horas corridas em vez de `slaDueDates`; nota contando como primeira resposta; mudança de prioridade sem recalcular; "aguardando cliente" sem pausar (`slaPause`/`slaResume`) |
| rodízio | distribuição ignorando "disponível"; `lastAssignedAt` não atualizado (sempre o mesmo atendente) |
| gatilho | comparação sensível a acento/maiúscula (use `fold`); gatilhos rodando depois de gravar sem aplicar; regra inativa rodando |
| satisfação | avaliação aceita com o chamado aberto; GET do link do e-mail gravando a nota |
| base de conhecimento | busca sem filtrar status/interno; artigo em rascunho abrindo pelo link; busca sensível a acento (sem `unaccent`) |
| chave da API | chave comparada em texto puro ou não conferida; `externalId` sem dedupe |
| membro não atendente / outra empresa | rotas sem checar `HelpdeskAgent`; consulta sem `withTenant`/RLS; 403 em vez de 404 para outra empresa |
| portal (tela) | erro da API só em toast (sem `helpdesk-portal-field-error` com `data-field`); `<label>` sem ligação ou com outro texto (use **Nome**, **E-mail**, **Assunto**, **Descrição**) |
| chamado (tela) | editor sem `role="textbox"`; botão de nota enviando como pública; "Atribuir a mim" só mudando a tela; status sem salvar; página do cliente mostrando notas ou sem `data-author` |
| isso resolveu e avaliação | botão de avaliação gravando sem o "Enviar avaliação" (`helpdesk-csat-submit`) |
| central de ajuda | resultado sem `data-slug`; "isso ajudou?" sem chamar a API; sugestões não buscam enquanto digita |
| visões | contadores de todas as visões iguais; "sem responsável" mostrando atribuídos |

