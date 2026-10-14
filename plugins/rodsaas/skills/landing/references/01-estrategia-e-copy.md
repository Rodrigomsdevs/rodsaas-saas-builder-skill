# 01 · Estratégia e texto

## O que o site precisa fazer

Em 5 segundos, quem chega entende **o que é, para quem é e o que fazer agora**. Em 2 minutos, entende por que é melhor que o jeito atual (planilha, WhatsApp, cinco ferramentas separadas) e quanto vai pagar. O objetivo de toda página é um só: **começar o teste** (ou entrar na lista de espera do app que ainda não saiu).

## MENSAGEM.md (Fase 1, antes de qualquer tela)

Escreva `site/MENSAGEM.md` e mostre ao usuário antes de construir:

1. **Público**: quem compra (dono, gestor) e quem usa (equipe), segmento principal e o que usam hoje.
2. **Promessa** em uma frase (vira o título da home).
3. **Três pilares** (viram as seções do meio da home). Para uma suíte de apps:
   - *Tudo num lugar só*: os apps conversam (o lead do formulário vira negócio, o agendamento cai no CRM, o cliente do Suporte é o mesmo contato).
   - *Liga só o que usa, paga só pelo que usa*: começa grátis, cada app no seu preço, Completo como teto.
   - *Feito para o Brasil*: português, R$, CPF/CNPJ, CEP, feriados, Pix, dados isolados por empresa.
4. **Objeções e respostas** (viram o FAQ e frases de apoio): "dá trabalho migrar", "é caro", "meus dados ficam seguros?", "tem fidelidade?", "funciona no celular?", "e se eu precisar de ajuda?".
5. **CTAs**: principal ("Começar grátis"), secundário ("Ver os apps" / "Ver preços"), por app ("Testar o CRM grátis"), em breve ("Quero ser avisado").

## Título e subtítulo da home

- Título com **benefício concreto**, até ~10 palavras. Fórmulas que funcionam:
  - *Tudo de [área] num lugar só* → "Todos os apps da sua empresa numa bancada só."
  - *[Resultado] sem [dor]* → "Vendas, atendimento e agenda sem planilha e sem WhatsApp perdido."
  - *O [categoria] que [diferença]* → "O sistema que cresce junto com a sua empresa, um app de cada vez."
- Subtítulo: **o que tem dentro e o porquê**, até ~25 palavras: "CRM, atendimento, agenda, tarefas e mais, integrados entre si e em português. Ligue só o que usar e pague por isso."
- Abaixo do CTA, uma linha que tira o medo, **só se for verdade**: "Grátis para até 2 pessoas · sem cartão · cancele quando quiser".

## Regras de escrita

- **Português do Brasil, "você"**, frases curtas, voz ativa. Leia em voz alta: se tropeçar, reescreva.
- **Específico vence adjetivo**: "o cliente marca sozinho no horário livre" > "agendamento inteligente e poderoso".
- **Benefício antes do recurso**: primeiro o que muda na vida da pessoa, depois como.
- **Sem jargão técnico** para o comprador: "dados isolados por empresa, com trava no próprio banco" em vez de "multi-tenant com RLS"; "funciona no navegador e no celular" em vez de "SaaS responsivo".
- **Palavras proibidas** (genéricas ou exageradas): revolucionário, solução completa, alavancar, potencializar, robusto, de ponta, inovador, sinergia, "tudo o que você precisa" sem dizer o quê.
- **Números só reais**: preço, limite do plano, dias de teste. Nada de "economize 70%" sem conta; se quiser mostrar economia, mostre a conta na calculadora ("5 pessoas × R$ 59 numa ferramenta de CRM separada").
- **Sem citar concorrente por nome** em comparação. Use a categoria ("CRMs avulsos", "planilhas", "ferramentas separadas").
- **Um CTA principal por seção**, com verbo e resultado. Botões secundários com aparência secundária.
- **Microtextos que tiram dúvida** perto de onde ela nasce: debaixo do preço ("cobrado por vendedor que usa o CRM"), debaixo do botão ("leva 1 minuto").

## Estrutura da home (ordem)

| # | Seção | Conteúdo |
|---|---|---|
| 1 | Topo (nav) | logo, Apps (menu com categorias), Preços, Segurança, Entrar, **Começar grátis** |
| 2 | Hero | título, subtítulo, 2 CTAs, linha de segurança, print grande do produto em moldura de navegador (versão clara/escura) |
| 3 | Faixa de apps | ícones dos apps disponíveis com nome (clicáveis) + "e mais N em breve" |
| 4 | Pilar 1: tudo integrado | diagrama do fluxo entre apps (Forms → CRM → Agenda → Suporte) + vídeo curto do CRM |
| 5 | Destaques por app | 3 a 4 blocos alternando texto e print/vídeo (os apps mais fortes para o segmento) |
| 6 | Pilar 2: liga só o que usa | como funciona em 3 passos (crie a conta → ligue os apps → convide a equipe) + mini calculadora ou chamada para /precos |
| 7 | Pilar 3: feito para o Brasil | grade com os itens de `catalog.platform` (notificações, busca, segurança, celular, Brasil) |
| 8 | Catálogo completo | grade de todos os apps por categoria, disponíveis primeiro, "Em breve" com selo |
| 9 | Prova social | **só com material real autorizado**; sem isso, a seção não existe (não deixe espaço vazio nem "em breve") |
| 10 | FAQ | 6 a 8 perguntas das objeções |
| 11 | CTA final | faixa na cor da marca: título curto + botão |
| 12 | Rodapé | colunas Produto, Apps (por categoria), Empresa (contato, segurança), Legal (termos, privacidade), razão social e CNPJ |

## Página de app disponível (`/apps/<slug>`)

1. Hero: ícone, nome, `tagline` como título, `description`, CTA "Testar o <app> grátis" (cadastro com `?apps=<id>`) e "Ver preço"; print principal em moldura.
2. Vídeo do app (quando houver) com legenda curta.
3. Os 3 `benefits` em cards.
4. `features` em grade com ícones de check.
5. "Substitui": `replaces` ("chega de planilhas de vendas e CRMs avulsos").
6. "Funciona junto com": `relatedApps()` com links.
7. Preço do app (`priceLabel`) + "ou tudo no Completo por R$ 69/usuário".
8. FAQ do app (`faq` do catálogo + 2 gerais).
9. CTA final.

## Página de app "Em breve"

1. Hero com selo **Em breve**, ícone grande (ilustração com o ícone e a cor da categoria, **nunca uma tela falsa**), `tagline`, `description`.
2. "O que vem no <app>": `benefits` e `features` no futuro ("vai ter").
3. CTA **"Quero ser avisado"** → lista de espera com o app marcado.
4. "Enquanto isso": apps disponíveis relacionados.
5. Sem preço (o `priceLabel` devolve "Preço no lançamento").

## Página de preços

- Topo: título ("Pague só pelo que usar"), alternância **Mensal / Anual (2 meses grátis)**.
- Três cartões: **Grátis** (até 2 pessoas, apps do grátis, limites), **Por app** (monte o seu, com a calculadora logo abaixo), **Completo** (R$ 69/usuário, tudo incluso, destacado).
- **Calculadora** (`03-estrutura.md`): liga apps, informa pessoas por app e colaboradores (RH), mostra o total avulso, o Completo e qual sai mais barato, e o valor no anual.
- Tabela com o preço de cada app disponível e a unidade ("por vendedor", "por profissional com agenda").
- Add-ons por uso explicados em uma linha cada.
- FAQ de cobrança: como conta "usuário", troca de plano a qualquer momento, cancelamento, formas de pagamento (as que existirem de verdade: cartão; Pix e boleto quando o `pagamento-br` existir), nota fiscal (só se emitir).

## FAQ geral (escolha e adapte)

- **Preciso instalar alguma coisa?** Não: funciona no navegador do computador e do celular.
- **Meus dados ficam seguros?** Cada empresa tem os dados isolados, com trava no próprio banco de dados; conexão sempre criptografada (HTTPS); backups (só diga a frequência se ela existir de verdade).
- **Posso cancelar quando quiser?** Sim, sem multa (se o plano não tiver fidelidade).
- **Como funciona o teste?** 14 dias com tudo liberado; no fim, você escolhe os apps ou fica no grátis.
- **O preço é por usuário?** Cada app conta quem usa aquele app; o Completo conta quem usa o sistema.
- **Consigo trazer minhas planilhas?** CRM e contatos importam planilha; o resto, conforme o app.
- **Tem suporte em português?** Sim, pelo e-mail de suporte (e WhatsApp, se houver).

## Textos do catálogo

O `catalogo.json` traz `tagline`, `description`, `benefits`, `features`, `replaces` e `faq` prontos para cada app. Use como base e **adapte ao segmento** escolhido (exemplos de clínica para quem atende clínicas), sem mudar o que o app faz. Não invente recurso que a skill do app não entrega: confira na skill do preset (`skills/<preset>/SKILL.md`) antes de prometer.
