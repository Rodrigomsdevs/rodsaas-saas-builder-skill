# Checklist · uploads

- [ ] `STORAGE_DRIVER=local` funcionando em dev; variáveis `S3_*` documentadas no `.env.example`
- [ ] model `File` com RLS `FORCE`; chave `org/<orgId>/<ano>/<mês>/<uuid>`
- [ ] tipo conferido pelo conteúdo no `complete`; tamanho real conferido
- [ ] limites `storageMb` e `maxFileMb` em todos os planos; uso aparece em Plano e cobrança
- [ ] URL de download expira; bucket sem acesso público; SVG/HTML nunca inline
- [ ] jobs de limpeza agendados
- [ ] front: arrastar, clicar, colar; progresso; cancelar; tentar de novo; erros com mensagem certa; cota cheia abre upgrade
- [ ] pré-visualização de imagem (lightbox) e PDF; outros baixam
- [ ] testes da API verdes (tipos, tamanho, cota, isolamento, token local, sanitização)
- [ ] testado de verdade: enviar imagem, PDF e um arquivo proibido; estourar o limite; outra empresa não acessa a URL
- [ ] produção: CORS do bucket e, se driver local, `client_max_body_size` do nginx ajustado
