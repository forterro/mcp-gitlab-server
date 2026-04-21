# GitLab MCP Server Operations Runbook

## Purpose

This runbook provides operational procedures for health checks, troubleshooting, upgrades, and rollback decisions.

## Health Checks

### Basic Liveness

1. Verify process is running.
2. Verify `GET /healthz` returns `200` and body `ok`.

### Transport Availability

1. If `USE_STREAMABLE_HTTP=true`, verify `/mcp` accepts MCP initialization.
2. If `USE_SSE=true`, verify `/sse` establishes stream and `/messages` accepts posts.
3. If both are disabled, verify stdio-based client connectivity.

## Common Failure Modes

### 1. Startup failure in PAT mode

Symptoms:

- Process exits at startup.
- Error mentions missing `GITLAB_PERSONAL_ACCESS_TOKEN`.

Checks:

1. Confirm `AUTH_MODE=pat`.
2. Confirm token exists in environment or secret source.
3. Confirm token is non-empty.

Fix:

1. Provide token.
2. Or switch to `AUTH_MODE=oauth` if delegated auth is intended.

### 2. Unauthorized in OAuth mode

Symptoms:

- Session init fails with `401`.

Checks:

1. Confirm client sends `Authorization: Bearer <token>`.
2. Confirm the token is valid for the target `GITLAB_API_URL`.
3. Confirm transport endpoint and mode are aligned.

Fix:

1. Correct token forwarding in gateway/proxy.
2. Re-authenticate and retry session initialization.

### 3. Session errors on remote transport

Symptoms:

- `No valid session ID provided`.
- Session mismatch across requests.

Checks:

1. Ensure the client reuses the transport session ID correctly.
2. Ensure requests for a session are sent to the same endpoint/protocol.
3. Verify stale session cleanup behavior after connection close.

Fix:

1. Reinitialize session.
2. Ensure client and server transport implementations are protocol-aligned.

### 4. Missing write tools

Symptoms:

- Write tools do not appear in `ListTools`.

Checks:

1. Confirm `GITLAB_READ_ONLY_MODE` value.

Fix:

1. Set `GITLAB_READ_ONLY_MODE=false` if write operations are intended.
2. Redeploy/restart and verify tool list again.

## Observability Recommendations

1. Log startup configuration at info level without secrets.
2. Log transport mode and endpoint enablement.
3. Log auth failures with status and reason, but never token contents.
4. Track error rates by endpoint (`/mcp`, `/sse`, `/messages`).

## Upgrade Procedure

1. Build and publish a new immutable version.
2. Deploy in a non-production environment.
3. Execute validation checklist from `docs/USAGE.md`.
4. Verify client compatibility for selected transport(s).
5. Promote progressively to broader environments.

## Rollback Procedure

1. Select the previous known-good immutable version.
2. Redeploy that version through the same deployment workflow.
3. Re-run transport and auth checks.
4. Keep failed version available for root cause analysis.

## Operational Safety Rules

1. Never mutate or force-move existing release tags.
2. Never overwrite published image or chart versions.
3. Always release a new version for fixes.
4. Keep rollback path tested and documented.
