'use client';

import { useState } from 'react';
import { SegundoFator } from '@/componentes/segundo-fator';
import { Aviso, Campo, useAcao, useDados } from '@/componentes/ui';
import { data } from '@/lib/formato';
import { useSessao } from '@/lib/sessao';
import { supabase } from '@/lib/supabase';

export default function MinhaConta() {
  const s = useSessao();
  const [senha, setSenha] = useState('');
  const [cadastrando, setCadastrando] = useState(false);
  const acao = useAcao();
  const fatores = useDados(async () => {
    const { data: f, error } = await supabase().auth.mfa.listFactors();
    if (error) throw new Error(error.message);
    return f.totp.filter((x) => x.status === 'verified');
  });
  const exige = s.papeis.some((p) => p.exigeMfa);

  const trocar = () =>
    acao.executar(async () => {
      if (senha.length < 12 || !/[a-z]/.test(senha) || !/[A-Z]/.test(senha) || !/\d/.test(senha)) throw new Error('A senha precisa de pelo menos 12 caracteres, com letras maiúsculas, minúsculas e números.');
      const { error } = await supabase().auth.updateUser({ password: senha });
      if (error) throw new Error(error.message);
      setSenha('');
    }, 'Senha alterada.');

  return (
    <>
      <div className="cabecalho">
        <div>
          <h1>Minha conta</h1>
          <p>
            {s.usuario.nome} · {s.usuario.email}
          </p>
        </div>
      </div>
      <div className="grade g2">
        <div className="cartao">
          <h2>Perfis e escopo</h2>
          {s.papeis.map((p, i) => (
            <div key={i} className="detalhe-linha">
              <span>{p.nome}</span>
              <span className="sutil">{p.validoAte ? `até ${data(p.validoAte)}` : p.exigeMfa ? 'segundo fator obrigatório' : ''}</span>
            </div>
          ))}
          {s.usuario.limiteAlcada && (
            <div className="detalhe-linha">
              <span>Limite de alçada</span>
              <span>nível {s.usuario.limiteAlcada}</span>
            </div>
          )}
        </div>
        <div className="cartao">
          <h2>Segundo fator</h2>
          {fatores.dados && fatores.dados.length > 0 ? (
            <Aviso tipo="ok">Aplicativo autenticador cadastrado em {data(fatores.dados[0]!.created_at)}.</Aviso>
          ) : cadastrando ? (
            <SegundoFator obrigatorio={false} aoConcluir={() => (setCadastrando(false), fatores.recarregar())} />
          ) : (
            <>
              <p>{exige ? 'Obrigatório para o seu perfil.' : 'Recomendado para o seu perfil.'} Protege o acesso mesmo que a senha vaze.</p>
              <button className="btn primario" onClick={() => setCadastrando(true)}>
                Cadastrar aplicativo autenticador
              </button>
            </>
          )}
        </div>
        <div className="cartao">
          <h2>Trocar senha</h2>
          <Aviso tipo="erro">{acao.erro}</Aviso>
          <Aviso tipo="ok">{acao.ok}</Aviso>
          <Campo rotulo="Nova senha" dica="Pelo menos 12 caracteres, com letras maiúsculas, minúsculas e números.">
            <input name="nova-senha" type="password" autoComplete="new-password" value={senha} onChange={(e) => setSenha(e.target.value)} />
          </Campo>
          <button className="btn" disabled={acao.ocupado || !senha} onClick={() => void trocar()}>
            Salvar senha
          </button>
        </div>
      </div>
    </>
  );
}
