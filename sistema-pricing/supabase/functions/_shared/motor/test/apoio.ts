import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import type { CasoReferencia, ConjuntoRegras } from '../src/index.ts';

/** Monta o ConjuntoRegras do motor a partir de um arquivo de configuração de cliente. */
export function regrasDoCliente(arquivo: string): { regras: ConjuntoRegras; casos: CasoReferencia[] } {
  const caminho = fileURLToPath(new URL(`../../../../../config/clientes/${arquivo}`, import.meta.url));
  const c = JSON.parse(readFileSync(caminho, 'utf8'));
  const { custos, vigenciaInicio: _v, ...politica } = c.politica;
  return {
    regras: {
      dimensoes: c.dimensoes,
      produtos: c.produtos,
      tabela: { id: 'tabela-teste', versao: 1, moeda: c.tabela.moeda, itens: c.tabela.itens, fatores: c.tabela.fatores },
      politica: { id: 'politica-teste', versao: 1, ...politica },
      custos,
      campanhas: c.campanhas,
      ...(c.cambios ? { cambios: c.cambios.map((x: Record<string, unknown>) => ({ ...x, origem: 'politica' })) } : {}),
    },
    casos: c.casosReferencia,
  };
}
