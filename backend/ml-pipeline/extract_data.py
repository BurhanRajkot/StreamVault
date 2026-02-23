import os
from supabase import create_client, Client
import pandas as pd
from dotenv import load_dotenv

# Load environment variables from the backend .env file
load_dotenv(dotenv_path="../.env")

url: str = os.environ.get("SUPABASE_URL")
key: str = os.environ.get("SUPABASE_SERVICE_ROLE_KEY")

if not url or not key:
    raise ValueError("Supabase credentials not found in .env")

supabase: Client = create_client(url, key)

def extract_training_data():
    print("Extracting interaction matrix from Supabase...")

    # We fetch the ml_interactions table.
    # In a real production environment, you would use pagination or export to CSV to handle millions of rows.
    response = supabase.table('ml_interactions').select("*").execute()
    data = response.data

    if not data:
        print("No interaction data found. Ensure users have interacted with movies on the site.")
        # Create some dummy data for the sake of the prototype if empty
        data = [
            {"userId": "user-1", "tmdbId": 550, "interactionType": "WATCH_COMPLETE", "label": 1.0},
            {"userId": "user-1", "tmdbId": 27205, "interactionType": "CLICK", "label": 0.5},
            {"userId": "user-2", "tmdbId": 550, "interactionType": "DISLIKE", "label": 0.0},
            {"userId": "user-2", "tmdbId": 155, "interactionType": "WATCH_COMPLETE", "label": 1.0},
            {"userId": "user-3", "tmdbId": 155, "interactionType": "CLICK", "label": 0.5},
        ]
        print("Using fallback dummy data for prototyping.")

    df = pd.DataFrame(data)

    # We map UUIDs/TMDB IDs to contiguous integers for PyTorch Embedding layers
    df['user_idx'] = df['userId'].astype('category').cat.codes
    df['item_idx'] = df['tmdbId'].astype('category').cat.codes

    # Save mappings to use later during inference
    user_mapping = dict(enumerate(df['userId'].astype('category').cat.categories))
    item_mapping = dict(enumerate(df['tmdbId'].astype('category').cat.categories))

    # Save the processed dataset
    os.makedirs('data', exist_ok=True)
    df.to_csv('data/interactions.csv', index=False)

    import json
    with open('data/mappings.json', 'w') as f:
        json.dump({'user_mapping': user_mapping, 'item_mapping': item_mapping}, f)

    print(f"Extraction complete. Found {len(df)} interactions.")
    print(f"Unique Users: {len(user_mapping)}")
    print(f"Unique Items: {len(item_mapping)}")

    return df, len(user_mapping), len(item_mapping)

if __name__ == "__main__":
    extract_training_data()
