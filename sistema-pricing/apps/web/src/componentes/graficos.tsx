'use client';

import { useState } from 'react';

export interface Ponto {
  rotulo: string;
  valor: number | null;
}

const L = 640;
const A = 220;
const M = { topo: 16, direita: 12, base: 26, esquerda: 68 };

function escala(pontos: Ponto[], incluirZero: boolean) {
  const valores = pontos.map((p) => p.valor).filter((v): v is number => v !== null);
  let min = incluirZero ? 0 : Math.min(...valores);
  let max = Math.max(...valores, incluirZero ? 1 : -Infinity);
  if (!incluirZero) {
    const folga = (max - min || Math.abs(max) || 1) * 0.15;
    min -= folga;
    max += folga;
  }
  const y = (v: number) => M.topo + (A - M.topo - M.base) * (1 - (v - min) / (max - min || 1));
  const passo = (L - M.esquerda - M.direita) / Math.max(pontos.length, 1);
  const x = (i: number) => M.esquerda + passo * (i + 0.5);
  const marcas = [0, 1, 2, 3].map((i) => min + ((max - min) * i) / 3);
  return { x, y, passo, marcas, min };
}

function Moldura({ pontos, formato, incluirZero, titulo, children }: { pontos: Ponto[]; formato: (v: number) => string; incluirZero: boolean; titulo: string; children: (e: ReturnType<typeof escala>, ativo: number | null) => React.ReactNode }) {
  const [ativo, setAtivo] = useState<number | null>(null);
  const [tabela, setTabela] = useState(false);
  const comValor = pontos.filter((p) => p.valor !== null);
  if (comValor.length === 0) return <div className="vazio">Sem dados no período.</div>;
  const e = escala(pontos, incluirZero);
  const cada = Math.ceil(pontos.length / 8);
  return (
    <div>
      {tabela ? (
        <table>
          <tbody>
            {pontos.map((p) => (
              <tr key={p.rotulo}>
                <td>{p.rotulo}</td>
                <td className="num">{p.valor === null ? '—' : formato(p.valor)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : (
        <div style={{ position: 'relative' }} onMouseLeave={() => setAtivo(null)}>
          <svg className="grafico" viewBox={`0 0 ${L} ${A}`} role="img" aria-label={titulo}>
            {e.marcas.map((m, i) => (
              <g key={i}>
                <line x1={M.esquerda} x2={L - M.direita} y1={e.y(m)} y2={e.y(m)} stroke="#e7ebef" strokeWidth={1} />
                <text x={M.esquerda - 6} y={e.y(m) + 4} textAnchor="end">
                  {formato(m)}
                </text>
              </g>
            ))}
            {pontos.map((p, i) => (i % cada === 0 ? (
              <text key={p.rotulo} x={e.x(i)} y={A - 8} textAnchor="middle">
                {p.rotulo}
              </text>
            ) : null))}
            {children(e, ativo)}
            {/* alvo de toque maior que a marca */}
            {pontos.map((p, i) => (
              <rect key={p.rotulo} x={e.x(i) - e.passo / 2} y={M.topo} width={e.passo} height={A - M.topo - M.base} fill="transparent" onMouseEnter={() => setAtivo(i)} onClick={() => setAtivo(i)} />
            ))}
          </svg>
          {ativo !== null && pontos[ativo]?.valor !== null && pontos[ativo] && (
            <div className="dica" style={{ left: `${(e.x(ativo) / L) * 100}%`, top: `${(e.y(pontos[ativo]!.valor!) / A) * 100}%` }}>
              {pontos[ativo]!.rotulo}: <strong>{formato(pontos[ativo]!.valor!)}</strong>
            </div>
          )}
        </div>
      )}
      <button type="button" className="btn link" style={{ fontSize: '0.84rem' }} onClick={() => setTabela((t) => !t)}>
        {tabela ? 'Ver gráfico' : 'Ver como tabela'}
      </button>
    </div>
  );
}

/** Evolução de uma medida no tempo (uma série, um eixo). */
export function GraficoLinha({ pontos, formato, titulo }: { pontos: Ponto[]; formato: (v: number) => string; titulo: string }) {
  return (
    <Moldura pontos={pontos} formato={formato} incluirZero={false} titulo={titulo}>
      {(e, ativo) => {
        const validos = pontos.map((p, i) => ({ ...p, i })).filter((p) => p.valor !== null);
        return (
          <>
            <polyline fill="none" stroke="var(--primaria)" strokeWidth={2} strokeLinejoin="round" points={validos.map((p) => `${e.x(p.i)},${e.y(p.valor!)}`).join(' ')} />
            {ativo !== null && <line x1={e.x(ativo)} x2={e.x(ativo)} y1={M.topo} y2={A - M.base} stroke="#b8c1cc" strokeWidth={1} />}
            {validos.map((p) => (
              <circle key={p.i} cx={e.x(p.i)} cy={e.y(p.valor!)} r={ativo === p.i ? 5 : 4} fill="var(--primaria)" stroke="#fff" strokeWidth={2} />
            ))}
          </>
        );
      }}
    </Moldura>
  );
}

/** Magnitude por período (colunas a partir do zero). */
export function GraficoColunas({ pontos, formato, titulo }: { pontos: Ponto[]; formato: (v: number) => string; titulo: string }) {
  return (
    <Moldura pontos={pontos} formato={formato} incluirZero titulo={titulo}>
      {(e, ativo) =>
        pontos.map((p, i) => {
          if (p.valor === null) return null;
          const largura = Math.min(e.passo - 2, 34);
          const topo = e.y(p.valor);
          const altura = Math.max(e.y(e.min) - topo, 1);
          const r = Math.min(4, altura);
          const x = e.x(i) - largura / 2;
          // topo arredondado, base reta no eixo
          const d = `M${x},${topo + altura} V${topo + r} Q${x},${topo} ${x + r},${topo} H${x + largura - r} Q${x + largura},${topo} ${x + largura},${topo + r} V${topo + altura} Z`;
          return <path key={p.rotulo} d={d} fill="var(--primaria)" opacity={ativo === null || ativo === i ? 1 : 0.55} />;
        })
      }
    </Moldura>
  );
}

/** Comparação entre itens: barras horizontais com o valor escrito ao lado. */
export function BarrasHorizontais({ itens, formato }: { itens: { rotulo: string; valor: number | null; detalhe?: string }[]; formato: (v: number) => string }) {
  const max = Math.max(...itens.map((i) => Math.abs(i.valor ?? 0)), 0.0001);
  if (itens.length === 0) return <div className="vazio">Sem dados no período.</div>;
  return (
    <div className="barras">
      {itens.map((i) => (
        <div key={i.rotulo} className="barra-linha" title={`${i.rotulo}: ${i.valor === null ? 'sem dados' : formato(i.valor)}${i.detalhe ? ` (${i.detalhe})` : ''}`}>
          <span>{i.rotulo}</span>
          <div className="barra-trilho">
            <div className="barra-valor" style={{ width: `${(Math.abs(i.valor ?? 0) / max) * 100}%` }} />
          </div>
          <span className="num">{i.valor === null ? '—' : formato(i.valor)}</span>
        </div>
      ))}
    </div>
  );
}
