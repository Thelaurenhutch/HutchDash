"""
generate_data.py
Pulls data from Notion (and optionally Outlook / Apple Calendar)
and writes docs/data/data.json for the HUTCHDASH GitHub Pages site.

Run manually:  python generate_data.py
Runs nightly:  via .github/workflows/daily-refresh.yml
"""

import json
import os
from datetime import date, datetime
from pathlib import Path

from notion_client import Client
from dotenv import load_dotenv

# ── Optional calendar imports (skip gracefully if not configured) ──
try:
    import msal                          # pip install msal
    MSAL_AVAILABLE = True
except ImportError:
    MSAL_AVAILABLE = False

try:
    import caldav                        # pip install caldav
    CALDAV_AVAILABLE = True
except ImportError:
    CALDAV_AVAILABLE = False

# ─────────────────────────────────────────
load_dotenv()

notion = Client(auth=os.getenv("NOTION_TOKEN"))
TODAY  = date.today()
TODAY_ISO   = TODAY.isoformat()
TODAY_NAME  = TODAY.strftime("%A, %B %-d, %Y") if os.name != 'nt' else TODAY.strftime("%A, %B %d, %Y").lstrip("0")
DAY_SHORT   = TODAY.strftime("%a")   # Mon, Tue, …

OUT_PATH = Path(__file__).parent / "docs" / "data" / "data.json"

# ══════════════════════════════════════════
#  NOTION — TODOS
# ══════════════════════════════════════════
def get_todos() -> list:
    try:
        results = notion.databases.query(
            database_id=os.getenv("TODOS_DB"),
            filter={
                "and": [
                    {"property": "Status", "checkbox": {"equals": False}},
                ]
            }
        ).get("results", [])
    except Exception as e:
        print(f"[WARN] Could not fetch todos: {e}")
        return []

    todos = []
    for item in results:
        props = item["properties"]
        name     = (props.get("Name", {}).get("title") or [{}])[0].get("text", {}).get("content", "Untitled")
        priority = (props.get("Priority", {}).get("select") or {}).get("name", "None")
        due_raw  = (props.get("Due Date", {}).get("date") or {}).get("start")
        todos.append({
            "id":       item["id"],
            "name":     name,
            "priority": priority,
            "due":      due_raw,
            "done":     False,
        })

    # Sort: High → Medium → Low → None
    order = {"High": 0, "Medium": 1, "Low": 2, "None": 3}
    todos.sort(key=lambda t: order.get(t["priority"], 99))
    return todos


# ══════════════════════════════════════════
#  NOTION — WORKOUT
# ══════════════════════════════════════════
WORKOUT_LABELS = {
    "Mon": "UPPER BODY",
    "Tue": "LOWER BODY",
    "Wed": "CARDIO",
    "Thu": "UPPER BODY",
    "Fri": "FULL BODY",
    "Sat": "ACTIVE RECOVERY",
    "Sun": "REST",
}

def get_workout() -> dict | None:
    try:
        results = notion.databases.query(
            database_id=os.getenv("WORKOUT_DB"),
            filter={
                "property": "Day",
                "select": {"equals": DAY_SHORT}
            }
        ).get("results", [])
    except Exception as e:
        print(f"[WARN] Could not fetch workout: {e}")
        return None

    if not results:
        return None

    exercises = []
    for item in results:
        props = item["properties"]
        name  = (props.get("Name", {}).get("title") or [{}])[0].get("text", {}).get("content", "Untitled")
        sets  = (props.get("Sets",  {}).get("number") or 0)
        reps  = (props.get("Reps",  {}).get("number") or 0)
        notes = ((props.get("Notes", {}).get("rich_text") or [{}])[0].get("text", {}).get("content", ""))
        exercises.append({"name": name, "sets": sets, "reps": reps, "notes": notes})

    return {
        "day":       DAY_SHORT,
        "label":     WORKOUT_LABELS.get(DAY_SHORT, DAY_SHORT.upper()),
        "exercises": exercises,
    }


# ══════════════════════════════════════════
#  NOTION — MACROS
# ══════════════════════════════════════════
MACRO_GOALS = {
    "goal_calories": int(os.getenv("GOAL_CALORIES", 2000)),
    "goal_protein":  int(os.getenv("GOAL_PROTEIN",  150)),
    "goal_carbs":    int(os.getenv("GOAL_CARBS",    200)),
    "goal_fat":      int(os.getenv("GOAL_FAT",      65)),
}

def get_macros() -> dict:
    try:
        results = notion.databases.query(
            database_id=os.getenv("MACROS_DB"),
            filter={
                "property": "Date",
                "date": {"equals": TODAY_ISO}
            }
        ).get("results", [])
    except Exception as e:
        print(f"[WARN] Could not fetch macros: {e}")
        results = []

    cal = pro = carb = fat = 0
    for item in results:
        props = item["properties"]
        cal  += props.get("Calories", {}).get("number") or 0
        pro  += props.get("Protein",  {}).get("number") or 0
        carb += props.get("Carbs",    {}).get("number") or 0
        fat  += props.get("Fat",      {}).get("number") or 0

    return {
        **MACRO_GOALS,
        "logged_calories": cal,
        "logged_protein":  pro,
        "logged_carbs":    carb,
        "logged_fat":      fat,
    }


# ══════════════════════════════════════════
#  OUTLOOK CALENDAR (Microsoft Graph)
#  Requires: pip install msal requests
#  Set env vars: OUTLOOK_CLIENT_ID, OUTLOOK_CLIENT_SECRET,
#               OUTLOOK_TENANT_ID (for work) or use "consumers"
# ══════════════════════════════════════════
def get_outlook_events() -> list:
    if not MSAL_AVAILABLE:
        return []
    client_id     = os.getenv("OUTLOOK_CLIENT_ID")
    client_secret = os.getenv("OUTLOOK_CLIENT_SECRET")
    tenant_id     = os.getenv("OUTLOOK_TENANT_ID", "consumers")
    if not (client_id and client_secret):
        print("[INFO] Outlook credentials not set — skipping.")
        return []

    try:
        import requests
        app = msal.ConfidentialClientApplication(
            client_id,
            authority=f"https://login.microsoftonline.com/{tenant_id}",
            client_credential=client_secret,
        )
        token_resp = app.acquire_token_for_client(
            scopes=["https://graph.microsoft.com/.default"]
        )
        access_token = token_resp.get("access_token")
        if not access_token:
            print("[WARN] Outlook token acquisition failed.")
            return []

        start = f"{TODAY_ISO}T00:00:00Z"
        end   = f"{TODAY_ISO}T23:59:59Z"
        url   = (
            f"https://graph.microsoft.com/v1.0/me/calendarView"
            f"?startDateTime={start}&endDateTime={end}"
            f"&$orderby=start/dateTime&$top=20"
            f"&$select=subject,start,end"
        )
        headers = {"Authorization": f"Bearer {access_token}"}
        resp = requests.get(url, headers=headers)
        resp.raise_for_status()
        events = []
        for ev in resp.json().get("value", []):
            dt  = datetime.fromisoformat(ev["start"]["dateTime"].rstrip("Z"))
            events.append({
                "time":   dt.strftime("%-I:%M %p") if os.name != "nt" else dt.strftime("%I:%M %p").lstrip("0"),
                "title":  ev["subject"],
                "source": "outlook",
                "color":  "#5B7FA6",
            })
        return events
    except Exception as e:
        print(f"[WARN] Outlook calendar error: {e}")
        return []


# ══════════════════════════════════════════
#  APPLE CALENDAR (CalDAV / iCloud)
#  Requires: pip install caldav
#  Set env vars: APPLE_CALDAV_URL, APPLE_USERNAME, APPLE_PASSWORD
#  iCloud URL: https://caldav.icloud.com
# ══════════════════════════════════════════
def get_apple_events() -> list:
    if not CALDAV_AVAILABLE:
        return []
    url      = os.getenv("APPLE_CALDAV_URL", "https://caldav.icloud.com")
    username = os.getenv("APPLE_USERNAME")
    password = os.getenv("APPLE_PASSWORD")
    if not (username and password):
        print("[INFO] Apple CalDAV credentials not set — skipping.")
        return []

    try:
        client    = caldav.DAVClient(url=url, username=username, password=password)
        principal = client.principal()
        calendars = principal.calendars()

        from datetime import timedelta
        start_dt = datetime.combine(TODAY, datetime.min.time())
        end_dt   = start_dt + timedelta(days=1)

        events = []
        for cal in calendars:
            for event in cal.date_search(start=start_dt, end=end_dt, expand=True):
                comp = event.instance.vevent
                dt_start = getattr(comp, 'dtstart', None)
                if dt_start is None:
                    continue
                dt = dt_start.value
                if hasattr(dt, 'hour'):
                    time_str = dt.strftime("%-I:%M %p") if os.name != "nt" else dt.strftime("%I:%M %p").lstrip("0")
                else:
                    time_str = "All Day"
                summary = str(getattr(comp, 'summary', 'Event'))
                events.append({
                    "time":   time_str,
                    "title":  summary,
                    "source": "apple",
                    "color":  "#6B9F78",
                })
        events.sort(key=lambda e: e["time"])
        return events
    except Exception as e:
        print(f"[WARN] Apple calendar error: {e}")
        return []


# ══════════════════════════════════════════
#  MERGE & SORT CALENDAR EVENTS
# ══════════════════════════════════════════
def get_all_calendar_events() -> list:
    outlook = get_outlook_events()
    apple   = get_apple_events()
    all_events = outlook + apple

    # Sort by time string (imperfect but fine for display)
    def sort_key(ev):
        t = ev.get("time", "")
        try:
            return datetime.strptime(t, "%I:%M %p")
        except Exception:
            return datetime.max

    all_events.sort(key=sort_key)
    return all_events


# ══════════════════════════════════════════
#  ASSEMBLE & WRITE
# ══════════════════════════════════════════
def main():
    print(f"🌅 Generating dashboard data for {TODAY_ISO} …")

    todos    = get_todos()
    workout  = get_workout()
    macros   = get_macros()
    calendar = get_all_calendar_events()

    payload = {
        "generated_at": datetime.utcnow().isoformat(),
        "date":         TODAY_NAME,
        "day_of_week":  DAY_SHORT,
        "todos":        todos,
        "workout":      workout,
        "macros":       macros,
        "calendar":     calendar,
    }

    OUT_PATH.parent.mkdir(parents=True, exist_ok=True)
    with open(OUT_PATH, "w", encoding="utf-8") as f:
        json.dump(payload, f, indent=2, ensure_ascii=False)

    print(f"✅ Wrote {OUT_PATH}")
    print(f"   Todos:     {len(todos)}")
    print(f"   Exercises: {len(workout['exercises']) if workout else 0}")
    print(f"   Calendar:  {len(calendar)} event(s)")


if __name__ == "__main__":
    main()
