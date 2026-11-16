'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { FormularioCotacao, type Pedido } from '@/componentes/formulario-cotacao';
import type { ResultadoTela } from '@/componentes/resultado';
import { Aviso, Campo, Carregando, Modal, useAcao } from '@/componentes/ui';
import { api } from '@/lib/api';
import { useSessao } from '@/lib/sessao';
import { supabase } from '@/lib/supabase';

export default function NovaCotacao() {
  const s = useSessao();
  const router = useRouter();
  const [estado, setEstado] = useState<{ pedido: Pedido; resultado: ResultadoTela | null; completo: boolean } | null>(null);
  const [cliente, setCliente] = useState({ nome: '', email: '', documento: '' });
  const [motivo, setMotivo] = useState('');
  const [pedindo, setPedindo] = useState(false);
  const [editando, setEditando] = useState<{ id: string; numero: number; inicial: Partial<Pedido> } | null | undefined>(undefined);
  const [emailIA, setEmailIA] = useState('');
  const [lendo, setLendo] = useState(false);
  const [rascunhoIA, setRascunhoIA] = useState<{ pedido: Partial<Pedido>; duvidas: string[]; chave: number } | null>(null);
  const acao = useAcao();
  const [abertaEm] = useState(() => new Date().toISOString());
  const pedirDocumento = s.organizacao.config?.formulario?.pedirDocumento !== false;
  const comIA = s.organizacao.config?.modulos?.ia !== false && !s.externo;

  // "?de=<id>" abre uma nova versão de uma cotação existente
  useEffect(() => {
    const de = new URLSearchParams(window.location.search).get('de');
    if (!de) return setEditando(null);
    void (async () => {
      const sb = supabase();
      const { data: c } = await sb.from('cotacoes').select('id, numero, versao_atual_id').eq('id', de).maybeSingle();
      const { data: v } = c ? await sb.from(s.externo ? 'v_cotacao_versoes' : 'cotacao_versoes').select('entrada').eq('id', c.versao_atual_id).maybeSingle() : { data: null };
      if (!c || !v) return setEditando(null);
      const e = v.entrada as Pedido;
      setEditando({ id: c.id, numero: c.numero, inicial: { produto: e.produto, componentes: e.componentes ?? [], dimensoes: e.dimensoes, descontoPct: e.descontoPct ?? 0, canal: e.canal ?? null, comissaoPct: e.comissaoPct ?? null } });
    })();
  }, [s.externo]);

  if (!s.podeCotar) return <Aviso tipo="atencao">Seu perfil não cota.</Aviso>;
  if (editando === undefined) return <Carregando />;

  const r = estado?.resultado ?? null;
  const cor = r?.veredito.cor;
  const corpoPedido = () => {
    const p = estado!.pedido;
    return { produto: p.produto, componentes: p.componentes, dimensoes: p.dimensoes, descontoPct: p.descontoPct || 0, ...(s.externo ? {} : { canal: p.canal, ...(p.canal && p.comissaoPct !== null ? { comissaoPct: p.comissaoPct } : {}) }) };
  };

  const salvar = (depois: 'rascunho' | 'emitir' | 'pedir') =>
    acao.executar(async () => {
      if (!editando && cliente.nome.trim().length < 2) throw new Error('Informe o nome do cliente final.');
      if (depois === 'pedir' && motivo.trim().length < 10) throw new Error('Explique o motivo da exceção em pelo menos 10 caracteres.');
      const c = editando
        ? await api('POST', `/cotacoes/${editando.id}/versoes`, { pedido: corpoPedido() }, { idempotente: true })
        : await api('POST', '/cotacoes', { pedido: corpoPedido(), cliente: { nome: cliente.nome.trim(), email: cliente.email.trim() || null, documento: cliente.documento.trim() || null }, iniciadaEm: abertaEm }, { idempotente: true });
      if (depois === 'emitir') await api('POST', `/cotacoes/${c.id}/emitir`, undefined, { idempotente: true });
      if (depois === 'pedir') await api('POST', `/cotacoes/${c.id}/aprovacao`, { acao: 'pedir', motivo: motivo.trim() }, { idempotente: true });
      router.push(`/cotacoes/detalhe?id=${c.id}`);
    });

  const lerEmail = async () => {
    setLendo(true);
    await acao.executar(async () => {
      const x = await api<{ rascunho: Partial<Pedido>; duvidas: string[] }>('POST', '/ia/ler', { texto: emailIA });
      setRascunhoIA({ pedido: { ...x.rascunho, componentes: x.rascunho.componentes ?? [] }, duvidas: x.duvidas, chave: Date.now() });
    });
    setLendo(false);
  };

  return (
    <>
      <div className="cabecalho">
        <div>
          <h1>{editando ? `Nova versão da cotação ${editando.numero}` : 'Nova cotação'}</h1>
          <p>{editando ? 'A versão anterior fica guardada; qualquer mudança volta a passar pela política.' : 'Simule à vontade: nada é gravado até você salvar.'}</p>
        </div>
      </div>
      <Aviso tipo="erro">{acao.erro}</Aviso>

      {comIA && !editando && (
        <details className="cartao">
          <summary style={{ cursor: 'pointer', fontWeight: 600 }}>Recebeu o pedido por e-mail? Cole aqui e o assistente monta o rascunho</summary>
          <div style={{ marginTop: 12 }}>
            <textarea name="email-ia" rows={4} placeholder="Cole o texto do e-mail do cliente" value={emailIA} onChange={(e) => setEmailIA(e.target.value)} />
            <p className="sutil" style={{ marginTop: 6 }}>E-mail, CPF e telefone são mascarados antes do envio. O rascunho é só uma sugestão: confira antes de salvar.</p>
            <button type="button" className="btn" disabled={lendo || emailIA.trim().length < 20} onClick={() => void lerEmail()}>
              {lendo ? 'Lendo…' : 'Montar rascunho'}
            </button>
            {rascunhoIA && rascunhoIA.duvidas.length > 0 && (
              <Aviso tipo="atencao">
                Pontos a confirmar: {rascunhoIA.duvidas.join(' ')}
              </Aviso>
            )}
          </div>
        </details>
      )}

      <FormularioCotacao key={rascunhoIA?.chave ?? editando?.id ?? 'nova'} inicial={rascunhoIA?.pedido ?? editando?.inicial} travarProduto={!!editando} aoMudar={setEstado} />

      {!editando && (
        <div className="cartao">
          <h2>{s.organizacao.config?.formulario?.rotuloClienteFinal ?? 'Cliente final'}</h2>
          <div className="linha-campos">
            <Campo rotulo="Nome">
              <input name="cliente-nome" value={cliente.nome} onChange={(e) => setCliente({ ...cliente, nome: e.target.value })} />
            </Campo>
            <Campo rotulo="E-mail (opcional)">
              <input name="cliente-email" type="email" value={cliente.email} onChange={(e) => setCliente({ ...cliente, email: e.target.value })} />
            </Campo>
            {pedirDocumento && (
              <Campo rotulo="CPF ou CNPJ (opcional)" dica="Guardado cifrado; não entra no cálculo.">
                <input name="cliente-documento" value={cliente.documento} onChange={(e) => setCliente({ ...cliente, documento: e.target.value })} />
              </Campo>
            )}
          </div>
        </div>
      )}

      <div className="acoes">
        <button type="button" className="btn" disabled={!r || acao.ocupado} onClick={() => void salvar('rascunho')}>
          Salvar rascunho
        </button>
        {cor === 'verde' && (
          <button type="button" className="btn primario" disabled={acao.ocupado} onClick={() => void salvar('emitir')}>
            Salvar e emitir proposta
          </button>
        )}
        {cor === 'amarelo' && (
          <button type="button" className="btn primario" disabled={acao.ocupado} onClick={() => setPedindo(true)}>
            Salvar e pedir aprovação
          </button>
        )}
        {cor === 'vermelho' && <span className="sutil">Bloqueada: ajuste o pedido até sair do vermelho.</span>}
      </div>

      {pedindo && (
        <Modal titulo="Pedir exceção" aoFechar={() => setPedindo(false)}>
          <p>
            A cotação vai para quem tem alçada de nível {r?.veredito.nivelAlcada} ({r?.veredito.nomeAlcada}). O motivo é obrigatório e fica registrado.
          </p>
          <Aviso tipo="erro">{acao.erro}</Aviso>
          <Campo rotulo="Motivo do pedido">
            <textarea name="motivo" rows={3} autoFocus value={motivo} onChange={(e) => setMotivo(e.target.value)} />
          </Campo>
          <div className="acoes">
            <button type="button" className="btn primario" disabled={acao.ocupado || motivo.trim().length < 10} onClick={() => void salvar('pedir')}>
              Enviar para aprovação
            </button>
            <button type="button" className="btn" onClick={() => setPedindo(false)}>
              Voltar
            </button>
          </div>
        </Modal>
      )}
    </>
  );
}
