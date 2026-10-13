# Formulários

## Base

- React Hook Form + resolver do Zod. Schema do formulário em `features/<x>/schemas.ts`, alinhado ao body da API (mesmos limites de tamanho que o backend valida).
- Componentes de campo do shadcn (`Form`/`Field`, conforme a versão) com `Label`, descrição opcional e mensagem de erro abaixo do campo.
- Foco automático no primeiro campo; Enter envia; botão de envio é `LoadingButton`.
- Texto do botão diz a ação: "Criar projeto", "Salvar alterações", "Enviar convite". Nunca "Enviar" genérico.

## Erros da API nos campos

A API devolve validação no formato RFC 9457 com `errors: [{ path, message }]`. Mapeie para o formulário, para o erro aparecer **no campo certo**:

```ts
export function applyApiErrors<T extends FieldValues>(err: unknown, form: UseFormReturn<T>) {
  if (!(err instanceof ApiError)) return false
  if (err.fieldErrors.length) {
    for (const fe of err.fieldErrors) form.setError(fe.path as Path<T>, { message: fe.message })
    return true
  }
  if (err.code === 'CONFLICT') {
    // conflitos conhecidos viram erro de campo (ex.: e-mail já cadastrado)
    form.setError('root', { message: err.message })
    return true
  }
  return false
}
```

No `onError` da mutation do formulário: tente `applyApiErrors`; se não aplicou, toast com a mensagem. (A mutation usa `meta: { handlesError: true }` para o toast global não duplicar.)

Erro sem campo (`root`) aparece num alerta discreto no topo do formulário, não em toast.

## Alterações não salvas

Formulário com `isDirty`:
- fechar o `FormSheet`/dialog → `ConfirmDialog` "Descartar alterações?";
- sair da página → aviso do navegador (`beforeunload`) e interceptação de navegação interna quando a versão do Next permitir.
Depois de salvar com sucesso, `form.reset(valoresSalvos)` para limpar o estado.

## Campos especiais

| Campo | Comportamento |
|---|---|
| **Senha** | botão mostrar/ocultar; no cadastro e na troca, dica de força simples (mínimo 8 caracteres, não igual ao e-mail — mesma regra do backend) |
| **E-mail** | `type="email"`, `autoComplete="email"`, trim e minúsculas antes de enviar |
| **Data** | `Popover` + `Calendar` em pt-BR, digitação no formato dd/mm/aaaa |
| **Moeda** | digita "1.234,56", guarda **centavos inteiros** no formulário e na API |
| **Seleção com muitas opções** | `Command` com busca em vez de `select` |
| **Upload** | só se o módulo pedir; tamanho e tipo validados antes de enviar |

`autoComplete` correto em todos os campos de auth (`current-password`, `new-password`, `email`, `name`): gerenciadores de senha dependem disso.

## Máscaras e validações BR (`lib/masks.ts`)

Máscara formata enquanto digita; o valor enviado à API é **só o dado** (sem pontuação), exceto onde o backend definir diferente.

| Campo | Máscara | Validação |
|---|---|---|
| CPF | `000.000.000-00` | dígitos verificadores |
| CNPJ | `AA.AAA.AAA/AAAA-00` | dígitos verificadores, **aceitando o CNPJ alfanumérico** (as 12 primeiras posições podem ter letras) |
| CPF ou CNPJ | troca a máscara pelo tamanho | conforme o tipo |
| Telefone | `(00) 0000-0000` / `(00) 00000-0000` | 10 ou 11 dígitos |
| CEP | `00000-000` | 8 dígitos; ao completar, busca o endereço |

```ts
export function isValidCPF(value: string) {
  const d = value.replace(/\D/g, '')
  if (d.length !== 11 || /^(\d)\1{10}$/.test(d)) return false
  const dv = (n: number) => {
    let sum = 0
    for (let i = 0; i < n; i++) sum += Number(d[i]) * (n + 1 - i)
    const r = (sum * 10) % 11
    return r === 10 ? 0 : r
  }
  return dv(9) === Number(d[9]) && dv(10) === Number(d[10])
}

// Suporta o CNPJ numérico e o alfanumérico: cada caractere vale (código ASCII − 48).
export function isValidCNPJ(value: string) {
  const c = value.toUpperCase().replace(/[^0-9A-Z]/g, '')
  if (!/^[0-9A-Z]{12}\d{2}$/.test(c) || /^(.)\1{13}$/.test(c)) return false
  const val = (ch: string) => ch.charCodeAt(0) - 48
  const dv = (len: 12 | 13) => {
    const w = len === 12 ? [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2] : [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]
    let sum = 0
    for (let i = 0; i < len; i++) sum += val(c[i]!) * w[i]!
    const r = sum % 11
    return r < 2 ? 0 : 11 - r
  }
  return dv(12) === Number(c[12]) && dv(13) === Number(c[13])
}
```

Cubra com testes: `529.982.247-25` (CPF válido), `11.222.333/0001-81` (CNPJ válido), `12.ABC.345/01DE-35` (CNPJ alfanumérico válido, exemplo da Receita), as mesmas sequências com o último dígito trocado (inválidos) e sequências repetidas. Confira a regra do CNPJ alfanumérico na documentação atual da Receita Federal antes de publicar.

### Endereço por CEP

Ao completar 8 dígitos, consulte um serviço público de CEP (ex.: ViaCEP, `https://viacep.com.br/ws/{cep}/json/`) e preencha rua, bairro, cidade e UF, deixando tudo editável. Falha ou CEP inexistente: não mostre erro bloqueante, só deixe o usuário digitar. Mostre um spinner pequeno no campo durante a busca.

## Padrão completo (criar em drawer)

```tsx
function ProjectForm({ onDone }: { onDone: () => void }) {
  const form = useForm<CreateProjectInput>({ resolver: zodResolver(createProjectSchema), defaultValues: { name: '', description: '' } })
  const idem = useIdempotencyKey()
  const create = useCreateProject()

  const onSubmit = form.handleSubmit((values) =>
    create.mutate({ body: values, idempotencyKey: idem.key }, {
      onSuccess: (p) => { idem.reset(); toast.success(`Projeto "${p.name}" criado`); onDone() },
      onError: (err) => { if (!applyApiErrors(err, form)) toast.error(messageOf(err)) },
    }),
  )

  return (
    <form onSubmit={onSubmit}>
      {/* campos */}
      <LoadingButton type="submit" loading={create.isPending} loadingText="Criando…">Criar projeto</LoadingButton>
    </form>
  )
}
```
