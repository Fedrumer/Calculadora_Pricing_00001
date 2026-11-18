export type CodigoErroMotor =
  | 'PRODUTO_DESCONHECIDO'
  | 'PRODUTO_INATIVO'
  | 'COMPONENTE_DESCONHECIDO'
  | 'DIMENSAO_AUSENTE'
  | 'DIMENSAO_INVALIDA'
  | 'SEM_PRECO'
  | 'PRECO_AMBIGUO'
  | 'DESCONTO_INVALIDO'
  | 'COMISSAO_INVALIDA'
  | 'POLITICA_INVALIDA'
  | 'EXTENSAO_DESCONHECIDA'
  | 'PRECO_NAO_POSITIVO'
  | 'DATA_INVALIDA'
  | 'CAMBIO_AUSENTE';

/** Erro de negócio do motor: a entrada ou a regra não permite calcular. */
export class ErroMotor extends Error {
  readonly codigo: CodigoErroMotor;
  readonly detalhes: Record<string, unknown>;

  constructor(codigo: CodigoErroMotor, mensagem: string, detalhes: Record<string, unknown> = {}) {
    super(mensagem);
    this.name = 'ErroMotor';
    this.codigo = codigo;
    this.detalhes = detalhes;
  }
}
