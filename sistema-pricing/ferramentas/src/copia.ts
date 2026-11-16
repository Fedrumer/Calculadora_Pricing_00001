import { execFileSync, spawnSync } from 'node:child_process';
import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from 'node:crypto';
import { cpSync, existsSync, mkdirSync, readFileSync, readdirSync, statSync, unlinkSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { gunzipSync, gzipSync } from 'node:zlib';
import { type Sql, conectar } from './banco.ts';

const MAGICO = Buffer.from('PRCBKP1');

/** Cifra AES-256-GCM com chave derivada da senha (scrypt). Formato: mágico | sal | iv | tag | dados. */
export function cifrar(dados: Buffer, senha: string): Buffer {
  const sal = randomBytes(16);
  const iv = randomBytes(12);
  const c = createCipheriv('aes-256-gcm', scryptSync(senha, sal, 32), iv);
  const corpo = Buffer.concat([c.update(dados), c.final()]);
  return Buffer.concat([MAGICO, sal, iv, c.getAuthTag(), corpo]);
}

export function decifrar(pacote: Buffer, senha: string): Buffer {
  if (!pacote.subarray(0, 7).equals(MAGICO)) throw new Error('Arquivo de cópia em formato desconhecido.');
  const d = createDecipheriv('aes-256-gcm', scryptSync(senha, pacote.subarray(7, 23), 32), pacote.subarray(23, 35));
  d.setAuthTag(pacote.subarray(35, 51));
  return Buffer.concat([d.update(pacote.subarray(51)), d.final()]);
}

const ESQUEMAS = ['public', 'app'];

/**
 * Camada 3 de preservação: exportação lógica do banco e dos arquivos, cifrada,
 * para um destino do próprio cliente fora do provedor do banco. O destino aqui
 * é uma pasta (um volume montado, um bucket sincronizado por rclone ou aws s3 sync).
 */
export function copiaExterna(o: { urlBanco: string; destino: string; senha: string; pastaArquivos?: string; manterDiarias?: number; manterMensais?: number }) {
  if (o.senha.length < 16) throw new Error('A senha da cópia precisa de pelo menos 16 caracteres.');
  const inicio = Date.now();
  mkdirSync(o.destino, { recursive: true });
  const carimbo = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  // Os usuários vivem no esquema de autenticação do Supabase: sem eles as chaves
  // de public.usuarios não fecham. Vão só os dados, das tabelas que existirem.
  const existentes = execFileSync('psql', ['--dbname', o.urlBanco, '-Atc', "select tablename from pg_tables where schemaname = 'auth' and tablename in ('users', 'identities', 'mfa_factors')"]).toString().split('\n').filter(Boolean);
  const auth = existentes.length
    ? execFileSync('pg_dump', ['--data-only', '--no-owner', '--no-privileges', ...existentes.flatMap((t) => ['--table', `auth.${t}`]), '--dbname', o.urlBanco], { maxBuffer: 2 ** 31 - 1 })
    : Buffer.alloc(0);
  const publico = execFileSync('pg_dump', ['--no-owner', '--no-privileges', ...ESQUEMAS.flatMap((s) => ['--schema', s]), '--dbname', o.urlBanco], { maxBuffer: 2 ** 31 - 1 });
  const dump = Buffer.concat([auth, Buffer.from('\n'), publico]);
  const arquivo = join(o.destino, `banco-${carimbo}.sql.gz.enc`);
  writeFileSync(arquivo, cifrar(gzipSync(dump), o.senha));

  // Os arquivos do Storage (PDFs de proposta) não entram no backup do banco: têm cópia própria.
  let arquivos = 0;
  if (o.pastaArquivos && existsSync(o.pastaArquivos)) {
    const alvo = join(o.destino, 'arquivos');
    cpSync(o.pastaArquivos, alvo, { recursive: true });
    const contar = (p: string): number => readdirSync(p, { withFileTypes: true }).reduce((n, e) => n + (e.isDirectory() ? contar(join(p, e.name)) : 1), 0);
    arquivos = contar(alvo);
  }

  // Rotação: 35 diárias e 12 mensais (a primeira cópia de cada mês).
  const copias = readdirSync(o.destino).filter((f) => /^banco-.*\.sql\.gz\.enc$/.test(f)).sort().reverse();
  const manter = new Set(copias.slice(0, o.manterDiarias ?? 35));
  const meses = new Map<string, string>();
  for (const f of [...copias].reverse()) if (!meses.has(f.slice(6, 13))) meses.set(f.slice(6, 13), f);
  [...meses.values()].slice(-(o.manterMensais ?? 12)).forEach((f) => manter.add(f));
  const removidas = copias.filter((f) => !manter.has(f));
  removidas.forEach((f) => unlinkSync(join(o.destino, f)));

  return { arquivo, tamanhoBytes: statSync(arquivo).size, duracaoSegundos: (Date.now() - inicio) / 1000, arquivosCopiados: arquivos, copiasRemovidas: removidas.length };
}

/**
 * Teste de restauração: restaura a cópia em um banco temporário e confere por
 * contagem de registros e pelo recálculo de uma amostra de cotações.
 * Backup não testado não conta.
 */
export async function testeRestauracao(o: { arquivo: string; senha: string; urlBancoTemporario: string; urlBancoOrigem?: string; preparar: (url: string) => Promise<void>; recalcular: (sql: Sql) => Promise<{ conferidas: number; divergentes: number }> }) {
  const inicio = Date.now();
  const sqlTexto = gunzipSync(decifrar(readFileSync(o.arquivo), o.senha));
  await o.preparar(o.urlBancoTemporario);
  const r = spawnSync('psql', ['--quiet', '--set', 'ON_ERROR_STOP=1', '--dbname', o.urlBancoTemporario], { input: sqlTexto, maxBuffer: 2 ** 31 - 1 });
  if (r.status !== 0) throw new Error(`A restauração falhou: ${r.stderr.toString().slice(0, 2000)}`);

  const TABELAS = ['organizacoes', 'usuarios', 'produtos', 'tabelas_preco', 'itens_tabela', 'politicas', 'cotacoes', 'cotacao_versoes', 'aprovacoes', 'eventos_auditoria'];
  const contar = async (url: string) => {
    const sql = conectar(url, 1);
    try {
      const saida: Record<string, number> = {};
      for (const t of TABELAS) saida[t] = Number((await sql.unsafe(`select count(*)::int as n from public.${t}`))[0]!.n);
      return saida;
    } finally {
      await sql.end();
    }
  };
  const restaurado = await contar(o.urlBancoTemporario);
  const origem = o.urlBancoOrigem ? await contar(o.urlBancoOrigem) : null;
  // a origem segue viva: só podem ter aparecido registros depois da cópia
  const faltando = origem ? TABELAS.filter((t) => restaurado[t]! > origem[t]! || (restaurado[t] === 0 && origem[t]! > 0)) : [];

  const sql = conectar(o.urlBancoTemporario, 1);
  let amostra;
  try {
    amostra = await o.recalcular(sql);
  } finally {
    await sql.end();
  }
  const ok = faltando.length === 0 && amostra.divergentes === 0 && restaurado.cotacao_versoes! >= 0;
  return { ok, duracaoSegundos: (Date.now() - inicio) / 1000, contagens: restaurado, tabelasDivergentes: faltando, amostra };
}
