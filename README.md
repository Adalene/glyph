# GLYPH — Open Icon Library 

https://glyph-one.vercel.app/

A curated library of 80+ crisp SVG icons with an AI generator powered by Claude.  
Visitors can browse, copy, and generate new icons — **no sign-up, no API key needed on their end.**

---

## 🚀 Deploy in 3 steps (Vercel)

### 1. Fork & clone this repo

```bash
git clone https://github.com/YOUR_USERNAME/glyph.git
cd glyph
```

### 2. Deploy to Vercel

```bash
npm i -g vercel   # install Vercel CLI if you don't have it
vercel            # follow the prompts — select "Other" for framework
```

Or connect the repo at [vercel.com](https://vercel.com) → **New Project** → Import Git Repository.

### 3. Add your API key as an environment variable

In the Vercel dashboard:
```
Project → Settings → Environment Variables
```

Add one variable:

| Name | Value |
|------|-------|
| `ANTHROPIC_API_KEY` | `sk-ant-...your key here...` |

**That's it.** Redeploy and the AI generator is live for everyone.

> 🔒 Your key never touches the HTML, the repo, or any user's browser.  
> It lives only in Vercel's encrypted environment.

---

## 🗂 Project structure

```
glyph/
├── public/
│   └── index.html        ← The icon library (safe to publish)
├── api/
│   └── generate.js       ← Serverless proxy (holds no secrets)
├── vercel.json           ← Routing config
├── .gitignore            ← Keeps .env files out of git
└── README.md
```

---

## 🔑 How the security works

```
Browser  ──POST /api/generate──▶  Vercel Function  ──▶  Anthropic API
            { name, category }       (reads env var)       sk-ant-...
                                     never exposed
```

- The HTML calls **your own `/api/generate` endpoint** — not Anthropic directly
- The function reads `process.env.ANTHROPIC_API_KEY` at runtime
- The key is **never in source code**, never in `git log`, never in the browser

---

## 🛠 Local development

```bash
# Install Vercel CLI
npm i -g vercel

# Create a local env file (this is gitignored!)
echo "ANTHROPIC_API_KEY=sk-ant-your-key-here" > .env

# Run locally
vercel dev
```

Open `http://localhost:3000`

---

## 📦 Icons

80 hand-crafted SVG icons across 8 categories:
**UI · Media · Files · Arrows · Comms · Data · Weather · Objects**

All icons: `stroke-only`, `viewBox="0 0 24 24"`, MIT licensed.

AI-generated icons are shared across all visitors via `window.storage`.

---

## License

MIT — free for personal and commercial use.
