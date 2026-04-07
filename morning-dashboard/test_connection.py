from notion_client import Client
from dotenv import load_dotenv
import os

load_dotenv()

notion = Client(auth=os.getenv("NOTION_TOKEN"))

databases = {
    "Daily Todos": os.getenv("TODOS_DB"),
    "Workout Plan": os.getenv("WORKOUT_DB"),
    "Macros": os.getenv("MACROS_DB"),
}

for name, db_id in databases.items():
    try:
        db = notion.databases.retrieve(database_id=db_id)
        print(f"✅ {name} connected")
    except Exception as e:
        print(f"❌ {name} failed: {e}")