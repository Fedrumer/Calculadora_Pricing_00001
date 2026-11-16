'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useMemo, useState } from 'react';
import { Aviso, Carregando, Selo, ou, useDados } from '@/componentes/ui';
import { ROTULO_STATUS, data, moeda } from '@/lib/formato';
import { useSessao } from '@/lib/sessao';
import { supabase } from '@/lib/supabase';

interface Linha {
  id: string;
  numero: number;
  cliente_nome: string;
  status: string;
  validade: string | null;
  criado_em: string;
  canal_id: string | null;
  dono_id: string | null;
  produto_id: string;
  versao_atual_id: string | null;
  origem: string;
}

export default function Cotacoes() {
  const s = useSessao();
  const router = useRouter();
  const [status, setStatus] = useState('');
  const [busca, setBusca] = useState('');
  const [validade, setValidade] = useState('');

  const { dados, erro } = useDados(async () => {
    const sb = supabase();
    let q = sb.from('cotacoes').select('id, numero, cliente_nome, status, validade, criado_em, canal_id, dono_id, produto_id, versao_atual_id, origem').order('criado_em', { ascending: false }).limit(300);
    if (status) q = q.eq('status', status);
    const cotacoes = ou(await q) as Linha[];
    const ids = cotacoes.map((c) => c.versao_atual_id).filter(Boolean) as string[];
    const [versoes, produtos, canais, pessoas] = await Promise.all([
      ids.length ? sb.from(s.externo ? 'v_cotacao_versoes' : 'cotacao_versoes').select('id, preco_final, moeda, veredito').in('id', ids) : Promise.resolve({ data: [], error: null }),
      sb.from('produtos').select('id, nome'),
      sb.from('canais').select('id, nome'),
      sb.from('v_pessoas').select('id, nome'),
    ]);
    const mapa = <T extends { id: string }>(l: T[]) => new Map(l.map((x) => [x.id, x]));
    return { cotacoes, versoes: mapa(ou(versoes) as { id: string; preco_final: number; moeda: string; veredito: string }[]), produtos: mapa(ou(produtos) as { id: string; nome: string }[]), canais: mapa(ou(canais) as { id: string; nome: string }[]), pessoas: mapa(ou(pessoas) as { id: string; nome: string }[]) };
  }, [status]);

  const filtradas = useMemo(() => {
    if (!dados) return [];
    const termo = busca.trim().toLowerCase();
    const hoje = new Date().toISOString().slice(0, 10);
    const em7 = new Date(Date.now() + 7 * 86400000).toISOString().slice(0, 10);
    return dados.cotacoes.filter((c) => {
      if (termo && !(`${c.numero}`.includes(termo) || c.cliente_nome.toLowerCase().includes(termo))) return false;
      if (validade === 'vencendo' && !(c.status === 'emitida' && c.validade && c.validade >= hoje && c.validade <= em7)) return false;
      if (validade === 'vencidas' && !(c.validade && c.validade < hoje && c.status === 'emitida')) return false;
      return true;
    });
  }, [dados, busca, validade]);

  return (
    <>
      <div className="cabecalho">
        <div>
          <h1>{s.interno ? 'Cotações' : 'Minhas cotações'}</h1>
          <p>{s.interno ? 'Todas as cotações da organização.' : 'As cotações que você criou.'}</p>
        </div>
        {s.podeCotar && (
          <Link className="btn primario" href="/cotacoes/nova">
            Nova cotação
          </Link>
        )}
      </div>
      <div className="cartao">
        <div className="linha-campos" style={{ marginBottom: 12 }}>
          <input name="busca" placeholder="Buscar por número ou cliente" value={busca} onChange={(e) => setBusca(e.target.value)} aria-label="Buscar" />
          <select name="status" value={status} onChange={(e) => setStatus(e.target.value)} aria-label="Status">
            <option value="">Todos os status</option>
            {['rascunho', 'em_aprovacao', 'recusada', 'aprovada', 'emitida', 'aceita', 'perdida', 'expirada', 'cancelada'].map((x) => (
              <option key={x} value={x}>
                {ROTULO_STATUS[x]}
              </option>
            ))}
          </select>
          <select name="validade" value={validade} onChange={(e) => setValidade(e.target.value)} aria-label="Validade">
            <option value="">Qualquer validade</option>
            <option value="vencendo">Vencem em até 7 dias</option>
            <option value="vencidas">Vencidas sem desfecho</option>
          </select>
        </div>
        <Aviso tipo="erro">{erro}</Aviso>
        {!dados ? (
          <Carregando />
        ) : filtradas.length === 0 ? (
          <div className="vazio">Nenhuma cotação encontrada.</div>
        ) : (
          <div className="rolagem">
            <table>
              <thead>
                <tr>
                  <th>Nº</th>
                  <th>Cliente</th>
                  <th>Produto</th>
                  <th>Canal</th>
                  {s.interno && <th>Dono</th>}
                  <th className="num">Preço</th>
                  <th>Status</th>
                  <th>Validade</th>
                  <th>Criada</th>
                </tr>
              </thead>
              <tbody>
                {filtradas.map((c) => {
                  const v = c.versao_atual_id ? dados.versoes.get(c.versao_atual_id) : undefined;
                  return (
                    <tr key={c.id} className="clicavel" onClick={() => router.push(`/cotacoes/${c.id}`)}>
                      <td>
                        <Link href={`/cotacoes/${c.id}`} onClick={(e) => e.stopPropagation()}>
                          {c.numero}
                        </Link>
                      </td>
                      <td>{c.cliente_nome}</td>
                      <td>{dados.produtos.get(c.produto_id)?.nome ?? '—'}</td>
                      <td>{c.canal_id ? (dados.canais.get(c.canal_id)?.nome ?? '—') : 'Venda direta'}</td>
                      {s.interno && <td>{c.dono_id ? (dados.pessoas.get(c.dono_id)?.nome ?? '—') : 'Integração'}</td>}
                      <td className="num">{v ? moeda(v.preco_final, v.moeda) : '—'}</td>
                      <td>
                        <Selo status={c.status} />
                      </td>
                      <td>{data(c.validade)}</td>
                      <td>{data(c.criado_em)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
        {dados && dados.cotacoes.length >= 300 && <p className="sutil">Mostrando as 300 mais recentes; use os filtros para refinar.</p>}
      </div>
    </>
  );
}
