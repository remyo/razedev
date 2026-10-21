# RazeDev Hub Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [x]`) syntax for tracking.

**Goal:** Build the public RazeDev app chooser and import the private RazeTag and RazeStore websites into independent product routes, with safe manual publishing.

**Architecture:** Each product repository remains the editing source. An explicit registry controls website exports into `razedev/public/<app>/`; a small build generates the hub and assembles `dist/`. Private manual workflows update only their product snapshot, then the public repository's Pages workflow validates and deploys the complete site.

**Tech Stack:** Static HTML/CSS; Node.js 24 and built-in modules for importing, building, validation, and unit tests; existing Playwright/Chrome for local browser QA; GitHub Actions and GitHub Pages. Vue or another framework is allowed by the user, but is unnecessary for the approved hub behavior. No production package dependencies.

**Spec:** [Approved design](../specs/2026-10-22-razedev-hub-design.md).

## Global Constraints

- The product repositories remain the authoritative editing locations.
- Only explicitly selected website files are exported to the public repository.
- Product pages must have no navigation to the RazeDev hub or another app.
- Do not inject a shared RazeDev header, hub link, app switcher, or cross-product recommendation.
- Existing support email links and external documentation links remain available.
- The hub must work without JavaScript and support keyboard navigation, visible focus, reduced motion, enlarged text, and narrow screens.
- Reuse the approved original icons; do not invent a new product logo.
- Migration changes paths and metadata; it does not rewrite product claims, policy wording, policy dates, support addresses, or guide instructions.
- Preserve query strings and fragments.
- A missing expected page or asset fails the import rather than producing an incomplete publication.
- An import must not delete or rewrite the hub, registry, another product, or unrelated public files.
- Identical exports produce no extra commit.
- Never hardcode a token or put it in public files, logs, command arguments, or chat.
- Local implementation prepares and verifies files and workflows. Remote pushes, credential setup, repository visibility changes, and production cutover are separate from this local build and must be reported according to actual state.

## Review Focus

1. A product link containing `?v=...`, `#section`, an SVG fragment, or a stale absolute sharing URL must preserve its meaning after relocation. Task 1 pins these cases.
2. Missing files, symlinks in any path component, encoded traversal, or failed validation must leave the last product export and the other app unchanged. Task 2 pins these cases.
3. Direct `/home` navigation, JavaScript disabled, 320px width, and enlarged text must preserve useful navigation without exposing hub/cross-app links. Tasks 3 and 4 pin these cases.
4. A moving public branch or stale private workflow rerun must not overwrite another app or roll a newer product snapshot backward. Task 5 pins these cases.
5. A gallery image selected dynamically, a social-preview image, or a guide opened directly at a chapter must remain complete even when it is not an initial HTML image request. Tasks 2 and 4 pin these cases.

## Files and ownership

All relative paths below are inside `/Users/rem/Desktop/rem_dev/razedev`, except where explicitly named otherwise.

| Files | Responsibility |
| --- | --- |
| `apps.json` | Site origin/base path, product card data, exact page and asset manifests |
| `package.json`, `.gitignore` | Named commands; ignore `dist/`, `.preview/`, temporary export directories, and local dependencies |
| `scripts/lib/registry.mjs` | Registry parsing and validation |
| `scripts/lib/html.mjs`, `scripts/lib/routes.mjs` | Read HTML URL attributes and rewrite only those values; render compatibility redirects |
| `scripts/lib/validate.mjs` | Files, local references, fragments, and product navigation validation |
| `scripts/import-site.mjs` | Transactional export of one app from an explicit source directory |
| `public/razetag/**`, `public/razestore/**` | Committed, generated public snapshots |
| `src/hub.html`, `src/hub.css`, `src/404.html` | Accessible app chooser, responsive styling, and missing-page document |
| `scripts/build.mjs`, `scripts/serve.mjs` | Assemble `dist/`; serve only built files below `/razedev/` |
| `scripts/check.mjs` | Local browser checks and ignored screenshots/report |
| `scripts/publish-product.mjs` | Validated, bounded Git publishing of one product snapshot |
| `tests/*.test.mjs`, `tests/helpers.mjs` | Built-in Node tests and temporary fixtures/local bare repositories |
| `.github/workflows/pages.yml`, `README.md` | Public validation/deployment and operating instructions |
| `/Users/rem/Desktop/rem_dev/razestore_privacy/assets/site.js` | Resolve gallery assets relative to the script's URL |
| Each product's `.github/workflows/publish-razedev.yml` and `README.md` | Private manual export action and editing/publishing instructions |

## Execution setup

At execution time, apply `superpowers:using-git-worktrees`, inspect all three working trees and applicable `AGENTS.md` files, and preserve unrelated changes. Reuse a suitable worktree when available; otherwise follow that skill's isolation rules and the `codex/` branch prefix. Verify every checkout's remote matches its intended repository before editing; the chat originally opened in RazeStore rather than RazeDev. All script arguments must use the actual execution checkout, not assume the original paths remain the work directories. Node 24, Chrome, and bundled Playwright were found during planning; do not install a frontend or browser dependency without an observed need.

Browser QA resolves `RAZEDEV_NODE_MODULES` first, otherwise `/Users/rem/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules`. Resolve `RAZEDEV_QA_CHROME` first, otherwise `/Applications/Google Chrome.app/Contents/MacOS/Google Chrome`. These local defaults belong in development tooling only; public build and Node tests must also run on GitHub-hosted runners without them. Read the Sites local-preview guidance before starting browser QA.

The tasks form one publication feature: registry/URLs → importer → assembled hub → browser acceptance → manual publishing. Keep these interfaces consistent; do not split into unrelated projects or merge private Git histories.

### Task 1: Define the product registry and relocation rules

**Files:** Create `apps.json`, `package.json`, `.gitignore`, `scripts/lib/registry.mjs`, `scripts/lib/html.mjs`, `scripts/lib/routes.mjs`, `tests/registry-routes.test.mjs`, and `tests/helpers.mjs`.

**Interfaces:**

- `readRegistry(repoDir: string): Promise<Registry>`; `Registry = {site: {origin, basePath}, apps: App[]}`.
- `App = {slug, name, description, accent, icon, legacyBaseUrl, pages, assets}`; string fields except `pages: Record<sourceFilename, routeName>` and `assets: string[]`.
- `scanHtml(html: string): {tags: Tag[], ids: string[]}`; `Tag = {name, attributes}`; each attribute supplies `{name, value, start, end}`, with offsets covering only its original value.
- `rewritePage(html: string, {registry, app, sourcePage}): string` changes URL attribute values and sharing metadata only.
- `renderRedirect({relativeTarget: string, label: string}): string` preserves the visiting URL's query/fragment and includes a working no-JavaScript same-app link.
- Test helper `snapshotTree(dir: string): Promise<Record<string, string>>` returns sorted relative paths and SHA-256 digests; use it to prove unchanged trees, never to print file contents.

- [x] **Step 1: Write failing registry and URL tests.** Assert duplicate/unsafe slugs and absolute/traversing manifest paths fail. For RazeStore privacy, `./index.html#features` becomes `../home/#features`; an asset becomes `../assets/...`. Preserve `#features`, SVG `#i-arrow`, mail links, HTTPS policy links, and `?v=20261008`. For RazeTag, rewrite `og:url` to `https://remyo.github.io/razedev/razetag/home/` and sharing images under `/razedev/razetag/images/`. Assert comments, script/style bodies, and non-URL markup remain byte-identical; do not use a `<base>` element.
  Representative test `test('privacy home link retains its section')`, using the real registry's RazeStore app:
  ```js
  const html = rewritePage('<a href="./index.html#features">Features</a>', {registry, app, sourcePage: 'privacy.html'});
  assert.equal(html, '<a href="../home/#features">Features</a>');
  ```

- [x] **Step 2: Run `node --test tests/registry-routes.test.mjs`.** Expect failure from missing functions/modules, then record that the tests exercise the intended behavior.
- [x] **Step 3: Implement the declared registry and URL interfaces.** Use a quote-aware HTML tag scan that skips comments and script/style raw text; apply replacements by value offsets to preserve the documents. Handle HTML-escaped query separators correctly. Recognize `href`, `src`, relevant metadata `content`, and image `srcset` references; preserve CSS bytes and CSS-relative resolution. Reject unresolved local file references rather than guessing routes.
- [x] **Step 4: Populate the exact registry.** Set origin `https://remyo.github.io`, base path `/razedev/`, and slugs `razetag`/`razestore`. Both map `index.html` → `home`, `privacy.html` → `privacy`; RazeTag adds `guide.html` → `guide`. Use the approved card copy and existing icon paths. List RazeStore's two shared files and seven images explicitly. List RazeTag's stylesheet, seven used top-level images, social-preview PNG, and the 31 guide images referenced by `guide.html`; do not glob its extra historical images. Guide regeneration requires reviewing and updating this manifest when hashed assets change.
- [x] **Step 5: Run `node --test tests/registry-routes.test.mjs`.** Expect all cases to pass. Commit only the Task 1 files with `feat: define app manifests and product route rewriting`.

### Task 2: Import complete product snapshots without exposing source repositories

**Files:** Create `scripts/import-site.mjs`, `scripts/lib/validate.mjs`, `scripts/serve.mjs`, `tests/import-site.test.mjs`, `public/razetag/**`, `public/razestore/**`; modify `/Users/rem/Desktop/rem_dev/razestore_privacy/assets/site.js`. Create `scripts/check.mjs` with the focused relocated-gallery check; Task 4 completes that runner.

**Interfaces:**

- Consumes Task 1's `readRegistry`, `scanHtml`, `rewritePage`, and `renderRedirect`.
- `validateProduct({rootDir, registry, app}): Promise<ValidationReport>` throws on missing/unsafe files, broken local references/fragments, or navigation outside the app. `ValidationReport = {htmlPages: number, assets: number, links: number}`.
- `importSite({repoDir, sourceDir, slug}): Promise<{slug: string, files: number, changed: boolean}>` reads `apps.json`, writes only `public/<slug>/`, and is safe to import from another script.
- CLI: `node scripts/import-site.mjs --app <slug> --source <absolute-source-dir>`; the script's own repository determines `repoDir`, without depending on the caller's current directory.
- `startPreview({rootDir, basePath, host = '127.0.0.1', port = 0}): Promise<{url: string, close: () => Promise<void>}>` from `scripts/serve.mjs` serves an explicit public root only. Task 2's gallery check uses `public/`; Tasks 3–4 use `dist/`.

- [x] **Step 1: Write failing import tests with temporary fixture directories.** Assert only manifested inputs appear, legacy aliases remain within the app, query/fragment handling works, and all expected references exist. Include excluded `.git`, `scripts`, `.preview`, backup, and credential-like files; prove they never enter output. Reject symlinks at leaf and ancestor components, encoded traversal, unknown slugs, missing files, and links to the hub/another app. On any failure, assert previous output and the other app are byte-identical. Verify repeated imports return `changed: false` and remove obsolete files only inside the selected app.
  Representative test `test('missing input preserves both exported apps')`, with a fixture missing one required image and `before` captured for its `public/` tree:
  ```js
  await assert.rejects(importSite({repoDir, sourceDir, slug: 'razestore'}), /missing/i);
  assert.deepEqual(await snapshotTree(`${repoDir}/public`), before);
  ```

- [x] **Step 2: Run `node --test tests/import-site.test.mjs`.** Expect the relevant missing-interface/behavior failures.
- [x] **Step 3: Implement the importer and product validator.** Preflight paths with `lstat`/`realpath`, reject source/destination overlap, stage a fresh sibling temporary directory, rewrite HTML, add aliases, validate, then replace only the selected directory with rollback if replacement fails. Never follow links, copy repository roots, or mutate the source. Check CSS `url(...)`/`@import`, metadata images, `srcset`, local file URLs, and fragment IDs; allow external HTTPS/support links without requesting them. Compare generated filenames to the expected manifest plus aliases. Always remove staging leftovers.
- [x] **Step 4: Add and run a failing relocated-gallery browser case.** Implement the small preview server interface so it can serve imported `public/` files beneath `/razedev/`. Import the unchanged RazeStore source, run `node scripts/check.mjs --gallery-only`, load `/razedev/razestore/home/`, select another screen, open the dialog, and assert both image URLs resolve below `/razedev/razestore/assets/screenshots/` and decode. Expect failure with the existing source script. Capture the script URL at startup in the private source and construct both screenshot URLs relative to it, preserving existing standalone behavior.
- [x] **Step 5: Import the two real checked-out sites.** Run `node scripts/import-site.mjs --app razetag --source /Users/rem/Desktop/rem_dev/razetag_h5`, then the matching `razestore` command. Inspect exported path lists. Compare policy markup with source after masking only changed URL attributes; no wording, contacts, or dates may change. Confirm all 17 RazeTag guide chapters and its social-preview image are present.
- [x] **Step 6: Run import tests, relocated-gallery case, and the modified source's existing `node scripts/check.mjs`.** Expect all to pass; keep source QA reports private/ignored. Commit the small gallery fix in its source repository and the importer/snapshots in `razedev` separately, recording both commits. Do not publish either commit.

### Task 3: Build the responsive hub and complete static site

**Files:** Create `src/hub.html`, `src/hub.css`, `src/404.html`, `scripts/build.mjs`, `tests/build-site.test.mjs`; extend `scripts/lib/validate.mjs`, `scripts/serve.mjs`, and package scripts.

**Interfaces:**

- Consumes Task 1 registry/HTML helpers and Task 2 product snapshots, validator, and `startPreview`.
- `buildSite({repoDir: string}): Promise<{distDir: string, report: ValidationReport}>` produces a fresh, validated `dist/` before replacing previous output.
- `validateSite({rootDir, registry}): Promise<ValidationReport>` validates all product namespaces and hub card destinations; includes the generic 404 document without adding navigation.
- Commands: `npm test` runs `node --test tests/*.test.mjs`; `npm run build` runs `node scripts/build.mjs`; `npm run preview` runs `node scripts/serve.mjs --port 8767`; `npm run check` runs the local browser checker.

- [x] **Step 1: Write failing assembly and HTTP tests.** Assert exactly two generated app links, registered icons, escaped registry text, complete directory routes, and `.nojekyll`. Through the real preview server, request `/razedev/razestore/home`, confirm redirect to `/home/`, and refresh all canonical pages. Assert private/dev files and traversal requests return 404, no missing-page links lead to the hub/other apps, failed builds preserve previous `dist/`, and repeated builds produce identical file bytes.
  Representative test `test('extensionless home normalizes within the same product')`, using a built fixture and the preview server's `url`:
  ```js
  const response = await fetch(`${url}razestore/home`, {redirect: 'manual'});
  assert.equal(response.status, 301);
  assert.equal(new URL(response.headers.get('location'), response.url).pathname, '/razedev/razestore/home/');
  ```

- [x] **Step 2: Run `node --test tests/build-site.test.mjs`.** Expect failures for the unimplemented build/preview.
- [x] **Step 3: Implement the hub, build, preview, and complete-site validation.** Render card HTML from the registry at build time; navigation requires no client JavaScript. Use the approved warm neutral background, dark type, original product icons, purple/teal accents, and exact approved copy. Build only the hub assets, snapshots, `.nojekyll`, and 404 page; never publish project scripts/docs. Keep the 404 page self-contained with no app-switching links. Serve with correct MIME types, real directory-index/slash behavior, and a normalized, contained filesystem root.
- [x] **Step 4: Run `npm test` and `npm run build`.** Expect all built-in tests and complete output validation to pass; every primary route must exist. Start `npm run preview` and open `http://127.0.0.1:8767/razedev/` in Codex to show the first working hub. Commit as `feat: build RazeDev hub and static product routes`.

### Task 4: Verify product isolation, interactions, and visual layout

**Files:** Complete `scripts/check.mjs`; update the hub or relocation code only where an observed failure requires a fix. Browser artifacts go under ignored `.preview/razedev-check/`.

**Interfaces:**

- Consumes `buildSite`, `startPreview`, `readRegistry`, and the HTML scanner. The checker launches its own server with a temporary port and closes it and the browser in `finally`.
- Browser runtime uses the execution setup's QA environment variables and defaults.
- CLI `node scripts/check.mjs` runs the assembled-site suite; `--gallery-only` runs the focused Task 2 case. Optional repeated `--source slug=/absolute/path` arguments enable source-versus-export policy comparisons without embedding private paths in public output.

- [x] **Step 1: Add the missing browser acceptance cases and run them before fixes.** Direct-load/refresh all five product pages; crawl every product navigation target, asset, metadata URL, and fragment. Assert no hub/cross-app links, both hub cards work with JavaScript disabled, and compatibility redirects preserve `?from=test#features` (use valid destination fragments for each page). Check RazeTag sharing URLs, six FAQs, all 17 guide chapters, direct `#sync`/`#desktop`/`#shop-team` loads, modal focus, presentation controls, and print CSS. Check all five RazeStore tabs, keyboard selection, dialog close/Escape/focus, and noscript image links. Block browser requests outside the temporary local server, validate metadata against local output without fetching public URLs, and collect failed requests and browser errors.
- [x] **Step 2: Run the layout matrix and visually inspect screenshots.** Use desktop `1440×1000`, tablet `768×1024`, mobile `390×844`, small mobile `320×740`, and `390×844` with root text doubled. Check no horizontal overflow, decoded images with preserved aspect ratios, readable copy, keyboard focus, and reduced-motion behavior. Capture hub, both homes, both policies, and representative guide states. Simulate print mode without requiring a PDF artifact.
- [x] **Step 3: Fix only demonstrated problems and rerun affected checks.** Preserve original product content/branding. If the source gallery script changes again, repeat its source regression suite. Finish with one complete `npm test`, `npm run build`, and `npm run check`; report actual case counts and retain local screenshots/report. Commit acceptance coverage and verified fixes as `test: verify isolated product routes and responsive hub`.

### Task 5: Add private publishing and public Pages workflows

**Files:** Create `scripts/publish-product.mjs`, `tests/publish-product.test.mjs`, `.github/workflows/pages.yml`; create `.github/workflows/publish-razedev.yml` in each private product checkout; modify each product's `README.md`.

**Interfaces:**

- Consumes `importSite` and `buildSite`. `publishProduct({repoDir, sourceDir, slug, maxAttempts = 3, expectedRemote = 'https://github.com/remyo/razedev.git'}): Promise<{status: 'published' | 'unchanged', commit: string | null, attempts: number}>` requires a clean public checkout on `main` and the expected destination repository. Tests pass a temporary local bare `expectedRemote` through this library interface; the CLI does not expose that override.
- CLI from a private workflow: `node razedev/scripts/publish-product.mjs --app razetag --source "$GITHUB_WORKSPACE/source" --checkout "$GITHUB_WORKSPACE/razedev" --max-attempts 3`; RazeStore hardcodes `--app razestore`.
- Publication credential name: `RAZEDEV_PUBLISH_TOKEN`, a private-repository Actions secret selecting only `remyo/razedev` with Contents read/write. Use an environment-reading `GIT_ASKPASS` helper outside both checkouts; its file contains no credential value. Pass the credential only to Git network operations, never importer/build/test child environments. Use a plain HTTPS destination remote.

- [x] **Step 1: Write failing publisher integration tests using temporary local bare Git remotes.** Verify a clean valid export changes only `public/<slug>/`; identical snapshots add no commit; two apps publishing from the same base both survive. Force controlled remote updates through test-only Git hooks: one/two non-fast-forward races recover, three total push attempts stop; conflicting same-app updates fail and byte-identical same-app output is accepted as already published. Assert validation failure before/after a rebase, rewritten history, unrelated worktree changes, an unexpected origin, and authentication/branch rejection never produce an unsafe push. A source fixture whose HEAD differs from freshly fetched `origin/main` must fail before export. A fake credential sentinel must not appear in captured arguments, output, Git config, or artifacts.

  Representative test `test('identical export creates no public commit')`, with a source fixture and bare destination already containing the same snapshot:
  ```js
  const result = await publishProduct({repoDir, sourceDir, slug: 'razetag', expectedRemote: bareRemote});
  assert.equal(result.status, 'unchanged');
  assert.equal(result.commit, null);
  assert.equal(result.attempts, 0);
  assert.equal(await readRemoteHead(bareRemote), beforeHead);
  ```
  Define `readRemoteHead(bareRemote: string): Promise<string>` in `tests/helpers.mjs` using local `git rev-parse refs/heads/main`.
- [x] **Step 2: Run `node --test tests/publish-product.test.mjs`.** Expect the missing publisher to fail. The tests must never contact GitHub or use an actual credential.
- [x] **Step 3: Implement publication with at most three ordinary pushes.** First compare source HEAD to its refreshed `origin/main`. Capture the destination token in memory and remove it from the inherited process environment before invoking importer/build functions. Import, build, validate, stage exactly `public/<slug>/`, verify NUL-delimited changed paths, and commit only when changed. Before each push, fetch latest public `main`; reject rewritten history, guard concurrent changes in this product, and rebase permitted changes. If registry/importer files changed upstream, fail explicitly and request a fresh dispatch instead of continuing with code already loaded from the old checkout. Rebuild/revalidate after every permitted rebase. After a failed/ambiguous push, fetch to distinguish already-accepted commits from a retryable race. Abort promptly on authentication/validation failures and clean up temporary authentication state. Never force push.
- [x] **Step 4: Add the two manual source workflows.** Use `workflow_dispatch` without arbitrary repo/app/ref/path inputs, restrict to `refs/heads/main`, and hardcode the repository's app slug. Check out source and public destination as siblings with `persist-credentials: false`. Use read-only source `GITHUB_TOKEN` to verify checked-out source HEAD still equals current source `main`, rejecting stale reruns. Use a per-source concurrency group with `cancel-in-progress: false`; Git retry logic still protects cross-repository races. Make `RAZEDEV_PUBLISH_TOKEN` available only to the publish step. Keep source policies/generator and source `.git` out of exported files.
- [x] **Step 5: Add the public Pages workflow.** On `push` to `main` and manual dispatch, run built-in Node tests and `npm run build`, upload only `dist/`, then deploy in a dependent `github-pages` environment job. Build permissions are `contents: read`; deploy adds `pages: write` and `id-token: write`. Use `actions/checkout@v7`, `actions/setup-node@v7` with Node `24` and package caching disabled, `actions/configure-pages@v5`, `actions/upload-pages-artifact@v4`, and `actions/deploy-pages@v4`. Use a Pages concurrency group so outdated jobs do not replace a later deployment. No private-read or publishing PAT belongs in this workflow.
- [x] **Step 6: Run publisher tests and inspect both private workflow copies plus public workflow.** Confirm main-only/manual triggers, fixed slugs, checkout separation, secrets/permissions, exact `dist/` artifact, and dependent deployment. Run full `npm test` and `npm run build` once with the completed workflows. Commit each repository's own changes separately; do not push, create credentials, change visibility, or claim a real workflow ran.

### Task 6: Document operation and hand off a verified local preview

**Files:** Create `README.md` in `razedev`; finish the source README publication sections; update this plan's checkboxes as tasks actually complete.

**Interfaces:** The README documents the commands defined by Tasks 2–5 and the browser-check environment variables from Task 4; it must not introduce another build or publishing path.

- [x] **Step 1: Write the operating instructions.** Include exact local import/build/preview/check commands, repository responsibilities, routes and navigation boundary, manual publication, the single public-destination token scope and private secret name, and GitHub Pages' Actions setting. Explain adding a registry app/manifest/workflow without adding global links inside product pages. Clarify that snapshots are generated and should be edited in their private source. Keep old Pages deployments until policy-link cutover is separately resolved; making an old repository private is not proof old addresses continue working.
- [x] **Step 2: Perform final review.** Use `superpowers:requesting-code-review` and the selected execution method's review process. Confirm all approved spec requirements map to completed checks; resolve actionable findings and repeat only affected checks. Complete a final `git diff --check` in changed checkouts and confirm the committed exports match the final source fix and manifests. No new tests are needed merely to mirror documentation.
- [ ] **Step 3: Hand off the preview and actual status.** Open the built hub and representative isolated product page in Codex. Report test results, commit/worktree locations, and remaining remote setup: token secrets, pushing reviewed changes, Pages configuration, visibility verification, and old-link cutover. State explicitly whether anything was deployed; local checks do not establish remote deployment success.

## Plan review and execution choice

The user approved this plan and selected **Native execution**. Implement in this session and obtain the final independent review. The user's later contact update requires `razeappdev@gmail.com` throughout both website sources and public snapshots, including the RazeTag guide generator and privacy page; preserve all other policy wording and dates.

## Primary references verified during planning

- [GitHub Pages custom workflows](https://docs.github.com/en/pages/getting-started-with-github-pages/using-custom-workflows-with-github-pages)
- [Checkout action](https://github.com/actions/checkout) and [setup-node action](https://github.com/actions/setup-node)
- [Workflow token scope and triggering behavior](https://docs.github.com/en/actions/concepts/security/github_token)
- [GitHub workflow concurrency](https://docs.github.com/en/actions/concepts/workflows-and-actions/concurrency)
