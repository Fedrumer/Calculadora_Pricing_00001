// Distribuição normal padrão: acumulada e inversa, em precisão dupla.

/** Inversa da normal acumulada (Acklam, com um passo de Halley; erro abaixo de 1e-12). */
export function normalInversa(p: number): number {
  if (p <= 0) return -Infinity;
  if (p >= 1) return Infinity;
  const a = [-3.969683028665376e1, 2.209460984245205e2, -2.759285104469687e2, 1.38357751867269e2, -3.066479806614716e1, 2.506628277459239];
  const b = [-5.447609879822406e1, 1.615858368580409e2, -1.556989798598866e2, 6.680131188771972e1, -1.328068155288572e1];
  const c = [-7.784894002430293e-3, -3.223964580411365e-1, -2.400758277161838, -2.549732539343734, 4.374664141464968, 2.938163982698783];
  const d = [7.784695709041462e-3, 3.224671290700398e-1, 2.445134137142996, 3.754408661907416];
  const pb = 0.02425;
  let x: number;
  if (p < pb) {
    const q = Math.sqrt(-2 * Math.log(p));
    x = (((((c[0]! * q + c[1]!) * q + c[2]!) * q + c[3]!) * q + c[4]!) * q + c[5]!) / ((((d[0]! * q + d[1]!) * q + d[2]!) * q + d[3]!) * q + 1);
  } else if (p <= 1 - pb) {
    const q = p - 0.5, r = q * q;
    x = ((((((a[0]! * r + a[1]!) * r + a[2]!) * r + a[3]!) * r + a[4]!) * r + a[5]!) * q) / (((((b[0]! * r + b[1]!) * r + b[2]!) * r + b[3]!) * r + b[4]!) * r + 1);
  } else {
    const q = Math.sqrt(-2 * Math.log(1 - p));
    x = -(((((c[0]! * q + c[1]!) * q + c[2]!) * q + c[3]!) * q + c[4]!) * q + c[5]!) / ((((d[0]! * q + d[1]!) * q + d[2]!) * q + d[3]!) * q + 1);
  }
  const e = normalAcumulada(x) - p;
  const u = e * Math.sqrt(2 * Math.PI) * Math.exp((x * x) / 2);
  return x - u / (1 + (x * u) / 2);
}

/** Normal acumulada, pela função de erro complementar (W. J. Cody; erro relativo abaixo de 1e-14). */
export function normalAcumulada(x: number): number {
  return 0.5 * erfc(-x / Math.SQRT2);
}

function erfc(x: number): number {
  const z = Math.abs(x);
  let r: number;
  if (z < 0.5) {
    const t = z * z;
    const top = (((0.185777706184603153 * t + 3.16112374387056560) * t + 113.864154151050156) * t + 377.485237685302021) * t + 3209.37758913846947;
    const bot = (((t + 23.6012909523441209) * t + 244.024637934444173) * t + 1282.61652607737228) * t + 2844.23683343917062;
    r = 1 - (z * top) / bot;
  } else if (z < 4) {
    const top = (((((((2.15311535474403846e-8 * z + 0.564188496988670089) * z + 8.88314979438837594) * z + 66.1191906371416295) * z + 298.635138197400131) * z
      + 881.952221241769090) * z + 1712.04761263407058) * z + 2051.07837782607147) * z + 1230.33935479799725;
    const bot = (((((((z + 15.7449261107098347) * z + 117.693950891312499) * z + 537.181101862009858) * z + 1621.38957456669019) * z
      + 3290.79923573345963) * z + 4362.61909014324716) * z + 3439.36767414372164) * z + 1230.33935480374942;
    r = (Math.exp(-z * z) * top) / bot;
  } else {
    const t = 1 / (z * z);
    const top = ((((0.0163153871373020978 * t + 0.305326634961232344) * t + 0.360344899949804439) * t + 0.125781726111229246) * t + 0.0160837851487422766) * t + 6.58749161529837803e-4;
    const bot = ((((t + 2.56852019228982242) * t + 1.87295284992346725) * t + 0.527905102951428412) * t + 0.0605183413124413191) * t + 2.33520497626869185e-3;
    r = (Math.exp(-z * z) / z) * (1 / Math.sqrt(Math.PI) - (t * top) / bot);
  }
  return x < 0 ? 2 - r : r;
}
