import os

from dotenv import load_dotenv

load_dotenv()

PORT = int(os.environ.get("PORT", "4100"))
CORS_ORIGIN = os.environ.get("CORS_ORIGIN", "http://localhost:4000")
