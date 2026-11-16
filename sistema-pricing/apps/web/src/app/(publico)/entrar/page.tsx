'use client';

import Link from 'next/link';
import { useState } from 'react';
import { Aviso, Campo, useAcao } from '@/componentes/ui';
import { AMBIENTE, supabase } from '@/lib/supabase';

const ACESSOS_DEMO = [
  ['Vendedor', 'vendedor@aurora.demo'],
  ['Usuário de canal', 'canal@corretora-alfa.demo'],
  ['Aprovador (gestor)', 'gestor@aurora.demo'],
  ['Aprovador (diretoria)', 'diretoria@aurora.demo'],
  ['Gestor de pricing', 'pricing@aurora.demo'],
  ['Administrador', 'admin@aurora.demo'],
  ['Leitura', 'financeiro@aurora.demo'],
];

export default function Entrar() {
  const [email, setEmail] = useState('');
  const [senha, setSenha] = useState('');
  const acao = useAcao();

  const entrar = () =>
    acao.executar(async () => {
      const { error } = await supabase().auth.signInWithPassword({ email: email.trim().toLowerCase(), password: senha });
      if (error) {
        // mensagem única: não revela se o e-mail existe
        throw new Error(/banned|bloque/i.test(error.message) ? 'Este acesso está suspenso ou desativado. Fale com o administrador.' : 'E-mail ou senha incorretos.');
      }
      window.location.href = '/';
    });

  return (
    <main className="centro">
      <div className="caixa-entrada">
        <div className="marca">Sistema de Pricing</div>
        <div className="cartao">
          <h1>Entrar</h1>
          <p className="sutil">O acesso é só por convite do administrador.</p>
          <Aviso tipo="erro">{acao.erro}</Aviso>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              void entrar();
            }}
          >
            <Campo rotulo="E-mail">
              <input name="email" type="email" autoComplete="username" required value={email} onChange={(e) => setEmail(e.target.value)} />
            </Campo>
            <Campo rotulo="Senha">
              <input name="senha" type="password" autoComplete="current-password" required value={senha} onChange={(e) => setSenha(e.target.value)} />
            </Campo>
            <div className="acoes" style={{ justifyContent: 'space-between' }}>
              <button className="btn primario" disabled={acao.ocupado}>
                {acao.ocupado ? 'Entrando…' : 'Entrar'}
              </button>
              <Link href="/redefinir-senha">Esqueci a senha</Link>
            </div>
          </form>
        </div>
        {AMBIENTE === 'demonstracao' && (
          <div className="cartao">
            <h3>Ambiente de demonstração</h3>
            <p className="sutil">Empresa e dados fictícios. Um acesso pronto por perfil; a senha é a mesma informada no roteiro.</p>
            {ACESSOS_DEMO.map(([perfil, e]) => (
              <div key={e} className="detalhe-linha">
                <span>{perfil}</span>
                <button type="button" className="btn link" onClick={() => setEmail(e!)}>
                  {e}
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </main>
  );
}
