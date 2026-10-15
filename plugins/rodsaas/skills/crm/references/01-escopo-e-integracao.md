# Escopo e integração

## Escopo da v1

| Área | Inclui |
|---|---|
| **Empresas** | nome, razão social, CNPJ (numérico e alfanumérico) com **busca automática dos dados**, segmento, site, telefone, e-mail, endereço por CEP, responsável, etiquetas, campos personalizados, contatos ligados, negócios (abertos, ganhos, perdidos) com totais, linha do tempo |
| **Contatos** | nome, cargo, e-mail, telefone, WhatsApp (botão que abre a conversa), CPF opcional, aniversário, uma ou mais empresas (uma principal), responsável, etiquetas, campos personalizados, negócios, linha do tempo |
| **Leads** | caixa de entrada com origem, dados da pessoa/empresa como chegaram, mensagem, UTM, responsável, etiquetas; aviso de contato já existente; converter em negócio (reaproveitando contato/empresa), descartar com motivo, restaurar |
| **Funis** | vários funis, etapas ordenáveis com probabilidade (%) e alerta de "parado há X dias"; funil padrão |
| **Negócios** | título, valor (manual ou soma dos produtos), funil, etapa, empresa, contato, responsável, previsão de fechamento, probabilidade (da etapa ou própria), origem, etiquetas, campos personalizados; ganhar, perder (motivo + observação), reabrir; histórico de etapas |
| **Produtos** | catálogo (nome, código, preço, unidade, ativo); itens no negócio com quantidade, preço, desconto e total |
| **Atividades** | ligação, reunião, tarefa, e-mail, WhatsApp, visita, prazo; data, hora opcional, duração, responsável, anotação; concluir/reabrir; "próxima atividade" em cada negócio e lead; agenda com Atrasadas · Hoje · Próximas e calendário da semana |
| **Histórico** | linha do tempo por negócio, lead, contato e empresa: anotações (com @menção e fixar no topo), atividades, mudanças (etapa, valor, responsável, status), anexos, e-mails/ligações registrados |
| **Captura** | chaves de API e formulários públicos; anti-spam; distribuição dos leads (responsável fixo ou rodízio) |
| **Importação / exportação** | CSV e Excel em 4 passos (arquivo → colunas → prévia com duplicados → resultado), desfazer em 24 h; exportar listas em CSV pronto para o Excel |
| **Relatórios** | funil de conversão, ganhos × perdidos por mês, previsão de receita, por vendedor, motivos de perda, tempo médio por etapa, atividades por vendedor |
| **Busca** | negócios, leads, contatos (nome, e-mail, telefone) e empresas (nome, razão social, CNPJ) no Ctrl+K global |
| **Configurações** | funis e etapas, motivos de perda, origens, etiquetas, campos personalizados, captura, visibilidade, modelo de mensagem do WhatsApp |

## Contrato de preset (como "somar" ao projeto)

O mesmo do `tarefas` (`skills/tarefas/references/01-escopo-e-integracao.md`, seção "Contrato de preset"). Se algum ponto de extensão ainda não existir (projeto sem o `tarefas`), crie-o aqui seguindo aquela seção, convertendo o que já existe sem mudar o visual.

1. **Registro**: `rodsaas.json` ganha `"presets": [..., "crm"]` e o app em `"apps"`. Leia antes para saber o que existe (`notion`, `tarefas`, módulos, `uploads`).
2. **App no registro** (`web/src/config/apps.ts`, casca de `skills/frontend/references/12-casca-e-apps.md`): o preset registra **o app CRM** e não mexe no menu de outro app.

```ts
// web/src/features/crm/app.tsx
export const crmApp: AppDef = {
  id: 'crm', name: 'CRM', description: 'Funil, leads, contatos e atividades',
  icon: Briefcase, category: 'vendas', order: 30, defaultPinned: true,
  match: ['/crm'], home: '/crm/negocios',
  Sidebar: CrmSidebar,      // Negócios · Leads (novos atribuídos a mim; quentes primeiro) · Atividades (atrasadas em vermelho) · Contatos · Empresas · Produtos (selo Pro sem a feature) · Metas · Sequências · Automações (owner/admin) · Duplicados · Relatórios · seção Funis · destaques do perfil (Imóveis, Campanhas… `09`) · Configurações do CRM (owner/admin, com Perfil, Modelos de e-mail, Mensagens de WhatsApp e Pontuação) — os nomes usam o vocabulário do perfil
  action: { label: 'Negócio', onSelect: openDealForm },
  useBadge: useCrmBadge,    // atividades atrasadas + leads novos atribuídos a mim
  widgets: [myActivitiesTodayWidget, staleDealsWidget, myPipelineWidget, newLeadsWidget, myGoalWidget, hotLeadsWidget],
  search: crmSearchProvider,
  settings: { label: 'CRM', href: '/crm/configuracoes' },
}
```

   O nome exibido pode ser "Vendas" se o usuário preferir. Acrescente em `config/apps.ts` e em `rodsaas.json → apps`. Projeto com menu antigo (lista ou seções): rode antes o `/rodsaas:apps`.
3. **Início**: os widgets acima, lidos do registro.
4. **Busca global**: o provedor `crm` do `AppDef`, resultados agrupados em Negócios, Leads, Contatos e Empresas.
5. **Sino**: o do add-on `notificacoes` (pré-requisito; rode o `/rodsaas:notificacoes` antes se `rodsaas.json → addons` não tiver `notificacoes`), que a casca põe no trilho. O CRM registra os tipos `crm.*` no catálogo e chama `notify()`.
6. **Componentes compartilhados** (`web/src/components/app/`): reutilize `Kanban`, `SidePeek`, `RelationSelect`, `MemberSelect`, `UserAvatar`, `Dropzone`/`FileList`; crie aqui os que faltarem, no mesmo lugar, para os próximos presets usarem. Máscaras, validação de CPF/CNPJ e formatação de moeda vêm de `web/src/lib/masks.ts` e `format.ts` da base; não duplique.
7. **Backend**: plugin de rotas `modules/crm/` registrado no `app.ts`; contadores em `lib/usage.ts`; limites e features em `config/plans.ts`; códigos de erro no catálogo; notificações pelo `notify()` do módulo `notifications`.
8. **Relações para módulos futuros**: `GET /v1/crm/contacts?q=` e `GET /v1/crm/companies?q=` seguem o formato que o `RelationSelect` espera, para módulos criados pelo `/rodsaas:module` ("agendamento ligado a contatos") poderem apontar para o CRM.

## Papéis

| Ação | OWNER / ADMIN | MEMBER |
|---|---|---|
| ver negócios, leads e atividades | todos | todos, ou só os seus no modo "cada vendedor vê os seus" |
| ver contatos e empresas | todos | todos |
| criar e editar negócios, leads, contatos, empresas, atividades, anotações | ✅ | ✅ (no modo restrito, só nos negócios/leads que vê) |
| reatribuir responsável | ✅ | só os próprios registros, e só para si |
| excluir | ✅ | o que criou ou de que é responsável |
| configurações (funis, campos, motivos, origens, captura, visibilidade, perfil, pontuação) | ✅ | — |
| metas e automações | criar e editar | ver as metas da equipe e as suas; não vê automações |
| sequências, modelos de e-mail e mensagens prontas | criar e editar (compartilhados) | usar; criar modelos pessoais de e-mail |
| mesclar duplicados | ✅ | só quando é dono dos dois registros |
| importar, exportar, desfazer importação | ✅ | — |
| produtos (catálogo) | ✅ | ver e usar nos negócios |
| relatórios | todos os vendedores | só os próprios números no modo restrito; todos no modo aberto |

## Planos

Acrescente em **todos** os planos de `config/plans.ts` (preservando o que existe):

| | Free | Pro | Business |
|---|---|---|---|
| limite `crmPipelines` (funis) | 1 | 5 | ilimitado |
| limite `crmContacts` (contatos + empresas, sem contar excluídos) | 1.000 | 25.000 | ilimitado |
| limite `crmCustomFields` (campos personalizados ativos, somando as 3 entidades) | 3 | 30 | ilimitado |
| feature `crm_products` (catálogo e itens no negócio) | — | ✅ | ✅ |
| feature `crm_capture` (chaves de API e formulários) | — | ✅ | ✅ |
| feature `crm_reports` (relatórios e exportação dos relatórios) | — | ✅ | ✅ |
| feature `crm_goals` (metas por vendedor) | — | ✅ | ✅ |
| feature `crm_automations` + limite `crmAutomations` (automações ativas) | — | ✅ 10 | ✅ ilimitado |
| feature `crm_sequences` + limite `crmSequences` (sequências ativas) | — | ✅ 5 | ✅ ilimitado |
| feature `crm_scoring` (pontuação de lead) | — | ✅ | ✅ |
| modelos de e-mail, mensagens prontas de WhatsApp, mesclar duplicados, perfis | ✅ | ✅ | ✅ |
| leads, atividades, anotações, anexos (limites do `uploads`), importação, exportação das listas | ✅ | ✅ | ✅ |

Rebaixar de plano não apaga nada: funis acima do limite ficam somente leitura (dá para mover negócios para fora e arquivar), itens de produto continuam visíveis e o valor congela, chaves de captura param de aceitar leads (403 com mensagem clara para a integração) e os relatórios mostram o `PlanGate`.

A importação respeita `crmContacts`: se o arquivo passar do limite, nada é importado e a prévia explica quantos cabem. A captura cria só **leads** (não contam no limite); o contato nasce na conversão, e é ali que o limite vale (`PLAN_LIMIT_REACHED` com a opção de vincular a um contato existente).
