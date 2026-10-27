#!/usr/bin/env node
// Protect `main` of this bundle's GitHub repository with a ruleset:
//   - changes land only through pull requests (no direct or force pushes, no deletion)
//   - the CI jobs must pass on the latest commit
//   - approving reviews: none by default, because GitHub never lets an author
//     approve their own PR, so a sole maintainer could not merge anything.
//     With a second maintainer, pass --reviews 1: that many approvals, from a
//     code owner, stale approvals dismissed.
// Repository admins may still merge a PR without the gates (bypass mode
// "pull_request"). Nobody can push straight to main.
//
//   node tools/protect-main.mjs                 # uses `gh` and bundle.config.json "repository"
//   node tools/protect-main.mjs owner/repo
//   node tools/protect-main.mjs --reviews 1     # once there are two maintainers
//
// Rulesets need a public repository or a paid GitHub plan.
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const cfg = JSON.parse(readFileSync(join(root, "bundle.config.json"), "utf8"));
const args = process.argv.slice(2);
const ri = args.indexOf("--reviews");
const reviews = ri >= 0 ? Number(args.splice(ri, 2)[1]) : 0;
if (!Number.isInteger(reviews) || reviews < 0 || reviews > 6) {
  console.error("protect-main: --reviews takes a whole number from 0 to 6");
  process.exit(2);
}
const repo = args[0] || cfg.repository;
if (!repo || repo === "OWNER/REPO") {
  console.error("protect-main: set bundle.config.json \"repository\" or pass owner/repo");
  process.exit(2);
}

// Job names from .github/workflows/ci.yml.
const CHECKS = ["Checks and build"];
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
        required_approving_review_count: reviews,
        dismiss_stale_reviews_on_push: reviews > 0,
        require_code_owner_review: reviews > 0,
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
console.log(`protect-main: ruleset "${r.name}" (${r.id}) is ${r.enforcement} on ${repo}; required checks: ${CHECKS.join(", ")}; required approvals: ${reviews}`);
