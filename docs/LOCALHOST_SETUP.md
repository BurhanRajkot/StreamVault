# StreamVault Localhost Setup

## 1) Create env file
From project root:

```bash
cp .env.example .env.local
```

Fill all required values in `.env.local`.

Notes:
- Frontend reads `VITE_*` keys from project root env files.
- Backend now reads from both `backend/.env(.local)` and project root `.env(.local)`.
- Recommended local ports:
  - Frontend: `http://localhost:8080`
  - Backend: `http://localhost:4000`

## 2) Start dev servers

```bash
npm run dev
```

## 3) Quick checks
- `GET http://localhost:4000/health` should return status JSON.
- Open `http://localhost:8080`.

## Common issues
- Missing `VITE_AUTH0_CLIENT_ID` or `VITE_SUPABASE_ANON_KEY` can break login/supabase features.
- If backend starts with missing env warnings, verify `.env.local` exists in project root and keys are correctly named.
