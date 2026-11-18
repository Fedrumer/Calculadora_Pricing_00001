// Sobe o ambiente local completo, sem Docker: banco migrado, emulador do
// Supabase, empresa fictícia instalada, 12 meses de dados sintéticos, cópia
// externa e teste de restauração executados de verdade.
//
//   pnpm local                      (recria o banco e sobe tudo)
//   pnpm local -- --manter          (reaproveita o banco como está)
//   pnpm local -- --config demo-distribuidor.json
import { join } from 'node:path';
import { arg, lerConfig, recalcularAmostra } from '../apoio.ts';
import { RAIZ, conectar, recriarBanco } from '../banco.ts';
import { copiaExterna, testeRestauracao } from '../copia.ts';
import { gerarHistorico } from '../demo.ts';
import { instalar } from '../instalar.ts';
import { iniciarEmulador } from '../local/emulador.ts';

const urlBanco = process.env.DATABASE_URL ?? 'postgresql://pricing:pricing@127.0.0.1:5432/pricing_local';
const porta = Number(arg('porta', '54321'));
const senha = process.env.DEMO_SENHA ?? 'Demonstracao2026';
const config = lerConfig(arg('config', 'demo-turismo.json')!);
const manter = arg('manter') !== undefined;

if (!manter) await recriarBanco(urlBanco);
const sql = conectar(urlBanco, 8);
const emulador = await iniciarEmulador({ sql, urlBanco, porta, urlAplicacao: process.env.URL_APLICACAO ?? 'http://localhost:3000', ambiente: 'demonstracao', chaveAnthropic: process.env.ANTHROPIC_API_KEY });

if (!manter) {
  const instalado = await instalar(sql, config, { criarUsuarioAuth: ({ email, nome }) => emulador.criarUsuario(email, senha, nome) });
  const historico = await gerarHistorico(sql, instalado.orgId, config);
  console.log(`Instalada: ${config.organizacao.nome}. ${historico.cotacoes} cotações sintéticas, ${historico.aprovacoes} pedidos de exceção.`);

  // Cópia externa e teste de restauração de verdade: os números do painel são medidos, não inventados.
  const destino = join(RAIZ, '.local/copias');
  const senhaCopia = 'senha-da-copia-do-ambiente-local';
  const copia = copiaExterna({ urlBanco, destino, senha: senhaCopia, pastaArquivos: join(RAIZ, '.local/storage') });
  await sql`insert into public.registros_backup (org_id, tipo, status, duracao_segundos, tamanho_bytes, destino) values (${instalado.orgId}, 'copia_externa', 'ok', ${copia.duracaoSegundos}, ${copia.tamanhoBytes}, ${copia.arquivo})`;
  const temporario = new URL(urlBanco);
  temporario.pathname = '/pricing_restauracao';
  const teste = await testeRestauracao({ arquivo: copia.arquivo, senha: senhaCopia, urlBancoTemporario: temporario.toString(), urlBancoOrigem: urlBanco, preparar: prepararVazio, recalcular: (s) => recalcularAmostra(s) });
  await sql`insert into public.registros_backup (org_id, tipo, status, duracao_segundos, destino, detalhes)
            values (${instalado.orgId}, 'teste_restauracao', ${teste.ok ? 'ok' : 'falha'}, ${teste.duracaoSegundos}, ${copia.arquivo}, ${sql.json({ contagens: teste.contagens, amostra: teste.amostra } as never)})`;
  console.log(`Cópia externa: ${(copia.tamanhoBytes / 1024).toFixed(0)} KB em ${copia.duracaoSegundos.toFixed(1)} s. Restauração ${teste.ok ? 'conferida' : 'COM DIVERGÊNCIA'} em ${teste.duracaoSegundos.toFixed(1)} s (${teste.amostra.conferidas} cotações recalculadas).`);
}

/** O banco temporário recebe só a camada de compatibilidade; o esquema vem da própria cópia. */
async function prepararVazio(url: string) {
  const { readFileSync } = await import('node:fs');
  const alvo = new URL(url);
  const nome = alvo.pathname.slice(1);
  const admin = new URL(url);
  admin.pathname = '/postgres';
  const raiz = conectar(admin.toString(), 1);
  await raiz.unsafe(`drop database if exists ${nome} with (force)`);
  await raiz.unsafe(`create database ${nome}`);
  await raiz.end();
  const s = conectar(url, 1);
  await s.unsafe(readFileSync(join(RAIZ, 'ferramentas/local/compat-supabase.sql'), 'utf8'));
  await s.unsafe('create extension if not exists btree_gist with schema extensions');
  await s.unsafe('drop schema public cascade'); // a cópia traz o esquema public inteiro
  await s.end();
}

console.log(`
Ambiente local no ar.
  Supabase emulado: ${emulador.url}
  Aplicação web:    em outro terminal, rode  pnpm dev:web  com as variáveis abaixo

  NEXT_PUBLIC_SUPABASE_URL=${emulador.url}
  NEXT_PUBLIC_SUPABASE_ANON_KEY=${emulador.anon}
  NEXT_PUBLIC_AMBIENTE=demonstracao

  Acessos (senha: ${senha}):
${(config.usuarios ?? []).map((u) => `    ${u.email.padEnd(34)} ${u.papeis.map((p) => p.papel).join(', ')}`).join('\n')}

Ctrl+C para encerrar.`);
if (process.send) process.send({ pronto: true, url: emulador.url, anon: emulador.anon });
