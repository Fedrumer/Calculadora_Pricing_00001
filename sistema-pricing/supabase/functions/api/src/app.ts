import { ErroMotor } from '@pricing/motor';
import { ZodError, type ZodTypeAny, type z } from 'zod';
import { autenticarAutomacao, autenticarChave, autenticarUsuario } from './auth.ts';
import { type Ator, type Deps, type Papel, type Tx, temPapel } from './contexto.ts';
import { ErroHttp, invalido, naoAutenticado, proibido } from './erros.ts';

export interface Requisicao {
  deps: Deps;
  /** Transação da requisição; o contexto de auditoria já está definido nela. */
  tx: Tx;
  ator: Ator;
  req: Request;
  url: URL;
  params: Record<string, string>;
  corpo: unknown;
  /** Enfileira um evento de saída (avisos e integrações pelo n8n). */
  emitir(tipo: string, carga: Record<string, unknown>): Promise<void>;
  /** Registra um evento de negócio na trilha de auditoria. */
  auditar(acao: string, tabela: string, registroId: string, extra?: { anterior?: unknown; novo?: unknown; resumo?: string; contexto?: Record<string, unknown> }): Promise<void>;
}

export interface Resposta {
  status?: number;
  corpo: unknown;
}

export type TipoAuth = 'usuario' | 'publica' | 'chave' | 'automacao';

export interface Rota {
  metodo: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  caminho: string;
  auth: TipoAuth;
  /** Perfis aceitos (rotas de usuário). Vazio = qualquer usuário ativo. */
  papeis?: Papel[];
  handler(r: Requisicao): Promise<Resposta>;
}

interface RotaCompilada extends Rota {
  regex: RegExp;
  nomes: string[];
}

const ATOR_ANONIMO = (orgId: string, ip: string | null): Ator => ({
  tipo: 'automacao', id: null, orgId, nome: 'público', papeis: [], aal: 'aal1', limiteAlcada: null, ip,
});

export function validar<T extends ZodTypeAny>(esquema: T, valor: unknown): z.infer<T> {
  const r = esquema.safeParse(valor);
  if (!r.success) {
    throw invalido(
      'Os dados enviados são inválidos.',
      r.error.issues.map((i) => ({ campo: i.path.join('.'), mensagem: i.message })),
    );
  }
  return r.data;
}

function compilar(rota: Rota): RotaCompilada {
  const nomes: string[] = [];
  const regex = new RegExp(
    `^${rota.caminho.replace(/:[a-zA-Z]+/g, (m) => {
      nomes.push(m.slice(1));
      return '([^/]+)';
    })}/?$`,
  );
  return { ...rota, regex, nomes };
}

function ipDe(req: Request): string | null {
  const bruto = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? req.headers.get('x-real-ip');
  return bruto && /^[0-9a-fA-F:.]{3,45}$/.test(bruto) ? bruto : null;
}

const json = (status: number, corpo: unknown, cabecalhos: Record<string, string> = {}) =>
  new Response(JSON.stringify(corpo), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', 'x-content-type-options': 'nosniff', ...cabecalhos },
  });

export function criarApp(deps: Deps, rotas: Rota[]) {
  const compiladas = rotas.map(compilar);

  function cors(req: Request): Record<string, string> {
    const origem = req.headers.get('origin');
    if (!origem || !deps.config.origensPermitidas.includes(origem)) return {};
    return {
      'access-control-allow-origin': origem,
      vary: 'Origin',
      'access-control-allow-headers': 'authorization, content-type, idempotency-key, x-api-key, x-client-info, apikey',
      'access-control-allow-methods': 'GET, POST, PUT, PATCH, DELETE, OPTIONS',
      'access-control-max-age': '600',
    };
  }

  async function tratar(req: Request): Promise<Response> {
    const inicio = performance.now();
    const url = new URL(req.url);
    const caminho = url.pathname.replace(/^\/functions\/v1/, '').replace(/^\/api(?=\/|$)/, '') || '/';
    const cabCors = cors(req);
    if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: cabCors });

    let rota: RotaCompilada | undefined;
    let params: Record<string, string> = {};
    for (const r of compiladas) {
      if (r.metodo !== req.method) continue;
      const m = r.regex.exec(caminho);
      if (m) {
        rota = r;
        params = Object.fromEntries(r.nomes.map((n, i) => [n, decodeURIComponent(m[i + 1] ?? '')]));
        break;
      }
    }
    const rotulo = rota ? `${rota.metodo} ${rota.caminho}` : `${req.method} (desconhecida)`;
    let status = 500;
    let orgMetrica: string | null = null;
    let resposta: Response;

    try {
      if (!rota) throw new ErroHttp(404, 'ROTA_DESCONHECIDA', 'Rota não encontrada.');
      const ip = ipDe(req);

      let corpo: unknown = undefined;
      if (req.method !== 'GET' && req.method !== 'DELETE') {
        const texto = await req.text();
        if (texto.length > 2_000_000) throw new ErroHttp(413, 'CORPO_GRANDE', 'Requisição grande demais.');
        if (texto) {
          try {
            corpo = JSON.parse(texto);
          } catch {
            throw invalido('O corpo da requisição não é um JSON válido.');
          }
        }
      }

      const ator = await autenticar(rota, req, ip);
      orgMetrica = ator.orgId || null;
      const chaveIdem = req.method !== 'GET' ? req.headers.get('idempotency-key') : null;
      if (chaveIdem && !/^[\w.:-]{8,120}$/.test(chaveIdem)) throw invalido('Chave de idempotência inválida.');
      const pendentes: { tipo: string; carga: Record<string, unknown> }[] = [];

      const r = await deps.sql.begin(async (tx): Promise<Resposta> => {
        await tx`select set_config('app.ator_id', ${ator.tipo === 'usuario' ? ator.id : ''}, true),
                        set_config('app.ator_tipo', ${ator.tipo === 'usuario' ? 'usuario' : ator.tipo === 'chave_api' ? 'chave_api' : rota!.auth === 'automacao' ? 'automacao' : 'sistema'}, true),
                        set_config('app.ip', ${ip ?? ''}, true),
                        set_config('app.contexto', ${JSON.stringify({ rota: rotulo, chave: ator.chave?.id })}, true)`;

        const identificador = ator.chave?.id ?? ator.id ?? `ip:${ip ?? 'desconhecido'}`;
        const limite = ator.chave?.limitePorMinuto ?? (rota!.auth === 'publica' ? 30 : rota!.auth === 'automacao' ? 600 : 240);
        const [lim] = await tx<{ ok: boolean }[]>`select app.consumir_limite(${`${rota!.auth}:${identificador}`}, ${limite}) as ok`;
        if (!lim?.ok) throw new ErroHttp(429, 'LIMITE_DE_REQUISICOES', 'Muitas requisições; tente de novo em um minuto.');

        const atorIdem = ator.chave?.id ?? ator.id ?? 'publico';
        if (chaveIdem && ator.orgId) {
          const nova = await tx`
            insert into public.idempotencia (org_id, chave, rota, ator, status, resposta)
            values (${ator.orgId}, ${chaveIdem}, ${rotulo}, ${atorIdem}, 0, '{}'::jsonb)
            on conflict do nothing returning chave`;
          if (nova.length === 0) {
            const [salva] = await tx<{ status: number; resposta: unknown }[]>`
              select status, resposta from public.idempotencia
              where org_id = ${ator.orgId} and chave = ${chaveIdem} and rota = ${rotulo} and ator = ${atorIdem}`;
            if (salva && salva.status > 0) return { status: salva.status, corpo: salva.resposta };
            throw new ErroHttp(409, 'REQUISICAO_EM_ANDAMENTO', 'Uma requisição com esta chave de idempotência ainda está em andamento.');
          }
        }

        const requisicao: Requisicao = {
          deps, tx, ator, req, url, params, corpo,
          async emitir(tipo, carga) {
            await tx`insert into public.eventos_saida (org_id, tipo, carga) values (${ator.orgId}, ${tipo}, ${tx.json(carga as never)})`;
            pendentes.push({ tipo, carga });
          },
          async auditar(acao, tabela, registroId, extra = {}) {
            const contexto = { ...(extra.contexto ?? {}), ...(extra.resumo ? { resumo: extra.resumo } : {}), rota: rotulo };
            await tx`select app.registrar_evento(${ator.orgId}, ${acao}, ${tabela}, ${registroId},
              ${extra.anterior === undefined ? null : tx.json(extra.anterior as never)},
              ${extra.novo === undefined ? null : tx.json(extra.novo as never)}, ${tx.json(contexto as never)})`;
          },
        };
        const saida = await rota!.handler(requisicao);
        if (chaveIdem && ator.orgId) {
          await tx`update public.idempotencia set status = ${saida.status ?? 200}, resposta = ${tx.json((saida.corpo ?? null) as never)}
                   where org_id = ${ator.orgId} and chave = ${chaveIdem} and rota = ${rotulo} and ator = ${atorIdem}`;
        }
        return saida;
      });

      status = r.status ?? 200;
      resposta = json(status, r.corpo, cabCors);
      if (pendentes.length > 0) void avisarN8n(pendentes, ator.orgId);
    } catch (e) {
      const erro = traduzirErro(e);
      status = erro.status;
      if (erro.codigo === 'ERRO_INTERNO') console.error(`[api] ${rotulo}`, e);
      resposta = json(status, { erro: { codigo: erro.codigo, mensagem: erro.message, detalhes: erro.detalhes } }, cabCors);
    }

    const duracao = performance.now() - inicio;
    resposta.headers.set('server-timing', `total;dur=${duracao.toFixed(1)}`);
    if (rota) {
      deps.sql`insert into public.metricas_api (org_id, rota, status, duracao_ms) values (${orgMetrica}, ${rotulo}, ${status}, ${duracao.toFixed(2)})`.catch(
        () => undefined,
      );
    }
    return resposta;
  }

  async function autenticar(rota: Rota, req: Request, ip: string | null): Promise<Ator> {
    const autorizacao = req.headers.get('authorization') ?? '';
    const token = autorizacao.toLowerCase().startsWith('bearer ') ? autorizacao.slice(7).trim() : '';

    if (rota.auth === 'publica') {
      const [org] = await deps.sql<{ id: string }[]>`select id from public.organizacoes order by criado_em limit 1`;
      return ATOR_ANONIMO(org?.id ?? '', ip);
    }
    if (rota.auth === 'automacao') return autenticarAutomacao(deps, req, ip);
    if (rota.auth === 'chave') {
      const chave = req.headers.get('x-api-key') ?? token;
      if (!chave) throw naoAutenticado('Informe a chave de API.');
      return autenticarChave(deps, chave, ip);
    }

    if (!token) throw naoAutenticado();
    const ator = await autenticarUsuario(deps, token, ip);
    if (ator.aal !== 'aal2' && ator.papeis.some((p) => p.exigeMfa)) {
      throw proibido('Seu perfil exige o segundo fator de autenticação nesta sessão.', 'MFA_OBRIGATORIO');
    }
    if (rota.papeis && rota.papeis.length > 0 && !temPapel(ator, ...rota.papeis)) throw proibido();
    return ator;
  }

  /** Entrega best-effort ao n8n. Se falhar, o evento continua na caixa de saída. */
  async function avisarN8n(eventos: { tipo: string; carga: Record<string, unknown> }[], orgId: string) {
    const destino = deps.config.n8nWebhookUrl;
    if (!destino) return;
    try {
      await deps.buscar(destino, {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-automacao-segredo': deps.config.segredoAutomacao ?? '' },
        body: JSON.stringify({ orgId, eventos }),
        signal: AbortSignal.timeout(4000),
      });
    } catch {
      // fora do caminho crítico: o n8n busca os pendentes em /automacao/eventos
    }
  }

  return { fetch: tratar };
}

function traduzirErro(e: unknown): ErroHttp {
  if (e instanceof ErroHttp) return e;
  if (e instanceof ErroMotor) return new ErroHttp(422, e.codigo, e.message, e.detalhes);
  if (e instanceof ZodError) return invalido('Os dados enviados são inválidos.', e.issues);
  const pg = e as { code?: string; message?: string; constraint_name?: string };
  if (pg?.code === 'P0001') return new ErroHttp(409, 'REGRA_DE_INTEGRIDADE', pg.message ?? 'Operação recusada pelo banco.');
  if (pg?.code === '23P01') return new ErroHttp(409, 'VIGENCIA_SOBREPOSTA', 'Já existe uma versão publicada vigente nesse período.');
  if (pg?.code === '23505') return new ErroHttp(409, 'DUPLICADO', 'Já existe um registro com esses dados.', { restricao: pg.constraint_name });
  if (pg?.code === '23503') return new ErroHttp(409, 'REFERENCIA_INVALIDA', 'O registro referencia algo que não existe.', { restricao: pg.constraint_name });
  if (pg?.code === '23514') return new ErroHttp(422, 'RESTRICAO_VIOLADA', 'Os dados violam uma restrição do banco.', { restricao: pg.constraint_name });
  return new ErroHttp(500, 'ERRO_INTERNO', 'Erro interno. A ocorrência foi registrada.');
}
