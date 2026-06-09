import { GlobalRegistrator } from '@happy-dom/global-registrator'
GlobalRegistrator.register()

import { describe, it, expect, mock, beforeEach, afterEach } from 'bun:test'
import { renderHook, cleanup } from '@testing-library/react'
import { useDislikesInternal } from './useDislikes'

// Mock dependencies
const mockUseAuth0 = mock()
mock.module('@auth0/auth0-react', () => ({
  useAuth0: mockUseAuth0,
}))

const mockUseMediaList = mock()
mock.module('./useMediaList', () => ({
  useMediaList: mockUseMediaList,
}))

describe('useDislikesInternal', () => {
  beforeEach(() => {
    mockUseAuth0.mockClear()
    mockUseMediaList.mockClear()
  })

  afterEach(() => {
    mock.restore()
    cleanup()
  })

  it('should correctly configure and map values when user is authenticated', () => {
    const mockUser = { sub: 'auth0|123456' }
    mockUseAuth0.mockReturnValue({ user: mockUser })

    const mockMediaListReturn = {
      items: [{ id: '1', tmdbId: 100, mediaType: 'movie' }],
      hasItem: mock(),
      toggleItem: mock(),
    }
    mockUseMediaList.mockReturnValue(mockMediaListReturn)

    const { result } = renderHook(() => useDislikesInternal())

    // Check useMediaList was called with correct configuration
    expect(mockUseMediaList).toHaveBeenCalledWith({
      endpoint: 'dislikes',
      unauthenticatedMessage: 'Please log in to use thumbs down',
      messages: {
        addSuccess: "We'll show you less of this",
        removeSuccess: 'Removed from disliked',
        addError: 'Failed to log dislike',
        removeError: 'Failed to undo dislike',
      },
      userId: mockUser.sub,
    })

    // Check mapping of return values
    expect(result.current.dislikes).toEqual(mockMediaListReturn.items)
    expect(result.current.isDisliked).toBe(mockMediaListReturn.hasItem)
    expect(result.current.toggleDislike).toBe(mockMediaListReturn.toggleItem)
  })

  it('should gracefully default userId to null when user is undefined', () => {
    mockUseAuth0.mockReturnValue({ user: undefined })

    mockUseMediaList.mockReturnValue({
      items: [],
      hasItem: mock(),
      toggleItem: mock(),
    })

    renderHook(() => useDislikesInternal())

    expect(mockUseMediaList).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: null,
      })
    )
  })

  it('should gracefully default userId to null when user is null', () => {
    mockUseAuth0.mockReturnValue({ user: null })

    mockUseMediaList.mockReturnValue({
      items: [],
      hasItem: mock(),
      toggleItem: mock(),
    })

    renderHook(() => useDislikesInternal())

    expect(mockUseMediaList).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: null,
      })
    )
  })
})
