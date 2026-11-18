import type { CambioReferencia, ConjuntoRegras, Resultado } from '@pricing/motor';

/**
 * Câmbios que entraram no cálculo, como ficam gravados na versão da cotação:
 * a taxa usada, de quando ela é (a referência vigente na data do pedido) e o
 * câmbio que zera a margem. É daqui que o painel lê a exposição cambial.
 */
export function cambiosUsados(regras: ConjuntoRegras, data: string, x: Resultado) {
  return x.exposicaoCambial.map((e) => {
    const ref = (regras.cambios ?? [])
      .filter((k) => k.moeda === e.moeda && k.vigenteDe <= data)
      .reduce<CambioReferencia | undefined>((a, b) => (!a || b.vigenteDe > a.vigenteDe ? b : a), undefined);
    return { moeda: e.moeda, taxa: e.taxa, vigenteDe: ref?.vigenteDe ?? null, origem: ref?.origem ?? null, cambioEquilibrio: e.cambioEquilibrio, folgaPct: e.folgaPct };
  });
}
