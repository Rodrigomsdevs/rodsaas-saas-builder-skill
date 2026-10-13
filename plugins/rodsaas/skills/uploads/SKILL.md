---
name: uploads
description: Add-on de arquivos para projetos rodsaas — upload direto para armazenamento local (dev) ou compatível com S3 (AWS S3, Cloudflare R2, MinIO, Backblaze) com URL assinada, validação de tipo pelo conteúdo, limite de tamanho e cota de armazenamento por plano, isolamento por empresa, download por link temporário, limpeza de órfãos, e componentes de front prontos (arrastar e soltar, colar, barra de progresso, cancelar, tentar de novo, pré-visualização). Use quando o usuário pedir anexos, upload, envio de arquivos/imagens, avatar, armazenamento, S3/R2/MinIO num projeto rodsaas, ou chamar /rodsaas:uploads. Outras skills (tarefas, notion) dependem dele.
---

# rodsaas · uploads

Dá ao projeto a capacidade de **receber, guardar e entregar arquivos** com segurança. É um add-on de infraestrutura: não cria telas de produto sozinho, mas entrega o model `File`, as rotas e os componentes que os presets usam (anexos em tarefas, imagens no editor do Notion, avatar, etc.).

## Como funciona

```
navegador ──1. POST /v1/uploads {nome, tamanho, tipo, finalidade}──▶ API
                                   valida tipo, tamanho e cota; cria File (PENDING)
          ◀──── URL assinada de envio (vale 10 min) ───────────────
          ──2. PUT do arquivo direto para o armazenamento (com progresso)──▶ S3/R2/MinIO (ou API, no driver local)
          ──3. POST /v1/uploads/:id/complete──▶ API confere tamanho real e assinatura do conteúdo; File (READY)
          ──4. quem usa (tarefa, editor…) liga o fileId ao registro dela
download: GET /v1/files/:id/url ──▶ URL temporária (5 min); bucket NUNCA é público
```

O arquivo não passa pela API no driver S3 (não pesa no servidor); a API só autoriza e confere.

## Antes de começar

- Projeto rodsaas com `api/`, `web/` e `rodsaas.json`, tudo verde.
- Mesma regra de versões: `npm view` + doc atual (`@aws-sdk/client-s3`, `@aws-sdk/s3-request-presigner`, `file-type`).

## Como trabalhar (obrigatório)

1. **Leia a referência da fase inteira antes de começar a fase**, do início ao fim, não por amostragem nem resumo. Cada fase aponta o arquivo (→ `references/...`).
2. **Tudo o que está nas referências é escopo da v1**, exceto o que está marcado como fora da v1. Nada de "versão simplificada", "básico por enquanto" ou "dá para melhorar depois": upload sem conferir o tipo real do arquivo, sem cota do plano ou sem os componentes de pré-visualização **não é** o add-on desta skill.
3. **O contrato testável (testids e rotas ★) é o mínimo que o `/rodsaas:verify` consegue conferir, não o escopo.** Passar no verify não significa que a fase acabou.
4. **Conferência ao fim de cada fase**: antes do commit, monte uma tabela com **cada item** da referência da fase (cada linha de tabela e cada marcador) e o status ✅ feito / ❌ faltando, com o arquivo onde está. Só avance com tudo ✅; o que não der para fazer vira pendência explícita no relatório final, com o motivo. Use o "Pronto quando" de cada fase abaixo como mínimo.
5. Se o usuário pedir para pular ou cortar algo, registre como desvio no relatório final.

## Projeto que já tem o uploads (revisão)

Se `rodsaas.json → addons` já tem `uploads` (ou existe `api/src/modules/files`), rode em **modo revisão** em vez de instalar de novo:

1. Leia todas as referências inteiras.
2. Compare item a item com o código (API, telas, testes) e monte a tabela de lacunas: item da referência · ✅/❌ · onde está ou o que falta. Comece pelo "Pronto quando" das fases 1 e 2 (é onde mais se simplifica: validação só pela extensão, sem cota, sem limpeza de órfãos, sem pré-visualização ou progresso).
3. Mostre a tabela ao usuário e complete o que falta **fase por fase**, sem reescrever o que já está certo e sem perder dados (migrations só aditivas).
4. Feche com `references/03-checklist.md` e o `/rodsaas:verify`.

## Perguntas (com padrões)

- **Onde guardar em produção?** Padrão: **compatível com S3** (Cloudflare R2 costuma ser o mais barato por não cobrar saída; MinIO se quiser no próprio servidor). Em dev, sempre o driver **local**.
- **Limites por plano:** padrão Free 100 MB de armazenamento e 10 MB por arquivo; Pro 10 GB e 100 MB; Business 100 GB e 250 MB.
- **Tipos aceitos:** padrão imagens (png, jpg, webp, gif), PDF, documentos Office/OpenDocument, texto/CSV, zip. Executáveis e HTML nunca.

## Fases

1. **Backend** — env, driver (`local` + `s3`), model `File` com RLS, rotas, validação, cota, jobs de limpeza, testes. → `references/01-backend.md`
   - *Pronto quando*: drivers `local` e `s3`, tipo real conferido (magic bytes) e não só a extensão, cota do plano, URL assinada, limpeza de órfãos e testes.
2. **Frontend** — `useUpload`, `Dropzone`, `FileList`, `FilePreview`, mensagens e estados, ligação com o `UpgradeDialog`. → `references/02-frontend.md`
   - *Pronto quando*: `useUpload` com progresso e cancelar, `Dropzone`, `FileList`, `FilePreview`, mensagens de erro por motivo e ligação com o `UpgradeDialog`.
3. **Integrações** — se o preset `notion` existir, ligar o upload de imagens no editor (que estava desligado). Registrar `uploads` em `rodsaas.json` (`addons`).
4. **Fechamento** — `references/03-checklist.md` e o `/rodsaas:verify` (tem uma parte só do uploads: `-g "Uploads"`; ela usa as rotas ★ de `01-backend.md`).

Cada fase termina com typecheck, lint, testes e commit (`feat(uploads): ...`).

## Princípios

- **Bucket privado, sempre.** Todo acesso passa por URL assinada de vida curta, gerada depois de checar a empresa.
- **Não confiar no navegador.** Tipo e tamanho declarados são conferidos no `complete` lendo o arquivo de verdade (tamanho no armazenamento e assinatura dos primeiros bytes).
- **Nome do usuário nunca vira caminho.** A chave no armazenamento é `org/<orgId>/<ano>/<mês>/<uuid>`; o nome original fica só no banco, sanitizado.
- **Nunca servir conteúdo ativo inline.** SVG, HTML e afins só como download (`Content-Disposition: attachment`), para não virar XSS.
- **Sem órfãos.** Upload que não completou some em 24 h; arquivo desligado de tudo vai para exclusão.

## Relatório final

Driver configurado, limites dos planos, o que foi integrado (editor do Notion, etc.), variáveis a preencher em produção (credenciais e bucket), e a configuração de CORS do bucket para o domínio do app.

## Mapa das referências

| Arquivo | Quando ler |
|---|---|
| `references/01-backend.md` | Fase 1 |
| `references/02-frontend.md` | Fase 2 |
| `references/03-checklist.md` | Fase 4 |
