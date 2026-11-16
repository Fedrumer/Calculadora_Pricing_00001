import type postgres from 'postgres';
import type { FuncaoExtensao } from '@pricing/motor';

export type Sql = postgres.Sql<Record<string, unknown>>;
export type Tx = postgres.TransactionSql<Record<string, unknown>>;
/** Conexão ou transação: os dois aceitam consultas com template. */
export type Db = Sql | Tx;

export type Papel = 'admin' | 'gestor_pricing' | 'aprovador' | 'vendedor' | 'canal' | 'leitura' | 'suporte';

export const PAPEIS_INTERNOS: Papel[] = ['admin', 'gestor_pricing', 'aprovador', 'leitura', 'suporte'];

export interface VinculoPapel {
  papel: Papel;
  unidadeId: string | null;
  canalId: string | null;
  exigeMfa: boolean;
}

export interface Ator {
  tipo: 'usuario' | 'chave_api' | 'automacao';
  id: string | null;
  orgId: string;
  nome: string;
  papeis: VinculoPapel[];
  aal: 'aal1' | 'aal2';
  limiteAlcada: number | null;
  /** Preenchido quando a chamada vem de integração de canal. */
  chave?: { id: string; canalId: string | null; escopos: string[]; limitePorMinuto: number };
  ip: string | null;
}

/** Identidade extraída de um token de sessão já validado. */
export interface Identidade {
  usuarioId: string;
  aal: 'aal1' | 'aal2';
}

export interface ServicoAuth {
  /** Valida o token de sessão junto ao serviço de autenticação. */
  verificar(token: string): Promise<Identidade | null>;
  /** Cria o usuário de autenticação no aceite do convite. */
  criarUsuario(dados: { email: string; senha: string; nome: string }): Promise<{ id: string }>;
  /** Bloqueia ou libera o login (desativação, suspensão, reativação). */
  definirBloqueio(usuarioId: string, bloqueado: boolean): Promise<void>;
}

export interface Armazenamento {
  salvar(bucket: string, caminho: string, conteudo: Uint8Array, tipo: string): Promise<void>;
  /** Link assinado de curta duração. */
  urlAssinada(bucket: string, caminho: string, segundos: number): Promise<string>;
}

export interface ServicoIA {
  disponivel: boolean;
  modelo: string;
  /** Devolve o texto da resposta e o consumo. Só o servidor chama. */
  gerar(pedido: { sistema: string; mensagem: string; maxTokens?: number; esquema?: Record<string, unknown> }): Promise<{
    texto: string;
    tokensEntrada?: number;
    tokensSaida?: number;
  }>;
}

export interface Configuracao {
  ambiente: 'producao' | 'homologacao' | 'demonstracao' | 'local';
  /** Endereço público do frontend (links de convite, CORS). */
  urlAplicacao: string;
  origensPermitidas: string[];
  /** Segredo do HMAC de documentos e tokens; e chave da cifra de coluna. */
  segredoHash: string;
  chaveCifra: string;
  /** Credencial própria do n8n para as rotas de automação. */
  segredoAutomacao: string | null;
  /** Webhook do n8n que recebe os eventos de saída (opcional). */
  n8nWebhookUrl: string | null;
  fusoHorario: string;
}

export interface Deps {
  sql: Sql;
  auth: ServicoAuth;
  armazenamento: Armazenamento;
  ia: ServicoIA;
  config: Configuracao;
  extensoes: Record<string, FuncaoExtensao>;
  agora(): Date;
  /** Busca HTTP (injetável nos testes). */
  buscar: typeof fetch;
}

export function temPapel(ator: Ator, ...papeis: Papel[]): boolean {
  return ator.papeis.some((p) => papeis.includes(p.papel));
}

export function ehInterno(ator: Ator): boolean {
  return temPapel(ator, ...PAPEIS_INTERNOS);
}

/** Perfil externo: enxerga só preço final e a própria comissão. */
export function ehExterno(ator: Ator): boolean {
  return ator.tipo === 'chave_api' || (!ehInterno(ator) && !temPapel(ator, 'vendedor'));
}

export function canaisDoAtor(ator: Ator): string[] {
  if (ator.chave) return ator.chave.canalId ? [ator.chave.canalId] : [];
  return ator.papeis.filter((p) => p.papel === 'canal' && p.canalId).map((p) => p.canalId as string);
}

/** Data de hoje (AAAA-MM-DD) no fuso da instalação. */
export function hoje(deps: Deps): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: deps.config.fusoHorario, year: 'numeric', month: '2-digit', day: '2-digit' }).format(
    deps.agora(),
  );
}

export function somarDias(dataIso: string, dias: number): string {
  const d = new Date(`${dataIso}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + dias);
  return d.toISOString().slice(0, 10);
}
