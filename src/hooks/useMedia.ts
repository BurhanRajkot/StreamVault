import { useState, useEffect, useCallback } from 'react';
import { fetchPopular, fetchTrending, searchMedia } from '@/lib/api';
import { Media, MediaMode } from '@/lib/config';

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
  const [totalPages, setTotalPages] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [isSearchMode, setIsSearchMode] = useState(false);

  const loadMedia = useCallback(async (reset = false) => {
    if (mode === 'anime') {
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    const currentPage = reset ? 1 : page;

    try {
      const [mediaData, trendingData] = await Promise.all([
        isSearchMode
          ? searchMedia(mode, searchQuery, currentPage)
          : fetchPopular(mode, currentPage),
        reset ? fetchTrending(mode) : Promise.resolve(trending),
      ]);

      if (reset) {
        setMedia(mediaData.results);
        setTrending(trendingData as Media[]);
      } else {
        setMedia((prev) => [...prev, ...mediaData.results]);
      }
      setTotalPages(mediaData.total_pages);
    } catch (error) {
      console.error('Error loading media:', error);
    } finally {
      setIsLoading(false);
    }
  }, [mode, page, searchQuery, isSearchMode, trending]);

  useEffect(() => {
    setMedia([]);
    setTrending([]);
    setPage(1);
    setSearchQuery('');
    setIsSearchMode(false);
    loadMedia(true);
  }, [mode]);

  useEffect(() => {
    if (page > 1) {
      loadMedia(false);
    }
  }, [page]);

  const loadMore = useCallback(() => {
    if (!isLoading && page < totalPages) {
      setPage((p) => p + 1);
    }
  }, [isLoading, page, totalPages]);

  const search = useCallback((query: string) => {
    setSearchQuery(query);
    setIsSearchMode(true);
    setPage(1);
    setMedia([]);
    
    searchMedia(mode, query, 1).then((data) => {
      setMedia(data.results);
      setTotalPages(data.total_pages);
      setIsLoading(false);
    });
  }, [mode]);

  const clearSearch = useCallback(() => {
    setSearchQuery('');
    setIsSearchMode(false);
    setPage(1);
    loadMedia(true);
  }, [loadMedia]);

  const hasMore = page < totalPages;

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
