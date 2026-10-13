# Captura, importação e exportação

## Captura de leads (`feature: 'crm_capture'`)

Dois tipos de entrada, configurados em **Configurações → Captura de leads**:

| Tipo | Para quê | Segredo |
|---|---|---|
| **Chave de API** | servidor para servidor: Zapier, Make, n8n, backend do site, Meta Lead Ads/Google Ads **por meio dessas ferramentas**, RD Station etc. | chave secreta `rsk_…`, mostrada **uma vez** |
| **Formulário do site** | `<form>` HTML ou `fetch` direto do navegador, numa página do cliente | token público `rsf_…` + lista de origens autorizadas |

### Modelo

```prisma
enum CrmCaptureKind   { API FORM }
enum CrmCaptureAssign { NONE FIXED ROUND_ROBIN }

model CrmCaptureKey {                    // com RLS, como toda tabela de negócio
  id              String           @id @default(uuid(7)) @db.Uuid
  organizationId  String           @db.Uuid
  name            String                              // "Site institucional", "Zapier Meta Ads"
  kind            CrmCaptureKind
  prefix          String                              // primeiros 8 caracteres, para reconhecer na lista
  allowedOrigins  String[]         @default([])       // só FORM: "https://www.cliente.com.br"
  redirectUrl     String?                             // só FORM: página de obrigado padrão
  assignMode      CrmCaptureAssign @default(FIXED)
  assigneeIds     String[]         @default([]) @db.Uuid
  rrCursor        Int              @default(0)
  defaultSourceId String?          @db.Uuid
  defaultTagIds   String[]         @default([]) @db.Uuid
  leadsCount      Int              @default(0)
  lastUsedAt      DateTime?
  revokedAt       DateTime?
  createdById     String           @db.Uuid
  createdAt       DateTime         @default(now())
}

model CrmCaptureLookup {                 // SEM RLS (precisa ser lido antes de saber a empresa), como o PublicShare do notion
  secretHash     String   @id                // sha256 da chave (API) ou do token (FORM)
  organizationId String   @db.Uuid
  keyId          String   @unique @db.Uuid
}
```

- A tabela sem RLS guarda **só** hash → empresa/chave; toda a configuração fica na tabela com RLS, lida já dentro de `withTenant(organizationId)`. Registre a justificativa no README do projeto (mesma regra da base).
- Chave: `rsk_` + 32 bytes aleatórios em base64url; token: `rsf_` + 16 bytes. Guardar só o **sha256**; comparar pelo hash (busca por igualdade no índice).
- Revogar apaga a linha de `CrmCaptureLookup` e marca `revokedAt` (para de funcionar na hora). "Gerar nova chave" = revogar + criar outra com a mesma configuração.

### Rotas de gestão (owner/admin)

| Rota | Faz |
|---|---|
| `GET /v1/crm/capture-keys` | lista (sem segredo): nome, tipo, prefixo, origens, distribuição, leads recebidos, último uso, revogada |
| ★ `POST /v1/crm/capture-keys` | `{ name, kind, allowedOrigins?, redirectUrl?, assignMode?, assigneeIds?, defaultSourceId?, defaultTagIds? }` → **`{ id, key }`** (`key` só nesta resposta; para FORM é o token público, que pode ser mostrado de novo) |
| `PATCH /v1/crm/capture-keys/:id` | tudo menos o segredo |
| ★ `DELETE /v1/crm/capture-keys/:id` | revoga |
| `POST /v1/crm/capture-keys/:id/test` | cria um lead de teste ("Lead de teste") pelo mesmo caminho da captura, para o cliente ver chegando |

### Rotas públicas

| Rota | Config | Faz |
|---|---|---|
| ★ `POST /v1/public/crm/leads` | `public: true`, **sem checagem de Origin/CSRF** (não usa cookie), rate limit 60/min por chave, body ≤ 32 KB | `Authorization: Bearer rsk_…` (aceita também `X-Api-Key`); JSON → **201 `{ id, status: 'created' }`**; repetido → 200 `{ id, status: 'duplicate' }` |
| `POST /v1/public/crm/forms/:token` | `public: true`, CORS só para `allowedOrigins` (sem credenciais), rate limit 10/min por IP e 300/h por formulário, body ≤ 32 KB | JSON ou `application/x-www-form-urlencoded`; resposta JSON `{ ok: true }` para `fetch`, ou **303** para `_redirect`/`redirectUrl` em envio de formulário comum (sem redirect: página de obrigado simples com a marca) |
| `OPTIONS /v1/public/crm/forms/:token` | — | preflight com as origens autorizadas |

Regras da captura (service único `captureLead(key, payload, meta)`, usado pelas duas rotas, pelo botão "testar" e, sem chave, por outros presets como o **Forms**, que passa a origem e a distribuição da configuração dele; as regras 1 a 3 valem só para as rotas públicas):

1. Chave/token inexistente ou revogado → **401 `CAPTURE_KEY_INVALID`** (mesma resposta nos dois casos, sem dizer qual). Empresa sem a feature (rebaixou o plano) → 403 `FEATURE_NOT_IN_PLAN` com mensagem clara para quem integrou.
2. FORM: `Origin` (ou, sem ele, `Referer`) precisa estar em `allowedOrigins` → senão 403 `FORM_ORIGIN_NOT_ALLOWED`. `_redirect` só é seguido se tiver a mesma origem de uma origem autorizada (evita redirecionamento aberto).
3. **Anti-spam** (FORM): campo isca `_gotcha` preenchido ou `_ts` (preenchido pelo snippet com o horário de carregamento) com menos de 2 s → responde sucesso **sem criar nada** (o robô não aprende). Textos com mais de 5 links também são descartados assim.
4. Normaliza com `crm-lib normalizeLeadPayload` (aceita `name/nome`, `email/e-mail`, `phone/telefone/celular/whatsapp`, `company/empresa`, `cnpj`, `message/mensagem`, `value/valor`, `source/origem`, `title/titulo`, `utm_*`, `page_url`, `referrer`, `custom.<key>` ou `cf_<key>` para campos personalizados de negócio; o que sobrar vai para `extra`). Sem e-mail **e** sem telefone → 400 `VALIDATION_ERROR` (`path: "email"`). Campos personalizados inválidos são ignorados e anotados em `extra._invalid` (captura nunca perde lead por campo opcional errado).
5. **Repetido**: mesmo e-mail ou telefone pela mesma chave nos últimos 10 min → não cria outro lead; acrescenta uma anotação "Novo envio do formulário" no existente e responde `duplicate`. Respeita também `Idempotency-Key`.
6. Origem: `source` do payload casado por nome (sem acento, sem caixa) com `CrmSource`; senão a origem padrão da chave.
7. **Distribuição**: `FIXED` → primeiro de `assigneeIds`; `ROUND_ROBIN` → `UPDATE "CrmCaptureKey" SET "rrCursor" = "rrCursor" + 1 WHERE id = $1 RETURNING "rrCursor"` e escolhe `assigneeIds[(cursor − 1) % n]`, pulando quem não é mais membro (concorrência segura, testado); `NONE` → sem responsável (aba "Não atribuídos" + notificação para owners/admins).
8. Cria o lead (`via`, `captureKeyId`, `createdById: null`), evento `lead.created` com ator nulo ("Recebido pelo formulário Site institucional"), atualiza `leadsCount`/`lastUsedAt`, notifica.
9. A resposta **nunca** traz dados do lead, da empresa ou de outros leads (só `id` e `status`).

### Tela de captura (configurações)
- Lista de chaves/formulários com prefixo, leads recebidos, último uso, distribuição, ações (editar, testar, gerar nova, revogar com confirmação).
- Criar chave de API → diálogo mostra a chave **uma vez** com "Copiar" e aviso "Guarde agora; ela não será mostrada de novo", mais exemplos prontos com a chave preenchida:

```bash
curl -X POST https://api.meusaas.com.br/v1/public/crm/leads \
  -H "Authorization: Bearer rsk_..." -H "Content-Type: application/json" \
  -d '{"name":"Ana Souza","email":"ana@acme.com.br","phone":"44999991234","company":"Acme","message":"Quero um orçamento","source":"Meta Ads","utm_campaign":"outubro"}'
```

  e o passo a passo para Zapier/Make/n8n ("Facebook Lead Ads → Webhooks/HTTP → POST, cabeçalho Authorization, mapeie nome, e-mail e telefone").
- Criar formulário → pede as origens do site e a página de obrigado; mostra o **snippet** (HTML puro, funciona sem JavaScript; o script opcional só preenche `_ts` e a URL da página):

```html
<form action="https://api.meusaas.com.br/v1/public/crm/forms/rsf_..." method="POST">
  <input name="name" placeholder="Seu nome" required>
  <input name="email" type="email" placeholder="E-mail">
  <input name="phone" placeholder="WhatsApp">
  <textarea name="message" placeholder="Mensagem"></textarea>
  <input name="_gotcha" tabindex="-1" autocomplete="off" style="position:absolute;left:-9999px" aria-hidden="true">
  <input type="hidden" name="_redirect" value="https://www.cliente.com.br/obrigado">
  <button type="submit">Enviar</button>
</form>
<script>document.querySelectorAll('form[action*="/crm/forms/"]').forEach(f=>{const t=document.createElement('input');t.type='hidden';t.name='_ts';t.value=Date.now();f.append(t);const u=document.createElement('input');u.type='hidden';u.name='page_url';u.value=location.href;f.append(u);});</script>
```

  mais a versão com `fetch` (JSON) para sites em React/Next, e um botão "Enviar lead de teste".

### Testes da captura
- Chave certa cria lead (201) **sem** cabeçalho Origin (servidor para servidor); errada e revogada → 401 iguais; plano sem feature → 403.
- Nenhum dado vaza na resposta; lead nasce com `via`, origem, UTM, extra e responsável certos.
- FORM: origem não autorizada → 403; preflight só para as origens; urlencoded com `_redirect` → 303; `_redirect` de outra origem ignorado; isca e `_ts` rápido → sucesso sem criar; rate limit por IP.
- Repetido em 10 min vira anotação; `Idempotency-Key` respeitada.
- Rodízio: 30 capturas concorrentes com 3 vendedores → 10 para cada; membro removido é pulado.
- Campo personalizado inválido não derruba a captura.

## Importação (CSV e Excel)

Para contatos, empresas e leads. Owner/admin. Usa o add-on `uploads` (`purpose: crm_import`, `.csv` e `.xlsx`, até 10 MB) e a fila (pg-boss).

### Modelo

```prisma
enum CrmImportEntity { CONTACT COMPANY LEAD }
enum CrmImportStatus { UPLOADED VALIDATING READY RUNNING DONE FAILED UNDONE }
enum CrmOnDuplicate  { SKIP FILL_EMPTY OVERWRITE }

model CrmImport {
  id             String          @id @default(uuid(7)) @db.Uuid
  organizationId String          @db.Uuid
  entity         CrmImportEntity
  fileId         String          @db.Uuid
  fileName       String
  status         CrmImportStatus @default(UPLOADED)
  headers        String[]
  rowCount       Int             @default(0)
  mapping        Json            @default("{}")  // { "<cabeçalho>": "<alvo>" } (alvo: campo, "cf.<key>" ou "ignore")
  options        Json            @default("{}")  // { onDuplicate, ownerId, tagIds, createCompanies }
  preview        Json?                           // { new, duplicates, invalid, invalidSample, duplicateSample, overLimit }
  progress       Int             @default(0)     // linhas processadas
  result         Json?                           // { created, updated, skipped, errors }
  errorsFileId   String?         @db.Uuid        // CSV com as linhas que falharam + coluna "erro"
  createdById    String          @db.Uuid
  createdAt      DateTime        @default(now())
  finishedAt     DateTime?
  undoneAt       DateTime?
}
```

Registros criados pela importação guardam `importId` (contato, empresa, lead).

### Fluxo e rotas

| Passo | Rota | Faz |
|---|---|---|
| 1. **Arquivo** | `POST /v1/crm/imports` `{ fileId, entity }` | lê o arquivo (abaixo), guarda cabeçalhos e quantidade de linhas; devolve `{ id, headers, sample (10 linhas), rowCount, suggestedMapping }` (`crm-lib suggestMapping`); mais de 10.000 linhas ou sem cabeçalho → `IMPORT_INVALID_FILE` |
| 2. **Colunas** | `PUT /v1/crm/imports/:id/mapping` `{ mapping, options }` | valida que os obrigatórios estão mapeados (contato: nome, ou nome + sobrenome; empresa: nome; lead: e-mail ou telefone) |
| 3. **Prévia** | `POST /v1/crm/imports/:id/validate` → job; `GET /v1/crm/imports/:id` (o front consulta a cada 2 s) | normaliza cada linha (`crm-lib normalizeImportRow`), detecta duplicados no banco e **dentro do arquivo**, conta novos/duplicados/inválidos, confere o limite `crmContacts` (`overLimit: { allowed, needed }`) |
| 4. **Importar** | `POST /v1/crm/imports/:id/run` | job em lotes de 500, cada lote numa transação; `progress` atualizado; no fim, `result` e o CSV de erros; notificação "Importação concluída" |
| desfazer | `POST /v1/crm/imports/:id/undo` (até 24 h) | exclui (soft delete) o que **essa importação criou**; o que ela atualizou não volta (a tela avisa antes) |
| histórico | `GET /v1/crm/imports` | lista com status e números |

**Leitura do arquivo** (no servidor):
- `.xlsx`: primeira planilha, com a biblioteca de planilhas mantida mais atual (confira no npm; evite pacotes abandonados ou com vulnerabilidade conhecida); datas do Excel convertidas.
- `.csv`: detecta codificação (UTF-8 com ou sem BOM; senão **Windows-1252**, que é o que o Excel brasileiro salva) e separador (`crm-lib detectDelimiter`: `;` é o padrão do Excel em pt-BR, `,` e tab também); aspas e quebras de linha dentro de campos com um parser CSV de verdade (biblioteca atual), nunca `split`.

**Alvos do mapeamento** (`crm-lib IMPORT_TARGETS`):
- contato: `name`, `firstName` + `lastName` (juntados), `email`, `phone`, `secondaryPhone`, `jobTitle`, `cpf`, `birthday`, `companyName`, `companyCnpj`, `ownerEmail`, `tags` (nomes separados por vírgula; criadas se não existirem), `cf.<key>`, `ignore`;
- empresa: `name`, `legalName`, `cnpj`, `segment`, `website`, `phone`, `email`, `addressZip`, `addressStreet`, `addressNumber`, `addressComplement`, `addressDistrict`, `addressCity`, `addressState`, `ownerEmail`, `tags`, `cf.<key>`, `ignore`;
- lead: `title`, `personName`, `email`, `phone`, `companyName`, `cnpj`, `value`, `message`, `source`, `ownerEmail`, `tags`, `cf.<key>` (campos de negócio), `ignore`.

**Duplicados**: contato por e-mail, depois CPF, depois telefone; empresa por CNPJ (nome igual só aparece como "possível duplicado" na prévia); lead por e-mail/telefone entre leads abertos. Ação escolhida no passo 2: **Pular** (padrão), **Preencher só o que está vazio**, **Sobrescrever**. Duplicado dentro do próprio arquivo segue a mesma ação em relação à primeira ocorrência.

**Contatos com empresa**: com `createCompanies` ligado, `companyCnpj` casa/cria a empresa pelo CNPJ e `companyName` casa pelo nome exato (sem acento e sem caixa) ou cria; a empresa vira a principal do contato.

### Tela (`/crm/importar`)
1. **Arquivo**: escolher o tipo (Contatos, Empresas, Leads), Dropzone (`.csv`, `.xlsx`), link "Baixar modelo" (CSV com `;` e os cabeçalhos em português), dicas ("Uma linha por contato; a primeira linha com os nomes das colunas").
2. **Colunas**: tabela "Coluna do arquivo → Campo do CRM" com as sugestões já marcadas, exemplo de valor de cada coluna, seletor com busca (inclui campos personalizados e "Não importar"); opções: o que fazer com duplicados, responsável padrão, etiquetas para todos, criar empresas.
3. **Prévia**: barra de progresso da validação; cartões **Novos** · **Duplicados** · **Com erro**; tabela das primeiras linhas com erro (linha, coluna, motivo: "E-mail inválido", "CNPJ inválido", "Responsável não encontrado"); amostra de duplicados com o registro existente; aviso de limite do plano com `UpgradeDialog`; botão **Importar N contatos**.
4. **Resultado**: progresso ao vivo, depois "520 criados · 31 atualizados · 12 pulados · 4 com erro", **Baixar linhas com erro**, **Ver contatos importados** (lista filtrada pela importação), **Desfazer importação**.

### Testes da importação
- CSV em UTF-8, UTF-8 com BOM e Windows-1252 com acentos; separadores `;`, `,` e tab; campo com `;` e quebra de linha entre aspas; `.xlsx` com data e número.
- Sugestão de mapeamento para cabeçalhos comuns ("Nome", "E-mail", "Celular", "WhatsApp", "Empresa", "CNPJ", "Cargo", "Cidade", "UF").
- Duplicados no banco e dentro do arquivo nas três ações; contagens da prévia iguais ao resultado.
- Limite `crmContacts` barra antes de importar; 10.001 linhas → erro claro.
- Desfazer remove só o criado; não desfaz depois de 24 h.
- Isolamento: arquivo de outra empresa recusado; responsável por e-mail só se for membro.

## Exportação

`GET /v1/crm/{contacts|companies|deals|leads|activities}/export.csv?<mesmos filtros da lista>` (owner/admin, rate limit 5/min, registra `crm.exported` no audit log com os filtros):
- `;` como separador, vírgula decimal, UTF-8 **com BOM** (abre direto no Excel em pt-BR), datas `dd/mm/aaaa`, valores em reais (`1234,56`), telefone formatado, uma coluna por campo personalizado (pelo rótulo), etiquetas por nome separadas por vírgula.
- Gerado em streaming (sem carregar tudo na memória); respeita a visibilidade.
- Proteção contra fórmula no Excel: valores que começam com `=`, `+`, `-`, `@` recebem um apóstrofo na frente (`crm-lib csvSafe`).

### Testes da exportação
Conteúdo, acentos e BOM; filtros aplicados; visibilidade; proteção de fórmula; MEMBER → 403.
