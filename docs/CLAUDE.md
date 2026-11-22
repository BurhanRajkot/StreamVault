# StreamVault - Claude Code Context

This file is automatically read by Claude Code at the start of each session to maintain consistent development practices.

**📖 NEW USER? Read [CLAUDE_USAGE_GUIDE.md](./CLAUDE_USAGE_GUIDE.md) for a complete guide on using all the tools!**

## Tech Stack

### Frontend
- **Framework**: React 19 with Vite
- **Routing**: React Router v7
- **Styling**: Tailwind CSS 4.3 + Radix UI components
- **State Management**:
  - React Query (TanStack Query) for server state
  - React Context for global state (Favorites, Dislikes, Auth)
- **UI Components**: shadcn/ui (Radix UI primitives)
- **Animations**: Framer Motion
- **Testing**: [e2e](https://e2e.com/docs) for new E2E tests (`e2e/tests/`), legacy Playwright suite (`e2e/specs/`), Bun test (unit tests)
- **Auth**: Auth0 (@auth0/auth0-react)
- **Theme**: next-themes for dark mode

### Backend
- **Runtime**: Bun
- **Framework**: Express 5
- **Database**: Supabase (PostgreSQL)
- **API**: TMDB (The Movie Database)
- **Features**:
  - CineMatch recommendation engine
  - Trie-based search autocomplete
  - Favorites/Dislikes system
  - Continue watching tracking
  - Premium (Real-Debrid) server — admin + accounts the admin approves
  - Public release search for magnet-link downloads
  - F1 archive — every season's race weekends, each session to watch (Premium) or download
  - Admin dashboard

### Infrastructure
- **Containerization**: Docker + Docker Compose
- **Orchestration**: Kubernetes (k8s/)
- **Deployment**: Vercel (frontend), Netlify backup
- **CI/CD**: GitHub Actions
- **Security**: Helmet, CORS, rate limiting, HTTPS enforcement

## Project Structure

```
src/
├── auth/                 # Auth0 provider, login/signup pages, mock Auth0 for E2E
├── components/
│   ├── admin/            # Admin login modal, admin-mode badge, Premium status card
│   ├── downloads/        # Download sheet (magnet links + subtitles)
│   ├── layout/           # Header, Footer, MobileNav, account menu, error boundary
│   ├── media/            # Cards, grid, rating, hover preview
│   ├── modals/           # Title detail (+ movie-detail/ parts), quick view, disclaimer
│   ├── onboarding/       # CineMatch first-run onboarding
│   ├── player/           # Premium player: video, controls, seek preview, loading
│   ├── sections/         # Home page rows (hero, continue watching, recommendations)
│   ├── shared/           # Small cross-page pieces (platform selector, SEO copy)
│   └── ui/               # shadcn/ui primitives (DO NOT modify unless necessary)
├── context/              # React Context providers (Favorites, Dislikes)
├── data/                 # Static curated data (Author's Choice lists)
├── hooks/                # Custom React hooks (useIsMobile, useMedia, ...)
├── lib/                  # API clients, utilities, playback helpers (+ *.test.ts)
├── pages/                # Route pages (admin/ for the dashboard)
├── seo/                  # SEO meta tags, JSON-LD
└── main.tsx              # App entry point

backend/
├── src/
│   ├── admin/            # Admin auth (TOTP/JWT), middleware, routes
│   ├── cinematch/        # Recommendation engine (candidates → filter → rank → mix)
│   ├── cybersecurity/    # Helmet, CORS, HTTPS, all rate limiters
│   ├── lib/              # Supabase, TMDB, Real-Debrid/Torrentio clients, logger
│   ├── middleware/       # Auth0 JWT check
│   ├── routes/           # REST API routes
│   ├── services/         # Cache (Redis + local), TMDB limiter
│   └── types/
├── ml-pipeline/          # Python embedding training/upload for CineMatch
├── scripts/              # One-off admin scripts (TOTP setup)
└── supabase/             # Schema migration + verify script

e2e/                      # Playwright E2E (specs/, fixtures/, pages/)
infrastructure/           # docker/, k8s/ (kustomize + ArgoCD), nginx/
audit/                    # Promptfoo AI red-team audit (reports/ is gitignored)
scripts/                  # Repo scripts (gen-csp.ts)
docs/                     # CLAUDE.md, usage guide, security, testing, setup
```

## Coding Conventions

### TypeScript
- **Strict mode**: Enabled
- **Type safety**: Never use `any` - use `unknown` or proper types
- **Imports**: Use absolute imports when possible
- **Interfaces**: Prefer interfaces over types for object shapes

### React
- **Components**: Functional components with hooks only
- **Props**: Destructure props in function signature
- **State**: Use React Query for server state, Context for global client state
- **Effects**: Minimize useEffect usage - prefer React Query or event handlers
- **Keys**: Always provide meaningful keys for lists
- **Exports**: Use named exports, not default exports (except for pages)

### Styling
- **Tailwind**: Use Tailwind utility classes first
- **Custom CSS**: Only when Tailwind can't achieve the design
- **Responsive**: Mobile-first approach (sm, md, lg, xl breakpoints)
- **Theme**: Use CSS variables from Tailwind config for colors
- **shadcn/ui**: Don't modify ui/ components - compose with them instead

### File Naming
- **Components**: PascalCase (e.g., `HeroCarousel.tsx`)
- **Hooks**: camelCase with "use" prefix (e.g., `useFavorites.ts`)
- **Utils**: camelCase (e.g., `searchAlgorithm.ts`)
- **Types**: PascalCase (e.g., `Movie`, `MediaItem`)

### API Routes (Backend)
- **Pattern**: RESTful routes in `/routes`
- **Validation**: Validate all inputs
- **Error handling**: Use try-catch and return proper HTTP status codes
- **Auth**: Use `requireAdminAuth` middleware for protected routes
- **Rate limiting**: Already configured globally

## Commands

### Development
```bash
npm run dev              # Start frontend + backend concurrently
npm run dev:frontend     # Vite dev server only
npm run dev:backend      # Bun backend only
```

### Build
```bash
npm run build           # Production build
npm run build:dev       # Development build
```

### Testing
```bash
npm test                # Run frontend unit tests
npm run test:backend    # Run backend tests
npm run test:e2e        # e2e framework — e2e/tests/*.e2e.ts, desktop + mobile (see e2e/README.md)
npm run test:e2e:smoke  # smoke-tagged e2e tests, desktop
npm run e2e             # Playwright E2E (legacy suite) — desktop + mobile Chromium
npm run e2e:smoke       # @smoke tests only (~20s)
npm run e2e:all-browsers # + Firefox / WebKit
npm run e2e:ui          # Playwright UI mode (interactive)
```

### Linting
```bash
npm run lint            # ESLint check (automatically runs on file save)
```

## Important Rules

### Security
1. **Never commit secrets** - Use `.env.local` (already in .gitignore)
2. **Input validation** - Always validate user input on backend
3. **Rate limiting** - Already configured, don't disable
4. **CORS** - Configured for specific origins only
5. **HTTPS** - Enforced in production

### Testing
1. **E2E tests** - Write NEW E2E tests with the e2e framework (`import { test } from './fixtures'`, `import { expect } from 'e2e'`), one `*.e2e.ts` per journey in `e2e/tests/` (conventions in `e2e/README.md`). Keep them deterministic (no `agent` steps) unless a model is configured. The Playwright specs in `e2e/specs/` still run; port one to `e2e/tests/` when you touch it
2. **Selectors** - Roles and accessible names first; `data-testid` only where there's no accessible handle
3. **Hermetic** - E2E runs the prod build against `MockApi` (`e2e/fixtures/mock-api.ts`); a new backend endpoint the app calls needs a mock handler or the test fails
4. **No flakes** - No sleeps; fix a test that's flaky on retry rather than skipping it

### Performance
1. **Code splitting** - Use dynamic imports for heavy components
2. **Image optimization** - Use WebP with fallbacks
3. **Lazy loading** - Lazy load below-the-fold content
4. **React Query caching** - Configured with staleTime/cacheTime

### Dependencies
1. **Lock file** - Frontend (root): keep `package-lock.json` (npm — CI and the Docker image install with it) and `bun.lock` in sync. Backend: `backend/bun.lock` is the only lockfile (Dependabot updates it through the `bun` ecosystem). CI pins Bun in `ci.yml` (`BUN_VERSION`) to the same 1.4 line as the backend image; write lockfiles with that version or older, since a newer Bun can write a format CI can't read
2. **Overrides** - Security overrides are in package.json
3. **Updates** - Check for security updates regularly

## Environment Variables

### Frontend (.env.local)
```env
VITE_AUTH0_DOMAIN=           # Auth0 domain
VITE_AUTH0_CLIENT_ID=        # Auth0 client ID
VITE_AUTH0_AUDIENCE=         # Auth0 API audience
VITE_API_URL=                # Backend API URL
VITE_TMDB_IMAGE_BASE_URL=    # TMDB image CDN
VITE_MOCK_AUTH=              # Mock auth for testing
```

### Backend (backend/.env)
```env
SUPABASE_URL=               # Supabase project URL
SUPABASE_ANON_KEY=          # Supabase anon key
TMDB_API_KEY=               # TMDB API key
AUTH0_DOMAIN=               # Auth0 domain
AUTH0_AUDIENCE=             # Auth0 audience
RESEND_API_KEY=             # Resend key: "you have Premium" emails (lib/premiumEmail); unset = none sent
MAIL_FROM=                  # optional, default "StreamVault <premium@stream-vault.site>" (domain verified in Resend)
MAIL_REPLY_TO=              # optional
```

### MCP Servers (.env.local - optional)
```env
GITHUB_PERSONAL_ACCESS_TOKEN=  # For GitHub MCP server
```

## MCP Servers Configured

This project has the following MCP servers in `.mcp.json`:

1. **context7** - Latest docs for React, Vite, Tailwind, Supabase, Auth0
2. **github** - PR/issue management (requires GITHUB_PERSONAL_ACCESS_TOKEN)
3. **playwright** - Browser automation for E2E debugging
4. **serena** - Advanced code navigation (requires: `pip install uv`)

## Development Hooks

### Auto-fix on Save
- **ESLint** automatically fixes code style issues when files are edited/written
- Runs via PostToolUse hooks in `.claude/settings.local.json`

## Common Patterns

### Fetching Data
```tsx
// Use React Query
const { data, isLoading, error } = useQuery({
  queryKey: ['movies', category],
  queryFn: () => fetchMovies(category)
})
```

### Adding to Favorites
```tsx
// Use Favorites Context
const { addFavorite, removeFavorite, isFavorite } = useFavorites()
```

### Premium (Real-Debrid) is invite-only
`/debrid/*` sits behind `requirePremiumAccess`
(`backend/src/middleware/premiumAccess.ts`): the admin's TOTP token always
passes; an Auth0 account passes when the admin set its `premiumAccess` to
`granted` in the dashboard's Users panel, it isn't suspended, and Premium
isn't paused site-wide (`AppSetting` 'premium'). The rule is
`decidePremium` in `backend/src/lib/userAccess.ts`. `/debrid/status` and
torrent deletion stay `requireAdminAuth`. Suspension (`User.suspendedAt`)
also refuses favorites, dislikes, continue watching and recommendations.
An approved account's Premium plays **in the app only**: the app marks
every signed-in backend call with `X-StreamVault-Client: app/<version>`
(only those: on anonymous calls the custom header would cost a CORS preflight each)
(`app/src/native/clientHeader.ts`, checked by `backend/src/lib/clientKind.ts`),
and `decidePremium` answers `app-only` to the website (the admin plays
anywhere). It's a soft line — a header — not a lock. App builds older than
`PREMIUM_MIN_APP_VERSION` (default 1.0.21, `isOutdatedApp` in `lib/clientKind.ts`)
get `update-required` instead, so an old release can't skip newer gates; raise it
when a release adds a gate that matters. Accounts ask for access
from the app's Premium screen (`/me/access-request`; starring the repo and
donating are optional, the star is checked with GitHub by
`lib/githubStars.ts`); the admin approves or deletes requests in the
dashboard (`/admin/access-requests`, kept as `AppSetting`
'access-request:<user id>' rows, no migration). The app has its own admin
dashboard at `/admin` (My Space → Admin).
In the UI, Premium is always the last server; `usePremiumAccess()` asks
`GET /me/access` and `PremiumPane` shows the player or a notice saying why
not. Premium *downloads* (saving the Real-Debrid file: offline download,
Download, Open in another player) are **off for every account** — approved
accounts stream only — until the admin allows them per account in the Users
panel (`debridDownloads` on `/me/access` and `PATCH /admin/users/:id`, stored
as `AppSetting` 'debrid-downloads-allowed' → `{ allowedFor: [ids] }`, no
migration; an unreadable setting means off). The admin always may. The
backend refuses `POST /debrid/play` with `purpose: 'download'` for anyone
else; the rest is UI (the stream is the same link), so released desktop
builds have no devtools, refuse remote-debugging switches and ship Electron
fuses (no run-as-node / inspector). The Download sheet's magnet links
come from the public `GET /releases`, which never touches the Real-Debrid
account (and isn't affected by that switch). In E2E, `adminTest` (e2e
framework) or `test.use({ admin: true })` (Playwright) holds an admin
session; set `mockApi.state.users` / `premiumPausedForAll` / `accessRequests` to test
accounts, and `mockApi.state.asApp = true` to play an approved account's Premium
(as the app would).

### F1 archive
`/f1` on the website (`src/pages/F1*.tsx`) and in the app
(`app/src/screens/F1*.tsx`): a season's race weekends → a weekend's sessions
(Practice 1–3, Sprint Qualifying, Sprint, Qualifying, Race) → watch or
download. The public backend `GET /f1/seasons/:year` takes calendars, session
times and winners from Jolpica (Ergast's successor, keyless);
`GET /f1/seasons/:year/races/:round/releases` asks Knaben (`api.knaben.org`,
an index of public trackers) and apibay by the Grand Prix's names and round —
Knaben finds the most-shared uploads, named like a TV series
(`Formula.1.2026x19.Mexico.Race.SkyF1HD.1080p`), which apibay's whole-word
search misses — and `lib/f1Names.ts` reads each release name: which race,
which sessions (a "Qualifying + Race" torrent or a ~77 GB SkyUHD weekend pack
holds several — `pack`), dropping shows, highlights, games and
foreign-commentary broadcasts. Torrentio can't help (races have no IMDb id).
Watching is ordinary Premium with the same rules (`PremiumPane` with a
`releaseSource`, `src/lib/f1.ts f1ReleaseSource`): `/debrid/play` gets
`session`, and `pickPlaybackFile` takes that session's file out of a pack; a
pack is never the download fallback, and releases nobody seeds are still
probed for Real-Debrid's cache. Downloads are the Download sheet's magnet
links, open to everyone. Winners stay hidden until the viewer turns results
on (`useF1ShowResults`). E2E mock data: `F1_RACES` / `f1Releases` in
`e2e/fixtures/data.ts`.

### Protected Routes
Admin pages guard themselves rather than being wrapped in a route element —
the page needs to render the login modal in place when the token is missing or
has expired, which a redirecting wrapper cannot do.
```tsx
import { isAdminAuthenticated } from '@/lib/api'

const [isAdmin, setIsAdmin] = useState(isAdminAuthenticated())
if (!isAdmin) return <AdminLoginModal onSuccess={() => setIsAdmin(true)} />
```

### API Calls
`lib/api.ts` exports one named function per endpoint — there is no generic
`api` client object.
```tsx
import { fetchMediaDetails } from '@/lib/api'
const media = await fetchMediaDetails('movie', tmdbId)
```

## Troubleshooting

### E2E Tests Failing
- Playwright builds + serves the app itself (`dist-e2e/`, port 4173) — free the port if something else holds it
- Run one file: `npx e2e run smoke --target desktop` (e2e framework; `.e2e/results/<test>/trace.md` on failure, `.e2e/logs/app.log` for the server), or `npx playwright test premium-player --project=desktop` / `npm run e2e:ui` (Playwright)
- Open the trace of a failure: `npx playwright show-trace e2e/test-results/<test>/trace.zip`

### Backend Not Starting
- Check if Supabase is accessible
- Verify env vars in `backend/.env`
- Check port 4000 is not in use

### Build Errors
- Clear node_modules: `rm -rf node_modules && npm install`
- Clear Vite cache: `rm -rf node_modules/.vite`
- Check TypeScript errors: `npm run typecheck` (a bare `npx tsc --noEmit` checks nothing — the root tsconfig only references the app/node/backend projects)

## Git Workflow

1. Work on feature branches
2. Run tests before committing: `npm run test:e2e` and `npm run e2e`
3. Commit with a co-author trailer naming the Claude model that did the work, e.g. `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`
4. Create PR with clear description
5. Wait for CI checks to pass

## Additional Notes

- **CineMatch**: Custom recommendation algorithm in `backend/src/cinematch/`
- **Search**: Trie-based autocomplete for fast search
- **PWA**: Configured with vite-plugin-pwa
- **Security**: Regular security audits with npm audit
- **Deployment**: Auto-deploy on main branch push
