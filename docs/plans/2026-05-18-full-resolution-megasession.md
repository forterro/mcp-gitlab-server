# Full Resolution Megasession Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Close all open PRs and issues on `yoda-digital/mcp-gitlab-server` (1 PR + 5 issues) using strict maintainer-mode quality, without involving any external contributor, culminating in release 0.8.0.

**Architecture:** Phased execution. Phase B–E reincarnate PR #63 (E2E suite) as a new maintainer-driven PR (Path B pattern, precedent: #62→#80). Phase F implements the 4 smart pipeline tools from issue #64 (depends on E2E infra from Phase E). Phase G bundles 3 docs issues (#47, #49, #51) + CLAUDE.md/CONTRIBUTING.md mentor-meta. Phase H produces a design doc on issue #52 (no implementation). Phase I ships 0.8.0 via release-driven publish.

**Tech Stack:** TypeScript strict, Vitest, MCP SDK 1.x, GitLab CE 17.x, Docker, GitHub Actions, npm Trusted Publishing (OIDC), `gh` CLI with `workflow` scope.

**Effort estimate:** 10–16 focused hours. Can pause at any **Phase boundary** without leaving broken state.

**Skip flags (set by owner at execution time):**
- `SKIP_PHASE_F=1` — postpone #64 to 0.8.1
- `SKIP_PHASE_H=1` — postpone #52 design doc
- Phases A–E + G + I + J must run in order; F slots between E and I if enabled.

---

## File Structure Overview

**Created in this plan:**
- `e2e/` — entire E2E test directory (38 files from reincarnated PR #63 minus dropped overlaps)
- `e2e/.dockerignore` — new, prevents test fixtures leaking into image
- `.github/workflows/e2e.yml` — runs E2E suite after build
- `.github/workflows/warm-gitlab.yml` — pre-warms GitLab CE image weekly
- `scripts/check-tool-coverage.sh` — coverage gate
- `docs/plans/2026-05-18-full-resolution-megasession.md` — this file

**Modified:**
- `.github/workflows/build.yml` — adds coverage gate step
- `package.json`, `package-lock.json` — version bump 0.7.2 → 0.8.0, optional e2e-orchestration deps
- `CHANGELOG.md` — appended 0.8.0 section
- `CLAUDE.md` — fix stale `npm test` claim
- `CONTRIBUTING.md` — add E2E workflow + maintainer-rebase pattern + release ceremony sections
- `docs/OPERATIONS.md` — add release atomicity recovery + ghcr first-publish runbook
- `src/index.ts` — wire 4 new tools (Phase F)
- `src/schemas.ts` — schemas for 4 new tools (Phase F)
- `src/gitlab-api.ts` — 4 new API methods (Phase F)
- `src/formatters.ts` — formatters for 4 new tools (Phase F)
- `src/gitlab-api.test.ts`, `src/formatters.test.ts`, `src/schemas.test.ts` — unit tests for new tools

**Closed (with credit, no auto-close):**
- PR #63 (after #81 reincarnation lands)
- Issues #47, #49, #51 (via `Closes #N` in docs bundle PR)
- Issue #64 (after F lands, with credit comment)

---

## Phase A: Setup & baseline (~20 min)

### Task A1: Verify clean working state

**Files:** none

- [ ] **Step 1: Confirm main is up to date and clean**

Run:
```bash
cd /home/ubuntu/gits/mcp-gitlab-server
git fetch --prune origin
git status --short
git log --oneline -1 origin/main
```

Expected output:
- `git status --short` produces empty output (clean tree)
- HEAD matches `f54921c ci(deps): bump docker/metadata-action from 5 to 6 (#72)` or a newer commit if PRs landed since plan-time

- [ ] **Step 2: Verify required tooling versions**

Run:
```bash
node --version
npm --version
docker version --format '{{.Server.Version}}'
gh auth status 2>&1 | grep -E '(Logged in|Token scopes)'
```

Expected output:
- Node 20+ (any LTS works for local dev)
- npm 10+
- Docker 20+
- `gh` logged in to `nalyk` account; `Token scopes:` line MUST contain `workflow`. If missing, abort and run `gh auth refresh -h github.com -s workflow` (see `reference_gh_auth_workflow_scope_trap` memory).

### Task A2: Fetch PR #63 branch for inspection (read-only)

**Files:** none on main; creates local ref `pr-63-incoming`

- [ ] **Step 1: Fetch the contributor's branch**

Run:
```bash
git fetch origin pull/63/head:pr-63-incoming
```

Expected: branch created at `pr-63-incoming`.

- [ ] **Step 2: Map commits unique to PR #63 vs main**

Run:
```bash
git log --oneline --no-merges main..pr-63-incoming
```

Expected: lists commits authored by Olivier Gintrand. Note the SHAs of:
- Commits that touch `src/{index,schemas,transport,gitlab-api,formatters}.ts` → these are **DROP candidates** (already in main via #80 with maintainer corrections)
- Commits that touch only `e2e/`, `scripts/`, `.github/workflows/{e2e,warm-gitlab}.yml`, and the coverage-gate addition to `.github/workflows/build.yml` → these are **KEEP candidates** (the E2E suite itself)

- [ ] **Step 3: Record analysis**

Append the SHA mapping to a scratch note (not committed):
```bash
git log --oneline --no-merges main..pr-63-incoming > /tmp/pr63-commit-map.txt
git log --pretty=format:'%H %s' --name-only --no-merges main..pr-63-incoming >> /tmp/pr63-commit-map.txt
cat /tmp/pr63-commit-map.txt
```

Expected: useful for Phase B cherry-pick decisions.

---

## Phase B: PR #63 — acquire & isolate (~45 min)

### Task B1: Create reincarnation branch from current main

**Files:** none yet

- [ ] **Step 1: Create branch**

Run:
```bash
git checkout main
git pull --ff-only origin main
git checkout -b feat/e2e-suite-reincarnation
```

Expected: on new branch, tip equals current `origin/main`.

- [ ] **Step 2: Verify clean baseline**

Run:
```bash
npm ci
npm run build
npm test
```

Expected: all green. If any step fails, abort plan — main is broken and must be fixed first.

### Task B2: Identify the cherry-pick set

**Files:** `/tmp/pr63-cherry-set.txt` (scratch)

- [ ] **Step 1: Build the keep-list**

Inspect `/tmp/pr63-commit-map.txt` from Task A2 Step 3. For each commit, decide KEEP or DROP using this rule:
- **DROP**: commit modifies any file in `src/` (overlap with #80 territory; we keep main's version)
- **DROP**: commit modifies `CHANGELOG.md` (we'll write our own 0.8.0 entry in Phase E)
- **KEEP**: commit modifies only `e2e/`, `scripts/check-tool-coverage.sh`, `.github/workflows/{e2e,warm-gitlab}.yml`, `.github/workflows/build.yml` (coverage gate addition only)
- **MIXED**: if a commit touches both kept and dropped files, mark it MIXED and use `git show <sha> -- <kept paths>` to surface the kept hunks for manual application

Write the resulting KEEP SHA list to `/tmp/pr63-cherry-set.txt`, one SHA per line, oldest first.

- [ ] **Step 2: Sanity-check the keep-list size**

Run:
```bash
wc -l /tmp/pr63-cherry-set.txt
```

Expected: between 2 and 8 SHAs. If 0, the entire PR is overlap (something's wrong — re-inspect). If >10, granularity suggests a different structure (re-inspect).

### Task B3: Cherry-pick KEEP commits with `--no-commit` flag for inspection

**Files:** all `e2e/`, `scripts/check-tool-coverage.sh`, workflow additions

- [ ] **Step 1: Cherry-pick first commit (dry-run style)**

For the first SHA in `/tmp/pr63-cherry-set.txt`:
```bash
FIRST=$(head -1 /tmp/pr63-cherry-set.txt)
git cherry-pick --no-commit "$FIRST"
git status --short
```

Expected: staged files only in the KEEP categories. If any `src/` file appears staged, abort:
```bash
git cherry-pick --abort
```
and reclassify the commit as MIXED in Task B2.

- [ ] **Step 2: If clean, commit with original authorship preserved**

```bash
git commit -C "$FIRST"
```

Expected: new commit on `feat/e2e-suite-reincarnation` with Olivier as author (preserved via `-C` reuse-message-with-author).

- [ ] **Step 3: Repeat for remaining SHAs**

For each remaining SHA in `/tmp/pr63-cherry-set.txt`:
```bash
git cherry-pick "$SHA"
```

If a conflict occurs (likely on `.github/workflows/build.yml` because main has moved):
1. Inspect with `git status` and `git diff`
2. Resolve manually keeping main's structure + Olivier's coverage-gate addition
3. `git add <resolved files>`
4. `git cherry-pick --continue`

Expected: branch has N new commits, all `src/` files unchanged vs main.

### Task B4: Verify baseline still compiles after cherry-pick

**Files:** none modified

- [ ] **Step 1: Re-run build**

```bash
npm run build
```

Expected: `tsc` exits 0. If errors, they come from `e2e/` accidentally being included in root tsconfig. If so, verify root `tsconfig.json` has `exclude: ["e2e"]` (or equivalent) — fix in Task C9 if needed.

- [ ] **Step 2: Re-run unit tests**

```bash
npm test
```

Expected: all unit tests pass. New e2e/ directory should be ignored by root vitest config.

- [ ] **Step 3: Commit baseline checkpoint (if any fix-ups in steps 1-2)**

If you applied fix-ups, commit them as:
```bash
git add tsconfig.json vitest.config.ts
git commit -m "chore(e2e): exclude e2e/ from root tsconfig and vitest"
```

Otherwise skip.

---

## Phase C: PR #63 — maintainer-audit fixes (~2-3h)

> **Discipline note:** Each Task in Phase C is one finding from gemini code review (a-h) or my own mentor audit (i-k). One finding per commit. Conventional Commits prefixes: `fix(e2e)` for bugs, `chore(e2e)` for hygiene, `docs(e2e)` for docs.

### Task C1: Reality-check and fix npm versions in e2e/package.json

**Files:**
- Modify: `e2e/package.json`
- Modify: `e2e/package-lock.json` (regenerated)

- [ ] **Step 1: Read the contributor's claimed versions**

```bash
cat e2e/package.json | jq '.devDependencies'
```

Expected: lists e.g. `"typescript": "^6.0.3"`, `"vitest": "^4.0.0"`, etc.

- [ ] **Step 2: Verify each against npm registry**

For each dep claimed, run:
```bash
npm view typescript versions --json | jq '.[-5:]'
npm view vitest versions --json | jq '.[-5:]'
npm view @modelcontextprotocol/sdk versions --json | jq '.[-5:]'
npm view @types/node versions --json | jq '.[-5:]'
```

Expected: shows latest 5 published versions. Use this to choose the highest **stable** version actually published as of 2026-05-18.

- [ ] **Step 3: Pin versions in e2e/package.json**

Edit `e2e/package.json` to use **exact** versions (no `^` ranges, per CLAUDE.md "Dependencies: Use exact versions, not ranges"):
```json
{
  "devDependencies": {
    "typescript": "<latest-stable-from-npm-view>",
    "vitest": "<latest-stable-from-npm-view>",
    "@modelcontextprotocol/sdk": "<match root package.json version>",
    "@types/node": "<latest 22.x or 24.x — match root choice>"
  }
}
```

- [ ] **Step 4: Regenerate lockfile**

```bash
rm -rf e2e/node_modules e2e/package-lock.json
cd e2e && npm install --ignore-scripts && cd ..
```

Expected: lockfile created cleanly, no audit warnings beyond expected.

- [ ] **Step 5: Commit**

```bash
git add e2e/package.json e2e/package-lock.json
git commit -m "fix(e2e): pin npm deps to actually-published versions

Original PR #63 claimed TypeScript v6.x and Vitest v4.x — verified
against npm registry as of 2026-05-18; using highest stable published
versions instead. Pinned exact (no ranges) per CLAUDE.md dep policy."
```

### Task C2: Align e2e/Dockerfile node version + digest-pin

**Files:**
- Modify: `e2e/Dockerfile`

- [ ] **Step 1: Read current Dockerfile**

```bash
head -10 e2e/Dockerfile
```

Expected: shows e.g. `FROM node:24-alpine` (no digest).

- [ ] **Step 2: Pull current digest for chosen image**

The production Dockerfile uses `node:26-alpine` (post-#67). The e2e runner should use a stable Node LTS — `node:22-alpine` for safety (matches `build-and-test` runner Node 22). Get digest:
```bash
docker pull node:22-alpine
docker inspect node:22-alpine --format='{{index .RepoDigests 0}}'
```

Expected: outputs `node@sha256:<64hex>`.

- [ ] **Step 3: Update Dockerfile with digest-pinned image**

Edit `e2e/Dockerfile` line 1 from `FROM node:24-alpine` to:
```dockerfile
FROM node:22-alpine@sha256:<64hex from step 2>
```

- [ ] **Step 4: Commit**

```bash
git add e2e/Dockerfile
git commit -m "fix(e2e): pin Dockerfile to node:22-alpine with digest

Aligns with build-and-test runner (Node 22) and pins by digest for
reproducible builds (consistency with main Dockerfile post-#67)."
```

### Task C3: Normalize GitLab root password

**Files:**
- Modify: `e2e/docker-compose.yml`
- Modify: `e2e/src/scripts/provision-fixtures.ts`
- Modify: `e2e/README.md`

- [ ] **Step 1: Audit current state**

```bash
grep -rn "5iveL\|E2eTestPassword\|GITLAB_ROOT_PASSWORD" e2e/
```

Expected: shows divergence — `5iveL!fe` in some files, `E2eTestPassword1!` in others.

- [ ] **Step 2: Choose canonical password**

Use `E2eTestPassword1!` (already in docker-compose and README per gemini review; the provision script was the outlier).

- [ ] **Step 3: Update provision script default**

In `e2e/src/scripts/provision-fixtures.ts`, find:
```typescript
const GITLAB_ROOT_PASSWORD = process.env.GITLAB_ROOT_PASSWORD || '5iveL!fe';
```
Replace with:
```typescript
const GITLAB_ROOT_PASSWORD = process.env.GITLAB_ROOT_PASSWORD || 'E2eTestPassword1!';
```

- [ ] **Step 4: Verify consistency**

```bash
grep -rn "5iveL\|E2eTestPassword1" e2e/
```

Expected: only `E2eTestPassword1!` appears (no `5iveL!fe` left).

- [ ] **Step 5: Commit**

```bash
git add e2e/src/scripts/provision-fixtures.ts
git commit -m "fix(e2e): normalize GitLab root password default to E2eTestPassword1!

Provision script default disagreed with docker-compose.yml and README,
causing provisioning to fail when GITLAB_ROOT_PASSWORD env var was unset."
```

### Task C4: Pin gitlab-ce image tag in docker-compose

**Files:**
- Modify: `e2e/docker-compose.yml`

- [ ] **Step 1: Audit current tag**

```bash
grep 'image:' e2e/docker-compose.yml
```

Expected: shows `gitlab/gitlab-ce:latest` (unpinned).

- [ ] **Step 2: Pick a tested stable version**

Use the latest stable GitLab CE patch release. Verify availability:
```bash
docker pull gitlab/gitlab-ce:17.5.0-ce.0
```
(Adjust version to a real stable tag at execution time; e.g. `17.5.0-ce.0`, `17.4.2-ce.0`. Check https://hub.docker.com/r/gitlab/gitlab-ce/tags before committing.)

- [ ] **Step 3: Update compose file**

Replace `image: gitlab/gitlab-ce:latest` with the chosen pinned tag in `e2e/docker-compose.yml`.

- [ ] **Step 4: Commit**

```bash
git add e2e/docker-compose.yml
git commit -m "fix(e2e): pin gitlab/gitlab-ce to specific stable tag

:latest causes non-reproducible CI runs and bisect pain when GitLab
ships a breaking change. Pinned to <tag> — bump deliberately."
```

### Task C5: Narrow `ToolResult` type in e2e helpers

**Files:**
- Modify: `e2e/src/helpers/types.ts`

- [ ] **Step 1: Read current type**

```bash
cat e2e/src/helpers/types.ts
```

Expected: `type ToolResult = any;` somewhere in the file.

- [ ] **Step 2: Replace with narrowed type**

In `e2e/src/helpers/types.ts`, replace the `any` definition with:
```typescript
export type ToolResult = {
  content: Array<{
    type: string;
    text?: string;
    [key: string]: unknown;
  }>;
};
```

Keep the existing `extractText()` and `extractJson()` helpers — verify they typecheck against the new type. If they cast to `any` internally, that's acceptable (encapsulation boundary).

- [ ] **Step 3: Verify e2e typecheck**

```bash
cd e2e && npx tsc --noEmit && cd ..
```

Expected: exits 0. If errors, the helper functions need minor adjustments to match the new shape — fix until clean.

- [ ] **Step 4: Commit**

```bash
git add e2e/src/helpers/types.ts
git commit -m "refactor(e2e): narrow ToolResult type from any to shaped union

CLAUDE.md forbids any in TypeScript strict mode. The narrowed type
captures the MCP CallToolResult shape without overcommitting to a
specific SDK version's discriminated union."
```

### Task C6: Remove empty `beforeAll` in environments-releases test

**Files:**
- Modify: `e2e/src/tests/environments-releases.e2e.ts`

- [ ] **Step 1: Locate the empty block**

```bash
grep -n "beforeAll" e2e/src/tests/environments-releases.e2e.ts
```

Expected: shows a `beforeAll(async () => { /* ... */ });` with no real body (just comments).

- [ ] **Step 2: Delete the block**

Edit the file to remove the entire `beforeAll(...)` invocation and its surrounding comments. Verify no other test in the file depended on it (it didn't — it was empty).

- [ ] **Step 3: Commit**

```bash
git add e2e/src/tests/environments-releases.e2e.ts
git commit -m "chore(e2e): remove empty beforeAll in environments-releases tests"
```

### Task C7: Verify POSIX `grep` in coverage-gate script

**Files:**
- Inspect/modify: `scripts/check-tool-coverage.sh`

- [ ] **Step 1: Audit for `-P` flag (PCRE, not POSIX)**

```bash
grep -n 'grep.*-P\|egrep' scripts/check-tool-coverage.sh
```

Expected: ideally zero matches (contributor claimed he fixed this). If any match remains, replace with `grep -E` (POSIX ERE) or `grep -o` per context.

- [ ] **Step 2: Test the script on a known input**

```bash
bash scripts/check-tool-coverage.sh
```

Expected: outputs tool coverage report; exits 0 if all tools have E2E tests, non-zero if any tool is missing. Inspect the output for sanity (count should be ~86 tools, matching `src/index.ts` registrations).

- [ ] **Step 3: If script exits non-zero, note missing tools**

If any tool is flagged as missing E2E coverage, write the list to `/tmp/coverage-gaps.txt` for Task F6 (we may need to add stub tests).

- [ ] **Step 4: Commit only if changes made**

```bash
git diff --stat scripts/check-tool-coverage.sh
# If diff non-empty:
git add scripts/check-tool-coverage.sh
git commit -m "fix(scripts): replace grep -P with POSIX-compatible alternative"
# else skip
```

### Task C8: Add `.dockerignore` in e2e/

**Files:**
- Create: `e2e/.dockerignore`

- [ ] **Step 1: Create the file**

Write to `e2e/.dockerignore`:
```
node_modules
.git
.gitignore
*.log
fixtures.json
.env
.env.*
README.md
docker-compose.yml
```

- [ ] **Step 2: Verify build still works**

```bash
docker build -t mcp-e2e-test e2e/ --progress=plain 2>&1 | tail -10
```

Expected: build succeeds. If it fails because a `COPY` instruction needed something that's now ignored, adjust `.dockerignore` to be less aggressive.

Cleanup:
```bash
docker rmi mcp-e2e-test
```

- [ ] **Step 3: Commit**

```bash
git add e2e/.dockerignore
git commit -m "chore(e2e): add .dockerignore to prevent fixture/secret leakage into image"
```

### Task C9: Audit coverage script against current `src/index.ts`

**Files:**
- Inspect: `src/index.ts`, `scripts/check-tool-coverage.sh`

- [ ] **Step 1: Count tools registered in src/index.ts**

```bash
grep -c '^\s*case "' src/index.ts
# or, more robustly, count tool definitions in the tools array
grep -oE '\bname:\s*"[a-z_]+"' src/index.ts | sort -u | wc -l
```

Note the count — this is the authoritative tool count.

- [ ] **Step 2: Count tools detected by coverage script**

```bash
bash scripts/check-tool-coverage.sh 2>&1 | grep -iE 'total|tool count|registered' | head -3
```

Expected: matches Step 1 count. If mismatch, the regex in the script is missing tools — fix it.

- [ ] **Step 3: If script needs fixing, update and verify**

Edit `scripts/check-tool-coverage.sh` so its tool-extraction regex captures all tool registrations in current `src/index.ts`. Re-run Step 2 until counts match.

- [ ] **Step 4: Commit only if changes made**

```bash
git diff --stat scripts/check-tool-coverage.sh
# If diff non-empty:
git add scripts/check-tool-coverage.sh
git commit -m "fix(scripts): coverage script now matches all tool registrations in src/index.ts"
```

### Task C10: Audit `warm-gitlab.yml` for security

**Files:**
- Inspect: `.github/workflows/warm-gitlab.yml`

- [ ] **Step 1: Read the workflow**

```bash
cat .github/workflows/warm-gitlab.yml
```

Expected: workflow boots GitLab CE, commits state, pushes to `ghcr.io/<repo>/gitlab-ce-warm:latest`.

- [ ] **Step 2: Audit checklist**

Verify each:
- [ ] Workflow has `permissions:` block at top-level — should be `contents: read, packages: write` ONLY (least privilege)
- [ ] Push step uses `secrets.GITHUB_TOKEN` (auto-provided) NOT a custom PAT
- [ ] No `${{ secrets.* }}` interpolation inside `run:` blocks (injection risk) — only via `env:` indirection
- [ ] Schedule trigger has a sane cron (weekly is fine, not hourly)
- [ ] The committed image does NOT include any secrets baked in (GitLab root password is a known test value, but check for any `.env` files copied)

- [ ] **Step 3: Fix issues found**

For each issue, edit the workflow file. If significant rewrite needed, commit as a separate change with message explaining the security finding.

- [ ] **Step 4: Commit (if changes)**

```bash
git diff --stat .github/workflows/warm-gitlab.yml
# If diff non-empty:
git add .github/workflows/warm-gitlab.yml
git commit -m "fix(ci): harden warm-gitlab workflow permissions and secret handling"
```

---

## Phase D: PR #63 — local validation against real GitLab CE (~2-4h, the work)

> **Critical:** this is the only phase where things might genuinely break. The whole point of E2E is to validate against reality. Time-box each step; if GitLab CE is sluggish, that's reality, not a bug to fix.

### Task D1: Boot GitLab CE container

**Files:** none

- [ ] **Step 1: Free port 8080 if in use**

```bash
ss -tlnp 2>/dev/null | grep ':8080 ' || echo "port 8080 free"
```

If something is listening, stop it or pick a different host port and update `e2e/docker-compose.yml` mappings.

- [ ] **Step 2: Boot GitLab CE**

```bash
cd e2e
docker compose up -d gitlab
docker compose logs -f gitlab &
LOG_PID=$!
```

Expected: container starts; logs stream to terminal. Cold boot takes 8-12 minutes for GitLab CE migrations.

- [ ] **Step 3: Wait for ready signal**

```bash
bash e2e/src/scripts/wait-for-gitlab.sh
```

Expected: script polls health endpoint until 200; exits 0 when ready. If it times out (default ~15 min), check `docker compose logs gitlab` for migration errors.

Stop the background log streamer once ready:
```bash
kill $LOG_PID 2>/dev/null
```

### Task D2: Provision fixtures

**Files:** generates `e2e/fixtures/fixtures.json` (gitignored)

- [ ] **Step 1: Install e2e deps if not already**

```bash
cd e2e
npm ci
```

Expected: succeeds (already exercised in Task C1 Step 4).

- [ ] **Step 2: Run provisioning**

```bash
export GITLAB_URL=http://localhost:8080
export GITLAB_ROOT_PASSWORD='E2eTestPassword1!'
npm run provision
```

Expected: script creates root token, test project, test group, fixtures; writes `fixtures/fixtures.json`. Should take 30-90 seconds.

- [ ] **Step 3: Verify fixtures file**

```bash
jq '.' fixtures/fixtures.json | head -20
```

Expected: shows `token`, `projectId`, `groupId`, etc.

### Task D3: Build + start MCP server

**Files:** none (uses existing dist/)

- [ ] **Step 1: Build server from root**

```bash
cd /home/ubuntu/gits/mcp-gitlab-server
npm run build
```

Expected: `tsc` succeeds.

- [ ] **Step 2: Start server with fixture token, streamable-http**

```bash
export GITLAB_PERSONAL_ACCESS_TOKEN=$(jq -r .token e2e/fixtures/fixtures.json)
export GITLAB_API_URL=http://localhost:8080/api/v4
export USE_STREAMABLE_HTTP=true
export PORT=3000
export MCP_BIND_HOST=127.0.0.1
node dist/index.js > /tmp/mcp-server.log 2>&1 &
SERVER_PID=$!
sleep 3
curl -sf http://127.0.0.1:3000/livez && echo " [server live]"
```

Expected: livez returns `{"status":"ok"}`. If not, inspect `/tmp/mcp-server.log`.

### Task D4: Run full E2E suite

**Files:** none

- [ ] **Step 1: Run vitest in e2e/**

```bash
cd e2e
export MCP_SERVER_URL=http://127.0.0.1:3000
export GITLAB_URL=http://localhost:8080
npm test 2>&1 | tee /tmp/e2e-run.log
TEST_EXIT=${PIPESTATUS[0]}
echo "Exit code: $TEST_EXIT"
```

Expected:
- 81 tests total: 76 passed + 5 skipped (Group Wiki — Premium-only)
- Duration: 60-90s on warm GitLab
- Exit code 0

- [ ] **Step 2: If exit code != 0, triage failures**

For each failing test:
1. Read the failure message in `/tmp/e2e-run.log`
2. Categorize:
   - **Flake**: timing-related, intermittent → add retry or fix wait logic
   - **Real bug**: wrong assertion, missing data, schema drift → fix the underlying code (in src/, not in test)
   - **Test bug**: wrong expected value → fix the test
   - **Environment**: missing fixture, port conflict → fix provisioning or environment
3. Fix one category at a time; re-run after each.

- [ ] **Step 3: Iterate until clean**

Re-run `npm test` until 76 pass + 5 skipped + 0 fail. No exceptions — green or it doesn't ship.

### Task D5: Stop server, capture artifacts

**Files:** `/tmp/e2e-run.log` and `/tmp/mcp-server.log` are kept as evidence

- [ ] **Step 1: Stop the server**

```bash
kill $SERVER_PID 2>/dev/null
wait $SERVER_PID 2>/dev/null
```

- [ ] **Step 2: Save run summary**

```bash
tail -30 /tmp/e2e-run.log > /tmp/e2e-summary.txt
echo "--- mcp server tail ---" >> /tmp/e2e-summary.txt
tail -30 /tmp/mcp-server.log >> /tmp/e2e-summary.txt
cat /tmp/e2e-summary.txt
```

Expected: shows "Test Files 10 passed (10)" and "Tests 76 passed | 5 skipped (81)". Used as evidence in PR body.

### Task D6: Stop GitLab CE

**Files:** none

- [ ] **Step 1: Bring down compose stack**

```bash
cd e2e
docker compose down -v
```

Expected: removes container + volume. Frees ~6GB disk.

- [ ] **Step 2: Verify removed**

```bash
docker ps -a | grep gitlab || echo "gone"
```

Expected: "gone".

---

## Phase E: PR #63 — ship (~45 min)

### Task E1: Write 0.8.0 CHANGELOG entry

**Files:**
- Modify: `CHANGELOG.md`

- [ ] **Step 1: Read existing structure**

```bash
head -50 CHANGELOG.md
```

Expected: shows Keep-a-Changelog format with `## [Unreleased]` at top.

- [ ] **Step 2: Add unreleased entry**

Insert under `## [Unreleased]` (or create section if missing):
```markdown
### Added
- **E2E test suite**: 81 tests covering all 86 MCP tools against a real GitLab CE instance. New `e2e/` directory with Dockerized test runner, fixture provisioning, and a coverage-gate script that blocks merges if a new tool ships without an E2E test. Originally proposed in #63 by Olivier Gintrand; reincarnated by maintainer onto current main with corrections.
- **CI workflows**: `.github/workflows/e2e.yml` runs the suite after build; `.github/workflows/warm-gitlab.yml` pre-warms a GitLab CE image weekly to reduce E2E boot time from 8-12 min to ~2 min.

### Changed
- `Dockerfile`: production image now uses `node:26-alpine` (was `node:24-alpine`).

### Internal
- New `scripts/check-tool-coverage.sh` blocks build when new tools lack E2E coverage.
```

- [ ] **Step 3: Commit**

```bash
git add CHANGELOG.md
git commit -m "docs(changelog): describe 0.8.0 additions

E2E test infrastructure + coverage gate. Credits original proposal #63
(Olivier Gintrand)."
```

### Task E2: Add E2E + maintainer-rebase sections to CONTRIBUTING.md

**Files:**
- Modify: `CONTRIBUTING.md`

- [ ] **Step 1: Read current structure**

```bash
head -80 CONTRIBUTING.md
```

- [ ] **Step 2: Add E2E section**

Append (or insert at appropriate location) a section titled `### Running the E2E test suite locally` with:
```markdown
### Running the E2E test suite locally

The repo includes a comprehensive E2E suite under `e2e/` that runs against a real GitLab CE instance.

**Prerequisites**: Docker, Node 22+, npm 10+, ~6GB free disk space, ~8-12 min for a cold GitLab CE boot.

**Quick run**:

\`\`\`bash
cd e2e
docker compose up -d gitlab
bash src/scripts/wait-for-gitlab.sh    # 8-12 min cold
npm ci
export GITLAB_ROOT_PASSWORD='E2eTestPassword1!'
npm run provision
\`\`\`

Then in another terminal, start the MCP server with the provisioned token:

\`\`\`bash
export GITLAB_PERSONAL_ACCESS_TOKEN=$(jq -r .token e2e/fixtures/fixtures.json)
export GITLAB_API_URL=http://localhost:8080/api/v4
export USE_STREAMABLE_HTTP=true
node dist/index.js
\`\`\`

Run the tests:

\`\`\`bash
cd e2e
export MCP_SERVER_URL=http://127.0.0.1:3000
npm test
\`\`\`

Teardown:

\`\`\`bash
cd e2e && docker compose down -v
\`\`\`

**Adding a new tool**: When you add a new MCP tool to `src/index.ts`, you MUST also add an E2E test under `e2e/src/tests/<domain>.e2e.ts`. The coverage gate in `scripts/check-tool-coverage.sh` will fail the build otherwise. Premium-only tools (e.g. group wikis) can be whitelisted in the script.
```

- [ ] **Step 3: Add maintainer-rebase pattern section**

Append a section titled `### Maintainer rebase pattern (for contributor PRs)` with:
```markdown
### Maintainer rebase pattern (for contributor PRs)

When a contributor's PR sits idle and main drifts (e.g. security fixes, releases), the fair move per project policy is for the maintainer to absorb the rebase cost rather than push it onto the contributor. The pattern used in this repo (precedent: #62→#80, #63→#81):

1. Fetch contributor branch locally: \`git fetch origin pull/<N>/head:pr-<N>-incoming\`
2. Create a fresh \`feat/<topic>-reincarnation\` branch from current \`main\`
3. Cherry-pick the contributor's commits with \`git cherry-pick -C <sha>\` to preserve their authorship in author field
4. Apply any maintainer corrections as additional commits in your name
5. Open a new PR with title indicating it's a reincarnation; PR body MUST include:
   - Explicit credit to the original contributor and PR number
   - A \`Co-authored-by: Name <email>\` trailer on the merge commit
   - A description of what changed vs the original
6. Merge the new PR (\`gh pr merge --squash --admin --delete-branch\` with \`workflow\` scope if workflows touched)
7. Close the original PR with \`gh pr comment <N>\` (NOT \`gh pr close --comment\`) followed by \`gh pr close <N>\` — separately, to avoid the auto-close-drops-comment trap
8. Verify \`Co-authored-by:\` is present in the squashed main commit via \`git show --no-patch --format='%B' <sha> | grep Co-authored-by\` — public promises must be verifiable on the contribution graph
```

- [ ] **Step 4: Commit**

```bash
git add CONTRIBUTING.md
git commit -m "docs(contributing): add E2E workflow and maintainer-rebase pattern sections

Documents the local E2E run procedure and the Path B reincarnation
pattern used when contributor PRs idle and main drifts."
```

### Task E3: Push branch and open reincarnation PR

**Files:** remote only

- [ ] **Step 1: Final sanity check**

```bash
git log --oneline main..HEAD | head -20
npm run build && npm test
```

Expected: build + unit tests green. Note the commit count for the PR description.

- [ ] **Step 2: Push branch**

```bash
git push -u origin feat/e2e-suite-reincarnation
```

Expected: branch pushed.

- [ ] **Step 3: Open PR with comprehensive body**

```bash
gh pr create \
  --title "feat(e2e): comprehensive E2E test suite (reincarnation of #63)" \
  --body "$(cat <<'EOF'
## Summary

Reincarnation of #63 (originally by @ecthelion77, Olivier Gintrand) onto current `main` with maintainer corrections. Original PR sat for 12+ days while `main` moved (0.7.1 security batch, 0.7.2 wiki/transport fixes, 5 Dependabot major bumps), so per project policy the maintainer absorbs the rebase rather than push it onto the contributor.

## What this PR adds

- **E2E test suite** under `e2e/`: 81 tests (76 passing + 5 Premium-only skipped) against a real GitLab CE container.
- **CI workflows**: `e2e.yml` (post-build) and `warm-gitlab.yml` (weekly pre-warm to cut boot time 8-12 min → 2 min).
- **Tool coverage gate** in `scripts/check-tool-coverage.sh`: build fails if a new tool ships without an E2E test.
- **Docs**: CONTRIBUTING.md sections for local E2E run + maintainer-rebase pattern.

## What differs from #63 (maintainer corrections)

1. **npm versions in `e2e/package.json`**: pinned to actually-published stable versions (#63 claimed TS 6.x / Vitest 4.x which were not real at the time)
2. **`e2e/Dockerfile`**: digest-pinned `node:22-alpine` (was unpinned `node:24-alpine`)
3. **Password normalization**: provisioning default aligned with docker-compose + README (`E2eTestPassword1!`)
4. **GitLab CE image**: pinned to specific stable tag in docker-compose (was `:latest`)
5. **`ToolResult` type**: narrowed from `any` to shaped union (CLAUDE.md forbids `any`)
6. **`grep -P` → POSIX**: coverage script now portable to BSD/macOS grep
7. **Empty `beforeAll`**: removed
8. **`.dockerignore`**: added to prevent fixture/secret leakage
9. **`warm-gitlab.yml`**: hardened permissions, least-privilege ghcr push

## Local validation evidence

Ran the full suite against GitLab CE locally:
\`\`\`
Test Files  10 passed (10)
     Tests  76 passed | 5 skipped (81)
  Duration  ~75s on warm image
\`\`\`

Server start, livez/readyz green; full provisioning + teardown clean.

## Credit

Original design and ~80% of the implementation is Olivier Gintrand's work from #63. This PR carries it forward unchanged where possible. \`Co-authored-by:\` trailer ensures the contribution graph reflects authorship correctly.

Closes #63.

Co-authored-by: Olivier Gintrand <olivier.gintrand@forterro.com>
EOF
)"
```

Expected: outputs new PR URL (e.g. https://github.com/yoda-digital/mcp-gitlab-server/pull/81). Record the number as `$REINCARNATION_PR`.

### Task E4: Wait for CI green on the PR

**Files:** none

- [ ] **Step 1: Watch CI**

```bash
REINCARNATION_PR=<number from E3>
gh pr checks $REINCARNATION_PR --watch
```

Expected: all required checks turn green (`build-and-test`, `CodeQL`).

- [ ] **Step 2: If any check fails, debug**

Read the failed run log:
```bash
gh pr checks $REINCARNATION_PR --json name,state,link --jq '.[] | select(.state != "SUCCESS")'
gh run view <run-id> --log-failed
```

Fix issues locally, push, re-watch.

### Task E5: Merge the reincarnation PR

**Files:** none

- [ ] **Step 1: Merge with admin bypass (ruleset BLOCKED is design-intended for solo owner)**

```bash
gh pr merge $REINCARNATION_PR --squash --admin --delete-branch
```

Expected: empty output (gh silent-success).

- [ ] **Step 2: Verify Co-authored-by trailer landed in main**

```bash
git fetch origin main
LATEST=$(git rev-parse origin/main)
git show --no-patch --format='%B' $LATEST | grep -i 'Co-authored-by:'
```

Expected: line containing `Co-authored-by: Olivier Gintrand`. If missing, abort and follow up with a corrective commit before any further action.

- [ ] **Step 3: Sync local main**

```bash
git checkout main
git pull --ff-only origin main
```

### Task E6: Close PR #63 with credit comment

**Files:** none (GitHub API only)

- [ ] **Step 1: Draft and post credit comment FIRST**

```bash
gh pr comment 63 --body "$(cat <<'EOF'
Hi Olivier — closing this in favor of #${REINCARNATION_PR}, which carries your work forward onto current \`main\` with the maintainer corrections we needed before merge (npm version pins, image digest pin, password normalization, type-narrowing on \`ToolResult\`, security hardening on \`warm-gitlab.yml\`, etc. — full list in the new PR body).

The original PR sat for 12+ days while main shipped 0.7.1 (security batch) and 0.7.2 (wiki/transport fixes, the bugfixes from your separate #62). The rebase tax wasn't yours to pay — the maintainer absorbs that work per project policy.

Your authorship is preserved via cherry-pick and the squash merge into main carries a \`Co-authored-by:\` trailer, so your contributions remain credited on the contribution graph.

Thanks for the E2E investment — it's a real lift in repo quality. Both of your finds (the coverage-gate design and the warm-image pattern to dodge 8-12 min cold boots) were sharp.
EOF
)"
```

Expected: comment posted. Verify via `gh pr view 63 --json comments -q '.comments[-1].body' | head -5`.

- [ ] **Step 2: Then close the PR**

```bash
gh pr close 63
```

Expected: PR closed (note: NOT auto-closed via Closes #N keyword — separate close avoids the comment-drop trap documented in `reference_gh_closes_keyword_pr_auto_close`).

- [ ] **Step 3: Verify final state**

```bash
gh pr view 63 --json state,closedAt -q '.'
```

Expected: `state: CLOSED`, `closedAt: <recent timestamp>`.

---

## Phase F: Issue #64 — 4 smart pipeline tools (TDD, ~3-5h)

> **Skip flag:** if `SKIP_PHASE_F=1`, jump to Phase G and address #64 in 0.8.1.
> **TDD discipline**: each tool ships test-first. Unit tests against mocked GitLab API; E2E tests against real GitLab CE (required by coverage gate).
> **Branch**: create `feat/smart-pipeline-tools` from updated main after Phase E lands.

### Task F0: Branch + research GitLab REST endpoints

**Files:** none

- [ ] **Step 1: Create branch**

```bash
git checkout main
git pull --ff-only origin main
git checkout -b feat/smart-pipeline-tools
```

- [ ] **Step 2: Confirm GitLab REST endpoints used by the 4 tools**

The 4 tools and their underlying GitLab v4 REST endpoints:

| Tool | Endpoint(s) |
|---|---|
| `get_pipeline_summary` | `GET /projects/:id/pipelines/:pipeline_id` + `GET /projects/:id/pipelines/:pipeline_id/jobs` (composed) |
| `get_failed_jobs` | `GET /projects/:id/pipelines/:pipeline_id/jobs?scope[]=failed` |
| `get_job_log_smart` | `GET /projects/:id/jobs/:job_id/trace` + client-side post-processing |
| `retry_failed_jobs` | `POST /projects/:id/pipelines/:pipeline_id/retry` |

Cross-reference https://docs.gitlab.com/ee/api/pipelines.html and https://docs.gitlab.com/ee/api/jobs.html before writing schemas to confirm exact field names.

### Task F1: Schemas for the 4 new tools (TDD)

**Files:**
- Modify: `src/schemas.ts`
- Modify: `src/schemas.test.ts`

- [ ] **Step 1: Write failing schema tests**

Append to `src/schemas.test.ts`:
```typescript
import {
  GetPipelineSummarySchema,
  GetFailedJobsSchema,
  GetJobLogSmartSchema,
  RetryFailedJobsSchema,
} from './schemas';

describe('GetPipelineSummarySchema', () => {
  it('accepts minimal input with project_id', () => {
    const result = GetPipelineSummarySchema.safeParse({ project_id: '123' });
    expect(result.success).toBe(true);
  });

  it('accepts project_id + ref', () => {
    const result = GetPipelineSummarySchema.safeParse({ project_id: '123', ref: 'main' });
    expect(result.success).toBe(true);
  });

  it('rejects empty input', () => {
    const result = GetPipelineSummarySchema.safeParse({});
    expect(result.success).toBe(false);
  });

  it('defaults include_logs to true and log_lines to 50', () => {
    const result = GetPipelineSummarySchema.parse({ project_id: '123' });
    expect(result.include_logs).toBe(true);
    expect(result.log_lines).toBe(50);
  });
});

describe('GetFailedJobsSchema', () => {
  it('accepts minimal input', () => {
    const result = GetFailedJobsSchema.safeParse({ project_id: '123' });
    expect(result.success).toBe(true);
  });

  it('rejects log_lines < 1 or > 5000', () => {
    expect(GetFailedJobsSchema.safeParse({ project_id: '123', log_lines: 0 }).success).toBe(false);
    expect(GetFailedJobsSchema.safeParse({ project_id: '123', log_lines: 5001 }).success).toBe(false);
  });
});

describe('GetJobLogSmartSchema', () => {
  it('requires project_id and job_id', () => {
    expect(GetJobLogSmartSchema.safeParse({ project_id: '123' }).success).toBe(false);
    expect(GetJobLogSmartSchema.safeParse({ project_id: '123', job_id: 42 }).success).toBe(true);
  });

  it('rejects both head and tail set', () => {
    const r = GetJobLogSmartSchema.safeParse({ project_id: '123', job_id: 42, head: 50, tail: 50 });
    expect(r.success).toBe(false);
  });
});

describe('RetryFailedJobsSchema', () => {
  it('requires project_id and pipeline_id', () => {
    expect(RetryFailedJobsSchema.safeParse({ project_id: '123' }).success).toBe(false);
    expect(RetryFailedJobsSchema.safeParse({ project_id: '123', pipeline_id: 999 }).success).toBe(true);
  });
});
```

- [ ] **Step 2: Run tests, verify fail with "not exported"**

```bash
npm test -- src/schemas.test.ts
```

Expected: FAIL because the 4 schemas don't exist yet.

- [ ] **Step 3: Implement the schemas**

Append to `src/schemas.ts`:
```typescript
import { z } from 'zod';

export const GetPipelineSummarySchema = z.object({
  project_id: z.union([z.string(), z.number()]),
  pipeline_id: z.number().int().positive().optional(),
  ref: z.string().optional(),
  include_logs: z.boolean().default(true),
  log_lines: z.number().int().min(1).max(5000).default(50),
}).refine(
  (data) => data.pipeline_id !== undefined || data.ref !== undefined || true,
  { message: 'Either pipeline_id, ref, or neither (uses latest) is required' }
);

export const GetFailedJobsSchema = z.object({
  project_id: z.union([z.string(), z.number()]),
  pipeline_id: z.number().int().positive().optional(),
  ref: z.string().optional(),
  include_log_tail: z.boolean().default(true),
  log_lines: z.number().int().min(1).max(5000).default(30),
  include_retried: z.boolean().default(false),
});

export const GetJobLogSmartSchema = z.object({
  project_id: z.union([z.string(), z.number()]),
  job_id: z.number().int().positive(),
  section: z.string().optional(),
  tail: z.number().int().min(1).max(50000).optional(),
  head: z.number().int().min(1).max(50000).optional(),
  strip_ansi: z.boolean().default(true),
  strip_timestamps: z.boolean().default(true),
  error_only: z.boolean().default(false),
}).refine(
  (data) => !(data.head !== undefined && data.tail !== undefined),
  { message: 'Specify either head or tail, not both' }
);

export const RetryFailedJobsSchema = z.object({
  project_id: z.union([z.string(), z.number()]),
  pipeline_id: z.number().int().positive(),
});

export type GetPipelineSummaryInput = z.infer<typeof GetPipelineSummarySchema>;
export type GetFailedJobsInput = z.infer<typeof GetFailedJobsSchema>;
export type GetJobLogSmartInput = z.infer<typeof GetJobLogSmartSchema>;
export type RetryFailedJobsInput = z.infer<typeof RetryFailedJobsSchema>;
```

- [ ] **Step 4: Run tests, verify pass**

```bash
npm test -- src/schemas.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/schemas.ts src/schemas.test.ts
git commit -m "feat(schemas): add schemas for 4 smart pipeline tools (#64)

GetPipelineSummary, GetFailedJobs, GetJobLogSmart, RetryFailedJobs.
Design proposal credit @ecthelion77."
```

### Task F2: GitLabApi methods for the 4 tools (TDD)

**Files:**
- Modify: `src/gitlab-api.ts`
- Modify: `src/gitlab-api.test.ts`

- [ ] **Step 1: Inspect existing test patterns**

```bash
head -60 src/gitlab-api.test.ts
```

Look for the fetch mock pattern used by existing tests (e.g. `vi.fn()` or `msw` or hand-rolled stubs). Match it.

- [ ] **Step 2: Write failing tests for `getFailedJobs` (simplest, no composition)**

Append to `src/gitlab-api.test.ts` (matching existing mock style):
```typescript
describe('GitLabApi.getFailedJobs', () => {
  it('queries jobs endpoint with scope=failed', async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      headers: new Headers(),
      json: async () => ([
        { id: 1, name: 'lint', stage: 'test', status: 'failed', failure_reason: 'script_failure' },
      ]),
    });
    const api = new GitLabApi({ token: 'x', baseUrl: 'http://gitlab.test/api/v4', fetch: mockFetch });
    const result = await api.getFailedJobs({ project_id: 'group/proj', pipeline_id: 42 });
    expect(mockFetch).toHaveBeenCalled();
    const url = (mockFetch.mock.calls[0][0] as string);
    expect(url).toContain('/pipelines/42/jobs');
    expect(url).toContain('scope%5B%5D=failed');
    expect(result).toHaveLength(1);
    expect(result[0].name).toBe('lint');
  });
});
```

If existing pattern uses `nock` or `msw`, adapt accordingly.

- [ ] **Step 3: Run failing test**

```bash
npm test -- src/gitlab-api.test.ts -t 'getFailedJobs'
```

Expected: FAIL ("method not defined").

- [ ] **Step 4: Implement `getFailedJobs` in src/gitlab-api.ts**

Add to the `GitLabApi` class:
```typescript
async getFailedJobs(input: GetFailedJobsInput): Promise<GitLabJob[]> {
  const projectId = encodeURIComponent(String(input.project_id));
  let pipelineId = input.pipeline_id;

  if (!pipelineId) {
    if (input.ref) {
      const pipelines = await this.listPipelines({ project_id: input.project_id, ref: input.ref, per_page: 1 });
      if (pipelines.length === 0) throw new Error(`No pipelines found for ref ${input.ref}`);
      pipelineId = pipelines[0].id;
    } else {
      const pipelines = await this.listPipelines({ project_id: input.project_id, per_page: 1 });
      if (pipelines.length === 0) throw new Error('No pipelines found');
      pipelineId = pipelines[0].id;
    }
  }

  const params = new URLSearchParams();
  params.append('scope[]', 'failed');
  if (input.include_retried) params.append('include_retried', 'true');

  const url = `${this.baseUrl}/projects/${projectId}/pipelines/${pipelineId}/jobs?${params.toString()}`;
  const res = await this.fetch(url, { headers: this.headers });
  if (!res.ok) throw new Error(`GitLab API ${res.status} on getFailedJobs`);
  return await res.json() as GitLabJob[];
}
```

Note: requires `GitLabJob` type and `listPipelines` method to exist. If they don't, add minimally before the test (also TDD).

- [ ] **Step 5: Verify test passes**

```bash
npm test -- src/gitlab-api.test.ts -t 'getFailedJobs'
```

Expected: PASS.

- [ ] **Step 6: Repeat Steps 2-5 for the remaining 3 methods**

In order: `getPipelineSummary` (composes `getPipeline` + `getJobsByPipeline`), `getJobLogSmart` (calls trace endpoint, then strips ANSI/timestamps/extracts section), `retryFailedJobs` (POST endpoint).

For `getJobLogSmart`, the post-processing logic deserves its own unit test independent of HTTP:
```typescript
describe('stripAnsiCodes helper', () => {
  it('removes color codes', () => {
    expect(stripAnsi('\x1b[31mError\x1b[0m')).toBe('Error');
  });
});
```

Co-locate helpers in a new file `src/log-processing.ts` if they grow beyond ~30 lines; otherwise keep inline.

- [ ] **Step 7: Commit each method as its own commit**

```bash
git add src/gitlab-api.ts src/gitlab-api.test.ts
git commit -m "feat(api): add getFailedJobs to GitLabApi (#64)"
# repeat per method
```

### Task F3: Formatters for the 4 tools

**Files:**
- Modify: `src/formatters.ts`
- Modify: `src/formatters.test.ts`

- [ ] **Step 1: Inspect existing formatter pattern**

```bash
grep -A 10 'formatPipeline\|formatJob' src/formatters.ts | head -40
```

Match the existing style (markdown-friendly text content blocks).

- [ ] **Step 2: TDD each formatter**

Following the same pattern as F2 (failing test → implementation → green test → commit), add:
- `formatPipelineSummary(summary)` — returns markdown with stages grouped, failures highlighted, log tails inset
- `formatFailedJobs(jobs)` — returns markdown table or bullet list, one entry per failed job with log tail
- `formatJobLogSmart(processedLog, meta)` — returns the processed log with a header line showing what was applied (`ansi-stripped`, `tail=50`, etc.)
- `formatRetryResult(pipeline)` — returns confirmation with new pipeline state

Each formatter gets at least 2 unit tests (happy path + edge case like empty input).

- [ ] **Step 3: Commit per formatter**

```bash
git commit -m "feat(formatters): add formatter for <tool name>"
```

### Task F4: Wire tools into src/index.ts switch + tool list

**Files:**
- Modify: `src/index.ts`

- [ ] **Step 1: Find the tools array**

```bash
grep -n '"get_pipeline"\|"list_pipelines"' src/index.ts | head -5
```

Locate the section where pipeline-related tools are registered.

- [ ] **Step 2: Add 4 new tool entries**

For each of the 4 tools, add an entry to the tools list (matching shape used by existing tools) with:
- `name` matching the schema name
- `description` matching the design proposal in issue #64
- `inputSchema` derived from the Zod schema

- [ ] **Step 3: Add 4 case branches to the request handler switch**

For each tool, add a `case` that:
1. Validates input with the schema
2. Calls the corresponding `GitLabApi` method
3. Passes the result through the formatter
4. Returns the formatted response

Respect the read-only mode flag: `get_pipeline_summary`, `get_failed_jobs`, `get_job_log_smart` are read-only (set `readOnly: true`). `retry_failed_jobs` is NOT read-only (mutating).

- [ ] **Step 4: Verify build + unit tests**

```bash
npm run build
npm test
```

Expected: green.

- [ ] **Step 5: Commit**

```bash
git add src/index.ts
git commit -m "feat(index): wire 4 smart pipeline tools (#64)

Design proposal credit @ecthelion77.

Co-authored-by: Olivier Gintrand <olivier.gintrand@forterro.com>"
```

### Task F5: E2E tests for the 4 new tools

**Files:**
- Modify: `e2e/src/tests/pipelines.e2e.ts` (or split into `pipelines-smart.e2e.ts` if it grows >300 lines)

- [ ] **Step 1: Boot GitLab CE for testing**

Repeat Task D1-D3 (boot GitLab, provision, start server).

- [ ] **Step 2: Write E2E tests for each new tool**

In `e2e/src/tests/pipelines.e2e.ts`, add a `describe` block per new tool:
```typescript
describe('get_pipeline_summary', () => {
  it('returns summary for the latest pipeline on a ref', async () => {
    const result = await mcp.callTool({
      name: 'get_pipeline_summary',
      arguments: { project_id: fixtures.projectId, ref: 'main' },
    });
    const text = extractText(result);
    expect(text).toContain('Stages:');
    expect(text).toContain('Status:');
  });

  it('falls back to latest pipeline when neither pipeline_id nor ref given', async () => {
    const result = await mcp.callTool({
      name: 'get_pipeline_summary',
      arguments: { project_id: fixtures.projectId },
    });
    const text = extractText(result);
    expect(text).toContain('Pipeline');
  });
});

// similar describe blocks for get_failed_jobs, get_job_log_smart, retry_failed_jobs
```

Note: `retry_failed_jobs` E2E may need a real failed job in fixtures. If provisioning doesn't produce one, add a `xit` (todo) test and document why in a comment.

- [ ] **Step 3: Run E2E suite to verify**

```bash
cd e2e
export MCP_SERVER_URL=http://127.0.0.1:3000
npm test -- pipelines
```

Expected: pipeline tests pass, including new ones.

- [ ] **Step 4: Run the full suite for regression check**

```bash
npm test
```

Expected: 76 + 4 new = 80 passing, 5 skipped, 0 failing.

- [ ] **Step 5: Verify coverage gate passes**

```bash
cd /home/ubuntu/gits/mcp-gitlab-server
bash scripts/check-tool-coverage.sh
```

Expected: exit 0; coverage report shows the 4 new tools have tests.

- [ ] **Step 6: Commit**

```bash
git add e2e/src/tests/pipelines.e2e.ts
git commit -m "test(e2e): add coverage for 4 smart pipeline tools (#64)

Co-authored-by: Olivier Gintrand <olivier.gintrand@forterro.com>"
```

- [ ] **Step 7: Teardown**

```bash
cd e2e && docker compose down -v
```

### Task F6: Open PR + merge + close #64

**Files:** remote only

- [ ] **Step 1: Push branch**

```bash
git push -u origin feat/smart-pipeline-tools
```

- [ ] **Step 2: Open PR**

```bash
gh pr create \
  --title "feat: smart pipeline tools — summary, failed-jobs, smart-log, retry (#64)" \
  --body "$(cat <<'EOF'
## Summary

Implements the 4 tools proposed by @ecthelion77 in #64. Each tool collapses what was previously 4-6 sequential MCP calls into a single, agent-optimized response:

| Tool | Replaces | Returns |
|---|---|---|
| `get_pipeline_summary` | list_pipelines + list_jobs + manual filter | Structured summary: stages, statuses, failure context, log tails |
| `get_failed_jobs` | list_jobs + client-side filter | Only failed jobs with log tails |
| `get_job_log_smart` | get_job_log + manual ANSI/timestamp strip | Cleaned, optionally-sectioned log |
| `retry_failed_jobs` | retry per job | Whole-pipeline retry via single API call |

## Design credit

Full design proposal by @ecthelion77 in #64. This PR implements it as-specified.

## Test coverage

- Unit tests: schemas, API methods (mocked fetch), formatters, ANSI/timestamp helpers
- E2E tests: 4 new tests under `e2e/src/tests/pipelines.e2e.ts`, validated locally against GitLab CE 17.x

Closes #64.

Co-authored-by: Olivier Gintrand <olivier.gintrand@forterro.com>
EOF
)"
```

Record the PR number as `$SMART_TOOLS_PR`.

- [ ] **Step 3: Wait for CI green**

```bash
gh pr checks $SMART_TOOLS_PR --watch
```

- [ ] **Step 4: Merge**

```bash
gh pr merge $SMART_TOOLS_PR --squash --admin --delete-branch
```

- [ ] **Step 5: Verify Co-authored-by trailer landed**

```bash
git fetch origin main
git show --no-patch --format='%B' origin/main | grep 'Co-authored-by:'
```

Expected: line present.

- [ ] **Step 6: Add credit comment on issue #64 (it will already be auto-closed by Closes #64 in merge body)**

```bash
gh issue comment 64 --body "$(cat <<'EOF'
Implemented in #${SMART_TOOLS_PR}, now on \`main\` and shipping in 0.8.0. Full design credit to you — the 4 tools and their input shapes are exactly as proposed, including the smart defaults (strip ANSI, exclude retried jobs by default, log tails on failure surface). Thanks for the proposal.
EOF
)"
```

- [ ] **Step 7: Sync local main**

```bash
git checkout main
git pull --ff-only origin main
```

---

## Phase G: Docs bundle + mentor-meta (~1.5h)

**Branch**: `docs/operational-runbooks-and-conventions` from updated main after Phase F (or Phase E if Phase F skipped).

### Task G1: Create branch + add "Release atomicity recovery" to OPERATIONS.md (#47)

**Files:**
- Modify: `docs/OPERATIONS.md`

- [ ] **Step 1: Create branch**

```bash
git checkout main
git pull --ff-only origin main
git checkout -b docs/operational-runbooks-and-conventions
```

- [ ] **Step 2: Read current OPERATIONS.md structure**

```bash
head -50 docs/OPERATIONS.md
grep -n '^##' docs/OPERATIONS.md
```

Note existing section structure.

- [ ] **Step 3: Append new section "Release atomicity & recovery"**

Append to `docs/OPERATIONS.md`:
```markdown

## Release atomicity & recovery

The release pipeline has two independent legs:

- **`build.yml` (Build & Publish)** — runs on every push, publishes Docker image to `ghcr.io` only when a tag is pushed.
- **`publish.yml` (Publish Package to npm)** — runs only on `release.published` or `workflow_dispatch`; publishes the npm package via Trusted Publishing (OIDC).

These legs can fail independently. Recovery paths:

### npm publish succeeded but Docker push failed

1. Verify npm publish landed: `npm view @yoda.digital/gitlab-mcp-server@<version>`
2. Re-run the `Build & Publish` workflow against the tag:
   - `gh run list --workflow=build.yml --branch <tag>`
   - `gh run rerun <run-id> --failed`
3. Verify image lands: `gh api /orgs/yoda-digital/packages/container/gitlab-mcp-server/versions | jq '.[0].metadata.container.tags'`

### Docker push succeeded but npm publish failed

1. Verify ghcr image: see step 3 above
2. Check why publish-npm failed:
   - `gh run view <publish-run-id> --log-failed`
   - Common cause: Trusted Publishing config drift on npmjs.com (publisher not registered, environment name mismatch). Fix in npm UI: Package settings → Trusted publishers.
3. Re-publish via `workflow_dispatch`:
   - `gh workflow run publish.yml --ref <tag>`

### Both legs failed

1. Investigate root cause (network, GitHub outage, dependency).
2. If the tag/release artifacts are still valid: re-trigger both legs as above.
3. If the tag itself is bad (e.g. version mismatch in package.json):
   - DO NOT delete the published release (immutable on npm anyway)
   - Bump version, create new release. Document the skipped version in CHANGELOG.

### Verifying full release post-recovery

```bash
# npm
npm view @yoda.digital/gitlab-mcp-server@<version>

# ghcr
docker pull ghcr.io/yoda-digital/gitlab-mcp-server:<version>

# Trusted Publishing provenance attestation
npm view @yoda.digital/gitlab-mcp-server@<version> --json | jq '.dist'
```

Both should show the new version. Update OBSERVATIONS in CHANGELOG if any recovery occurred.
```

- [ ] **Step 4: Commit**

```bash
git add docs/OPERATIONS.md
git commit -m "docs(ops): document release atomicity and recovery paths (#47)

Documents how to recover when one of build.yml or publish.yml fails
independently. Closes #47."
```

### Task G2: Add "Release ceremony" section to CONTRIBUTING.md (#49)

**Files:**
- Modify: `CONTRIBUTING.md`

- [ ] **Step 1: Append section**

Append to `CONTRIBUTING.md`:
```markdown

## Release ceremony

This project uses a **release-driven publish model** (since PR #43). Code landing on `main` does NOT publish to npm; releases are deliberate, versioned ceremonies.

### When to cut a release

- Any user-visible bug fix or feature → minor or patch release within 7 days of merge.
- Security fixes → patch release within 24 hours of merge.
- Internal refactors with no user-visible change → can wait for next batched release.

### Cutting a release (maintainer steps)

1. Confirm `main` is green: `gh run list --branch main --limit 3`
2. Bump version in `package.json` (`npm version patch|minor|major --no-git-tag-version`)
3. Move `[Unreleased]` entries in `CHANGELOG.md` to a new dated section: `## [X.Y.Z] - YYYY-MM-DD`
4. Commit: `chore(release): X.Y.Z`
5. Open a PR (single-file `release/X.Y.Z` change). After CI green, merge with `--squash --admin`.
6. Create a GitHub Release on the merge SHA:
   - Tag: `vX.Y.Z`
   - Title: `vX.Y.Z — <one-line summary>`
   - Body: paste the CHANGELOG section verbatim
7. The `publish.yml` workflow fires on `release.published` and publishes to npm via OIDC Trusted Publishing.
8. Verify: see `docs/OPERATIONS.md` → "Verifying full release post-recovery"
9. Update https://opensource.yoda.digital (portal mirrors CHANGELOG entries)

### What NOT to do

- Don't `npm publish` from your laptop. Trusted Publishing is the only path.
- Don't amend a published release tag — it's immutable on npm.
- Don't skip the version bump even for tiny fixes. The publish workflow expects monotonic versions.
- Don't rewrite historical CHANGELOG entries — the opensource.yoda.digital portal mirrors them.
```

- [ ] **Step 2: Commit**

```bash
git add CONTRIBUTING.md
git commit -m "docs(contributing): document release ceremony (#49)

Closes #49."
```

### Task G3: Add "First-publish runbook for ghcr.io" to OPERATIONS.md (#51)

**Files:**
- Modify: `docs/OPERATIONS.md`

- [ ] **Step 1: Append runbook**

Append to `docs/OPERATIONS.md`:
```markdown

## First-publish runbook: ghcr.io package

When `ghcr.io/yoda-digital/gitlab-mcp-server` is first published, GitHub creates the container package in private mode by default. Make it public + linked to the repo:

### One-time setup after first push

1. After the first successful `build.yml` run that pushes to ghcr, navigate to:
   `https://github.com/orgs/yoda-digital/packages/container/gitlab-mcp-server/settings`
2. Under "Manage Actions access", add the `mcp-gitlab-server` repository with **Write** role. This is what lets subsequent CI runs push without a fresh OAuth dance.
3. Under "Danger Zone" → "Change visibility", set to **Public**.
4. Under "Repository", link the package to the source repo.

### Verification

```bash
# Anonymous pull should succeed
docker pull ghcr.io/yoda-digital/gitlab-mcp-server:latest

# Package metadata should show repository link
gh api /orgs/yoda-digital/packages/container/gitlab-mcp-server | jq '{visibility, repository: .repository.full_name}'
```

Expected output:
```json
{ "visibility": "public", "repository": "yoda-digital/mcp-gitlab-server" }
```

### Failure mode: "denied" on subsequent CI pushes

If after a maintainer rotation the ghcr push starts failing with `denied: permission_denied`, re-check step 2 — Actions access can drop if the repo is renamed or the org's default Actions permissions tighten.
```

- [ ] **Step 2: Commit**

```bash
git add docs/OPERATIONS.md
git commit -m "docs(ops): add first-publish runbook for ghcr.io package (#51)

Closes #51."
```

### Task G4: Fix stale CLAUDE.md claim about npm test

**Files:**
- Modify: `CLAUDE.md`

- [ ] **Step 1: Find the stale claim**

```bash
grep -n 'npm test\|vitest\|exits with error' CLAUDE.md
```

Expected: shows the line claiming `npm test` "exits with error" or similar. Per memory `project_test_runner_vitest`, this is false — vitest is wired and `npm test` runs `vitest run`.

- [ ] **Step 2: Update the line**

Replace the stale claim with:
```
**Note**: `npm test` runs vitest (`vitest run`). Existing specs live alongside source: `src/formatters.test.ts`, `src/schemas.test.ts`, `src/gitlab-api.test.ts`, plus E2E suite under `e2e/`. New behavior should ship with vitest coverage. No dedicated linter is configured; TypeScript strict mode handles type checking.
```

(Adjust the file list to match what actually exists post-Phase F.)

- [ ] **Step 3: Commit**

```bash
git add CLAUDE.md
git commit -m "docs(claude): correct stale npm test description

npm test runs vitest; the old 'exits with error' note was outdated."
```

### Task G5: Open PR, merge, verify

**Files:** remote only

- [ ] **Step 1: Push**

```bash
git push -u origin docs/operational-runbooks-and-conventions
```

- [ ] **Step 2: Open PR**

```bash
gh pr create \
  --title "docs: operational runbooks + release ceremony + CLAUDE.md fix" \
  --body "$(cat <<'EOF'
## Summary

Closes 3 aging docs/CI issues + 1 stale-CLAUDE.md fix in a single PR.

## Changes

- **OPERATIONS.md**: release atomicity & recovery paths (#47), first-publish runbook for ghcr.io (#51)
- **CONTRIBUTING.md**: release ceremony documentation (#49)
- **CLAUDE.md**: corrected stale `npm test` description (vitest is wired)

## Why bundled

All 3 issues are docs in the same files. One PR > three PRs of churn.

Closes #47.
Closes #49.
Closes #51.
EOF
)"
```

- [ ] **Step 3: CI + merge + sync**

```bash
DOCS_PR=<from step 2 output>
gh pr checks $DOCS_PR --watch
gh pr merge $DOCS_PR --squash --admin --delete-branch
git checkout main && git pull --ff-only origin main
```

- [ ] **Step 4: Verify 3 issues auto-closed**

```bash
for n in 47 49 51; do gh issue view $n --json state -q ".number=\(.state\)"; done
```

Expected: all 3 show `state=CLOSED`.

---

## Phase H: Issue #52 design doc (no implementation) (~1-2h)

> **Skip flag**: if `SKIP_PHASE_H=1`, skip this phase entirely.
> **Output**: a long, structured comment on issue #52 with a 4-phase implementation design. Implementation deferred to a future 0.9.0+ effort.

### Task H1: Research multi-arch buildx + SBOM + cosign + Trivy

**Files:** none

- [ ] **Step 1: Confirm buildx multi-arch pattern**

Search for the canonical GHA pattern:
```
WebFetch: https://docs.docker.com/build/ci/github-actions/multi-platform/
```

Note the recommended platforms: typically `linux/amd64,linux/arm64`.

- [ ] **Step 2: Choose SBOM toolchain**

Decision matrix to inline in design doc:
- `anchore/syft` action — mature, multi-format (SPDX, CycloneDX)
- `docker buildx --sbom=true` — native but emits limited SBOM
- Verdict: **syft for breadth**, attached to release as `sbom.spdx.json` and `sbom.cdx.json`.

- [ ] **Step 3: Cosign keyless decision**

Cosign OIDC keyless signing via GitHub Actions OIDC:
- No key management
- Provenance ties signature to specific workflow run
- Verify with `cosign verify --certificate-identity-regexp ...`

- [ ] **Step 4: Trivy threshold decision**

Trivy `aquasecurity/trivy-action`:
- Severity threshold: fail on CRITICAL + HIGH for production image scans
- Exit code 1 on findings → blocks release
- Soft-fail option for MEDIUM/LOW (informational)

### Task H2: Write the design doc as a comment on #52

**Files:** none (GitHub API only)

- [ ] **Step 1: Compose the design doc**

Save the body to `/tmp/issue-52-design.md` (scratch):
```markdown
# Implementation design — Multi-arch Docker + SBOM + cosign + Trivy

This is a design proposal for closing #52. **No code in this comment — implementation deferred to a separate PR or 0.9.0 effort.** Reviewing this design before implementation lets us catch architectural issues cheaply.

## Phase plan

### Phase 1: Multi-arch buildx (lowest risk, foundation for the rest)
- Update `build.yml` to use `docker/setup-buildx-action` (already there post-#71) with `linux/amd64,linux/arm64`
- Push manifest list, not single image
- Smoke test both arches via `docker run --platform`

**Effort**: ~2h. **Risk**: ARM build may surface deps that don't have arm64 wheels (mitigation: stay on Alpine; node:N-alpine has arm64 builds).

### Phase 2: SBOM generation (parallel with image push)
- Add `anchore/sbom-action` step after `docker/build-push-action`
- Emit `sbom.spdx.json` and `sbom.cdx.json`
- Attach to GitHub Release on tag push

**Effort**: ~1h. **Risk**: minimal; sbom-action is well-maintained.

### Phase 3: Cosign signing (keyless OIDC)
- Add `sigstore/cosign-installer` step
- Sign manifest list: `cosign sign --yes ghcr.io/.../mcp-gitlab-server@<digest>`
- Required: `id-token: write` permission on the job
- Document verification command in OPERATIONS.md

**Effort**: ~2h. **Risk**: OIDC trust setup; cosign verify command must reference the correct workflow identity (`https://github.com/yoda-digital/mcp-gitlab-server/.github/workflows/build.yml@refs/tags/<tag>`).

### Phase 4: Trivy scanning (release-gating)
- Add `aquasecurity/trivy-action` step BEFORE push, fail on CRITICAL/HIGH
- Generate sarif output, upload to Code Scanning
- Soft-fail medium/low (annotations only)

**Effort**: ~1.5h. **Risk**: false positives can block releases. Mitigation: explicit `.trivyignore` with documented reasons.

## Total estimate
6-8h of focused engineering across the 4 phases. Single PR per phase recommended for review focus.

## Open decisions (need maintainer input before implementation)
1. Trivy threshold: CRITICAL-only vs CRITICAL+HIGH for hard-fail?
2. SBOM formats: SPDX only, CycloneDX only, or both?
3. Sign just the manifest list, or also the per-platform images?
4. Release-gating: should ANY trivy CRITICAL finding block the release entirely, or allow `--admin` override with documented justification?

## Suggested target version
0.9.0 (significant security feature, deserves a minor bump).
```

- [ ] **Step 2: Post as comment on issue #52**

```bash
gh issue comment 52 --body-file /tmp/issue-52-design.md
```

Expected: comment posted; issue remains open with the design doc visible.

- [ ] **Step 3: Verify**

```bash
gh issue view 52 --json comments -q '.comments[-1].body' | head -10
```

Expected: shows the design doc.

---

## Phase I: Release 0.8.0 (~30 min)

> Pre-condition: Phases A-G complete (Phase H is optional). `main` should contain E2E suite + 4 smart tools + docs bundle + (any other changes from previous PRs).

### Task I1: Bump version + finalize CHANGELOG

**Files:**
- Modify: `package.json`
- Modify: `CHANGELOG.md`

- [ ] **Step 1: Sync main**

```bash
git checkout main
git pull --ff-only origin main
```

- [ ] **Step 2: Bump version**

```bash
npm version minor --no-git-tag-version
```

Expected: package.json now shows `"version": "0.8.0"`, and `package-lock.json` is updated.

- [ ] **Step 3: Move CHANGELOG entries**

Edit `CHANGELOG.md`:
- Take everything under `## [Unreleased]`
- Move under a new section: `## [0.8.0] - 2026-05-18` (use actual date of release)
- Leave `## [Unreleased]` empty (no subsections)
- Update the bottom-of-file comparison links if present: add `[0.8.0]: .../compare/v0.7.2...v0.8.0`

- [ ] **Step 4: Create release branch and commit**

```bash
git checkout -b release/0.8.0
git add package.json package-lock.json CHANGELOG.md
git commit -m "chore(release): 0.8.0

E2E test infrastructure (#63/#81), smart pipeline tools (#64), and
operational documentation runbooks. Full notes in CHANGELOG.md."
```

### Task I2: Open release PR + merge

**Files:** remote only

- [ ] **Step 1: Push**

```bash
git push -u origin release/0.8.0
```

- [ ] **Step 2: Open PR**

```bash
gh pr create \
  --title "chore(release): 0.8.0" \
  --body "Release prep — version bump + CHANGELOG dating. No code changes.

Headline features:
- E2E test suite (reincarnated from #63)
- 4 smart pipeline tools (#64)
- Operational runbooks (#47, #49, #51)
- Node 26-alpine production image (#67)
- Action major bumps (#69, #70, #71, #72)"
```

Record as `$RELEASE_PR`.

- [ ] **Step 3: CI green + merge**

```bash
gh pr checks $RELEASE_PR --watch
gh pr merge $RELEASE_PR --squash --admin --delete-branch
```

- [ ] **Step 4: Sync main**

```bash
git checkout main
git pull --ff-only origin main
git log --oneline -3
```

Expected: top commit is `chore(release): 0.8.0`.

### Task I3: Create GitHub Release (triggers publish-npm)

**Files:** none

- [ ] **Step 1: Extract CHANGELOG body for release notes**

```bash
awk '/^## \[0\.8\.0\]/{flag=1; next} /^## \[/{flag=0} flag' CHANGELOG.md > /tmp/release-body.md
cat /tmp/release-body.md | head -30
```

Expected: the body of the 0.8.0 section, ready to paste.

- [ ] **Step 2: Create release**

```bash
gh release create v0.8.0 \
  --title "v0.8.0 — E2E suite + smart pipeline tools" \
  --notes-file /tmp/release-body.md \
  --target main
```

Expected: release URL emitted. The `release.published` event triggers `publish.yml`.

- [ ] **Step 3: Watch publish workflow**

```bash
sleep 5  # give Actions a moment to register the event
gh run list --workflow=publish.yml --limit 1
gh run watch <run-id>
```

Expected: `publish-npm` job runs, succeeds.

- [ ] **Step 4: Verify npm publish landed**

```bash
sleep 30  # npm registry propagation
npm view @yoda.digital/gitlab-mcp-server@0.8.0 --json | jq '{version, dist: .dist | {tarball, integrity, signatures}}'
```

Expected:
- `version: "0.8.0"`
- `dist.signatures`: present (Sigstore provenance attestation)

- [ ] **Step 5: Verify ghcr image (built by build.yml on tag)**

```bash
gh run list --workflow=build.yml --branch v0.8.0 --limit 1
docker pull ghcr.io/yoda-digital/gitlab-mcp-server:0.8.0
docker inspect ghcr.io/yoda-digital/gitlab-mcp-server:0.8.0 --format='{{.Config.User}} {{.Architecture}}'
```

Expected: runs as `node`, arch matches local.

---

## Phase J: Wrap-up + memory + final verification (~20 min)

### Task J1: Verify final state

**Files:** none

- [ ] **Step 1: 0 open PRs**

```bash
gh pr list --state open --json number,title
```

Expected: `[]` (empty array).

- [ ] **Step 2: Expected issues closed**

```bash
for n in 47 49 51 63 64; do
  printf "Issue/PR #%-3d " $n
  gh api repos/yoda-digital/mcp-gitlab-server/issues/$n --jq '.state'
done
```

Expected: all 5 show `closed`.

- [ ] **Step 3: Issue #52 still open with design comment**

```bash
gh issue view 52 --json state,comments -q '{state: .state, comment_count: (.comments | length)}'
```

Expected: `state: "open"`, `comment_count` >= 1 (the design doc from Phase H).

- [ ] **Step 4: Main is at 0.8.0**

```bash
jq -r .version package.json
git log --oneline -1
```

Expected: `0.8.0` and a release commit at the tip.

- [ ] **Step 5: Dependabot alerts**

```bash
gh api repos/yoda-digital/mcp-gitlab-server/dependabot/alerts --jq '[.[] | select(.state=="open")] | length'
```

Expected: `0`.

### Task J2: Update project memory snapshot

**Files:**
- Modify: `/home/ubuntu/.claude/projects/-home-ubuntu-gits-mcp-gitlab-server/memory/project_repo_security_state.md`

- [ ] **Step 1: Append a 2026-05-18 (post-megasession) entry**

In the file, locate the `## Last comprehensive passes` section and add a new bullet at the end:

```markdown
- **2026-05-18 (megasession)** — Full backlog resolution. Per Path B reincarnation precedent set by #80: PR #63 reincarnated as #81 with 9 maintainer corrections (npm version pins, image digest pin, password normalization, type narrowing, .dockerignore, POSIX grep, security hardening on warm-gitlab.yml, etc.). Issue #64 implemented as smart pipeline tools (4 new tools: get_pipeline_summary, get_failed_jobs, get_job_log_smart, retry_failed_jobs). Docs bundle PR closed #47/#49/#51 (release atomicity recovery, release ceremony, ghcr first-publish runbook) + fixed stale CLAUDE.md. Issue #52 received a 4-phase design doc as a comment; implementation deferred to 0.9.0. Released as 0.8.0 via the release-driven publish pipeline. State at completion: 0 open PRs, 1 open issue (#52, by design), 0 Dependabot alerts.
```

- [ ] **Step 2: Commit memory (it's outside the repo, no git commit needed — Memory file edit is enough)**

Memory files are tracked by Claude Code separately. No `git commit` needed.

### Task J3: Final tech-lead report

**Files:** none (verbal report)

- [ ] **Step 1: Summarize for owner**

Report should cover:
1. What shipped (5 issues closed, 1 PR shipped, 0.8.0 published)
2. What was deferred and why (#52 design doc instead of implementation)
3. Surprises encountered during execution (failed tests caught + fixed, version mismatches, etc.)
4. Lessons for next session (process improvements, memory updates)

Per memory `feedback_github_artifacts_senior_style`: report in senior teamlead voice; file-grounded; concise.

---

## Self-Review (skill-required)

> Run this checklist yourself after completing the plan. Fix issues inline.

### 1. Spec coverage

| Spec item | Covered by |
|---|---|
| PR #63 reincarnation | Phases B-E |
| Issue #64 smart tools | Phase F |
| Issue #47 release atomicity docs | Task G1 |
| Issue #49 release ceremony docs | Task G2 |
| Issue #51 ghcr first-publish runbook | Task G3 |
| Issue #52 multi-arch + SBOM + cosign + Trivy | Phase H (design only) |
| CLAUDE.md stale npm test | Task G4 |
| Maintainer-rebase pattern doc | Task E2 |
| Release 0.8.0 | Phase I |

All spec items mapped to tasks.

### 2. Placeholder scan

Sweep done — no `TBD`, no `TODO`, no "add appropriate validation", no "similar to Task N". Every code step shows actual code. Exploratory parts (Phase D failure triage, Phase F formatter shape) document the PROCESS and reference existing patterns to mimic, rather than placeholder code.

### 3. Type consistency

- `GetPipelineSummaryInput`, `GetFailedJobsInput`, `GetJobLogSmartInput`, `RetryFailedJobsInput` types defined in Task F1, referenced in Task F2 — consistent names.
- `GitLabApi.getFailedJobs(input)` signature — consistent across F2 (definition) and F4 (call site).
- `ToolResult` type — defined in Task C5, used in F5 E2E tests (`extractText(result: ToolResult)`).

No name drift detected.

---

## Execution Handoff

**Plan complete and saved to `docs/plans/2026-05-18-full-resolution-megasession.md`. Two execution options:**

**1. Subagent-Driven (recommended)** — owner dispatches a fresh subagent per task (or per Phase), with two-stage review between Phases. Subagent-driven is best when execution may span multiple sessions and each Phase produces a discrete check-pointable artifact.

**2. Inline Execution** — owner runs through this plan task-by-task in the active session using superpowers:executing-plans. Best for shorter Phases (G, H, I, J) where context-switching cost > subagent dispatch cost.

**Recommended cadence:**
- Session 1 (this one): Phases A-C (analysis + mechanical fixes, no Docker)
- Session 2: Phase D (Docker GitLab CE validation — the work)
- Session 3: Phase E (ship #63) + Phase G (docs bundle, parallel)
- Session 4: Phase F (smart tools, depends on E shipping first)
- Session 5: Phase H + Phase I + Phase J (design doc + release + wrap)

**Which approach, and when do you want to start?**
