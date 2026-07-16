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
- **Forms**: React Hook Form + Zod validation
- **Testing**: Playwright (E2E), Bun test (unit tests)
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
  - Download management
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
├── auth/              # Auth0 integration, login, protected routes
├── components/        # React components
│   ├── ui/           # shadcn/ui components (DO NOT modify unless necessary)
│   └── ...           # Feature components
├── context/          # React Context providers (Favorites, Dislikes)
├── hooks/            # Custom React hooks
├── lib/              # Utilities, API clients, helpers
├── pages/            # Route pages
├── seo/              # SEO meta tags, JSON-LD
└── main.tsx          # App entry point

backend/
├── src/
│   ├── routes/           # API routes
│   ├── cinematch/        # Recommendation engine
│   ├── cybersecurity/    # Security middleware
│   ├── admin/           # Admin routes + middleware
│   └── services/        # Business logic

e2e/                  # Playwright E2E tests
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
npm run e2e             # Run all Playwright E2E tests
npm run e2e:ui          # Playwright UI mode (interactive)
npm run e2e:ci          # CI-safe E2E tests
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
1. **E2E tests** - Write E2E tests for critical user flows
2. **Test IDs** - Use `data-testid` attributes for Playwright selectors
3. **Mock auth** - Use `VITE_MOCK_AUTH=true` for E2E tests
4. **CI mode** - Tag flaky tests with `@skip-ci`

### Performance
1. **Code splitting** - Use dynamic imports for heavy components
2. **Image optimization** - Use WebP with fallbacks
3. **Lazy loading** - Lazy load below-the-fold content
4. **React Query caching** - Configured with staleTime/cacheTime

### Dependencies
1. **Lock file** - Use `bun.lockb` (Bun) and `package-lock.json` (npm)
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

### Protected Routes
```tsx
// Wrap with ProtectedRoute
<Route path="/admin" element={<ProtectedRoute><AdminDashboard /></ProtectedRoute>} />
```

### API Calls
```tsx
// Use the API client from lib/
import { api } from '@/lib/api'
const response = await api.get('/movies')
```

## Troubleshooting

### E2E Tests Failing
- Check if preview server is running: `npm run preview`
- Use mock auth: `VITE_MOCK_AUTH=true`
- Run specific test: `npm run e2e:ui` and select test

### Backend Not Starting
- Check if Supabase is accessible
- Verify env vars in `backend/.env`
- Check port 4000 is not in use

### Build Errors
- Clear node_modules: `rm -rf node_modules && npm install`
- Clear Vite cache: `rm -rf node_modules/.vite`
- Check TypeScript errors: `npx tsc --noEmit`

## Git Workflow

1. Work on feature branches
2. Run tests before committing: `npm run e2e`
3. Commit with co-authoring: `Co-Authored-By: Claude Sonnet 4.5 <noreply@anthropic.com>`
4. Create PR with clear description
5. Wait for CI checks to pass

## Additional Notes

- **CineMatch**: Custom recommendation algorithm in `backend/src/cinematch/`
- **Search**: Trie-based autocomplete for fast search
- **PWA**: Configured with vite-plugin-pwa
- **Security**: Regular security audits with npm audit
- **Deployment**: Auto-deploy on main branch push
