import anthropic
from notion_client import Client
from dotenv import load_dotenv
from datetime import date
import os
import json

load_dotenv()

key = os.getenv("ANTHROPIC_API_KEY")
print(f"Key loaded: {key is not None}")
claude = anthropic.Anthropic(api_key=key)