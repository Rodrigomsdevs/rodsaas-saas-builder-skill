---
name: rh
description: Preset que soma ao projeto rodsaas o app Pessoas, um RH completo no estilo Factorial/Sólides/BambooHR/Gupy — colaboradores com ficha, organograma, cargos e áreas; férias pela CLT (períodos aquisitivo e concessivo, faltas, fracionamento, venda de 1/3, coletivas, vencidas) e ausências legais; motor de aprovações (gestor, papel, valor, delegação) para férias, despesas e solicitações; admissão com link de pré-admissão e checklists de entrada e saída; documentos com validade e ciência, holerites em lote casados pelo CPF; desempenho (ciclos, 9-box, 1:1, feedback, PDI, metas/OKR); clima e eNPS anônimos; despesas com reembolso; autoatendimento; indicadores e fechamento do mês para a contabilidade; LGPD por grupo de campos. Use depois do /rodsaas:backend e /rodsaas:frontend quando o usuário pedir RH, gestão de pessoas, colaboradores, férias, ausências, aprovações, admissão, onboarding, holerites, avaliação de desempenho, OKR, pesquisa de clima, eNPS, despesas, reembolso, ou chamar /rodsaas:rh.
---

# rodsaas · rh (app Pessoas)

Acrescenta ao projeto o app **Pessoas**: tudo o que o RH, os gestores e cada colaborador fazem no dia a dia — da pré-admissão ao desligamento — num lugar só, com as regras da CLT no servidor e o autoatendimento no celular. O preset **soma**: entra como um app na casca de apps (`skills/frontend/references/12-casca-e-apps.md`), sem mexer nos outros apps.

São **7 áreas** sobre uma base comum (colaboradores, organograma, autoatendimento):

| # | Área | O que resolve |
|---|---|---|
| 1 | **Aprovações** | motor único de fluxos (gestor, gestor do gestor, papel, pessoa, condição por valor, "qualquer um" ou "todos", delegação, lembrete); caixa "Para aprovar" para tudo |
| 2 | **Férias e ausências** | saldo por período aquisitivo, pedido com as regras da CLT, calendário da equipe com conflito, coletivas, licenças legais, atestados |
| 3 | **Admissão e desligamento** | link de pré-admissão (a pessoa preenche e envia os documentos), conferência pelo RH, checklists por modelo (RH, gestor, TI, colaborador), boas-vindas, desligamento com entrevista |
| 4 | **Documentos e holerites** | pasta por pessoa com validade e aviso, políticas com "li e concordo", holerites e informes em lote casados pelo CPF (arquivos ou PDF único), ciência de recebimento |
| 5 | **Desempenho** | ciclos (autoavaliação, gestor, pares), competências com peso, calibração 9-box, 1:1 com pauta, feedback contínuo e reconhecimento, PDI, metas/OKR com check-in |
| 6 | **Clima** | pesquisas de clima, eNPS, pulso recorrente e desligamento, **anônimas de verdade** (mínimo de 5 respostas por recorte, sem descoberta por subtração) |
| 7 | **Despesas** | despesas com recibo, km, limites por categoria, relatório para aprovação, fila do financeiro e reembolso |

Tudo da base continua valendo: auth, empresas com RLS, membros, planos (ou a workstation), padrão REST, erros RFC 9457, cursor, OpenAPI → tipos do front, estados de tela, marca, contrato de testids.

## Pré-requisitos

1. `api/`, `web/` e `rodsaas.json` verdes e já na casca de apps (existe `web/src/config/apps.ts`; senão, `/rodsaas:apps` antes).
2. Add-on **`uploads`** (fotos, documentos, atestados, recibos, holerites): sem `uploads` em `rodsaas.json → addons`, rode o `/rodsaas:uploads` antes.
3. Add-on **`notificacoes`**: sem ele, rode o fluxo da skill `notificacoes` primeiro. Todos os avisos deste preset passam pelo catálogo e pelo `notify()` dele (`references/01-escopo-e-papeis.md`, seção "Avisos"); nada é enviado por conta própria.
4. Add-on **`email`** recomendado (convite da pré-admissão e envio do fechamento para a contabilidade saem pelo Resend); sem ele, os e-mails saem pelo transporte da base (Mailpit em dev).
5. Fila de jobs da base (pg-boss): lembretes de aprovação, férias vencendo, documentos vencendo, pulso do clima, aniversários.
6. Mesma regra de versões das outras skills: `npm view` + doc atual para cada pacote novo (`pdfjs-dist` para ler o texto dos holerites, `pdf-lib` para separar páginas, `archiver`/`yauzl` para ZIP).
7. Com a `/rodsaas:workstation`, o app vende pela **Suíte RH** (por colaborador); leia `references/01-escopo-e-papeis.md`, seção "Workstation".

## Como trabalhar (obrigatório)

1. **Leia a referência da fase inteira antes de começar a fase**, do início ao fim, não por amostragem nem resumo. Cada fase aponta o arquivo (→ `references/...`).
2. **Tudo o que está nas referências é escopo da v1**, exceto o que está marcado como fora da v1. Nada de "versão simplificada", "básico por enquanto" ou "dá para melhorar depois": férias sem período aquisitivo, aprovação sem delegação, holerite sem casamento por CPF ou pesquisa "anônima" que guarda quem respondeu **não são** o Pessoas desta skill.
3. **O contrato testável (testids e rotas ★) é o mínimo que o `/rodsaas:verify` consegue conferir, não o escopo.** Passar no verify não significa que a fase acabou.
4. **Conferência ao fim de cada fase**: antes do commit, monte uma tabela com **cada item** da referência da fase (cada linha de tabela e cada marcador) e o status ✅ feito / ❌ faltando, com o arquivo onde está. Só avance com tudo ✅; o que não der para fazer vira pendência explícita no relatório final, com o motivo. Use o "Pronto quando" de cada fase abaixo como mínimo.
5. Se o usuário pedir para pular ou cortar algo, registre como desvio no relatório final.

## Projeto que já tem o Pessoas (revisão)

Se `rodsaas.json → presets` já tem `rh` (ou existe `api/src/modules/rh`), rode em **modo revisão** em vez de instalar de novo:

1. Leia todas as referências inteiras.
2. Compare item a item com o código (API, telas, testes) e monte a tabela de lacunas: item da referência · ✅/❌ · onde está ou o que falta. Comece pelo "Pronto quando" das fases 3, 4 e 7 (é onde mais se simplifica: saldo de férias "30 por ano" sem período aquisitivo nem faltas, aprovação fixa no gestor sem fallback nem delegação, salário visível para o gestor, pesquisa com `userId` na resposta).
3. Mostre a tabela ao usuário e complete o que falta **fase por fase**, sem reescrever o que já está certo e sem perder dados (migrations só aditivas).
4. Feche com `references/09-checklist.md` e o `/rodsaas:verify` (`-g "RH"`).

## Decisões padrão (confirme numa rodada só)

| Decisão | Padrão |
|---|---|
| Nome do app | **Pessoas** (rotas `/pessoas/...`, API `/v1/rh/...`, id do app `pessoas`, preset `rh`) |
| Quem usa | **todo colaborador** com login (autoatendimento); gestores pelo organograma; RH e financeiro por papel do app |
| Papéis do app | `RH_ADMIN` (tudo, inclusive configurações), `RH` (todos os dados, sem configurações), `FINANCE` (fila de reembolso e dados bancários); o owner da empresa é sempre `RH_ADMIN`; gestor = quem tem subordinados |
| Colaborador sem login | permitido (chão de fábrica, campo): a ficha existe e o RH lança por ele; "Convidar para o autoatendimento" quando quiser |
| Férias | regras da CLT para CLT e aprendiz; **regime livre** (só saldo e datas) para estágio (recesso de 30 dias) e PJ (política da empresa, pode desligar); 30 dias de antecedência como aviso; descanso semanal no domingo (configurável por jornada) |
| Feriados | nacionais automáticos + estaduais/municipais cadastrados por local de trabalho |
| Fluxos de aprovação | férias e ausências: gestor direto; despesas: gestor e, acima de R$ 1.000, o financeiro; alteração de dados pessoais: RH; solicitações: por tipo. Sem gestor → RH. Lembrete depois de 2 dias úteis |
| Atestado | só o RH e a pessoa veem o documento; o gestor vê "Ausência médica" e as datas; **CID não é pedido nem guardado** (opção da empresa, criptografado) |
| Salário | só RH e a própria pessoa (opção: gestores veem o da equipe); toda leitura de salário e de documento sensível fica no registro de acesso |
| Pesquisas | anônimas por padrão, resultado só com **5+ respostas** por recorte, comentários sem identificação |
| Avaliação | escala 1–5 com competências e peso, autoavaliação + gestor (pares e 360 opcionais), resultado liberado pelo RH |
| Despesas | categorias prontas (refeição, transporte, hospedagem, km a R$ 1,20, outros); recibo obrigatório acima de R$ 50; despesas de até 90 dias |
| Fora do Pessoas | **ponto eletrônico** (outro app, Portaria 671/2021), **folha de pagamento e eSocial** (ficam com a contabilidade: o Pessoas exporta o fechamento do mês), **recrutamento** (app Recrutamento; a admissão já recebe o candidato aprovado) |
| Planos (modelo de planos) | Free: 10 colaboradores, base + férias + documentos + holerites + aprovações padrão; Pro: 200 colaboradores, + desempenho, metas, clima, despesas, fluxos personalizados, pré-admissão, fechamento; Business: ilimitado |
| Workstation | **Suíte RH**: R$ 5 por colaborador ativo/mês, mínimo R$ 79, tudo incluído |

Fora da v1 (registre no README do projeto): ponto e banco de horas calculado, folha/eSocial/FGTS Digital, benefícios com operadora (VR/VA, plano de saúde), assinatura eletrônica com validade jurídica (o "li e concordo" é ciência, não assinatura ICP), OCR de recibos, cartão corporativo, recrutamento, pesquisa com IA, app nativo (o autoatendimento é web responsivo e PWA).

## Fases

Cada fase termina com typecheck, lint, build, testes da fase e commit (`feat(rh): ...`). Não avance com fase quebrada. Use a lista de tarefas.

1. **Integração e regras** — registro do preset e do **app Pessoas**, papéis do app, quem vê o quê, planos (ou Suíte RH), avisos, porte de `scripts/rh-lib.mjs` (com os testes) para `api/src/modules/rh/lib/`. → `references/01-escopo-e-papeis.md`
   - *Pronto quando*: app no trilho para todo colaborador com login, papéis `RH_ADMIN`/`RH`/`FINANCE`, `visibleGroups` usado na projeção da ficha, planos ou Suíte RH com contagem por colaborador, tipos de aviso registrados, `rh-lib` portado com os testes passando.
2. **Modelo** — colaboradores, áreas, cargos, histórico, remuneração, dependentes, documentos, férias, ausências, aprovações, despesas, checklists, desempenho, metas, feedback, pesquisas (participação separada da resposta), registro de acesso; RLS `FORCE`; dados criptografados; conteúdo inicial. → `references/02-modelo.md`
   - *Pronto quando*: todos os models com RLS `FORCE` e `rodsaas_assert_same_org`, CPF único por empresa, organograma sem ciclo (trigger e serviço), `SurveyResponse` **sem** coluna de pessoa, conta bancária/CID criptografados, conteúdo inicial na ativação do app.
3. **Colaboradores, organograma e autoatendimento** — API e telas da base: diretório, ficha com abas, organograma, áreas, cargos, importação, desligamento, Meu perfil com pedido de alteração, baixar meus dados. → `references/03-api.md` e `references/08-telas.md`
   - *Pronto quando*: CRUD com CPF válido e único, gestor sem ciclo (`INVALID_MANAGER`), ficha projetada por `visibleGroups` (sem salário para colega e gestor), organograma, importação CSV com prévia e erros por linha, desligamento com checklist, pedido de alteração de dados indo para aprovação.
4. **Aprovações, férias e ausências** — motor de fluxos, caixa "Para aprovar", delegação, lembretes; períodos aquisitivos, pedido com validação da CLT, calendário com conflito, coletivas, ausências e atestados, saldo descontado na aprovação. → `references/04-ferias-e-ausencias.md` e `references/05-aprovacoes-e-despesas.md`
   - *Pronto quando*: `acquisitionPeriods` e `validateVacationPlan` no servidor (422 `VACATION_RULES` com os códigos), pedido → etapas pelo `resolveApprovers` (sem gestor → RH, quem pede não aprova, delegação ativa), recusa exige comentário, saldo só muda na aprovação, calendário com "x de y da equipe fora", coletivas com impacto por pessoa, atestado sensível.
5. **Despesas e solicitações** — categorias, despesas com recibo e km, relatório, aprovação por valor, fila do financeiro, reembolso, tipos de solicitação com formulário. → `references/05-aprovacoes-e-despesas.md`
   - *Pronto quando*: `validateExpense` no servidor (acima do limite exige justificativa, recibo obrigatório acima do valor), relatório só envia com tudo válido, fluxo com etapa do financeiro acima de R$ 1.000, marcar pago com data, exportar CSV, solicitações personalizadas no mesmo motor.
6. **Admissão, documentos e holerites** — pré-admissão por link, conferência dos documentos, efetivar, checklists de entrada e saída, pasta de documentos com validade, políticas com ciência, holerites e informes em lote. → `references/06-admissao-documentos-holerites.md`
   - *Pronto quando*: link de pré-admissão sem login (token com hash e validade), cada documento aprovado/recusado com motivo, efetivar cria o colaborador e o convite, checklist gerado do modelo com prazos, documentos vencendo no painel e no aviso, ciência com data e IP, lote de holerites com prévia casada/sem dono/ambígua antes de publicar, cada pessoa vê só os seus.
7. **Desempenho, metas, feedback e clima** — ciclos com fases, formulários, calibração 9-box, liberação, 1:1, feedback e reconhecimento, PDI, metas/OKR com check-in, pesquisas anônimas com resultado agregado. → `references/07-desempenho-e-clima.md`
   - *Pronto quando*: ciclo com fases (`currentPhase`), avaliações geradas por pessoa e avaliador, nota ponderada, 9-box na calibração, resultado só depois de liberado, 1:1 com nota privada do gestor, metas com `krProgress`/`goalStatus`, pesquisa que grava participação e resposta em tabelas separadas, resultado pelo `groupResults` (mínimo 5) e eNPS.
8. **Telas, indicadores e fechamento** — Início por papel, todas as telas do app, relatórios (quadro, rotatividade, absenteísmo, aniversários), fechamento do mês para a contabilidade. → `references/08-telas.md`
   - *Pronto quando*: todas as rotas e testids da seção "Contrato testável", Início diferente para colaborador, gestor e RH, celular sem rolagem lateral, fechamento do mês com CSV e envio por e-mail.
9. **Fechamento** — `references/09-checklist.md`, testes ponta a ponta, `/rodsaas:verify` (parte do RH: `-g "RH"`; exige os formatos ★ de `03-api.md` e os testids de `08-telas.md`), README do projeto.

## Princípios

- **A lei no servidor, a explicação na tela.** Toda regra da CLT roda no `rh-lib` portado (nunca só no front) e todo bloqueio volta com código e mensagem que a pessoa entende ("As férias não podem começar nos 2 dias antes de feriado"). Aviso não é erro: antecedência curta avisa, não impede.
- **Cada um vê só o que precisa.** A ficha é projetada por grupo de campos (`visibleGroups`); o que não pode ver **não vem na resposta** (não é escondido no front). Salário, documentos pessoais e saúde têm registro de acesso.
- **Anônimo é anônimo.** A resposta da pesquisa não tem pessoa, nem horário exato, nem recorte com menos de 5; ninguém — nem o owner — consegue ver respostas individuais.
- **Nada muda sem rastro.** Mudança de cargo, salário, gestor, saldo e cada decisão de aprovação ficam no histórico com quem e quando; aprovação não se edita, se cancela e pede de novo.
- **O RH não é gargalo.** Autoatendimento para tudo que a pessoa pode fazer sozinha (ver saldo, pedir, baixar holerite, atualizar contato); o RH aprova o que precisa de conferência.
- **Segurança da base, sem exceção.** RLS `FORCE` em tudo; o link de pré-admissão e o lookup público guardam só hash; arquivos do `uploads` com URL assinada curta e checagem de permissão a cada download.
- **Todo estado tem tela e toda ação tem feedback** (`references/08-telas.md`).

## Relatório final

O que foi adicionado (app, telas, link público de pré-admissão), papéis, planos ou Suíte RH, como testar em 5 minutos (cadastrar 3 colaboradores com gestor → entrar como colaborador e pedir férias → ver o erro ao começar numa sexta → pedir numa segunda → entrar como gestor e aprovar → ver o saldo descontado → publicar um lote de holerites e ver cada um só o seu → lançar uma pesquisa e ver o resultado aparecer com 5 respostas), o resultado do `/rodsaas:verify`, o que ficou fora da v1 e desvios por versão de pacote.

## Mapa das referências

| Arquivo | Quando ler |
|---|---|
| `references/01-escopo-e-papeis.md` | Fase 1: escopo por área, app na casca, papéis, quem vê o quê (LGPD), planos, Suíte RH, avisos |
| `references/02-modelo.md` | Fase 2: models, RLS, criptografia, conteúdo inicial |
| `references/03-api.md` | Fases 3–8: rotas, formatos ★, erros, testes |
| `references/04-ferias-e-ausencias.md` | Fase 4: CLT, períodos, pedido, coletivas, ausências, calendário |
| `references/05-aprovacoes-e-despesas.md` | Fases 4 e 5: motor de fluxos, delegação, lembretes, despesas, solicitações |
| `references/06-admissao-documentos-holerites.md` | Fase 6 |
| `references/07-desempenho-e-clima.md` | Fase 7 |
| `references/08-telas.md` | Fases 3–8: rotas do front, telas por papel, estados, contrato de testids |
| `references/09-checklist.md` | Fase 9 |
| `scripts/rh-lib.mjs` + `rh-lib.test.mjs` | datas e feriados, férias CLT (períodos, plano, coletivas, regime livre), licenças, organograma, aprovações, despesas, CPF e holerites, validade, checklists, metas, avaliação, 9-box, eNPS e anonimato, indicadores, quem vê o quê, fechamento CSV: porte para TS com os testes |
