# Especificação do módulo

Cada módulo tem um arquivo `rodsaas/modules/<nome>.json` na raiz do projeto. Ele é a fonte da verdade: a geração lê dele, e alterações começam nele.

## Formato

```json
{
  "name": "appointments",
  "model": "Appointment",
  "label": { "singular": "Agendamento", "plural": "Agendamentos", "gender": "m" },
  "route": "agendamentos",
  "icon": "CalendarClock",
  "titleField": "title",
  "fields": [
    { "name": "title", "label": "Título", "type": "text", "required": true, "max": 120, "list": true, "search": true },
    { "name": "client", "label": "Cliente", "type": "relation", "target": "clients", "required": true, "onDelete": "restrict", "list": true, "filter": true },
    { "name": "startsAt", "label": "Início", "type": "datetime", "required": true, "list": true, "filter": true, "sort": true },
    { "name": "price", "label": "Valor", "type": "money", "list": true, "sort": true },
    {
      "name": "status", "label": "Status", "type": "status", "required": true, "default": "SCHEDULED", "list": true, "filter": true,
      "options": [
        { "value": "SCHEDULED", "label": "Agendado", "color": "info" },
        { "value": "DONE", "label": "Realizado", "color": "success" },
        { "value": "CANCELED", "label": "Cancelado", "color": "destructive" }
      ]
    },
    { "name": "assignee", "label": "Profissional", "type": "user", "filter": true },
    { "name": "notes", "label": "Observações", "type": "longtext", "max": 2000 }
  ],
  "defaultSort": { "field": "startsAt", "direction": "asc" },
  "views": ["table", "board"],
  "boardField": "status",
  "permissions": {
    "create": ["OWNER", "ADMIN", "MEMBER"],
    "update": ["OWNER", "ADMIN", "MEMBER"],
    "delete": ["OWNER", "ADMIN"],
    "onlyOwnRecords": false
  },
  "planLimit": null,
  "audit": true
}
```

### Campos do topo

| Chave | Regra |
|---|---|
| `name` | inglês, plural, camelCase, único no projeto (`appointments`, `serviceOrders`) |
| `model` | singular, PascalCase (`Appointment`) |
| `label` | `singular`, `plural` e `gender` (`m`/`f`) para a concordância ("Novo agendamento", "Nova consulta") |
| `route` | português, kebab-case, único (`agendamentos`, `ordens-de-servico`) |
| `icon` | nome de ícone do lucide |
| `titleField` | um campo `text` obrigatório; é o "nome" do registro em detalhe, busca e selects de relação |
| `defaultSort` | campo com `sort: true`, ou `createdAt` |
| `views` | `["table"]` ou `["table", "board"]`; quadro exige `boardField` do tipo `status` |
| `permissions` | papéis por ação; `onlyOwnRecords: true` faz MEMBER editar/excluir só o que ele criou (owner/admin editam tudo) |
| `planLimit` | `null` ou uma chave de limite (`"appointments"`), que passa a existir em todos os planos do `plans.ts` |
| `audit` | registra criar/editar/excluir no audit log |

Todo model ganha automaticamente: `id` (uuidv7), `organizationId`, `createdById`, `createdAt`, `updatedAt`. Não declare esses campos.

### Propriedades de campo

| Chave | Significado |
|---|---|
| `name` | camelCase, único no módulo, não pode ser um dos automáticos |
| `label` | rótulo na interface |
| `type` | ver tabela de tipos |
| `required` | obrigatório (padrão `false`) |
| `default` | valor inicial |
| `unique` | único **dentro da empresa** (vira `@@unique([organizationId, campo])`) |
| `max` / `min` | limites (tamanho de texto ou valor numérico) |
| `list` | aparece como coluna na lista |
| `filter` | aparece nos filtros da lista |
| `search` | entra na busca textual da lista (só tipos de texto) |
| `sort` | coluna ordenável |
| `help` | texto de ajuda abaixo do campo no formulário |

## Tipos de campo

| Tipo | Banco (Prisma) | Entrada (Zod) | Formulário | Lista | Filtro |
|---|---|---|---|---|---|
| `text` | `String` | string, trim, `max` (padrão 200) | input | texto | — (use `search`) |
| `longtext` | `String` | string, `max` (padrão 5.000) | textarea | — (só no detalhe) | — |
| `integer` | `Int` | inteiro | input numérico | número | intervalo |
| `decimal` | `Decimal @db.Decimal(14, 4)` | string numérica → Decimal | input numérico com vírgula | número BR | intervalo |
| `money` | `Int` (centavos) | inteiro ≥ 0 | input de moeda (R$) | `R$ 1.234,56` | intervalo |
| `percent` | `Decimal @db.Decimal(7, 4)` | 0–100 | input com % | `12,5%` | intervalo |
| `boolean` | `Boolean @default(false)` | boolean | switch | ✓ / — | sim/não |
| `date` | `DateTime @db.Date` | `YYYY-MM-DD` | calendário | `12/10/2026` | intervalo |
| `datetime` | `DateTime` | ISO 8601 | calendário + hora | `12/10/2026 14:30` | intervalo |
| `status` | `enum` do Prisma | um dos `options` | select com cores | badge colorido | múltipla escolha |
| `select` | `String` | um dos `options` | select | texto | múltipla escolha |
| `tags` | `String[]` | lista de strings curtas | input de etiquetas | chips | contém |
| `email` | `String` | e-mail, minúsculas | input email | link `mailto:` | — (busca) |
| `phone` | `String` (só dígitos) | 10–11 dígitos | máscara `(00) 00000-0000` | formatado + link WhatsApp | — (busca) |
| `url` | `String` | `http`/`https` | input url | link | — |
| `cpf` | `String` (só dígitos) | CPF válido | máscara CPF | formatado | — (busca) |
| `cnpj` | `String` (14 posições, maiúsculas) | CNPJ válido, aceita alfanumérico | máscara CNPJ | formatado | — (busca) |
| `cpfCnpj` | `String` | CPF ou CNPJ válido | máscara que troca pelo tamanho | formatado | — (busca) |
| `cep` | `String` (só dígitos) | 8 dígitos | máscara + busca de endereço | formatado | — |
| `address` | campos `addressZip`, `addressStreet`, `addressNumber`, `addressComplement`, `addressDistrict`, `addressCity`, `addressState` | cada parte validada; UF com 2 letras | grupo com CEP que preenche o resto | cidade/UF | UF |
| `relation` | FK composta (ver abaixo) | uuid de registro da mesma empresa | select com busca no módulo alvo | título do alvo (link) | escolha do alvo |
| `user` | `String @db.Uuid` (membro) | uuid de membro da empresa | select de membros | avatar + nome | escolha de membro |

Máscaras e validações BR: as mesmas do frontend (`lib/masks.ts`) e repetidas no backend (o front nunca é a única validação).

Cores de `status`: `default`, `info`, `success`, `warning`, `destructive` (viram as cores do tema; nada de cor fixa).

Tipos que **não** existem nesta versão: arquivo/imagem (depende do add-on de uploads), texto rico, relação muitos-para-muitos. Se o usuário pedir, explique e proponha: link (`url`) no lugar do arquivo, `longtext` no lugar do texto rico, `tags` ou um módulo intermediário no lugar do muitos-para-muitos.

## Relações

`relation` = "este registro pertence a um registro de outro módulo" (muitos-para-um): agendamento → cliente.

| Chave | Valores |
|---|---|
| `target` | `name` de outro módulo do projeto (precisa existir em `rodsaas/modules/`) |
| `onDelete` | `restrict` (padrão: não deixa excluir o cliente que tem agendamentos; a API responde 409 dizendo quantos) ou `cascade` (exclui junto, e o diálogo de confirmação avisa) |

No módulo alvo, a relação aparece automaticamente como **aba no detalhe** ("Agendamentos deste cliente"), com a mesma lista filtrada.

A garantia de que a relação nunca aponta para outra empresa fica **no banco**, não só no código (`02-backend.md`).

## O validador

`scripts/validate-spec.mjs <arquivo>` confere formato, nomes, tipos, propriedades permitidas por tipo, `titleField`, `defaultSort`, quadro, permissões, relações (o alvo existe na mesma pasta) e conflitos com nomes reservados. Saída com a lista de problemas em português; código de saída 0 = válido.
