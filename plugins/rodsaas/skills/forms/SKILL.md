---
name: forms
description: Preset que soma ao projeto rodsaas o app Forms, de formulários e pesquisas no estilo Typeform/Google Forms — construtor com 20 tipos de pergunta (inclusive CPF, CNPJ, telefone, endereço por CEP, valor em R$, NPS, estrelas, arquivo e consentimento LGPD), páginas, lógica condicional, modo clássico ou uma pergunta por vez, tema da marca, boas-vindas e agradecimento, rascunho com publicação, link público, incorporar no site e QR code, campos ocultos (UTM), limites e encerramento, anti-spam, respostas em tabela com filtros, resumo com gráficos e NPS, funil de conclusão, exportação para Excel, notificações, resposta automática, webhooks assinados, envio de respostas como leads para o CRM e modelos prontos. Use depois do /rodsaas:backend e /rodsaas:frontend quando o usuário pedir formulários, pesquisas, NPS, questionários, inscrições, clone do Typeform/Google Forms/Jotform, ou chamar /rodsaas:forms.
---

# rodsaas · forms

Acrescenta ao projeto o app **Forms**: a empresa monta um formulário em minutos, publica um link (ou incorpora no site), recebe as respostas organizadas e manda cada uma para onde precisa (e-mail, CRM, webhook). O preset **soma**: entra como um app na casca de apps (`skills/frontend/references/12-casca-e-apps.md`), com widgets no Início e resultados na busca global, sem mexer nos outros apps.

Tudo da base continua valendo: auth, empresas com RLS, membros, planos, padrão REST, erros RFC 9457, cursor, OpenAPI → tipos do front, estados de tela, marca, contrato de testids.

## Pré-requisitos

1. `api/`, `web/` e `rodsaas.json`, com typecheck, lint, build e testes **verdes**, já na casca de apps (existe `web/src/config/apps.ts`). Projeto com menu antigo: rode antes o `/rodsaas:apps`.
2. **Add-on `uploads`** (pergunta de arquivo, capa e logo do formulário): se `rodsaas.json` não tiver `uploads` em `addons`, rode o fluxo da skill `uploads` primeiro.
3. Mesma regra de versões das outras skills: `npm view` + doc atual para cada pacote novo (dnd-kit, gerador de QR code, leitor de planilha para exportar `.xlsx`).

## Decisões padrão (confirme numa rodada só)

| Decisão | Padrão |
|---|---|
| Layout | **clássico** (página com várias perguntas e barra de progresso) por padrão; **uma pergunta por vez** (estilo Typeform) como opção por formulário |
| Quem vê as respostas | o criador, os **colaboradores** que ele adicionar e owner/admin. Respostas têm dado pessoal (LGPD); os outros membros veem o formulário, mas não as respostas |
| Endereço público | `https://<app>/f/<slug>` no domínio do painel; slug gerado do título + 6 caracteres (editável) |
| Acesso | público por padrão; opção "só membros da empresa" (pesquisas internas) |
| Publicação | o construtor edita um **rascunho** com salvamento automático; o público só vê a versão **publicada** ("Publicar alterações") |
| Planos | Free: 3 formulários publicados, 100 respostas/mês, rodapé "Feito com {produto}"; Pro: ilimitados, 5.000/mês, lógica, arquivos, integrações (webhook e CRM), sem rodapé; Business: 50.000/mês |
| Modelos | 8 prontos (`scripts/templates.json`): Fale conosco, Orçamento, NPS, Satisfação, Inscrição em evento, Cadastro de cliente, Feedback interno, Candidatura |

Fora da v1 (registre no README do projeto como próximos passos): respostas parciais salvas no servidor, pagamento dentro do formulário (vai com o `pagamento-br`), assinatura desenhada, cálculos/pontuação (quiz), tradução, domínio próprio, Google Sheets/Slack nativos, testes A/B, edição colaborativa em tempo real.

## Fases

Cada fase termina com typecheck, lint, build, testes da fase e commit (`feat(forms): ...`). Não avance com fase quebrada. Use a lista de tarefas.

1. **Integração e regras** — registro do preset e do **app Forms**, planos, e o porte de `scripts/forms-lib.mjs` (com os testes) para o back e o front: é o coração (esquema, lógica, validação). → `references/01-escopo-e-integracao.md`
2. **Modelo** — models com RLS, tabela de busca pública sem RLS, versões, estatísticas, webhooks. → `references/02-modelo.md`
3. **API interna** — formulários, rascunho com versão, publicar/encerrar, modelos, colaboradores, respostas, resumo, funil, exportação. → `references/03-api.md`
4. **API pública** — abrir o formulário publicado, enviar resposta (sem Origin, com anti-spam e limites), eventos de funil, upload de arquivo. → `references/03-api.md`
5. **Construtor** — lista, criar (em branco ou modelo), construtor de três colunas, propriedades, lógica, tema, configurações, compartilhar. → `references/04-construtor.md`
6. **Formulário público** — renderização clássica e uma por vez, validação, lógica ao vivo, máscaras BR, endereço por CEP, arquivos, boas-vindas e agradecimento, incorporação. → `references/05-formulario-publico.md`
7. **Respostas e integrações** — tabela, detalhe, resumo com gráficos, funil, exportação, notificações, resposta automática, webhooks, CRM, LGPD. → `references/06-respostas-e-integracoes.md`
8. **Interações e estados** — salvamento automático, desfazer, arrastar, atalhos, todos os estados de carregamento/vazio/erro. → `references/07-interacoes-e-estados.md`
9. **Fechamento** — `references/08-checklist.md`, testes ponta a ponta, `/rodsaas:verify` (tem uma parte só do Forms), README do projeto.

## Princípios

- **Uma regra, dois lados.** Esquema, lógica condicional e validação vêm do mesmo `forms-lib` no front e no back. O front valida para ajudar; o back valida de novo contra a versão **publicada** e é a palavra final.
- **Resposta nunca se perde.** O respondente não perde o que digitou (rascunho local, erro mostrado no campo certo, botão com loading e chave de idempotência). Formulário que muda depois de publicado não estraga respostas antigas: cada resposta guarda a versão e as perguntas daquela versão.
- **Privacidade por padrão.** Rotas públicas devolvem só o necessário; IP guardado com hash; respostas visíveis só para quem precisa; exportação registrada no audit log; retenção configurável e exclusão por titular (LGPD).
- **Segurança da base, sem exceção.** RLS `FORCE` em todas as tabelas novas (a única sem RLS é a de busca pública por slug, com justificativa no README); relações sempre da mesma empresa, garantido no banco.
- **Todo estado tem tela e toda ação tem feedback**, no construtor e no formulário público (`references/07-interacoes-e-estados.md`).

## Relatório final

O que foi adicionado (app, telas, rotas públicas), planos e limites novos, como testar em 5 minutos (criar pelo modelo "Orçamento" → mudar uma pergunta → publicar → abrir o link num aba anônima → responder escolhendo "Empresa" para ver a lógica → ver a resposta, o resumo e exportar → ligar o envio para o CRM, se houver), o resultado do `/rodsaas:verify`, o que ficou fora da v1 e desvios por versão de pacote.

## Mapa das referências

| Arquivo | Quando ler |
|---|---|
| `references/01-escopo-e-integracao.md` | Fase 1: escopo, app na casca, papéis, planos |
| `references/02-modelo.md` | Fase 2: models, esquema do formulário, versões, RLS, travas |
| `references/03-api.md` | Fases 3 e 4: rotas internas e públicas, erros, testes |
| `references/04-construtor.md` | Fase 5: lista, construtor, propriedades, lógica, tema, compartilhar |
| `references/05-formulario-publico.md` | Fase 6: renderização, uma por vez, validação, incorporação |
| `references/06-respostas-e-integracoes.md` | Fase 7: respostas, resumo, exportação, e-mails, webhooks, CRM, LGPD |
| `references/07-interacoes-e-estados.md` | Fase 8 |
| `references/08-checklist.md` | Fase 9 |
| `scripts/forms-lib.mjs` + `forms-lib.test.mjs` | regras puras (esquema, lógica, validação BR, resumo, NPS, CSV, webhook, lead para o CRM): porte para TS com os testes |
| `scripts/templates.json` | os 8 modelos prontos (todos validados pelos testes) |
