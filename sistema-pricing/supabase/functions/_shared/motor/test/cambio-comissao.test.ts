import { describe, expect, it } from 'vitest';
import { type ConjuntoRegras, ErroMotor, type PedidoCotacao, calcular, executarCasos, resultadoPublico, validarRegras } from '../src/index.ts';
import { regrasDoCliente } from './apoio.ts';

// Pacote Lisboa de julho da Nota de Decisão nº 02, montado à parte da configuração
// de demonstração para o teste não depender dela.
function turismo(): ConjuntoRegras {
  return {
    dimensoes: [
      { codigo: 'temporada', nome: 'Temporada', tipo: 'categoria', valores: [{ codigo: 'alta', nome: 'Alta' }, { codigo: 'baixa', nome: 'Baixa' }] },
      { codigo: 'acomodacao', nome: 'Acomodação', tipo: 'categoria', valores: [{ codigo: 'duplo', nome: 'Duplo' }, { codigo: 'individual', nome: 'Individual' }] },
      { codigo: 'passageiros', nome: 'Passageiros', tipo: 'faixa', faixas: [{ codigo: '1-9', min: 1, max: 9 }, { codigo: '10+', min: 10, max: null }] },
    ],
    produtos: [{ codigo: 'LISBOA', nome: 'Pacote Lisboa', ativo: true, dimensoes: ['temporada', 'acomodacao'], multiplicadores: ['passageiros'], componentes: [] }],
    tabela: {
      id: 't', versao: 1, moeda: 'BRL', fatores: [],
      itens: [
        { produto: 'LISBOA', componente: null, dimensoes: { temporada: 'alta', acomodacao: 'duplo' }, precoBase: 9900 },
        { produto: 'LISBOA', componente: null, dimensoes: { temporada: 'alta', acomodacao: 'individual' }, precoBase: 12900 },
      ],
    },
    politica: {
      id: 'p', versao: 1,
      etapas: [
        { id: 'base', tipo: 'preco_base' },
        { id: 'desconto', tipo: 'desconto' },
        { id: 'arredondamento', tipo: 'arredondamento' },
        { id: 'comissao', tipo: 'comissao', base: { de: 'preco' }, modo: 'deduz_da_margem' },
        { id: 'impostos', tipo: 'impostos', base: { de: 'preco' } },
        { id: 'custos', tipo: 'custos', base: { de: 'preco' } },
      ],
      arredondamento: { casas: 2, modo: 'meio_para_cima' },
      limites: { descontoLivrePct: 2, descontoMaximoPct: 8, margemMinimaPct: 1.5, margemMetaPct: 5, folgaCambialMinimaPct: 5 },
      alcadas: [
        { nivel: 1, nome: 'Gerente comercial', descontoAtePct: 5, margemMinimaPct: 1.5 },
        { nivel: 2, nome: 'Diretoria', descontoAtePct: 8 },
      ],
      comissoes: [{ canal: 'agencia-sol', pct: 12 }],
      validadeDias: 7,
      prazoAprovacaoHoras: 8,
      comissaoVendedor: { base: 'margem', pct: 10, deduzDaMargem: false },
    },
    custos: [
      { codigo: 'impostos', nome: 'Impostos', categoria: 'imposto', tipo: 'percentual', valor: 6 },
      { codigo: 'traslado', nome: 'Traslado', categoria: 'custo_variavel', tipo: 'valor_por_unidade', valor: 89.9 },
      { codigo: 'seguro', nome: 'Seguro', categoria: 'custo_variavel', tipo: 'valor_por_unidade', valor: 58.55 },
      { codigo: 'guia', nome: 'Guia', categoria: 'custo_variavel', tipo: 'valor_por_unidade', valor: 75 },
      { codigo: 'aereo', nome: 'Aéreo', categoria: 'custo_variavel', tipo: 'valor_por_unidade', valor: 489.53, moeda: 'EUR', produto: 'LISBOA' },
      { codigo: 'hotel-duplo', nome: 'Hotel (duplo)', categoria: 'custo_variavel', tipo: 'valor_por_unidade', valor: 708.43, moeda: 'EUR', produto: 'LISBOA', condicoes: { acomodacao: ['duplo'] } },
      { codigo: 'hotel-individual', nome: 'Hotel (individual)', categoria: 'custo_variavel', tipo: 'valor_por_unidade', valor: 1350, moeda: 'EUR', produto: 'LISBOA', condicoes: { acomodacao: ['individual'] } },
    ],
    campanhas: [],
    cambios: [
      { moeda: 'EUR', taxa: 5.8, vigenteDe: '2025-01-01', origem: 'politica' },
      { moeda: 'EUR', taxa: 6.1, vigenteDe: '2026-01-01', origem: 'politica' },
    ],
  };
}

const lisboa = (extra: Partial<PedidoCotacao> = {}): PedidoCotacao => ({
  produto: 'LISBOA',
  dimensoes: { temporada: 'alta', acomodacao: 'duplo', passageiros: 1 },
  canal: 'agencia-sol',
  data: '2026-07-10',
  ...extra,
});

describe('calibração da Nota nº 02 (pacote Lisboa de julho, 1 passageiro em duplo)', () => {
  it('reproduz preço, deduções, margem e câmbio de equilíbrio centavo a centavo', () => {
    const r = calcular(lisboa(), turismo());
    expect(r.precoFinal).toBe(9900);
    expect(r.comissaoValor).toBe(1188);
    expect(r.impostosValor).toBe(594);
    expect(r.comissaoValor + r.impostosValor).toBe(1782);
    expect(r.custosValor).toBe(7531); // 223,45 em reais + 7.307,55 do euro
    expect(r.margemValor).toBe(587);
    expect(r.margemPct).toBe(5.93);
    expect(r.exposicaoCambial).toEqual([
      { moeda: 'EUR', valorMoeda: 1197.96, taxa: 6.1, valorConvertido: 7307.55, cambioEquilibrio: 6.59, folgaPct: 8.03 },
    ]);
    expect(r.comissaoVendedor).toEqual({ base: 'margem', pct: 10, valor: 58.7, deduzidaDaMargem: false });
    expect(r.veredito).toMatchObject({ status: 'dentro', cor: 'verde' });
  });

  it('com 5% de desconto: margem de R$ 181,10, comissão de R$ 18,11 e semáforo amarelo', () => {
    const r = calcular(lisboa({ descontoPct: 5 }), turismo());
    expect(r.precoFinal).toBe(9405);
    expect(r.margemValor).toBe(181.1);
    expect(r.comissaoVendedor?.valor).toBe(18.11);
    expect(r.veredito).toMatchObject({ status: 'exige_aprovacao', cor: 'amarelo', nivelAlcada: 1 });
    expect(r.veredito.motivos.map((m) => m.codigo)).toEqual(['DESCONTO_ACIMA_DO_LIVRE', 'MARGEM_ABAIXO_DA_META', 'FOLGA_CAMBIAL_ABAIXO_DO_MINIMO']);
    // manter a margem total exige 224% a mais de passageiros, a meta reversa da Nota
    expect(Math.round((587 / 181.1 - 1) * 100)).toBe(224);
  });

  it('com 8% de desconto a margem fica negativa e a cotação é bloqueada', () => {
    const r = calcular(lisboa({ descontoPct: 8 }), turismo());
    expect(r.margemValor).toBeLessThan(0);
    expect(r.veredito).toMatchObject({ status: 'bloqueado', cor: 'vermelho' });
    expect(r.comissaoVendedor?.valor).toBe(0);
  });
});

describe('câmbio de referência', () => {
  it('usa a taxa de início mais recente até a data do pedido', () => {
    const antes = calcular(lisboa({ data: '2025-12-31' }), turismo());
    expect(antes.exposicaoCambial[0]?.taxa).toBe(5.8);
    expect(calcular(lisboa(), turismo()).exposicaoCambial[0]?.taxa).toBe(6.1);
  });

  it('o preço não muda com o câmbio; muda a margem', () => {
    const regras = turismo();
    regras.cambios = [{ moeda: 'EUR', taxa: 6.3, vigenteDe: '2026-01-01', origem: 'politica' }];
    const r = calcular(lisboa(), regras);
    expect(r.precoFinal).toBe(9900);
    expect(r.margemValor).toBeCloseTo(587 - 1197.96 * 0.2, 1);
    expect(r.exposicaoCambial[0]?.folgaPct).toBeLessThan(5);
    expect(r.veredito.status).toBe('exige_aprovacao');
  });

  it('custo em moeda sem câmbio vigente devolve CAMBIO_AUSENTE', () => {
    const regras = turismo();
    regras.cambios = [{ moeda: 'EUR', taxa: 6.1, vigenteDe: '2026-08-01', origem: 'politica' }];
    expect(() => calcular(lisboa(), regras)).toThrow(ErroMotor);
    try {
      calcular(lisboa(), { ...regras, cambios: undefined });
    } catch (e) {
      expect((e as ErroMotor).codigo).toBe('CAMBIO_AUSENTE');
      expect((e as ErroMotor).detalhes).toMatchObject({ moeda: 'EUR' });
    }
  });

  it('a linha do custo mostra valor na moeda, taxa e valor convertido, como linha interna', () => {
    const r = calcular(lisboa(), turismo());
    const aereo = r.detalhamento.find((l) => l.descricao === 'Custo: Aéreo')!;
    expect(aereo).toMatchObject({ interno: true, moeda: 'EUR', valorMoeda: 489.53, taxa: 6.1, valor: -2986.13, categoria: 'custo_variavel' });
  });

  it('as condições por dimensão escolhem o custo do hotel', () => {
    const r = calcular(lisboa({ dimensoes: { temporada: 'alta', acomodacao: 'individual', passageiros: 2 } }), turismo());
    expect(r.exposicaoCambial[0]?.valorMoeda).toBe((489.53 + 1350) * 2);
    expect(r.detalhamento.some((l) => l.descricao === 'Custo: Hotel (duplo)')).toBe(false);
  });

  it('a folga mínima ausente na política não gera motivo', () => {
    const regras = turismo();
    delete regras.politica.limites.folgaCambialMinimaPct;
    regras.cambios = [{ moeda: 'EUR', taxa: 6.4, vigenteDe: '2026-01-01', origem: 'politica' }];
    const r = calcular(lisboa(), regras);
    expect(r.veredito.motivos.map((m) => m.codigo)).not.toContain('FOLGA_CAMBIAL_ABAIXO_DO_MINIMO');
  });
});

describe('comissão do vendedor', () => {
  const com = (regra: NonNullable<ConjuntoRegras['politica']['comissaoVendedor']>, pedido = lisboa()) => {
    const regras = turismo();
    regras.politica.comissaoVendedor = regra;
    return calcular(pedido, regras);
  };

  it('sobre a receita: percentual do preço final', () => {
    expect(com({ base: 'receita', pct: 2, deduzDaMargem: false }).comissaoVendedor?.valor).toBe(198);
  });

  it('sobre a margem respeita o piso de margem', () => {
    expect(com({ base: 'margem', pct: 10, margemMinimaPct: 5, deduzDaMargem: false }).comissaoVendedor?.valor).toBe(58.7);
    expect(com({ base: 'margem', pct: 10, margemMinimaPct: 6, deduzDaMargem: false }).comissaoVendedor?.valor).toBe(0);
  });

  it('informativa não mexe na margem nem no veredito; deduzida, mexe', () => {
    const informativa = com({ base: 'receita', pct: 3, deduzDaMargem: false });
    expect(informativa.margemValor).toBe(587);
    expect(informativa.veredito.status).toBe('dentro');
    const deduzida = com({ base: 'receita', pct: 3, deduzDaMargem: true });
    expect(deduzida.margemValor).toBe(587 - 297);
    expect(deduzida.veredito.status).toBe('exige_aprovacao');
    expect(deduzida.veredito.motivos.map((m) => m.codigo)).toContain('MARGEM_ABAIXO_DA_META');
    const linhas = deduzida.detalhamento.map((l) => l.tipo);
    expect(linhas.indexOf('comissao_vendedor')).toBeLessThan(linhas.indexOf('margem'));
  });

  it('política sem regra: comissão nula', () => {
    const regras = turismo();
    delete regras.politica.comissaoVendedor;
    expect(calcular(lisboa(), regras).comissaoVendedor).toBeNull();
  });
});

describe('compatibilidade com o motor 1.0.0', () => {
  it('configuração sem os campos novos não ganha exposição cambial nem comissão do vendedor', () => {
    const { regras } = regrasDoCliente('demo-assistencia.json');
    const r = calcular({ produto: 'AUTO24', dimensoes: { plano: 'completo', regiao: 'sudeste', idade_veiculo: 3, unidades: 1, meses: 12 }, data: '2026-02-10' }, regras);
    expect(r.exposicaoCambial).toEqual([]);
    expect(r.comissaoVendedor).toBeNull();
    expect(r.precoFinal).toBe(402.05);
    expect(r.margemValor).toBe(258.83);
    expect(r.versoes.motor).toBe('1.1.0');
  });
});

describe('projeção para canal', () => {
  it('não leva câmbio, exposição cambial nem comissão do vendedor', () => {
    const publico = resultadoPublico(calcular(lisboa({ descontoPct: 5 }), turismo()));
    const texto = JSON.stringify(publico);
    expect(publico).not.toHaveProperty('exposicaoCambial');
    expect(publico).not.toHaveProperty('comissaoVendedor');
    expect(texto).not.toMatch(/EUR|cambio|câmbio|taxa|comissaoVendedor|comissao_vendedor|Comissão do vendedor|folga|Folga/i);
    expect(publico.veredito.motivos.every((m) => m.codigo !== 'FOLGA_CAMBIAL_ABAIXO_DO_MINIMO')).toBe(true);
  });
});

describe('validação', () => {
  it('aponta custo em moeda sem câmbio e custo percentual com moeda', () => {
    const regras = turismo();
    regras.cambios = [];
    regras.custos.push({ codigo: 'taxa-eur', nome: 'Taxa', categoria: 'cobranca', tipo: 'percentual', valor: 1, moeda: 'EUR' });
    const { erros } = validarRegras(regras);
    expect(erros.join('\n')).toMatch(/"aereo" está em EUR, sem câmbio/);
    expect(erros.join('\n')).toMatch(/custo percentual não pode ter moeda/);
  });

  it('a configuração de turismo do teste é válida', () => {
    expect(validarRegras(turismo())).toEqual({ erros: [], avisos: [] });
  });
});

describe('configuração de demonstração da operadora de turismo', () => {
  const turismoDemo = regrasDoCliente('demo-turismo.json');

  it('é válida e 100% dos casos de referência batem, inclusive o da Nota nº 02', () => {
    expect(validarRegras(turismoDemo.regras)).toEqual({ erros: [], avisos: [] });
    const relatorio = executarCasos(turismoDemo.casos, turismoDemo.regras);
    expect(relatorio.casos.filter((c) => !c.passou)).toEqual([]);
    expect(relatorio.total).toBe(4);
  });

  it('todos os pacotes têm margem positiva pela agência, sem desconto', () => {
    for (const produto of ['LISBOA', 'MADRI', 'PARIS', 'GRAMADO']) {
      for (const temporada of ['alta', 'baixa']) {
        for (const acomodacao of ['duplo', 'individual']) {
          const r = calcular({ produto, dimensoes: { temporada, acomodacao, passageiros: 2 }, canal: 'agencia-rota', data: '2026-03-10' }, turismoDemo.regras);
          expect(r.margemPct, `${produto} ${temporada} ${acomodacao}`).toBeGreaterThan(5);
          expect(r.exposicaoCambial.length, produto).toBe(produto === 'GRAMADO' ? 0 : 1);
        }
      }
    }
  });
});
