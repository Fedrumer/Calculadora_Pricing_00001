# O que está pronto, o que foi verificado e o que falta

## Verificado nesta construção

- Motor: 33 testes, incluindo 5 casos de referência conferidos à mão nas duas empresas fictícias.
- API e banco: 65 testes de integração contra Postgres 16, incluindo leitura e escrita como cada perfil (RLS).
- Aplicação web: build de produção e o roteiro de demonstração inteiro no navegador (30 conferências),
  contra o emulador local.
- Cópia externa e teste de restauração executados de verdade no ambiente local.

## Homologação em um projeto Supabase real (16/11/2026)

Feita no projeto `Calculadora_Pricing_00001` (São Paulo), pelo conector, sem a CLI:

- As migrações aplicaram sem ajuste em Postgres 17 (checksum conferido contra o repositório).
- A API rodou como Edge Function (Deno), publicada por um carregador que importa `publicacao/api.empacotada.js`
  de um commit fixo. Para um cliente, publique pelo fluxo normal (ver `publicacao/LEIA-ME.md`).
- A empresa fictícia, os 10 usuários (pelo Supabase Auth) e 749 cotações sintéticas foram instalados pela rota `/demo/repor`.
- 15 conferências contra os serviços reais passaram: login, leitura pelo PostgREST com RLS (vendedor vê só as
  próprias cotações e nenhum parâmetro de custo; visitante sem sessão é negado; escrita direta é negada),
  simulação em cerca de 220 ms, emissão com PDF gravado no Storage e baixado por link assinado, canal sem custo
  nem margem, e perfil com segundo fator obrigatório barrado em sessão de um fator, na API e no banco.
- O verificador de segurança do Supabase apontou só itens intencionais (visões e funções com dono, tabelas sem
  política por serem inalcançáveis pelo navegador) e a proteção contra senha vazada, que se liga no painel.

## Não verificado

- **A aplicação web contra o Supabase real**, incluindo o cadastro do segundo fator (TOTP) pelo Supabase Auth.
  O roteiro no navegador rodou só contra o emulador local.
- A publicação pela CLI (`supabase functions deploy`) e pelo fluxo de `.github-modelo/ci.yml`.
- Os fluxos do n8n foram escritos no formato de exportação e não foram importados nem executados em um n8n.
- A camada de IA foi testada com um serviço simulado; nenhuma chamada real à API da Anthropic foi feita.
- Envio de e-mail (convites, avisos) depende do n8n; a tela mostra o link do convite para o administrador copiar.
- SSO (SAML) e a redefinição de senha por e-mail.
- Cópia externa e teste de restauração contra o projeto real (rodaram só no ambiente local).

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
