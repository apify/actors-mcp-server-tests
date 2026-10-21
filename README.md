## Apify MCP Server Test Actors

This repository contains three Apify Actors used for testing the [Apify MCP server](https://mcp.apify.com/) integration. Each Actor lives in its own subdirectory and is built and deployed independently.

## Actors

- [`mcp-server-actor/`](./mcp-server-actor) — Runs as an MCP server via [Apify Standby](https://docs.apify.com/platform/actors/running/standby), exposing the MCP endpoint at `POST /mcp`.
- [`normal-actor/`](./normal-actor) — Runs as a regular one-shot Actor. Reads `firstNumber` and `secondNumber` (and an optional `waitSeconds`) from input, pushes `{ firstNumber, secondNumber, sum }` to the default dataset, and exits.
- [`server-actor/`](./server-actor) — Agent Toolbox, a Server Actor with both interfaces. In Standby it serves an HTTP API documented by an OpenAPI schema: the tools an agent needs, tool recommendations for a task, and test endpoints (echo, status codes, content types, sizes, delays, redirect). A normal run pushes the recommendation for its input to the default dataset and exits.

The Actors share no source code at runtime, only structure.

## Getting started

Run a specific Actor locally:

```bash
cd mcp-server-actor   # or: cd normal-actor, cd server-actor
apify run
```

Deploy a specific Actor:

```bash
cd mcp-server-actor   # or: cd normal-actor, cd server-actor
apify push
```

## Resources

- [Apify MCP server documentation](https://docs.apify.com/platform/integrations/mcp)
- [Apify MCP server configuration](https://mcp.apify.com/)
- [MCP Streamable HTTP transport spec](https://modelcontextprotocol.io/specification/2025-06-18/basic/transports#streamable-http)
