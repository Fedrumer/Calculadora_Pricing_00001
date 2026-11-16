'use client';

import Link from 'next/link';
import { useState } from 'react';
import { BarrasHorizontais, GraficoColunas, GraficoLinha } from '@/componentes/graficos';
import { Aviso, Carregando, ou, useDados } from '@/componentes/ui';
import { dataHora, hojeIso, mesCurto, moeda, numero, pct } from '@/lib/formato';
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
            <div className="cartao">
              <h2>Motivos de perda</h2>
              <BarrasHorizontais formato={(v) => numero(v)} itens={dados.painel.motivosPerda.slice(0, 6).map((m: any) => ({ rotulo: (m.motivo ?? 'Não informado').split(':')[0], valor: m.quantidade }))} />
            </div>
          </div>

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
