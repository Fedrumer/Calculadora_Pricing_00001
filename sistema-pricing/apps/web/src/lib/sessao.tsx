'use client';

import { type ReactNode, createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { supabase } from './supabase';

export type Papel = 'admin' | 'gestor_pricing' | 'aprovador' | 'vendedor' | 'canal' | 'leitura' | 'suporte';

export interface Acesso {
  usuario: { id: string; nome: string; email: string; limiteAlcada: number | null };
  organizacao: { id: string; nome: string; config: Record<string, any> };
  papeis: { papel: Papel; nome: string; unidadeId: string | null; canalId: string | null; exigeMfa: boolean; validoAte: string | null }[];
  mfaOk: boolean;
}

export interface Sessao extends Acesso {
  tem(...papeis: Papel[]): boolean;
  /** Perfis com visão ampla (veem custo e margem). */
  interno: boolean;
  podeCotar: boolean;
  /** Perfil de canal puro: só preço final e a própria comissão. */
  externo: boolean;
  recarregar(): Promise<void>;
  sair(): Promise<void>;
}

type Estado = { fase: 'carregando' } | { fase: 'sem_sessao' } | { fase: 'sem_acesso' } | { fase: 'pronto'; acesso: Acesso };

const Contexto = createContext<Sessao | null>(null);
const INTERNOS: Papel[] = ['admin', 'gestor_pricing', 'aprovador', 'leitura', 'suporte'];

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
    if (error || !acesso || !(acesso as Acesso).papeis?.length) return setEstado({ fase: 'sem_acesso' });
    setEstado({ fase: 'pronto', acesso: acesso as Acesso });
    void sb.rpc('registrar_acesso');
  }, []);

  useEffect(() => {
    void carregar();
    const { data } = supabase().auth.onAuthStateChange((evento) => {
      if (evento === 'SIGNED_OUT') setEstado({ fase: 'sem_sessao' });
    });
    return () => data.subscription.unsubscribe();
  }, [carregar]);

  return { estado, carregar };
}

export function ProvedorSessao({ acesso, recarregar, children }: { acesso: Acesso; recarregar: () => Promise<void>; children: ReactNode }) {
  const valor = useMemo<Sessao>(() => {
    const tem = (...p: Papel[]) => acesso.papeis.some((x) => p.includes(x.papel));
    const interno = tem(...INTERNOS);
    return {
      ...acesso,
      tem,
      interno,
      podeCotar: tem('vendedor', 'canal', 'gestor_pricing'),
      externo: !interno && !tem('vendedor'),
      recarregar,
      async sair() {
        await supabase().auth.signOut();
        window.location.href = '/entrar';
      },
    };
  }, [acesso, recarregar]);
  return <Contexto.Provider value={valor}>{children}</Contexto.Provider>;
}
