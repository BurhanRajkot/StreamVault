import { useMediaList } from './useMediaList'

export interface DislikeItem {
  id: string
  tmdbId: number
  mediaType: 'movie' | 'tv'
}

export function useDislikesInternal() {
  const {
    items: dislikes,
    hasItem: isDisliked,
    toggleItem: toggleDislike,
  } = useMediaList({
    endpoint: 'dislikes',
    unauthenticatedMessage: 'Please log in to use thumbs down',
    messages: {
      addSuccess: "We'll show you less of this",
      removeSuccess: 'Removed from disliked',
      addError: 'Failed to log dislike',
      removeError: 'Failed to undo dislike',
    },
  })

  return {
    dislikes: dislikes as DislikeItem[],
    isDisliked,
    toggleDislike,
  }
}
