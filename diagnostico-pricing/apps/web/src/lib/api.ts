import { supabase } from './supabase';

/** Chama uma função do banco. O navegador nunca grava direto nas tabelas. */
export async function rpc<T = any>(funcao: string, args: Record<string, unknown> = {}): Promise<T> {
  const { data, error } = await supabase().rpc(funcao, args);
  if (error) {
    if (/permission denied/i.test(error.message)) throw new Error('Seu perfil não tem permissão para esta ação.');
    if (/fetch/i.test(error.message)) throw new Error('Não foi possível falar com o servidor. Confira sua conexão.');
    throw new Error(error.message);
  }
  return data as T;
}

export const mensagemDeErro = (e: unknown): string => (e instanceof Error ? e.message : 'Erro inesperado.');

/** Chama um serviço (Edge Function) com a sessão de quem está na tela; o serviço grava pelo banco, que confere o perfil. */
export async function servico<T = any>(nome: string, corpo: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase().functions.invoke(nome, { body: corpo });
  if (error) {
    const contexto = (error as { context?: Response }).context;
    const detalhe = contexto && typeof contexto.json === 'function' ? await contexto.json().catch(() => null) : null;
    throw new Error(detalhe?.message ?? error.message);
  }
  return data as T;
}
