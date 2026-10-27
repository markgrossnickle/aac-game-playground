# DEPLOY.md: how a change reaches people

Authoritative. If another file disagrees, this one wins. No em dashes in docs.

## The whole story

1. Users get ONE installer from ONE URL: `<webUrl>/download` serves `/games.apk`,
   a redirect to `<apkUrl>/games.apk`: a ~4 MB Capacitor **shim**.
2. The shim's WebView loads `<webUrl>` LIVE (`server.url` in
   `capacitor.config.json`, generated from `bundle.config.json`). The site works
   in any browser too, and installs as a PWA.
3. So the device shows whatever the web project serves right now. **Content
   changes need no reinstall.** Only native changes (app name, icon,
   permissions, Capacitor plugins or versions, `appId`, `webUrl`) need a new shim,
   and a shim installs only if `versionCode` went UP (the workflow bumps it).
4. Deploys are started by hand from `main` (`docs/CI-BUDGET.md`: no deploy
   chained off CI). `.github/workflows/deploy.yml` builds without any secret,
   then a second job proves the hosting is this bundle's own fresh project
   (`tools/check-hosting.mjs`), uploads exactly that build through the Vercel
   API (`tools/vercel-upload.mjs`; no build and no repository code run while
   the token is loaded), and `tools/verify-live.sh` confirms the live
   `buildId`. Each Vercel project has its own project-scoped token in the
   `production` environment.
5. Every open page re-reads `games-manifest.json` on focus. The hub reloads when
   it changed, cached games refresh in the background, a game in play shows a
   tap-to-update banner. Details: `docs/ARCHITECTURE.md`.

## Surfaces

| Thing | What it is |
|---|---|
| Web project (`VERCEL_PROJECT_ID`) | Serves the hub, every game, `/download`, `games-manifest.json`, `sw.js`. The only content surface. |
| APK host project (`VERCEL_APK_PROJECT_ID`, deployed from `apk-host/`) | Hosts the shim once, so content deploys never store an APK. |
| The shim (`android/`, `capacitor.config.json`) | `webDir html/shell` (offline fallback page only), `server.url` = `webUrl`. `versionCode` lives in `android/app/build.gradle`. |

Neither project is connected to GitHub's Vercel integration. Every deploy is a
CLI upload by a workflow, so there is exactly one path.

Both projects are created new for this bundle and claimed by it on first
deploy. A project that another repository claimed, or that was ever deployed
before being claimed, is refused. Never reuse hosting from another bundle or
app (docs/SPINOFF.md, "The one rule about hosting").

## Content change vs native change

| Change | Examples | What happens |
|---|---|---|
| Content | any game, hub, CSS, art, audio, JSON, `vercel.json` headers | Merge to `main`, then run Deploy. Devices update on next focus. |
| Native | app name or icon (`android/app/src/main/res`), `AndroidManifest.xml`, a Capacitor plugin, Capacitor/Gradle/SDK versions, `appId` or `webUrl` in `bundle.config.json` | Merge to `main`, then run **Shim APK** (Actions tab). Users install once from `/download`. |

Native gotchas that have bitten before:

- `versionCode` must go UP or Android keeps the old shim and the reinstall looks
  like it did nothing. The workflow bumps it and pushes the bump as a branch;
  merge its PR (link in the run summary) so the next build counts up from there.
- A shim built without `npx cap sync android` has an empty
  `assets/capacitor.plugins.json`, so every plugin call (the hold-to-exit button,
  the app-resume update check) silently does nothing. The workflow refuses to
  publish a shim without `AppPlugin`.
- A debug-signed shim and a release-signed shim have different keys; Android
  will not install one over the other. Pick one and keep it.

## The flow

```sh
# 1. land the change on main through a PR (protected: review + the one CI job)
# 2. on an up-to-date main, run the local gate (headless, muted):
git switch main && git pull --ff-only
(cd html && npm ci && npm run build && npm run smoke)
# 3. start the deploy and watch it:
gh workflow run deploy.yml && gh run watch
# 4. VERIFY at the real URL (not optional):
tools/verify-live.sh <buildId>  # the id the deploy run printed
```

Native change: after step 3, Actions > Shim APK > Run workflow (publish = true).
It builds, checks the APK, publishes it to the APK host, verifies both URLs
serve the new size, and pushes the `versionCode` bump as a branch. Open and
merge its PR from the link in the run summary.

## VERIFY at the real URL

A workflow's green badge, a build log or a "Ready" badge is not proof.

```sh
WEB=$(node -p 'require("./bundle.config.json").webUrl')
curl -s "$WEB/games-manifest.json?cb=$RANDOM" | node -p 'JSON.parse(require("fs").readFileSync(0,"utf8")).buildId'
curl -sIL "$WEB/games.apk?cb=$RANDOM" | grep -i content-length          # shim size
curl -sfL -o /tmp/live.apk "$WEB/games.apk" && unzip -p /tmp/live.apk assets/capacitor.plugins.json
```

Then on a device: bring the app to the foreground (or relaunch) and look.

## Troubleshooting

| Symptom | Likely cause | Fix |
|---|---|---|
| Device shows old content, live buildId is new | App was not focused since the deploy, or an old service worker is serving | Background and foreground the app; if still stale, swipe it away and relaunch. The SW is network-first for HTML and the manifest, so a relaunch always fetches. |
| "App not installed" or the install changes nothing | Same `versionCode`, or a different signing key | Ship through the Shim workflow (it bumps); keep one signing key. |
| Hold-to-exit or app-resume check does nothing | Shim built without `cap sync` | Rebuild with the workflow. |
| Game works on the web, images or audio 404 in the app | Asset not in the build graph (string path, `public/`) | `docs/guides/CODING.md`; `check-games` catches most of it. |
| Deploy dies uploading | Over Vercel's 15,000-file limit | `.vercelignore` must exclude `node_modules/`, `html/dist/`, `.claude/`. |
| `verify-live` loops on a different buildId | Vercel built a different tree than CI (uncommitted files, different Node) | Both build from the same commit with `html/.nvmrc`; check the deploy log's commit. |

## DO NOT

- Do NOT deploy from a branch or run `vercel --prod` by hand: every deploy is
  full-site, so a branch deploy reverts every other game.
- Do NOT say "shipped" without fetching the real URL and quoting the buildId.
- Do NOT ship a shim without a `versionCode` increase.
- Do NOT commit an APK (`*.apk` is gitignored) or re-include one in `.vercelignore`.
- Do NOT reuse hosting: no project, domain or APK host from any other bundle
  or app. Create new ones per bundle; `check-hosting` refuses anything else.
- Do NOT create a second APK, download URL or hosting project for the same bundle.
- Do NOT put a game anywhere but `html/games/<id>/`.
- Do NOT run two deploys at once (the workflow's concurrency group prevents it).
- Do NOT deploy by hand to skip CI; deploy.yml only ships a commit CI passed.
