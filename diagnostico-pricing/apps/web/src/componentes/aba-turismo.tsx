'use client';

import { moeda, numero, pct } from '@/lib/formato';
import type { Metrica, Painel } from '@/lib/tipos';

// Turismo: câmbio, capacidade e margem por passageiro. Tudo vem pronto do banco, no detalhe de cada
// métrica; a tela só junta as listas por produto para mostrar lado a lado.

const metrica = (p: Painel, codigo: string): Metrica | null => p.metricas.find((m) => m.codigo === codigo) ?? null;

export const temTurismo = (p: Painel) => p.metricas.some((m) => m.dimensao === 'cambio' || m.dimensao === 'capacidade');

function Indicador({ rotulo, m, formato, apoio }: { rotulo: string; m: Metrica | null; formato: (v: number) => string; apoio?: string }) {
  return (
    <div className="cartao indicador" style={{ marginBottom: 0 }}>
      <span className="rotulo">{rotulo}</span>
      <span className="valor">{m?.valor == null ? '—' : formato(m.valor)}</span>
      <small>{m?.valor == null ? (m?.detalhe?.indisponivel ?? 'indisponível') : apoio}</small>
    </div>
  );
}

function Barra({ valor }: { valor: number }) {
  return (
    <div className="barra-trilho" style={{ minWidth: 80 }}>
      <div style={{ width: `${Math.min(100, Math.max(0, valor))}%`, height: 10, borderRadius: '0 4px 4px 0', background: 'var(--primaria)' }} />
    </div>
  );
}

export function AbaTurismo({ p }: { p: Painel }) {
  const margem = metrica(p, 'margem_passageiro');
  const cambial = metrica(p, 'resultado_cambial_pct');
  const equilibrio = metrica(p, 'cambio_equilibrio');
  const ocupacao = metrica(p, 'ocupacao_bloqueio_pct');
  const lugar = metrica(p, 'custo_lugar_nao_vendido');
  const markup = metrica(p, 'markup_fornecedor_pct');
  const curva = metrica(p, 'curva_reservas_vs_anterior');

  const porProduto: Record<string, any> = {};
  for (const x of margem?.detalhe?.por_produto ?? []) porProduto[x.produto] = { ...x };
  for (const x of equilibrio?.detalhe?.por_produto ?? []) porProduto[x.produto] = { ...porProduto[x.produto], ...x };
  const produtos = Object.values(porProduto).sort((a: any, b: any) => (a.folga_pct ?? Infinity) - (b.folga_pct ?? Infinity));
  const bloqueios: any[] = ocupacao?.detalhe?.bloqueios ?? [];
  const fornecedores: any[] = markup?.detalhe?.por_fornecedor ?? [];

  return (
    <>
      <div className="grade g4 manter-2" style={{ marginBottom: 16 }}>
        <Indicador rotulo="Margem por passageiro" m={margem} formato={(v) => moeda(v)} apoio={margem ? `${numero(margem.detalhe?.passageiros)} passageiros com custo` : undefined} />
        <Indicador rotulo="Resultado cambial" m={cambial} formato={(v) => pct(v, 2)}
          apoio={cambial?.detalhe ? `${moeda(cambial.detalhe.resultado)} sobre a receita faturada${cambial.detalhe.reservas_projetadas ? `; ${numero(cambial.detalhe.reservas_projetadas)} reservas com câmbio projetado` : ''}` : undefined} />
        <Indicador rotulo="Folga até o câmbio de equilíbrio" m={equilibrio} formato={(v) => pct(v)} apoio="no produto mais exposto" />
        <Indicador rotulo="Ocupação dos bloqueios" m={ocupacao} formato={(v) => pct(v)}
          apoio={lugar?.valor != null ? `${moeda(lugar.valor)} em lugares não vendidos` : undefined} />
      </div>

      <div className="cartao">
        <h2>Margem e câmbio por produto</h2>
        <p className="sutil">Ordenado pelo produto mais exposto: a folga é quanto a moeda do fornecedor pode subir sobre o câmbio da venda antes de a margem zerar.</p>
        <div className="rolagem">
          <table>
            <thead>
              <tr><th>Produto</th><th className="num">Passageiros</th><th className="num">Margem por passageiro</th><th>Moeda</th><th className="num">Câmbio da venda</th><th className="num">Câmbio pago</th><th className="num">Câmbio de equilíbrio</th><th className="num">Folga</th></tr>
            </thead>
            <tbody>
              {produtos.map((x: any) => (
                <tr key={x.produto}>
                  <td style={{ whiteSpace: 'nowrap' }}>{x.produto}</td>
                  <td className="num">{numero(x.passageiros)}</td>
                  <td className="num"><strong>{moeda(x.margem_passageiro)}</strong></td>
                  <td>{x.moeda ?? 'BRL'}</td>
                  <td className="num">{x.cambio_venda_medio == null ? '—' : numero(x.cambio_venda_medio, 4)}</td>
                  <td className="num">{x.cambio_custo_medio == null ? '—' : numero(x.cambio_custo_medio, 4)}</td>
                  <td className="num">{x.cambio_equilibrio == null ? '—' : numero(x.cambio_equilibrio, 4)}</td>
                  <td className="num">{x.folga_pct == null ? '—' : pct(x.folga_pct)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="cartao">
        <h2>Bloqueios</h2>
        {bloqueios.length === 0 ? (
          <div className="vazio">{ocupacao?.detalhe?.indisponivel ?? 'Sem bloqueios.'}</div>
        ) : (
          <>
            <p className="sutil">Lugar não vendido cujo prazo de devolução venceu até {lugar?.detalhe?.data_referencia ? new Date(`${lugar.detalhe.data_referencia}T12:00:00`).toLocaleDateString('pt-BR') : 'o fim do período'} (fim do período) custa a multa ou o custo do lugar.{' '}
              {lugar?.detalhe?.lugares_em_risco ? `${numero(lugar.detalhe.lugares_em_risco)} lugares ainda podem ser devolvidos.` : ''}</p>
            <div className="rolagem">
              <table>
                <thead>
                  <tr><th>Produto</th><th>Fornecedor</th><th>Saída</th><th className="num">Contratados</th><th className="num">Vendidos</th><th className="num">Ocupação</th><th style={{ width: '14%' }} /><th className="num">Não vendidos</th><th>Devolução</th><th className="num">Custo</th></tr>
                </thead>
                <tbody>
                  {bloqueios.map((b: any, i: number) => (
                    <tr key={i}>
                      <td style={{ whiteSpace: 'nowrap' }}>{b.produto}</td>
                      <td>{b.fornecedor ?? '—'}</td>
                      <td>{b.data_servico ? new Date(`${b.data_servico}T12:00:00`).toLocaleDateString('pt-BR') : '—'}</td>
                      <td className="num">{numero(b.contratados)}</td>
                      <td className="num">{numero(b.vendidos)}</td>
                      <td className="num"><strong>{pct(b.ocupacao_pct)}</strong></td>
                      <td><Barra valor={b.ocupacao_pct} /></td>
                      <td className="num">{numero(b.nao_vendidos)}</td>
                      <td>{b.prazo_vencido ? 'Prazo vencido' : 'Em aberto'}</td>
                      <td className="num">{b.custo == null ? '—' : moeda(b.custo)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </div>

      <div className="duas">
        <div className="cartao">
          <h2>Markup por fornecedor</h2>
          <div className="rolagem">
            <table>
              <thead>
                <tr><th>Fornecedor</th><th className="num">Passageiros</th><th className="num">Custo</th><th className="num">Margem</th><th className="num">Markup</th></tr>
              </thead>
              <tbody>
                {fornecedores.map((f: any) => (
                  <tr key={f.fornecedor}>
                    <td>{f.fornecedor}</td>
                    <td className="num">{numero(f.passageiros)}</td>
                    <td className="num">{moeda(f.custo)}</td>
                    <td className="num">{moeda(f.margem)}</td>
                    <td className="num"><strong>{pct(f.markup_pct)}</strong></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
        <div className="cartao">
          <h2>Reservas contra o ano anterior</h2>
          {curva?.valor == null ? (
            <p className="sutil">{curva?.detalhe?.indisponivel ?? 'Indisponível.'}</p>
          ) : (
            <>
              <p><strong>{pct(curva.valor)}</strong> de passageiros com serviço nos últimos 12 meses, contra os 12 anteriores.</p>
              <table>
                <thead><tr><th>Reservados com antecedência de</th><th className="num">Período atual</th><th className="num">Ano anterior</th></tr></thead>
                <tbody>
                  {(curva.detalhe?.curva ?? []).map((c: any) => (
                    <tr key={c.antecedencia_minima_dias}>
                      <td>{c.antecedencia_minima_dias === 0 ? 'qualquer prazo' : `${c.antecedencia_minima_dias} dias ou mais`}</td>
                      <td className="num">{numero(c.atual)}</td>
                      <td className="num">{numero(c.anterior)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </>
          )}
        </div>
      </div>
    </>
  );
}
