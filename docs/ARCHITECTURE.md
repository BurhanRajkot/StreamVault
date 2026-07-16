# 🏗️ Claude Code + StreamVault Architecture

## How Everything Works Together

```
┌─────────────────────────────────────────────────────────────────┐
│                         YOU (Developer)                          │
│                    "Add a new feature"                           │
└─────────────────────┬───────────────────────────────────────────┘
                      │
                      ▼
┌─────────────────────────────────────────────────────────────────┐
│                      CLAUDE CODE                                 │
│                   (AI Assistant)                                 │
└─────────────────────┬───────────────────────────────────────────┘
                      │
         ┌────────────┼────────────┐
         │            │            │
         ▼            ▼            ▼
    ┌────────┐  ┌────────┐  ┌────────┐
    │  MCP   │  │  MCP   │  │  MCP   │
    │ Servers│  │ Servers│  │ Servers│
    └────────┘  └────────┘  └────────┘
         │            │            │
         └────────────┼────────────┘
                      │
         ┌────────────┴────────────┐
         │                         │
         ▼                         ▼
   ┌──────────┐            ┌──────────┐
   │  READ    │            │  WRITE   │
   │  TOOLS   │            │  TOOLS   │
   └──────────┘            └──────────┘
         │                         │
         │                         ▼
         │                   ┌──────────┐
         │                   │  HOOKS   │
         │                   │  (Auto)  │
         │                   └──────────┘
         │                         │
         └────────────┬────────────┘
                      │
                      ▼
         ┌────────────────────────┐
         │   STREAMVAULT PROJECT  │
         │   (Your Codebase)      │
         └────────────────────────┘
```

## 🔍 Read Tools (MCP Servers)

```
context7         ──────►  Latest documentation
                          React 19, Vite 6, Tailwind 4,
                          Supabase, Auth0, Radix UI

github           ──────►  GitHub data
                          PRs, Issues, Commits, Branches

playwright       ──────►  Browser automation
                          Screenshots, UI inspection

serena           ──────►  Codebase intelligence
                          Symbol search, references

docker           ──────►  Container management
                          Logs, status, images

brave-search     ──────►  Web search
                          Latest coding solutions

filesystem       ──────►  File system
                          Enhanced file access
```

## ✏️ Write Tools

```
Claude Code      ──────►  Edit files
                          Write new files
                          Refactor code
```

## 🎣 Hooks (Automatic Actions)

```
After EVERY file edit/write:
┌─────────────────────────────────────┐
│ 1. Prettier   → Format code         │
│ 2. ESLint     → Fix style issues    │
└─────────────────────────────────────┘

At session start:
┌─────────────────────────────────────┐
│ TypeScript    → Check for errors    │
└─────────────────────────────────────┘
```

## 🔄 Complete Workflow Example

### You Ask: "Add a Watch Later feature"

```
Step 1: Understanding
├─ Claude reads CLAUDE.md (project context)
├─ context7: Fetches latest React patterns
└─ serena: Finds similar features (Favorites)

Step 2: Research
├─ brave-search: Searches for best practices
└─ context7: Checks Supabase docs

Step 3: Implementation
├─ Claude writes the code
│   ├─ Frontend: WatchLater component
│   │   └─ Hooks: useWatchLater
│   └─ Backend: API routes
│       └─ Database: Supabase tables

Step 4: Auto-Enhancement (HOOKS)
├─ Prettier: Formats all new files
└─ ESLint: Fixes style issues

Step 5: Verification
├─ playwright: Opens browser to test
└─ Claude shows you a screenshot

Step 6: Documentation
├─ github: Creates PR
└─ Adds description with context7 examples

Step 7: Done!
└─ You get a PR link and working feature ✨
```

## 🧠 How MCPs Enhance Claude

### Without MCPs (Old Claude)
```
Training Data: January 2025
React Version: 18.x (outdated)
Supabase API: 2024 (old)
Vite: 5.x (outdated)

Result: May suggest outdated patterns ❌
```

### With MCPs (Your Setup)
```
context7: Fetches docs in real-time
React Version: 19.x (current)
Supabase API: 2026 (latest)
Vite: 6.x (current)

Result: Always uses latest patterns ✅
```

## 🎯 Data Flow

### Example: "What's new in React 19?"

```
You
 │
 │ "What's new in React 19?"
 │
 ▼
Claude Code
 │
 │ (Decides to use context7)
 │
 ▼
context7 MCP
 │
 │ (Fetches https://react.dev/blog/latest)
 │
 ▼
Claude Code
 │
 │ (Processes and summarizes)
 │
 ▼
You
 │
 │ "React 19 introduces..."
 └──► ✅ Latest info!
```

### Example: "Create a PR for this feature"

```
You
 │
 │ "Create a PR"
 │
 ▼
Claude Code
 │
 │ (Reads current branch changes)
 │
 ▼
github MCP
 │
 │ GET /repos/owner/repo/compare/main...feature
 │
 ▼
Claude Code
 │
 │ (Generates PR description)
 │
 ▼
github MCP
 │
 │ POST /repos/owner/repo/pulls
 │
 ▼
You
 │
 │ "PR created: https://github.com/..."
 └──► ✅ PR is live!
```

## 🔐 Security & Permissions

```
MCP Servers:
├─ context7      → Read-only (fetches docs)
├─ github        → Read/Write (needs token)
├─ playwright    → Local browser (safe)
├─ serena        → Read-only (code search)
├─ docker        → Local control (safe)
├─ brave-search  → Read-only (web search)
└─ filesystem    → Read/Write (project directory only)

Hooks:
├─ Prettier      → Modifies files (safe, formatting only)
├─ ESLint        → Modifies files (safe, auto-fix only)
└─ TypeScript    → Read-only (checking only)

Permissions:
└─ Configured in .claude/settings.local.json
   ├─ You control what Claude can access
   └─ Pre-approved common commands
```

## 🚦 Connection Status

You can check MCP status by asking Claude:

```
You: "What MCP servers are active?"

Claude: "Currently connected to:
✅ context7
✅ playwright
✅ docker
✅ filesystem
⚠️  github (not configured - needs GITHUB_PERSONAL_ACCESS_TOKEN)
⚠️  serena (not installed - needs uv)
⚠️  brave-search (not configured - needs BRAVE_API_KEY)"
```

## 📊 Performance Impact

```
┌────────────────────────────────────────────────┐
│  Metric              │  Without  │  With MCPs  │
├────────────────────────────────────────────────┤
│  Doc lookup          │  Manual   │  Instant    │
│  Code formatting     │  Manual   │  Auto       │
│  PR creation         │  5 min    │  30 sec     │
│  Bug debugging       │  30 min   │  5 min      │
│  Feature research    │  1 hour   │  5 min      │
│  Overall speed       │  1x       │  10-12x     │
└────────────────────────────────────────────────┘
```

## 🔄 Update Cycle

```
Your Stack Changes:
├─ New library added to package.json
├─ New environment variable
└─ New coding pattern

Update CLAUDE.md:
├─ Add library to tech stack
├─ Document new env var
└─ Add pattern to conventions

Claude Code:
└─ Automatically reads CLAUDE.md on every session
   └─ Always has latest context ✨
```

## 🎓 Key Concepts

### MCP = Model Context Protocol
- Standard protocol for connecting Claude to external tools
- Think of it as "plugins for Claude"
- Each MCP server provides specific capabilities

### Hooks = Automated Actions
- Triggered by specific events (edit, write, start)
- Run automatically in background
- Enhance your workflow without manual steps

### Context Files (CLAUDE.md)
- Auto-loaded by Claude Code
- Provides project-specific knowledge
- Updates persist across sessions

## 🛠️ Customization

### Add New MCP Server

Edit `.mcp.json`:
```json
{
  "mcpServers": {
    "my-custom-mcp": {
      "command": "npx",
      "args": ["-y", "@custom/mcp-server"]
    }
  }
}
```

### Add New Hook

Edit `.claude/settings.local.json`:
```json
{
  "hooks": {
    "PostToolUse": [
      {
        "matcher": "Write",
        "hooks": [
          {
            "type": "command",
            "command": "npm test {file_path}",
            "statusMessage": "Running tests"
          }
        ]
      }
    ]
  }
}
```

### Update Project Context

Edit `CLAUDE.md`:
```markdown
## New Coding Pattern

Always use React Server Components for data fetching.
```

Claude will automatically know this on next session!

---

## 📚 Learn More

- **MCP Protocol**: https://modelcontextprotocol.io
- **Claude Code**: https://github.com/anthropics/claude-code
- **StreamVault Docs**: See other MD files in this directory

---

**This architecture makes you 10x more productive!** 🚀
