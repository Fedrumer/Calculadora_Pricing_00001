'use client';

import { useState } from 'react';
import { Aviso, Campo, Carregando, Modal, ou, useAcao, useDados } from '@/componentes/ui';
import { api } from '@/lib/api';
import { data, dataHora, hojeIso } from '@/lib/formato';
import { useSessao } from '@/lib/sessao';
import { supabase } from '@/lib/supabase';

// A9: piloto com grupo de controle. O gestor liga o piloto a uma Nota de Decisão,
// escolhe a regra alternativa e o critério de grupo; o tratamento cota com a
// alternativa e o controle com a vigente.

type Criterio = 'vendedor' | 'canal' | 'unidade';
const ROTULO_CRITERIO: Record<Criterio, string> = { vendedor: 'Vendedor', canal: 'Canal', unidade: 'Unidade' };
const ROTULO_STATUS: Record<string, string> = { rascunho: 'Rascunho', ativo: 'Ativo', encerrado: 'Encerrado' };
const COR_STATUS: Record<string, string> = { rascunho: '', ativo: 'verde', encerrado: 'azul' };
const daqui = (dias: number) => new Date(Date.now() + dias * 86400000).toISOString().slice(0, 10);

interface Form {
  id?: string;
  nome: string;
  notaReferencia: string;
  inicio: string;
  fim: string;
  tabelaId: string;
  politicaId: string;
  criterio: Criterio;
  bracos: Record<string, 'tratamento' | 'controle' | ''>;
}

export default function Pilotos() {
  const s = useSessao();
  const gestor = s.tem('gestor_pricing');
  const acao = useAcao();
  const [form, setForm] = useState<Form | null>(null);
  const [encerrar, setEncerrar] = useState<{ id: string; motivo: string } | null>(null);

  const { dados, erro, recarregar } = useDados(async () => {
    const sb = supabase();
    const [p, t, po, u, up, c, un] = await Promise.all([
      sb.from('pilotos').select('*').order('criado_em', { ascending: false }),
      sb.from('tabelas_preco').select('id, nome, versao, status').in('status', ['rascunho', 'publicada', 'piloto']).order('versao', { ascending: false }),
      sb.from('politicas').select('id, versao, status').in('status', ['rascunho', 'publicada', 'piloto']).order('versao', { ascending: false }),
      sb.from('usuarios').select('id, nome, status').order('nome'),
      sb.from('usuario_papel').select('usuario_id, papel'),
      sb.from('canais').select('id, nome, ativo').order('nome'),
      sb.from('unidades').select('id, nome').order('nome'),
    ]);
    const papeis = ou(up) as { usuario_id: string; papel: string }[];
    const vendedores = (ou(u) as { id: string; nome: string; status: string }[]).filter((x) => x.status === 'ativo' && papeis.some((p) => p.usuario_id === x.id && p.papel === 'vendedor'));
    return {
      pilotos: ou(p) as Record<string, any>[],
      tabelas: ou(t) as { id: string; nome: string; versao: number; status: string }[],
      politicas: ou(po) as { id: string; versao: number; status: string }[],
      membros: {
        vendedor: vendedores.map((v) => ({ id: v.id, nome: v.nome })),
        canal: (ou(c) as { id: string; nome: string; ativo: boolean }[]).filter((x) => x.ativo).map((x) => ({ id: x.id, nome: x.nome })),
        unidade: ou(un) as { id: string; nome: string }[],
      } as Record<Criterio, { id: string; nome: string }[]>,
      nomes: new Map<string, string>([...(ou(u) as { id: string; nome: string }[]), ...(ou(c) as { id: string; nome: string }[]), ...(ou(un) as { id: string; nome: string }[])].map((x) => [x.id, x.nome])),
    };
  });

  if (!s.interno) return <Aviso tipo="atencao">Os pilotos são restritos a perfis internos.</Aviso>;
  if (erro) return <Aviso tipo="erro">{erro}</Aviso>;
  if (!dados) return <Carregando />;

  const novo = () => setForm({ nome: '', notaReferencia: '', inicio: hojeIso(), fim: daqui(60), tabelaId: '', politicaId: '', criterio: 'vendedor', bracos: {} });
  const editar = (p: Record<string, any>) =>
    setForm({
      id: p.id,
      nome: p.nome,
      notaReferencia: p.nota_referencia ?? '',
      inicio: p.inicio,
      fim: p.fim,
      tabelaId: p.tabela_id ?? '',
      politicaId: p.politica_id ?? '',
      criterio: p.criterio,
      bracos: Object.fromEntries([...p.tratamento.map((m: string) => [m, 'tratamento']), ...p.controle.map((m: string) => [m, 'controle'])]),
    });
  const salvar = () =>
    acao.executar(async () => {
      const f = form!;
      const corpo = {
        nome: f.nome,
        notaReferencia: f.notaReferencia || null,
        inicio: f.inicio,
        fim: f.fim,
        tabelaId: f.tabelaId || null,
        politicaId: f.politicaId || null,
        criterio: f.criterio,
        tratamento: Object.entries(f.bracos).filter(([, b]) => b === 'tratamento').map(([m]) => m),
        controle: Object.entries(f.bracos).filter(([, b]) => b === 'controle').map(([m]) => m),
      };
      await (f.id ? api('PUT', `/pilotos/${f.id}`, corpo) : api('POST', '/pilotos', corpo));
      setForm(null);
      recarregar();
    }, 'Piloto salvo em rascunho.');
  const fazer = (fn: () => Promise<unknown>, ok: string) =>
    acao.executar(async () => {
      await fn();
      recarregar();
    }, ok);
  const regra = (p: Record<string, any>) =>
    [
      p.tabela_id && `tabela v${dados.tabelas.find((t) => t.id === p.tabela_id)?.versao ?? '?'}`,
      p.politica_id && `política v${dados.politicas.find((x) => x.id === p.politica_id)?.versao ?? '?'}`,
    ]
      .filter(Boolean)
      .join(' e ');
  const lista = (ids: string[]) => ids.map((m) => dados.nomes.get(m) ?? m).join(', ');

  return (
    <>
      <div className="cabecalho">
        <div>
          <h1>Pilotos</h1>
          <p>Teste uma regra com parte da equipe antes de valer para todos: o grupo de tratamento cota com a regra alternativa e o de controle com a vigente.</p>
        </div>
        {gestor && (
          <div className="acoes">
            <button className="btn primario" name="novo-piloto" onClick={novo}>
              Novo piloto
            </button>
          </div>
        )}
      </div>
      <Aviso tipo="erro">{!form && !encerrar && acao.erro}</Aviso>
      <Aviso tipo="ok">{acao.ok}</Aviso>
      <Aviso tipo="info">
        Escolha o grupo por vendedor, canal ou unidade, nunca por cliente final, e avise a equipe antes. Um vendedor, canal ou unidade só pode estar em um piloto ativo. A comparação entre os
        grupos aparece no painel; o teste estatístico fica na medição do diagnóstico.
      </Aviso>

      <div className="cartao" data-testid="lista-pilotos">
        {dados.pilotos.length === 0 ? (
          <div className="vazio">Nenhum piloto criado.</div>
        ) : (
          <div className="rolagem">
            <table>
              <thead>
                <tr>
                  <th>Piloto</th>
                  <th>Período</th>
                  <th>Regra alternativa</th>
                  <th>Tratamento</th>
                  <th>Controle</th>
                  <th>Situação</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {dados.pilotos.map((p) => (
                  <tr key={p.id}>
                    <td>
                      <strong>{p.nome}</strong>
                      {p.nota_referencia && <div className="sutil">{p.nota_referencia}</div>}
                    </td>
                    <td style={{ whiteSpace: 'nowrap' }}>
                      {data(p.inicio)} a {data(p.fim)}
                    </td>
                    <td>{regra(p)}</td>
                    <td>
                      <small className="sutil">{ROTULO_CRITERIO[p.criterio as Criterio]}:</small> {lista(p.tratamento)}
                    </td>
                    <td>{lista(p.controle)}</td>
                    <td>
                      <span className={`selo ${COR_STATUS[p.status] ?? ''}`}>{ROTULO_STATUS[p.status] ?? p.status}</span>
                      {p.ativado_em && <div className="sutil">ativado em {dataHora(p.ativado_em)}</div>}
                      {p.motivo_encerramento && <div className="sutil">{p.motivo_encerramento}</div>}
                    </td>
                    <td className="acoes">
                      {gestor && p.status === 'rascunho' && (
                        <>
                          <button className="btn pequeno" onClick={() => editar(p)}>
                            Editar
                          </button>
                          <button className="btn pequeno primario" name="ativar-piloto" disabled={acao.ocupado} onClick={() => void fazer(() => api('POST', `/pilotos/${p.id}/ativar`), 'Piloto ativado.')}>
                            Ativar
                          </button>
                          <button className="btn pequeno" disabled={acao.ocupado} onClick={() => void fazer(() => api('DELETE', `/pilotos/${p.id}`), 'Rascunho excluído.')}>
                            Excluir
                          </button>
                        </>
                      )}
                      {gestor && p.status === 'ativo' && (
                        <button className="btn pequeno" name="encerrar-piloto" onClick={() => (setEncerrar({ id: p.id, motivo: '' }), acao.limpar())}>
                          Encerrar
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {form && (
        <Modal titulo={form.id ? 'Editar piloto' : 'Novo piloto'} aoFechar={() => setForm(null)}>
          <Aviso tipo="erro">{acao.erro}</Aviso>
          <Campo rotulo="Nome">
            <input name="piloto-nome" value={form.nome} onChange={(e) => setForm({ ...form, nome: e.target.value })} />
          </Campo>
          <Campo rotulo="Nota de Decisão" dica="Por exemplo: Nota nº 01, taxa de entrega por 60 dias.">
            <input name="piloto-nota" value={form.notaReferencia} onChange={(e) => setForm({ ...form, notaReferencia: e.target.value })} />
          </Campo>
          <div className="linha-campos">
            <Campo rotulo="Início">
              <input name="piloto-inicio" type="date" value={form.inicio} onChange={(e) => setForm({ ...form, inicio: e.target.value })} />
            </Campo>
            <Campo rotulo="Fim">
              <input name="piloto-fim" type="date" value={form.fim} onChange={(e) => setForm({ ...form, fim: e.target.value })} />
            </Campo>
          </div>
          <div className="linha-campos">
            <Campo rotulo="Tabela alternativa" dica="Em rascunho, ela é congelada quando o piloto é ativado.">
              <select name="piloto-tabela" value={form.tabelaId} onChange={(e) => setForm({ ...form, tabelaId: e.target.value })}>
                <option value="">A vigente</option>
                {dados.tabelas.map((t) => (
                  <option key={t.id} value={t.id}>
                    v{t.versao} {t.nome} ({t.status})
                  </option>
                ))}
              </select>
            </Campo>
            <Campo rotulo="Política alternativa">
              <select name="piloto-politica" value={form.politicaId} onChange={(e) => setForm({ ...form, politicaId: e.target.value })}>
                <option value="">A vigente</option>
                {dados.politicas.map((p) => (
                  <option key={p.id} value={p.id}>
                    v{p.versao} ({p.status})
                  </option>
                ))}
              </select>
            </Campo>
          </div>
          <Campo rotulo="Grupos por">
            <select name="piloto-criterio" value={form.criterio} onChange={(e) => setForm({ ...form, criterio: e.target.value as Criterio, bracos: {} })}>
              <option value="vendedor">Vendedor</option>
              <option value="canal">Canal</option>
              <option value="unidade">Unidade</option>
            </select>
          </Campo>
          <table>
            <thead>
              <tr>
                <th>{ROTULO_CRITERIO[form.criterio]}</th>
                <th>Grupo</th>
              </tr>
            </thead>
            <tbody>
              {dados.membros[form.criterio].map((m) => (
                <tr key={m.id}>
                  <td>{m.nome}</td>
                  <td>
                    <select
                      name={`braco-${m.id}`}
                      value={form.bracos[m.id] ?? ''}
                      onChange={(e) => setForm({ ...form, bracos: { ...form.bracos, [m.id]: e.target.value as Form['bracos'][string] } })}
                    >
                      <option value="">Fora do piloto</option>
                      <option value="tratamento">Tratamento (regra alternativa)</option>
                      <option value="controle">Controle (regra vigente)</option>
                    </select>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="acoes" style={{ marginTop: 12 }}>
            <button className="btn primario" name="salvar-piloto" disabled={acao.ocupado || form.nome.trim().length < 3 || (!form.tabelaId && !form.politicaId)} onClick={() => void salvar()}>
              Salvar rascunho
            </button>
          </div>
        </Modal>
      )}

      {encerrar && (
        <Modal titulo="Encerrar piloto" aoFechar={() => setEncerrar(null)}>
          <Aviso tipo="erro">{acao.erro}</Aviso>
          <p>Encerrado, todos voltam à regra vigente. A comparação continua no painel.</p>
          <Campo rotulo="Motivo">
            <input name="motivo-encerramento" value={encerrar.motivo} onChange={(e) => setEncerrar({ ...encerrar, motivo: e.target.value })} />
          </Campo>
          <button
            className="btn primario"
            disabled={acao.ocupado || encerrar.motivo.trim().length < 5}
            onClick={() =>
              void acao.executar(async () => {
                await api('POST', `/pilotos/${encerrar.id}/encerrar`, { motivo: encerrar.motivo.trim() });
                setEncerrar(null);
                recarregar();
              }, 'Piloto encerrado.')
            }
          >
            Encerrar
          </button>
        </Modal>
      )}
    </>
  );
}
