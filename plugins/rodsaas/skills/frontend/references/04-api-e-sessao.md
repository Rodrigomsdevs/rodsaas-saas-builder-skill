# API e sessão

## Como o front fala com a API

- API e front em domínios irmãos (`app.seusaas.com` / `api.seusaas.com`); em dev, `localhost:3000` / `localhost:3333`.
- Os tokens ficam em **cookies httpOnly** que só a API lê e grava. O front **nunca** vê nem guarda token; só manda `credentials: 'include'` em toda request.
- Todo tipo de request/resposta vem do `openapi.json` (`npm run api:types`).

## Tipos

```bash
npm run api:types   # gera src/lib/api/schema.d.ts
```

Use os tipos derivados do schema em vez de declarar à mão:

```ts
import type { components } from './schema'
export type Project = components['schemas']['Project'] // confira o nome que o backend gerou
```

Se os schemas da API saírem sem nome no OpenAPI, ajuste o backend para registrar os schemas Zod com nome (ex.: `id` / `ref` no type provider) em vez de duplicar tipos no front.

## Client (`lib/api/client.ts`)

```ts
import createClient from 'openapi-fetch'
import type { paths } from './schema'
import { ApiError, toApiError } from './errors'

const API_URL = process.env.NEXT_PUBLIC_API_URL!

// ------------------------------------------------------------- refresh único
// Várias requests podem expirar ao mesmo tempo. Todas esperam o MESMO refresh:
// sem isso, o backend vê o refresh token usado duas vezes e derruba a sessão
// (detecção de roubo).
let refreshing: Promise<boolean> | null = null

function refreshSession(): Promise<boolean> {
  refreshing ??= fetch(`${API_URL}/v1/auth/refresh`, { method: 'POST', credentials: 'include' })
    .then((r) => r.ok)
    .catch(() => false)
    .finally(() => { refreshing = null })
  return refreshing
}

const hasSessionHint = () => typeof document !== 'undefined' && /(?:^|;\s*)session_hint=/.test(document.cookie)

// Renova quando o token venceu (TOKEN_EXPIRED) OU quando o access token sumiu
// (UNAUTHORIZED) mas ainda existe sessão (cookie session_hint). O segundo caso
// acontece se o cookie do access token expirar antes do refresh, ou for apagado.
async function shouldRefresh(res: Response) {
  if (res.status !== 401) return false
  try {
    const code = (await res.clone().json())?.code
    return code === 'TOKEN_EXPIRED' || (code === 'UNAUTHORIZED' && hasSessionHint())
  } catch {
    return false
  }
}

const NO_REFRESH = ['/v1/auth/login', '/v1/auth/register', '/v1/auth/refresh', '/v1/auth/logout']

async function fetchWithRefresh(request: Request): Promise<Response> {
  const retry = request.clone() // o body só pode ser lido uma vez
  const res = await fetch(request)
  const path = new URL(request.url).pathname
  if (NO_REFRESH.includes(path) || !(await shouldRefresh(res))) return res

  if (await refreshSession()) return fetch(retry)

  onSessionExpired()
  return res
}

function onSessionExpired() {
  if (typeof window === 'undefined') return
  const here = window.location.pathname + window.location.search
  if (!here.startsWith('/entrar')) {
    window.location.assign(`/entrar?next=${encodeURIComponent(here)}`)
  }
}

export const api = createClient<paths>({
  baseUrl: API_URL,
  credentials: 'include',
  fetch: fetchWithRefresh, // confira na doc da versão a assinatura do fetch customizado
})

// ------------------------------------------------------------- unwrap
/** Converte a resposta do openapi-fetch em dado ou ApiError (para usar nos hooks). */
export async function unwrap<T>(p: Promise<{ data?: T; error?: unknown; response: Response }>): Promise<T> {
  let result
  try {
    result = await p
  } catch (e) {
    throw ApiError.network(e) // sem conexão, CORS, servidor fora
  }
  if (result.error !== undefined || !result.response.ok) throw toApiError(result.response, result.error)
  return result.data as T
}
```

### Idempotência

Mutations marcadas como idempotentes no backend (criar recurso, convite, checkout) mandam `Idempotency-Key`. A chave é **por tentativa de envio do formulário**: gere uma ao abrir o formulário, reaproveite se o usuário clicar de novo após um erro de rede, e troque depois de um sucesso.

```ts
export function useIdempotencyKey() {
  const ref = useRef(crypto.randomUUID())
  return { key: ref.current, reset: () => { ref.current = crypto.randomUUID() } }
}
```

## Erros (`lib/api/errors.ts` + `error-messages.ts`)

```ts
export class ApiError extends Error {
  constructor(
    public status: number,          // 0 = rede
    public code: string,            // do RFC 9457 da API; 'NETWORK_ERROR' para falha de rede
    message: string,
    public fieldErrors: { path: string; message: string }[] = [],
    public requestId?: string,
  ) { super(message) }

  static network(cause: unknown) {
    return new ApiError(0, 'NETWORK_ERROR', 'Não foi possível falar com o servidor. Verifique sua conexão.')
  }
}

export function toApiError(res: Response, body: any): ApiError {
  const code = body?.code ?? 'INTERNAL_ERROR'
  return new ApiError(res.status, code, messageFor(code, body?.detail ?? body?.title), body?.errors ?? [], body?.requestId)
}
```

`messageFor(code, fallback)` em `error-messages.ts` traduz cada `code` do catálogo do backend para uma frase amigável, com variações que usam o `tenantLabel`:

| code | Mensagem |
|---|---|
| `INVALID_CREDENTIALS` | E-mail ou senha incorretos. |
| `EMAIL_NOT_VERIFIED` | Confirme seu e-mail para continuar. |
| `PLAN_LIMIT_REACHED` | Seu plano chegou ao limite. *(o detail da API diz qual)* |
| `FEATURE_NOT_IN_PLAN` | Este recurso não está disponível no seu plano. |
| `FORBIDDEN` | Você não tem permissão para fazer isso. |
| `NOT_FOUND` | Não encontramos o que você procurou. |
| `CONFLICT` | *(usa o detail da API: "Este e-mail já é membro")* |
| `RATE_LIMITED` | Muitas tentativas. Aguarde um pouco e tente de novo. |
| `NO_ACTIVE_ORGANIZATION` | Escolha ou crie {uma empresa} para continuar. |
| `INTERNAL_ERROR` | Algo deu errado do nosso lado. Código: {requestId} |
| `NETWORK_ERROR` | Não foi possível falar com o servidor. Verifique sua conexão. |

Código desconhecido → usa o `detail`/`title` da API. Nunca mostre stack, JSON cru ou "Error: ...".

## QueryClient (`lib/query-client.ts`)

```ts
new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      retry: (count, err) => !(err instanceof ApiError && err.status >= 400 && err.status < 500) && count < 2,
    },
    mutations: { retry: false },
  },
  mutationCache: new MutationCache({
    // Toast de erro padrão. Formulários tratam o próprio erro e marcam meta.handlesError.
    onError: (err, _v, _c, mutation) => {
      if (mutation.meta?.handlesError) return
      if (err instanceof ApiError && err.code === 'PLAN_LIMIT_REACHED') return openUpgradeDialog(err)
      toast.error(err instanceof ApiError ? err.message : 'Algo deu errado.')
    },
  }),
})
```

### Hooks por feature (`features/<x>/api.ts`)

```ts
export const projectKeys = {
  all: ['projects'] as const,
  list: (params: ListParams) => [...projectKeys.all, 'list', params] as const,
  detail: (id: string) => [...projectKeys.all, 'detail', id] as const,
}

export function useProjects(params: ListParams) {
  return useQuery({
    queryKey: projectKeys.list(params),
    queryFn: () => unwrap(api.GET('/v1/projects', { params: { query: params } })),
    placeholderData: keepPreviousData, // troca de página/filtro sem piscar
  })
}

export function useCreateProject() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ body, idempotencyKey }: { body: CreateProject; idempotencyKey: string }) =>
      unwrap(api.POST('/v1/projects', { body, headers: { 'Idempotency-Key': idempotencyKey } })),
    onSuccess: () => qc.invalidateQueries({ queryKey: projectKeys.all }),
    meta: { handlesError: true },
  })
}
```

## Sessão

### `useSession()` (`features/session`)

`useQuery(['me'], GET /v1/me)` com `staleTime` de alguns minutos. Entrega: usuário, e-mail verificado, empresa ativa, papel, lista de empresas e o **plano efetivo** (id, features, limites, status, `paymentIssue`). O menu, os banners, o `Can` e o `PlanGate` leem daqui.

> O backend precisa incluir o plano efetivo e `emailVerified` em `GET /v1/me` — membros comuns não acessam `/v1/billing/subscription`, mas a interface de todos precisa saber o que o plano libera.

### Guard de rota (`middleware.ts` ou `proxy.ts`, conforme a versão do Next)

O guard roda no servidor do Next e **não consegue validar o token** (o cookie de acesso é da API e expira em 15 min). Ele só decide o redirecionamento rápido pela presença do cookie **`session_hint`**, um cookie não sensível (sem token, valor `1`, não httpOnly) que a API grava junto com o login/refresh e apaga no logout:

- sem `session_hint` em rota do app → `/entrar?next=<rota>`
- com `session_hint` em `/entrar` ou `/cadastro` → `/inicio`

A validação real é a API: se o cookie mentir, a primeira request devolve 401 e o client manda para `/entrar`.

> O backend precisa gravar/apagar o `session_hint` nos mesmos pontos dos cookies de auth.

### Layout `(app)`

- Enquanto `useSession` carrega: skeleton da casca (não tela branca).
- Sem empresa ativa (`me.organization === null`, inclusive quando a pessoa acabou de ser removida) → `/sem-empresa`.
- E-mail não verificado ou `paymentIssue` → banners (ver estados).

### Trocar de empresa

`POST /v1/auth/switch-organization` → `queryClient.clear()` → `router.replace('/inicio')`. Limpar o cache inteiro é obrigatório: dado da empresa anterior não pode aparecer nem por um frame.

### Sair

`POST /v1/auth/logout` → `queryClient.clear()` → `/entrar`. Mesmo se a request falhar, limpe e redirecione.

### Voltar do Stripe

Checkout volta para `/configuracoes/plano?status=success` (ou `canceled`). Comportamento completo, inclusive modo de teste e webhook atrasado, em `11-plano-e-cobranca.md`.
