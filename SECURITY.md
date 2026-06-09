# Security Policy

StreamVault takes the security of its code, infrastructure, and users seriously. This document explains which versions receive security fixes, how to report a vulnerability responsibly, what you can expect from us in return, and what is in and out of scope.

If you believe you have found a security vulnerability, **please do not open a public issue, pull request, or discussion.** Use one of the private channels described in [Reporting a Vulnerability](#reporting-a-vulnerability) below.

---

## Supported Versions

StreamVault is a continuously deployed web application (frontend on Vercel/Netlify, backend on Render, containerized for Docker/Kubernetes) rather than a library you install and pin. As a result, security fixes always land on the latest release line and the rolling production deployment. Older pre-release builds are not maintained.

| Version | Supported | Notes |
| ------------------------ | :----------------: | ----------------------------------------------- |
| `main` (production)      | :white_check_mark: | Rolling deploy; always receives security fixes  |
| `1.0.x` (latest release) | :white_check_mark: | Patch releases cut from `main`                  |
| `< 1.0` (pre-release)    | :x:                | Development snapshots; upgrade to `1.0.x`/`main` |

Because production tracks `main`, there is normally nothing for end users to upgrade — fixes reach the hosted app on the next deploy. Self-hosters should track the latest tagged release or `main`.

---

## Reporting a Vulnerability

We support **coordinated (responsible) disclosure** and welcome reports from security researchers.

### How to report

1. **GitHub Private Vulnerability Reporting (preferred).**
   Go to the repository's **Security** tab → **Report a vulnerability**, or use this direct path:
   `https://github.com/BurhanRajkot/StreamVault/security/advisories/new`
   This keeps the report private to maintainers and lets us collaborate on a fix, request a CVE, and credit you in a published advisory.

   > Maintainer note: enable this once under **Settings → Code security and analysis → Private vulnerability reporting**.

2. **Email (alternative).**
   Send details to **`<SECURITY_CONTACT_EMAIL>`** with a subject line beginning `[StreamVault Security]`.
   If you wish to encrypt the report, request our PGP key in a first contact email and we will provide a fingerprint, or attach your own public key so we can reply securely.

Please **do not** disclose the issue publicly — including on social media, blogs, or conference talks — until we have confirmed a fix has shipped and agreed on a disclosure timeline with you.

### What to include

A good report helps us triage faster. Where possible, include:

- A clear description of the vulnerability and its security impact.
- The affected component and version/commit (e.g., frontend route, a specific `backend/src/...` module or API endpoint, a CI workflow, a container image, or a Kubernetes manifest).
- Step-by-step reproduction instructions, including any required preconditions, accounts, or roles.
- A minimal proof-of-concept (request, payload, script, or screenshot/video). Please redact any real secrets or third-party credentials.
- The environment you tested against (local dev, a self-hosted instance, or a public deployment URL).
- Your assessment of severity and, if you can, a CVSS v3.1 vector.
- How you would like to be credited (name/handle/anonymous) if the report is accepted.

---

## Our Response Commitment

We aim to meet the following timelines for reports made through the private channels above. These are targets, not contractual guarantees, and may stretch for complex issues.

| Stage                      | Target                                                       |
| -------------------------- | ------------------------------------------------------------ |
| Acknowledgement of report  | Within **3 business days**                                   |
| Initial triage & severity  | Within **7 business days**                                   |
| Status updates             | At least **every 7 days** until resolution                   |
| Fix for critical/high      | Targeted within **30 days** of confirmation                  |
| Fix for medium/low         | Prioritized into the normal release cycle                    |
| Public disclosure / advisory | **Coordinated with you**, typically after a fix is deployed |

If an issue is being actively exploited, tell us in the report — we will treat it as critical and respond on an accelerated basis.

---

## Coordinated Disclosure Policy

- We practice coordinated disclosure and ask reporters to give us a reasonable window (typically up to **90 days**) to remediate before any public discussion.
- When a fix ships, we will publish a GitHub Security Advisory and, where the issue warrants it, request a CVE.
- We are happy to credit researchers in the advisory unless you prefer to remain anonymous.
- If we cannot reach agreement on a timeline, we will work with you in good faith rather than resorting to legal pressure (see [Safe Harbor](#safe-harbor)).

---

## Safe Harbor

We consider security research conducted in good faith under this policy to be **authorized**, and we will not pursue or support legal action against researchers who:

- Make a good-faith effort to comply with this policy.
- Only interact with accounts they own or have explicit permission to test.
- Avoid privacy violations, data destruction, service degradation, and disruption to other users.
- Do not access, modify, or exfiltrate data beyond the minimum needed to demonstrate the issue, and delete any such data promptly afterward.
- Give us reasonable time to remediate before public disclosure.
- Do not exploit the issue beyond proof-of-concept, run automated scanning that degrades service, or use social engineering, phishing, or physical attacks against StreamVault, its maintainers, or its providers.

If in doubt about whether a specific action is acceptable, ask us first via the private channels above. This safe harbor applies only to StreamVault's own code and infrastructure — it does not authorize testing of third-party services (see [Out of Scope](#out-of-scope)).

---

## Scope

### In scope

Security issues affecting StreamVault's own code and infrastructure, including:

- **Frontend** (React/Vite SPA): XSS, DOM clobbering, client-side injection, insecure handling of tokens in the browser, PWA/service-worker issues, CSP bypasses, clickjacking on first-party routes.
- **Backend API** (Bun + Express): authentication and authorization flaws, broken access control, IDOR, injection, SSRF, request smuggling, insecure deserialization, rate-limit bypass, and logic flaws in routes such as `admin`, `subscriptions`, `favorites`, `downloads`, `recommendations`, and `tmdb`.
- **Authentication & sessions**: Auth0 (OAuth2/JWT) integration flaws, JWT validation issues, and the separate **admin authentication** path (`ADMIN_SECRET` / `ADMIN_JWT_SECRET`) — e.g., privilege escalation to admin.
- **Payments**: vulnerabilities in the UPI payment flow (`backend/src/lib/upi.ts`), including tampering, amount manipulation, or leakage of payee details.
- **Data layer**: Supabase access-control / Row-Level-Security misconfigurations, and any exposure of the **Supabase service-role key** or other server-side secrets.
- **Recommendation engine (CineMatch / ML pipeline)**: prompt-injection, data poisoning, or abuse of the recommendation/eval endpoints.
- **Supply chain & CI/CD**: workflow injection, secret exfiltration via Actions, tampering with build provenance/SBOM, or weaknesses in container images and Kubernetes manifests.
- **Security headers & transport**: meaningful CSP/Helmet/CORS/HSTS weaknesses that lead to a demonstrable exploit.

### Public deployment testing

Testing against public StreamVault deployments is permitted **only** within the [Safe Harbor](#safe-harbor) rules above. Use your own test accounts, avoid load/stress testing, and never touch other users' data.

---

## Out of Scope

The following are generally **not** eligible under this policy. Many should be reported to the respective vendor instead.

- **Third-party embedded streaming/video providers** (e.g., the external player and source domains referenced in our CSP). These are external services we embed via `<iframe>`; their security, content, and availability are outside our control. Report issues to the provider directly.
- **Upstream platforms and services**: Auth0, Supabase, TMDB, Vercel, Netlify, Render, Cloudflare, Redis providers, and similar. Report to their respective security teams.
- **Vulnerabilities in third-party dependencies** that we have not yet been able to patch — though we welcome a heads-up. (We already run npm audit, OSV, Dependabot, and Trivy; see below.)
- Missing security headers, cookie flags, or best-practice configs **without a demonstrable exploit**.
- Reports generated solely by automated scanners with no validated impact.
- Self-XSS, clickjacking on pages with no sensitive actions, or issues requiring an already fully-compromised device/browser.
- Rate-limiting or denial-of-service findings that rely on volumetric/stress testing, or any testing that degrades service for others.
- Social engineering, phishing, or physical attacks against maintainers or infrastructure.
- Content/copyright/legal concerns about media reachable through embedded providers — this policy covers **security**, not content; please use the appropriate non-security channel.
- Outdated browsers or platforms outside our supported matrix.

---

## Severity & Triage

We assess severity using **CVSS v3.1** as a starting point, adjusted for real-world exploitability and the sensitivity of affected data (admin access, payment data, and the Supabase service-role key are weighted heavily). Indicative bands:

| Severity | Examples                                                                                  |
| -------- | ----------------------------------------------------------------------------------------- |
| Critical | RCE, full auth bypass, admin takeover, service-role key exposure, payment manipulation    |
| High     | Stored XSS with session theft, IDOR exposing other users' data, SSRF reaching internal services |
| Medium   | Reflected XSS, CSRF on sensitive actions, meaningful rate-limit bypass                     |
| Low      | Information disclosure of limited value, minor misconfigurations with a real but small impact |

---

## Security Measures Already in Place

StreamVault ships with a defense-in-depth posture. Knowing what already exists may help you focus your research:

**Application layer**
- Centralized security middleware in `backend/src/cybersecurity/`: Helmet (security headers/CSP), CORS allow-listing, tiered rate limiting (`api` / `strict` / `auth`), and HTTPS enforcement.
- Auth0-based authentication (OAuth2 JWT bearer) with a separately gated admin path.
- Input validation with Zod on the frontend; parameterized data access via Supabase.
- Content Security Policy and related headers applied at the edge (`public/_headers`, `nginx.conf`).

**Supply chain & CI/CD** (GitHub Actions)
- **Secret scanning** — Gitleaks (CI + `.gitleaks.toml`), gating the pipeline.
- **SAST** — CodeQL analysis.
- **Container scanning** — Trivy on both frontend and backend images.
- **Dependency security** — npm audit, OSV scanner, GitHub Dependency Review, and Dependabot.
- **Build integrity** — SLSA build-provenance attestation and SBOM generation.
- **Workflow hardening** — SHA-pinned actions with a `sha-pin-check` gate, `zizmor` static analysis of workflows, Harden-Runner (egress audit) on every job, and least-privilege token permissions.
- **Posture monitoring** — OpenSSF Scorecard published to the Security tab.
- **AI red-teaming** — Promptfoo red-team audit against the recommendation eval endpoint.
- **Ownership** — `CODEOWNERS` requires maintainer review on security-sensitive paths (workflows, Dockerfiles, k8s manifests, DB migrations, env templates).

All scanner findings are published as SARIF to the repository's **Security** tab.

---

## Handling of Secrets & Sensitive Data

- **Never commit secrets.** Use `.env.local` (git-ignored); `.env.example` documents required variables with placeholder values only.
- The **Supabase service-role key**, **Auth0 secrets**, **`ADMIN_SECRET` / `ADMIN_JWT_SECRET`**, **TMDB API key**, **UPI payment details**, and any LLM/API keys are server-side secrets and must never reach the client bundle or version control.
- Only variables explicitly prefixed `VITE_` are exposed to the browser; treat anything `VITE_`-prefixed as **public**. In particular, do not place service-role keys or admin secrets behind a `VITE_` prefix.
- If you discover an exposed secret (in git history, logs, build artifacts, or a deployment), please report it privately and immediately — we will rotate it.

---

## Recognition

With your permission, we are glad to credit researchers who responsibly disclose valid vulnerabilities in the corresponding GitHub Security Advisory. StreamVault does not currently run a paid bug-bounty program; reports are handled on a goodwill, coordinated-disclosure basis.

---

## Questions

For non-sensitive questions about this policy (not vulnerability reports), open a regular GitHub Discussion or issue. For anything involving a potential vulnerability, always use the private channels in [Reporting a Vulnerability](#reporting-a-vulnerability).

---

> **Before publishing, replace the placeholders:** `<SECURITY_CONTACT_EMAIL>` with a monitored address (e.g., a dedicated `security@` alias or your contact email). Confirm the advisory link matches your repo, and enable **Private vulnerability reporting** in the repository's security settings so the preferred channel actually works.
