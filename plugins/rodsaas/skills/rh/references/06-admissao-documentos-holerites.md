# 06 · Admissão, desligamento, documentos e holerites

## Admissão com pré-admissão

O objetivo é que o RH **não digite** os dados da pessoa contratada: ela mesma preenche e envia os documentos pelo celular, e o RH só confere.

### Fluxo

1. **Nova admissão** (RH; também "Admitir" a partir de um candidato do app Recrutamento, se existir): nome, CPF, e-mail pessoal, contrato, data de admissão, cargo, área, gestor, salário (opcional). Cria o `Employee` em `PRE_ADMISSION` (conta no limite/quantidade) e a `Admission` com a lista de documentos exigidos para o contrato (abaixo) e um **token** (32 bytes aleatórios; guarda o hash e o `tokenEnc`; validade 14 dias).
2. E-mail para a pessoa (da empresa, com a marca): "Bem-vinda à {empresa}! Complete sua admissão" com o link `/pre-admissao/<token>` (sem login). O RH também pode copiar o link (WhatsApp).
3. **Página pública** (celular primeiro, salva rascunho a cada passo):
   1. Boas-vindas (logo, nome da empresa, data de início, quem é o gestor).
   2. Dados pessoais (nome social opcional, nascimento, estado civil, escolaridade, RG, PIS, título, CNH), endereço (CEP preenche a rua via ViaCEP no front, editável), contatos, contato de emergência.
   3. Dependentes (para IR e salário-família).
   4. Dados bancários / Pix.
   5. Documentos: cada item da lista com "Enviar foto ou PDF" (câmera no celular), status (pendente, enviado, aprovado, recusado com o motivo).
   6. Revisão e **Enviar para o RH** (exige os obrigatórios) → `SUBMITTED` + aviso ao RH.
4. **Conferência** (RH, `/pessoas/admissoes/[id]`): dados lado a lado com os documentos (visualizador de imagem/PDF), aprovar/recusar cada documento (recusa pede motivo e manda e-mail: "Precisamos de uma nova foto do RG: está cortada"), editar dados se preciso. Status `CHANGES_REQUESTED` enquanto houver recusa.
5. **Efetivar admissão**: todos os obrigatórios aprovados (senão 409 `ADMISSION_INCOMPLETE` com a lista) → copia `candidateData` para a ficha (banco cifrado), documentos vão para a pasta da pessoa nas categorias certas, `status: ACTIVE`, `EmploymentEvent` ADMISSION, primeira `Compensation`, **checklist de admissão** gerado do modelo que casa com o contrato/área/local (`checklistItems(template, admissionDate)`), convite para o autoatendimento no e-mail de trabalho (ou pessoal) e o token deixa de valer.
6. Cancelar a admissão (desistência): `CANCELED`, o `Employee` é excluído (não tem histórico) e o link para de funcionar.

### Documentos exigidos (configuráveis em Configurações → Admissão, por contrato)

Padrão CLT: documento com foto (RG ou CNH), CPF (se não estiver no RG), comprovante de residência, CTPS digital (print da tela com o número), título de eleitor, certificado de reservista (homens 18–45, opcional), certidão de nascimento ou casamento, comprovante de escolaridade, foto 3×4 (selfie com fundo claro), dados bancários (comprovante), certidão de nascimento e CPF dos dependentes, cartão de vacinação dos filhos até 7 anos (salário-família), exame admissional (ASO — enviado pelo RH/clínica, categoria Saúde ocupacional). Estágio: + termo de compromisso e declaração de matrícula. PJ: contrato social/cartão CNPJ.

### Segurança do link público

- `RhAdmissionLookup (tokenHash)` sem RLS acha a empresa; todo o resto sob `withTenant`. Rate limit por IP e por token. Token expirado ou usado → 404 `ADMISSION_LINK_INVALID` com a página "Este link não vale mais: peça um novo ao RH".
- Uploads públicos: só pelo endpoint do token, `purpose: rh_admission`, tipos imagem/PDF, até 10 MB, com a mesma checagem de conteúdo do `uploads`.
- A página não mostra nada além do nome da pessoa, a empresa e o que ela mesma preencheu.

## Checklists (admissão e desligamento)

- Modelos com itens `{ title, offsetDays, assignee: rh|gestor|colaborador|ti|financeiro, required, description }`. O responsável de cada papel: `rh` = papel RH (qualquer um marca), `gestor` = gestor da pessoa, `colaborador` = a própria pessoa, `ti`/`financeiro` = pessoa escolhida em Configurações → Checklists (responsáveis padrão).
- Prazos: `checklistItems` (data-base ± dias, fim de semana volta para a sexta); `checklistProgress` (feito, atrasados, obrigatórios pendentes).
- Cada responsável recebe as tarefas no Início ("Suas tarefas de admissão") e o aviso `rh.checklist.assigned`. Se o app **Tarefas** estiver instalado, oferecer "Criar também no Tarefas" (projeto "Admissões") — o checklist do Pessoas continua sendo a fonte.
- **Boas-vindas** (onboarding): o RH preenche primeiro dia (horário, endereço, por quem procurar), padrinho, mensagem e links (manual, wiki); a pessoa vê no Início dela enquanto o checklist de admissão estiver aberto, com as tarefas que são dela.
- **Avaliação de experiência**: o modelo padrão tem o item do gestor aos 85 dias (contrato de experiência de 90 dias, art. 445 parágrafo único) com o lembrete; se o ciclo de desempenho existir, oferece abrir uma avaliação avulsa.

## Desligamento

`POST /terminate` (03-api) → checklist de desligamento, cancelamento dos pedidos pendentes, aviso aos aprovadores, novo gestor dos subordinados (obrigatório), remoção do acesso à empresa no último dia (o usuário deixa de ser membro desta empresa — a conta continua existindo para outras), **entrevista de desligamento** (pesquisa `EXIT`, identificada ou anônima conforme o modelo; o RH escolhe). Os holerites e informes futuros (rescisão, informe do ano) podem ser enviados por e-mail ao desligado a partir do lote (opção "enviar por e-mail a quem não tem mais acesso").

## Pasta de documentos

- Categorias com visibilidade padrão (`RH_ONLY`, `EMPLOYEE`, `SENSITIVE` = saúde) e validade (`hasExpiry`).
- RH envia para qualquer pessoa; a pessoa envia os próprios (certificados, comprovantes) — entram como `EMPLOYEE`, o RH pode reclassificar.
- **Validade**: `expiryState` → selo "Vence em 12 dias" / "Vencido"; painel do RH "Documentos vencendo" (30 dias), aviso 30/7/0 dias; renovar = enviar nova versão (a antiga fica no histórico do documento).
- Download sempre por URL assinada curta, conferindo a permissão a cada pedido; `SENSITIVE` e documentos `personal` gravam `RhAccessLog`.
- **Documentos da empresa** (políticas): título, PDF ou texto, público-alvo, "exige ciência", prazo. Publicar avisa o público; a pessoa abre, rola até o fim (o botão só habilita depois de abrir o PDF/rolar o texto) e clica **Li e concordo** → `DocumentAck` com versão, data, IP e navegador. Painel: % de ciência, quem falta (lembrar todos), exportar. Nova versão pede ciência de novo. **Não é assinatura eletrônica** com validade de contrato: a tela diz "registro de ciência".

## Holerites, informes e recibos em lote

1. **Novo lote** (RH): tipo (holerite, informe de rendimentos, recibo de férias, 13º, outro), referência (mês/ano ou ano), rótulo. Envia vários PDFs, um ZIP ou **um PDF único** com todos.
2. O servidor lê o texto (`pdfjs-dist`): arquivos separados → `matchPayslips` (CPF no nome do arquivo ou no texto); PDF único → `groupPagesByCpf` (página sem CPF continua a pessoa anterior) e separa as páginas de cada pessoa em um PDF novo (`pdf-lib`). Arquivo protegido por senha ou sem texto (imagem escaneada) → vai para "sem dono" com o motivo.
3. **Prévia** (antes de publicar): casados (pessoa ↔ arquivo, com abrir), sem dono e ambíguos — o RH atribui à mão (busca por nome) ou descarta. Pessoas ativas **sem** holerite no lote aparecem em "Faltando" (aviso, não bloqueia).
4. **Publicar** → `Payslip` por pessoa + aviso `rh.payslip.published` ("Seu holerite de setembro/2026 está disponível" — nunca o valor). Lote publicado não muda; correção = novo lote do mesmo tipo/referência, que **substitui** o arquivo da pessoa (o anterior fica no histórico, marcado "substituído").
5. **A pessoa** vê em Meus holerites (agrupados por ano), abre (marca `viewedAt`) e confirma o recebimento (`ackAt`, opcional por empresa). O RH vê no lote quem abriu e quem confirmou e pode lembrar quem não abriu.

O Pessoas **não gera** holerites: eles vêm da folha (contabilidade). Fechamento do mês (`08-telas.md`) é o caminho de volta.

## Testes obrigatórios

- Pré-admissão: criar devolve o link uma vez; página pública com token certo (200) e errado (404); salvar rascunho; enviar sem documento obrigatório → 400; efetivar com documento pendente → 409 `ADMISSION_INCOMPLETE`; efetivar → `ACTIVE`, checklist criado com os prazos, token não vale mais.
- Checklist: responsável marca o próprio item; outro colaborador não (403); progresso.
- Documentos: `expiry` em cada estado; colega não lista (404); `SENSITIVE` invisível para o gestor; download grava `RhAccessLog`.
- Holerites: lote com 2 arquivos casados por CPF no nome e 1 sem dono; PDF único de 3 páginas separado por pessoa; publicar; cada um lista só os seus; abrir o de outro → 404; publicar de novo → 409.
- Política: ciência grava versão e IP; nova versão volta a pedir.
