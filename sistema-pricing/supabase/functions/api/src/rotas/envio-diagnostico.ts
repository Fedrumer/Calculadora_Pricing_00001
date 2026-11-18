import { z } from 'zod';
import { type Requisicao, type Resposta, type Rota, validar } from '../app.ts';
import { hoje } from '../contexto.ts';
import { ErroHttp, naoEncontrado } from '../erros.ts';
import { CONTRATO_PACOTE, type ModoConta, type Pacote, codigoPseudonimo, mesAnterior, montarPacote } from '../pacote-diagnostico.ts';

// A10: envio de dados ao diagnóstico. A tela é só do administrador com segundo
// fator; o n8n usa a rota de automação. Desligado por padrão: com o envio
// desligado nada sai, nem pelo n8n, e a tentativa fica na auditoria.

export interface ConfigEnvio {
  ativo: boolean;
  destino: string | null;
  modoConta: ModoConta;
  diaDoMes: number;
}
export const CONFIG_ENVIO_PADRAO: ConfigEnvio = { ativo: false, destino: null, modoConta: 'pseudonimo', diaDoMes: 2 };

const competencia = z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/, 'Competência no formato AAAA-MM.');
const BUCKET = 'diagnostico';

async function configEnvio(r: Requisicao): Promise<ConfigEnvio> {
  const [o] = await r.tx<{ config: { envioDiagnostico?: Partial<ConfigEnvio> } | null }[]>`select config from public.organizacoes where id = ${r.ator.orgId}`;
  return { ...CONFIG_ENVIO_PADRAO, ...(o?.config?.envioDiagnostico ?? {}) };
}

function segredo(r: Requisicao): string {
  const s = r.deps.config.segredoPseudonimo;
  if (!s || s.length < 32) {
    throw new ErroHttp(409, 'SEGREDO_PSEUDONIMO_AUSENTE', 'O segredo de pseudonimização (SEGREDO_PSEUDONIMO) não está configurado no servidor. Sem ele o pacote não é gerado.');
  }
  return s;
}

async function montar(r: Requisicao, comp: string, modoConta: ModoConta): Promise<Pacote> {
  // o recorte vem de visões internas lidas pelo papel de serviço
  return montarPacote(r.tx, { orgId: r.ator.orgId, competencia: comp, segredo: segredo(r), chaveCifra: r.deps.config.chaveCifra, modoConta, agora: r.deps.agora() });
}

async function gerar(r: Requisicao, comp: string, origem: 'tela' | 'automacao') {
  const cfg = await configEnvio(r);
  const p = await montar(r, comp, cfg.modoConta);
  const id = crypto.randomUUID();
  const arquivo = `${r.ator.orgId}/${comp}/${id}.zip`;
  await r.deps.armazenamento.salvar(BUCKET, arquivo, p.zip, 'application/zip');
  await r.tx`
    insert into public.envios_diagnostico (id, org_id, competencia, contrato, modo_conta, arquivo, hash, tamanho_bytes, linhas, origem, acionado_por)
    values (${id}, ${r.ator.orgId}, ${`${comp}-01`}::date, ${CONTRATO_PACOTE}, ${cfg.modoConta}, ${arquivo}, ${p.hash}, ${p.zip.byteLength},
            ${r.tx.json(p.linhas as never)}, ${origem}, ${r.ator.tipo === 'usuario' ? r.ator.id : null})`;
  await r.auditar('diagnostico.pacote_gerado', 'envios_diagnostico', id, {
    resumo: `Pacote do diagnóstico de ${comp} gerado (${p.linhas['transacoes.csv']} transações, ${p.linhas['cotacoes.csv']} cotações).`,
    contexto: { competencia: comp, hash: p.hash, modoConta: cfg.modoConta, origem },
  });
  return { id, competencia: comp, hash: p.hash, linhas: p.linhas, manifesto: p.manifesto };
}

/** Envia um pacote já gerado. Desligado: não sai nada e a tentativa é registrada. */
async function enviar(r: Requisicao, id: string, origem: 'tela' | 'automacao'): Promise<Resposta> {
  const [e] = await r.tx<{ id: string; competencia: string; arquivo: string; hash: string; status: string }[]>`
    select id, to_char(competencia, 'YYYY-MM') as competencia, arquivo, hash, status from public.envios_diagnostico
    where id = ${id} and org_id = ${r.ator.orgId} for update`;
  if (!e) throw naoEncontrado('Pacote não encontrado.');
  const cfg = await configEnvio(r);
  const chave = r.deps.config.chaveEnvioDiagnostico;
  if (!cfg.ativo || !cfg.destino || !chave) {
    const motivo = !cfg.ativo ? 'o envio ao diagnóstico está desligado' : !cfg.destino ? 'não há destino configurado' : 'a chave de envio (CHAVE_ENVIO_DIAGNOSTICO) não está configurada';
    await r.auditar('diagnostico.envio_bloqueado', 'envios_diagnostico', e.id, { resumo: `Envio do pacote de ${e.competencia} não feito: ${motivo}. Nada saiu.`, contexto: { origem } });
    return { status: 409, corpo: { erro: { codigo: !cfg.ativo ? 'ENVIO_DESLIGADO' : 'ENVIO_SEM_DESTINO', mensagem: `Nada foi enviado: ${motivo}.` } } };
  }
  const arquivo = await r.deps.armazenamento.ler?.(BUCKET, e.arquivo);
  if (!arquivo) throw new ErroHttp(502, 'FALHA_NO_ARMAZENAMENTO', 'Não foi possível ler o pacote gerado.');
  let status: 'enviado' | 'falhou' = 'falhou';
  let recibo: unknown = null;
  let erro: string | null = null;
  try {
    const resposta = await r.deps.buscar(cfg.destino, {
      method: 'POST',
      headers: { authorization: `Bearer ${chave}`, 'content-type': 'application/zip', 'x-contrato': CONTRATO_PACOTE, 'x-competencia': e.competencia, 'x-hash': e.hash },
      body: arquivo as BodyInit,
      signal: AbortSignal.timeout(30000),
    });
    const texto = await resposta.text();
    try {
      recibo = JSON.parse(texto);
    } catch {
      recibo = { texto: texto.slice(0, 500) };
    }
    if (resposta.ok) status = 'enviado';
    else erro = `O diagnóstico respondeu ${resposta.status}.`;
  } catch (x) {
    erro = `Falha de conexão com o diagnóstico: ${(x as Error).message}`.slice(0, 300);
  }
  await r.tx`
    update public.envios_diagnostico set status = ${status}, recibo = ${recibo === null ? null : r.tx.json(recibo as never)}, erro = ${erro},
      enviado_em = case when ${status} = 'enviado' then now() else enviado_em end
    where id = ${e.id}`;
  await r.auditar(status === 'enviado' ? 'diagnostico.pacote_enviado' : 'diagnostico.envio_falhou', 'envios_diagnostico', e.id, {
    resumo: status === 'enviado' ? `Pacote de ${e.competencia} enviado ao diagnóstico.` : `Envio do pacote de ${e.competencia} falhou: ${erro}`,
    contexto: { origem, hash: e.hash },
  });
  if (status === 'falhou') await r.emitir('diagnostico.envio_falhou', { envioId: e.id, competencia: e.competencia, erro });
  return { corpo: { id: e.id, competencia: e.competencia, status, recibo, erro } };
}

export const rotasEnvioDiagnostico: Rota[] = [
  {
    metodo: 'GET',
    caminho: '/envio-diagnostico',
    auth: 'usuario',
    papeis: ['admin'],
    async handler(r) {
      const envios = await r.tx`
        select e.id, to_char(e.competencia, 'YYYY-MM') as competencia, e.contrato, e.modo_conta as "modoConta", e.hash, e.tamanho_bytes as "tamanhoBytes",
               e.linhas, e.status, e.recibo, e.erro, e.origem, u.nome as "acionadoPor", e.criado_em as "criadoEm", e.enviado_em as "enviadoEm"
        from public.envios_diagnostico e left join public.usuarios u on u.id = e.acionado_por
        where e.org_id = ${r.ator.orgId} order by e.competencia desc, e.criado_em desc limit 60`;
      return {
        corpo: {
          contrato: CONTRATO_PACOTE,
          config: await configEnvio(r),
          segredoConfigurado: (r.deps.config.segredoPseudonimo ?? '').length >= 32,
          chaveConfigurada: !!r.deps.config.chaveEnvioDiagnostico,
          envios,
        },
      };
    },
  },
  {
    // prévia: monta o pacote em memória e devolve as 10 primeiras linhas de cada arquivo; nada é gravado
    metodo: 'GET',
    caminho: '/envio-diagnostico/previa',
    auth: 'usuario',
    papeis: ['admin'],
    async handler(r) {
      const comp = validar(competencia, r.url.searchParams.get('competencia') ?? mesAnterior(hoje(r.deps)));
      const cfg = await configEnvio(r);
      const p = await montar(r, comp, cfg.modoConta);
      return {
        corpo: {
          competencia: comp,
          manifesto: p.manifesto,
          arquivos: p.arquivos.map((a) => ({ nome: a.nome, cabecalhos: a.cabecalhos, total: a.linhas.length, linhas: a.linhas.slice(0, 10) })),
        },
      };
    },
  },
  {
    metodo: 'POST',
    caminho: '/envio-diagnostico/gerar',
    auth: 'usuario',
    papeis: ['admin'],
    async handler(r) {
      const d = validar(z.object({ competencia }), r.corpo);
      return { status: 201, corpo: await gerar(r, d.competencia, 'tela') };
    },
  },
  {
    metodo: 'GET',
    caminho: '/envio-diagnostico/:id/baixar',
    auth: 'usuario',
    papeis: ['admin'],
    async handler(r) {
      const [e] = await r.tx<{ arquivo: string; competencia: string }[]>`
        select arquivo, to_char(competencia, 'YYYY-MM') as competencia from public.envios_diagnostico where id = ${r.params.id!} and org_id = ${r.ator.orgId}`;
      if (!e) throw naoEncontrado('Pacote não encontrado.');
      await r.auditar('diagnostico.pacote_baixado', 'envios_diagnostico', r.params.id!, { resumo: `Pacote do diagnóstico de ${e.competencia} baixado.` });
      return { corpo: { nome: `pacote-diagnostico-${e.competencia}.zip`, url: await r.deps.armazenamento.urlAssinada(BUCKET, e.arquivo, 300), expiraEmSegundos: 300 } };
    },
  },
  {
    metodo: 'POST',
    caminho: '/envio-diagnostico/:id/enviar',
    auth: 'usuario',
    papeis: ['admin'],
    handler: (r) => enviar(r, r.params.id!, 'tela'),
  },
  {
    // correspondência entre código e vendedor: só na tela do administrador do cliente, nunca no pacote
    metodo: 'GET',
    caminho: '/envio-diagnostico/correspondencia',
    auth: 'usuario',
    papeis: ['admin'],
    async handler(r) {
      const s = segredo(r);
      const usuarios = await r.tx<{ id: string; nome: string }[]>`select id, nome from public.usuarios where org_id = ${r.ator.orgId} order by nome`;
      await r.auditar('diagnostico.correspondencia_consultada', 'organizacoes', r.ator.orgId, { resumo: 'Correspondência entre códigos e vendedores consultada.' });
      return { corpo: { vendedores: await Promise.all(usuarios.map(async (u) => ({ nome: u.nome, codigo: await codigoPseudonimo('V', s, u.id) }))) } };
    },
  },
  {
    // n8n, todo dia: a partir do dia configurado, gera e envia o mês anterior se ainda não foi.
    // Com o envio desligado, não gera nem envia: só registra a tentativa.
    metodo: 'POST',
    caminho: '/automacao/envio-diagnostico',
    auth: 'automacao',
    async handler(r) {
      const d = validar(z.object({ competencia: competencia.optional() }), r.corpo ?? {});
      const hojeIso = hoje(r.deps);
      const comp = d.competencia ?? mesAnterior(hojeIso);
      const cfg = await configEnvio(r);
      if (!cfg.ativo) {
        await r.auditar('diagnostico.envio_bloqueado', 'organizacoes', r.ator.orgId, { resumo: `Envio automático de ${comp} não feito: o envio ao diagnóstico está desligado. Nada saiu.` });
        return { corpo: { acao: 'desligado', competencia: comp } };
      }
      if (!d.competencia && Number(hojeIso.slice(8, 10)) < cfg.diaDoMes) return { corpo: { acao: 'aguardando', competencia: comp, diaDoMes: cfg.diaDoMes } };
      const [ja] = await r.tx<{ id: string }[]>`
        select id from public.envios_diagnostico where org_id = ${r.ator.orgId} and competencia = ${`${comp}-01`}::date and status in ('enviado', 'confirmado') limit 1`;
      if (ja && !d.competencia) return { corpo: { acao: 'ja_enviado', competencia: comp, id: ja.id } };
      const g = await gerar(r, comp, 'automacao');
      const e = await enviar(r, g.id, 'automacao');
      const ok = (e.corpo as { status?: string }).status === 'enviado';
      // quem avisar se não saiu: administradores do cliente e a consultoria (perfil suporte)
      const avisar = ok
        ? []
        : (await r.tx<{ email: string }[]>`
            select distinct u.email from public.usuarios u join public.usuario_papel p on p.usuario_id = u.id
            where u.org_id = ${r.ator.orgId} and u.status = 'ativo' and p.papel in ('admin', 'suporte') order by 1`).map((x) => x.email);
      return { status: e.status ?? 200, corpo: { acao: 'gerado', competencia: comp, envio: e.corpo, avisar } };
    },
  },
];
