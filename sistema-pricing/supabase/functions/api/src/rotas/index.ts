import type { Rota } from '../app.ts';
import { rotasAdministracao } from './administracao.ts';
import { rotasAlertas } from './alertas.ts';
import { rotasAutomacao } from './automacao.ts';
import { rotasCanal, rotasCotacoes } from './cotacoes.ts';
import { rotasDemo } from './demo.ts';
import { rotasEnvioDiagnostico } from './envio-diagnostico.ts';
import { rotasIA } from './ia.ts';
import { rotasRegras } from './regras.ts';
import { rotasUsuarios } from './usuarios.ts';

export const rotas: Rota[] = [
  ...rotasCotacoes,
  ...rotasCanal,
  ...rotasRegras,
  ...rotasUsuarios,
  ...rotasAdministracao,
  ...rotasIA,
  ...rotasAutomacao,
  ...rotasAlertas,
  ...rotasEnvioDiagnostico,
  ...rotasDemo,
];
