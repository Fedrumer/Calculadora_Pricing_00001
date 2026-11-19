'use client';

import Link from 'next/link';
import { useState } from 'react';
import { BarrasHorizontais, GraficoColunas, GraficoLinha } from '@/componentes/graficos';
import { Aviso, Carregando, ou, useDados } from '@/componentes/ui';
import { data, dataHora, hojeIso, mesCurto, moeda, numero, pct } from '@/lib/formato';
import { useSessao } from '@/lib/sessao';
import { supabase } from '@/lib/supabase';

const diasAtras = (n: number) => new Date(Date.now() - n * 86400000).toISOString().slice(0, 10);
const compacto = (v: number) => new Intl.NumberFormat('pt-BR', { notation: 'compact', maximumFractionDigits: 1 }).format(v);

export default function Painel() {
  const s = useSessao();
  const [periodo, setPeriodo] = useState('365');
  const [produto, setProduto] = useState('');
  const [canal, setCanal] = useState('');

  const filtros = useDados(async () => {
    const sb = supabase();
    const [p, c] = await Promise.all([sb.from('produtos').select('id, nome').order('ordem'), sb.from('canais').select('id, nome').order('nome')]);
    return { produtos: ou(p) as { id: string; nome: string }[], canais: ou(c) as { id: string; nome: string }[] };
  });
  const { dados, erro } = useDados(async () => {
    const sb = supabase();
    const [painel, prova] = await Promise.all([
      sb.rpc('painel_indicadores', { p_inicio: diasAtras(Number(periodo)), p_fim: hojeIso(), p_produto: produto || null, p_canal: canal || null }),
      sb.rpc('prova_eficiencia'),
    ]);
    return { painel: ou(painel) as Record<string, any>, prova: ou(prova) as Record<string, any> };
  }, [periodo, produto, canal]);

  if (!s.interno) return <Aviso tipo="atencao">O painel é restrito a perfis internos.</Aviso>;
  const r = dados?.painel.resumo;
  const a = dados?.painel.aprovacoes;
  const prova = dados?.prova;

  return (
    <>
      <div className="cabecalho">
        <div>
          <h1>Painel</h1>
          <p>Margem, volume, conversão e desconto das cotações criadas no período.</p>
        </div>
        <div className="acoes">
          <select name="periodo" value={periodo} onChange={(e) => setPeriodo(e.target.value)} aria-label="Período" style={{ width: 'auto' }}>
            <option value="30">Últimos 30 dias</option>
            <option value="90">Últimos 90 dias</option>
            <option value="365">Últimos 12 meses</option>
          </select>
          <select name="produto" value={produto} onChange={(e) => setProduto(e.target.value)} aria-label="Produto" style={{ width: 'auto' }}>
            <option value="">Todos os produtos</option>
            {filtros.dados?.produtos.map((p) => (
              <option key={p.id} value={p.id}>
                {p.nome}
              </option>
            ))}
          </select>
          <select name="canal" value={canal} onChange={(e) => setCanal(e.target.value)} aria-label="Canal" style={{ width: 'auto' }}>
            <option value="">Todos os canais</option>
            {filtros.dados?.canais.map((c) => (
              <option key={c.id} value={c.id}>
                {c.nome}
              </option>
            ))}
          </select>
        </div>
      </div>
      <Aviso tipo="erro">{erro}</Aviso>
      {!dados ? (
        <Carregando />
      ) : (
        <>
          <div className="grade g4 manter-2">
            <div className="cartao indicador">
              <span className="rotulo">Volume fechado</span>
              <span className="valor">{moeda(r.volumeAceito)}</span>
              <small>{numero(r.aceitas)} cotações aceitas</small>
            </div>
            <div className="cartao indicador">
              <span className="rotulo">Margem das fechadas</span>
              <span className="valor">{pct(r.margemPct)}</span>
              <small>{moeda(r.margemAceita)}</small>
            </div>
            <div className="cartao indicador">
              <span className="rotulo">Conversão</span>
              <span className="valor">{pct(r.conversaoPct)}</span>
              <small>
                {numero(r.aceitas)} de {numero(r.aceitas + r.perdidas + r.expiradas)} com desfecho
              </small>
            </div>
            <div className="cartao indicador">
              <span className="rotulo">Desconto médio</span>
              <span className="valor">{pct(r.descontoMedioPct)}</span>
              <small>{pct(r.excecaoPct)} das emitidas com exceção</small>
            </div>
          </div>

          {a.pendentes > 0 && (
            <Aviso tipo={a.atrasadas > 0 ? 'atencao' : 'info'}>
              {a.pendentes} {a.pendentes === 1 ? 'aprovação pendente' : 'aprovações pendentes'}
              {a.atrasadas > 0 ? `, ${a.atrasadas} fora do prazo` : ''}. {s.tem('aprovador', 'gestor_pricing') && <Link href="/aprovacoes">Abrir a fila</Link>}
            </Aviso>
          )}

          <div className="grade g2">
            <div className="cartao">
              <h2>Margem das cotações fechadas, por mês</h2>
              <GraficoLinha titulo="Margem percentual por mês" formato={(v) => pct(v)} pontos={dados.painel.porMes.map((m: any) => ({ rotulo: mesCurto(m.mes), valor: m.margemPct }))} />
            </div>
            <div className="cartao">
              <h2>Volume fechado, por mês</h2>
              <GraficoColunas titulo="Volume fechado por mês" formato={(v) => `R$ ${compacto(v)}`} pontos={dados.painel.porMes.map((m: any) => ({ rotulo: mesCurto(m.mes), valor: m.volume }))} />
            </div>
            <div className="cartao">
              <h2>Margem por canal</h2>
              <BarrasHorizontais formato={(v) => pct(v)} itens={dados.painel.porCanal.map((c: any) => ({ rotulo: c.canal, valor: c.margemPct, detalhe: `${c.aceitas} fechadas, desconto médio ${pct(c.descontoMedioPct)}` }))} />
            </div>
            <div className="cartao" data-testid="motivos-perda">
              <h2>Motivos de perda</h2>
              <BarrasHorizontais
                formato={(v) => numero(v)}
                itens={dados.painel.motivosPerda.slice(0, 6).map((m: any) => ({
                  rotulo: m.motivo ?? 'Não informado',
                  valor: m.quantidade,
                }))}
              />
              {dados.painel.motivosPerda
                .filter((m: any) => m.diferencaMediaPct != null)
                .map((m: any) => (
                  <p key={m.categoria} className="sutil" data-testid="diferenca-concorrente">
                    {m.motivo}: em {numero(m.comPrecoConcorrente)} perdas o vendedor anotou o preço do concorrente. O nosso estava {pct(m.diferencaMediaPct)} acima, em média.
                  </p>
                ))}
            </div>
          </div>

          <div className="cartao" data-testid="por-vendedor">
            <h2>Desconto por vendedor</h2>
            <p className="sutil">Quem dá mais desconto aparece primeiro. Desvio alto quer dizer preço diferente para pedidos parecidos.</p>
            <div className="rolagem">
              <table>
                <thead>
                  <tr>
                    <th>Vendedor</th>
                    <th className="num">Emitidas</th>
                    <th className="num">Conversão</th>
                    <th className="num">Desconto médio</th>
                    <th className="num" title="Desvio-padrão do desconto">Desvio</th>
                    <th className="num">Maior</th>
                    <th className="num">Margem</th>
                    <th className="num">Comissão</th>
                  </tr>
                </thead>
                <tbody>
                  {dados.painel.porVendedor.map((v: any) => (
                    <tr key={v.vendedor}>
                      <td style={{ whiteSpace: 'nowrap' }}>{v.vendedor}</td>
                      <td className="num">{numero(v.emitidas)}</td>
                      <td className="num">{v.conversaoPct != null ? pct(v.conversaoPct) : '—'}</td>
                      <td className="num">{pct(v.descontoMedioPct)}</td>
                      <td className="num">{pct(v.descontoDesvioPct)}</td>
                      <td className="num">{pct(v.descontoMaximoPct)}</td>
                      <td className="num">{v.margemPct != null ? pct(v.margemPct) : '—'}</td>
                      <td className="num">{moeda(v.comissaoVendedor)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <div className="grade g2">
            <div className="cartao" data-testid="conversao-por-desconto">
              <h2>Conversão por faixa de desconto</h2>
              <p className="sutil">Primeira leitura de quanto o desconto ajuda a fechar, pelas propostas ganhas e perdidas.</p>
              <div className="rolagem">
                <table>
                  <thead>
                    <tr>
                      <th>Desconto</th>
                      <th className="num">Emitidas</th>
                      <th className="num">Fechadas</th>
                      <th className="num">Conversão</th>
                      <th className="num">Margem</th>
                    </tr>
                  </thead>
                  <tbody>
                    {dados.painel.conversaoPorDesconto.map((f: any) => (
                      <tr key={f.faixa}>
                        <td>
                          {f.rotulo}{' '}
                          {f.amostraPequena && (
                            <span className="selo amarelo" title="Menos de 30 cotações emitidas nesta faixa: não leia tendência aqui.">
                              amostra pequena
                            </span>
                          )}
                        </td>
                        <td className="num">{numero(f.emitidas)}</td>
                        <td className="num">{numero(f.aceitas)}</td>
                        <td className="num">{f.conversaoPct != null ? pct(f.conversaoPct) : '—'}</td>
                        <td className="num">{f.margemPct != null ? pct(f.margemPct) : '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
            <div className="cartao" data-testid="exposicao-cambial">
              <h2>Exposição cambial</h2>
              <p className="sutil">
                Cotações fechadas nos últimos 90 dias com custo em moeda estrangeira, comparadas à PTAX mais recente (quando o fluxo de câmbio está ligado) ou ao câmbio de referência de hoje.
              </p>
              {dados.painel.exposicaoCambial.length === 0 ? (
                <p className="sutil">Nenhuma cotação fechada com custo em moeda estrangeira no período.</p>
              ) : (
                dados.painel.exposicaoCambial.map((e: any) => (
                  <div key={e.moeda} className="grade g2 manter-2">
                    <div className="indicador">
                      <span className="rotulo">Custo em {e.moeda}</span>
                      <span className="valor">{numero(e.valorMoeda)}</span>
                      <small>
                        {moeda(e.valorConvertido)} em {numero(e.cotacoes)} cotações
                      </small>
                    </div>
                    <div className="indicador">
                      <span className="rotulo">Câmbio que zera a margem (média)</span>
                      <span className="valor">{e.cambioEquilibrioMedio != null ? numero(e.cambioEquilibrioMedio, 4) : '—'}</span>
                      <small>
                        {e.fonte === 'ptax' ? `PTAX de ${data(e.dataPtax)}` : 'Referência hoje'}: {e.cambioReferencia != null ? numero(e.cambioReferencia, 4) : 'não publicada'}
                        {e.fonte === 'ptax' && e.referenciaPolitica != null ? ` (referência da política ${numero(e.referenciaPolitica, 4)})` : ''}
                        {e.folgaMediaPct != null ? `, folga de ${pct(e.folgaMediaPct)}` : ''}
                      </small>
                    </div>
                    <p style={{ gridColumn: '1 / -1' }}>
                      {e.semMargemNaReferencia > 0 ? (
                        <span className="selo vermelho">
                          {numero(e.semMargemNaReferencia)} ficariam sem margem {e.fonte === 'ptax' ? 'à PTAX' : 'ao câmbio de hoje'}
                        </span>
                      ) : (
                        <span className="selo verde">Todas ainda têm margem ao câmbio de hoje</span>
                      )}
                    </p>
                  </div>
                ))
              )}
            </div>
          </div>

          {dados.painel.pilotos?.length > 0 && (
            <div className="cartao" data-testid="pilotos-painel">
              <h2>Pilotos</h2>
              <p className="sutil">
                Comparação descritiva entre o grupo de tratamento e o de controle, antes (o mesmo número de dias antes do início) e durante o piloto. O teste estatístico fica na medição do
                diagnóstico.
              </p>
              {dados.painel.pilotos.map((p: any) => (
                <div key={p.id} style={{ marginBottom: 16 }}>
                  <h3 style={{ margin: '8px 0' }}>
                    {p.nome}{' '}
                    <span className={`selo ${p.status === 'ativo' ? 'verde' : 'azul'}`}>{p.status === 'ativo' ? 'ativo' : 'encerrado'}</span>
                  </h3>
                  <p className="sutil">
                    {p.notaReferencia ? `${p.notaReferencia}. ` : ''}De {data(p.inicio)} a {data(p.fim)}; grupos por {p.criterio}.
                  </p>
                  <div className="rolagem">
                    <table>
                      <thead>
                        <tr>
                          <th>Grupo</th>
                          <th>Fase</th>
                          <th className="num">Emitidas</th>
                          <th className="num">Conversão</th>
                          <th className="num">Margem das fechadas</th>
                          <th className="num">Desconto médio</th>
                        </tr>
                      </thead>
                      <tbody>
                        {p.bracos.flatMap((b: any) =>
                          (['antes', 'durante'] as const).map((fase) => {
                            const x = b[fase];
                            return (
                              <tr key={`${b.braco}-${fase}`}>
                                <td>{fase === 'antes' ? (b.braco === 'tratamento' ? 'Tratamento' : 'Controle') : ''}</td>
                                <td>{fase === 'antes' ? 'Antes' : 'Durante'}</td>
                                <td className="num">{numero(x?.emitidas ?? 0)}</td>
                                <td className="num">{x?.conversaoPct != null ? pct(x.conversaoPct) : '—'}</td>
                                <td className="num">{x?.margemPct != null ? pct(x.margemPct) : '—'}</td>
                                <td className="num">{x?.descontoMedioPct != null ? pct(x.descontoMedioPct) : '—'}</td>
                              </tr>
                            );
                          }),
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>
              ))}
            </div>
          )}

          <div className="cartao">
            <h2>Por produto</h2>
            <div className="rolagem">
              <table>
                <thead>
                  <tr>
                    <th>Produto</th>
                    <th className="num">Emitidas</th>
                    <th className="num">Fechadas</th>
                    <th className="num">Volume fechado</th>
                    <th className="num">Margem</th>
                  </tr>
                </thead>
                <tbody>
                  {dados.painel.porProduto.map((p: any) => (
                    <tr key={p.produto}>
                      <td>{p.produto}</td>
                      <td className="num">{numero(p.emitidas)}</td>
                      <td className="num">{numero(p.aceitas)}</td>
                      <td className="num">{moeda(p.volume)}</td>
                      <td className="num">{pct(p.margemPct)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <div className="cartao">
            <h2>Prova de eficiência</h2>
            <p className="sutil">Números medidos pelo próprio sistema nos últimos 30 dias.</p>
            <div className="rolagem">
              <table>
                <thead>
                  <tr>
                    <th>Indicador</th>
                    <th>Medido</th>
                    <th>Meta</th>
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <td>Tempo de cálculo de uma simulação (95% das chamadas)</td>
                    <td>{prova?.simulacao?.p95Ms != null ? `${numero(prova.simulacao.p95Ms)} ms em ${numero(prova.simulacao.chamadas)} chamadas` : 'sem chamadas no período'}</td>
                    <td>abaixo de 1 segundo</td>
                  </tr>
                  <tr>
                    <td>Tempo entre abrir o formulário e emitir, dentro da política (mediana)</td>
                    <td>{prova?.tempoEmissao?.medianaSegundos != null ? `${numero(prova.tempoEmissao.medianaSegundos)} s em ${numero(prova.tempoEmissao.cotacoes)} cotações` : 'sem emissões no período'}</td>
                    <td>abaixo de 2 minutos</td>
                  </tr>
                  <tr>
                    <td>Cotações fora da política emitidas sem aprovação</td>
                    <td>{numero(prova?.foraDaPoliticaSemAprovacao)}</td>
                    <td>zero</td>
                  </tr>
                  <tr>
                    <td>Última cópia externa</td>
                    <td>{prova?.ultimaCopiaExterna ? `${dataHora(prova.ultimaCopiaExterna.em)} (${prova.ultimaCopiaExterna.status})` : 'nenhuma registrada'}</td>
                    <td>toda noite</td>
                  </tr>
                  <tr>
                    <td>Último teste de restauração</td>
                    <td>{prova?.ultimoTesteRestauracao ? `${dataHora(prova.ultimoTesteRestauracao.em)} (${prova.ultimoTesteRestauracao.status}, ${numero(prova.ultimoTesteRestauracao.duracaoSegundos)} s)` : 'nenhum registrado'}</td>
                    <td>a cada trimestre</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </>
  );
}
