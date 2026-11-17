'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { type ReactNode, useEffect, useState } from 'react';
import { Carregando } from '@/componentes/ui';
import { ROTULO_PERFIL } from '@/lib/formato';
import { ProvedorSessao, sair, useEstadoDaSessao, useSessao } from '@/lib/sessao';

function Casca({ children }: { children: ReactNode }) {
  const s = useSessao();
  const [aberta, setAberta] = useState(false);
  return (
    <div className="casca">
      <div className="topo-movel">
        <button type="button" onClick={() => setAberta((a) => !a)} aria-label="Abrir menu">
          Menu
        </button>
        <span>Diagnóstico de Pricing</span>
      </div>
      <nav className={`lateral ${aberta ? 'aberta' : ''}`} aria-label="Navegação principal">
        <div className="lateral-conteudo">
          <div className="marca">
            Diagnóstico de Pricing
            <small>{s.cliente?.nome ?? 'Consultoria'}</small>
          </div>
          <Link href="/" className="ativo" onClick={() => setAberta(false)}>
            Diagnósticos
          </Link>
          <div className="conta">
            <div>
              <strong>{s.nome}</strong>
            </div>
            <div style={{ opacity: 0.8 }}>{ROTULO_PERFIL[s.perfil]}</div>
            <button type="button" onClick={() => void s.sair()}>
              Sair
            </button>
          </div>
        </div>
      </nav>
      <main className="principal" onClick={() => aberta && setAberta(false)}>
        {children}
      </main>
    </div>
  );
}

export default function LayoutApp({ children }: { children: ReactNode }) {
  const estado = useEstadoDaSessao();
  const router = useRouter();
  useEffect(() => {
    if (estado.fase === 'sem_sessao') router.replace('/entrar');
  }, [estado.fase, router]);

  if (estado.fase === 'carregando' || estado.fase === 'sem_sessao') return <Carregando />;
  if (estado.fase === 'sem_acesso') {
    return (
      <main className="centro">
        <div className="cartao caixa-entrada">
          <h1>Sem acesso ativo</h1>
          <p>Seu usuário ainda não tem perfil neste sistema. Fale com o consultor responsável.</p>
          <button className="btn" onClick={() => void sair()}>
            Sair
          </button>
        </div>
      </main>
    );
  }
  return (
    <ProvedorSessao acesso={estado.acesso}>
      <Casca>{children}</Casca>
    </ProvedorSessao>
  );
}
