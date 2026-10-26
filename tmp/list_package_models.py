from pathlib import Path
import sys
sys.path.insert(0,str(Path('backend').resolve()))
from app import create_app
from google import genai
app=create_app()
with genai.Client(api_key=app.config['GEMINI_API_KEY']) as client:
 for model in client.models.list():
  if 'flash' in model.name and 'image' not in model.name and 'live' not in model.name:print(model.name)
