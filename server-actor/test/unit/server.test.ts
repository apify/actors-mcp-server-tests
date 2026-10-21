import type { IncomingHttpHeaders } from 'node:http';
import { get } from 'node:http';
import type { AddressInfo } from 'node:net';
import { gunzipSync } from 'node:zlib';

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { createApiServer, MAX_BYTES } from '../../src/server.js';

const server = createApiServer();
let baseUrl: string;

beforeAll(async () => {
    await new Promise<void>((resolve) => {
        server.listen(0, resolve);
    });
    baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});

afterAll(async () => {
    await new Promise((resolve) => {
        server.close(resolve);
    });
});

describe('echo', () => {
    it('answers the readiness probe', async () => {
        const res = await fetch(`${baseUrl}/`, { headers: { 'x-apify-container-server-readiness-probe': '1' } });
        expect(res.status).toBe(200);
        expect(await res.text()).toBe('ok\n');
    });

    it('echoes a GET request with query and headers', async () => {
        const res = await fetch(`${baseUrl}/?a=1&b=true`, { headers: { authorization: 'Bearer secret' } });
        expect(res.status).toBe(200);
        const json = await res.json();
        expect(json).toMatchObject({
            method: 'GET',
            path: '/',
            query: { a: '1', b: 'true' },
            headers: { authorization: 'Bearer secret' },
            body: null,
        });
    });

    it('echoes a parsed JSON body on POST', async () => {
        const res = await fetch(`${baseUrl}/`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ message: 'hello', count: 2 }),
        });
        expect(await res.json()).toMatchObject({ method: 'POST', body: { message: 'hello', count: 2 } });
    });

    it('rejects invalid JSON with 400', async () => {
        const res = await fetch(`${baseUrl}/`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: '{',
        });
        expect(res.status).toBe(400);
        expect(await res.json()).toEqual({ code: 400, error: 'Request body is not valid JSON' });
    });

    it('rejects other methods with 405', async () => {
        const res = await fetch(`${baseUrl}/`, { method: 'DELETE' });
        expect(res.status).toBe(405);
        expect(res.headers.get('allow')).toBe('GET, POST');
    });
});

describe('add', () => {
    const postAdd = async (body: string, query = '') =>
        fetch(`${baseUrl}/add${query}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body });

    it('adds numbers from a JSON body', async () => {
        const res = await postAdd(JSON.stringify({ firstNumber: 2, secondNumber: 3 }));
        expect(res.status).toBe(200);
        expect(await res.json()).toEqual({ firstNumber: 2, secondNumber: 3, sum: 5 });
    });

    it('adds numbers from the query', async () => {
        const res = await fetch(`${baseUrl}/add?firstNumber=-4&secondNumber=10`);
        expect(await res.json()).toEqual({ firstNumber: -4, secondNumber: 10, sum: 6 });
    });

    it('returns text/plain when asText=true', async () => {
        const res = await fetch(`${baseUrl}/add?firstNumber=2&secondNumber=3&asText=true`);
        expect(res.headers.get('content-type')).toMatch(/^text\/plain/);
        expect(await res.text()).toBe('2 + 3 = 5\n');
    });

    it('returns JSON when asText=false', async () => {
        const res = await postAdd(JSON.stringify({ firstNumber: 1, secondNumber: 1 }), '?asText=false');
        expect(await res.json()).toEqual({ firstNumber: 1, secondNumber: 1, sum: 2 });
    });

    it.each(['1', '0', 'yes'])('rejects asText=%s with 400', async (value) => {
        const res = await fetch(`${baseUrl}/add?firstNumber=1&secondNumber=2&asText=${value}`);
        expect(res.status).toBe(400);
        expect(await res.json()).toEqual({ code: 400, error: 'Query parameter asText must be true or false' });
    });

    it.each(['?firstNumber=1', '?firstNumber=1.5&secondNumber=2', '?firstNumber=a&secondNumber=2'])(
        'rejects query %s with 400',
        async (query) => {
            const res = await fetch(`${baseUrl}/add${query}`);
            expect(res.status).toBe(400);
            expect(await res.json()).toMatchObject({ code: 400 });
        },
    );

    it.each(['{}', '{"firstNumber":1,"secondNumber":"2"}', '{'])('rejects body %s with 400', async (body) => {
        const res = await postAdd(body);
        expect(res.status).toBe(400);
        expect(await res.json()).toMatchObject({ code: 400 });
    });

    it('rejects other methods with 405', async () => {
        const res = await fetch(`${baseUrl}/add`, { method: 'PUT' });
        expect(res.status).toBe(405);
        expect(res.headers.get('allow')).toBe('GET, POST');
    });
});

describe('status', () => {
    it.each([404, 429, 503])('returns %i with a JSON error body', async (code) => {
        const res = await fetch(`${baseUrl}/status/${code}`);
        expect(res.status).toBe(code);
        expect(await res.json()).toMatchObject({ code });
    });

    it('rejects codes outside 400-599', async () => {
        const res = await fetch(`${baseUrl}/status/200`);
        expect(res.status).toBe(400);
    });
});

describe('content types', () => {
    it('returns 204 with no body and no content type', async () => {
        const res = await fetch(`${baseUrl}/empty`);
        expect(res.status).toBe(204);
        expect(res.headers.get('content-type')).toBeNull();
        expect(await res.text()).toBe('');
    });

    it('returns text/plain', async () => {
        const res = await fetch(`${baseUrl}/text`);
        expect(res.headers.get('content-type')).toMatch(/^text\/plain/);
    });

    it('returns application/octet-stream', async () => {
        const res = await fetch(`${baseUrl}/binary`);
        expect(res.headers.get('content-type')).toBe('application/octet-stream');
        expect((await res.arrayBuffer()).byteLength).toBe(256);
    });
});

describe('sizes', () => {
    it.each([0, 262_144, 262_145])('returns exactly %i bytes', async (n) => {
        const res = await fetch(`${baseUrl}/bytes?n=${n}`);
        const body = Buffer.from(await res.arrayBuffer());
        expect(body.length).toBe(n);
        expect(body.every((b) => b === 0x61)).toBe(true);
    });

    it('returns n decompressed bytes gzip-encoded', async () => {
        // node:http does not decompress, so the raw body is the gzip stream.
        const { headers, body } = await new Promise<{ headers: IncomingHttpHeaders; body: Buffer }>(
            (resolve, reject) => {
                get(`${baseUrl}/gzip?n=262144`, (res) => {
                    const chunks: Buffer[] = [];
                    res.on('data', (chunk: Buffer) => chunks.push(chunk));
                    res.on('end', () => resolve({ headers: res.headers, body: Buffer.concat(chunks) }));
                }).on('error', reject);
            },
        );
        expect(headers['content-encoding']).toBe('gzip');
        expect(body.length).toBeLessThan(262_144);
        expect(gunzipSync(body).length).toBe(262_144);
    });

    it.each(['', '?n=-1', '?n=abc', `?n=${MAX_BYTES + 1}`])('rejects n %s', async (query) => {
        const res = await fetch(`${baseUrl}/bytes${query}`);
        expect(res.status).toBe(400);
    });
});

describe('delay and redirect', () => {
    it('responds after the delay', async () => {
        const res = await fetch(`${baseUrl}/delay?ms=10`);
        expect(await res.json()).toEqual({ delayedMs: 10 });
    });

    it('rejects a delay above the maximum', async () => {
        const res = await fetch(`${baseUrl}/delay?ms=150001`);
        expect(res.status).toBe(400);
    });

    it('returns 302 with a fixed location', async () => {
        const res = await fetch(`${baseUrl}/redirect?to=https://example.com`, { redirect: 'manual' });
        expect(res.status).toBe(302);
        expect(res.headers.get('location')).toBe('/');
    });
});

describe('unknown paths', () => {
    it('returns 404 with a JSON error body', async () => {
        const res = await fetch(`${baseUrl}/missing`);
        expect(res.status).toBe(404);
        expect(await res.json()).toEqual({ code: 404, error: 'Not Found' });
    });

    it('returns 404 for POST on a GET-only path', async () => {
        const res = await fetch(`${baseUrl}/text`, { method: 'POST' });
        expect(res.status).toBe(404);
    });
});
