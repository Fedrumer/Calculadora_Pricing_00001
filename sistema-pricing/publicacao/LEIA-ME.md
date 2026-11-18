# Publicação da função `api` com o código dentro

Esta pasta é a Edge Function `api` pronta para publicar, sem buscar nada de fora em tempo de execução:

| Arquivo | O que é |
| --- | --- |
| `index.ts` | Ponto de entrada: carrega os valores não secretos e a API |
| `padroes.ts` | Valores não secretos da demonstração (`AMBIENTE`, endereço das telas, origens permitidas) |
| `api.empacotada.js` | A API de negócio inteira em um arquivo |

Gere `api.empacotada.js` de novo a cada mudança na API ou no motor:

```bash
node ferramentas/src/cli/empacotar-api.mjs publicacao/api.empacotada.js
```

Publique com a CLI (`supabase functions deploy api --no-verify-jwt`, a partir de `supabase/functions`) ou,
sem a CLI, pela API de gerenciamento do Supabase, com um token de acesso pessoal (começa com `sbp_`):

```bash
cd publicacao
curl -X POST "https://api.supabase.com/v1/projects/<projeto>/functions/deploy?slug=api" \
  -H "Authorization: Bearer $SUPABASE_ACCESS_TOKEN" \
  -F 'metadata={"entrypoint_path":"index.ts","name":"api","verify_jwt":false};type=application/json' \
  -F "file=@index.ts" -F "file=@padroes.ts" -F "file=@api.empacotada.js"
```

`verify_jwt` fica desligado porque a própria API valida a sessão, a chave de canal ou o segredo de
automação conforme a rota.

Até 18/11/2026 a demonstração usava um carregador que importava `api.empacotada.js` de
`raw.githubusercontent.com`. Ele deixava de funcionar se o repositório ficasse privado e não deve ser usado:
o código precisa estar dentro do projeto do cliente.

Os segredos (`SEGREDO_HASH`, `CHAVE_CIFRA_DOCUMENTOS`, `SEGREDO_AUTOMACAO`, `SEGREDO_PSEUDONIMO`,
`CHAVE_ENVIO_DIAGNOSTICO`) ficam no cofre da função. Só na demonstração, os que faltarem são gerados e
guardados em `app.segredos_demo` (RLS ligado, sem permissão para `anon` e `authenticated`).
