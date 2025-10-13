// =====================================================================
// Configuration: TMDB API Key and Streaming Provider URLs
// NOTE: This approach is for organizing the client-side code.
// =====================================================================
const CONFIG = {
  TMDB_API_KEY: "668a0dd95d2a554867a2c610467fb934",
  TMDB_BASE_URL: "https://api.themoviedb.org/3",
  IMG_BASE_URL: "https://image.tmdb.org/t/p/w500",

  STREAM_PROVIDERS: {
    vidsrc: `https://vidsrc.cc/v2/embed/tv/{tmdbId}/{season}/{episode}?autoPlay=true&poster=true`,
    vidlink: `https://vidlink.pro/tv/{tmdbId}/{season}/{episode}?primaryColor=ff4747&autoplay=true`,
    autoembed: `https://player.autoembed.cc/embed/tv/{tmdbId}/{season}/{episode}`,

    vidsrc_movie: `https://vidsrc.icu/embed/movie/{tmdbId}`,
    vidlink_movie: `https://vidlink.pro/movie/{tmdbId}?primaryColor=ff4747&autoplay=true`,
    autoembed_movie: `https://player.autoembed.cc/embed/movie/{tmdbId}`,
  },
};

// --- Disclaimer DOM Elements ---
const disclaimerModal = document.getElementById("disclaimer-modal");
const acceptDisclaimerBtn = document.getElementById("accept-disclaimer-btn");

// --- Media DOM Elements ---
const main = document.getElementById("main");
const form = document.getElementById("form");
const searchInput = document.getElementById("search");
const modal = document.getElementById("modal");
const closeBtn = document.getElementById("close");
const mediaTitle = document.getElementById("media-title");
const seasonControls = document.getElementById("season-episode-controls");
const episodeInstruction = document.getElementById("episode-instruction");
const seasonInput = document.getElementById("seasonInput");
const episodeInput = document.getElementById("episodeInput");
const playBtn = document.getElementById("playBtn");
const player = document.getElementById("player");
const playbackControls = document.getElementById("playback-controls");
const modeMovieBtn = document.getElementById("mode-movie");
const modeTvBtn = document.getElementById("mode-tv");
const playerSelect = document.getElementById("playerSelect");

// --- State ---
let currentMedia = null;
let currentMode = "movie";

// --- API Helpers ---

const getPopularUrl = (mode) =>
  `${CONFIG.TMDB_BASE_URL}/discover/${mode}?sort_by=popularity.desc&api_key=${CONFIG.TMDB_API_KEY}&page=1`;
const getSearchUrl = (mode, query) =>
  `${CONFIG.TMDB_BASE_URL}/search/${mode}?api_key=${CONFIG.TMDB_API_KEY}&query=${query}`;

// --- Main Media Logic ---

async function fetchMedia(url) {
  try {
    const res = await fetch(url);
    const data = await res.json();
    showMedia(data.results);
  } catch (error) {
    console.error("Error fetching media:", error);
    main.innerHTML =
      "<p class='error-message' style='text-align:center; padding-top: 50px; color: var(--color-text-muted);'>Failed to load content. Please try again.</p>";
  }
}

function showMedia(mediaList) {
  main.innerHTML = "";
  if (mediaList.length === 0) {
    main.innerHTML =
      "<p style='text-align:center; padding-top: 50px; color: var(--color-text-muted);'>No results found.</p>";
    return;
  }

  mediaList.forEach((media) => {
    const title = media.title || media.name;
    const posterPath = media.poster_path;
    const rating = media.vote_average ? media.vote_average.toFixed(1) : "N/A";

    const mediaEl = document.createElement("div");
    mediaEl.classList.add("media-card");

    const posterURL = posterPath
      ? CONFIG.IMG_BASE_URL + posterPath
      : "https://via.placeholder.com/500x750?text=NO+POSTER";

    mediaEl.innerHTML = `
      <div class="poster-container">
          <img src="${posterURL}" alt="${title}" loading="lazy">
          <button class="play-overlay"><i class="fas fa-play"></i></button>
      </div>
      <div class="media-info">
        <h3 class="media-title">${title}</h3>
        <div class="rating"><i class="fas fa-star"></i> ${rating}</div>
        <p class="overview">${media.overview || "No description available."}</p>
      </div>
    `;

    mediaEl.addEventListener("click", () => {
      currentMedia = media;
      openModal(title);
    });

    main.appendChild(mediaEl);
  });
}

// --- Playback Modal Handlers ---

function openModal(title) {
  mediaTitle.textContent = title;

  // Controls and Play button are always visible upon opening
  playbackControls.style.display = "block";
  playBtn.style.display = "block";
  player.innerHTML = "";

  // Show/Hide season/episode controls based on mode
  if (currentMode === "tv") {
    seasonControls.style.display = "flex";
    episodeInstruction.style.display = "block";
  } else {
    seasonInput.value = 1;
    episodeInput.value = 1;
    seasonControls.style.display = "none";
    episodeInstruction.style.display = "none";
  }

  modal.style.display = "flex";
  playerSelect.value = "autoembed"; // Default selection
}

closeBtn.addEventListener("click", () => {
  modal.style.display = "none";
  player.innerHTML = "";
  currentMedia = null;
});

playBtn.addEventListener("click", () => {
  if (!currentMedia) return;

  const tmdbId = currentMedia.id;
  const apiChoice = playerSelect.value;
  let embedURL = "";
  let template = "";

  if (currentMode === "tv") {
    const season = seasonInput.value || 1;
    const episode = episodeInput.value || 1;

    // Retrieve template from CONFIG and replace placeholders
    template = CONFIG.STREAM_PROVIDERS[apiChoice];
    embedURL = template
      .replace(/\{tmdbId\}/g, tmdbId)
      .replace(/\{season\}/g, season)
      .replace(/\{episode\}/g, episode);
  } else {
    // Movie Embed Logic
    const movieApiChoice = `${apiChoice}_movie`;
    template = CONFIG.STREAM_PROVIDERS[movieApiChoice];
    embedURL = template.replace(/\{tmdbId\}/g, tmdbId);
  }

  // Inject iframe
  player.innerHTML = `
    <iframe src="${embedURL}" allowfullscreen allow="autoplay"></iframe>
  `;
});

// --- Mode Toggle and Initialization Logic ---

function initializeApp() {
  // 1. Check if disclaimer has been accepted (using sessionStorage for current session)
  if (sessionStorage.getItem("disclaimerAccepted") === "true") {
    disclaimerModal.style.display = "none";
    setMode("movie"); // Start the app immediately
  } else {
    disclaimerModal.style.display = "flex";
  }
}

// Event listener to dismiss the modal
acceptDisclaimerBtn.addEventListener("click", () => {
  sessionStorage.setItem("disclaimerAccepted", "true");
  disclaimerModal.classList.add("hidden"); // Start fade out animation

  // Use a timeout to ensure fade-out completes before removing
  setTimeout(() => {
    disclaimerModal.style.display = "none";
    setMode("movie"); // Start the app after modal is dismissed
  }, 500);
});

form.addEventListener("submit", (e) => {
  e.preventDefault();
  const searchTerm = searchInput.value.trim();
  if (searchTerm) {
    fetchMedia(getSearchUrl(currentMode, searchTerm));
    searchInput.value = "";
  } else {
    fetchMedia(getPopularUrl(currentMode));
  }
});

function setMode(mode) {
  currentMode = mode;
  modeMovieBtn.classList.remove("active");
  modeTvBtn.classList.remove("active");

  if (mode === "movie") {
    modeMovieBtn.classList.add("active");
  } else {
    modeTvBtn.classList.add("active");
  }

  // Only fetch content if the disclaimer has been accepted
  if (sessionStorage.getItem("disclaimerAccepted") === "true") {
    fetchMedia(getPopularUrl(currentMode));
  }
}

modeMovieBtn.addEventListener("click", () => setMode("movie"));
modeTvBtn.addEventListener("click", () => setMode("tv"));

// Start the application by checking the disclaimer status
initializeApp();
