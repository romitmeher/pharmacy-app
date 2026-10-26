# SmartPharm PWA

The existing Next.js App Router frontend is the app. No PWA runtime dependency,
API proxy, authentication rewrite, or new business database is introduced.
Install from the HTTPS website, not the local `file://` scan-card document.

## Files and build

| File | Responsibility |
| --- | --- |
| `src/app/manifest.ts` | Stable `/` app ID and scope, `/login` launch URL, standalone display, SmartPharm colors and icons. |
| `public/icons/` | Checked-in 192/512 PNGs, separate maskable PNGs, 180px Apple icon and SVG favicon using the existing BrandMark geometry. |
| `scripts/generate-pwa-icons.mjs` | Recreate icons with the Sharp package already installed by Next.js. Maskable artwork fits inside the central safe area. |
| `pwa/sw-template.js` | Native service worker source. |
| `scripts/build-pwa.mjs` | `npm run build` prebuild hook; hashes source, public assets, worker source and build configuration to generate versioned `public/sw.js`. The generated worker is Git-ignored. |
| `src/components/PWAProvider.tsx` | Production registration, install lifecycle, optional platform guidance and safe update notification. |
| `src/styles/pwa.css` | Responsive, keyboard-accessible installation/update controls, hidden when printing. |
| `src/app/layout.tsx` | Manifest, Apple/platform metadata, theme color and provider. |
| `src/app/login/page.tsx`, `src/components/Sidebar.tsx` | User-initiated install actions. No automatic installation dialog. |
| `public/offline.html` | Self-contained, public reconnect screen that preserves the requested deep-link URL. |
| `next.config.ts` | Worker MIME, root scope and no-store headers; manifest revalidation; offline-page CSP and nosniff. |
| `tests/pwa-worker.test.mjs` | Cache/privacy, offline navigation, update lifecycle and PNG-size/safe-area regression checks. |

`npm run dev` does not register a worker. Test the production build instead.
The Docker build already runs `npm run build` and copies `public` and
`.next/static` into the standalone runtime, including the generated worker and
icons. No hosting changes are needed for the existing root-level Cloud Run app.
Keep `/sw.js` on the frontend origin, served as JavaScript over HTTPS with
`Cache-Control: no-store`. Do not rewrite it to an HTML page or put an immutable
CDN policy in front of it. Localhost is a trusted browser exception for testing.

## Cache policy

| Request | Behavior |
| --- | --- |
| Navigations, including protected pages | Network only; on transport failure return the public offline screen. Never save navigation HTML. Preserve real server status codes and redirects. |
| Same-origin Next.js build JS/CSS/fonts | Cache first, only for successful public responses; omit credentials; 30-day maximum age and 100-entry cap. |
| Two known public local fonts | Same bounded public asset policy. |
| Offline screen and explicit icon list | Versioned install-time cache; no credentials. Failed preparation leaves the old worker intact. |
| `/api`, cross-origin requests, authorization headers, POST/PUT/PATCH/DELETE, uploads, payments, RSC/prefetch, ranged requests and unknown resources | No service-worker interception or caching. |
| Private/no-store responses, cookie-setting or cookie/authorization-varying responses | Never enter the asset cache. |

Only caches starting with `smartpharm-pwa-` are cleaned up on activation. Existing
account-scoped IndexedDB catalogs and local bill queues are not read, copied,
cleared or submitted by this worker. No background payment replay is added.

Cold offline launches show the reconnect page; this is intentionally **not an
offline replica of every authenticated page**. An already-open POS tab retains
its existing offline billing implementation. Installing the app does not grant
camera permission or guarantee connectivity.

## Installation and updates

Where `beforeinstallprompt` exists, save its one-use event and call it only after
the user's click. Clear it after acceptance or dismissal. `appinstalled` and
standalone display detection hide the install action. Other browsers receive
manual instructions, including Safari/iOS Share → Add to Home Screen and Safari
Mac Add to Dock where supported. No claim is made that every browser can install.

Workers wait by default; never activate or reload automatically during work.
The update notice can be dismissed. Applying an update requires an explicitly
clicked button on the signed-out login page and exactly one app window. The
worker checks its client list, and the page supplies its current pathname because
Chrome's `WindowClient.url` can retain the document's pre-redirect URL in an SPA.
Other tabs must close first. Only the requesting window reloads on controller
change. Closing all app windows also permits the normal browser worker lifecycle.
There is no forced logout or deletion of local bills.

## Verification, 25 October 2026

- Production build and TypeScript check passed.
- Frontend test suite: 26 passed (including existing offline queue tests).
- ESLint: 0 errors, 81 pre-existing warnings elsewhere in the frontend.
- Chrome DevTools protocol: manifest errors `[]`, installability errors `[]` in
  a regular persistent browser profile. Incognito intentionally refuses install.
- Actual Chrome service worker checks passed: icon/manifest loading and headers,
  registration, online protected deep links, refresh, cold offline deep links,
  reconnect, public-only cache contents, multi-tab activation refusal, approved
  update after returning from an offline SPA redirect, and old-cache cleanup.
- Install acceptance/dismissal event handlers were tested using synthetic browser
  events. This does not constitute native OS-level installation testing.
- Lighthouse used the performance, accessibility, best-practices and SEO categories,
  not the removed legacy PWA category. Local production login page scores:
  desktop **100/100/100/100**; mobile **95/100/100/100**. These are laboratory results,
  not guarantees of production speed or scores on other pages and devices.

Local detailed reports are in `output/pwa/` at the repository root, including
browser checks and desktop/mobile Lighthouse HTML and JSON. They contain no staff
credentials. No checkout or stock booking was submitted during PWA checks.

Published to the existing Cloud Run frontend as `smartpharm-web-00004-9mt`.
Read-only Chrome checks on the live HTTPS origin also passed: no manifest or
installability errors, all advertised icon dimensions valid, activated worker
with no-store/root-scope headers, protected deep links, offline fallback,
reconnect and public-only cache contents. See `output/pwa/live-checks.json`.

## Release and manual device checks

1. Run `npm run build`, `npm run lint`, `npm run typecheck`, `npm test` in `frontend`.
2. Deploy through the existing GCP frontend build with the existing API origin.
   The prebuild hook automatically changes the worker version with app changes.
3. On the live HTTPS origin, use DevTools Application → Manifest and Service
   Workers; verify scope `/`, valid icons, and the worker's no-store response.
4. On physical Android Chrome/Edge and iPhone/iPad Safari, install, cancel and
   reopen installation; check the OS icon crop, home-screen launch, standalone
   appearance, safe-area layout and removal/reinstallation. These require devices.
5. Keep a draft bill open in one window during a new release. Confirm it is not
   reloaded; dismiss the notice; finish/save work, sign out, close other app
   windows, then accept the update. Verify the existing queued bills still exist.
6. Turn off connectivity and refresh a deep link; expect the public reconnect
   screen. Reconnect and retry the same URL. Keep existing offline POS tabs open.

Platform references: [Next.js PWA guide](https://nextjs.org/docs/app/guides/progressive-web-apps),
[service worker lifecycle](https://web.dev/articles/service-worker-lifecycle),
[installation prompt compatibility](https://developer.mozilla.org/en-US/docs/Web/API/Window/beforeinstallprompt_event).
