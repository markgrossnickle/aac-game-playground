# CI budget: keep GitHub Actions minimal

Status 2026-10-23. In October 2026 the GitHub account ran out of Actions minutes
and every workflow in every repo stopped with "The job was not started because
recent account payments have failed or your spending limit needs to be
increased". Most of the minutes went to Playwright e2e shards running on every
PR, plus a daily macOS determinism matrix (macOS bills 10x). Every repo
spun off from this template shares that one account budget, so treat Actions
minutes as scarce.

## Rules for any repo made from this template

1. **Local checks are the gate.** Build, unit tests and the Playwright smoke or
   e2e run on the developer's machine (headless, muted) before merging. Each PR
   says which checks ran locally and their results.
2. **At most one cheap CI job.** If a repo keeps CI at all, it is one
   `ubuntu-latest` job: install, type check, build, unit tests, about a minute.
   It runs on `pull_request` only, not also on `push` to the same branch (that
   pays twice for one change).
3. **Never in Actions:**
   - Playwright / browser e2e or smoke tests (installing Chromium alone costs
     about a minute per run). Run them locally.
   - `macos-latest` or `windows-latest` runners (10x and 2x billing).
   - Matrices (OS, Node versions, test shards).
   - `schedule:` crons. A daily job is 30 runs a month whether anything changed
     or not.
   - Workflows that install Claude Code or call an LLM on every push or PR
     (automated review, changelogs). They cost Actions minutes and API money.
     Run them by hand (`workflow_dispatch`) or locally.
4. **Deploys are manual.** Deploy from a script on the developer's machine, or
   from a `workflow_dispatch` workflow you click. Never chain a deploy off every
   CI run with `workflow_run`.
5. **Repos that are idle get Actions turned off**, not just left alone:
   ```bash
   gh api -X PUT repos/<owner>/<repo>/actions/permissions -F enabled=false
   ```
   Turn it back on with `-F enabled=true`. This is reversible and leaves the
   workflow files in place.
6. **Before adding a workflow, estimate it:** runs per month x jobs per run x
   minutes per job x runner multiplier. If that is more than about 100 minutes
   a month, it does not go in Actions.

## What this means for this template's own workflows

This template was built CI-first (CI gates the deploy). When spinning off a new
bundle, trim it to the rules above:

| Workflow | Cost | At spin-off |
|---|---|---|
| `ci.yml` | `checks` is cheap; `build-and-smoke` installs Chromium and runs Playwright on every PR and every push to `main` | Keep `checks` plus build on `pull_request` only. Move the smoke test to local (`cd html && npm run build && npm run smoke`). |
| `claude-review.yml` | One Claude Code run per PR update, plus API spend | Delete it, or change it to `/claude-review` comment only. |
| `deploy.yml` | Rebuilds on every merge via `workflow_run` | Switch to `workflow_dispatch`, or deploy from a local script as voobug-bundle does (`tools/deploy-ota.sh`). The buildId check then compares against a local build. |
| `shim.yml` | Manual only, Android build is slow but rare | Keep as is. |

## Where things stand (October 2026)

- voobug-bundle: no Actions; local checks before `tools/deploy-ota.sh`.
- diddits: one build + unit job on PRs into `staging` and `prod`; e2e local only.
- TBS repos (tbs-precamp, roblox-tbs, roblox-tbs-luau, turn-based-strategy,
  tbs-prototypes): Actions turned off at the repo level.
