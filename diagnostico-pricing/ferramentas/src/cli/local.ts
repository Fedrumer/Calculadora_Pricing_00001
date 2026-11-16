// Sobe o ambiente local, sem Docker: banco migrado, emulador do Supabase, a empresa fictícia
// já diagnosticada e publicada, e os arquivos dela em .local/arquivos-demo para testar a carga pela tela.
//
//   pnpm local               (recria o banco e sobe tudo)
//   pnpm local -- --manter   (reaproveita o banco como está)
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { criarUsuario, instalarDemo } from '../apoio.ts';
import { RAIZ, conectar, recriarBanco } from '../banco.ts';
import { type Demo, NOMES_ARQUIVO, gerarDemo, paraCsv } from '../demo.ts';
import { iniciarEmulador } from '../emulador.ts';

const urlBanco = process.env.DATABASE_URL ?? 'postgresql://pricing:pricing@127.0.0.1:5432/diagnostico_local';
const porta = Number(process.env.PORTA_EMULADOR ?? 54331);
const senha = process.env.DEMO_SENHA ?? 'Demonstracao2026';
const manter = process.argv.includes('--manter');

if (!manter) await recriarBanco(urlBanco);
const sql = conectar(urlBanco, 8);
const emulador = await iniciarEmulador({ sql, porta });

const pasta = join(RAIZ, '.local/arquivos-demo');
mkdirSync(pasta, { recursive: true });
const demo = gerarDemo();
for (const bloco of Object.keys(demo) as (keyof Demo)[]) writeFileSync(join(pasta, NOMES_ARQUIVO[bloco]), paraCsv(bloco, demo[bloco]));

if (!manter) {
  const consultor = await criarUsuario(sql, { email: 'consultor@demo.local', senha, nome: 'Consultor da demonstração', perfil: 'consultor' });
  const { cliente } = await instalarDemo(sql, consultor, { publicar: true });
  await criarUsuario(sql, { email: 'cliente@demo.local', senha, nome: 'Diretora comercial (cliente)', perfil: 'cliente_leitor', cliente });
  console.log(`Instalada a empresa fictícia: ${demo.transacoes.length} linhas de venda, diagnóstico calculado e publicado.`);
}

console.log(`
Ambiente local no ar.
  Supabase emulado: ${emulador.url}
  Aplicação web:    em outro terminal, rode  pnpm dev:web  com as variáveis abaixo em apps/web/.env.local

  NEXT_PUBLIC_SUPABASE_URL=${emulador.url}
  NEXT_PUBLIC_SUPABASE_ANON_KEY=${emulador.anon}

  Acessos (senha: ${senha}):
    consultor@demo.local   consultor (vê e faz tudo)
    cliente@demo.local     cliente leitor (vê só o painel publicado)

  Arquivos para testar a carga pela tela: ${pasta}

Ctrl+C para encerrar.`);
if (process.send) process.send({ pronto: true, url: emulador.url, anon: emulador.anon, pasta });
