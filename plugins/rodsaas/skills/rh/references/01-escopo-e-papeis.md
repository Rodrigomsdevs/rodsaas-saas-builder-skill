# 01 · Escopo, papéis e integração

## Escopo da v1 por área

| Área | Inclui |
|---|---|
| **Colaboradores** | ficha com nome civil e **nome social** (usado em tudo que é exibido), foto, contatos de trabalho e pessoais, nascimento, CPF (válido e único na empresa), RG, PIS/NIS, CTPS, título, CNH, endereço, contato de emergência, dependentes (IR e salário-família), dados bancários/Pix (para reembolso), contrato (CLT, aprendiz, estágio, temporário, PJ, autônomo), admissão, jornada (horas semanais, dias de descanso), local de trabalho, centro de custo, área, cargo, gestor, situação (pré-admissão, ativo, afastado, desligado), campos personalizados, anotações do RH; histórico de cargo/área/gestor/salário com data de vigência e motivo; desligamento (data, tipo, motivo, recontrataria?) |
| **Estrutura** | áreas em árvore (com responsável), cargos (nível, CBO opcional, faixa salarial mín./máx., descrição), locais de trabalho (com feriados locais), centros de custo; **organograma** navegável (a partir de qualquer pessoa, recolher/expandir, busca, exportar imagem) |
| **Diretório** | lista e cartões, busca, filtros (área, cargo, gestor, local, contrato, situação), "fora hoje", aniversários e tempo de casa do mês, importação CSV com prévia, exportação CSV (só os campos que quem exporta pode ver) |
| **Autoatendimento** | Meu perfil (edita contatos direto; endereço, banco, dependentes e contato de emergência por **pedido de alteração** aprovado pelo RH), minhas férias, minhas ausências, meus documentos, meus holerites, minhas avaliações, metas, feedbacks, pedidos, minhas despesas; **baixar meus dados** (LGPD art. 18) |
| **1 · Aprovações** | fluxos por tipo de pedido (férias, ausência, despesa, alteração de dados, solicitações personalizadas), etapas por gestor/gestor do gestor/papel/pessoa, condição por valor ou dias, "qualquer um" ou "todos" na etapa, fallback para o RH, quem pede nunca aprova, delegação por período (férias do gestor), lembrete e escalonamento, comentário obrigatório na recusa, cancelar pedido pendente, histórico imutável, caixa "Para aprovar" única com aprovar em massa |
| **2 · Férias e ausências** | períodos aquisitivos com faltas (art. 130), saldo, situação (em aquisição, disponível, vencendo, vencida, quitado, perdido), proporcional, pedido com fracionamento, venda de 1/3 e adiantamento do 13º (só registra o pedido, o cálculo é da contabilidade), validação da CLT, calendário de equipe e empresa com conflito, coletivas por área ou empresa, regime livre para estágio/PJ, aviso de férias para ciência, licenças legais, atestados (sensíveis), faltas lançadas pelo RH (contam no período), feriados nacionais/locais |
| **3 · Admissão e desligamento** | admissão com **link de pré-admissão** (a pessoa preenche dados, dependentes, banco e envia documentos pelo celular), lista de documentos exigidos por contrato, conferência de cada documento (aprovar/recusar com motivo, a pessoa reenvia), efetivar (vira ativo, gera o convite do autoatendimento e o checklist), **checklists por modelo** (entrada e saída) com tarefas por responsável e prazo relativo, página de boas-vindas (primeiro dia, padrinho, links), desligamento com checklist (devolução de equipamento, acessos, exame demissional) e entrevista de desligamento (pesquisa) |
| **4 · Documentos e holerites** | pasta por pessoa com categorias, validade e aviso (ASO, CNH, NR, certificações), visibilidade por documento (só RH, RH e a pessoa, sensível), documentos da empresa (políticas, código de conduta, regulamento) com público-alvo e **ciência** ("li e concordo" com data, IP e versão), holerites, informes de rendimentos e recibos de férias **em lote** (vários PDFs, ZIP ou um PDF único separado por página) casados pelo CPF com prévia antes de publicar, confirmação de recebimento, painel do lote (quem viu, quem não viu) |
| **5 · Desempenho** | ciclos (nome, período, público, fases com datas), modelos de avaliação (competências com peso e escala 1–5, perguntas abertas), tipos (auto, gestor, pares escolhidos pela pessoa e aprovados pelo gestor, subordinados), acompanhamento por fase, calibração com **9-box** (desempenho × potencial), liberação do resultado, conversa de devolutiva registrada; **1:1** recorrentes com pauta compartilhada, nota privada do gestor e combinados; **feedback contínuo** (privado ou público, elogio ligado aos valores da empresa, pedir feedback); **PDI** (ações com prazo e status); **metas/OKR** (empresa → área → pessoa, resultados-chave numéricos, % ou sim/não, check-in com comentário, situação no ritmo/atenção/atrasado) |
| **6 · Clima** | pesquisas de clima (perguntas 1–5 por dimensão, eNPS 0–10, abertas), pulso recorrente (semanal/quinzenal/mensal), entrevista de desligamento, modelos prontos, público por área/local/contrato, anônima (padrão) ou identificada (declarado na tela), mínimo de respostas por recorte (padrão 5), resultado por dimensão, pergunta, área, local, tempo de casa, eNPS com histórico, comentários sem identificação, mapa de calor, taxa de resposta |
| **7 · Despesas** | categorias com limite, recibo obrigatório acima de valor e km com valor por km, despesa (data, valor, moeda BRL, descrição, recibo foto/PDF, centro de custo, cliente/projeto opcional), relatório (agrupa despesas, envia para aprovação), fluxo por valor, fila do financeiro (a pagar, pagos), marcar pago com data e comprovante, exportar CSV; **solicitações personalizadas** (tipos com formulário: declaração, adiantamento, equipamento…) no mesmo motor |
| **Indicadores e fechamento** | quadro por área/local/contrato, admissões e desligamentos, rotatividade, absenteísmo, tempo médio de casa, férias vencidas, documentos vencendo, aniversários; **fechamento do mês** para a contabilidade (admissões, desligamentos, férias, ausências, alterações de salário/cargo, reembolsos aprovados) em CSV, com envio por e-mail ao contador |

## App na casca

`web/src/features/rh/app.tsx` e `config/apps.ts`:

```ts
export const pessoasApp: AppDef = {
  id: 'pessoas', name: 'Pessoas', description: 'Colaboradores, férias, aprovações, desempenho e clima',
  icon: Users, category: 'pessoas', order: 60, defaultPinned: true,
  match: ['/pessoas'], home: '/pessoas',
  Sidebar: PessoasSidebar,
  action: { label: 'Pedir férias', onSelect: openVacationRequest },   // RH: 'Colaborador'
  useBadge: useToApproveCount,                 // pedidos aguardando a pessoa + documentos para dar ciência
  visible: (me) => !!me.rh?.employeeId || !!me.rh?.rhRole,
  widgets: [myVacationWidget, toApproveWidget, whoIsOutWidget, birthdaysWidget],
  search: pessoasSearchProvider,               // pessoas (nome, cargo, área), pedidos
  settings: { label: 'Pessoas', href: '/pessoas/configuracoes' },
}
```

`/v1/me` passa a devolver `rh: { employeeId, rhRole, isManager, reportsCount }`. Acrescente `{ id: 'pessoas', name: 'Pessoas', home: '/pessoas' }` em `rodsaas.json → apps` e `"rh"` em `presets`.

**Menu do app** (`PessoasSidebar`, itens conforme o papel):

| Seção | Itens | Quem vê |
|---|---|---|
| Eu | Início · Meu perfil · Minhas férias · Meus documentos · Meus holerites · Minhas despesas | todo colaborador |
| Equipe | Colaboradores · Organograma · Ausências (calendário) · Aprovações (com contador) | todos (o diretório mostra só campos públicos; Aprovações só aparece com algo para aprovar ou pedido feito) |
| Desenvolvimento | Desempenho · Metas · Feedback · 1:1 · Clima | todos (o que cada um vê dentro varia) |
| RH | Admissões · Documentos da empresa · Holerites (lotes) · Relatórios · Fechamento do mês | `RH_ADMIN`, `RH` (Fechamento também `FINANCE`) |
| Financeiro | Reembolsos a pagar | `FINANCE`, `RH_ADMIN` |
| — | Configurações | `RH_ADMIN` |

As rotas públicas (`/pre-admissao/[token]`) ficam fora do grupo `(app)`: sem casca e sem login.

## Papéis

Os papéis do app ficam em `RhRole { userId, role }` (um por pessoa) e são independentes do papel na empresa: o admin da empresa **não** vê salários só por ser admin. O owner da empresa é sempre `RH_ADMIN` (não dá para tirar).

| Ação | `RH_ADMIN` | `RH` | `FINANCE` | Gestor (tem subordinados) | Colaborador |
|---|---|---|---|---|---|
| ver ficha | tudo | tudo | público + banco | da equipe: público, contrato, ausências, desempenho (salário/documentos só se a empresa ligar) | a própria inteira (menos anotações do RH); dos outros, público |
| criar/editar colaborador, cargo, área | ✅ | ✅ | — | — | — (pede alteração dos próprios dados) |
| salário e histórico de salário | ✅ (com registro de acesso) | ✅ (com registro) | — | opção da empresa | o próprio |
| desligar | ✅ | ✅ | — | — | — |
| aprovar | quando for aprovador; **pode decidir por qualquer etapa** (com motivo, fica "decidido pelo RH") | igual ao RH_ADMIN | etapa do financeiro | etapas em que é aprovador | etapas em que é aprovador (delegado ou papel) |
| lançar ausência/atestado de outra pessoa, falta, coletivas | ✅ | ✅ | — | — | atestado e ausências próprias |
| admissões, checklists, documentos de outros, holerites | ✅ | ✅ | — | tarefas do checklist atribuídas a ele | tarefas dele, os próprios documentos |
| ciclos de avaliação, calibração, liberar | ✅ | ✅ | — | avalia a equipe, participa da calibração da equipe | auto e pares |
| pesquisas (criar, lançar, resultado) | ✅ | ✅ | — | resultado agregado da própria área (se ≥ mínimo e a pesquisa permitir) | responder |
| despesas | ✅ | ver todas | pagar, exportar | aprovar as da equipe | as próprias |
| relatórios e fechamento | ✅ | ✅ | fechamento e reembolsos | indicadores da equipe | — |
| configurações (fluxos, políticas, modelos, papéis, privacidade) | ✅ | — | — | — | — |

Ficha de quem a pessoa não pode ver inteira não dá 403: vem só com os grupos permitidos. Pedido, documento, avaliação ou despesa que a pessoa não pode ver responde **404**.

**Gestor**: quem tem `Employee.managerId` apontando para ele. Por padrão vale para subordinados **diretos e indiretos** em leitura (`managersSeeIndirect: true`) e só diretos para aprovar (o fluxo diz quem aprova).

## Quem vê o quê (LGPD)

A ficha é dividida em **grupos de campos** (`FIELD_GROUPS` no `rh-lib`) e a resposta da API é montada por `visibleGroups({ viewer, targetId, isManager, settings })`: o que não está nos grupos **não vem no JSON** (nem `null`). A resposta traz `visibleGroups` para o front saber quais abas mostrar.

| Grupo | Campos | Quem vê |
|---|---|---|
| `public` | nome de exibição, foto, cargo, área, gestor, e-mail e telefone de trabalho, local, aniversário (dia/mês, se a pessoa não escondeu), admissão, "fora hoje" (sem o motivo) | toda a empresa |
| `job` | contrato, jornada, situação, centro de custo, histórico de cargo/área/gestor (sem salário) | RH, a pessoa, gestores |
| `personal` | nome civil (quando há social), CPF, RG, PIS, CTPS, nascimento completo, endereço, contatos pessoais, emergência, dependentes | RH, a pessoa |
| `bank` | banco, agência, conta, chave Pix | RH, a pessoa, `FINANCE` |
| `compensation` | salário atual, histórico, faixa do cargo | RH, a pessoa, gestores se `managersSeeCompensation` |
| `documents` | documentos não sensíveis (visibilidade `EMPLOYEE`) | RH, a pessoa, gestores se `managersSeeDocuments` |
| `health` | atestados, ASO, licenças de saúde (documentos e tipo) | RH, a pessoa |
| `absences` | férias e ausências com datas (tipos de saúde aparecem como "Ausência médica" para quem não tem `health`) | RH, a pessoa, gestores |
| `performance` | avaliações liberadas, metas, PDI, 1:1 (nota privada do gestor só para ele) | RH, a pessoa, gestores |
| `rh_notes` | anotações internas do RH | RH |

Regras:
- **CPF para quem não tem `personal`**: nunca aparece. Em listas do RH aparece formatado; em telas compartilhadas (impressão do organograma, exportações para gestor) mascarado (`maskCpf`).
- **CID**: não é pedido no atestado. Se a empresa ligar `storeCid` (configuração com aviso de LGPD), o campo é criptografado e só o `RH_ADMIN` vê.
- **Registro de acesso** (`RhAccessLog`): toda leitura de `compensation`, download de documento `health`/`personal`, exportação e baixar meus dados grava `{ actorId, employeeId, action, at, ip }`. O `RH_ADMIN` vê na ficha (aba Histórico → "Acessos") e a pessoa vê no Meu perfil ("Quem acessou seus dados sensíveis").
- **Baixar meus dados**: ZIP com JSON da ficha inteira (menos `rh_notes` e avaliações de outros ainda não liberadas), documentos e holerites; gerado na fila, link por aviso, expira em 24 h.
- **Desligados**: ficam somente leitura (o RH vê; a pessoa perde o login da empresa, mas o RH pode reenviar holerites/informes por e-mail). **Anonimizar** (`RH_ADMIN`, com confirmação digitando o nome) troca dados pessoais por "Ex-colaborador #id", apaga documentos e mantém datas, cargo e área para os indicadores.

## Planos (modelo de planos da base)

Acrescente em **todos** os planos de `config/plans.ts` (preservando o que existe):

| | Free | Pro | Business |
|---|---|---|---|
| limite `rhEmployees` (colaboradores ativos, afastados e em pré-admissão) | 10 | 200 | ilimitado |
| colaboradores, organograma, autoatendimento, férias e ausências, documentos, holerites, aprovações com os fluxos padrão, checklists | ✅ | ✅ | ✅ |
| feature `rh_custom_flows` (editar fluxos, solicitações personalizadas, delegação) | — | ✅ | ✅ |
| feature `rh_preadmission` (link de pré-admissão) | — | ✅ | ✅ |
| feature `rh_performance` (ciclos, 9-box, 1:1, feedback, PDI, metas) | — | ✅ | ✅ |
| feature `rh_surveys` (clima, eNPS, pulso, desligamento) | — | ✅ | ✅ |
| feature `rh_expenses` (despesas e reembolso) | — | ✅ | ✅ |
| feature `rh_reports` (indicadores e fechamento do mês) | — | ✅ | ✅ |

Regras: chegou ao limite → criar colaborador ativo dá 403 `PLAN_LIMIT_REACHED` (pré-admissão também conta); rebaixar de plano não apaga nada: o que é Pro fica **somente leitura** com o selo Pro (ciclos e pesquisas encerrados continuam consultáveis).

## Workstation (Suíte RH)

Com a `/rodsaas:workstation` (`billing.model: "apps"`):

- O catálogo tem **um** app `pessoas` (preset `rh`, categoria `pessoas`, `pricing: { suite: "rh" }`) e a `suites.rh.apps: ["pessoas"]` (R$ 5 por colaborador, mínimo R$ 79). As features `rh_*` entram pelo prefixo `rh_` em `FEATURE_PREFIXES` (→ `pessoas`): suíte ativa ou teste = tudo liberado.
- **Unidade cobrada = colaboradores ativos** (situação ativo, afastado ou pré-admissão; desligado não conta), não pessoas com login. O preset registra `registerSeatCounter('pessoas', countBillableEmployees)` (se a workstation do projeto ainda não tiver o registro, acrescente: a quantidade comprada de `suite:rh` é comparada com esse contador em vez do `AppAccess`).
- Criar colaborador que passa da quantidade comprada: 409 `CONFIRM_REQUIRED` com `{ newMonthly, amountDueNow }`; com `confirm: true`, aumenta a quantidade (mesma regra do acesso por pessoa). No teste, até 50 colaboradores.
- **Acesso**: quem tem `Employee` ligado ao usuário, ou papel do app, tem acesso ao Pessoas automaticamente (não precisa de `AppAccess`; o guard de app consulta `hasPessoasAccess`). Sem a suíte (estado `locked`), o app fica só leitura como os outros: cada um ainda vê os próprios holerites e documentos (GET), nada novo é criado.
- `registerAppRoutes('pessoas', ['/v1/rh'])` e `registerAppActivation('pessoas', seedRh)` (conteúdo inicial, `02-modelo.md`).

## Avisos

Os tipos estão no catálogo do add-on `notificacoes` (`skills/notificacoes/references/04-catalogo.md`, seção "Pessoas"; frases em `notifications-lib` → `PRESET_TYPES` com `appId: "pessoas"`). O preset registra com `registerNotificationTypes("pessoas", ...)` e chama `notify()` nos eventos daquela tabela. Nunca coloque salário, CID, motivo de atestado ou nota de avaliação no texto do aviso nem no e-mail.

E-mails para quem ainda **não é membro** (convite da pré-admissão, lembrete de documento pendente da pré-admissão, holerite para desligado) saem pelo app (transporte de e-mail da base / Resend), com o modelo da marca.

## Testes obrigatórios

- `visibleGroups` aplicado na API: colega não recebe `compensation`/`personal`; gestor não recebe `compensation` (com a opção desligada) nem `health`; a pessoa recebe a própria ficha sem `rh_notes`; RH recebe tudo; leitura de salário grava `RhAccessLog`.
- `/v1/me.rh` correto para colaborador, gestor, RH e owner.
- Planos: 11º colaborador no Free → 403 `PLAN_LIMIT_REACHED`; feature Pro desligada → 403 `FEATURE_NOT_IN_PLAN` (formato da base).
- Workstation (se instalada): colaborador acima do comprado → 409 `CONFIRM_REQUIRED`; suíte bloqueada → GET 200, POST 403 `APP_NOT_ACTIVE`.
