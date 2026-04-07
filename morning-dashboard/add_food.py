import os
import uuid
import requests
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
TODAY = date.today().isoformat()

USDA_KEY = os.getenv("USDA_API_KEY")

USDA_SEARCH_URL = "https://api.nal.usda.gov/fdc/v1/foods/search"
USDA_DETAIL_URL = "https://api.nal.usda.gov/fdc/v1/food/{fdc_id}"

NUTRIENT_IDS = {
    "calories": 1008,   # Energy (kcal)
    "protein":  1003,   # Protein
    "carbs":    1005,   # Carbohydrate, by difference
    "fat":      1004,   # Total lipid (fat)
}


def search_food(query):
    """Search USDA FoodData Central for a food."""
    resp = requests.get(USDA_SEARCH_URL, params={
        "query": query,
        "api_key": USDA_KEY,
        "pageSize": 8,
        "dataType": "Survey (FNDDS),SR Legacy,Foundation",
    })
    resp.raise_for_status()
    return resp.json().get("foods", [])


def get_nutrients(fdc_id):
    """Fetch nutrient details for a specific food by FDC ID."""
    resp = requests.get(
        USDA_DETAIL_URL.format(fdc_id=fdc_id),
        params={"api_key": USDA_KEY}
    )
    resp.raise_for_status()
    food = resp.json()

    nutrients = {}
    for n in food.get("foodNutrients", []):
        nid = n.get("nutrient", {}).get("id") or n.get("nutrientId")
        val = n.get("amount") or n.get("value") or 0
        for key, target_id in NUTRIENT_IDS.items():
            if nid == target_id:
                nutrients[key] = round(val, 1)

    return nutrients


def log_to_firebase(name, calories, protein, carbs, fat):
    if not UID:
        print("⚠️  FIREBASE_UID not set in env. Add it and try again.")
        return
    ref   = db.collection("users").document(UID).collection("food").document(TODAY)
    doc   = ref.get()
    items = doc.to_dict().get("items", []) if doc.exists else []
    items.append({
        "id":       str(uuid.uuid4()),
        "name":     name,
        "calories": calories,
        "protein":  protein,
        "carbs":    carbs,
        "fat":      fat,
    })
    ref.set({"items": items})
    print(f"✅ Logged: {name} — {calories} kcal | {protein}g protein | {carbs}g carbs | {fat}g fat")


def main():
    query = input("🔍 Search for a food: ").strip()
    if not query:
        print("No query entered.")
        return

    print("\nSearching USDA FoodData Central...\n")
    results = search_food(query)

    if not results:
        print("No results found. Try a different search term.")
        return

    # Display results
    for i, food in enumerate(results):
        desc = food.get("description", "Unknown")
        brand = food.get("brandOwner", "")
        label = f"{desc} ({brand})" if brand else desc
        print(f"  [{i + 1}] {label}")

    print(f"  [0] Cancel")

    choice = input("\nPick a food (number): ").strip()
    if not choice.isdigit() or int(choice) == 0:
        print("Cancelled.")
        return

    idx = int(choice) - 1
    if idx < 0 or idx >= len(results):
        print("Invalid choice.")
        return

    selected = results[idx]
    fdc_id = selected["fdcId"]
    food_name = selected["description"]

    # Get detailed nutrients
    nutrients = get_nutrients(fdc_id)
    calories = nutrients.get("calories", 0)
    protein  = nutrients.get("protein", 0)
    carbs    = nutrients.get("carbs", 0)
    fat      = nutrients.get("fat", 0)

    print(f"\n📊 Per 100g — Calories: {calories} | Protein: {protein}g | Carbs: {carbs}g | Fat: {fat}g")

    # Allow custom serving size
    serving = input("\nEnter serving size in grams (or press Enter to use 100g): ").strip()
    if serving and serving.replace(".", "").isdigit():
        multiplier = float(serving) / 100
        calories = round(calories * multiplier, 1)
        protein  = round(protein  * multiplier, 1)
        carbs    = round(carbs    * multiplier, 1)
        fat      = round(fat      * multiplier, 1)
        food_name = f"{food_name} ({serving}g)"
        print(f"   Adjusted — Calories: {calories} | Protein: {protein}g | Carbs: {carbs}g | Fat: {fat}g")
    else:
        food_name = f"{food_name} (100g)"

    confirm = input(f"\nLog \"{food_name}\" to dashboard? (y/n): ").strip().lower()
    if confirm == "y":
        log_to_firebase(food_name, calories, protein, carbs, fat)
    else:
        print("Not logged.")


if __name__ == "__main__":
    main()
