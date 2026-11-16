'use client';

import { useEffect, useState } from 'react';
import { Aviso, Campo, Carregando, Modal, ou, useAcao, useDados } from '@/componentes/ui';
import { api } from '@/lib/api';
import { data, dataHora } from '@/lib/formato';
import { useSessao } from '@/lib/sessao';
import { supabase } from '@/lib/supabase';

export default function Configuracoes() {
  const s = useSessao();
  const admin = s.tem('admin');
  const cfg = s.organizacao.config ?? {};
  const [identidade, setIdentidade] = useState({ nomeFantasia: '', corPrimaria: '#0f4c5c', corDestaque: '#e36414', rodapeProposta: '' });
  const [modulos, setModulos] = useState({ portalCanal: true, api: true, ia: true, conviteCanal: false });
  const [novaChave, setNovaChave] = useState<{ nome: string; canal: string } | null>(null);
  const [chaveCriada, setChaveCriada] = useState<string | null>(null);
  const [lgpd, setLgpd] = useState({ documento: '', email: '' });
  const [titular, setTitular] = useState<Record<string, any> | null>(null);
  const acao = useAcao();

  useEffect(() => {
    setIdentidade((i) => ({ ...i, ...(cfg.identidade ?? {}) }));
    setModulos((m) => ({ ...m, ...(cfg.modulos ?? {}) }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [s.organizacao.id]);

  const { dados, erro, recarregar } = useDados(async () => {
    const sb = supabase();
    const [k, c, b, ia] = await Promise.all([
      sb.from('v_chaves_api').select('*').order('criado_em', { ascending: false }),
      sb.from('canais').select('id, codigo, nome').eq('ativo', true).order('nome'),
      sb.from('registros_backup').select('id, tipo, status, iniciado_em, duracao_segundos, tamanho_bytes, destino').order('iniciado_em', { ascending: false }).limit(12),
      sb.from('chamadas_ia').select('id, tipo, criado_em, usuario_id, duracao_ms, tokens_entrada, tokens_saida, erro').order('id', { ascending: false }).limit(10),
    ]);
    return { chaves: ou(k) as Record<string, any>[], canais: ou(c) as Record<string, any>[], backups: ou(b) as Record<string, any>[], ia: ou(ia) as Record<string, any>[] };
  });

  const salvarConfig = () =>
    acao.executar(async () => {
      await api('PUT', '/organizacao/config', { identidade, modulos });
      await s.recarregar();
    }, 'Configurações salvas.');
  const criarChave = () =>
    acao.executar(async () => {
      const r = await api('POST', '/integracoes/chaves', novaChave);
      setChaveCriada(r.chave);
      recarregar();
    });
  const localizar = () => acao.executar(async () => setTitular(await api('POST', '/lgpd/localizar', { ...(lgpd.documento ? { documento: lgpd.documento } : {}), ...(lgpd.email ? { email: lgpd.email } : {}) })));
  const anonimizar = () =>
    acao.executar(async () => {
      await api('POST', '/lgpd/anonimizar', { cotacaoIds: titular!.cotacoes.filter((c: any) => !c.anonimizadaEm).map((c: any) => c.id), motivo: 'Pedido do titular' });
      await localizar();
    }, 'Dados pessoais anonimizados; os valores das cotações foram mantidos.');

  if (erro) return <Aviso tipo="erro">{erro}</Aviso>;
  if (!dados) return <Carregando />;
  const ROTULO_BACKUP: Record<string, string> = { copia_externa: 'Cópia externa', teste_restauracao: 'Teste de restauração', planilha_contingencia: 'Planilha de contingência', reposicao_demo: 'Reposição da demonstração' };

  return (
    <>
      <div className="cabecalho">
        <div>
          <h1>Configurações</h1>
          <p>Identidade da proposta, módulos, integrações de canal, cópias de segurança e direitos do titular.</p>
        </div>
      </div>
      <Aviso tipo="erro">{!novaChave && acao.erro}</Aviso>
      <Aviso tipo="ok">{acao.ok}</Aviso>

      <div className="grade g2">
        <div className="cartao">
          <h2>Identidade visual da proposta</h2>
          <Campo rotulo="Nome na proposta">
            <input name="nome-fantasia" disabled={!admin} value={identidade.nomeFantasia} onChange={(e) => setIdentidade({ ...identidade, nomeFantasia: e.target.value })} />
          </Campo>
          <div className="linha-campos">
            <Campo rotulo="Cor principal">
              <input name="cor-primaria" type="color" disabled={!admin} value={identidade.corPrimaria} onChange={(e) => setIdentidade({ ...identidade, corPrimaria: e.target.value })} />
            </Campo>
            <Campo rotulo="Cor de destaque">
              <input name="cor-destaque" type="color" disabled={!admin} value={identidade.corDestaque} onChange={(e) => setIdentidade({ ...identidade, corDestaque: e.target.value })} />
            </Campo>
          </div>
          <Campo rotulo="Rodapé da proposta">
            <textarea name="rodape" rows={2} disabled={!admin} value={identidade.rodapeProposta} onChange={(e) => setIdentidade({ ...identidade, rodapeProposta: e.target.value })} />
          </Campo>
        </div>
        <div className="cartao">
          <h2>Módulos</h2>
          <p className="sutil">Todos existem na base; cada instalação liga o que usa.</p>
          {(
            [
              ['portalCanal', 'Portal de canal (usuários de corretoras, agências e revendas)'],
              ['conviteCanal', 'Responsável do canal convida usuários do próprio canal'],
              ['api', 'API de canal por chave'],
              ['ia', 'Assistente de IA (explicar, sugerir, ler, vigiar)'],
            ] as const
          ).map(([k, rotulo]) => (
            <label key={k} className="linha-check">
              <input type="checkbox" name={`modulo-${k}`} disabled={!admin} checked={!!modulos[k]} onChange={(e) => setModulos({ ...modulos, [k]: e.target.checked })} /> {rotulo}
            </label>
          ))}
          {admin && (
            <button className="btn primario" style={{ marginTop: 10 }} disabled={acao.ocupado} onClick={() => void salvarConfig()}>
              Salvar configurações
            </button>
          )}
        </div>
      </div>

      <div className="cartao">
        <div className="cabecalho" style={{ marginBottom: 8 }}>
          <h2 style={{ margin: 0 }}>Chaves de API de canal</h2>
          {admin && (
            <button className="btn" onClick={() => (setNovaChave({ nome: '', canal: dados.canais[0]?.codigo ?? '' }), setChaveCriada(null), acao.limpar())}>
              Nova chave
            </button>
          )}
        </div>
        {dados.chaves.length === 0 ? (
          <div className="vazio">Nenhuma chave criada.</div>
        ) : (
          <div className="rolagem">
            <table>
              <thead>
                <tr>
                  <th>Nome</th>
                  <th>Canal</th>
                  <th>Prefixo</th>
                  <th>Validade</th>
                  <th>Último uso</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {dados.chaves.map((k) => (
                  <tr key={k.id}>
                    <td>{k.nome}</td>
                    <td>{dados.canais.find((c) => c.id === k.canal_id)?.nome ?? '—'}</td>
                    <td>
                      <code>{k.prefixo}…</code>
                    </td>
                    <td>{k.revogada_em ? <span className="selo vermelho">revogada</span> : data(k.expira_em)}</td>
                    <td>{dataHora(k.ultimo_uso)}</td>
                    <td>
                      {admin && !k.revogada_em && (
                        <button className="btn pequeno perigo" onClick={() => void acao.executar(async () => (await api('POST', `/integracoes/chaves/${k.id}/revogar`), recarregar()), 'Chave revogada.')}>
                          Revogar
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div className="grade g2">
        <div className="cartao">
          <h2>Cópias de segurança</h2>
          {dados.backups.length === 0 ? (
            <div className="vazio">Nenhum registro ainda.</div>
          ) : (
            <table>
              <tbody>
                {dados.backups.map((b) => (
                  <tr key={b.id}>
                    <td>{ROTULO_BACKUP[b.tipo] ?? b.tipo}</td>
                    <td>
                      <span className={`selo ${b.status === 'ok' ? 'verde' : 'vermelho'}`}>{b.status}</span>
                    </td>
                    <td className="sutil">{dataHora(b.iniciado_em)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
        <div className="cartao">
          <h2>Chamadas recentes de IA</h2>
          <p className="sutil">Toda chamada fica registrada, com a entrada já mascarada.</p>
          {dados.ia.length === 0 ? (
            <div className="vazio">Nenhuma chamada.</div>
          ) : (
            <table>
              <tbody>
                {dados.ia.map((c) => (
                  <tr key={c.id}>
                    <td>{c.tipo}</td>
                    <td className="sutil">{dataHora(c.criado_em)}</td>
                    <td className="num">{c.erro ? <span className="selo vermelho">falhou</span> : `${c.duracao_ms} ms`}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {admin && (
        <div className="cartao">
          <h2>LGPD: direitos do titular</h2>
          <p className="sutil">Localize os dados de uma pessoa pelo documento ou e-mail. A anonimização retira o dado pessoal e mantém os valores para análise.</p>
          <div className="linha-campos">
            <Campo rotulo="CPF ou CNPJ">
              <input name="lgpd-documento" value={lgpd.documento} onChange={(e) => setLgpd({ ...lgpd, documento: e.target.value })} />
            </Campo>
            <Campo rotulo="E-mail">
              <input name="lgpd-email" type="email" value={lgpd.email} onChange={(e) => setLgpd({ ...lgpd, email: e.target.value })} />
            </Campo>
          </div>
          <button className="btn" disabled={acao.ocupado || (!lgpd.documento && !lgpd.email)} onClick={() => void localizar()}>
            Localizar
          </button>
          {titular && (
            <div style={{ marginTop: 12 }}>
              <p>{titular.total} {titular.total === 1 ? 'cotação encontrada' : 'cotações encontradas'}.</p>
              {titular.cotacoes.map((c: any) => (
                <div key={c.id} className="detalhe-linha">
                  <span>
                    Cotação {c.numero} · {c.clienteNome} {c.documento ? `· doc. ${c.documento}` : ''}
                  </span>
                  <span className="sutil">{c.anonimizadaEm ? 'anonimizada' : c.status}</span>
                </div>
              ))}
              {titular.cotacoes.some((c: any) => !c.anonimizadaEm) && (
                <button className="btn perigo" style={{ marginTop: 10 }} disabled={acao.ocupado} onClick={() => void anonimizar()}>
                  Anonimizar os dados pessoais
                </button>
              )}
            </div>
          )}
        </div>
      )}

      {novaChave && (
        <Modal titulo="Nova chave de API" aoFechar={() => setNovaChave(null)}>
          {chaveCriada ? (
            <>
              <Aviso tipo="ok">Chave criada. Copie agora: o sistema guarda só o hash e ela não aparece de novo.</Aviso>
              <Campo rotulo="Chave">
                <input name="chave-criada" readOnly value={chaveCriada} onFocus={(e) => e.currentTarget.select()} />
              </Campo>
              <button className="btn primario" onClick={() => setNovaChave(null)}>
                Concluir
              </button>
            </>
          ) : (
            <>
              <Aviso tipo="erro">{acao.erro}</Aviso>
              <Campo rotulo="Nome">
                <input name="chave-nome" value={novaChave.nome} onChange={(e) => setNovaChave({ ...novaChave, nome: e.target.value })} />
              </Campo>
              <Campo rotulo="Canal (escopo da chave)">
                <select name="chave-canal" value={novaChave.canal} onChange={(e) => setNovaChave({ ...novaChave, canal: e.target.value })}>
                  {dados.canais.map((c) => (
                    <option key={c.id} value={c.codigo}>
                      {c.nome}
                    </option>
                  ))}
                </select>
              </Campo>
              <button className="btn primario" disabled={acao.ocupado || novaChave.nome.trim().length < 3} onClick={() => void criarChave()}>
                Criar chave
              </button>
            </>
          )}
        </Modal>
      )}
    </>
  );
}
