import os
from datetime import date
from pathlib import Path
from dotenv import load_dotenv
import firebase_admin
from firebase_admin import credentials, firestore

load_dotenv(dotenv_path=Path(__file__).parent.parent / "env")

# ── Firebase init ──
_cred_path = os.getenv("FIREBASE_SERVICE_ACCOUNT")
if not firebase_admin._apps:
    if _cred_path and Path(_cred_path).exists():
        cred = credentials.Certificate(_cred_path)
        firebase_admin.initialize_app(cred, {"projectId": "hutchdash"})
    else:
        firebase_admin.initialize_app(options={"projectId": "hutchdash"})

db    = firestore.client()
UID   = os.getenv("FIREBASE_UID")
today = date.today().isoformat()
DAY   = date.today().strftime("%a")  # Mon, Tue, etc.

def get_todos():
    if not UID:
        print("⚠️  FIREBASE_UID not set"); return
    doc = db.collection("users").document(UID).collection("data").document("todos").get()
    items = doc.to_dict().get("items", []) if doc.exists else []
    active = [i for i in items if not i.get("done")]

    print("\n📋 TODOS")
    print("-" * 30)
    if not active:
        print("  No active todos.")
    for item in active:
        name     = item.get("text", "Untitled")
        priority = item.get("priority", "None")
        due      = item.get("due", "No date") or "No date"
        print(f"  [{priority}] {name} — due {due}")


def get_workouts():
    if not UID:
        print("⚠️  FIREBASE_UID not set"); return
    doc  = db.collection("users").document(UID).collection("data").document("workout_plan").get()
    plan = doc.to_dict().get("plan", {}) if doc.exists else {}
    day_data = plan.get(DAY, {})
    exercises = day_data.get("exercises", [])

    print("\n💪 TODAY'S WORKOUT")
    print("-" * 30)
    if not exercises:
        print("  Rest day or nothing scheduled.")
    for ex in exercises:
        name = ex.get("name", "Untitled")
        sets = ex.get("sets", "-")
        reps = ex.get("reps", "-")
        print(f"  {name} — {sets}x{reps}")


def get_macros():
    if not UID:
        print("⚠️  FIREBASE_UID not set"); return
    doc   = db.collection("users").document(UID).collection("food").document(today).get()
    items = doc.to_dict().get("items", []) if doc.exists else []

    total_cal = total_protein = total_carbs = total_fat = 0
    for item in items:
        total_cal     += item.get("calories", 0)
        total_protein += item.get("protein",  0)
        total_carbs   += item.get("carbs",    0)
        total_fat     += item.get("fat",      0)

    print("\n🥗 MACROS TOTALS")
    print("-" * 30)
    print(f"  Calories: {round(total_cal, 1)}")
    print(f"  Protein:  {round(total_protein, 1)}g")
    print(f"  Carbs:    {round(total_carbs, 1)}g")
    print(f"  Fat:      {round(total_fat, 1)}g")


print(f"\n🌅 MORNING DASHBOARD — {today}")
print("=" * 30)
get_todos()
get_workouts()
get_macros()
print("\n")
