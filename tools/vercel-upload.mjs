#!/usr/bin/env node
// Upload a folder of already-built static files to ONE Vercel project as a
// production deployment, using only the Vercel REST API. No build runs on
// Vercel and no repository code runs here, so the token is only ever used for
// the upload itself.
//
//   VERCEL_TOKEN=... node tools/vercel-upload.mjs --dir site --project-id prj_...
//
// Works with project-scoped tokens (recommended: a token that can only touch
// this one project) and with team tokens (pass VERCEL_ORG_ID). Prints the
// deployment URL and exits non-zero unless the deployment is READY.
import { createHash } from "node:crypto";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";

const args = process.argv.slice(2);
const arg = (name) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1] : undefined;
};
const dir = arg("dir");
const projectId = arg("project-id");
const token = process.env.VERCEL_TOKEN;
const orgId = process.env.VERCEL_ORG_ID;

function fail(msg) {
  console.error(`vercel-upload: ${msg}`);
  process.exit(1);
}
if (!dir || !projectId) fail("usage: node tools/vercel-upload.mjs --dir <folder> --project-id <prj_...>");
if (!token) fail("VERCEL_TOKEN is not set");

const API = "https://api.vercel.com";
let useTeam = false; // project-scoped tokens must NOT send a team; team tokens must.

async function call(path, init = {}, raw = false) {
  const attempt = async (withTeam) => {
    const sep = path.includes("?") ? "&" : "?";
    const url = `${API}${path}${withTeam && orgId ? `${sep}teamId=${encodeURIComponent(orgId)}` : ""}`;
    return fetch(url, { ...init, headers: { Authorization: `Bearer ${token}`, ...(init.headers || {}) } });
  };
  let res = await attempt(useTeam);
  if ((res.status === 403 || res.status === 404) && !useTeam && orgId) {
    const retry = await attempt(true);
    if (retry.ok) {
      useTeam = true;
      res = retry;
    }
  }
  if (raw) return res;
  const text = await res.text();
  const body = text ? JSON.parse(text) : {};
  if (!res.ok) fail(`${init.method || "GET"} ${path} answered ${res.status}: ${body.error?.message || text.slice(0, 300)}`);
  return body;
}

function listFiles(root) {
  const out = [];
  const walk = (d) => {
    for (const name of readdirSync(d)) {
      const p = join(d, name);
      if (name === ".vercel" || name === ".git") continue;
      if (statSync(p).isDirectory()) walk(p);
      else out.push(p);
    }
  };
  walk(root);
  return out;
}

const project = await call(`/v9/projects/${encodeURIComponent(projectId)}`);
const files = listFiles(dir).map((p) => {
  const data = readFileSync(p);
  return { file: relative(dir, p).replace(/\\/g, "/"), data, sha: createHash("sha1").update(data).digest("hex"), size: data.length };
});
if (files.length === 0) fail(`no files in ${dir}`);
console.log(`vercel-upload: ${files.length} file(s) to project "${project.name}"`);

// Upload contents (Vercel de-duplicates by SHA; re-uploads are cheap).
let next = 0;
async function worker() {
  while (next < files.length) {
    const f = files[next++];
    const res = await call(
      "/v2/files",
      {
        method: "POST",
        headers: { "Content-Type": "application/octet-stream", "x-vercel-digest": f.sha, "Content-Length": String(f.size) },
        body: f.data,
      },
      true,
    );
    if (!res.ok) fail(`upload of ${f.file} answered ${res.status}: ${(await res.text()).slice(0, 200)}`);
  }
}
await Promise.all(Array.from({ length: 8 }, worker));

// Create the production deployment from those files, with no build step.
const created = await call("/v13/deployments", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({
    name: project.name,
    project: project.id,
    target: "production",
    files: files.map(({ file, sha, size }) => ({ file, sha, size })),
    projectSettings: { framework: null, buildCommand: null, installCommand: null, devCommand: null, outputDirectory: null, rootDirectory: null },
  }),
});
console.log(`vercel-upload: created ${created.id} (${created.url})`);

const deadline = Date.now() + 5 * 60_000;
for (;;) {
  const d = await call(`/v13/deployments/${created.id}`);
  if (d.readyState === "READY") {
    console.log(`vercel-upload: READY https://${d.url}`);
    break;
  }
  if (d.readyState === "ERROR" || d.readyState === "CANCELED") fail(`deployment ${created.id} ended ${d.readyState}`);
  if (Date.now() > deadline) fail(`deployment ${created.id} not ready after 5 minutes (state ${d.readyState})`);
  await new Promise((r) => setTimeout(r, 4000));
}
