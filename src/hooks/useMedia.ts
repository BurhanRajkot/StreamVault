import { useState, useEffect, useCallback } from "react";
import { fetchPopular, fetchTrending, searchMedia } from "@/lib/api";
import { Media, MediaMode } from "@/lib/config";

interface UseMediaReturn {
  media: Media[];
  trending: Media[];
  isLoading: boolean;
  hasMore: boolean;
  loadMore: () => void;
  search: (query: string) => void;
  clearSearch: () => void;
  searchQuery: string;
}

export function useMedia(mode: MediaMode): UseMediaReturn {
  const [media, setMedia] = useState<Media[]>([]);
  const [trending, setTrending] = useState<Media[]>([]);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [isLoading, setIsLoading] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [isSearchMode, setIsSearchMode] = useState(false);

  // -----------------------------
  // MAIN LOADER (Popular or Search)
  // -----------------------------
  const loadMedia = useCallback(
    async (reset = false) => {
      // Downloads mode has no TMDB data
      if (mode === "downloads") {
        setMedia([]);
        setTrending([]);
        setIsLoading(false);
        return;
      }

      setIsLoading(true);

      try {
        const nextPage = reset ? 1 : page;

        let mediaResult;
        if (isSearchMode && searchQuery.length > 0) {
          mediaResult = await searchMedia(mode, searchQuery, nextPage);
        } else {
          mediaResult = await fetchPopular(mode, nextPage);
        }

        setTotalPages(mediaResult.total_pages || 1);

        if (reset) {
          setMedia(mediaResult.results);
        } else {
          setMedia((prev) => [...prev, ...mediaResult.results]);
        }
      } catch (err) {
        console.error("Media load error:", err);
      } finally {
        setIsLoading(false);
      }
    },
    [mode, page, searchQuery, isSearchMode]
  );

  // -----------------------------
  // LOAD TRENDING (only once per mode change)
  // -----------------------------
  const loadTrending = useCallback(async () => {
    // No trending for downloads mode
    if (mode === "downloads") {
      setTrending([]);
      return;
    }

    try {
      const trend = await fetchTrending(mode);
      setTrending(trend);
    } catch (err) {
      console.error("Trending fetch error:", err);
      setTrending([]);
    }
  }, [mode]);

  // -----------------------------
  // MODE CHANGE → RESET EVERYTHING
  // -----------------------------
  useEffect(() => {
    setMedia([]);
    setTrending([]);
    setPage(1);
    setTotalPages(1);
    setSearchQuery("");
    setIsSearchMode(false);

    loadTrending();
    loadMedia(true);
  }, [mode]);

  // -----------------------------
  // PAGE INCREASE → LOAD MORE
  // -----------------------------
  useEffect(() => {
    if (page > 1) {
      loadMedia(false);
    }
  }, [page]);

  // -----------------------------
  // SEARCH HANDLER
  // -----------------------------
  const search = useCallback(
    async (query: string) => {
      setSearchQuery(query);

      if (query.trim().length === 0) {
        // back to popular
        setIsSearchMode(false);
        setPage(1);
        loadMedia(true);
        return;
      }

      setIsSearchMode(true);
      setPage(1);
      setIsLoading(true);

      const data = await searchMedia(mode, query, 1);

      setMedia(data.results);
      setTotalPages(data.total_pages || 1);
      setIsLoading(false);
    },
    [mode, loadMedia]
  );

  // -----------------------------
  // CLEAR SEARCH → RESTORE POPULAR
  // -----------------------------
  const clearSearch = useCallback(() => {
    setSearchQuery("");
    setIsSearchMode(false);
    setPage(1);

    loadMedia(true);
  }, [loadMedia]);

  // -----------------------------
  // LOAD MORE FOR INFINITE SCROLL
  // -----------------------------
  const hasMore = page < totalPages;

  const loadMore = useCallback(() => {
    if (!isLoading && hasMore) {
      setPage((p) => p + 1);
    }
  }, [isLoading, hasMore]);

  return {
    media,
    trending,
    isLoading,
    hasMore,
    loadMore,
    search,
    clearSearch,
    searchQuery,
  };
}
