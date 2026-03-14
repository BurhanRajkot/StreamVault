# StreamVault Audit Guide

All security and quality audits are now centralized in the `audit/` directory.

## 1. AI Red Team Audit (Security)
Run a comprehensive security scan against the entire AI surface area.

```bash
# Makes the script executable
chmod +x audit/run_ai_audit.sh

# Runs the full scan (Starts server, runs promptfoo, cleaned up)
./audit/run_ai_audit.sh
```

### Viewing Results
To view the detailed interactive report for AI scans:
```bash
npx promptfoo@latest view --config audit/promptfoo.yaml
```

## 2. UI/UX & Design Audit (Quality)
To check for accessibility, performance, and design slop, follow the template in:
`audit/UI_AUDIT_REPORT.md`

Use the following commands to help find and fix UI issues:
- `npx skills find-skills`: Discover new audit capabilities.
- `npx skills audit`: (In future) can be used to trigger automated UI checks.

---

## Directory Structure
- `audit/promptfoo.yaml`: Centralized AI audit config.
- `audit/run_ai_audit.sh`: Combined runner script.
- `audit/UI_AUDIT_REPORT.md`: Design quality report template.
- `audit/scripts/eval-server.ts`: Mock environment for AI tests.
./audit/run_ai_audit.sh
./audit/run_ai_audit.sh
./audit/run_ai_audit.sh
./audit/run_ai_audit.sh
./audit/run_ai_audit.sh
./audit/run_ai_audit.sh
./audit/run_ai_audit.sh
./audit/run_ai_audit.sh
./audit/run_ai_audit.sh
./audit/run_ai_audit.sh
./audit/run_ai_audit.sh
./audit/run_ai_audit.sh
./audit/run_ai_audit.sh
