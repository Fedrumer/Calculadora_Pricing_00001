/** Erro com status HTTP e código estável, devolvido ao cliente em JSON. */
export class ErroHttp extends Error {
  constructor(
    readonly status: number,
    readonly codigo: string,
    mensagem: string,
    readonly detalhes?: unknown,
  ) {
    super(mensagem);
    this.name = 'ErroHttp';
  }
}

export const naoAutenticado = (m = 'Sessão inválida ou expirada.') => new ErroHttp(401, 'NAO_AUTENTICADO', m);
export const proibido = (m = 'Seu perfil não permite esta operação.', codigo = 'PROIBIDO') => new ErroHttp(403, codigo, m);
export const naoEncontrado = (m = 'Registro não encontrado.') => new ErroHttp(404, 'NAO_ENCONTRADO', m);
export const conflito = (m: string, codigo = 'CONFLITO', detalhes?: unknown) => new ErroHttp(409, codigo, m, detalhes);
export const invalido = (m: string, detalhes?: unknown, codigo = 'ENTRADA_INVALIDA') => new ErroHttp(422, codigo, m, detalhes);
