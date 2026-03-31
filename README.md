# 🏎 F1 Fantasy League 2026 — Deployment Guide

## What's in this package

```
fantasy-f1/
├── src/
│   ├── main.jsx              # React entry point
│   └── App.jsx               # Main app (all tabs + scoring logic)
├── netlify/
│   └── functions/
│       └── anthropic.js      # Secure API proxy (keeps your key hidden)
├── public/
│   └── favicon.svg           # F1 red icon
├── index.html                # HTML shell
├── vite.config.js            # Build config
├── netlify.toml              # Netlify deployment config
├── package.json              # Dependencies
└── README.md                 # This file
```

---

## Step 1 — Get an Anthropic API Key

The app uses Claude AI to fetch live F1 data via web search.

1. Go to **https://console.anthropic.com**
2. Sign up or log in
3. Go to **API Keys** → **Create Key**
4. Copy the key (starts with `sk-ant-...`) — you'll need it in Step 4

> **Cost:** Each data refresh makes ~3 API calls. At current pricing this is a fraction of a cent per refresh.

---

## Step 2 — Install Node.js (if you don't have it)

1. Go to **https://nodejs.org**
2. Download and install the **LTS** version
3. Verify: open Terminal/Command Prompt and run `node --version`

---

## Step 3 — Install dependencies & test locally

Open Terminal, navigate to this folder, then run:

```bash
npm install
npm run dev
```

Open **http://localhost:5173** in your browser.

> ⚠️ Live data won't work locally until you add your API key. The Setup tab will work fine — you can add participants and test the layout.

To test the API locally, create a file called `.env` in the project root:
```
ANTHROPIC_API_KEY=sk-ant-your-key-here
```
Then install the Netlify CLI and run `netlify dev` instead of `npm run dev`.

---

## Step 4 — Deploy to Netlify

### 4a. Create a Netlify account
Go to **https://netlify.com** and sign up (free).

### 4b. Build the project

In your terminal (in the project folder):
```bash
npm run build
```
This creates a `dist/` folder — that's your website.

### 4c. Deploy via drag and drop

1. Go to **https://app.netlify.com**
2. Click **"Add new site"** → **"Deploy manually"**
3. Drag your entire **`dist/`** folder onto the page
4. Netlify will give you a URL like `https://random-name-123.netlify.app`

> **Important:** For the Netlify Function (API proxy) to work, you must connect via Git instead of drag-and-drop. See 4d below.

### 4d. Connect via GitHub (recommended — enables the API proxy)

1. Push this project to a GitHub repository:
   ```bash
   git init
   git add .
   git commit -m "Initial commit"
   # Create a repo on github.com, then:
   git remote add origin https://github.com/YOUR_USERNAME/fantasy-f1.git
   git push -u origin main
   ```
2. In Netlify: **Add new site** → **Import from Git** → connect GitHub
3. Select your repo
4. Build settings are auto-detected from `netlify.toml`
5. Click **Deploy site**

### 4e. Add your API key to Netlify

1. In your Netlify site dashboard, go to **Site configuration** → **Environment variables**
2. Click **Add a variable**
3. Key: `ANTHROPIC_API_KEY`
4. Value: `sk-ant-your-key-here`
5. Click **Save** then **Trigger deploy** to redeploy with the key active

---

## Step 5 — Get a custom domain

### Option A: Buy via Netlify (easiest)
1. In your Netlify site dashboard, go to **Domain management**
2. Click **Add a domain** → search for a domain name
3. Purchase directly through Netlify (~£10–15/year for a `.com`)
4. It connects automatically — no extra steps

### Option B: Buy elsewhere (Namecheap, GoDaddy, etc.)
1. Buy your domain from any registrar
2. In Netlify: **Domain management** → **Add a domain** → enter your domain
3. Netlify will give you nameservers to add at your registrar
4. Update your domain's nameservers, wait up to 24 hours to propagate

### Free HTTPS
Netlify automatically provisions a free SSL certificate — your site will be `https://` straight away.

---

## Updating the site

Once connected to GitHub, any time you push a change:
```bash
git add .
git commit -m "Update participant list"
git push
```
Netlify auto-deploys within ~30 seconds.

---

## How the app works

- **Setup tab** — Add participants and their 6 driver picks
- **League tab** — Ranked table, updated from live F1 standings
- **Races tab** — All completed 2026 race results with grid/finish positions
- **Standings tab** — Driver and Constructor championships side by side
- **↻ Refresh** — Fetches latest data from the web on demand

Fantasy scoring: each participant's points = sum of their picked drivers' real F1 championship points.

---

## Troubleshooting

| Problem | Fix |
|---|---|
| "Data fetch failed" error | Check `ANTHROPIC_API_KEY` is set in Netlify env vars and site has been redeployed |
| Blank page after deploy | Make sure you deployed from the `dist/` folder, not the project root |
| API works locally but not on Netlify | Ensure you deployed via Git (not drag-and-drop) so the `netlify/functions/` folder is included |
| Domain not working | DNS propagation can take up to 24 hours — try again later |
