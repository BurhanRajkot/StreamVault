import os
import json
import torch
import torch.nn as nn
import torch.optim as optim
from torch.utils.data import Dataset, DataLoader
import pandas as pd
from extract_data import extract_training_data
from model import CineMatchTwoTower

# ── Data Loading ──────────────────────────────────────────
class InteractionDataset(Dataset):
    def __init__(self, df):
        self.users = torch.tensor(df['user_idx'].values, dtype=torch.long)
        self.items = torch.tensor(df['item_idx'].values, dtype=torch.long)
        self.labels = torch.tensor(df['label'].values, dtype=torch.float32)

    def __len__(self):
        return len(self.labels)

    def __getitem__(self, idx):
        return self.users[idx], self.items[idx], self.labels[idx]

def train_model():
    print("Step 1: Fetching Data...")
    df, num_users, num_items = extract_training_data()

    # Check if we have enough data (for the prototype we'll proceed anyway)
    if num_users == 0 or num_items == 0:
        print("Cannot train. Missing data.")
        return

    dataset = InteractionDataset(df)
    dataloader = DataLoader(dataset, batch_size=32, shuffle=True)

    # ── Model Initialization ─────────────────────────────────
    print(f"Step 2: Initializing Model (Users: {num_users}, Items: {num_items})...")
    # Embedding Dimension: 64 is standard for a robust size vs inference speed balance
    embedding_dim = 64
    model = CineMatchTwoTower(num_users=num_users, num_items=num_items, embedding_dim=embedding_dim)

    # BCEWithLogitsLoss combines Sigmoid + Binary Cross Entropy for numeric stability.
    # It expects the raw dot product (logits) and pushes it toward 0 or 1.
    criterion = nn.BCEWithLogitsLoss()
    optimizer = optim.Adam(model.parameters(), lr=0.001)

    # ── Training Loop ───────────────────────────────────────
    epochs = 10
    print(f"Step 3: Training for {epochs} Epochs...")
    model.train()

    for epoch in range(epochs):
        total_loss = 0
        for user_batch, item_batch, label_batch in dataloader:
            optimizer.zero_grad()

            # Forward pass: compute predicted scores
            predictions = model(user_batch, item_batch)

            # Compute loss
            loss = criterion(predictions, label_batch)

            # Backward pass: compute gradients
            loss.backward()

            # Update weights
            optimizer.step()

            total_loss += loss.item()

        print(f"Epoch {epoch+1}/{epochs}, Loss: {total_loss/len(dataloader):.4f}")

    # ── Exporting Embeddings ─────────────────────────────────
    print("Step 4: Exporting Item Embeddings for Supabase pgvector...")
    model.eval()

    # To export embeddings, we just pass every item through the ItemTower
    # and save the resulting 64-dimensional vector.
    with torch.no_grad():
        all_item_indices = torch.arange(0, num_items, dtype=torch.long)
        item_embeddings = model.item_tower(all_item_indices).numpy()

    # Load mappings to get REAL tmdb_ids back
    with open('data/mappings.json', 'r') as f:
        mappings = json.load(f)
    item_mapping = {int(k): int(v) for k, v in mappings['item_mapping'].items()}

    # Create final export payload
    export_data = []
    for idx, embedding in enumerate(item_embeddings):
        real_tmdb_id = item_mapping[idx]
        export_data.append({
            "tmdbId": real_tmdb_id,
            "embedding": embedding.tolist()
        })

    os.makedirs('exports', exist_ok=True)

    # Save as JSON to upload to Supabase pgvector table
    with open('exports/movie_embeddings.json', 'w') as f:
        json.dump(export_data, f)

    print(f"✅ Success! Saved {len(export_data)} movie embeddings to exports/movie_embeddings.json")
    print("Next Step: Run the upload_embeddings.py script to push these to the vector DB.")

if __name__ == "__main__":
    train_model()
