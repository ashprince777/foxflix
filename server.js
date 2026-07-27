const express = require('express');
const fs = require('fs');
const path = require('path');
const cors = require('cors');
const mime = require('mime-types');
const db = require('./database');
const axios = require('axios');
const ffmpeg = require('fluent-ffmpeg');
const ffmpegStatic = require('ffmpeg-static');
const ffprobeStatic = require('ffprobe-static');
const { spawn } = require('child_process');
const { Bonjour } = require('bonjour-service');
const chokidar = require('chokidar');
const bonjour = new Bonjour();

// Set FFmpeg paths
ffmpeg.setFfmpegPath(ffmpegStatic);
ffmpeg.setFfprobePath(ffprobeStatic.path);

const app = express();
const http = require('http').createServer(app);
const io = require('socket.io')(http);
const PORT = 3000;

let ffmpegPath = null;
// Check if ffmpeg is available
function checkFFmpeg() {
    return new Promise((resolve) => {
        const proc = spawn(ffmpegStatic, ['-version']); // Use static path
        proc.on('error', () => resolve(false));
        proc.on('close', (code) => resolve(code === 0));
    });
}
// CONFIGURATION
const os = require('os');
const APP_ROOT = process.cwd();
const CONFIG_FILE = path.join(APP_ROOT, 'config.json');
let MOVIES_DIR = path.join(APP_ROOT, 'movies');

// Use process.cwd() for cache so it's writable and persistent outside the exe
const CACHE_DIR = path.join(process.cwd(), 'cache');
if (!fs.existsSync(CACHE_DIR)) {
    try {
        fs.mkdirSync(CACHE_DIR, { recursive: true });
    } catch (e) {
        console.error("Could not create cache dir", e);
    }
}

console.log("FoxFlix Root:", APP_ROOT);

// Load Config
if (fs.existsSync(CONFIG_FILE)) {
    try {
        const config = JSON.parse(fs.readFileSync(CONFIG_FILE));
        if (config.movieDir && fs.existsSync(config.movieDir)) {
            MOVIES_DIR = config.movieDir;
        }
    } catch (e) {
        console.error("Failed to load config", e);
    }
}

// Ensure MOVIES_DIR doesn't point to an unwanted Temp folder
if (!MOVIES_DIR || MOVIES_DIR.includes('AppData\\Local\\Temp') || MOVIES_DIR.includes('AppData/Local/Temp')) {
    const userVideos = path.join(os.homedir(), 'Videos');
    MOVIES_DIR = fs.existsSync(userVideos) ? userVideos : path.join(APP_ROOT, 'movies');
}

try {
    if (!fs.existsSync(MOVIES_DIR)) fs.mkdirSync(MOVIES_DIR, { recursive: true });
} catch (e) { }

app.use(express.json()); // Enable JSON body parsing for settings

app.use(cors());

// Disable caching for application script/style/html files to force browsers to always fetch fresh code
app.use((req, res, next) => {
    const url = req.url.toLowerCase();
    if (url.includes('.js') || url.includes('.css') || url.includes('.html') || url === '/') {
        res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
        res.setHeader('Pragma', 'no-cache');
        res.setHeader('Expires', '0');
    }
    next();
});

// Serve the external cache folder at /cache
app.use('/cache', express.static(CACHE_DIR));
app.use(express.static(path.join(__dirname, 'public'), { etag: false, maxAge: 0 }));

// Data store for movies
let movies = [];
// Simple in-memory cache for posters to avoid hitting API repeatedly
const posterCache = {};

/**
 * Helper to clean title for search
 */
function cleanTitle(title) {
    let clean = title.replace(/\.(mp4|mkv|avi|webm)$/i, '');
    let year = null;
    const yearMatch = clean.match(/[\(\[\{\s]?\b((19|20)\d{2})\b/);
    if (yearMatch) {
        year = yearMatch[1];
    }
    clean = clean.replace(/[\(\[\{\s]?\b(19|20)\d{2}\b.*$/, '');
    const junk = /\b(HD|HQ|PreDVD|DVD|BluRay|BRRip|WEBRip|WEB-DL|x264|x265|AAC|ESub|400MB|720p|1080p|HDRip|Clean|Tamil)\b.*/gi;
    clean = clean.replace(junk, '');
    clean = clean.replace(/[^\w\s]/gi, ' ').replace(/\s+/g, ' ').trim();
    return { title: clean, year };
}

/**
 * Fetch poster from iTunes or IMDB (Server-side)
 */

/**
 * Fetch poster from iTunes or IMDB (Server-side) with Local Caching
 */
/**
 * Helper: URL Safe Base64
 */
function toUrlSafeBase64(str) {
    return Buffer.from(str).toString('base64')
        .replace(/\+/g, '-')
        .replace(/\//g, '_')
        .replace(/=+$/, '');
}

/**
 * Fetch poster from iTunes or IMDB (Server-side) with Local Caching
 */
async function fetchPoster(movie) {
    const title = movie.title;
    const movieId = movie.id;

    if (posterCache[title]) return posterCache[title];

    const localFilename = `${movieId.substring(0, 50)}.jpg`;
    const localFilePath = path.join(CACHE_DIR, localFilename);
    const publicUrl = `/cache/${localFilename}?v=${Date.now()}`;

    if (fs.existsSync(localFilePath)) {
        const stats = fs.statSync(localFilePath);
        if (stats.size > 100) {
            posterCache[title] = `/cache/${localFilename}`;
            return posterCache[title];
        } else {
            try { fs.unlinkSync(localFilePath); } catch (e) { }
        }
    }

    const { title: clean } = cleanTitle(title);
    console.log(`[Poster Search] "${title}" -> "${clean}"`);

    const fetchWithTimeout = async (url, options = {}) => {
        const { timeout = 8000 } = options;
        const headers = {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, Gecko) Chrome/120.0.0.0 Safari/537.36',
            ...options.headers
        };
        const controller = new AbortController();
        const id = setTimeout(() => controller.abort(), timeout);
        try {
            const response = await fetch(url, { ...options, headers, signal: controller.signal });
            clearTimeout(id);
            return response;
        } catch (error) {
            clearTimeout(id);
            throw error;
        }
    };

    const downloadImage = async (url) => {
        try {
            const res = await fetchWithTimeout(url, { timeout: 10000 });
            if (!res.ok) return null;
            const buffer = await res.arrayBuffer();
            if (buffer.byteLength < 500) return null;

            fs.writeFileSync(localFilePath, Buffer.from(buffer));
            console.log(`[Poster Saved] ${title} -> ${localFilename} (${buffer.byteLength} bytes)`);
            return `/cache/${localFilename}`;
        } catch (e) {
            console.error(`[Download Error] ${title}:`, e.message);
            return null;
        }
    }

    const doItunesSearch = async (queryTerm) => {
        try {
            const query = encodeURIComponent(queryTerm);
            const res = await fetchWithTimeout(`https://itunes.apple.com/search?term=${query}&media=movie&limit=1`);
            const data = await res.json();
            if (data.results && data.results.length > 0) {
                return data.results[0].artworkUrl100.replace('100x100', '600x600');
            }
        } catch (e) { }
        return null;
    };

    const doImdbSearch = async (queryTerm) => {
        try {
            const q = encodeURIComponent(queryTerm);
            const firstChar = queryTerm.charAt(0).toLowerCase();
            const url = `https://v2.sg.media-imdb.com/suggestion/${firstChar}/${q}.json`;
            const res = await fetchWithTimeout(url);
            const data = await res.json();
            if (data.d && data.d.length > 0 && data.d[0].i) {
                return data.d[0].i.imageUrl;
            }
        } catch (e) { }
        return null;
    }

    let remoteUrl = await doItunesSearch(clean);
    if (!remoteUrl) remoteUrl = await doImdbSearch(clean);

    if (remoteUrl) {
        const cachedUrl = await downloadImage(remoteUrl);
        if (cachedUrl) {
            posterCache[title] = cachedUrl;
            return cachedUrl;
        }
    }
    return null;
}

const TMDB_GENRES = {
    28: 'Action', 12: 'Adventure', 16: 'Animation', 35: 'Comedy', 80: 'Crime',
    99: 'Documentary', 18: 'Drama', 10751: 'Family', 14: 'Fantasy', 36: 'History',
    27: 'Horror', 10402: 'Music', 9648: 'Mystery', 10749: 'Romance', 878: 'Sci-Fi',
    10770: 'TV Movie', 53: 'Thriller', 10752: 'War', 37: 'Western'
};

function parseTvShowInfo(filename) {
    const cleanExt = filename.replace(/\.(mp4|mkv|avi|webm)$/i, '');
    const patterns = [
        /^(.*?)[._\s-]+s(\d{1,2})[._\s-]*e(\d{1,2})/i,
        /^(.*?)[._\s-]+(\d{1,2})x(\d{1,2})/i,
        /^(.*?)[._\s-]+season[._\s-]*(\d{1,2})[._\s-]*episode[._\s-]*(\d{1,2})/i
    ];

    for (const pattern of patterns) {
        const match = cleanExt.match(pattern);
        if (match) {
            let title = match[1].replace(/[._]/g, ' ').trim();
            const junk = /\b(HD|HQ|PreDVD|DVD|BluRay|BRRip|WEBRip|WEB-DL|x264|x265|720p|1080p)\b.*/gi;
            title = title.replace(junk, '').trim();
            const season = parseInt(match[2], 10);
            const episode = parseInt(match[3], 10);
            return { isTvShow: true, showTitle: title, season, episode };
        }
    }
    return { isTvShow: false, showTitle: null, season: null, episode: null };
}

/**
 * Fetch Rich Metadata from TMDB (Movies & TV Shows)
 */
async function fetchTMDBMetadata(rawTitle, category = '', yearHint = null, isTvShow = false, showTitle = null) {
    let TMDB_KEY = await db.get('SELECT value FROM settings WHERE key = "tmdb_api_key"').then(r => r ? r.value : null);
    if (!TMDB_KEY || !TMDB_KEY.trim()) {
        TMDB_KEY = '39cb798791ee4d0ea9e7fda44d9a9a5a';
    }

    const { title: clean, year: fileYear } = cleanTitle(rawTitle);
    const searchYear = yearHint || fileYear;

    const headers = {};
    const params = { language: 'en-US' };

    if (TMDB_KEY.startsWith('eyJ')) {
        headers['Authorization'] = `Bearer ${TMDB_KEY.trim()}`;
    } else {
        params.api_key = TMDB_KEY.trim();
    }

    try {
        if (isTvShow && showTitle) {
            const tvParams = { ...params, query: showTitle };
            const tvRes = await axios.get(`https://api.themoviedb.org/3/search/tv`, { params: tvParams, headers });
            if (tvRes.data.results && tvRes.data.results.length > 0) {
                const result = tvRes.data.results[0];
                const genres = (result.genre_ids || []).map(id => TMDB_GENRES[id]).filter(Boolean);
                if (genres.length === 0) genres.push('TV Shows');
                return {
                    cleanTitle: result.name || result.original_name,
                    poster: result.poster_path ? `https://image.tmdb.org/t/p/w500${result.poster_path}` : null,
                    backdrop: result.backdrop_path ? `https://image.tmdb.org/t/p/original${result.backdrop_path}` : null,
                    plot: result.overview,
                    year: result.first_air_date ? result.first_air_date.split('-')[0] : null,
                    rating: result.vote_average,
                    genres: genres.length > 0 ? genres : ['TV Shows']
                };
            }
        }

        const movieParams = { ...params, query: clean };
        if (searchYear) movieParams.year = searchYear;

        const searchRes = await axios.get(`https://api.themoviedb.org/3/search/movie`, { params: movieParams, headers });

        if (searchRes.data.results && searchRes.data.results.length > 0) {
            const result = searchRes.data.results[0];
            const genres = (result.genre_ids || []).map(id => TMDB_GENRES[id]).filter(Boolean);
            if (genres.length === 0 && category) genres.push(category);
            return {
                cleanTitle: result.title,
                poster: result.poster_path ? `https://image.tmdb.org/t/p/w500${result.poster_path}` : null,
                backdrop: result.backdrop_path ? `https://image.tmdb.org/t/p/original${result.backdrop_path}` : null,
                plot: result.overview,
                year: result.release_date ? result.release_date.split('-')[0] : null,
                rating: result.vote_average,
                genres: genres.length > 0 ? genres : ['General']
            };
        }
    } catch (e) {
        console.error(`TMDB Error for ${rawTitle}:`, e.message);
    }
    return null;
}

// Helper: Recursive Scan for Movies
function scanMovies(dir) {
    let results = [];
    if (!fs.existsSync(dir)) return results;

    const items = fs.readdirSync(dir, { withFileTypes: true });

    items.forEach(item => {
        const fullPath = path.join(dir, item.name);

        if (item.isDirectory()) {
            if (dir === MOVIES_DIR) {
                const subDirItems = scanMovies(fullPath);
                subDirItems.forEach(m => m.category = item.name);
                results = results.concat(subDirItems);
            }
        } else if (item.isFile() && /\.(mp4|mkv|avi|webm)$/i.test(item.name)) {
            const baseName = path.parse(item.name).name;
            const subtitle = [path.join(dir, baseName + '.srt'), path.join(dir, baseName + '.vtt')]
                .find(p => fs.existsSync(p));

            const tvInfo = parseTvShowInfo(item.name);
            const defaultCategory = tvInfo.isTvShow ? 'TV Shows' : 'Others';

            results.push({
                id: Buffer.from(item.name).toString('hex'),
                title: item.name,
                filename: item.name,
                category: defaultCategory,
                path: fullPath,
                size: fs.statSync(fullPath).size,
                mtime: fs.statSync(fullPath).mtimeMs,
                subtitle: subtitle,
                isTvShow: tvInfo.isTvShow,
                showTitle: tvInfo.showTitle,
                season: tvInfo.season,
                episode: tvInfo.episode
            });
        }
    });

    return results;
}

/**
 * Get Video Metadata (Duration, etc)
 */
async function getVideoMetadata(filePath) {
    return new Promise((resolve) => {
        ffmpeg.ffprobe(filePath, (err, metadata) => {
            if (err) return resolve({ duration: 0 });
            resolve({
                duration: metadata.format.duration || 0,
                width: metadata.streams[0] ? metadata.streams[0].width : 0,
                height: metadata.streams[0] ? metadata.streams[0].height : 0
            });
        });
    });
}

/**
 * Enhanced Scan with Database Caching
 */
async function enhancedScan(force = false) {
    const rawMovies = scanMovies(MOVIES_DIR);
    const enrichedResults = [];

    for (const movie of rawMovies) {
        let record = await db.get('SELECT * FROM movies WHERE filename = ?', [movie.filename]);
        const cachedMetadata = (record && record.metadata) ? JSON.parse(record.metadata) : null;

        if (!force && record && record.file_mtime === movie.mtime && cachedMetadata && cachedMetadata.duration) {
            enrichedResults.push({
                ...movie,
                ...cachedMetadata,
                hasSubtitle: !!movie.subtitle,
                category: record.category || movie.category
            });
        } else {
            const { title: clean, year } = cleanTitle(movie.title);
            let metadata = await fetchTMDBMetadata(movie.title, movie.category, year, movie.isTvShow, movie.showTitle);
            const videoInfo = await getVideoMetadata(movie.path);

            if (!metadata) {
                const { title: cleanTitleStr } = cleanTitle(movie.title);
                metadata = {
                    cleanTitle: movie.isTvShow ? `${movie.showTitle} S${String(movie.season).padStart(2,'0')}E${String(movie.episode).padStart(2,'0')}` : cleanTitleStr,
                    poster: await fetchPoster(movie), // Try old scraper as fallback
                    backdrop: null,
                    plot: "No metadata found. Add TMDB API Key in settings for rich info.",
                    year: null,
                    rating: null,
                    genres: [movie.isTvShow ? 'TV Shows' : (movie.category && movie.category !== 'Others' ? movie.category : 'General')]
                };
            }

            metadata.duration = videoInfo.duration;

            await db.run(`INSERT INTO movies (id, filename, title, clean_title, category, metadata, file_mtime)
            VALUES (?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT(filename) DO UPDATE SET
            id = excluded.id,
            metadata = excluded.metadata,
            file_mtime = excluded.file_mtime`,
                [movie.id, movie.filename, movie.title, clean, movie.category, JSON.stringify(metadata), movie.mtime]
            );

            enrichedResults.push({ ...movie, ...metadata, hasSubtitle: !!movie.subtitle });
        }
    }

    const currentFilenames = rawMovies.map(m => m.filename);
    if (currentFilenames.length > 0) {
        const placeholders = currentFilenames.map(() => '?').join(',');
        await db.run(`DELETE FROM movies WHERE filename NOT IN (${placeholders})`, currentFilenames);
    }

    return enrichedResults;
}

// Transcoding removed as per user request

// API: Get all movies
app.get('/api/movies', async (req, res) => {
    try {
        movies = await enhancedScan(); // Update global movies list
        res.json(movies);
    } catch (err) {
        console.error("Scan error:", err);
        res.status(500).json({ error: "Failed to scan movies" });
    }
});

app.get('/api/livetv', async (req, res) => {
    // ... logic remains same, but let's keep it integrated
    const defaultChannels = [
        { name: "Sky News Live", url: "https://www.youtube.com/embed/9Auq9mYxFEE" },
        { name: "Al Jazeera English", url: "https://www.youtube.com/embed/gCNeDWCI0vo" },
        { name: "DW News", url: "https://www.youtube.com/embed/Gn58AbY378w" },
        { name: "Reporter Live", url: "https://www.youtube.com/embed/tgBTspqA5nY" },
        { name: "MediaOne", url: "https://www.youtube.com/embed/YGEgelAiUf0" },
        { name: "24 News", url: "https://www.youtube.com/embed/1wECsnGZcfc" },
        { name: "Asianet News", url: "https://www.youtube.com/embed/yiiqRHY1Bl8" },
        { name: "Manorama News", url: "https://www.youtube.com/embed/-8d8-c0yvyU" },
        { name: "News18 Kerala", url: "https://www.youtube.com/embed/nObUcHKZEGY" }
    ];

    try {
        const response = await fetch('https://iptv-org.github.io/iptv/categories/movies.m3u');
        if (!response.ok) throw new Error("Failed to fetch M3U");
        const text = await response.text();

        const channels = [];
        const lines = text.split('\n');
        let currentChannel = {};

        for (let line of lines) {
            line = line.trim();
            if (line.startsWith('#EXTINF:')) {
                const info = line.substring(8);
                const parts = info.split(',');
                currentChannel.name = parts[parts.length - 1].trim();
                const logoMatch = line.match(/tvg-logo="([^"]+)"/);
                if (logoMatch) currentChannel.logo = logoMatch[1];
            } else if (line.startsWith('http')) {
                currentChannel.url = line;
                if (currentChannel.name && currentChannel.url) {
                    channels.push({ ...currentChannel });
                }
                currentChannel = {};
            }
        }

        let validChannels = channels.filter(c => c.url && c.url.startsWith('http'));

        validChannels.sort((a, b) => {
            const score = (str) => {
                let s = 0;
                const lower = str ? str.toLowerCase() : '';
                if (lower.includes('hbo')) s += 50;
                if (lower.includes('star')) s += 40;
                if (lower.includes('action')) s += 30;
                if (lower.includes('movie')) s += 20;
                return s;
            };
            return score(b.name) - score(a.name);
        });

        res.json(validChannels.slice(0, 100));

    } catch (e) {
        console.error("Live TV Error:", e.message);
        res.json(defaultChannels);
    }
});

app.get('/watch/:id', async (req, res) => {
    const movieId = req.params.id;
    console.log(`[Watch] Submitting raw file for ID: ${movieId}`);

    // Find in the current global movies list (updated by /api/movies)
    let movie = movies.find(m => m.id === movieId);

    // If not found in memory, try a quick scan or DB check
    if (!movie) {
        movies = await enhancedScan();
        movie = movies.find(m => m.id === movieId);
    }

    if (!movie || !fs.existsSync(movie.path)) {
        return res.status(404).send('Movie not found');
    }

    const videoPath = movie.path;
    const stat = fs.statSync(videoPath);
    const fileSize = stat.size;
    const range = req.headers.range;
    const contentType = mime.lookup(videoPath) || 'video/mp4';

    if (range) {
        const parts = range.replace(/bytes=/, "").split("-");
        const start = parseInt(parts[0], 10);
        const end = parts[1] ? parseInt(parts[1], 10) : fileSize - 1;

        if (start >= fileSize) {
            res.status(416).send('Requested range not satisfiable\n' + start + ' >= ' + fileSize);
            return;
        }

        const chunksize = (end - start) + 1;
        const file = fs.createReadStream(videoPath, { start, end });
        const head = {
            'Content-Range': `bytes ${start}-${end}/${fileSize}`,
            'Accept-Ranges': 'bytes',
            'Content-Length': chunksize,
            'Content-Type': contentType,
        };

        res.writeHead(206, head);
        file.pipe(res);
    } else {
        const head = {
            'Content-Length': fileSize,
            'Content-Type': contentType,
            'Accept-Ranges': 'bytes',
        };
        res.writeHead(200, head);
        fs.createReadStream(videoPath).pipe(res);
    }
});

/**
 * Optimized Transcoding Stream (Mobile/Safari Compatibility & Audio Selection)
 */
app.get('/stream/:id', async (req, res) => {
    const movieId = req.params.id;
    const audioIndex = req.query.audio; // Optional audio track index
    const startTime = parseFloat(req.query.start || 0); // Optional start time in seconds

    console.log(`[Transcode] Starting live stream, ID: ${movieId}, Audio Index: ${audioIndex || 'default'}, Start: ${startTime}s`);

    let movie = movies.find(m => m.id === movieId);
    if (!movie) {
        movies = await enhancedScan();
        movie = movies.find(m => m.id === movieId);
    }

    if (!movie || !fs.existsSync(movie.path)) return res.status(404).send('Not found');

    const videoPath = movie.path;

    // Set headers for basic mp4 stream
    res.setHeader('Content-Type', 'video/mp4');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.flushHeaders(); // Send headers immediately

    const command = ffmpeg(videoPath);

    // Fast seek if startTime > 0
    if (startTime > 0) {
        command.seekInput(startTime);
    }

    command.format('mp4')
        .videoCodec('libx264')
        .audioCodec('aac')
        .audioBitrate('128k');

    // Video filtering and basic quality
    command.videoFilters('scale=min(iw\\,1280):-2');

    // MAPPING: Ensure we map the correct video and audio stream
    const mapArgs = [];
    if (audioIndex !== undefined && audioIndex !== null && audioIndex !== '') {
        mapArgs.push('-map', '0:v:0?', '-map', `0:a:${audioIndex}?`);
    } else {
        mapArgs.push('-map', '0:v:0?', '-map', '0:a:0?');
    }

    command.outputOptions(mapArgs);
    command.outputOptions([
        '-pix_fmt', 'yuv420p',
        '-profile:v', 'high',
        '-level', '4.1',
        '-tune', 'zerolatency',
        '-movflags', 'frag_keyframe+empty_moov+default_base_moof',
        '-preset', 'ultrafast',
        '-threads', '0'
    ]);

    command.on('error', (err) => {
        console.error('Streaming error:', err.message);
        if (!res.headersSent) {
            try { res.status(500).send('Streaming failed'); } catch (e) { }
        }
    });

    command.pipe(res, { end: true });

    req.on('close', () => {
        try { command.kill(); } catch (e) { }
    });
});

/**
 * Get Audio Tracks for a movie
 */
app.get('/api/tracks/:id', async (req, res) => {
    const movieId = req.params.id;
    console.log(`[Tracks] Probing tracks for ID: ${movieId}`);

    let movie = movies.find(m => m.id === movieId);
    if (!movie) {
        movies = await enhancedScan();
        movie = movies.find(m => m.id === movieId);
    }

    if (!movie || !fs.existsSync(movie.path)) {
        console.error(`[Tracks] Movie not found or path invalid: ${movieId}`);
        return res.status(404).json({ error: 'Movie not found' });
    }

    ffmpeg.ffprobe(movie.path, (err, metadata) => {
        if (err) {
            console.error(`[Tracks] ffprobe error for "${movie.title}":`, err.message);
            return res.status(500).json({ error: 'Failed to probe file' });
        }

        if (!metadata || !metadata.streams) {
            console.error(`[Tracks] No metadata/streams found for "${movie.title}"`);
            return res.json({ audioTracks: [] });
        }

        const audioTracks = metadata.streams
            .filter(s => s.codec_type === 'audio')
            .map((s, index) => ({
                index: index,
                codec: s.codec_name,
                language: s.tags ? (s.tags.language || s.tags.LANGUAGE || 'Unknown') : 'Unknown',
                title: s.tags ? (s.tags.title || s.tags.TITLE || `Track ${index + 1}`) : `Track ${index + 1}`
            }));

        console.log(`[Tracks] Found ${audioTracks.length} audio tracks for "${movie.title}"`);
        res.json({ audioTracks });
    });
});

app.get('/subtitles/:id', async (req, res) => {
    const movieId = req.params.id;
    let movie = movies.find(m => m.id === movieId);

    if (!movie) {
        movies = await enhancedScan();
        movie = movies.find(m => m.id === movieId);
    }

    if (movie && movie.subtitle && fs.existsSync(movie.subtitle)) {
        res.sendFile(movie.subtitle);
    } else {
        res.status(404).send('Subtitle not found');
    }
});

/**
 * OpenSubtitles API Subtitle Search & Download
 */
app.get('/api/subtitles/search/:id', async (req, res) => {
    const movieId = req.params.id;
    let movie = movies.find(m => m.id === movieId);
    if (!movie) {
        movies = await enhancedScan();
        movie = movies.find(m => m.id === movieId);
    }
    if (!movie) return res.status(404).json({ error: 'Movie not found' });

    const { title: clean } = cleanTitle(movie.title);
    const searchTitle = movie.isTvShow ? `${movie.showTitle} S${String(movie.season).padStart(2, '0')}E${String(movie.episode).padStart(2, '0')}` : clean;

    console.log(`[Subtitles] Searching OpenSubtitles for: "${searchTitle}"`);
    try {
        // OpenSubtitles REST API v1 (api.opensubtitles.com) — current maintained endpoint
        const apiUrl = `https://api.opensubtitles.com/api/v1/subtitles?query=${encodeURIComponent(searchTitle)}&languages=en&per_page=10`;
        const response = await fetch(apiUrl, {
            headers: {
                'User-Agent': 'FoxFlix v1.0',
                'Api-Key': 'srtexTYaasJjfEhYqJJHiHzXfnfcLkWv',  // Public free-tier key
                'Content-Type': 'application/json'
            }
        });
        if (!response.ok) return res.json({ subtitles: [] });
        const data = await response.json();

        const results = (Array.isArray(data.data) ? data.data : []).slice(0, 10).map(s => ({
            id: s.attributes?.files?.[0]?.file_id || s.id,
            fileName: s.attributes?.files?.[0]?.file_name || `${searchTitle}.srt`,
            language: s.attributes?.language || 'en',
            downloadLink: null,   // v1 API requires a separate /download POST; store file_id
            fileId: s.attributes?.files?.[0]?.file_id,
            score: s.attributes?.ratings || 0
        }));
        res.json({ subtitles: results });
    } catch (err) {
        console.error('[Subtitles] Search error:', err.message);
        res.json({ subtitles: [] });
    }
});

app.post('/api/subtitles/download', async (req, res) => {
    const { movieId, downloadLink, fileId } = req.body;
    let movie = movies.find(m => m.id === movieId);
    if (!movie) {
        movies = await enhancedScan();
        movie = movies.find(m => m.id === movieId);
    }
    if (!movie) return res.status(400).json({ error: 'Invalid parameters' });

    console.log(`[Subtitles] Downloading subtitle for "${movie.title}"`);
    try {
        let finalDownloadUrl = downloadLink;

        // If fileId provided, use OpenSubtitles v1 /download API to get a real URL
        if (fileId && !downloadLink) {
            const dlRes = await fetch('https://api.opensubtitles.com/api/v1/download', {
                method: 'POST',
                headers: {
                    'User-Agent': 'FoxFlix v1.0',
                    'Api-Key': 'srtexTYaasJjfEhYqJJHiHzXfnfcLkWv',
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ file_id: fileId })
            });
            if (!dlRes.ok) throw new Error('Failed to get download link from OpenSubtitles API');
            const dlData = await dlRes.json();
            finalDownloadUrl = dlData.link;
        }

        if (!finalDownloadUrl) return res.status(400).json({ error: 'No download link available' });

        const response = await fetch(finalDownloadUrl, {
            headers: { 'User-Agent': 'FoxFlix v1.0' }
        });
        if (!response.ok) throw new Error('Download request failed');
        const buffer = await response.arrayBuffer();

        let contentBuffer = Buffer.from(buffer);
        const zlib = require('zlib');
        if (contentBuffer[0] === 0x1f && contentBuffer[1] === 0x8b) {
            contentBuffer = zlib.gunzipSync(contentBuffer);
        }

        const baseName = path.parse(movie.path).name;
        const srtPath = path.join(path.dirname(movie.path), `${baseName}.srt`);
        fs.writeFileSync(srtPath, contentBuffer);

        movie.subtitle = srtPath;
        movie.hasSubtitle = true;

        console.log(`[Subtitles] Successfully saved to ${srtPath}`);
        res.json({ success: true, subtitleUrl: `/subtitles/${movie.id}?v=${Date.now()}` });
    } catch (err) {
        console.error('[Subtitles] Download error:', err.message);
        res.status(500).json({ error: 'Failed to download subtitle file' });
    }
});

app.get('/api/config', async (req, res) => {
    const os = require('os');
    const interfaces = os.networkInterfaces();
    const lanIps = [];

    const virtualKeywords = ['wsl', 'hyper-v', 'vethernet', 'virtualbox', 'vmware', 'docker', 'loopback', 'vbox'];

    for (const name of Object.keys(interfaces)) {
        const lowerName = name.toLowerCase();
        if (virtualKeywords.some(kw => lowerName.includes(kw))) continue;

        for (const iface of interfaces[name]) {
            if ('IPv4' === iface.family && !iface.internal) {
                lanIps.push({
                    name: name,
                    address: iface.address,
                    url: `http://${iface.address}:${PORT}`
                });
            }
        }
    }

    // Prioritize physical LAN IPs (192.168.x.x first, then 10.x.x.x) and filter out WSL default subnet (172.16-31.x.x)
    const sortedIps = lanIps
        .filter(i => {
            const ip = i.address;
            // Exclude common WSL/Hyper-V auto-generated 172.16.x.x - 172.31.x.x range if 192.168.x.x exists
            if (lanIps.some(other => other.address.startsWith('192.168.'))) {
                if (ip.startsWith('172.16.') || ip.startsWith('172.17.') || ip.startsWith('172.18.') || ip.startsWith('172.19.') ||
                    ip.startsWith('172.20.') || ip.startsWith('172.21.') || ip.startsWith('172.22.') || ip.startsWith('172.23.') ||
                    ip.startsWith('172.24.') || ip.startsWith('172.25.') || ip.startsWith('172.26.') || ip.startsWith('172.27.') ||
                    ip.startsWith('172.28.') || ip.startsWith('172.29.') || ip.startsWith('172.30.') || ip.startsWith('172.31.')) {
                    return false;
                }
            }
            return true;
        })
        .sort((a, b) => {
            const priority = (ip) => {
                if (ip.startsWith('192.168.')) return 1;
                if (ip.startsWith('10.')) return 2;
                return 3;
            };
            return priority(a.address) - priority(b.address);
        })
        .map(i => i.url);

    if (sortedIps.length === 0) sortedIps.push(`http://127.0.0.1:${PORT}`);

    res.json({
        movieDir: MOVIES_DIR,
        lanIps: sortedIps,
        primaryUrl: sortedIps[0]
    });
});

app.post('/api/config', async (req, res) => {
    const { movieDir, tmdbApiKey } = req.body;

    if (movieDir && fs.existsSync(movieDir)) {
        MOVIES_DIR = movieDir;
        fs.writeFileSync(CONFIG_FILE, JSON.stringify({ movieDir: MOVIES_DIR }, null, 2));
        setupFolderWatcher();
    }

    if (tmdbApiKey !== undefined) {
        await db.run('INSERT INTO settings (key, value) VALUES ("tmdb_api_key", ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value', [tmdbApiKey]);
    }

    try {
        const moviesList = await enhancedScan(true); // Force deep rescan on save
        io.emit('movies-updated', moviesList);
        res.json({ success: true, count: moviesList.length });
    } catch (err) {
        res.status(500).json({ error: "Failed to scan" });
    }
});

let watcher = null;
function setupFolderWatcher() {
    if (watcher) {
        try { watcher.close(); } catch (e) { }
    }
    if (!fs.existsSync(MOVIES_DIR)) return;

    console.log(`[Watcher] Live folder watcher active for: ${MOVIES_DIR}`);
    watcher = chokidar.watch(MOVIES_DIR, {
        ignored: /(^|[\/\\])\../,
        persistent: true,
        ignoreInitial: true,
        awaitWriteFinish: { stabilityThreshold: 2000, pollInterval: 500 }
    });

    let debounceTimer = null;
    const handleFileChange = () => {
        if (debounceTimer) clearTimeout(debounceTimer);
        debounceTimer = setTimeout(async () => {
            console.log('[Watcher] File system change detected. Rescanning library...');
            try {
                movies = await enhancedScan();
                io.emit('movies-updated', movies);
                console.log(`[Watcher] Broadcasted updated library (${movies.length} movies)`);
            } catch (err) {
                console.error('[Watcher] Rescan failed:', err);
            }
        }, 1000);
    };

    watcher.on('add', handleFileChange)
           .on('unlink', handleFileChange)
           .on('change', handleFileChange);
}

// Initial scan at startup
(async () => {
    console.log('Performing deep initial movie scan (ID refresh)...');
    try {
        movies = await enhancedScan(true); // Force rescan to update IDs to Hex
        setupFolderWatcher();
        console.log(`Scan complete. Found ${movies.length} movies.`);
    } catch (e) {
        console.error("Initial scan failed:", e.message);
    }
})();

// Socket.io for Remote Control
io.on('connection', (socket) => {
    console.log('User connected');

    socket.on('join-room', (roomId) => {
        socket.join(roomId);
        console.log(`User joined room: ${roomId}`);
    });

    socket.on('command', (data) => {
        // Broadcast command to the room (the PC player)
        io.to(data.roomId).emit('remote-command', data);
    });

    socket.on('status-update', (data) => {
        // Broadcast player status (time, duration, playing) to the remote
        io.to(data.roomId).emit('player-status', data);
    });

    socket.on('disconnect', () => {
        console.log('User disconnected');
    });
});

http.listen(PORT, '0.0.0.0', async () => {
    console.log(`FoxFlix Server running at http://localhost:${PORT}`);
    ffmpegPath = await checkFFmpeg();
    if (ffmpegPath) {
        console.log('✔ FFmpeg detected. Transcoding enabled.');
    } else {
        console.warn('✖ FFmpeg NOT detected. Transcoding will be unavailable.');
    }

    // Broadcast via Bonjour/mDNS
    try {
        const os = require('os');
        const hostname = os.hostname().toLowerCase();
        // Multiple names for better discovery
        bonjour.publish({
            name: `FoxFlix`,
            type: 'http',
            port: PORT
        });
        console.log(`✔ mDNS Broadcast active: http://${hostname}.local:${PORT}`);
        console.log(`💡 Tip: If mobile can't connect, use the IP Address directly.`);
    } catch (e) {
        console.error('✖ mDNS Broadcast failed:', e.message);
    }
});
