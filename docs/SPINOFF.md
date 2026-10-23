# Spinning off a client bundle

The template stays game-free and private. Each client gets its own repository
made from it. Budget about an hour the first time.

## 1. Create the repository

On GitHub: **Use this template** > create `<client>-bundle` (public if games
will be contributed by outsiders, private otherwise). Clone it.

## The one rule about hosting

**Every bundle gets brand-new hosting.** Never point a bundle at a Vercel
project, domain or APK host that any other bundle, app or experiment has
used, not even temporarily. A deploy replaces the whole site, so two
repositories sharing a project overwrite each other's games on every device,
and an old app's installed shim would start loading the new bundle.

This is enforced. Before every deploy, `tools/check-hosting.mjs`:

- refuses a `bundle.config.json` still holding template placeholders, or whose
  `repository` is not the repository running the deploy;
- refuses a Vercel project that does not serve the configured URL;
- claims a project for this repository the first time (a `BUNDLE_REPOSITORY`
  variable on the project), refuses a project already claimed by another
  repository, and refuses an unclaimed project that has ever been deployed to.

So the only project that passes is one created fresh for this bundle.

## 2. Fill in `bundle.config.json`

```json
{
  "name": "Client Games",            // app and site title (max 40)
  "shortName": "Client",             // home-screen label (max 12)
  "description": "One line.",
  "repository": "<owner>/<this-repo>",       // must equal this GitHub repository
  "appId": "com.client.games",       // Android id, reverse domain, never change after the first install
  "webUrl": "https://client-games.vercel.app",      // the web project's production URL
  "apkUrl": "https://client-games-apk.vercel.app",  // the APK host project's production URL
  "theme": { "background": "#0e1116", "accent": "#58a6ff" },
  "budgets": { "maxGameMB": 10, "maxFileMB": 3, "maxFilesPerGame": 400 },
  "audio": { "defaultMutedOnDesktop": false }
}
```

Then push the config into the generated files and commit:

```bash
node tools/sync-config.mjs      # vercel.json, capacitor.config.json, html/shell, android/
git add -A && git commit -m "config: <client> bundle"
```

Replace the icon: drop your square SVG at `html/public/icons/icon.svg` and run
`node tools/gen-icons.mjs` (it renders 16/32/180/192/512 PNGs headless). For the
Android launcher icon, replace the files under `android/app/src/main/res/mipmap-*`
(any Android icon generator produces them).

## 3. Hosting (Vercel, two NEW projects)

Create both projects now, for this bundle only. Do not reuse any existing
project or domain (see "The one rule about hosting" above).

1. Create project **`<client>-games`** (the web project). Framework preset:
   Other. Leave the build command and output directory empty: `vercel.json`
   sets them. Do NOT connect it to the Git repository; deploys come from the
   workflow so there is exactly one path.
2. Create project **`<client>-games-apk`** (the APK host). Root directory
   `apk-host/`. Also not connected to Git.
3. Note each project's `projectId` and the team `orgId` (Project Settings >
   General, or `vercel project ls --format json`).
4. Create a Vercel token (Account > Tokens) scoped to the team.

If the production URLs differ from what you put in `bundle.config.json`, fix the
config now and re-run `sync-config`. From the CLI:

```bash
vercel project add <client>-games
vercel project add <client>-games-apk
```

The first deploy claims each project for this repository; you can check
beforehand with `GITHUB_REPOSITORY=<owner>/<repo> VERCEL_TOKEN=... VERCEL_ORG_ID=... VERCEL_PROJECT_ID=... node tools/check-hosting.mjs --dry-run`.

## 4. GitHub secrets and settings

Repository > Settings > Secrets and variables > Actions:

| Secret | Used by |
|---|---|
| `VERCEL_TOKEN` | deploy.yml, shim.yml |
| `VERCEL_ORG_ID` | deploy.yml, shim.yml |
| `VERCEL_PROJECT_ID` | deploy.yml (web project) |
| `VERCEL_APK_PROJECT_ID` | shim.yml (APK host) |
| `ANTHROPIC_API_KEY` | claude-review.yml (or install the Claude GitHub app and set `CLAUDE_CODE_OAUTH_TOKEN`) |
| `ANDROID_KEYSTORE_BASE64`, `ANDROID_KEYSTORE_PASSWORD`, `ANDROID_KEY_ALIAS`, `ANDROID_KEY_PASSWORD` | shim.yml, optional release signing |

Settings > Environments: create `production` (deploy.yml uses it; add required
reviewers there if a human should approve each deploy).

Protect `main` (public repository, or a paid GitHub plan):

```bash
node tools/protect-main.mjs
```

It adds a ruleset: changes only through pull requests, one code-owner review,
the two CI jobs passing, no force pushes. Admins can merge a PR without the
review (a sole maintainer cannot approve their own PR) but cannot push to
`main` directly. Edit `.github/CODEOWNERS` to name the maintainers first.

Automated review on forked PRs: GitHub does not give secrets to workflows
running for a fork, so the automatic review only runs for branches of this
repository. For a fork, a maintainer comments `/claude-review` on the PR.

## 5. First deploy and first shim

Merge a PR to `main`. CI runs; when it passes, `deploy.yml` deploys that exact
commit (it checks out CI's commit and refuses to ship if its build differs
from the one CI tested), claims the fresh projects on the first run, and
verifies the live buildId.

```bash
tools/verify-live.sh <buildId>     # the id printed by the deploy run
```

Then Actions > **Shim APK** > Run workflow (publish = true). When it finishes,
`<webUrl>/download` serves the installer. Install it on a device once. Every
later content change reaches it on next focus (`DEPLOY.md`).

Signing: the first shim decides the key. Debug signing is fine for side-loaded
devices; add the keystore secrets before the first publish if you want a release
key. Switching later means uninstall and reinstall on every device.

## 6. Open it up

- Put the contributor pitch in `README.md` (what the bundle is for, who plays it,
  art direction if any). The guides in `docs/guides/` are client-neutral; add a
  `docs/guides/STYLE.md` if the client has an art or tone guide and link it from
  `docs/guides/UI.md` and `docs/guides/ART.md`.
- Contributors follow `CONTRIBUTING.md`; with Claude Code they run `/new-game`.
- Keep the template's framework files unmodified where you can, so improvements
  can be pulled from the template later (`git remote add template ...` and merge).

## Checklist

- [ ] `bundle.config.json` filled, `node tools/sync-config.mjs --check` passes
- [ ] icons replaced, `node tools/gen-icons.mjs` run
- [ ] `repository` set to this repo; two NEW Vercel projects (never reused), not Git-connected, URLs match the config
- [ ] secrets set, `production` environment exists, `node tools/protect-main.mjs` run
- [ ] first deploy verified at the real URL
- [ ] shim published, installed once on a device, launches the hub
- [ ] a test game PR went through CI, review and auto-deploy end to end
