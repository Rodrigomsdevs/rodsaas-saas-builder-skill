# Escopo e integração

## Escopo da v1

| Área | Inclui |
|---|---|
| **Perguntas** (20 tipos, `forms-lib FIELD_TYPES`) | texto curto e longo · e-mail · telefone/WhatsApp · CPF · CNPJ (inclusive alfanumérico) · endereço por CEP · número · valor em R$ · estrelas · NPS 0–10 · escala · escolha única · múltipla escolha · lista suspensa · sim/não · data · horário · arquivo · consentimento (LGPD) · texto informativo · quebra de página |
| **Em cada pergunta** | texto, descrição, placeholder, obrigatória, opções (com "Outro" e ordem aleatória), validação (tamanho, mínimo/máximo, inteiro, datas a partir de hoje, quantidade de escolhas, arquivos aceitos), condição para aparecer |
| **Estrutura** | páginas com título e condição; campos ocultos vindos da URL (UTM, id do cliente) |
| **Layout e visual** | clássico ou uma pergunta por vez; tema da marca do produto ou próprio (cor, fundo, capa, logo); tela de boas-vindas; tela de agradecimento com botão e redirecionamento |
| **Publicação** | rascunho com salvamento automático e versão; publicar / publicar alterações; encerrar e reabrir; link com slug editável; incorporar (iframe com altura automática); QR code |
| **Regras** | limite de respostas, data de encerramento, uma resposta por navegador, por e-mail ou por login; acesso público ou só membros |
| **Proteção** | campo isca, tempo mínimo, limite por IP, tamanho do envio, chave de idempotência |
| **Respostas** | tabela com uma coluna por pergunta, filtros, busca, lidas/não lidas, estrela, detalhe com anterior/próxima, excluir com desfazer, exportar CSV e Excel |
| **Resumo** | cartões (visualizações, iniciados, respostas, taxa de conclusão, tempo médio), gráfico por pergunta, NPS com promotores/neutros/detratores, funil por página |
| **Avisos** | e-mail/sino para o dono e colaboradores (cada resposta ou resumo diário); resposta automática para quem respondeu (com cópia das respostas) |
| **Integrações** | webhooks assinados com novas tentativas e histórico; envio de cada resposta como **lead no CRM** (se o preset `crm` estiver instalado) |
| **LGPD** | consentimento, retenção (apagar respostas depois de N dias), exclusão por e-mail do titular, IP com hash, exportação no audit log |
| **Modelos** | 8 prontos e "duplicar como modelo da empresa" |

## App na casca

Registre o app em `web/src/features/forms/app.tsx` e em `config/apps.ts` (`skills/frontend/references/12-casca-e-apps.md`):

```ts
export const formsApp: AppDef = {
  id: 'forms', name: 'Forms', description: 'Formulários e pesquisas',
  icon: ClipboardList, category: 'vendas', order: 40, defaultPinned: true,
  match: ['/forms'], home: '/forms',
  Sidebar: FormsSidebar,
  action: { label: 'Formulário', onSelect: openNewFormDialog },
  useBadge: useUnreadResponsesCount,          // respostas não lidas dos formulários que a pessoa vê
  widgets: [recentResponsesWidget, formsOverviewWidget],
  search: formsSearchProvider,                // formulários por título; respostas por texto (só as que a pessoa pode ver)
}
```

Acrescente também `{ id: 'forms', name: 'Forms', home: '/forms' }` em `rodsaas.json → apps` e `"forms"` em `presets`.

**Menu do app** (`FormsSidebar`):
- Todos os formulários · Respostas (não lidas, com contador) · Modelos
- **Favoritos** (estrela por usuário) e **Recentes** (os 5 últimos abertos), cada um com bolinha de status (verde publicado, cinza rascunho, vermelho encerrado)
- **+ Formulário** no cabeçalho

O formulário público (`/f/[slug]`) fica **fora** do grupo `(app)`: sem casca, sem login (salvo formulário "só membros").

## Papéis

| Ação | OWNER / ADMIN | MEMBER |
|---|---|---|
| ver a lista de formulários | todos | todos |
| criar formulário | ✅ | ✅ (vira dono do formulário) |
| editar, publicar, encerrar, configurar | todos | os que criou ou em que é colaborador **editor** |
| ver respostas, resumo, exportar | todos | os que criou ou em que é colaborador (editor ou leitor) |
| excluir formulário | todos | os que criou |
| integrações (webhook, CRM) | todos | dono do formulário |
| apagar dados de um titular (LGPD) | ✅ | — |

Quem não pode ver as respostas recebe **404** nas rotas de resposta (e não vê contadores, resumo nem notificações daquele formulário).

## Planos

Acrescente em **todos** os planos de `config/plans.ts` (preservando o que existe):

| | Free | Pro | Business |
|---|---|---|---|
| limite `formsPublished` (publicados e não encerrados) | 3 | ilimitado | ilimitado |
| limite `formResponsesMonthly` (respostas no mês, somando todos os formulários) | 100 | 5.000 | 50.000 |
| feature `forms_logic` (condições em perguntas e páginas) | — | ✅ | ✅ |
| feature `forms_files` (pergunta de arquivo) | — | ✅ | ✅ |
| feature `forms_integrations` (webhooks e envio para o CRM) | — | ✅ | ✅ |
| feature `forms_branding` (sem o rodapé "Feito com {produto}", tema próprio com capa e logo) | — | ✅ | ✅ |
| layout uma por vez, modelos, exportação, notificações, resposta automática | ✅ | ✅ | ✅ |

Regras:
- Feature é conferida ao **publicar** (esquema com lógica sem `forms_logic` → 403 `FEATURE_NOT_IN_PLAN` explicando qual pergunta usa) e ao **responder** (formulário publicado antes de rebaixar continua funcionando até a próxima publicação, para não quebrar um link no ar).
- Limite mensal atingido: os formulários param de aceitar respostas (o público vê "Este formulário não está recebendo respostas no momento"), o dono recebe aviso ao chegar em 80% e em 100%, e **nenhuma resposta é descartada em silêncio**. O mês segue o fuso da empresa.
