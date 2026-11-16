// Ponto de extensão: funções de cálculo que não cabem nas etapas padrão.
//
// Cada função é pura (recebe o contexto, devolve preço e/ou dedução) e é
// chamada por uma etapa de política do tipo "extensao", pelo nome registrado
// aqui. Esta pasta pertence à instalação do cliente: a atualização do núcleo
// não a sobrescreve.
import type { FuncaoExtensao } from '../motor/src/index.ts';

export const extensoes: Record<string, FuncaoExtensao> = {
  /**
   * Exemplo: taxa fixa somada ao preço.
   * Etapa: { "id": "taxa", "tipo": "extensao", "funcao": "taxaFixa", "parametros": { "valor": 10, "descricao": "Taxa de emissão" } }
   */
  taxaFixa: (ctx) => ({
    preco: ctx.preco + Number(ctx.parametros.valor ?? 0),
    descricao: String(ctx.parametros.descricao ?? 'Taxa fixa'),
    interno: false,
  }),
};
