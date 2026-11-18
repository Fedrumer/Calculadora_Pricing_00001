import type { MotivoVeredito, Politica, Veredito } from './tipos.ts';

export interface EntradaPolitica {
  descontoPct: number;
  margemPct: number;
  comissaoPct: number;
  comissaoTabelaPct: number;
  comissaoForaTabela: boolean;
  /** Menor folga cambial entre as moedas da cotação (%); nula sem custo em moeda estrangeira. */
  folgaCambialPct?: number | null;
}

// Formatação fixa (sem depender da localidade do ambiente de execução).
const pct = (v: number) => `${String(Math.round(v * 100) / 100).replace('.', ',')}%`;

/**
 * Veredito de política: dentro da regra, exige aprovação (com o nível de alçada)
 * ou bloqueado. A margem mínima é um bloqueio que nenhuma alçada libera.
 */
export function avaliarPolitica(politica: Politica, e: EntradaPolitica): Veredito {
  const { limites } = politica;
  const motivos: MotivoVeredito[] = [];

  if (e.margemPct < limites.margemMinimaPct) {
    motivos.push({
      codigo: 'MARGEM_ABAIXO_DO_MINIMO',
      mensagem: `Margem de ${pct(e.margemPct)} abaixo do mínimo de ${pct(limites.margemMinimaPct)}.`,
      limite: limites.margemMinimaPct,
      valor: e.margemPct,
      interno: true,
    });
  }
  if (e.descontoPct > limites.descontoMaximoPct) {
    motivos.push({
      codigo: 'DESCONTO_ACIMA_DO_MAXIMO',
      mensagem: `Desconto de ${pct(e.descontoPct)} acima do máximo de ${pct(limites.descontoMaximoPct)}.`,
      limite: limites.descontoMaximoPct,
      valor: e.descontoPct,
      interno: false,
    });
  }
  if (motivos.length > 0) return { status: 'bloqueado', cor: 'vermelho', nivelAlcada: null, nomeAlcada: null, motivos };

  if (e.descontoPct > limites.descontoLivrePct) {
    motivos.push({
      codigo: 'DESCONTO_ACIMA_DO_LIVRE',
      mensagem: `Desconto de ${pct(e.descontoPct)} acima do limite de emissão direta (${pct(limites.descontoLivrePct)}).`,
      limite: limites.descontoLivrePct,
      valor: e.descontoPct,
      interno: false,
    });
  }
  if (e.margemPct < limites.margemMetaPct) {
    motivos.push({
      codigo: 'MARGEM_ABAIXO_DA_META',
      mensagem: `Margem de ${pct(e.margemPct)} abaixo da meta de ${pct(limites.margemMetaPct)}.`,
      limite: limites.margemMetaPct,
      valor: e.margemPct,
      interno: true,
    });
  }
  const folgaMinima = limites.folgaCambialMinimaPct;
  if (folgaMinima !== undefined && folgaMinima !== null && e.folgaCambialPct !== undefined && e.folgaCambialPct !== null && e.folgaCambialPct < folgaMinima) {
    motivos.push({
      codigo: 'FOLGA_CAMBIAL_ABAIXO_DO_MINIMO',
      mensagem: `Folga cambial de ${pct(e.folgaCambialPct)} abaixo do mínimo de ${pct(folgaMinima)}.`,
      limite: folgaMinima,
      valor: e.folgaCambialPct,
      interno: true,
    });
  }
  if (e.comissaoForaTabela) {
    motivos.push({
      codigo: 'COMISSAO_FORA_DA_TABELA',
      mensagem: `Comissão de ${pct(e.comissaoPct)} acima da tabela do canal (${pct(e.comissaoTabelaPct)}).`,
      limite: e.comissaoTabelaPct,
      valor: e.comissaoPct,
      interno: false,
    });
  }
  if (motivos.length === 0) return { status: 'dentro', cor: 'verde', nivelAlcada: null, nomeAlcada: null, motivos };

  const alcada = [...politica.alcadas]
    .sort((a, b) => a.nivel - b.nivel)
    .find(
      (a) =>
        e.descontoPct <= a.descontoAtePct &&
        e.margemPct >= (a.margemMinimaPct ?? limites.margemMinimaPct) &&
        (!e.comissaoForaTabela || a.permiteComissaoForaTabela === true),
    );

  if (!alcada) {
    motivos.push({
      codigo: 'SEM_ALCADA_SUFICIENTE',
      mensagem: 'Nenhuma alçada cadastrada pode liberar esta condição.',
      interno: false,
    });
    return { status: 'bloqueado', cor: 'vermelho', nivelAlcada: null, nomeAlcada: null, motivos };
  }
  return { status: 'exige_aprovacao', cor: 'amarelo', nivelAlcada: alcada.nivel, nomeAlcada: alcada.nome, motivos };
}
