import { CONFIG } from './config.js'
import * as dom from './dom.js'

/**
 * Shows the placeholder content for Anime mode.
 * @param {function} onSampleClick - Callback function when a sample is clicked.
 */
export function showAnimePlaceholder(onSampleClick) {
  dom.main.innerHTML = `
    <div style="text-align: center; padding: 100px 20px; color: var(--color-text-muted);">
        <i class="fas fa-search" style="font-size: 2.5rem; color: var(--color-primary); margin-bottom: 15px;"></i>
        <h3 style="color: var(--color-primary);">Anime Mode</h3>
        <p>To watch Anime, please enter the **MAL ID** and **Episode Number** directly into the modal after clicking any button below, or use the search bar to find placeholders.</p>
        <p style="font-size: 0.8rem; margin-top: 10px;">(Anime listings require integration with a specific Anime API/database, which is skipped in this client-side demo.)</p>
        <div style="display: flex; justify-content: center; gap: 20px; margin-top: 30px;">
            <div class="media-card" data-id="5" data-name="Sample Anime" style="cursor: pointer; width: 150px;">
                <div class="poster-container" style="height: 200px;"><img src="https://via.placeholder.com/150x200?text=Anime+1" alt="Anime" loading="lazy"></div>
                <div class="media-info">Sample Anime (ID: 5)</div>
            </div>
            <div class="media-card" data-id="20" data-name="Sample Anime 2" style="cursor: pointer; width: 150px;">
                <div class="poster-container" style="height: 200px;"><img src="https://via.placeholder.com/150x200?text=Anime+2" alt="Anime" loading="lazy"></div>
                <div class="media-info">Sample Anime 2 (ID: 20)</div>
            </div>
        </div>
    </div>
  `

  // Add event listeners to the new sample cards
  dom.main.querySelectorAll('.media-card').forEach((card) => {
    card.addEventListener('click', () => {
      const sampleMedia = {
        id: card.dataset.id,
        name: card.dataset.name,
      }
      onSampleClick(sampleMedia) // Call the main controller's handler
    })
  })
}

/**
 * Displays a list of media (movies or TV shows) in the main grid.
 * @param {Array} mediaList - The list of media objects from the API.
 * @param {function} onMediaClick - Callback function when a card is clicked.
 */
export function showMedia(mediaList, onMediaClick) {
  dom.main.innerHTML = ''
  if (mediaList.length === 0) {
    dom.main.innerHTML =
      "<p style='text-align:center; padding-top: 50px; color: var(--color-text-muted);'>No results found.</p>"
    return
  }

  mediaList.forEach((media) => {
    const title = media.title || media.name
    const posterPath = media.poster_path
    const rating = media.vote_average ? media.vote_average.toFixed(1) : 'N/A'

    const mediaEl = document.createElement('div')
    mediaEl.classList.add('media-card')

    const posterURL = posterPath
      ? CONFIG.IMG_BASE_URL + posterPath
      : 'https://via.placeholder.com/500x750?text=NO+POSTER'

    mediaEl.innerHTML = `
      <div class="poster-container">
          <img src="${posterURL}" alt="${title}" loading="lazy">
          <button class="play-overlay"><i class="fas fa-play"></i></button>
      </div>
      <div class="media-info">
        <h3 class="media-title">${title}</h3>
        <div class="rating"><i class="fas fa-star"></i> ${rating}</div>
        <p class="overview">${media.overview || 'No description available.'}</p>
      </div>
    `

    mediaEl.addEventListener('click', () => {
      onMediaClick(media) // Call the main controller's handler
    })

    dom.main.appendChild(mediaEl)
  })
}

/**
 * Shows an error message in the main grid.
 */
export function showErrorMessage() {
  dom.main.innerHTML =
    "<p class='error-message' style='text-align:center; padding-top: 50px; color: var(--color-text-muted);'>Failed to load content. Please try again.</p>"
}

/**
 * Opens and configures the playback modal based on the current mode and media.
 * @param {string} title - The title of the media.
 * @param {string} currentMode - The current active mode ('movie', 'tv', 'anime').
 * @param {object} currentMedia - The media object (can be null for anime).
 */
export function openModal(title, currentMode, currentMedia) {
  dom.mediaTitle.textContent = title

  // Controls and Play button are always visible upon opening
  dom.playbackControls.style.display = 'block'
  dom.playBtn.style.display = 'block'
  dom.player.innerHTML = ''

  // Reset inputs for safe measure
  dom.seasonInput.value = 1
  dom.episodeInput.value = 1
  dom.animeEpisodeInput.value = 1
  dom.malIdInput.value =
    currentMedia && currentMode === 'anime' ? currentMedia.id : '' // Pre-fill MAL ID

  // Logic to show controls based on currentMode
  if (currentMode === 'tv' || currentMode === 'movie') {
    // Show TV controls for TV, hide for Movie
    dom.seasonControls.style.display = currentMode === 'tv' ? 'flex' : 'none'
    dom.episodeInstruction.style.display =
      currentMode === 'tv' ? 'block' : 'none'

    dom.animeControls.style.display = 'none'
    dom.animeInstruction.style.display = 'none'
  } else if (currentMode === 'anime') {
    // Show Anime controls
    dom.seasonControls.style.display = 'none'
    dom.episodeInstruction.style.display = 'none'

    dom.animeControls.style.display = 'flex'
    dom.animeInstruction.style.display = 'block'
  }

  dom.modal.style.display = 'flex'
  dom.playerSelect.value = 'vidfast_pro' // Set default to the top source
}

/**
 * Closes the playback modal and clears the player.
 */
export function closeModal() {
  dom.modal.style.display = 'none'
  dom.player.innerHTML = ''
}

/**
 * Injects the iframe player with the given URL.
 * @param {string} embedURL - The final URL for the iframe src.
 */
export function updatePlayer(embedURL) {
  if (embedURL) {
    dom.player.innerHTML = `
      <iframe src="${embedURL}" allowfullscreen allow="autoplay"></iframe>
    `
  }
}

/**
 * Updates the UI (buttons, placeholder) based on the selected mode.
 * @param {string} mode - The new mode ('movie', 'tv', 'anime').
 */
export function updateModeUI(mode) {
  dom.modeMovieBtn.classList.remove('active')
  dom.modeTvBtn.classList.remove('active')
  dom.modeAnimeBtn.classList.remove('active')

  // Set search placeholder based on mode
  if (mode === 'movie') {
    dom.modeMovieBtn.classList.add('active')
    dom.searchInput.placeholder = 'Search movies...'
  } else if (mode === 'tv') {
    dom.modeTvBtn.classList.add('active')
    dom.searchInput.placeholder = 'Search TV shows...'
  } else if (mode === 'anime') {
    dom.modeAnimeBtn.classList.add('active')
    dom.searchInput.placeholder = 'Search anime...'
  }
}
