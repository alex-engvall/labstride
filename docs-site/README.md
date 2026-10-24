# Labstride documentation site

Astro Starlight builds the public technical documentation for `https://docs.labstride.dev`.
The separate `labstride.dev` website is out of scope. Existing [specifications and evidence](../docs/README.md) remain in `docs/`; this site links to them rather than copying or moving them.

## Local development

Use the Node version in `.node-version` (the same Node 24 baseline as the repository). From the repository root:

```sh
cd docs-site
npm ci --ignore-scripts
npm run dev
```

Build and inspect the production output, including Pagefind search:

```sh
npm run build
npm test
npm run preview
```

Search is indexed at build time; use the production preview to test it. Browser smoke checks run against that static preview:

```sh
npm exec -- playwright install --with-deps chromium
npm run test:browser
```

`npm test` checks generated routes, canonical URLs, local links and anchors, assets, the sitemap and the search bundle. Browser tests cover navigation, search, theme switching and viewport overflow at desktop and mobile sizes. These checks do not verify Labstride runtime behavior or a live Pages deployment.

## Content and dependencies

Write public pages in English under `src/content/docs/`. The initial pages use MDX; the existing repository validator treats `.md` links as filesystem paths, while website links are routes. Website route and anchor checks therefore run against the generated HTML rather than bypassing link validation.

Keep specification details and requirement status in `../docs/`. A public guide should distinguish planned, implemented and environment-verified behavior. Do not add installation commands for a release that does not exist.

This directory is a separate npm project: it does not change the root package, lockfile or runtime dependencies. Astro and Starlight are MIT-licensed build tools; Playwright is Apache-2.0-licensed test tooling. They are not shipped as dependencies of the coordinator. The site uses Starlight's standard UI and local Pagefind search, without a hosted search service or CMS.

Direct dependencies are pinned and the generated `package-lock.json` is committed. Update them deliberately in a PR, regenerate the lockfile with npm, and rerun the build and tests. Do not hand-edit dependency integrity data.

## GitHub Pages: one-time setup

The PR does not alter DNS, repository settings or the live main website. A repository administrator must complete these steps:

1. In `engshort/labstride` → **Settings → Pages**, select **GitHub Actions** as the publishing source.
2. Verify ownership of the custom domain in GitHub, then set **Custom domain** to `docs.labstride.dev` in this repository's Pages settings. Do this before adding the DNS record.
3. At the DNS provider for `labstride.dev`, add `CNAME docs → engshort.github.io`. Do not include a repository path and do not change the apex or `www` records for the separate website.
4. Enable **Enforce HTTPS** when GitHub has provisioned the certificate. Configure the `github-pages` environment to permit deployments from `main` only; retain any required reviewer protections.
5. Merge the reviewed PR. The workflow builds and publishes from `main`; it can also be run manually on `main` after configuration is complete.

`astro.config.mjs` sets the custom-domain `site` with no `/labstride` base path. `public/CNAME` records the intended hostname in the static output, but GitHub ignores CNAME files for custom Actions deployments: the Pages **Custom domain** setting is still required.

PR builds have read-only repository permissions and never deploy. Only the separate deployment job gets Pages and OIDC write permissions, and it runs only on `main` in `engshort/labstride`. Action revisions are pinned. No personal access token is required, and no workflow writes documentation content back to the repository.

The source configuration targets the custom domain, not the default `engshort.github.io/labstride/` project path. DNS, HTTPS, repository Pages settings and a live deployment must be checked separately before declaring the site live.

## Rollback and portability

Revert a problematic documentation commit through a reviewed PR and let the `main` workflow republish the prior configuration. The built `dist/` directory is a static site and can be served by another static host without changing the authoring platform. Never commit `dist/`, `.astro/` or `node_modules/`.

## References

- [Starlight setup](https://starlight.astro.build/manual-setup/)
- [Astro and GitHub Pages](https://docs.astro.build/en/guides/deploy/github/)
- [GitHub custom-domain setup](https://docs.github.com/en/pages/configuring-a-custom-domain-for-your-github-pages-site/managing-a-custom-domain-for-your-github-pages-site)
