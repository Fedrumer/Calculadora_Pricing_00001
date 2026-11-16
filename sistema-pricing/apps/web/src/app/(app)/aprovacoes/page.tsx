'use client';

import Link from 'next/link';
import { Aviso, Carregando, Selo, ou, useDados } from '@/componentes/ui';
import { dataHora, moeda, pct } from '@/lib/formato';
import { useSessao } from '@/lib/sessao';
import { supabase } from '@/lib/supabase';

export default function FilaDeAprovacoes() {
  const s = useSessao();
  const { dados, erro } = useDados(async () => {
    const sb = supabase();
    const aprov = ou(await sb.from('aprovacoes').select('*').order('criado_em', { ascending: false }).limit(200)) as Record<string, any>[];
    const cotIds = [...new Set(aprov.map((a) => a.cotacao_id))];
    const verIds = [...new Set(aprov.map((a) => a.versao_id))];
    const [cot, ver, pessoas, canais] = await Promise.all([
      cotIds.length ? sb.from('cotacoes').select('id, numero, cliente_nome, canal_id').in('id', cotIds) : Promise.resolve({ data: [], error: null }),
      verIds.length ? sb.from('cotacao_versoes').select('id, preco_final, moeda, desconto_pct, margem_pct, margem_valor').in('id', verIds) : Promise.resolve({ data: [], error: null }),
      sb.from('v_pessoas').select('id, nome'),
      sb.from('canais').select('id, nome'),
    ]);
    const mapa = (l: Record<string, any>[]) => new Map(l.map((x) => [x.id as string, x]));
    // histórico do solicitante: quantos pedidos fez e quantos foram aprovados
    const historico = new Map<string, { pedidos: number; aprovados: number }>();
    for (const a of aprov) {
      const h = historico.get(a.solicitante_id) ?? { pedidos: 0, aprovados: 0 };
      h.pedidos += 1;
      if (a.status === 'aprovada') h.aprovados += 1;
      historico.set(a.solicitante_id, h);
    }
    return { aprov, cot: mapa(ou(cot) as Record<string, any>[]), ver: mapa(ou(ver) as Record<string, any>[]), pessoas: mapa(ou(pessoas) as Record<string, any>[]), canais: mapa(ou(canais) as Record<string, any>[]), historico };
  });

  if (erro) return <Aviso tipo="erro">{erro}</Aviso>;
  if (!dados) return <Carregando />;
  const pendentes = dados.aprov.filter((a) => a.status === 'pendente');
  const decididas = dados.aprov.filter((a) => a.status !== 'pendente').slice(0, 30);
  const meuNivel = s.usuario.limiteAlcada ?? 0;

  const linha = (a: Record<string, any>, pendente: boolean) => {
    const c = dados.cot.get(a.cotacao_id);
    const v = dados.ver.get(a.versao_id);
    const h = dados.historico.get(a.solicitante_id);
    const atrasada = pendente && new Date(a.prazo) < new Date();
    return (
      <tr key={a.id}>
        <td>
          <Link href={`/cotacoes/detalhe?id=${a.cotacao_id}`}>{c?.numero ?? '—'}</Link>
          <div className="sutil">{c?.cliente_nome}</div>
        </td>
        <td>
          {dados.pessoas.get(a.solicitante_id)?.nome ?? 'Integração'}
          {pendente && h && <div className="sutil">{h.pedidos} pedidos, {h.aprovados} aprovados</div>}
        </td>
        <td style={{ maxWidth: 280 }}>{a.motivo}</td>
        <td className="num">{v ? moeda(v.preco_final, v.moeda) : '—'}</td>
        <td className="num">{v ? pct(v.desconto_pct) : '—'}</td>
        <td className="num">{v ? `${pct(v.margem_pct)}` : '—'}</td>
        <td>
          Nível {a.nivel_alcada}
          {pendente && a.nivel_alcada > meuNivel && <div className="sutil">acima da sua alçada</div>}
        </td>
        <td>
          {pendente ? (
            <span className={atrasada ? 'selo vermelho' : 'selo amarelo'}>{atrasada ? 'Fora do prazo' : `até ${dataHora(a.prazo)}`}</span>
          ) : (
            <>
              <Selo status={a.status} />
              <div className="sutil">{dados.pessoas.get(a.aprovador_id)?.nome}</div>
            </>
          )}
        </td>
        <td>
          {pendente && (
            <Link className="btn pequeno primario" href={`/cotacoes/detalhe?id=${a.cotacao_id}`}>
              Analisar
            </Link>
          )}
        </td>
      </tr>
    );
  };

  const cabecalho = (
    <thead>
      <tr>
        <th>Cotação</th>
        <th>Solicitante</th>
        <th>Motivo</th>
        <th className="num">Preço</th>
        <th className="num">Desconto</th>
        <th className="num">Margem</th>
        <th>Alçada</th>
        <th>Situação</th>
        <th />
      </tr>
    </thead>
  );

  return (
    <>
      <div className="cabecalho">
        <div>
          <h1>Fila de aprovações</h1>
          <p>Exceções aguardando decisão. Sua alçada: {meuNivel > 0 ? `nível ${meuNivel}` : 'nenhuma'}.</p>
        </div>
      </div>
      <div className="cartao">
        <h2>Pendentes ({pendentes.length})</h2>
        {pendentes.length === 0 ? (
          <div className="vazio">Nenhuma exceção aguardando decisão.</div>
        ) : (
          <div className="rolagem">
            <table>
              {cabecalho}
              <tbody>{pendentes.map((a) => linha(a, true))}</tbody>
            </table>
          </div>
        )}
      </div>
      <div className="cartao">
        <h2>Decididas recentemente</h2>
        {decididas.length === 0 ? (
          <div className="vazio">Ainda não há decisões.</div>
        ) : (
          <div className="rolagem">
            <table>
              {cabecalho}
              <tbody>{decididas.map((a) => linha(a, false))}</tbody>
            </table>
          </div>
        )}
      </div>
    </>
  );
}
