'use client';

import { useState } from 'react';
import { Aviso, Modal, Selo, useAcao } from '@/componentes/ui';
import { rpc } from '@/lib/api';
import { CAMPOS, type Planilha, converter, lerArquivo, lerCsv, sugerirMapeamento } from '@/lib/csv';
import { ROTULO_BLOCO, ROTULO_CENARIO, ROTULO_PREMISSA, SEGMENTOS_TURISMO, dataHora, numero } from '@/lib/formato';
import type { DadosDiagnostico, Painel, Qualidade, Validacao } from '@/lib/tipos';

const BLOCOS: { bloco: string; obrigatorio: boolean; descricao: string; turismo?: boolean }[] = [
  { bloco: 'transacoes', obrigatorio: true, descricao: 'Uma linha por item de nota: data, produto, cliente, canal, quantidade, preço de lista, preço faturado e descontos por tipo (valores unitários).' },
  { bloco: 'custos', obrigatorio: true, descricao: 'Custo unitário por produto. Com início de vigência, quando o custo mudou no período.' },
  { bloco: 'produtos', obrigatorio: false, descricao: 'Categoria e linha de cada produto. Sem ele, não há recorte por categoria.' },
  { bloco: 'contas', obrigatorio: false, descricao: 'Segmento, porte, região e vendedor de cada cliente. Sem ele, não há recorte por segmento, região e vendedor.' },
  { bloco: 'custos_servir', obrigatorio: false, descricao: 'Frete, comissão, prazo e outros, em % do faturado, por canal ou por cliente. Sem ele, o pocket price ignora o custo de servir.' },
  { bloco: 'descontos_fora_fatura', obrigatorio: false, descricao: 'Rebates, bonificações e verbas por cliente e mês. Sem ele, a cascata para no preço faturado.' },
  { bloco: 'bloqueios', obrigatorio: false, turismo: true, descricao: 'Lugares contratados com o fornecedor por saída, vendidos, prazo de devolução e multa ou custo do lugar. Sem ele, não há ocupação nem custo de lugar não vendido.' },
  { bloco: 'capacidade', obrigatorio: false, descricao: 'Capacidade por mês de cada recurso (equipe, frota, estoque), uso por venda e custo da unidade extra. Entra na simulação: acima da capacidade, a venda não acontece ou paga o custo extra.' },
];

const DESCRICAO_TURISMO: Record<string, string> = {
  transacoes: 'Uma linha por reserva: data da venda, pacote, agência ou cliente, canal, passageiros, tarifa e valor vendido; e, da reserva, data do serviço, fornecedor, custo unitário na moeda, câmbio da venda e do pagamento, over e status.',
  custos: 'Só para reservas sem custo na própria linha: custo unitário por produto, em reais.',
};
const LOTE = 2000;

function Carga({ diagnostico, bloco, turismo, aoFechar, aoConcluir }: { diagnostico: string; bloco: string; turismo: boolean; aoFechar: () => void; aoConcluir: () => void }) {
  const acao = useAcao();
  const [arquivo, setArquivo] = useState<File | null>(null);
  const [planilha, setPlanilha] = useState<Planilha | null>(null);
  const [mapa, setMapa] = useState<Record<string, string>>({});
  const [progresso, setProgresso] = useState<string | null>(null);
  // campos de reserva só aparecem em diagnóstico de turismo
  const campos = CAMPOS[bloco]!.filter((c) => turismo || !c.reserva);

  const escolher = (f: File | null) =>
    acao.executar(async () => {
      setArquivo(f);
      setPlanilha(null);
      if (!f) return;
      if (/\.xlsx?$/i.test(f.name)) throw new Error('Esta versão lê CSV. No Excel, use Salvar como > CSV (separado por ponto e vírgula) e envie o arquivo salvo.');
      const p = lerCsv(await lerArquivo(f));
      if (p.cabecalhos.length < 2 || p.linhas.length === 0) throw new Error('Não encontrei cabeçalho e linhas neste arquivo. Confira se é um CSV com a primeira linha de títulos.');
      setPlanilha(p);
      const sugerido = sugerirMapeamento(p.cabecalhos, bloco);
      setMapa(Object.fromEntries(Object.entries(sugerido).filter(([campo]) => campos.some((c) => c.campo === campo))));
    });

  const faltando = campos.filter((c) => c.obrigatorio && !mapa[c.campo]);
  const enviar = () =>
    acao.executar(async () => {
      const linhas = converter(planilha!, mapa, bloco);
      const upload = await rpc<string>('iniciar_upload', { p_diagnostico: diagnostico, p_bloco: bloco, p_nome_arquivo: arquivo!.name, p_mapeamento: mapa });
      for (let i = 0; i < linhas.length; i += LOTE) {
        setProgresso(`Enviando ${numero(Math.min(i + LOTE, linhas.length))} de ${numero(linhas.length)} linhas…`);
        await rpc('enviar_linhas', { p_upload: upload, p_linhas: linhas.slice(i, i + LOTE) });
      }
      await rpc('concluir_upload', { p_upload: upload });
      aoConcluir();
    });

  return (
    <Modal titulo={`Enviar ${ROTULO_BLOCO[bloco]!.toLowerCase()}`} aoFechar={aoFechar}>
      <Aviso tipo="erro">{acao.erro}</Aviso>
      <p className="sutil">O arquivo novo substitui a carga anterior deste bloco.</p>
      <input name="arquivo" type="file" accept=".csv,.txt,text/csv" onChange={(e) => void escolher(e.target.files?.[0] ?? null)} />
      {planilha && (
        <>
          <p style={{ marginTop: 12 }}>
            <strong>{numero(planilha.linhas.length)} linhas</strong> em {planilha.cabecalhos.length} colunas. Confira de qual coluna vem cada campo:
          </p>
          <table className="mapa">
            <tbody>
              {campos.map((c) => (
                <tr key={c.campo}>
                  <td>{c.rotulo}{c.obrigatorio && ' *'}</td>
                  <td>
                    <select aria-label={c.rotulo} name={`mapa_${c.campo}`} value={mapa[c.campo] ?? ''} onChange={(e) => setMapa((m) => ({ ...m, [c.campo]: e.target.value }))}>
                      <option value="">(não tem)</option>
                      {planilha.cabecalhos.map((h) => <option key={h} value={h}>{h}</option>)}
                    </select>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {faltando.length > 0 && <Aviso tipo="atencao">Falta indicar a coluna de: {faltando.map((c) => c.rotulo).join(', ')}.</Aviso>}
        </>
      )}
      {progresso && acao.ocupado && <Aviso>{progresso}</Aviso>}
      <div className="acoes" style={{ marginTop: 14 }}>
        <button className="btn primario" disabled={!planilha || faltando.length > 0 || acao.ocupado} onClick={() => void enviar()}>
          {acao.ocupado && progresso ? 'Enviando…' : 'Confirmar e enviar'}
        </button>
        <button type="button" className="btn" onClick={aoFechar} disabled={acao.ocupado}>Cancelar</button>
      </div>
    </Modal>
  );
}

function TabelaValidacoes({ validacoes }: { validacoes: Validacao[] }) {
  if (validacoes.length === 0) return <div className="vazio">Nenhum problema encontrado nos dados.</div>;
  return (
    <div className="rolagem">
      <table>
        <thead>
          <tr><th>Bloco</th><th>Gravidade</th><th>O que foi encontrado</th><th className="num">Ocorrências</th></tr>
        </thead>
        <tbody>
          {validacoes.map((v) => (
            <tr key={`${v.bloco}|${v.regra}`}>
              <td>{ROTULO_BLOCO[v.bloco] ?? v.bloco}</td>
              <td><Selo status={v.severidade}>{v.severidade === 'erro' ? 'Erro' : 'Alerta'}</Selo></td>
              <td>{v.mensagem}</td>
              <td className="num">{numero(v.ocorrencias, Number.isInteger(v.ocorrencias) ? 0 : 1)}{v.total ? ` de ${numero(v.total)}` : ''}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function notaBloco(q: Qualidade | undefined) {
  if (!q || !q.presente) return <span className="sutil">não enviado</span>;
  if (q.nota === null) return <span className="sutil">sem nota</span>;
  return <Selo status={q.nota >= 90 ? 'ok' : q.nota >= 60 ? 'alerta' : 'erro'}>Qualidade {numero(q.nota)} / 100</Selo>;
}

/** Tela "Dados e premissas": de onde vem cada número e o que é medido ou assumido. */
export function AbaDados({ painel, dados, podeEditar, aoMudar }: { painel: Painel | null; dados: DadosDiagnostico | null; podeEditar: boolean; aoMudar: () => void }) {
  const [carga, setCarga] = useState<string | null>(null);
  const qualidade = dados?.qualidade.length ? dados.qualidade : (painel?.qualidade ?? []);
  const validacoes = dados?.validacoes.length ? dados.validacoes : (painel?.validacoes ?? []);
  const indisponiveis = (painel?.metricas ?? []).filter((m) => m.valor === null);
  const informadas = (painel?.cenarios ?? []).flatMap((c) => c.premissas.filter((x) => x.origem === 'informada').map((x) => ({ ...x, cenario: c.codigo })));
  const diagnostico = dados?.diagnostico.id ?? painel?.diagnostico.id ?? '';
  const segmento = dados?.diagnostico.segmento ?? painel?.diagnostico.segmento ?? null;
  const turismo = !!segmento && SEGMENTOS_TURISMO.includes(segmento);

  return (
    <>
      <div className="cartao">
        <h2>Arquivos do cliente</h2>
        {BLOCOS.filter((b) => turismo || !b.turismo).map((b) => {
          const u = dados?.uploads.find((x) => x.bloco === b.bloco);
          const q = qualidade.find((x) => x.bloco === b.bloco);
          const obrigatorio = q ? q.obrigatorio : b.bloco === 'custos' && turismo ? false : b.obrigatorio;
          return (
            <div key={b.bloco} className="bloco-dados" data-bloco={b.bloco}>
              <div>
                <strong>{ROTULO_BLOCO[b.bloco]}</strong> <span className="selo">{obrigatorio ? 'Obrigatório' : b.bloco === 'custos' && turismo ? 'Opcional: custo na reserva' : 'Recomendado'}</span> {notaBloco(q)}
                <div className="sutil">{(turismo && DESCRICAO_TURISMO[b.bloco]) || b.descricao}</div>
                {u ? <div><small>{u.arquivo} · {numero(u.linhas)} linhas · {dataHora(u.criado_em)}</small></div> : q?.presente ? <div><small>{numero(q.linhas)} linhas</small></div> : null}
              </div>
              {podeEditar && (
                <button className="btn" onClick={() => setCarga(b.bloco)}>{u ? 'Substituir' : 'Enviar arquivo'}</button>
              )}
            </div>
          );
        })}
        <p className="sutil" style={{ marginTop: 10 }}>Formato: CSV com títulos na primeira linha. Número e data no padrão brasileiro são reconhecidos.</p>
      </div>

      <div className="cartao">
        <h2>Checagens dos dados</h2>
        <TabelaValidacoes validacoes={validacoes} />
      </div>

      {painel && painel.metricas.length > 0 && (
        <div className="cartao">
          <h2>O que é medido e o que é assumido</h2>
          <h3>Métricas indisponíveis</h3>
          {indisponiveis.length === 0 ? <p className="sutil">Todas as métricas do catálogo foram calculadas com os dados enviados.</p> : (
            <ul>{indisponiveis.map((m) => <li key={m.codigo}><strong>{m.nome}</strong>: {m.detalhe?.indisponivel ?? 'sem dados suficientes'}</li>)}</ul>
          )}
          <h3 style={{ marginTop: 14 }}>Premissas informadas pelo consultor</h3>
          {informadas.length === 0 ? <p className="sutil">Os cenários usam as premissas padrão do catálogo. Elasticidade e taxa de captura são premissas, não medições.</p> : (
            <ul>{informadas.map((x) => <li key={`${x.cenario}|${x.alavanca}|${x.chave}`}>Cenário {ROTULO_CENARIO[x.cenario]!.toLowerCase()}: {ROTULO_PREMISSA[x.chave]?.rotulo ?? x.chave} = {numero(x.valor, 2)}</li>)}</ul>
          )}
          {painel.base && <p className="sutil" style={{ marginTop: 10 }}>Base de cálculo: {numero(painel.base.linhas)} transações válidas em {painel.base.dias} dias. O ganho anual leva o resultado do período a 12 meses.</p>}
        </div>
      )}

      {carga && <Carga diagnostico={diagnostico} bloco={carga} turismo={turismo} aoFechar={() => setCarga(null)} aoConcluir={() => { setCarga(null); aoMudar(); }} />}
    </>
  );
}
