// Empresa fictícia da demonstração: uma distribuidora B2B de materiais, 12 meses de vendas.
// Os dados são sintéticos e determinísticos (mesma semente, mesmos arquivos), com os problemas
// que um diagnóstico costuma encontrar: contas pequenas com desconto de conta grande, vendedores
// que cedem preço, produtos com margem negativa, devoluções, duplicatas e produtos sem custo.

export const PERIODO = { inicio: '2025-11-01', fim: '2026-10-31' };

function semente(s: number) {
  return () => {
    s |= 0;
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export interface Linha { [campo: string]: string | number | null }
export interface Demo {
  transacoes: Linha[];
  custos: Linha[];
  produtos: Linha[];
  contas: Linha[];
  custos_servir: Linha[];
  descontos_fora_fatura: Linha[];
}

const r2 = (v: number) => Math.round(v * 100) / 100;

export function gerarDemo(seed = 20261117): Demo {
  const rnd = semente(seed);
  const entre = (a: number, b: number) => a + (b - a) * rnd();
  const escolher = <T,>(lista: T[]) => lista[Math.floor(rnd() * lista.length)]!;

  const categorias = ['Ferramentas', 'Elétrica', 'Hidráulica', 'Fixadores', 'Tintas', 'EPI'];
  const produtos: (Linha & { lista: number; custo: number })[] = [];
  for (let i = 1; i <= 48; i++) {
    const lista = r2(Math.exp(entre(Math.log(8), Math.log(380))));
    // 8 produtos com custo colado no preço: margem baixa ou negativa depois dos descontos
    const apertado = i % 6 === 1;
    const custo = r2(lista * (apertado ? entre(0.68, 0.86) : entre(0.42, 0.6)));
    produtos.push({ codigo: `P${String(i).padStart(3, '0')}`, descricao: `Item ${i}`, categoria: i === 48 ? null : categorias[i % categorias.length]!, linha: i % 3 === 0 ? 'Premium' : 'Padrão', lista, custo });
  }

  const segmentos = ['Construtora', 'Revenda', 'Indústria', 'Varejo'];
  const regioes = ['São Paulo', 'Sul', 'Nordeste', 'Centro-Oeste'];
  const vendedores = ['Ana', 'Bruno', 'Carla', 'Diego', 'Elaine', 'Fábio', 'Gustavo', 'Helena'];
  const canais = ['Direto', 'Representante', 'Televendas', 'E-commerce'];
  const contas: (Linha & { tamanho: number; desconto: number; canal: string })[] = [];
  for (let i = 1; i <= 160; i++) {
    const tamanho = Math.exp(entre(0, 4.6)); // de 1 a ~100: poucas contas grandes, muitas pequenas
    const vendedor = escolher(vendedores);
    let desconto = tamanho > 40 ? 0.17 : tamanho > 10 ? 0.11 : 0.06;
    if (vendedor === 'Diego' || vendedor === 'Gustavo') desconto += 0.07; // cedem preço para qualquer conta
    if (tamanho <= 10 && rnd() < 0.25) desconto = entre(0.22, 0.34); // conta pequena com desconto de conta grande
    else if (tamanho > 10 && tamanho <= 40 && rnd() < 0.35) desconto = entre(0.2, 0.32); // conta média negociada acima da política
    desconto += entre(-0.03, 0.03);
    contas.push({
      codigo: `C${String(i).padStart(4, '0')}`, nome: `Conta ${i}`, segmento: i % 23 === 0 ? null : escolher(segmentos),
      porte: tamanho > 40 ? 'Grande' : tamanho > 10 ? 'Médio' : 'Pequeno', regiao: escolher(regioes), vendedor,
      tamanho, desconto: Math.max(0, desconto), canal: tamanho > 40 ? 'Direto' : escolher(canais),
    });
  }

  const transacoes: Linha[] = [];
  let nf = 10000;
  for (let m = 0; m < 12; m++) {
    const ano = m < 2 ? 2025 : 2026;
    const mes = ((10 + m) % 12) + 1;
    const sazonal = 1 + 0.18 * Math.sin((m / 12) * 2 * Math.PI);
    for (const c of contas) {
      const pedidos = Math.max(0, Math.round((c.tamanho / 6) * sazonal + entre(-0.6, 0.9)));
      for (let p = 0; p < pedidos; p++) {
        const dia = 1 + Math.floor(rnd() * 28);
        const data = `${ano}-${String(mes).padStart(2, '0')}-${String(dia).padStart(2, '0')}`;
        nf++;
        const itens = 1 + Math.floor(rnd() * 3);
        for (let k = 0; k < itens; k++) {
          const prod = escolher(produtos);
          // itens caros giram menos: a receita não fica concentrada em meia dúzia de produtos
          const quantidade = Math.max(1, Math.round((c.tamanho / 4) * entre(0.3, 2.2) * (60 / prod.lista) ** 0.7));
          const total = Math.min(0.4, Math.max(0, c.desconto + entre(-0.025, 0.025)));
          const volume = c.tamanho > 40 ? total * 0.35 : 0;
          const promo = mes === 11 || mes === 6 ? total * 0.2 : 0;
          const financeiro = c.canal === 'Direto' ? 0.015 : 0;
          const comercial = Math.max(0, total - volume - promo - financeiro);
          const dCom = r2(prod.lista * comercial), dVol = r2(prod.lista * volume), dPro = r2(prod.lista * promo), dFin = r2(prod.lista * financeiro);
          transacoes.push({
            data, nota_fiscal: String(nf), produto: prod.codigo as string, conta: c.codigo as string, canal: c.canal, quantidade,
            preco_lista: prod.lista, preco_faturado: r2(prod.lista - dCom - dVol - dPro - dFin),
            desc_comercial: dCom, desc_volume: dVol, desc_promocional: dPro, desc_financeiro: dFin,
          });
        }
      }
    }
  }
  // sujeira típica: devoluções, duplicatas e preço vazio
  for (let i = 0; i < 40; i++) transacoes.push({ ...escolher(transacoes), quantidade: -Math.ceil(entre(1, 6)) });
  for (let i = 0; i < 25; i++) transacoes.push({ ...transacoes[Math.floor(rnd() * 5000)]! });
  for (let i = 0; i < 10; i++) transacoes.push({ ...escolher(transacoes), preco_faturado: null });

  // custos: linha de base, com reajuste de 6% em maio para um terço dos produtos; P047 fica sem custo
  const custos: Linha[] = [];
  for (const p of produtos) {
    if (p.codigo === 'P047') continue;
    custos.push({ produto: p.codigo as string, custo_unitario: p.custo, vigencia_inicio: null });
    if (Number((p.codigo as string).slice(1)) % 3 === 1) custos.push({ produto: p.codigo as string, custo_unitario: r2(p.custo * 1.06), vigencia_inicio: '2026-05-01' });
  }

  const custos_servir: Linha[] = [
    { tipo: 'frete', canal: null, conta: null, percentual: 4 },
    { tipo: 'prazo', canal: null, conta: null, percentual: 1.5 },
    { tipo: 'comissao', canal: 'Representante', conta: null, percentual: 5 },
    { tipo: 'comissao', canal: 'Televendas', conta: null, percentual: 2 },
    ...contas.filter((c) => c.regiao === 'Nordeste' && c.tamanho < 6).slice(0, 8).map((c) => ({ tipo: 'frete', canal: null, conta: c.codigo as string, percentual: 9 })),
  ];

  // rebate mensal de 2,5% do faturado para as 20 maiores contas
  const maiores = new Set([...contas].sort((a, b) => b.tamanho - a.tamanho).slice(0, 20).map((c) => c.codigo));
  const porContaMes = new Map<string, number>();
  for (const t of transacoes) {
    if (!maiores.has(t.conta as string) || !(Number(t.quantidade) > 0) || t.preco_faturado === null) continue;
    const chave = `${t.conta}|${(t.data as string).slice(0, 7)}-01`;
    porContaMes.set(chave, (porContaMes.get(chave) ?? 0) + Number(t.quantidade) * Number(t.preco_faturado));
  }
  const descontos_fora_fatura: Linha[] = [...porContaMes].map(([chave, receita]) => {
    const [conta, mes] = chave.split('|');
    return { conta: conta!, mes: mes!, tipo: 'rebate', valor: r2(receita * 0.025) };
  });

  return {
    transacoes,
    custos,
    produtos: produtos.map(({ lista: _l, custo: _c, ...p }) => p),
    contas: contas.map(({ tamanho: _t, desconto: _d, canal: _k, ...c }) => c),
    custos_servir,
    descontos_fora_fatura,
  };
}

// ---------------------------------------------------------------- arquivos como o cliente manda
// Cabeçalhos no jeito de um ERP brasileiro, ponto e vírgula, vírgula decimal e data em dd/mm/aaaa:
// é o formato que a tela de carga precisa reconhecer.
const CABECALHOS: Record<keyof Demo, [campo: string, titulo: string][]> = {
  transacoes: [['data', 'Data Emissão'], ['nota_fiscal', 'NF'], ['produto', 'Cód. Produto'], ['conta', 'Cód. Cliente'], ['canal', 'Canal'], ['quantidade', 'Qtde'],
    ['preco_lista', 'Preço Tabela'], ['preco_faturado', 'Preço Unit. NF'], ['desc_comercial', 'Desc. Comercial'], ['desc_volume', 'Desc. Volume'],
    ['desc_promocional', 'Desc. Promocional'], ['desc_financeiro', 'Desc. Financeiro']],
  custos: [['produto', 'Cód. Produto'], ['custo_unitario', 'Custo Unitário'], ['vigencia_inicio', 'Vigência']],
  produtos: [['codigo', 'Cód. Produto'], ['descricao', 'Descrição'], ['categoria', 'Categoria'], ['linha', 'Linha']],
  contas: [['codigo', 'Cód. Cliente'], ['nome', 'Razão Social'], ['segmento', 'Segmento'], ['porte', 'Porte'], ['regiao', 'Região'], ['vendedor', 'Vendedor']],
  custos_servir: [['tipo', 'Tipo'], ['canal', 'Canal'], ['conta', 'Cód. Cliente'], ['percentual', 'Percentual']],
  descontos_fora_fatura: [['conta', 'Cód. Cliente'], ['mes', 'Mês'], ['tipo', 'Tipo'], ['valor', 'Valor']],
};

export function paraCsv(bloco: keyof Demo, linhas: Linha[]): string {
  const colunas = CABECALHOS[bloco];
  const celula = (v: string | number | null | undefined) => {
    if (v === null || v === undefined) return '';
    if (typeof v === 'number') return String(v).replace('.', ',');
    if (/^\d{4}-\d{2}-\d{2}$/.test(v)) return `${v.slice(8)}/${v.slice(5, 7)}/${v.slice(0, 4)}`;
    return /[;"\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v;
  };
  return [colunas.map(([, t]) => t).join(';'), ...linhas.map((l) => colunas.map(([c]) => celula(l[c])).join(';'))].join('\r\n') + '\r\n';
}

export const NOMES_ARQUIVO: Record<keyof Demo, string> = {
  transacoes: 'vendas-12-meses.csv',
  custos: 'custos.csv',
  produtos: 'cadastro-produtos.csv',
  contas: 'cadastro-clientes.csv',
  custos_servir: 'custos-de-servir.csv',
  descontos_fora_fatura: 'rebates.csv',
};
