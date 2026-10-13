# Checklist final (Fase 8)

Confira item por item antes do relatório. Para os itens de interface, **abra a tela** (com a API rodando) — não marque pelo código.

## Verificação automática (obrigatória)
- [ ] `/rodsaas:verify`: auditoria do contrato sem pendências e bateria completa verde (relatório em `rodsaas-verify-report/`)

## Plano e cobrança
- [ ] sem Stripe (modo de teste): owner assina, troca, cancela e retoma; limites e features mudam no app
- [ ] admin vê sem botões e com o aviso; membro não acessa
- [ ] diálogo de troca com prévia e aviso de limite no downgrade
- [ ] cadastro com `?plano=` segue para a assinatura

## Build e qualidade
- [ ] `npm run typecheck`, `npm run lint`, `npm run build` sem erros nem warnings novos
- [ ] `npm test` verde (máscaras CPF/CNPJ/telefone/CEP, `applyApiErrors`, `messageFor`, formatadores)
- [ ] `npm run api:types` roda e não há tipo de resposta declarado à mão
- [ ] nenhuma cor fixa em componente (`grep` por `#[0-9a-f]{3,6}` e `-(blue|red|green|gray)-[0-9]` em `src/` fora de `ui/` e `theme.css`)

## Marca
- [ ] `theme.css` gerado pelo script a partir do `rodsaas.json`; relatório de contraste sem falhas
- [ ] claro e escuro conferidos em todas as telas (inclusive dialogs, toasts e skeletons)
- [ ] logo no menu (expandido e recolhido), nas telas de auth e no favicon
- [ ] `tenantLabel` e concordância corretos em todos os textos ("Nova clínica", "da clínica")

## Sessão e segurança
- [ ] rota do app deslogado → `/entrar?next=…` e volta para a rota após entrar
- [ ] `next` aceita só caminhos internos (testar `?next=https://site-externo.com` → vai para `/inicio`)
- [ ] access token vencido: a tela continua funcionando (refresh automático) — teste esperando o TTL ou encurtando-o em dev
- [ ] várias requests expirando juntas geram **um** refresh (aba Network)
- [ ] refresh inválido → volta para entrar, sem loop
- [ ] trocar de empresa não mostra nenhum dado da anterior
- [ ] sair limpa tudo; voltar com o botão do navegador não mostra dado em cache
- [ ] nenhum token em `localStorage`, `sessionStorage` ou cookie legível por JS (só o `session_hint`)

## Estados (em cada tela com dados)
- [ ] skeleton com o formato do conteúdo na primeira carga
- [ ] vazio com ação · vazio por filtro com "limpar" · erro com "tentar de novo"
- [ ] 404 de recurso cai no `not-found` com a casca; rota inexistente idem
- [ ] `error.tsx` mostra o código do erro; `global-error` funciona sem providers

## Ações
- [ ] todo botão de ação tem loading, mantém a largura e não aceita clique duplo
- [ ] criação idempotente: clicar de novo após erro de rede não duplica
- [ ] erro de validação da API aparece no campo certo
- [ ] toda ação destrutiva pede confirmação com o nome da ação no botão
- [ ] limite do plano abre o `UpgradeDialog` (owner vê planos; outros veem a orientação)
- [ ] alterações não salvas são protegidas ao fechar sheet/dialog e ao sair da página

## Listas
- [ ] busca com debounce; filtros e cursor na URL; voltar/avançar do navegador funcionam
- [ ] Anterior/Próxima corretos nas bordas; trocar filtro volta ao início
- [ ] no celular a tabela vira cards

## Fluxos ponta a ponta (Playwright, contra a API real)
- [ ] cadastro → início com primeiros passos
- [ ] entrar / sair / esqueci a senha (e-mail capturado no Mailpit em dev)
- [ ] convidar membro → aceitar convite com conta nova
- [ ] criar, editar, arquivar e excluir projeto
- [ ] atingir o limite de projetos do plano Free → `UpgradeDialog`
- [ ] membro comum não vê ações de admin; owner vê "Plano e cobrança"

## Acessibilidade e responsivo
- [ ] navegação completa por teclado nas telas de auth, lista e formulário
- [ ] foco visível em tudo; ícones com rótulo
- [ ] 360px de largura sem rolagem horizontal; menu vira drawer

## Entrega
- [ ] `web/README.md`: como rodar, variáveis, como regenerar tipos e tema, como criar uma tela nova seguindo o molde
- [ ] `brand-preview.html` no `.gitignore`
- [ ] relatório final com o que ficou pendente (logo definitivo, domínios de produção, configuração do portal da Stripe)
