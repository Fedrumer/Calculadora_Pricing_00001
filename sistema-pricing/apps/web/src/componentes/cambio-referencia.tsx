'use client';

import { useState } from 'react';
import { api } from '@/lib/api';
import { data, dataHora, hojeIso, moeda as dinheiro, pct } from '@/lib/formato';
import { useSessao } from '@/lib/sessao';
import { Aviso, Campo, Carregando, Modal, useAcao, useDados } from './ui';

interface Cambios {
  vigentes: { moeda: string; taxa: number; vigente_de: string; origem: string }[];
  historico: { id: string; moeda: string; taxa: number; vigente_de: string; origem: string; observacao: string | null; criado_em: string; publicado_por: string | null }[];
  moedasEmUso: string[];
}

const taxa = (v: number) => new Intl.NumberFormat('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 6 }).format(v);

/**
 * Câmbio de referência: quantos reais vale cada moeda em que a empresa paga custos.
 * Não muda preço; muda a margem calculada e, com ela, o semáforo das próximas cotações.
 */
export function CambioReferencia() {
  const s = useSessao();
  const gestor = s.tem('gestor_pricing');
  const { dados, erro, recarregar } = useDados(() => api<Cambios>('GET', '/regras/cambios'));
  const [form, setForm] = useState<{ moeda: string; taxa: string; vigenteDe: string; observacao: string } | null>(null);
  const [impacto, setImpacto] = useState<Record<string, any> | null>(null);
  const acao = useAcao();

  if (erro) return <Aviso tipo="erro">{erro}</Aviso>;
  if (!dados) return <Carregando />;
  const moedas = [...new Set([...dados.moedasEmUso, ...dados.vigentes.map((v) => v.moeda)])];
  const corpo = () => ({ moeda: form!.moeda.trim().toUpperCase(), taxa: Number(form!.taxa.replace(',', '.')), vigenteDe: form!.vigenteDe, ...(form!.observacao.trim() ? { observacao: form!.observacao.trim() } : {}) });
  const simular = () => acao.executar(async () => setImpacto((await api('POST', '/regras/cambios', { ...corpo(), simular: true })).impacto));
  const publicar = () =>
    acao.executar(async () => {
      await api('POST', '/regras/cambios', corpo(), { idempotente: true });
      setForm(null);
      setImpacto(null);
      recarregar();
    }, 'Câmbio de referência publicado.');

  return (
    <div className="cartao" data-testid="cambio-referencia">
      <div className="cabecalho" style={{ marginBottom: 8 }}>
        <h2 style={{ margin: 0 }}>Câmbio de referência</h2>
        {gestor && (
          <button className="btn" onClick={() => (setForm({ moeda: moedas[0] ?? 'EUR', taxa: '', vigenteDe: hojeIso(), observacao: '' }), setImpacto(null), acao.limpar())}>
            Publicar câmbio
          </button>
        )}
      </div>
      <p className="sutil">
        Converte os custos pagos em moeda estrangeira. Não muda o preço de tabela: muda a margem e o semáforo das próximas cotações. As propostas já emitidas não mudam.
      </p>
      <Aviso tipo="ok">{!form && acao.ok}</Aviso>
      {moedas.length === 0 ? (
        <div className="vazio">Nenhum custo em moeda estrangeira na política vigente.</div>
      ) : (
        <table>
          <thead>
            <tr>
              <th>Moeda</th>
              <th className="num">Reais por unidade</th>
              <th>Vigente desde</th>
            </tr>
          </thead>
          <tbody>
            {moedas.map((m) => {
              const v = dados.vigentes.find((x) => x.moeda === m);
              return (
                <tr key={m}>
                  <td>{m}</td>
                  <td className="num">{v ? `R$ ${taxa(v.taxa)}` : <span className="selo vermelho">sem câmbio vigente</span>}</td>
                  <td>{v ? data(v.vigente_de) : '—'}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
      {dados.historico.length > 1 && (
        <details style={{ marginTop: 10 }}>
          <summary className="sutil" style={{ cursor: 'pointer' }}>Histórico ({dados.historico.length})</summary>
          {dados.historico.map((h) => (
            <div key={h.id} className="detalhe-linha">
              <span>
                {h.moeda} R$ {taxa(h.taxa)} a partir de {data(h.vigente_de)}
                {h.observacao ? <span className="sutil"> · {h.observacao}</span> : null}
              </span>
              <span className="sutil">
                {h.publicado_por ?? 'instalação'} · {dataHora(h.criado_em)}
              </span>
            </div>
          ))}
        </details>
      )}
      {form && (
        <Modal titulo="Publicar câmbio de referência" aoFechar={() => setForm(null)}>
          <Aviso tipo="erro">{acao.erro}</Aviso>
          <div className="linha-campos">
            <Campo rotulo="Moeda">
              <input name="cambio-moeda" maxLength={3} value={form.moeda} onChange={(e) => (setForm({ ...form, moeda: e.target.value.toUpperCase() }), setImpacto(null))} />
            </Campo>
            <Campo rotulo="Reais por unidade">
              <input name="cambio-taxa" inputMode="decimal" placeholder="6,10" value={form.taxa} onChange={(e) => (setForm({ ...form, taxa: e.target.value }), setImpacto(null))} />
            </Campo>
            <Campo rotulo="Vigente a partir de">
              <input name="cambio-vigencia" type="date" min={hojeIso()} value={form.vigenteDe} onChange={(e) => setForm({ ...form, vigenteDe: e.target.value })} />
            </Campo>
          </div>
          <Campo rotulo="Observação (opcional)">
            <input name="cambio-observacao" value={form.observacao} onChange={(e) => setForm({ ...form, observacao: e.target.value })} />
          </Campo>
          {impacto && (
            <div className="aviso info" data-testid="impacto-cambio">
              {impacto.amostra > 0 ? (
                <>
                  Em {impacto.amostra} cotações dos últimos 90 dias, recalculadas hoje: preço médio {dinheiro(impacto.precoMedioDepois)} (não muda); margem de {pct(impacto.margemPctAntes)} para{' '}
                  <strong>{pct(impacto.margemPctDepois)}</strong>.
                  {impacto.mudancasDeVeredito.length > 0 && (
                    <> Mudam de situação: {impacto.mudancasDeVeredito.map((m: any) => `${m.quantidade} de ${m.de} para ${m.para}`).join('; ')}.</>
                  )}
                </>
              ) : (
                'Não há cotações recentes para comparar.'
              )}
            </div>
          )}
          <div className="acoes">
            <button className="btn" disabled={acao.ocupado || !form.taxa} onClick={() => void simular()}>
              Simular impacto
            </button>
            <button className="btn primario" disabled={acao.ocupado || !form.taxa} onClick={() => void publicar()}>
              Publicar
            </button>
          </div>
        </Modal>
      )}
    </div>
  );
}
