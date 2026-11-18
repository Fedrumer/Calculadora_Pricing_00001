import type { ConjuntoRegras, Etapa } from './tipos.ts';

export interface Validacao {
  /** Impedem a publicação. */
  erros: string[];
  /** Não impedem, mas merecem revisão. */
  avisos: string[];
}

const TIPOS_QUE_MUDAM_PRECO: Etapa['tipo'][] = ['preco_base', 'fatores', 'campanha', 'desconto', 'arredondamento'];
const TIPOS_DE_DEDUCAO: Etapa['tipo'][] = ['comissao', 'impostos', 'custos'];

/** Confere a coerência de um conjunto de regras antes de publicar tabela ou política. */
export function validarRegras(regras: ConjuntoRegras): Validacao {
  const erros: string[] = [];
  const avisos: string[] = [];
  const { politica, tabela, dimensoes, produtos } = regras;

  const dims = new Map(dimensoes.map((d) => [d.codigo, d]));
  for (const d of dimensoes) {
    if (d.tipo === 'categoria' && !d.valores?.length) erros.push(`Dimensão "${d.codigo}" não tem valores.`);
    if (d.tipo === 'faixa') {
      if (!d.faixas?.length) erros.push(`Dimensão "${d.codigo}" não tem faixas.`);
      const faixas = [...(d.faixas ?? [])].sort((a, b) => a.min - b.min);
      for (let i = 1; i < faixas.length; i++) {
        const anterior = faixas[i - 1]!;
        if (anterior.max === null || anterior.max >= faixas[i]!.min) {
          erros.push(`Dimensão "${d.codigo}": as faixas "${anterior.codigo}" e "${faixas[i]!.codigo}" se sobrepõem.`);
        }
      }
    }
  }
  const valorValido = (dimensao: string, valor: string) => {
    if (valor === '*') return true;
    const d = dims.get(dimensao);
    if (!d) return false;
    return d.tipo === 'categoria' ? !!d.valores?.some((v) => v.codigo === valor) : !!d.faixas?.some((f) => f.codigo === valor);
  };

  const prods = new Map(produtos.map((p) => [p.codigo, p]));
  for (const p of produtos) {
    for (const codigo of [...p.dimensoes, ...p.multiplicadores]) {
      if (!dims.has(codigo)) erros.push(`Produto "${p.codigo}" usa a dimensão "${codigo}", que não existe.`);
    }
    for (const codigo of p.multiplicadores) {
      if (dims.get(codigo)?.tipo !== 'faixa') erros.push(`Produto "${p.codigo}": o multiplicador "${codigo}" precisa ser uma dimensão numérica (faixa).`);
    }
    if (p.ativo && !tabela.itens.some((i) => i.produto === p.codigo)) {
      erros.push(`Produto ativo "${p.codigo}" não tem preço na tabela.`);
    }
    for (const c of p.componentes) {
      if (c.ativo && c.obrigatorio && p.ativo && !tabela.itens.some((i) => i.produto === p.codigo && i.componente === c.codigo)) {
        erros.push(`Componente obrigatório "${c.codigo}" de "${p.codigo}" não tem preço na tabela.`);
      }
    }
  }

  tabela.itens.forEach((item, i) => {
    const rotulo = `Item ${i + 1} da tabela`;
    const produto = prods.get(item.produto);
    if (!produto) return void erros.push(`${rotulo}: produto "${item.produto}" não existe.`);
    if (item.componente !== null && !produto.componentes.some((c) => c.codigo === item.componente)) {
      erros.push(`${rotulo}: componente "${item.componente}" não existe em "${item.produto}".`);
    }
    if (!(Number(item.precoBase) >= 0)) erros.push(`${rotulo}: preço base inválido.`);
    for (const [dimensao, valor] of Object.entries(item.dimensoes)) {
      if (!valorValido(dimensao, valor)) erros.push(`${rotulo}: "${dimensao}" = "${valor}" não está cadastrado.`);
    }
  });

  for (const f of tabela.fatores) {
    if (!valorValido(f.dimensao, f.valor)) erros.push(`Fator "${f.codigo}": "${f.dimensao}" = "${f.valor}" não está cadastrado.`);
    if (f.produto && !prods.has(f.produto)) erros.push(`Fator "${f.codigo}": produto "${f.produto}" não existe.`);
    if (!Number.isFinite(Number(f.ajuste))) erros.push(`Fator "${f.codigo}": ajuste inválido.`);
  }

  // Etapas: ids únicos, exatamente um preço base, bases calculadas antes do uso.
  const ids = new Set<string>();
  const deducoes = new Set<string>();
  let precoBase = 0;
  let houveDeducao = false;
  for (const etapa of politica.etapas) {
    if (ids.has(etapa.id)) erros.push(`Etapa "${etapa.id}" está repetida.`);
    if (etapa.tipo === 'preco_base') precoBase += 1;
    else if (precoBase === 0) erros.push(`Etapa "${etapa.id}" vem antes do preço base.`);
    if (TIPOS_QUE_MUDAM_PRECO.includes(etapa.tipo) && houveDeducao && etapa.tipo !== 'preco_base') {
      avisos.push(`Etapa "${etapa.id}" altera o preço depois de uma dedução já calculada; confira a base de incidência.`);
    }
    const conferirBase = (base: { de: string; menos?: string[] } | null | undefined, dono: string) => {
      if (!base) return;
      if (base.de !== 'preco' && !ids.has(base.de)) erros.push(`${dono}: a base "${base.de}" não é uma etapa anterior.`);
      for (const m of base.menos ?? []) if (!deducoes.has(m)) erros.push(`${dono}: "${m}" não foi deduzido antes.`);
    };
    if (etapa.tipo === 'comissao' || etapa.tipo === 'impostos' || etapa.tipo === 'custos') {
      conferirBase(etapa.base, `Etapa "${etapa.id}"`);
      const categorias = etapa.tipo === 'impostos' ? ['imposto'] : etapa.tipo === 'custos' ? ['cobranca', 'custo_variavel'] : [];
      for (const c of regras.custos.filter((x) => categorias.includes(x.categoria))) {
        conferirBase(c.base, `Parâmetro "${c.codigo}"`);
        deducoes.add(c.codigo);
      }
      if (etapa.tipo === 'comissao' && etapa.modo === 'acrescenta_ao_preco' && etapa.base.de !== 'preco') {
        erros.push(`Etapa "${etapa.id}": comissão acrescida ao preço exige base "preco".`);
      }
    }
    if (TIPOS_DE_DEDUCAO.includes(etapa.tipo) || etapa.tipo === 'extensao') {
      deducoes.add(etapa.id);
      houveDeducao = houveDeducao || TIPOS_DE_DEDUCAO.includes(etapa.tipo);
    }
    ids.add(etapa.id);
  }
  if (precoBase !== 1) erros.push('A política precisa de exatamente uma etapa de preço base.');
  for (const tipo of ['desconto', 'comissao'] as const) {
    if (politica.etapas.filter((e) => e.tipo === tipo).length > 1) erros.push(`A política tem mais de uma etapa de ${tipo}.`);
  }
  const iCampanha = politica.etapas.findIndex((e) => e.tipo === 'campanha');
  const iDesconto = politica.etapas.findIndex((e) => e.tipo === 'desconto');
  if (iCampanha >= 0 && iDesconto >= 0 && iDesconto < iCampanha) {
    avisos.push('Desconto antes de campanha: campanhas que não acumulam com desconto serão sempre preteridas quando houver desconto.');
  }

  const l = politica.limites;
  if (!(l.descontoLivrePct >= 0 && l.descontoLivrePct <= l.descontoMaximoPct && l.descontoMaximoPct < 100)) {
    erros.push('Limites de desconto incoerentes: livre ≤ máximo < 100%.');
  }
  if (!(l.margemMinimaPct <= l.margemMetaPct)) erros.push('A margem mínima não pode ser maior que a meta.');
  const niveis = new Set<number>();
  for (const a of politica.alcadas) {
    if (niveis.has(a.nivel)) erros.push(`Nível de alçada ${a.nivel} repetido.`);
    niveis.add(a.nivel);
    if (a.descontoAtePct > l.descontoMaximoPct) avisos.push(`Alçada "${a.nome}" libera desconto acima do máximo da política.`);
    if ((a.margemMinimaPct ?? l.margemMinimaPct) < l.margemMinimaPct) erros.push(`Alçada "${a.nome}" tem piso de margem abaixo do mínimo da política.`);
  }
  if (politica.alcadas.length === 0) avisos.push('Sem alçadas: toda cotação fora da regra ficará bloqueada.');
  if (![0, 1, 2, 3, 4].includes(politica.arredondamento.casas)) erros.push('Casas decimais devem estar entre 0 e 4.');
  for (const c of politica.comissoes) {
    if (!(c.pct >= 0 && c.pct < 100)) erros.push(`Comissão inválida para o canal "${c.canal}".`);
    if (c.produto && !prods.has(c.produto)) erros.push(`Comissão do canal "${c.canal}": produto "${c.produto}" não existe.`);
  }
  const moedasComCambio = new Set((regras.cambios ?? []).filter((x) => Number(x.taxa) > 0).map((x) => x.moeda));
  for (const x of regras.cambios ?? []) {
    if (!(Number(x.taxa) > 0)) erros.push(`Câmbio de referência de ${x.moeda} com taxa inválida.`);
  }
  for (const c of regras.custos) {
    if (!(Number(c.valor) >= 0)) erros.push(`Parâmetro de custo "${c.codigo}" com valor inválido.`);
    if (c.produto && !prods.has(c.produto)) erros.push(`Parâmetro de custo "${c.codigo}": produto "${c.produto}" não existe.`);
    if (c.moeda && c.moeda !== tabela.moeda) {
      if (c.tipo === 'percentual') erros.push(`Parâmetro de custo "${c.codigo}": custo percentual não pode ter moeda própria.`);
      else if (!moedasComCambio.has(c.moeda)) erros.push(`Parâmetro de custo "${c.codigo}" está em ${c.moeda}, sem câmbio de referência vigente.`);
    }
    for (const [dimensao, valores] of Object.entries(c.condicoes ?? {})) {
      for (const v of valores) if (!valorValido(dimensao, v)) erros.push(`Parâmetro de custo "${c.codigo}": condição "${dimensao}" = "${v}" não está cadastrada.`);
    }
  }
  const cv = politica.comissaoVendedor;
  if (cv) {
    if (!(cv.pct >= 0 && cv.pct <= 100)) erros.push('Comissão do vendedor com percentual fora de 0 a 100%.');
    if (cv.base !== 'margem' && cv.base !== 'receita') erros.push('Comissão do vendedor: base deve ser "margem" ou "receita".');
    if (cv.margemMinimaPct !== undefined && cv.base !== 'margem') avisos.push('Comissão do vendedor: o piso de margem só vale para a base "margem".');
  }
  if (l.folgaCambialMinimaPct !== undefined && !(l.folgaCambialMinimaPct >= 0)) erros.push('A folga cambial mínima não pode ser negativa.');
  for (const c of regras.campanhas) {
    if (c.inicio > c.fim) erros.push(`Campanha "${c.codigo}": início depois do fim.`);
  }

  return { erros, avisos };
}
