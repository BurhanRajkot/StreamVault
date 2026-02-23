import torch
import torch.nn as nn
import torch.nn.functional as F

class UserTower(nn.Module):
    def __init__(self, num_users, embedding_dim=32):
        super().__init__()
        # Initial user embedding lookup
        self.user_emb = nn.Embedding(num_users, embedding_dim)

        # Deep neural network to capture non-linear patterns
        self.net = nn.Sequential(
            nn.Linear(embedding_dim, 128),
            nn.ReLU(),
            nn.Dropout(0.2), # Dropout layer for regularization
            nn.Linear(128, 64),
            nn.ReLU(),
            nn.Linear(64, 64) # Final output vector size: 64
        )

    def forward(self, user_idx):
        x = self.user_emb(user_idx)
        return self.net(x)

class ItemTower(nn.Module):
    def __init__(self, num_items, embedding_dim=32):
        super().__init__()
        # Initial item (movie) embedding lookup
        self.item_emb = nn.Embedding(num_items, embedding_dim)

        # Deep network architecture mirroring the UserTower
        self.net = nn.Sequential(
            nn.Linear(embedding_dim, 128),
            nn.ReLU(),
            nn.Dropout(0.2),
            nn.Linear(128, 64),
            nn.ReLU(),
            nn.Linear(64, 64) # Final output vector MUST match UserTower (64)
        )

    def forward(self, item_idx):
        x = self.item_emb(item_idx)
        return self.net(x)

class CineMatchTwoTower(nn.Module):
    """
    Two-Tower Recommendation Model for StreamVault.
    Computes User embeddings (u) and Item embeddings (v).
    Prediction is the scaled dot product <u, v>.
    """
    def __init__(self, num_users, num_items, embedding_dim=32):
        super().__init__()
        self.user_tower = UserTower(num_users, embedding_dim)
        self.item_tower = ItemTower(num_items, embedding_dim)

    def forward(self, user_idx, item_idx):
        # 1. Pass data through the towers to get the dense representations
        u = self.user_tower(user_idx)
        v = self.item_tower(item_idx)

        # 2. Compute the dot product
        # Dim=1 ensures we multiply parallel rows across the batch
        score = torch.sum(u * v, dim=1)

        # 3. Apply Sigmoid to squash output to a probability between [0.0, 1.0]
        # We don't apply sigmoid here *if* we use BCEWithLogitsLoss during training,
        # but for clean abstraction we output logits, and convert to probability at inference.
        return score

    def predict(self, user_idx, item_idx):
        """Used during inference to get a raw probability."""
        score_logits = self.forward(user_idx, item_idx)
        return torch.sigmoid(score_logits)

# Test instantiating the model
if __name__ == "__main__":
    test_model = CineMatchTwoTower(num_users=100, num_items=500)

    test_users = torch.tensor([0, 15, 99])
    test_items = torch.tensor([5, 450, 10])

    predictions = test_model(test_users, test_items)
    print(f"Model initialized successfully. Sample dot products output shape: {predictions.shape}")
