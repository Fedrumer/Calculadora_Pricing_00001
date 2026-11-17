'use client';

import { useState } from 'react';
import { Aviso, Campo, useAcao } from '@/componentes/ui';
import { irPara } from '@/lib/caminho';
import { AMBIENTE, supabase } from '@/lib/supabase';

const ACESSOS_DEMO = [
  ['Consultor', 'consultor@demo.local'],
  ['Cliente (leitura)', 'cliente@demo.local'],
];

export default function Entrar() {
  const [email, setEmail] = useState('');
  const [senha, setSenha] = useState('');
  const acao = useAcao();

  const entrar = () =>
    acao.executar(async () => {
      const { error } = await supabase().auth.signInWithPassword({ email: email.trim().toLowerCase(), password: senha });
      if (error) throw new Error('E-mail ou senha incorretos.'); // mensagem única: não revela se o e-mail existe
      irPara('/');
    });

  return (
    <main className="centro">
      <div className="caixa-entrada">
        <div className="marca">Diagnóstico de Pricing</div>
        <div className="cartao">
          <h1>Entrar</h1>
          <p className="sutil">O acesso é criado pelo consultor responsável.</p>
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
            <button className="btn primario" disabled={acao.ocupado}>
              {acao.ocupado ? 'Entrando…' : 'Entrar'}
            </button>
          </form>
        </div>
        {AMBIENTE === 'demonstracao' && (
          <div className="cartao">
            <h3>Ambiente de demonstração</h3>
            <p className="sutil">Empresa e dados fictícios. A senha é a informada ao subir o ambiente.</p>
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
