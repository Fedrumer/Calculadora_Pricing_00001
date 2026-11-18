import { calcular } from './calcular.ts';
import { ErroMotor } from './erros.ts';
import type { ConjuntoRegras, OpcoesCalculo, PedidoCotacao, Veredito } from './tipos.ts';

/**
 * Caso de referência: uma cotação real calculada à mão. Roda como teste
 * automático a cada alteração de motor, tabela ou política.
 */
export interface CasoReferencia {
  nome: string;
  pedido: PedidoCotacao;
  esperado: {
    precoFinal?: number;
    precoBase?: number;
    comissaoValor?: number;
    margemValor?: number;
    margemPct?: number;
    veredito?: Veredito['status'];
    nivelAlcada?: number | null;
    /** Comissão do vendedor (valor). */
    comissaoVendedor?: number;
    /** Câmbio que zera a margem e folga, da primeira moeda estrangeira da cotação. */
    cambioEquilibrio?: number;
    folgaCambialPct?: number;
    erro?: string;
  };
}

export interface ResultadoCaso {
  nome: string;
  passou: boolean;
  divergencias: { campo: string; esperado: unknown; obtido: unknown }[];
}

export interface RelatorioCasos {
  total: number;
  aprovados: number;
  reprovados: number;
  casos: ResultadoCaso[];
}

export function executarCasos(casos: CasoReferencia[], regras: ConjuntoRegras, opcoes: OpcoesCalculo = {}): RelatorioCasos {
  const resultados = casos.map((caso): ResultadoCaso => {
    const divergencias: ResultadoCaso['divergencias'] = [];
    const comparar = (campo: string, esperado: unknown, obtido: unknown) => {
      if (esperado !== undefined && esperado !== obtido) divergencias.push({ campo, esperado, obtido });
    };
    try {
      const r = calcular(caso.pedido, regras, opcoes);
      if (caso.esperado.erro !== undefined) comparar('erro', caso.esperado.erro, null);
      comparar('precoFinal', caso.esperado.precoFinal, r.precoFinal);
      comparar('precoBase', caso.esperado.precoBase, r.precoBase);
      comparar('comissaoValor', caso.esperado.comissaoValor, r.comissaoValor);
      comparar('margemValor', caso.esperado.margemValor, r.margemValor);
      comparar('margemPct', caso.esperado.margemPct, r.margemPct);
      comparar('veredito', caso.esperado.veredito, r.veredito.status);
      comparar('nivelAlcada', caso.esperado.nivelAlcada, r.veredito.nivelAlcada);
      comparar('comissaoVendedor', caso.esperado.comissaoVendedor, r.comissaoVendedor?.valor);
      comparar('cambioEquilibrio', caso.esperado.cambioEquilibrio, r.exposicaoCambial[0]?.cambioEquilibrio);
      comparar('folgaCambialPct', caso.esperado.folgaCambialPct, r.exposicaoCambial[0]?.folgaPct);
    } catch (e) {
      if (!(e instanceof ErroMotor)) throw e;
      comparar('erro', caso.esperado.erro ?? null, e.codigo);
    }
    return { nome: caso.nome, passou: divergencias.length === 0, divergencias };
  });
  const aprovados = resultados.filter((r) => r.passou).length;
  return { total: resultados.length, aprovados, reprovados: resultados.length - aprovados, casos: resultados };
}
