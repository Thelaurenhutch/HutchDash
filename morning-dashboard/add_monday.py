from notion_client import Client
from dotenv import load_dotenv
import os

load_dotenv()
notion = Client(auth=os.getenv("NOTION_TOKEN"))
DB = os.getenv("WORKOUT_DB")

exercises = [
    {"name": "Rows", "day": "Mon", "type": "Strength", "sets": 3, "reps": 20, "notes": "13-14 lbs, higher reps"},
    {"name": "Overhead Press", "day": "Mon", "type": "Strength", "sets": 3, "reps": 20, "notes": "13-14 lbs, higher reps"},
    {"name": "Bicep Curls", "day": "Mon", "type": "Strength", "sets": 3, "reps": 15, "notes": "13-14 lbs, slow and controlled"},
    {"name": "Lateral Raises", "day": "Mon", "type": "Strength", "sets": 3, "reps": 15, "notes": "7-8 lbs, plates off"},
    {"name": "Tricep Extension", "day": "Mon", "type": "Strength", "sets": 3, "reps": 15, "notes": "7-8 lbs, plates off"},
]

for ex in exercises:
    notion.pages.create(
        parent={"database_id": DB},
        properties={
            "Name": {"title": [{"text": {"content": ex["name"]}}]},
            "Day": {"select": {"name": ex["day"]}},
            "Exercise Type": {"select": {"name": ex["type"]}},
            "Sets": {"number": ex["sets"]},
            "Reps": {"number": ex["reps"]},
            "Notes": {"rich_text": [{"text": {"content": ex["notes"]}}]},
        }
    )
    print(f"✅ Added {ex['name']}")