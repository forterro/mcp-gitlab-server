# GitLab MCP Server Usage Guide

## Configuration

Core environment variables:

| Variable | Default | Description |
| --- | --- | --- |
| `GITLAB_API_URL` | `https://gitlab.com/api/v4` | GitLab API endpoint |
| `AUTH_MODE` | `pat` | `pat` or `oauth` |
| `GITLAB_PERSONAL_ACCESS_TOKEN` | none | Required only in `pat` mode |
| `GITLAB_READ_ONLY_MODE` | `false` | Expose only read tools |
| `USE_SSE` | `false` | Enable legacy `/sse` transport |
| `USE_STREAMABLE_HTTP` | `false` | Enable `/mcp` Streamable HTTP transport |
| `PORT` | `3000` | HTTP port for SSE/Streamable modes |

## Recommended Profiles

### Local Development (stdio)

```bash
AUTH_MODE=pat
GITLAB_PERSONAL_ACCESS_TOKEN=<token>
USE_SSE=false
USE_STREAMABLE_HTTP=false
```

### Dev Cluster (OAuth + Streamable HTTP)

```bash
AUTH_MODE=oauth
USE_STREAMABLE_HTTP=true
USE_SSE=false
GITLAB_READ_ONLY_MODE=true
```

### Compatibility Mode (OAuth + Streamable + SSE)

```bash
AUTH_MODE=oauth
USE_STREAMABLE_HTTP=true
USE_SSE=true
```

## Helm Values Example

```yaml
gitlab-mcp:
  enabled: true
  config:
    GITLAB_API_URL: "https://gitlab.example.internal/api/v4"
    AUTH_MODE: "oauth"
    USE_STREAMABLE_HTTP: "true"
    USE_SSE: "false"
    GITLAB_READ_ONLY_MODE: "true"
  existingSecret: ""
```

## Release Workflow

1. Commit changes on your working branch.
2. Push branch to GitHub.
3. Create an immutable Git tag `vX.Y.Z`.
4. Push tag to GitHub.
5. GitHub Actions builds and publishes:
   - image: `ghcr.io/forterro/mcp-gitlab-server:<version>`
   - chart: `oci://ghcr.io/forterro/charts/gitlab-mcp-<version>.tgz`
6. Promote the resulting chart version through Kargo.

## Operational Notes

1. Do not force-push tags. If a release is wrong, create a new version.
2. Keep `existingSecret` empty in OAuth mode.
3. Use a stable gateway/proxy to forward bearer tokens to the MCP server.
