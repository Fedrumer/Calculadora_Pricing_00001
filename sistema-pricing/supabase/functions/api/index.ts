// Supabase Edge Function "api": a API de negócio da instalação.
// Publicação: supabase functions deploy api --no-verify-jwt
// (a própria função valida a sessão, a chave de canal ou o segredo de automação
// conforme a rota; por isso a verificação genérica de JWT do gateway fica desligada.)
import { montarApi } from './src/montar.ts';
import { ambienteDeDemonstracao } from './src/segredos-demo.ts';

declare const Deno: { env: { get(nome: string): string | undefined }; serve(h: (req: Request) => Promise<Response>): void };

// Na demonstração, os segredos que faltarem são gerados e guardados no banco (ver segredos-demo.ts).
// Valores não secretos (AMBIENTE, URL_APLICACAO...) podem vir de um carregador que
// importa este módulo empacotado; segredos vêm sempre do cofre da função.
const padroes = (globalThis as { PRICING_PADROES?: Record<string, string> }).PRICING_PADROES ?? {};
const pronta = ambienteDeDemonstracao((nome) => Deno.env.get(nome) ?? padroes[nome]).then((env) => montarApi(env).app);
Deno.serve(async (req) => {
  try {
    return await (await pronta).fetch(req);
  } catch (e) {
    console.error('[api] falha ao iniciar', e);
    return new Response(JSON.stringify({ erro: { codigo: 'CONFIGURACAO', mensagem: 'A função não está configurada. Confira os segredos.' } }), { status: 503, headers: { 'content-type': 'application/json' } });
  }
});
