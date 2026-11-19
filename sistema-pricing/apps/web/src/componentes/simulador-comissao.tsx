'use client';

import { useState } from 'react';
import { Aviso, Campo, ou, useAcao } from './ui';
import { hojeIso, moeda, numero, pct } from '@/lib/formato';
import { supabase } from '@/lib/supabase';

// A7: compara a regra de comissão do vendedor de hoje com uma proposta, sobre as
// cotações aceitas já gravadas (preço e margem gravados, nada é recalculado).

export interface RegraComissao {
  base: 'receita' | 'margem';
  pct: number;
  margemMinimaPct?: number | null;
}

const diasAtras = (n: number) => new Date(Date.now() - n * 86400000).toISOString().slice(0, 10);
const descricao = (r: RegraComissao) =>
  `${pct(r.pct, 2)} ${r.base === 'margem' ? 'da margem' : 'da receita'}${r.base === 'margem' && r.margemMinimaPct != null ? `, só com margem a partir de ${pct(r.margemMinimaPct, 2)}` : ''}`;

function EditorRegra({ nome, regra, mudar }: { nome: string; regra: RegraComissao; mudar: (r: RegraComissao) => void }) {
  return (
    <div className="linha-campos">
      <Campo rotulo={`${nome}: base`}>
        <select name={`regra-${nome.slice(-1).toLowerCase()}-base`} value={regra.base} onChange={(e) => mudar({ ...regra, base: e.target.value as RegraComissao['base'] })}>
          <option value="receita">Sobre a receita</option>
          <option value="margem">Sobre a margem</option>
        </select>
      </Campo>
      <Campo rotulo="Percentual (%)">
        <input name={`regra-${nome.slice(-1).toLowerCase()}-pct`} type="number" min={0} max={99} step={0.5} value={regra.pct} onChange={(e) => mudar({ ...regra, pct: Number(e.target.value) || 0 })} />
      </Campo>
      {regra.base === 'margem' && (
        <Campo rotulo="Margem mínima (%)" dica="Em branco: paga com qualquer margem positiva.">
          <input
            name={`regra-${nome.slice(-1).toLowerCase()}-minima`}
            type="number"
            step={0.5}
            value={regra.margemMinimaPct ?? ''}
            onChange={(e) => mudar({ ...regra, margemMinimaPct: e.target.value === '' ? null : Number(e.target.value) })}
          />
        </Campo>
      )}
    </div>
  );
}

const limpar = (r: RegraComissao) => ({ base: r.base, pct: r.pct, ...(r.base === 'margem' && r.margemMinimaPct != null ? { margemMinimaPct: r.margemMinimaPct } : {}) });

export function SimuladorComissao({ regraAtual }: { regraAtual: RegraComissao | null }) {
  const [a, setA] = useState<RegraComissao>(regraAtual ?? { base: 'receita', pct: 2 });
  const [b, setB] = useState<RegraComissao>({ base: 'margem', pct: 10 });
  const [inicio, setInicio] = useState(diasAtras(365));
  const [fim, setFim] = useState(hojeIso());
  const [resultado, setResultado] = useState<any>(null);
  const acao = useAcao();

  const comparar = () =>
    acao.executar(async () => {
      const r = await supabase().rpc('simular_comissao_vendedor', { p_regra_a: limpar(a), p_regra_b: limpar(b), p_inicio: inicio, p_fim: fim });
      setResultado(ou(r));
    });

  const exportar = () => {
    const linhas = [
      ['vendedor', 'aceitas', 'receita', 'margem', 'margem_pct', 'desconto_medio_pct', 'comissao_regra_a', 'comissao_regra_b', 'diferenca'],
      ...resultado.porVendedor.map((v: any) => [v.vendedor, v.aceitas, v.receita, v.margem, v.margemPct ?? '', v.descontoMedioPct ?? '', v.comissaoA, v.comissaoB, v.diferenca]),
      ['Total', resultado.total.aceitas, resultado.total.receita, resultado.total.margem, '', '', resultado.total.comissaoA, resultado.total.comissaoB, resultado.total.diferenca],
      [],
      [`Regra A: ${descricao(resultado.regraA)}`],
      [`Regra B: ${descricao(resultado.regraB)}`],
      [`Período: ${inicio} a ${fim}. Efeito mecânico sobre o histórico; a mudança de comportamento do vendedor só se mede com piloto.`],
    ];
    const csv = linhas.map((l) => l.map((c: unknown) => (/[;"\n]/.test(String(c)) ? `"${String(c).replace(/"/g, '""')}"` : String(c))).join(';')).join('\n');
    const url = URL.createObjectURL(new Blob([`﻿${csv}\n`], { type: 'text/csv;charset=utf-8' }));
    const link = document.createElement('a');
    link.href = url;
    link.download = `comparacao-comissao-${inicio}-a-${fim}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="cartao" data-testid="simulador-comissao">
      <h2>Comparar regras de comissão</h2>
      <p className="sutil">
        Aplica as duas regras às cotações aceitas do período, com o preço e a margem que ficaram gravados. Mostra o efeito mecânico da regra sobre o histórico: quanto o vendedor muda de
        comportamento só se mede com um piloto.
      </p>
      <Aviso tipo="erro">{acao.erro}</Aviso>
      <p className="sutil">{regraAtual ? 'Regra A começa com a da política vigente.' : 'A política não tem regra de comissão do vendedor: informe em A a prática atual do cliente.'}</p>
      <EditorRegra nome="Regra A" regra={a} mudar={setA} />
      <EditorRegra nome="Regra B" regra={b} mudar={setB} />
      <div className="linha-campos">
        <Campo rotulo="De">
          <input name="simulador-inicio" type="date" value={inicio} onChange={(e) => setInicio(e.target.value)} />
        </Campo>
        <Campo rotulo="Até">
          <input name="simulador-fim" type="date" value={fim} onChange={(e) => setFim(e.target.value)} />
        </Campo>
      </div>
      <div className="acoes">
        <button className="btn primario" name="comparar-comissao" disabled={acao.ocupado} onClick={() => void comparar()}>
          Comparar
        </button>
        {resultado && (
          <button className="btn" name="exportar-comissao" onClick={exportar}>
            Exportar CSV
          </button>
        )}
      </div>
      {resultado && (
        <div className="rolagem" style={{ marginTop: 12 }} data-testid="comparacao-comissao">
          <table>
            <thead>
              <tr>
                <th>Vendedor</th>
                <th className="num">Aceitas</th>
                <th className="num">Receita</th>
                <th className="num">Margem</th>
                <th className="num">Desconto médio</th>
                <th className="num">Regra A</th>
                <th className="num">Regra B</th>
                <th className="num">Diferença</th>
              </tr>
            </thead>
            <tbody>
              {resultado.porVendedor.map((v: any) => (
                <tr key={v.vendedor}>
                  <td style={{ whiteSpace: 'nowrap' }}>{v.vendedor}</td>
                  <td className="num">{numero(v.aceitas)}</td>
                  <td className="num">{moeda(v.receita)}</td>
                  <td className="num">{v.margemPct != null ? pct(v.margemPct) : '—'}</td>
                  <td className="num">{v.descontoMedioPct != null ? pct(v.descontoMedioPct) : '—'}</td>
                  <td className="num">{moeda(v.comissaoA)}</td>
                  <td className="num">{moeda(v.comissaoB)}</td>
                  <td className="num">
                    {moeda(v.diferenca)}
                    {v.diferencaPct != null && <small className="sutil"> ({v.diferencaPct > 0 ? '+' : ''}{pct(v.diferencaPct)})</small>}
                  </td>
                </tr>
              ))}
              <tr>
                <td>
                  <strong>Total</strong>
                </td>
                <td className="num">{numero(resultado.total.aceitas)}</td>
                <td className="num">{moeda(resultado.total.receita)}</td>
                <td className="num">{moeda(resultado.total.margem)}</td>
                <td />
                <td className="num">
                  <strong>{moeda(resultado.total.comissaoA)}</strong>
                </td>
                <td className="num">
                  <strong>{moeda(resultado.total.comissaoB)}</strong>
                </td>
                <td className="num">
                  <strong>{moeda(resultado.total.diferenca)}</strong>
                </td>
              </tr>
            </tbody>
          </table>
          <p className="sutil">
            Regra A ({descricao(resultado.regraA)}) custa {resultado.total.comissaoAPctMargem != null ? pct(resultado.total.comissaoAPctMargem) : '—'} da margem; regra B (
            {descricao(resultado.regraB)}), {resultado.total.comissaoBPctMargem != null ? pct(resultado.total.comissaoBPctMargem) : '—'}.
          </p>
        </div>
      )}
    </div>
  );
}
