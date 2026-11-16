'use client';

import { type ReactNode, createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { irPara } from './caminho';
import { supabase } from './supabase';

export interface Acesso {
  id: string;
  nome: string;
  email: string;
  perfil: 'consultor' | 'cliente_editor' | 'cliente_leitor';
  cliente: { id: string; nome: string } | null;
}
export interface Sessao extends Acesso {
  consultor: boolean;
  sair(): Promise<void>;
}

type Estado = { fase: 'carregando' } | { fase: 'sem_sessao' } | { fase: 'sem_acesso' } | { fase: 'pronto'; acesso: Acesso };
const Contexto = createContext<Sessao | null>(null);

export function useSessao(): Sessao {
  const s = useContext(Contexto);
  if (!s) throw new Error('useSessao fora do provedor.');
  return s;
}

export function useEstadoDaSessao() {
  const [estado, setEstado] = useState<Estado>({ fase: 'carregando' });
  const carregar = useCallback(async () => {
    const sb = supabase();
    const { data } = await sb.auth.getSession();
    if (!data.session) return setEstado({ fase: 'sem_sessao' });
    const { data: acesso, error } = await sb.rpc('meu_acesso');
    if (error || !acesso) return setEstado({ fase: 'sem_acesso' });
    setEstado({ fase: 'pronto', acesso: acesso as Acesso });
  }, []);
  useEffect(() => {
    void carregar();
    const { data } = supabase().auth.onAuthStateChange((evento) => {
      if (evento === 'SIGNED_OUT') setEstado({ fase: 'sem_sessao' });
    });
    return () => data.subscription.unsubscribe();
  }, [carregar]);
  return estado;
}

export async function sair() {
  await supabase().auth.signOut();
  irPara('/entrar');
}

export function ProvedorSessao({ acesso, children }: { acesso: Acesso; children: ReactNode }) {
  const valor = useMemo<Sessao>(() => ({ ...acesso, consultor: acesso.perfil === 'consultor', sair }), [acesso]);
  return <Contexto.Provider value={valor}>{children}</Contexto.Provider>;
}
