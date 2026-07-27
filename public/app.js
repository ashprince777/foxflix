const API_URL = '/api';

const movieGrid = document.getElementById('movieGrid');
// Hero references — using actual IDs from index.html
const heroTitle = document.getElementById('featuredTitle');
const heroPlayBtn = document.getElementById('playFeatured');

let allMovies = [];
const videoPlayer = document.getElementById('videoPlayer');
const playerOverlay = document.getElementById('playerOverlay');
const closePlayerBtn = document.getElementById('closePlayer');
const playerTitle = document.getElementById('playerTitle');
const searchInput = document.getElementById('searchInput');

// Custom Controls DOM
const btnPlayPause = document.getElementById('btnPlayPause');
const btnRewind = document.getElementById('btnRewind');
const btnForward = document.getElementById('btnForward');
const btnMute = document.getElementById('btnMute');
const volumeSlider = document.getElementById('volumeSlider');
const btnFullscreen = document.getElementById('btnFullscreen');
const progressContainer = document.getElementById('progressContainer');
const progressBar = document.getElementById('progressBar');
const timeDisplay = document.getElementById('timeDisplay');
const customControls = document.getElementById('customControls');
const btnSubtitles = document.getElementById('btnSubtitles');
const btnAudio = document.getElementById('btnAudio');
const videoContainer = document.querySelector('.video-container');
const trackSelector = document.createElement('div');
trackSelector.className = 'track-selector';
if (videoContainer) videoContainer.appendChild(trackSelector);

const subtitleSelector = document.createElement('div');
subtitleSelector.className = 'subtitle-selector';
if (videoContainer) videoContainer.appendChild(subtitleSelector);

let currentAudioTrack = 0;
let audioTracks = [];
let currentStartOffset = 0;

let currentMovie = null;

// Clean Title Logic
function cleanTitle(title) {
    let clean = title.replace(/\.(mp4|mkv|avi|webm)$/i, '');
    clean = clean.replace(/[\(\[\{\s]?\b(19|20)\d{2}\b.*$/, '');
    const junk = /\b(HD|HQ|PreDVD|DVD|BluRay|BRRip|WEBRip|WEB-DL|x264|x265|AAC|ESub|400MB|720p|1080p|HDRip|Clean|Tamil)\b.*/gi;
    clean = clean.replace(junk, '');
    clean = clean.replace(/[^\w\s]/gi, ' ').replace(/\s+/g, ' ').trim();
    return clean;
}

// Spatial Navigation Manager for Smart TVs / D-Pad Remotes (Jio STB, Android TV, Fire TV, Tizen, webOS)
class SpatialNavigation {
    constructor() {
        this.focusedElement = null;
        this.isDpadActive = false;
        this.initEventListeners();
    }

    initEventListeners() {
        const handleKeyEvent = (e) => {
            const action = this.normalizeKey(e);
            if (!action) return;

            // Prevent default OS/Browser actions (scrolling, exiting webview on BACK key, space submit)
            if (e.cancelable !== false) {
                e.preventDefault();
            }

            this.activateDpadMode();

            const activeEl = document.activeElement;
            const isInput = activeEl && ['INPUT', 'TEXTAREA', 'SELECT'].includes(activeEl.tagName);

            if (isInput) {
                if (action === 'BACK' || action === 'DOWN') {
                    activeEl.blur();
                    this.autoFocus();
                    return;
                }
                if (action === 'ENTER') {
                    return; // Allow standard form/input action
                }
                if (['UP', 'LEFT', 'RIGHT'].includes(action)) {
                    return; // Allow text navigation inside input field
                }
            }

            this.handleAction(action, e);
        };

        // Listen on capturing phase to catch Jio STB remote key presses reliably
        document.addEventListener('keydown', handleKeyEvent, true);

        // Filter out tiny mouse jitter / air-mouse drift on Jio STB remotes
        let lastX = 0, lastY = 0;
        document.addEventListener('mousemove', (e) => {
            if (Math.abs(e.clientX - lastX) > 15 || Math.abs(e.clientY - lastY) > 15) {
                lastX = e.clientX;
                lastY = e.clientY;
                if (this.isDpadActive && !document.body.classList.contains('tv-device')) {
                    this.isDpadActive = false;
                }
            }
        });

        // Sync focus state when elements receive native focus or mouse click
        document.addEventListener('focusin', (e) => {
            if (e.target && e.target !== this.focusedElement && e.target.nodeType === 1) {
                if (this.isFocusable(e.target)) {
                    this.setFocus(e.target, false);
                }
            }
        });

        // Auto focus initial element on ready
        const readyHandler = () => setTimeout(() => this.autoFocus(), 300);
        if (document.readyState === 'loading') {
            window.addEventListener('DOMContentLoaded', readyHandler);
        } else {
            readyHandler();
        }
    }

    activateDpadMode() {
        this.isDpadActive = true;
        document.body.classList.add('tv-dpad-active');
    }

    normalizeKey(e) {
        const code = e.keyCode || e.which || 0;
        const key = e.key || '';
        const keyName = e.code || '';

        // UP: 38 (Standard), 19 (Android DPAD_UP), 1003 (Vendor TV UP), W, Numpad8
        if (code === 38 || code === 19 || code === 1003 || keyName === 'ArrowUp' || keyName === 'KeyW' || keyName === 'Numpad8' || ['ArrowUp', 'Up', 'UIKeyInputUp'].includes(key)) {
            return 'UP';
        }

        // DOWN: 40 (Standard), 20 (Android DPAD_DOWN), 1005 (Vendor TV DOWN), S, Numpad2
        if (code === 40 || code === 20 || code === 1005 || keyName === 'ArrowDown' || keyName === 'KeyS' || keyName === 'Numpad2' || ['ArrowDown', 'Down', 'UIKeyInputDown'].includes(key)) {
            return 'DOWN';
        }

        // LEFT: 37 (Standard), 21 (Android DPAD_LEFT), 1001 (Vendor TV LEFT), A, Numpad4
        if (code === 37 || code === 21 || code === 1001 || keyName === 'ArrowLeft' || keyName === 'KeyA' || keyName === 'Numpad4' || ['ArrowLeft', 'Left', 'UIKeyInputLeft'].includes(key)) {
            return 'LEFT';
        }

        // RIGHT: 39 (Standard), 22 (Android DPAD_RIGHT), 1002 (Vendor TV RIGHT), D, Numpad6
        if (code === 39 || code === 22 || code === 1002 || keyName === 'ArrowRight' || keyName === 'KeyD' || keyName === 'Numpad6' || ['ArrowRight', 'Right', 'UIKeyInputRight'].includes(key)) {
            return 'RIGHT';
        }

        // ENTER / OK / SELECT:
        // 13 (Standard), 23 (Android DPAD_CENTER), 66 (Android ENTER), 160 (Numpad Enter / Jio OK), 1004 (Jio / TV OK), 273, 294, 32 (Space)
        if (code === 13 || code === 23 || code === 66 || code === 160 || code === 1004 || code === 273 || code === 294 || code === 32 ||
            ['Enter', 'NumpadEnter', 'Select', 'Space'].includes(keyName) ||
            ['Enter', 'Select', 'Accept', 'OK', 'Ok', 'Center', 'UIKeyInputEnter', ' '].includes(key)) {
            return 'ENTER';
        }

        // BACK:
        // 27 (Escape), 8 (Backspace), 4 (Android KEYCODE_BACK), 166 (Android NAVIGATE_BACK / Browser Back), 461 (webOS), 10009 (Tizen), 200
        if (code === 27 || code === 8 || code === 4 || code === 166 || code === 461 || code === 10009 || code === 200 ||
            ['Escape', 'Backspace', 'BrowserBack', 'GoBack', 'Back'].includes(keyName) ||
            ['Escape', 'Backspace', 'GoBack', 'Back', 'BrowserBack', 'Esc', 'U+0004'].includes(key)) {
            return 'BACK';
        }

        // MEDIA PLAY / PAUSE
        if (code === 179 || code === 85 || code === 126 || code === 127 || ['MediaPlayPause', 'MediaPlay', 'MediaPause'].includes(keyName) || ['MediaPlayPause', 'MediaPlay', 'MediaPause', 'Play', 'Pause'].includes(key)) {
            return 'PLAY_PAUSE';
        }

        // MEDIA REWIND
        if (code === 227 || code === 412 || keyName === 'MediaRewind' || ['MediaRewind', 'Rewind'].includes(key)) {
            return 'REWIND';
        }

        // MEDIA FAST FORWARD
        if (code === 228 || code === 417 || keyName === 'MediaFastForward' || ['MediaFastForward', 'FastForward'].includes(key)) {
            return 'FAST_FORWARD';
        }

        // CHANNEL UP / DOWN
        if (code === 33 || code === 427 || keyName === 'PageUp' || key === 'ChannelUp') return 'CH_UP';
        if (code === 34 || code === 428 || keyName === 'PageDown' || key === 'ChannelDown') return 'CH_DOWN';

        return null;
    }

    isFocusable(el) {
        if (!el || el.nodeType !== 1) return false;
        const style = window.getComputedStyle(el);
        if (style.display === 'none' || style.visibility === 'hidden' || style.opacity === '0') return false;
        const rect = el.getBoundingClientRect();
        return rect.width > 0 && rect.height > 0;
    }

    getFocusables() {
        const modal = document.querySelector('.details-modal-overlay.active, .player-overlay.active, #settingsModal[style*="display: flex"], #settingsModal[style*="display:flex"], #installModal[style*="display: flex"], #installModal[style*="display:flex"]');
        const container = modal || document;
        const selectors = '.focusable, .movie-card, .genre-chip, .season-tab, .track-item, .sub-dl-item, .channel-card, button, input, select, a[href]';
        
        const list = Array.from(container.querySelectorAll(selectors)).filter(el => this.isFocusable(el));
        
        list.forEach(el => {
            if (!el.hasAttribute('tabindex')) el.setAttribute('tabindex', '0');
        });
        
        return list;
    }

    autoFocus() {
        const focusables = this.getFocusables();
        if (focusables.length === 0) return;

        if (!this.focusedElement || !focusables.includes(this.focusedElement) || !this.isFocusable(this.focusedElement)) {
            const heroPlay = document.getElementById('playFeatured');
            const detailsPlay = document.getElementById('detailsPlayBtn');
            const playerPlay = document.getElementById('btnPlayPause');
            
            if (focusables.includes(playerPlay)) this.setFocus(playerPlay);
            else if (focusables.includes(detailsPlay)) this.setFocus(detailsPlay);
            else if (focusables.includes(heroPlay)) this.setFocus(heroPlay);
            else this.setFocus(focusables[0]);
        }
    }

    handleAction(action, event) {
        const focusables = this.getFocusables();
        if (focusables.length === 0) return;

        // If no element is focused yet, initialize focus and perform action if ENTER
        if (!this.focusedElement || !focusables.includes(this.focusedElement) || !this.isFocusable(this.focusedElement)) {
            this.autoFocus();
            if (action === 'ENTER' && this.focusedElement) {
                this.focusedElement.click();
                return;
            }
            if (!['UP', 'DOWN', 'LEFT', 'RIGHT'].includes(action)) return;
        }

        if (action === 'ENTER') {
            if (this.focusedElement) {
                this.focusedElement.click();
            }
            return;
        }

        if (action === 'BACK') {
            const settingsModal = document.getElementById('settingsModal');
            const detailsModal = document.getElementById('detailsModal');
            const playerOverlay = document.getElementById('playerOverlay');
            const installModal = document.getElementById('installModal');

            if (playerOverlay && playerOverlay.classList.contains('active')) {
                stopAndClosePlayer();
                setTimeout(() => this.autoFocus(), 100);
            } else if (detailsModal && detailsModal.classList.contains('active')) {
                closeDetailsModal();
                setTimeout(() => this.autoFocus(), 100);
            } else if (settingsModal && (settingsModal.style.display === 'flex' || settingsModal.style.display === 'block')) {
                settingsModal.style.display = 'none';
                setTimeout(() => this.autoFocus(), 100);
            } else if (installModal && (installModal.style.display === 'flex' || installModal.style.display === 'block')) {
                closeInstallModal();
                setTimeout(() => this.autoFocus(), 100);
            }
            return;
        }

        if (action === 'PLAY_PAUSE') {
            const playerOverlay = document.getElementById('playerOverlay');
            const btnPlayPause = document.getElementById('btnPlayPause');
            if (playerOverlay && playerOverlay.classList.contains('active') && btnPlayPause) {
                btnPlayPause.click();
            } else if (this.focusedElement) {
                this.focusedElement.click();
            }
            return;
        }

        if (action === 'REWIND') {
            const playerOverlay = document.getElementById('playerOverlay');
            if (playerOverlay && playerOverlay.classList.contains('active') && typeof skip === 'function') {
                skip(-10);
            }
            return;
        }

        if (action === 'FAST_FORWARD') {
            const playerOverlay = document.getElementById('playerOverlay');
            if (playerOverlay && playerOverlay.classList.contains('active') && typeof skip === 'function') {
                skip(10);
            }
            return;
        }

        // Directional Spatial Navigation Vector Geometry
        const currentRect = this.focusedElement.getBoundingClientRect();
        const curX = currentRect.left + currentRect.width / 2;
        const curY = currentRect.top + currentRect.height / 2;

        let bestCandidate = null;
        let minScore = Infinity;

        focusables.forEach(candidate => {
            if (candidate === this.focusedElement) return;
            const candRect = candidate.getBoundingClientRect();
            const cX = candRect.left + candRect.width / 2;
            const cY = candRect.top + candRect.height / 2;

            let inDirection = false;
            let dPrimary = 0;
            let dOrthogonal = 0;

            if (action === 'RIGHT') {
                if (cX > curX + 2) {
                    inDirection = true;
                    dPrimary = cX - curX;
                    dOrthogonal = Math.abs(cY - curY);
                }
            } else if (action === 'LEFT') {
                if (cX < curX - 2) {
                    inDirection = true;
                    dPrimary = curX - cX;
                    dOrthogonal = Math.abs(cY - curY);
                }
            } else if (action === 'DOWN') {
                if (cY > curY + 2) {
                    inDirection = true;
                    dPrimary = cY - curY;
                    dOrthogonal = Math.abs(cX - curX);
                }
            } else if (action === 'UP') {
                if (cY < curY - 2) {
                    inDirection = true;
                    dPrimary = curY - cY;
                    dOrthogonal = Math.abs(cX - curX);
                }
            }

            if (inDirection) {
                // Weighted distance formula: favor candidates closer along primary axis
                const score = dPrimary + (2.5 * dOrthogonal);
                if (score < minScore) {
                    minScore = score;
                    bestCandidate = candidate;
                }
            }
        });

        if (bestCandidate) {
            this.setFocus(bestCandidate);
        }
    }

    setFocus(el, shouldScroll = true) {
        if (!el || !this.isFocusable(el)) return;

        if (this.focusedElement && this.focusedElement !== el) {
            this.focusedElement.classList.remove('focused');
        }

        this.focusedElement = el;
        el.classList.add('focused');

        try {
            el.focus({ preventScroll: true });
        } catch (e) {
            el.focus();
        }

        if (shouldScroll) {
            el.scrollIntoView({ block: 'nearest', inline: 'nearest', behavior: 'smooth' });
        }
    }
}

window.spatialNav = new SpatialNavigation();

let currentSelectedGenre = 'All';

// Load Movies
async function loadMovies() {
    try {
        const res = await fetch(`${API_URL}/movies`);
        const movies = await res.json();
        allMovies = movies;
        renderHero(movies);
        renderGenreFilters(movies);
        renderContinueWatching(movies);
        renderMovies(movies);
    } catch (err) {
        console.error('Failed to load movies:', err);
    }
}

function renderGenreFilters(movies) {
    const genreContainer = document.getElementById('genreFilters');
    if (!genreContainer) return;

    genreContainer.innerHTML = '';
    const allGenresSet = new Set(['All']);

    movies.forEach(m => {
        if (m.genres && Array.isArray(m.genres)) {
            m.genres.forEach(g => allGenresSet.add(g));
        } else if (m.category && m.category !== 'Others') {
            allGenresSet.add(m.category);
        }
    });

    allGenresSet.forEach(genre => {
        const chip = document.createElement('button');
        chip.className = `genre-chip focusable ${genre === currentSelectedGenre ? 'active' : ''}`;
        chip.tabIndex = 0;
        chip.textContent = genre;
        chip.onclick = () => {
            currentSelectedGenre = genre;
            renderGenreFilters(allMovies);
            filterAndRenderMovies();
        };
        genreContainer.appendChild(chip);
    });
}

function renderContinueWatching(movies) {
    const section = document.getElementById('continueWatchingSection');
    const grid = document.getElementById('continueWatchingGrid');
    if (!section || !grid) return;

    grid.innerHTML = '';
    const inProgressMovies = [];

    movies.forEach(movie => {
        try {
            const saved = JSON.parse(localStorage.getItem(`foxflix_progress_${movie.id}`));
            if (saved && saved.time > 10 && saved.duration > 0) {
                const pct = (saved.time / saved.duration) * 100;
                if (pct > 2 && pct < 95) {
                    inProgressMovies.push({ movie, saved, pct });
                }
            }
        } catch (e) { }
    });

    if (inProgressMovies.length === 0) {
        section.style.display = 'none';
        return;
    }

    section.style.display = 'block';
    inProgressMovies.forEach(({ movie, saved, pct }) => {
        const card = document.createElement('div');
        card.className = 'movie-card focusable';
        card.tabIndex = 0;
        card.id = `cw-movie-${movie.id}`;
        const displayTitle = movie.cleanTitle || movie.title;
        const thumbnailContent = movie.poster
            ? `<img src="${movie.poster}" alt="${displayTitle}" style="width:100%; height:100%; object-fit:cover;">`
            : `<i class="fas fa-film"></i>`;

        card.innerHTML = `
            <div class="movie-thumbnail">
                ${thumbnailContent}
                <div style="position:absolute; bottom:0; left:0; width:100%; height:5px; background:rgba(255,255,255,0.3);">
                    <div style="width:${pct}%; height:100%; background:var(--primary-red);"></div>
                </div>
            </div>
            <div class="movie-info">
                <div class="movie-title">${displayTitle}</div>
                <div class="movie-meta">
                    <span><i class="fas fa-play-circle" style="color:var(--primary-red)"></i> Resume (${Math.round(pct)}%)</span>
                </div>
            </div>
        `;
        card.onclick = () => openMovieDetailsModal(movie);
        grid.appendChild(card);
    });
}

function filterAndRenderMovies() {
    let filtered = allMovies;

    if (currentSelectedGenre !== 'All') {
        filtered = filtered.filter(m => {
            const genres = m.genres || [m.category || 'General'];
            return genres.includes(currentSelectedGenre) || m.category === currentSelectedGenre;
        });
    }

    const searchQuery = searchInput ? searchInput.value.trim().toLowerCase() : '';
    if (searchQuery) {
        filtered = filtered.filter(m => {
            const title = (m.cleanTitle || m.title).toLowerCase();
            const cat = (m.category || '').toLowerCase();
            const plot = (m.plot || '').toLowerCase();
            return title.includes(searchQuery) || cat.includes(searchQuery) || plot.includes(searchQuery);
        });
    }

    renderMovies(filtered);
}

const selectedSeasons = {}; // showTitle -> seasonNumber

function renderMovies(movies) {
    movieGrid.innerHTML = '';

    if (movies.length === 0) {
        movieGrid.innerHTML = '<p class="section-title" style="color: grey; font-size: 1rem;">No matches found</p>';
        return;
    }

    // Separate TV Shows and Movies
    const tvShows = {};
    const categories = {};

    movies.forEach(movie => {
        if (movie.isTvShow && movie.showTitle) {
            if (!tvShows[movie.showTitle]) tvShows[movie.showTitle] = [];
            tvShows[movie.showTitle].push(movie);
        } else {
            const cat = movie.category || 'My List';
            if (!categories[cat]) categories[cat] = [];
            categories[cat].push(movie);
        }
    });

    // Render TV Shows Section if present
    Object.keys(tvShows).forEach(showTitle => {
        const episodes = tvShows[showTitle];
        const seasons = [...new Set(episodes.map(e => e.season))].sort((a, b) => a - b);
        if (!selectedSeasons[showTitle] || !seasons.includes(selectedSeasons[showTitle])) {
            selectedSeasons[showTitle] = seasons[0] || 1;
        }

        const titleHeader = document.createElement('h2');
        titleHeader.className = 'section-title';
        titleHeader.style.marginTop = '40px';
        titleHeader.innerHTML = `<i class="fas fa-tv" style="color: var(--primary-red); margin-right: 8px;"></i> ${showTitle}`;
        movieGrid.appendChild(titleHeader);

        // Render Season Tabs
        if (seasons.length > 0) {
            const tabsContainer = document.createElement('div');
            tabsContainer.className = 'season-tabs';
            seasons.forEach(sNum => {
                const tab = document.createElement('button');
                tab.className = `season-tab focusable ${sNum === selectedSeasons[showTitle] ? 'active' : ''}`;
                tab.tabIndex = 0;
                tab.textContent = `Season ${sNum}`;
                tab.onclick = () => {
                    selectedSeasons[showTitle] = sNum;
                    renderMovies(movies);
                };
                tabsContainer.appendChild(tab);
            });
            movieGrid.appendChild(tabsContainer);
        }

        // Grid for current selected season episodes
        const currentSeasonEpisodes = episodes
            .filter(e => e.season === selectedSeasons[showTitle])
            .sort((a, b) => a.episode - b.episode);

        const grid = document.createElement('div');
        grid.className = 'movie-grid';

        currentSeasonEpisodes.forEach(movie => {
            const card = document.createElement('div');
            card.className = 'movie-card focusable';
            card.tabIndex = 0;
            card.id = `movie-${movie.id}`;
            const displayTitle = `E${movie.episode} - ${movie.cleanTitle || movie.title}`;
            const thumbnailContent = movie.poster
                ? `<img src="${movie.poster}" alt="${displayTitle}" style="width:100%; height:100%; object-fit:cover;">`
                : `<i class="fas fa-tv"></i>`;

            card.innerHTML = `
                <div class="movie-thumbnail" id="thumb-${movie.id}">
                    ${thumbnailContent}
                    ${getProgressBarHtml(movie.id)}
                    <div class="movie-plot-hover">
                        <div class="movie-plot-text">${movie.plot || 'Tap to play episode...'}</div>
                    </div>
                </div>
                <div class="movie-info">
                    <div class="movie-title">${displayTitle}</div>
                    <div class="movie-meta">
                        <span>S${movie.season} E${movie.episode}</span>
                        <span>TV Show</span>
                    </div>
                </div>
            `;
            card.onclick = () => openMovieDetailsModal(movie);
            grid.appendChild(card);
        });

        movieGrid.appendChild(grid);
    });

    // Render Categories for Movies
    Object.keys(categories).forEach(catName => {
        const title = document.createElement('h2');
        title.className = 'section-title';
        title.style.marginTop = '40px';
        title.textContent = catName === 'Others' ? 'My List' : catName + ' Movies';
        movieGrid.appendChild(title);

        const grid = document.createElement('div');
        grid.className = 'movie-grid';

        categories[catName].forEach(movie => {
            const card = document.createElement('div');
            card.className = 'movie-card focusable';
            card.tabIndex = 0;
            card.id = `movie-${movie.id}`;
            const displayTitle = movie.cleanTitle || movie.title;
            const thumbnailContent = movie.poster
                ? `<img src="${movie.poster}" alt="${displayTitle}" style="width:100%; height:100%; object-fit:cover;">`
                : `<i class="fas fa-film"></i>`;

            card.innerHTML = `
                <div class="movie-thumbnail" id="thumb-${movie.id}">
                    ${thumbnailContent}
                    ${getProgressBarHtml(movie.id)}
                    ${movie.rating ? `<div class="rating-badge"><i class="fas fa-star"></i> ${movie.rating.toFixed(1)}</div>` : ''}
                    <div class="movie-plot-hover">
                        <div class="movie-plot-text">${movie.plot || 'Tap to preview details...'}</div>
                    </div>
                </div>
                <div class="movie-info">
                    <div class="movie-title">${displayTitle}</div>
                    <div class="movie-meta">
                        ${movie.year ? `<span>${movie.year}</span>` : ''}
                        <span>${movie.category || 'Movie'}</span>
                    </div>
                </div>
            `;
            card.onclick = () => openMovieDetailsModal(movie);
            grid.appendChild(card);
        });

        movieGrid.appendChild(grid);
    });

    if (window.spatialNav) {
        setTimeout(() => window.spatialNav.autoFocus(), 100);
    }
}

/**
 * Render Simple Hero Section
 */
function renderHero(movies) {
    const hero = document.querySelector('.hero');
    const featuredTitle = document.getElementById('featuredTitle');
    const featuredDesc = document.querySelector('.hero-desc');
    const playFeatured = document.getElementById('playFeatured');

    if (!movies || movies.length === 0) return;

    // Pick a movie with a backdrop/poster
    const featured = movies.find(m => m.backdrop) || movies[0];
    if (!featured) return;

    if (featured.backdrop) {
        hero.style.backgroundImage = `url(${featured.backdrop})`;
    } else if (featured.poster) {
        hero.style.backgroundImage = `url(${featured.poster})`;
    }

    featuredTitle.textContent = featured.cleanTitle || featured.title;
    featuredDesc.textContent = featured.plot || 'Watch your personal collection smoothly on any device in your network.';

    playFeatured.onclick = () => playMovie(featured);
}

// --- Player Logic ---

// Helper to get progress bar HTML
function getProgressBarHtml(id) {
    try {
        const saved = JSON.parse(localStorage.getItem(`foxflix_progress_${id}`));
        if (saved && saved.time > 0 && saved.duration > 0) {
            const pct = (saved.time / saved.duration) * 100;
            if (pct > 2 && pct < 98) { // Only show if started and not essentially finished
                return `<div style="position:absolute; bottom:0; left:0; width:100%; height:4px; background:rgba(255,255,255,0.3);">
                            <div style="width:${pct}%; height:100%; background:#e50914;"></div>
                        </div>`;
            }
        }
    } catch (e) { }
    return '';
}

// --- Movie Details Modal ---
const detailsModal = document.getElementById('detailsModal');
const closeDetailsModalBtn = document.getElementById('closeDetailsModal');
const detailsTitle = document.getElementById('detailsTitle');
const detailsYear = document.getElementById('detailsYear');
const detailsRating = document.getElementById('detailsRating');
const detailsCategory = document.getElementById('detailsCategory');
const detailsGenres = document.getElementById('detailsGenres');
const detailsPlot = document.getElementById('detailsPlot');
const detailsBackdrop = document.getElementById('detailsBackdrop');
const detailsPlayBtn = document.getElementById('detailsPlayBtn');
const detailsResumeBtn = document.getElementById('detailsResumeBtn');

function openMovieDetailsModal(movie) {
    currentMovie = movie;
    if (!detailsModal) {
        playMovie(movie);
        return;
    }
    detailsTitle.textContent = movie.cleanTitle || movie.title;
    detailsYear.textContent = movie.year || 'N/A';
    detailsCategory.textContent = movie.category || 'Movie';
    detailsPlot.textContent = movie.plot || 'No synopsis available for this title.';

    if (movie.rating) {
        detailsRating.style.display = 'inline-block';
        detailsRating.innerHTML = `<i class="fas fa-star"></i> ${movie.rating.toFixed(1)}`;
    } else {
        detailsRating.style.display = 'none';
    }

    const backdropImg = movie.backdrop || movie.poster;
    if (backdropImg) {
        detailsBackdrop.style.backgroundImage = `url(${backdropImg})`;
    } else {
        detailsBackdrop.style.backgroundImage = 'none';
    }

    // Genres
    detailsGenres.innerHTML = '';
    const genresList = movie.genres || [movie.category || 'General'];
    genresList.forEach(g => {
        const tag = document.createElement('span');
        tag.className = 'details-genre-tag';
        tag.textContent = g;
        detailsGenres.appendChild(tag);
    });

    // Saved Progress Check
    const saved = JSON.parse(localStorage.getItem(`foxflix_progress_${movie.id}`) || 'null');
    if (saved && saved.time > 10 && saved.duration > 0 && (saved.time / saved.duration) < 0.95) {
        detailsResumeBtn.style.display = 'inline-flex';
        detailsResumeBtn.onclick = () => {
            closeDetailsModal();
            playMovie(movie, saved.time);
        };
    } else {
        detailsResumeBtn.style.display = 'none';
    }

    detailsPlayBtn.onclick = () => {
        closeDetailsModal();
        playMovie(movie, 0);
    };

    detailsModal.classList.add('active');
    if (window.spatialNav) {
        window.spatialNav.setFocus(detailsPlayBtn);
    }
}

function closeDetailsModal() {
    if (detailsModal) detailsModal.classList.remove('active');
}

if (closeDetailsModalBtn) {
    closeDetailsModalBtn.onclick = closeDetailsModal;
}

let nextEpCancelled = false;

function getNextEpisode(movie) {
    if (!movie || !movie.isTvShow || !movie.showTitle) return null;
    const sameShow = allMovies.filter(m => m.isTvShow && m.showTitle === movie.showTitle);
    
    // Look for next episode in same season
    let next = sameShow.find(m => m.season === movie.season && m.episode === movie.episode + 1);
    if (!next) {
        // Look for episode 1 of next season
        next = sameShow.find(m => m.season === movie.season + 1 && m.episode === 1);
    }
    return next;
}

function checkAutoNextEpisode() {
    if (!currentMovie || !currentMovie.isTvShow) return;

    const nextEp = getNextEpisode(currentMovie);
    const overlay = document.getElementById('nextEpisodeOverlay');
    if (!nextEp || !overlay || nextEpCancelled) {
        if (overlay) overlay.classList.remove('active');
        return;
    }

    const totalCurrentTime = currentStartOffset + videoPlayer.currentTime;
    const totalDuration = (currentMovie && currentMovie.duration) ? currentMovie.duration : (videoPlayer.duration || 0);
    const remaining = totalDuration - totalCurrentTime;

    if (totalDuration > 0 && remaining <= 25 && remaining > 0) {
        overlay.classList.add('active');
        document.getElementById('nextEpTitle').textContent = `E${nextEp.episode} - ${nextEp.cleanTitle || nextEp.title}`;
        document.getElementById('nextEpShowName').textContent = `${nextEp.showTitle} (Season ${nextEp.season})`;
        document.getElementById('nextEpCountdown').textContent = `${Math.ceil(remaining)}s`;

        document.getElementById('btnPlayNextNow').onclick = () => {
            overlay.classList.remove('active');
            playMovie(nextEp, 0);
        };

        document.getElementById('btnCancelNext').onclick = () => {
            nextEpCancelled = true;
            overlay.classList.remove('active');
        };

        if (remaining <= 2 && !videoPlayer.paused) {
            overlay.classList.remove('active');
            playMovie(nextEp, 0);
        }
    } else {
        overlay.classList.remove('active');
    }
}

function playMovie(movie, startAtTime = null) {
    currentMovie = movie;
    nextEpCancelled = false;
    const nextOverlay = document.getElementById('nextEpisodeOverlay');
    if (nextOverlay) nextOverlay.classList.remove('active');

    const fmtWarn = document.getElementById('format-warning');
    if (fmtWarn) fmtWarn.style.display = 'none';

    playerOverlay.classList.add('active');
    playerTitle.textContent = movie.cleanTitle || movie.title;

    const ext = movie.filename.split('.').pop().toLowerCase();
    const isMobileOrTV = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini|TV|SmartTV|Tizen|Jio|STB/i.test(navigator.userAgent);
    const nonNativeFormats = ['mkv', 'avi', 'wmv', 'flv', 'vob', 'divx', 'm4v'];
    const useTranscoder = nonNativeFormats.includes(ext) || (isMobileOrTV && nonNativeFormats.includes(ext));

    currentStartOffset = 0; // Reset offset on new movie

    if (useTranscoder) {
        console.log(`Using live transcoder for ${ext} file playback on mobile/TV`);
        videoPlayer.src = `/stream/${movie.id}`;
    } else {
        videoPlayer.src = `/watch/${movie.id}`;
    }

    // Resume / Start Time Logic
    if (startAtTime !== null) {
        videoPlayer.currentTime = startAtTime;
    } else {
        try {
            const saved = JSON.parse(localStorage.getItem(`foxflix_progress_${movie.id}`));
            if (saved && saved.time) {
                videoPlayer.currentTime = saved.time;
            }
        } catch (e) { }
    }

    // Subtitle Logic
    const oldTrack = videoPlayer.querySelector('track');
    if (oldTrack) oldTrack.remove();

    if (movie.hasSubtitle || movie.subtitle) {
        const track = document.createElement('track');
        track.kind = 'subtitles';
        track.label = 'English';
        track.srclang = 'en';
        track.src = movie.subtitle && movie.subtitle.startsWith('/') ? movie.subtitle : `/subtitles/${movie.id}`;
        track.default = true;
        videoPlayer.appendChild(track);
    }

    // Check for unsupported format (AVI/MKV - though some MKV work) or just offer option
    const isElectron = window.electron && window.electron.openPath;

    // Add External Player Button to Overlay if in Electron
    const oldExtBtn = document.getElementById('btnOpenExternal');
    if (oldExtBtn) oldExtBtn.remove();

    if (isElectron) {
        const btn = document.createElement('button');
        btn.id = 'btnOpenExternal';
        btn.className = 'btn';
        btn.style.cssText = "position: absolute; top: 20px; right: 60px; z-index: 1000; background: rgba(0,0,0,0.5); border: 1px solid rgba(255,255,255,0.3); color: white; padding: 5px 10px; cursor: pointer;";
        btn.innerHTML = '<i class="fas fa-external-link-alt"></i> Open in System Player';
        btn.onclick = () => {
            window.electron.openPath(movie.path);
        };
        playerOverlay.appendChild(btn);
    }

    videoPlayer.play().then(() => {
        updatePlayIcon(true);
    }).catch(e => {
        console.error("Autoplay failed", e);
        updatePlayIcon(false);
    });

    // Detect Audio Tracks
    loadAudioTracks(movie.id);
}

async function loadAudioTracks(movieId) {
    console.log("Detecting audio tracks for:", movieId);
    try {
        const res = await fetch(`${API_URL}/tracks/${movieId}`);
        if (!res.ok) {
            btnAudio.style.display = 'none';
            return;
        }

        const data = await res.json();
        audioTracks = data.audioTracks || [];

        if (audioTracks.length > 1) {
            btnAudio.style.display = 'flex';
            renderTrackSelector();
        } else {
            btnAudio.style.display = 'none';
        }
        currentAudioTrack = 0;
    } catch (e) {
        console.error("Audio probe error:", e);
        btnAudio.style.display = 'none';
    }
}

function renderTrackSelector() {
    trackSelector.innerHTML = '<div style="padding: 10px 20px; font-weight: bold; border-bottom: 1px solid rgba(255,255,255,0.1); margin-bottom: 5px;">Audio Tracks</div>';
    audioTracks.forEach(track => {
        const item = document.createElement('div');
        item.className = `track-item focusable ${track.index === currentAudioTrack ? 'active' : ''}`;
        item.tabIndex = 0;
        item.innerHTML = `
            <span>${track.title || `Track ${track.index + 1}`} (${track.language})</span>
            ${track.index === currentAudioTrack ? '<i class="fas fa-check"></i>' : ''}
        `;
        item.onclick = (e) => {
            e.stopPropagation();
            switchAudioTrack(track.index);
        };
        trackSelector.appendChild(item);
    });
}

function switchAudioTrack(index) {
    if (index === currentAudioTrack) return;

    currentAudioTrack = index;
    const currentTime = currentStartOffset + videoPlayer.currentTime;
    const isPaused = videoPlayer.paused;

    currentStartOffset = currentTime;

    videoPlayer.src = `/stream/${currentMovie.id}?audio=${index}&start=${currentTime}`;
    if (!isPaused) videoPlayer.play();

    trackSelector.classList.remove('active');
    renderTrackSelector();
}

async function searchAndDownloadSubtitles(movieId) {
    const oldContainer = subtitleSelector.querySelector('.sub-dl-container');
    if (oldContainer) oldContainer.remove();

    const listContainer = document.createElement('div');
    listContainer.className = 'sub-dl-container';
    listContainer.style.padding = '10px';
    listContainer.innerHTML = '<p style="font-size:0.8rem; color:#aaa; margin-bottom:8px;"><i class="fas fa-spinner fa-spin"></i> Searching OpenSubtitles...</p>';
    subtitleSelector.appendChild(listContainer);

    try {
        const res = await fetch(`/api/subtitles/search/${movieId}`);
        const data = await res.json();
        listContainer.innerHTML = '';

        if (!data.subtitles || data.subtitles.length === 0) {
            listContainer.innerHTML = '<p style="font-size:0.8rem; color:#888;">No online subtitles found.</p>';
            return;
        }

        const titleHeader = document.createElement('div');
        titleHeader.style.cssText = 'padding: 5px 10px; font-size: 0.75rem; color: #888; border-top: 1px solid rgba(255,255,255,0.1); margin-top:5px;';
        titleHeader.textContent = 'ONLINE SUBTITLES';
        listContainer.appendChild(titleHeader);

        data.subtitles.forEach(sub => {
            const item = document.createElement('div');
            item.className = 'sub-dl-item focusable';
            item.tabIndex = 0;
            item.innerHTML = `
                <span style="white-space:nowrap; overflow:hidden; text-overflow:ellipsis; max-width:160px;">${sub.fileName}</span>
                <i class="fas fa-download" style="color:var(--primary-red);"></i>
            `;
            item.onclick = async (e) => {
                e.stopPropagation();
                item.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Downloading...';
                try {
                    const dlRes = await fetch('/api/subtitles/download', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ movieId, downloadLink: sub.downloadLink, fileId: sub.fileId })
                    });
                    const dlData = await dlRes.json();
                    if (dlData.success) {
                        currentMovie.hasSubtitle = true;
                        currentMovie.subtitle = dlData.subtitleUrl;

                        let track = videoPlayer.querySelector('track');
                        if (!track) {
                            track = document.createElement('track');
                            track.kind = 'subtitles';
                            track.label = 'English';
                            track.srclang = 'en';
                            videoPlayer.appendChild(track);
                        }
                        track.src = dlData.subtitleUrl;
                        track.default = true;
                        if (track.track) track.track.mode = 'showing';

                        subtitleSelector.classList.remove('active');
                        renderSubtitleSelector();
                    } else {
                        alert("Download failed.");
                    }
                } catch (err) {
                    alert("Download error.");
                }
            };
            listContainer.appendChild(item);
        });

    } catch (err) {
        listContainer.innerHTML = '<p style="font-size:0.8rem; color:red;">Search error.</p>';
    }
}

function renderSubtitleSelector() {
    subtitleSelector.innerHTML = '<div style="padding: 10px 20px; font-weight: bold; border-bottom: 1px solid rgba(255,255,255,0.1); margin-bottom: 5px;">Subtitles</div>';

    const track = videoPlayer.querySelector('track');
    const isSubActive = track && track.track && track.track.mode === 'showing';

    const offItem = document.createElement('div');
    offItem.className = `track-item focusable ${!isSubActive ? 'active' : ''}`;
    offItem.tabIndex = 0;
    offItem.innerHTML = `<span>Off</span>${!isSubActive ? '<i class="fas fa-check"></i>' : ''}`;
    offItem.onclick = (e) => {
        e.stopPropagation();
        if (track && track.track) track.track.mode = 'disabled';
        subtitleSelector.classList.remove('active');
        renderSubtitleSelector();
    };
    subtitleSelector.appendChild(offItem);

    if (currentMovie && (currentMovie.hasSubtitle || currentMovie.subtitle)) {
        const subItem = document.createElement('div');
        subItem.className = `track-item focusable ${isSubActive ? 'active' : ''}`;
        subItem.tabIndex = 0;
        subItem.innerHTML = `<span>English Subtitles (.srt/.vtt)</span>${isSubActive ? '<i class="fas fa-check"></i>' : ''}`;
        subItem.onclick = (e) => {
            e.stopPropagation();
            if (track && track.track) track.track.mode = 'showing';
            subtitleSelector.classList.remove('active');
            renderSubtitleSelector();
        };
        subtitleSelector.appendChild(subItem);
    }

    // Auto Subtitle Search Button
    if (currentMovie) {
        const dlBtn = document.createElement('div');
        dlBtn.className = 'track-item focusable';
        dlBtn.tabIndex = 0;
        dlBtn.style.color = '#ff6b6b';
        dlBtn.innerHTML = `<span><i class="fas fa-cloud-download-alt" style="margin-right:8px;"></i> Search Subtitles</span>`;
        dlBtn.onclick = (e) => {
            e.stopPropagation();
            searchAndDownloadSubtitles(currentMovie.id);
        };
        subtitleSelector.appendChild(dlBtn);
    }
}

btnAudio.onclick = (e) => {
    e.stopPropagation();
    if (subtitleSelector) subtitleSelector.classList.remove('active');
    trackSelector.classList.toggle('active');
};

if (btnSubtitles) {
    btnSubtitles.onclick = (e) => {
        e.stopPropagation();
        if (trackSelector) trackSelector.classList.remove('active');
        renderSubtitleSelector();
        subtitleSelector.classList.toggle('active');
    };
}

// Picture-in-Picture Button Handler
const btnPip = document.getElementById('btnPip');
if (btnPip) {
    if (!document.pictureInPictureEnabled) {
        btnPip.style.display = 'none';
    } else {
        btnPip.onclick = async (e) => {
            e.stopPropagation();
            try {
                if (document.pictureInPictureElement) {
                    await document.exitPictureInPicture();
                } else {
                    await videoPlayer.requestPictureInPicture();
                }
            } catch (err) {
                console.error("PiP error:", err);
            }
        };
    }
}

// Close popup selectors if clicking elsewhere
document.addEventListener('click', () => {
    if (trackSelector) trackSelector.classList.remove('active');
    if (subtitleSelector) subtitleSelector.classList.remove('active');
});

function updatePlayIcon(isPlaying) {
    btnPlayPause.innerHTML = isPlaying ? '<i class="fas fa-pause"></i>' : '<i class="fas fa-play"></i>';
}

function formatTime(seconds) {
    const min = Math.floor(seconds / 60);
    const sec = Math.floor(seconds % 60);
    return `${min}:${sec < 10 ? '0' + sec : sec}`;
}

// 1. Play/Pause
btnPlayPause.onclick = () => {
    if (videoPlayer.paused) {
        videoPlayer.play();
        updatePlayIcon(true);
    } else {
        videoPlayer.pause();
        updatePlayIcon(false);
    }
};

// 2. Video Events
videoPlayer.addEventListener('timeupdate', () => {
    const totalCurrentTime = currentStartOffset + videoPlayer.currentTime;
    const totalDuration = (currentMovie && currentMovie.duration) ? currentMovie.duration : (videoPlayer.duration || 0);

    const percent = (totalCurrentTime / totalDuration) * 100;
    progressBar.style.width = `${percent}%`;
    timeDisplay.textContent = `${formatTime(totalCurrentTime)} / ${formatTime(totalDuration)}`;

    // Save Progress
    if (currentMovie && !videoPlayer.paused) {
        localStorage.setItem(`foxflix_progress_${currentMovie.id}`, JSON.stringify({
            time: totalCurrentTime,
            duration: totalDuration,
            lastWatched: Date.now()
        }));
    }

    // Check Auto-Next Binge-Watch Episode
    checkAutoNextEpisode();
});

videoPlayer.addEventListener('ended', () => {
    updatePlayIcon(false);
});

videoPlayer.addEventListener('error', (e) => {
    console.warn("Video playback error triggered:", videoPlayer.error);
    if (!currentMovie) return;

    const currentSrc = videoPlayer.currentSrc || videoPlayer.src || '';
    const isTranscoded = currentSrc.includes('/stream/');

    // AUTO-FALLBACK: If direct /watch stream failed, automatically try live transcode /stream/
    if (!isTranscoded) {
        console.log(`[Auto-Fallback] Direct playback failed for "${currentMovie.title}". Auto-switching to live FFmpeg stream...`);
        const startPos = currentStartOffset || 0;
        currentStartOffset = startPos;
        videoPlayer.src = `/stream/${currentMovie.id}?start=${startPos}`;
        videoPlayer.play().catch(err => console.error("Transcode play start failed:", err));
        return;
    }

    // If live transcoded stream ALREADY failed, display sleek non-blocking error overlay (NO BROWSER ALERT)
    const ext = currentMovie.filename.split('.').pop().toLowerCase();
    const msg = document.getElementById('format-warning');
    const isElectron = window.electron && window.electron.openPath;

    const errorHtml = `
        <div style="font-size:2rem; color:#e50914; margin-bottom:10px;"><i class="fas fa-exclamation-triangle"></i></div>
        <h3 style="margin-bottom:8px; font-size:1.1rem; font-weight:bold;">Format Playback Notice</h3>
        <p style="font-size:0.85rem; color:#ccc; margin-bottom:15px; line-height:1.4;">
            This <b>.${ext}</b> file uses an unplayable codec or container format for live browser playback.
        </p>
        ${isElectron ? `
            <button class="btn btn-play" style="background:#e50914; color:white; border:none; padding:8px 18px; border-radius:6px; cursor:pointer; font-weight:bold; font-size:0.85rem;" onclick="window.electron.openPath('${currentMovie.path.replace(/\\/g, '\\\\')}'); document.getElementById('format-warning').style.display='none';">
                <i class="fas fa-external-link-alt"></i> Open in System Player
            </button>
        ` : `
            <p style="font-size:0.8rem; color:#aaa;">Please try converting the file to MP4 (H.264/AAC) or open on PC.</p>
        `}
        <div style="margin-top:12px;">
            <button class="btn btn-secondary" style="font-size:0.75rem; padding:5px 12px; background:rgba(255,255,255,0.1); color:#ccc; border:none; border-radius:4px; cursor:pointer;" onclick="document.getElementById('format-warning').style.display='none'">Dismiss</button>
        </div>
    `;

    if (msg) {
        msg.innerHTML = errorHtml;
        msg.style.display = 'block';
    }
});

// 3. Progress Bar Click
progressContainer.onclick = (e) => {
    const width = progressContainer.clientWidth;
    const clickX = e.offsetX;
    const totalDuration = (currentMovie && currentMovie.duration) ? currentMovie.duration : (videoPlayer.duration || 0);
    const targetTime = (clickX / width) * totalDuration;

    const isTranscoded = videoPlayer.src.includes('/stream/');

    if (isTranscoded) {
        // For transcoded streams, we restart with 'start' parameter for reliability
        currentStartOffset = targetTime;
        const isPaused = videoPlayer.paused;
        videoPlayer.src = `/stream/${currentMovie.id}?audio=${currentAudioTrack}&start=${targetTime}`;
        if (!isPaused) videoPlayer.play();
    } else {
        videoPlayer.currentTime = targetTime;
    }
};

// 4. Seek
function skip(amount) {
    const totalCurrentTime = currentStartOffset + videoPlayer.currentTime;
    const totalDuration = (currentMovie && currentMovie.duration) ? currentMovie.duration : (videoPlayer.duration || 0);
    const targetTime = Math.min(Math.max(totalCurrentTime + amount, 0), totalDuration);

    const isTranscoded = videoPlayer.src.includes('/stream/');
    if (isTranscoded) {
        currentStartOffset = targetTime;
        const isPaused = videoPlayer.paused;
        videoPlayer.src = `/stream/${currentMovie.id}?audio=${currentAudioTrack}&start=${targetTime}`;
        if (!isPaused) videoPlayer.play();
    } else {
        videoPlayer.currentTime = targetTime;
    }
}

btnRewind.onclick = () => skip(-10);
btnForward.onclick = () => skip(10);

// 5. Volume
volumeSlider.oninput = (e) => {
    videoPlayer.volume = e.target.value;
    updateVolumeIcon();
};

btnMute.onclick = () => {
    videoPlayer.muted = !videoPlayer.muted;
    updateVolumeIcon();
};

function updateVolumeIcon() {
    if (videoPlayer.muted || videoPlayer.volume === 0) {
        btnMute.innerHTML = '<i class="fas fa-volume-mute"></i>';
    } else {
        btnMute.innerHTML = '<i class="fas fa-volume-up"></i>';
    }
}

// 6. Fullscreen
btnFullscreen.onclick = () => {
    if (!document.fullscreenElement) {
        if (playerOverlay.requestFullscreen) playerOverlay.requestFullscreen();
    } else {
        if (document.exitFullscreen) document.exitFullscreen();
    }
};

// Close Player logic
function stopAndClosePlayer() {
    if (playerOverlay) playerOverlay.classList.remove('active');

    if (videoPlayer) {
        try {
            videoPlayer.pause();
            videoPlayer.currentTime = 0;
            videoPlayer.removeAttribute('src');
            videoPlayer.load(); // Forces browser to flush audio/video decoder buffers & close streams
        } catch (e) {
            console.error("Error stopping video stream:", e);
        }
    }

    const fmtWarn = document.getElementById('format-warning');
    if (fmtWarn) fmtWarn.style.display = 'none';

    const nextOverlay = document.getElementById('nextEpisodeOverlay');
    if (nextOverlay) nextOverlay.classList.remove('active');

    if (document.fullscreenElement) {
        try { document.exitFullscreen(); } catch (e) { }
    }
}

if (closePlayerBtn) {
    closePlayerBtn.onclick = stopAndClosePlayer;
}

// Keyboard Shortcuts
document.addEventListener('keydown', (e) => {
    if (!playerOverlay.classList.contains('active')) return;

    if (e.key === 'ArrowLeft') skip(-10);
    if (e.key === 'ArrowRight') skip(10);
    if (e.key === ' ') {
        e.preventDefault();
        btnPlayPause.click();
    }
    if (e.key === 'f') btnFullscreen.click();
});

// Search Listener
if (searchInput) {
    searchInput.addEventListener('input', () => {
        filterAndRenderMovies();
    });
}

// Settings Logic
const settingsModal = document.getElementById('settingsModal');
const moviePathInput = document.getElementById('moviePathInput');
const browseFolderBtn = document.getElementById('browseFolderBtn');
if (browseFolderBtn) {
    browseFolderBtn.onclick = async () => {
        if (window.electron && window.electron.selectFolder) {
            const chosenPath = await window.electron.selectFolder();
            if (chosenPath && moviePathInput) {
                moviePathInput.value = chosenPath;
            }
        } else {
            alert("To change the movies folder path:\nType the full folder path (e.g. D:\\Movies) into the input box.");
        }
    };
}

if (document.getElementById('settingsBtn')) {
    document.getElementById('settingsBtn').onclick = async () => {
        try {
            const res = await fetch('/api/config');
            const data = await res.json();
            if (moviePathInput) moviePathInput.value = data.movieDir || '';

            let ipToTest = '';
            if (data.lanIps && data.lanIps.length > 0) {
                if (lanIpDisplay) lanIpDisplay.value = data.lanIps.join('  |  ');
                ipToTest = data.lanIps[0];

                const hintContainer = document.getElementById('firewallHintContainer');
                if (hintContainer) {
                    hintContainer.innerHTML = `
                        <div style="color: #aaa; font-size: 0.8rem; margin-top: 5px; background: rgba(255,165,0,0.1); padding: 10px; border-radius: 4px; border-left: 3px solid orange;">
                            <p style="margin-bottom:3px;"><i class="fas fa-exclamation-triangle" style="color:orange;"></i> <b>Connection Tip:</b></p>
                            <p>1. Ensure mobile is on the <b>same Wi-Fi</b> network.</p>
                            <p>2. Check <b>Windows Firewall</b> allows Port <b>3000</b>.</p>
                        </div>
                    `;
                }

                const testBtn = document.getElementById('testConnBtn');
                if (testBtn) {
                    testBtn.onclick = async () => {
                        const originalText = testBtn.textContent;
                        testBtn.textContent = "Testing...";
                        testBtn.disabled = true;
                        try {
                            const testUrl = `${ipToTest}/api/config`;
                            const controller = new AbortController();
                            const id = setTimeout(() => controller.abort(), 2000);
                            await fetch(testUrl, { signal: controller.signal });
                            clearTimeout(id);
                            alert("Success: Local Loopback works!\n\nIf other devices can't connect, check Windows Firewall for port 3000.");
                        } catch (e) {
                            alert("Failed: Could not reach server via LAN IP.");
                        } finally {
                            testBtn.textContent = originalText;
                            testBtn.disabled = false;
                        }
                    };
                }
            } else {
                if (lanIpDisplay) lanIpDisplay.value = 'No LAN IP Found';
            }

            if (settingsModal) settingsModal.style.display = 'flex';
            if (window.spatialNav && moviePathInput) {
                window.spatialNav.setFocus(moviePathInput);
            }

            // Generate QR Code for Mobile Access
            if (data.lanIps && data.lanIps.length > 0) {
                const bestUrl = data.lanIps.find(i => !i.includes('127.0.0.1')) || data.hostnameUrl || data.lanIps[0];
                const qrContainer = document.getElementById('qrcode');
                if (qrContainer) {
                    qrContainer.innerHTML = '';
                    const canvas = document.createElement('canvas');
                    qrContainer.appendChild(canvas);
                    QRCode.toCanvas(canvas, bestUrl, {
                        width: 60,
                        margin: 1,
                        color: { dark: '#000000', light: '#ffffff' }
                    }, function (error) {
                        if (error) console.error("QR Code Error:", error);
                    });
                }
            }
        } catch (e) {
            console.error("Config fetch error", e);
        }
    };
}

if (document.getElementById('saveSettingsBtn')) {
    document.getElementById('saveSettingsBtn').onclick = async () => {
        const newPath = moviePathInput.value.trim();
        if (!newPath) return alert("Please enter a valid path");

        const btn = document.getElementById('saveSettingsBtn');
        const originalText = btn.textContent;
        btn.textContent = "Scanning...";
        btn.disabled = true;

        try {
            const res = await fetch('/api/config', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    movieDir: newPath
                })
            });
            const data = await res.json();

            if (data.success) {
                alert(`Saved! Found ${data.count} movies.`);
                settingsModal.style.display = 'none';
                loadMovies(); // Refresh grid
            } else {
                alert("Error: " + (data.error || "Unknown error"));
            }
        } catch (e) {
            alert("Failed to save settings");
        } finally {
            btn.textContent = originalText;
            btn.disabled = false;
        }
    };
}

// Window lifecycle events to guarantee background video sound is stopped on exit or navigation
window.addEventListener('beforeunload', stopAndClosePlayer);
window.addEventListener('pagehide', stopAndClosePlayer);
window.addEventListener('popstate', stopAndClosePlayer);

// --- Remote Control Logic ---
const socket = io();
const roomId = 'foxflix-main'; // Simple room for now, could be dynamic
const urlParams = new URL(window.location.href).searchParams;
const isRemote = urlParams.get('remote') === 'true';

if (isRemote) {
    document.getElementById('remoteOverlay').style.display = 'flex';
    document.getElementById('mainContent').style.display = 'none';
    document.getElementById('navbar').style.display = 'none';

    socket.emit('join-room', roomId);

    const rPlayPause = document.getElementById('remotePlayPause');
    const rRewind = document.getElementById('remoteRewind');
    const rForward = document.getElementById('remoteForward');
    const rVolume = document.getElementById('remoteVolume');
    const rTitle = document.getElementById('remoteMovieTitle');
    const rProgressBar = document.getElementById('remoteProgressBar');

    socket.on('player-status', (status) => {
        rTitle.textContent = status.title || 'No Movie Playing';
        rProgressBar.style.width = `${(status.time / (status.duration || 1)) * 100}%`;
        rPlayPause.innerHTML = status.playing ? '<i class="fas fa-pause"></i>' : '<i class="fas fa-play"></i>';
    });

    rPlayPause.onclick = () => socket.emit('command', { roomId, action: 'playpause' });
    rRewind.onclick = () => socket.emit('command', { roomId, action: 'rewind' });
    rForward.onclick = () => socket.emit('command', { roomId, action: 'forward' });
    rVolume.oninput = (e) => socket.emit('command', { roomId, action: 'volume', value: e.target.value });

} else {
    // HOST MODE
    socket.emit('join-room', roomId);

    socket.on('remote-command', (data) => {
        if (data.action === 'playpause') btnPlayPause.click();
        if (data.action === 'rewind') btnRewind.click();
        if (data.action === 'forward') btnForward.click();
        if (data.action === 'volume') {
            volumeSlider.value = data.value;
            videoPlayer.volume = data.value;
            updateVolumeIcon();
        }
    });

    // Broadcast status to remote
    setInterval(() => {
        if (currentMovie) {
            socket.emit('status-update', {
                roomId,
                title: currentMovie.cleanTitle || currentMovie.title,
                time: videoPlayer.currentTime,
                duration: videoPlayer.duration,
                playing: !videoPlayer.paused
            });
        }
    }, 1000);

    // Live Directory Watcher Listener
    socket.on('movies-updated', (updatedMovies) => {
        console.log('[Socket] Live folder update received from server');
        allMovies = updatedMovies;
        renderGenreFilters(allMovies);
        renderContinueWatching(allMovies);
        filterAndRenderMovies();
    });
}

// iOS Installation Tip
const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) && !window.MSStream;
const isStandalone = window.navigator.standalone || window.matchMedia('(display-mode: standalone)').matches;

if (isIOS && !isStandalone) {
    const tip = document.createElement('div');
    tip.style.cssText = "position:fixed; bottom:20px; left:50%; transform:translateX(-50%); background:rgba(0,0,0,0.95); color:white; padding:15px; border-radius:10px; z-index:10000; width:90%; border:1px solid #e50914; display:flex; flex-direction:column; align-items:center; box-shadow:0 0 30px rgba(0,0,0,0.8);";
    tip.innerHTML = `
        <div style="font-size:1.1rem; font-weight:bold; margin-bottom:10px; color:#e50914;">FoxFlix for Mobile</div>
        <div style="font-size:0.9rem; text-align:center; color:#ccc; margin-bottom:15px;">
            Tap the <span style="display:inline-block; background:white; color:black; padding:2px 6px; border-radius:4px; margin:0 4px;"><i class="fas fa-share-square"></i> Share</span> button in Safari and select <br><b>"Add to Home Screen"</b> for the full experience.
        </div>
        <div style="display:flex; gap:10px; width:100%;">
            <a href="?remote=true" style="flex:1; background:#333; color:white; border:none; padding:10px; border-radius:4px; text-decoration:none; text-align:center; font-size:0.8rem;">
                <i class="fas fa-remote"></i> Use as Remote
            </a>
            <button onclick="this.parentElement.parentElement.remove()" style="flex:1; background:#e50914; color:white; border:none; padding:10px; border-radius:4px; cursor:pointer; font-size:0.8rem;">
                Got it!
            </button>
        </div>
    `;
    document.body.appendChild(tip);
}

// --- Progressive Web App (PWA) "Add to Home Screen" Logic for Smart TV / Jio Browser / Mobile ---
let deferredInstallPrompt = null;

window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    deferredInstallPrompt = e;
    const installBtn = document.getElementById('installAppBtn');
    if (installBtn) {
        installBtn.style.display = 'inline-flex';
    }
});

function openInstallModal() {
    const modal = document.getElementById('installModal');
    if (!modal) return;
    modal.style.display = 'flex';
    if (window.spatialNav) {
        const triggerBtn = document.getElementById('triggerPwaPromptBtn');
        if (triggerBtn) window.spatialNav.setFocus(triggerBtn);
    }
}

function closeInstallModal() {
    const modal = document.getElementById('installModal');
    if (modal) modal.style.display = 'none';
    if (window.spatialNav) {
        window.spatialNav.autoFocus();
    }
}

document.addEventListener('DOMContentLoaded', () => {
    const installAppBtn = document.getElementById('installAppBtn');
    const settingsAddAppBtn = document.getElementById('settingsAddAppBtn');
    const closeInstallModalBtn = document.getElementById('closeInstallModal');
    const dismissInstallModalBtn = document.getElementById('dismissInstallModalBtn');
    const triggerPwaPromptBtn = document.getElementById('triggerPwaPromptBtn');

    if (installAppBtn) installAppBtn.addEventListener('click', openInstallModal);
    if (settingsAddAppBtn) settingsAddAppBtn.addEventListener('click', () => {
        const settingsModal = document.getElementById('settingsModal');
        if (settingsModal) settingsModal.style.display = 'none';
        openInstallModal();
    });
    if (closeInstallModalBtn) closeInstallModalBtn.addEventListener('click', closeInstallModal);
    if (dismissInstallModalBtn) dismissInstallModalBtn.addEventListener('click', closeInstallModal);

    if (triggerPwaPromptBtn) {
        triggerPwaPromptBtn.addEventListener('click', async () => {
            if (deferredInstallPrompt) {
                deferredInstallPrompt.prompt();
                const choice = await deferredInstallPrompt.userChoice;
                if (choice.outcome === 'accepted') {
                    console.log('User accepted PWA installation prompt');
                    closeInstallModal();
                }
                deferredInstallPrompt = null;
            } else {
                alert("To add FoxFlix to your TV Home Screen:\n1. Press Menu ≡ or Bookmark ⭐ on your TV remote.\n2. Select 'Add to Home Screen' or 'Bookmark Page'.");
            }
        });
    }
});

// Init
if (document.getElementById('movieGrid')) {
    loadMovies();
}

