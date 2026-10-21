## Apify example Server Actor

A test fixture for the [Apify MCP server](https://mcp.apify.com/). It has both interfaces of a Server Actor: an HTTP API documented by an OpenAPI schema (`.actor/openapi.json`) and an input schema with the same fields as the `POST /` body. It has no MCP endpoint.

## What it does

`src/main.ts` picks the entry path from the run's origin:

- **Standby run** (`metaOrigin === 'STANDBY'`): serves the HTTP API on `ACTOR_STANDBY_PORT` until the platform stops the run.
- **Any other run**: validates the input (`message`, `count`), pushes it to the default dataset as one item, and exits.

## Endpoints

| Method and path | Response |
|---|---|
| `GET /` | Readiness probe (`200 ok`) when the `x-apify-container-server-readiness-probe` header is set. Otherwise the echo below. |
| `GET /`, `POST /` | `200` JSON echo: `method`, `path`, `query`, `headers`, `body`. A JSON body is parsed; other bodies are returned as text. Other methods on `/` return `405`. |
| `GET /status/{code}` | That status (400–599) with a JSON `{ code, error }` body. |
| `GET /empty` | `204`, no body, no `Content-Type`. |
| `GET /text` | `200` `text/plain`. |
| `GET /binary` | `200` `application/octet-stream`, 256 bytes. |
| `GET /bytes?n=` | `200` `text/plain`, exactly `n` bytes (0 to 1,048,576). |
| `GET /gzip?n=` | Same body as `/bytes`, with `Content-Encoding: gzip`. `n` counts decompressed bytes. |
| `GET /delay?ms=` | Waits `ms` milliseconds (0 to 150,000), then `200` JSON `{ delayedMs }`. |
| `GET /redirect` | `302` with `Location: /`. The target is fixed and never taken from the request. |

Unknown paths return `404` with a JSON `{ code, error }` body; invalid parameters return `400`.

### What the Apify router changes

Checked on production against a single-tenant deployment:

- `Authorization` is removed before the request reaches the Actor, so the echo never contains the caller's token header. A `token` query parameter is consumed as authentication and removed too. A token sent in the `POST /` body or in another query parameter is echoed.
- `X-Apify-Request-Origin` is forwarded.
- Status codes, `Location`, `Content-Encoding: gzip` bodies and response sizes pass through unchanged. The router does not compress responses itself.
- `GET /delay?ms=125000` returns `200` after 125 s, so a 120 s client deadline expires first.
- A request without a token returns `401` from the router.

## Settings outside `actor.json`

Set these in Console on the Actor's **Settings** tab (Actor Standby) in each environment:

- Actor Standby enabled, single-tenant, build `latest`
- Idle timeout 120 s, memory 256 MB
- Max requests per run 40, desired requests per run 30

The request counts matter: under a burst the router starts extra runs in the caller's account instead of returning 429.

## Development

```bash
npm install
npm run lint
npm run format
npm run build
npm test
```

## Resources

- [Apify MCP server documentation](https://docs.apify.com/platform/integrations/mcp)
- [Actor Standby](https://docs.apify.com/platform/actors/running/standby)
