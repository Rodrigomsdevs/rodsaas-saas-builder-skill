# 05 · E-mail, jobs e canais

## Jobs (pg-boss)

| Fila | Quando | Faz |
|---|---|---|
| `notifications.email` | um por notificação imediata, `startAfter = emailDueAt − agora`, `singletonKey = id` | `emailAction(n, def, now)`: `wait` → reagenda para `at`; `skip` → `emailStatus = SKIPPED` (lida antes) ou nada; `send` → junta com as outras prontas da mesma pessoa e empresa e envia **um** e-mail (`bundleImmediate`) |
| `notifications.sweep` | a cada 5 min | rede de segurança: imediatas `PENDING` com `emailDueAt` vencido há mais de 2 min (o job se perdeu) → processa igual |
| `notifications.digest` | a cada 15 min | para cada pessoa com `emailMode = DAILY` ou com algum tipo em `DAILY`: `digestDue({ lastDigestAt, timeZone: org.timezone, hour: digestHour, now })` → `buildDigest(pendentes)`; vazio → só grava `lastDigestAt`; senão envia, marca as incluídas `SENT` e grava `lastDigestAt` |
| `notifications.cleanup` | diário, 3 h | `retentionCutoffs()`, em lotes de 1.000 |

Detalhes:
- Antes de enviar, confira de novo: ainda é membro ativo, a empresa não desligou o app, a notificação não foi lida, a preferência atual ainda pede e-mail (se a pessoa desligou depois, `SKIPPED`).
- Envio pelo `Mailer` da base (skill `/rodsaas:email`: Resend em produção, Mailpit em dev), pela fila `email.send` (retry com backoff); os cabeçalhos abaixo vão no campo `headers` do Resend e a tag `tipo=notificacao`. Reclamação de spam (webhook do Resend) desliga o e-mail de notificações da pessoa. Sucesso → `emailStatus = SENT`, `emailedAt`; falha definitiva → `FAILED` (não tenta para sempre; o sino continua).
- Marcar como `SENT` **antes** de enfileirar o `email.send`, numa transação com `UPDATE … WHERE emailStatus = 'PENDING' RETURNING id` (dois workers não mandam o mesmo e-mail).
- Mudança de `digestHour`/`emailMode` vale no próximo ciclo; trocar de `DAILY` para `IMMEDIATE` faz as pendentes do resumo saírem no próximo `notifications.sweep` (como imediatas).

## E-mails

Templates em TS (funções que devolvem `{ subject, html, text }`), em português, com a marca do `rodsaas.json` (logo, cor), layout de uma coluna que funciona no celular e no modo escuro do cliente de e-mail.

### Imediato (uma notificação)

- **Assunto**: a frase (`segmentsText`), até 120 caracteres (ex.: "Ana mencionou você em MKT-12 · Revisar contrato").
- **Corpo**: nome da empresa no topo; a frase com destaques (`segmentsHtml`, escapado); o trecho (`snippet`) em citação; botão "Abrir" → `WEB_URL + url`; rodapé: "Você recebeu porque <motivo do tipo>." · **Parar de receber este tipo** (página de descadastro com o token do tipo) · **Preferências de notificação** (`/configuracoes/notificacoes`).
- **Texto puro** equivalente (sem HTML).

### Imediato agrupado (várias prontas da mesma pessoa)

- **Assunto**: "3 novidades em Acme".
- **Corpo**: lista com cada frase, hora relativa e link; "Ver todas" → `/notificacoes`. Rodapé com "parar de receber todos os e-mails de notificação" (token `"*"`).

### Resumo diário

- **Assunto**: "Seu resumo de Acme: 8 novidades" (`buildDigest`).
- **Corpo**: blocos por app (rótulo do app e quantidade), até 5 itens por app (frase + link) e "+3 no Tarefas" quando passar; "Ver todas" → `/notificacoes`. Rodapé com "trocar para e-mail na hora", preferências e "parar de receber o resumo" (token `"*"`).
- Só **não lidas** que esperavam o resumo; resumo vazio não é enviado.

### Cabeçalhos

Todo e-mail de notificação leva:
- `List-Unsubscribe: <API_PUBLIC_URL/v1/public/notifications/unsubscribe?token=…>` e `List-Unsubscribe-Post: List-Unsubscribe=One-Click` (`listUnsubscribeHeaders`; RFC 8058, exigido por Gmail e Yahoo);
- `Auto-Submitted: auto-generated` (evita resposta automática de volta);
- `X-Entity-Ref-ID: <notificationId>` (o Gmail não junta e-mails diferentes na mesma conversa).

O link visível no rodapé leva à **página** de descadastro do painel (`/notificacoes/descadastrar?token=…`), que mostra o que vai acontecer e confirma com um botão (antivírus de e-mail abrem links sozinhos: GET nunca descadastra).

## Registro de canais (ponto de extensão)

```ts
// api/src/modules/notifications/channels.ts
export interface NotificationChannel {
  id: "email" | "whatsapp" | "push" | string;
  label: string;                                   // "WhatsApp"
  enabledFor(userId: string, orgId: string): Promise<boolean>;   // tem telefone verificado, assinatura de push…
  sendImmediate(batch: { userId: string; orgId: string; items: NotificationView[] }): Promise<void>;
  sendDigest?(digest: DigestView): Promise<void>;
}
registerChannel(emailChannel);   // a v1 registra só o e-mail
```

- O job imediato e o resumo percorrem os canais registrados; a v1 tem só o e-mail.
- O add-on `whatsapp` (Fase 2 do roadmap) registra o canal dele; a preferência por tipo ganha a coluna do canal sem mudar os apps (`types[tipo].whatsapp`). Push no navegador entra do mesmo jeito.

## Testes obrigatórios (jobs)

- Imediato sem agrupamento sai no primeiro ciclo; com agrupamento espera 60 s de silêncio, mas sai em até 3 min mesmo com eventos chegando.
- Várias prontas da mesma pessoa → 1 e-mail com assunto "N novidades"; pessoas diferentes → e-mails separados.
- Lida antes do envio → `SKIPPED`, nenhum e-mail. Preferência desligada depois → `SKIPPED`. Removido da empresa → nada.
- Dois workers ao mesmo tempo → um e-mail só.
- Resumo: sai às `digestHour` no fuso da empresa (teste com relógio falso em `America/Sao_Paulo` e num fuso com horário de verão), uma vez por dia, só com não lidas; vazio não envia.
- Todo e-mail tem `List-Unsubscribe` e `List-Unsubscribe-Post`; o link do rodapé abre a página (GET não descadastra).
- Limpeza apaga só o que passou da retenção.
