'use client';

import { useState } from 'react';
import { Aviso, Campo, Carregando, Modal, Selo, ou, useAcao, useDados } from '@/componentes/ui';
import { ErroApi, api } from '@/lib/api';
import { ROTULO_PAPEL, data, dataHora } from '@/lib/formato';
import { useSessao } from '@/lib/sessao';
import { supabase } from '@/lib/supabase';

const PAPEIS = ['vendedor', 'canal', 'aprovador', 'gestor_pricing', 'leitura', 'admin', 'suporte'];

export default function UsuariosECanais() {
  const s = useSessao();
  const admin = s.tem('admin');
  const [aba, setAba] = useState<'usuarios' | 'convites' | 'canais'>('usuarios');
  const [convidando, setConvidando] = useState(false);
  const [convite, setConvite] = useState({ email: '', nome: '', papel: 'vendedor', unidade: '', canal: '', limiteAlcada: '' });
  const [link, setLink] = useState<string | null>(null);
  const [editando, setEditando] = useState<Record<string, any> | null>(null);
  const [edicao, setEdicao] = useState({ status: 'ativo', motivo: '', limiteAlcada: '', transferirPara: '', papel: '', unidade: '', canal: '' });
  const [canalNovo, setCanalNovo] = useState<{ codigo: string; nome: string; tipo: string; permiteConvite: boolean; ativo: boolean } | null>(null);
  const acao = useAcao();

  const { dados, erro, recarregar } = useDados(async () => {
    const sb = supabase();
    const [u, up, c, k, n, p] = await Promise.all([
      sb.from('usuarios').select('id, nome, email, status, limite_alcada, ultimo_acesso, criado_em, ausente_ate, substituto_id').order('nome'),
      sb.from('usuario_papel').select('usuario_id, papel, unidade_id, canal_id, valido_ate'),
      sb.from('v_convites').select('*').order('criado_em', { ascending: false }).limit(100),
      sb.from('canais').select('id, codigo, nome, tipo, ativo, permite_convite').order('nome'),
      sb.from('unidades').select('id, codigo, nome').order('nome'),
      sb.from('papeis').select('codigo, nome, exige_mfa, ativo'),
    ]);
    return { usuarios: ou(u) as Record<string, any>[], vinculos: ou(up) as Record<string, any>[], convites: ou(c) as Record<string, any>[], canais: ou(k) as Record<string, any>[], unidades: ou(n) as Record<string, any>[], papeis: ou(p) as Record<string, any>[] };
  });

  if (erro) return <Aviso tipo="erro">{erro}</Aviso>;
  if (!dados) return <Carregando />;
  const nomeCanal = (id: string | null) => dados.canais.find((c) => c.id === id)?.nome;
  const nomeUnidade = (id: string | null) => dados.unidades.find((c) => c.id === id)?.nome;
  const vinculosDe = (id: string) => dados.vinculos.filter((v) => v.usuario_id === id);

  const enviarConvite = () =>
    acao.executar(async () => {
      const r = await api('POST', '/usuarios/convites', {
        email: convite.email,
        ...(convite.nome ? { nome: convite.nome } : {}),
        papel: convite.papel,
        ...(convite.unidade ? { unidade: convite.unidade } : {}),
        ...(convite.papel === 'canal' ? { canal: convite.canal } : {}),
        ...(convite.limiteAlcada ? { limiteAlcada: Number(convite.limiteAlcada) } : {}),
      });
      setLink(r.link);
      setConvite({ email: '', nome: '', papel: 'vendedor', unidade: '', canal: '', limiteAlcada: '' });
      recarregar();
    });

  const abrirEdicao = (u: Record<string, any>) => {
    const v = vinculosDe(u.id)[0];
    setEditando(u);
    acao.limpar();
    setEdicao({ status: u.status, motivo: '', limiteAlcada: u.limite_alcada ? String(u.limite_alcada) : '', transferirPara: '', papel: v?.papel ?? 'vendedor', unidade: dados.unidades.find((n) => n.id === v?.unidade_id)?.codigo ?? '', canal: dados.canais.find((c) => c.id === v?.canal_id)?.codigo ?? '' });
  };
  const salvarEdicao = () =>
    acao.executar(async () => {
      const u = editando!;
      const v = vinculosDe(u.id)[0];
      const mudouPapel = edicao.papel !== v?.papel || edicao.unidade !== (dados.unidades.find((n) => n.id === v?.unidade_id)?.codigo ?? '') || edicao.canal !== (dados.canais.find((c) => c.id === v?.canal_id)?.codigo ?? '');
      try {
        await api('PATCH', `/usuarios/${u.id}`, {
          ...(edicao.status !== u.status ? { status: edicao.status, motivo: edicao.motivo || undefined, ...(edicao.transferirPara ? { transferirPara: edicao.transferirPara } : {}) } : {}),
          limiteAlcada: edicao.limiteAlcada ? Number(edicao.limiteAlcada) : null,
          ...(mudouPapel ? { papeis: [{ papel: edicao.papel, ...(edicao.unidade ? { unidade: edicao.unidade } : {}), ...(edicao.papel === 'canal' ? { canal: edicao.canal } : {}) }] } : {}),
        });
      } catch (e) {
        if (e instanceof ErroApi && e.codigo === 'TRANSFERENCIA_NECESSARIA') throw new Error(`${e.message} Escolha abaixo o responsável.`);
        throw e;
      }
      setEditando(null);
      recarregar();
    }, 'Usuário atualizado.');

  const salvarCanal = () =>
    acao.executar(async () => {
      await api('PUT', '/catalogo/canais', canalNovo);
      setCanalNovo(null);
      recarregar();
    }, 'Canal salvo.');

  return (
    <>
      <div className="cabecalho">
        <div>
          <h1>Usuários e canais</h1>
          <p>Ninguém se cadastra sozinho: todo acesso nasce de um convite, já com papel e escopo.</p>
        </div>
        {admin && (
          <button className="btn primario" onClick={() => (setConvidando(true), setLink(null), acao.limpar())}>
            Convidar usuário
          </button>
        )}
      </div>
      <Aviso tipo="ok">{!editando && !convidando && acao.ok}</Aviso>
      <div className="abas" role="tablist">
        {(['usuarios', 'convites', 'canais'] as const).map((a) => (
          <button key={a} role="tab" aria-selected={aba === a} className={aba === a ? 'ativa' : ''} onClick={() => setAba(a)}>
            {a === 'usuarios' ? `Usuários (${dados.usuarios.length})` : a === 'convites' ? `Convites (${dados.convites.filter((c) => c.situacao === 'pendente').length} pendentes)` : `Canais (${dados.canais.length})`}
          </button>
        ))}
      </div>

      {aba === 'usuarios' && (
        <div className="cartao rolagem">
          <table>
            <thead>
              <tr>
                <th>Nome</th>
                <th>Perfil e escopo</th>
                <th>Alçada</th>
                <th>Situação</th>
                <th>Último acesso</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {dados.usuarios.map((u) => (
                <tr key={u.id}>
                  <td>
                    {u.nome}
                    <div className="sutil">{u.email}</div>
                  </td>
                  <td>
                    {vinculosDe(u.id).map((v, i) => (
                      <div key={i}>
                        {ROTULO_PAPEL[v.papel]}
                        {(v.unidade_id || v.canal_id) && <span className="sutil"> · {nomeUnidade(v.unidade_id) ?? nomeCanal(v.canal_id)}</span>}
                        {v.valido_ate && <span className="sutil"> · até {data(v.valido_ate)}</span>}
                      </div>
                    ))}
                  </td>
                  <td>{u.limite_alcada ? `Nível ${u.limite_alcada}` : '—'}</td>
                  <td>
                    <Selo status={u.status} />
                  </td>
                  <td>{dataHora(u.ultimo_acesso)}</td>
                  <td>
                    {admin && u.id !== s.usuario.id && (
                      <button className="btn pequeno" onClick={() => abrirEdicao(u)}>
                        Alterar
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {aba === 'convites' && (
        <div className="cartao rolagem">
          {dados.convites.length === 0 ? (
            <div className="vazio">Nenhum convite enviado.</div>
          ) : (
            <table>
              <thead>
                <tr>
                  <th>E-mail</th>
                  <th>Perfil</th>
                  <th>Convidado por</th>
                  <th>Situação</th>
                  <th>Validade</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {dados.convites.map((c) => (
                  <tr key={c.id}>
                    <td>{c.email}</td>
                    <td>
                      {ROTULO_PAPEL[c.papel]}
                      {(c.unidade_id || c.canal_id) && <span className="sutil"> · {nomeUnidade(c.unidade_id) ?? nomeCanal(c.canal_id)}</span>}
                    </td>
                    <td>{dados.usuarios.find((u) => u.id === c.convidado_por)?.nome ?? '—'}</td>
                    <td>
                      <span className={`selo ${c.situacao === 'aceito' ? 'verde' : c.situacao === 'pendente' ? 'amarelo' : ''}`}>{c.situacao}</span>
                    </td>
                    <td>{dataHora(c.expira_em)}</td>
                    <td>
                      {c.situacao === 'pendente' && (
                        <button className="btn pequeno perigo" onClick={() => void acao.executar(async () => (await api('POST', `/usuarios/convites/${c.id}/cancelar`), recarregar()))}>
                          Cancelar
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}

      {aba === 'canais' && (
        <div className="cartao rolagem">
          {admin && (
            <div className="acoes" style={{ marginBottom: 10 }}>
              <button className="btn" onClick={() => (setCanalNovo({ codigo: '', nome: '', tipo: 'corretora', permiteConvite: false, ativo: true }), acao.limpar())}>
                Novo canal
              </button>
            </div>
          )}
          <table>
            <thead>
              <tr>
                <th>Canal</th>
                <th>Tipo</th>
                <th>Situação</th>
                <th>Convida os próprios usuários</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {dados.canais.map((c) => (
                <tr key={c.id}>
                  <td>
                    {c.nome}
                    <div className="sutil">{c.codigo}</div>
                  </td>
                  <td>{c.tipo}</td>
                  <td>
                    <Selo status={c.ativo ? 'ativo' : 'desativado'} />
                  </td>
                  <td>{c.permite_convite ? 'Sim' : 'Não'}</td>
                  <td>
                    {admin && (
                      <button className="btn pequeno" onClick={() => (setCanalNovo({ codigo: c.codigo, nome: c.nome, tipo: c.tipo, permiteConvite: c.permite_convite, ativo: c.ativo }), acao.limpar())}>
                        Alterar
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {convidando && (
        <Modal titulo="Convidar usuário" aoFechar={() => setConvidando(false)}>
          {link ? (
            <>
              <Aviso tipo="ok">Convite criado. O link é de uso único e vale por 72 horas.</Aviso>
              <Campo rotulo="Link do convite" dica="O sistema guarda só o hash do token: este link não aparece de novo. Envie ao convidado por um canal seguro.">
                <input name="link-convite" readOnly value={link} onFocus={(e) => e.currentTarget.select()} />
              </Campo>
              <div className="acoes">
                <button className="btn" onClick={() => void navigator.clipboard?.writeText(link)}>
                  Copiar link
                </button>
                <button className="btn primario" onClick={() => setConvidando(false)}>
                  Concluir
                </button>
              </div>
            </>
          ) : (
            <form
              onSubmit={(e) => {
                e.preventDefault();
                void enviarConvite();
              }}
            >
              <Aviso tipo="erro">{acao.erro}</Aviso>
              <Campo rotulo="E-mail">
                <input name="convite-email" type="email" required value={convite.email} onChange={(e) => setConvite({ ...convite, email: e.target.value })} />
              </Campo>
              <Campo rotulo="Nome (opcional)">
                <input name="convite-nome" value={convite.nome} onChange={(e) => setConvite({ ...convite, nome: e.target.value })} />
              </Campo>
              <Campo rotulo="Perfil" dica={dados.papeis.find((p) => p.codigo === convite.papel)?.exige_mfa ? 'Este perfil exige segundo fator.' : undefined}>
                <select name="convite-papel" value={convite.papel} onChange={(e) => setConvite({ ...convite, papel: e.target.value })}>
                  {PAPEIS.filter((p) => dados.papeis.find((x) => x.codigo === p)?.ativo).map((p) => (
                    <option key={p} value={p}>
                      {ROTULO_PAPEL[p]}
                    </option>
                  ))}
                </select>
              </Campo>
              {convite.papel === 'vendedor' && (
                <Campo rotulo="Unidade (escopo)">
                  <select name="convite-unidade" value={convite.unidade} onChange={(e) => setConvite({ ...convite, unidade: e.target.value })}>
                    <option value="">Todas</option>
                    {dados.unidades.map((u) => (
                      <option key={u.id} value={u.codigo}>
                        {u.nome}
                      </option>
                    ))}
                  </select>
                </Campo>
              )}
              {convite.papel === 'canal' && (
                <Campo rotulo="Canal (escopo)">
                  <select name="convite-canal" required value={convite.canal} onChange={(e) => setConvite({ ...convite, canal: e.target.value })}>
                    <option value="">Selecione</option>
                    {dados.canais.filter((c) => c.ativo).map((c) => (
                      <option key={c.id} value={c.codigo}>
                        {c.nome}
                      </option>
                    ))}
                  </select>
                </Campo>
              )}
              {['aprovador', 'gestor_pricing'].includes(convite.papel) && (
                <Campo rotulo="Limite de alçada (nível)">
                  <input name="convite-alcada" type="number" min={1} max={9} value={convite.limiteAlcada} onChange={(e) => setConvite({ ...convite, limiteAlcada: e.target.value })} />
                </Campo>
              )}
              <button className="btn primario" disabled={acao.ocupado}>
                Criar convite
              </button>
            </form>
          )}
        </Modal>
      )}

      {editando && (
        <Modal titulo={`Alterar ${editando.nome}`} aoFechar={() => setEditando(null)}>
          <Aviso tipo="erro">{acao.erro}</Aviso>
          <Campo rotulo="Perfil" dica="A mudança de papel fica na auditoria com o valor anterior.">
            <select name="edicao-papel" value={edicao.papel} onChange={(e) => setEdicao({ ...edicao, papel: e.target.value })}>
              {PAPEIS.map((p) => (
                <option key={p} value={p}>
                  {ROTULO_PAPEL[p]}
                </option>
              ))}
            </select>
          </Campo>
          {edicao.papel === 'vendedor' && (
            <Campo rotulo="Unidade">
              <select name="edicao-unidade" value={edicao.unidade} onChange={(e) => setEdicao({ ...edicao, unidade: e.target.value })}>
                <option value="">Todas</option>
                {dados.unidades.map((u) => (
                  <option key={u.id} value={u.codigo}>
                    {u.nome}
                  </option>
                ))}
              </select>
            </Campo>
          )}
          {edicao.papel === 'canal' && (
            <Campo rotulo="Canal">
              <select name="edicao-canal" value={edicao.canal} onChange={(e) => setEdicao({ ...edicao, canal: e.target.value })}>
                <option value="">Selecione</option>
                {dados.canais.map((c) => (
                  <option key={c.id} value={c.codigo}>
                    {c.nome}
                  </option>
                ))}
              </select>
            </Campo>
          )}
          <Campo rotulo="Limite de alçada (nível; vazio = não aprova)">
            <input name="edicao-alcada" type="number" min={1} max={9} value={edicao.limiteAlcada} onChange={(e) => setEdicao({ ...edicao, limiteAlcada: e.target.value })} />
          </Campo>
          <Campo rotulo="Situação" dica="Desativar não exclui: o histórico permanece e o acesso cai na hora.">
            <select name="edicao-status" value={edicao.status} onChange={(e) => setEdicao({ ...edicao, status: e.target.value })}>
              <option value="ativo">Ativo</option>
              <option value="suspenso">Suspenso</option>
              <option value="desativado">Desativado</option>
            </select>
          </Campo>
          {edicao.status !== editando.status && edicao.status !== 'ativo' && (
            <>
              <Campo rotulo="Motivo">
                <input name="edicao-motivo" value={edicao.motivo} onChange={(e) => setEdicao({ ...edicao, motivo: e.target.value })} />
              </Campo>
              <Campo rotulo="Quem assume as cotações em aberto">
                <select name="edicao-transferir" value={edicao.transferirPara} onChange={(e) => setEdicao({ ...edicao, transferirPara: e.target.value })}>
                  <option value="">Ninguém (não há cotações em aberto)</option>
                  {dados.usuarios.filter((u) => u.status === 'ativo' && u.id !== editando.id).map((u) => (
                    <option key={u.id} value={u.id}>
                      {u.nome}
                    </option>
                  ))}
                </select>
              </Campo>
            </>
          )}
          <button className="btn primario" disabled={acao.ocupado} onClick={() => void salvarEdicao()}>
            Salvar
          </button>
        </Modal>
      )}

      {canalNovo && (
        <Modal titulo="Canal de venda" aoFechar={() => setCanalNovo(null)}>
          <Aviso tipo="erro">{acao.erro}</Aviso>
          <Campo rotulo="Código" dica="Letras, números e hífen. Não muda depois de criado.">
            <input name="canal-codigo" value={canalNovo.codigo} readOnly={dados.canais.some((c) => c.codigo === canalNovo.codigo && canalNovo.nome !== '')} onChange={(e) => setCanalNovo({ ...canalNovo, codigo: e.target.value })} />
          </Campo>
          <Campo rotulo="Nome">
            <input name="canal-nome" value={canalNovo.nome} onChange={(e) => setCanalNovo({ ...canalNovo, nome: e.target.value })} />
          </Campo>
          <Campo rotulo="Tipo">
            <input name="canal-tipo" value={canalNovo.tipo} onChange={(e) => setCanalNovo({ ...canalNovo, tipo: e.target.value })} />
          </Campo>
          <label className="linha-check">
            <input type="checkbox" checked={canalNovo.ativo} onChange={(e) => setCanalNovo({ ...canalNovo, ativo: e.target.checked })} /> Ativo
          </label>
          <label className="linha-check">
            <input type="checkbox" checked={canalNovo.permiteConvite} onChange={(e) => setCanalNovo({ ...canalNovo, permiteConvite: e.target.checked })} /> O responsável do canal pode convidar usuários do próprio canal
          </label>
          <button className="btn primario" disabled={acao.ocupado} onClick={() => void salvarCanal()}>
            Salvar
          </button>
        </Modal>
      )}
    </>
  );
}
