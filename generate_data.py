"""
generate_data.py
Pulls data from Firebase Firestore (and optionally Outlook / Apple Calendar)
and writes docs/data/data.json for the HUTCHDASH GitHub Pages site.

Run manually:  python generate_data.py
Runs nightly:  via .github/workflows/daily-refresh.yml
"""

import json
import os
from datetime import date, datetime, timezone
from pathlib import Path

import firebase_admin
from firebase_admin import credentials, firestore
from dotenv import load_dotenv

# ── Optional calendar imports (skip gracefully if not configured) ──
try:
    import requests                      # pip install requests
    from icalendar import Calendar       # pip install icalendar
    import pytz                          # pip install pytz
    ICS_AVAILABLE = True
except ImportError:
    ICS_AVAILABLE = False

try:
    import caldav                        # pip install caldav
    CALDAV_AVAILABLE = True
except ImportError:
    CALDAV_AVAILABLE = False

# ─────────────────────────────────────────
load_dotenv()

# ── Firebase Admin init ──
# Uses GOOGLE_APPLICATION_CREDENTIALS env var pointing to a service account JSON,
# or falls back to Application Default Credentials (e.g. in CI/Cloud Run).
_fb_cred_path = os.getenv("FIREBASE_SERVICE_ACCOUNT")
if _fb_cred_path and Path(_fb_cred_path).exists():
    cred = credentials.Certificate(_fb_cred_path)
    firebase_admin.initialize_app(cred, {"projectId": "hutchdash"})
else:
    firebase_admin.initialize_app(options={"projectId": "hutchdash"})

db = firestore.client()

TODAY        = date.today()
TODAY_ISO    = TODAY.isoformat()
TODAY_NAME   = TODAY.strftime("%A, %B %-d, %Y") if os.name != 'nt' else TODAY.strftime("%A, %B %d, %Y").lstrip("0")
DAY_SHORT    = TODAY.strftime("%a")   # Mon, Tue, …

OUT_PATH = Path(__file__).parent / "docs" / "data" / "data.json"

# ══════════════════════════════════════════
#  FIREBASE — TODOS
# ══════════════════════════════════════════
def get_todos() -> list:
    try:
        snap = db.collection("users").stream()
        # Todos are stored per-user; collect from all users (single-user setup)
        todos = []
        for user_doc in snap:
            uid = user_doc.id
            items_doc = db.collection("users").document(uid).collection("data").document("todos").get()
            if not items_doc.exists:
                continue
            for item in (items_doc.to_dict() or {}).get("items", []):
                if item.get("done"):
                    continue
                todos.append({
                    "id":       item.get("id", ""),
                    "name":     item.get("text", "Untitled"),
                    "priority": item.get("priority", "None"),
                    "due":      item.get("due", None),
                    "done":     False,
                    "category": item.get("category", "Other"),
                })
        order = {"High": 0, "Medium": 1, "Low": 2, "None": 3}
        todos.sort(key=lambda t: order.get(t["priority"], 99))
        return todos
    except Exception as e:
        print(f"[WARN] Could not fetch todos: {e}")
        return []


# ══════════════════════════════════════════
#  FIREBASE — WORKOUT
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

def get_workout():
    try:
        snap = db.collection("users").stream()
        for user_doc in snap:
            uid = user_doc.id
            plan_doc = db.collection("users").document(uid).collection("data").document("workout_plan").get()
            if not plan_doc.exists:
                continue
            plan = (plan_doc.to_dict() or {}).get("plan", {})
            day_data = plan.get(DAY_SHORT)
            if not day_data or not day_data.get("exercises"):
                return None
            return {
                "day":       DAY_SHORT,
                "label":     day_data.get("label") or WORKOUT_LABELS.get(DAY_SHORT, DAY_SHORT.upper()),
                "exercises": day_data["exercises"],
            }
        return None
    except Exception as e:
        print(f"[WARN] Could not fetch workout: {e}")
        return None


# ══════════════════════════════════════════
#  FIREBASE — MACROS
# ══════════════════════════════════════════
MACRO_GOALS = {
    "goal_calories": int(os.getenv("GOAL_CALORIES", 2000)),
    "goal_protein":  int(os.getenv("GOAL_PROTEIN",  150)),
    "goal_carbs":    int(os.getenv("GOAL_CARBS",    200)),
    "goal_fat":      int(os.getenv("GOAL_FAT",      65)),
}

def get_macros() -> dict:
    cal = pro = carb = fat = 0
    try:
        snap = db.collection("users").stream()
        for user_doc in snap:
            uid = user_doc.id
            food_doc = db.collection("users").document(uid).collection("food").document(TODAY_ISO).get()
            if not food_doc.exists:
                continue
            for item in (food_doc.to_dict() or {}).get("items", []):
                cal  += item.get("calories", 0)
                pro  += item.get("protein",  0)
                carb += item.get("carbs",    0)
                fat  += item.get("fat",      0)
    except Exception as e:
        print(f"[WARN] Could not fetch macros: {e}")

    return {
        **MACRO_GOALS,
        "logged_calories": round(cal,  1),
        "logged_protein":  round(pro,  1),
        "logged_carbs":    round(carb, 1),
        "logged_fat":      round(fat,  1),
    }


# ══════════════════════════════════════════
#  OUTLOOK CALENDAR (Published ICS URL)
#  No IT admin or app registration needed.
#  Requires: pip install requests icalendar pytz
#
#  HOW TO GET YOUR ICS URL:
#  1. Go to outlook.office.com → Calendar
#  2. Settings (gear) → View all Outlook settings
#  3. Calendar → Shared calendars
#  4. "Publish a calendar" → Calendar → Can view all details
#  5. Click Publish → copy the ICS link
#  Set env var: OUTLOOK_ICS_URL=https://outlook.office365.com/owa/...
# ══════════════════════════════════════════
def get_outlook_events() -> list:
    if not ICS_AVAILABLE:
        return []
    ics_url = os.getenv("OUTLOOK_ICS_URL")
    if not ics_url:
        print("[INFO] OUTLOOK_ICS_URL not set — skipping.")
        return []

    try:
        resp = requests.get(ics_url, timeout=15)
        resp.raise_for_status()
        cal = Calendar.from_ical(resp.content)

        local_tz  = pytz.timezone(os.getenv("TZ", "America/Chicago"))
        today_loc = datetime.now(local_tz).date()
        events    = []

        for component in cal.walk():
            if component.name != "VEVENT":
                continue
            dtstart = component.get("DTSTART")
            if dtstart is None:
                continue
            dt = dtstart.dt
            # All-day events are date objects; timed events are datetime
            if isinstance(dt, datetime):
                if dt.tzinfo:
                    dt = dt.astimezone(local_tz)
                if dt.date() != today_loc:
                    continue
                time_str = dt.strftime("%I:%M %p").lstrip("0") or "12:00 AM"
            else:
                if dt != today_loc:
                    continue
                time_str = "All Day"

            summary = str(component.get("SUMMARY", "Event"))
            events.append({
                "time":   time_str,
                "title":  summary,
                "source": "outlook",
                "color":  "#5B7FA6",
            })

        events.sort(key=lambda e: (
            datetime.strptime(e["time"], "%I:%M %p")
            if e["time"] != "All Day" else datetime.min
        ))
        return events
    except Exception as e:
        print(f"[WARN] Outlook ICS error: {e}")
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

        from datetime import timedelta, timezone
        start_dt = datetime.combine(TODAY, datetime.min.time()).replace(tzinfo=timezone.utc)
        end_dt   = start_dt + timedelta(days=1)

        events = []
        for cal in calendars:
            try:
                cal_events = cal.search(start=start_dt, end=end_dt, event=True, expand=True)
            except Exception:
                cal_events = []
            for event in cal_events:
                try:
                    ical = event.icalendar_instance
                    for component in ical.walk():
                        if component.name != 'VEVENT':
                            continue
                        dt_start = component.get('DTSTART')
                        if dt_start is None:
                            continue
                        dt = dt_start.dt
                        if hasattr(dt, 'hour'):
                            time_str = dt.strftime("%I:%M %p").lstrip("0") or "12:00 AM"
                        else:
                            time_str = "All Day"
                        summary = str(component.get('SUMMARY', 'Event'))
                        events.append({
                            "time":   time_str,
                            "title":  summary,
                            "source": "apple",
                            "color":  "#6B9F78",
                        })
                except Exception:
                    continue
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
        "generated_at": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%S"),
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
