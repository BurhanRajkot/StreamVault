# StreamVault Testing Guide

This guide explains the testing architecture of StreamVault, how tests are structured, how to run them, and how to write or modify them.

## Testing Stack
StreamVault uses **Bun** as its JavaScript runtime, package manager, and test runner.
All test files are written in TypeScript (`.ts`) and use the built-in testing framework from `'bun:test'`.
Because Bun has a native test runner, test execution is extremely fast (~100-150ms for the entire suite).

---

## How to Run the Tests

### 1. Running All Tests (Root Context)
To run all tests in the project (both frontend and backend) simultaneously:
```bash
bun test
```
This automatically scans all `.test.ts` files in the repository and runs them.

### 2. Running Frontend Tests Only
To run tests only for the frontend application (under `src/`):
```bash
bun test src/
```
Or target a specific file:
```bash
bun test src/lib/utils.test.ts
```

### 3. Running Backend Tests Only
To run tests only for the backend (under `backend/`):
```bash
# From the root directory:
bun test backend/

# Or from the backend directory:
cd backend
bun test
```
You can also target a specific backend file:
```bash
bun test backend/src/cinematch/filtering/disliked.test.ts
```

### 4. Running Tests in Watch Mode
If you are developing or debugging, watch mode re-runs the tests automatically whenever you save a file:
```bash
bun test --watch
```

### 5. Running Specific Tests by Pattern
You can filter tests by name/pattern using the `-t` or `--filter` flag:
```bash
bun test -t "slugify"
```

---

## Test File Locations & Coverage

### Backend Tests (`backend/src/`)
These tests validate backend utilities and the **CineMatch** recommendation system.
*   **Recommendation & Filters:**
    *   `backend/src/cinematch/filtering/alreadyWatched.test.ts`: Filters out content already watched or favorited by the user.
    *   `backend/src/cinematch/filtering/disliked.test.ts`: Filters out disliked items, depending on the source (e.g., global trending vs personalized recommendation).
    *   `backend/src/cinematch/filtering/suppressedCategory.test.ts`: Throttles recommendation keeping ratio for heavily disliked genres/categories.
    *   `backend/src/cinematch/filtering/quality.test.ts`: Throttles low-vote or low-average titles.
    *   `backend/src/cinematch/filtering/deduplication.test.ts`: Removes duplicate candidate recommendations.
*   **Authentication & Utils:**
    *   `backend/src/admin/auth.test.ts`: Validates generation of administrative JWT tokens.
    *   `backend/src/utils/auth.test.ts`: Tests extracting user sub/ID from the auth payload.

### Frontend Tests (`src/`)
These tests validate client-side logic, helpers, and algorithms.
*   `src/lib/utils.test.ts`: Verifies standard utility functions (like `slugify`).
*   `src/lib/ottProviders.test.ts`: Validates resolving OTT platform providers (Netflix, Prime Video, etc.) by ID.
*   `src/lib/searchAlgorithm.test.ts`: Verifies search queries normalization (accents removal, whitespace trimming, lowercasing).

---

## Anatomy of a Bun Test File

All tests follow the standard BDD (Behavior Driven Development) style.

```typescript
import { describe, test, it, expect } from 'bun:test';
import { myHelper } from './myHelper';

describe('myHelper function group', () => {
  test('should do action correctly', () => {
    const result = myHelper('input');
    
    // Assertions using expect()
    expect(result).toBe('expected-output');
    expect(result).toHaveLength(15);
  });
});
```

### Common Assertions in `bun:test`
*   `expect(a).toBe(b)`: Strict equality (`===`).
*   `expect(a).toEqual(b)`: Deep structural equality (compares objects/arrays values).
*   `expect(a).toHaveLength(n)`: Checks array/string/set length.
*   `expect(a).toBeTrue()` / `toBeFalse()`: Boolean checks.
*   `expect(fn).toThrow()`: Verifies a function throws an error.

### Mocking / Setting Up Test Data
When testing filtering algorithms, we create helper functions to easily construct dummy user profiles or candidate streams:
```typescript
const createMockCandidate = (id: number): Candidate => ({
  tmdbId: id,
  mediaType: 'movie',
  title: `Movie ${id}`,
  posterPath: null,
  backdropPath: null,
  overview: '',
  releaseDate: '2023-01-01',
  voteAverage: 8.0,
  voteCount: 100,
  popularity: 10,
  genreIds: [],
  source: 'tmdb_similar',
});
```
