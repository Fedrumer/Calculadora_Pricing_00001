// Valores não secretos da demonstração. Os segredos ficam no cofre da função
// ou, só na demonstração, em app.segredos_demo (ver segredos-demo.ts).
(globalThis as { PRICING_PADROES?: Record<string, string> }).PRICING_PADROES = {
  AMBIENTE: 'demonstracao',
  // endereço das telas (links de convite) e origens que podem chamar a API
  URL_APLICACAO: 'https://fedrumer.github.io/Calculadora_Pricing_00001',
  ORIGENS_PERMITIDAS: 'https://fedrumer.github.io,http://localhost:3000',
};
