import {
  type Dec,
  UM,
  ZERO,
  arredondar,
  dec,
  dividir,
  multiplicar,
  paraNumero,
  percentualDe,
  somar,
  subtrair,
} from './decimal.ts';
import { especificidade, resolverDimensoes } from './dimensoes.ts';
import { ErroMotor } from './erros.ts';
import type {
  BaseIncidencia,
  Campanha,
  ConjuntoRegras,
  Etapa,
  LinhaDetalhe,
  OpcoesCalculo,
  ParametroCusto,
  PedidoCotacao,
  Produto,
  Resultado,
} from './tipos.ts';
import { avaliarPolitica } from './veredito.ts';
import { VERSAO_MOTOR } from './versao.ts';

interface Estado {
  preco: Dec;
  /** Preço logo após cada etapa, por id. */
  marcos: Map<string, Dec>;
  /** Valores deduzidos da margem, por id de etapa e por código de parâmetro. */
  deducoes: Map<string, Dec>;
  linhas: LinhaDetalhe[];
  avisos: string[];
  precoBase: Dec;
  descontoPctAplicado: number;
  descontoValor: Dec;
  descontoAbsorvido: boolean;
  descontoJaAplicado: boolean;
  campanhaValor: Dec;
  campanhasAplicadas: string[];
  comissaoPct: number;
  comissaoValor: Dec;
  impostosValor: Dec;
  custosValor: Dec;
}

const DATA_ISO = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Calcula uma cotação. Função pura: recebe o pedido e o conjunto de regras
 * vigente, devolve o preço, o detalhamento passo a passo e o veredito de política.
 */
export function calcular(pedido: PedidoCotacao, regras: ConjuntoRegras, opcoes: OpcoesCalculo = {}): Resultado {
  const { politica, tabela } = regras;
  const { casas, modo } = politica.arredondamento;
  const arred = (v: Dec) => arredondar(v, casas, modo);
  const num = (v: Dec) => paraNumero(arred(v));

  if (!DATA_ISO.test(pedido.data)) {
    throw new ErroMotor('DATA_INVALIDA', 'A data de referência deve estar no formato AAAA-MM-DD.', { data: pedido.data });
  }
  const descontoPedido = pedido.descontoPct ?? 0;
  if (!Number.isFinite(descontoPedido) || descontoPedido < 0 || descontoPedido >= 100) {
    throw new ErroMotor('DESCONTO_INVALIDO', 'O desconto deve estar entre 0% e 100%.', { descontoPct: descontoPedido });
  }

  const produto = regras.produtos.find((p) => p.codigo === pedido.produto);
  if (!produto) throw new ErroMotor('PRODUTO_DESCONHECIDO', `Produto "${pedido.produto}" não existe.`, { produto: pedido.produto });
  if (!produto.ativo) throw new ErroMotor('PRODUTO_INATIVO', `Produto "${produto.nome}" está inativo.`, { produto: produto.codigo });

  const dims = resolverDimensoes(produto, regras.dimensoes, pedido.dimensoes);
  const componentes = selecionarComponentes(produto, pedido.componentes ?? []);

  let multiplicador = UM;
  for (const codigo of produto.multiplicadores) {
    multiplicador = multiplicar(multiplicador, dec(dims.numeros[codigo] ?? 1));
  }

  const comissaoTabelaPct = comissaoDaTabela(regras, pedido.canal ?? null, produto.codigo);
  const comissaoPct = pedido.comissaoPct ?? comissaoTabelaPct;
  if (!Number.isFinite(comissaoPct) || comissaoPct < 0 || comissaoPct >= 100) {
    throw new ErroMotor('COMISSAO_INVALIDA', 'A comissão deve estar entre 0% e 100%.', { comissaoPct });
  }

  const estado: Estado = {
    preco: ZERO,
    marcos: new Map(),
    deducoes: new Map(),
    linhas: [],
    avisos: [],
    precoBase: ZERO,
    descontoPctAplicado: 0,
    descontoValor: ZERO,
    descontoAbsorvido: false,
    descontoJaAplicado: false,
    campanhaValor: ZERO,
    campanhasAplicadas: [],
    comissaoPct,
    comissaoValor: ZERO,
    impostosValor: ZERO,
    custosValor: ZERO,
  };

  const linha = (etapa: Etapa, descricao: string, valor: Dec, extra: Partial<LinhaDetalhe> = {}) => {
    estado.linhas.push({
      etapa: etapa.id,
      tipo: etapa.tipo,
      descricao,
      valor: num(valor),
      precoApos: num(estado.preco),
      interno: false,
      ...extra,
    });
  };

  const baseDe = (base: BaseIncidencia, etapa: Etapa): Dec => {
    let valor: Dec;
    if (base.de === 'preco') valor = estado.preco;
    else {
      const marco = estado.marcos.get(base.de);
      if (marco === undefined) {
        throw new ErroMotor('POLITICA_INVALIDA', `A etapa "${etapa.id}" usa como base "${base.de}", que não foi calculada antes dela.`, {
          etapa: etapa.id,
          base: base.de,
        });
      }
      valor = marco;
    }
    for (const id of base.menos ?? []) {
      const deducao = estado.deducoes.get(id);
      if (deducao === undefined) {
        throw new ErroMotor('POLITICA_INVALIDA', `A etapa "${etapa.id}" subtrai "${id}", que não foi calculado antes dela.`, {
          etapa: etapa.id,
          menos: id,
        });
      }
      valor = subtrair(valor, deducao);
    }
    return valor;
  };

  for (const etapa of politica.etapas) {
    switch (etapa.tipo) {
      case 'preco_base': {
        let soma = ZERO;
        for (const componente of componentes) {
          const unitario = dec(precoDoItem(regras, produto, componente.codigo, dims.codigos));
          soma = somar(soma, unitario);
          estado.preco = multiplicar(soma, multiplicador);
          const rotulo = componente.codigo === null ? produto.nome : `${produto.nome}: ${componente.nome}`;
          linha(etapa, `Preço de tabela: ${rotulo}`, multiplicar(unitario, multiplicador), {
            base: num(unitario),
          });
        }
        estado.preco = arred(multiplicar(soma, multiplicador));
        estado.precoBase = estado.preco;
        break;
      }

      case 'fatores': {
        const aplicaveis = tabela.fatores.filter(
          (f) =>
            (!f.produto || f.produto === produto.codigo) &&
            (etapa.grupo === undefined || (f.grupo ?? null) === etapa.grupo) &&
            (f.valor === '*' ? dims.codigos[f.dimensao] !== undefined : dims.codigos[f.dimensao] === f.valor),
        );
        const inicio = estado.preco;
        for (const fator of aplicaveis) {
          const ajuste = dec(fator.ajuste);
          const base = etapa.composicao === 'aditiva' ? inicio : estado.preco;
          const valor = fator.tipo === 'percentual' ? percentualDe(base, ajuste) : ajuste;
          estado.preco = arred(somar(estado.preco, valor));
          linha(etapa, `Fator: ${fator.nome}`, valor, {
            base: num(base),
            ...(fator.tipo === 'percentual' ? { percentual: paraNumero(ajuste) } : {}),
          });
        }
        break;
      }

      case 'campanha': {
        const escolhidas = escolherCampanhas(regras.campanhas, pedido, produto, dims.codigos, estado, descontoPedido);
        for (const campanha of escolhidas) {
          const valor = reducaoCampanha(campanha, estado.preco);
          const base = estado.preco;
          estado.preco = arred(subtrair(estado.preco, valor));
          estado.campanhaValor = somar(estado.campanhaValor, valor);
          estado.campanhasAplicadas.push(campanha.codigo);
          linha(etapa, `Campanha: ${campanha.nome}`, -valor, {
            base: num(base),
            ...(campanha.tipo === 'percentual' ? { percentual: Number(campanha.valor) } : {}),
          });
        }
        break;
      }

      case 'desconto': {
        estado.descontoJaAplicado = true;
        if (descontoPedido <= 0) break;
        if (estado.descontoAbsorvido) {
          estado.avisos.push('O desconto solicitado não foi aplicado: a campanha vigente não acumula com desconto e é mais vantajosa.');
          break;
        }
        const base = estado.preco;
        const valor = percentualDe(base, dec(descontoPedido));
        estado.preco = arred(subtrair(estado.preco, valor));
        estado.descontoPctAplicado = descontoPedido;
        estado.descontoValor = somar(estado.descontoValor, valor);
        linha(etapa, 'Desconto solicitado', -valor, { base: num(base), percentual: descontoPedido });
        break;
      }

      case 'comissao': {
        if (comissaoPct <= 0) {
          estado.deducoes.set(etapa.id, ZERO);
          break;
        }
        const pct = dec(comissaoPct);
        let valor: Dec;
        let base: Dec;
        if (etapa.modo === 'acrescenta_ao_preco') {
          // Comissão "por dentro": o preço sobe para que o líquido se mantenha.
          const divisor = subtrair(UM, dividir(pct, dec(100)));
          estado.preco = arred(dividir(estado.preco, divisor));
          base = estado.preco;
          valor = arred(percentualDe(base, pct));
        } else {
          base = baseDe(etapa.base, etapa);
          valor = arred(percentualDe(base, pct));
        }
        estado.comissaoValor = somar(estado.comissaoValor, valor);
        estado.deducoes.set(etapa.id, valor);
        linha(etapa, 'Comissão do canal', -valor, { base: num(base), percentual: comissaoPct });
        break;
      }

      case 'impostos':
      case 'custos': {
        const categorias: ParametroCusto['categoria'][] =
          etapa.tipo === 'impostos' ? ['imposto'] : ['cobranca', 'custo_variavel'];
        let total = ZERO;
        for (const parametro of regras.custos) {
          if (!categorias.includes(parametro.categoria)) continue;
          if (parametro.produto && parametro.produto !== produto.codigo) continue;
          const bruto = dec(parametro.valor);
          let valor: Dec;
          let base: Dec | undefined;
          if (parametro.tipo === 'percentual') {
            base = baseDe(parametro.base ?? etapa.base, etapa);
            valor = percentualDe(base, bruto);
          } else if (parametro.tipo === 'valor_por_unidade') {
            valor = multiplicar(bruto, multiplicador);
          } else {
            valor = bruto;
          }
          valor = arred(valor);
          total = somar(total, valor);
          estado.deducoes.set(parametro.codigo, valor);
          linha(etapa, `${etapa.tipo === 'impostos' ? 'Imposto' : 'Custo'}: ${parametro.nome}`, -valor, {
            interno: true,
            ...(base !== undefined ? { base: num(base), percentual: paraNumero(bruto) } : {}),
          });
        }
        estado.deducoes.set(etapa.id, total);
        if (etapa.tipo === 'impostos') estado.impostosValor = somar(estado.impostosValor, total);
        else estado.custosValor = somar(estado.custosValor, total);
        break;
      }

      case 'arredondamento': {
        estado.preco = arred(estado.preco);
        break;
      }

      case 'extensao': {
        const funcao = opcoes.extensoes?.[etapa.funcao];
        if (!funcao) {
          throw new ErroMotor('EXTENSAO_DESCONHECIDA', `A função de extensão "${etapa.funcao}" não está instalada.`, {
            etapa: etapa.id,
            funcao: etapa.funcao,
          });
        }
        const retorno = funcao({
          pedido,
          regras,
          preco: num(estado.preco),
          multiplicador: paraNumero(multiplicador),
          dimensoesResolvidas: { ...dims.codigos },
          parametros: etapa.parametros ?? {},
        });
        const antes = estado.preco;
        if (retorno.preco !== undefined) estado.preco = arred(dec(retorno.preco));
        if (retorno.deducao !== undefined) {
          const deducao = arred(dec(retorno.deducao));
          estado.deducoes.set(etapa.id, deducao);
          estado.custosValor = somar(estado.custosValor, deducao);
          linha(etapa, retorno.descricao ?? etapa.nome ?? etapa.funcao, -deducao, { interno: retorno.interno ?? true });
        } else if (retorno.preco !== undefined) {
          linha(etapa, retorno.descricao ?? etapa.nome ?? etapa.funcao, subtrair(estado.preco, antes), {
            interno: retorno.interno ?? false,
          });
        }
        break;
      }
    }
    estado.marcos.set(etapa.id, estado.preco);
  }

  const precoFinal = arred(estado.preco);
  if (precoFinal <= ZERO) {
    throw new ErroMotor('PRECO_NAO_POSITIVO', 'O cálculo resultou em preço zero ou negativo.', { preco: paraNumero(precoFinal) });
  }

  const deducoesTotais = somar(somar(estado.comissaoValor, estado.impostosValor), estado.custosValor);
  const receitaLiquida = subtrair(precoFinal, somar(estado.comissaoValor, estado.impostosValor));
  const margemValor = subtrair(precoFinal, deducoesTotais);
  const margemPct = paraNumero(arredondar(multiplicar(dividir(margemValor, precoFinal), dec(100)), 2));

  estado.linhas.push({
    etapa: 'resultado',
    tipo: 'margem',
    descricao: 'Margem de contribuição',
    valor: num(margemValor),
    percentual: margemPct,
    precoApos: num(precoFinal),
    interno: true,
  });

  const comissaoForaTabela = comissaoPct > comissaoTabelaPct;
  const veredito = avaliarPolitica(politica, {
    descontoPct: estado.descontoPctAplicado,
    margemPct,
    comissaoPct,
    comissaoTabelaPct,
    comissaoForaTabela,
  });

  return {
    moeda: tabela.moeda,
    precoBase: num(estado.precoBase),
    precoFinal: num(precoFinal),
    multiplicador: paraNumero(multiplicador),
    componentes: componentes.map((c) => c.codigo).filter((c): c is string => c !== null),
    dimensoesResolvidas: dims.codigos,
    descontoPct: estado.descontoPctAplicado,
    descontoValor: num(estado.descontoValor),
    campanhas: estado.campanhasAplicadas,
    campanhaValor: num(estado.campanhaValor),
    canal: pedido.canal ?? null,
    comissaoPct,
    comissaoTabelaPct,
    comissaoValor: num(estado.comissaoValor),
    comissaoForaTabela,
    impostosValor: num(estado.impostosValor),
    custosValor: num(estado.custosValor),
    receitaLiquida: num(receitaLiquida),
    margemValor: num(margemValor),
    margemPct,
    veredito,
    detalhamento: estado.linhas,
    versoes: {
      motor: VERSAO_MOTOR,
      tabela: { id: tabela.id, versao: tabela.versao },
      politica: { id: politica.id, versao: politica.versao },
    },
    avisos: estado.avisos,
  };
}

function selecionarComponentes(produto: Produto, escolhidos: string[]): { codigo: string | null; nome: string }[] {
  if (produto.componentes.length === 0) return [{ codigo: null, nome: produto.nome }];
  for (const codigo of escolhidos) {
    const componente = produto.componentes.find((c) => c.codigo === codigo);
    if (!componente || !componente.ativo) {
      throw new ErroMotor('COMPONENTE_DESCONHECIDO', `Componente "${codigo}" não existe ou está inativo em "${produto.nome}".`, {
        produto: produto.codigo,
        componente: codigo,
      });
    }
  }
  return produto.componentes
    .filter((c) => c.ativo && (c.obrigatorio || escolhidos.includes(c.codigo)))
    .map((c) => ({ codigo: c.codigo, nome: c.nome }));
}

function precoDoItem(
  regras: ConjuntoRegras,
  produto: Produto,
  componente: string | null,
  codigos: Record<string, string>,
): number | string {
  let melhor: { pontos: number; preco: number | string } | null = null;
  let empate = false;
  for (const item of regras.tabela.itens) {
    if (item.produto !== produto.codigo || (item.componente ?? null) !== componente) continue;
    const pontos = especificidade(item.dimensoes, codigos);
    if (pontos < 0) continue;
    if (!melhor || pontos > melhor.pontos) {
      melhor = { pontos, preco: item.precoBase };
      empate = false;
    } else if (pontos === melhor.pontos) {
      empate = true;
    }
  }
  if (!melhor) {
    throw new ErroMotor('SEM_PRECO', `Não há preço na tabela vigente para "${produto.nome}" com as dimensões informadas.`, {
      produto: produto.codigo,
      componente,
      dimensoes: codigos,
    });
  }
  if (empate) {
    throw new ErroMotor('PRECO_AMBIGUO', `A tabela tem mais de um preço igualmente específico para "${produto.nome}".`, {
      produto: produto.codigo,
      componente,
      dimensoes: codigos,
    });
  }
  return melhor.preco;
}

function comissaoDaTabela(regras: ConjuntoRegras, canal: string | null, produto: string): number {
  if (!canal) return 0;
  const linhas = regras.politica.comissoes.filter((c) => c.canal === canal);
  const especifica = linhas.find((c) => c.produto === produto);
  const geral = linhas.find((c) => !c.produto);
  return (especifica ?? geral)?.pct ?? 0;
}

function reducaoCampanha(campanha: Campanha, preco: Dec): Dec {
  const valor = dec(campanha.valor);
  if (campanha.tipo === 'percentual') return percentualDe(preco, valor);
  return valor > preco ? preco : valor;
}

function escolherCampanhas(
  campanhas: Campanha[],
  pedido: PedidoCotacao,
  produto: Produto,
  codigos: Record<string, string>,
  estado: Estado,
  descontoPedido: number,
): Campanha[] {
  const aplicaveis = campanhas.filter((c) => {
    if (pedido.data < c.inicio || pedido.data > c.fim) return false;
    if (c.produtos?.length && !c.produtos.includes(produto.codigo)) return false;
    if (c.canais?.length && !(pedido.canal && c.canais.includes(pedido.canal))) return false;
    for (const [dimensao, aceitos] of Object.entries(c.condicoes ?? {})) {
      const valor = codigos[dimensao];
      if (valor === undefined || !aceitos.includes(valor)) return false;
    }
    return true;
  });
  if (aplicaveis.length === 0) return [];

  const total = (lista: Campanha[]) => lista.reduce((soma, c) => somar(soma, reducaoCampanha(c, estado.preco)), ZERO);

  // Regra de acumulação entre campanhas: ou todas as acumuláveis juntas,
  // ou a melhor campanha exclusiva, o que reduzir mais o preço.
  const acumulaveis = aplicaveis.filter((c) => c.acumulaComOutras);
  const exclusivas = aplicaveis.filter((c) => !c.acumulaComOutras);
  let escolhidas = acumulaveis;
  if (exclusivas.length > 0) {
    const melhor = exclusivas.reduce((a, b) => (reducaoCampanha(b, estado.preco) > reducaoCampanha(a, estado.preco) ? b : a));
    if (reducaoCampanha(melhor, estado.preco) > total(acumulaveis)) escolhidas = [melhor];
  }

  // Regra de acumulação com o desconto do vendedor.
  const naoAcumulam = escolhidas.filter((c) => !c.acumulaComDesconto);
  if (descontoPedido > 0 && naoAcumulam.length > 0) {
    const nomes = naoAcumulam.map((c) => c.nome).join(', ');
    if (estado.descontoJaAplicado) {
      estado.avisos.push(`Campanha não aplicada por não acumular com desconto: ${nomes}.`);
      return escolhidas.filter((c) => c.acumulaComDesconto);
    }
    const valorDesconto = percentualDe(estado.preco, dec(descontoPedido));
    if (total(naoAcumulam) >= valorDesconto) {
      estado.descontoAbsorvido = true;
    } else {
      estado.avisos.push(`Campanha não aplicada por não acumular com desconto: ${nomes}.`);
      return escolhidas.filter((c) => c.acumulaComDesconto);
    }
  }
  return escolhidas;
}
