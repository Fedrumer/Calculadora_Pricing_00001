'use client';

import { useEffect, useState } from 'react';
import { Aviso, Campo, Carregando, useAcao, useDados } from '@/componentes/ui';
import { api } from '@/lib/api';
import { dataHora, hojeIso, numero } from '@/lib/formato';
import { useSessao } from '@/lib/sessao';

// A10: envio de dados ao diagnóstico. Só o administrador (com segundo fator)
// vê esta tela. Desligado por padrão: nada sai até ele ligar.

const ROTULO_STATUS: Record<string, string> = { gerado: 'Gerado', enviado: 'Enviado', confirmado: 'Confirmado', falhou: 'Falhou' };
const COR_STATUS: Record<string, string> = { gerado: 'azul', enviado: 'verde', confirmado: 'verde', falhou: 'vermelho' };

function mesAnterior() {
  const [a, m] = hojeIso().split('-').map(Number) as [number, number];
  return new Date(Date.UTC(a, m - 2, 1)).toISOString().slice(0, 7);
}
const nomeMes = (comp: string) =>
  new Intl.DateTimeFormat('pt-BR', { month: 'long', year: 'numeric', timeZone: 'UTC' }).format(new Date(`${comp}-01T12:00:00Z`));

export default function EnvioDiagnostico() {
  const s = useSessao();
  const acao = useAcao();
  const [competencia, setCompetencia] = useState(mesAnterior());
  const [config, setConfig] = useState({ ativo: false, destino: '', modoConta: 'pseudonimo', diaDoMes: 2 });
  const [previa, setPrevia] = useState<any>(null);
  const [correspondencia, setCorrespondencia] = useState<{ nome: string; codigo: string }[] | null>(null);

  const { dados, erro, recarregar } = useDados(async () => (s.tem('admin') ? api('GET', '/envio-diagnostico') : null), []);
  useEffect(() => {
    if (dados?.config) setConfig({ ...dados.config, destino: dados.config.destino ?? '' });
  }, [dados]);

  if (!s.tem('admin')) return <Aviso tipo="atencao">O envio ao diagnóstico é restrito ao administrador.</Aviso>;
  if (erro) return <Aviso tipo="erro">{erro}</Aviso>;
  if (!dados) return <Carregando />;

  const salvar = (ativo: boolean) =>
    acao.executar(
      async () => {
        await api('PUT', '/organizacao/config', { envioDiagnostico: { ...config, ativo, destino: config.destino.trim() || null } });
        await s.recarregar();
        recarregar();
      },
      ativo ? 'Envio ligado. A partir de agora o pacote do mês sai no dia configurado.' : 'Configuração salva.',
    );
  const verPrevia = () => acao.executar(async () => setPrevia(await api('GET', `/envio-diagnostico/previa?competencia=${competencia}`)));
  const gerar = () =>
    acao.executar(async () => {
      const r = await api('POST', '/envio-diagnostico/gerar', { competencia });
      recarregar();
      return r;
    }, `Pacote de ${nomeMes(competencia)} gerado.`);
  const baixar = (id: string) =>
    acao.executar(async () => {
      const r = await api('GET', `/envio-diagnostico/${id}/baixar`);
      window.location.href = r.url;
    });
  const enviar = (id: string) =>
    acao.executar(async () => {
      const r = await api('POST', `/envio-diagnostico/${id}/enviar`);
      recarregar();
      return r;
    }, 'Pacote enviado ao diagnóstico.');
  const verCorrespondencia = () => acao.executar(async () => setCorrespondencia((await api('GET', '/envio-diagnostico/correspondencia')).vendedores));

  return (
    <>
      <div className="cabecalho">
        <div>
          <h1>Envio ao diagnóstico</h1>
          <p>Todo mês, um pacote com os dados das cotações, sem nome, e-mail, documento nem texto livre, no formato que a tela de carga do diagnóstico já lê.</p>
        </div>
      </div>
      <Aviso tipo="erro">{acao.erro}</Aviso>
      <Aviso tipo="ok">{acao.ok}</Aviso>
      {!dados.segredoConfigurado && <Aviso tipo="atencao">O segredo de pseudonimização (SEGREDO_PSEUDONIMO) não está configurado no servidor. Sem ele o pacote não é gerado.</Aviso>}

      <div className="grade g2">
        <div className="cartao" data-testid="envio-config">
          <h2>
            Envio automático{' '}
            <span className={`selo ${config.ativo ? 'verde' : 'amarelo'}`} data-testid="envio-estado">
              {dados.config.ativo ? 'ligado' : 'desligado'}
            </span>
          </h2>
          <p className="sutil">
            Desligado, nada sai do sistema, nem pela automação: o pacote só é baixado aqui. Ligado, sai no dia escolhido para o endereço do diagnóstico, com uma chave que só deposita pacotes. O segredo dos códigos nunca é enviado.
          </p>
          <Campo rotulo="Como o cliente final aparece" dica="Agregado: um único código para todos, para quem vende a pessoa física.">
            <select name="modo-conta" value={config.modoConta} onChange={(e) => setConfig({ ...config, modoConta: e.target.value })}>
              <option value="pseudonimo">Código pseudônimo por cliente (C-…)</option>
              <option value="agregado">Código único agregado</option>
            </select>
          </Campo>
          <div className="linha-campos">
            <Campo rotulo="Dia do mês">
              <input name="dia-do-mes" type="number" min={1} max={28} value={config.diaDoMes} onChange={(e) => setConfig({ ...config, diaDoMes: Number(e.target.value) })} />
            </Campo>
            <Campo rotulo="Endereço do diagnóstico" dica={dados.chaveConfigurada ? 'Chave de envio configurada no servidor.' : 'A chave de envio (CHAVE_ENVIO_DIAGNOSTICO) ainda não está no servidor.'}>
              <input name="destino" placeholder="https://…/functions/v1/receber-pacote" value={config.destino} onChange={(e) => setConfig({ ...config, destino: e.target.value })} />
            </Campo>
          </div>
          <div className="acoes">
            <button className="btn" disabled={acao.ocupado} onClick={() => void salvar(dados.config.ativo)}>
              Salvar
            </button>
            {dados.config.ativo ? (
              <button className="btn" name="desligar-envio" disabled={acao.ocupado} onClick={() => void salvar(false)}>
                Desligar o envio
              </button>
            ) : (
              <button className="btn primario" name="ligar-envio" disabled={acao.ocupado || !config.destino.trim()} onClick={() => void salvar(true)} title={config.destino.trim() ? '' : 'Informe o endereço do diagnóstico'}>
                Ligar o envio
              </button>
            )}
          </div>
        </div>

        <div className="cartao">
          <h2>Pacote de um mês</h2>
          <p className="sutil">Para a carga inicial (um pacote por mês, de 12 a 24 meses) ou para reenviar um mês. Baixado, o consultor carrega os arquivos na tela de carga do diagnóstico.</p>
          <Campo rotulo="Mês de competência">
            <input name="competencia" type="month" value={competencia} max={hojeIso().slice(0, 7)} onChange={(e) => setCompetencia(e.target.value)} />
          </Campo>
          <div className="acoes">
            <button className="btn" name="previa" disabled={acao.ocupado} onClick={() => void verPrevia()}>
              Ver prévia
            </button>
            <button className="btn primario" name="gerar-pacote" disabled={acao.ocupado || !dados.segredoConfigurado} onClick={() => void gerar()}>
              Gerar pacote
            </button>
          </div>
        </div>
      </div>

      {previa && (
        <div className="cartao" data-testid="envio-previa">
          <h2>Prévia de {nomeMes(previa.competencia)}</h2>
          <p className="sutil">
            As 10 primeiras linhas de cada arquivo. Nada foi gravado. Contrato {previa.manifesto.contrato}, instância {previa.manifesto.instancia}.
          </p>
          {previa.arquivos.map((a: any) => (
            <details key={a.nome} open={a.nome === 'transacoes.csv'}>
              <summary>
                <strong>{a.nome}</strong> <span className="sutil">({numero(a.total)} linhas)</span>
              </summary>
              <div className="rolagem">
                <table>
                  <thead>
                    <tr>
                      {a.cabecalhos.map((c: string) => (
                        <th key={c}>{c}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {a.linhas.map((l: any[], i: number) => (
                      <tr key={i}>
                        {l.map((v, j) => (
                          <td key={j} style={{ whiteSpace: 'nowrap' }}>
                            {v ?? ''}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </details>
          ))}
        </div>
      )}

      <div className="cartao" data-testid="envio-historico">
        <h2>Histórico</h2>
        {dados.envios.length === 0 ? (
          <p className="sutil">Nenhum pacote gerado ainda.</p>
        ) : (
          <div className="rolagem">
            <table>
              <thead>
                <tr>
                  <th>Competência</th>
                  <th>Gerado em</th>
                  <th className="num">Transações</th>
                  <th className="num">Cotações</th>
                  <th>Hash</th>
                  <th>Situação</th>
                  <th>Recibo</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {dados.envios.map((e: any) => (
                  <tr key={e.id}>
                    <td>{nomeMes(e.competencia)}</td>
                    <td>
                      {dataHora(e.criadoEm)}
                      <br />
                      <small className="sutil">{e.origem === 'automacao' ? 'automação' : (e.acionadoPor ?? '—')}</small>
                    </td>
                    <td className="num">{numero(e.linhas?.['transacoes.csv'])}</td>
                    <td className="num">{numero(e.linhas?.['cotacoes.csv'])}</td>
                    <td>
                      <code title={e.hash}>{e.hash.slice(0, 12)}…</code>
                    </td>
                    <td>
                      <span className={`selo ${COR_STATUS[e.status] ?? ''}`}>{ROTULO_STATUS[e.status] ?? e.status}</span>
                      {e.erro && <small className="sutil"> {e.erro}</small>}
                    </td>
                    <td>{e.recibo ? <code>{String(e.recibo.recibo ?? e.recibo.id ?? JSON.stringify(e.recibo)).slice(0, 24)}</code> : '—'}</td>
                    <td className="acoes">
                      <button className="btn pequeno" name="baixar-pacote" disabled={acao.ocupado} onClick={() => void baixar(e.id)}>
                        Baixar pacote
                      </button>
                      <button className="btn pequeno" name="enviar-agora" disabled={acao.ocupado} onClick={() => void enviar(e.id)}>
                        Enviar agora
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div className="cartao">
        <h2>Quem é quem</h2>
        <p className="sutil">Os vendedores saem no pacote só como código. Se a reunião precisar nomear alguém, a correspondência fica aqui, na tela do administrador, e nunca vai para o diagnóstico.</p>
        {correspondencia ? (
          <div className="rolagem">
            <table>
              <thead>
                <tr>
                  <th>Usuário</th>
                  <th>Código no pacote</th>
                </tr>
              </thead>
              <tbody>
                {correspondencia.map((v) => (
                  <tr key={v.codigo}>
                    <td>{v.nome}</td>
                    <td>
                      <code>{v.codigo}</code>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <button className="btn" disabled={acao.ocupado || !dados.segredoConfigurado} onClick={() => void verCorrespondencia()}>
            Mostrar a correspondência
          </button>
        )}
      </div>
    </>
  );
}
