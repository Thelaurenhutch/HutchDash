import os
import uuid
import requests
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

db         = firestore.client()
UID        = os.getenv("FIREBASE_UID")
NINJAS_KEY = os.getenv("API_NINJAS_KEY")

EXERCISE_URL = "https://api.api-ninjas.com/v1/exercises"

DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"]
TYPES = ["Strength", "Cardio", "Stretching", "Plyometrics", "Powerlifting", "Olympic Weightlifting", "Other"]
MUSCLES = [
    "abdominals", "abductors", "adductors", "biceps", "calves",
    "chest", "forearms", "glutes", "hamstrings", "lats",
    "lower_back", "middle_back", "neck", "quadriceps", "traps", "triceps"
]


def search_exercises(name=None, muscle=None, difficulty=None):
    params = {}
    if name:
        params["name"] = name
    if muscle:
        params["muscle"] = muscle
    if difficulty:
        params["difficulty"] = difficulty

    resp = requests.get(
        EXERCISE_URL,
        headers={"X-Api-Key": NINJAS_KEY},
        params=params
    )
    resp.raise_for_status()
    return resp.json()


def pick_from_list(label, options):
    print(f"\n{label}")
    for i, opt in enumerate(options):
        print(f"  [{i + 1}] {opt}")
    print("  [0] Skip / None")
    choice = input("Choice: ").strip()
    if choice.isdigit() and int(choice) > 0 and int(choice) <= len(options):
        return options[int(choice) - 1]
    return None


def log_to_firebase(name, day, ex_type, sets, reps, notes):
    if not UID:
        print("⚠️  FIREBASE_UID not set in env. Add it and try again.")
        return
    ref  = db.collection("users").document(UID).collection("data").document("workout_plan")
    doc  = ref.get()
    plan = doc.to_dict().get("plan", {}) if doc.exists else {}

    day_data = plan.get(day, {"label": day.upper(), "exercises": []})
    day_data["exercises"].append({
        "id":    str(uuid.uuid4()),
        "name":  name,
        "sets":  sets,
        "reps":  reps,
        "notes": notes,
        "type":  ex_type,
    })
    plan[day] = day_data
    ref.set({"plan": plan})
    print(f"✅ Added: {name} — {day} | {sets}x{reps} | {ex_type}")


def main():
    print("🏋️  Exercise Search — API Ninjas\n")
    print("Search by:")
    print("  [1] Exercise name")
    print("  [2] Muscle group")
    print("  [3] Both")
    mode = input("Choice: ").strip()

    name_query = None
    muscle_query = None
    difficulty_query = None

    if mode in ("1", "3"):
        name_query = input("Exercise name (e.g. 'curl', 'press'): ").strip() or None

    if mode in ("2", "3"):
        muscle_query = pick_from_list("Pick a muscle group:", MUSCLES)

    diff_input = input("\nFilter by difficulty? (beginner/intermediate/expert) or Enter to skip: ").strip().lower()
    if diff_input in ("beginner", "intermediate", "expert"):
        difficulty_query = diff_input

    print("\nSearching...\n")
    results = search_exercises(name=name_query, muscle=muscle_query, difficulty=difficulty_query)

    if not results:
        print("No exercises found. Try different search terms.")
        return

    # Show up to 10 results
    shown = results[:10]
    for i, ex in enumerate(shown):
        muscle = ex.get("muscle", "").replace("_", " ").title()
        diff = ex.get("difficulty", "").title()
        print(f"  [{i + 1}] {ex['name']}  |  {muscle}  |  {diff}")

    print("  [0] Cancel")

    choice = input("\nPick an exercise: ").strip()
    if not choice.isdigit() or int(choice) == 0:
        print("Cancelled.")
        return

    idx = int(choice) - 1
    if idx < 0 or idx >= len(shown):
        print("Invalid choice.")
        return

    selected = shown[idx]
    ex_name = selected["name"].title()
    instructions = selected.get("instructions", "")

    print(f"\n📋 {ex_name}")
    print(f"   Muscle:       {selected.get('muscle', '').replace('_', ' ').title()}")
    print(f"   Type:         {selected.get('type', '').title()}")
    print(f"   Difficulty:   {selected.get('difficulty', '').title()}")
    if instructions:
        print(f"   Instructions: {instructions[:120]}{'...' if len(instructions) > 120 else ''}")

    # Workout details
    day = pick_from_list("Which day?", DAYS)
    if not day:
        print("Day is required.")
        return

    # Try to map API type to your Notion types
    api_type = selected.get("type", "").title()
    matched_type = next((t for t in TYPES if t.lower() == api_type.lower()), None)
    if matched_type:
        print(f"\nExercise type auto-set to: {matched_type}")
        ex_type = matched_type
    else:
        ex_type = pick_from_list("Exercise type:", TYPES) or "Strength"

    sets_input = input("\nSets (default 3): ").strip()
    sets = int(sets_input) if sets_input.isdigit() else 3

    reps_input = input("Reps (default 10): ").strip()
    reps = int(reps_input) if reps_input.isdigit() else 10

    notes = input("Notes (weight, form cues, etc.) or Enter to skip: ").strip()

    confirm = input(f"\nAdd \"{ex_name}\" to dashboard on {day}? (y/n): ").strip().lower()
    if confirm == "y":
        log_to_firebase(ex_name, day, ex_type, sets, reps, notes)
    else:
        print("Not added.")


if __name__ == "__main__":
    main()
