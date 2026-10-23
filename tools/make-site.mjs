#!/usr/bin/env node
// Package the tested build for deployment: html/dist plus a vercel.json that
// keeps the routing and headers but has NO build step. CI uploads the result
// as the "site" artifact; deploy.yml ships exactly that folder with
// tools/vercel-upload.mjs, so what goes live is byte-for-byte what CI tested.
//
//   node tools/make-site.mjs [outDir=site]
import { cpSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const out = resolve(process.argv[2] || join(root, "site"));
const dist = join(root, "html", "dist");
if (!existsSync(join(dist, "games-manifest.json"))) {
  console.error("make-site: html/dist/games-manifest.json missing; run the build first");
  process.exit(1);
}
rmSync(out, { recursive: true, force: true });
mkdirSync(out, { recursive: true });
cpSync(dist, out, { recursive: true, filter: (src) => !src.includes(`${join("dist", ".vite")}`) });

const config = JSON.parse(readFileSync(join(root, "vercel.json"), "utf8"));
for (const key of ["buildCommand", "installCommand", "outputDirectory", "devCommand", "framework"]) delete config[key];
writeFileSync(join(out, "vercel.json"), JSON.stringify(config, null, 2) + "\n");

const { buildId } = JSON.parse(readFileSync(join(out, "games-manifest.json"), "utf8"));
console.log(`make-site: ${out} ready (build ${buildId})`);
