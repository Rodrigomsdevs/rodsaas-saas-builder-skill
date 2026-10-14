---
name: atualizar
description: Atualiza um projeto rodsaas já existente para a versão atual de todas as skills de uma vez — lê o rodsaas.json, e para cada parte instalada (base, add-ons e apps como CRM, Forms, Agenda, Suporte, Tarefas, Páginas, Pessoas, Financeiro, Comercial, ERP e workstation) roda o modo revisão da skill dela, um módulo por vez, com a tabela de lacunas, migrations só aditivas, testes e commit por módulo, e um arquivo de progresso que deixa retomar de onde parou. Use quando o usuário pedir para atualizar, refatorar ou revisar todos os módulos, trazer o projeto para a versão nova do plugin, aplicar as melhorias novas (ex.: a Agenda com recepção, comissões e clube), ou chamar /rodsaas:atualizar (opcionalmente com os módulos: /rodsaas:atualizar agenda erp).
---

# rodsaas · atualizar

Traz um projeto feito com o rodsaas (ou por outra IA seguindo o contrato) para o que as skills pedem **hoje**. Não gera nada do zero: para cada parte instalada, roda o **modo revisão** da skill dela ("Projeto que já tem … (revisão)" no `SKILL.md` de cada uma), completa o que falta e prova com testes. É longo de propósito: muitos módulos, cada um feito inteiro.

## Como trabalhar (obrigatório)

1. **Um módulo por vez, inteiro.** Nunca "passe rapidinho" por vários: termine (tabela, código, testes, commit) antes de abrir o próximo. Se o contexto ficar curto, pare no fim de um módulo, atualize o progresso e diga ao usuário para continuar com `/rodsaas:atualizar` (retoma sozinho).
2. **Leia a skill do módulo inteira** antes de mexer: `SKILL.md` e **todas** as referências, do início ao fim. A versão nova costuma trazer fases novas (ex.: Agenda fases 8 e 9; ERP inteiro); elas são a lacuna principal.
3. **Tabela de lacunas antes de codar**: item da referência · ✅/❌ · onde está ou o que falta, começando pelo "Pronto quando" de cada fase. Mostre ao usuário a tabela resumida (quantos ✅/❌ por fase) e siga — só pare para perguntar o que for decisão dele (ex.: perfil do negócio da Agenda, regras de comissão), e uma vez só, juntando as perguntas do módulo.
4. **Sem perder nada**: migrations **só aditivas** (colunas novas com padrão, tabelas novas; renomear = coluna nova + cópia + manter a antiga até o fim); nunca apagar dados nem trocar o que o usuário personalizou — personalização que conflita com a referência vira linha "mantido por escolha do usuário" no relatório.
5. **Libs puras**: se a skill tem `scripts/*-lib.mjs`, o porte do projeto (`api/src/modules/<app>/lib/`) é **substituído pela versão nova** com os testes novos portados; nada de reimplementar à mão o que a lib já faz.
6. **Prova por módulo**: typecheck, lint, build, testes do módulo (com os da lib) e `/rodsaas:verify -g "<parte>"` verdes; depois `git commit` (`chore(atualizar): <módulo> — <o que entrou>`).
7. **Arquivo de progresso** `rodsaas-atualizacao.md` na raiz do projeto, atualizado ao fim de cada módulo (é o que deixa retomar sem refazer): versão do plugin, ordem, status por módulo (⏳ pendente · 🔧 em andamento · ✅ feito · ⚠️ feito com pendências), resumo da tabela de lacunas e as pendências com o motivo.

## Ordem

Leia `rodsaas.json` (`presets`, `addons`, `apps`) e monte a fila só com o que está instalado (ou só com os módulos pedidos: `/rodsaas:atualizar agenda erp`), nesta ordem (dependências primeiro):

| # | Parte | Skill (modo revisão) | Por quê aqui |
|---|---|---|---|
| 1 | base da API | `backend` | auth, empresas, planos, acessos por pessoa: tudo depende |
| 2 | base do painel | `frontend` e `apps` (casca de apps) | telas, componentes, trilho |
| 3 | add-ons | `notificacoes`, `email`, `uploads` | os apps registram avisos e anexos neles |
| 4 | apps | `crm`, `forms`, `agenda`, `helpdesk`, `tarefas`, `notion`, `rh`, `financeiro`, `comercial`, `erp` | nessa ordem: os de baixo usam os de cima (Agenda usa Forms e Financeiro; Comercial e ERP usam CRM e Financeiro) — integração com app que ainda vai ser atualizado fica para a passada dele |
| 5 | cobrança por app | `workstation` | catálogo, preços e segmentos dos apps já atualizados |
| 6 | site | `landing` | textos e prints do catálogo novo |
| 7 | fechamento | `verify` (bateria completa) | prova que nada regrediu |

Preset novo que o projeto ainda não tem (ex.: ERP) **não entra** sem o usuário pedir; liste no relatório como disponível.

## Por módulo

1. Marque 🔧 no progresso.
2. Leia a skill inteira e rode o modo revisão dela (a seção "Projeto que já tem …" diz por onde começar).
3. Tabela de lacunas → código fase por fase → testes → verify da parte → commit.
4. Marque ✅ (ou ⚠️ com as pendências) e escreva o resumo no progresso.

*Pronto quando*: nenhuma linha ❌ sem pendência registrada; testes e `/rodsaas:verify -g "<parte>"` verdes; commit feito; progresso atualizado.

## Fechamento

`/rodsaas:verify` completo (todas as partes) verde, `rodsaas.json → updatedWith` com a versão do plugin, README do projeto com o que mudou, e o relatório final.

## Relatório final

Por módulo: o que entrou (em uma linha), pendências e o motivo, o que foi mantido por escolha do usuário; migrations novas (todas aditivas); variáveis de ambiente novas (ex.: `AGENDA_ENCRYPTION_KEY`); presets disponíveis que o projeto não tem; resultado do verify. Diga como testar em 5 minutos o principal de cada app atualizado (cada skill traz o seu no "Relatório final").

## Princípios

- **Atualizar não é reescrever**: o que já está certo fica; só entra o que falta.
- **Dados do cliente são sagrados**: nenhuma migration destrutiva, nenhum dado apagado.
- **Retomável**: o arquivo de progresso diz exatamente onde parou; nunca refaça um módulo ✅ sem motivo.
