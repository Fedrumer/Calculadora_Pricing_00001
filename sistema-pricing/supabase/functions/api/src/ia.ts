import Anthropic from '@anthropic-ai/sdk';
import type { ServicoIA } from './contexto.ts';
import { ErroHttp } from './erros.ts';

const MODELO = 'claude-opus-5-5';

/**
 * Camada de IA: Claude, chamado só pelo servidor. Fica fora do caminho crítico:
 * sem chave configurada, o serviço fica indisponível e a cotação segue normal.
 */
export function iaAnthropic(chave: string | undefined): ServicoIA {
  if (!chave) return iaIndisponivel();
  const cliente = new Anthropic({ apiKey: chave, maxRetries: 1, timeout: 60_000 });
  return {
    disponivel: true,
    modelo: MODELO,
    async gerar({ sistema, mensagem, maxTokens, esquema }) {
      try {
        const resposta = await cliente.beta.messages.create({
          model: MODELO,
          max_tokens: maxTokens ?? 4000,
          system: sistema,
          messages: [{ role: 'user', content: mensagem }],
          thinking: { type: 'adaptive' },
          output_config: {
            effort: 'low',
            ...(esquema ? { format: { type: 'json_schema' as const, schema: esquema } } : {}),
          },
          // se o modelo recusar por política, a própria API tenta o modelo de reserva
          betas: ['server-side-fallback-2026-07-01'],
          fallbacks: 'default',
        } as Anthropic.Beta.MessageCreateParamsNonStreaming);
        if (resposta.stop_reason === 'refusal') {
          throw new ErroHttp(422, 'IA_RECUSOU', 'O assistente não pôde atender a este pedido.');
        }
        const texto = resposta.content
          .filter((b): b is Anthropic.Beta.BetaTextBlock => b.type === 'text')
          .map((b) => b.text)
          .join('\n')
          .trim();
        return { texto, tokensEntrada: resposta.usage.input_tokens, tokensSaida: resposta.usage.output_tokens };
      } catch (e) {
        if (e instanceof ErroHttp) throw e;
        if (e instanceof Anthropic.RateLimitError) throw new ErroHttp(429, 'IA_LIMITE', 'O assistente está sobrecarregado; tente em instantes.');
        if (e instanceof Anthropic.AuthenticationError) throw new ErroHttp(503, 'IA_INDISPONIVEL', 'A chave do assistente de IA é inválida.');
        if (e instanceof Anthropic.APIError) throw new ErroHttp(502, 'IA_FALHOU', 'O assistente de IA não respondeu.');
        throw e;
      }
    },
  };
}

export function iaIndisponivel(): ServicoIA {
  return {
    disponivel: false,
    modelo: MODELO,
    gerar() {
      return Promise.reject(new ErroHttp(503, 'IA_INDISPONIVEL', 'O assistente de IA não está configurado nesta instalação.'));
    },
  };
}

/** Mascaramento de dado pessoal antes de qualquer envio à IA. */
export function mascararTexto(texto: string): string {
  return texto
    .replace(/[\w.+-]+@[\w-]+(\.[\w-]+)+/g, '[e-mail]')
    .replace(/\b\d{3}\.?\d{3}\.?\d{3}-?\d{2}\b/g, '[CPF]')
    .replace(/\b\d{2}\.?\d{3}\.?\d{3}\/?\d{4}-?\d{2}\b/g, '[CNPJ]')
    .replace(/(\+?55\s?)?\(?\b\d{2}\)?\s?9?\d{4}[-\s]?\d{4}\b/g, '[telefone]');
}
