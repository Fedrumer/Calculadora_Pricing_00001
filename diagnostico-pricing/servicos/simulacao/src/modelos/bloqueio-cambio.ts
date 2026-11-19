// Tipo bloqueio_cambio (Nota nº 02): tamanho do bloqueio e travar ou não o câmbio, com os mesmos sorteios.
//   vendidos = mínimo entre procura e lugares; a sobra além da parte devolvida sem custo paga multa
//   (fração do custo do lugar); resultado = vendidos × líquido por passageiro − custo em moeda × câmbio ×
//   (vendidos + multa × sobra) − custo fixo do pacote.
//   Travar: câmbio travado informado (cotação do banco). Em aberto: câmbio sorteado no pagamento.
//   Reação da concorrência: com a reação sorteada, a procura perde a parcela sorteada em perda_reacao.
import type { Modelo } from '../tipos.ts';
import { num, txt } from './comum.ts';

export interface DadosBloqueio {
  preco: number;
  comissao_pct: number;
  impostos_pct: number;
  custo_operacional: number;
  custo_moeda: number;
  liberacao_pct: number;
  multa_pct: number;
  custo_fixo: number;
}

export const liquidoPassageiro = (d: DadosBloqueio) => d.preco * (1 - d.comissao_pct - d.impostos_pct) - d.custo_operacional;
/** Câmbio que zera a margem por passageiro. */
export const cambioEquilibrio = (d: DadosBloqueio) => liquidoPassageiro(d) / d.custo_moeda;

export function modeloBloqueioCambio(d: DadosBloqueio): Modelo {
  const liq = liquidoPassageiro(d);
  return {
    codigo: 'bloqueio_cambio',
    avaliar(v, o) {
      const lugares = num(v, o, 'lugares');
      const fx = txt(v, o, 'cambio', 'travado') === 'travado' ? num(v, o, 'cambio_travado') : num(v, o, 'cambio_pagamento');
      let procura = Math.round(num(v, o, 'procura'));
      if (txt(v, o, 'reacao', 'ignorar') !== 'ignorar') procura = Math.round(procura * (1 - num(v, o, 'perda_reacao')));
      const vend = Math.min(procura, lugares);
      const livre = Math.floor(lugares * d.liberacao_pct);
      const sobra = Math.max(0, lugares - vend - livre);
      const resultado = vend * liq - d.custo_moeda * fx * (vend + d.multa_pct * sobra) - d.custo_fixo;
      return { margem: resultado, faturamento: vend * d.preco, volume: vend, faltouCapacidade: procura > lugares, volumePerdido: Math.max(0, procura - lugares) };
    },
  };
}

/** Passageiros a vender para empatar com um bloqueio e um câmbio. */
export function equilibrioBloqueio(d: DadosBloqueio, lugares: number, fx: number): number | null {
  const liq = liquidoPassageiro(d), livre = Math.floor(lugares * d.liberacao_pct), c = d.custo_moeda * fx;
  for (let v = 0; v <= lugares; v++) if (v * (liq - c) - d.multa_pct * c * Math.max(0, lugares - livre - v) - d.custo_fixo >= 0) return v;
  return null;
}
