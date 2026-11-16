// Instala uma organização em um projeto Supabase a partir do arquivo de configuração.
//
//   SUPABASE_DB_URL=... pnpm instalar -- --config cliente.json
//   ... --usuarios   cria também os usuários da configuração (demonstração); exige SUPABASE_URL,
//                    SUPABASE_SERVICE_ROLE_KEY e DEMO_SENHA
//   ... --historico  gera os 12 meses de dados sintéticos (só demonstração)
//
// Em cliente real os usuários entram por convite: instale sem --usuarios e crie o
// primeiro administrador com --admin email@cliente.com (ele recebe um link de convite).
import { sha256, tokenAleatorio } from '../../../supabase/functions/api/src/cripto.ts';
import { arg, exigir, lerConfig } from '../apoio.ts';
import { conectar } from '../banco.ts';
import { gerarHistorico } from '../demo.ts';
import { instalar } from '../instalar.ts';

const config = lerConfig(arg('config') ?? (console.error('Informe --config <arquivo>.'), process.exit(2)));
const sql = conectar(exigir('SUPABASE_DB_URL'), 2);
const comUsuarios = arg('usuarios') !== undefined;

let criarUsuarioAuth;
if (comUsuarios) {
  const url = exigir('SUPABASE_URL').replace(/\/$/, '');
  const chave = exigir('SUPABASE_SERVICE_ROLE_KEY');
  const senha = exigir('DEMO_SENHA');
  criarUsuarioAuth = async ({ email, nome }: { email: string; nome: string }) => {
    const r = await fetch(`${url}/auth/v1/admin/users`, { method: 'POST', headers: { apikey: chave, authorization: `Bearer ${chave}`, 'content-type': 'application/json' }, body: JSON.stringify({ email, password: senha, email_confirm: true, user_metadata: { nome } }) });
    const corpo = (await r.json()) as { id?: string; msg?: string };
    if (!r.ok || !corpo.id) throw new Error(`Não foi possível criar ${email}: ${corpo.msg ?? r.status}`);
    return corpo.id;
  };
}

try {
  const existentes = await sql`select 1 from public.organizacoes limit 1`;
  if (existentes.length > 0) throw new Error('Esta instalação já tem uma organização. Cada cliente tem a própria instalação; para refazer a demonstração use demo:repor.');
  const r = await instalar(sql, config, { criarUsuarioAuth });
  console.log(`Instalada: ${config.organizacao.nome}. ${r.casosReferencia} casos de referência conferidos.`);
  for (const a of r.avisos) console.log(`Aviso: ${a}`);

  const admin = arg('admin');
  if (admin) {
    // primeiro administrador: convite de uso único, gravado direto (ainda não há quem convide)
    const token = tokenAleatorio(32);
    await sql`select set_config('app.ator_tipo', 'consultoria', false)`;
    const [c] = await sql<{ expira_em: Date }[]>`
      insert into public.convites (org_id, email, papel, token_hash, expira_em, convidado_por)
      select ${r.orgId}, ${admin.toLowerCase()}, 'admin', ${await sha256(token)}, now() + interval '72 hours', null
      returning expira_em`;
    console.log(`Convite do primeiro administrador (${admin}), válido até ${c!.expira_em.toISOString()}:\n  ${(process.env.URL_APLICACAO ?? 'https://SEU-DOMINIO').replace(/\/$/, '')}/convite?token=${token}`);
  }
  if (arg('historico') !== undefined) {
    const h = await gerarHistorico(sql, r.orgId, config);
    console.log(`Histórico sintético: ${h.cotacoes} cotações, ${h.aprovacoes} pedidos de exceção.`);
  }
} catch (e) {
  console.error((e as Error).message);
  process.exitCode = 1;
} finally {
  await sql.end();
}
