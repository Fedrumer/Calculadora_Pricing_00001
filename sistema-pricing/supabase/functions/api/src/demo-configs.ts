// Configurações das empresas fictícias, embutidas na função para a reposição da demonstração.
import assistencia from '../../../../config/clientes/demo-assistencia.json' with { type: 'json' };
import distribuidor from '../../../../config/clientes/demo-distribuidor.json' with { type: 'json' };
import type { ConfigCliente } from '../../_shared/instalacao/instalar.ts';

export const CONFIGS_DEMO: Record<string, ConfigCliente> = {
  assistencia: assistencia as unknown as ConfigCliente,
  distribuidor: distribuidor as unknown as ConfigCliente,
};
