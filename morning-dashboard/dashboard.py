from notion_client import Client
from dotenv import load_dotenv
from datetime import date
import os

load_dotenv()
notion = Client(auth=os.getenv("NOTION_TOKEN"))

today = date.today().isoformat()

def get_todos():
    results = notion.databases.query(
        database_id=os.getenv("TODOS_DB"),
        filter={
            "and": [
                {"property": "Status", "checkbox": {"equals": False}},
            ]
        }
    ).get("results", [])
    
    print("\n📋 TODOS")
    print("-" * 30)
    for item in results:
        props = item["properties"]
        name = props["Name"]["title"][0]["text"]["content"] if props["Name"]["title"] else "Untitled"
        priority = props["Priority"]["select"]["name"] if props["Priority"]["select"] else "None"
        due = props["Due Date"]["date"]["start"] if props["Due Date"]["date"] else "No date"
        print(f"  [{priority}] {name} — due {due}")

def get_workouts():
    day_name = date.today().strftime("%a")  # Mon, Tue, etc.
    day_map = {"Mon":"Mon","Tue":"Tue","Wed":"Wed","Thu":"Thu","Fri":"Fri","Sat":"Sat","Sun":"Sun"}
    
    results = notion.databases.query(
        database_id=os.getenv("WORKOUT_DB"),
        filter={
            "property": "Day",
            "select": {"equals": day_map[day_name]}
        }
    ).get("results", [])
    
    print("\n💪 TODAY'S WORKOUT")
    print("-" * 30)
    if not results:
        print("  Rest day or nothing scheduled.")
    for item in results:
        props = item["properties"]
        name = props["Name"]["title"][0]["text"]["content"] if props["Name"]["title"] else "Untitled"
        sets = props["Sets"]["number"] if props["Sets"]["number"] else "-"
        reps = props["Reps"]["number"] if props["Reps"]["number"] else "-"
        print(f"  {name} — {sets}x{reps}")

def get_macros():
    results = notion.databases.query(
        database_id=os.getenv("MACROS_DB")
    ).get("results", [])
    
    total_cal = total_protein = total_carbs = total_fat = 0
    
    for item in results:
        props = item["properties"]
        total_cal += props["Calories"]["number"] or 0
        total_protein += props["Protein"]["number"] or 0
        total_carbs += props["Carbs"]["number"] or 0
        total_fat += props["Fat"]["number"] or 0
    
    print("\n🥗 MACROS TOTALS")
    print("-" * 30)
    print(f"  Calories: {total_cal}")
    print(f"  Protein:  {total_protein}g")
    print(f"  Carbs:    {total_carbs}g")
    print(f"  Fat:      {total_fat}g")


print(f"\n🌅 MORNING DASHBOARD — {today}")
print("=" * 30)
get_todos()
get_workouts()
get_macros()
print("\n")
