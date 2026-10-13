# Uploads · backend

## Variáveis de ambiente

```bash
STORAGE_DRIVER=local                 # local (dev) | s3 (produção)
STORAGE_LOCAL_DIR=storage            # driver local: pasta (fora do git) relativa ao api/
UPLOAD_SIGNING_SECRET=               # driver local: assina as URLs de envio/download (mín. 32 caracteres)

S3_ENDPOINT=                         # R2: https://<conta>.r2.cloudflarestorage.com · MinIO: http://127.0.0.1:9000 · AWS: vazio
S3_REGION=auto                       # R2: auto · AWS: ex. sa-east-1
S3_BUCKET=
S3_ACCESS_KEY_ID=
S3_SECRET_ACCESS_KEY=
S3_FORCE_PATH_STYLE=false            # MinIO: true
```

Valide no `env.ts`: com `s3`, todas as `S3_*` necessárias; com `local`, o segredo. `storage/` vai para o `.gitignore`.

## Interface de armazenamento (`lib/storage/`)

```ts
export interface Storage {
  presignPut(key: string, opts: { contentType: string; contentLength: number; expiresIn: number }): Promise<{ url: string; headers: Record<string, string> }>
  presignGet(key: string, opts: { fileName: string; contentType: string; inline: boolean; expiresIn: number }): Promise<string>
  head(key: string): Promise<{ size: number } | null>
  readFirstBytes(key: string, n: number): Promise<Buffer>   // para conferir a assinatura do conteúdo
  delete(key: string): Promise<void>
}
```

- **`s3`**: `@aws-sdk/client-s3` + `@aws-sdk/s3-request-presigner`. `presignPut` assina `Content-Type` e `Content-Length`; `presignGet` define `ResponseContentDisposition` e `ResponseContentType`. `readFirstBytes` usa `GetObject` com `Range: bytes=0-<n-1>`.
- **`local`** (só dev, ou servidor único): grava em `STORAGE_LOCAL_DIR/<key>`. As "URLs assinadas" apontam para rotas da própria API com token HMAC (`UPLOAD_SIGNING_SECRET`) contendo `key`, operação e expiração:
  - `PUT /v1/storage/local/:token` — recebe o corpo cru (stream para o disco, limite = tamanho autorizado), rota com `public: true` e sem CSRF (o token é a autorização);
  - `GET /v1/storage/local/:token` — serve o arquivo com `Content-Disposition`, `Content-Type` do banco e `X-Content-Type-Options: nosniff`.
  - Em produção com driver local atrás do nginx, o `client_max_body_size` do site da API precisa ser ≥ maior limite de arquivo (o `/rodsaas:domain` gera 2 MB): avise e ajuste.

## Model

```prisma
enum FileStatus { PENDING READY DELETED }

model File {
  id             String     @id @default(uuid(7)) @db.Uuid
  organizationId String     @db.Uuid
  uploadedById   String     @db.Uuid
  key            String     @unique
  fileName       String                      // sanitizado, até 200 caracteres
  mimeType       String
  size           Int                         // bytes
  purpose        String                      // task_attachment, editor_image, avatar, ...
  status         FileStatus @default(PENDING)
  createdAt      DateTime   @default(now())
  completedAt    DateTime?
  deletedAt      DateTime?
  @@index([organizationId, status])
  @@index([status, createdAt])
}
```

RLS com `FORCE` (mesma policy da base). Os jobs de limpeza rodam por organização (`withTenant`) ou com uma conexão do dono do banco documentada para manutenção; escolha a primeira se possível.

## Tipos aceitos

Allowlist por **mime declarado + assinatura real** (lib `file-type` nos primeiros 4 KB). Formatos sem assinatura (texto, CSV) só passam se o conteúdo for texto UTF-8 válido nos primeiros bytes.

| Grupo | Tipos | Exibição |
|---|---|---|
| Imagem | png, jpeg, webp, gif | inline (pré-visualização) |
| PDF | pdf | inline numa aba nova |
| Documentos | docx, xlsx, pptx, odt, ods, odp, doc, xls | download |
| Texto | txt, csv, md | download |
| Compactados | zip | download |
| SVG | svg | **somente download** (nunca inline) |
| Bloqueados | exe, msi, sh, bat, cmd, js, html, htm, php, jar, apk… | recusados |

Os presets podem restringir mais por `purpose` (ex.: `editor_image` e `avatar` só imagem).

## Rotas

As rotas com ★ fazem parte do **contrato testável** (`skills/verify/contract.json`, grupo `presets.uploads`; testes em `suite/tests/16-uploads.spec.ts`, que rodam quando `rodsaas.json → addons` tem `uploads`).

| Rota | Config | Faz |
|---|---|---|
| ★ `POST /v1/uploads` | autenticado, idempotente | `{ fileName, size, mimeType, purpose }` → valida allowlist, `size ≤ maxFileMb`, cota (`usado + PENDING recentes + size ≤ storageMb`) → cria `File` PENDING com chave nova → `{ fileId, uploadUrl, headers, expiresAt }` |
| ★ `POST /v1/uploads/:id/complete` | autenticado | só quem iniciou; `head` (existe e tamanho = declarado), assinatura do conteúdo confere com o tipo; ok → READY + `completedAt`; diferente → apaga o objeto, DELETED, 400 com o motivo |
| ★ `DELETE /v1/uploads/:id` | autenticado | cancela um PENDING (apaga o objeto se chegou a subir) |
| ★ `GET /v1/files/:id/url` | autenticado | READY e da empresa → URL assinada de 5 min; `?download=1` força download; inline só para imagem e PDF |
| ★ `GET /v1/files/usage` | autenticado | `{ usedBytes, limitBytes, maxFileBytes }` (também entra no uso do plano em `/v1/me`) |

Quem **liga** o arquivo a um registro é a feature dona (ex.: `POST /v1/tasks/:id/attachments { fileId }`), conferindo: mesma empresa, READY, `purpose` compatível, quem enviou é quem está ligando (ou admin). Ao desligar (excluir o anexo), a feature marca o `File` como DELETED se ele não estiver ligado a mais nada.

Erros novos: `FILE_TOO_LARGE` (413), `FILE_TYPE_NOT_ALLOWED` (415), `STORAGE_QUOTA_EXCEEDED` (403, abre upgrade no front), `UPLOAD_NOT_COMPLETED` (409), `UPLOAD_EXPIRED` (410).

## Nome do arquivo

Sanitize: remova caminhos (`../`, `/`, `\`), caracteres de controle e `<>:"|?*`; normalize Unicode (NFC); corte em 200 caracteres preservando a extensão; vazio → `arquivo`. Na URL de download, use `filename*=UTF-8''<nome codificado>` para acentos.

## Planos

Em `config/plans.ts`, em todos os planos: limites `storageMb` e `maxFileMb`. Contador de uso: soma de `size` dos `READY`. Rebaixar de plano não apaga nada; só impede novos uploads acima da cota (mensagem clara).

## Jobs (pg-boss)

- `uploads.cleanup-pending` (a cada hora): PENDING com mais de 24 h → apaga objeto (se existir) e marca DELETED.
- `uploads.purge-deleted` (diário): DELETED há mais de 7 dias → apaga do armazenamento e remove a linha.
- Exclusão de organização: enfileira a remoção de todos os objetos de `org/<orgId>/`.

## CORS do bucket (produção, S3/R2)

Permitir `PUT` e `GET` vindos de `APP_URL`, com cabeçalhos `Content-Type` e `Content-Length`, e expor `ETag`. Documente o JSON de CORS no README do projeto e lembre no relatório.

## Testes

- tipo fora da lista, arquivo grande demais e cota estourada → erros certos;
- `complete` com tamanho diferente ou conteúdo que não bate com o tipo (ex.: `.png` que é HTML) → recusado e objeto apagado;
- usuário de outra empresa: `url`, `complete` e `DELETE` → 404;
- URL local com token vencido ou adulterado → 403;
- SVG nunca sai inline; nome com `../` é sanitizado;
- jobs: pendente velho some; deletado é purgado.
