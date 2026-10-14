# Respostas, resumo e integrações

## Respostas (`/forms/f/[id]/respostas`)

- **Tabela** (`forms-responses-table`, linhas `forms-response-row`): primeira coluna fixa "Enviado em" (data e hora no fuso da empresa), depois uma coluna por pergunta da versão publicada (texto exibido com `displayAnswer`; arquivos como chips), colunas dos campos ocultos (escondidas por padrão), estrela. Não lidas em negrito com ponto da marca.
- Colunas configuráveis (mostrar/esconder, ordem), largura ajustável; texto longo truncado com tooltip.
- **Filtros**: período (hoje, 7 dias, 30 dias, intervalo), não lidas, com estrela, por pergunta (opção, sim/não, nota), busca no texto das respostas. Tudo na URL.
- Seleção com checkbox → barra de ações: marcar como lida/não lida, estrela, **Exportar seleção**, excluir (com desfazer).
- **Exportar** (CSV ou Excel) respeitando os filtros, com "Gerando…" e download.
- **Detalhe** no painel lateral (`?r=<id>`): todas as perguntas da **versão respondida** com as respostas, perguntas puladas pela lógica em cinza ("não se aplicou"), arquivos com prévia e download (link temporário), dados técnicos recolhíveis (versão, duração, campos ocultos, navegador), anterior/próxima (setas ← →), estrela, excluir; se virou lead, link "Abrir no CRM".
- Abrir marca como lida (otimista).

## Resumo (`/forms/f/[id]/resumo`, `forms-summary`)

- Filtro de período (o mesmo das respostas).
- **Cartões**: visualizações, iniciados, respostas, taxa de conclusão (respostas ÷ iniciados), tempo médio.
- **Por pergunta** (de `summarize`), na ordem do formulário, cada uma com "N responderam · M pularam":
  - escolhas: barras horizontais com quantidade e %, "Outro" com a lista dos textos (ver todos);
  - NPS: nota grande (−100 a 100) com cor, barras de promotores/neutros/detratores e a distribuição de 0 a 10;
  - estrelas e escala: média e distribuição;
  - número e valor: média, mínimo e máximo;
  - sim/não: duas barras;
  - texto, e-mail, telefone, data: últimas 5 respostas + "Ver todas" (vai para a tabela filtrada).
- **Funil** por página (formulário com mais de uma página): barras decrescentes com a queda entre páginas.
- Sem respostas: estado vazio com **Compartilhar**.
- Gráficos com o padrão de gráficos do projeto e as cores do tema.

## Avisos (notificações e e-mails)

Pelo `notify()` do add-on `notificacoes` (pré-requisito; tipos `forms.*` registrados no catálogo, `canSee` = quem pode ver as respostas daquele formulário):

| Evento | Quem recebe | Tipo |
|---|---|---|
| resposta nova (modo "cada resposta") | dono e colaboradores com acesso | `forms.response.new` (agrupado: "5 novas respostas em Orçamento" se vierem em menos de 2 min) |
| resumo diário (8 h, fuso da empresa) | quem escolheu "resumo diário" | `forms.response.digest` |
| 80% e 100% do limite mensal de respostas | owners/admins | `forms.limit` |
| formulário encerrado automaticamente (data ou limite) | dono | `forms.closed` |
| webhook desativado por falhas | dono | `forms.webhook_disabled` |

**Resposta automática** ao respondente (se ligada e houver e-mail na resposta): assunto e texto configurados (`{nome}` = primeira resposta de texto curto que tenha "nome" no texto da pergunta; `{formulario}`), com a cópia das respostas (`displayAnswer`) se marcado, na marca do produto, enviada pela fila. Limite de 1 e-mail por endereço por formulário a cada 10 min (evita abuso para mandar spam a terceiros).

## Webhooks (`feature: 'forms_integrations'`)

- Evento `form.response.created`, corpo JSON:
  ```json
  { "event": "form.response.created", "form": { "id": "...", "title": "Orçamento", "version": 3 },
    "response": { "id": "...", "submittedAt": "2026-10-13T17:05:00Z",
      "answers": [{ "fieldId": "f_nome", "label": "Nome completo", "type": "short_text", "value": "Ana", "display": "Ana" }],
      "hidden": { "utm_source": "instagram" } } }
  ```
  (arquivos vão como link temporário de 24 h, nunca o conteúdo).
- Header `X-Rodsaas-Signature: t=<unix>,v1=<hmac>` (`forms-lib signWebhook`) e `X-Rodsaas-Event`; `User-Agent: rodsaas-webhooks`. A tela mostra o segredo e um exemplo de verificação em Node (`verifyWebhook`).
- Entrega pela fila: timeout 10 s; sucesso = 2xx; novas tentativas em 1 min, 5 min, 30 min, 2 h e 6 h (`webhookBackoff`); 20 falhas seguidas desativam o webhook e avisam o dono. Histórico das entregas com status, tempo, erro e **Reenviar**.
- **Proteção SSRF**: só `https://` (em produção), recuse IPs privados/locais (127.0.0.0/8, 10.0.0.0/8, 172.16.0.0/12, 192.168.0.0/16, 169.254.0.0/16, ::1, fc00::/7) resolvendo o DNS **antes** de conectar e usando o IP resolvido na conexão; sem seguir redirecionamentos.
- Tela: lista de webhooks (URL, ativo, última entrega com status), **Adicionar**, **Testar**, histórico.

## CRM (preset `crm` instalado + `forms_integrations`)

Aba **Integrações → CRM**: liga/desliga "Criar um lead no CRM a cada resposta", mapeamento das perguntas (nome, e-mail, telefone, empresa, CNPJ, valor e "mensagem" com várias perguntas), origem do lead, distribuição (responsável fixo, rodízio ou sem responsável). Sugere o mapeamento pelos tipos e textos das perguntas.

Na resposta (fila): `leadFromResponse` → `captureLead` do CRM (service interno, não HTTP), com `via: FORM`, título "Ana · Orçamento", o resto das perguntas em `extra`, UTM dos campos ocultos, e as mesmas regras de duplicado do CRM (mesmo e-mail em 10 min vira anotação no lead existente). Grava `createdLeadId` na resposta. Falha não afeta a resposta; aparece no detalhe ("Não foi possível criar o lead · Tentar de novo").

## LGPD

- **Retenção**: job diário apaga de vez as respostas (e arquivos) mais antigas que `privacy.retentionDays` do formulário.
- **Titular** (Configurações → Forms → Privacidade, owner/admin): buscar um e-mail, ver em quais formulários há respostas, **Apagar tudo deste e-mail** com confirmação (`/v1/forms/privacy/erase`).
- IP só como hash com segredo do servidor; nada de IP puro em log de aplicação nas rotas públicas.
- Exportação registra no audit log (quem, qual formulário, filtros, quantidade).
