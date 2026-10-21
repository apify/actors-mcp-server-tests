## Agent Toolbox (example Server Actor)

**An agent is only as good as its tools.** A model can reason, but without tools it cannot read today's web, keep a result, or come back tomorrow. This Actor lists the tools an agent needs, says what goes wrong without each one, and recommends tools for a task. Built for Apify Run.

It is also a test fixture for the [Apify MCP server](https://mcp.apify.com/). It has both interfaces of a Server Actor: an HTTP API documented by an OpenAPI schema (`.actor/openapi.json`) and an input schema with the same fields as the `POST /recommend` body. It has no MCP endpoint.

## What it does

`src/main.ts` picks the entry path from the run's origin:

- **Standby run** (`metaOrigin === 'STANDBY'`): serves the HTTP API on `ACTOR_STANDBY_PORT` until the platform stops the run.
- **Any other run**: validates the input (`task`, `maxTools`), pushes the same recommendation `POST /recommend` returns to the default dataset as one item, and exits.

## Endpoints

| Method and path | Response |
|---|---|
| `GET /tools` | `200` JSON: the motto and every tool (`id`, `name`, `job`, `withoutIt`). |
| `GET /tools/{toolId}` | `200` JSON: one tool. Unknown IDs return `404` with a JSON `{ code, error }` body. |
| `POST /recommend` | `200` JSON: up to `maxTools` tools whose keywords start a word of `task`, most matches first; ties keep catalog order. With no match, the two schema tools. Invalid bodies return `400`. |
| `GET /` | Readiness probe (`200 ok`) when the `x-apify-container-server-readiness-probe` header is set. Otherwise the echo below. |
| `GET /`, `POST /` | `200` JSON echo: `method`, `path`, `query`, `headers`, `body`. A JSON body is parsed; other bodies are returned as text. Other methods on `/` return `405`. |
| `GET /status/{code}` | That status (400–599) with a JSON `{ code, error }` body. |
| `GET /empty` | `204`, no body, no `Content-Type`. |
| `GET /text` | `200` `text/plain`: a short note on why agents need tools. |
| `GET /binary` | `200` `application/octet-stream`, 256 bytes. |
| `GET /bytes?n=` | `200` `text/plain`, exactly `n` bytes (0 to 1,048,576) of `Agents need proper tools. ` repeated. |
| `GET /gzip?n=` | Same body as `/bytes`, with `Content-Encoding: gzip`. `n` counts decompressed bytes. |
| `GET /delay?ms=` | Waits `ms` milliseconds (0 to 150,000), then `200` JSON `{ delayedMs, note }`. |
| `GET /redirect` | `302` with `Location: /`. The target is fixed and never taken from the request. |

Unknown paths return `404` with a JSON `{ code, error }` body; invalid parameters return `400`.

### What the Apify router changes

Checked on production against a single-tenant deployment:

- `Authorization` is removed before the request reaches the Actor, so the echo never contains the caller's token header. A `token` query parameter is consumed as authentication and removed too. A token sent in the `POST /` body or in another query parameter is echoed.
- `X-Apify-Request-Origin` is forwarded.
- Status codes, `Location`, `Content-Encoding: gzip` bodies and response sizes pass through unchanged. The router does not compress responses itself.
- `GET /delay?ms=125000` returns `200` after 125 s, so a 120 s client deadline expires first.
- A request without a token returns `401` from the router.

### Example

```bash
curl -X POST https://example-server-actor.apify.actor/recommend \
  -H "Authorization: Bearer $APIFY_TOKEN" -H 'Content-Type: application/json' \
  -d '{"task": "Track competitor prices every day and save them to a CSV"}'
```

```json
{
    "task": "Track competitor prices every day and save them to a CSV",
    "maxTools": 3,
    "tools": [
        { "id": "storage", "name": "Storage", "job": "Keeps results after the run ends.", "withoutIt": "The work disappears with the context window.", "matched": ["sav", "csv"] },
        { "id": "scheduler", "name": "Scheduler", "job": "Runs the job again tomorrow morning.", "withoutIt": "The agent promises to check back and never does.", "matched": ["every", "track"] },
        { "id": "scraper", "name": "Scraper", "job": "Turns a website into rows.", "withoutIt": "The agent copies tables by hand, one hallucinated cell at a time.", "matched": ["price"] }
    ],
    "motto": "An agent is only as good as its tools."
}
```

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
