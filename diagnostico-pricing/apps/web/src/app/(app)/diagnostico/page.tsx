'use client';

import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { Suspense, useEffect, useState } from 'react';
import { AbaDados } from '@/componentes/aba-dados';
import { AbaOportunidades, AbaRealizacao, AbaResumo } from '@/componentes/abas-painel';
import { Aviso, Carregando, Selo, useAcao, useDados } from '@/componentes/ui';
import { rpc } from '@/lib/api';
import { data, dataHora } from '@/lib/formato';
import { useSessao } from '@/lib/sessao';
import type { DadosDiagnostico, Painel } from '@/lib/tipos';

const ABAS = [
  ['resumo', 'Resumo executivo'],
  ['realizacao', 'Realização de preço'],
  ['oportunidades', 'Oportunidades'],
  ['dados', 'Dados e premissas'],
] as const;
type Aba = (typeof ABAS)[number][0];

function Tela() {
  const s = useSessao();
  const id = useSearchParams().get('id') ?? '';
  const acao = useAcao();
  const [aba, setAba] = useState<Aba | null>(null);

  const painel = useDados<Painel | null>(() => rpc('painel', { p_diagnostico: id }), [id]);
  // cargas e checagens correntes: o consultor e o cliente que envia dados enxergam; o leitor recebe vazio
  const dados = useDados<DadosDiagnostico | null>(() => (s.perfil === 'cliente_leitor' ? Promise.resolve(null) : rpc('dados_do_diagnostico', { p_diagnostico: id })), [id]);
  const recarregar = () => { painel.recarregar(); dados.recarregar(); };

  const p = painel.dados;
  const calculado = !!p && p.metricas.length > 0;
  useEffect(() => {
    if (aba === null && painel.dados !== null) setAba(calculado ? 'resumo' : 'dados');
  }, [aba, painel.dados, calculado]);

  if (painel.erro) return <Aviso tipo="erro">{painel.erro}</Aviso>;
  if (painel.dados === null) return <Carregando />;
  if (!p?.diagnostico) {
    return (
      <div className="cartao vazio">
        Este diagnóstico não existe ou ainda não foi publicado para você. <Link href="/">Voltar</Link>
      </div>
    );
  }
  const d = p.diagnostico;
  const status = dados.dados?.diagnostico?.status ?? d.status;

  const calcular = () =>
    acao.executar(async () => {
      const r = await rpc<{ calculado: boolean; bloqueio?: string }>('calcular_diagnostico', { p_diagnostico: id });
      recarregar();
      if (!r.calculado) throw new Error(r.bloqueio);
      setAba('resumo');
    }, 'Diagnóstico calculado.');
  const validar = () =>
    acao.executar(async () => {
      const r = await rpc<{ pode_calcular: boolean; bloqueio?: string }>('validar_diagnostico', { p_diagnostico: id });
      recarregar();
      setAba('dados');
      if (!r.pode_calcular) throw new Error(r.bloqueio);
    }, 'Dados validados. Confira as checagens e calcule.');
  const publicar = () =>
    acao.executar(async () => {
      const versao = await rpc<number>('publicar_diagnostico', { p_diagnostico: id });
      recarregar();
      return versao;
    }, 'Publicado. O cliente passa a ver esta versão.');

  return (
    <>
      <div className="cabecalho">
        <div>
          <p><Link href="/">Diagnósticos</Link> / {d.cliente.nome}</p>
          <h1>{d.nome}</h1>
          <p>
            {data(d.periodo_inicio)} a {data(d.periodo_fim)} · <Selo status={status} />
            {p.publicacao ? <> · versão {p.publicacao.versao}, publicada em {dataHora(p.publicacao.publicado_em)}</> : d.calculado_em ? <> · calculado em {dataHora(d.calculado_em)}</> : null}
          </p>
        </div>
        {s.consultor && (
          <div className="acoes">
            <button className="btn" disabled={acao.ocupado} onClick={() => void validar()}>Validar dados</button>
            <button className="btn primario" disabled={acao.ocupado} onClick={() => void calcular()}>{acao.ocupado ? 'Processando…' : calculado ? 'Recalcular' : 'Calcular diagnóstico'}</button>
            <button className="btn" disabled={acao.ocupado || !['calculado', 'publicado'].includes(status)} onClick={() => void publicar()}>Publicar para o cliente</button>
          </div>
        )}
      </div>
      <Aviso tipo="erro">{acao.erro}</Aviso>
      <Aviso tipo="ok">{acao.ok}</Aviso>
      {s.consultor && d.versao_publicada && status !== 'publicado' && (
        <Aviso tipo="atencao">O cliente vê a versão {d.versao_publicada}, publicada em {dataHora(d.publicado_em)}. O que está nesta tela mudou depois e só chega a ele quando você publicar de novo.</Aviso>
      )}
      {s.consultor && calculado && status === 'rascunho' && <Aviso tipo="atencao">Há carga nova depois do último cálculo. Recalcule para atualizar os números.</Aviso>}

      <div className="abas" role="tablist">
        {ABAS.map(([codigo, rotulo]) => (
          <button key={codigo} role="tab" aria-selected={aba === codigo} className={aba === codigo ? 'ativa' : ''} onClick={() => setAba(codigo)}>
            {rotulo}
          </button>
        ))}
      </div>

      {aba !== 'dados' && !calculado ? (
        <div className="cartao vazio">Este diagnóstico ainda não foi calculado. Envie os arquivos em “Dados e premissas” e calcule.</div>
      ) : aba === 'resumo' ? (
        <AbaResumo p={p} />
      ) : aba === 'realizacao' ? (
        <AbaRealizacao p={p} />
      ) : aba === 'oportunidades' ? (
        <AbaOportunidades p={p} podeEditar={s.consultor} aoMudar={recarregar} />
      ) : aba === 'dados' ? (
        <AbaDados painel={p} dados={dados.dados ?? null} podeEditar={s.consultor} aoMudar={recarregar} />
      ) : null}
    </>
  );
}

export default function Diagnostico() {
  return (
    <Suspense fallback={<Carregando />}>
      <Tela />
    </Suspense>
  );
}
