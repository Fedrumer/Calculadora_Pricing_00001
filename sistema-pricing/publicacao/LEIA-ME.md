# Publicação sem a CLI do Supabase

`api.empacotada.js` é a API de negócio inteira em um arquivo, gerada por
`node ferramentas/src/cli/empacotar-api.mjs publicacao/api.empacotada.js`.

Ela existe para a homologação feita por conector, em que não há como enviar a pasta
da função. Nesse caso a Edge Function publicada é só um carregador, que importa este
arquivo de um commit fixo do repositório:

```ts
(globalThis as any).PRICING_PADROES = { AMBIENTE: 'demonstracao', URL_APLICACAO: 'http://localhost:3000' };
await import('https://raw.githubusercontent.com/<dono>/<repo>/<commit>/sistema-pricing/publicacao/api.empacotada.js');
```

Para um cliente, publique pelo fluxo normal (`supabase functions deploy api --no-verify-jwt`
ou o fluxo de `.github-modelo/ci.yml`), a partir do repositório dele. Não use o carregador
em produção: o código deve estar dentro do projeto do cliente, não ser buscado de fora.
