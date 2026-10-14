# 09 · Perfis de segmento (barbearia, salão, clínica, odonto…)

A Agenda é **uma só** para todos os negócios. O que muda por segmento é o **perfil**: vocabulário das telas e dos e-mails, o que vem ligado na criação, os tipos de exemplo e os atalhos do menu. Nada de "Agenda Barbearia" separada: um recurso que faz sentido para mais de um segmento entra no núcleo e o perfil só decide se ele já vem ligado.

## Onde fica

- `AgendaSettings.segment` (`GENERAL` · `BARBERSHOP` · `SALON` · `CLINIC` · `DENTAL` · `PET` · `CONSULTING`), escolhido no onboarding da workstation (o segmento da empresa vira o perfil pelo `agendaProfileFor` do `workstation-lib`) ou na primeira vez que alguém abre a Agenda ("Que tipo de negócio é o seu?", com "Outro" = `GENERAL`). Muda depois em Configurações → Perfil.
- Regras e textos vêm do `agenda-lib` (`SEGMENTS`, `vocabulary`): a API devolve `vocabulary` em `GET /v1/agenda/settings` e na página pública; o front **nunca** escreve "cliente" ou "profissional" fixo nas telas da Agenda — usa as palavras do perfil (`useAgendaWords()`), com maiúscula e plural vindos dele.
- Trocar de perfil **não apaga nada** nem desliga o que já está em uso: só muda as palavras e o que o menu destaca. Ligar um recurso continua sendo uma opção na tela dele.

## O que cada perfil liga e mostra

| Perfil | Palavras | Já vem ligado | Tipos de exemplo (inativos) | Destaques do menu |
|---|---|---|---|---|
| `GENERAL` | cliente · profissional · serviço | — | Reunião de 30 minutos | Agenda, Agendamentos |
| `BARBERSHOP` | cliente · barbeiro · serviço | combos, fila do dia, comissões, clube, fidelidade, confirmação | Corte (30 min), Barba (20 min, combinável), Corte + barba, Pezinho (10 min) | **Recepção do dia**, Fila, Clube, Comissões |
| `SALON` | cliente · profissional · serviço | combos, recursos (cadeiras/macas), comissões, fidelidade, sinal, confirmação | Escova (45 min), Corte feminino (60 min), Manicure (40 min, combinável), Coloração (120 min, com sinal de 30%) | Recepção do dia, Comissões |
| `CLINIC` | paciente · profissional · procedimento | recursos (salas), recorrência, anamnese, convênio, retorno, confirmação, lista de espera | Consulta (30 min), Retorno (20 min), Sessão (50 min, recorrente) | Recepção do dia, Retornos, Convênios |
| `DENTAL` | paciente · dentista · procedimento | o do `CLINIC` + termo de consentimento | Avaliação (30 min), Limpeza (40 min, retorno em 180 dias), Restauração (60 min), Manutenção de aparelho (20 min, mensal) | Recepção do dia, Retornos, Convênios |
| `PET` | tutor · profissional · serviço | combos, recursos (mesas/boxes), retorno, confirmação | Banho (60 min), Tosa (90 min), Banho + tosa, Consulta veterinária (30 min) | Recepção do dia, Retornos |
| `CONSULTING` | cliente · consultor · reunião | sinal | Reunião de 30 minutos, Diagnóstico (60 min, com sinal) | Agenda, Agendamentos |

"Já vem ligado" quer dizer: a configuração do recurso nasce preenchida (ex.: barbearia nasce com regra de comissão padrão de 40% em serviços e 10% em produtos, cartão fidelidade "a cada 10, um grátis" **desligado até o owner confirmar**, e a confirmação de presença pedida no lembrete de 24 h). Recurso pago (feature de plano) aparece com o selo e o `UpgradeDialog`; o perfil não liga nada que o plano não tem.

## Barbearia e salão (o que o dono procura)

- **Recepção do dia** como tela principal (`05-app-interno.md`): colunas por profissional, quem chegou, quem está atendendo, quem está atrasado, fila de quem chegou sem hora.
- **Combos** (corte + barba) com preço e duração somados, num agendamento só, com a mesma pessoa.
- **Fila do dia** para quem chega sem hora marcada, com a previsão de espera.
- **Concluir o atendimento** com os serviços feitos e os produtos vendidos (pomada, shampoo) e a forma de pagamento → **comissão** de cada profissional.
- **Clube de assinatura** ("corte ilimitado R$ 89/mês" ou "4 cortes por mês") cobrado todo mês pelo Financeiro.
- **Fidelidade** ("a cada 10 cortes, 1 grátis").
- **Confirmação** pelo WhatsApp e **sinal** para quem falta muito.

## Clínica e odontologia (o que o consultório procura)

- **Salas e equipamentos** como recursos (consultório 1, cadeira odontológica, sala de procedimento): o horário só existe se o profissional **e** a sala estão livres.
- **Recorrência**: sessão semanal (fisioterapia, psicologia), manutenção mensal (ortodontia), em série.
- **Anamnese** antes da primeira consulta (formulário do Forms) e **termo de consentimento** assinado (Comercial) quando o procedimento pede.
- **Convênio** do paciente: quais convênios cada procedimento aceita, valor do convênio (coparticipação) e relatório por convênio. **Não** é faturamento TISS (fora da v1).
- **Retorno sugerido**: o procedimento diz "retorno em 180 dias"; ao concluir, nasce um lembrete de retorno com a data, e a recepção vê a lista de "retornos vencendo" com o link para o paciente marcar.
- **Lista de espera** para quem quer um horário mais cedo.
- **Prontuário, odontograma, receituário e evolução clínica ficam fora** da Agenda: são o app **Clínica** (preset futuro), que usa a Agenda por baixo.

## Testes obrigatórios

- Trocar o perfil muda `vocabulary` na API e as palavras nas telas da Agenda e na página pública ("Paciente" no formulário do odonto); não apaga tipos, regras nem agendamentos.
- Empresa nova com o perfil escolhido nasce com os tipos de exemplo **inativos** do perfil e as configurações do "já vem ligado".
- O perfil não liga recurso fora do plano.
