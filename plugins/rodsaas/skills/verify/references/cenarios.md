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
| todos os tipos e resumo | tipos faltando no esquema ou no público; validação brasileira (CPF, CNPJ, telefone) só no front; resumo calculado no front ou sem o `summarize` (opções, NPS, sim/não, média) |
| CSV | sem BOM (acentos quebram no Excel); separador `,`; fórmula sem o `csvSafe` |
| paleta | construtor só com alguns tipos (os 20 de pergunta precisam estar na paleta) |

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
| rodízio | "qualquer um" atendendo sempre a primeira pessoa (falta o `pickHost`); membro sem agenda padrão; página pública devolvendo quem atende |
| turma | vagas ignoradas (uma pessoa fecha o horário) ou sem limite; `seatsLeft` ausente |
| encaixe interno | encaixe sem checar a disponibilidade (ou recusando mesmo com a confirmação); sobreposição aceita quando `outsideAvailability: true` |


## Agenda · operação do balcão (`25-agenda-operacao.spec.ts`, `/rodsaas:agenda` fases 8 e 9)

| Teste | Causas comuns |
|---|---|
| recursos | recurso só na tela (o motor não recebe `resources`); sem a restrição `EXCLUDE` no `AppointmentResource`; sempre a primeira sala em vez da livre; sala ocupada por outro tipo não contando |
| combo | horários com a duração só do principal; preço do combo calculado no front; qualquer serviço aceito como adicional |
| bloqueio | bloqueio fora do `busy`; bloquear por cima de agendamento; apagar sem liberar |
| série | horário local que anda uma hora no horário de verão; conflito engolido sem aparecer em `conflicts`; `fail` criando parte da série; "esta e as próximas" cancelando a série toda |
| lista de espera | cancelamento sem oferecer a vaga; oferta para o último em vez do primeiro; oferta sem segurar o horário; aceitar duas vezes; mesma pessoa duas vezes na lista |
| sinal | agendamento confirmado sem esperar o pagamento; `AWAITING_PAYMENT` fora do `busy`; webhook de pago sem confirmar; link da videochamada antes de pagar; devolução que ignora quem cancelou ou a antecedência; sinal pelo preço todo |
| faltas | contador de faltas não usado no agendamento público; regra `depositAfterNoShows` só na tela |
| confirmação e WhatsApp | confirmar sem gravar `clientConfirmedAt`; confirmar cancelado; mensagem com o link da página em vez do link do cliente; telefone sem normalizar (`wa.me` quebra) |
| recepção | check-in dias antes; concluir antes de começar ou duas vezes; pagamentos que não fecham aceitos; produto comissionando como serviço; comissão recalculada com a regra nova no extrato; concluir em período fechado; fechamento por cima de outro |
| clube | clube só marcando a forma sem zerar o preço; usos contados só depois de concluir (agenda dois no mesmo mês de graça); cancelado gastando uso; assinatura duplicada |
| fidelidade | resgate sem prêmio; resgate que cobra; resgate que não gasta o prêmio |
| fila do dia | previsão sem a duração; chamar com o profissional ocupado; chamado sem chegada; chamado continuando na fila; concluir sem liberar o resto do horário |
| clínica | qualquer convênio aceito; página listando convênios que o procedimento não aceita; anamnese em toda consulta; retorno contado de hoje em vez do atendimento |
| perfil | perfil inválido aceito; página pública com as palavras fixas |
| ficha | falta que some da ficha; cliente duplicado por agendamento; anotação que não salva |
| telas | botão de chamar sem chamar; diálogo de concluir sem mandar o produto ou sem o valor do serviço; página escondendo o sinal ou sem mandar o adicional; gerenciar sem o botão de confirmar |
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
| macro | variáveis sem `renderTemplate`; aplicar já gravando (deveria só preencher o rascunho) |
| mesclar | conversa não copiada para o destino; link antigo do cliente deixando de abrir; mesclar consigo mesmo aceito |

## Tarefas (`14-tarefas.spec.ts`, preset `tarefas`)

| Teste | Causas comuns |
|---|---|
| fluxo padrão e código | projeto inicial "Primeiros passos" (PP) não criado com a empresa; número calculado com `count + 1` fora de trava (simultâneas repetem) ou contador da empresa em vez do projeto |
| quadro e conclusão | quadro com colunas fixas em vez dos status do projeto; `completedAt` não preenchido/limpo ao mudar de categoria |
| subtarefas, checklist e vínculos | detalhe sem `subtaskList`/`checklist`/`links`; vínculo gravado de um lado só (falta o `blocked_by`); subtarefa de subtarefa aceita |
| descrição com versão | salvar sem conferir `descriptionVersion` (o último vence) |
| menção | menção sem notificação; autor notificado da própria ação; quem comenta não passa a seguir |
| cronômetro | dois cronômetros por pessoa; iniciar outro sem lançar o anterior; cronômetro só no front (some ao recarregar) |
| edição em massa | aplica até o primeiro erro (sem transação) |
| projeto privado | filtro de visibilidade só na lista, esquecido no detalhe, no código, no quadro ou na busca; 403 em vez de 404 |
| sprint | iniciar duas ao mesmo tempo; concluir sem mover as pendentes |
| telas | adição rápida sem o `parseQuickAdd` (título com os atalhos); arrastar só na tela; painel sem subtarefas/checklist/comentários ou sem salvar na API; minhas tarefas sem as abas; calendário em UTC (dia errado à noite) |

## Páginas (`15-paginas.spec.ts`, preset `notion`)

| Teste | Causas comuns |
|---|---|
| conteúdo inicial | workspace novo sem "Comece aqui" ou sem o database "Tarefas" com Status, visões e linhas; linhas do database aparecendo na árvore |
| árvore | mover sem checar descendentes (ciclo trava a árvore); posição renumerada ou ignorada |
| autosave com versão | `PATCH` sem conferir a versão; o front reenviando com a versão nova sozinho no 409 (sobrescreve em silêncio) |
| busca e lixeira | busca só no título (sem `contentText`); `portuguese` não usado (plural não acha); excluir o pai sem arquivar os filhos; restaurar só a raiz |
| database | valor sem validar por tipo; pessoa de fora do workspace aceita; filtro da visão aplicado só no front |
| link público | resposta com campos internos; desligar sem apagar o token; publicar sem conferir a feature |
| links perigosos | conteúdo salvo sem sanitizar `href` |
| editor (tela) | `<textarea>` no lugar do editor de blocos (sem `contenteditable` em `page-editor`); autosave só do título; título não atualiza na árvore |
| conflito (tela) | aviso de conflito ausente; recarregar e sobrescrever sem perguntar |
| quadro e tabela (tela) | arrastar só na tela; linha nova sem chamar a API; side peek ausente |

## Notificações (`17-notificacoes.spec.ts`, add-on `notificacoes`)

| Teste | Causas comuns |
|---|---|
| convite aceito | aviso `org.member_joined` não disparado no cadastro com convite (só no `POST /v1/invitations/accept`, ou o contrário); avisando todos os membros em vez de owners/admins; quem entrou recebendo a própria entrada; sem agrupamento (dois aceites = duas notificações); `actor` = o primeiro e não o mais recente; `text` diferente dos `segments` |
| papel alterado e e-mail | `org.role_changed` não disparado; e-mail sem `List-Unsubscribe`/`List-Unsubscribe-Post`; POST de um clique barrado pela checagem de Origin ou exigindo JSON; descadastro desligando também o sino; e-mail imediato esperando o resumo |
| ler, não lida, todas | contador contando lidas; ler/remover sem filtrar `userId` (outra pessoa marca a sua); `read-all` marcando de toda a empresa; `unread=true` (formato antigo) ignorado; remover sem apagar |
| preferências | "no app" desligado ignorado no `notify()`; aviso obrigatório aceitando desligar; tipo desconhecido aceito; `disabledTypes` (formato antigo) ignorado; catálogo mostrando ao membro tipos só de owner; preset instalado sem registrar os tipos dele |
| descadastro | abrir a página (GET) já descadastra (antivírus de e-mail abrem links); desfazer sem efeito; token sem conferir a assinatura |
| sino e painel (tela) | contador sem sumir em zero; abrir a notificação sem marcar como lida; marcar todas só na tela; sem sino no celular (ou dois sinos no DOM) |
| página e preferências (tela) | filtro Não lidas só visual; filtro de app sem a opção Geral; interruptor que não salva; aviso obrigatório sem travar; membro vendo "Pagamento recusado" |

## E-mail (`18-email.spec.ts`, `/rodsaas:email`)

| Teste | Causas comuns |
|---|---|
| assinatura do webhook | `JSON.parse` antes de conferir (o corpo re-serializado não bate); conferência sem o horário (aceita evento capturado reenviado); segredo errado no `.env`; 500 para envio desconhecido ou tipo não tratado (o Resend reenvia sem parar); rota atrás da checagem de Origin |
| supressão | devolução definitiva/spam sem gravar na lista; lista conferida só no driver `resend` (em dev, com Mailpit, o e-mail sai); devolução temporária suprimindo; `RESEND_WEBHOOK_SECRET` ausente no `api/.env` (o teste é pulado) |

## Workstation (`19-workstation.spec.ts`, `/rodsaas:workstation`)

| Teste | Causas comuns |
|---|---|
| teste e catálogo | empresa nascendo no grátis (sem `trial`); `trialEndsAt` em UTC errado; catálogo sem os apps "em breve" ou com preço para eles; app instalado faltando no catálogo |
| onboarding | não desliga os apps não escolhidos; conteúdo inicial criado de novo ao refazer; convites não criados; segmento inválido aceito |
| assinar | itens sem a quantidade de pessoas; total diferente da calculadora (conta separada no front); Completo sem o mínimo de 3; assinar duas vezes |
| acesso por pessoa | acesso só escondido na tela (API responde para quem não tem acesso); dar acesso além dos assentos cobrando sem confirmar; tirar acesso reduzindo a cobrança sozinho |
| fim do teste | bloqueio que esconde os dados (GET 403); app bloqueado aceitando escrita; grátis sem limite de pessoas; assinar não libera na hora |
| telas | onboarding sem os apps da landing marcados; banner do teste ausente; total da assinatura sem as pessoas; mudança sem prévia; app bloqueado sem aviso |

## RH / app Pessoas (`20-rh.spec.ts`, `/rodsaas:rh`)

| Teste | Causas comuns |
|---|---|
| colaborador e ficha | CPF só com máscara, sem dígito verificador; CPF único na base toda (deveria ser por empresa); gestor em ciclo aceito; ficha escondendo o salário só no front (o JSON da API traz `compensation` para colega ou gestor); diretório devolvendo CPF |
| saldo de férias | "30 dias por ano" sem período aquisitivo; faltas (`falta`) não descontando o direito (art. 130); situação `vencida` não calculada; datas com fuso (use `YYYY-MM-DD`, não `Date` com horário) |
| regras do pedido | validação só no front; sexta-feira aceita (2 dias antes do descanso); feriado do local ignorado; 14 dias exigido sempre (deveria ser só quando não sobra como cumprir); venda acima de 1/3 |
| aprovação | aprovador fixo "o gestor" sem fallback para o RH; quem pede consegue aprovar o próprio pedido; recusa sem comentário; pendente não reservando o saldo (dois pedidos com o mesmo saldo); recusa não devolvendo |
| despesas | limite só avisando (sem exigir justificativa); valor em reais com ponto flutuante (use centavos); condição por valor sem a etapa do financeiro |
| documentos e holerites | listagem de documentos sem checar quem pede; casamento por nome em vez de CPF; holerite de outra pessoa acessível pelo id; publicar o lote duas vezes |
| clima | resultado com menos de 5 respostas; recorte pequeno escondido mas descobrível por subtração (sem "outros"); `employeeId`/`userId` gravado na resposta ou devolvido no resultado; responder duas vezes |
| pré-admissão | link sem expirar ou reaproveitável depois de efetivar; efetivar sem conferir os documentos; página pública devolvendo dados internos |
| telas | erro da CLT só em toast (não aparece no trecho); enviar habilitado com erro; abas de salário/documentos aparecendo para colega; caixa de aprovações sem atualizar depois de decidir |

## Financeiro (`21-financeiro.spec.ts`, `/rodsaas:financeiro`)

| Teste | Causas comuns |
|---|---|
| estrutura | plano de contas sem `key` estável ou sem grupo da DRE; saldo da conta guardado num campo (desencontra depois de transferir/estornar); conta Caixa não criada na ativação; limite de contas do plano não conferido |
| validação do lançamento | valor em reais com ponto flutuante (`10.5` aceito); categoria de despesa num a receber; data inexistente (`2027-02-30`) aceita; CNPJ só com máscara, sem dígito verificador |
| parcelas e recorrência | divisão com `Math.round` em cada parcela (soma dá um centavo a mais/menos); "+30 dias" em vez do mesmo dia do mês; dia 31 estourando para o mês seguinte |
| baixa | baixa acima do saldo aceita; juros somados ao pago (quita a dívida errado) ou fora do caixa; estorno que apaga a baixa; "vencido" dependente de job (aparece só no dia seguinte ao job); sem multa/juros sugeridos |
| fluxo de caixa | vencidos fora do previsto; transferência entre contas contada como entrada e saída; saldo inicial sem as contas |
| DRE e inadimplência | DRE pelo vencimento em vez da competência; cancelado entrando no resultado; aporte dentro do lucro; cancelado na inadimplência |
| conciliação | importar o mesmo OFX duas vezes duplica (sem FITID único por conta); OFX SGML não lido (só XML); sugestão sem considerar o tipo pelo sinal; baixa na data de hoje em vez da data do extrato; regra não aplicada; transação conciliada duas vezes |
| cobranças | cobrança marcada como paga ao criar ou pelo retorno do navegador (deveria ser só pelo pagamento confirmado); boleto sem CPF/CNPJ aceito; pagar duas vezes; página pública devolvendo ids internos; cobrar uma despesa |
| papéis e aprovação | admin da empresa vendo o financeiro sem papel; `VIEWER` escrevendo; pagamento acima do limite sem aprovação; `FIN` aprovando; recusa sem motivo |
| telas | campo de valor com `parseFloat` ("1.500,00" vira R$ 1,50); lista que não atualiza depois de baixar; conciliação sem sugestão na tela; página pública sem o modo de teste |

## Comercial (`22-comercial.spec.ts`, `/rodsaas:comercial`)

| Teste | Causas comuns |
|---|---|
| totais e validação | total calculado no front e só gravado; desconto geral aplicado também nos recorrentes (ou ignorado); opcional somado sem o cliente marcar; quantidade com mais de 3 casas aceita; desconto em % e R$ ao mesmo tempo; CNPJ do cliente sem dígito verificador; numeração com `count()+1` (repete em concorrência) |
| aprovação | limite de desconto só como aviso na tela (envia mesmo assim); vendedor aprovando o próprio desconto; recusa sem comentário; aprovar duas vezes |
| envio, página e aceite | proposta enviada ainda editável (deveria virar nova versão); enviar duas vezes; link sem e-mail ao cliente; visualização não registrada (sem `viewedAt`); página pública devolvendo ids internos; aceite sem validar nome completo/CPF/CNPJ/concordância; aceitar duas vezes (sem `FOR UPDATE`); opcional marcado ignorado no total aceito; aceite sem IP ou sem o SHA-256 do que foi aceito; documento gravado com máscara |
| vencida, recusa e versões | "vencida" só por job; recusa sem motivo; nova versão com número novo ou sem marcar a anterior como substituída (o link antigo continua aceitando); nova versão de proposta aceita |
| modelos | variável validada só no front (ou contra a lista de outro tipo); `<script>`/`on*` salvos; valor inserido sem escape; variáveis faltando não listadas na prévia |
| contratos | fim = início + meses × 30 dias; contrato existente salvo como rascunho (não entra em "vencendo"); aviso prévio ignorado; contrato assinado editável; renovação somando dias; reajuste sem arredondar ao centavo ou sem limite; contrato criado de proposta não aceita |
| assinatura | ordem ignorada (testemunha assina antes das partes); assinatura só com o link, sem o código do e-mail; qualquer código aceito; e-mail inteiro na resposta do código; assinar sem nome completo/concordância; PDF final igual ao enviado (sem a folha de assinaturas); código de verificação fora do formato; contrato não vira assinado; verificação sensível a maiúsculas/hífen, sem busca pelo hash ou expondo e-mail |
| recusa e cancelamento | recusa que não encerra o envelope ou não devolve o contrato a rascunho; cancelar que só registra o evento; mesmo e-mail duas vezes; envelope só com testemunhas |
| papéis | vendedor vendo propostas de outro vendedor; `VIEWER` escrevendo; membro sem papel entrando; vendedor mudando limite ou papéis; owner perdendo o papel; proposta de outra empresa acessível pelo id |
| telas | total do editor sem a quantidade; erro do aceite fora do campo; erro da assinatura sem o código; verificação sem os signatários |

## ERP (`24-erp.spec.ts`, `/rodsaas:erp`)

| Teste | Causas comuns |
|---|---|
| produtos | EAN validado só no front (ou sem o dígito verificador); SKU único só na tela; código interno sem dígito; grade que não cria as variações ou cria sem SKU; mudar a grade apagando a variação (perde o histórico) |
| preços | preço calculado no front e só gravado; faixa por quantidade ignorada; tabela de atacado ignorada; o maior entre tabela e faixa em vez do menor |
| estoque | saldo editado direto em vez de movimentação; custo médio não recalculado na entrada; saída acima do disponível aceita (negativo); reserva não descontada do disponível; transferência que só tira da origem; inventário que não gera o ajuste; kit com estoque próprio ou disponível sem dividir pela quantidade do componente; venda do kit sem baixar os componentes |
| orçamento e pedido | frete fora do total; rateio do desconto geral que não fecha no centavo; fração aceita em `UN`; orçamento reservando; confirmar sem checar o estoque; entregar sem tirar a reserva; cancelar sem liberar; pedido confirmado editável; vencido confirmando (status só por job) |
| crédito, desconto e devolução | limite de crédito ignorado ou aplicado no à vista; vendedor acima do desconto máximo; devolução de pedido não entregue; devolução que não volta ao estoque; reembolso do pedido inteiro em vez do proporcional; devolver mais que o vendido |
| PDV | troco em cartão/Pix; venda com pagamento menor que o total; sem `Idempotency-Key` (clique duplo vende duas vezes); dois caixas abertos pela mesma pessoa; venda com caixa fechado; dinheiro da venda fora do esperado; fechamento que mostra o esperado antes de contar ou sempre "OK" |
| compras | frete fora do custo; recebimento acima do pedido aceito; status da compra parado em parcial |
| papéis | membro sem papel entrando; custo visível para vendedor/caixa (deveria vir `null`); caixa cadastrando produto; vendedor vendo pedido de outro |
| integração e relatórios | venda a prazo sem contas a receber, ou uma só com o total em vez de uma por parcela; curva ABC pelo bruto ou sem descontar devoluções |
| telas | dinheiro com `parseFloat`/`parseInt` ("25,90" vira R$ 25,00); margem calculada sobre o custo (markup); saldo inicial ignorado; PDV ignorando "2*código"; código inexistente sem aviso; troco não mostrado; comprovante sem "sem valor fiscal" |

## WhatsApp (`26-whatsapp.spec.ts`, `/rodsaas:whatsapp`)

| Teste | Causas comuns |
|---|---|
| conexão | provedor ou número sem validação; segredo do webhook voltando no GET; modelos do sistema não criados |
| modelos | validação só na tela; nome repetido aceito; modelo reprovado sendo enviado; variável faltando enviada em branco |
| janela de 24 h | texto livre mandado direto (o provedor recusa depois); janela contada pela última mensagem nossa em vez da do cliente |
| webhook | `JSON.parse` antes de conferir a assinatura; evento repetido duplicando a mensagem; status sobrescrito fora de ordem |
| descadastro | PARAR ignorado; VOLTAR sem efeito; descadastro só num app |
| erros | número sem normalizar; erro do provedor mostrado cru (sem tradução); envio sem fila |
| Agenda | confirmação não sai pelo WhatsApp; resposta "1" sem roteamento para o agendamento (ou confirmando no "2") |
| telas | conectar sem mandar o número; caixa sem responder ou com resposta fora da janela |

