---
name: verify
description: Verifica de verdade se um projeto rodsaas funciona — audita o contrato (data-testid, rotas, formatos da API) e roda uma bateria de testes ponta a ponta no navegador (Playwright) contra a API e o painel rodando, cobrindo cadastro, login, sessão e refresh, criar e trocar de empresa, isolamento entre empresas, convites, papéis, remoção de membro, módulo de exemplo, estados de tela, plano e celular; depois corrige o projeto até ficar verde. Funciona com projetos feitos por qualquer IA (Claude, Gemini, ChatGPT). Use quando o usuário pedir para testar, validar, verificar, conferir se está funcionando, achar bugs no projeto rodsaas, ou chamar /rodsaas:verify; também é a etapa final obrigatória do /rodsaas:backend e do /rodsaas:frontend.
---

# rodsaas · verify

Prova que o básico do SaaS funciona, clicando no painel como um usuário de verdade. Não confia no que o código "parece" fazer: cria contas, troca de empresa, convida gente, lê os e-mails no Mailpit, derruba a API de propósito para ver o estado de erro, e confere cada resultado na tela **e** na API.

A mesma bateria roda em qualquer projeto rodsaas, porque todos seguem o **contrato testável** (`contract.json`, explicado em `references/contrato.md`): `data-testid` fixos nos elementos-chave, rotas com nomes fixos e formatos de API combinados.

## Passo a passo

### 1. Subir o ambiente
A bateria testa o projeto **rodando**. Confira e, se precisar, suba (em segundo plano, com log em arquivo):

- Postgres e Mailpit (docker compose do `api/`, ou os serviços da máquina);
- API: `cd api && npm run dev` (porta de `rodsaas.json → ports.api`);
- painel: `cd web && npm run dev` (porta `ports.web`);
- a fila de e-mails (pg-boss) precisa estar processando: os testes de convite e senha leem o e-mail no Mailpit.

O `run.sh` faz uma pré-checagem e diz exatamente o que está fora do ar.

### 2. Auditar o contrato
```bash
node "${CLAUDE_PLUGIN_ROOT}/skills/verify/scripts/audit.mjs" <pasta-do-projeto>
```
Lista `data-testid` faltando por área, rotas do painel ausentes e divergências da API (rota ou campo do corpo com outro nome, conferido no `api/openapi.json`).

**Se houver pendências, adapte o projeto antes de testar:**
- testids: acrescente o atributo no elemento certo (`references/contrato.md` diz qual é cada um). É uma mudança sem efeito visual; faça direto.
- rota ou campo de API com outro nome: ajuste para o nome do contrato (backend + front + `openapi:export` + `api:types`). Se a mudança for grande, mostre o que vai mudar antes.
- se o projeto não tem uma funcionalidade inteira (ex.: não existe tela de convite), **não invente às pressas**: registre como falha conhecida e pergunte se é para implementar seguindo a skill `frontend`/`backend`.

Rode a auditoria até sair "✓ contrato completo".

### 3. Rodar a bateria
```bash
bash "${CLAUDE_PLUGIN_ROOT}/skills/verify/scripts/run.sh" <pasta-do-projeto>
```
(Sem `CLAUDE_PLUGIN_ROOT`, use o caminho desta skill. Fora do Claude Code — Gemini, ChatGPT ou terminal — rode o mesmo comando apontando para a pasta `skills/verify` do repositório.)

- Primeira vez: instala a bateria e o Chromium num cache (`~/.cache/rodsaas-verify`), fora do projeto.
- Leva alguns minutos: os testes criam várias contas e **respeitam o rate limit** de cadastro/login (esperam o `Retry-After` em vez de desligar a proteção).
- Filtros úteis: `--project=api` (só API, sem navegador), `--project=ui`, `-g "trocar"` (por nome), `--last-failed`.
- Resultado: resumo em português no terminal e relatório em `<projeto>/rodsaas-verify-report/` (HTML com **vídeo, print e trace** de cada falha). Garanta que essa pasta está no `.gitignore` do projeto.

### 4. Corrigir até ficar verde
Para cada falha (`references/cenarios.md` explica o que cada teste prova e as causas mais comuns):
1. leia a mensagem (ela diz o que era esperado e o que veio);
2. veja o print/vídeo/trace no relatório (`npx playwright show-report <projeto>/rodsaas-verify-report/html`) ou o `error-context.md` em `rodsaas-verify-report/artifacts/`;
3. ache a **causa no código do projeto** e corrija ali. **Nunca altere a bateria para passar** — se um teste parecer errado para aquele projeto, explique ao usuário e pergunte;
4. rode de novo só o que falhou (`--last-failed`), e no fim a bateria inteira.

Pare e pergunte quando a correção exigir uma decisão de produto ou uma mudança grande de arquitetura.

## Relatório final

Tabela curta por área (API, autenticação, sessão, empresas, membros, módulo, estados, plano, celular/tema) com ✓/✗/○, a lista do que foi corrigido (arquivo e motivo, uma linha cada), o que ficou pulado e por quê, e o que ainda falha (se algo ficou pendente com o usuário).

## O que a bateria cobre

| Área | Testes |
|---|---|
| **API** | health; erro RFC 9457 com `code` e `requestId`; 401 sem login; `VALIDATION_ERROR` com `errors[]`; CSRF por Origin; cookies httpOnly, refresh em `/v1/auth`, `session_hint`, cookie do access durando como o refresh; `/v1/me` completo; criar empresa vira a ativa; trocar; não troca para empresa alheia; isolamento (404); último owner protegido; membro não convida; rotação e reuso do refresh derrubando a família; logout |
| **Autenticação** | cadastro pela tela; sair; rota protegida → login → volta para onde estava; senha errada; `next` externo ignorado; esqueci a senha (resposta genérica, e-mail, redefinir, senha antiga para de funcionar); verificação de e-mail; nenhum token acessível ao JavaScript |
| **Sessão** | access token sumiu → renova **uma** vez com várias requests e continua; sessão inválida → login sem loop; voltar do navegador após sair não reabre a área logada |
| **Empresas** | criar pelo seletor (vira a ativa, aparece na lista); trocar (tela e sessão, persiste ao recarregar); dados de uma não aparecem na outra (lista e link direto → 404 com a casca); **cache limpo na troca** (nada da anterior aparece nem por um instante); renomear reflete no seletor |
| **Membros** | convidar pela tela → e-mail → criar conta pelo convite (sem empresa própria, papel MEMBER) → aparece na lista; membro não vê ações de admin nem cobrança; promover a admin libera; remover corta o acesso na hora (`/sem-empresa`) |
| **Módulo de exemplo** | vazio com ação; criar com erro no campo, editar, excluir com confirmação; clique duplo cria uma vez só e o botão fica desabilitado; busca na URL e após recarregar; limite do plano → upgrade |
| **Estados** | 404 dentro do app; erro da API com código e "tentar de novo"; skeleton com API lenta; API inacessível sem tela branca nem stack |
| **Plano e cobrança** | API: preços, modo de cobrança no `/v1/me`, free não comprável, membro não assina; no modo de teste: assinar, já-assina (409), mesmo plano (400), prévia, trocar, cancelar e retomar. Tela: cards, selo do atual, uso, **botão de assinar sempre visível para o owner**, aviso de modo; assinar → trocar (diálogo com prévia) → cancelar → retomar; admin sem botões e com aviso; cadastro com `?plano=` já sai assinando |
| **Celular e tema** | menu vira gaveta; sem rolagem horizontal nas telas principais; claro/escuro |

Testes que dependem de algo opcional (módulo `projects`, limite de plano baixo) são **pulados** com o motivo, não reprovados.

## Mapa

| Arquivo | Para quê |
|---|---|
| `contract.json` | contrato em formato de máquina (usado pela auditoria) |
| `references/contrato.md` | cada testid, rota e formato de API, e onde vai |
| `references/cenarios.md` | o que cada teste prova e causas comuns de falha |
| `scripts/run.sh` | pré-checagem + auditoria + bateria + resumo |
| `scripts/audit.mjs` | só a auditoria do contrato |
| `suite/` | a bateria Playwright (copiada para o cache pelo `run.sh`) |
