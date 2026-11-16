'use client';

import { Fragment, useState } from 'react';
import { Aviso, Carregando, ou, useDados } from '@/componentes/ui';
import { dataHora, hojeIso } from '@/lib/formato';
import { supabase } from '@/lib/supabase';

const GRUPOS: Record<string, string> = { '': 'Todos os eventos', 'cotacao.': 'Cotações', 'regra.': 'Regras de preço', 'usuario.': 'Usuários e acessos', 'integracao.': 'Integrações', 'lgpd.': 'LGPD' };

export default function Auditoria() {
  const [grupo, setGrupo] = useState('cotacao.');
  const [inicio, setInicio] = useState(new Date(Date.now() - 30 * 86400000).toISOString().slice(0, 10));
  const [fim, setFim] = useState(hojeIso());
  const [aberto, setAberto] = useState<number | null>(null);

  const { dados, erro } = useDados(async () => {
    const sb = supabase();
    let q = sb.from('eventos_auditoria').select('id, ocorrido_em, ator_id, ator_tipo, acao, tabela, registro_id, anterior, novo, ip, contexto').gte('ocorrido_em', `${inicio}T00:00:00-03:00`).lte('ocorrido_em', `${fim}T23:59:59-03:00`).order('id', { ascending: false }).limit(500);
    if (grupo) q = q.like('acao', `${grupo}%`);
    const [e, p] = await Promise.all([q, sb.from('v_pessoas').select('id, nome')]);
    return { eventos: ou(e) as Record<string, any>[], pessoas: new Map((ou(p) as { id: string; nome: string }[]).map((x) => [x.id, x.nome])) };
  }, [grupo, inicio, fim]);

  const quem = (e: Record<string, any>) => (e.ator_id ? (dados?.pessoas.get(e.ator_id) ?? e.ator_id) : e.ator_tipo === 'chave_api' ? 'Integração de canal' : e.ator_tipo === 'automacao' ? 'Automação' : 'Sistema');

  const exportar = () => {
    if (!dados) return;
    const celula = (v: unknown) => `"${String(v ?? '').replace(/"/g, '""')}"`;
    const linhas = [
      ['id', 'quando', 'quem', 'tipo_de_ator', 'acao', 'tabela', 'registro', 'ip', 'anterior', 'novo', 'contexto'].join(';'),
      ...dados.eventos.map((e) => [e.id, e.ocorrido_em, quem(e), e.ator_tipo, e.acao, e.tabela, e.registro_id, e.ip, JSON.stringify(e.anterior), JSON.stringify(e.novo), JSON.stringify(e.contexto)].map(celula).join(';')),
    ];
    const url = URL.createObjectURL(new Blob([`﻿${linhas.join('\r\n')}`], { type: 'text/csv;charset=utf-8' }));
    const a = Object.assign(document.createElement('a'), { href: url, download: `auditoria-${inicio}-a-${fim}.csv` });
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <>
      <div className="cabecalho">
        <div>
          <h1>Auditoria</h1>
          <p>Quem fez o quê, quando, com o valor anterior e o novo. A trilha só aceita inserção.</p>
        </div>
        <button className="btn" disabled={!dados?.eventos.length} onClick={exportar}>
          Exportar CSV
        </button>
      </div>
      <div className="cartao">
        <div className="linha-campos" style={{ marginBottom: 12 }}>
          <select name="grupo" value={grupo} onChange={(e) => setGrupo(e.target.value)} aria-label="Tipo de evento">
            {Object.entries(GRUPOS).map(([k, v]) => (
              <option key={k} value={k}>
                {v}
              </option>
            ))}
          </select>
          <input name="inicio" type="date" value={inicio} onChange={(e) => setInicio(e.target.value)} aria-label="De" />
          <input name="fim" type="date" value={fim} onChange={(e) => setFim(e.target.value)} aria-label="Até" />
        </div>
        <Aviso tipo="erro">{erro}</Aviso>
        {!dados ? (
          <Carregando />
        ) : dados.eventos.length === 0 ? (
          <div className="vazio">Nenhum evento no período.</div>
        ) : (
          <div className="rolagem">
            <table>
              <thead>
                <tr>
                  <th>Quando</th>
                  <th>Quem</th>
                  <th>Ação</th>
                  <th>Resumo</th>
                  <th>IP</th>
                </tr>
              </thead>
              <tbody>
                {dados.eventos.map((e) => (
                  <Fragment key={e.id}>
                    <tr className="clicavel" onClick={() => setAberto(aberto === e.id ? null : e.id)}>
                      <td style={{ whiteSpace: 'nowrap' }}>{dataHora(e.ocorrido_em)}</td>
                      <td>{quem(e)}</td>
                      <td>
                        <code>{e.acao}</code>
                      </td>
                      <td>{e.contexto?.resumo ?? `${e.tabela ?? ''} ${e.registro_id?.slice(0, 8) ?? ''}`}</td>
                      <td>{e.ip ?? '—'}</td>
                    </tr>
                    {aberto === e.id && (
                      <tr>
                        <td colSpan={5} style={{ background: '#f7f9fb' }}>
                          <div className="grade g2">
                            <div>
                              <div className="rotulo">Valor anterior</div>
                              <pre style={{ whiteSpace: 'pre-wrap', margin: 0, fontSize: '0.82rem' }}>{e.anterior ? JSON.stringify(e.anterior, null, 2) : '—'}</pre>
                            </div>
                            <div>
                              <div className="rotulo">Valor novo</div>
                              <pre style={{ whiteSpace: 'pre-wrap', margin: 0, fontSize: '0.82rem' }}>{e.novo ? JSON.stringify(e.novo, null, 2) : '—'}</pre>
                            </div>
                          </div>
                        </td>
                      </tr>
                    )}
                  </Fragment>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {dados && dados.eventos.length >= 500 && <p className="sutil">Mostrando os 500 eventos mais recentes do período; reduza o intervalo para ver os demais.</p>}
      </div>
    </>
  );
}
