'use client';

import { type ReactNode, useEffect, useState } from 'react';
import { mensagemDeErro } from '@/lib/api';
import { ROTULO_STATUS } from '@/lib/formato';

const COR_STATUS: Record<string, string> = {
  emitida: 'azul', aceita: 'verde', aprovada: 'verde', publicada: 'verde', ativo: 'verde', dentro: 'verde',
  em_aprovacao: 'amarelo', pendente: 'amarelo', expirada: 'amarelo', suspenso: 'amarelo', exige_aprovacao: 'amarelo',
  recusada: 'vermelho', perdida: 'vermelho', cancelada: 'vermelho', desativado: 'vermelho', bloqueado: 'vermelho',
};

export function Selo({ status, children }: { status: string; children?: ReactNode }) {
  return <span className={`selo ${COR_STATUS[status] ?? ''}`}>{children ?? ROTULO_STATUS[status] ?? status}</span>;
}

export function Aviso({ tipo = 'info', children }: { tipo?: 'erro' | 'ok' | 'atencao' | 'info'; children: ReactNode }) {
  if (!children) return null;
  return (
    <div className={`aviso ${tipo}`} role={tipo === 'erro' ? 'alert' : 'status'}>
      {children}
    </div>
  );
}

export function Campo({ rotulo, children, dica }: { rotulo: string; children: ReactNode; dica?: string }) {
  return (
    <div className="campo">
      <label>
        {rotulo}
        <div style={{ marginTop: 4 }}>{children}</div>
      </label>
      {dica && <small>{dica}</small>}
    </div>
  );
}

export function Modal({ titulo, aoFechar, children }: { titulo: string; aoFechar: () => void; children: ReactNode }) {
  useEffect(() => {
    const tecla = (e: KeyboardEvent) => e.key === 'Escape' && aoFechar();
    window.addEventListener('keydown', tecla);
    return () => window.removeEventListener('keydown', tecla);
  }, [aoFechar]);
  return (
    <div className="fundo-modal" onMouseDown={(e) => e.target === e.currentTarget && aoFechar()}>
      <div className="modal" role="dialog" aria-modal="true" aria-label={titulo}>
        <h2>{titulo}</h2>
        {children}
      </div>
    </div>
  );
}

export function Carregando({ texto = 'Carregando…' }: { texto?: string }) {
  return <div className="vazio">{texto}</div>;
}

/** Executa uma ação assíncrona controlando "ocupado" e a mensagem de erro. */
export function useAcao() {
  const [ocupado, setOcupado] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);
  async function executar<T>(fn: () => Promise<T>, mensagemOk?: string): Promise<T | undefined> {
    setOcupado(true);
    setErro(null);
    setOk(null);
    try {
      const r = await fn();
      if (mensagemOk) setOk(mensagemOk);
      return r;
    } catch (e) {
      setErro(mensagemDeErro(e));
      return undefined;
    } finally {
      setOcupado(false);
    }
  }
  return { ocupado, erro, ok, executar, limpar: () => (setErro(null), setOk(null)), setErro, setOk };
}

/** Carrega dados ao montar e sempre que as dependências mudarem. */
export function useDados<T>(carregar: () => Promise<T>, deps: unknown[] = []) {
  const [dados, setDados] = useState<T | null | undefined>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [versao, setVersao] = useState(0);
  useEffect(() => {
    let vivo = true;
    setErro(null);
    carregar()
      .then((d) => vivo && setDados(d))
      .catch((e) => vivo && setErro(mensagemDeErro(e)));
    return () => {
      vivo = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, versao]);
  return { dados, erro, recarregar: () => setVersao((v) => v + 1) };
}

/** Lança o erro de uma consulta ao banco, se houver. */
export function ou<T>(r: { data: T | null; error: { message: string } | null }): T {
  if (r.error) throw new Error(r.error.message);
  return r.data as T;
}
