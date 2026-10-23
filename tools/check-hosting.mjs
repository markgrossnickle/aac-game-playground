#!/usr/bin/env node
// Every bundle gets its OWN, FRESH hosting. A bundle must never deploy onto a
// Vercel project that another bundle (or anything else) has used, because a
// deploy replaces the whole site: pointing two repos at one project means one
// silently overwrites the other's games on every device.
//
// Run by deploy.yml (web project) and shim.yml (APK host) before deploying:
//
//   node tools/check-hosting.mjs --project web    # uses VERCEL_PROJECT_ID
//   node tools/check-hosting.mjs --project apk    # uses VERCEL_APK_PROJECT_ID
//
// Needs VERCEL_TOKEN, VERCEL_ORG_ID, the project id, and GITHUB_REPOSITORY.
//
// Checks, in order:
//   1. bundle.config.json is filled in for this bundle: no template
//      placeholders, and `repository` equals the GitHub repository running this.
//   2. The Vercel project serves the configured URL (webUrl or apkUrl host).
//   3. Ownership claim: the project carries a BUNDLE_REPOSITORY environment
//      variable naming its one owner repository.
//        - present and equal  -> OK
//        - present, different -> FAIL: this project belongs to another bundle
//        - absent             -> the project must be brand new (no production
//                                deployments yet); it is then claimed by
//                                writing BUNDLE_REPOSITORY. A project that was
//                                ever deployed before is refused.
import { readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, "..");
const args = process.argv.slice(2);
const which = args[args.indexOf("--project") + 1] || "web";
const dryRun = args.includes("--dry-run");

const PLACEHOLDER_HOSTS = [/(^|\.)example[-.]/i, /example-bundle/i, /\.example$/i, /localhost/i];
const PLACEHOLDER_REPO = /^OWNER\/REPO$/;
const CLAIM_KEY = "BUNDLE_REPOSITORY";

function fail(msg) {
  console.error(`check-hosting: FAIL: ${msg}`);
  console.error("Every bundle needs its own fresh hosting projects. See docs/SPINOFF.md, step 3.");
  process.exit(1);
}

const cfg = JSON.parse(readFileSync(join(root, "bundle.config.json"), "utf8"));
const repo = process.env.GITHUB_REPOSITORY;
const token = process.env.VERCEL_TOKEN;
const orgId = process.env.VERCEL_ORG_ID;
const projectId = which === "apk" ? process.env.VERCEL_APK_PROJECT_ID : process.env.VERCEL_PROJECT_ID;
const url = which === "apk" ? cfg.apkUrl : cfg.webUrl;

// 1. Config is this bundle's own.
if (!cfg.repository || PLACEHOLDER_REPO.test(cfg.repository)) {
  fail('bundle.config.json "repository" is still the template placeholder. Set it to "<owner>/<repo>" of this bundle.');
}
if (repo && cfg.repository.toLowerCase() !== repo.toLowerCase()) {
  fail(`bundle.config.json "repository" is ${cfg.repository} but this is ${repo}. A config copied from another bundle points at that bundle's hosting.`);
}
let host;
try {
  host = new URL(url).host;
} catch {
  fail(`${which === "apk" ? "apkUrl" : "webUrl"} is not a URL`);
}
if (PLACEHOLDER_HOSTS.some((re) => re.test(host))) {
  fail(`${which === "apk" ? "apkUrl" : "webUrl"} (${url}) is still a template placeholder.`);
}
if (cfg.webUrl && cfg.apkUrl && new URL(cfg.webUrl).host === new URL(cfg.apkUrl).host) {
  fail("webUrl and apkUrl must be two different projects (the APK host stays separate so content deploys never store an APK).");
}
if (!token || !orgId || !projectId) {
  fail(`VERCEL_TOKEN, VERCEL_ORG_ID and ${which === "apk" ? "VERCEL_APK_PROJECT_ID" : "VERCEL_PROJECT_ID"} must be set.`);
}

const qs = orgId.startsWith("team_") ? `?teamId=${encodeURIComponent(orgId)}` : `?slug=${encodeURIComponent(orgId)}`;
async function api(path, init = {}) {
  const sep = path.includes("?") ? "&" : "?";
  const res = await fetch(`https://api.vercel.com${path}${qs.replace("?", sep)}`, {
    ...init,
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json", ...(init.headers || {}) },
  });
  const text = await res.text();
  const body = text ? JSON.parse(text) : {};
  if (!res.ok) fail(`Vercel API ${init.method || "GET"} ${path} answered ${res.status}: ${body.error?.message || text.slice(0, 200)}`);
  return body;
}

// 2. The project serves the configured host.
const project = await api(`/v9/projects/${encodeURIComponent(projectId)}`);
const domains = await api(`/v9/projects/${encodeURIComponent(projectId)}/domains`);
const names = new Set((domains.domains || []).map((d) => d.name.toLowerCase()));
names.add(`${project.name}.vercel.app`.toLowerCase());
if (!names.has(host.toLowerCase())) {
  fail(`Vercel project "${project.name}" does not serve ${host} (it serves: ${[...names].join(", ")}). The secret and the config point at different places.`);
}

// 3. Ownership claim.
const envs = await api(`/v10/projects/${encodeURIComponent(projectId)}/env?decrypt=true`);
const claim = (envs.envs || []).find((e) => e.key === CLAIM_KEY);
if (claim) {
  const owner = claim.value;
  if (!owner) fail(`project "${project.name}" has a ${CLAIM_KEY} variable whose value cannot be read. Make it a plain variable naming its owner repository.`);
  if (owner.toLowerCase() !== repo.toLowerCase()) {
    fail(`project "${project.name}" belongs to ${owner}, not ${repo}. Create a new project for this bundle.`);
  }
  console.log(`check-hosting: OK, project "${project.name}" (${which}) belongs to ${repo} and serves ${host}.`);
  process.exit(0);
}

const deployments = await api(`/v6/deployments?projectId=${encodeURIComponent(projectId)}&target=production&limit=1`);
if ((deployments.deployments || []).length > 0) {
  fail(`project "${project.name}" has been deployed to before and was never claimed by a bundle. It is not fresh: create a new project for ${repo}.`);
}
if (dryRun) {
  console.log(`check-hosting: project "${project.name}" is fresh and would be claimed for ${repo} (dry run, nothing written).`);
  process.exit(0);
}
await api(`/v10/projects/${encodeURIComponent(projectId)}/env`, {
  method: "POST",
  body: JSON.stringify({ key: CLAIM_KEY, value: repo, type: "plain", target: ["production", "preview", "development"] }),
});
console.log(`check-hosting: claimed fresh project "${project.name}" (${which}) for ${repo}; it serves ${host}.`);
