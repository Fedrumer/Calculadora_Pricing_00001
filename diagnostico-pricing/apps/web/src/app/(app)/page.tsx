'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { Aviso, Campo, Carregando, Modal, Selo, useAcao, useDados } from '@/componentes/ui';
import { rpc } from '@/lib/api';
import { ROTULO_SEGMENTO, data } from '@/lib/formato';
import { useSessao } from '@/lib/sessao';

interface Item { id: string; nome: string; status: string; cliente: string; segmento: string | null; periodo_inicio: string; periodo_fim: string; versao_publicada: number | null }

const OPCOES_SEGMENTO = ['distribuicao', 'industria', 'varejo_b2b', 'operadora', 'consolidadora'];

function NovoDiagnostico({ aoFechar }: { aoFechar: () => void }) {
  const router = useRouter();
  const clientes = useDados<{ id: string; nome: string; setor: string }[]>(() => rpc('listar_clientes'));
  const acao = useAcao();
  const [cliente, setCliente] = useState('');
  const [novoCliente, setNovoCliente] = useState('');
  const [setor, setSetor] = useState('distribuicao');
  const [segmento, setSegmento] = useState('');
  const [nome, setNome] = useState('');
  const [inicio, setInicio] = useState('');
  const [fim, setFim] = useState('');
  const [liquidos, setLiquidos] = useState(true);

  const criar = () =>
    acao.executar(async () => {
      const idCliente = cliente === 'novo' || !clientes.dados?.length ? await rpc<string>('criar_cliente', { p_nome: novoCliente, p_setor: setor }) : cliente;
      const id = await rpc<string>('criar_diagnostico', { p_cliente: idCliente, p_nome: nome, p_inicio: inicio, p_fim: fim, p_precos_liquidos: liquidos, p_segmento: segmentoEfetivo });
      router.push(`/diagnostico?id=${id}`);
    });

  const semClientes = clientes.dados?.length === 0;
  // o segmento do diagnóstico parte do setor do cliente e pode ser trocado
  const setorDoCliente = cliente === 'novo' || semClientes ? setor : (clientes.dados ?? []).find((c) => c.id === cliente)?.setor;
  const segmentoEfetivo = segmento || setorDoCliente || 'distribuicao';
  return (
    <Modal titulo="Novo diagnóstico" aoFechar={aoFechar}>
      <Aviso tipo="erro">{acao.erro}</Aviso>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          void criar();
        }}
      >
        {!semClientes && (
          <Campo rotulo="Cliente">
            <select name="cliente" required value={cliente} onChange={(e) => setCliente(e.target.value)}>
              <option value="">Escolha…</option>
              {(clientes.dados ?? []).map((c) => (
                <option key={c.id} value={c.id}>{c.nome}</option>
              ))}
              <option value="novo">+ Novo cliente</option>
            </select>
          </Campo>
        )}
        {(cliente === 'novo' || semClientes) && (
          <div className="linha-campos">
            <Campo rotulo="Nome do cliente">
              <input name="novo_cliente" required value={novoCliente} onChange={(e) => setNovoCliente(e.target.value)} />
            </Campo>
            <Campo rotulo="Setor" dica="Define os pesos das dimensões na nota geral">
              <select name="setor" value={setor} onChange={(e) => setSetor(e.target.value)}>
                {OPCOES_SEGMENTO.map((s) => <option key={s} value={s}>{ROTULO_SEGMENTO[s]}</option>)}
              </select>
            </Campo>
          </div>
        )}
        <Campo rotulo="Segmento do diagnóstico" dica="Define as métricas do catálogo e os pesos da nota geral">
          <select name="segmento" value={segmentoEfetivo} onChange={(e) => setSegmento(e.target.value)}>
            {OPCOES_SEGMENTO.map((s) => <option key={s} value={s}>{ROTULO_SEGMENTO[s]}</option>)}
          </select>
        </Campo>
        <Campo rotulo="Nome do diagnóstico">
          <input name="nome" required value={nome} onChange={(e) => setNome(e.target.value)} placeholder="Diagnóstico de pricing 2026" />
        </Campo>
        <div className="linha-campos">
          <Campo rotulo="Início do período">
            <input name="inicio" type="date" required value={inicio} onChange={(e) => setInicio(e.target.value)} />
          </Campo>
          <Campo rotulo="Fim do período" dica="O ideal são 12 meses completos">
            <input name="fim" type="date" required value={fim} onChange={(e) => setFim(e.target.value)} />
          </Campo>
        </div>
        <label className="linha-check">
          <input type="checkbox" checked={liquidos} onChange={(e) => setLiquidos(e.target.checked)} />
          Os preços dos arquivos são líquidos de impostos
        </label>
        <div className="acoes" style={{ marginTop: 14 }}>
          <button className="btn primario" disabled={acao.ocupado}>{acao.ocupado ? 'Criando…' : 'Criar diagnóstico'}</button>
          <button type="button" className="btn" onClick={aoFechar}>Cancelar</button>
        </div>
      </form>
    </Modal>
  );
}

export default function Diagnosticos() {
  const s = useSessao();
  const router = useRouter();
  const lista = useDados<Item[]>(() => rpc('listar_diagnosticos'));
  const [novo, setNovo] = useState(false);

  return (
    <>
      <div className="cabecalho">
        <div>
          <h1>Diagnósticos</h1>
          <p>{s.consultor ? 'Um diagnóstico por cliente e período analisado.' : 'Diagnósticos publicados para a sua empresa.'}</p>
        </div>
        {s.consultor && (
          <button className="btn primario" onClick={() => setNovo(true)}>Novo diagnóstico</button>
        )}
      </div>
      <Aviso tipo="erro">{lista.erro}</Aviso>
      <div className="cartao">
        {!lista.dados ? (
          <Carregando />
        ) : lista.dados.length === 0 ? (
          <div className="vazio">{s.consultor ? 'Nenhum diagnóstico ainda. Crie o primeiro.' : 'Ainda não há diagnóstico publicado.'}</div>
        ) : (
          <div className="rolagem">
            <table>
              <thead>
                <tr><th>Cliente</th><th>Diagnóstico</th><th>Segmento</th><th>Período</th><th>Situação</th></tr>
              </thead>
              <tbody>
                {lista.dados.map((d) => (
                  <tr key={d.id} className="clicavel" onClick={() => router.push(`/diagnostico?id=${d.id}`)}>
                    <td>{d.cliente}</td>
                    <td><a href={`/diagnostico?id=${d.id}`} onClick={(e) => e.preventDefault()}>{d.nome}</a></td>
                    <td>{d.segmento ? ROTULO_SEGMENTO[d.segmento] ?? d.segmento : '—'}</td>
                    <td>{data(d.periodo_inicio)} a {data(d.periodo_fim)}</td>
                    <td>
                      <Selo status={d.status} />
                      {s.consultor && d.versao_publicada && d.status !== 'publicado' ? <small> · versão {d.versao_publicada} publicada</small> : null}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
      {novo && <NovoDiagnostico aoFechar={() => setNovo(false)} />}
    </>
  );
}
