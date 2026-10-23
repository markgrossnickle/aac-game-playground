#!/usr/bin/env node
// Protect `main` of this bundle's GitHub repository with a ruleset:
//   - changes land only through pull requests (no direct or force pushes, no deletion)
//   - one approving review, from a code owner, stale approvals dismissed
//   - the CI jobs must pass on the latest commit
// Repository admins may still merge a PR without the review/check gates
// (bypass mode "pull_request"), because a sole maintainer cannot approve their
// own PR. They can never push straight to main.
//
//   node tools/protect-main.mjs                 # uses `gh` and bundle.config.json "repository"
//   node tools/protect-main.mjs owner/repo
//
// Rulesets need a public repository or a paid GitHub plan.
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const cfg = JSON.parse(readFileSync(join(root, "bundle.config.json"), "utf8"));
const repo = process.argv[2] || cfg.repository;
if (!repo || repo === "OWNER/REPO") {
  console.error("protect-main: set bundle.config.json \"repository\" or pass owner/repo");
  process.exit(2);
}

// Job names from .github/workflows/ci.yml.
const CHECKS = ["Lint games and config", "Build and smoke test"];
const body = {
  name: "Protect main",
  target: "branch",
  enforcement: "active",
  conditions: { ref_name: { include: ["~DEFAULT_BRANCH"], exclude: [] } },
  bypass_actors: [{ actor_id: 5, actor_type: "RepositoryRole", bypass_mode: "pull_request" }],
  rules: [
    { type: "deletion" },
    { type: "non_fast_forward" },
    {
      type: "pull_request",
      parameters: {
        required_approving_review_count: 1,
        dismiss_stale_reviews_on_push: true,
        require_code_owner_review: true,
        require_last_push_approval: false,
        required_review_thread_resolution: true,
      },
    },
    {
      type: "required_status_checks",
      parameters: {
        strict_required_status_checks_policy: true,
        required_status_checks: CHECKS.map((context) => ({ context })),
      },
    },
  ],
};

const gh = (args, input) => execFileSync("gh", args, { input, encoding: "utf8", stdio: ["pipe", "pipe", "inherit"] });
const existing = JSON.parse(gh(["api", `repos/${repo}/rulesets`]));
const found = existing.find((r) => r.name === body.name);
const out = found
  ? gh(["api", "-X", "PUT", `repos/${repo}/rulesets/${found.id}`, "--input", "-"], JSON.stringify(body))
  : gh(["api", "-X", "POST", `repos/${repo}/rulesets`, "--input", "-"], JSON.stringify(body));
const r = JSON.parse(out);
console.log(`protect-main: ruleset "${r.name}" (${r.id}) is ${r.enforcement} on ${repo}; required checks: ${CHECKS.join(", ")}`);
