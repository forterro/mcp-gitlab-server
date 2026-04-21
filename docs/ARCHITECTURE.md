# GitLab MCP Server Architecture

## Scope

This document explains the runtime architecture used by the Forterro fork of `mcp-gitlab-server`, including transport modes, authentication strategies, and deployment boundaries.

## High-Level Components

1. MCP tool server (`src/index.ts`)
2. GitLab API adapter (`src/gitlab-api.ts`)
3. Transport layer (`src/transport.ts`)
4. Helm chart (`chart/`)
5. CI pipeline (`.github/workflows/build.yml`)

## Runtime Data Flow

### PAT Mode (`AUTH_MODE=pat`)

1. The process starts with `GITLAB_PERSONAL_ACCESS_TOKEN`.
2. One MCP `Server` instance is created at startup.
3. Requests are served through the enabled transport(s):
   - `stdio`
   - legacy HTTP + SSE (`/sse`, `/messages`)
   - Streamable HTTP (`/mcp`)
4. Tool handlers invoke `GitLabApi` with the static token.

### OAuth Mode (`AUTH_MODE=oauth`)

1. No static GitLab PAT is required.
2. A bearer token is expected on each session initialization request.
3. A dedicated MCP `Server` + `GitLabApi` instance is created per session.
4. The session is bound to the transport session ID and cleaned up on close.

## Transport Matrix

| Transport | Endpoint(s) | Env Flag | Notes |
| --- | --- | --- | --- |
| stdio | n/a | `USE_SSE=false` and `USE_STREAMABLE_HTTP=false` | Local MCP clients |
| Legacy SSE | `/sse` + `/messages` | `USE_SSE=true` | Backward compatibility |
| Streamable HTTP | `/mcp` | `USE_STREAMABLE_HTTP=true` | Recommended for remote usage |

`USE_SSE` and `USE_STREAMABLE_HTTP` can be enabled together.

## Authentication Model

| Mode | Required Secret | Token Source | Recommended Use |
| --- | --- | --- | --- |
| `pat` | `GITLAB_PERSONAL_ACCESS_TOKEN` | Deployment secret or env var | Service account style automation |
| `oauth` | none | Forwarded bearer token from gateway/proxy | Per-user delegated access |

## Deployment Boundaries

1. Application image and chart are built by GitHub Actions.
2. Chart publication target: `oci://ghcr.io/forterro/charts`.
3. Kargo consumes chart versions from OCI registry.
4. ArgoCD applies promoted versions to clusters.

## Security Notes

1. Prefer `AUTH_MODE=oauth` in shared environments to avoid long-lived PAT distribution.
2. Use `GITLAB_READ_ONLY_MODE=true` where write operations are not needed.
3. Keep `USE_SSE=true` only if legacy clients still depend on `/sse` + `/messages`.
