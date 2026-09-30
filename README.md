# CMS – Medical Claims · Digital Go-Live Ribbon Cutting
Forte Insurance (Cambodia) Plc. · 01 October 2026 · via Microsoft Teams

Five representatives each press **SHIFT + V** on their own computer. The host screen (shared in Teams) counts them live. The ribbon cuts once, and only when the server has all five.

---

## What's in the folder

| File | Purpose |
|---|---|
| `index.html` | The one page. It opens as the host, a participant or the link sheet, depending on the URL |
| `config.js` | **You edit this file**: Firebase settings, participant names, logo, text |
| `database.rules.json` | Firebase security rules. They hold the **host key** and the participant IDs |
| `app.js`, `styles.css` | Ceremony logic and design |
| `backend.js` | Firebase SDK, bundled into the folder so no CDN is needed on the day |
| `firebase.json` | For deploying with Firebase Hosting (optional) |
| `assets/` | Put the official Forte logo here |

---

## Setup (about 15 minutes)

### Step 1: Create the Firebase database
1. Go to https://console.firebase.google.com and click **Create a project**, for example `forte-ribbon`. You can turn Analytics off.
2. In the left menu, open **Build › Realtime Database › Create database**.
   - Location: **Singapore (asia-southeast1)**, which is closest to Cambodia.
   - Start in **locked mode**.
3. Open the **Rules** tab, delete everything, paste the whole contents of `database.rules.json`, and click **Publish**.

### Step 2: Connect the app to it
1. Go to **Project settings** (gear icon) › **Your apps** › click the **</>** (Web) icon and register an app, for example `ribbon`. You don't need Firebase Hosting at this step.
2. Copy the values from the `firebaseConfig` it shows into `config.js › firebase`.
   **`databaseURL` must be included.** You can also copy it from the top of the Realtime Database page.

### Step 3: Change the host key (recommended)
The host key protects **Reset** and **Rehearsal**. Only someone with the host key can open, reset or switch the ceremony. It's currently `forte-z45v6zcq8m`.
To change it, edit the text `forte-z45v6zcq8m` in `database.rules.json`, re-publish the rules (Step 1.3), and use the new key in the host URL. Use letters, numbers and dashes only.

### Step 4: Names and logo
- **Names:** edit `config.js › participants › name`. Keep the `id` values as they are. If you change an `id`, change it in `database.rules.json` too (it appears in 3 places) and re-publish the rules.
- **System screenshot:** `assets/cms-system.jpg` is shown between the cut and the LIVE screen. Replace the file to use a different screenshot, or set `systemScreenshotUrl: ""` to skip this step.
- **Logo:** copy the official logo into `assets/` (for example `assets/forte-logo.png`, ideally 600 px wide or larger) and set `logoUrl: "assets/forte-logo.png"`. If `logoUrl` is left empty, the page shows a built-in red "Forte" box.

### Step 5: Deploy (choose one)
**A. Netlify Drop (easiest, no install)**
Go to https://app.netlify.com/drop and drag the whole folder onto the page. You get a URL like `https://forte-ribbon.netlify.app`.

**B. Firebase Hosting**
```
npm install -g firebase-tools
firebase login
firebase use --add            # pick your project
firebase deploy               # deploys hosting + database rules
```
You get a URL like `https://YOUR-PROJECT.web.app`.

**C. Vercel**
Run `npx vercel` in the folder, or import the folder at vercel.com. No build step is needed.

---

## The URLs
Replace `https://YOUR-SITE` with your deployed address. Opening `https://YOUR-SITE/?mode=links&key=YOUR-HOST-KEY` shows all six links with Copy buttons.

**Host screen** (keep private; this is the screen you share in Teams)
```
https://YOUR-SITE/?session=cms-medical-2026&mode=host&key=forte-z45v6zcq8m
```
**Participants** (send each person only their own link)
```
MENG VANNARY         https://YOUR-SITE/?session=cms-medical-2026&participant=vannary
CHENDA               https://YOUR-SITE/?session=cms-medical-2026&participant=chenda
CHANDANA             https://YOUR-SITE/?session=cms-medical-2026&participant=chandana
SUY CHANNTHARONG     https://YOUR-SITE/?session=cms-medical-2026&participant=channtharong
NIRORN               https://YOUR-SITE/?session=cms-medical-2026&participant=nirorn
SERGEI KOROL         https://YOUR-SITE/?session=cms-medical-2026&participant=sergei
MANOJ (KGISL)        https://YOUR-SITE/?session=cms-medical-2026&participant=kgisl
```
Only a host with the key can open a session. Someone who types a random `session=` value can't activate anything.

---

## Host controls
Move the mouse over the host screen to show a small bar in the bottom-right corner. It hides after 3 seconds, and so does the cursor.
- **Pages open 4/5 (waiting: KGISL)** shows who has their page open right now. A small dot on each card shows the same thing.
- **Rehearsal: ON/OFF** switches mode. Switching **always resets** the ceremony. In rehearsal mode, a gold **REHEARSAL** badge shows on the host and on every participant page.
- **Full screen** toggles full screen.
- **Reset ceremony** asks *"Reset the ribbon-cutting ceremony?"*. After you confirm, all five return to WAITING, the ribbon is restored, and everyone can press again.

The first time the host URL is opened, the ceremony starts in **Rehearsal mode**.

---

## Rehearsal checklist (do it today)
1. Open the host URL and share that browser window in Teams.
2. Each representative opens their own link in **Chrome or Edge** and **clicks once on the page**. The page only hears keys when it has focus, and it shows a reminder if it loses focus.
3. Check that the host shows **Pages open 5/5**.
4. Everyone presses **SHIFT + V**. Check the count goes 1…5, the countdown runs, the ribbon cuts, and the LIVE screen appears.
5. Click **Reset ceremony**. Repeat if needed.
6. **Before the real ceremony:** click **Rehearsal: ON**, then confirm **Go to live ceremony**. The badge disappears and everything is reset.

## Ceremony day (about 2 minutes)
| Time | What happens |
|---|---|
| T-10 min | Host screen open, full screen, shared in Teams. Mode is **LIVE**, not rehearsal. Pages open 5/5 |
| 0:00 | MC: *"May I invite our five representatives to place their fingers on Shift and V."* |
| 0:15 | MC: *"On my count, please press Shift + V."* |
| 0:20 | Presses arrive: 1/5 … 5/5 READY. Participants can press at slightly different times |
| +1 s | All inputs lock, then the countdown shows 3 · 2 · 1 · CUT! |
| +5 s | The scissors close, the ribbon splits, and sparks and confetti play |
| +6 s | The CMS system screenshot rises out of the cut ribbon in a browser frame (LIVE badge, light sweep) |
| +12 s | It dissolves into **CMS – MEDICAL CLAIMS IS NOW LIVE** (hold it while the MC closes) |

### If something goes wrong
- **A participant's key press doesn't register:** they should click on their page and press SHIFT + V again. SHIFT alone, V alone, or Ctrl/Alt + SHIFT + V are ignored on purpose.
- **A participant's computer or internet fails:** anyone can open that person's link on another computer, for example the host's laptop, and press SHIFT + V for them. It still counts only once.
- **The host screen was refreshed or closed:** open it again. It restores the live count, or the LIVE screen if the ribbon was already cut. The animation never plays twice.
- **The network drops for a moment:** presses are queued and delivered on reconnect. The page shows *Reconnecting…* and then *SENDING…* until the server confirms.
- **A corporate network blocks Google Fonts:** the design falls back to Segoe UI. Firebase needs `*.firebaseio.com` / `*.firebasedatabase.app` over WebSockets. Test on the real office network today.

---

## How it stays correct (for IT)
- `control/{run}`: each reset creates a new run ID, so old presses never count again. Writing to it requires the host key, which the database never lets anyone read.
- `activations/{run}/{participant}`: **create-once** at the server. A second press, a second tab or a refresh can't add a count. It's only accepted for the 5 known IDs and the current run, and never after the cut.
- `cut/{run}`: **create-once**. It's accepted only when all 5 activations exist for that run. Whichever client writes it first wins, and every host screen schedules the countdown from that single server timestamp. The ceremony therefore triggers exactly once, 4/5 can never cut, and a refreshed host picks up at the right moment.
- Keyboard: activation needs Shift and V **held together**, pressed in either order, with no Ctrl, Alt or Windows key. Auto-repeat is ignored.
- Tested with 6 separate browser clients, including Shift alone, V alone, Ctrl or Alt combinations, Caps Lock with V, duplicate presses, simultaneous presses, V pressed before Shift, host and participant refresh, a forced network drop, random 0–300 ms network delay, reset, the rehearsal toggle, and attempts without the key.
