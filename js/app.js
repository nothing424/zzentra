// =============================================
// ZENTRA - Main Application JavaScript
// Everything Anime, One Place.
// =============================================

'use strict';

// === FIREBASE ===
// Config diambil dari firebase-config.js (edit file itu saja)
const FIREBASE_CONFIG = window.ZENTRA_FIREBASE_CONFIG || {
  apiKey: "AIzaSyCeeArePXvLGK2LPht1ky42jZcfOnSZRgg", authDomain: "zzentra.firebaseapp.com", projectId: "zzentra", storageBucket: "zzentra.firebasestorage.app", messagingSenderId: "344663072694", appId: "1:344663072694:web:36fcb6c8e1904405456b17"
};

// Firebase diload via CDN di index.html (type="module")
// Variabel fb_db diset setelah Firebase init di bawah
let fb_db = null;

async function initFirebase() {
  try {
    const { initializeApp } = await import("https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js");
    const { getFirestore, collection, query, where, orderBy, onSnapshot } = await import("https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js");
    const fbApp = initializeApp(FIREBASE_CONFIG, 'zentra-main');
    fb_db = getFirestore(fbApp);
    // Start realtime listener
    startAnnouncementsListener(collection, query, where, orderBy, onSnapshot);
    // Check emergency
    const { doc, getDoc } = await import("https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js");
    checkEmergency(doc, getDoc);
  } catch(e) {
    console.warn('Firebase tidak terhubung, pakai data lokal.', e);
    loadAnnouncementsFallback();
  }
}

function startAnnouncementsListener(collection, query, where, orderBy, onSnapshot) {
  if (!fb_db) return;
  const q = query(
    collection(fb_db, 'announcements'),
    where('active', '==', true),
    orderBy('createdAt', 'desc')
  );
  onSnapshot(q, (snap) => {
    App.announcements = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    // Pinned selalu di depan
    App.announcements.sort((a, b) => (b.pinned ? 1 : 0) - (a.pinned ? 1 : 0));
    renderAnnouncementBar();
    const grid = document.getElementById('ann-grid');
    if (grid) renderAnnouncementGrid(grid);
  }, (err) => {
    console.warn('Listener error:', err);
    loadAnnouncementsFallback();
  });
}

async function checkEmergency(doc, getDoc) {
  try {
    const snap = await getDoc(doc(fb_db, 'settings', 'emergency'));
    if (snap.exists() && snap.data().active) {
      showEmergencyNotice(snap.data().message || 'Zentra sedang dalam maintenance.');
    }
  } catch {}
}

function showEmergencyNotice(msg) {
  const existing = document.getElementById('emergency-overlay');
  if (existing) return;
  const el = document.createElement('div');
  el.id = 'emergency-overlay';
  el.style.cssText = 'position:fixed;inset:0;z-index:9998;background:rgba(0,0,0,0.97);display:flex;flex-direction:column;align-items:center;justify-content:center;gap:16px;text-align:center;padding:24px';
  el.innerHTML = `
    <svg width="52" height="52" viewBox="0 0 24 24" fill="none" stroke="#ef4444" stroke-width="1.5"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>
    <div style="font-family:'Space Grotesk',sans-serif;font-size:1.4rem;font-weight:800;color:#fff">Pemberitahuan Darurat</div>
    <div style="font-size:0.9rem;color:#A8B3CF;max-width:400px;line-height:1.7">${msg}</div>
    <div style="font-size:0.75rem;color:rgba(255,255,255,0.3);margin-top:8px">Zentra · Emergency Notice</div>`;
  document.body.appendChild(el);
}


// === APP STATE ===
const App = {
  currentPage: 'home',
  currentUser: null,
  watchHistory: JSON.parse(localStorage.getItem('zentra_history') || '[]'),
  library: JSON.parse(localStorage.getItem('zentra_library') || '{}'),
  subtitleSettings: JSON.parse(localStorage.getItem('zentra_subs') || '{"lang":"id","size":100,"color":"#ffffff","bg":true,"position":"bottom"}'),
  playerSpeed: parseFloat(localStorage.getItem('zentra_speed') || '1'),
  playerQuality: localStorage.getItem('zentra_quality') || 'auto',
  searchQuery: '',
  searchResults: [],
  currentAnime: null,
  currentEpisode: null,
  heroAnimes: [],
  heroIndex: 0,
  heroTimer: null,
  aiMessages: [],
  announcements: [],
};

// === JIKAN API ===
const JIKAN = {
  base: 'https://api.jikan.moe/v4',
  cache: new Map(),
  async get(path, params = {}) {
    const qs = new URLSearchParams(params).toString();
    const url = `${this.base}${path}${qs ? '?' + qs : ''}`;
    if (this.cache.has(url)) return this.cache.get(url);
    try {
      const r = await fetch(url);
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const data = await r.json();
      this.cache.set(url, data);
      return data;
    } catch (e) {
      console.error('Jikan API Error:', e);
      return null;
    }
  }
};

// === ZENTRA AI API ===
const AI_API = 'https://api-nanzz.my.id/docs/api/ai/chat-gpt.php';

async function callAI(text, model = 'deepseek') {
  try {
    const r = await fetch(`${AI_API}?text=${encodeURIComponent(text)}&model=${model}`);
    const data = await r.json();
    return data.result || data.response || data.message || data.data || 'Maaf, terjadi kesalahan pada AI.';
  } catch (e) {
    return 'Maaf, AI sedang tidak tersedia. Coba lagi nanti.';
  }
}

// === ROUTER ===
function navigate(page, data = {}) {
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  document.querySelectorAll('.nav-item, .bottom-nav-item').forEach(n => n.classList.remove('active'));

  const pageEl = document.getElementById(`page-${page}`);
  if (pageEl) pageEl.classList.add('active');

  document.querySelectorAll(`[data-page="${page}"]`).forEach(n => n.classList.add('active'));

  App.currentPage = page;
  window.history.pushState({ page, data }, '', `#${page}`);

  switch (page) {
    case 'home': loadHome(); break;
    case 'explore': loadExplore(); break;
    case 'ai': initAI(); break;
    case 'wiki': loadWiki(); break;
    case 'profile': loadProfile(); break;
    case 'detail': loadDetail(data.id, data.type); break;
    case 'watch': loadWatch(data.id, data.ep); break;
    case 'announcements': loadAnnouncements(); break;
  }

  window.scrollTo({ top: 0, behavior: 'smooth' });
}

window.addEventListener('popstate', (e) => {
  if (e.state?.page) navigate(e.state.page, e.state.data || {});
});

// === HOME PAGE ===
async function loadHome() {
  loadHeroBanner();
  loadSection('trending', JIKAN.get('/top/anime', { filter: 'airing', limit: 12 }), 'trending-row');
  loadSection('popular', JIKAN.get('/top/anime', { filter: 'bypopularity', limit: 12 }), 'popular-row');
  loadSection('toprated', JIKAN.get('/top/anime', { limit: 12 }), 'toprated-row');
  loadSection('seasonal', JIKAN.get('/seasons/now', { limit: 12 }), 'seasonal-row');
  loadAnnouncements();
  loadContinueWatching();
}

async function loadHeroBanner() {
  const wrap = document.getElementById('hero-wrap');
  if (!wrap) return;
  showHeroSkeleton(wrap);
  const data = await JIKAN.get('/top/anime', { filter: 'airing', limit: 6 });
  if (!data?.data?.length) return;
  App.heroAnimes = data.data.slice(0, 6);
  renderHero(0);
  startHeroTimer();
}

function showHeroSkeleton(wrap) {
  wrap.innerHTML = `<div class="hero"><div class="hero-bg"></div><div class="hero-content"><div class="skeleton" style="height:20px;width:120px;border-radius:99px;margin-bottom:16px"></div><div class="skeleton" style="height:40px;width:80%;margin-bottom:8px"></div><div class="skeleton" style="height:16px;width:60%;margin-bottom:8px"></div><div class="skeleton" style="height:16px;width:40%;margin-bottom:24px"></div><div style="display:flex;gap:12px"><div class="skeleton" style="height:40px;width:120px;border-radius:99px"></div><div class="skeleton" style="height:40px;width:100px;border-radius:99px"></div></div></div></div>`;
}

function renderHero(idx) {
  if (!App.heroAnimes.length) return;
  const anime = App.heroAnimes[idx];
  App.heroIndex = idx;
  const wrap = document.getElementById('hero-wrap');
  if (!wrap) return;
  const bg = anime.images?.jpg?.large_image_url || anime.images?.jpg?.image_url || '';
  const score = anime.score ? `<span class="rating-star">★</span> ${anime.score}` : '';
  const genres = (anime.genres || []).slice(0, 3).map(g => g.name).join(' · ');
  const eps = anime.episodes ? `${anime.episodes} Eps` : 'Ongoing';
  const dots = App.heroAnimes.map((_, i) =>
    `<div class="hero-dot ${i === idx ? 'active' : ''}" onclick="renderHero(${i})"></div>`
  ).join('');

  wrap.innerHTML = `
    <div class="hero">
      <div class="hero-bg" style="background-image:url('${bg}')"></div>
      <div class="hero-content">
        <div class="hero-badge"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><polygon points="10,8 16,12 10,16"/></svg> Now Streaming</div>
        <h1 class="hero-title">${anime.title_english || anime.title}</h1>
        <p class="hero-synopsis">${anime.synopsis || 'No synopsis available.'}</p>
        <div class="hero-meta">
          ${score ? `<span class="hero-meta-item">${score}</span>` : ''}
          ${genres ? `<span class="hero-meta-item" style="color:var(--muted)">${genres}</span>` : ''}
          <span class="hero-meta-item" style="color:var(--muted)">${eps}</span>
        </div>
        <div class="hero-actions">
          <button class="btn-primary flex items-center gap-2" onclick="navigate('watch',{id:${anime.mal_id},ep:1})">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><polygon points="5,3 19,12 5,21"/></svg> Tonton Sekarang
          </button>
          <button class="glass-btn" onclick="navigate('detail',{id:${anime.mal_id}})">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg> Detail
          </button>
        </div>
      </div>
      <div class="hero-dots">${dots}</div>
    </div>`;
}

function startHeroTimer() {
  if (App.heroTimer) clearInterval(App.heroTimer);
  App.heroTimer = setInterval(() => {
    const next = (App.heroIndex + 1) % App.heroAnimes.length;
    renderHero(next);
  }, 6000);
}

async function loadSection(type, promise, rowId) {
  const row = document.getElementById(rowId);
  if (!row) return;
  row.innerHTML = Array(8).fill(0).map(() => `
    <div class="anime-card skeleton-card" style="width:150px;flex-shrink:0">
      <div class="skeleton skeleton-poster"></div>
      <div class="skeleton skeleton-line"></div>
      <div class="skeleton skeleton-line-sm"></div>
    </div>`).join('');
  const data = await promise;
  const list = data?.data || [];
  if (!list.length) { row.innerHTML = '<p class="text-muted text-sm" style="padding:20px">Gagal memuat data.</p>'; return; }
  row.innerHTML = list.map(a => animeCardHTML(a)).join('');
}

function animeCardHTML(a) {
  const img = a.images?.jpg?.image_url || '';
  const rating = a.score ? `<div class="anime-card-rating"><svg width="10" height="10" viewBox="0 0 24 24" fill="currentColor" style="color:var(--warning)"><polygon points="12,2 15.09,8.26 22,9.27 17,14.14 18.18,21.02 12,17.77 5.82,21.02 7,14.14 2,9.27 8.91,8.26"/></svg> ${a.score}</div>` : '';
  const status = a.status === 'Currently Airing' ? 'ongoing' : a.type === 'Movie' ? 'movie' : 'completed';
  const badgeLabel = status === 'ongoing' ? 'Ongoing' : status === 'movie' ? 'Movie' : 'Tamat';
  const eps = a.episodes ? `${a.episodes} Eps` : (a.status === 'Currently Airing' ? 'Ongoing' : '?');
  return `
    <div class="anime-card" onclick="navigate('detail',{id:${a.mal_id}})">
      <img class="anime-card-poster" src="${img}" alt="${a.title}" loading="lazy" onerror="this.src='data:image/svg+xml,<svg xmlns=%22http://www.w3.org/2000/svg%22 width=%22150%22 height=%22200%22><rect fill=%22%2312182D%22 width=%22150%22 height=%22200%22/><text x=%2250%%22 y=%2250%%22 text-anchor=%22middle%22 fill=%22%23A8B3CF%22 font-size=%2212%22>No Image</text></svg>'">
      ${rating}
      <div class="anime-card-badge badge-${status}">${badgeLabel}</div>
      <div class="anime-card-overlay">
        <div class="play-btn-overlay" onclick="event.stopPropagation();navigate('watch',{id:${a.mal_id},ep:1})">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="white"><polygon points="5,3 19,12 5,21"/></svg>
        </div>
        <div>
          <div style="font-size:0.78rem;font-weight:600;margin-bottom:4px">${a.title_english || a.title}</div>
          <div style="font-size:0.7rem;color:var(--muted)">${eps}</div>
        </div>
      </div>
      <div class="anime-card-info">
        <div class="anime-card-title">${a.title_english || a.title}</div>
        <div class="anime-card-meta">${eps} · ${a.type || 'TV'}</div>
      </div>
    </div>`;
}

function loadContinueWatching() {
  const row = document.getElementById('continue-row');
  const section = document.getElementById('continue-section');
  if (!row || !section) return;
  if (!App.watchHistory.length) { section.style.display = 'none'; return; }
  section.style.display = 'block';
  row.innerHTML = App.watchHistory.slice(0, 8).map(h => `
    <div class="anime-card" style="width:160px;flex-shrink:0" onclick="navigate('watch',{id:${h.id},ep:${h.ep}})">
      <img class="anime-card-poster" src="${h.img}" alt="${h.title}" loading="lazy">
      <div class="anime-card-info">
        <div class="anime-card-title">${h.title}</div>
        <div class="anime-card-meta">Ep ${h.ep}</div>
        <div style="margin-top:6px;height:3px;background:rgba(255,255,255,0.1);border-radius:99px">
          <div style="width:${h.progress || 0}%;height:100%;background:var(--primary);border-radius:99px"></div>
        </div>
      </div>
    </div>`).join('');
}

// === EXPLORE PAGE ===
let exploreTimeout = null;
let explorePage = 1;
let exploreLoading = false;

async function loadExplore(reset = true) {
  if (reset) {
    explorePage = 1;
    document.getElementById('explore-grid').innerHTML = skeletonGrid(12);
  }
  exploreLoading = true;
  const q = document.getElementById('explore-search')?.value || '';
  const genre = document.getElementById('filter-genre')?.value || '';
  const status = document.getElementById('filter-status')?.value || '';
  const order = document.getElementById('sort-by')?.value || 'popularity';
  const params = { limit: 20, page: explorePage, order_by: order };
  if (q) params.q = q;
  if (genre) params.genres = genre;
  if (status) params.status = status;
  const endpoint = q ? '/anime' : '/top/anime';
  const data = await JIKAN.get(endpoint, params);
  const list = data?.data || [];
  const grid = document.getElementById('explore-grid');
  if (reset) grid.innerHTML = '';
  if (!list.length && reset) {
    grid.innerHTML = `<div style="grid-column:1/-1;text-align:center;padding:60px;color:var(--muted)"><svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" style="margin:0 auto 16px;opacity:0.4"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/></svg><p>Tidak ditemukan hasil untuk pencarian ini.</p></div>`;
    return;
  }
  grid.innerHTML += list.map(a => animeCardHTML(a)).join('');
  exploreLoading = false;
  explorePage++;
}

function skeletonGrid(n) {
  return Array(n).fill(0).map(() => `
    <div class="skeleton-card">
      <div class="skeleton skeleton-poster" style="aspect-ratio:3/4"></div>
      <div class="skeleton skeleton-line"></div>
      <div class="skeleton skeleton-line-sm"></div>
    </div>`).join('');
}

function setupExploreSearch() {
  const input = document.getElementById('explore-search');
  if (!input) return;
  input.addEventListener('input', () => {
    clearTimeout(exploreTimeout);
    exploreTimeout = setTimeout(() => loadExplore(), 600);
  });
}

function setupInfiniteScroll() {
  window.addEventListener('scroll', () => {
    if (App.currentPage !== 'explore') return;
    if (exploreLoading) return;
    const scrolled = window.innerHeight + window.scrollY;
    const total = document.documentElement.scrollHeight - 200;
    if (scrolled >= total) loadExplore(false);
  });
}

// === DETAIL PAGE ===
async function loadDetail(id, type = 'anime') {
  const page = document.getElementById('page-detail');
  if (!page) return;
  page.innerHTML = `<div style="text-align:center;padding:80px;"><div class="spinner" style="margin:0 auto"></div></div>`;

  const [animeData, charsData, recs] = await Promise.all([
    JIKAN.get(`/anime/${id}/full`),
    JIKAN.get(`/anime/${id}/characters`),
    JIKAN.get(`/anime/${id}/recommendations`)
  ]);

  const a = animeData?.data;
  if (!a) { page.innerHTML = '<div class="empty-state"><p>Gagal memuat detail anime.</p></div>'; return; }
  App.currentAnime = a;

  const chars = charsData?.data?.slice(0, 12) || [];
  const recList = recs?.data?.slice(0, 8) || [];
  const banner = a.images?.jpg?.large_image_url || a.images?.jpg?.image_url || '';
  const poster = a.images?.jpg?.image_url || '';
  const genres = (a.genres || []).map(g => `<span class="detail-tag">${g.name}</span>`).join('');
  const studios = (a.studios || []).map(s => s.name).join(', ') || '-';
  const inLibrary = App.library[a.mal_id];
  const libStatus = inLibrary ? inLibrary.status : null;

  page.innerHTML = `
    <div class="detail-banner">
      <img src="${banner}" alt="${a.title}" class="detail-banner-img" onerror="this.style.display='none'">
    </div>
    <div class="detail-info">
      <img src="${poster}" alt="${a.title}" class="detail-poster" onerror="this.src='data:image/svg+xml,<svg xmlns=%22http://www.w3.org/2000/svg%22 width=%22160%22 height=%22220%22><rect fill=%22%2312182D%22 width=%22160%22 height=%22220%22/></svg>'">
      <div class="detail-meta">
        <h1 class="detail-title">${a.title_english || a.title}</h1>
        <div class="detail-jp-title">${a.title_japanese || ''}</div>
        <div class="detail-tags">${genres}</div>
        <div class="detail-stats">
          <div class="detail-stat"><div class="detail-stat-value">${a.score || 'N/A'}</div><div class="detail-stat-label">Skor</div></div>
          <div class="detail-stat"><div class="detail-stat-value">${a.episodes || '?'}</div><div class="detail-stat-label">Episode</div></div>
          <div class="detail-stat"><div class="detail-stat-value">${a.rank ? '#' + a.rank : '-'}</div><div class="detail-stat-label">Ranking</div></div>
          <div class="detail-stat"><div class="detail-stat-value">${(a.members/1000).toFixed(0)}K</div><div class="detail-stat-label">Members</div></div>
        </div>
        <div class="detail-actions">
          <button class="btn-primary" onclick="navigate('watch',{id:${a.mal_id},ep:1})">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor" style="display:inline;margin-right:4px"><polygon points="5,3 19,12 5,21"/></svg> Tonton
          </button>
          <button class="glass-btn" onclick="showLibraryModal(${a.mal_id})">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z"/></svg>
            ${libStatus ? libStatus : 'Tambah'}
          </button>
        </div>
      </div>
    </div>
    <div class="tabs" id="detail-tabs">
      <div class="tab active" data-tab="overview" onclick="switchTab('overview')">Overview</div>
      <div class="tab" data-tab="episodes" onclick="switchTab('episodes')">Episode</div>
      <div class="tab" data-tab="characters" onclick="switchTab('characters')">Karakter</div>
      <div class="tab" data-tab="related" onclick="switchTab('related')">Terkait</div>
      <div class="tab" data-tab="wiki" onclick="switchTab('wiki')">Wiki</div>
      <div class="tab" data-tab="recs" onclick="switchTab('recs')">Rekomendasi</div>
    </div>
    <div id="tab-overview" class="tab-content active">
      <div style="display:grid;grid-template-columns:1fr;gap:20px">
        <div>
          <h3 style="font-size:1rem;font-weight:700;margin-bottom:10px">Sinopsis</h3>
          <p style="font-size:0.875rem;color:var(--muted);line-height:1.8" id="synopsis-text">${a.synopsis || 'Tidak ada sinopsis.'}</p>
          ${a.synopsis && a.synopsis.length > 300 ? `<button class="glass-btn" style="margin-top:12px;padding:6px 14px;font-size:0.8rem" onclick="toggleSynopsis()">Baca Selengkapnya</button>` : ''}
        </div>
        <div class="glass-card" style="padding:20px">
          <h3 style="font-size:0.9rem;font-weight:700;margin-bottom:14px">Informasi</h3>
          <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;font-size:0.82rem">
            ${infoRow('Studio', studios)}
            ${infoRow('Status', a.status || '-')}
            ${infoRow('Musim', a.season ? `${a.season} ${a.year}` : '-')}
            ${infoRow('Tipe', a.type || '-')}
            ${infoRow('Durasi', a.duration || '-')}
            ${infoRow('Rating', a.rating || '-')}
            ${infoRow('Tayang', a.aired?.string || '-')}
            ${infoRow('Sumber', a.source || '-')}
          </div>
        </div>
      </div>
    </div>
    <div id="tab-episodes" class="tab-content">
      ${renderEpisodeGrid(a.episodes, a.mal_id)}
    </div>
    <div id="tab-characters" class="tab-content">
      <div class="char-grid">
        ${chars.map(c => `
          <div class="char-card glass-card" onclick="showCharModal(${JSON.stringify(c).replace(/"/g,'&quot;')})">
            <img class="char-img" src="${c.character?.images?.jpg?.image_url || ''}" alt="${c.character?.name}" loading="lazy">
            <div class="char-info">
              <div class="char-name">${c.character?.name || ''}</div>
              <div class="char-role">${c.role || ''}</div>
            </div>
          </div>`).join('')}
      </div>
    </div>
    <div id="tab-related" class="tab-content">
      ${renderRelated(a.relations || [])}
    </div>
    <div id="tab-wiki" class="tab-content">
      ${renderWikiTab(a)}
    </div>
    <div id="tab-recs" class="tab-content">
      <div class="anime-grid">
        ${recList.map(r => animeCardHTML(r.entry)).join('')}
      </div>
    </div>`;
}

function infoRow(label, val) {
  return `<div><div style="color:var(--muted);margin-bottom:2px">${label}</div><div style="font-weight:600">${val}</div></div>`;
}

function renderEpisodeGrid(total, animeId) {
  if (!total) return '<p class="text-muted" style="padding:20px">Informasi episode tidak tersedia.</p>';
  const eps = Math.min(total, 100);
  const watched = App.watchHistory.filter(h => h.id == animeId).map(h => h.ep);
  const btns = Array.from({length: eps}, (_, i) => {
    const ep = i + 1;
    const cls = watched.includes(ep) ? 'watched' : '';
    return `<button class="ep-btn ${cls}" onclick="navigate('watch',{id:${animeId},ep:${ep}})">${ep}</button>`;
  }).join('');
  return `<div class="episode-grid">${btns}</div>${total > 100 ? `<p class="text-muted text-sm" style="margin-top:16px">Menampilkan 100 dari ${total} episode.</p>` : ''}`;
}

function renderRelated(relations) {
  if (!relations.length) return '<p class="text-muted" style="padding:20px">Tidak ada anime terkait.</p>';
  return relations.map(r => `
    <div style="margin-bottom:16px">
      <div style="font-size:0.78rem;font-weight:700;text-transform:uppercase;letter-spacing:1px;color:var(--muted);margin-bottom:8px">${r.relation}</div>
      <div style="display:flex;flex-wrap:wrap;gap:8px">
        ${r.entry.map(e => `<button class="filter-chip" onclick="navigate('detail',{id:${e.mal_id}})">${e.name}</button>`).join('')}
      </div>
    </div>`).join('');
}

function renderWikiTab(a) {
  return `
    <div style="display:flex;flex-direction:column;gap:16px">
      <div class="glass-card" style="padding:20px">
        <h3 style="font-size:1rem;font-weight:700;margin-bottom:10px;color:var(--primary)">Overview</h3>
        <p style="font-size:0.875rem;color:var(--muted);line-height:1.8">${a.synopsis || '-'}</p>
      </div>
      <div class="glass-card" style="padding:20px">
        <h3 style="font-size:1rem;font-weight:700;margin-bottom:10px;color:var(--primary)">Lore & Dunia</h3>
        <p style="font-size:0.875rem;color:var(--muted);line-height:1.8">${a.background || 'Informasi lore belum tersedia untuk anime ini.'}</p>
      </div>
      <div class="glass-card" style="padding:20px">
        <h3 style="font-size:1rem;font-weight:700;margin-bottom:10px;color:var(--primary)">Watch Order</h3>
        <p style="font-size:0.875rem;color:var(--muted);line-height:1.8">Mulai dari awal serial dan ikuti urutan kronologis berdasarkan tanggal rilis. Jika ada OVA atau film, tonton setelah musim utama selesai.</p>
      </div>
      <div class="glass-card" style="padding:20px">
        <h3 style="font-size:1rem;font-weight:700;margin-bottom:10px;color:var(--primary)">Trivia</h3>
        <ul style="font-size:0.875rem;color:var(--muted);line-height:1.8;padding-left:16px;list-style:disc">
          <li>Diadaptasi dari ${a.source || 'manga/light novel'}.</li>
          <li>Diproduksi oleh ${(a.studios || []).map(s=>s.name).join(', ') || 'studio tidak diketahui'}.</li>
          <li>Ditayangkan pada ${a.aired?.string || 'tanggal tidak diketahui'}.</li>
          ${a.score ? `<li>Mendapatkan skor rata-rata ${a.score}/10 dari komunitas MAL.</li>` : ''}
        </ul>
      </div>
    </div>`;
}

let synopsisExpanded = false;
function toggleSynopsis() {
  const el = document.getElementById('synopsis-text');
  if (!el) return;
  synopsisExpanded = !synopsisExpanded;
  el.style.webkitLineClamp = synopsisExpanded ? 'unset' : '4';
  el.style.display = synopsisExpanded ? 'block' : '-webkit-box';
}

function switchTab(tab) {
  document.querySelectorAll('[data-tab]').forEach(t => t.classList.remove('active'));
  document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
  document.querySelector(`[data-tab="${tab}"]`)?.classList.add('active');
  document.getElementById(`tab-${tab}`)?.classList.add('active');
}

// === WATCH / PLAYER PAGE ===
let playerInterval = null;

async function loadWatch(animeId, ep = 1) {
  const page = document.getElementById('page-watch');
  if (!page) return;
  App.currentEpisode = ep;

  let anime = App.currentAnime;
  if (!anime || anime.mal_id != animeId) {
    const data = await JIKAN.get(`/anime/${animeId}/full`);
    anime = data?.data;
    App.currentAnime = anime;
  }
  if (!anime) { page.innerHTML = '<div class="empty-state"><p>Gagal memuat.</p></div>'; return; }

  const title = anime.title_english || anime.title;
  const poster = anime.images?.jpg?.image_url || '';
  const totalEps = anime.episodes || '?';

  // Build embed URL using AniWatch/Yugenanime search
  const embedTitle = encodeURIComponent((anime?.title_english || anime?.title || '').replace(/season/i,'').trim());
  const embedUrl = `https://www.google.com/search?q=${embedTitle}+episode+${ep}+site:aniwatch.to`;

  page.innerHTML = `
    <div style="background:#000;padding:0;position:relative">
      <!-- Iframe embed player -->
      <div style="position:relative;width:100%;aspect-ratio:16/9;background:#000;max-width:100%">
        <div id="stream-loading" style="position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:12px;background:#0B1020;z-index:2">
          <div class="spinner" style="width:36px;height:36px;border-width:3px"></div>
          <div style="font-size:0.85rem;color:var(--muted)">Memuat player...</div>
        </div>
        <iframe
          id="stream-iframe"
          src="about:blank"
          style="width:100%;height:100%;border:none;position:absolute;inset:0;z-index:1"
          allowfullscreen
          allow="fullscreen; autoplay; encrypted-media"
          scrolling="no"
          onload="document.getElementById('stream-loading').style.display='none'"
        ></iframe>
      </div>
    </div>
    <div style="padding:20px 16px;max-width:900px;margin:0 auto">
      <div style="margin-bottom:4px;color:var(--muted);font-size:0.8rem">Episode ${ep}</div>
      <h2 style="font-size:1.2rem;font-weight:700;margin-bottom:16px">${title}</h2>
      <div style="display:flex;gap:10px;flex-wrap:wrap;margin-bottom:20px">
        ${ep > 1 ? `<button class="glass-btn" onclick="prevEpisode(${animeId},${ep})">← Ep ${ep-1}</button>` : ''}
        ${totalEps !== '?' && ep < totalEps ? `<button class="btn-primary" onclick="nextEpisode(${animeId},${ep},${totalEps})">Ep ${ep+1} →</button>` : ''}
        <button class="glass-btn" onclick="navigate('detail',{id:${animeId}})">Daftar Episode</button>
      </div>
      <!-- Stream search result card -->
      <div class="glass-card" style="padding:16px;margin-bottom:16px" id="stream-info-card">
        <div style="font-size:0.82rem;font-weight:700;color:var(--muted);text-transform:uppercase;letter-spacing:1px;margin-bottom:10px">Sumber Streaming</div>
        <div id="stream-status" style="font-size:0.85rem;color:var(--muted);display:flex;align-items:center;gap:8px">
          <div class="spinner" style="width:14px;height:14px;border-width:2px"></div>
          Mencari episode...
        </div>
      </div>
    </div>`;

  // Load stream
  loadStreamEmbed(animeId, ep, anime);
  saveWatchHistory(animeId, ep, anime);
  setupPlayerGestures();
}

// === STREAM EMBED LOADER ===
// Strategi: cari episode di AniWatch via title MAL, embed iframe-nya
// Tidak butuh scraping - pakai embed URL langsung yang work di browser

const STREAM_PROVIDERS = [
  {
    name: 'AniWatch',
    // Build search URL then get embed
    getEmbedUrl: async (title, ep, malId) => {
      // AniWatch embed format: https://aniwatch.to/watch/{slug}-{id}?ep={ep}
      // Kita pakai anime-sama yang support embed
      return buildAnimeSamaEmbed(title, ep, malId);
    }
  }
];

async function buildAnimeSamaEmbed(title, ep, malId) {
  // anime-sama.fr supports MAL ID based search and has embeddable player
  // Format: https://anime-sama.fr/catalogue/{slug}/saison1/vostfr/
  // Lebih reliable: pakai vidstream via anime title search

  // Option 1: Anibinge embed (support MAL ID)
  // Option 2: Anime-sama (French but works)
  // Option 3: 9anime embed clone

  // Paling reliable yang support embed: AllAnime / Anibinge
  // Kita pakai format query ke service yang tersedia

  const cleanTitle = title
    .replace(/[^a-zA-Z0-9\s]/g, '')
    .replace(/\s+/g, '-')
    .toLowerCase()
    .trim();

  // Coba beberapa format embed yang umum work
  // AnimeOnsen - embed anime via MAL ID
  const sources = [
    `https://embtaku.pro/loading.php?id=${malId}&refer=&autoplay=1`,
    `https://www.youtube.com/embed?listType=search&list=${encodeURIComponent(title + ' episode ' + ep + ' sub indo')}`,
  ];
  return sources[0];
}

async function loadStreamEmbed(animeId, ep, anime) {
  const iframe = document.getElementById('stream-iframe');
  const statusEl = document.getElementById('stream-status');
  const loading = document.getElementById('stream-loading');

  if (!iframe) return;

  const title = anime?.title_english || anime?.title || '';
  const malId = anime?.mal_id || animeId;

  // Update status
  if (statusEl) statusEl.innerHTML = `
    <div style="display:flex;align-items:center;gap:8px;margin-bottom:8px">
      <div style="width:8px;height:8px;border-radius:50%;background:var(--success);flex-shrink:0"></div>
      <span style="color:var(--text);font-weight:600">Memuat stream...</span>
    </div>
    <div style="font-size:0.78rem;color:var(--muted);margin-bottom:12px">
      ${title} · Episode ${ep}
    </div>`;

  // Strategy: try embtaku first (MAL ID based embed)
  // This is a real working anime embed service
  const embedSources = [
    {
      label: 'Stream',
      url: `https://embtaku.pro/loading.php?id=${malId}&episode=${ep}&autoplay=1`
    }
  ];

  const src = embedSources[0].url;

  // Set iframe src
  iframe.onload = () => {
    if (loading) loading.style.display = 'none';
    if (statusEl) statusEl.innerHTML = `
      <div style="display:flex;align-items:center;gap:8px;margin-bottom:8px">
        <div style="width:8px;height:8px;border-radius:50%;background:var(--success);animation:pulse-dot 2s infinite;flex-shrink:0"></div>
        <span style="color:var(--success);font-weight:600">Stream aktif</span>
      </div>
      <div style="font-size:0.78rem;color:var(--muted)">${title} · Ep ${ep}</div>
      <div style="margin-top:10px;font-size:0.75rem;color:var(--muted)">
        Jika video tidak muncul, gunakan tombol "Cari di Google" di bawah.
      </div>
      <div style="margin-top:10px;display:flex;gap:8px;flex-wrap:wrap">
        <a href="https://aniwatch.to/search?keyword=${encodeURIComponent(title)}" target="_blank" class="glass-btn" style="font-size:0.75rem;padding:6px 12px">Buka AniWatch</a>
        <a href="https://otakudesu.cloud/?s=${encodeURIComponent(title)}" target="_blank" class="glass-btn" style="font-size:0.75rem;padding:6px 12px">Buka OtakuDesu</a>
        <a href="https://www.google.com/search?q=${encodeURIComponent(title+' episode '+ep+' sub indo')}" target="_blank" class="glass-btn" style="font-size:0.75rem;padding:6px 12px">Cari Google</a>
      </div>`;
    // Save to watch history with progress tracking
    saveWatchHistory(animeId, ep, anime);
  };

  iframe.onerror = () => {
    if (loading) loading.style.display = 'none';
    showStreamFallback(statusEl, title, ep, malId);
  };

  // Set timeout fallback - if iframe doesn't load in 8s show fallback
  const timeout = setTimeout(() => {
    if (loading) loading.style.display = 'none';
    showStreamFallback(statusEl, title, ep, malId);
  }, 8000);

  iframe.addEventListener('load', () => clearTimeout(timeout), { once: true });
  iframe.src = src;
}

function showStreamFallback(statusEl, title, ep, malId) {
  if (statusEl) statusEl.innerHTML = `
    <div style="display:flex;align-items:center;gap:8px;margin-bottom:10px">
      <div style="width:8px;height:8px;border-radius:50%;background:var(--warning)"></div>
      <span style="color:var(--warning);font-weight:600">Player tidak tersedia langsung</span>
    </div>
    <div style="font-size:0.8rem;color:var(--muted);margin-bottom:12px;line-height:1.6">
      Browser memblokir embed eksternal. Tonton langsung di salah satu situs di bawah:
    </div>
    <div style="display:flex;flex-direction:column;gap:8px">
      <a href="https://aniwatch.to/search?keyword=${encodeURIComponent(title)}" target="_blank"
         style="display:flex;align-items:center;justify-content:space-between;padding:12px 14px;background:rgba(79,140,255,0.1);border:1px solid rgba(79,140,255,0.2);border-radius:10px;font-size:0.85rem;font-weight:600;color:var(--primary)">
        <span>AniWatch · ${title} Ep ${ep}</span>
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15,3 21,3 21,9"/><line x1="10" y1="14" x2="21" y2="3"/></svg>
      </a>
      <a href="https://otakudesu.cloud/?s=${encodeURIComponent(title)}" target="_blank"
         style="display:flex;align-items:center;justify-content:space-between;padding:12px 14px;background:rgba(124,92,255,0.1);border:1px solid rgba(124,92,255,0.2);border-radius:10px;font-size:0.85rem;font-weight:600;color:var(--secondary)">
        <span>OtakuDesu · ${title}</span>
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15,3 21,3 21,9"/><line x1="10" y1="14" x2="21" y2="3"/></svg>
      </a>
      <a href="https://samehadaku.email/?s=${encodeURIComponent(title)}" target="_blank"
         style="display:flex;align-items:center;justify-content:space-between;padding:12px 14px;background:rgba(34,197,94,0.1);border:1px solid rgba(34,197,94,0.2);border-radius:10px;font-size:0.85rem;font-weight:600;color:var(--success)">
        <span>Samehadaku · ${title}</span>
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15,3 21,3 21,9"/><line x1="10" y1="14" x2="21" y2="3"/></svg>
      </a>
    </div>`;
}

function fmt(s) {
  if (!s || isNaN(s)) return '0:00';
  const m = Math.floor(s / 60);
  const sec = Math.floor(s % 60);
  return `${m}:${sec.toString().padStart(2,'0')}`;
}

function updatePlayIcon(paused) {
  const icons = ['play-icon', 'ctrl-play-icon'];
  icons.forEach(id => {
    const el = document.getElementById(id);
    if (!el) return;
    el.innerHTML = paused
      ? '<polygon points="5,3 19,12 5,21"/>'
      : '<rect x="6" y="4" width="4" height="16"/><rect x="14" y="4" width="4" height="16"/>';
  });
}

function togglePlay() {
  const v = document.getElementById('main-video');
  if (!v) return;
  v.paused ? v.play() : v.pause();
}

function playerSkip(sec) {
  const v = document.getElementById('main-video');
  if (!v) return;
  v.currentTime = Math.max(0, Math.min(v.duration || 0, v.currentTime + sec));
  const el = sec < 0 ? document.getElementById('seek-left') : document.getElementById('seek-right');
  if (el) { el.classList.add('show'); setTimeout(() => el.classList.remove('show'), 800); }
}

function seekVideo(e) {
  const v = document.getElementById('main-video');
  const bar = document.getElementById('progress-bar');
  if (!v || !bar) return;
  const rect = bar.getBoundingClientRect();
  const pct = (e.clientX - rect.left) / rect.width;
  v.currentTime = pct * (v.duration || 0);
}

function setSpeed(val) {
  const v = document.getElementById('main-video');
  const speed = parseFloat(val);
  if (v) v.playbackRate = speed;
  App.playerSpeed = speed;
  localStorage.setItem('zentra_speed', speed);
}

function toggleSubtitle(val) {
  App.subtitleSettings.lang = val;
  localStorage.setItem('zentra_subs', JSON.stringify(App.subtitleSettings));
}

function toggleFullscreen() {
  const iframeWrap = document.querySelector('[style*="aspect-ratio:16/9"]');
  if (!iframeWrap) return;
  if (document.fullscreenElement) document.exitFullscreen();
  else iframeWrap.requestFullscreen?.();
}

function fmt(s) {
  if (!s || isNaN(s)) return '0:00';
  const m = Math.floor(s / 60);
  const sec = Math.floor(s % 60);
  return `${m}:${sec.toString().padStart(2,'0')}`;
}

function updatePlayIcon(paused) {
  const icons = ['play-icon', 'ctrl-play-icon'];
  icons.forEach(id => {
    const el = document.getElementById(id);
    if (!el) return;
    el.innerHTML = paused
      ? '<polygon points="5,3 19,12 5,21"/>'
      : '<rect x="6" y="4" width="4" height="16"/><rect x="14" y="4" width="4" height="16"/>';
  });
}

function togglePlay() {
  const v = document.getElementById('main-video');
  if (!v) return;
  v.paused ? v.play() : v.pause();
}

function playerSkip(sec) {
  const v = document.getElementById('main-video');
  if (!v) return;
  v.currentTime = Math.max(0, Math.min(v.duration || 0, v.currentTime + sec));
  const el = sec < 0 ? document.getElementById('seek-left') : document.getElementById('seek-right');
  if (el) { el.classList.add('show'); setTimeout(() => el.classList.remove('show'), 800); }
}

function seekVideo(e) {
  const v = document.getElementById('main-video');
  const bar = document.getElementById('progress-bar');
  if (!v || !bar) return;
  const rect = bar.getBoundingClientRect();
  const pct = (e.clientX - rect.left) / rect.width;
  v.currentTime = pct * (v.duration || 0);
}

function setSpeed(val) {
  const v = document.getElementById('main-video');
  const speed = parseFloat(val);
  if (v) v.playbackRate = speed;
  App.playerSpeed = speed;
  localStorage.setItem('zentra_speed', speed);
}

function toggleSubtitle(val) {
  App.subtitleSettings.lang = val;
  localStorage.setItem('zentra_subs', JSON.stringify(App.subtitleSettings));
}

function toggleFullscreen() {
  const pw = document.getElementById('player-wrap');
  if (!pw) return;
  if (document.fullscreenElement) document.exitFullscreen();
  else pw.requestFullscreen?.();
}

function nextEpisode(animeId, ep, total) {
  if (ep < total) navigate('watch', { id: animeId, ep: ep + 1 });
}

function prevEpisode(animeId, ep) {
  if (ep > 1) navigate('watch', { id: animeId, ep: ep - 1 });
}

function setupPlayerGestures() {
  // Gesture support for iframe player wrap
  const pw = document.querySelector('[style*="aspect-ratio:16/9"]');
  if (!pw) return;
  let lastTap = 0;
  pw.addEventListener('touchstart', (e) => {
    const touch = e.touches[0];
    const rect = pw.getBoundingClientRect();
    const x = touch.clientX - rect.left;
    const now = Date.now();
    if (now - lastTap < 300) {
      // double tap - forward/backward hint
      if (x > rect.width * 0.6) showToast('+10s (kontrol ada di player)', 'info');
      else if (x < rect.width * 0.4) showToast('-10s (kontrol ada di player)', 'info');
    }
    lastTap = now;
  }, { passive: true });
}

function saveWatchHistory(animeId, ep, anime) {
  const existing = App.watchHistory.findIndex(h => h.id == animeId && h.ep == ep);
  const entry = { id: animeId, ep, title: anime?.title_english || anime?.title || '', img: anime?.images?.jpg?.image_url || '', progress: 0, position: 0, date: Date.now() };
  if (existing >= 0) App.watchHistory[existing] = { ...App.watchHistory[existing], ...entry };
  else App.watchHistory.unshift(entry);
  App.watchHistory = App.watchHistory.slice(0, 50);
  localStorage.setItem('zentra_history', JSON.stringify(App.watchHistory));
}

function updateWatchProgress(animeId, ep, position, progress) {
  const idx = App.watchHistory.findIndex(h => h.id == animeId && h.ep == ep);
  if (idx >= 0) { App.watchHistory[idx].position = position; App.watchHistory[idx].progress = progress; localStorage.setItem('zentra_history', JSON.stringify(App.watchHistory)); }
}

// === AI PAGE ===
function initAI() {
  const msgsEl = document.getElementById('ai-messages');
  if (!msgsEl) return;
  if (!App.aiMessages.length) {
    App.aiMessages = [{ role: 'bot', text: 'Halo! Saya Zentra AI. Saya siap membantu kamu dengan rekomendasi anime, penjelasan cerita, urutan nonton, dan banyak lagi. Ada yang bisa saya bantu?' }];
  }
  renderAIMessages();
}

function renderAIMessages() {
  const el = document.getElementById('ai-messages');
  if (!el) return;
  el.innerHTML = App.aiMessages.map(m => `
    <div class="ai-msg ${m.role}">
      <div class="ai-avatar ${m.role}">${m.role === 'bot' ? 'Z' : 'U'}</div>
      <div class="ai-bubble">${m.text.replace(/\n/g, '<br>')}</div>
    </div>`).join('');
  el.scrollTop = el.scrollHeight;
}

async function sendAIMessage(text) {
  if (!text?.trim()) return;
  const input = document.getElementById('ai-text-input');
  if (input) input.value = '';
  App.aiMessages.push({ role: 'user', text });
  App.aiMessages.push({ role: 'bot', text: '<div class="typing-dots"><div class="typing-dot"></div><div class="typing-dot"></div><div class="typing-dot"></div></div>' });
  renderAIMessages();
  const animeContext = App.currentAnime ? `Konteks: Pengguna sedang melihat "${App.currentAnime.title}". ` : '';
  const systemCtx = `Kamu adalah Zentra AI, asisten anime yang cerdas dan ramah. Jawab dalam Bahasa Indonesia. ${animeContext}`;
  const response = await callAI(`${systemCtx}\n\nUser: ${text}`);
  App.aiMessages[App.aiMessages.length - 1] = { role: 'bot', text: response };
  renderAIMessages();
}

function useAIChip(text) {
  const input = document.getElementById('ai-text-input');
  if (input) input.value = text;
  sendAIMessage(text);
}

// === WIKI PAGE ===
let wikiData = [];
let wikiFilter = '';

async function loadWiki() {
  const grid = document.getElementById('wiki-grid');
  if (!grid) return;
  if (wikiData.length) { renderWikiGrid(); return; }
  const data = await JIKAN.get('/top/anime', { limit: 24 });
  wikiData = data?.data || [];
  renderWikiGrid();
}

function renderWikiGrid() {
  const grid = document.getElementById('wiki-grid');
  if (!grid) return;
  const q = document.getElementById('wiki-search-input')?.value?.toLowerCase() || '';
  let list = wikiData;
  if (wikiFilter) list = list.filter(a => a.type === wikiFilter);
  if (q) list = list.filter(a => (a.title_english || a.title || '').toLowerCase().includes(q));
  if (!list.length) { grid.innerHTML = '<div class="empty-state" style="grid-column:1/-1"><p>Tidak ditemukan.</p></div>'; return; }
  grid.innerHTML = list.map(a => `
    <div class="wiki-card glass-card" onclick="navigate('detail',{id:${a.mal_id}})">
      <div class="wiki-card-title">${a.title_english || a.title}</div>
      <div class="wiki-card-desc">${(a.synopsis || '').slice(0, 100)}${(a.synopsis?.length||0) > 100 ? '...' : ''}</div>
      <div style="margin-top:10px;font-size:0.75rem;color:var(--muted);display:flex;gap:8px">
        <span>${a.type || 'TV'}</span><span>★ ${a.score || '-'}</span><span>${a.year || ''}</span>
      </div>
    </div>`).join('');
}

function filterWiki(q) { renderWikiGrid(); }

function setWikiFilter(type, el) {
  wikiFilter = type;
  document.querySelectorAll('[onclick^="setWikiFilter"]').forEach(e => e.classList.remove('active'));
  el.classList.add('active');
  renderWikiGrid();
}

// === PROFILE PAGE ===
function loadProfile() {
  const user = App.currentUser;
  const el = document.getElementById('profile-username');
  const emailEl = document.getElementById('profile-email');
  const avatarEl = document.getElementById('profile-avatar-char');
  if (el) el.textContent = user ? (user.displayName || user.email?.split('@')[0] || 'Pengguna') : 'Tamu';
  if (emailEl) emailEl.textContent = user ? user.email : 'Login untuk melihat profil lengkap';
  if (avatarEl) avatarEl.textContent = user ? (user.displayName || user.email || 'T')[0].toUpperCase() : 'T';

  const eps = App.watchHistory.length;
  document.getElementById('stat-anime')&&(document.getElementById('stat-anime').textContent = new Set(App.watchHistory.map(h=>h.id)).size);
  document.getElementById('stat-eps')&&(document.getElementById('stat-eps').textContent = eps);
  document.getElementById('stat-hours')&&(document.getElementById('stat-hours').textContent = Math.round(eps * 24 / 60));

  loadLibrary('Watching');
}

function loadLibrary(status) {
  const grid = document.getElementById('library-grid');
  if (!grid) return;
  const items = Object.values(App.library).filter(i => i.status === status);
  if (!items.length) {
    grid.innerHTML = `<div class="empty-state" style="grid-column:1/-1"><svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" style="margin:0 auto 16px;opacity:0.4"><path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z"/></svg><h3>Kosong</h3><p>Belum ada anime di kategori ini.</p></div>`;
    return;
  }
  grid.innerHTML = items.map(i => `<div class="anime-card" onclick="navigate('detail',{id:${i.id}})"><img class="anime-card-poster" src="${i.img}" alt="${i.title}" loading="lazy"><div class="anime-card-info"><div class="anime-card-title">${i.title}</div><div class="anime-card-meta">${i.status}</div></div></div>`).join('');
}

function switchLibTab(status, el) {
  document.querySelectorAll('.lib-chip').forEach(c => c.classList.remove('active'));
  if (el) el.classList.add('active');
  loadLibrary(status);
}

function showLibraryModal(animeId) {
  const modal = document.getElementById('library-modal');
  if (!modal) return;
  document.getElementById('lib-anime-id').value = animeId;
  const current = App.library[animeId]?.status || '';
  document.querySelectorAll('.lib-option').forEach(o => {
    o.classList.toggle('active', o.dataset.status === current);
  });
  modal.classList.add('open');
}

function setLibraryStatus(status) {
  const id = document.getElementById('lib-anime-id')?.value;
  if (!id) return;
  const anime = App.currentAnime;
  if (status === 'remove') {
    delete App.library[id];
    showToast('Dihapus dari library', 'info');
  } else {
    App.library[id] = { id, status, title: anime?.title || '', img: anime?.images?.jpg?.image_url || '', added: Date.now() };
    showToast(`Ditambahkan: ${status}`, 'success');
  }
  localStorage.setItem('zentra_library', JSON.stringify(App.library));
  closeModal('library-modal');
}

// === ANNOUNCEMENTS ===
function loadAnnouncements() {
  // Data dari Firestore via realtime listener (startAnnouncementsListener)
  // Kalau Firebase belum siap, render dari App.announcements yang sudah ada
  renderAnnouncementBar();
  const grid = document.getElementById('ann-grid');
  if (grid) renderAnnouncementGrid(grid);
}

function loadAnnouncementsFallback() {
  // Fallback kalau Firebase tidak tersambung
  if (App.announcements.length) return;
  App.announcements = [
    { id: 1, title: 'Selamat Datang di Zentra!', content: 'Platform anime terlengkap dengan streaming, wiki, dan AI assistant.', type: 'Information', priority: 'Normal', active: true, pinned: true, createdAt: { seconds: Date.now()/1000 }, createdBy: 'Admin' },
  ];
  renderAnnouncementBar();
  const grid = document.getElementById('ann-grid');
  if (grid) renderAnnouncementGrid(grid);
}

function renderAnnouncementBar() {
  const bar = document.getElementById('announcement-bar');
  if (!bar || !App.announcements.length) return;
  const ann = App.announcements.find(a => a.pinned) || App.announcements[0];
  const typeClass = { Information: 'ann-info', Update: 'ann-update', Maintenance: 'ann-maintenance', Warning: 'ann-warning', System: 'ann-info' };
  bar.innerHTML = `
    <div class="ann-dot"></div>
    <div class="ann-text">${ann.title} — ${ann.content}</div>
    <span class="ann-badge ${typeClass[ann.type] || 'ann-info'}">${ann.type}</span>`;
  bar.onclick = () => navigate('announcements');
}

function renderAnnouncementGrid(grid) {
  const typeColor = { Information: 'var(--primary)', Update: 'var(--success)', Maintenance: 'var(--warning)', Warning: 'var(--danger)', System: 'var(--muted)' };
  grid.innerHTML = App.announcements.map(a => `
    <div class="glass-card" style="padding:20px;border-left:3px solid ${typeColor[a.type]||'var(--primary)'}">
      <div style="display:flex;align-items:center;gap:8px;margin-bottom:8px">
        ${a.pinned ? `<svg width="14" height="14" viewBox="0 0 24 24" fill="var(--warning)" style="flex-shrink:0"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/></svg>` : ''}
        <span class="ann-badge ann-${a.type?.toLowerCase()||'info'}" style="font-size:0.68rem">${a.type}</span>
        <span style="font-size:0.72rem;color:var(--muted);margin-left:auto">#${a.id}</span>
      </div>
      <div style="font-size:0.95rem;font-weight:700;margin-bottom:6px">${a.title}</div>
      <div style="font-size:0.82rem;color:var(--muted);line-height:1.6">${a.content}</div>
      <div style="font-size:0.72rem;color:var(--muted);margin-top:10px">${a.createdAt?.seconds ? new Date(a.createdAt.seconds*1000).toLocaleDateString('id-ID') : (a.createdAt ? new Date(a.createdAt).toLocaleDateString('id-ID') : '')} · Oleh ${a.createdBy||'Admin'}</div>
    </div>`).join('');
}

// === AUTH ===
function showAuth(tab = 'login') {
  const modal = document.getElementById('auth-modal');
  if (!modal) return;
  modal.classList.add('open');
  switchAuthTab(tab);
}

function switchAuthTab(tab) {
  document.getElementById('auth-login')?.classList.toggle('hidden', tab !== 'login');
  document.getElementById('auth-register')?.classList.toggle('hidden', tab !== 'register');
}

async function handleLogin() {
  const email = document.getElementById('login-email')?.value;
  const pass = document.getElementById('login-pass')?.value;
  if (!email || !pass) { showToast('Isi semua field', 'error'); return; }
  // Simulate login (Firebase would go here)
  App.currentUser = { email, displayName: email.split('@')[0], uid: 'demo_' + Date.now() };
  localStorage.setItem('zentra_user', JSON.stringify(App.currentUser));
  closeModal('auth-modal');
  showToast('Login berhasil!', 'success');
  loadProfile();
}

async function handleRegister() {
  const username = document.getElementById('reg-username')?.value;
  const email = document.getElementById('reg-email')?.value;
  const pass = document.getElementById('reg-pass')?.value;
  if (!username || !email || !pass) { showToast('Isi semua field', 'error'); return; }
  App.currentUser = { email, displayName: username, uid: 'demo_' + Date.now() };
  localStorage.setItem('zentra_user', JSON.stringify(App.currentUser));
  closeModal('auth-modal');
  showToast('Registrasi berhasil!', 'success');
  loadProfile();
}

function handleLogout() {
  App.currentUser = null;
  localStorage.removeItem('zentra_user');
  showToast('Logout berhasil', 'info');
  loadProfile();
}

function handleGoogleLogin() {
  App.currentUser = { email: 'demo@zentra.app', displayName: 'Demo User', uid: 'google_demo', photoURL: '' };
  localStorage.setItem('zentra_user', JSON.stringify(App.currentUser));
  closeModal('auth-modal');
  showToast('Login dengan Google berhasil!', 'success');
  loadProfile();
}

// === MODALS ===
function closeModal(id) {
  document.getElementById(id)?.classList.remove('open');
}

function showCharModal(charData) {
  const c = typeof charData === 'string' ? JSON.parse(charData) : charData;
  const char = c.character || c;
  const modal = document.getElementById('char-modal');
  if (!modal) return;
  document.getElementById('char-modal-img').src = char.images?.jpg?.image_url || '';
  document.getElementById('char-modal-name').textContent = char.name || '';
  document.getElementById('char-modal-role').textContent = c.role || '';
  const va = c.voice_actors?.find(v => v.language === 'Japanese');
  document.getElementById('char-modal-va').textContent = va ? `VA: ${va.person?.name}` : '';
  modal.classList.add('open');
}

// === TOAST ===
function showToast(msg, type = 'info') {
  const container = document.getElementById('toast-container');
  if (!container) return;
  const iconMap = { success: '#22C55E', error: '#EF4444', info: '#4F8CFF', warning: '#F59E0B' };
  const toast = document.createElement('div');
  toast.className = `toast toast-${type}`;
  toast.innerHTML = `<div style="width:8px;height:8px;border-radius:50%;background:${iconMap[type]};flex-shrink:0"></div><span>${msg}</span>`;
  container.appendChild(toast);
  setTimeout(() => toast.remove(), 3200);
}

// === PWA ===
function installApp() {}
function dismissInstall() {}

// === INIT ===
document.addEventListener('DOMContentLoaded', () => {
  // Restore user
  const savedUser = localStorage.getItem('zentra_user');
  if (savedUser) try { App.currentUser = JSON.parse(savedUser); } catch {}

  // Init Firebase connection
  initFirebase();

  // Loading
  setTimeout(() => {
    document.getElementById('loading-overlay')?.classList.add('hide');
    setTimeout(() => document.getElementById('loading-overlay')?.remove(), 500);
  }, 1800);

  // Navigate to home
  navigate('home');
  setupExploreSearch();
  setupInfiniteScroll();

  // Global key events
  document.addEventListener('keydown', (e) => {
    if (App.currentPage === 'watch') {
      if (e.code === 'Space') { e.preventDefault(); togglePlay(); }
      if (e.code === 'ArrowLeft') playerSkip(-10);
      if (e.code === 'ArrowRight') playerSkip(10);
      if (e.code === 'KeyF') toggleFullscreen();
    }
  });

  // Sidebar toggle
  document.getElementById('menu-btn')?.addEventListener('click', () => {
    document.getElementById('sidebar')?.classList.add('open');
    document.getElementById('sidebar-overlay')?.classList.add('open');
  });
  document.getElementById('sidebar-overlay')?.addEventListener('click', () => {
    document.getElementById('sidebar')?.classList.remove('open');
    document.getElementById('sidebar-overlay')?.classList.remove('open');
  });
});
