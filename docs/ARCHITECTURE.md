# GitLab MCP Server Architecture

## Purpose

This document describes the runtime architecture of the GitLab MCP server and explains how authentication, transports, and tool execution interact.

## Design Goals

1. Provide broad GitLab API coverage through MCP tools.
2. Support both local and remote MCP clients.
3. Support both static token and delegated bearer-token authentication.
4. Keep backward compatibility for older SSE clients while enabling Streamable HTTP.
5. Keep transport and authentication concerns separated from tool logic.

## Major Building Blocks

1. `src/index.ts`
Responsible for configuration, tool registration, and MCP server creation.

2. `src/transport.ts`
Responsible for stdio, legacy SSE, and Streamable HTTP runtime wiring.

3. `src/gitlab-api.ts`
Responsible for GitLab REST calls and response validation.

4. `src/schemas.ts` and `src/formatters.ts`
Responsible for input validation and normalized response formatting.

## Architecture Overview

```text
Client (MCP)
   |
   |  stdio OR HTTP transport
   v
Transport Layer (stdio, /sse + /messages, /mcp)
   |
   v
MCP Server Instance
   |
   v
Tool Handler (validated args)
   |
   v
GitLabApi (Bearer token)
   |
   v
GitLab REST API
```

## Authentication Architecture

### PAT Mode (`AUTH_MODE=pat`)

1. A single token is provided at process startup via `GITLAB_PERSONAL_ACCESS_TOKEN`.
2. A single MCP `Server` instance is created and reused.
3. All sessions use the same GitLab identity.

### OAuth Mode (`AUTH_MODE=oauth`)

1. No static token is required.
2. Each new remote transport session is initialized with `Authorization: Bearer <token>`.
3. A dedicated `Server` and `GitLabApi` are created per session.
4. Session resources are released when the transport closes.

This model enables per-user delegated permissions while preserving stateless process startup.

## Transport Architecture

| Transport | Endpoints | Enabled By | Typical Use |
| --- | --- | --- | --- |
| stdio | n/a | `USE_SSE=false` and `USE_STREAMABLE_HTTP=false` | Local MCP host process |
| Legacy SSE | `GET /sse`, `POST /messages` | `USE_SSE=true` | Compatibility with older clients |
| Streamable HTTP | `/mcp` | `USE_STREAMABLE_HTTP=true` | Recommended remote transport |

`USE_SSE` and `USE_STREAMABLE_HTTP` may be enabled at the same time.

## Request Lifecycle

### Common Lifecycle

1. Incoming request is accepted by the active transport.
2. MCP request is routed to a tool handler.
3. Input is validated against Zod schemas.
4. Handler invokes `GitLabApi`.
5. GitLab response is validated and normalized.
6. MCP response is returned to the client.

### Streamable HTTP Session Lifecycle

1. Client initializes a session on `/mcp`.
2. Server creates or reuses the matching transport by session ID.
3. Session ID is bound to a transport instance.
4. Close event removes transport from memory.

## Read-Only Execution Path

When `GITLAB_READ_ONLY_MODE=true`:

1. Only read-only tools are exposed by `ListTools`.
2. Write-capable handlers are not surfaced to clients.
3. The same authentication and transport model still applies.

## Error Handling Strategy

1. Invalid input returns validation errors before any GitLab call.
2. Missing bearer token in OAuth mode returns `401` during session initialization.
3. Unknown or stale session IDs return transport-level `400` errors.
4. Upstream API failures are mapped to MCP errors.

## Performance and Capacity Notes

1. PAT mode is lower overhead due to a single long-lived server instance.
2. OAuth mode adds per-session object allocation for stronger isolation.
3. Large responses depend mostly on GitLab API latency and payload size.
4. Remote transport throughput depends on client behavior and network buffering.

## Security Notes

1. Prefer OAuth mode for multi-user environments.
2. Use least-privilege tokens regardless of auth mode.
3. Enable read-only mode for discovery-only deployments.
4. Keep legacy SSE enabled only when required by clients.

## Extensibility Guidance

1. Add new tools in `src/index.ts` with schema-first validation.
2. Keep transport changes isolated in `src/transport.ts`.
3. Keep API contracts typed and validated in `src/gitlab-api.ts`.
4. Update `docs/USAGE.md` and `docs/OPERATIONS.md` with behavior changes.
