// =============================================
// ZENTRA - Samehadaku Streaming Provider
// providers/samehadaku.js
// =============================================

'use strict';

const SAMEHADAKU_BASE = 'https://v2.samehadaku.how';
const CACHE_TTL = 10 * 60 * 1000; // 10 minutes

const providerCache = new Map();

function getCached(key) {
  const entry = providerCache.get(key);
  if (!entry) return null;
  if (Date.now() - entry.time > CACHE_TTL) {
    providerCache.delete(key);
    return null;
  }
  return entry.data;
}

function setCache(key, data) {
  providerCache.set(key, { data, time: Date.now() });
  return data;
}

const HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
  'Accept-Language': 'id-ID,id;q=0.9,en-US;q=0.8,en;q=0.7',
  'Referer': SAMEHADAKU_BASE,
};

async function fetchPage(url, timeout = 10000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeout);
  try {
    const res = await fetch(url, { headers: HEADERS, signal: controller.signal });
    clearTimeout(timer);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.text();
  } catch (e) {
    clearTimeout(timer);
    throw e;
  }
}

// Simple HTML parser helpers
function extractAll(html, pattern) {
  return [...html.matchAll(pattern)].map(m => m.groups || m.slice(1));
}

function extractOne(html, pattern, group = 1) {
  const m = html.match(pattern);
  return m ? m[group] : null;
}

function stripTags(html) {
  return html.replace(/<[^>]+>/g, '').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#039;/g, "'").trim();
}

// ── PUBLIC API ──────────────────────────────

/**
 * Get latest anime episodes
 */
async function getLatestAnime(page = 1) {
  const cacheKey = `latest_${page}`;
  const cached = getCached(cacheKey);
  if (cached) return cached;

  try {
    const url = page > 1 ? `${SAMEHADAKU_BASE}/page/${page}/` : `${SAMEHADAKU_BASE}/`;
    const html = await fetchPage(url);
    const results = [];

    const articlePattern = /<article[^>]*class="[^"]*item[^"]*"[^>]*>([\s\S]*?)<\/article>/gi;
    const articles = [...html.matchAll(articlePattern)];

    for (const [, content] of articles) {
      const title = stripTags(extractOne(content, /class="[^"]*title[^"]*"[^>]*>([\s\S]*?)<\//, 1) || '');
      const slug = extractOne(content, /href="[^"]*\/([^/"]+)\/?"/);
      const img = extractOne(content, /<img[^>]+src="([^"]+)"/);
      const ep = extractOne(content, /Episode\s*(\d+)/i);
      const type = extractOne(content, /class="[^"]*type[^"]*"[^>]*>([^<]+)</);

      if (title && slug) {
        results.push({ title, slug, img: img || '', episode: ep ? parseInt(ep) : null, type: type?.trim() || 'TV' });
      }
    }

    return setCache(cacheKey, { results, page, hasNext: results.length >= 10 });
  } catch (e) {
    console.error('[Samehadaku] getLatestAnime error:', e);
    return { results: [], page, hasNext: false, error: e.message };
  }
}

/**
 * Search anime by query
 */
async function searchAnime(query, page = 1) {
  if (!query?.trim()) return { results: [], total: 0 };
  const cacheKey = `search_${query}_${page}`;
  const cached = getCached(cacheKey);
  if (cached) return cached;

  try {
    const url = `${SAMEHADAKU_BASE}/?s=${encodeURIComponent(query)}&page=${page}`;
    const html = await fetchPage(url);
    const results = [];

    const items = [...html.matchAll(/<div[^>]*class="[^"]*animes[^"]*"[^>]*>([\s\S]*?)<\/div>/gi)];
    for (const [, content] of items) {
      const title = stripTags(extractOne(content, /<h2[^>]*>([\s\S]*?)<\/h2>/) || '');
      const slug = extractOne(content, /href="[^"]*\/([^/"]+)\/?"/);
      const img = extractOne(content, /<img[^>]+src="([^"]+)"/);
      const score = extractOne(content, /(\d+\.?\d*)\s*\/\s*10/);
      const status = extractOne(content, /class="[^"]*status[^"]*"[^>]*>([^<]+)</);

      if (title && slug) {
        results.push({ title, slug, img: img || '', score: score ? parseFloat(score) : null, status: status?.trim() });
      }
    }

    return setCache(cacheKey, { results, query, page });
  } catch (e) {
    console.error('[Samehadaku] searchAnime error:', e);
    return { results: [], error: e.message };
  }
}

/**
 * Get anime detail page
 */
async function getAnimeDetail(slug) {
  const cacheKey = `detail_${slug}`;
  const cached = getCached(cacheKey);
  if (cached) return cached;

  try {
    const url = `${SAMEHADAKU_BASE}/anime/${slug}/`;
    const html = await fetchPage(url);

    const title = stripTags(extractOne(html, /<h1[^>]*class="[^"]*entry-title[^"]*"[^>]*>([\s\S]*?)<\/h1>/) || '');
    const synopsis = stripTags(extractOne(html, /class="[^"]*synopsis[^"]*"[^>]*>([\s\S]*?)<\/div>/) || '');
    const img = extractOne(html, /<div[^>]*class="[^"]*poster[^"]*"[^>]*>[\s\S]*?<img[^>]+src="([^"]+)"/);
    const score = extractOne(html, /class="[^"]*score[^"]*"[^>]*>([^<]+)</);
    const status = extractOne(html, /Status[^:]*:\s*<[^>]*>([^<]+)/);
    const episodes = extractOne(html, /Episode[^:]*:\s*<[^>]*>([^<]+)/);
    const studio = extractOne(html, /Studio[^:]*:\s*<[^>]*>([^<]+)/);
    const genres = [...html.matchAll(/class="[^"]*genre[^"]*"[^>]*><a[^>]*>([^<]+)<\/a>/gi)].map(m => m[1]);

    // Episode list
    const epLinks = [];
    const epPattern = /href="([^"]*\/episode\/[^"]+)"\s*>[\s\S]*?Episode\s*(\d+)/gi;
    for (const [, href, epNum] of html.matchAll(epPattern)) {
      const epSlug = href.match(/\/([^/]+)\/?$/)?.[1];
      if (epSlug) epLinks.push({ episode: parseInt(epNum), slug: epSlug, url: href });
    }
    epLinks.sort((a, b) => a.episode - b.episode);

    const result = {
      title, synopsis: synopsis.slice(0, 1000),
      img: img || '',
      score: score ? parseFloat(score) : null,
      status: status?.trim(),
      episodes: episodes?.trim(),
      studio: studio?.trim(),
      genres,
      epLinks: epLinks.slice(0, 200),
      slug
    };

    return setCache(cacheKey, result);
  } catch (e) {
    console.error('[Samehadaku] getAnimeDetail error:', e);
    return { slug, error: e.message };
  }
}

/**
 * Get episode streams & downloads
 */
async function getEpisodeDetail(slug) {
  const cacheKey = `ep_${slug}`;
  const cached = getCached(cacheKey);
  if (cached) return cached;

  try {
    const url = `${SAMEHADAKU_BASE}/episode/${slug}/`;
    const html = await fetchPage(url);

    // Extract stream servers
    const servers = [];
    const serverPattern = /data-post="(\d+)"[^>]*data-type="([^"]*)"[^>]*data-src="([^"]*)"/gi;
    for (const [, postId, type, src] of html.matchAll(serverPattern)) {
      servers.push({ id: postId, type, src, quality: 'auto' });
    }

    // Extract quality links from download section
    const downloads = { '360p': [], '480p': [], '720p': [], '1080p': [] };
    const dlPattern = /<a[^>]*href="([^"]+)"[^>]*>\s*(360p|480p|720p|1080p)\s*<\/a>/gi;
    for (const [, href, quality] of html.matchAll(dlPattern)) {
      if (downloads[quality]) downloads[quality].push(href);
    }

    // Prev/next links
    const prevSlug = extractOne(html, /class="[^"]*prev[^"]*"[^>]*href="[^"]*\/episode\/([^/"]+)/);
    const nextSlug = extractOne(html, /class="[^"]*next[^"]*"[^>]*href="[^"]*\/episode\/([^/"]+)/);
    const title = stripTags(extractOne(html, /<h1[^>]*>([\s\S]*?)<\/h1>/) || '');
    const episodeNum = extractOne(html, /Episode\s*(\d+)/i);

    const result = { slug, title, episodeNumber: episodeNum ? parseInt(episodeNum) : null, servers, downloads, prevSlug, nextSlug };
    return setCache(cacheKey, result);
  } catch (e) {
    console.error('[Samehadaku] getEpisodeDetail error:', e);
    return { slug, servers: [], downloads: {}, error: e.message };
  }
}

/**
 * Get popular anime
 */
async function getPopularAnime() {
  const cacheKey = 'popular';
  const cached = getCached(cacheKey);
  if (cached) return cached;

  try {
    const html = await fetchPage(`${SAMEHADAKU_BASE}/popular-anime/`);
    const results = [];
    const pattern = /<article[^>]*>([\s\S]*?)<\/article>/gi;
    for (const [, content] of html.matchAll(pattern)) {
      const title = stripTags(extractOne(content, /<h2[^>]*>([\s\S]*?)<\/h2>/) || '');
      const slug = extractOne(content, /href="[^"]*\/([^/"]+)\/?"/);
      const img = extractOne(content, /<img[^>]+src="([^"]+)"/);
      if (title && slug) results.push({ title, slug, img: img || '' });
    }
    return setCache(cacheKey, results.slice(0, 20));
  } catch (e) {
    return [];
  }
}

/**
 * Get ongoing anime
 */
async function getOngoingAnime() {
  const cacheKey = 'ongoing';
  const cached = getCached(cacheKey);
  if (cached) return cached;

  try {
    const html = await fetchPage(`${SAMEHADAKU_BASE}/ongoing-anime/`);
    const results = [];
    const pattern = /<article[^>]*>([\s\S]*?)<\/article>/gi;
    for (const [, content] of html.matchAll(pattern)) {
      const title = stripTags(extractOne(content, /<h2[^>]*>([\s\S]*?)<\/h2>/) || '');
      const slug = extractOne(content, /href="[^"]*\/([^/"]+)\/?"/);
      const img = extractOne(content, /<img[^>]+src="([^"]+)"/);
      if (title && slug) results.push({ title, slug, img: img || '', status: 'ongoing' });
    }
    return setCache(cacheKey, results.slice(0, 20));
  } catch (e) {
    return [];
  }
}

/**
 * Get completed anime
 */
async function getCompletedAnime() {
  const cacheKey = 'completed';
  const cached = getCached(cacheKey);
  if (cached) return cached;

  try {
    const html = await fetchPage(`${SAMEHADAKU_BASE}/complete-anime/`);
    const results = [];
    const pattern = /<article[^>]*>([\s\S]*?)<\/article>/gi;
    for (const [, content] of html.matchAll(pattern)) {
      const title = stripTags(extractOne(content, /<h2[^>]*>([\s\S]*?)<\/h2>/) || '');
      const slug = extractOne(content, /href="[^"]*\/([^/"]+)\/?"/);
      const img = extractOne(content, /<img[^>]+src="([^"]+)"/);
      if (title && slug) results.push({ title, slug, img: img || '', status: 'completed' });
    }
    return setCache(cacheKey, results.slice(0, 20));
  } catch (e) {
    return [];
  }
}

/**
 * Get schedule
 */
async function getSchedule() {
  const cacheKey = 'schedule';
  const cached = getCached(cacheKey);
  if (cached) return cached;

  try {
    const html = await fetchPage(`${SAMEHADAKU_BASE}/jadwal-rilis/`);
    const days = {};
    const dayNames = ['Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu', 'Minggu'];

    for (const day of dayNames) {
      days[day] = [];
      const daySection = extractOne(html, new RegExp(`${day}[\\s\\S]*?(<ul[^>]*>[\\s\\S]*?<\\/ul>)`));
      if (daySection) {
        for (const [, href, title] of daySection.matchAll(/<a[^>]+href="([^"]+)"[^>]*>([^<]+)<\/a>/gi)) {
          const slug = href.match(/\/([^/]+)\/?$/)?.[1];
          if (slug) days[day].push({ title: title.trim(), slug });
        }
      }
    }
    return setCache(cacheKey, days);
  } catch (e) {
    return {};
  }
}

/**
 * Get genres list
 */
async function getGenres() {
  const cacheKey = 'genres';
  const cached = getCached(cacheKey);
  if (cached) return cached;

  try {
    const html = await fetchPage(SAMEHADAKU_BASE);
    const genres = [];
    for (const [, href, name] of html.matchAll(/href="[^"]*\/genre\/([^/"]+)\/?"\s*>([^<]+)<\/a>/gi)) {
      genres.push({ slug: href, name: name.trim() });
    }
    return setCache(cacheKey, [...new Map(genres.map(g => [g.name, g])).values()]);
  } catch (e) {
    return [];
  }
}

/**
 * Get anime by genre
 */
async function getAnimeByGenre(genreSlug, page = 1) {
  const cacheKey = `genre_${genreSlug}_${page}`;
  const cached = getCached(cacheKey);
  if (cached) return cached;

  try {
    const url = `${SAMEHADAKU_BASE}/genre/${genreSlug}/page/${page}/`;
    const html = await fetchPage(url);
    const results = [];
    const pattern = /<article[^>]*>([\s\S]*?)<\/article>/gi;
    for (const [, content] of html.matchAll(pattern)) {
      const title = stripTags(extractOne(content, /<h2[^>]*>([\s\S]*?)<\/h2>/) || '');
      const slug = extractOne(content, /href="[^"]*\/([^/"]+)\/?"/);
      const img = extractOne(content, /<img[^>]+src="([^"]+)"/);
      if (title && slug) results.push({ title, slug, img: img || '' });
    }
    return setCache(cacheKey, { results, genre: genreSlug, page });
  } catch (e) {
    return { results: [], error: e.message };
  }
}

// Export for use in Node.js or browser
if (typeof module !== 'undefined') {
  module.exports = { getLatestAnime, searchAnime, getAnimeDetail, getEpisodeDetail, getPopularAnime, getOngoingAnime, getCompletedAnime, getSchedule, getGenres, getAnimeByGenre };
}

// Make available globally in browser
if (typeof window !== 'undefined') {
  window.SamehadakuProvider = { getLatestAnime, searchAnime, getAnimeDetail, getEpisodeDetail, getPopularAnime, getOngoingAnime, getCompletedAnime, getSchedule, getGenres, getAnimeByGenre };
}
