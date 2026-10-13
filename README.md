# rodsaas · skills para Claude Code

Marketplace com o plugin **rodsaas**: skills para iniciar SaaS B2B multi-tenant sempre no mesmo padrão.

> **Status: rascunho (v0.1).** Backend e banco prontos para teste; frontend em breve.

## Instalação

No Claude Code:

```
/plugin marketplace add Rodrigomsdevs/rodsaas-saas-builder-skill
/plugin install rodsaas@rodsaas
```

Ou no terminal:

```bash
claude plugin marketplace add Rodrigomsdevs/rodsaas-saas-builder-skill
claude plugin install rodsaas@rodsaas
```

Para atualizar depois de um push novo: `claude plugin marketplace update rodsaas`.

## Skills

| Comando | Status | Faz |
|---|---|---|
| `/rodsaas:backend` | rascunho | cria a pasta `api/`: Fastify + Prisma + Postgres + Zod, auth JWT + refresh, organizações, membros, convites, planos e Stripe, REST padronizado (RFC 9457, cursor, OpenAPI), segurança por padrão |
| `/rodsaas:db` | rascunho (script testado) | provisiona o Postgres no Linux: banco + banco de teste, usuário dono das migrations e usuário da aplicação sem privilégios, grants para RLS, schema do pg-boss, URLs no `.env`. Pergunta nomes e senhas (ou gera senhas fortes) |
| `/rodsaas:frontend` | planejada | cria a pasta `web/`: Next.js + Tailwind (sempre a versão atual), client tipado gerado do OpenAPI |
| `/rodsaas:init` | planejada | orquestra db + backend + frontend num projeto novo |
| `/rodsaas:module` | planejada | adiciona um módulo de negócio no padrão (molde `projects`) |
| `/rodsaas:billing` | planejada | ajusta planos, limites e features |
| `/rodsaas:audit` | planejada | revisa segurança e isolamento de um projeto existente |

## Estrutura

```
rodsaas-saas-builder-skill/
├── .claude-plugin/
│   └── marketplace.json         # catálogo (pode listar mais plugins no futuro)
└── plugins/
    └── rodsaas/
        ├── .claude-plugin/plugin.json
        └── skills/
            ├── backend/
            │   ├── SKILL.md
            │   └── references/  # API, auth, multi-tenant, billing, segurança, módulos, testes
            └── db/
                ├── SKILL.md
                └── scripts/
                    ├── provision.sh
                    ├── config.example
                    └── sql/     # roles.sql, database.sql
```

Novas skills entram em `plugins/rodsaas/skills/<nome>/` e viram `/rodsaas:<nome>` automaticamente.

## Desenvolvimento

```bash
claude plugin validate .                         # valida marketplace e plugin
claude --plugin-dir ./plugins/rodsaas            # testa as skills sem instalar
```
