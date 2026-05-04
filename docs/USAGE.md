# GitLab MCP Server Usage Guide

## Overview

This guide covers configuration, runtime profiles, deployment examples, and release workflow for the GitLab MCP server.

For architecture details, see `docs/ARCHITECTURE.md`.
For troubleshooting and operational runbooks, see `docs/OPERATIONS.md`.

## Configuration Reference

| Variable | Default | Required | Description |
| --- | --- | --- | --- |
| `GITLAB_API_URL` | `https://gitlab.com/api/v4` | No | GitLab API base URL |
| `AUTH_MODE` | `pat` | No | Authentication mode: `pat` or `oauth` |
| `GITLAB_PERSONAL_ACCESS_TOKEN` | none | In `pat` mode | Token used by `GitLabApi` |
| `GITLAB_READ_ONLY_MODE` | `false` | No | Expose read-only tools only |
| `USE_SSE` | `false` | No | Enable legacy SSE endpoints (`/sse`, `/messages`) |
| `USE_STREAMABLE_HTTP` | `false` | No | Enable Streamable HTTP endpoint (`/mcp`) |
| `PORT` | `3000` | No | HTTP listen port |

## Authentication Profiles

### Profile A: PAT + stdio (local development)

```bash
AUTH_MODE=pat
GITLAB_PERSONAL_ACCESS_TOKEN=<token>
USE_SSE=false
USE_STREAMABLE_HTTP=false
```

Behavior:

1. Single long-lived server instance.
2. Single GitLab identity.
3. No HTTP endpoints.

### Profile B: OAuth + Streamable HTTP (recommended for remote)

```bash
AUTH_MODE=oauth
USE_STREAMABLE_HTTP=true
USE_SSE=false
GITLAB_READ_ONLY_MODE=true
```

Behavior:

1. Session is initialized over `/mcp`.
2. Bearer token is provided per session.
3. Session-scoped server and API client are created and cleaned up automatically.

### Profile C: OAuth + Streamable HTTP + legacy SSE (migration window)

```bash
AUTH_MODE=oauth
USE_STREAMABLE_HTTP=true
USE_SSE=true
```

Behavior:

1. New clients can use `/mcp`.
2. Existing clients can continue using `/sse` + `/messages`.
3. Allows incremental migration without downtime.

## Deployment Example (Helm Values)

```yaml
gitlab-mcp:
  enabled: true
  config:
    GITLAB_API_URL: "https://gitlab.example.internal/api/v4"
    AUTH_MODE: "oauth"
    USE_STREAMABLE_HTTP: "true"
    USE_SSE: "false"
    GITLAB_READ_ONLY_MODE: "true"
    PORT: "3000"
  existingSecret: ""
```

PAT mode variant:

```yaml
gitlab-mcp:
  config:
    AUTH_MODE: "pat"
    USE_STREAMABLE_HTTP: "true"
  existingSecret: "gitlab-mcp-token"
```

## Transport Endpoint Summary

| Transport | Method(s) | Endpoint | Notes |
| --- | --- | --- | --- |
| Streamable HTTP | `GET`, `POST`, `DELETE` | `/mcp` | Recommended remote MCP transport |
| Legacy SSE stream | `GET` | `/sse` | Backward compatibility path |
| Legacy SSE message post | `POST` | `/messages` | Requires `sessionId` query parameter |
| Health check | `GET` | `/healthz` | Returns `200 ok` |

## Security Guidance

1. Prefer `AUTH_MODE=oauth` for multi-user deployments.
2. Keep `GITLAB_READ_ONLY_MODE=true` unless write actions are explicitly required.
3. Use token scopes aligned to minimum required GitLab permissions.
4. Avoid embedding PAT values directly in plain-text values files.

## Release Workflow

1. Implement and test changes.
2. Commit to a branch and push.
3. Open and merge PR according to repository policy.
4. Create an immutable release tag `vX.Y.Z`.
5. Push tag to trigger CI.
6. CI builds and publishes artifacts:
   - `<container-registry>/<image-name>:<version>`
   - `oci://<oci-registry>/<chart-name>-<version>.tgz`
7. Promote/deploy through your target environment workflow.

## Validation Checklist

1. `/healthz` responds `200`.
2. `ListTools` output matches read-only setting.
3. OAuth mode rejects missing bearer token with `401`.
4. Streamable HTTP requests succeed on `/mcp` when enabled.
5. Legacy `/sse` endpoints are disabled when `USE_SSE=false`.
