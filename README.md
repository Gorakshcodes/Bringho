# Bingo Multiplayer Arena

Real-time multiplayer bingo built with **React + Vite + Firebase (Firestore + Anonymous Auth)**.
Supports **public rooms** (browsable in the live lobby) and **private rooms** (hidden, joined by code).

## Features

- Create **public** rooms (listed in the lobby) or **private** rooms (share the code).
- **Join by code** — enter a room's name to join any room, including private ones.
- Manual 5×5 board builder + one-click randomize.
- Turn-based number calling, real-time sync across all players.
- Live leaderboard, called-number history, and automatic BINGO win detection.

## Setup

1. **Install dependencies**
   ```bash
   npm install
   ```

2. **Create a Firebase project** at <https://console.firebase.google.com>, then:
   - Enable **Authentication → Sign-in method → Anonymous**.
   - Create a **Cloud Firestore** database.
   - Deploy the rules in [`firestore.rules`](firestore.rules) (or paste them in the console).

3. **Configure credentials**
   ```bash
   cp .env.example .env
   # then edit .env with your Firebase web app config
   ```

4. **Run it**
   ```bash
   npm run dev
   ```
   Open the printed URL. Open a second browser/incognito window to play against yourself.

## Deploy to Vercel (from GitHub)

Vercel hosts the **static frontend**. The realtime backend is still Firebase
(Firestore + Auth), so you still create a Firebase project and enable Anonymous
auth + Firestore — you just skip Firebase *Hosting*.

1. **Push to GitHub** (see commands below).
2. Go to <https://vercel.com/new> → **Import** your GitHub repo.
   Vercel auto-detects Vite (build `vite build`, output `dist` — already set in
   [`vercel.json`](vercel.json)).
3. In the Vercel import screen, add **Environment Variables** — the same keys as
   [`.env.example`](.env.example):
   `VITE_FIREBASE_API_KEY`, `VITE_FIREBASE_AUTH_DOMAIN`, `VITE_FIREBASE_PROJECT_ID`,
   `VITE_FIREBASE_STORAGE_BUCKET`, `VITE_FIREBASE_MESSAGING_SENDER_ID`,
   `VITE_FIREBASE_APP_ID`, `VITE_APP_ID`.
   > ⚠️ If these are missing, the deploy builds fine but runs in single-player
   > demo mode.
4. Click **Deploy**. You get a public URL like `https://your-app.vercel.app`.
5. In the **Firebase Console → Authentication → Settings → Authorized domains**,
   add your `*.vercel.app` domain so anonymous sign-in is allowed.

Every push to `main` auto-deploys.

## Deploy to Vercel (CLI)

Use this when the Vercel project is already linked locally:

```bash
npm run deploy:vercel
```

Before deploying, set the same `VITE_*` Firebase variables in Vercel project
settings or with `vercel env add`. Missing Firebase values intentionally fall
back to single-player demo mode.

## Deploy to Firebase Hosting (alternative)

> ⚠️ Deploy with **real credentials in `.env`**. If `VITE_FIREBASE_API_KEY` is
> empty the app builds fine but silently runs in single-player demo mode.

**One-time setup:**

```bash
# 1. Install the Firebase CLI (globally)
npm install -g firebase-tools

# 2. Log in to the Google account that owns the project
firebase login

# 3. Point this repo at your project (edit .firebaserc, or run):
firebase use --add        # pick your project, alias it "default"
```

Also make sure, in the Firebase Console:
- **Authentication → Sign-in method → Anonymous** is **enabled**.
- **Firestore Database** is created.

**Deploy:**

```bash
npm run deploy            # builds + deploys hosting AND firestore rules
# or individually:
npm run deploy:hosting    # just the site
npm run deploy:rules      # just firestore.rules
```

After it finishes, the CLI prints your live URL:
`https://YOUR_FIREBASE_PROJECT_ID.web.app`

Open that on two devices to play real multiplayer.

## How private rooms work

- When creating a room, pick **Private**. It sets `isPrivate: true` on the room document.
- The lobby query filters those out (`status === 'setup' && !isPrivate`).
- Anyone with the room's **name/code** can still join: type it into the room field in section 2 and hit **"Join by Code"**.

## Project layout

| File | Purpose |
| --- | --- |
| `App.jsx` | The whole game component (canvas-compatible; uses `__firebase_config` etc.). |
| `vite.config.js` | Injects the canvas globals from `VITE_*` env vars via `define`. |
| `src/main.jsx` | React entry point. |
| `firestore.rules` | Firestore security rules for the rooms collection. |
