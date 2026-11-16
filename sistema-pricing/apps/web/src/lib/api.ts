import { supabase } from './supabase';

export class ErroApi extends Error {
  constructor(
    readonly status: number,
    readonly codigo: string,
    mensagem: string,
    readonly detalhes?: unknown,
  ) {
    super(mensagem);
  }
}

const base = () => (process.env.NEXT_PUBLIC_API_URL || `${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/api`).replace(/\/$/, '');

/**
 * Chama a API de negócio. Toda escrita em cotação, regra ou usuário passa por
 * aqui; o navegador nunca grava direto nas tabelas.
 */
export async function api<T = any>(metodo: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE', caminho: string, corpo?: unknown, o: { idempotente?: boolean; publico?: boolean } = {}): Promise<T> {
  const cabecalhos: Record<string, string> = { 'content-type': 'application/json', apikey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? '' };
  if (!o.publico) {
    const { data } = await supabase().auth.getSession();
    if (!data.session) throw new ErroApi(401, 'NAO_AUTENTICADO', 'Sua sessão expirou. Entre de novo.');
    cabecalhos.authorization = `Bearer ${data.session.access_token}`;
  }
  if (o.idempotente) cabecalhos['idempotency-key'] = crypto.randomUUID();
  let resposta: Response;
  try {
    resposta = await fetch(`${base()}${caminho}`, { method: metodo, headers: cabecalhos, body: corpo === undefined ? undefined : JSON.stringify(corpo) });
  } catch {
    throw new ErroApi(0, 'SEM_CONEXAO', 'Não foi possível falar com o servidor. Confira sua conexão.');
  }
  const texto = await resposta.text();
  const dados = texto ? JSON.parse(texto) : null;
  if (!resposta.ok) {
    const e = dados?.erro ?? {};
    throw new ErroApi(resposta.status, e.codigo ?? 'ERRO', e.mensagem ?? 'Não foi possível concluir a operação.', e.detalhes);
  }
  return dados as T;
}

/** Mensagem pronta para a tela, com os detalhes de validação quando houver. */
export function mensagemDeErro(e: unknown): string {
  if (e instanceof ErroApi) {
    if (Array.isArray(e.detalhes) && e.detalhes.length > 0) {
      const itens = e.detalhes.slice(0, 5).map((d) => (typeof d === 'string' ? d : (d?.mensagem ?? d?.nome ?? JSON.stringify(d))));
      return `${e.message} ${itens.join(' ')}`;
    }
    return e.message;
  }
  return e instanceof Error ? e.message : 'Erro inesperado.';
}
