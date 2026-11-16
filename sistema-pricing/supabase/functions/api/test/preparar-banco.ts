import { URL_TESTE } from './apoio.ts';
import { recriarBanco } from '../../../../ferramentas/src/banco.ts';

/** Garante que o Postgres de teste responde e que as migrações aplicam do zero. */
export default async function preparar() {
  await recriarBanco(URL_TESTE);
}
