// Empresa fictícia de turismo: uma operadora que vende pacotes por agências e pelo próprio site,
// com 12 meses de reservas sintéticas e custo em euro ou dólar. Três destinos (Portugal, Paris e Orlando)
// e um bloqueio de Lisboa em julho com os números da Nota nº 02: preço R$ 9.900, câmbio de premissa
// R$ 6,10 por euro e margem de R$ 587 por passageiro.
//
// Determinística (mesma semente, mesmos arquivos) e com o que um diagnóstico de operadora costuma achar:
// moeda subindo entre a venda e o pagamento, um produto com margem fina, agências pequenas com desconto
// de agência grande, lugares de bloqueio não vendidos, reservas canceladas e duas linhas com erro.
import { type Linha, escreverCsv, semente } from './demo.ts';

export const PERIODO_TURISMO = { inicio: '2025-11-01', fim: '2026-10-31' };

export interface DemoTurismo {
  transacoes: Linha[];
  produtos: Linha[];
  contas: Linha[];
  custos_servir: Linha[];
  descontos_fora_fatura: Linha[];
  bloqueios: Linha[];
}

const r2 = (v: number) => Math.round(v * 100) / 100;
const MESES = ['2025-11', '2025-12', '2026-01', '2026-02', '2026-03', '2026-04', '2026-05', '2026-06', '2026-07', '2026-08', '2026-09', '2026-10'];
// Câmbio médio do mês (R$ por unidade). Junho de 2026 é o câmbio de premissa da Nota nº 02: R$ 6,10 por euro.
const EUR = [6.02, 6.05, 6.0, 5.97, 6.03, 6.06, 6.08, 6.1, 6.14, 6.18, 6.21, 6.24];
const USD = [5.38, 5.42, 5.36, 5.33, 5.39, 5.43, 5.46, 5.49, 5.52, 5.55, 5.58, 5.61];

function cambio(moeda: string, data: string): number | null {
  const i = MESES.indexOf(data.slice(0, 7));
  if (i < 0) return null;
  return (moeda === 'EUR' ? EUR : USD)[i]!;
}

function somarDias(data: string, dias: number): string {
  const d = new Date(`${data}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + dias);
  return d.toISOString().slice(0, 10);
}

interface Pacote { codigo: string; descricao: string; categoria: string; fornecedor: string; moeda: 'EUR' | 'USD'; lista: number; custo: number; over: number; peso: number[] }
// peso: chance relativa de embarque em cada mês do ano (jan..dez)
const PACOTES: Pacote[] = [
  { codigo: 'LIS-ESS', descricao: 'Lisboa Essencial, 7 noites', categoria: 'Portugal', fornecedor: 'Tejo Receptivo', moeda: 'EUR', lista: 8200, custo: 1050, over: 0, peso: [3, 2, 3, 4, 5, 6, 8, 7, 6, 5, 3, 3] },
  { codigo: 'POR-DOU', descricao: 'Porto e Douro, 6 noites', categoria: 'Portugal', fornecedor: 'Lusitânia Hotéis', moeda: 'EUR', lista: 7600, custo: 1080, over: 0, peso: [2, 2, 3, 4, 5, 5, 6, 6, 7, 6, 3, 2] },
  { codigo: 'PAR-ESS', descricao: 'Paris Essencial, 6 noites', categoria: 'França', fornecedor: 'Sena Viagens', moeda: 'EUR', lista: 10500, custo: 1300, over: 0, peso: [3, 3, 4, 6, 6, 5, 6, 5, 6, 5, 4, 7] },
  { codigo: 'ORL-FAM', descricao: 'Orlando Família, 8 noites', categoria: 'Estados Unidos', fornecedor: 'Sunshine DMC', moeda: 'USD', lista: 10900, custo: 1500, over: 60, peso: [9, 4, 3, 4, 3, 5, 9, 6, 2, 3, 4, 8] },
  { codigo: 'ORL-PAR', descricao: 'Orlando Parques, 6 noites', categoria: 'Estados Unidos', fornecedor: 'Sunshine DMC', moeda: 'USD', lista: 12900, custo: 1850, over: 60, peso: [8, 4, 3, 4, 3, 5, 9, 6, 2, 3, 4, 7] },
];
const ALTA = (mes: number) => mes === 1 || mes === 7 || mes === 12;

const BLOQUEIO_LISBOA = { produto: 'LIS-JUL', servico: '2026-07-15', preco: 9900, custoEur: 1364.43, contratados: 40, vendidos: 34, pagamento: '2026-06-15' };

export function gerarDemoTurismo(seed = 20261118): DemoTurismo {
  const rnd = semente(seed);
  const entre = (a: number, b: number) => a + (b - a) * rnd();
  const inteiro = (a: number, b: number) => Math.floor(entre(a, b + 1));
  const escolherPeso = <T,>(itens: T[], pesos: number[]) => {
    let alvo = rnd() * pesos.reduce((s, p) => s + p, 0);
    for (let i = 0; i < itens.length; i++) if ((alvo -= pesos[i]!) <= 0) return itens[i]!;
    return itens[itens.length - 1]!;
  };

  // agências: poucas grandes, muitas pequenas; algumas pequenas com desconto de agência grande
  const regioes = ['São Paulo', 'Rio de Janeiro', 'Sul', 'Nordeste', 'Centro-Oeste'];
  const vendedores = ['Marina', 'Otávio', 'Paula', 'Renato', 'Sílvia'];
  const agencias = Array.from({ length: 40 }, (_, i) => {
    const tamanho = Math.exp(entre(0, 2.1)); // de 1 a ~8 reservas por mês
    let desconto = tamanho > 5 ? entre(0.04, 0.07) : tamanho > 2.5 ? entre(0.02, 0.04) : entre(0, 0.025);
    if (tamanho <= 2.5 && rnd() < 0.25) desconto = entre(0.08, 0.12);
    return {
      codigo: `AG${String(i + 1).padStart(3, '0')}`, nome: `Agência ${i + 1}`, segmento: rnd() < 0.3 ? 'Agência corporativa' : 'Agência de lazer',
      porte: tamanho > 5 ? 'Grande' : tamanho > 2.5 ? 'Média' : 'Pequena', regiao: regioes[inteiro(0, regioes.length - 1)]!, vendedor: vendedores[inteiro(0, vendedores.length - 1)]!,
      tamanho, desconto,
    };
  });

  // as cinco maiores agências recebem incentivo fora da fatura (1,5% do faturado do mês)
  const maiores = new Set([...agencias].sort((a, b) => b.tamanho - a.tamanho).slice(0, 5).map((a) => a.codigo));

  const transacoes: Linha[] = [];
  let localizador = 50000;
  const reservar = (o: { data: string; servico: string; pacote: Pacote; conta: string; canal: string; pax: number; desconto: number; promo: number; custo: number }) => {
    const mesServico = Number(o.servico.slice(5, 7));
    const lista = r2(o.pacote.lista * (ALTA(mesServico) ? 1.15 : 1));
    const dCom = r2(lista * o.desconto), dPro = r2(lista * o.promo);
    const pagamento = somarDias(o.servico, -30) < o.data ? o.data : somarDias(o.servico, -30);
    transacoes.push({
      data: o.data, nota_fiscal: `LOC${++localizador}`, produto: o.pacote.codigo, conta: o.conta, canal: o.canal, quantidade: o.pax,
      preco_lista: lista, preco_faturado: r2(lista - dCom - dPro), desc_comercial: dCom, desc_promocional: dPro,
      data_servico: o.servico, fornecedor: o.pacote.fornecedor, custo_unitario_moeda: o.custo, moeda_custo: o.pacote.moeda,
      cambio_venda: cambio(o.pacote.moeda, o.data), cambio_pagamento: cambio(o.pacote.moeda, pagamento), data_pagamento_fornecedor: pagamento,
      over_unitario: o.pacote.over || null, status_reserva: rnd() < 0.03 ? 'cancelada' : 'confirmada',
    });
  };

  for (const mes of MESES) {
    const mesVenda = Number(mes.slice(5, 7));
    for (const ag of [...agencias, null]) {
      const n = ag ? Math.max(0, Math.round(ag.tamanho * entre(0.6, 1.3))) : inteiro(8, 14); // null = site
      for (let k = 0; k < n; k++) {
        const dia = String(inteiro(1, 28)).padStart(2, '0');
        const data = `${mes}-${dia}`;
        const antecedencia = inteiro(20, 200);
        const servico = somarDias(data, antecedencia);
        const pacote = escolherPeso(PACOTES, PACOTES.map((p) => p.peso[Number(servico.slice(5, 7)) - 1]!));
        const custo = r2(pacote.custo * (ALTA(Number(servico.slice(5, 7))) ? 1.12 : 1));
        const baixa = [3, 4, 8, 9, 11].includes(mesVenda);
        reservar({
          data, servico, pacote, conta: ag?.codigo ?? 'SITE', canal: ag ? 'Agência' : 'Site', pax: inteiro(1, 4),
          desconto: ag ? Math.max(0, ag.desconto + entre(-0.01, 0.01)) : 0, promo: !ag && baixa ? 0.05 : 0, custo,
        });
      }
    }
  }

  // bloqueio Lisboa julho: 34 passageiros vendidos de fevereiro a junho, sem desconto, por agências fora do
  // incentivo; com a comissão de 10% e o euro a R$ 6,10 no pagamento, a margem é de R$ 587 por passageiro
  const semIncentivo = agencias.filter((a) => !maiores.has(a.codigo));
  const lisboa: Pacote = { codigo: BLOQUEIO_LISBOA.produto, descricao: 'Lisboa, saída de julho (bloqueio)', categoria: 'Portugal', fornecedor: 'Tejo Receptivo', moeda: 'EUR', lista: BLOQUEIO_LISBOA.preco, custo: BLOQUEIO_LISBOA.custoEur, over: 0, peso: [] };
  let vendidos = 0;
  while (vendidos < BLOQUEIO_LISBOA.vendidos) {
    const pax = Math.min(inteiro(1, 4), BLOQUEIO_LISBOA.vendidos - vendidos);
    const mes = MESES[inteiro(3, 7)]!; // fev a jun de 2026
    const ag = semIncentivo[inteiro(0, semIncentivo.length - 1)]!;
    const data = `${mes}-${String(inteiro(1, 28)).padStart(2, '0')}`;
    transacoes.push({
      data, nota_fiscal: `LOC${++localizador}`, produto: lisboa.codigo, conta: ag.codigo, canal: 'Agência', quantidade: pax,
      preco_lista: BLOQUEIO_LISBOA.preco, preco_faturado: BLOQUEIO_LISBOA.preco, desc_comercial: 0, desc_promocional: 0,
      data_servico: BLOQUEIO_LISBOA.servico, fornecedor: lisboa.fornecedor, custo_unitario_moeda: lisboa.custo, moeda_custo: 'EUR',
      cambio_venda: cambio('EUR', data), cambio_pagamento: cambio('EUR', BLOQUEIO_LISBOA.pagamento), data_pagamento_fornecedor: BLOQUEIO_LISBOA.pagamento,
      over_unitario: null, status_reserva: 'confirmada',
    });
    vendidos += pax;
  }

  // duas linhas com erro, para a validação mostrar
  transacoes.push({ ...transacoes[10]!, nota_fiscal: `LOC${++localizador}`, moeda_custo: 'EU' });
  transacoes.push({ ...transacoes[20]!, nota_fiscal: `LOC${++localizador}`, data_servico: somarDias(transacoes[20]!.data as string, -5) });

  // bloqueios: os lugares vendidos saem das próprias reservas confirmadas
  const pax = (produto: string, prefixo: string) =>
    transacoes.filter((t) => t.produto === produto && (t.data_servico as string).startsWith(prefixo) && t.status_reserva === 'confirmada' && t.moeda_custo !== 'EU' && (t.data_servico as string) >= (t.data as string))
      .reduce((s, t) => s + Number(t.quantidade), 0);
  const orlJul = pax('ORL-PAR', '2026-07'), parDez = pax('PAR-ESS', '2025-12'), orlJan = pax('ORL-FAM', '2027-01');
  const bloqueios: Linha[] = [
    { produto: BLOQUEIO_LISBOA.produto, fornecedor: 'Tejo Receptivo', data_servico: BLOQUEIO_LISBOA.servico, lugares_contratados: BLOQUEIO_LISBOA.contratados, lugares_vendidos: BLOQUEIO_LISBOA.vendidos, data_devolucao: '2026-05-31', multa_por_lugar: null, custo_unitario_moeda: BLOQUEIO_LISBOA.custoEur, moeda: 'EUR' },
    { produto: 'ORL-PAR', fornecedor: 'Sunshine DMC', data_servico: '2026-07-01', lugares_contratados: orlJul + 6, lugares_vendidos: orlJul, data_devolucao: '2026-05-15', multa_por_lugar: 900, custo_unitario_moeda: r2(1850 * 1.12), moeda: 'USD' },
    { produto: 'PAR-ESS', fornecedor: 'Sena Viagens', data_servico: '2025-12-28', lugares_contratados: parDez + 4, lugares_vendidos: parDez, data_devolucao: '2025-11-15', multa_por_lugar: null, custo_unitario_moeda: r2(1300 * 1.12), moeda: 'EUR' },
    { produto: 'ORL-FAM', fornecedor: 'Sunshine DMC', data_servico: '2027-01-10', lugares_contratados: Math.max(30, orlJan + 8), lugares_vendidos: orlJan, data_devolucao: '2026-11-30', multa_por_lugar: 900, custo_unitario_moeda: r2(1500 * 1.12), moeda: 'USD' },
  ];

  const custos_servir: Linha[] = [
    { tipo: 'comissao', canal: 'Agência', conta: null, percentual: 10 },
    { tipo: 'outros', canal: 'Site', conta: null, percentual: 3 },
  ];

  const porMes = new Map<string, number>();
  for (const t of transacoes) {
    if (!maiores.has(t.conta as string) || t.status_reserva !== 'confirmada') continue;
    const chave = `${t.conta}|${(t.data as string).slice(0, 7)}-01`;
    porMes.set(chave, (porMes.get(chave) ?? 0) + Number(t.quantidade) * Number(t.preco_faturado));
  }
  const descontos_fora_fatura: Linha[] = [...porMes].map(([chave, receita]) => {
    const [conta, mes] = chave.split('|');
    return { conta: conta!, mes: mes!, tipo: 'incentivo', valor: r2(receita * 0.015) };
  });

  return {
    transacoes,
    produtos: [...PACOTES, lisboa].map((p) => ({ codigo: p.codigo, descricao: p.descricao, categoria: p.categoria, linha: p === lisboa ? 'Bloqueio' : 'Pacote' })),
    contas: [
      ...agencias.map(({ tamanho: _t, desconto: _d, ...a }) => a),
      { codigo: 'SITE', nome: 'Vendas diretas pelo site', segmento: 'Consumidor final', porte: null, regiao: null, vendedor: null },
    ],
    custos_servir,
    descontos_fora_fatura,
    bloqueios,
  };
}

// ---------------------------------------------------------------- arquivos como a operadora exportaria
const CABECALHOS: Record<keyof DemoTurismo, [campo: string, titulo: string][]> = {
  transacoes: [['data', 'Data Venda'], ['nota_fiscal', 'Localizador'], ['produto', 'Cód. Pacote'], ['conta', 'Cód. Agência'], ['canal', 'Canal'],
    ['quantidade', 'Passageiros'], ['preco_lista', 'Tarifa'], ['preco_faturado', 'Valor Vendido'], ['desc_comercial', 'Desconto'], ['desc_promocional', 'Desc. Promocional'],
    ['data_servico', 'Data Embarque'], ['fornecedor', 'Fornecedor'], ['custo_unitario_moeda', 'Custo Unitário (moeda)'], ['moeda_custo', 'Moeda'],
    ['cambio_venda', 'Câmbio Venda'], ['cambio_pagamento', 'Câmbio Pagamento'], ['data_pagamento_fornecedor', 'Data Pagamento Fornecedor'], ['over_unitario', 'Over'], ['status_reserva', 'Status']],
  produtos: [['codigo', 'Cód. Pacote'], ['descricao', 'Descrição'], ['categoria', 'Destino'], ['linha', 'Linha']],
  contas: [['codigo', 'Cód. Agência'], ['nome', 'Razão Social'], ['segmento', 'Segmento'], ['porte', 'Porte'], ['regiao', 'Região'], ['vendedor', 'Executivo de Contas']],
  custos_servir: [['tipo', 'Tipo'], ['canal', 'Canal'], ['conta', 'Cód. Agência'], ['percentual', 'Percentual']],
  descontos_fora_fatura: [['conta', 'Cód. Agência'], ['mes', 'Mês'], ['tipo', 'Tipo'], ['valor', 'Valor']],
  bloqueios: [['produto', 'Cód. Pacote'], ['fornecedor', 'Fornecedor'], ['data_servico', 'Data Embarque'], ['lugares_contratados', 'Lugares Contratados'],
    ['lugares_vendidos', 'Lugares Vendidos'], ['data_devolucao', 'Data Devolução'], ['multa_por_lugar', 'Multa por Lugar'], ['custo_unitario_moeda', 'Custo Unitário (moeda)'], ['moeda', 'Moeda']],
};

export const paraCsvTurismo = (bloco: keyof DemoTurismo, linhas: Linha[]) => escreverCsv(CABECALHOS[bloco], linhas);

export const NOMES_ARQUIVO_TURISMO: Record<keyof DemoTurismo, string> = {
  transacoes: 'reservas-12-meses.csv',
  produtos: 'cadastro-pacotes.csv',
  contas: 'cadastro-agencias.csv',
  custos_servir: 'comissoes-e-taxas.csv',
  descontos_fora_fatura: 'incentivos-agencias.csv',
  bloqueios: 'bloqueios.csv',
};
