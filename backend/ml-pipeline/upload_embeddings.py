import os
import json
from supabase import create_client, Client
from dotenv import load_dotenv

# Load environment variables from the backend .env file
load_dotenv(dotenv_path="../.env")

url: str = os.environ.get("SUPABASE_URL")
key: str = os.environ.get("SUPABASE_SERVICE_ROLE_KEY")

if not url or not key:
    raise ValueError("Supabase credentials not found in .env")

supabase: Client = create_client(url, key)

def upload_embeddings():
    print("Step 1: Loading Extracted Embeddings...")
    try:
        with open('exports/movie_embeddings.json', 'r') as f:
            embeddings_data = json.load(f)
    except FileNotFoundError:
        print("Error: exports/movie_embeddings.json not found.")
        print("Please run `python train.py` first to generate the embeddings.")
        return

    print(f"Loaded {len(embeddings_data)} embeddings.")

    print("Step 2: Uploading to Supabase (movie_embeddings table)...")

    # Supabase insert limit is usually ~1000 rows. We'll chunk to 500 for safety.
    chunk_size = 500
    for i in range(0, len(embeddings_data), chunk_size):
        chunk = embeddings_data[i:i + chunk_size]

        # We use upsert to cleanly overwrite if we retrain the model later
        response = supabase.table('movie_embeddings').upsert(chunk).execute()

        # The python client might raise an exception on error, we just print progress
        print(f"Uploaded chunk {i//chunk_size + 1} / {(len(embeddings_data) // chunk_size) + 1}...")

    print("✅ Success! All embeddings are now live in Supabase pgvector.")

if __name__ == "__main__":
    upload_embeddings()
