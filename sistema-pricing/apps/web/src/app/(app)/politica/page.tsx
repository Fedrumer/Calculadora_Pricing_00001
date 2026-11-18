'use client';

import type { Politica } from '@pricing/motor';
import { useEffect, useState } from 'react';
import { CambioReferencia } from '@/componentes/cambio-referencia';
import { PainelPublicacao } from '@/componentes/publicacao';
import { Aviso, Carregando, Selo, ou, useAcao, useDados } from '@/componentes/ui';
import { api } from '@/lib/api';
import { data } from '@/lib/formato';
import { useSessao } from '@/lib/sessao';
import { supabase } from '@/lib/supabase';

type Regras = Omit<Politica, 'id' | 'versao'>;
interface Custo {
  codigo: string;
  nome: string;
  categoria: 'imposto' | 'cobranca' | 'custo_variavel';
  tipo: 'percentual' | 'valor_fixo' | 'valor_por_unidade';
  valor: number;
  produto: string | null;
  base: { de: string; menos?: string[] } | null;
  moeda: string | null;
  condicoes: Record<string, string[]> | null;
}

const ROTULO_ETAPA: Record<string, string> = { preco_base: 'Preço base', fatores: 'Fatores', campanha: 'Campanha', desconto: 'Desconto do vendedor', comissao: 'Comissão do canal', impostos: 'Impostos', custos: 'Custos variáveis', arredondamento: 'Arredondamento', extensao: 'Extensão' };
const ROTULO_CATEGORIA = { imposto: 'Imposto', cobranca: 'Custo de cobrança', custo_variavel: 'Custo variável' };

export default function PoliticaComercial() {
  const s = useSessao();
  const gestor = s.tem('gestor_pricing');
  const [selecionada, setSelecionada] = useState<string | null>(null);
  const [regras, setRegras] = useState<Regras | null>(null);
  const [custos, setCustos] = useState<Custo[]>([]);
  const [sujo, setSujo] = useState(false);
  const acao = useAcao();

  const lista = useDados(async () => {
    const sb = supabase();
    const [p, c, pr] = await Promise.all([
      sb.from('politicas').select('id, versao, status, vigencia_inicio, vigencia_fim, regras').order('versao', { ascending: false }),
      sb.from('canais').select('codigo, nome').order('nome'),
      sb.from('produtos').select('id, codigo, nome').order('ordem'),
    ]);
    return { politicas: ou(p) as Record<string, any>[], canais: ou(c) as { codigo: string; nome: string }[], produtos: ou(pr) as { id: string; codigo: string; nome: string }[] };
  });
  const politica = lista.dados?.politicas.find((p) => p.id === selecionada);
  const editavel = politica?.status === 'rascunho' && gestor;

  useEffect(() => {
    if (!selecionada && lista.dados?.politicas.length) {
      const hoje = new Date().toISOString().slice(0, 10);
      const l = lista.dados.politicas;
      setSelecionada((l.find((x) => x.status === 'rascunho') ?? l.find((x) => x.status === 'publicada' && x.vigencia_inicio <= hoje && (!x.vigencia_fim || x.vigencia_fim >= hoje)) ?? l[0])!.id);
    }
  }, [lista.dados, selecionada]);

  useEffect(() => {
    if (!politica || !lista.dados) return;
    setRegras(structuredClone(politica.regras));
    setSujo(false);
    void supabase()
      .from('parametros_custo')
      .select('codigo, nome, categoria, tipo, valor, produto_id, base, moeda, condicoes')
      .eq('politica_id', politica.id)
      .order('codigo')
      .then((r) => setCustos((r.data ?? []).map((x: any) => ({ ...x, valor: Number(x.valor), produto: lista.dados!.produtos.find((p) => p.id === x.produto_id)?.codigo ?? null }))));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [politica?.id]);

  if (lista.erro) return <Aviso tipo="erro">{lista.erro}</Aviso>;
  if (!lista.dados) return <Carregando />;

  const mudar = (fn: (r: Regras) => void) => {
    setRegras((r) => {
      const novo = structuredClone(r!);
      fn(novo);
      return novo;
    });
    setSujo(true);
  };
  const num = (v: string) => (v === '' ? 0 : Number(v));
  const novoRascunho = () =>
    acao.executar(async () => {
      const r = await api('POST', '/regras/politicas', {});
      lista.recarregar();
      setSelecionada(r.id);
    }, 'Rascunho criado a partir da política vigente.');
  const salvar = () =>
    acao.executar(async () => {
      await api('PUT', `/regras/politicas/${selecionada}`, { regras, custos: custos.map(({ produto, base, ...c }) => ({ ...c, ...(produto ? { produto } : {}), ...(base ? { base } : {}) })) });
      setSujo(false);
      lista.recarregar();
    }, 'Rascunho salvo.');
  const excluir = () =>
    acao.executar(async () => {
      await api('DELETE', `/regras/${selecionada}`);
      setSelecionada(null);
      lista.recarregar();
    }, 'Rascunho excluído.');
  const mover = (i: number, d: -1 | 1) =>
    mudar((r) => {
      const j = i + d;
      if (j < 1 || j >= r.etapas.length) return; // o preço base é sempre a primeira etapa
      [r.etapas[i], r.etapas[j]] = [r.etapas[j]!, r.etapas[i]!];
    });

  const campoNum = (nome: string, valor: number, aoMudar: (v: number) => void, largura = 110) =>
    editavel ? <input name={nome} type="number" step="0.5" value={valor} style={{ width: largura, textAlign: 'right' }} onChange={(e) => aoMudar(num(e.target.value))} /> : <strong>{valor}</strong>;

  return (
    <>
      <div className="cabecalho">
        <div>
          <h1>Política comercial</h1>
          <p>Limites de desconto, margem mínima, alçadas, comissões por canal e a ordem das etapas do cálculo.</p>
        </div>
        {gestor && !lista.dados.politicas.some((p) => p.status === 'rascunho') && (
          <button className="btn primario" disabled={acao.ocupado} onClick={() => void novoRascunho()}>
            Novo rascunho
          </button>
        )}
      </div>
      <Aviso tipo="erro">{acao.erro}</Aviso>
      <Aviso tipo="ok">{acao.ok}</Aviso>

      <div className="cartao">
        <h2>Versões</h2>
        <table>
          <tbody>
            {lista.dados.politicas.map((p) => (
              <tr key={p.id} className="clicavel" onClick={() => setSelecionada(p.id)} style={p.id === selecionada ? { background: '#f1f6f9' } : undefined}>
                <td>
                  <strong>v{p.versao}</strong>
                </td>
                <td>
                  <Selo status={p.status} />
                </td>
                <td>{p.vigencia_inicio ? `${data(p.vigencia_inicio)} ${p.vigencia_fim ? `a ${data(p.vigencia_fim)}` : 'em diante'}` : 'sem vigência'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {regras && politica && (
        <>
          {editavel && (
            <div className="acoes" style={{ marginBottom: 14 }}>
              <button className="btn primario" disabled={!sujo || acao.ocupado} onClick={() => void salvar()}>
                Salvar rascunho
              </button>
              <button className="btn perigo" disabled={acao.ocupado} onClick={() => void excluir()}>
                Excluir rascunho
              </button>
              {sujo && <span className="sutil">Há alterações não salvas.</span>}
            </div>
          )}
          <div className="grade g2">
            <div className="cartao">
              <h2>Limites</h2>
              <div className="detalhe-linha">
                <span>Desconto de emissão direta, até (%)</span>
                {campoNum('desconto-livre', regras.limites.descontoLivrePct, (v) => mudar((r) => void (r.limites.descontoLivrePct = v)))}
              </div>
              <div className="detalhe-linha">
                <span>Desconto máximo (%)</span>
                {campoNum('desconto-maximo', regras.limites.descontoMaximoPct, (v) => mudar((r) => void (r.limites.descontoMaximoPct = v)))}
              </div>
              <div className="detalhe-linha">
                <span>Meta de margem (%)</span>
                {campoNum('margem-meta', regras.limites.margemMetaPct, (v) => mudar((r) => void (r.limites.margemMetaPct = v)))}
              </div>
              <div className="detalhe-linha">
                <span>Margem mínima (%): abaixo dela a cotação é bloqueada</span>
                {campoNum('margem-minima', regras.limites.margemMinimaPct, (v) => mudar((r) => void (r.limites.margemMinimaPct = v)))}
              </div>
              <div className="detalhe-linha">
                <span>Validade da proposta (dias)</span>
                {campoNum('validade-dias', regras.validadeDias, (v) => mudar((r) => void (r.validadeDias = Math.round(v))))}
              </div>
              <div className="detalhe-linha">
                <span>Prazo para decidir uma exceção (horas)</span>
                {campoNum('prazo-aprovacao', regras.prazoAprovacaoHoras, (v) => mudar((r) => void (r.prazoAprovacaoHoras = Math.round(v))))}
              </div>
              {(regras.limites.folgaCambialMinimaPct !== undefined || custos.some((c) => c.moeda)) && (
                <div className="detalhe-linha">
                  <span>Folga cambial mínima (%): abaixo dela a cotação vai para aprovação</span>
                  {campoNum('folga-cambial', regras.limites.folgaCambialMinimaPct ?? 0, (v) => mudar((r) => void (r.limites.folgaCambialMinimaPct = v)))}
                </div>
              )}
              <h3 style={{ marginTop: 14 }}>Comissão do vendedor</h3>
              {regras.comissaoVendedor ? (
                <>
                  <div className="detalhe-linha">
                    <span>Base</span>
                    {editavel ? (
                      <select name="comissao-vendedor-base" style={{ width: 'auto' }} value={regras.comissaoVendedor.base} onChange={(e) => mudar((r) => void (r.comissaoVendedor!.base = e.target.value as 'margem' | 'receita'))}>
                        <option value="margem">Sobre a margem</option>
                        <option value="receita">Sobre a receita</option>
                      </select>
                    ) : (
                      <strong>{regras.comissaoVendedor.base === 'margem' ? 'Sobre a margem' : 'Sobre a receita'}</strong>
                    )}
                  </div>
                  <div className="detalhe-linha">
                    <span>Percentual (%)</span>
                    {campoNum('comissao-vendedor-pct', regras.comissaoVendedor.pct, (v) => mudar((r) => void (r.comissaoVendedor!.pct = v)))}
                  </div>
                  <div className="detalhe-linha">
                    <span>Deduzida da margem no veredito</span>
                    {editavel ? (
                      <input type="checkbox" name="comissao-vendedor-deduz" checked={regras.comissaoVendedor.deduzDaMargem} onChange={(e) => mudar((r) => void (r.comissaoVendedor!.deduzDaMargem = e.target.checked))} />
                    ) : (
                      <strong>{regras.comissaoVendedor.deduzDaMargem ? 'Sim' : 'Não (simulação para o vendedor)'}</strong>
                    )}
                  </div>
                  <p className="sutil">Aparece para o vendedor ao lado do semáforo. É uma simulação: a regra real de remuneração é decisão da empresa com RH e jurídico.</p>
                  {editavel && (
                    <button className="btn pequeno" onClick={() => mudar((r) => void (r.comissaoVendedor = null))}>
                      Remover regra
                    </button>
                  )}
                </>
              ) : (
                <>
                  <p className="sutil">Sem regra: o vendedor não vê comissão na cotação.</p>
                  {editavel && (
                    <button className="btn pequeno" onClick={() => mudar((r) => void (r.comissaoVendedor = { base: 'margem', pct: 10, deduzDaMargem: false }))}>
                      Adicionar regra
                    </button>
                  )}
                </>
              )}
            </div>
            <div className="cartao">
              <h2>Alçadas</h2>
              <table>
                <thead>
                  <tr>
                    <th>Nível</th>
                    <th>Quem libera</th>
                    <th className="num">Desconto até (%)</th>
                    <th className="num">Margem a partir de (%)</th>
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <td>—</td>
                    <td>Emissão direta pelo vendedor</td>
                    <td className="num">{regras.limites.descontoLivrePct}</td>
                    <td className="num">{regras.limites.margemMetaPct}</td>
                  </tr>
                  {regras.alcadas.map((a, i) => (
                    <tr key={a.nivel}>
                      <td>{a.nivel}</td>
                      <td>
                        {editavel ? <input name={`alcada-nome-${i}`} value={a.nome} onChange={(e) => mudar((r) => void (r.alcadas[i]!.nome = e.target.value))} /> : a.nome}
                        {a.permiteComissaoForaTabela && <div className="sutil">libera comissão acima da tabela</div>}
                      </td>
                      <td className="num">{campoNum(`alcada-desconto-${i}`, a.descontoAtePct, (v) => mudar((r) => void (r.alcadas[i]!.descontoAtePct = v)), 90)}</td>
                      <td className="num">{campoNum(`alcada-margem-${i}`, a.margemMinimaPct ?? regras.limites.margemMinimaPct, (v) => mudar((r) => void (r.alcadas[i]!.margemMinimaPct = v)), 90)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="cartao">
              <h2>Comissões por canal</h2>
              <table>
                <thead>
                  <tr>
                    <th>Canal</th>
                    <th>Produto</th>
                    <th className="num">Comissão (%)</th>
                  </tr>
                </thead>
                <tbody>
                  {regras.comissoes.map((c, i) => (
                    <tr key={`${c.canal}/${c.produto ?? ''}`}>
                      <td>{lista.dados!.canais.find((k) => k.codigo === c.canal)?.nome ?? c.canal}</td>
                      <td>{c.produto ? (lista.dados!.produtos.find((p) => p.codigo === c.produto)?.nome ?? c.produto) : 'Todos'}</td>
                      <td className="num">{campoNum(`comissao-${i}`, c.pct, (v) => mudar((r) => void (r.comissoes[i]!.pct = v)), 90)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="cartao">
              <h2>Ordem do cálculo</h2>
              <p className="sutil">A sequência das etapas e a base de cada percentual são configuração, não código.</p>
              {regras.etapas.map((e, i) => (
                <div key={e.id} className="detalhe-linha">
                  <span>
                    {i + 1}. {e.nome ?? ROTULO_ETAPA[e.tipo]}
                    {'base' in e && e.base && <span className="sutil"> · incide sobre {e.base.de === 'preco' ? 'o preço' : e.base.de}{e.base.menos?.length ? ` menos ${e.base.menos.join(', ')}` : ''}</span>}
                    {e.tipo === 'fatores' && <span className="sutil"> · composição {e.composicao}</span>}
                  </span>
                  {editavel && i > 0 && (
                    <span className="acoes">
                      <button className="btn pequeno" aria-label="Subir etapa" disabled={i <= 1} onClick={() => mover(i, -1)}>
                        ↑
                      </button>
                      <button className="btn pequeno" aria-label="Descer etapa" disabled={i >= regras.etapas.length - 1} onClick={() => mover(i, 1)}>
                        ↓
                      </button>
                    </span>
                  )}
                </div>
              ))}
            </div>
          </div>
          <div className="cartao">
            <h2>Impostos e custos</h2>
            <p className="sutil">Invisíveis para vendedores e canais.</p>
            <div className="rolagem">
              <table>
                <thead>
                  <tr>
                    <th>Parâmetro</th>
                    <th>Categoria</th>
                    <th>Produto</th>
                    <th>Tipo</th>
                    <th>Moeda</th>
                    <th className="num">Valor</th>
                  </tr>
                </thead>
                <tbody>
                  {custos.map((c, i) => (
                    <tr key={c.codigo}>
                      <td>{c.nome}</td>
                      <td>{ROTULO_CATEGORIA[c.categoria]}</td>
                      <td>{c.produto ? (lista.dados!.produtos.find((p) => p.codigo === c.produto)?.nome ?? c.produto) : 'Todos'}</td>
                      <td>{c.tipo === 'percentual' ? '% sobre a base' : c.tipo === 'valor_por_unidade' ? 'Valor por unidade' : 'Valor fixo'}</td>
                      <td>{c.tipo === 'percentual' ? '—' : (c.moeda ?? 'BRL')}</td>
                      <td className="num">
                        {editavel ? (
                          <input
                            name={`custo-${c.codigo}`}
                            type="number"
                            step="0.01"
                            min={0}
                            value={c.valor}
                            style={{ width: 110, textAlign: 'right' }}
                            onChange={(e) => {
                              setCustos((l) => l.map((x, j) => (j === i ? { ...x, valor: num(e.target.value) } : x)));
                              setSujo(true);
                            }}
                          />
                        ) : (
                          c.valor
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
          <CambioReferencia />
          {editavel && !sujo && <PainelPublicacao id={politica.id} aoPublicar={() => lista.recarregar()} />}
        </>
      )}
    </>
  );
}
