'use client';

import { useState } from 'react';
import { BarrasCenarios, Cascata, Regua } from '@/componentes/graficos';
import { FaixaSimulada } from '@/componentes/faixa-simulada';
import { Aviso, useAcao } from '@/componentes/ui';
import { rpc } from '@/lib/api';
import { ROTULO_CENARIO, ROTULO_DIMENSAO, ROTULO_PREMISSA, ROTULO_RECORTE, moeda, moedaCurta, numero, pct } from '@/lib/formato';
import type { Achado, Metrica, Painel } from '@/lib/tipos';

const valorMetrica = (m: Metrica) => (m.valor === null ? 'indisponível' : m.unidade === '%' ? pct(m.valor) : m.unidade === 'R$' ? moeda(m.valor) : numero(m.valor, 2));
const nota = (p: Painel, d: string) => p.pontuacoes.find((x) => x.dimensao === d) ?? null;
const metrica = (p: Painel, c: string) => p.metricas.find((m) => m.codigo === c) ?? null;
const cenario = (p: Painel, c: string) => p.cenarios.find((x) => x.codigo === c) ?? null;

function Indicador({ rotulo, valor, apoio }: { rotulo: string; valor: string; apoio?: string }) {
  return (
    <div className="cartao indicador" style={{ marginBottom: 0 }}>
      <span className="rotulo">{rotulo}</span>
      <span className="valor">{valor}</span>
      {apoio && <small>{apoio}</small>}
    </div>
  );
}

function Evidencia({ a }: { a: Achado }) {
  const [aberto, setAberto] = useState(false);
  const exemplos: Record<string, any>[] = a.evidencia?.exemplos ?? [];
  const resumo = Object.entries(a.evidencia ?? {}).filter(([k, v]) => k !== 'exemplos' && typeof v !== 'object');
  const rotulo = (k: string) => k.replace(/_pct$/, ' (%)').replace(/_/g, ' ');
  const celula = (k: string, v: any) => (typeof v !== 'number' ? String(v) : /pct|correlacao|limite|percentil/.test(k) ? numero(v, 1) : /receita|valor|margem|preco|piso/.test(k) ? moeda(v) : numero(v));
  return (
    <div>
      <button type="button" className="btn link" onClick={() => setAberto((x) => !x)}>
        {aberto ? 'Ocultar evidência' : 'Ver evidência'}
      </button>
      {aberto && (
        <div style={{ marginTop: 8 }}>
          <p className="sutil">{resumo.map(([k, v]) => `${rotulo(k)}: ${celula(k, v)}`).join(' · ')}</p>
          {exemplos.length > 0 && (
            <div className="rolagem">
              <table>
                <thead>
                  <tr>{Object.keys(exemplos[0]!).map((k) => <th key={k} className={typeof exemplos[0]![k] === 'number' ? 'num' : ''}>{rotulo(k)}</th>)}</tr>
                </thead>
                <tbody>
                  {exemplos.map((e, i) => (
                    <tr key={i}>{Object.entries(e).map(([k, v]) => <td key={k} className={typeof v === 'number' ? 'num' : ''}>{celula(k, v)}</td>)}</tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function ListaAchados({ achados, limite }: { achados: Achado[]; limite?: number }) {
  if (achados.length === 0) return <div className="vazio">Nenhuma regra do catálogo disparou.</div>;
  return (
    <div>
      {achados.slice(0, limite).map((a) => (
        <div key={a.regra} className="achado">
          <div className="achado-topo">
            <strong>{a.titulo}</strong>
            <span className="num">{a.valor_exposto === null ? <span className="sutil">sem valor atribuído</span> : <><strong>{moeda(a.valor_exposto)}</strong> <small>expostos no período</small></>}</span>
          </div>
          <p>{a.descricao} <span className="selo">{ROTULO_DIMENSAO[a.dimensao] ?? a.dimensao}</span>{a.alavanca_nome && <> <span className="selo azul">Alavanca: {a.alavanca_nome}</span></>}</p>
          <Evidencia a={a} />
        </div>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------- resumo executivo
export function AbaResumo({ p }: { p: Painel }) {
  const geral = nota(p, 'geral');
  const cons = cenario(p, 'conservador'), agr = cenario(p, 'agressivo'), base = cenario(p, 'base');
  const dims = p.pontuacoes.filter((x) => x.dimensao !== 'geral');
  return (
    <>
      <div className="grade g4 manter-2" style={{ marginBottom: 16 }}>
        <Indicador rotulo="Nota geral" valor={geral?.nota == null ? '—' : `${numero(geral.nota)} / 100`}
          apoio={geral?.parcial ? `Parcial: ${geral.detalhe.dimensoes_calculadas} de ${geral.detalhe.dimensoes_do_catalogo} dimensões` : undefined} />
        <Indicador rotulo="Vazamento de preço" valor={pct(metrica(p, 'vazamento_pct')?.valor)} apoio="do preço de lista não chega ao caixa" />
        <Indicador rotulo="Pocket margin" valor={pct(metrica(p, 'margem_pocket_pct')?.valor)} apoio="depois de descontos e custos de servir" />
        <Indicador rotulo="Ganho potencial por ano" valor={cons && agr ? `${moedaCurta(cons.ganho_total_anual)} a ${moedaCurta(agr.ganho_total_anual).replace('R$ ', '')}` : '—'}
          apoio={base ? `Cenário base: ${moeda(base.ganho_total_anual)}` : undefined} />
      </div>

      <div className="duas">
        <div className="cartao">
          <h2>Nota por dimensão</h2>
          {dims.map((d) => (
            <div key={d.dimensao} style={{ marginBottom: 14 }}>
              <div className="rotulo" style={{ marginBottom: 4 }}>{ROTULO_DIMENSAO[d.dimensao] ?? d.dimensao}{d.parcial && ' (parcial)'}</div>
              <Regua nota={d.nota} />
            </div>
          ))}
          <p className="sutil">Nota de 0 a 100 por faixas de limiar do catálogo (versão {p.diagnostico.versao_catalogo}). Dimensão sem métrica com limiar fica sem nota e fora da nota geral, que redistribui os pesos entre as dimensões calculadas.</p>
        </div>
        <div className="cartao">
          <h2>Maiores achados</h2>
          <ListaAchados achados={p.achados} limite={5} />
        </div>
      </div>

      <div className="cartao">
        <h2>Métricas</h2>
        <div className="rolagem">
          <table>
            <thead>
              <tr><th>Dimensão</th><th>Métrica</th><th className="num">Valor</th><th className="num">Referência boa</th><th className="num">Referência ruim</th></tr>
            </thead>
            <tbody>
              {p.metricas.map((m) => (
                <tr key={m.codigo} title={m.descricao}>
                  <td>{ROTULO_DIMENSAO[m.dimensao] ?? m.dimensao}</td>
                  <td>{m.nome}{m.valor === null && m.detalhe?.indisponivel && <div><small>{m.detalhe.indisponivel}</small></div>}</td>
                  <td className="num"><strong>{valorMetrica(m)}</strong></td>
                  <td className="num">{m.limiar_bom === null ? '—' : m.unidade === '%' ? pct(m.limiar_bom, 0) : numero(m.limiar_bom, 1)}</td>
                  <td className="num">{m.limiar_ruim === null ? '—' : m.unidade === '%' ? pct(m.limiar_ruim, 0) : numero(m.limiar_ruim, 1)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
}

// ---------------------------------------------------------------- realização de preço
export function AbaRealizacao({ p }: { p: Painel }) {
  const tipos = ['canal', 'segmento', 'categoria', 'regiao', 'vendedor', 'produto', 'conta'].filter((t) => p.recortes[t]?.length);
  const [tipo, setTipo] = useState(tipos[0] ?? 'canal');
  const linhas = p.recortes[tipo] ?? [];
  return (
    <>
      <div className="cartao">
        <h2>Do preço de lista ao pocket price</h2>
        <p className="sutil">{pct(metrica(p, 'vazamento_pct')?.valor)} do preço de lista não chega ao caixa. Valores do período analisado.</p>
        <Cascata degraus={p.cascata} formato={(v) => moeda(v)} formatoCurto={moedaCurta} titulo="Cascata de preço, do preço de lista ao pocket price" />
      </div>
      <div className="cartao">
        <div className="cabecalho" style={{ marginBottom: 10 }}>
          <h2 style={{ margin: 0 }}>Onde o preço vaza</h2>
          <label className="acoes">
            <span className="rotulo">Ver por</span>
            <select name="recorte" value={tipo} onChange={(e) => setTipo(e.target.value)} style={{ width: 'auto' }}>
              {tipos.map((t) => <option key={t} value={t}>{ROTULO_RECORTE[t]}</option>)}
            </select>
          </label>
        </div>
        <div className="rolagem">
          <table>
            <thead>
              <tr><th>{ROTULO_RECORTE[tipo]}</th><th className="num">Receita de lista</th><th className="num">Desconto em fatura</th><th className="num">Vazamento</th><th style={{ width: '22%' }} /><th className="num">Pocket margin</th></tr>
            </thead>
            <tbody>
              {linhas.map((l) => (
                <tr key={l.valor}>
                  <td>{l.valor}</td>
                  <td className="num">{moeda(l.rec_lista)}</td>
                  <td className="num">{pct(l.desconto_fatura_pct)}</td>
                  <td className="num"><strong>{pct(l.vazamento_pct)}</strong></td>
                  <td><div className="barra-trilho"><div style={{ width: `${Math.min(100, Math.max(0, l.vazamento_pct * 2))}%`, height: 10, borderRadius: '0 4px 4px 0', background: '#c8553d' }} /></div></td>
                  <td className="num">{pct(l.margem_pocket_pct)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {(tipo === 'produto' || tipo === 'conta') && <p className="sutil" style={{ marginTop: 8 }}>Os 25 maiores por receita de lista.</p>}
      </div>
    </>
  );
}

// ---------------------------------------------------------------- oportunidades
function Premissas({ p, aoMudar }: { p: Painel; aoMudar: () => void }) {
  const acao = useAcao();
  const [edicao, setEdicao] = useState<Record<string, string>>({});
  const chaves = (p.cenarios[0]?.premissas ?? []).map((x) => ({ alavanca: x.alavanca, chave: x.chave }));
  const nomes = Object.fromEntries((p.cenarios[0]?.alavancas ?? []).map((a) => [a.alavanca, a.nome]));
  const id = (c: string, a: string, k: string) => `${c}|${a}|${k}`;
  const salvar = () =>
    acao.executar(async () => {
      for (const c of p.cenarios) {
        const mudancas: Record<string, Record<string, number>> = {};
        for (const { alavanca, chave } of chaves) {
          const bruto = edicao[id(c.codigo, alavanca, chave)];
          if (bruto === undefined || bruto.trim() === '') continue;
          const v = Number(bruto.replace(',', '.'));
          if (!Number.isFinite(v)) throw new Error(`Valor inválido em ${ROTULO_PREMISSA[chave]?.rotulo ?? chave}.`);
          (mudancas[alavanca] ??= {})[chave] = v;
        }
        if (Object.keys(mudancas).length) await rpc('salvar_premissas', { p_diagnostico: p.diagnostico.id, p_cenario: c.codigo, p_premissas: mudancas });
      }
      setEdicao({});
      aoMudar();
    }, 'Premissas salvas e cenários recalculados.');
  return (
    <div className="cartao">
      <h2>Premissas dos cenários</h2>
      <p className="sutil">Altere uma premissa e recalcule: o ganho é refeito no banco, pela mesma função dos cenários. Premissa alterada fica marcada como informada.</p>
      <Aviso tipo="erro">{acao.erro}</Aviso>
      <Aviso tipo="ok">{acao.ok}</Aviso>
      <div className="rolagem">
        <table className="mapa">
          <thead>
            <tr><th>Alavanca</th><th>Premissa</th>{p.cenarios.map((c) => <th key={c.codigo}>{ROTULO_CENARIO[c.codigo]}</th>)}</tr>
          </thead>
          <tbody>
            {chaves.map(({ alavanca, chave }) => (
              <tr key={`${alavanca}|${chave}`} title={ROTULO_PREMISSA[chave]?.dica}>
                <td>{nomes[alavanca] ?? alavanca}</td>
                <td>{ROTULO_PREMISSA[chave]?.rotulo ?? chave}</td>
                {p.cenarios.map((c) => {
                  const atual = c.premissas.find((x) => x.alavanca === alavanca && x.chave === chave);
                  return (
                    <td key={c.codigo}>
                      <input aria-label={`${ROTULO_PREMISSA[chave]?.rotulo ?? chave}, cenário ${ROTULO_CENARIO[c.codigo]}`} name={id(c.codigo, alavanca, chave)} inputMode="decimal" style={{ width: 90 }}
                        value={edicao[id(c.codigo, alavanca, chave)] ?? String(atual?.valor ?? '').replace('.', ',')}
                        onChange={(e) => setEdicao((x) => ({ ...x, [id(c.codigo, alavanca, chave)]: e.target.value }))} />
                      {atual?.origem === 'informada' && <small> informada</small>}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="acoes" style={{ marginTop: 12 }}>
        <button className="btn primario" disabled={acao.ocupado || Object.keys(edicao).length === 0} onClick={() => void salvar()}>
          {acao.ocupado ? 'Recalculando…' : 'Salvar e recalcular'}
        </button>
      </div>
    </div>
  );
}

export function AbaOportunidades({ p, podeEditar, aoMudar }: { p: Painel; podeEditar: boolean; aoMudar: () => void }) {
  const cons = cenario(p, 'conservador'), base = cenario(p, 'base'), agr = cenario(p, 'agressivo');
  if (!cons || !base || !agr) return <div className="cartao vazio">Os cenários aparecem depois do cálculo.</div>;
  const grupos = base.alavancas.map((a) => ({
    nome: a.nome,
    valores: p.cenarios.map((c) => ({ cenario: c.codigo, rotulo: ROTULO_CENARIO[c.codigo]!, valor: c.alavancas.find((x) => x.alavanca === a.alavanca)?.ganho_anual ?? 0 })),
  }));
  return (
    <>
      <div className="grade g3" style={{ marginBottom: 16 }}>
        {[cons, base, agr].map((c) => (
          <div key={c.codigo} className="cartao indicador" style={{ marginBottom: 0 }}>
            <span className="rotulo">Cenário {ROTULO_CENARIO[c.codigo]!.toLowerCase()}</span>
            <span className="valor">{moeda(c.ganho_total_anual)}</span>
            <small>de margem por ano</small>
          </div>
        ))}
      </div>
      <div className="cartao">
        <h2>Ganho anual de margem por alavanca</h2>
        <p className="sutil">As alavancas são aplicadas em sequência, cada uma sobre a base já ajustada pela anterior: o total é a soma da cascata, sem dupla contagem. O número é sempre uma faixa.</p>
        <BarrasCenarios grupos={grupos} formato={(v) => moeda(v)} formatoCurto={moedaCurta} />
        <div className="rolagem" style={{ marginTop: 14 }}>
          <table>
            <thead>
              <tr><th>Alavanca (cenário base)</th><th className="num">Ganho anual</th><th className="num">Receita afetada</th><th className="num">Pares conta e produto</th></tr>
            </thead>
            <tbody>
              {base.alavancas.map((a) => (
                <tr key={a.alavanca}>
                  <td>{a.ordem}. {a.nome}</td>
                  <td className="num"><strong>{moeda(a.ganho_anual)}</strong></td>
                  <td className="num">{moeda(a.receita_afetada)}</td>
                  <td className="num">{numero(a.itens)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
      {podeEditar && <FaixaSimulada diagnostico={p.diagnostico.id} />}
      <div className="cartao">
        <h2>Achados que sustentam as alavancas</h2>
        <ListaAchados achados={p.achados} />
      </div>
      {podeEditar && <Premissas p={p} aoMudar={aoMudar} />}
    </>
  );
}
