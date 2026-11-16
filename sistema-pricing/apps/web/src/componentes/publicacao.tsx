'use client';

import { useState } from 'react';
import { ErroApi, api } from '@/lib/api';
import { hojeIso, moeda, pct } from '@/lib/formato';
import { Aviso, Campo, Modal, useAcao } from './ui';

interface Caso {
  nome: string;
  passou: boolean;
  divergencias: { campo: string; esperado: unknown; obtido: unknown }[];
}

export function RelatorioCasos({ r }: { r: { total: number; aprovados: number; reprovados: number; casos: Caso[] } }) {
  return (
    <div>
      <p>
        <span className={`selo ${r.reprovados === 0 ? 'verde' : 'vermelho'}`} data-testid="casos-resumo">
          {r.aprovados} de {r.total} casos de referência batem
        </span>
      </p>
      {r.casos.map((c) => (
        <div key={c.nome} className="detalhe-linha">
          <span>
            {c.passou ? '✓' : '✗'} {c.nome}
            {!c.passou && (
              <div className="sutil">
                {c.divergencias.map((d) => `${d.campo}: esperado ${String(d.esperado)}, obtido ${String(d.obtido)}`).join('; ')}
              </div>
            )}
          </span>
        </div>
      ))}
    </div>
  );
}

/** Simulação de impacto e publicação com vigência, para um rascunho de tabela ou de política. */
export function PainelPublicacao({ id, aoPublicar }: { id: string; aoPublicar: () => void }) {
  const [impacto, setImpacto] = useState<Record<string, any> | null>(null);
  const [aberto, setAberto] = useState(false);
  const [vigencia, setVigencia] = useState(hojeIso());
  const [motivo, setMotivo] = useState('');
  const [reprovados, setReprovados] = useState<Caso[] | null>(null);
  const acao = useAcao();

  const simular = () => acao.executar(async () => setImpacto(await api('POST', `/regras/${id}/impacto`)));
  const publicar = () =>
    acao.executar(async () => {
      try {
        await api('POST', `/regras/${id}/publicar`, { vigenciaInicio: vigencia, ...(reprovados ? { forcar: true, motivo: motivo.trim() } : {}) });
      } catch (e) {
        if (e instanceof ErroApi && e.codigo === 'CASOS_DE_REFERENCIA_REPROVADOS') setReprovados((e.detalhes as Caso[]) ?? []);
        throw e;
      }
      setAberto(false);
      aoPublicar();
    });

  const i = impacto?.impacto;
  return (
    <div className="cartao">
      <h2>Simular e publicar</h2>
      <p className="sutil">Antes de publicar, veja o efeito do rascunho nas cotações dos últimos 90 dias e nos casos de referência.</p>
      <Aviso tipo="erro">{!aberto && acao.erro}</Aviso>
      <div className="acoes">
        <button className="btn" disabled={acao.ocupado} onClick={() => void simular()}>
          Simular impacto
        </button>
        <button className="btn primario" onClick={() => setAberto(true)}>
          Publicar…
        </button>
      </div>
      {impacto && (
        <div style={{ marginTop: 14 }} data-testid="impacto">
          {impacto.validacao.erros.length > 0 && <Aviso tipo="erro">Erros que impedem a publicação: {impacto.validacao.erros.join(' ')}</Aviso>}
          {impacto.validacao.avisos.length > 0 && <Aviso tipo="atencao">{impacto.validacao.avisos.join(' ')}</Aviso>}
          {i?.amostra > 0 ? (
            <div className="grade g3" style={{ marginBottom: 12 }}>
              <div className="indicador">
                <span className="rotulo">Preço médio</span>
                <strong>
                  {moeda(i.precoMedioAntes)} → {moeda(i.precoMedioDepois)}
                </strong>
                <small>{i.variacaoPrecoPct > 0 ? '+' : ''}{pct(i.variacaoPrecoPct, 2)} em {i.amostra} cotações</small>
              </div>
              <div className="indicador">
                <span className="rotulo">Margem</span>
                <strong>
                  {pct(i.margemPctAntes)} → {pct(i.margemPctDepois)}
                </strong>
              </div>
              <div className="indicador">
                <span className="rotulo">Mudam de situação</span>
                <strong>{i.mudancasDeVeredito.reduce((n: number, m: any) => n + m.quantidade, 0)} cotações</strong>
                <small>{i.mudancasDeVeredito.map((m: any) => `${m.quantidade}: ${m.de} → ${m.para}`).join('; ') || 'nenhuma'}</small>
              </div>
            </div>
          ) : (
            <p className="sutil">{i?.aviso ?? 'Não há cotações recentes para comparar.'}</p>
          )}
          {impacto.casosReferencia && <RelatorioCasos r={impacto.casosReferencia} />}
        </div>
      )}
      {aberto && (
        <Modal titulo="Publicar versão" aoFechar={() => setAberto(false)}>
          <p>Depois de publicada, a versão não pode mais ser alterada. Cotações já emitidas mantêm o preço até a própria validade.</p>
          <Aviso tipo="erro">{acao.erro}</Aviso>
          <Campo rotulo="Vigência a partir de">
            <input name="vigencia" type="date" min={hojeIso()} value={vigencia} onChange={(e) => setVigencia(e.target.value)} />
          </Campo>
          {reprovados && (
            <>
              <Aviso tipo="atencao">
                {reprovados.length} {reprovados.length === 1 ? 'caso de referência deixa' : 'casos de referência deixam'} de bater com esta versão. Se a mudança é intencional (um reajuste, por exemplo), registre o motivo para publicar e atualize os casos em seguida.
              </Aviso>
              <Campo rotulo="Motivo (fica na auditoria)">
                <textarea name="motivo-publicacao" rows={2} value={motivo} onChange={(e) => setMotivo(e.target.value)} />
              </Campo>
            </>
          )}
          <button className="btn primario" disabled={acao.ocupado || (!!reprovados && motivo.trim().length < 10)} onClick={() => void publicar()}>
            {reprovados ? 'Publicar mesmo assim' : 'Publicar'}
          </button>
        </Modal>
      )}
    </div>
  );
}
