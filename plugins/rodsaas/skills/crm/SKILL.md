---
name: crm
description: Preset que soma ao projeto rodsaas um CRM de vendas completo (estilo Pipedrive) — empresas com busca por CNPJ, contatos com WhatsApp, caixa de leads, vários funis com etapas e probabilidade, quadro kanban com totais em R$, negócios com produtos, ganho/perda com motivo, atividades (ligação, reunião, tarefa, WhatsApp, visita) com agenda, histórico com anotações e anexos, campos personalizados, etiquetas, captura de leads por API e formulário do site, importação de CSV/Excel sem duplicar, exportação, visibilidade por vendedor e relatórios (funil de conversão, ganhos e perdas, previsão, ranking, motivos de perda, tempo por etapa). Use depois do /rodsaas:backend e /rodsaas:frontend (com ou sem outros presets) quando o usuário pedir CRM, funil de vendas, pipeline, leads, gestão comercial, clone do Pipedrive/RD Station CRM/HubSpot, ou chamar /rodsaas:crm.
---

# rodsaas · crm

Acrescenta a um projeto rodsaas um **CRM de vendas de verdade**, pensado para PMEs brasileiras: o vendedor abre o funil de manhã, vê o que está atrasado, liga ou chama no WhatsApp, registra o que aconteceu e move o negócio, e o gestor acompanha números confiáveis. O preset **soma** ao projeto: entra como um **app** na casca (trilho de apps), com widgets no Início e resultados na busca global, e convive com `tarefas`, `notion` e os módulos do `/rodsaas:module`.

Tudo da base continua valendo: auth, empresas com RLS, membros, convites, planos, Stripe, padrão REST, erros RFC 9457, cursor, OpenAPI → tipos do front, estados de tela, marca, contrato de testids.

## Pré-requisitos

1. `api/`, `web/` e `rodsaas.json`, com typecheck, lint, build e testes **verdes**.
2. **Add-on `uploads`** (anexos e importação): se `rodsaas.json` não tiver `uploads` em `addons`, rode o fluxo da skill `uploads` primeiro (leia o `SKILL.md` dela) e volte.
3. Mesma regra de versões das outras skills: `npm view` + doc atual para cada pacote novo (dnd-kit, recharts, leitor de planilha).

## Como trabalhar (obrigatório)

1. **Leia a referência da fase inteira antes de começar a fase**, do início ao fim, não por amostragem nem resumo. Cada fase aponta o arquivo (→ `references/...`).
2. **Tudo o que está nas referências é escopo da v1**, exceto o que está em "Fora da v1". Nada de "versão simplificada", "básico por enquanto" ou "dá para melhorar depois": um negócio só com título e valor, sem pessoa, empresa, produtos e histórico, **não é** o CRM desta skill.
3. **O contrato testável (testids e rotas ★) é o mínimo que o `/rodsaas:verify` consegue conferir, não o escopo.** Passar no verify não significa que a fase acabou.
4. **Conferência ao fim de cada fase**: antes do commit, monte uma tabela com **cada item** da referência da fase (cada linha de tabela e cada marcador) e o status ✅ feito / ❌ faltando, com o arquivo onde está. Só avance com tudo ✅; o que não der para fazer vira pendência explícita no relatório final, com o motivo. Use o "Pronto quando" de cada fase abaixo como mínimo.
5. Se o usuário pedir para pular ou cortar algo, registre como desvio no relatório final.

## Projeto que já tem o CRM (revisão)

Se `rodsaas.json → presets` já tem `crm` (ou existe `api/src/modules/crm`), rode em **modo revisão** em vez de instalar de novo:

1. Leia todas as referências (`01` a `07`) inteiras.
2. Compare item a item com o código (API, telas, testes) e monte a tabela de lacunas: item da referência · ✅/❌ · onde está ou o que falta. Comece pelo "Pronto quando" das fases 3, 4 e 7 (é onde mais se simplifica: negócio sem pessoa/empresa/produtos, sem barra de etapas, sem histórico, conversão de lead sem vincular contato).
3. Mostre a tabela ao usuário e complete o que falta **fase por fase**, sem reescrever o que já está certo e sem perder dados (migrations só aditivas).
4. Feche com `references/07-checklist.md` e `/rodsaas:verify` (`-g "CRM"`).

## Decisões padrão (confirme numa rodada só)

| Decisão | Padrão |
|---|---|
| Visibilidade | configurável por empresa: **Todos veem tudo** (padrão) ou **Cada vendedor vê os seus** (negócios, leads e atividades; contatos e empresas são sempre compartilhados para não duplicar). Owner/admin veem tudo sempre |
| Leads | **caixa de entrada separada**: lead chega (manual, captura, importação), é qualificado e vira negócio na conversão |
| Produtos | catálogo + itens no negócio (quantidade, preço, desconto); com itens, o valor do negócio é a soma |
| Captura | chave de API (Zapier, Make, n8n, backend próprio, Meta Ads via essas ferramentas) e formulário público para o site (com origem autorizada e anti-spam) |
| Campos personalizados | na v1, para empresa, contato e negócio (o lead usa os campos do negócio) |
| Moeda | só R$, guardado em centavos |
| Dados de exemplo | botão "Carregar dados de exemplo" no estado vazio (não entram sozinhos para não sujar contadores) |
| Planos | Free: 1 funil, 1.000 contatos+empresas, 3 campos; Pro: 5 funis, 25.000, 30 campos, produtos, captura, relatórios; Business: ilimitado |

Fora da v1 (registre no README do projeto como próximos passos): sincronizar e-mail, enviar e-mail pelo CRM, metas por vendedor, automações por etapa, integração oficial com WhatsApp e Meta Lead Ads direto, propostas em PDF, mesclar contatos duplicados, participantes extras no negócio, ordenação por campo personalizado, tempo real (a v1 atualiza ao focar a janela e a cada 30 s).

## Fases

Cada fase termina com typecheck, lint, build, testes da fase e commit (`feat(crm): ...`). Não avance com fase quebrada. Use a lista de tarefas.

1. **Integração e contrato**: registrar o preset e o **app CRM** no registro de apps (menu do app, widgets do Início, provedor da busca, contador no trilho), notificações, planos. → `references/01-escopo-e-integracao.md`
   - *Pronto quando*: app no trilho com o menu completo do `01`, `rodsaas.json` atualizado, limites e features em todos os planos, `crm-lib` portado com os testes passando.
2. **Modelo e regras**: models, migrations com RLS e triggers, funil inicial, visibilidade, histórico de etapas, campos personalizados, deduplicação. → `references/02-modelo.md`
   - *Pronto quando*: **todos** os models do `02` existem (empresas, contatos, ligação empresa↔contato, funis, etapas, negócios com `contactId`/`companyId`/`leadId`, itens e produtos, leads, atividades, anotações, histórico de etapas, campos, etiquetas, origens, motivos, chaves), cada um com RLS `FORCE` e as travas de mesma empresa.
3. **API de cadastros e funil**: empresas (com CNPJ), contatos, negócios, quadro, ganhar/perder, produtos, configurações. → `references/03-api.md`
   - *Pronto quando*: negócio criado e alterado **com contato e empresa** (`DealCard`/`DealDetail` devolvem os dois), contato e empresa devolvem os negócios ligados, itens de produto recalculam o valor no servidor, relação com registro de outra empresa recusada, filtros `contactId`/`companyId` funcionando.
4. **Leads, atividades e histórico**: caixa de leads e conversão, atividades e agenda, anotações, anexos, linha do tempo, notificações. → `references/03-api.md`
   - *Pronto quando*: converter lead cria (ou reaproveita) contato e empresa e grava o `leadId` no negócio; atividades ligadas a negócio, lead, contato ou empresa; linha do tempo junta anotações, atividades, mudanças e arquivos.
5. **Captura, importação e exportação**: chaves e formulários públicos, importação de CSV/Excel em etapas com desfazer, exportação. → `references/06-captura-e-importacao.md`
6. **Relatórios**: funil de conversão, ganhos e perdas, previsão, por vendedor, motivos de perda, tempo por etapa. → `references/03-api.md`
7. **Telas**: funil (quadro e lista), negócio, leads, contatos, empresas, atividades, produtos, relatórios, importação, configurações. → `references/04-telas.md`
   - *Pronto quando*: a página do negócio tem **as quatro partes** do `04` (cabeçalho com valor e ganhar/perder, barra de etapas, coluna de detalhes com Resumo · **Pessoa** · **Empresa** · **Produtos** · campos · lead de origem, e área com compositor, planejado e histórico); "+ Negócio" com pessoa e empresa; contato e empresa com a aba Negócios e "+ Negócio" já preenchido; card do quadro com empresa/contato; todos os testids da seção "Contrato testável".
8. **Interações e estados**: arrastar e soltar, otimismo e desfazer, WhatsApp e ligação com registro, atalhos, todos os estados de carregamento/vazio/erro. → `references/05-interacoes-e-estados.md`
9. **Fechamento**: `references/07-checklist.md`, testes ponta a ponta, `/rodsaas:verify` (a bateria tem uma parte só do CRM), README do projeto.

## Princípios

- **Soma, não substitui.** Nenhum arquivo da casca é reescrito; o preset registra o app dele em `config/apps.ts` e a casca de apps faz o resto (`references/01-escopo-e-integracao.md`).
- **O vendedor não pode perder tempo.** Mover etapa, concluir atividade, ganhar, atribuir, etiquetar: tudo otimista e com desfazer. Ligar ou chamar no WhatsApp é um clique e já oferece registrar a atividade.
- **Número confiável.** Totais do funil, valor ponderado, previsão, taxa de conversão e tempo por etapa são calculados no servidor a partir do histórico de etapas, nunca no front. O valor do negócio com produtos é recalculado no servidor.
- **Sem duplicidade.** E-mail, CPF e CNPJ não se repetem na empresa (garantido no banco); telefone igual gera aviso. Importação, captura e conversão de lead reaproveitam o contato existente.
- **Segurança da base, sem exceção.** RLS `FORCE` em todas as tabelas novas; visibilidade "cada um vê os seus" aplicada por um helper único em **todas** as queries e testada rota a rota (404 para quem não vê); relações sempre da mesma empresa, garantido no banco; rotas públicas de captura com chave, limite e sem vazar nada.
- **Todo estado tem tela e toda ação tem feedback.** A lista completa está em `references/05-interacoes-e-estados.md`; ela é parte do escopo, não acabamento.

## Relatório final

O que foi adicionado (menu, telas, rotas), planos e limites novos, como testar em 5 minutos (carregar dados de exemplo → criar empresa pelo CNPJ → criar negócio → arrastar no quadro → agendar ligação → concluir pela agenda → ganhar → mandar um lead pela chave de API com `curl` → converter → ver o relatório), o resultado do `/rodsaas:verify`, o que ficou fora da v1 e desvios por versão de pacote.

## Mapa das referências

| Arquivo | Quando ler |
|---|---|
| `references/01-escopo-e-integracao.md` | Fase 1: escopo, contrato de preset, papéis, planos |
| `references/02-modelo.md` | Fase 2: models, RLS, triggers, regras de cada entidade |
| `references/03-api.md` | Fases 3, 4 e 6: todas as rotas, filtros, erros, testes |
| `references/04-telas.md` | Fase 7: cada tela e o que ela tem |
| `references/05-interacoes-e-estados.md` | Fase 8: arrastar, otimismo, WhatsApp, atalhos, estados |
| `references/06-captura-e-importacao.md` | Fase 5: captura por API/formulário, importação, exportação |
| `references/07-checklist.md` | Fase 9 |
| `scripts/crm-lib.mjs` | regras puras (telefone, dinheiro, CNPJ/CPF, mapeamento de colunas, dedupe, previsão, campos personalizados, captura): porte para TS com os testes de `crm-lib.test.mjs` |
