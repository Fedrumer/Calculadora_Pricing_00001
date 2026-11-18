'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { type ResultadoTela, ResultadoCalculo } from '@/componentes/resultado';
import { Aviso, Campo, Carregando, Modal, Selo, ou, useAcao, useDados } from '@/componentes/ui';
import { api } from '@/lib/api';
import { data, dataHora, moeda } from '@/lib/formato';
import { motivosDa, nomeDoMotivo } from '@/lib/motivos-perda';
import { useSessao } from '@/lib/sessao';
import { supabase } from '@/lib/supabase';

interface Versao {
  id: string;
  versao: number;
  entrada: Record<string, any>;
  resultado: ResultadoTela;
  preco_final: number;
  moeda: string;
  veredito: string;
  criado_em: string;
}


export default function DetalheCotacao() {
  const [id, setId] = useState('');
  useEffect(() => setId(new URLSearchParams(window.location.search).get('id') ?? ''), []);
  const s = useSessao();
  const acao = useAcao();
  const [versaoVista, setVersaoVista] = useState<number | null>(null);
  const [modal, setModal] = useState<null | 'pedir' | 'aprovar' | 'recusar' | 'perdida'>(null);
  const [texto, setTexto] = useState('');
  const motivos = motivosDa(s.organizacao.config).filter((m) => m.ativo);
  const [motivoPerda, setMotivoPerda] = useState('');
  const [concorrente, setConcorrente] = useState({ nome: '', preco: '' });
  const [ia, setIa] = useState<{ explicacao?: string; sugestoes?: { titulo: string; justificativa: string; resultado: ResultadoTela }[] } | null>(null);
  const [iaOcupada, setIaOcupada] = useState(false);

  const { dados, erro, recarregar } = useDados(async () => {
    if (!id) return undefined;
    const sb = supabase();
    const c = ou(await sb.from('cotacoes').select('*').eq('id', id).maybeSingle()) as Record<string, any> | null;
    if (!c) return null;
    const [versoes, aprovacoes, tempo, pessoas, canais, produtos] = await Promise.all([
      sb.from(s.externo ? 'v_cotacao_versoes' : 'cotacao_versoes').select('id, versao, entrada, resultado, preco_final, moeda, veredito, criado_em').eq('cotacao_id', id).order('versao', { ascending: false }),
      sb.from('aprovacoes').select('*').eq('cotacao_id', id).order('criado_em', { ascending: false }),
      sb.from('v_linha_do_tempo').select('id, ocorrido_em, acao, ator_nome, ator_tipo, resumo').eq('cotacao_id', id).order('ocorrido_em', { ascending: true }),
      sb.from('v_pessoas').select('id, nome'),
      sb.from('canais').select('id, nome'),
      sb.from('produtos').select('id, nome'),
    ]);
    const nomes = new Map((ou(pessoas) as { id: string; nome: string }[]).map((p) => [p.id, p.nome]));
    return {
      c,
      versoes: ou(versoes) as Versao[],
      aprovacoes: ou(aprovacoes) as Record<string, any>[],
      tempo: ou(tempo) as Record<string, any>[],
      nomes,
      canal: (ou(canais) as { id: string; nome: string }[]).find((k) => k.id === c.canal_id)?.nome ?? null,
      produto: (ou(produtos) as { id: string; nome: string }[]).find((p) => p.id === c.produto_id)?.nome ?? '',
    };
  }, [id]);

  if (erro) return <Aviso tipo="erro">{erro}</Aviso>;
  if (dados === undefined || (dados === null && !id)) return <Carregando />;
  if (!dados) return <Aviso tipo="atencao">Cotação não encontrada.</Aviso>;

  const { c, versoes, aprovacoes, tempo, nomes } = dados;
  const atual = versoes.find((v) => v.id === c.versao_atual_id) ?? versoes[0];
  const vista = versoes.find((v) => v.versao === versaoVista) ?? atual;
  const pendente = aprovacoes.find((a) => a.status === 'pendente');
  const dono = c.dono_id === s.usuario.id;
  const gestor = s.tem('gestor_pricing');
  const podeDecidir = !!pendente && s.tem('aprovador', 'gestor_pricing') && !dono && pendente.solicitante_id !== s.usuario.id;
  const comIA = s.organizacao.config?.modulos?.ia !== false;

  const fazer = (fn: () => Promise<unknown>, ok: string) =>
    acao.executar(async () => {
      await fn();
      setModal(null);
      setTexto('');
      recarregar();
    }, ok);

  const abrirPdf = () =>
    acao.executar(async () => {
      const r = await api<{ url: string }>('GET', `/cotacoes/${id}/proposta`);
      window.open(r.url, '_blank', 'noopener');
    });

  const pedirIA = async (tipo: 'explicar' | 'sugerir') => {
    setIaOcupada(true);
    await acao.executar(async () => setIa(await api('POST', `/ia/${tipo}`, { cotacaoId: id })));
    setIaOcupada(false);
  };

  return (
    <>
      <div className="cabecalho">
        <div>
          <h1>
            Cotação {c.numero} <Selo status={c.status} />
          </h1>
          <p>
            {c.cliente_nome} · {dados.produto} · {dados.canal ?? 'Venda direta'}
            {c.dono_id && s.interno ? ` · ${nomes.get(c.dono_id) ?? ''}` : ''}
          </p>
        </div>
        <div className="acoes">
          {dono && ['rascunho', 'aprovada'].includes(c.status) && atual && (atual.veredito === 'dentro' || c.status === 'aprovada') && (
            <button className="btn primario" disabled={acao.ocupado} onClick={() => void fazer(() => api('POST', `/cotacoes/${id}/emitir`, undefined, { idempotente: true }), 'Proposta emitida.')}>
              Emitir proposta
            </button>
          )}
          {dono && c.status === 'rascunho' && atual?.veredito === 'exige_aprovacao' && (
            <button className="btn primario" onClick={() => setModal('pedir')}>
              Pedir aprovação
            </button>
          )}
          {podeDecidir && (
            <>
              <button className="btn primario" onClick={() => setModal('aprovar')}>
                Aprovar exceção
              </button>
              <button className="btn perigo" onClick={() => setModal('recusar')}>
                Recusar
              </button>
            </>
          )}
          {(dono || gestor) && c.status === 'emitida' && (
            <>
              <button className="btn primario" disabled={acao.ocupado} onClick={() => void fazer(() => api('POST', `/cotacoes/${id}/desfecho`, { resultado: 'aceita' }), 'Cotação marcada como aceita.')}>
                Cliente aceitou
              </button>
              <button className="btn" onClick={() => setModal('perdida')}>
                Não fechou
              </button>
            </>
          )}
          {['emitida', 'aceita', 'perdida', 'expirada'].includes(c.status) && (
            <button className="btn" disabled={acao.ocupado} onClick={() => void abrirPdf()}>
              Proposta em PDF
            </button>
          )}
          {(dono || gestor) && s.podeCotar && ['rascunho', 'recusada', 'aprovada', 'emitida', 'expirada'].includes(c.status) && (
            <Link className="btn" href={`/cotacoes/nova?de=${id}`}>
              Nova versão
            </Link>
          )}
          {(dono || gestor) && ['rascunho', 'recusada', 'aprovada', 'em_aprovacao'].includes(c.status) && (
            <button className="btn perigo" disabled={acao.ocupado} onClick={() => void fazer(() => api('POST', `/cotacoes/${id}/cancelar`), 'Cotação cancelada.')}>
              Cancelar
            </button>
          )}
        </div>
      </div>
      <Aviso tipo="erro">{acao.erro}</Aviso>
      <Aviso tipo="ok">{acao.ok}</Aviso>

      {pendente && (
        <Aviso tipo="atencao">
          <strong>Aguardando aprovação</strong> (alçada nível {pendente.nivel_alcada}), pedida por {nomes.get(pendente.solicitante_id) ?? 'integração'} em {dataHora(pendente.criado_em)}. Prazo: {dataHora(pendente.prazo)}.
          <br />
          Motivo: {pendente.motivo}
        </Aviso>
      )}
      {c.status === 'recusada' && aprovacoes[0]?.decisao_motivo && <Aviso tipo="erro">Exceção recusada por {nomes.get(aprovacoes[0].aprovador_id) ?? '—'}: {aprovacoes[0].decisao_motivo}</Aviso>}
      {c.status === 'perdida' && (
        <Aviso tipo="info">
          Motivo da perda: <strong>{nomeDoMotivo(s.organizacao.config, c.desfecho_categoria) ?? 'não informado'}</strong>
          {c.desfecho_motivo ? ` (${c.desfecho_motivo})` : ''}
          {c.concorrente_preco != null ? ` · preço do concorrente: ${moeda(c.concorrente_preco)}` : ''}
          {c.concorrente_nome ? ` (${c.concorrente_nome})` : ''}
        </Aviso>
      )}

      <div className="duas">
        <div>
          <div className="cartao">
            <div className="cabecalho" style={{ marginBottom: 8 }}>
              <h2 style={{ margin: 0 }}>
                Versão {vista?.versao} {vista && vista.id !== atual?.id && <small>(anterior)</small>}
              </h2>
              {c.validade && <span className="sutil">Válida até {data(c.validade)}</span>}
            </div>
            {vista ? <ResultadoCalculo r={vista.resultado} minhaComissao={dono} /> : <div className="vazio">Sem versão calculada.</div>}
          </div>
          {comIA && vista && (
            <div className="cartao">
              <h2>Assistente</h2>
              <p className="sutil">O assistente explica e sugere; ele não define preço nem aprova. Toda sugestão é recalculada pelo motor.</p>
              <div className="acoes">
                <button className="btn" disabled={iaOcupada} onClick={() => void pedirIA('explicar')}>
                  Explicar este preço
                </button>
                {!s.externo && s.tem('vendedor', 'gestor_pricing', 'aprovador', 'suporte') && (
                  <button className="btn" disabled={iaOcupada} onClick={() => void pedirIA('sugerir')}>
                    Sugerir contrapropostas
                  </button>
                )}
                {iaOcupada && <span className="sutil">Consultando…</span>}
              </div>
              {ia?.explicacao && <p style={{ marginTop: 12, whiteSpace: 'pre-wrap' }}>{ia.explicacao}</p>}
              {ia?.sugestoes?.length === 0 && <p className="sutil" style={{ marginTop: 12 }}>Nenhuma contraproposta válida foi encontrada.</p>}
              {ia?.sugestoes?.map((x, i) => (
                <div key={i} className="aviso" style={{ marginTop: 12 }}>
                  <strong>{x.titulo}</strong> · {moeda(x.resultado.precoFinal, x.resultado.moeda)} <Selo status={x.resultado.veredito.status}>{x.resultado.veredito.cor}</Selo>
                  <div className="sutil">{x.justificativa}</div>
                </div>
              ))}
            </div>
          )}
        </div>
        <div>
          <div className="cartao">
            <h2>Versões</h2>
            <table>
              <tbody>
                {versoes.map((v) => (
                  <tr key={v.id} className="clicavel" onClick={() => setVersaoVista(v.versao)}>
                    <td>
                      <strong>v{v.versao}</strong> {v.id === atual?.id && <span className="selo azul">atual</span>}
                    </td>
                    <td className="num">{moeda(v.preco_final, v.moeda)}</td>
                    <td>
                      <Selo status={v.veredito}>{v.veredito === 'dentro' ? 'Dentro' : v.veredito === 'bloqueado' ? 'Bloqueada' : 'Exceção'}</Selo>
                    </td>
                    <td className="sutil">{dataHora(v.criado_em)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <p className="sutil" style={{ marginTop: 8 }}>Versões não mudam depois de gravadas. Clique para ver uma anterior.</p>
          </div>
          <div className="cartao">
            <h2>Linha do tempo</h2>
            {tempo.length === 0 ? (
              <div className="vazio">Sem eventos.</div>
            ) : (
              <ul className="linha-tempo">
                {tempo.map((e) => (
                  <li key={e.id}>
                    <div>{e.resumo ?? e.acao}</div>
                    <small>
                      {dataHora(e.ocorrido_em)} · {e.ator_nome ?? (e.ator_tipo === 'chave_api' ? 'integração' : e.ator_tipo === 'automacao' ? 'automação' : 'sistema')}
                    </small>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      </div>

      {modal === 'pedir' && (
        <Modal titulo="Pedir exceção" aoFechar={() => setModal(null)}>
          <Aviso tipo="erro">{acao.erro}</Aviso>
          <Campo rotulo="Motivo do pedido (obrigatório)">
            <textarea name="motivo" rows={3} autoFocus value={texto} onChange={(e) => setTexto(e.target.value)} />
          </Campo>
          <button className="btn primario" disabled={acao.ocupado || texto.trim().length < 10} onClick={() => void fazer(() => api('POST', `/cotacoes/${id}/aprovacao`, { acao: 'pedir', motivo: texto.trim() }, { idempotente: true }), 'Pedido enviado.')}>
            Enviar para aprovação
          </button>
        </Modal>
      )}
      {(modal === 'aprovar' || modal === 'recusar') && (
        <Modal titulo={modal === 'aprovar' ? 'Aprovar exceção' : 'Recusar exceção'} aoFechar={() => setModal(null)}>
          <p>A decisão vale só para a versão {atual?.versao} e fica registrada em seu nome.</p>
          <Aviso tipo="erro">{acao.erro}</Aviso>
          <Campo rotulo={modal === 'aprovar' ? 'Observação (opcional)' : 'Motivo da recusa (obrigatório)'}>
            <textarea name="decisao" rows={3} autoFocus value={texto} onChange={(e) => setTexto(e.target.value)} />
          </Campo>
          <button
            className={`btn ${modal === 'aprovar' ? 'primario' : 'perigo'}`}
            disabled={acao.ocupado || (modal === 'recusar' && texto.trim().length < 5)}
            onClick={() => void fazer(() => api('POST', `/cotacoes/${id}/aprovacao`, { acao: modal, ...(texto.trim() ? { motivo: texto.trim() } : {}) }, { idempotente: true }), modal === 'aprovar' ? 'Exceção aprovada.' : 'Exceção recusada.')}
          >
            Confirmar
          </button>
        </Modal>
      )}
      {modal === 'perdida' && (() => {
        const escolhido = motivos.find((m) => m.codigo === motivoPerda);
        const precoConcorrente = concorrente.preco.trim() ? Number(concorrente.preco.replace(/\./g, '').replace(',', '.')) : undefined;
        const pronto = !!escolhido && (!escolhido.pedeTexto || texto.trim().length >= 10);
        return (
          <Modal titulo="Registrar perda" aoFechar={() => setModal(null)}>
            <Aviso tipo="erro">{acao.erro}</Aviso>
            <Campo rotulo="Motivo">
              <select name="motivo-perda" value={motivoPerda} onChange={(e) => setMotivoPerda(e.target.value)}>
                <option value="">Escolha o motivo</option>
                {motivos.map((m) => (
                  <option key={m.codigo} value={m.codigo}>
                    {m.nome}
                  </option>
                ))}
              </select>
            </Campo>
            {escolhido?.pedeConcorrente && (
              <div className="linha-campos">
                <Campo rotulo="Concorrente (se souber)">
                  <input name="concorrente-nome" value={concorrente.nome} onChange={(e) => setConcorrente({ ...concorrente, nome: e.target.value })} />
                </Campo>
                <Campo rotulo="Preço do concorrente, R$ (se souber)">
                  <input name="concorrente-preco" inputMode="decimal" value={concorrente.preco} onChange={(e) => setConcorrente({ ...concorrente, preco: e.target.value })} />
                </Campo>
              </div>
            )}
            <Campo rotulo={escolhido?.pedeTexto ? 'Descreva o motivo (obrigatório, 10 caracteres ou mais)' : 'Detalhe (opcional)'}>
              <input name="detalhe-perda" value={texto} onChange={(e) => setTexto(e.target.value)} />
            </Campo>
            <button
              className="btn primario"
              disabled={acao.ocupado || !pronto}
              onClick={() =>
                void fazer(
                  () =>
                    api('POST', `/cotacoes/${id}/desfecho`, {
                      resultado: 'perdida',
                      categoria: motivoPerda,
                      ...(texto.trim() ? { motivo: texto.trim() } : {}),
                      ...(escolhido?.pedeConcorrente && (concorrente.nome.trim() || precoConcorrente !== undefined)
                        ? { concorrente: { ...(concorrente.nome.trim() ? { nome: concorrente.nome.trim() } : {}), ...(precoConcorrente !== undefined && Number.isFinite(precoConcorrente) ? { preco: precoConcorrente } : {}) } }
                        : {}),
                    }),
                  'Perda registrada.',
                )
              }
            >
              Registrar
            </button>
          </Modal>
        );
      })()}
    </>
  );
}
