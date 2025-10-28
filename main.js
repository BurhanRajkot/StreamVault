// Import all our modules
import { CONFIG } from './js/config.js'
import * as dom from './js/dom.js'
import * as api from './js/api.js'
import * as ui from './js/ui.js'

// --- Application State ---
let currentMedia = null
let currentMode = 'movie'

// --- Event Handlers ---

/**
 * Handles the form submission for searching.
 */
async function handleSearch(e) {
  e.preventDefault()
  const searchTerm = dom.searchInput.value.trim()
  let url

  if (searchTerm) {
    url = api.getSearchUrl(currentMode, searchTerm)
    dom.searchInput.value = ''
  } else {
    url = api.getPopularUrl(currentMode)
  }

  loadMedia(url)
}

/**
 * Handles clicking on a media card (movie, tv, or anime sample).
 * @param {object} media - The media object that was clicked.
 */
function handleMediaClick(media) {
  currentMedia = media
  ui.openModal(media.title || media.name, currentMode, currentMedia)
}

/**
 * Handles changing the mode (Movie, TV, Anime).
 * @param {string} newMode - The mode to switch to.
 */
function handleModeChange(newMode) {
  currentMode = newMode
  ui.updateModeUI(newMode)
  loadMedia(api.getPopularUrl(currentMode))
}

/**
 * Handles the "Play" button click inside the modal.
 */
function handlePlayClick() {
  // Use 'currentMedia' if it's set (from a card click)
  // For Anime, 'currentMedia' might be null if the user just entered an ID manually
  const tmdbId = currentMedia ? currentMedia.id : null
  const apiChoice = dom.playerSelect.value
  let embedURL = ''
  let template = ''

  // --- Validate and Build URL based on Mode ---
  if (currentMode === 'tv') {
    if (!tmdbId) return alert('Please select a TV show first.')
    const season = dom.seasonInput.value || 1
    const episode = dom.episodeInput.value || 1

    template = CONFIG.STREAM_PROVIDERS[apiChoice]
    embedURL = template
      .replace(/\{tmdbId\}/g, tmdbId)
      .replace(/\{season\}/g, season)
      .replace(/\{episode\}/g, episode)
  } else if (currentMode === 'movie') {
    if (!tmdbId) return alert('Please select a movie first.')
    const movieApiChoice = `${apiChoice}_movie`
    template = CONFIG.STREAM_PROVIDERS[movieApiChoice]
    embedURL = template.replace(/\{tmdbId\}/g, tmdbId)
  } else if (currentMode === 'anime') {
    const malId = dom.malIdInput.value
    const number = dom.animeEpisodeInput.value
    const subOrDub = dom.animeTypeSelect.value

    if (!malId || !number || !subOrDub)
      return alert('Please enter the MAL ID and Episode Number.')

    // Select the correct Anime template
    const animeApiChoice = `${apiChoice}_anime`
    template = CONFIG.STREAM_PROVIDERS[animeApiChoice]

    embedURL = template
      .replace(/\{MALid\}/g, malId)
      .replace(/\{number\}/g, number)
      .replace(/\{subOrDub\}/g, subOrDub)
  }

  // Update the UI
  ui.updatePlayer(embedURL)
}

/**
 * Handles closing the playback modal.
 */
function handleModalClose() {
  ui.closeModal()
  currentMedia = null // Clear the selected media
}

/**
 * Handles accepting the disclaimer.
 */
function handleDisclaimerAccept() {
  sessionStorage.setItem('disclaimerAccepted', 'true')
  dom.disclaimerModal.classList.add('hidden') // Start fade out

  setTimeout(() => {
    dom.disclaimerModal.style.display = 'none'
    handleModeChange('movie') // Start the app
  }, 500)
}

// --- Core Logic ---

/**
 * Fetches media from a URL and tells the UI to display it.
 * @param {string} url - The API URL to fetch from.
 */
async function loadMedia(url) {
  const results = await api.fetchMedia(url)

  if (results === 'anime_placeholder') {
    ui.showAnimePlaceholder(handleMediaClick)
  } else if (results === 'error') {
    ui.showErrorMessage()
  } else {
    ui.showMedia(results, handleMediaClick)
  }
}

/**
 * Initializes the entire application.
 */
function initializeApp() {
  // --- Add All Event Listeners ---
  dom.form.addEventListener('submit', handleSearch)
  dom.closeBtn.addEventListener('click', handleModalClose)
  dom.playBtn.addEventListener('click', handlePlayClick)
  dom.acceptDisclaimerBtn.addEventListener('click', handleDisclaimerAccept)

  dom.modeMovieBtn.addEventListener('click', () => handleModeChange('movie'))
  dom.modeTvBtn.addEventListener('click', () => handleModeChange('tv'))
  dom.modeAnimeBtn.addEventListener('click', () => handleModeChange('anime'))

  // --- Check Disclaimer and Start ---
  if (sessionStorage.getItem('disclaimerAccepted') === 'true') {
    dom.disclaimerModal.style.display = 'none'
    handleModeChange('movie') // Start the app immediately
  } else {
    dom.disclaimerModal.style.display = 'flex'
  }
}

// --- Start the App ---
initializeApp()
