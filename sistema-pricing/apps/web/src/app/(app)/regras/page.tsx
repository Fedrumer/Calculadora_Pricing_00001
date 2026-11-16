'use client';

import { useEffect, useState } from 'react';
import { PainelPublicacao, RelatorioCasos } from '@/componentes/publicacao';
import { Aviso, Carregando, Modal, Selo, ou, useAcao, useDados } from '@/componentes/ui';
import { api } from '@/lib/api';
import { data, moeda } from '@/lib/formato';
import { useSessao } from '@/lib/sessao';
import { supabase } from '@/lib/supabase';

interface Item {
  produto: string;
  componente: string | null;
  dimensoes: Record<string, string>;
  precoBase: number;
}
interface Fator {
  codigo: string;
  nome: string;
  dimensao: string;
  valor: string;
  tipo: 'percentual' | 'valor';
  ajuste: number;
  produto: string | null;
  grupo: string | null;
}

export default function TabelasERegras() {
  const s = useSessao();
  const gestor = s.tem('gestor_pricing');
  const [selecionada, setSelecionada] = useState<string | null>(null);
  const [itens, setItens] = useState<Item[]>([]);
  const [fatores, setFatores] = useState<Fator[]>([]);
  const [sujo, setSujo] = useState(false);
  const [reajuste, setReajuste] = useState('');
  const [importando, setImportando] = useState(false);
  const [csv, setCsv] = useState('');
  const [casos, setCasos] = useState<any>(null);
  const acao = useAcao();

  const lista = useDados(async () => {
    const sb = supabase();
    const [t, p, k] = await Promise.all([
      sb.from('tabelas_preco').select('id, nome, versao, status, vigencia_inicio, vigencia_fim, origem, publicado_em').order('versao', { ascending: false }),
      sb.from('produtos').select('id, codigo, nome').order('ordem'),
      sb.from('componentes').select('id, codigo, nome'),
    ]);
    return { tabelas: ou(t) as Record<string, any>[], produtos: ou(p) as { id: string; codigo: string; nome: string }[], componentes: ou(k) as { id: string; codigo: string; nome: string }[] };
  });

  const tabela = lista.dados?.tabelas.find((t) => t.id === selecionada);
  const rascunho = tabela?.status === 'rascunho';
  const editavel = rascunho && gestor;

  useEffect(() => {
    if (!selecionada && lista.dados?.tabelas.length) {
      const hoje = new Date().toISOString().slice(0, 10);
      const t = lista.dados.tabelas;
      setSelecionada((t.find((x) => x.status === 'rascunho') ?? t.find((x) => x.status === 'publicada' && x.vigencia_inicio <= hoje && (!x.vigencia_fim || x.vigencia_fim >= hoje)) ?? t[0])!.id);
    }
  }, [lista.dados, selecionada]);

  useEffect(() => {
    if (!selecionada || !lista.dados) return;
    const { produtos, componentes } = lista.dados;
    void (async () => {
      const sb = supabase();
      const [i, f] = await Promise.all([
        sb.from('itens_tabela').select('produto_id, componente_id, dimensoes, preco_base').eq('tabela_id', selecionada),
        sb.from('fatores').select('codigo, nome, dimensao, valor, tipo, ajuste, produto_id, grupo').eq('tabela_id', selecionada).order('codigo'),
      ]);
      const cod = (id: string | null) => produtos.find((p) => p.id === id)?.codigo ?? '';
      const linhas = (i.data ?? []).map((x: any) => ({ produto: cod(x.produto_id), componente: componentes.find((k) => k.id === x.componente_id)?.codigo ?? null, dimensoes: x.dimensoes, precoBase: Number(x.preco_base) }));
      linhas.sort((a, b) => `${a.produto}${a.componente ?? ''}${JSON.stringify(a.dimensoes)}`.localeCompare(`${b.produto}${b.componente ?? ''}${JSON.stringify(b.dimensoes)}`));
      setItens(linhas);
      setFatores((f.data ?? []).map((x: any) => ({ codigo: x.codigo, nome: x.nome, dimensao: x.dimensao, valor: x.valor, tipo: x.tipo, ajuste: Number(x.ajuste), produto: x.produto_id ? cod(x.produto_id) : null, grupo: x.grupo })));
      setSujo(false);
    })();
  }, [selecionada, lista.dados]);

  if (lista.erro) return <Aviso tipo="erro">{lista.erro}</Aviso>;
  if (!lista.dados) return <Carregando />;
  const nomeProduto = (c: string) => lista.dados!.produtos.find((p) => p.codigo === c)?.nome ?? c;
  const nomeComponente = (c: string | null) => (c ? (lista.dados!.componentes.find((k) => k.codigo === c)?.nome ?? c) : '—');

  const novoRascunho = () =>
    acao.executar(async () => {
      const r = await api('POST', '/regras/tabelas', {});
      lista.recarregar();
      setSelecionada(r.id);
    }, 'Rascunho criado a partir da tabela vigente.');
  const salvar = () =>
    acao.executar(async () => {
      await api('PUT', `/regras/tabelas/${selecionada}`, { itens, fatores });
      setSujo(false);
    }, 'Rascunho salvo.');
  const aplicarReajuste = () => {
    const p = Number(reajuste.replace(',', '.'));
    if (!Number.isFinite(p) || p === 0) return;
    setItens((l) => l.map((i) => ({ ...i, precoBase: Math.round(i.precoBase * (1 + p / 100) * 100) / 100 })));
    setSujo(true);
    setReajuste('');
  };
  const importar = () =>
    acao.executar(async () => {
      const r = await api('POST', `/regras/tabelas/${selecionada}/importar`, { csv });
      setImportando(false);
      setCsv('');
      setSelecionada(null);
      lista.recarregar();
      return r;
    }, 'Planilha carregada no rascunho.');
  const excluir = () =>
    acao.executar(async () => {
      await api('DELETE', `/regras/${selecionada}`);
      setSelecionada(null);
      lista.recarregar();
    }, 'Rascunho excluído.');
  const executarCasos = () => acao.executar(async () => setCasos(await api('POST', '/regras/casos-referencia/executar', {})));
  const contingencia = () =>
    acao.executar(async () => {
      const r = await api<{ url: string }>('GET', '/regras/contingencia');
      window.open(r.url, '_blank', 'noopener');
    });

  return (
    <>
      <div className="cabecalho">
        <div>
          <h1>Tabelas e regras</h1>
          <p>Preço base por combinação de dimensões e fatores de acréscimo e redução. Toda mudança nasce em rascunho e vira uma nova versão.</p>
        </div>
        <div className="acoes">
          <button className="btn" disabled={acao.ocupado} onClick={() => void contingencia()}>
            Planilha de contingência
          </button>
          {gestor && !lista.dados.tabelas.some((t) => t.status === 'rascunho') && (
            <button className="btn primario" disabled={acao.ocupado} onClick={() => void novoRascunho()}>
              Novo rascunho
            </button>
          )}
        </div>
      </div>
      <Aviso tipo="erro">{acao.erro}</Aviso>
      <Aviso tipo="ok">{acao.ok}</Aviso>

      <div className="cartao">
        <h2>Versões</h2>
        <div className="rolagem">
          <table>
            <thead>
              <tr>
                <th>Versão</th>
                <th>Nome</th>
                <th>Situação</th>
                <th>Vigência</th>
                <th>Origem</th>
              </tr>
            </thead>
            <tbody>
              {lista.dados.tabelas.map((t) => (
                <tr key={t.id} className="clicavel" onClick={() => setSelecionada(t.id)} style={t.id === selecionada ? { background: '#f1f6f9' } : undefined}>
                  <td>
                    <strong>v{t.versao}</strong>
                  </td>
                  <td>{t.nome}</td>
                  <td>
                    <Selo status={t.status} />
                  </td>
                  <td>{t.vigencia_inicio ? `${data(t.vigencia_inicio)} ${t.vigencia_fim ? `a ${data(t.vigencia_fim)}` : 'em diante'}` : '—'}</td>
                  <td>{t.origem}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {tabela && (
        <div className="cartao">
          <div className="cabecalho" style={{ marginBottom: 10 }}>
            <h2 style={{ margin: 0 }}>
              Preços da versão {tabela.versao} {!rascunho && <small>(imutável)</small>}
            </h2>
            {editavel && (
              <div className="acoes">
                <input name="reajuste" placeholder="Reajuste %" value={reajuste} onChange={(e) => setReajuste(e.target.value)} style={{ width: 110 }} aria-label="Percentual de reajuste" />
                <button className="btn" onClick={aplicarReajuste}>
                  Aplicar a todos
                </button>
                <button className="btn" onClick={() => setImportando(true)}>
                  Importar planilha
                </button>
                <button className="btn primario" disabled={!sujo || acao.ocupado} onClick={() => void salvar()}>
                  Salvar rascunho
                </button>
                <button className="btn perigo" disabled={acao.ocupado} onClick={() => void excluir()}>
                  Excluir rascunho
                </button>
              </div>
            )}
          </div>
          <div className="rolagem">
            <table>
              <thead>
                <tr>
                  <th>Produto</th>
                  <th>Componente</th>
                  <th>Dimensões</th>
                  <th className="num">Preço base</th>
                </tr>
              </thead>
              <tbody>
                {itens.map((i, n) => (
                  <tr key={n}>
                    <td>{nomeProduto(i.produto)}</td>
                    <td>{nomeComponente(i.componente)}</td>
                    <td>{Object.entries(i.dimensoes).map(([k, v]) => `${k}: ${v}`).join(', ') || 'qualquer'}</td>
                    <td className="num">
                      {editavel ? (
                        <input
                          name={`preco-${n}`}
                          type="number"
                          step="0.01"
                          min={0}
                          value={i.precoBase}
                          style={{ width: 120, textAlign: 'right' }}
                          onChange={(e) => {
                            setItens((l) => l.map((x, j) => (j === n ? { ...x, precoBase: Number(e.target.value) } : x)));
                            setSujo(true);
                          }}
                        />
                      ) : (
                        moeda(i.precoBase)
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <h3 style={{ marginTop: 18 }}>Fatores</h3>
          <div className="rolagem">
            <table>
              <thead>
                <tr>
                  <th>Fator</th>
                  <th>Quando</th>
                  <th>Produto</th>
                  <th className="num">Ajuste</th>
                </tr>
              </thead>
              <tbody>
                {fatores.map((f, n) => (
                  <tr key={f.codigo}>
                    <td>{f.nome}</td>
                    <td>
                      {f.dimensao} = {f.valor}
                    </td>
                    <td>{f.produto ? nomeProduto(f.produto) : 'Todos'}</td>
                    <td className="num">
                      {editavel ? (
                        <input
                          name={`fator-${f.codigo}`}
                          type="number"
                          step="0.5"
                          value={f.ajuste}
                          style={{ width: 100, textAlign: 'right' }}
                          onChange={(e) => {
                            setFatores((l) => l.map((x, j) => (j === n ? { ...x, ajuste: Number(e.target.value) } : x)));
                            setSujo(true);
                          }}
                        />
                      ) : (
                        `${f.ajuste > 0 ? '+' : ''}${f.ajuste}${f.tipo === 'percentual' ? '%' : ''}`
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {sujo && <p className="sutil">Há alterações não salvas.</p>}
        </div>
      )}

      {editavel && !sujo && <PainelPublicacao id={tabela!.id} aoPublicar={() => (lista.recarregar(), setCasos(null))} />}

      <div className="cartao">
        <h2>Casos de referência</h2>
        <p className="sutil">Cotações reais calculadas à mão. Rodam contra as regras vigentes a cada publicação e sempre que você pedir.</p>
        <button className="btn" disabled={acao.ocupado} onClick={() => void executarCasos()}>
          Executar agora
        </button>
        {casos && (
          <div style={{ marginTop: 12 }}>
            <RelatorioCasos r={casos} />
            <p className="sutil">
              Tabela v{casos.tabelaVersao} · política v{casos.politicaVersao} · motor {casos.motor}
            </p>
          </div>
        )}
      </div>

      {importando && (
        <Modal titulo="Importar planilha" aoFechar={() => setImportando(false)}>
          <p>
            Salve a planilha como CSV com as colunas <code>produto</code>, <code>componente</code>, as dimensões e <code>preco_base</code>. A carga substitui os preços do rascunho e só acontece se todas as linhas forem válidas.
          </p>
          <Aviso tipo="erro">{acao.erro}</Aviso>
          <input
            type="file"
            accept=".csv,text/csv"
            onChange={(e) => {
              const arquivo = e.target.files?.[0];
              if (arquivo) void arquivo.text().then(setCsv);
            }}
          />
          <textarea name="csv" rows={8} style={{ marginTop: 8, fontFamily: 'monospace', fontSize: '0.85rem' }} placeholder={'produto;componente;plano;preco_base\nAUTO24;base;essencial;21,90'} value={csv} onChange={(e) => setCsv(e.target.value)} />
          <div className="acoes" style={{ marginTop: 10 }}>
            <button className="btn primario" disabled={acao.ocupado || csv.trim().length < 10} onClick={() => void importar()}>
              Validar e carregar
            </button>
          </div>
        </Modal>
      )}
    </>
  );
}
