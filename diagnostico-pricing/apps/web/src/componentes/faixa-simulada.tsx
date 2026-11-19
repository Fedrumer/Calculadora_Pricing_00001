'use client';

import { useEffect, useState } from 'react';
import { Aviso, useAcao } from '@/componentes/ui';
import { rpc, servico } from '@/lib/api';
import { ROTULO_PREMISSA, dataHora, moeda, numero } from '@/lib/formato';

interface LinhaResultado { opcao: string; alavanca: string | null; medida: string; media: number | null; p10: number | null; p50: number | null; p90: number | null; prob_positivo: number | null; contribuicao_media: number | null; frase: string | null }
interface Simulacao {
  id: string; criado_em: string; sorteios: number; semente: number; versao_servico: string; duracao_ms: number | null;
  resultado: LinhaResultado[];
  sensibilidade: { premissa: string; resultado_no_p10: number; resultado_no_p90: number; amplitude: number; ordem: number }[];
}

const NOME_ALAVANCA: Record<string, string> = { contencao_descontos: 'Contenção de descontos', reajuste_seletivo: 'Reajuste seletivo' };
const rotuloPremissa = (chave: string) => {
  const [alavanca, nome] = chave.split('.');
  return `${ROTULO_PREMISSA[nome ?? '']?.rotulo ?? nome} (${(NOME_ALAVANCA[alavanca ?? ''] ?? alavanca)?.toLowerCase()})`;
};

/** Faixa de ganho por 10.000 cenários (serviço de simulação, P2). Só o consultor vê e simula nesta fase. */
export function FaixaSimulada({ diagnostico }: { diagnostico: string }) {
  const acao = useAcao();
  const [sim, setSim] = useState<Simulacao | null | undefined>(undefined);
  const carregar = () => rpc<Simulacao | null>('simulacao_do_diagnostico', { p_diagnostico: diagnostico }).then(setSim).catch(() => setSim(null));
  useEffect(() => { void carregar(); }, [diagnostico]);

  async function simular() {
    const r = await acao.executar(() => servico('simular', { diagnostico_id: diagnostico, sorteios: 10000 }), 'Simulação gravada.');
    if (r) await carregar();
  }

  const total = sim?.resultado.find((r) => r.medida === 'margem' && r.alavanca === null);
  const contribs = sim?.resultado.filter((r) => r.alavanca) ?? [];
  const tornado = (sim?.sensibilidade ?? []).slice(0, 3);
  return (
    <div className="cartao" data-teste="faixa-simulada">
      <h2>Faixa de ganho em 10.000 cenários</h2>
      <p className="sutil">
        Cada cenário sorteia as premissas dentro da faixa do catálogo (conservador no P10, base no P50, agressivo no P90) e roda as alavancas em sequência.
        A contribuição média de cada alavanca soma a média do total; os percentis do total não são a soma dos percentis.
      </p>
      {sim === undefined ? <p className="sutil">Carregando…</p> : !sim || !total ? (
        <p className="sutil">Ainda não há simulação deste diagnóstico.</p>
      ) : (
        <>
          <div className="grade g3" style={{ margin: '12px 0' }}>
            <div className="cartao indicador" style={{ marginBottom: 0 }}><span className="rotulo">Pessimista (P10)</span><span className="valor">{moeda(total.p10 ?? 0)}</span><small>por ano</small></div>
            <div className="cartao indicador" style={{ marginBottom: 0 }}><span className="rotulo">Provável (P50)</span><span className="valor" data-teste="p50-simulado">{moeda(total.p50 ?? 0)}</span><small>por ano</small></div>
            <div className="cartao indicador" style={{ marginBottom: 0 }}><span className="rotulo">Otimista (P90)</span><span className="valor">{moeda(total.p90 ?? 0)}</span><small>por ano</small></div>
          </div>
          <p>Ganho de margem positivo <strong>{total.frase}</strong>.</p>
          <div className="rolagem" style={{ marginTop: 10 }}>
            <table>
              <thead><tr><th>Alavanca</th><th className="num">Contribuição média</th></tr></thead>
              <tbody>
                {contribs.map((c) => <tr key={c.alavanca}><td>{NOME_ALAVANCA[c.alavanca!] ?? c.alavanca}</td><td className="num">{moeda(c.contribuicao_media ?? 0)}</td></tr>)}
                <tr><td><strong>Total (média)</strong></td><td className="num"><strong>{moeda(total.media ?? 0)}</strong></td></tr>
              </tbody>
            </table>
          </div>
          {tornado.length > 0 && (
            <>
              <h3 style={{ marginTop: 16 }}>Premissas que mais mexem no resultado</h3>
              <ol>
                {tornado.map((t) => (
                  <li key={t.premissa}>Acompanhe <strong>{rotuloPremissa(t.premissa)}</strong>: do P10 ao P90 o ganho vai de {moeda(t.resultado_no_p10)} a {moeda(t.resultado_no_p90)}.</li>
                ))}
              </ol>
            </>
          )}
          <p className="sutil" style={{ marginTop: 10 }}>
            {numero(sim.sorteios)} sorteios, semente {sim.semente}, serviço {sim.versao_servico}
            {sim.duracao_ms != null ? `, ${numero(sim.duracao_ms)} ms` : ''}; gravada em {dataHora(sim.criado_em)}.
          </p>
        </>
      )}
      <div style={{ marginTop: 12 }}>
        <button className="botao" onClick={simular} disabled={acao.ocupado}>{acao.ocupado ? 'Simulando…' : sim ? 'Simular de novo' : 'Simular 10.000 cenários'}</button>
      </div>
      {acao.erro && <Aviso tipo="erro">{acao.erro}</Aviso>}
    </div>
  );
}
