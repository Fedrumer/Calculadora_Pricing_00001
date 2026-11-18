// Lista de motivos de perda (A3). A organização pode ter a própria em
// config.motivosPerda; sem ela, vale a padrão (a mesma da API).

export interface MotivoPerda {
  codigo: string;
  nome: string;
  pedeTexto: boolean;
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

export function motivosDa(config: Record<string, any> | null | undefined): MotivoPerda[] {
  const lista = config?.motivosPerda;
  return Array.isArray(lista) && lista.length > 0 ? lista : MOTIVOS_PERDA_PADRAO;
}

export const nomeDoMotivo = (config: Record<string, any> | null | undefined, codigo: string | null | undefined) =>
  codigo ? (motivosDa(config).find((m) => m.codigo === codigo)?.nome ?? codigo) : null;
