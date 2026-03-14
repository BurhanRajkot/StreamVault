# StreamVault Audit Guide

All security and quality audits are centralized in this `audit/` directory.

## AI Red Team Audit (Promptfoo)

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

Output location:
- Timestamped reports: `audit/reports/ai/redteam-<mode>-<timestamp>.yaml`
- Latest report alias: `audit/reports/ai/redteam-latest.yaml`

## UI/UX Audit (Manual + Skill-Based)

Use the report template:
- `audit/reports/ui/ui-audit-report-template.md`

Helpful skill commands:
- `npx skills find-skills`
- `npx skills audit`

## Directory Structure

- `audit/run_ai_audit.sh`: Main AI audit runner.
- `audit/config/promptfoo-redteam-full.yaml`: Full security config.
- `audit/config/promptfoo-redteam-minimal.yaml`: Minimal/smoke config.
- `audit/scripts/mock-eval-server.mjs`: Local mock eval endpoint.
- `audit/reports/ai/`: Generated red-team reports.
- `audit/reports/ui/`: UI audit report templates and writeups.
