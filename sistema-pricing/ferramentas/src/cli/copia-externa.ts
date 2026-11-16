// Cópia externa noturna (camada 3): banco e arquivos, cifrados, para o destino do cliente.
//   SUPABASE_DB_URL=... COPIA_SENHA=... COPIA_DESTINO=/mnt/copias pnpm --filter @pricing/ferramentas copia
// Registre o resultado em /automacao/registro-backup (o fluxo do n8n faz isso) ou passe --registrar.
import { arg, exigir } from '../apoio.ts';
import { conectar } from '../banco.ts';
import { copiaExterna } from '../copia.ts';

const urlBanco = exigir('SUPABASE_DB_URL');
let resultado: ReturnType<typeof copiaExterna> | null = null;
let erro: string | null = null;
try {
  resultado = copiaExterna({ urlBanco, destino: exigir('COPIA_DESTINO'), senha: exigir('COPIA_SENHA'), pastaArquivos: process.env.COPIA_PASTA_ARQUIVOS });
  console.log(JSON.stringify({ status: 'ok', ...resultado }));
} catch (e) {
  erro = (e as Error).message;
  console.error(JSON.stringify({ status: 'falha', erro }));
  process.exitCode = 1;
}
if (arg('registrar') !== undefined) {
  const sql = conectar(urlBanco, 1);
  await sql`insert into public.registros_backup (org_id, tipo, status, duracao_segundos, tamanho_bytes, destino, detalhes)
            select id, 'copia_externa', ${erro ? 'falha' : 'ok'}, ${resultado?.duracaoSegundos ?? null}, ${resultado?.tamanhoBytes ?? null}, ${resultado?.arquivo ?? null}, ${sql.json({ erro } as never)}
            from public.organizacoes order by criado_em limit 1`;
  await sql.end();
}
