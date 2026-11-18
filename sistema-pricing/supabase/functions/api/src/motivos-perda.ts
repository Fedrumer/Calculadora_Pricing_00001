// Lista de motivos de perda (A3). Cada instalação pode trocar a lista em
// organizacao.config.motivosPerda; sem ela, vale a lista padrão abaixo.

export interface MotivoPerda {
  codigo: string;
  nome: string;
  /** Exige texto de pelo menos 10 caracteres. */
  pedeTexto: boolean;
  /** Mostra os campos de nome e preço do concorrente (opcionais). */
  pedeConcorrente: boolean;
  ativo: boolean;
}

export const MOTIVOS_PERDA_PADRAO: MotivoPerda[] = [
  { codigo: 'preco_concorrente', nome: 'Preço acima do concorrente', pedeTexto: false, pedeConcorrente: true, ativo: true },
  { codigo: 'prazo', nome: 'Prazo ou disponibilidade', pedeTexto: false, pedeConcorrente: false, ativo: true },
  { codigo: 'escopo', nome: 'Produto não atende', pedeTexto: false, pedeConcorrente: false, ativo: true },
  { codigo: 'desistiu', nome: 'Cliente desistiu da compra', pedeTexto: false, pedeConcorrente: false, ativo: true },
  { codigo: 'sem_resposta', nome: 'Sem resposta do cliente', pedeTexto: false, pedeConcorrente: false, ativo: true },
  { codigo: 'outro', nome: 'Outro', pedeTexto: true, pedeConcorrente: false, ativo: true },
];

export function motivosDaOrganizacao(config: { motivosPerda?: MotivoPerda[] } | null | undefined): MotivoPerda[] {
  const lista = config?.motivosPerda;
  return Array.isArray(lista) && lista.length > 0 ? lista : MOTIVOS_PERDA_PADRAO;
}
