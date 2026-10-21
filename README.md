# RazeDev

Public hub for RazeTag, RazeStore, and future Raze apps, bringing together product
websites, guides, and privacy policies in one place.

Contact: [razeappdev@gmail.com](mailto:razeappdev@gmail.com).

## Websites

| Path below `https://remyo.github.io` | Page |
| --- | --- |
| `/razedev/` | App chooser |
| `/razedev/razetag/home/` | RazeTag introduction |
| `/razedev/razetag/privacy/` | RazeTag policy |
| `/razedev/razetag/guide/` | RazeTag user guide |
| `/razedev/razestore/home/` | RazeStore introduction |
| `/razedev/razestore/privacy/` | RazeStore policy |

These are deployment addresses; a local build does not publish them. Requests
without the final slash normalize to directory routes. Each product's logo,
navigation, policy, and guide links stay within that product. There is no hub
link or app switcher on product pages. Visitors can still enter any public URL
directly or use browser history.

## Local development

Requires Node.js 24+. There are no build/runtime package dependencies and no
`npm install` step. From the RazeDev checkout:

```sh
npm test
npm run build
npm run preview
```

Open `http://127.0.0.1:8767/razedev/`. Preview exposes only built website files.
Stop it with Ctrl+C. Run `npm run build` after changing the hub or importing an
updated product snapshot.

`src/hub.html` and `src/hub.css` define the hub. `apps.json` defines the cards,
routes, and exact public asset manifests. `public/<app>/` is generated output;
edit product content in its source repository instead.

To refresh local snapshots when the checkouts are sibling directories:

```sh
node scripts/import-site.mjs --app razetag --source ../razetag_h5
node scripts/import-site.mjs --app razestore --source ../razestore_privacy
npm run build
```

The importer preserves source files, policies, and guide text. It changes URL
attributes and sharing metadata for the new addresses, creates same-app legacy
aliases, and replaces only the chosen product's output after validation. Missing
files, symlinks, unsafe paths, broken references, and cross-app links stop the
export. It never imports source Git history, scripts, private folders, or backups.

## Browser checks

```sh
npm run check
```

The checker uses existing Playwright and Chrome. Override `RAZEDEV_NODE_MODULES`
with the directory containing Playwright, and `RAZEDEV_QA_CHROME` with the Chrome
executable. The local Codex bundled runtime is the default. Nothing is installed
by the checker. Screenshots and `report.json` stay under ignored
`.preview/razedev-check/`.

Checks cover direct URLs, aliases, mobile/tablet/desktop, enlarged text, decoded
images, product navigation boundaries, RazeStore gallery interactions, RazeTag
guide/FAQ interactions, and no-JavaScript hub navigation. Optional source policy
comparisons:

```sh
node scripts/check.mjs --source razetag=../razetag_h5 --source razestore=../razestore_privacy
```

## Publishing

### From a source checkout with SSH

Run this in `razetag_h5` or `razestore_privacy`, on `main`:

```sh
sh publish.sh gith5 "update privacy"
```

The optional message defaults to `Update RazeTag website` or `Update RazeStore
website`. Each source's small `publish.sh` fetches a disposable RazeDev `main`
clone and invokes the shared `scripts/publish-local.mjs` with its fixed app slug.
It requires Git, Node.js 24+, GitHub SSH access, and a Git commit identity; no
publishing token or local RazeDev checkout is needed.

The publisher checks source/destination origins and source freshness, validates
the combined site before committing, commits all tracked source changes plus
new manifest files, and pushes source `main` before exporting its public snapshot.
Review tracked changes first. New files outside the public manifest, including
staged additions, are rejected; commit intentional development files separately.
Missing assets, invalid links, outdated branches, or Git hook/push failures stop
the run. Source edits/local commits are preserved; no branch switching, stashing,
source resets, or force pushes occur. Temporary output is removed on exit.

Only the selected `public/<app>/` changes in RazeDev. A changed snapshot pushed to
RazeDev `main` triggers its Pages deployment. An identical snapshot creates no
public commit. The wrappers fetch the shared publisher afresh each run, so fixes
to publishing logic live here. Add a matching source remote in
`scripts/publish-local.mjs` when adding another app with a local wrapper.

### Optional GitHub Actions publishing

1. Review and push the RazeDev changes to `main` when ready. In the public
   repository's **Settings → Pages**, choose **GitHub Actions** as the source.
   The public workflow runs Node tests, builds and validates the assembled site,
   and uploads **only `dist/`** before deploying to the `github-pages` environment.
2. In each private product repository, save an Actions secret named
   `RAZEDEV_PUBLISH_TOKEN`. Use a fine-grained personal access token selecting
   **only `remyo/razedev`**, with **Contents: read and write** (metadata read is
   automatic). Do not grant private-source or workflow-management permissions.
   Never put its value in this repository, command arguments, or chat. See
   [GitHub's token instructions](https://docs.github.com/en/authentication/keeping-your-account-and-data-secure/managing-your-personal-access-tokens).
3. Push reviewed source changes and the source publishing workflow to its `main`.
   Run **Actions → Publish website to RazeDev → Run workflow**, selecting `main`.
   Ordinary product pushes do not publish automatically. Outdated workflow reruns
   fail; dispatch the latest `main` again.

Private workflows export only their own `public/<app>/` snapshot, validate the
whole site, and push a snapshot commit only if content changed. A normal token
authenticated push triggers RazeDev's Pages workflow. A product repository's
default `GITHUB_TOKEN` cannot write to a different repository. The public
workflow has no private repository credentials.

Concurrent exports use up to three ordinary push attempts, preserve the other
app, and revalidate after rebasing unrelated updates. Conflicting updates to the
same app or changes to the publication contract stop and request a fresh run.
No force pushes are used. Branch protections may require additional repository
configuration; the publisher reports rejection instead of bypassing them.

Repository visibility and Pages settings are remote configuration. RazeDev is
public. Keep the two source repositories public until existing app/store links
have been updated and the old Pages URLs can be retired. Published
HTML/CSS/JavaScript/images remain publicly readable. Keep old `/razetag_h5/` and
`/razestore_privacy/` deployments until existing app/store policy URLs have a
separately verified migration. RazeDev cannot redirect requests at another
repository's Pages address, and making a repository private can affect its Pages
availability depending on the GitHub plan.

## Adding another Raze app

Add an `apps.json` entry with its slug, display name, short description, accent,
original icon, legacy site base URL, source-page mappings, and exact public asset
filenames. A product needs `home` and `privacy`; add `guide` when it has one.
Declare new dependencies explicitly, including updated content-hashed guide
images and social-preview assets. Use public website/demo assets only.

Import it with `--app <slug> --source <source-checkout>`, build, check navigation,
and add a matching manual workflow in its private source repository. The hub
card is generated automatically. Give a new card its own background styling in
`src/hub.css` if desired. Keep navigation inside the product; no global header or
cross-app links are injected.
