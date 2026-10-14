# 07 · Checklist final

## Regras
- [ ] `workstation-lib` e `catalog-lib` portados com todos os testes
- [ ] `config/workstation.ts` com preços confirmados e `featureMap` sem feature órfã (log do que caiu em `_paid`)

## Cadastro e onboarding
- [ ] empresa nova (cadastro e seletor) nasce em teste de 14 dias; `intent` da landing guardado
- [ ] `/boas-vindas` com segmento, apps sugeridos (landing primeiro), estimativa, convites; pular funciona
- [ ] conteúdo inicial de cada app só ao ligar, uma vez (`AppActivation`)
- [ ] "Primeiros passos" no Início

## Cobrança
- [ ] sync cria produtos/preços de cada app, faixa, suíte (volume com mínimo) e Completo, mensal e anual
- [ ] checkout com vários itens (Stripe) e modo de teste aplicando na hora
- [ ] prévia com proporcional antes de toda mudança; `CONFIRM_REQUIRED` quando aumenta o valor
- [ ] acesso por pessoa muda a quantidade; membro removido sai dos acessos
- [ ] jobs: lembretes do teste, fim do teste, virada de período, reconciliação de assentos
- [ ] webhooks sincronizam itens e modelo, idempotentes; pagamento falhou → aviso

## Acesso e direitos
- [ ] guard de app em todas as rotas autenticadas dos apps; bloqueado = só leitura; sem acesso = 403
- [ ] presets sem mudança nos guards (features/limites calculados)
- [ ] jobs de app bloqueado não mandam nada para fora; `notify()` ignora app bloqueado
- [ ] `me.workstation` completo

## Telas
- [ ] cadastro com o quadro da landing; onboarding; banner do teste e de cobrança
- [ ] loja (Todos os apps + Configurações → Apps) com estados e ações
- [ ] pessoas com acesso com o efeito no valor
- [ ] Assinatura com calculadora igual à da landing, prévia, cancelar/retomar; `/configuracoes/plano` redireciona
- [ ] app bloqueado e sem acesso com a faixa e o CTA certo
- [ ] todos os testids do "Contrato testável" do `05`; celular

## Integração
- [ ] migração das empresas existentes (Free → teste de presente; pago → legacy) com relatório
- [ ] landing lendo os preços daqui; CTAs com `intent`
- [ ] presets registrando rotas e ativação; notificações novas registradas
- [ ] `rodsaas.json` com `addons: [..., "workstation"]` e `billing.model: "apps"`
- [ ] `/rodsaas:verify` verde (`-g "Workstation"` e a bateria inteira)
- [ ] **conferência final**: tabela item a item de todas as referências (01–06) com ✅/❌ e o arquivo onde está
