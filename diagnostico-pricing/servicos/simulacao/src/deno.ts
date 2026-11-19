// Ponto de entrada da Edge Function `simular` (Deno). Empacotado com o núcleo em
// supabase/functions/simular/servico.js por `pnpm --filter @diagnostico/simulacao empacotar`.
import { ErroRpc, atender } from './funcao.ts';

declare const Deno: { env: { get(nome: string): string | undefined }; serve(h: (r: Request) => Promise<Response>): void };

const CORS = {
  'access-control-allow-origin': '*',
  'access-control-allow-headers': 'authorization, x-client-info, apikey, content-type',
  'access-control-allow-methods': 'POST, OPTIONS',
};

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS });
  if (req.method !== 'POST') return new Response(JSON.stringify({ message: 'Use POST.' }), { status: 405, headers: CORS });
  const url = Deno.env.get('SUPABASE_URL')!;
  const chave = Deno.env.get('SUPABASE_ANON_KEY')!;
  const autorizacao = req.headers.get('authorization') ?? '';
  const rpc = async (funcao: string, args: Record<string, unknown>) => {
    const r = await fetch(`${url}/rest/v1/rpc/${funcao}`, {
      method: 'POST', headers: { apikey: chave, authorization: autorizacao, 'content-type': 'application/json' }, body: JSON.stringify(args),
    });
    const texto = await r.text();
    const dados = texto ? JSON.parse(texto) : null;
    if (!r.ok) throw new ErroRpc(r.status === 401 || r.status === 403 ? 403 : 400, dados?.message ?? `rpc ${funcao}: ${r.status}`);
    return dados;
  };
  const corpo = await req.json().catch(() => null);
  const s = await atender(corpo, { rpc, agora: () => performance.now() });
  return new Response(JSON.stringify(s.corpo), { status: s.status, headers: { ...CORS, 'content-type': 'application/json' } });
});
