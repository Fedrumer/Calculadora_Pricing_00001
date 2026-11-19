// Porte fiel de motor.simular (migração 20261117000300_motor.sql), sobre a base de motor.base_simulacao.
//   ganho = [ (P + dP − C) × Q × (1 + ε × dP ÷ P) − (P − C) × Q ] × captura
// As alavancas rodam na ordem do catálogo, cada uma sobre a base já ajustada pela anterior; o ajuste só entra
// nos pares em que o ganho é positivo; o resultado do período é levado a 12 meses.
import { quantilAmostral } from '../estatistica.ts';
import type { Modelo, Opcao, Valores } from '../tipos.ts';
import { type FormaElasticidade, fatorVolume } from './comum.ts';

/** O que motor.base_simulacao devolve. */
export interface BaseSimulacao {
  fator_anual: number;
  /** [produto, conta, quantidade, preço faturado médio, custo unitário com custo de servir e descontos fora da fatura, quartil da conta] */
  pares: [string, string, number, number, number, number][];
  /** Preço médio de cada conta, por produto vendido a 5 contas ou mais (inclui vendas sem custo), em ordem. */
  precos: Record<string, number[]>;
  alavancas: { codigo: string; ordem: number }[];
}

export const PADROES_DIAGNOSTICO: Record<string, number> = {
  'contencao_descontos.percentil_piso': 25, 'contencao_descontos.fechamento': 0.5, 'contencao_descontos.elasticidade': -0.7, 'contencao_descontos.captura': 0.6,
  'reajuste_seletivo.margem_alvo_pct': 10, 'reajuste_seletivo.aumento_pct': 4, 'reajuste_seletivo.elasticidade': -1, 'reajuste_seletivo.captura': 0.6,
};

export function modeloDiagnostico(base: BaseSimulacao, forma: FormaElasticidade = 'linear'): Modelo {
  const n = base.pares.length;
  const produtos = [...new Set(base.pares.map((p) => p[0]))];
  const idxProduto = new Map(produtos.map((p, i) => [p, i]));
  const prod = Int32Array.from(base.pares, (p) => idxProduto.get(p[0])!);
  const q = Float64Array.from(base.pares, (p) => p[2]);
  const p = Float64Array.from(base.pares, (x) => x[3]);
  const c = Float64Array.from(base.pares, (x) => x[4]);
  const quartil = Int32Array.from(base.pares, (x) => x[5]);
  const precos = produtos.map((pr) => base.precos[pr] ?? null);
  const pisos = new Map<number, Float64Array>();
  const piso = (pp: number) => {
    let r = pisos.get(pp);
    if (!r) {
      r = Float64Array.from(precos, (lista) => (lista && lista.length >= 5 ? quantilAmostral(lista, pp) : NaN));
      pisos.set(pp, r);
    }
    return r;
  };
  const ordem = [...base.alavancas].sort((a, b) => a.ordem - b.ordem).map((a) => a.codigo);
  const somaA = new Float64Array(produtos.length), somaB = new Float64Array(produtos.length);
  const p1 = new Float64Array(n), q1 = new Float64Array(n);

  const v = (valores: Valores, opcao: Opcao, chave: string) => {
    const x = (opcao.parametros?.[chave] as number | undefined) ?? valores[chave] ?? PADROES_DIAGNOSTICO[chave];
    return Number(x);
  };

  return {
    codigo: 'diagnostico',
    alavancas: ordem,
    avaliar(valores, opcao) {
      const pp = v(valores, opcao, 'contencao_descontos.percentil_piso') / 100;
      const fech = v(valores, opcao, 'contencao_descontos.fechamento');
      const e1 = Math.min(v(valores, opcao, 'contencao_descontos.elasticidade'), 0);
      const cap1 = v(valores, opcao, 'contencao_descontos.captura');
      const alvo = v(valores, opcao, 'reajuste_seletivo.margem_alvo_pct') / 100;
      const aum = v(valores, opcao, 'reajuste_seletivo.aumento_pct') / 100;
      const e2 = Math.min(v(valores, opcao, 'reajuste_seletivo.elasticidade'), 0);
      const cap2 = v(valores, opcao, 'reajuste_seletivo.captura');
      const pisoP = piso(pp);
      let ganho1 = 0, ganho2 = 0, dRec1 = 0, dRec2 = 0, dVol1 = 0, dVol2 = 0;
      somaA.fill(0); somaB.fill(0);
      // contenção de descontos: puxa ao piso da banda quem vende abaixo dele (exceto o maior quartil de contas)
      for (let i = 0; i < n; i++) {
        const pi = p[i]!, qi = q[i]!, ci = c[i]!, ps = pisoP[prod[i]!]!;
        const dp = pi < ps && quartil[i] !== 1 ? (ps - pi) * fech : 0;
        let g = 0;
        if (dp > 0) {
          const bruto = (pi + dp - ci) * qi * fatorVolume(forma, e1, dp / pi) - (pi - ci) * qi;
          if (bruto > 0) g = bruto * cap1;
        }
        if (g > 0) {
          ganho1 += g;
          p1[i] = pi + dp * cap1;
          q1[i] = qi * fatorVolume(forma, e1, (dp / pi) * cap1);
        } else { p1[i] = pi; q1[i] = qi; }
        dRec1 += p1[i]! * q1[i]! - pi * qi; dVol1 += q1[i]! - qi;
        somaA[prod[i]!]! += (p1[i]! - ci) * q1[i]!;
        somaB[prod[i]!]! += p1[i]! * q1[i]!;
      }
      // reajuste seletivo: nos produtos com margem abaixo do alvo, depois da contenção
      for (let i = 0; i < n; i++) {
        const k = prod[i]!;
        if (!(somaA[k]! < alvo * somaB[k]!)) continue;
        const f = fatorVolume(forma, e2, aum);
        const b2 = ((p1[i]! * (1 + aum) - c[i]!) * q1[i]! * f - (p1[i]! - c[i]!) * q1[i]!) * cap2;
        if (b2 > 0) {
          ganho2 += b2;
          dRec2 += (p1[i]! * (1 + aum) * q1[i]! * f - p1[i]! * q1[i]!) * cap2;
          dVol2 += (q1[i]! * f - q1[i]!) * cap2;
        }
      }
      const fa = base.fator_anual;
      const contribuicoes: Record<string, number> = { contencao_descontos: ganho1 * fa, reajuste_seletivo: ganho2 * fa };
      return {
        margem: (ganho1 + ganho2) * fa,
        faturamento: (dRec1 + dRec2) * fa,
        volume: (dVol1 + dVol2) * fa,
        contribuicoes,
      };
    },
  };
}
