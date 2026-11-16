# O que está pronto, o que foi verificado e o que falta

## Verificado nesta construção

- Motor: 33 testes, incluindo 5 casos de referência conferidos à mão nas duas empresas fictícias.
- API e banco: 65 testes de integração contra Postgres 16, incluindo leitura e escrita como cada perfil (RLS).
- Aplicação web: build de produção e o roteiro de demonstração inteiro no navegador (30 conferências),
  contra o emulador local.
- Cópia externa e teste de restauração executados de verdade no ambiente local.

## Não verificado

- **Nada foi publicado em um projeto Supabase real.** A API foi exercitada em Node; o empacotamento como
  Edge Function (Deno) e o comportamento do Supabase Auth, do PostgREST e do Storage reais precisam de uma
  rodada de homologação. O emulador local cobre só o subconjunto que a aplicação usa.
- Os fluxos do n8n foram escritos no formato de exportação e não foram importados nem executados em um n8n.
- A camada de IA foi testada com um serviço simulado; nenhuma chamada real à API da Anthropic foi feita.
- Envio de e-mail (convites, avisos) depende do n8n; a tela mostra o link do convite para o administrador copiar.
- SSO (SAML) não foi configurado contra provedor de teste.
- A redefinição de senha por e-mail depende do Supabase Auth real.

## Decisões do documento que continuam em aberto

1. Horas da Fase 0 e setor da empresa fictícia (aqui: assistência, com distribuidor B2B como segunda configuração).
2. Custo de infraestrutura por cliente.
3. Onde roda o n8n (o fluxo de saúde pede um n8n fora da infraestrutura do cliente).
4. PITR como padrão ou opcional.
5. Limite de responsabilidade e seguro.
6. Exigências da Susep para clientes regulados.

## Escolhas feitas na construção que vale revisar

- Os preços, custos e limites das empresas fictícias são inventados; as margens resultantes são altas e servem só de exemplo.
- O histórico sintético é carga direta no banco, com origem "carga"; não passa pela API.
- No ambiente de demonstração, os casos de referência são recalculados pelo motor depois do reajuste histórico.
  Em cliente real eles são sempre calculados à mão.
- O frontend guarda a sessão no navegador (padrão do cliente Supabase); a segurança não depende dele.
