import { type PedidoCotacao, type Resultado, type ResultadoPublico, calcular, resultadoPublico } from '@pricing/motor';
import { z } from 'zod';
import { type Requisicao, type Rota, validar } from '../app.ts';
import { type Ator, canaisDoAtor, ehExterno, ehInterno, hoje, somarDias, temPapel } from '../contexto.ts';
import { cifrar, hmac, soDigitos } from '../cripto.ts';
import { ErroHttp, conflito, invalido, naoEncontrado, proibido } from '../erros.ts';
import { gerarProposta } from '../pdf.ts';
import { type RegrasCarregadas, carregarRegras } from '../regras.ts';

export const esquemaPedido = z.object({
  produto: z.string().min(1).max(60),
  componentes: z.array(z.string().max(60)).max(30).optional(),
  dimensoes: z.record(z.union([z.string().max(60), z.number().finite()])),
  descontoPct: z.number().min(0).lt(100).optional(),
  canal: z.string().max(60).nullish(),
  comissaoPct: z.number().min(0).lt(100).nullish(),
});

const esquemaCliente = z.object({
  nome: z.string().trim().min(2).max(160),
  email: z.string().email().max(200).nullish(),
  documento: z.string().max(30).nullish(),
});

const esquemaCriar = z.object({
  pedido: esquemaPedido,
  cliente: esquemaCliente,
  unidade: z.string().max(60).nullish(),
  observacao: z.string().max(1000).nullish(),
  origem: z.enum(['web', 'contingencia', 'email']).optional(),
});

export interface Calculo {
  pedido: PedidoCotacao;
  resultado: Resultado;
  publico: ResultadoPublico;
  carregadas: RegrasCarregadas;
  canalId: string | null;
}

/** Quem cota: vendedor, usuário de canal, gestor de pricing; suporte só fora de produção. */
function exigirQuemCota(r: Requisicao) {
  const { ator, deps } = r;
  if (ator.tipo === 'chave_api') {
    if (!ator.chave?.escopos.includes('cotar')) throw proibido('Esta chave não tem o escopo de cotação.');
    return;
  }
  if (temPapel(ator, 'vendedor', 'canal', 'gestor_pricing')) return;
  if (temPapel(ator, 'suporte') && deps.config.ambiente !== 'producao') return;
  throw proibido('Seu perfil não cota.');
}

/** Resolve o canal do pedido conforme o escopo do ator e chama o motor. */
export async function calcularPedido(r: Requisicao, entrada: z.infer<typeof esquemaPedido>, data = hoje(r.deps)): Promise<Calculo> {
  const { ator, tx, deps } = r;
  const carregadas = await carregarRegras(tx, ator.orgId, data);
  const proprios = canaisDoAtor(ator);
  let canal = carregadas.canais.find((c) => c.codigo === entrada.canal) ?? null;
  if (entrada.canal && !canal) throw invalido(`Canal "${entrada.canal}" não existe.`);

  const externo = ator.tipo === 'chave_api' || (temPapel(ator, 'canal') && !temPapel(ator, 'vendedor', 'gestor_pricing'));
  if (externo) {
    // escopo de canal: nunca ultrapassa o próprio canal
    if (canal && !proprios.includes(canal.id)) throw proibido('Você só cota pelo seu próprio canal.');
    if (!canal) {
      if (proprios.length !== 1) throw invalido('Informe por qual canal a cotação está sendo feita.');
      canal = carregadas.canais.find((c) => c.id === proprios[0]) ?? null;
    }
    if (entrada.comissaoPct !== null && entrada.comissaoPct !== undefined) {
      throw proibido('A comissão é definida pela tabela do canal.');
    }
  }
  if (canal && !canal.ativo) throw conflito(`O canal "${canal.nome}" está inativo.`);

  const pedido: PedidoCotacao = {
    produto: entrada.produto,
    ...(entrada.componentes?.length ? { componentes: entrada.componentes } : {}),
    dimensoes: entrada.dimensoes,
    descontoPct: entrada.descontoPct ?? 0,
    canal: canal?.codigo ?? null,
    ...(entrada.comissaoPct !== null && entrada.comissaoPct !== undefined ? { comissaoPct: entrada.comissaoPct } : {}),
    data,
  };
  const resultado = calcular(pedido, carregadas.regras, { extensoes: deps.extensoes });
  return { pedido, resultado, publico: resultadoPublico(resultado), carregadas, canalId: canal?.id ?? null };
}

/** O corte de custo e margem é feito no servidor, não escondendo campos na tela. */
export function apresentar(ator: Ator, c: { resultado: Resultado; publico: ResultadoPublico }): Resultado | ResultadoPublico {
  return ehExterno(ator) ? c.publico : c.resultado;
}

interface LinhaCotacao {
  id: string;
  org_id: string;
  numero: number;
  status: string;
  dono_id: string | null;
  chave_api_id: string | null;
  canal_id: string | null;
  produto_id: string;
  versao_atual: number;
  versao_atual_id: string | null;
  validade: string | null;
  cliente_nome: string;
  cliente_email: string | null;
  criado_em: Date;
}

function ehDono(ator: Ator, c: LinhaCotacao): boolean {
  if (ator.tipo === 'chave_api') return c.chave_api_id === ator.chave?.id;
  return c.dono_id !== null && c.dono_id === ator.id;
}

/** Busca a cotação (travando a linha) e confere o escopo do ator. */
export async function obterCotacao(r: Requisicao, id: string, modo: 'ler' | 'dono' | 'dono_ou_gestor'): Promise<LinhaCotacao> {
  if (!/^[0-9a-f-]{36}$/i.test(id)) throw naoEncontrado('Cotação não encontrada.');
  const [c] = await r.tx<LinhaCotacao[]>`
    select id, org_id, numero, status, dono_id, chave_api_id, canal_id, produto_id, versao_atual, versao_atual_id,
           validade::text, cliente_nome, cliente_email, criado_em
    from public.cotacoes where id = ${id} and org_id = ${r.ator.orgId} for update`;
  if (!c) throw naoEncontrado('Cotação não encontrada.');
  const dono = ehDono(r.ator, c);
  const gestor = r.ator.tipo === 'usuario' && temPapel(r.ator, 'gestor_pricing');
  if (modo === 'ler' && !(dono || (r.ator.tipo === 'usuario' && ehInterno(r.ator)))) throw naoEncontrado('Cotação não encontrada.');
  if (modo === 'dono' && !dono) throw proibido('Só o dono da cotação pode fazer isto.');
  if (modo === 'dono_ou_gestor' && !(dono || gestor)) throw proibido('Só o dono da cotação ou o gestor de pricing pode fazer isto.');
  return c;
}

async function gravarVersao(r: Requisicao, cotacaoId: string, versao: number, c: Calculo): Promise<string> {
  const { resultado: x } = c;
  const [v] = await r.tx<{ id: string }[]>`
    insert into public.cotacao_versoes (org_id, cotacao_id, versao, entrada, resultado, resultado_publico, tabela_id, politica_id,
      motor_versao, moeda, preco_base, preco_final, desconto_pct, comissao_pct, comissao_valor, margem_valor, margem_pct,
      veredito, nivel_alcada, criado_por)
    values (${r.ator.orgId}, ${cotacaoId}, ${versao}, ${r.tx.json(c.pedido as never)}, ${r.tx.json(x as never)}, ${r.tx.json(c.publico as never)},
      ${c.carregadas.tabelaId}, ${c.carregadas.politicaId}, ${x.versoes.motor}, ${x.moeda}, ${x.precoBase}, ${x.precoFinal},
      ${x.descontoPct}, ${x.comissaoPct}, ${x.comissaoValor}, ${x.margemValor}, ${x.margemPct},
      ${x.veredito.status}, ${x.veredito.nivelAlcada}, ${r.ator.tipo === 'usuario' ? r.ator.id : null})
    returning id`;
  return v!.id;
}

async function unidadeDoAtor(r: Requisicao, codigo: string | null | undefined): Promise<string | null> {
  const { ator, tx } = r;
  if (ator.tipo !== 'usuario') return null;
  const escopos = ator.papeis.filter((p) => p.papel === 'vendedor');
  const livre = escopos.length === 0 || escopos.some((p) => p.unidadeId === null);
  if (!codigo) return livre ? null : (escopos[0]?.unidadeId ?? null);
  const [u] = await tx<{ id: string }[]>`select id from public.unidades where org_id = ${ator.orgId} and codigo = ${codigo} and ativo`;
  if (!u) throw invalido(`Unidade "${codigo}" não existe.`);
  if (!livre && !escopos.some((p) => p.unidadeId === u.id) && !temPapel(ator, 'gestor_pricing')) {
    throw proibido('Você não cota por esta unidade.');
  }
  return u.id;
}

export async function criarCotacao(r: Requisicao, dados: z.infer<typeof esquemaCriar>, origem: string) {
  const { ator, tx, deps } = r;
  exigirQuemCota(r);
  const c = await calcularPedido(r, dados.pedido);
  const unidadeId = await unidadeDoAtor(r, dados.unidade);
  const [{ numero } = { numero: 0 }] = await tx<{ numero: number }[]>`select app.proximo_numero(${ator.orgId}, 'cotacao')::int as numero`;
  const [cot] = await tx<{ id: string }[]>`
    insert into public.cotacoes (org_id, numero, cliente_nome, cliente_email, canal_id, unidade_id, dono_id, chave_api_id, produto_id, origem, observacao)
    values (${ator.orgId}, ${numero}, ${dados.cliente.nome}, ${dados.cliente.email ?? null}, ${c.canalId}, ${unidadeId},
      ${ator.tipo === 'usuario' ? ator.id : null}, ${ator.chave?.id ?? null}, ${c.carregadas.produtoIds[c.pedido.produto]!},
      ${origem}, ${dados.observacao ?? null})
    returning id`;
  const id = cot!.id;
  const documento = soDigitos(dados.cliente.documento ?? '');
  if (documento) {
    await tx`insert into public.cotacao_dados_pessoais (cotacao_id, org_id, documento_cifrado, documento_hash)
             values (${id}, ${ator.orgId}, ${await cifrar(deps.config.chaveCifra, documento)}, ${await hmac(deps.config.segredoHash, documento)})`;
  }
  const versaoId = await gravarVersao(r, id, 1, c);
  await tx`update public.cotacoes set versao_atual = 1, versao_atual_id = ${versaoId} where id = ${id}`;
  await r.auditar('cotacao.criada', 'cotacoes', id, {
    resumo: `Cotação ${numero} criada (versão 1).`,
    novo: { numero, versao: 1, precoFinal: c.resultado.precoFinal, veredito: c.resultado.veredito.status },
  });
  return { id, numero, versao: 1, versaoId, status: 'rascunho', calculo: c };
}

const corpoCotacao = (ator: Ator, x: { id: string; numero: number; versao: number; status: string; calculo: Calculo; validade?: string | null }) => ({
  id: x.id,
  numero: x.numero,
  versao: x.versao,
  status: x.status,
  validade: x.validade ?? null,
  resultado: apresentar(ator, x.calculo),
});

export async function emitirCotacao(r: Requisicao, c: LinhaCotacao) {
  const { ator, tx, deps } = r;
  if (!['rascunho', 'aprovada'].includes(c.status)) throw conflito(`Uma cotação com status "${c.status}" não pode ser emitida.`, 'STATUS_INVALIDO');
  const [v] = await tx<{ id: string; versao: number; veredito: string; entrada: PedidoCotacao; resultado_publico: ResultadoPublico; politica_id: string }[]>`
    select id, versao, veredito, entrada, resultado_publico, politica_id from public.cotacao_versoes where id = ${c.versao_atual_id}`;
  if (!v) throw conflito('A cotação não tem versão calculada.');
  if (v.veredito === 'bloqueado') throw conflito('A cotação está bloqueada pela política comercial.', 'BLOQUEADA_PELA_POLITICA');
  if (v.veredito === 'exige_aprovacao' && c.status !== 'aprovada') {
    throw conflito('Esta cotação está fora da política e precisa de exceção aprovada antes de ser emitida.', 'EXIGE_APROVACAO');
  }
  const [pol] = await tx<{ dias: number }[]>`select coalesce((regras ->> 'validadeDias')::int, 15) as dias from public.politicas where id = ${v.politica_id}`;
  const emissao = hoje(deps);
  const validade = somarDias(emissao, pol?.dias ?? 15);

  await tx`update public.cotacoes set status = 'emitida', validade = ${validade}, emitida_em = now() where id = ${c.id}`;

  const [contexto] = await tx<{ config: { identidade?: Record<string, string> }; canal: string | null; vendedor: string | null }[]>`
    select o.config, k.nome as canal, u.nome as vendedor
    from public.organizacoes o
    left join public.canais k on k.id = ${c.canal_id}
    left join public.usuarios u on u.id = ${c.dono_id}
    where o.id = ${ator.orgId}`;
  const carregadas = await carregarRegras(tx, ator.orgId, emissao, { tabelaId: v.resultado_publico.versoes.tabela.id, politicaId: v.politica_id });
  const produto = carregadas.regras.produtos.find((p) => p.codigo === v.entrada.produto)!;
  const pdf = await gerarProposta({
    numero: c.numero,
    versao: v.versao,
    emitidaEm: emissao,
    validade,
    cliente: { nome: c.cliente_nome, email: c.cliente_email },
    canalNome: contexto?.canal ?? null,
    vendedorNome: contexto?.vendedor ?? null,
    produto,
    dimensoes: carregadas.regras.dimensoes,
    entrada: v.entrada,
    resultado: v.resultado_publico,
    identidade: contexto?.config.identidade ?? {},
  });
  const caminho = `${ator.orgId}/${c.id}/proposta-${c.numero}-v${v.versao}.pdf`;
  await deps.armazenamento.salvar('propostas', caminho, pdf, 'application/pdf');
  await tx`insert into public.anexos (org_id, cotacao_id, versao_id, tipo, bucket, caminho, nome, tamanho_bytes, criado_por)
           values (${ator.orgId}, ${c.id}, ${v.id}, 'proposta', 'propostas', ${caminho}, ${`Proposta ${c.numero} v${v.versao}.pdf`}, ${pdf.length},
                   ${ator.tipo === 'usuario' ? ator.id : null})
           on conflict (bucket, caminho) do nothing`;
  await r.auditar('cotacao.emitida', 'cotacoes', c.id, {
    resumo: `Proposta ${c.numero} emitida (versão ${v.versao}), válida até ${validade.split('-').reverse().join('/')}.`,
    novo: { versao: v.versao, validade },
  });
  await r.emitir('cotacao.emitida', { cotacaoId: c.id, numero: c.numero, versao: v.versao, validade, clienteEmail: c.cliente_email });
  return { validade, versao: v.versao };
}

/** Nível que o ator pode liberar: o próprio ou o de quem o designou substituto e está ausente. */
async function alcadaEfetiva(r: Requisicao): Promise<number> {
  const { ator, tx, deps } = r;
  const [x] = await tx<{ nivel: number | null }[]>`
    select max(u.limite_alcada) as nivel from public.usuarios u
    where u.org_id = ${ator.orgId} and u.status = 'ativo'
      and (u.id = ${ator.id} or (u.substituto_id = ${ator.id} and u.ausente_ate >= ${hoje(deps)}::date))`;
  return x?.nivel ?? 0;
}

export const rotasCotacoes: Rota[] = [
  {
    metodo: 'POST',
    caminho: '/cotacoes/simular',
    auth: 'usuario',
    async handler(r) {
      exigirQuemCota(r);
      const c = await calcularPedido(r, validar(esquemaPedido, r.corpo));
      return { corpo: { resultado: apresentar(r.ator, c) } };
    },
  },
  {
    metodo: 'POST',
    caminho: '/cotacoes',
    auth: 'usuario',
    async handler(r) {
      const dados = validar(esquemaCriar, r.corpo);
      if (dados.origem === 'contingencia' && !temPapel(r.ator, 'gestor_pricing', 'vendedor')) throw proibido();
      const nova = await criarCotacao(r, dados, dados.origem ?? 'web');
      return { status: 201, corpo: corpoCotacao(r.ator, nova) };
    },
  },
  {
    metodo: 'POST',
    caminho: '/cotacoes/:id/versoes',
    auth: 'usuario',
    async handler(r) {
      exigirQuemCota(r);
      const dados = validar(z.object({ pedido: esquemaPedido }), r.corpo);
      const c = await obterCotacao(r, r.params.id!, 'dono_ou_gestor');
      if (c.status === 'em_aprovacao') throw conflito('A cotação aguarda decisão de aprovação e não pode ser alterada agora.', 'STATUS_INVALIDO');
      if (!['rascunho', 'recusada', 'aprovada', 'emitida', 'expirada'].includes(c.status)) {
        throw conflito(`Uma cotação "${c.status}" não aceita nova versão.`, 'STATUS_INVALIDO');
      }
      const calculo = await calcularPedido(r, dados.pedido);
      if (calculo.carregadas.produtoIds[calculo.pedido.produto] !== c.produto_id) throw invalido('A nova versão precisa manter o mesmo produto.');
      const versao = c.versao_atual + 1;
      const versaoId = await gravarVersao(r, c.id, versao, calculo);
      // qualquer mudança invalida a aprovação anterior: o pedido volta para análise
      await r.tx`update public.cotacoes set status = 'rascunho', versao_atual = ${versao}, versao_atual_id = ${versaoId},
                   canal_id = ${calculo.canalId}, validade = null, emitida_em = null where id = ${c.id}`;
      await r.auditar('cotacao.nova_versao', 'cotacoes', c.id, {
        resumo: `Versão ${versao} criada.`,
        novo: { versao, precoFinal: calculo.resultado.precoFinal, veredito: calculo.resultado.veredito.status },
      });
      return { status: 201, corpo: corpoCotacao(r.ator, { id: c.id, numero: c.numero, versao, status: 'rascunho', calculo }) };
    },
  },
  {
    metodo: 'POST',
    caminho: '/cotacoes/:id/emitir',
    auth: 'usuario',
    async handler(r) {
      const c = await obterCotacao(r, r.params.id!, 'dono');
      const e = await emitirCotacao(r, c);
      return { corpo: { id: c.id, numero: c.numero, status: 'emitida', ...e } };
    },
  },
  {
    metodo: 'POST',
    caminho: '/cotacoes/:id/aprovacao',
    auth: 'usuario',
    async handler(r) {
      const { ator, tx } = r;
      const dados = validar(
        z.discriminatedUnion('acao', [
          z.object({ acao: z.literal('pedir'), motivo: z.string().trim().min(10, 'Explique o motivo em pelo menos 10 caracteres.').max(1000) }),
          z.object({ acao: z.literal('aprovar'), motivo: z.string().trim().max(1000).optional() }),
          z.object({ acao: z.literal('recusar'), motivo: z.string().trim().min(5, 'A recusa exige motivo.').max(1000) }),
        ]),
        r.corpo,
      );

      if (dados.acao === 'pedir') {
        const c = await obterCotacao(r, r.params.id!, 'dono');
        if (c.status !== 'rascunho') throw conflito(`Só uma cotação em rascunho pode pedir exceção (status atual: ${c.status}).`, 'STATUS_INVALIDO');
        const [v] = await tx<{ id: string; versao: number; veredito: string; nivel_alcada: number | null; politica_id: string }[]>`
          select id, versao, veredito, nivel_alcada, politica_id from public.cotacao_versoes where id = ${c.versao_atual_id}`;
        if (!v || v.veredito !== 'exige_aprovacao' || v.nivel_alcada === null) {
          throw conflito(v?.veredito === 'bloqueado' ? 'A cotação está bloqueada pela política; nenhuma alçada pode liberá-la.' : 'Esta cotação está dentro da política e não precisa de aprovação.', 'SEM_EXCECAO_A_PEDIR');
        }
        const [pol] = await tx<{ horas: number }[]>`select coalesce((regras ->> 'prazoAprovacaoHoras')::int, 24) as horas from public.politicas where id = ${v.politica_id}`;
        const [a] = await tx<{ id: string; prazo: Date }[]>`
          insert into public.aprovacoes (org_id, cotacao_id, versao_id, solicitante_id, motivo, nivel_alcada, prazo)
          values (${ator.orgId}, ${c.id}, ${v.id}, ${ator.id}, ${dados.motivo}, ${v.nivel_alcada}, now() + make_interval(hours => ${pol?.horas ?? 24}))
          returning id, prazo`;
        await tx`update public.cotacoes set status = 'em_aprovacao' where id = ${c.id}`;
        await r.auditar('cotacao.excecao_pedida', 'cotacoes', c.id, {
          resumo: `Exceção pedida para a versão ${v.versao} (alçada nível ${v.nivel_alcada}): ${dados.motivo}`,
          novo: { aprovacaoId: a!.id, nivelAlcada: v.nivel_alcada },
        });
        await r.emitir('aprovacao.pendente', { aprovacaoId: a!.id, cotacaoId: c.id, numero: c.numero, nivelAlcada: v.nivel_alcada, prazo: a!.prazo });
        return { status: 201, corpo: { id: c.id, status: 'em_aprovacao', aprovacao: { id: a!.id, nivelAlcada: v.nivel_alcada, prazo: a!.prazo } } };
      }

      if (!temPapel(ator, 'aprovador', 'gestor_pricing')) throw proibido('Seu perfil não aprova exceções.');
      const c = await obterCotacao(r, r.params.id!, 'ler');
      const [a] = await tx<{ id: string; solicitante_id: string | null; nivel_alcada: number; versao_id: string }[]>`
        select id, solicitante_id, nivel_alcada, versao_id from public.aprovacoes
        where cotacao_id = ${c.id} and status = 'pendente' for update`;
      if (!a || c.status !== 'em_aprovacao') throw conflito('Não há pedido de exceção pendente para esta cotação.', 'SEM_PENDENCIA');
      if (a.versao_id !== c.versao_atual_id) throw conflito('O pedido pendente não corresponde à versão atual.', 'VERSAO_DIVERGENTE');
      if (a.solicitante_id === ator.id || c.dono_id === ator.id) throw proibido('Ninguém aprova a própria cotação.', 'PROPRIA_COTACAO');
      const nivel = await alcadaEfetiva(r);
      if (nivel < a.nivel_alcada) throw proibido(`Esta exceção exige alçada de nível ${a.nivel_alcada}; a sua é de nível ${nivel}.`, 'ALCADA_INSUFICIENTE');

      const aprovada = dados.acao === 'aprovar';
      await tx`update public.aprovacoes set status = ${aprovada ? 'aprovada' : 'recusada'}, aprovador_id = ${ator.id},
                 decisao_motivo = ${dados.motivo ?? null} where id = ${a.id}`;
      await tx`update public.cotacoes set status = ${aprovada ? 'aprovada' : 'recusada'} where id = ${c.id}`;
      await r.auditar(aprovada ? 'cotacao.excecao_aprovada' : 'cotacao.excecao_recusada', 'cotacoes', c.id, {
        resumo: aprovada ? `Exceção aprovada por ${ator.nome}.` : `Exceção recusada por ${ator.nome}: ${dados.motivo}`,
        novo: { aprovacaoId: a.id, nivelDoAprovador: nivel },
      });
      await r.emitir('aprovacao.decidida', { aprovacaoId: a.id, cotacaoId: c.id, numero: c.numero, decisao: aprovada ? 'aprovada' : 'recusada', solicitanteId: a.solicitante_id });
      return { corpo: { id: c.id, status: aprovada ? 'aprovada' : 'recusada' } };
    },
  },
  {
    metodo: 'POST',
    caminho: '/cotacoes/:id/desfecho',
    auth: 'usuario',
    async handler(r) {
      const dados = validar(
        z.object({ resultado: z.enum(['aceita', 'perdida']), motivo: z.string().trim().max(500).optional() })
          .refine((d) => d.resultado === 'aceita' || (d.motivo ?? '').length >= 3, { message: 'Informe o motivo da perda.', path: ['motivo'] }),
        r.corpo,
      );
      const c = await obterCotacao(r, r.params.id!, 'dono_ou_gestor');
      if (c.status !== 'emitida') throw conflito(`Só uma cotação emitida recebe desfecho (status atual: ${c.status}).`, 'STATUS_INVALIDO');
      await r.tx`update public.cotacoes set status = ${dados.resultado}, desfecho_motivo = ${dados.motivo ?? null} where id = ${c.id}`;
      await r.auditar(`cotacao.${dados.resultado}`, 'cotacoes', c.id, {
        resumo: dados.resultado === 'aceita' ? 'Cliente final fechou.' : `Cotação perdida: ${dados.motivo}`,
      });
      await r.emitir(`cotacao.${dados.resultado}`, { cotacaoId: c.id, numero: c.numero, motivo: dados.motivo ?? null });
      return { corpo: { id: c.id, status: dados.resultado } };
    },
  },
  {
    metodo: 'POST',
    caminho: '/cotacoes/:id/cancelar',
    auth: 'usuario',
    async handler(r) {
      const c = await obterCotacao(r, r.params.id!, 'dono_ou_gestor');
      if (!['rascunho', 'recusada', 'aprovada', 'em_aprovacao'].includes(c.status)) {
        throw conflito(`Uma cotação "${c.status}" não pode ser cancelada.`, 'STATUS_INVALIDO');
      }
      await r.tx`update public.aprovacoes set status = 'cancelada' where cotacao_id = ${c.id} and status = 'pendente'`;
      await r.tx`update public.cotacoes set status = 'cancelada' where id = ${c.id}`;
      await r.auditar('cotacao.cancelada', 'cotacoes', c.id, { resumo: 'Cotação cancelada antes da emissão.' });
      return { corpo: { id: c.id, status: 'cancelada' } };
    },
  },
  {
    metodo: 'GET',
    caminho: '/cotacoes/:id/proposta',
    auth: 'usuario',
    async handler(r) {
      const c = await obterCotacao(r, r.params.id!, 'ler');
      const [anexo] = await r.tx<{ bucket: string; caminho: string; nome: string }[]>`
        select bucket, caminho, nome from public.anexos where cotacao_id = ${c.id} and tipo = 'proposta' order by criado_em desc limit 1`;
      if (!anexo) throw new ErroHttp(404, 'SEM_PROPOSTA', 'Esta cotação ainda não tem proposta emitida.');
      return { corpo: { nome: anexo.nome, url: await r.deps.armazenamento.urlAssinada(anexo.bucket, anexo.caminho, 300), expiraEmSegundos: 300 } };
    },
  },
];

// Integração de canal por chave de API ------------------------------------------
export const rotasCanal: Rota[] = [
  {
    metodo: 'POST',
    caminho: '/v1/cotacoes/simular',
    auth: 'chave',
    async handler(r) {
      exigirQuemCota(r);
      const c = await calcularPedido(r, validar(esquemaPedido, r.corpo));
      return { corpo: { resultado: c.publico } };
    },
  },
  {
    metodo: 'POST',
    caminho: '/v1/cotacoes',
    auth: 'chave',
    async handler(r) {
      const dados = validar(esquemaCriar.omit({ origem: true, unidade: true }).extend({ emitir: z.boolean().optional() }), r.corpo);
      const nova = await criarCotacao(r, dados, 'api');
      let status = 'rascunho';
      let validade: string | null = null;
      if (dados.emitir && nova.calculo.resultado.veredito.status === 'dentro') {
        const c = await obterCotacao(r, nova.id, 'dono');
        validade = (await emitirCotacao(r, c)).validade;
        status = 'emitida';
      }
      return { status: 201, corpo: { id: nova.id, numero: nova.numero, versao: 1, status, validade, resultado: nova.calculo.publico } };
    },
  },
  {
    metodo: 'GET',
    caminho: '/v1/cotacoes/:id',
    auth: 'chave',
    async handler(r) {
      const c = await obterCotacao(r, r.params.id!, 'dono');
      const [v] = await r.tx<{ versao: number; resultado_publico: ResultadoPublico }[]>`
        select versao, resultado_publico from public.cotacao_versoes where id = ${c.versao_atual_id}`;
      return { corpo: { id: c.id, numero: c.numero, status: c.status, validade: c.validade, versao: v?.versao, resultado: v?.resultado_publico } };
    },
  },
];
