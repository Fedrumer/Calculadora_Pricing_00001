// Tipo servico_adicional (Nota nº 01, entrega em 24 horas): embutir o serviço num reajuste ou cobrar taxa opcional.
// Resultado: variação da margem de contribuição mensal da linha contra a situação atual.
//   Embutir: q = q0 × (1 + r)^ε × (1 + pedidos a mais); se o concorrente reage, ele acompanha o reajuste e o
//            preço relativo não muda (sem efeito da elasticidade). Margem = q × (ticket × (1 + r) − cv − custo da entrega) − fixo.
//   Taxa:    q = q0 × (1 + pedidos a mais); se o concorrente copia, os pedidos a mais não vêm; se contra-ataca com
//            entrega grátis, os pedidos caem e a adesão cai. Margem = q × (ticket − cv) + q × adesão × (taxa − custo da entrega) − fixo.
// Acima da capacidade, cobra o custo da unidade extra (hora extra) ou deixa de vender.
import type { Capacidade, Modelo } from '../tipos.ts';
import { type FormaElasticidade, aplicarCapacidade, fatorVolume, num, txt } from './comum.ts';

export interface DadosServicoAdicional {
  pedidos_mes: number;
  ticket: number;
  custo_variavel: number;
  custo_fixo: number;
  capacidade?: Capacidade | null;
  forma_elasticidade?: FormaElasticidade;
}

export function modeloServicoAdicional(d: DadosServicoAdicional): Modelo {
  const base = d.pedidos_mes * (d.ticket - d.custo_variavel);
  const fatBase = d.pedidos_mes * d.ticket;
  const forma = d.forma_elasticidade ?? 'constante';
  return {
    codigo: 'servico_adicional',
    avaliar(v, o) {
      if (txt(v, o, 'forma', 'embutir') === 'manter') return { margem: 0, faturamento: 0, volume: 0 };
      const custoEntrega = num(v, o, 'custo_entrega');
      const reacao = txt(v, o, 'reacao', 'ignorar');
      let q: number, unit: number, fatUnit: number;
      if (txt(v, o, 'forma', 'embutir') === 'embutir') {
        const r = num(v, o, 'reajuste');
        const e = num(v, o, 'elasticidade');
        const u = num(v, o, 'pedidos_a_mais_embutido');
        q = d.pedidos_mes * (reacao !== 'ignorar' ? 1 : fatorVolume(forma, e, r)) * (1 + u);
        unit = d.ticket * (1 + r) - d.custo_variavel - custoEntrega;
        fatUnit = d.ticket * (1 + r);
      } else {
        const taxa = num(v, o, 'taxa');
        let a = num(v, o, 'adesao');
        let u = num(v, o, 'pedidos_a_mais_taxa');
        if (reacao === 'copiar') u = 0;
        else if (reacao === 'contra_atacar') { u = num(v, o, 'queda_pedidos_contra_ataque'); a *= 1 - num(v, o, 'reducao_adesao_contra_ataque', 0.3); }
        q = d.pedidos_mes * (1 + u);
        unit = d.ticket - d.custo_variavel + a * (taxa - custoEntrega);
        fatUnit = d.ticket + a * taxa;
      }
      const cap = aplicarCapacidade(d.capacidade, q);
      q = cap.volume;
      const margem = q * unit - d.custo_fixo - cap.custoExtra;
      const fat = q * fatUnit;
      return { margem: margem - base, faturamento: fat - fatBase, volume: q - d.pedidos_mes, faltouCapacidade: cap.faltou, volumePerdido: cap.perdido };
    },
  };
}
