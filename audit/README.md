# StreamVault Audit Guide

All security and quality audits are centralized in this `audit/` directory.

## Initialize Audit Tooling (Run Once)

From project root:

```bash
npm install
```

Promptfoo is fetched via `npx promptfoo@latest` during runs, so internet access is required on first execution.

## AI Red Team Audit (Promptfoo)

This audit currently targets the recommendation eval endpoint (`/api/recommendations/eval`) through the local mock eval server.

Primary entrypoint:

```bash
./audit/run_ai_audit.sh
```

Optional mode:

```bash
# Faster smoke run with smaller plugin set
./audit/run_ai_audit.sh minimal
```

View results:

```bash
# Use full config
npx promptfoo@latest view --config audit/config/promptfoo-redteam-full.yaml

# Or use minimal config
npx promptfoo@latest view --config audit/config/promptfoo-redteam-minimal.yaml
```

Common red-team issues:
- If you see `Could not perform remote grading` with Cloudflare HTML, your network cannot reach Promptfoo cloud endpoints. Check: `curl -I https://api.promptfoo.app/version`.
- For full `jailbreak:tree` coverage, authenticate first: `npx promptfoo@latest auth login`.

Output location:
- Timestamped generated red-team cases: `audit/reports/ai/redteam-<mode>-<timestamp>.yaml`
- Latest alias: `audit/reports/ai/redteam-latest.yaml`

## UI/UX Audit (Manual + Skill-Based)

Write manual UI findings into `audit/reports/ui/` (create the directory if it does not exist).

Helpful skill commands:
- `npx skills find-skills`
- `npx skills audit`

## Directory Structure

- `audit/run_ai_audit.sh`: Main AI audit runner.
- `audit/config/promptfoo-redteam-full.yaml`: Full security config.
- `audit/config/promptfoo-redteam-minimal.yaml`: Minimal/smoke config.
- `audit/scripts/mock-eval-server.mjs`: Local mock eval endpoint.
- `audit/reports/ai/`: Generated red-team reports.
- `audit/reports/ui/`: UI audit writeups.
