import { type SupabaseClient, createClient } from '@supabase/supabase-js';

let cliente: SupabaseClient | null = null;

/** Cliente do navegador: só a chave pública; toda leitura passa pelo RLS. */
export function supabase(): SupabaseClient {
  if (!cliente) {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const chave = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    if (!url || !chave) throw new Error('Configure NEXT_PUBLIC_SUPABASE_URL e NEXT_PUBLIC_SUPABASE_ANON_KEY.');
    cliente = createClient(url, chave, { auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true } });
  }
  return cliente;
}

export const AMBIENTE = process.env.NEXT_PUBLIC_AMBIENTE ?? 'producao';
