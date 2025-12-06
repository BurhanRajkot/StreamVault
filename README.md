.

🎬 StreamVault — My Personal Streaming Hub

This is a project I built to create a clean, fast, and modern media streaming website.
The goal was simple:
one place where I can browse movies, TV shows, and anime with a smooth UI and stream them instantly.

I didn't want a bulky website, slow backend, or anything complex — just a polished frontend powered by APIs.

🚀 What This Project Does

Shows trending, popular, and top-rated movies/series/anime

Lets you search and explore media

Opens a clean streaming player inside a modal

Fetches all metadata (title, overview, posters, ratings) from TMDB API

Uses external embedded streaming sources to play the content

Fully responsive for mobile, tablet, laptop

Clean UI built with Tailwind + ShadCN

My goal is simplicity + speed + a modern frontend feel.

🧩 Why I Built This

I wanted to learn:

How to structure a proper React + TypeScript project

How to use Vite for a fast dev environment

How to build reusable UI components

How to integrate external APIs (TMDB)

How to design a streaming-style UI (like Zoro, AniWatch, etc.)

How to manage modals, carousels, grids, and dynamic data

And I wanted a personal project that I could actually use as a media hub.

📂 Main Features (Explained Simply)
⭐ Hero Carousel

Shows featured movies with big posters and smooth sliding animation.

⭐ Media Grid

Clean card-based layout for browsing.
Includes posters, title, year, rating, and a hover effect.

⭐ Anime Section

A dedicated space for anime fans — pulls anime data from TMDB categories.

⭐ Streaming Player

When you click on any movie/series:
→ A player modal opens
→ The stream loads using an embed source
→ You can close it without leaving the page

⭐ Disclaimer Modal

Shows a disclaimer about external links and streaming rights.

⭐ Reusable UI Components

All dropdowns, dialogs, cards, buttons, etc. are from ShadCN, but I customized a lot of them.

🛠️ Tech Stack I Used

React + TypeScript → for structure and reliable code

Vite → super fast dev server

TailwindCSS → styling without writing CSS files

ShadCN UI → modern UI components

TMDB API → to fetch movies/series/anime

Custom Hooks (useMedia, use-mobile)

External streaming providers for video playback

This stack makes the project extremely fast and modular.

📁 Folder Structure (My Explanation)
src/
├── components/     → All UI pieces (header, cards, modals, etc.)
├── pages/          → Main pages like Home + Not Found
├── hooks/          → Custom logic (media fetching, toast, mobile view)
├── lib/            → API config + helper functions
├── main.tsx        → App entry point
├── App.tsx         → Routes + layout
└── index.css       → Global styles


I kept everything clean, modular, and easy to navigate.

🔧 How to Run It
npm install
npm run dev


Then open:

http://localhost:5173


If you want to use TMDB, create a .env file:

VITE_TMDB_API_KEY=your_api_key

🧭 Future Plans

Better player source switching

Episode selector for TV shows

Watchlist + user preferences

Animations for section transitions

Deploy to Vercel / Netlify

📝 Final Notes from Me

This is still a work-in-progress, but it already feels like a real streaming website.
I’m building it mainly to learn, experiment, and create something I actually enjoy using.

If you want me to make a LOGO, landing page screenshot, badges, or a better formatted README, just tell me — I can upgrade this further.
