import { randomUUID } from 'node:crypto';
import type { IncomingMessage, Server, ServerResponse } from 'node:http';
import { createServer, STATUS_CODES } from 'node:http';
import { setTimeout } from 'node:timers/promises';
import { gzipSync } from 'node:zlib';

import { log } from 'apify';

import { add } from './add.js';
import { inputSchema } from './input-schema.js';

export const MAX_BYTES = 1024 * 1024;
export const MAX_DELAY_MS = 150_000;
// Fixed same-host target. Never taken from the request.
export const REDIRECT_LOCATION = '/';

const READINESS_PROBE_HEADER = 'x-apify-container-server-readiness-probe';

function sendJson(res: ServerResponse, status: number, data: unknown): void {
    res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' });
    res.end(JSON.stringify(data));
}

function sendError(res: ServerResponse, code: number, error = STATUS_CODES[code] ?? 'Error'): void {
    sendJson(res, code, { code, error });
}

/** Parses an integer query parameter in [0, max]. Returns null when missing or out of range. */
function parseIntParam(url: URL, name: string, max: number): number | null {
    const raw = url.searchParams.get(name);
    if (raw === null || !/^\d+$/.test(raw)) return null;
    const value = Number(raw);
    return value <= max ? value : null;
}

async function readBody(req: IncomingMessage): Promise<string> {
    const chunks: Buffer[] = [];
    for await (const chunk of req) chunks.push(chunk as Buffer);
    return Buffer.concat(chunks).toString('utf8');
}

async function echo(req: IncomingMessage, res: ServerResponse, url: URL): Promise<void> {
    if (req.method === 'GET' && req.headers[READINESS_PROBE_HEADER]) {
        res.writeHead(200, { 'Content-Type': 'text/plain' });
        res.end('ok\n');
        return;
    }
    const raw = await readBody(req);
    let body: unknown = null;
    if (raw && req.headers['content-type']?.startsWith('application/json')) {
        try {
            body = JSON.parse(raw);
        } catch {
            sendError(res, 400, 'Request body is not valid JSON');
            return;
        }
    } else if (raw) {
        body = raw;
    }
    sendJson(res, 200, {
        method: req.method,
        path: url.pathname,
        query: Object.fromEntries(url.searchParams),
        headers: req.headers,
        body,
    });
}

/** Reads the numbers from the query (GET) or the JSON body (POST). Throws when the body is not JSON. */
async function readAddInput(req: IncomingMessage, url: URL): Promise<unknown> {
    if (req.method === 'POST') return JSON.parse(await readBody(req));
    const toNumber = (name: string) => {
        const raw = url.searchParams.get(name);
        return raw !== null && /^-?\d+$/.test(raw) ? Number(raw) : raw;
    };
    return { firstNumber: toNumber('firstNumber'), secondNumber: toNumber('secondNumber') };
}

async function addRoute(req: IncomingMessage, res: ServerResponse, url: URL): Promise<void> {
    // Only `true` or `false`, so a client that encodes booleans as 1/0 gets a 400.
    const asText = url.searchParams.get('asText') ?? 'false';
    if (asText !== 'true' && asText !== 'false') {
        sendError(res, 400, 'Query parameter asText must be true or false');
        return;
    }
    let input;
    try {
        input = await readAddInput(req, url);
    } catch {
        sendError(res, 400, 'Request body is not valid JSON');
        return;
    }
    const parsed = inputSchema.safeParse(input);
    if (!parsed.success) {
        sendError(res, 400, parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; '));
        return;
    }
    const result = add(parsed.data);
    if (asText === 'true') {
        res.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8' });
        res.end(`${result.firstNumber} + ${result.secondNumber} = ${result.sum}\n`);
        return;
    }
    sendJson(res, 200, result);
}

async function dispatch(req: IncomingMessage, res: ServerResponse, url: URL): Promise<void> {
    const { pathname } = url;
    if (pathname === '/' || pathname === '/add') {
        if (req.method !== 'GET' && req.method !== 'POST') {
            res.setHeader('Allow', 'GET, POST');
            sendError(res, 405);
            return;
        }
        await (pathname === '/' ? echo : addRoute)(req, res, url);
        return;
    }
    if (req.method !== 'GET') {
        sendError(res, 404);
        return;
    }
    switch (pathname) {
        case '/empty':
            res.writeHead(204);
            res.end();
            return;
        case '/text':
            res.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8' });
            res.end('Plain text response from the Apify MCP server test Server Actor.\n');
            return;
        case '/binary':
            res.writeHead(200, { 'Content-Type': 'application/octet-stream' });
            res.end(Buffer.from(Array.from({ length: 256 }, (_, i) => i)));
            return;
        case '/bytes':
        case '/gzip': {
            const n = parseIntParam(url, 'n', MAX_BYTES);
            if (n === null) {
                sendError(res, 400, `Query parameter n must be an integer from 0 to ${MAX_BYTES}`);
                return;
            }
            const body = Buffer.alloc(n, 'a');
            res.setHeader('Content-Type', 'text/plain; charset=utf-8');
            if (pathname === '/gzip') {
                res.setHeader('Content-Encoding', 'gzip');
                res.end(gzipSync(body));
            } else {
                res.end(body);
            }
            return;
        }
        case '/delay': {
            const ms = parseIntParam(url, 'ms', MAX_DELAY_MS);
            if (ms === null) {
                sendError(res, 400, `Query parameter ms must be an integer from 0 to ${MAX_DELAY_MS}`);
                return;
            }
            await setTimeout(ms);
            sendJson(res, 200, { delayedMs: ms });
            return;
        }
        case '/redirect':
            res.writeHead(302, { Location: REDIRECT_LOCATION });
            res.end();
            return;
        default:
            if (pathname.startsWith('/status/')) {
                const code = Number(pathname.slice('/status/'.length));
                if (!Number.isInteger(code) || code < 400 || code > 599) {
                    sendError(res, 400, 'Status code must be an integer from 400 to 599');
                    return;
                }
                sendError(res, code);
            } else {
                sendError(res, 404);
            }
    }
}

/** HTTP API documented by `.actor/openapi.json`. */
export function createApiServer(): Server {
    return createServer(async (req, res) => {
        const startedAt = performance.now();
        const rawUrl = req.url ?? '/';
        const url = URL.canParse(rawUrl, 'http://localhost') ? new URL(rawUrl, 'http://localhost') : null;
        const request = {
            requestId: randomUUID(),
            method: req.method,
            path: url?.pathname ?? '[invalid URL]',
            isReadinessProbe: req.method === 'GET' && Boolean(req.headers[READINESS_PROBE_HEADER]),
        };
        log.info('HTTP request received', request);
        res.once('close', () => {
            log.info(res.writableFinished ? 'HTTP request completed' : 'HTTP request aborted', {
                ...request,
                statusCode: res.headersSent ? res.statusCode : undefined,
                durationMs: Math.round(performance.now() - startedAt),
            });
        });
        if (!url) {
            sendError(res, 400);
            return;
        }
        try {
            await dispatch(req, res, url);
        } catch {
            if (!res.headersSent) sendError(res, 500);
            else res.end();
        }
    });
}
