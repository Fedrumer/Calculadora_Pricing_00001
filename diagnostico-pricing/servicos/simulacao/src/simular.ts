import { xoshiro128ss } from './aleatorio.ts';
import { correlacionar, fatorCorrelacao } from './copula.ts';
import { conferirPremissa, eDiscreta, eFixa, valorPremissa } from './distribuicoes.ts';
import { estatisticas } from './estatistica.ts';
import type {
  Correlacao, Criterio, Escolha, LinhaSensibilidade, Medida, Modelo, Opcao, Premissa, Regra, ResultadoOpcao, ResultadoSimulacao, Valores,
} from './tipos.ts';

/** Muda quando o gerador, a interpolação ou um modelo mudam de comportamento. */
export const VERSAO_SERVICO = '1.0.0';
export const SORTEIOS_PADRAO = 10_000;
export const LIMITE_RISCO_PADRAO = 0.1;

export interface EntradaSimulacao {
  modelo: Modelo;
  premissas: Premissa[];
  correlacoes?: Correlacao[];
  opcoes: Opcao[];
  semente: number;
  sorteios?: number;
  criterio?: Criterio;
  /** Desligue para varreduras: o tornado não depende das premissas varridas. */
  sensibilidade?: boolean;
}

/** Uniformes de todos os sorteios, por premissa não fixa, na ordem dada; já correlacionadas. */
export function sortearUniformes(premissas: Premissa[], correlacoes: Correlacao[] | undefined, semente: number, n: number) {
  const sorteadas = premissas.filter((p) => !eFixa(p));
  const k = sorteadas.length;
  const fator = fatorCorrelacao(sorteadas.map((p) => p.chave), correlacoes ?? []);
  const rng = xoshiro128ss(semente);
  const u = new Float64Array(n * k);
  for (let i = 0; i < n * k; i++) u[i] = rng();
  if (fator) {
    const z = new Float64Array(k);
    for (let i = 0; i < n; i++) correlacionar(u, i * k, k, fator, z);
  }
  return { u, k, chaves: sorteadas.map((p) => p.chave) };
}

/** Valores sorteados de cada premissa: uma coluna por premissa, uma linha por sorteio. */
export function sortearValores(premissas: Premissa[], correlacoes: Correlacao[] | undefined, semente: number, n: number) {
  for (const p of premissas) {
    const erro = conferirPremissa(p);
    if (erro) throw new Error(erro);
  }
  const { u, k } = sortearUniformes(premissas, correlacoes, semente, n);
  const colunas: (number | string)[][] = [];
  let j = 0;
  for (const p of premissas) {
    if (eFixa(p)) { colunas.push(new Array(n).fill(valorPremissa(p, 0.5))); continue; }
    const col = new Array<number | string>(n);
    for (let i = 0; i < n; i++) col[i] = valorPremissa(p, u[i * k + j]!);
    colunas.push(col);
    j++;
  }
  return colunas;
}

const MEDIDAS: Medida[] = ['margem', 'faturamento', 'volume'];

export function simular(e: EntradaSimulacao): ResultadoSimulacao {
  const n = e.sorteios ?? SORTEIOS_PADRAO;
  if (!(n >= 100 && n <= 100_000)) throw new Error('O número de sorteios vai de 100 a 100.000.');
  if (!e.opcoes.length) throw new Error('Informe pelo menos uma opção.');
  const colunas = sortearValores(e.premissas, e.correlacoes, e.semente, n);
  const valores: Valores = {};
  const opcoes: ResultadoOpcao[] = [];
  for (const opcao of e.opcoes) {
    const series: Record<Medida, Float64Array> = { margem: new Float64Array(n), faturamento: new Float64Array(n), volume: new Float64Array(n) };
    const tem: Record<Medida, boolean> = { margem: true, faturamento: false, volume: false };
    const contrib = new Map<string, number>();
    let falta = 0, perdido = 0;
    for (let i = 0; i < n; i++) {
      for (let k = 0; k < e.premissas.length; k++) valores[e.premissas[k]!.chave] = colunas[k]![i]!;
      const s = e.modelo.avaliar(valores, opcao);
      series.margem[i] = s.margem;
      if (s.faturamento !== undefined) { series.faturamento[i] = s.faturamento; tem.faturamento = true; }
      if (s.volume !== undefined) { series.volume[i] = s.volume; tem.volume = true; }
      if (s.contribuicoes) for (const [a, v] of Object.entries(s.contribuicoes)) contrib.set(a, (contrib.get(a) ?? 0) + v);
      if (s.faltouCapacidade) falta++;
      perdido += s.volumePerdido ?? 0;
    }
    const medidas: ResultadoOpcao['medidas'] = {};
    for (const m of MEDIDAS) if (tem[m]) medidas[m] = estatisticas(series[m], opcao.meta?.medida === m ? opcao.meta.valor : null);
    const ordem = e.modelo.alavancas ?? [...contrib.keys()];
    opcoes.push({
      codigo: opcao.codigo, descricao: opcao.descricao, e_manter: opcao.e_manter, medidas,
      contribuicoes: ordem.filter((a) => contrib.has(a)).map((a) => ({ alavanca: a, media: contrib.get(a)! / n })),
      prob_falta_capacidade: falta / n, volume_perdido_medio: perdido / n,
    });
  }
  return {
    versao_servico: VERSAO_SERVICO, semente: e.semente, sorteios: n, opcoes,
    escolha: escolher(opcoes, e.criterio),
    sensibilidade: e.sensibilidade === false ? [] : sensibilidade(e),
  };
}

// ---------------------------------------------------------------- regra de escolha (13.3)
const REGRAS: Regra[] = ['max_media', 'max_p50', 'max_prob_ganho', 'max_p50_com_risco'];

function pontuacao(regra: Regra, o: ResultadoOpcao, limite: number): number | null {
  const m = o.medidas.margem!;
  switch (regra) {
    case 'max_media': return m.media;
    case 'max_p50': return m.p50;
    case 'max_prob_ganho': return m.prob_positivo;
    case 'max_p50_com_risco': return m.prob_prejuizo <= limite + 1e-12 ? m.p50 : null;
  }
}

export function escolherPor(regra: Regra, opcoes: ResultadoOpcao[], limite = LIMITE_RISCO_PADRAO): string | null {
  let melhor: { codigo: string; v: number } | null = null;
  for (const o of opcoes) {
    const v = pontuacao(regra, o, limite);
    if (v !== null && (!melhor || v > melhor.v)) melhor = { codigo: o.codigo, v };
  }
  return melhor?.codigo ?? null;
}

export function escolher(opcoes: ResultadoOpcao[], criterio?: Criterio): Escolha {
  const regra = criterio?.regra ?? 'max_p50_com_risco';
  const limite = criterio?.limite_risco ?? LIMITE_RISCO_PADRAO;
  const por_regra = Object.fromEntries(REGRAS.map((r) => [r, escolherPor(r, opcoes, limite)])) as Record<Regra, string | null>;
  return { regra, limite_risco: limite, opcao: por_regra[regra], por_regra };
}

// ---------------------------------------------------------------- sensibilidade (tornado)
/**
 * Cada premissa sorteada vai ao seu P10 e ao seu P90 com as demais no P50, em cálculo determinístico.
 * Premissas discretas (reação da concorrência) ficam no valor do P50 e fora do tornado.
 */
export function sensibilidade(e: EntradaSimulacao): LinhaSensibilidade[] {
  const centro: Valores = {};
  for (const p of e.premissas) centro[p.chave] = valorPremissa(p, 0.5);
  const linhas: LinhaSensibilidade[] = [];
  for (const opcao of e.opcoes) {
    const da: Omit<LinhaSensibilidade, 'ordem'>[] = [];
    for (const p of e.premissas) {
      if (eFixa(p) || eDiscreta(p)) continue;
      const r10 = e.modelo.avaliar({ ...centro, [p.chave]: valorPremissa(p, 0.1) }, opcao).margem;
      const r90 = e.modelo.avaliar({ ...centro, [p.chave]: valorPremissa(p, 0.9) }, opcao).margem;
      da.push({ opcao: opcao.codigo, premissa: p.chave, resultado_no_p10: r10, resultado_no_p90: r90, amplitude: Math.abs(r90 - r10) });
    }
    da.sort((a, b) => b.amplitude - a.amplitude).forEach((l, i) => linhas.push({ ...l, ordem: i + 1 }));
  }
  return linhas;
}

// ---------------------------------------------------------------- grade de opções e varredura (13.2, 13.3)
/** Opções em grade: um parâmetro de `de` a `ate`, de `passo` em `passo`, sobre a opção base. */
export function grade(base: Opcao, parametro: string, de: number, ate: number, passo: number, codigo = (v: number) => `${base.codigo}_${v}`): Opcao[] {
  const r: Opcao[] = [];
  for (let v = de; v <= ate + 1e-9; v += passo) {
    const valor = Math.round(v * 1e9) / 1e9;
    r.push({ ...base, codigo: codigo(valor), parametros: { ...base.parametros, [parametro]: valor } });
  }
  return r;
}

export interface PontoVarredura {
  valor: number;
  opcao: string;
  media: number;
  p50: number;
  prob_positivo: number;
  prob_prejuizo: number;
  opcao_escolhida: string | null;
}

export interface Varredura {
  premissa: string;
  pontos: PontoVarredura[];
  /** Primeiro valor em que a escolha muda, interpolado entre os dois pontos vizinhos. */
  virada: { valor: number; de: string | null; para: string | null; entre: [number, number] } | null;
  frase: string | null;
}

/** Troca um campo da distribuição de uma premissa ("reacao.chance", "procura.p50") ou o valor de uma fixa ("fixo"). */
export function comPremissa(premissas: Premissa[], alvo: string, valor: number): Premissa[] {
  const [chave, campo] = alvo.split('.');
  let achou = false;
  const r = premissas.map((p) => {
    if (p.chave !== chave) return p;
    achou = true;
    if (!campo) return { ...p, distribuicao: { tipo: 'fixa' as const, valor } };
    return { ...p, distribuicao: { ...p.distribuicao, [campo]: valor } as Premissa['distribuicao'] };
  });
  if (!achou) throw new Error(`Premissa desconhecida na varredura: ${chave}.`);
  return r;
}

/**
 * Refaz a simulação com os mesmos sorteios para cada valor da premissa e acha o ponto de virada.
 * A interpolação usa a diferença da pontuação da regra entre a opção escolhida antes e a nova.
 */
export function varrer(e: EntradaSimulacao, alvo: string, valores: number[], rotulo = alvo): Varredura {
  const regra = e.criterio?.regra ?? 'max_p50_com_risco';
  const limite = e.criterio?.limite_risco ?? LIMITE_RISCO_PADRAO;
  const rodadas = valores.map((v) => ({ v, r: simular({ ...e, premissas: comPremissa(e.premissas, alvo, v), sensibilidade: false }) }));
  const pontos: PontoVarredura[] = rodadas.flatMap(({ v, r }) => r.opcoes.map((o) => ({
    valor: v, opcao: o.codigo, media: o.medidas.margem!.media, p50: o.medidas.margem!.p50,
    prob_positivo: o.medidas.margem!.prob_positivo, prob_prejuizo: o.medidas.margem!.prob_prejuizo, opcao_escolhida: r.escolha.opcao,
  })));
  let virada: Varredura['virada'] = null;
  for (let i = 1; i < rodadas.length && !virada; i++) {
    const a = rodadas[i - 1]!, b = rodadas[i]!;
    if (a.r.escolha.opcao === b.r.escolha.opcao) continue;
    const de = a.r.escolha.opcao, para = b.r.escolha.opcao;
    const op = (r: ResultadoSimulacao, c: string | null) => r.opcoes.find((o) => o.codigo === c);
    let t = 0.5;
    const ra = op(a.r, de), rb = op(b.r, de);
    if (regra === 'max_p50_com_risco' && ra && rb && ra.medidas.margem!.prob_prejuizo <= limite && rb.medidas.margem!.prob_prejuizo > limite) {
      // a opção escolhida saiu por passar do limite de risco: interpola a chance de prejuízo dela até o limite
      const la = ra.medidas.margem!.prob_prejuizo, lb = rb.medidas.margem!.prob_prejuizo;
      t = (limite - la) / (lb - la);
    } else {
      const dif = (r: ResultadoSimulacao) => {
        const o1 = op(r, de), o2 = op(r, para);
        const s1 = o1 ? pontuacao(regra, o1, limite) : null, s2 = o2 ? pontuacao(regra, o2, limite) : null;
        return s1 === null || s2 === null ? null : s1 - s2;
      };
      const d0 = dif(a.r), d1 = dif(b.r);
      if (d0 !== null && d1 !== null && d0 !== d1) t = Math.min(1, Math.max(0, d0 / (d0 - d1)));
    }
    virada = { valor: a.v + (b.v - a.v) * t, de, para, entre: [a.v, b.v] };
  }
  const desc = (c: string | null) => e.opcoes.find((o) => o.codigo === c)?.descricao ?? c ?? 'nenhuma opção';
  return {
    premissa: alvo, pontos, virada,
    frase: virada ? `a recomendação muda se ${rotulo} passar de ${formatarValor(virada.valor)} (de ${desc(virada.de)} para ${desc(virada.para)})` : null,
  };
}

const formatarValor = (v: number) => (Math.abs(v) <= 1 ? `${Math.round(v * 100)}%` : new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 2 }).format(v));
