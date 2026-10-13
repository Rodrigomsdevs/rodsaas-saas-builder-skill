# Marca, `rodsaas.json` e prévia

## Perguntas (uma rodada, tudo junto)

Use a ferramenta de perguntas se existir. Toda pergunta tem padrão: quem não souber responder aperta enter.

### Identidade
| # | Pergunta | Padrão |
|---|---|---|
| 1 | **Nome do produto** e uma frase do que ele faz | do `rodsaas.json`, se o backend já gravou |
| 2 | **Cor principal**: hex, nome de cor ("verde petróleo") ou "me sugere" | sugerir 4 opções coerentes com o ramo |
| 3 | **Logo**: caminho de SVG/PNG ou "não tenho" | monograma provisório (inicial + cor principal) |
| 4 | **Tema**: claro, escuro ou os dois com botão | os dois, seguindo o sistema |
| 5 | **Estilo**: corporativo sóbrio, moderno ou denso | moderno; **denso** se o produto for de gestão com muita tabela (ERP, TMS, financeiro) |

Se o usuário mandar o **logo**, extraia a cor principal dele: em SVG leia os `fill`; em imagem, olhe e escolha a cor dominante não neutra. Confirme a cor extraída na prévia em vez de perguntar a pergunta 2.

Nome de cor → hex: escolha um hex que represente bem e mostre na prévia.

### Contexto (aceita pular)
| # | Pergunta | Padrão |
|---|---|---|
| 6 | **Como chamar o tenant**: Empresa, Loja, Clínica, Escritório, Transportadora… e se é palavra feminina ou masculina | Empresa (feminino) |
| 7 | **Referências** visuais: links ou prints | nenhuma |
| 8 | **Suporte**: e-mail e/ou WhatsApp | nenhum (esconde o botão de ajuda) |

Com referências: abra os links ou veja os prints, e traduza para escolhas concretas (estilo, raio, densidade, fonte). Não copie marca, logo nem texto de terceiros.

## `rodsaas.json`

Arquivo na raiz do projeto, lido por todas as skills rodsaas. O backend cria com `product.name` e `domains`; esta fase completa o resto. Preserve campos que já existirem.

```json
{
  "product": {
    "name": "AgendaFácil",
    "tagline": "Agenda online para clínicas",
    "tenantLabel": "Clínica",
    "tenantLabelPlural": "Clínicas",
    "tenantGender": "f",
    "supportEmail": "suporte@agendafacil.com.br",
    "supportWhatsapp": "5544999999999"
  },
  "brand": {
    "primary": "#0f766e",
    "style": "modern",
    "theme": "system",
    "logo": "web/public/logo.svg"
  },
  "ports": {
    "api": 3333,
    "web": 3000
  },
  "domains": {
    "app": "http://localhost:3000",
    "api": "http://localhost:3333"
  },
  "locale": "pt-BR",
  "timezone": "America/Sao_Paulo",
  "currency": "BRL",
  "apps": [
    { "id": "cadastros", "name": "Cadastros", "home": "/projetos" }
  ]
}
```

`apps` espelha o registro `web/src/config/apps.ts` (`12-casca-e-apps.md`): a skill frontend grava o app Cadastros, e cada preset acrescenta o seu.

`tenantGender` existe para a concordância: "Nova clínica" / "Novo escritório", "Configurações da clínica" / "do escritório". Centralize isso em `src/config/product.ts` com helpers (`tenant.new`, `tenant.of`, etc.) e use em todos os textos.

## Gerar o tema

O script `scripts/brand.mjs` (sem dependências) lê `brand` do `rodsaas.json` e:
- gera a escala da cor em OKLCH (`--brand-50` … `--brand-950`);
- escreve as variáveis do shadcn para claro e escuro (`--primary`, `--ring`, `--sidebar-*`, `--chart-1..5`…);
- escolhe branco ou quase preto para o texto sobre a cor principal, pelo contraste WCAG;
- se a cor some no fundo escuro, clareia a cor principal no tema escuro;
- se a cor é clara demais para link/foco sobre fundo branco (amarelo, verde-limão), cria `--primary-text` com um tom mais escuro;
- adiciona `--success` e `--warning`, que o shadcn não tem;
- define `--radius` pelo estilo;
- imprime um relatório de contraste e, com `--preview`, gera uma prancha HTML.

```bash
node scripts/brand.mjs rodsaas.json --css web/src/styles/theme.css --preview web/brand-preview.html
```

`theme.css` é importado no CSS global **depois** do bloco padrão do shadcn, para sobrescrever as variáveis. Confira que os nomes das variáveis batem com os da versão do shadcn instalada; se a versão usar nomes diferentes, adapte o script (e registre no relatório).

Registre `--success`, `--warning` e `--primary-text` no `@theme` do Tailwind para existirem como classes (`text-success`, `bg-warning/15`, `text-primary-text`).

Use `--primary-text` (e não `--primary`) para links e ícones na cor da marca sobre o fundo.

## Estilo → decisões

| | Corporativo sóbrio | Moderno | Denso |
|---|---|---|---|
| `--radius` | 0.25rem | 0.75rem | 0.375rem |
| Fonte | IBM Plex Sans | Geist | Inter |
| Altura de input/botão | 36px | 40px | 32px |
| Linha de tabela | 44px | 48px | 36px |
| Texto base do app | 14px | 14px | 13px |
| Números | — | — | `tabular-nums` em tabelas e indicadores |

Fontes via `next/font/google`. Guarde altura de controle e linha de tabela em `src/config/ui.ts` e use nos componentes base (`Button`, `Input`, `DataTable`), em vez de espalhar classes.

## Logo e favicon

- Com logo: copie para `web/public/logo.svg` (ou `.png`), gere `favicon` e `apple-icon` a partir dele (o App Router aceita `app/icon.*`/`app/apple-icon.*`).
- Sem logo: componente `Logo` com monograma (inicial do produto em `--primary` com `--primary-foreground`), e o mesmo para o ícone. Deixe claro no relatório que é provisório.
- O logo aparece no seletor de empresa do trilho/menu (versão só com o ícone), nas telas de auth e nos e-mails do backend (passe a URL pública no relatório).

## Prévia

Gere `web/brand-preview.html` e peça para o usuário abrir no navegador (se houver comando para abrir arquivos no sistema, ofereça abrir). Ela mostra a escala, botões (incluindo o estado carregando), badges de status, um card com barra de uso, uma tabela com linha selecionada, inputs com foco, links, o trilho de apps e o menu do app, **no claro e no escuro lado a lado**.

Mostre também o relatório de contraste em linguagem simples ("o texto nos botões fica bem legível"; "no escuro clareei um pouco a cor para não sumir").

Pergunte: aprovar, trocar a cor, trocar o estilo. Repita até aprovar; cada rodada é só rodar o script de novo. O arquivo de prévia vai para o `.gitignore`.
