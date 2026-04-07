# HUTCHDASH — Setup Guide

A personal morning dashboard hosted on **GitHub Pages**, styled as a
*Wes Anderson × Retro Gaming* briefing. Pulls data from **Notion**, with
optional **Outlook** and **Apple Calendar** integration.

---

## Project Structure

```
hutchdash/
├── docs/                        ← GitHub Pages site root
│   ├── index.html
│   ├── style.css
│   ├── script.js
│   └── data/
│       └── data.json            ← Auto-generated daily by GitHub Action
├── generate_data.py             ← Pulls Notion + calendar → data.json
├── morning-dashboard/           ← Original CLI scripts (kept for reference)
│   ├── dashboard.py
│   ├── agent.py
│   ├── add_monday.py
│   └── test_connection.py
└── .github/
    └── workflows/
        └── daily-refresh.yml    ← Runs generate_data.py every morning
```

---

## 1 — Create a GitHub Repository

```bash
# From the hutchdash/ folder
git init
git add .
git commit -m "feat: initial HUTCHDASH setup"
git remote add origin https://github.com/YOUR_USERNAME/hutchdash.git
git push -u origin main
```

---

## 2 — Enable GitHub Pages

1. Go to your repo → **Settings** → **Pages**
2. Source: **Deploy from a branch**
3. Branch: `main` / folder: `/docs`
4. Save — your dashboard URL will be:
   `https://YOUR_USERNAME.github.io/hutchdash/`

---

## 3 — Add GitHub Secrets

Go to **Settings → Secrets and variables → Actions → New repository secret**
and add each of these:

### Notion (required)
| Secret name    | Where to find it |
|----------------|-----------------|
| `NOTION_TOKEN` | Notion → Settings → Integrations → your integration token |
| `TODOS_DB`     | Notion DB URL: `notion.so/.../{THIS_ID}?v=...` |
| `WORKOUT_DB`   | Same pattern for your Workout DB |
| `MACROS_DB`    | Same pattern for your Macros DB |

### Macro Goals (optional — defaults shown)
| Secret name       | Default |
|-------------------|---------|
| `GOAL_CALORIES`   | `2000`  |
| `GOAL_PROTEIN`    | `150`   |
| `GOAL_CARBS`      | `200`   |
| `GOAL_FAT`        | `65`    |

---

## 4 — Calendar Integration (Optional)

### Outlook / Microsoft 365

1. Go to [Azure Portal](https://portal.azure.com) → **App registrations → New registration**
2. Name it `hutchdash`, select single tenant or personal accounts
3. Add **API permissions**: `Calendars.Read` (Microsoft Graph, Delegated)
4. Create a **Client secret** under Certificates & Secrets
5. Add these secrets to GitHub:

| Secret name             | Value |
|-------------------------|-------|
| `OUTLOOK_CLIENT_ID`     | Application (client) ID |
| `OUTLOOK_CLIENT_SECRET` | The secret value |
| `OUTLOOK_TENANT_ID`     | `consumers` (personal) or your tenant ID |

> **Note:** For personal Microsoft accounts, you'll need to use delegated (user) auth.
> The current implementation uses app-only auth which works best for work/school accounts.
> For a personal account workaround, see the Microsoft Graph documentation on
> [OAuth device flow](https://learn.microsoft.com/en-us/azure/active-directory/develop/v2-oauth2-device-authorization-grant).

### Apple Calendar (iCloud CalDAV)

1. Go to [appleid.apple.com](https://appleid.apple.com) → **Sign-In and Security → App-Specific Passwords**
2. Generate a password for "hutchdash"
3. Add these secrets:

| Secret name        | Value |
|--------------------|-------|
| `APPLE_CALDAV_URL` | `https://caldav.icloud.com` |
| `APPLE_USERNAME`   | Your Apple ID email |
| `APPLE_PASSWORD`   | The app-specific password |

---

## 5 — Run Locally

```bash
# From the hutchdash/ root
pip install notion-client python-dotenv

# Create a .env file (never commit this!)
cp morning-dashboard/.env .env  # if you already have one

# Generate data once
python generate_data.py

# Preview the site locally (Python simple server)
cd docs
python -m http.server 8080
# Open http://localhost:8080
```

---

## 6 — Notion Database Requirements

### Todos DB
| Property    | Type     | Notes |
|-------------|----------|-------|
| Name        | Title    | |
| Status      | Checkbox | `false` = not done |
| Priority    | Select   | `High`, `Medium`, `Low` |
| Due Date    | Date     | |

### Workout DB
| Property      | Type   | Notes |
|---------------|--------|-------|
| Name          | Title  | Exercise name |
| Day           | Select | `Mon`, `Tue`, `Wed`, `Thu`, `Fri`, `Sat`, `Sun` |
| Sets          | Number | |
| Reps          | Number | |
| Exercise Type | Select | e.g. `Strength`, `Cardio` |
| Notes         | Text   | Optional cues |

### Macros DB
| Property  | Type   | Notes |
|-----------|--------|-------|
| Name      | Title  | Food name |
| Date      | Date   | Log date |
| Calories  | Number | kcal |
| Protein   | Number | grams |
| Carbs     | Number | grams |
| Fat       | Number | grams |

---

## 7 — Customising the Schedule

Edit `.github/workflows/daily-refresh.yml`:

```yaml
schedule:
  - cron: '0 11 * * *'   # 11:00 UTC = 6:00 AM EST / 7:00 AM EDT
```

Use [crontab.guru](https://crontab.guru) to adjust the time.

---

## 8 — Add More Days to the Workout

Use the existing `morning-dashboard/add_monday.py` as a template —
duplicate it for each day and run it to seed the Notion DB.

---

## Tech Stack

- **Frontend**: Vanilla HTML / CSS / JS (zero dependencies)
- **Fonts**: Press Start 2P, Libre Baskerville, Courier Prime (Google Fonts)
- **Data**: Notion API → `data.json`
- **Calendar**: Microsoft Graph (Outlook), CalDAV (Apple)
- **Hosting**: GitHub Pages (free, public URL)
- **Automation**: GitHub Actions (free tier — 2,000 min/month)
