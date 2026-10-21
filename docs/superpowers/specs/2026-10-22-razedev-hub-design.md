# RazeDev hub and independent product websites

Date: 2026-10-22 (Asia/Tokyo)
Status: Approved by the user on 2026-10-22; implementation plan awaiting review.

The user also confirmed that Vue or another framework is allowed. The initial
implementation keeps the approved static approach because the hub needs no
client-side application state; this is a design choice, not a user restriction.

## Purpose and agreed requirements

RazeDev is the public home for RazeTag, RazeStore, and future Raze apps. Visitors
arriving at `/razedev/` choose an app using its existing icon, name, and a short
description. Each product keeps its own website, branding, and navigation.

The user requested private `remyo/razetag_h5` and `remyo/razestore_privacy`
repositories and a public `remyo/razedev` repository. The product repositories
remain the authoritative editing locations. Only explicitly selected website
files are exported to the public repository. Published HTML, CSS, JavaScript,
and images are publicly readable, even when their editing repository is private.

The latest requirement overrides the earlier suggestion of an "All Raze apps"
link: product pages must have no navigation to the RazeDev hub or another app.
This is a navigation boundary. Public GitHub Pages cannot prevent a visitor
from typing another public URL or using browser history.

## Current state

- `/Users/rem/Desktop/rem_dev/razedev` is an empty Git checkout on unborn `main`,
  with origin `git@github.com:remyo/razedev.git`.
- Both product working trees were clean during inspection.
- RazeStore is static HTML with `index.html`, `privacy.html`, shared CSS/JS,
  an app icon, a brand illustration, and five demonstration screenshots.
- RazeTag is static HTML with `index.html`, `privacy.html`, `guide.html`, local
  CSS, demonstration images, inline interactions, and a guide generator.
- The RazeTag guide has 17 chapters. It is part of this migration.
- Remote repository visibility has not been verified. The GitHub CLI is not
  installed in this environment. No remote visibility or Pages settings have
  been changed.

## Selected architecture

Keep the three repositories separate. Each private product repository exports
its public website snapshot into its own folder in `razedev`. A Pages workflow
in `razedev` builds the hub, checks the complete static site, and publishes a
single deployment.

Alternatives considered: a monorepo would remove the requested independent
repositories; a hub that only links to their existing Pages sites would not
provide the requested `/razedev/<product>/...` addresses. Building exports in
the private repositories lets public publishing operate without credentials
that can read private product sources.

No runtime plugin loader, iframe embedding, backend, account system, analytics,
external fonts, or frontend framework is required. "Plugin" means an
independently maintained product website registered with the hub.

## URLs and navigation boundary

| Public path | Content |
| --- | --- |
| `/razedev/` | RazeDev product chooser |
| `/razedev/razestore/home/` | Existing RazeStore home |
| `/razedev/razestore/privacy/` | Existing RazeStore privacy policy |
| `/razedev/razetag/home/` | Existing RazeTag home |
| `/razedev/razetag/privacy/` | Existing RazeTag privacy policy |
| `/razedev/razetag/guide/` | Existing RazeTag guide |

Each route is a real directory with `index.html`, so direct loading and refresh
work without a client-side router. The user's extensionless `/home` and
`/privacy` examples normalize to their trailing-slash directory versions.

The hub links to product home pages. Inside a product, header logos, footer
links, privacy return links, guide links, and redirects stay under that
product's namespace. Do not inject a shared RazeDev header, hub link, app
switcher, or cross-product recommendation. Existing support email links and
external documentation links remain available.

For compatibility inside the new namespace, `<product>/`,
`<product>/index.html`, and `<product>/privacy.html` redirect to that product's
new routes; RazeTag also supports `<product>/guide.html`. Preserve query strings
and fragments. Redirect documents include a usable same-product link without
JavaScript. A global missing-page document has no hub or cross-app links.

The old `/razetag_h5/` and `/razestore_privacy/` addresses belong to different
Pages sites. `razedev` cannot redirect requests it never receives. Preserve
existing deployments until a separate cutover verifies old-link handling;
do not promise those URLs survive a repository visibility change. Changing
remote visibility and retiring old deployments are outside this local build.

## Hub appearance and content

Use a compact, responsive app directory: warm neutral background, dark readable
type, generous spacing, a restrained RazeDev wordmark, and two prominent product
cards. The product cards supply the color through RazeTag purple and RazeStore
teal. Reuse the approved original icons; do not invent a new product logo.

Suggested copy:

- Title: "A little help for your everyday."
- Introduction: "Explore apps from Raze. Choose the one that fits your day."
- RazeTag: "Keep your resale items, sales, and records together."
- RazeStore: "Products, checkout, and daily records for your tindahan."
- Quiet closing note: "More Raze apps are on the way."

Each card has one clear link to its product home. The hub must work without
JavaScript and support keyboard navigation, visible focus, reduced motion,
enlarged text, and narrow screens. No invented download links, store badges,
testimonials, usage counts, or release promises.

Product home, policy, and guide content retain their existing visual identity.
Migration changes paths and metadata; it does not rewrite product claims,
policy wording, policy dates, support addresses, or guide instructions.

## Repository and export contract

`razedev` contains:

- A small `apps.json` registry with each app's slug, display name, description,
  accent color, icon path, and page/asset export mapping.
- Hub template and styles, plus dependency-free Node scripts for importing a
  product, building the hub, and validating the assembled output.
- `public/razetag/` and `public/razestore/`: committed exported website files.
- An ignored `dist/` containing the complete deployable site.
- A Pages workflow that publishes only `dist/`, and documentation explaining
  local builds, product updates, and adding another product.

The importer takes an app slug and an explicit source directory. It reads only
the registry's allowlisted pages, stylesheet/script files, and approved public
image directories. It rejects symlinks and paths outside the source or target
namespace. It never copies `.git`, private directories, backups, preview
artifacts, development documentation, test scripts, credentials, or source maps.

Generate output in a temporary directory, validate it, then replace only the
selected product's destination. An import must not delete or rewrite the hub,
registry, another product, or unrelated public files. A missing expected page
or asset fails the import rather than producing an incomplete publication.

Import the current checked-out versions of both product websites for the first
local build. Future product edits are made in the private source repositories
and exported again; the public snapshot is not the editing source of truth.

## Relocation details

- Rewrite page-relative asset URLs and known internal HTML links for the new
  page directories. Preserve query strings, fragments, local SVG fragment
  references, external HTTPS URLs, mail links, and hash-only section anchors.
- Preserve CSS-relative asset resolution. Validate the final resolved URLs,
  including any future CSS `url(...)` dependencies.
- RazeStore `assets/site.js` currently constructs
  `./assets/screenshots/${entry.image}` in two places. Update the source script
  to resolve screenshots relative to the script's own URL so the gallery works
  at both the existing address and the relocated home. Avoid brittle JavaScript
  text replacement in the public importer.
- RazeTag's guide uses resolved thumbnail URLs and local section hashes; retain
  these behaviors, including image enlargement, presentation mode, and printing.
- RazeTag's Open Graph and Twitter metadata references the old absolute Pages
  address. Export metadata with the new product home and asset addresses,
  including its existing social preview image.
- Keep the RazeTag guide generator working at the original source location;
  export its generated guide rather than moving the generator into public output.

## Publishing and credentials

Use manual product publishing for the first version. This is an implementation
default because automatic versus manual updates has not been selected.

Each private repository gets a `workflow_dispatch` action that checks its source,
checks out public `razedev`, runs the public importer for its own app, and pushes
only the resulting product snapshot if it changed. The publishing credential is
stored as a private-repository Actions secret and grants repository contents
write access only to `razedev`; no private-read credential belongs in `razedev`.

The public repository's normal push workflow builds the hub and deploys the
assembled Pages artifact. Use authentication that permits the resulting push
to trigger this workflow. The default product-repository `GITHUB_TOKEN` cannot
write to a different repository. Never hardcode a token or put it in public
files, logs, command arguments, or chat.

Concurrent product publishes use a bounded fetch/rebase/retry so one product
does not overwrite another. Build and validation failures stop before commit
or deployment. Identical exports produce no extra commit.

Local implementation prepares and verifies files and workflows. Remote pushes,
credential setup, repository visibility changes, and production cutover are
separate from this local build and must be reported according to actual state.

## Verification and acceptance

1. Build the hub and import both current product websites into `dist/`.
2. Serve at a simulated `/razedev/` base and load every primary page directly;
   refresh each page and verify directory handling, assets, and section anchors.
3. Inspect every same-origin product navigation target. It must resolve inside
   that product's namespace, including aliases and error handling. Confirm no
   product page links to `/razedev/` or another product.
4. Confirm the hub's two product cards navigate correctly with JavaScript off.
5. Exercise RazeStore screenshot tabs, keyboard navigation, and image dialog;
   exercise RazeTag FAQs, guide chapter navigation, image dialog, presentation
   controls, and print styling after relocation.
6. Check desktop, tablet, 390px and 320px layouts, and enlarged text. Capture
   screenshots and visually inspect the hub and representative product pages.
7. Compare policy text before and after export. Preserve the existing wording,
   support contacts, and revision dates in each product.
8. Verify the export excludes non-public files, does not follow symlinks or
   escape paths, preserves the other product, and fails cleanly on missing input.
9. Run each source repository's existing browser checks if source files change.
10. Inspect workflow permissions, published artifact boundaries, and retry logic.
    Validate real remote publishing only after credentials and Pages are set up;
    local success alone is not a production deployment claim.

## Delivery sequence

After the user reviews this specification, write a concrete implementation plan
and select its execution method as required by the Superpowers architectural
workflow. Then implement the local hub and imports, add the publishing workflows,
verify the complete site, and provide a local preview and exact setup status.

## References

- GitHub Pages custom workflows:
  https://docs.github.com/en/pages/getting-started-with-github-pages/using-custom-workflows-with-github-pages
- Workflow token scope and triggering behavior:
  https://docs.github.com/en/actions/concepts/security/github_token
- Additional workflow authentication:
  https://docs.github.com/en/actions/tutorials/authenticate-with-github_token
