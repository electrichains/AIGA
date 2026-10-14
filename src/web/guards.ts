import { lookup } from 'node:dns/promises';
import net from 'node:net';
import type { Request, Response, NextFunction, RequestHandler } from 'express';

/**
 * Small in-memory rate limiter, keyed by client IP. Good enough for a single
 * Render instance; swap for a shared store if AIGA ever runs more than one.
 */
export function rateLimit({ windowMs, max }: { windowMs: number; max: number }): RequestHandler {
  const hits = new Map<string, { count: number; reset: number }>();
  return (req: Request, res: Response, next: NextFunction) => {
    const now = Date.now();
    const key = req.ip || req.socket.remoteAddress || 'unknown';
    const entry = hits.get(key);
    if (!entry || entry.reset < now) {
      hits.set(key, { count: 1, reset: now + windowMs });
      if (hits.size > 10_000) {
        for (const [k, v] of hits) if (v.reset < now) hits.delete(k);
      }
      return next();
    }
    entry.count++;
    if (entry.count > max) {
      res.setHeader('Retry-After', Math.ceil((entry.reset - now) / 1000));
      res.status(429).json({ error: 'Too many requests. Please wait a moment and try again.' });
      return;
    }
    next();
  };
}

/**
 * Protects admin surfaces (MCP transport, KMZ upload). When AIGA_ADMIN_TOKEN is
 * set, callers must send it as `Authorization: Bearer <token>` (or `?token=` for
 * SSE clients that cannot set headers). When it is not set, the routes stay open
 * as before, and the server logs a warning at startup.
 */
export function requireAdmin(req: Request, res: Response, next: NextFunction) {
  const token = process.env.AIGA_ADMIN_TOKEN;
  if (!token) return next();
  const header = req.headers.authorization || '';
  const given = header.startsWith('Bearer ') ? header.slice(7) : String(req.query.token || '');
  if (given && timingSafeEqual(given, token)) return next();
  res.status(401).json({ error: 'Admin token required' });
}

function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

/** True for loopback, private, link-local, CGNAT and other non-public addresses. */
export function isPrivateAddress(ip: string): boolean {
  if (net.isIPv4(ip)) {
    const [a, b] = ip.split('.').map(Number);
    return (
      a === 0 || a === 10 || a === 127 ||
      (a === 100 && b >= 64 && b <= 127) ||
      (a === 169 && b === 254) ||
      (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && b === 168) ||
      (a === 192 && b === 0) ||
      (a === 198 && (b === 18 || b === 19)) ||
      a >= 224
    );
  }
  if (net.isIPv6(ip)) {
    const v = ip.toLowerCase();
    if (v === '::' || v === '::1') return true;
    const mapped = v.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/);
    if (mapped) return isPrivateAddress(mapped[1]);
    return v.startsWith('fc') || v.startsWith('fd') || v.startsWith('fe80') || v.startsWith('ff');
  }
  return true;
}

/**
 * Accepts only https URLs whose host resolves to public addresses, so a caller
 * cannot make the server fetch internal services (SSRF).
 */
export async function assertPublicHttpsUrl(raw: string): Promise<URL> {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new Error('The KMZ/KML link is not a valid URL.');
  }
  if (url.protocol !== 'https:') throw new Error('Only https:// links can be fetched.');
  if (url.username || url.password) throw new Error('Links with credentials are not allowed.');
  const host = url.hostname.replace(/^\[|\]$/g, '');
  const addresses = net.isIP(host) ? [{ address: host }] : await lookup(host, { all: true });
  if (!addresses.length || addresses.some((a) => isPrivateAddress(a.address))) {
    throw new Error('That link points to a private or local address.');
  }
  return url;
}

/** Fetches a public https URL with no redirects and a hard size limit. */
export async function fetchPublicBuffer(raw: string, maxBytes: number): Promise<Buffer> {
  const url = await assertPublicHttpsUrl(raw);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 15_000);
  try {
    const response = await fetch(url, { redirect: 'error', signal: controller.signal });
    if (!response.ok) throw new Error(`Failed to fetch ${url.host}: ${response.status} ${response.statusText}`);
    const declared = Number(response.headers.get('content-length') || 0);
    if (declared > maxBytes) throw new Error(`File is larger than ${Math.round(maxBytes / 1e6)} MB.`);
    const reader = response.body?.getReader();
    if (!reader) return Buffer.alloc(0);
    const chunks: Uint8Array[] = [];
    let total = 0;
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > maxBytes) {
        controller.abort();
        throw new Error(`File is larger than ${Math.round(maxBytes / 1e6)} MB.`);
      }
      chunks.push(value);
    }
    return Buffer.concat(chunks);
  } finally {
    clearTimeout(timer);
  }
}
