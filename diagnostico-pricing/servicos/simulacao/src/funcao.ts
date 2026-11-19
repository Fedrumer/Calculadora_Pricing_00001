// Atendimento da função `simular`, independente do ambiente: a Edge Function (Deno) e o emulador local
// (Node) passam a chamada rpc com o JWT de quem pediu, então o banco confere o perfil nas duas pontas:
// public.base_simulacao e public.gravar_simulacao exigem consultor.
import { type BaseSimulacao, modeloDiagnostico } from './modelos/diagnostico.ts';
import { SORTEIOS_PADRAO, VERSAO_SERVICO, simular } from './simular.ts';
import type { Criterio, Opcao, Premissa } from './tipos.ts';

export interface Contexto {
  rpc: (funcao: string, args: Record<string, unknown>) => Promise<unknown>;
  agora: () => number;
}

export class ErroRpc extends Error {
  constructor(public status: number, message: string) { super(message); }
}

interface LinhaPremissa { alavanca: string; chave: string; tipo: string; p10: number; p50: number; p90: number; minimo: number | null; maximo: number | null }
type BaseDoBanco = BaseSimulacao & { premissas: LinhaPremissa[]; versao_catalogo: number };

export interface PedidoSimulacaoDiagnostico {
  diagnostico_id: string;
  semente?: number;
  sorteios?: number;
  /** Troca a faixa de premissas do catálogo: chave "alavanca.chave". */
  premissas?: Record<string, { p10: number; p50: number; p90: number }>;
}

/** Limites de domínio das premissas das alavancas: elasticidade até 0; captura e fechamento de 0 a 1; percentis de 0 a 100. */
export function limitesDaChave(chave: string): { minimo?: number; maximo?: number } {
  if (chave === 'elasticidade') return { maximo: 0 };
  if (chave === 'captura' || chave === 'fechamento') return { minimo: 0, maximo: 1 };
  if (chave.startsWith('percentil') || chave.endsWith('_pct')) return { minimo: 0, maximo: 100 };
  return {};
}

/** Premissas do catálogo (premissas_distribuicao) no formato do serviço. */
export function premissasDoCatalogo(linhas: LinhaPremissa[], trocas: PedidoSimulacaoDiagnostico['premissas'] = {}): Premissa[] {
  return linhas.map((l) => {
    const chave = `${l.alavanca}.${l.chave}`;
    const t = trocas[chave];
    const minimo = l.minimo == null ? null : Number(l.minimo), maximo = l.maximo == null ? null : Number(l.maximo);
    return {
      chave, origem: t ? 'informada' : 'historico',
      distribuicao: { tipo: 'quantis', p10: Number(t?.p10 ?? l.p10), p50: Number(t?.p50 ?? l.p50), p90: Number(t?.p90 ?? l.p90), minimo, maximo },
      limites: limitesDaChave(l.chave),
    } satisfies Premissa;
  });
}

const OPCOES_DIAGNOSTICO: Opcao[] = [{ codigo: 'ajustes', descricao: 'Ajustes do diagnóstico, nas alavancas do catálogo' }];
const CRITERIO_DIAGNOSTICO: Criterio = { regra: 'max_p50_com_risco', limite_risco: 0.1 };

export async function simularDiagnostico(pedido: PedidoSimulacaoDiagnostico, ctx: Contexto) {
  if (!pedido?.diagnostico_id) throw new ErroRpc(400, 'Informe o diagnostico_id.');
  const base = (await ctx.rpc('base_simulacao', { p_diagnostico: pedido.diagnostico_id })) as BaseDoBanco;
  if (!base.pares.length) throw new ErroRpc(400, 'O diagnóstico não tem vendas com custo para simular.');
  const premissas = premissasDoCatalogo(base.premissas, pedido.premissas);
  const semente = Math.trunc(pedido.semente ?? 20261119) >>> 0;
  const inicio = ctx.agora();
  const resultado = simular({
    modelo: modeloDiagnostico(base), premissas, opcoes: OPCOES_DIAGNOSTICO, semente,
    sorteios: pedido.sorteios ?? SORTEIOS_PADRAO, criterio: CRITERIO_DIAGNOSTICO,
  });
  const duracao_ms = Math.round(ctx.agora() - inicio);
  const id = await ctx.rpc('gravar_simulacao', {
    p_diagnostico: pedido.diagnostico_id,
    p_dados: { entrada: { modelo: 'diagnostico', premissas, correlacoes: [], opcoes: OPCOES_DIAGNOSTICO, criterio: CRITERIO_DIAGNOSTICO }, resultado, duracao_ms },
  });
  return { id, versao_servico: VERSAO_SERVICO, duracao_ms, resultado };
}

/** Roteia o corpo do pedido. Devolve status e corpo JSON. */
export async function atender(corpo: unknown, ctx: Contexto): Promise<{ status: number; corpo: unknown }> {
  try {
    return { status: 200, corpo: await simularDiagnostico(corpo as PedidoSimulacaoDiagnostico, ctx) };
  } catch (e) {
    if (e instanceof ErroRpc) return { status: e.status, corpo: { message: e.message } };
    return { status: 400, corpo: { message: (e as Error).message } };
  }
}
