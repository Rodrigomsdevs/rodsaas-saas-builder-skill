# Escopo e integração

## Escopo da v1

| Área | Inclui |
|---|---|
| **Chamados** | número por empresa (`#1024`), assunto, solicitante (contato), cópias (CC), status, prioridade, fila, responsável, etiquetas, campos personalizados (esquema do `forms-lib`), canal de origem, prazos de SLA, chamado de origem (follow-up), mesclado em, satisfação, histórico de tudo |
| **Canais** | e-mail (caixa por IMAP/SMTP ou webhook de recebimento), portal de ajuda, widget, API com chave, criado pela equipe (telefone, balcão, outro) |
| **Caixa de entrada** | visões prontas (Meus abertos, Sem responsável, Abertos, Aguardando cliente, Em espera, Prazo estourando, Resolvidos, Fechados, Todos) com contadores, visões salvas da empresa e pessoais, filtros, busca, ordenação pelo prazo, ações em massa |
| **Chamado** | conversa (resposta pública, nota interna, eventos do sistema), editor rico com anexos e colar imagem, enviar como (Aberto, Aguardando cliente, Em espera, Resolvido), macros, @menções nas notas, CC, painel lateral (solicitante e histórico dele, campos, SLA, etiquetas), aviso de colisão ("Bia está respondendo"), mesclar, imprimir, marcar como spam |
| **SLA** | política por prioridade (primeira resposta, solução), horário de atendimento da empresa com exceções e feriados, pausa enquanto aguarda o cliente, selo com tempo restante, aviso antes de estourar, relatório de cumprimento |
| **Automação** | distribuição por fila (rodízio, por carga, limite de abertos por atendente, só quem está disponível), gatilhos (quando criado/atualizado, condições, ações), fechamento automático, lembrete ao cliente que não respondeu |
| **Macros** | respostas prontas com variáveis (`{{cliente.primeiro_nome}}`…) e ações (status, prioridade, fila, etiquetas, responsável), da empresa ou pessoais |
| **Contatos** | quem abriu chamado (sem duplicar por e-mail), empresa do contato pelo domínio, histórico, notas, bloquear remetente; ligação com contato do CRM |
| **Base de conhecimento** | categorias, artigos com editor rico, rascunho/publicado, só interno, busca em português, "isso ajudou?", visualizações, artigos sugeridos ao abrir chamado e ao responder (inserir link) |
| **Portal e widget** | central `/ajuda/<empresa>` com busca, categorias e artigos; abrir chamado (com sugestões de artigos enquanto digita); chamado do cliente pelo link (conversa, responder, "isso resolveu", avaliar); "meus chamados" por link mágico no e-mail; widget de ajuda para colar no site; marca da empresa |
| **Satisfação** | pesquisa 👍/👎 com comentário ao resolver (no e-mail e no link), resultado no chamado, por atendente e no relatório |
| **Relatórios** | criados × resolvidos por dia, fila acumulada, tempo de primeira resposta e de solução (mediana e 90%), cumprimento de SLA, satisfação, por atendente, fila, canal, prioridade e etiqueta, mapa de calor dia × hora, exportar CSV |
| **Avisos** | cliente: confirmação com número e link, resposta da equipe, resolvido + pesquisa, lembrete de quem não respondeu, fechado; equipe: chamado novo na fila, atribuído a você, cliente respondeu, menção, prazo quase estourando/estourado, resumo diário |
| **Integrações** | CRM (contato, chamados no contato e no negócio, abrir chamado do CRM), Forms (campos do chamado; resposta de formulário vira chamado), webhooks assinados, API com chave para o sistema do cliente abrir chamados |

## App na casca

`web/src/features/helpdesk/app.tsx` e `config/apps.ts` (`skills/frontend/references/12-casca-e-apps.md`):

```ts
export const helpdeskApp: AppDef = {
  id: 'helpdesk', name: 'Suporte', description: 'Chamados, atendimento e central de ajuda',
  icon: LifeBuoy, category: 'atendimento', order: 50, defaultPinned: true,
  match: ['/suporte'], home: '/suporte',
  Sidebar: HelpdeskSidebar,
  action: { label: 'Chamado', onSelect: openNewTicket },
  useBadge: useMyOpenCount,                   // meus abertos + sem responsável nas minhas filas
  visible: (me) => !!me.helpdesk?.isAgent,    // por "atendente", não por papel
  widgets: [myQueueWidget, slaRiskWidget, csatWidget],
  search: helpdeskSearchProvider,             // chamados (número, assunto), contatos e artigos
  settings: { label: 'Suporte', href: '/suporte/configuracoes' },
}
```

Quem não é atendente não vê o app: `visible: (me) => !!me.helpdesk?.isAgent` no `AppDef` (campo da casca; se o projeto for anterior a ele, acrescente ao tipo e ao filtro do `useApps()` — é uma linha). `/v1/me` passa a devolver `helpdesk: { isAgent, available }`.

Acrescente `{ id: 'helpdesk', name: 'Suporte', home: '/suporte' }` em `rodsaas.json → apps` e `"helpdesk"` em `presets`.

**Menu do app** (`HelpdeskSidebar`): botão **+ Chamado** · **Visões** com contadores (Meus abertos, Sem responsável, Abertos, Aguardando cliente, Em espera, Prazo estourando, Resolvidos, Fechados, Todos) · visões salvas · **Contatos** · **Base de conhecimento** · **Relatórios** · seção **Minha central** com o link do portal (copiar, abrir) · interruptor **Disponível** (para a distribuição automática) · Configurações (owner/admin).

O portal (`/ajuda/...`), o chamado do cliente (`/chamado/[token]`) e o widget ficam fora do grupo `(app)`: sem casca e sem login.

## Papéis

| Ação | OWNER / ADMIN (atendente ou não) | Atendente (MEMBER) | MEMBER que não é atendente |
|---|---|---|---|
| ver chamados | todos | todos, ou só os das suas filas (configuração `visibility`) | — (app escondido; rotas → 403 `NOT_AN_AGENT`) |
| responder, nota, mudar status/prioridade/etiquetas | ✅ | nos que vê | — |
| atribuir | a qualquer atendente | a si mesmo e a atendentes das filas do chamado | — |
| mesclar, marcar spam, excluir | ✅ (excluir: só owner/admin) | mesclar e spam | — |
| macros | da empresa e pessoais | pessoais (usa as da empresa) | — |
| base de conhecimento | ✅ | criar e editar; publicar se a configuração permitir (padrão: sim) | — |
| relatórios | todos | os próprios números e os das suas filas | — |
| filas, atendentes, SLA, horário, gatilhos, caixas de e-mail, portal, webhooks, chave da API | ✅ | — | — |

Owner e admin sempre podem administrar o app, mesmo sem ser atendentes (contam no limite só se forem atendentes). Chamado que a pessoa não pode ver responde **404**.

## Planos

Acrescente em **todos** os planos de `config/plans.ts` (preservando o que existe):

| | Free | Pro | Business |
|---|---|---|---|
| limite `helpdeskAgents` (membros atendentes) | 2 | 10 | ilimitado |
| limite `helpdeskInboxes` (caixas de e-mail) | 1 | 5 | ilimitado |
| limite `helpdeskTicketsMonthly` (chamados criados no mês, todos os canais) | 100 | 5.000 | 50.000 |
| feature `helpdesk_sla` (políticas de SLA e horário de atendimento) | — | ✅ | ✅ |
| feature `helpdesk_automation` (distribuição automática e gatilhos) | — | ✅ | ✅ |
| feature `helpdesk_csat` (pesquisa de satisfação) | — | ✅ | ✅ |
| feature `helpdesk_integrations` (webhooks, API com chave, CRM, Forms) | — | ✅ | ✅ |
| feature `helpdesk_branding` (sem "Feito com {produto}" no portal/widget/e-mails, cores e logo próprios) | — | ✅ | ✅ |
| e-mail, portal, widget, macros, base de conhecimento, relatórios, anexos (limite do `uploads`) | ✅ | ✅ | ✅ |

Regras:
- **Limite mensal atingido**: chamados novos **continuam entrando** (nunca descartamos pedido de cliente), mas ficam marcados "acima do plano" e só aparecem resumidos (número, assunto) até o upgrade ou a virada do mês; o owner recebe aviso em 80% e 100%. Respostas em chamados existentes nunca são bloqueadas.
- Sem `helpdesk_sla`: os chamados não ganham prazos (selo some); a tela de SLA mostra o selo Pro.
- Rebaixar de plano: atendentes acima do limite viram "inativos" (escolha da empresa), caixas acima do limite param de ser lidas (com aviso), gatilhos e distribuição automática pausam; nada é apagado.
