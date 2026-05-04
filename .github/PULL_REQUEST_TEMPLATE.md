<!--
  Thanks for contributing.
  Please read CONTRIBUTING.md, ai_code_of_conduct.md, and CLAUDE.md before opening a PR.
  Security issues do NOT belong here — use https://github.com/yoda-digital/mcp-gitlab-server/security/advisories/new
-->

## Summary

<!-- One paragraph: what this PR changes and why. Link the issue if any. -->

Closes #

## Type of change

- [ ] feat — new functionality
- [ ] fix — bug fix
- [ ] docs — documentation only
- [ ] refactor — code change without behavior change
- [ ] test — adds or improves tests
- [ ] chore — tooling, deps, infra
- [ ] BREAKING CHANGE — incompatible API/behavior change

## Pre-merge checklist

- [ ] `package.json` version bumped per `CLAUDE.md` (MINOR for `feat`, PATCH for `fix`, MAJOR for breaking) — required because push to `main` auto-publishes to npm
- [ ] `CHANGELOG.md` entry added under `## [Unreleased]` (or under a new version section)
- [ ] `npm test` passes (vitest)
- [ ] `npm run build` passes
- [ ] Conventional Commits format on commit subject (`feat:`, `fix:`, `docs:`, `chore:`, `refactor:`, `test:`, `ci:`)
- [ ] No secrets, tokens, or `.env` values in the diff
- [ ] Branch named `feature/*`, `fix/*`, `docs/*`, or `refactor/*`
- [ ] Touching `src/transport.ts`, `src/index.ts`, `src/gitlab-api.ts`, or auth code → extra scrutiny on session lifecycle, token handling, and read-only mode

## For breaking changes

- [ ] `BREAKING CHANGE:` footer in commit message body
- [ ] Migration notes added to `CHANGELOG.md` and `README.md`

## Notes for reviewer

<!-- Edge cases tested, alternatives considered, anything specific to look at. -->
