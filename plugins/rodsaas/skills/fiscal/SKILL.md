---
name: fiscal
description: Add-on que dá ao projeto rodsaas um motor de documentos fiscais com drivers trocáveis — o projeto é dono da NF-e (modelo 55) e da NFC-e (modelo 65), com emitente, regras de imposto por operação/destino/NCM (padrão do Simples já pronto), numeração por série sem buraco, chave de acesso com DV, totais com desconto e frete rateados, IBS/CBS da reforma tributária, validação antes de numerar, status e eventos (cancelamento no prazo, carta de correção, inutilização), contingência da NFC-e, QR Code e XML no layout 4.00; transmitir é trabalho de um driver com o mesmo contrato (driver falso para dev e testes agora; provedores como Focus NFe, NFE.io, PlugNotas e Nuvem Fiscal, ou a SEFAZ direta, depois). Base para a NFS-e do Financeiro. Liga no ERP (pedido → NF-e, PDV → NFC-e). Use quando o usuário pedir nota fiscal, NF-e, NFC-e, cupom fiscal, emitir nota de venda, cancelar nota, carta de correção, integrar com provedor de nota ou SEFAZ num projeto rodsaas, ou chamar /rodsaas:fiscal.
---

# rodsaas · fiscal

Um **motor** de documentos fiscais para todos os apps do projeto. O motor é dono do documento e das regras; o provedor (ou a SEFAZ) só transmite. Trocar de provedor, ou ligar a emissão direta na SEFAZ no futuro, não mexe em nenhum app.

```
app ── fiscal.issue({ orgId, model: 55 | 65, recipient, items, freight?, discount?, payments?, ref: { app, entity, id } }) ──▶ motor
        regra por item (pickTaxRule → CFOP, CSOSN/CST, PIS/COFINS, IBS/CBS) · rateio (allocate) · impostos (itemTaxes)
        · totais (documentTotals) · validateDocument → 400 com o caminho ANTES de gastar número
        → número da série (nextNumber, trava de linha) · chave (accessKey + mod11) · XML (buildXml) · QR (NFC-e)
        → PROCESSING → fila fiscal.transmit → driver do emitente (fake | focus | nfeio | plugnotas | sefaz).authorize()
        → AUTHORIZED (protocolo) | REJECTED (código + motivo em português, corrige e reenvia com o mesmo número)
        | DENIED | SEFAZ fora: NFC-e em CONTINGENCY (tpEmis 9, reenvia sozinha) · NF-e espera na fila
eventos ── cancelar (cancelCheck: prazo e justificativa) · carta de correção (correctionCheck: só NF-e, até 20)
        · inutilizar faixa (voidCheck: nenhum número usado) → driver → protocolo
```

## Antes de começar

- Projeto rodsaas com `api/` e `web/` verdes, fila pg-boss e o add-on `notificacoes` (rejeição e contingência avisam a equipe).
- **Não precisa de certificado, CSC nem conta em provedor**: a instalação sai com o driver **falso** (`fake`) em **homologação**, que simula autorização, rejeição, denegação, queda da SEFAZ, cancelamento, carta de correção e inutilização — é o que o dev e o `/rodsaas:verify` usam. Provedor real, certificado A1, token e CSC são do usuário, pedidos só quando ele escolher o provedor; guardados criptografados, nunca no código nem no log.
- **Imposto é responsabilidade do contador.** O motor sai com as regras padrão do Simples Nacional (sem substituição tributária) para a nota sair; a tela de regras diz isso e pede a revisão. Regime normal começa com as regras marcadas "revisar" e não emite até alguém revisar.
- Mesma regra de versões das outras skills (`npm view` + documentação atual do provedor e as notas técnicas vigentes do Portal Nacional da NF-e ao escrever um driver real).

## Como trabalhar (obrigatório)

1. **Leia a referência da fase inteira antes de começar a fase**, do início ao fim. Cada fase aponta o arquivo (→ `references/...`).
2. **Tudo o que está nas referências é escopo**, exceto o que está marcado como fora. Nada de "versão simplificada": mandar o pedido direto para a API do provedor, número gerado pelo provedor ou por `max()+1` sem trava, imposto calculado na tela, nota sem validação antes de numerar ou cancelamento sem prazo **não é** o motor desta skill. **Nenhum app chama provedor direto** — sempre `fiscal.issue()`.
3. **O contrato testável (rotas ★, testids) é o mínimo que o `/rodsaas:verify` confere, não o escopo.**
4. **Conferência ao fim de cada fase**: tabela com cada item da referência e ✅/❌ com o arquivo; só avance com tudo ✅ (o resto vira pendência no relatório). Use o "Pronto quando" como mínimo.
5. Se o usuário pedir para pular algo, registre como desvio no relatório final.

## Projeto que já emite nota (revisão)

Se `rodsaas.json → addons` tem `fiscal`, ou o projeto já emite nota (chamada direta a um provedor, botão "emitir nota" no ERP), rode em **modo revisão**: leia todas as referências, monte a tabela de lacunas (comece pelo "Pronto quando" das fases 1 e 2: provedor chamado direto sem driver, numeração sem trava, sem validação antes, sem prazo de cancelamento, sem contingência) e complete fase por fase. A integração que existe vira um **driver** (nada se perde; notas antigas continuam consultáveis). Feche com `references/04-checklist.md` e `/rodsaas:verify -g "Fiscal"`.

## Decisões padrão (confirme numa rodada só)

| Decisão | Padrão |
|---|---|
| Driver na instalação | **falso** (`fake`), ambiente **homologação** (2); produção só quando o usuário trocar, com confirmação digitando o CNPJ |
| Um emitente por empresa | sim (CNPJ, IE, UF, município, endereço, regime, séries, driver e credenciais criptografadas); filiais com outro CNPJ ficam fora da v1 |
| Regras de imposto | Simples Nacional: `defaultSimplesRules` (5102 dentro do estado, 6102 fora, 7102 exterior, CSOSN 102/300, PIS/COFINS 49, devolução 1202); regime normal: regras criadas para revisar |
| IBS/CBS | ligado pelo `ibsCbsRequired(regime, data)` (normal desde 03/08/2026, Simples desde 01/01/2027) com `IBS_CBS_2026` (CBS 0,9%, IBS UF 0,1%, município 0%); o contador ajusta CST e cClassTrib |
| Séries | NF-e série 1, NFC-e série 1, número por (empresa, modelo, série) com trava de linha |
| Prazos | cancelamento NF-e 24 h, NFC-e 30 min (configurável: varia por UF); NFC-e acima de R$ 10.000,00 exige CPF/CNPJ (configurável) |
| Planos | add-on da base: feature `fiscal` (Pro e Business), limite `fiscalDocumentsMonthly` (Pro 500, Business 5.000); o custo do provedor é da empresa |

Fora da v1 (registre no README do projeto): NFS-e emitida por este motor (a base está pronta; quem usa é o Financeiro, com o driver do padrão nacional), CT-e, MDF-e, SAT/MF-e, NF-e de entrada/importação, substituição tributária calculada (ICMS-ST, DIFAL, FCP — as regras aceitam o CST, o cálculo fica com o provedor ou o contador), manifestação do destinatário e download de notas recebidas, SPED/EFD, filiais com outro CNPJ, impressão térmica direta (o DANFE NFC-e abre na impressão do navegador).

## Fases

Cada fase termina com typecheck, lint, testes e commit (`feat(fiscal): ...`).

1. **Motor** — porte do `fiscal-lib` (com os testes), models, numeração com trava, serviço `fiscal.issue()`, fila `fiscal.transmit`, registro de drivers (`validateDriver`) e o driver **falso**. → `references/01-motor-e-drivers.md`
   - *Pronto quando*: `issue` escolhe a regra, rateia, calcula, valida e só então numera; chave com DV; XML gerado; driver falso com autorização, rejeição 778, denegação, queda e eventos simuláveis; número nunca repete nem pula (a não ser inutilizado).
2. **API** — emitente, regras, documentos, reenvio, cancelamento, carta de correção, inutilização, XML e DANFE. → `references/02-api.md`
   - *Pronto quando*: rotas ★; erros com o caminho; rejeição corrigível e reenviada com o mesmo número; cancelamento no prazo; NFC-e em contingência quando a SEFAZ cai e autorizada quando volta.
3. **Telas e apps** — Configurações → Fiscal (emitente, provedor, séries, regras), Notas (lista, emitir, detalhe com XML/DANFE, cancelar, corrigir, inutilizar) e as ligações com o ERP (pedido → NF-e, PDV → NFC-e) e o Financeiro. → `references/03-telas-e-integracoes.md`
   - *Pronto quando*: configurar e emitir pela tela; faixa de homologação visível; ERP fatura o pedido com o NCM do produto e o cliente; PDV emite NFC-e quando ligado.
4. **Fechamento** — `references/04-checklist.md`, `rodsaas.json → addons` com `fiscal`, README (como trocar de driver, ir para produção, variáveis), `/rodsaas:verify -g "Fiscal"`.

## Princípios

- **Motor dono do documento, driver só transmite.** Número, chave, regras, totais, validação, status e prazos são do motor; o driver traduz para o provedor (ou para a SEFAZ) e de volta.
- **Valida antes de gastar número.** Erro de cadastro aparece no campo, em português, antes de existir nota.
- **Número é sagrado.** Nunca repete, nunca some: rejeitada reenvia com o mesmo número; o que não vai ser usado é inutilizado.
- **A venda não para.** SEFAZ fora: NFC-e sai em contingência e é transmitida sozinha depois; NF-e espera na fila e avisa.
- **Imposto tem dono.** Padrões para começar, revisão do contador pedida na tela, nada escondido.

## Relatório final

Driver e ambiente ativos (e como trocar/ir para produção), emitente configurado, regras criadas e se foram revisadas, séries e próximos números, apps ligados (ERP/PDV/Financeiro), limite do plano, variáveis que faltam, resultado do `/rodsaas:verify -g "Fiscal"`, desvios.

## Mapa das referências

| Arquivo | Quando ler |
|---|---|
| `references/01-motor-e-drivers.md` | Fase 1: modelo de dados, numeração, serviço, fila, contrato do driver, driver falso, como escrever provedor e SEFAZ |
| `references/02-api.md` | Fase 2: rotas ★, formatos, erros, testes obrigatórios |
| `references/03-telas-e-integracoes.md` | Fase 3: telas, testids, ERP, PDV, Financeiro |
| `references/04-checklist.md` | Fase 4 |
| `scripts/fiscal-lib.mjs` + `fiscal-lib.test.mjs` | CPF/CNPJ, chave de acesso, regras, impostos, IBS/CBS, rateio, totais, validação, fluxo, prazos, eventos, numeração, retornos da SEFAZ, QR Code, XML, contrato do driver: porte para TS com os testes |
