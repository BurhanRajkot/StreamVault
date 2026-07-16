# ⚡ StreamVault + Claude Code - Quick Start

## 🚦 First Time Setup (5 minutes)

### 1. Add GitHub Token (Required for GitHub MCP)

```bash
# Get token from: https://github.com/settings/tokens/new
# Scopes: repo, read:org
echo "GITHUB_PERSONAL_ACCESS_TOKEN=ghp_your_token_here" >> .env.local
```

### 2. Install Prettier (Optional but Recommended)

```bash
npm install -D prettier
```

### 3. Install Serena Dependencies (Optional)

```bash
pip install uv
# or
pipx install uv
```

### 4. Restart Claude Code

```bash
exit
claude
```

---

## 🎯 What You Can Do Now

| Ask Claude... | What Happens |
|--------------|--------------|
| "What's new in React 19?" | Fetches latest React 19 docs |
| "What open issues do we have?" | Lists GitHub issues |
| "Open the homepage and take a screenshot" | Opens browser with Playwright |
| "Find all uses of useFavorites" | Searches codebase with Serena |
| "What Docker containers are running?" | Lists containers |
| "Search for Vite performance tips" | Web search with Brave |

---

## 🔧 What Happens Automatically

✅ **Prettier** formats your code after every edit
✅ **ESLint** fixes style issues automatically
✅ **TypeScript** checks for errors when Claude starts
✅ **MCP Servers** load context from latest docs

---

## 📋 MCP Servers Active

| Server | Status | Setup Required |
|--------|--------|----------------|
| context7 | ✅ Active | None |
| playwright | ✅ Active | None |
| docker | ✅ Active | None |
| filesystem | ✅ Active | None |
| github | ⚙️ Needs Setup | Add GITHUB_PERSONAL_ACCESS_TOKEN |
| serena | ⚙️ Optional | Install uv: `pip install uv` |
| brave-search | ⚙️ Optional | Get API key from brave.com/search/api |

---

## 🎓 Learn More

Read the full guide: **[CLAUDE_USAGE_GUIDE.md](./CLAUDE_USAGE_GUIDE.md)**

---

## 💬 Example Session

```
You: "Add a 'Watch Later' feature to StreamVault"

Claude:
1. ✨ Uses context7 to check latest React patterns
2. 🔍 Uses serena to find similar features (Favorites)
3. 💻 Writes the code
4. 🎨 Prettier auto-formats it
5. ✅ ESLint auto-fixes any issues
6. 🧪 Suggests test cases

You: "Create a PR for this"

Claude:
1. 📊 Uses github to read your changes
2. 📝 Creates PR with auto-generated description
3. 🔗 Gives you the PR link

Done! ✨
```

---

## 🆘 Troubleshooting

**MCP not connecting?**
- Check `.env.local` has required tokens
- Restart Claude Code: `exit` then `claude`

**Hooks not running?**
- Install Prettier: `npm install -D prettier`
- Check `.claude/settings.local.json` exists

**TypeScript check slow?**
- Normal on first run, faster afterwards
- Edit timeout in `.claude/settings.local.json` if needed

---

**You're ready to build! 🚀**
