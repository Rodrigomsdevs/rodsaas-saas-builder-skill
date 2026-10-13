# Stack e versões

## Como descobrir a versão atual

```bash
npm view fastify version
npm view prisma version
npm view zod version
# ...um por pacote da lista abaixo
```

Para a configuração, consulte a documentação oficial **da versão que vai instalar**. Use Context7 se estiver disponível; senão, WebFetch na doc oficial. Nunca configure um pacote com base só no que você lembra.

## Pacotes

### Produção
| Pacote | Para quê | Atenção na doc atual |
|---|---|---|
| `fastify` | servidor HTTP | — |
| `fastify-type-provider-zod` | Zod como validador/serializador + transform para OpenAPI | confirmar compatibilidade com a versão do Zod e do `@fastify/swagger`; nomes dos helpers de erro |
| `zod` | schemas | se a versão tiver `z.toJSONSchema`, ok usar onde precisar |
| `@fastify/swagger` | gera o documento OpenAPI | — |
| `@scalar/fastify-api-reference` | UI da doc em `/docs` | — |
| `@fastify/helmet` | headers de segurança | — |
| `@fastify/cors` | CORS | — |
| `@fastify/cookie` | cookies | — |
| `@fastify/jwt` | assinar/verificar JWT, lendo do cookie | — |
| `@fastify/rate-limit` | rate limit | — |
| `@fastify/sensible` | helpers HTTP (opcional) | — |
| `@prisma/client` + adapter do Postgres | ORM | **o setup muda entre majors**: generator, onde fica a config, se exige driver adapter (`@prisma/adapter-pg`) e saída do client. Siga a doc atual à risca |
| `pg-boss` | fila de jobs no Postgres | — |
| `stripe` | SDK Stripe | fixar `apiVersion` na versão atual da API |
| `argon2` | hash de senha (argon2id) | — |
| `nodemailer` | SMTP | — |
| `pino` | logger (já vem com o Fastify; só configurar) | — |

### Desenvolvimento
| Pacote | Para quê |
|---|---|
| `typescript`, `@types/node` | TS |
| `tsx` | rodar em dev com watch |
| `prisma` | CLI |
| `vitest` | testes |
| `@biomejs/biome` | lint + format |
| `pino-pretty` | logs legíveis em dev |

Se surgir a necessidade de um pacote fora desta lista, prefira resolver com código simples. Se o pacote for mesmo necessário, escolha um mantido e popular e cite no relatório final.

## TypeScript

- `strict: true`, `noUncheckedIndexedAccess: true`
- ESM (`"type": "module"`), `module`/`moduleResolution` no padrão recomendado para Node atual
- Build com `tsc` para `dist/`

## Node

Use a LTS ativa. Registre em `.nvmrc` e em `engines` no `package.json`.
