// Supabase Edge Function "api": a API de negócio da instalação.
// Publicação: supabase functions deploy api --no-verify-jwt
// (a própria função valida a sessão, a chave de canal ou o segredo de automação
// conforme a rota; por isso a verificação genérica de JWT do gateway fica desligada.)
import { montarApi } from './src/montar.ts';

declare const Deno: { env: { get(nome: string): string | undefined }; serve(h: (req: Request) => Promise<Response>): void };

const { app } = montarApi((nome) => Deno.env.get(nome));
Deno.serve((req) => app.fetch(req));
