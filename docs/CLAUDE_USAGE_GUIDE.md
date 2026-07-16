# 🚀 Claude Code Usage Guide for StreamVault

This is your complete guide to using Claude Code with StreamVault. Everything has been configured to make your development workflow incredibly powerful.

---

## 📋 Table of Contents

1. [Quick Start](#quick-start)
2. [What's Installed](#whats-installed)
3. [Setup Instructions](#setup-instructions)
4. [How to Use MCP Servers](#how-to-use-mcp-servers)
5. [How to Use Hooks](#how-to-use-hooks)
6. [Real-World Examples](#real-world-examples)
7. [Troubleshooting](#troubleshooting)
8. [Advanced Tips](#advanced-tips)

---

## 🎯 Quick Start

### 1. Restart Claude Code

```bash
# Exit current session
exit

# Start new session in your project
cd /home/burhan/Desktop/movie/StreamVault
claude
```

### 2. Verify MCPs Are Loaded

When Claude Code starts, you'll see messages about MCP servers connecting. You should see:
- ✅ context7
- ✅ github (if token is set)
- ✅ playwright
- ✅ serena (if uv is installed)
- ✅ docker
- ✅ brave-search (if API key is set)
- ✅ filesystem

### 3. Test It Out

Try asking Claude:
```
"What's new in React 19?"
```

Claude will use **context7** to fetch the latest React 19 documentation in real-time!

---

## 🛠 What's Installed

### MCP Servers (Brain Extensions)

| MCP Server | What It Does | Status |
|------------|--------------|--------|
| **context7** | Latest docs for React, Vite, Tailwind, Supabase, Auth0 | ✅ Ready |
| **github** | Read/create PRs, issues, commits | ⚙️ Needs token |
| **playwright** | Browser automation, screenshots, E2E debugging | ✅ Ready |
| **serena** | Advanced code navigation & refactoring | ⚙️ Needs uv |
| **docker** | Manage containers, images, networks, volumes | ✅ Ready |
| **brave-search** | Web search for coding questions | ⚙️ Optional |
| **filesystem** | Enhanced file access | ✅ Ready |

### Hooks (Auto-Actions)

| Hook | When It Runs | What It Does |
|------|--------------|--------------|
| **Prettier** | After Edit/Write | Auto-formats your code |
| **ESLint** | After Edit/Write | Auto-fixes code style issues |
| **TypeScript** | Session Start | Checks for type errors |

---

## ⚙️ Setup Instructions

### Required: GitHub MCP (5 minutes)

This lets Claude read your PRs and issues directly.

1. **Create a GitHub Personal Access Token**
   ```bash
   # Go to: https://github.com/settings/tokens/new
   # Name it: "Claude Code StreamVault"
   # Scopes needed:
   #   ✅ repo (all)
   #   ✅ read:org
   # Click "Generate token"
   # Copy the token (starts with ghp_...)
   ```

2. **Add Token to .env.local**
   ```bash
   cd /home/burhan/Desktop/movie/StreamVault
   echo "GITHUB_PERSONAL_ACCESS_TOKEN=ghp_your_token_here" >> .env.local
   ```

3. **Restart Claude Code**
   ```bash
   exit
   claude
   ```

4. **Test It**
   ```
   Ask Claude: "What open issues do we have?"
   ```

### Optional: Serena MCP (2 minutes)

This gives Claude super-powered code navigation.

```bash
# Install uv (Python package manager)
pip install uv

# Or with pipx (recommended)
pipx install uv

# Restart Claude Code
exit
claude
```

**Test it:**
```
Ask Claude: "Find all references to the useFavorites hook"
```

### Optional: Brave Search API (3 minutes)

This lets Claude search the web for coding answers.

1. **Get API Key**
   ```bash
   # Go to: https://brave.com/search/api/
   # Sign up (has free tier: 2000 searches/month)
   # Copy your API key
   ```

2. **Add to .env.local**
   ```bash
   echo "BRAVE_API_KEY=your_brave_api_key_here" >> .env.local
   ```

3. **Restart Claude Code**

**Test it:**
```
Ask Claude: "Search the web for the latest Vite 6 performance tips"
```

### Optional: Install Prettier (1 minute)

```bash
npm install -D prettier
```

---

## 🧠 How to Use MCP Servers

MCP servers are **automatic** - you don't need to do anything special. Just ask Claude questions and it will use the right tools.

### Context7 - Latest Documentation

**Before MCP:**
```
You: "How do I use Supabase auth with React?"
Claude: [Uses outdated training data from 2023]
```

**After MCP:**
```
You: "How do I use Supabase auth with React?"
Claude: [Fetches latest Supabase docs from 2026] ✨
```

**Example Questions:**
- "What's new in React 19?"
- "How do I use Tailwind CSS container queries?"
- "Show me the latest Supabase real-time API"
- "What are the new features in Vite 6?"
- "How do I use Auth0 with React Router v7?"

### GitHub MCP - PR & Issue Management

**What You Can Do:**
- Read open issues
- Create new issues
- Read PR descriptions
- Create pull requests
- View commit history
- Check CI/CD status

**Example Commands:**
```
You: "What open issues do we have?"
Claude: [Lists all open issues with descriptions]

You: "Create an issue for adding Netflix OTT provider"
Claude: [Creates issue on GitHub]

You: "What's the latest commit on main branch?"
Claude: [Shows commit details]

You: "Create a PR for this feature branch"
Claude: [Creates PR with auto-generated description]
```

### Playwright MCP - Browser Automation

**What You Can Do:**
- Open your app in a browser
- Take screenshots
- Click buttons and interact
- Debug E2E tests visually
- Generate new test selectors

**Example Commands:**
```
You: "Open the homepage in Playwright and take a screenshot"
Claude: [Opens browser, navigates, takes screenshot]

You: "Click the login button and show me what happens"
Claude: [Interacts with UI and shows result]

You: "Debug why the favorites button isn't working"
Claude: [Opens browser, clicks button, inspects elements]

You: "Generate a selector for the search input"
Claude: [Inspects page and provides selector]
```

### Serena MCP - Code Navigation

**What You Can Do:**
- Find all references to a function
- Search for symbol definitions
- Navigate complex codebases
- Refactor with confidence

**Example Commands:**
```
You: "Find all files that use the useFavorites hook"
Claude: [Uses Serena to search codebase]

You: "Where is the MediaCard component defined?"
Claude: [Finds exact location]

You: "Show me all API routes in the backend"
Claude: [Lists all routes with context]
```

### Docker MCP - Container Management

**What You Can Do:**
- List running containers
- View container logs
- Start/stop containers
- Inspect images
- Manage networks

**Example Commands:**
```
You: "What Docker containers are running?"
Claude: [Lists all running containers]

You: "Show me logs from the backend container"
Claude: [Displays logs]

You: "Restart the database container"
Claude: [Restarts container]

You: "Build and start the Docker Compose services"
Claude: [Runs docker-compose up]
```

### Brave Search MCP - Web Search

**What You Can Do:**
- Search for coding solutions
- Find library comparisons
- Get latest framework updates
- Research best practices

**Example Commands:**
```
You: "Search for React 19 performance optimization techniques"
Claude: [Searches web and summarizes findings]

You: "Find the best way to implement infinite scroll in React"
Claude: [Searches and provides recommendations]

You: "What's the latest on Vite bundling optimizations?"
Claude: [Searches and provides updates]
```

---

## 🎣 How to Use Hooks

Hooks run **automatically** - you don't trigger them manually.

### Prettier Hook (Auto-Format)

**How It Works:**
1. Claude edits/writes a file
2. Prettier automatically formats it
3. The file is saved with perfect formatting

**Example:**
```
You: "Add a new function to handle movie search"
Claude: [Writes function]
Hook: [Auto-formats with Prettier]
Result: Perfectly formatted code ✨
```

### ESLint Hook (Auto-Fix)

**How It Works:**
1. Claude edits/writes a file
2. ESLint automatically fixes style issues
3. Warnings and errors are auto-corrected

**Example:**
```
You: "Update the search component"
Claude: [Makes changes]
Hook: [Auto-fixes ESLint issues]
Result: No ESLint errors ✨
```

### TypeScript Check (Session Start)

**How It Works:**
1. You start Claude Code
2. TypeScript check runs automatically
3. Claude sees any type errors

**Example:**
```
$ claude

[Running TypeScript check...]
✓ No type errors found!

Claude: Ready to help! I've verified there are no TypeScript errors.
```

If there ARE errors:
```
[Running TypeScript check...]
Found 3 errors in src/components/MediaCard.tsx

Claude: I noticed 3 TypeScript errors in MediaCard.tsx. Should I fix them?
```

---

## 💡 Real-World Examples

### Example 1: Adding a New Feature

```
You: "Add a 'Recently Viewed' section to the homepage"

Claude uses:
1. context7 → Checks latest React patterns
2. serena → Finds similar components (ContinueWatching)
3. ESLint + Prettier hooks → Auto-formats new code
4. TypeScript check → Verifies no type errors

Result: Feature implemented with best practices ✨
```

### Example 2: Debugging a Production Issue

```
You: "Users report the favorites button doesn't work on mobile"

Claude uses:
1. playwright → Opens mobile viewport
2. Clicks favorites button
3. Takes screenshot showing the issue
4. serena → Finds all related code
5. context7 → Checks Radix UI button docs

Result: Bug identified and fixed ✨
```

### Example 3: Creating a Pull Request

```
You: "Create a PR for the new search feature"

Claude uses:
1. github → Reads current branch changes
2. github → Checks existing PRs for naming patterns
3. github → Creates PR with detailed description
4. Shows you the PR URL

Result: Professional PR created instantly ✨
```

### Example 4: Docker Troubleshooting

```
You: "Backend container keeps crashing"

Claude uses:
1. docker → Lists running containers
2. docker → Views backend logs
3. docker → Inspects container config
4. Identifies: Missing environment variable

Result: Issue found and documented ✨
```

### Example 5: Researching New Libraries

```
You: "Should we use React Virtual or TanStack Virtual for infinite scroll?"

Claude uses:
1. brave-search → Searches for comparisons
2. context7 → Checks TanStack Virtual docs
3. Provides recommendation with examples

Result: Informed decision with code samples ✨
```

---

## 🐛 Troubleshooting

### MCP Server Not Connecting

**Problem:** "github MCP failed to connect"

**Solutions:**
1. Check your `.env.local` file has the token:
   ```bash
   cat .env.local | grep GITHUB
   ```
2. Verify the token is valid on GitHub
3. Restart Claude Code

**Problem:** "serena MCP failed to connect"

**Solution:**
```bash
# Install uv
pip install uv

# Restart Claude
exit
claude
```

### Hooks Not Running

**Problem:** ESLint hook doesn't run

**Solution:**
1. Check ESLint is installed:
   ```bash
   npm list eslint
   ```
2. Test manually:
   ```bash
   npx eslint --fix src/components/Example.tsx
   ```

**Problem:** Prettier hook doesn't run

**Solution:**
```bash
# Install Prettier
npm install -D prettier

# Restart Claude
exit
claude
```

### TypeScript Check Slow

**Problem:** TypeScript check takes too long at startup

**Solution:**
Edit `.claude/settings.local.json` and increase timeout:
```json
{
  "type": "command",
  "command": "cd /home/burhan/Desktop/movie/StreamVault && npx tsc --noEmit 2>&1 | head -20 || true",
  "statusMessage": "Running TypeScript check",
  "timeout": 30  // Increase from 10 to 30 seconds
}
```

---

## 🚀 Advanced Tips

### Tip 1: Disable Specific Hooks Temporarily

If hooks are slowing you down during rapid prototyping:

Edit `.claude/settings.local.json`:
```json
{
  "disableAllHooks": true
}
```

Re-enable when done:
```json
{
  "disableAllHooks": false
}
```

### Tip 2: Use Multiple MCPs Together

**Powerful Combo:**
```
You: "Search for the latest React 19 concurrent rendering patterns,
     then update our MediaGrid component to use them"

Claude:
1. brave-search → Finds latest patterns
2. context7 → Checks React 19 docs
3. serena → Finds MediaGrid.tsx
4. Updates component with new patterns
5. Hooks → Auto-format and lint
```

### Tip 3: Project-Specific Commands

Add custom commands to CLAUDE.md that Claude will remember:

```markdown
## Custom Commands

- `npm run e2e:watch` - Run E2E tests in watch mode
- `npm run db:migrate` - Run database migrations
- `npm run storybook` - Start Storybook
```

### Tip 4: Use Docker MCP for Full-Stack Development

```
You: "Start all services in Docker and show me the logs"

Claude:
1. Runs docker-compose up
2. Shows logs from all containers
3. Verifies everything is healthy
```

### Tip 5: Chain MCP Actions

```
You: "Search for the best way to implement SSR in Vite,
     then create an issue to implement it,
     then add it to CLAUDE.md as a future task"

Claude:
1. brave-search → Researches SSR in Vite
2. github → Creates issue with details
3. Edits CLAUDE.md with task
```

---

## 📚 Quick Reference Card

### Essential Commands

```bash
# Start Claude Code
claude

# Exit Claude Code
exit

# Check MCP status
# Just ask: "What MCP servers are active?"

# Disable hooks temporarily
# Edit .claude/settings.local.json: "disableAllHooks": true
```

### Essential Questions to Ask Claude

```
"What's new in [technology]?"           → Uses context7
"What open issues do we have?"          → Uses github
"Show me a screenshot of [page]"        → Uses playwright
"Find all uses of [function]"           → Uses serena
"What containers are running?"          → Uses docker
"Search for [coding topic]"             → Uses brave-search
"Create a PR for this feature"          → Uses github
"Debug why [feature] isn't working"     → Uses playwright
```

---

## 🎓 Learning Resources

### Learn More About MCPs

- **Official Docs:** https://modelcontextprotocol.io
- **GitHub:** https://github.com/anthropics/claude-code

### Your Project Files

- `.mcp.json` - MCP server configuration
- `.claude/settings.local.json` - Hooks and permissions
- `CLAUDE.md` - Project conventions (auto-loaded)

---

## 🆘 Need Help?

### Ask Claude!

Claude knows about all of these tools. Just ask:
```
"How do I use the github MCP to create an issue?"
"Show me what the playwright MCP can do"
"Why isn't the serena MCP working?"
```

### File an Issue

If something's broken:
```
You: "Create a GitHub issue about [problem]"
Claude: [Uses github MCP to create issue]
```

---

## 🎉 You're Ready!

You now have a **supercharged development environment**. Claude Code can:

✅ Fetch latest documentation
✅ Manage your GitHub PRs and issues
✅ Open browsers and debug visually
✅ Navigate your codebase like a pro
✅ Manage Docker containers
✅ Search the web for solutions
✅ Auto-format and lint your code
✅ Check TypeScript on every session

**Start building and let Claude handle the tedious stuff!** 🚀

---

## 📝 Changelog

- **2026-07-16**: Initial setup with 7 MCP servers + 3 hooks
- **Next**: Add custom MCP servers as needed

---

**Happy Coding! 🎬✨**
