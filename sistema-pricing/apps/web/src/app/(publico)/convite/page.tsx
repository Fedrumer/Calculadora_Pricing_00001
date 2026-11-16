'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { Aviso, Campo, useAcao } from '@/componentes/ui';
import { api, mensagemDeErro } from '@/lib/api';
import { data as fmtData } from '@/lib/formato';

interface Convite {
  email: string;
  nome: string | null;
  papel: string;
  exigeSegundoFator: boolean;
  organizacao: string;
  expiraEm: string;
}

export default function AceitarConvite() {
  const [token, setToken] = useState('');
  const [convite, setConvite] = useState<Convite | null>(null);
  const [invalido, setInvalido] = useState<string | null>(null);
  const [nome, setNome] = useState('');
  const [senha, setSenha] = useState('');
  const [confirmacao, setConfirmacao] = useState('');
  const [aceite, setAceite] = useState(false);
  const [feito, setFeito] = useState(false);
  const acao = useAcao();

  useEffect(() => {
    const t = new URLSearchParams(window.location.search).get('token') ?? '';
    setToken(t);
    api<Convite>('GET', `/convites/${encodeURIComponent(t)}`, undefined, { publico: true })
      .then((c) => {
        setConvite(c);
        setNome(c.nome ?? '');
      })
      .catch((e) => setInvalido(mensagemDeErro(e)));
  }, []);

  const aceitar = () =>
    acao.executar(async () => {
      if (senha !== confirmacao) throw new Error('As duas senhas não são iguais.');
      await api('POST', '/convites/aceitar', { token, nome, senha, aceiteTermos: aceite }, { publico: true });
      setFeito(true);
    });

  return (
    <main className="centro">
      <div className="caixa-entrada">
        <div className="marca">Sistema de Pricing</div>
        <div className="cartao">
          {invalido && (
            <>
              <h1>Convite indisponível</h1>
              <Aviso tipo="erro">{invalido}</Aviso>
            </>
          )}
          {!invalido && !convite && <p>Conferindo o convite…</p>}
          {feito && (
            <>
              <h1>Acesso criado</h1>
              <Aviso tipo="ok">Sua senha foi definida.{convite?.exigeSegundoFator ? ' No primeiro acesso você vai cadastrar o segundo fator.' : ''}</Aviso>
              <Link className="btn primario" href="/entrar">
                Entrar
              </Link>
            </>
          )}
          {convite && !feito && (
            <>
              <h1>Bem-vindo(a)</h1>
              <p>
                Você foi convidado(a) para <strong>{convite.organizacao}</strong> com o perfil <strong>{convite.papel}</strong>.
              </p>
              <p className="sutil">
                {convite.email} · convite válido até {fmtData(convite.expiraEm)}
              </p>
              <Aviso tipo="erro">{acao.erro}</Aviso>
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  void aceitar();
                }}
              >
                <Campo rotulo="Seu nome">
                  <input name="nome" required minLength={2} value={nome} onChange={(e) => setNome(e.target.value)} />
                </Campo>
                <Campo rotulo="Crie uma senha" dica="Pelo menos 12 caracteres, com letras maiúsculas, minúsculas e números.">
                  <input name="senha" type="password" autoComplete="new-password" required minLength={12} value={senha} onChange={(e) => setSenha(e.target.value)} />
                </Campo>
                <Campo rotulo="Repita a senha">
                  <input name="confirmacao" type="password" autoComplete="new-password" required value={confirmacao} onChange={(e) => setConfirmacao(e.target.value)} />
                </Campo>
                <label className="linha-check">
                  <input name="aceite" type="checkbox" checked={aceite} onChange={(e) => setAceite(e.target.checked)} />
                  <span>Li e aceito os termos de uso e de confidencialidade.</span>
                </label>
                <button className="btn primario" disabled={acao.ocupado || !aceite}>
                  {acao.ocupado ? 'Criando…' : 'Criar meu acesso'}
                </button>
              </form>
            </>
          )}
        </div>
      </div>
    </main>
  );
}
