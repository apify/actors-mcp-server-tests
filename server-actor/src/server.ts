import type { IncomingMessage, Server, ServerResponse } from 'node:http';
import { createServer, STATUS_CODES } from 'node:http';
import { setTimeout } from 'node:timers/promises';
import { gzipSync } from 'node:zlib';

import { add } from './add.js';
import { inputSchema } from './input-schema.js';

export const MAX_BYTES = 1024 * 1024;
export const MAX_DELAY_MS = 150_000;
// Fixed same-host target. Never taken from the request.
export const REDIRECT_LOCATION = '/';

const READINESS_PROBE_HEADER = 'x-apify-container-server-readiness-probe';

type Route = (req: IncomingMessage, res: ServerResponse, url: URL) => Promise<void> | void;

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

const echo: Route = async (req, res, url) => {
    if (req.method === 'GET' && req.headers[READINESS_PROBE_HEADER]) {
        res.writeHead(200, { 'Content-Type': 'text/plain' });
        res.end('ok\n');
        return;
    }
    if (req.method !== 'GET' && req.method !== 'POST') {
        res.setHeader('Allow', 'GET, POST');
        sendError(res, 405);
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
};

/** Reads the numbers from the query (GET) or the JSON body (POST). Throws when the body is not JSON. */
async function readAddInput(req: IncomingMessage, url: URL): Promise<unknown> {
    if (req.method === 'POST') return JSON.parse(await readBody(req));
    const toNumber = (name: string) => {
        const raw = url.searchParams.get(name);
        return raw !== null && /^-?\d+$/.test(raw) ? Number(raw) : raw;
    };
    return { firstNumber: toNumber('firstNumber'), secondNumber: toNumber('secondNumber') };
}

const addRoute: Route = async (req, res, url) => {
    if (req.method !== 'GET' && req.method !== 'POST') {
        res.setHeader('Allow', 'GET, POST');
        sendError(res, 405);
        return;
    }
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
};

const status: Route = (_req, res, url) => {
    const code = Number(url.pathname.slice('/status/'.length));
    if (!Number.isInteger(code) || code < 400 || code > 599) {
        sendError(res, 400, 'Status code must be an integer from 400 to 599');
        return;
    }
    sendError(res, code);
};

const empty: Route = (_req, res) => {
    res.writeHead(204);
    res.end();
};

const text: Route = (_req, res) => {
    res.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('Plain text response from the Apify MCP server test Server Actor.\n');
};

const binary: Route = (_req, res) => {
    res.writeHead(200, { 'Content-Type': 'application/octet-stream' });
    res.end(Buffer.from(Array.from({ length: 256 }, (_, i) => i)));
};

function bytesBody(url: URL, res: ServerResponse): Buffer | null {
    const n = parseIntParam(url, 'n', MAX_BYTES);
    if (n === null) {
        sendError(res, 400, `Query parameter n must be an integer from 0 to ${MAX_BYTES}`);
        return null;
    }
    return Buffer.alloc(n, 'a');
}

const bytes: Route = (_req, res, url) => {
    const body = bytesBody(url, res);
    if (!body) return;
    res.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end(body);
};

const gzip: Route = (_req, res, url) => {
    const body = bytesBody(url, res);
    if (!body) return;
    res.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8', 'Content-Encoding': 'gzip' });
    res.end(gzipSync(body));
};

const delay: Route = async (_req, res, url) => {
    const ms = parseIntParam(url, 'ms', MAX_DELAY_MS);
    if (ms === null) {
        sendError(res, 400, `Query parameter ms must be an integer from 0 to ${MAX_DELAY_MS}`);
        return;
    }
    await setTimeout(ms);
    sendJson(res, 200, { delayedMs: ms });
};

const redirect: Route = (_req, res) => {
    res.writeHead(302, { Location: REDIRECT_LOCATION });
    res.end();
};

const GET_ROUTES: Record<string, Route> = {
    '/empty': empty,
    '/text': text,
    '/binary': binary,
    '/bytes': bytes,
    '/gzip': gzip,
    '/delay': delay,
    '/redirect': redirect,
};

function findRoute(method: string | undefined, pathname: string): Route | null {
    if (pathname === '/') return echo;
    if (pathname === '/add') return addRoute;
    if (method !== 'GET') return null;
    if (pathname.startsWith('/status/')) return status;
    return GET_ROUTES[pathname] ?? null;
}

/** HTTP API documented by `.actor/openapi.json`. */
export function createApiServer(): Server {
    return createServer(async (req, res) => {
        const url = new URL(req.url ?? '/', 'http://localhost');
        const route = findRoute(req.method, url.pathname);
        if (!route) {
            sendError(res, 404);
            return;
        }
        try {
            await route(req, res, url);
        } catch {
            if (!res.headersSent) sendError(res, 500);
            else res.end();
        }
    });
}
