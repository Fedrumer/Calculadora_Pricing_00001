'use client';

import { useRouter } from 'next/navigation';
import { useEffect } from 'react';
import { Carregando } from '@/componentes/ui';
import { useSessao } from '@/lib/sessao';

/** Cada perfil cai na tela que mais usa. */
export default function Inicio() {
  const s = useSessao();
  const router = useRouter();
  useEffect(() => {
    if (s.tem('aprovador') && !s.tem('gestor_pricing')) router.replace('/aprovacoes');
    else if (s.tem('vendedor', 'canal')) router.replace('/cotacoes/nova');
    else if (s.tem('admin') && !s.tem('gestor_pricing', 'leitura')) router.replace('/usuarios');
    else router.replace('/painel');
  }, [s, router]);
  return <Carregando />;
}
