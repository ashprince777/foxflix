
// reproduce_fetch.js
const https = require('https');

// Helper: Network Fetch with Timeout and Headers (Simulating server.js)
const fetchWithTimeout = async (url, options = {}) => {
    const { timeout = 10000 } = options;

    // Add User-Agent to mimic a real browser (Critical for iTunes/IMDB)
    const headers = {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
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

async function testFetch(url, name) {
    console.log(`Checking ${name} with Headers & Timeout...`);
    try {
        const res = await fetchWithTimeout(url);
        console.log(`${name} Status: ${res.status}`);
        if (!res.ok) {
            console.log(`${name} Failed: ${res.statusText}`);
        } else {
            console.log(`${name} Success!`);
        }
    } catch (e) {
        console.log(`${name} Error: ${e.message}`);
    }
}

async function run() {
    const itunesUrl = 'https://itunes.apple.com/search?term=inception&media=movie&limit=1';
    const imdbUrl = 'https://v2.sg.media-imdb.com/suggestion/i/inception.json';

    await testFetch(itunesUrl, 'iTunes');
    await testFetch(imdbUrl, 'IMDB');
}

run();
