'use client';

import { useEffect, useRef, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { Aviso, Campo, useAcao } from './ui';

/**
 * Segundo fator por aplicativo autenticador (TOTP). Se o usuário já tem fator
 * cadastrado, pede o código; se não tem, conduz o cadastro.
 */
export function SegundoFator({ aoConcluir, obrigatorio }: { aoConcluir: () => void; obrigatorio: boolean }) {
  const [fase, setFase] = useState<'carregando' | 'cadastrar' | 'desafiar'>('carregando');
  const [fatorId, setFatorId] = useState('');
  const [qr, setQr] = useState('');
  const [segredo, setSegredo] = useState('');
  const [codigo, setCodigo] = useState('');
  const acao = useAcao();
  // o cadastro roda uma vez só, mesmo quando o React repete o efeito (modo estrito):
  // duas execuções ao mesmo tempo apagariam o fator uma da outra
  const iniciado = useRef(false);

  useEffect(() => {
    if (iniciado.current) return;
    iniciado.current = true;
    void (async () => {
      const sb = supabase();
      const { data, error } = await sb.auth.mfa.listFactors();
      if (error) return acao.setErro(error.message);
      const verificado = data.totp.find((f) => f.status === 'verified');
      if (verificado) {
        setFatorId(verificado.id);
        return setFase('desafiar');
      }
      // limpa cadastros que ficaram pela metade e começa um novo
      for (const f of data.all.filter((x) => x.status !== 'verified')) await sb.auth.mfa.unenroll({ factorId: f.id });
      const novo = await sb.auth.mfa.enroll({ factorType: 'totp', friendlyName: `Autenticador ${new Date().toISOString().slice(0, 10)}` });
      if (novo.error) return acao.setErro(novo.error.message);
      setFatorId(novo.data.id);
      setQr(novo.data.totp.qr_code);
      setSegredo(novo.data.totp.secret);
      setFase('cadastrar');
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const confirmar = () =>
    acao.executar(async () => {
      const sb = supabase();
      const desafio = await sb.auth.mfa.challenge({ factorId: fatorId });
      if (desafio.error) throw new Error(desafio.error.message);
      const r = await sb.auth.mfa.verify({ factorId: fatorId, challengeId: desafio.data.id, code: codigo.replace(/\s/g, '') });
      if (r.error) throw new Error('Código inválido ou expirado. Confira o aplicativo e tente de novo.');
      aoConcluir();
    });

  return (
    <div>
      <h2>Segundo fator de autenticação</h2>
      {obrigatorio && <p className="sutil">Seu perfil altera regra, aprova exceção ou vê dados sensíveis, por isso o segundo fator é obrigatório.</p>}
      <Aviso tipo="erro">{acao.erro}</Aviso>
      {fase === 'carregando' && <p>Preparando…</p>}
      {fase === 'cadastrar' && (
        <>
          <p>1. Abra seu aplicativo autenticador (Google Authenticator, Microsoft Authenticator, 1Password…) e leia o código abaixo.</p>
          {qr && <img src={qr} alt="Código QR para o aplicativo autenticador" width={180} height={180} style={{ display: 'block', margin: '8px auto', background: '#fff' }} />}
          <p className="sutil">
            Não consegue ler? Digite esta chave no aplicativo: <code data-testid="segredo-totp">{segredo}</code>
          </p>
          <p>2. Digite o código de 6 dígitos que o aplicativo mostra.</p>
        </>
      )}
      {fase === 'desafiar' && <p>Digite o código de 6 dígitos do seu aplicativo autenticador.</p>}
      {fase !== 'carregando' && (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void confirmar();
          }}
        >
          <Campo rotulo="Código">
            <input name="codigo" inputMode="numeric" autoComplete="one-time-code" pattern="[0-9 ]{6,7}" maxLength={7} required autoFocus value={codigo} onChange={(e) => setCodigo(e.target.value)} />
          </Campo>
          <button className="btn primario" disabled={acao.ocupado || codigo.replace(/\s/g, '').length !== 6}>
            {acao.ocupado ? 'Conferindo…' : 'Confirmar'}
          </button>
        </form>
      )}
    </div>
  );
}
