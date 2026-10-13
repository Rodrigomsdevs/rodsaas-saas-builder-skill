# Uploads · frontend

## `useUpload` (`features/uploads/use-upload.ts`)

Fluxo por arquivo: `criar → enviar (com progresso) → completar`. Use `XMLHttpRequest` no PUT (o `fetch` não dá progresso de envio).

```ts
type UploadItem = {
  localId: string
  file: File
  status: 'queued' | 'uploading' | 'completing' | 'done' | 'error' | 'canceled'
  progress: number            // 0–100
  fileId?: string
  error?: { code: string; message: string }
}
// useUpload({ purpose, accept, maxFiles, onUploaded(fileId, item) })
// → { items, addFiles(files), cancel(localId), retry(localId), remove(localId), isUploading }
```

- **Validação antes de enviar** (economiza tempo do usuário): tipo pela extensão/mime e tamanho contra `maxFileBytes` e espaço livre de `/v1/files/usage`. Recusa com a mensagem certa sem nem chamar a API.
- **Até 3 envios ao mesmo tempo**; o resto fica na fila.
- **Cancelar**: aborta o XHR e chama `DELETE /v1/uploads/:id`.
- **Tentar de novo**: recomeça do `POST /v1/uploads` (URL assinada pode ter vencido).
- **Sair da página com envio em andamento** → aviso do navegador.
- Ao terminar, invalida `files/usage` e `me`.

Mensagens por código:

| code | Mensagem |
|---|---|
| `FILE_TOO_LARGE` | "O arquivo tem 24 MB; o limite do seu plano é 10 MB por arquivo." |
| `FILE_TYPE_NOT_ALLOWED` | "Este tipo de arquivo não é aceito." (lista os aceitos num tooltip) |
| `STORAGE_QUOTA_EXCEEDED` | abre o `UpgradeDialog`: "O armazenamento da {empresa} está cheio (100 MB)." |
| `UPLOAD_EXPIRED` | "O envio demorou demais. Tente de novo." |
| rede | "Falha de conexão durante o envio." + Tentar de novo |

## `Dropzone` (`components/app/dropzone.tsx`)

- Área com borda tracejada: "Arraste arquivos aqui ou **clique para escolher**"; dica com limite ("até 10 MB").
- Estados visuais: normal, **arrastando por cima** (borda e fundo na cor da marca, "Solte para enviar"), desabilitado (sem permissão ou cota cheia, com o motivo).
- **Colar** (Ctrl+V) arquivos/imagens quando o componente (ou a área dona, como a tarefa aberta) está em foco.
- Variante compacta (botão "Anexar") para barras de ferramentas.
- Acessível: o `input type=file` real fica disponível por teclado; anúncio do resultado para leitor de tela.

## `FileList` / `FileItem`

Cada item mostra: ícone pelo tipo (ou miniatura para imagem), nome (truncado com tooltip), tamanho formatado (`1,2 MB`), quem enviou e quando (relativo), e ações (baixar, abrir, excluir).

| Estado do item | Visual |
|---|---|
| na fila | "Aguardando…" + cancelar |
| enviando | barra de progresso com % + cancelar |
| finalizando | barra cheia + "Processando…" |
| concluído | ações normais |
| erro | ícone de alerta, mensagem, **Tentar de novo** e remover |

- Visão em **lista** e em **grade** (miniaturas) quando houver imagens.
- Excluir pede confirmação.
- Lista vazia: o próprio `Dropzone` é o estado vazio.
- Carregando a lista: skeleton de 2–3 linhas.

## `FilePreview`

- **Imagem**: lightbox com navegação entre as imagens da lista (setas e teclado), zoom ao clicar, botão baixar. A URL assinada é pedida na hora de abrir (vale 5 min); se expirar com o lightbox aberto, pede outra.
- **PDF**: abre em aba nova pela URL assinada.
- **Outros**: download direto.
- Miniaturas na lista: a mesma URL assinada da imagem com tamanho limitado por CSS (sem gerar thumbnail no servidor na v1); carregamento preguiçoso (`loading="lazy"`).

## Uso do armazenamento

Em **Configurações → Plano e cobrança**, barra "Armazenamento: 63 MB de 100 MB" junto com os outros limites (vem do `/v1/me`). A partir de 80%, aviso discreto com link de upgrade.

## Editor do Notion

Se o preset `notion` existir: habilite o upload de imagem do editor com `purpose: editor_image`. O editor guarda o `fileId`; ao renderizar, troca por URL assinada (cache curto em memória). Na página pública, a API inclui URLs assinadas das imagens da página na resposta.
