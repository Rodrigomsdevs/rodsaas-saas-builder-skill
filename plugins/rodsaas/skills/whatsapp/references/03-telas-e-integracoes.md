# 03 · Telas e ligação com os apps

## Telas

| Rota | Tela |
|---|---|
| ★ `/configuracoes/whatsapp` | **Conexão** (owner/admin): status (`wa-connection`, `data-status`), provedor (`wa-driver`, `<select>` com os drivers registrados; "Teste (simulado)" = falso), número (`wa-phone`, máscara BR), credenciais do driver (campos que o driver declara), **Conectar** (`wa-connect`), segredo do webhook mostrado uma vez com copiar (`wa-webhook-secret`) e a URL do webhook; app padrão do que chega; **Modelos** (`wa-template-row`, `data-status`: aprovado/pendente/reprovado com o motivo; **+ Modelo** `wa-template-new` com prévia e as variáveis numeradas) |
| ★ `/whatsapp` | **Caixa** (quem tem acesso): lista de conversas (`wa-conversation-row`, `data-phone`, com não lidas e o app de origem), conversa (`wa-thread`) com as mensagens (`wa-message`, `data-direction` `IN`/`OUT`, `data-status`, ✓ enviada, ✓✓ entregue, ✓✓ azul lida, ⚠ falhou com o motivo e "tentar de novo"), selo da janela (`wa-window`, `data-open`: "Janela aberta até 15:32" / "Fora da janela: só modelo"), resposta (`wa-reply` + `wa-reply-send`) quando a janela está aberta, ou escolha de modelo (`wa-reply-template`) quando fechada; descadastrado aparece com o selo e sem envio |

Estados: sem conexão → vazio que ensina ("Conecte o WhatsApp da empresa" com o botão para Configurações); driver falso → faixa "Modo de teste: as mensagens são simuladas" e o botão **Simular resposta do cliente** (chama `/fake/inbound`); erro da conexão → faixa vermelha com **Reconectar**.

## Ligação com os apps (cada app registra o handler e usa `whatsapp.send()`)

| App | Sai pelo WhatsApp | Chega pelo WhatsApp |
|---|---|---|
| **Agenda** | `notifyClient` manda, além do e-mail: confirmação (`agenda_confirmacao`), lembrete com **Confirmo / Remarcar** (`agenda_lembrete`), sinal pendente (`agenda_sinal`), vaga da lista de espera (`espera_vaga`) — variáveis: primeiro nome, serviço, quando, link | "1"/"Confirmo" (resposta à confirmação/lembrete) → `clientConfirmedAt`; "2"/"Remarcar" → manda o link de remarcar; outro texto → avisa quem atende |
| **CRM** | botão WhatsApp no contato/negócio usa `whatsapp.send()` quando conectado (modelos do CRM ou texto livre na janela); senão o link `wa.me` | conversa aparece na linha do tempo do contato (casado pelo telefone); número desconhecido como app padrão → lead na caixa de leads |
| **Suporte** | resposta pública do chamado de origem WhatsApp sai pelo WhatsApp (modelo `suporte_atualizacao` fora da janela) | mensagem nova → chamado novo (canal `WHATSAPP`) ou entra no chamado aberto do mesmo número; fotos/áudios como anexos (add-on `uploads`) |
| **Comercial** | link da proposta (texto na janela; fora dela o modelo `proposta_enviada`: primeiro nome, empresa, código, link) e do envelope de assinatura (`assinatura_link`) | resposta vai para a linha do tempo da proposta |
| **Financeiro** | link de cobrança (`cobranca_link`) e lembrete de vencimento | resposta avisa o financeiro |

App não instalado: a linha some (nada quebra). Todo envio de app passa pelo descadastro e pelo limite do plano; falha não desfaz a ação do app (o agendamento continua; o e-mail continua indo).

## Contrato testável (testids)

| testid | Onde |
|---|---|
| `wa-connection` (`data-status`), `wa-driver`, `wa-phone`, `wa-connect`, `wa-webhook-secret`, `wa-template-row` (`data-status`), `wa-template-new` | Configurações → WhatsApp |
| `wa-conversation-row` (`data-phone`), `wa-thread`, `wa-message` (`data-direction`, `data-status`), `wa-window` (`data-open`), `wa-reply`, `wa-reply-send`, `wa-reply-template` | Caixa |
