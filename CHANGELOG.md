# Changelog

All notable changes to this project will be documented in this file.

The format is based on Keep a Changelog, and this project follows Semantic Versioning for release tags.

## [Unreleased]

## [0.3.1] - 2026-04-21

### Added

- Optional OAuth authentication mode with per-session bearer token handling.
- Optional Streamable HTTP transport support on `/mcp`.
- Architecture documentation: `docs/ARCHITECTURE.md`.
- Usage and release workflow documentation: `docs/USAGE.md`.

### Changed

- Transport startup now supports enabling Streamable HTTP and legacy SSE together.
- Helm values include `USE_STREAMABLE_HTTP` and `AUTH_MODE` runtime configuration.
