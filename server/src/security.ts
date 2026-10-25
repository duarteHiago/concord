// Cabeçalhos de segurança de todas as respostas, e o relatório da Content-Security-Policy.
//
// A CSP completa vai como Report-Only: o navegador não bloqueia nada, só manda para /api/csp-report o que
// bloquearia. Quando o log ficar limpo, ela passa a valer (troca o nome do cabeçalho). Já vale de verdade
// a parte que não tem como quebrar o app: ninguém embute o Concord num iframe (clickjacking), nem <object>,
// nem <base> apontando para outro site.
import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import express, { type NextFunction, type Request, type Response, type Router } from 'express';
import { config } from './config.ts';
import { cspReports } from './metrics.ts';

/** Hash dos <script> inline das páginas (o redirecionamento para a landing no index.html etc.). */
function inlineScriptHashes(): string[] {
  const pages = ['index.html', 'inicio/index.html', 'privacidade/index.html', 'termos/index.html', 'contribuir/index.html'];
  const hashes = new Set<string>();
  for (const page of pages) {
    const file = join(config.publicDir, page);
    if (!existsSync(file)) continue;
    for (const m of readFileSync(file, 'utf8').matchAll(/<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/gi)) {
      hashes.add(`'sha256-${createHash('sha256').update(m[1]).digest('base64')}'`);
    }
  }
  return [...hashes];
}

const origin = (url: string) => {
  try {
    return new URL(url).origin; // vale para ws:// e wss:// também
  } catch {
    return '';
  }
};

const ENFORCED = "frame-ancestors 'none'; object-src 'none'; base-uri 'self'";

function reportOnlyPolicy() {
  // LiveKit em outro endereço (no dev, ws://localhost:7880): o websocket e o /rtc/validate por HTTP, que o
  // livekit-client chama quando a conexão falha. Em produção ele fica no mesmo domínio (/livekit) e 'self' basta.
  const lk = config.livekit.publicUrl ? origin(config.livekit.publicUrl) : '';
  const livekit = lk ? `${lk} ${lk.replace(/^ws/, 'http')}` : '';
  return [
    "default-src 'self'",
    // wasm: supressão de ruído e efeitos de voz
    `script-src 'self' 'wasm-unsafe-eval' ${inlineScriptHashes().join(' ')}`,
    // React usa style="" e o CSS personalizado de cada pessoa vira um <style>
    "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
    "font-src 'self' data: https://fonts.gstatic.com",
    // capas da Steam, fundos e figurinhas vêm de vários lugares
    "img-src 'self' data: blob: https:",
    "media-src 'self' data: blob:",
    `connect-src 'self'${livekit ? ` ${livekit}` : ''}`,
    "worker-src 'self' blob:",
    "frame-src 'none'",
    "form-action 'self'",
    ENFORCED,
    'report-uri /api/csp-report',
  ].join('; ');
}

export function securityHeaders() {
  const reportOnly = reportOnlyPolicy();
  return (req: Request, res: Response, next: NextFunction) => {
    res.setHeader('Content-Security-Policy', ENFORCED);
    res.setHeader('Content-Security-Policy-Report-Only', reportOnly);
    res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
    // só o que o app não usa; microfone, câmera, tela e tela cheia continuam liberados
    res.setHeader('Permissions-Policy', 'geolocation=(), payment=(), usb=(), serial=(), hid=(), bluetooth=(), interest-cohort=()');
    // HSTS só quando a requisição chegou por HTTPS (atrás do Caddy/Cloudflare, pelo X-Forwarded-Proto)
    if (req.secure) res.setHeader('Strict-Transport-Security', 'max-age=15552000');
    next();
  };
}

// cada violação diferente vai para o log no máximo uma vez por hora; o contador conta todas
const lastLogged = new Map<string, number>();

export function registerCspReportRoutes(api: Router) {
  api.post('/csp-report', express.json({ type: ['application/csp-report', 'application/reports+json', 'application/json'], limit: '20kb' }), (req, res) => {
    const body = req.body as Record<string, any> | Record<string, any>[] | undefined;
    // formato antigo (report-uri): {"csp-report": {...}}; o novo (Reporting API): [{type, body: {...}}]
    const reports = Array.isArray(body) ? body.map((r) => r?.body) : [body?.['csp-report']];
    for (const r of reports) {
      if (!r) continue;
      const directive = String(r['violated-directive'] ?? r.effectiveDirective ?? r['effective-directive'] ?? '?').split(' ')[0].slice(0, 40);
      const blocked = String(r['blocked-uri'] ?? r.blockedURL ?? '?').replace(/^(https?:\/\/[^/]+).*$/, '$1').slice(0, 120);
      cspReports.inc({ directive });
      const key = `${directive} ${blocked}`;
      if (Date.now() - (lastLogged.get(key) ?? 0) < 3_600_000) continue;
      if (lastLogged.size > 500) lastLogged.clear();
      lastLogged.set(key, Date.now());
      const where = String(r['document-uri'] ?? r.documentURL ?? '').replace(/^https?:\/\/[^/]+/, '').slice(0, 80);
      console.warn(`[csp] bloquearia ${directive} ${blocked} (em ${where || '?'})`);
    }
    res.status(204).end();
  });
}
