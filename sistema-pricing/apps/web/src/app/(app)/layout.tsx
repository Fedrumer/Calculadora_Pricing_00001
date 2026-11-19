'use client';

import { irPara } from '@/lib/caminho';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { type ReactNode, useEffect, useState } from 'react';
import { SegundoFator } from '@/componentes/segundo-fator';
import { Carregando } from '@/componentes/ui';
import { type Papel, ProvedorSessao, type Sessao, useEstadoDaSessao, useSessao } from '@/lib/sessao';
import { supabase } from '@/lib/supabase';

interface Item {
  href: string;
  rotulo: string;
  ver: (s: Sessao) => boolean;
}

const perfis = (...p: Papel[]) => (s: Sessao) => s.tem(...p);
const MENU: Item[] = [
  { href: '/painel', rotulo: 'Painel', ver: (s) => s.interno },
  { href: '/cotacoes/nova', rotulo: 'Nova cotação', ver: (s) => s.podeCotar },
  { href: '/cotacoes', rotulo: 'Cotações', ver: () => true },
  { href: '/aprovacoes', rotulo: 'Fila de aprovações', ver: perfis('aprovador', 'gestor_pricing') },
  { href: '/regras', rotulo: 'Tabelas e regras', ver: perfis('gestor_pricing', 'leitura', 'suporte') },
  { href: '/politica', rotulo: 'Política comercial', ver: perfis('gestor_pricing', 'leitura', 'suporte', 'admin') },
  { href: '/usuarios', rotulo: 'Usuários e canais', ver: perfis('admin', 'suporte') },
  { href: '/auditoria', rotulo: 'Auditoria', ver: perfis('admin', 'leitura', 'suporte') },
  { href: '/configuracoes', rotulo: 'Configurações', ver: perfis('admin', 'suporte') },
  { href: '/envio-diagnostico', rotulo: 'Envio ao diagnóstico', ver: perfis('admin') },
  { href: '/seguranca', rotulo: 'Minha conta', ver: () => true },
];

function Casca({ children }: { children: ReactNode }) {
  const s = useSessao();
  const caminho = usePathname();
  const [aberta, setAberta] = useState(false);
  const [pendentes, setPendentes] = useState(0);
  const identidade = s.organizacao.config?.identidade ?? {};

  useEffect(() => {
    setAberta(false);
    if (!s.tem('aprovador', 'gestor_pricing')) return;
    supabase()
      .from('aprovacoes')
      .select('id')
      .eq('status', 'pendente')
      .then((r) => setPendentes(r.data?.length ?? 0));
  }, [caminho, s]);

  const ativo = (href: string) => (href === '/cotacoes' ? caminho === '/cotacoes' || (/^\/cotacoes\/(?!nova)/.test(caminho)) : caminho.startsWith(href));
  const estilo = { '--primaria': identidade.corPrimaria ?? '#0f4c5c', '--destaque': identidade.corDestaque ?? '#e36414' } as React.CSSProperties;

  return (
    <div className="casca" style={estilo}>
      <div className="topo-movel">
        <button type="button" onClick={() => setAberta((a) => !a)} aria-label="Abrir menu">
          Menu
        </button>
        <span>{identidade.nomeFantasia ?? s.organizacao.nome}</span>
      </div>
      <nav className={`lateral ${aberta ? 'aberta' : ''}`} aria-label="Navegação principal">
        <div className="lateral-conteudo">
        <div className="marca">
          {identidade.nomeFantasia ?? s.organizacao.nome}
          <small>Sistema de Pricing</small>
        </div>
        {MENU.filter((i) => i.ver(s)).map((i) => (
          <Link key={i.href} href={i.href} className={ativo(i.href) ? 'ativo' : ''}>
            {i.rotulo}
            {i.href === '/aprovacoes' && pendentes > 0 && <span className="contador">{pendentes}</span>}
          </Link>
        ))}
        <div className="conta">
          <div>
            <strong>{s.usuario.nome}</strong>
          </div>
          <div style={{ opacity: 0.8 }}>{[...new Set(s.papeis.map((p) => p.nome))].join(', ')}</div>
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
  const { estado, carregar } = useEstadoDaSessao();
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
          <p>Seu usuário não tem perfil ativo nesta instalação, ou o prazo do acesso venceu. Fale com o administrador.</p>
          <button className="btn" onClick={() => void supabase().auth.signOut().then(() => irPara('/entrar'))}>
            Sair
          </button>
        </div>
      </main>
    );
  }
  if (!estado.acesso.mfaOk) {
    return (
      <main className="centro">
        <div className="cartao caixa-entrada">
          <SegundoFator obrigatorio aoConcluir={() => void carregar()} />
          <p style={{ marginTop: 14 }}>
            <button className="btn link" onClick={() => void supabase().auth.signOut().then(() => irPara('/entrar'))}>
              Sair
            </button>
          </p>
        </div>
      </main>
    );
  }
  return (
    <ProvedorSessao acesso={estado.acesso} recarregar={carregar}>
      <Casca>{children}</Casca>
    </ProvedorSessao>
  );
}
