'use client';

import { useState } from 'react';

// Cores dos gráficos. Texto usa sempre a cor de texto; a marca colorida é que carrega a identidade.
const COR = { total: '#1a7fa8', queda: '#c8553d', grade: '#e7ebef', trilho: '#eef1f4' };
// Cenários: um matiz só, do claro ao escuro, porque são degraus da mesma grandeza.
export const COR_CENARIO: Record<string, string> = { conservador: '#9fcbe0', base: '#4c9cc0', agressivo: '#14618a' };

export interface Degrau { degrau: string; rotulo: string; tipo: 'total' | 'queda'; valor: number }

function quebrar(rotulo: string, largura = 13): string[] {
  const linhas: string[] = [];
  for (const palavra of rotulo.split(' ')) {
    const ultima = linhas[linhas.length - 1];
    if (ultima !== undefined && `${ultima} ${palavra}`.length <= largura) linhas[linhas.length - 1] = `${ultima} ${palavra}`;
    else linhas.push(palavra);
  }
  return linhas.slice(0, 3);
}

function AlternarTabela({ tabela, alternar }: { tabela: boolean; alternar: () => void }) {
  return (
    <div style={{ textAlign: 'right', marginTop: 6 }}>
      <button type="button" className="btn link" onClick={alternar}>
        {tabela ? 'Ver gráfico' : 'Ver como tabela'}
      </button>
    </div>
  );
}

/** Cascata de preço: totais apoiados na base, quedas flutuando entre um total e o seguinte. */
export function Cascata({ degraus, formato, formatoCurto, titulo }: { degraus: Degrau[]; formato: (v: number) => string; formatoCurto: (v: number) => string; titulo: string }) {
  const [ativo, setAtivo] = useState<number | null>(null);
  const [tabela, setTabela] = useState(false);
  if (degraus.length === 0) return <div className="vazio">Sem dados.</div>;
  const L = 780, A = 330, M = { topo: 26, direita: 8, base: 62, esquerda: 8 };
  const referencia = degraus[0]!.valor;
  const max = Math.max(...degraus.map((d) => (d.tipo === 'total' ? d.valor : 0)), 1);
  const y = (v: number) => M.topo + (A - M.topo - M.base) * (1 - v / max);
  const passo = (L - M.esquerda - M.direita) / degraus.length;
  const largura = Math.min(passo * 0.64, 62);
  let corrente = 0;
  const barras = degraus.map((d, i) => {
    const topo = d.tipo === 'total' ? d.valor : corrente;
    const base = d.tipo === 'total' ? 0 : corrente - d.valor;
    corrente = d.tipo === 'total' ? d.valor : corrente - d.valor;
    return { ...d, i, x: M.esquerda + passo * i + (passo - largura) / 2, y0: y(Math.max(topo, base)), y1: y(Math.min(topo, base)), depois: corrente };
  });
  const a = ativo === null ? null : barras[ativo]!;
  return (
    <div>
      {tabela ? (
        <div className="rolagem">
          <table>
            <thead>
              <tr><th>Degrau</th><th className="num">Valor</th><th className="num">% da lista</th></tr>
            </thead>
            <tbody>
              {degraus.map((d) => (
                <tr key={d.degrau} style={d.tipo === 'total' ? { fontWeight: 600 } : undefined}>
                  <td>{d.tipo === 'queda' ? `− ${d.rotulo}` : d.rotulo}</td>
                  <td className="num">{formato(d.valor)}</td>
                  <td className="num">{((100 * d.valor) / referencia).toLocaleString('pt-BR', { maximumFractionDigits: 1 })}%</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div style={{ position: 'relative' }} onMouseLeave={() => setAtivo(null)}>
          <svg className="grafico" viewBox={`0 0 ${L} ${A}`} role="img" aria-label={titulo}>
            <line x1={M.esquerda} x2={L - M.direita} y1={y(0)} y2={y(0)} stroke={COR.grade} strokeWidth={1} />
            {barras.map((b, i) => (
              <g key={b.degrau}>
                {i < barras.length - 1 && (
                  <line x1={b.x + largura} x2={barras[i + 1]!.x} y1={y(b.depois)} y2={y(b.depois)} stroke="#b9c2cc" strokeWidth={1} strokeDasharray="3 3" />
                )}
                <rect x={b.x} y={b.y0} width={largura} height={Math.max(b.y1 - b.y0, 2)} rx={3} fill={b.tipo === 'total' ? COR.total : COR.queda} opacity={ativo === null || ativo === i ? 1 : 0.55} />
                <text x={b.x + largura / 2} y={b.y0 - 6} textAnchor="middle" style={{ fill: 'var(--texto)', fontWeight: b.tipo === 'total' ? 700 : 400 }}>
                  {b.tipo === 'queda' ? '−' : ''}{formatoCurto(b.valor).replace('R$ ', '')}
                </text>
                {quebrar(b.rotulo).map((linha, k) => (
                  <text key={k} x={b.x + largura / 2} y={A - M.base + 16 + k * 13} textAnchor="middle">{linha}</text>
                ))}
                {/* alvo de hover maior que a marca */}
                <rect x={M.esquerda + passo * i} y={M.topo} width={passo} height={A - M.topo - M.base} fill="transparent" onMouseEnter={() => setAtivo(i)} />
              </g>
            ))}
          </svg>
          {a && (
            <div className="dica" style={{ left: `${((a.x + largura / 2) / L) * 100}%`, top: `${(a.y0 / A) * 100}%` }}>
              <strong>{a.rotulo}</strong>: {a.tipo === 'queda' ? '−' : ''}{formato(a.valor)} · {((100 * a.valor) / referencia).toLocaleString('pt-BR', { maximumFractionDigits: 1 })}% da lista
            </div>
          )}
          <div className="legenda">
            <span><i style={{ background: COR.total }} />Receita em cada estágio</span>
            <span><i style={{ background: COR.queda }} />O que se perde entre um estágio e outro</span>
          </div>
        </div>
      )}
      <AlternarTabela tabela={tabela} alternar={() => setTabela((t) => !t)} />
    </div>
  );
}

export interface GrupoCenario { nome: string; valores: { cenario: string; rotulo: string; valor: number }[] }

/** Ganho por alavanca nos três cenários: barras horizontais agrupadas, mesma escala. */
export function BarrasCenarios({ grupos, formato, formatoCurto }: { grupos: GrupoCenario[]; formato: (v: number) => string; formatoCurto: (v: number) => string }) {
  const [ativo, setAtivo] = useState<string | null>(null);
  const max = Math.max(...grupos.flatMap((g) => g.valores.map((v) => v.valor)), 1);
  return (
    <div>
      <div className="legenda" style={{ marginBottom: 10 }}>
        {(grupos[0]?.valores ?? []).map((v) => (
          <span key={v.cenario}><i style={{ background: COR_CENARIO[v.cenario] }} />{v.rotulo}</span>
        ))}
      </div>
      {grupos.map((g) => (
        <div key={g.nome} className="grupo-barras">
          <div className="grupo-nome">{g.nome}</div>
          <div>
            {g.valores.map((v) => {
              const id = `${g.nome}|${v.cenario}`;
              return (
                <div key={v.cenario} className="barra-cenario" onMouseEnter={() => setAtivo(id)} onMouseLeave={() => setAtivo(null)} title={`${g.nome}, cenário ${v.rotulo.toLowerCase()}: ${formato(v.valor)} por ano`}>
                  <div className="barra-trilho" style={{ background: 'transparent' }}>
                    <div style={{ width: `${Math.max((100 * v.valor) / max, 0.5)}%`, height: 14, borderRadius: '0 4px 4px 0', background: COR_CENARIO[v.cenario], opacity: ativo === null || ativo === id ? 1 : 0.55 }} />
                  </div>
                  <span className="num">{ativo === id ? formato(v.valor) : formatoCurto(v.valor)}</span>
                </div>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}

/** Nota de 0 a 100 em uma régua. A cor do estado vem sempre com o número ao lado. */
export function Regua({ nota }: { nota: number | null }) {
  if (nota === null) return <span className="sutil">indisponível</span>;
  const cor = nota >= 70 ? 'var(--verde)' : nota >= 40 ? '#d39b00' : 'var(--vermelho)';
  return (
    <div className="regua" role="img" aria-label={`Nota ${nota} de 100`}>
      <div className="barra-trilho"><div style={{ width: `${nota}%`, height: 10, borderRadius: 5, background: cor }} /></div>
      <strong className="num">{nota.toLocaleString('pt-BR', { maximumFractionDigits: 0 })}</strong>
    </div>
  );
}
