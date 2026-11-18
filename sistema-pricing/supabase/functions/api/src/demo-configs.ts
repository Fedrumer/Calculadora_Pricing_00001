// Configurações das empresas fictícias, embutidas na função para a reposição da demonstração.
// A operadora de turismo é a demonstração principal (a mesma empresa da Nota nº 02); o
// distribuidor é a segunda configuração, que prova a adaptação sem código.
import distribuidor from '../../../../config/clientes/demo-distribuidor.json' with { type: 'json' };
import turismo from '../../../../config/clientes/demo-turismo.json' with { type: 'json' };
import type { ConfigCliente } from '../../_shared/instalacao/instalar.ts';

export const CONFIGS_DEMO: Record<string, ConfigCliente> = {
  turismo: turismo as unknown as ConfigCliente,
  distribuidor: distribuidor as unknown as ConfigCliente,
};

/**
 * Organizações que só podem existir em uma instalação de demonstração. Inclui a
 * empresa de assistência das versões anteriores, para a reposição poder removê-la.
 */
export const SLUGS_DEMO = new Set([...Object.values(CONFIGS_DEMO).map((c) => c.organizacao.slug), 'aurora']);
