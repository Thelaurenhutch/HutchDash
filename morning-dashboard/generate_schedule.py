import os
import uuid
import requests
import random
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

# --- Workout split templates ---
# Each day maps to a list of muscle groups to pull exercises for
SPLITS = {
    "3-day Full Body": {
        "Mon": ["chest", "quadriceps", "lats"],
        "Wed": ["hamstrings", "chest", "triceps"],
        "Fri": ["glutes", "lats", "biceps"],
    },
    "4-day Upper/Lower": {
        "Mon": ["chest", "lats", "triceps"],
        "Tue": ["quadriceps", "hamstrings", "glutes"],
        "Thu": ["chest", "biceps", "traps"],
        "Fri": ["quadriceps", "glutes", "calves"],
    },
    "5-day Push/Pull/Legs": {
        "Mon": ["chest", "triceps"],           # Push
        "Tue": ["lats", "biceps", "traps"],    # Pull
        "Wed": ["quadriceps", "hamstrings", "glutes"],  # Legs
        "Thu": ["chest", "triceps"],           # Push
        "Fri": ["lats", "biceps"],             # Pull
    },
    "6-day PPL": {
        "Mon": ["chest", "triceps"],
        "Tue": ["lats", "biceps", "traps"],
        "Wed": ["quadriceps", "hamstrings", "glutes"],
        "Thu": ["chest", "triceps"],
        "Fri": ["lats", "biceps"],
        "Sat": ["quadriceps", "glutes", "calves"],
    },
}

EXERCISES_PER_MUSCLE = 2  # how many exercises to grab per muscle group


def fetch_exercises(muscle, difficulty):
    resp = requests.get(
        EXERCISE_URL,
        headers={"X-Api-Key": NINJAS_KEY},
        params={"muscle": muscle, "difficulty": difficulty, "type": "strength"},
    )
    resp.raise_for_status()
    results = resp.json()
    return results


def build_schedule(split_name, difficulty):
    split = SPLITS[split_name]
    schedule = {}  # day -> list of exercise dicts

    print(f"\n⚙️  Building your {split_name} schedule ({difficulty})...\n")

    for day, muscles in split.items():
        day_exercises = []
        for muscle in muscles:
            results = fetch_exercises(muscle, difficulty)
            if results:
                picks = random.sample(results, min(EXERCISES_PER_MUSCLE, len(results)))
                for ex in picks:
                    day_exercises.append({
                        "name": ex["name"].title(),
                        "muscle": muscle.replace("_", " ").title(),
                        "type": ex.get("type", "strength").title(),
                        "sets": 3,
                        "reps": 12,
                        "notes": f"Targets {muscle.replace('_', ' ')}",
                    })
        schedule[day] = day_exercises

    return schedule


def print_schedule(schedule):
    print("\n📅  GENERATED WEEKLY SCHEDULE")
    print("=" * 50)
    for day, exercises in schedule.items():
        print(f"\n  {day}")
        print("  " + "-" * 30)
        for ex in exercises:
            print(f"    • {ex['name']}  ({ex['muscle']})  — {ex['sets']}x{ex['reps']}")
    print()


def log_schedule_to_firebase(schedule):
    if not UID:
        print("⚠️  FIREBASE_UID not set in env. Add it and try again.")
        return
    total = sum(len(exs) for exs in schedule.values())
    print(f"\n📤 Writing {total} exercises to Firebase...\n")

    ref  = db.collection("users").document(UID).collection("data").document("workout_plan")
    plan = {}
    for day, exercises in schedule.items():
        plan[day] = {
            "label": day.upper(),
            "exercises": [
                {
                    "id":    str(uuid.uuid4()),
                    "name":  ex["name"],
                    "sets":  ex["sets"],
                    "reps":  ex["reps"],
                    "notes": ex["notes"],
                    "type":  ex["type"],
                }
                for ex in exercises
            ],
        }
    ref.set({"plan": plan})
    for day, exercises in schedule.items():
        for ex in exercises:
            print(f"  ✅ {day} — {ex['name']}")
    print(f"\n🎉 Done! Your weekly schedule is live on the dashboard.")


def main():
    print("🗓️  Weekly Workout Schedule Generator\n")

    # Pick a split
    split_names = list(SPLITS.keys())
    print("Choose a workout split:")
    for i, name in enumerate(split_names):
        days = list(SPLITS[name].keys())
        print(f"  [{i + 1}] {name}  ({', '.join(days)})")

    choice = input("\nChoice: ").strip()
    if not choice.isdigit() or not (1 <= int(choice) <= len(split_names)):
        print("Invalid choice.")
        return
    split_name = split_names[int(choice) - 1]

    # Pick difficulty
    print("\nDifficulty level:")
    print("  [1] Beginner")
    print("  [2] Intermediate")
    print("  [3] Expert")
    diff_choice = input("Choice: ").strip()
    diff_map = {"1": "beginner", "2": "intermediate", "3": "expert"}
    difficulty = diff_map.get(diff_choice, "intermediate")

    # Build and show the schedule
    schedule = build_schedule(split_name, difficulty)
    print_schedule(schedule)

    # Optionally tweak sets/reps globally
    tweak = input("Customize sets/reps for all exercises? (y/n, default n): ").strip().lower()
    if tweak == "y":
        sets_input = input("  Sets per exercise (default 3): ").strip()
        reps_input = input("  Reps per exercise (default 12): ").strip()
        sets = int(sets_input) if sets_input.isdigit() else 3
        reps = int(reps_input) if reps_input.isdigit() else 12
        for day in schedule:
            for ex in schedule[day]:
                ex["sets"] = sets
                ex["reps"] = reps

    confirm = input("Log this schedule to the dashboard? (y/n): ").strip().lower()
    if confirm == "y":
        log_schedule_to_firebase(schedule)
    else:
        print("Not logged. Run again to generate a new schedule.")


if __name__ == "__main__":
    main()
