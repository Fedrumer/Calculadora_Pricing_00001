// Reposição da demonstração: volta os dados ao estado inicial (toda noite, e por
// comando antes de cada reunião). Apaga TUDO da instalação e reinstala.
// Só roda se a organização instalada for a mesma do arquivo de configuração e
// se AMBIENTE=demonstracao: nunca aponte para a instalação de um cliente.
import { arg, exigir, lerConfig, limparTudo } from '../apoio.ts';
import { conectar } from '../banco.ts';
import { gerarHistorico } from '../demo.ts';
import { instalar } from '../instalar.ts';

if (process.env.AMBIENTE !== 'demonstracao') {
  console.error('Recusado: defina AMBIENTE=demonstracao para confirmar que este é o ambiente de demonstração.');
  process.exit(2);
}
const config = lerConfig(arg('config', 'demo-turismo.json')!);
const sql = conectar(exigir('SUPABASE_DB_URL'), 2);
const url = exigir('SUPABASE_URL').replace(/\/$/, '');
const chave = exigir('SUPABASE_SERVICE_ROLE_KEY');
const senha = exigir('DEMO_SENHA');
const inicio = Date.now();

try {
  const orgs = await sql<{ slug: string }[]>`select slug from public.organizacoes`;
  if (orgs.some((o) => o.slug !== config.organizacao.slug)) throw new Error(`Recusado: a instalação tem a organização "${orgs[0]!.slug}", diferente da demonstração "${config.organizacao.slug}".`);
  await limparTudo(sql, (config.usuarios ?? []).map((u) => u.email));
  const r = await instalar(sql, config, {
    criarUsuarioAuth: async ({ email, nome }) => {
      const resp = await fetch(`${url}/auth/v1/admin/users`, { method: 'POST', headers: { apikey: chave, authorization: `Bearer ${chave}`, 'content-type': 'application/json' }, body: JSON.stringify({ email, password: senha, email_confirm: true, user_metadata: { nome } }) });
      const corpo = (await resp.json()) as { id?: string; msg?: string };
      if (!resp.ok || !corpo.id) throw new Error(`Não foi possível criar ${email}: ${corpo.msg ?? resp.status}`);
      return corpo.id;
    },
  });
  const h = await gerarHistorico(sql, r.orgId, config);
  const duracao = (Date.now() - inicio) / 1000;
  await sql`insert into public.registros_backup (org_id, tipo, status, duracao_segundos, detalhes) values (${r.orgId}, 'reposicao_demo', 'ok', ${duracao}, ${sql.json(h as never)})`;
  console.log(`Demonstração reposta em ${duracao.toFixed(1)} s: ${h.cotacoes} cotações sintéticas.`);
} catch (e) {
  console.error((e as Error).message);
  process.exitCode = 1;
} finally {
  await sql.end();
}
