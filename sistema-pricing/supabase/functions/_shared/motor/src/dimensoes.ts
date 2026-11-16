import { ErroMotor } from './erros.ts';
import type { DefinicaoDimensao, Produto, ValorDimensao } from './tipos.ts';

export interface DimensoesResolvidas {
  /** Código da categoria ou da faixa em que cada dimensão caiu. */
  codigos: Record<string, string>;
  /** Valor numérico bruto das dimensões de faixa (usado como multiplicador). */
  numeros: Record<string, number>;
}

/** Enquadra os valores informados no pedido nas categorias e faixas cadastradas. */
export function resolverDimensoes(
  produto: Produto,
  definicoes: DefinicaoDimensao[],
  informadas: Record<string, ValorDimensao>,
): DimensoesResolvidas {
  const codigos: Record<string, string> = {};
  const numeros: Record<string, number> = {};
  const exigidas = new Set([...produto.dimensoes, ...produto.multiplicadores]);

  for (const codigo of exigidas) {
    const definicao = definicoes.find((d) => d.codigo === codigo);
    if (!definicao) {
      throw new ErroMotor('DIMENSAO_INVALIDA', `Dimensão "${codigo}" não está cadastrada.`, { dimensao: codigo });
    }
    const bruto = informadas[codigo];
    if (bruto === undefined || bruto === null || bruto === '') {
      throw new ErroMotor('DIMENSAO_AUSENTE', `Informe "${definicao.nome}".`, { dimensao: codigo });
    }

    if (definicao.tipo === 'categoria') {
      const valor = String(bruto);
      if (!definicao.valores?.some((v) => v.codigo === valor)) {
        throw new ErroMotor('DIMENSAO_INVALIDA', `"${valor}" não é um valor válido para "${definicao.nome}".`, {
          dimensao: codigo,
          valor,
        });
      }
      codigos[codigo] = valor;
      continue;
    }

    const numero = typeof bruto === 'number' ? bruto : Number(String(bruto).replace(',', '.'));
    if (!Number.isFinite(numero) || numero < 0) {
      throw new ErroMotor('DIMENSAO_INVALIDA', `"${definicao.nome}" precisa ser um número válido.`, {
        dimensao: codigo,
        valor: bruto,
      });
    }
    const faixa = definicao.faixas?.find((f) => numero >= f.min && (f.max === null || numero <= f.max));
    if (!faixa) {
      throw new ErroMotor('DIMENSAO_INVALIDA', `"${definicao.nome}" = ${numero} está fora das faixas cadastradas.`, {
        dimensao: codigo,
        valor: numero,
      });
    }
    codigos[codigo] = faixa.codigo;
    numeros[codigo] = numero;
  }

  return { codigos, numeros };
}

/**
 * Uma combinação de tabela casa com o pedido quando toda chave declarada bate
 * (ou é "*"). Devolve a especificidade (nº de chaves exatas) ou -1 se não casa.
 */
export function especificidade(combinacao: Record<string, string>, codigos: Record<string, string>): number {
  let pontos = 0;
  for (const [chave, valor] of Object.entries(combinacao)) {
    if (valor === '*') continue;
    if (codigos[chave] !== valor) return -1;
    pontos += 1;
  }
  return pontos;
}
