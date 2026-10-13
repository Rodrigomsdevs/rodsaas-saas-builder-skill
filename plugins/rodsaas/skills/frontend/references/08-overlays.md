# Dialogs, drawers e afins

## Quando usar cada um

| Componente | Usar para | Não usar para |
|---|---|---|
| **Dialog** | confirmações, formulários bem curtos (1–3 campos: renomear, convidar) | formulários longos |
| **AlertDialog** (`ConfirmDialog`) | toda ação destrutiva ou irreversível | avisos informativos |
| **Sheet** lateral (`FormSheet`) | criar/editar registro, painel de filtros avançados | confirmação |
| **Drawer** de baixo | o mesmo que o sheet, **no celular** | desktop |
| **DropdownMenu** | ações de linha, menu do usuário, seletor de empresa | navegação principal |
| **Popover** | seletores (data, cor), detalhes rápidos | formulários |
| **Command** (Ctrl+K) | busca global e navegação rápida | — (bom ter; pode ficar para depois da v1) |
| **Tooltip** | rótulo de ícone, explicação curta | conteúdo importante (no celular não existe hover) |

## Regras para todos

- **Esc** fecha e o clique fora fecha — **exceto** com ação em andamento (botão em loading) ou com alterações não salvas (aí pergunta "Descartar alterações?").
- Foco vai para o primeiro campo ao abrir e volta para o botão que abriu ao fechar (o Radix já faz; não quebre).
- Título sempre presente (acessibilidade); descrição curta quando ajudar.
- Botões no rodapé: ação principal à direita, "Cancelar" à esquerda dela.
- Não empilhe overlays (dialog dentro de sheet dentro de dialog). A exceção aceita é o "Descartar alterações?" sobre um formulário.
- Fechar após sucesso, com toast; manter aberto com erro, com o erro nos campos.

## `ConfirmDialog`

```tsx
<ConfirmDialog
  title="Excluir projeto?"
  description={`"${project.name}" e todos os dados dele serão excluídos. Isso não pode ser desfeito.`}
  confirmLabel="Excluir projeto"
  variant="destructive"
  onConfirm={() => remove.mutateAsync(project.id)}   // o dialog mostra loading até a promise resolver
/>
```

- O botão de confirmar diz exatamente a ação ("Excluir projeto", "Remover Ana da empresa"), nunca "OK"/"Sim".
- Para o que é **muito** destrutivo (excluir a empresa, cancelar tudo), exija digitar o nome para habilitar o botão.
- Foco inicial no **Cancelar**, não no botão destrutivo.

## `FormSheet`

- Abre pela direita no desktop (largura média), vira `Drawer` de baixo no celular (mesmo conteúdo).
- Cabeçalho com título ("Novo projeto" / "Editar projeto"), corpo com rolagem própria, rodapé fixo com os botões.
- Editar busca o registro atualizado ao abrir (skeleton no corpo enquanto carrega).
- Opcional: refletir na URL (`?novo=1`, `?editar=<id>`) para o botão voltar fechar o sheet e o link abrir direto nele.

## `UpgradeDialog`

Aberto pelo `PLAN_LIMIT_REACHED` ou ao clicar num recurso com selo do plano:
- o que travou ("Você chegou ao limite de 5 projetos do plano Free");
- o plano seguinte com 2–3 benefícios e preço;
- owner: **Ver planos** (vai para `/configuracoes/plano`) ou direto para o checkout;
- outros papéis: "Peça para {nome do owner} fazer o upgrade", sem botão de pagamento.

## Seletor de empresa (`OrgSwitcher`)

Dropdown no topo do menu lateral: logo/inicial e nome da empresa ativa, lista das outras com papel em cada uma, "Criar nova {empresa}". Trocar mostra loading no próprio item e limpa todo o cache (ver sessão). Com uma empresa só, mostra só o nome (sem lista vazia).
