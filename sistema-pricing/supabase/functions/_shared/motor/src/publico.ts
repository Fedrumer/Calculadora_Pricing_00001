import type { Resultado, ResultadoPublico } from './tipos.ts';

/**
 * Projeção para perfis externos (usuário de canal, integração por chave de API):
 * preço final e a própria comissão, sem custo, imposto, margem, câmbio nem
 * comissão do vendedor. O corte é
 * feito aqui, no servidor, e não escondendo campos na tela.
 */
export function resultadoPublico(resultado: Resultado): ResultadoPublico {
  const {
    impostosValor: _impostos,
    custosValor: _custos,
    receitaLiquida: _receita,
    margemValor: _margemValor,
    margemPct: _margemPct,
    exposicaoCambial: _exposicao,
    comissaoVendedor: _comissaoVendedor,
    ...publico
  } = resultado;
  return {
    ...publico,
    detalhamento: resultado.detalhamento.filter((l) => !l.interno),
    veredito: {
      ...resultado.veredito,
      motivos: resultado.veredito.motivos.map((m) =>
        m.interno
          ? { codigo: 'FORA_DA_POLITICA' as const, mensagem: 'Condição comercial fora da política vigente.', interno: false }
          : m,
      ),
    },
  };
}
