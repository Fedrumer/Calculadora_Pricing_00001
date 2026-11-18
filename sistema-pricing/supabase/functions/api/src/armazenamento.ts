import type { Armazenamento } from './contexto.ts';
import { ErroHttp } from './erros.ts';

/** Supabase Storage pela API REST, com a chave de serviço (só no servidor). */
export function armazenamentoSupabase(url: string, chaveServico: string, buscar: typeof fetch = fetch): Armazenamento {
  const base = `${url.replace(/\/$/, '')}/storage/v1`;
  const cab = { apikey: chaveServico, authorization: `Bearer ${chaveServico}` };
  const codificar = (caminho: string) => caminho.split('/').map(encodeURIComponent).join('/');
  return {
    async salvar(bucket, caminho, conteudo, tipo) {
      const r = await buscar(`${base}/object/${bucket}/${codificar(caminho)}`, {
        method: 'POST',
        headers: { ...cab, 'content-type': tipo, 'x-upsert': 'true' },
        body: conteudo as BodyInit,
      });
      if (!r.ok) throw new ErroHttp(502, 'FALHA_NO_ARMAZENAMENTO', `Não foi possível gravar o arquivo (${r.status}).`);
    },
    async urlAssinada(bucket, caminho, segundos) {
      const r = await buscar(`${base}/object/sign/${bucket}/${codificar(caminho)}`, {
        method: 'POST',
        headers: { ...cab, 'content-type': 'application/json' },
        body: JSON.stringify({ expiresIn: segundos }),
      });
      const corpo = (await r.json().catch(() => ({}))) as { signedURL?: string };
      if (!r.ok || !corpo.signedURL) throw new ErroHttp(502, 'FALHA_NO_ARMAZENAMENTO', 'Não foi possível gerar o link do arquivo.');
      return `${base}${corpo.signedURL}`;
    },
    async ler(bucket, caminho) {
      const r = await buscar(`${base}/object/${bucket}/${codificar(caminho)}`, { headers: cab });
      if (r.status === 404 || r.status === 400) return null;
      if (!r.ok) throw new ErroHttp(502, 'FALHA_NO_ARMAZENAMENTO', `Não foi possível ler o arquivo (${r.status}).`);
      return new Uint8Array(await r.arrayBuffer());
    },
  };
}

/** Armazenamento em memória, para testes. */
export function armazenamentoMemoria(): Armazenamento & { arquivos: Map<string, { conteudo: Uint8Array; tipo: string }> } {
  const arquivos = new Map<string, { conteudo: Uint8Array; tipo: string }>();
  return {
    arquivos,
    async salvar(bucket, caminho, conteudo, tipo) {
      arquivos.set(`${bucket}/${caminho}`, { conteudo, tipo });
    },
    async urlAssinada(bucket, caminho, segundos) {
      if (!arquivos.has(`${bucket}/${caminho}`)) throw new ErroHttp(404, 'ARQUIVO_NAO_ENCONTRADO', 'Arquivo não encontrado.');
      return `memoria://${bucket}/${caminho}?expira=${segundos}`;
    },
    async ler(bucket, caminho) {
      return arquivos.get(`${bucket}/${caminho}`)?.conteudo ?? null;
    },
  };
}
