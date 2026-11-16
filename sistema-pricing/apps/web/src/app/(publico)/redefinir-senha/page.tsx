'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { Aviso, Campo, useAcao } from '@/componentes/ui';
import { supabase } from '@/lib/supabase';

export default function RedefinirSenha() {
  const [modo, setModo] = useState<'pedir' | 'definir'>('pedir');
  const [email, setEmail] = useState('');
  const [senha, setSenha] = useState('');
  const acao = useAcao();

  useEffect(() => {
    // quem chega pelo link do e-mail vem com uma sessão de recuperação
    const { data } = supabase().auth.onAuthStateChange((evento) => {
      if (evento === 'PASSWORD_RECOVERY') setModo('definir');
    });
    return () => data.subscription.unsubscribe();
  }, []);

  const pedir = () =>
    acao.executar(async () => {
      await supabase().auth.resetPasswordForEmail(email.trim().toLowerCase(), { redirectTo: `${window.location.origin}/redefinir-senha` });
    }, 'Se este e-mail tiver acesso, enviamos um link para redefinir a senha.');

  const definir = () =>
    acao.executar(async () => {
      if (senha.length < 12 || !/[a-z]/.test(senha) || !/[A-Z]/.test(senha) || !/\d/.test(senha)) {
        throw new Error('A senha precisa de pelo menos 12 caracteres, com letras maiúsculas, minúsculas e números.');
      }
      const { error } = await supabase().auth.updateUser({ password: senha });
      if (error) throw new Error(error.message);
      window.location.href = '/';
    });

  return (
    <main className="centro">
      <div className="caixa-entrada">
        <div className="marca">Sistema de Pricing</div>
        <div className="cartao">
          <h1>{modo === 'pedir' ? 'Redefinir senha' : 'Nova senha'}</h1>
          <Aviso tipo="erro">{acao.erro}</Aviso>
          <Aviso tipo="ok">{acao.ok}</Aviso>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              void (modo === 'pedir' ? pedir() : definir());
            }}
          >
            {modo === 'pedir' ? (
              <Campo rotulo="E-mail">
                <input name="email" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
              </Campo>
            ) : (
              <Campo rotulo="Nova senha" dica="Pelo menos 12 caracteres, com letras maiúsculas, minúsculas e números.">
                <input name="senha" type="password" autoComplete="new-password" required value={senha} onChange={(e) => setSenha(e.target.value)} />
              </Campo>
            )}
            <div className="acoes" style={{ justifyContent: 'space-between' }}>
              <button className="btn primario" disabled={acao.ocupado}>
                {modo === 'pedir' ? 'Enviar link' : 'Salvar senha'}
              </button>
              <Link href="/entrar">Voltar</Link>
            </div>
          </form>
        </div>
      </div>
    </main>
  );
}
