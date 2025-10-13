// =====================================================================
// Configuration: TMDB API Key and Streaming Provider URLs
// NOTE: 4 Player Choices implemented as requested.
// =====================================================================
const CONFIG = {
  TMDB_API_KEY: "668a0dd95d2a554867a2c610467fb934",
  TMDB_BASE_URL: "https://api.themoviedb.org/3",
  MAL_BASE_URL: "https://api.jikan.moe/v4", // Conceptual MAL API
  IMG_BASE_URL: "https://image.tmdb.org/t/p/w500",

  // STREAM PROVIDER TEMPLATES (4 Choices for each media type)
  STREAM_PROVIDERS: {
    // --- TV/Show Embed Templates (Used for TV mode) ---
    vidsrc_icu: `https://vidsrc.icu/embed/tv/{tmdbId}/{season}/{episode}`,
    vidlink_pro: `https://vidlink.pro/tv/{tmdbId}/{season}/{episode}?primaryColor=ff4747&autoplay=true`,
    vidsrc_cc: `https://vidsrc.cc/v2/embed/tv/{tmdbId}/{season}/{episode}?autoPlay=true&poster=true`,
    autoembed: `https://player.autoembed.cc/embed/tv/{tmdbId}/{season}/{episode}`,

    // --- Movie Embed Templates (Used for Movie mode) ---
    vidsrc_icu_movie: `https://vidsrc.icu/embed/movie/{tmdbId}`,
    vidlink_pro_movie: `https://vidlink.pro/movie/{tmdbId}?primaryColor=ff4747&autoplay=true`,
    vidsrc_cc_movie: `https://vidsrc.cc/v2/embed/movie/{tmdbId}?autoPlay=true&poster=true`,
    autoembed_movie: `https://player.autoembed.cc/embed/movie/{tmdbId}`,

    // --- Anime Embed Templates (Used for Anime mode) ---
    vidsrc_icu_anime: `https://vidsrc.icu/embed/anime/{MALid}/{number}/{subOrDub}`,
    vidlink_pro_anime: `https://vidlink.pro/anime/{MALid}/{number}/{subOrDub}?fallback=true`,
    vidsrc_cc_anime: `https://vidsrc.cc/v2/embed/anime/{MALid}/{number}/{subOrDub}?autoPlay=true`,
    autoembed_anime: `https://player.autoembed.cc/embed/anime/{MALid}/{number}/{subOrDub}`,
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

// TV/Show Controls
const seasonControls = document.getElementById("season-episode-controls");
const episodeInstruction = document.getElementById("episode-instruction");
const seasonInput = document.getElementById("seasonInput");
const episodeInput = document.getElementById("episodeInput");

// Anime Controls (New)
const animeControls = document.getElementById("anime-controls");
const animeInstruction = document.getElementById("anime-instruction");
const malIdInput = document.getElementById("malIdInput");
const animeEpisodeInput = document.getElementById("animeEpisodeInput");
const animeTypeSelect = document.getElementById("animeTypeSelect");

// Shared Controls
const playBtn = document.getElementById("playBtn");
const player = document.getElementById("player");
const playbackControls = document.getElementById("playback-controls");
const modeMovieBtn = document.getElementById("mode-movie");
const modeTvBtn = document.getElementById("mode-tv");
const modeAnimeBtn = document.getElementById("mode-anime");
const playerSelect = document.getElementById("playerSelect");

// --- State ---
let currentMedia = null;
let currentMode = "movie";

// --- API Helpers ---

const getPopularUrl = (mode) => {
  if (mode === "anime") {
    return null;
  }
  return `${CONFIG.TMDB_BASE_URL}/discover/${mode}?sort_by=popularity.desc&api_key=${CONFIG.TMDB_API_KEY}&page=1`;
};
const getSearchUrl = (mode, query) => {
  if (mode === "anime") {
    return null;
  }
  return `${CONFIG.TMDB_BASE_URL}/search/${mode}?api_key=${CONFIG.TMDB_API_KEY}&query=${query}`;
};

// --- Main Media Logic ---

async function fetchMedia(url) {
  if (url === null) {
    showAnimePlaceholder();
    return;
  }

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

function showAnimePlaceholder() {
  main.innerHTML = `
        <div style="text-align: center; padding: 100px 20px; color: var(--color-text-muted);">
            <i class="fas fa-search" style="font-size: 2.5rem; color: var(--color-primary); margin-bottom: 15px;"></i>
            <h3 style="color: var(--color-primary);">Anime Mode</h3>
            <p>To watch Anime, please enter the **MAL ID** and **Episode Number** directly into the modal after clicking any button below, or use the search bar to find placeholders.</p>
            <p style="font-size: 0.8rem; margin-top: 10px;">(Anime listings require integration with a specific Anime API/database, which is skipped in this client-side demo.)</p>
            <div style="display: flex; justify-content: center; gap: 20px; margin-top: 30px;">
                <div class="media-card" onclick="currentMedia={id: 5, name: 'Sample Anime'}; openModal('Sample Anime');" style="cursor: pointer; width: 150px;">
                    <div class="poster-container" style="height: 200px;"><img src="https://via.placeholder.com/150x200?text=Anime+1" alt="Anime" loading="lazy"></div>
                    <div class="media-info">Sample Anime (ID: 5)</div>
                </div>
                <div class="media-card" onclick="currentMedia={id: 20, name: 'Sample Anime 2'}; openModal('Sample Anime 2');" style="cursor: pointer; width: 150px;">
                    <div class="poster-container" style="height: 200px;"><img src="https://via.placeholder.com/150x200?text=Anime+2" alt="Anime" loading="lazy"></div>
                    <div class="media-info">Sample Anime 2 (ID: 20)</div>
                </div>
            </div>
        </div>
    `;
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

  // Reset inputs for safe measure
  seasonInput.value = 1;
  episodeInput.value = 1;
  animeEpisodeInput.value = 1;
  malIdInput.value =
    currentMedia && currentMode === "anime" ? currentMedia.id : ""; // Pre-fill MAL ID if available

  // Logic to show controls based on currentMode
  if (currentMode === "tv" || currentMode === "movie") {
    // Show TV controls for TV, hide for Movie
    seasonControls.style.display = currentMode === "tv" ? "flex" : "none";
    episodeInstruction.style.display = currentMode === "tv" ? "block" : "none";

    animeControls.style.display = "none";
    animeInstruction.style.display = "none";
  } else if (currentMode === "anime") {
    // Show Anime controls
    seasonControls.style.display = "none";
    episodeInstruction.style.display = "none";

    animeControls.style.display = "flex";
    animeInstruction.style.display = "block";
  }

  modal.style.display = "flex";
  playerSelect.value = "vidsrc_icu"; // Set default to the new top source
}

closeBtn.addEventListener("click", () => {
  modal.style.display = "none";
  player.innerHTML = "";
  currentMedia = null;
});

playBtn.addEventListener("click", () => {
  if (!currentMedia) {
    if (currentMode === "anime") {
      // Allow playback directly from the modal inputs if no card was clicked (e.g. user manually enters ID)
    } else {
      return alert("Please select a title first.");
    }
  }

  const tmdbId = currentMedia ? currentMedia.id : null;
  const apiChoice = playerSelect.value;
  let embedURL = "";
  let template = "";

  // --- Validate and Build URL based on Mode ---
  if (currentMode === "tv") {
    const season = seasonInput.value || 1;
    const episode = episodeInput.value || 1;

    template = CONFIG.STREAM_PROVIDERS[apiChoice];
    embedURL = template
      .replace(/\{tmdbId\}/g, tmdbId)
      .replace(/\{season\}/g, season)
      .replace(/\{episode\}/g, episode);
  } else if (currentMode === "movie") {
    const movieApiChoice = `${apiChoice}_movie`;
    template = CONFIG.STREAM_PROVIDERS[movieApiChoice];
    embedURL = template.replace(/\{tmdbId\}/g, tmdbId);
  } else if (currentMode === "anime") {
    const malId = malIdInput.value;
    const number = animeEpisodeInput.value;
    const subOrDub = animeTypeSelect.value;

    if (!malId || !number || !subOrDub)
      return alert("Please enter the MAL ID and Episode Number.");

    // Select the correct Anime template
    const animeApiChoice = `${apiChoice}_anime`;
    template = CONFIG.STREAM_PROVIDERS[animeApiChoice];

    embedURL = template
      .replace(/\{MALid\}/g, malId)
      .replace(/\{number\}/g, number)
      .replace(/\{subOrDub\}/g, subOrDub);
  }

  // Inject iframe
  if (embedURL) {
    player.innerHTML = `
      <iframe src="${embedURL}" allowfullscreen allow="autoplay"></iframe>
    `;
  }
});

// --- Mode Toggle and Initialization Logic ---

function initializeApp() {
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
  modeAnimeBtn.classList.remove("active");

  // Set search placeholder based on mode
  if (mode === "movie") {
    modeMovieBtn.classList.add("active");
    searchInput.placeholder = "Search movies...";
  } else if (mode === "tv") {
    modeTvBtn.classList.add("active");
    searchInput.placeholder = "Search TV shows...";
  } else if (mode === "anime") {
    modeAnimeBtn.classList.add("active");
    searchInput.placeholder = "Search anime...";
  }

  // Fetch content
  if (sessionStorage.getItem("disclaimerAccepted") === "true") {
    fetchMedia(getPopularUrl(currentMode));
  }
}

modeMovieBtn.addEventListener("click", () => setMode("movie"));
modeTvBtn.addEventListener("click", () => setMode("tv"));
modeAnimeBtn.addEventListener("click", () => setMode("anime"));

// Start the application by checking the disclaimer status
initializeApp();
