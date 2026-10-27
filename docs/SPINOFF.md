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
4. Create TWO **project-scoped** tokens at vercel.com/account/tokens: Scope =
   your team, then pick the project. One for `<client>-games` (becomes
   `VERCEL_TOKEN`), one for `<client>-games-apk` (becomes `VERCEL_APK_TOKEN`). A
   project-scoped token cannot touch any other project in your account, so a
   leak from this public repository cannot reach your other sites. Set an
   expiry and copy each value once.

If the production URLs differ from what you put in `bundle.config.json`, fix the
config now and re-run `sync-config`. From the CLI:

```bash
vercel project add <client>-games
vercel project add <client>-games-apk
```

The first deploy claims each project for this repository; you can check
beforehand with `node tools/check-hosting.mjs --dry-run` (needs
`GITHUB_REPOSITORY`, `VERCEL_TOKEN`, `VERCEL_ORG_ID` and `VERCEL_PROJECT_ID` in
the environment; never put a token on a command line you share).

## 4. GitHub secrets and settings

The workflows already follow the Actions budget rules in `docs/CI-BUDGET.md`:
one cheap check-and-build job on pull requests, smoke tests run locally, deploys
started by hand, Claude review only on request. Keep it that way.

The two tokens are credentials: they go in the `production` **environment**,
which only `main` may use. Everything else is an identifier and goes in the
repository secrets.

```bash
R=<owner>/<repo>
# production environment, usable from main only
gh api -X PUT repos/$R/environments/production -F "deployment_branch_policy[protected_branches]=false" -F "deployment_branch_policy[custom_branch_policies]=true"
gh api -X POST repos/$R/environments/production/deployment-branch-policies -f name=main
# credentials: the NAME comes first, then paste the token at the prompt
gh secret set VERCEL_TOKEN --env production -R $R
gh secret set VERCEL_APK_TOKEN --env production -R $R
# identifiers
gh secret set VERCEL_ORG_ID -R $R -b "team_..."
gh secret set VERCEL_PROJECT_ID -R $R -b "prj_..."
gh secret set VERCEL_APK_PROJECT_ID -R $R -b "prj_..."
# check: names only; a name that looks like a token means it went in the wrong place
gh secret list --env production -R $R
```

| Secret | Where | Used by |
|---|---|---|
| `VERCEL_TOKEN` (web project only) | environment `production` | deploy.yml |
| `VERCEL_APK_TOKEN` (APK project only) | environment `production` | shim.yml |
| `VERCEL_ORG_ID`, `VERCEL_PROJECT_ID`, `VERCEL_APK_PROJECT_ID` | repository | deploy.yml, shim.yml |
| `ANTHROPIC_API_KEY` or `CLAUDE_CODE_OAUTH_TOKEN` | repository, optional | claude-review.yml (costs per review with an API key) |
| `ANDROID_KEYSTORE_*` | environment `production`, optional | shim.yml release signing |

No repository code runs while a token is loaded: CI builds and tests the site
without secrets, and deploy.yml only uploads CI's tested files through the
Vercel API (`tools/vercel-upload.mjs`). Add required reviewers to the
`production` environment if a human should approve each deploy.

Protect `main` (public repository, or a paid GitHub plan):

```bash
node tools/protect-main.mjs
```

It adds a ruleset: changes only through pull requests, the one CI job
("Checks and build") passing, no force pushes, and no direct pushes to
`main`. It requires no approving review by default, because GitHub never lets
an author approve their own PR and a sole maintainer could otherwise merge
nothing. Once a second maintainer is in `.github/CODEOWNERS`, run it again
with `--reviews 1` to require a code-owner approval.

Claude review runs only when a maintainer comments `/claude-review` on a PR
(including PRs from forks, which never receive secrets themselves). Leave the
key unset to never pay for it.

## 5. First deploy and first shim

Run the local gate on `main`, then start the deploy by hand. It builds without
secrets, claims the fresh project on the first run, uploads that build and
verifies the live buildId.

```bash
(cd html && npm ci && npm run build && npm run smoke)
gh workflow run deploy.yml && gh run watch
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
