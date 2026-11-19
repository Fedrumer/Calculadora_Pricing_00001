import type { NextConfig } from 'next';

const supabase = process.env.NEXT_PUBLIC_SUPABASE_URL ?? '';
const origemSupabase = supabase ? new URL(supabase).origin : '';
const dev = process.env.NODE_ENV !== 'production';

// Cabeçalhos de segurança do frontend.
const csp = [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline'${dev ? " 'unsafe-eval'" : ''}`,
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob:",
  "font-src 'self'",
  `connect-src 'self' ${origemSupabase} ${origemSupabase.replace(/^http/, 'ws')}`.trim(),
  `frame-src ${origemSupabase || "'none'"}`,
  "frame-ancestors 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "object-src 'none'",
].join('; ');

// Hospedagem estática (GitHub Pages): DIAGNOSTICO_ESTATICO=1 gera a pasta out/, servida em uma subpasta.
const estatico = process.env.DIAGNOSTICO_ESTATICO === '1';

const config: NextConfig = {
  // trailingSlash: cada rota vira pasta/index.html, que é como o GitHub Pages resolve um caminho que também é pasta
  ...(estatico ? { output: 'export' as const, trailingSlash: true, basePath: process.env.NEXT_PUBLIC_BASE_PATH || undefined, images: { unoptimized: true } } : {}),
  reactStrictMode: true,
  devIndicators: false,
  poweredByHeader: false,
  outputFileTracingRoot: new URL('../../', import.meta.url).pathname,
  // em hospedagem estática os cabeçalhos são os do provedor
  ...(estatico ? {} : { headers: cabecalhos }),
};

async function cabecalhos() {
    return [
      {
        source: '/:path*',
        headers: [
          { key: 'Content-Security-Policy', value: csp },
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'X-Frame-Options', value: 'DENY' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
          { key: 'Strict-Transport-Security', value: 'max-age=63072000; includeSubDomains' },
        ],
      },
    ];
}

export default config;
