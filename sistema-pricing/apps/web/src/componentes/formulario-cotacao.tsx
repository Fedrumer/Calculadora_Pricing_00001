'use client';

import type { DefinicaoDimensao } from '@pricing/motor';
import { useEffect, useMemo, useRef, useState } from 'react';
import { api, mensagemDeErro } from '@/lib/api';
import { useSessao } from '@/lib/sessao';
import { supabase } from '@/lib/supabase';
import { type ResultadoTela, ResultadoCalculo } from './resultado';
import { Aviso, Campo, Carregando, ou, useDados } from './ui';

export interface Pedido {
  produto: string;
  componentes: string[];
  dimensoes: Record<string, string | number>;
  descontoPct: number;
  canal: string | null;
  comissaoPct: number | null;
}

interface Catalogo {
  produtos: { id: string; codigo: string; nome: string; descricao: string; dimensoes: string[]; multiplicadores: string[] }[];
  componentes: { produto_id: string; codigo: string; nome: string; obrigatorio: boolean }[];
  dimensoes: (DefinicaoDimensao & { codigo: string })[];
  canais: { id: string; codigo: string; nome: string }[];
}

async function carregarCatalogo(): Promise<Catalogo> {
  const sb = supabase();
  const [produtos, componentes, dimensoes, canais] = await Promise.all([
    sb.from('produtos').select('id, codigo, nome, descricao, dimensoes, multiplicadores').eq('ativo', true).order('ordem'),
    sb.from('componentes').select('produto_id, codigo, nome, obrigatorio').eq('ativo', true).order('ordem'),
    sb.from('dimensoes').select('codigo, nome, tipo, valores, faixas').order('ordem'),
    sb.from('canais').select('id, codigo, nome').eq('ativo', true).order('nome'),
  ]);
  return { produtos: ou(produtos), componentes: ou(componentes), dimensoes: ou(dimensoes) as Catalogo['dimensoes'], canais: ou(canais) };
}

/**
 * Formulário guiado com simulação instantânea. A tela não calcula nada: a cada
 * mudança ela envia o pedido e mostra o que o servidor devolveu.
 */
export function FormularioCotacao({
  inicial,
  travarProduto,
  aoMudar,
}: {
  inicial?: Partial<Pedido>;
  travarProduto?: boolean;
  aoMudar: (estado: { pedido: Pedido; resultado: ResultadoTela | null; completo: boolean }) => void;
}) {
  const s = useSessao();
  const { dados: cat, erro: erroCat } = useDados(carregarCatalogo);
  const [pedido, setPedido] = useState<Pedido>({ produto: '', componentes: [], dimensoes: {}, descontoPct: 0, canal: null, comissaoPct: null, ...inicial });
  const [resultado, setResultado] = useState<ResultadoTela | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [calculando, setCalculando] = useState(false);
  const pedidoAtual = useRef(0);
  const canalFixo = s.externo;

  const produto = cat?.produtos.find((p) => p.codigo === pedido.produto);
  const campos = useMemo(() => {
    if (!cat || !produto) return [];
    return [...new Set([...produto.dimensoes, ...produto.multiplicadores])].map((c) => cat.dimensoes.find((d) => d.codigo === c)!).filter(Boolean);
  }, [cat, produto]);
  const opcionais = cat?.componentes.filter((c) => c.produto_id === produto?.id && !c.obrigatorio) ?? [];
  const completo = !!produto && campos.every((d) => pedido.dimensoes[d.codigo] !== undefined && pedido.dimensoes[d.codigo] !== '');

  useEffect(() => {
    if (cat && !pedido.produto && cat.produtos[0]) setPedido((p) => ({ ...p, produto: cat.produtos[0]!.codigo }));
  }, [cat, pedido.produto]);

  useEffect(() => {
    if (!completo) {
      setResultado(null);
      aoMudar({ pedido, resultado: null, completo: false });
      return;
    }
    const n = ++pedidoAtual.current;
    setCalculando(true);
    const t = setTimeout(async () => {
      try {
        const corpo = {
          produto: pedido.produto,
          componentes: pedido.componentes,
          dimensoes: pedido.dimensoes,
          descontoPct: pedido.descontoPct || 0,
          ...(canalFixo ? {} : { canal: pedido.canal, ...(pedido.canal && pedido.comissaoPct !== null ? { comissaoPct: pedido.comissaoPct } : {}) }),
        };
        const r = await api<{ resultado: ResultadoTela }>('POST', '/cotacoes/simular', corpo);
        if (n !== pedidoAtual.current) return;
        setResultado(r.resultado);
        setErro(null);
        aoMudar({ pedido, resultado: r.resultado, completo: true });
      } catch (e) {
        if (n !== pedidoAtual.current) return;
        setResultado(null);
        setErro(mensagemDeErro(e));
        aoMudar({ pedido, resultado: null, completo: true });
      } finally {
        if (n === pedidoAtual.current) setCalculando(false);
      }
    }, 300);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [JSON.stringify(pedido), completo]);

  if (erroCat) return <Aviso tipo="erro">{erroCat}</Aviso>;
  if (!cat) return <Carregando />;

  const dim = (codigo: string, valor: string | number) => setPedido((p) => ({ ...p, dimensoes: { ...p.dimensoes, [codigo]: valor } }));

  return (
    <div className="duas">
      <div className="cartao">
        <h2>Pedido</h2>
        <Campo rotulo="Produto">
          <select name="produto" value={pedido.produto} disabled={travarProduto} onChange={(e) => setPedido((p) => ({ ...p, produto: e.target.value, componentes: [], dimensoes: {} }))}>
            {cat.produtos.map((p) => (
              <option key={p.codigo} value={p.codigo}>
                {p.nome}
              </option>
            ))}
          </select>
        </Campo>
        {produto?.descricao && <p className="sutil">{produto.descricao}</p>}
        <div className="linha-campos">
          {campos.map((d) => (
            <Campo key={d.codigo} rotulo={d.nome}>
              {d.tipo === 'categoria' ? (
                <select name={d.codigo} value={String(pedido.dimensoes[d.codigo] ?? '')} onChange={(e) => dim(d.codigo, e.target.value)}>
                  <option value="">Selecione</option>
                  {d.valores?.map((v) => (
                    <option key={v.codigo} value={v.codigo}>
                      {v.nome}
                    </option>
                  ))}
                </select>
              ) : (
                <input
                  name={d.codigo}
                  type="number"
                  inputMode="decimal"
                  min={Math.min(...(d.faixas ?? []).map((f) => f.min))}
                  value={pedido.dimensoes[d.codigo] ?? ''}
                  onChange={(e) => dim(d.codigo, e.target.value === '' ? '' : Number(e.target.value))}
                />
              )}
            </Campo>
          ))}
        </div>
        {opcionais.length > 0 && (
          <div className="campo">
            <span className="rotulo">Opcionais</span>
            {opcionais.map((c) => (
              <label key={c.codigo} className="linha-check">
                <input
                  type="checkbox"
                  name={`componente-${c.codigo}`}
                  checked={pedido.componentes.includes(c.codigo)}
                  onChange={(e) => setPedido((p) => ({ ...p, componentes: e.target.checked ? [...p.componentes, c.codigo] : p.componentes.filter((x) => x !== c.codigo) }))}
                />
                {c.nome}
              </label>
            ))}
          </div>
        )}
        <div className="linha-campos">
          {!canalFixo && (
            <Campo rotulo="Canal de venda">
              <select name="canal" value={pedido.canal ?? ''} onChange={(e) => setPedido((p) => ({ ...p, canal: e.target.value || null, comissaoPct: null }))}>
                <option value="">Venda direta</option>
                {cat.canais.map((c) => (
                  <option key={c.codigo} value={c.codigo}>
                    {c.nome}
                  </option>
                ))}
              </select>
            </Campo>
          )}
          <Campo rotulo="Desconto (%)">
            <input name="desconto" type="number" inputMode="decimal" min={0} max={99} step={0.5} value={pedido.descontoPct} onChange={(e) => setPedido((p) => ({ ...p, descontoPct: Number(e.target.value) || 0 }))} />
          </Campo>
          {!canalFixo && pedido.canal && (
            <Campo rotulo="Comissão negociada (%)" dica="Em branco = tabela do canal.">
              <input name="comissao" type="number" inputMode="decimal" min={0} max={99} step={0.5} value={pedido.comissaoPct ?? ''} onChange={(e) => setPedido((p) => ({ ...p, comissaoPct: e.target.value === '' ? null : Number(e.target.value) }))} />
            </Campo>
          )}
        </div>
      </div>
      <div className="cartao" aria-live="polite">
        <h2>Simulação {calculando && <small>calculando…</small>}</h2>
        {erro && <Aviso tipo="erro">{erro}</Aviso>}
        {!resultado && !erro && <div className="vazio">{completo ? 'Calculando…' : 'Preencha o pedido para ver o preço.'}</div>}
        {resultado && <ResultadoCalculo r={resultado} />}
      </div>
    </div>
  );
}
