import { describe, expect, it } from 'vitest';
import { arredondar, dec, dividir, multiplicar, paraNumero, paraTexto, percentualDe } from '../src/decimal.ts';
import {
  type ConjuntoRegras,
  ErroMotor,
  type PedidoCotacao,
  calcular,
  executarCasos,
  resultadoPublico,
  validarRegras,
} from '../src/index.ts';
import { regrasDoCliente } from './apoio.ts';

const aurora = regrasDoCliente('demo-assistencia.json');
const horizonte = regrasDoCliente('demo-distribuidor.json');

const pedidoBase: PedidoCotacao = {
  produto: 'AUTO24',
  dimensoes: { plano: 'completo', regiao: 'sudeste', idade_veiculo: 3, unidades: 1, meses: 12 },
  data: '2026-02-10',
};

function congelar<T>(o: T): T {
  if (o && typeof o === 'object') {
    Object.values(o).forEach(congelar);
    Object.freeze(o);
  }
  return o;
}

describe('decimal', () => {
  it('não sofre os erros clássicos de ponto flutuante', () => {
    expect(paraTexto(dec(0.1) + dec(0.2))).toBe('0.3');
    expect(paraNumero(arredondar(multiplicar(dec('1.005'), dec(100)), 0))).toBe(101);
    expect(paraNumero(arredondar(dec('2.675'), 2))).toBe(2.68);
  });
  it('arredonda nos quatro modos', () => {
    expect(paraNumero(arredondar(dec('2.345'), 2, 'meio_para_cima'))).toBe(2.35);
    expect(paraNumero(arredondar(dec('2.345'), 2, 'meio_par'))).toBe(2.34);
    expect(paraNumero(arredondar(dec('2.355'), 2, 'meio_par'))).toBe(2.36);
    expect(paraNumero(arredondar(dec('2.341'), 2, 'para_cima'))).toBe(2.35);
    expect(paraNumero(arredondar(dec('2.349'), 2, 'para_baixo'))).toBe(2.34);
    expect(paraNumero(arredondar(dec('-2.345'), 2, 'meio_para_cima'))).toBe(-2.35);
  });
  it('calcula percentuais e divisões', () => {
    expect(paraNumero(percentualDe(dec(200), dec('12.5')))).toBe(25);
    expect(paraNumero(arredondar(dividir(dec(100), dec(3)), 4))).toBe(33.3333);
    expect(() => dividir(dec(1), dec(0))).toThrow(RangeError);
    expect(() => dec('abc')).toThrow(RangeError);
  });
});

describe('casos de referência (cotações calculadas à mão)', () => {
  it.each([
    ['Aurora Assistências', aurora],
    ['Horizonte Distribuidora', horizonte],
  ])('%s: 100%% dos casos batem', (_nome, cliente) => {
    const relatorio = executarCasos(cliente.casos, cliente.regras);
    expect(relatorio.casos.filter((c) => !c.passou)).toEqual([]);
    expect(relatorio.total).toBeGreaterThan(0);
    expect(relatorio.aprovados).toBe(relatorio.total);
  });
  it('aponta a divergência quando o esperado não bate', () => {
    const caso = { ...aurora.casos[0]!, esperado: { precoFinal: 1 } };
    const relatorio = executarCasos([caso], aurora.regras);
    expect(relatorio.reprovados).toBe(1);
    expect(relatorio.casos[0]!.divergencias[0]).toMatchObject({ campo: 'precoFinal', esperado: 1, obtido: 402.05 });
  });
});

describe('configurações válidas', () => {
  it.each([
    ['Aurora', aurora.regras],
    ['Horizonte', horizonte.regras],
  ])('%s passa na validação', (_n, regras) => {
    expect(validarRegras(regras)).toEqual({ erros: [], avisos: [] });
  });
});

describe('pureza', () => {
  it('mesma entrada, mesma saída, sem alterar pedido nem regras', () => {
    const regras = congelar(structuredClone(aurora.regras));
    const pedido = congelar(structuredClone(pedidoBase));
    const a = calcular(pedido, regras);
    const b = calcular(pedido, regras);
    expect(a).toEqual(b);
  });
});

describe('preço base e fatores', () => {
  it('escolhe o item de tabela mais específico', () => {
    const generico = calcular({ ...pedidoBase, componentes: ['carro_reserva'] }, aurora.regras);
    const premium = calcular(
      { ...pedidoBase, componentes: ['carro_reserva'], dimensoes: { ...pedidoBase.dimensoes, plano: 'premium' } },
      aurora.regras,
    );
    expect(generico.precoBase).toBe(537.6); // (34,90 + 9,90) x 12
    expect(premium.precoBase).toBe(753.6); // (54,90 + 7,90) x 12
  });
  it('compõe fatores de forma multiplicativa ou aditiva conforme a política', () => {
    const r = calcular(
      { produto: 'FUR-750', dimensoes: { regiao_entrega: 'demais', prazo_pagamento: '60d', quantidade: 10 }, data: '2026-02-10' },
      horizonte.regras,
    );
    // aditiva: 2890 x (1 + 2,5% + 6%) = 3135,65
    expect(r.precoFinal).toBe(3135.65);
    const multiplicativa = structuredClone(horizonte.regras);
    const etapa = multiplicativa.politica.etapas.find((e) => e.tipo === 'fatores')!;
    if (etapa.tipo === 'fatores') etapa.composicao = 'multiplicativa';
    // multiplicativa: 2890 x 1,025 = 2962,25; x 1,06 = 3139,99
    expect(calcular({ produto: 'FUR-750', dimensoes: { regiao_entrega: 'demais', prazo_pagamento: '60d', quantidade: 10 }, data: '2026-02-10' }, multiplicativa).precoFinal).toBe(3139.99);
  });
  it('enquadra números nas faixas e recusa valores fora delas', () => {
    const r = calcular({ ...pedidoBase, dimensoes: { ...pedidoBase.dimensoes, idade_veiculo: 10, unidades: 49 } }, aurora.regras);
    expect(r.dimensoesResolvidas).toMatchObject({ idade_veiculo: '6-10', unidades: '10-49', meses: '12-23' });
    expect(() => calcular({ ...pedidoBase, dimensoes: { ...pedidoBase.dimensoes, idade_veiculo: 25 } }, aurora.regras)).toThrow(/fora das faixas/);
  });
});

describe('erros de entrada', () => {
  const erro = (pedido: PedidoCotacao, regras: ConjuntoRegras = aurora.regras) => {
    try {
      calcular(pedido, regras);
    } catch (e) {
      if (e instanceof ErroMotor) return e.codigo;
      throw e;
    }
    return null;
  };
  it('devolve códigos estáveis', () => {
    expect(erro({ ...pedidoBase, produto: 'XYZ' })).toBe('PRODUTO_DESCONHECIDO');
    expect(erro({ ...pedidoBase, componentes: ['nao_existe'] })).toBe('COMPONENTE_DESCONHECIDO');
    expect(erro({ ...pedidoBase, dimensoes: { plano: 'completo' } })).toBe('DIMENSAO_AUSENTE');
    expect(erro({ ...pedidoBase, dimensoes: { ...pedidoBase.dimensoes, plano: 'ouro' } })).toBe('DIMENSAO_INVALIDA');
    expect(erro({ ...pedidoBase, descontoPct: 100 })).toBe('DESCONTO_INVALIDO');
    expect(erro({ ...pedidoBase, descontoPct: -1 })).toBe('DESCONTO_INVALIDO');
    expect(erro({ ...pedidoBase, comissaoPct: 120 })).toBe('COMISSAO_INVALIDA');
    expect(erro({ ...pedidoBase, data: '10/02/2026' })).toBe('DATA_INVALIDA');
  });
  it('recusa produto inativo e tabela sem preço', () => {
    const regras = structuredClone(aurora.regras);
    regras.produtos[0]!.ativo = false;
    expect(erro(pedidoBase, regras)).toBe('PRODUTO_INATIVO');
    const semPreco = structuredClone(aurora.regras);
    semPreco.tabela.itens = semPreco.tabela.itens.filter((i) => i.produto !== 'AUTO24');
    expect(erro(pedidoBase, semPreco)).toBe('SEM_PRECO');
    const ambiguo = structuredClone(aurora.regras);
    ambiguo.tabela.itens.push({ produto: 'AUTO24', componente: 'base', dimensoes: { plano: 'completo' }, precoBase: 1 });
    expect(erro(pedidoBase, ambiguo)).toBe('PRECO_AMBIGUO');
  });
});

describe('campanhas', () => {
  const frota: PedidoCotacao = {
    produto: 'AUTO24',
    dimensoes: { plano: 'completo', regiao: 'sudeste', idade_veiculo: 2, unidades: 1, meses: 6 },
    data: '2026-10-05',
  };
  it('aplica só dentro do período, do produto e das condições', () => {
    expect(calcular(frota, aurora.regras).campanhas).toEqual(['frota-nova']);
    expect(calcular({ ...frota, data: '2026-08-31' }, aurora.regras).campanhas).toEqual([]);
    expect(calcular({ ...frota, dimensoes: { ...frota.dimensoes, idade_veiculo: 7 } }, aurora.regras).campanhas).toEqual([]);
  });
  it('campanha que não acumula com desconto: vale o que for maior', () => {
    const menor = calcular({ ...frota, descontoPct: 4 }, aurora.regras);
    expect(menor.campanhas).toEqual(['frota-nova']);
    expect(menor.descontoPct).toBe(0);
    expect(menor.precoFinal).toBe(188.46); // 209,40 - 10%
    expect(menor.avisos).toHaveLength(1);
    const maior = calcular({ ...frota, descontoPct: 12 }, aurora.regras);
    expect(maior.campanhas).toEqual([]);
    expect(maior.descontoPct).toBe(12);
    expect(maior.precoFinal).toBe(184.27); // 209,40 - 12%
  });
  it('campanha acumulável soma com o desconto', () => {
    const r = calcular(
      { produto: 'RESID', dimensoes: { plano: 'completo', regiao: 'sudeste', unidades: 1, meses: 6 }, descontoPct: 5, data: '2026-03-15' },
      aurora.regras,
    );
    expect(r.campanhas).toEqual(['lar-seguro']);
    expect(r.precoFinal).toBe(124); // 137,40 -5% = 130,53; -5% = 124,00
  });
  it('entre campanhas exclusivas e acumuláveis, escolhe a maior redução', () => {
    const regras = structuredClone(aurora.regras);
    regras.campanhas.push(
      { codigo: 'a', nome: 'A', inicio: '2026-10-01', fim: '2026-10-31', tipo: 'percentual', valor: 4, acumulaComDesconto: true, acumulaComOutras: true },
      { codigo: 'b', nome: 'B', inicio: '2026-10-01', fim: '2026-10-31', tipo: 'valor', valor: 15, acumulaComDesconto: true, acumulaComOutras: true },
    );
    // Frota Nova (exclusiva, 10% = 20,94) contra A + B (8,38 + 15 = 23,38): vencem A + B.
    expect(calcular(frota, regras).campanhas).toEqual(['a', 'b']);
  });
});

describe('veredito de política', () => {
  const com = (descontoPct: number, extra: Partial<PedidoCotacao> = {}) =>
    calcular({ ...pedidoBase, descontoPct, ...extra }, aurora.regras).veredito;
  it('verde até o desconto livre', () => {
    expect(com(5)).toMatchObject({ status: 'dentro', cor: 'verde', nivelAlcada: null });
  });
  it('amarelo com o menor nível de alçada que cobre a condição', () => {
    expect(com(5.01)).toMatchObject({ status: 'exige_aprovacao', cor: 'amarelo', nivelAlcada: 1, nomeAlcada: 'Gestor comercial' });
    expect(com(10)).toMatchObject({ nivelAlcada: 1 });
    expect(com(10.5)).toMatchObject({ nivelAlcada: 2, nomeAlcada: 'Diretoria' });
    expect(com(20)).toMatchObject({ nivelAlcada: 2 });
  });
  it('vermelho acima do desconto máximo', () => {
    const v = com(20.5);
    expect(v).toMatchObject({ status: 'bloqueado', cor: 'vermelho' });
    expect(v.motivos.map((m) => m.codigo)).toContain('DESCONTO_ACIMA_DO_MAXIMO');
  });
  it('margem abaixo do mínimo bloqueia mesmo sem desconto', () => {
    const regras = structuredClone(aurora.regras);
    regras.custos.find((c) => c.codigo === 'prestacao-auto')!.valor = 28;
    const v = calcular(pedidoBase, regras).veredito;
    expect(v.status).toBe('bloqueado');
    expect(v.motivos[0]).toMatchObject({ codigo: 'MARGEM_ABAIXO_DO_MINIMO', interno: true });
  });
  it('margem entre o mínimo e a meta pede aprovação; o piso da alçada decide o nível', () => {
    const regras = structuredClone(aurora.regras);
    const custo = regras.custos.find((c) => c.codigo === 'prestacao-auto')!;
    custo.valor = 22; // margem ~23%: abaixo da meta (25), acima do piso do gestor (20)
    expect(calcular(pedidoBase, regras).veredito).toMatchObject({ status: 'exige_aprovacao', nivelAlcada: 1 });
    custo.valor = 24; // margem ~17%: abaixo do piso do gestor, acima do mínimo (15)
    expect(calcular(pedidoBase, regras).veredito).toMatchObject({ status: 'exige_aprovacao', nivelAlcada: 2 });
  });
  it('comissão acima da tabela do canal sobe para a alçada que a permite', () => {
    const v = com(0, { canal: 'agencia-beta', comissaoPct: 18 });
    expect(v).toMatchObject({ status: 'exige_aprovacao', nivelAlcada: 2 });
    expect(v.motivos.map((m) => m.codigo)).toEqual(['COMISSAO_FORA_DA_TABELA']);
    expect(com(0, { canal: 'agencia-beta', comissaoPct: 10 }).status).toBe('dentro');
  });
  it('usa a comissão específica do produto quando existe', () => {
    const pet = calcular(
      { produto: 'PET', dimensoes: { plano: 'premium', regiao: 'sudeste', unidades: 1, meses: 12 }, canal: 'revenda-gama', data: '2026-02-10' },
      aurora.regras,
    );
    expect(pet.comissaoPct).toBe(10);
    expect(calcular({ ...pedidoBase, canal: 'revenda-gama' }, aurora.regras).comissaoPct).toBe(12);
  });
});

describe('etapas configuráveis', () => {
  it('comissão sobre o preço líquido de impostos (distribuidor)', () => {
    const r = calcular(
      { produto: 'KIT-BRO', dimensoes: { regiao_entrega: 'sp_capital', prazo_pagamento: '30d', quantidade: 10 }, canal: 'rep-norte', data: '2026-02-10' },
      horizonte.regras,
    );
    // 749,00; impostos 27,25% = 204,10 (134,82 + 69,28); comissão 4% de 544,90 = 21,80
    expect(r.precoFinal).toBe(749);
    expect(r.impostosValor).toBe(204.1);
    expect(r.comissaoValor).toBe(21.8);
  });
  it('comissão acrescida ao preço mantém o líquido', () => {
    const regras = structuredClone(aurora.regras);
    regras.politica.etapas = regras.politica.etapas.map((e) =>
      e.tipo === 'comissao' ? { ...e, modo: 'acrescenta_ao_preco' as const } : e,
    );
    const direto = calcular(pedidoBase, regras);
    const canal = calcular({ ...pedidoBase, canal: 'corretora-alfa' }, regras);
    expect(canal.precoFinal).toBe(502.56); // 402,05 / 0,80
    expect(canal.comissaoValor).toBe(100.51);
    expect(Math.abs(canal.precoFinal - canal.comissaoValor - direto.precoFinal)).toBeLessThanOrEqual(0.01);
  });
  it('executa função de extensão registrada e recusa a que não existe', () => {
    const regras = structuredClone(aurora.regras);
    regras.politica.etapas.splice(2, 0, { id: 'taxa_emissao', tipo: 'extensao', funcao: 'taxaFixa', parametros: { valor: 10 } });
    const r = calcular(pedidoBase, regras, {
      extensoes: { taxaFixa: (ctx) => ({ preco: ctx.preco + Number(ctx.parametros.valor), descricao: 'Taxa de emissão' }) },
    });
    expect(r.precoFinal).toBe(412.05);
    expect(r.detalhamento.some((l) => l.descricao === 'Taxa de emissão' && l.valor === 10)).toBe(true);
    expect(() => calcular(pedidoBase, regras)).toThrow(/não está instalada/);
  });
  it('recusa base de incidência que ainda não foi calculada', () => {
    const regras = structuredClone(horizonte.regras);
    const etapas = regras.politica.etapas;
    const i = etapas.findIndex((e) => e.tipo === 'impostos');
    const c = etapas.findIndex((e) => e.tipo === 'comissao');
    [etapas[i], etapas[c]] = [etapas[c]!, etapas[i]!];
    expect(validarRegras(regras).erros.join(' ')).toMatch(/não foi deduzido antes/);
    expect(() => calcular({ produto: 'KIT-BRO', dimensoes: { regiao_entrega: 'sp_capital', prazo_pagamento: '30d', quantidade: 1 }, canal: 'rep-sul', data: '2026-02-10' }, regras)).toThrow(ErroMotor);
  });
});

describe('projeção para canal', () => {
  it('não carrega custo, imposto nem margem', () => {
    const completo = calcular({ ...pedidoBase, canal: 'corretora-alfa', descontoPct: 8 }, aurora.regras);
    const publico = resultadoPublico(completo);
    const texto = JSON.stringify(publico);
    for (const campo of ['margemValor', 'margemPct', 'custosValor', 'impostosValor', 'receitaLiquida']) {
      expect(publico).not.toHaveProperty(campo);
      expect(texto).not.toContain(campo);
    }
    expect(texto).not.toMatch(/Imposto|Custo|Margem/);
    expect(publico.precoFinal).toBe(completo.precoFinal);
    expect(publico.comissaoValor).toBe(completo.comissaoValor);
    expect(publico.detalhamento.every((l) => !l.interno)).toBe(true);
  });
  it('troca o motivo interno do veredito por um texto genérico', () => {
    const regras = structuredClone(aurora.regras);
    regras.custos.find((c) => c.codigo === 'prestacao-auto')!.valor = 22;
    const publico = resultadoPublico(calcular(pedidoBase, regras));
    expect(publico.veredito.status).toBe('exige_aprovacao');
    expect(publico.veredito.motivos).toEqual([
      { codigo: 'FORA_DA_POLITICA', mensagem: 'Condição comercial fora da política vigente.', interno: false },
    ]);
  });
});

describe('validação de regras', () => {
  it('aponta erros estruturais', () => {
    const regras = structuredClone(aurora.regras);
    regras.tabela.itens.push({ produto: 'AUTO24', componente: 'base', dimensoes: { plano: 'ouro' }, precoBase: 1 });
    regras.politica.limites.descontoLivrePct = 30;
    regras.politica.alcadas.push({ nivel: 1, nome: 'Repetida', descontoAtePct: 5 });
    regras.dimensoes.find((d) => d.codigo === 'meses')!.faixas![0]!.max = 12;
    const { erros } = validarRegras(regras);
    expect(erros.join('\n')).toMatch(/"plano" = "ouro"/);
    expect(erros.join('\n')).toMatch(/Limites de desconto/);
    expect(erros.join('\n')).toMatch(/alçada 1 repetido/);
    expect(erros.join('\n')).toMatch(/se sobrepõem/);
  });
  it('avisa quando o desconto vem antes da campanha', () => {
    const regras = structuredClone(aurora.regras);
    const e = regras.politica.etapas;
    [e[2], e[3]] = [e[3]!, e[2]!];
    expect(validarRegras(regras).avisos.join(' ')).toMatch(/Desconto antes de campanha/);
  });
});
