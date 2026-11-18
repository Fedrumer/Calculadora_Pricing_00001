'use client';

import type { Resultado, ResultadoPublico } from '@pricing/motor';
import { moeda, pct } from '@/lib/formato';

export type ResultadoTela = Resultado | ResultadoPublico;

const TITULO = { verde: 'Dentro da política: pode emitir', amarelo: 'Fora da política: exige aprovação', vermelho: 'Bloqueada pela política' } as const;

/** Semáforo de política: verde emite na hora, amarelo pede aprovação, vermelho bloqueia e mostra o limite rompido. */
export function Semaforo({ r }: { r: ResultadoTela }) {
  const v = r.veredito;
  return (
    <div className={`semaforo ${v.cor}`} data-testid="semaforo" data-cor={v.cor}>
      <span className="luz" aria-hidden />
      <div>
        <strong>{TITULO[v.cor]}</strong>
        {v.status === 'exige_aprovacao' && (
          <div>
            Alçada necessária: nível {v.nivelAlcada} ({v.nomeAlcada})
          </div>
        )}
        {v.motivos.length > 0 && (
          <ul>
            {v.motivos.map((m, i) => (
              <li key={i}>{m.mensagem}</li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

/** Mostra o que o servidor devolveu. Perfis externos já recebem o resultado sem custo nem margem. */
const NOME_MOEDA: Record<string, string> = { EUR: 'euro', USD: 'dólar', GBP: 'libra', ARS: 'peso argentino', CLP: 'peso chileno' };
const SIMBOLO: Record<string, string> = { EUR: '€', USD: 'US$', GBP: '£' };
const valorEm = (v: number, m: string) => `${SIMBOLO[m] ?? m} ${new Intl.NumberFormat('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(v)}`;
const taxaFmt = (v: number) => new Intl.NumberFormat('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 4 }).format(v);

/**
 * Mostra o que o servidor devolveu. Perfis externos já recebem o resultado sem custo,
 * margem, câmbio nem comissão do vendedor; versões gravadas antes do motor 1.1.0 não
 * têm exposição cambial nem comissão do vendedor, e a tela só omite esses blocos.
 */
export function ResultadoCalculo({ r, semSemaforo, minhaComissao }: { r: ResultadoTela; semSemaforo?: boolean; minhaComissao?: boolean }) {
  const comMargem = 'margemPct' in r;
  const comissaoVendedor = 'comissaoVendedor' in r ? r.comissaoVendedor : null;
  const exposicao = 'exposicaoCambial' in r ? (r.exposicaoCambial ?? []) : [];
  return (
    <div>
      <div className="sutil">Preço final</div>
      <div className="preco-final" data-testid="preco-final">
        {moeda(r.precoFinal, r.moeda)}
      </div>
      <div className="grade g3" style={{ margin: '10px 0 14px' }}>
        <div className="indicador">
          <span className="rotulo">Desconto</span>
          <strong>{pct(r.descontoPct)}</strong>
        </div>
        {r.canal && (
          <div className="indicador">
            <span className="rotulo">Comissão do canal</span>
            <strong>
              {moeda(r.comissaoValor, r.moeda)} ({pct(r.comissaoPct)})
            </strong>
          </div>
        )}
        {comMargem && (
          <div className="indicador">
            <span className="rotulo">Margem</span>
            <strong data-testid="margem">
              {moeda(r.margemValor, r.moeda)} ({pct(r.margemPct)})
            </strong>
          </div>
        )}
        {comissaoVendedor && (
          <div className="indicador">
            <span className="rotulo">{minhaComissao ? 'Sua comissão nesta cotação' : 'Comissão do vendedor'}</span>
            <strong data-testid="comissao-vendedor">{moeda(comissaoVendedor.valor, r.moeda)}</strong>
            <small>
              {pct(comissaoVendedor.pct, 0)} {comissaoVendedor.base === 'margem' ? 'da margem' : 'da receita'}
              {comissaoVendedor.deduzidaDaMargem ? '' : ' · simulação, não deduzida'}
            </small>
          </div>
        )}
      </div>
      {exposicao.map((e) => (
        <p key={e.moeda} className="aviso info" data-testid="cambio-equilibrio" style={{ marginBottom: 12 }}>
          {e.cambioEquilibrio !== null ? (
            <>
              Câmbio que zera a margem: <strong>R$ {taxaFmt(e.cambioEquilibrio)} por {NOME_MOEDA[e.moeda] ?? e.moeda}</strong>
              {e.folgaPct !== null && <> (folga de {pct(e.folgaPct)} sobre a referência de R$ {taxaFmt(e.taxa)})</>}.
            </>
          ) : (
            <>Custos em {NOME_MOEDA[e.moeda] ?? e.moeda} convertidos a R$ {taxaFmt(e.taxa)}.</>
          )}{' '}
          <span className="sutil">
            {valorEm(e.valorMoeda, e.moeda)} em custos nesta moeda = {moeda(e.valorConvertido, r.moeda)}.
          </span>
        </p>
      ))}
      {!semSemaforo && <Semaforo r={r} />}
      {r.avisos.map((a, i) => (
        <p key={i} className="sutil" style={{ marginTop: 8 }}>
          {a}
        </p>
      ))}
      <h3 style={{ marginTop: 16 }}>Como o preço foi formado</h3>
      <div>
        {r.detalhamento.map((l, i) => (
          <div key={i} className={`detalhe-linha ${l.interno ? 'interno' : ''}`}>
            <span>
              {l.descricao}
              {l.percentual !== undefined && l.tipo !== 'preco_base' && l.tipo !== 'margem' ? ` (${pct(Math.abs(l.percentual), 2)})` : ''}
              {l.moeda && l.valorMoeda !== undefined && l.taxa !== undefined ? ` (${valorEm(l.valorMoeda, l.moeda)} × ${taxaFmt(l.taxa)})` : ''}
            </span>
            <span className="num">{l.tipo === 'margem' ? `${moeda(l.valor, r.moeda)} (${pct(l.percentual)})` : moeda(l.valor, r.moeda)}</span>
          </div>
        ))}
      </div>
      <p className="sutil" style={{ marginTop: 10 }}>
        Tabela v{r.versoes.tabela.versao} · política v{r.versoes.politica.versao} · motor {r.versoes.motor}
      </p>
    </div>
  );
}
