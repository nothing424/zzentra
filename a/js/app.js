// =============================================
// ZENTRA CONTROL — Owner Control Center
// Firebase Firestore · No Telegram · Full Control
// =============================================
'use strict';

// ── FIREBASE CONFIG ──────────────────────────
// Ganti dengan config Firebase kamu (lihat SETUP.md)
// Config diambil dari firebase-config.js di folder parent (edit file itu saja)
const FIREBASE_CONFIG = window.ZENTRA_FIREBASE_CONFIG || {
  apiKey: "AIzaSyBY5t3V7gWZQFhEv23aI3hEoV8PyTm6YoU", authDomain: "control-zentra.firebaseapp.com", projectId: "control-zentra", storageBucket: "control-zentra.firebasestorage.app", messagingSenderId: "716315303074", appId: "1:716315303074:web:500bd49b84b60639740bfb"
};

import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js";
import {
  getAuth, signInWithEmailAndPassword, signOut, onAuthStateChanged
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";
import {
  getFirestore, collection, doc, addDoc, getDoc, getDocs, setDoc,
  updateDoc, deleteDoc, query, where, orderBy, limit, onSnapshot,
  serverTimestamp, increment, Timestamp
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

const fbApp = initializeApp(FIREBASE_CONFIG);
const auth  = getAuth(fbApp);
const db    = getFirestore(fbApp);

// ── STATE ────────────────────────────────────
const App = {
  user: null,
  page: 'dashboard',
  infoList: [],
  infoView: 'list',
  infoFilter: { search: '', category: '', status: '', priority: '' },
  broadcasts: [],
  banners: [],
  editingId: null,
  unsubInfo: null,
};

// ── PAGE TITLES ───────────────────────────────
const PAGE_TITLES = {
  dashboard: 'Dashboard',
  information: 'Manajemen Informasi',
  broadcast: 'Broadcast',
  banners: 'Banner',
  analytics: 'Analitik',
  settings: 'Pengaturan',
};

// ── ROUTER ────────────────────────────────────
function navigate(page) {
  App.page = page;
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  document.querySelectorAll('[data-page]').forEach(n => n.classList.remove('active'));
  document.getElementById(`page-${page}`)?.classList.add('active');
  document.querySelectorAll(`[data-page="${page}"]`).forEach(n => n.classList.add('active'));
  document.getElementById('page-title').textContent = PAGE_TITLES[page] || 'Zentra Control';
  closeSidebar();
  const loaders = { dashboard: loadDashboard, information: loadInformation, broadcast: loadBroadcast, banners: loadBanners, analytics: loadAnalytics, settings: loadSettings };
  loaders[page]?.();
}

// ── AUTH ──────────────────────────────────────
onAuthStateChanged(auth, user => {
  hideLoading();
  if (user) { App.user = user; showApp(); navigate('dashboard'); }
  else showLogin();
});

async function handleLogin() {
  const email = document.getElementById('login-email').value.trim();
  const pass  = document.getElementById('login-pass').value;
  if (!email || !pass) { showLoginError('Isi email dan password.'); return; }
  const btn = document.getElementById('login-btn');
  btn.disabled = true; btn.textContent = 'Masuk...';
  document.getElementById('login-error').style.display = 'none';
  try {
    await signInWithEmailAndPassword(auth, email, pass);
  } catch (e) {
    const msgs = { 'auth/invalid-credential':'Email atau password salah.', 'auth/too-many-requests':'Terlalu banyak percobaan.' };
    showLoginError(msgs[e.code] || 'Login gagal, coba lagi.');
    btn.disabled = false; btn.textContent = 'Masuk ke Control Center';
  }
}
function showLoginError(msg) { const e = document.getElementById('login-error'); e.textContent = msg; e.style.display = 'block'; }
async function handleLogout() {
  const ok = await confirm2('Keluar?', 'Kamu akan keluar dari Zentra Control.', 'warning', 'Keluar');
  if (!ok) return;
  if (App.unsubInfo) App.unsubInfo();
  await signOut(auth);
}
function showLogin() { document.getElementById('login-page').classList.remove('hidden'); document.getElementById('app-layout').classList.add('hidden'); }
function showApp() {
  document.getElementById('login-page').classList.add('hidden');
  document.getElementById('app-layout').classList.remove('hidden');
  const name = App.user?.email?.split('@')[0] || 'Owner';
  document.getElementById('owner-name').textContent = name;
  document.getElementById('owner-initial').textContent = name[0].toUpperCase();
}
function hideLoading() { const el = document.getElementById('loading-screen'); if (el) { el.classList.add('hide'); setTimeout(() => el.remove(), 600); } }

// ── COUNTER ───────────────────────────────────
async function getNextId() {
  const ref = doc(db, '_counters', 'announcements');
  const snap = await getDoc(ref);
  const next = (snap.exists() ? snap.data().value : 0) + 1;
  await setDoc(ref, { value: next });
  return next;
}

// ── DASHBOARD ─────────────────────────────────
async function loadDashboard() {
  try {
    const snap = await getDocs(collection(db, 'announcements'));
    const all  = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    const active   = all.filter(d => d.active && !d.pinned).length;
    const inactive = all.filter(d => !d.active).length;
    const pinned   = all.filter(d => d.pinned).length;
    const views    = all.reduce((s, d) => s + (d.views || 0), 0);
    const bSnap    = await getDocs(collection(db, 'broadcasts'));

    setText('dash-total',      all.length);
    setText('dash-active',     active);
    setText('dash-inactive',   inactive);
    setText('dash-pinned',     pinned);
    setText('dash-views',      views.toLocaleString());
    setText('dash-broadcasts', bSnap.size);
    setText('nav-info-count',  all.length);

    // Recent feed
    const recent = [...all].sort((a, b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0)).slice(0, 6);
    const feed = document.getElementById('activity-feed');
    if (feed) feed.innerHTML = recent.length
      ? recent.map(d => `
        <div class="activity-item" onclick="navigate('information')">
          <div class="activity-dot" style="background:${d.pinned?'var(--gold)':d.active?'var(--success)':'var(--white-20)'}"></div>
          <div class="activity-text">
            <strong>${d.title || 'Tanpa Judul'}</strong>
            <div class="text-xs text-muted">${d.type||'Info'} · ${d.priority||'Normal'} · ${relTime(d.createdAt)}</div>
          </div>
          <span class="status-badge ${d.pinned?'badge-pinned':d.active?'badge-active':'badge-inactive'}" style="flex-shrink:0">
            ${d.pinned?'Pinned':d.active?'Aktif':'Nonaktif'}
          </span>
        </div>`).join('')
      : '<div class="text-muted text-sm" style="padding:20px 0;text-align:center">Belum ada informasi.</div>';
  } catch (e) { showToast('Gagal memuat dashboard.', 'error'); }
}

// ── INFORMATION ───────────────────────────────
function loadInformation() {
  if (App.unsubInfo) App.unsubInfo();
  setHtml('info-list-container', '<div style="padding:40px;text-align:center"><div class="spinner" style="margin:0 auto"></div></div>');
  const q = query(collection(db, 'announcements'), orderBy('createdAt', 'desc'));
  App.unsubInfo = onSnapshot(q, snap => {
    App.infoList = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    renderInfoList();
    setText('info-count', App.infoList.length);
    setText('nav-info-count', App.infoList.length);
  }, () => showToast('Gagal memuat informasi.', 'error'));
}

function renderInfoList() {
  let list = [...App.infoList];
  const { search, category, status, priority } = App.infoFilter;
  if (search)   list = list.filter(i => (i.title||'').toLowerCase().includes(search.toLowerCase()) || (i.content||'').toLowerCase().includes(search.toLowerCase()));
  if (category) list = list.filter(i => i.type === category);
  if (priority) list = list.filter(i => i.priority === priority);
  if (status) {
    const map = { active: i => i.active && !i.pinned && !i.scheduled, inactive: i => !i.active, pinned: i => i.pinned, scheduled: i => i.scheduled, archived: i => i.archived };
    if (map[status]) list = list.filter(map[status]);
  }

  const container = document.getElementById('info-list-container');
  if (!container) return;
  if (!list.length) {
    container.innerHTML = `<div class="empty-state">
      <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14,2 14,8 20,8"/></svg>
      <h3>Tidak ada informasi</h3><p>Coba ubah filter atau buat informasi baru.</p>
    </div>`;
    return;
  }

  const cards = list.map(item => infoCardHTML(item)).join('');
  container.innerHTML = App.infoView === 'grid'
    ? `<div class="info-grid">${cards}</div>`
    : `<div class="info-list">${cards}</div>`;
}

function infoCardHTML(item) {
  const isPinned = item.pinned;
  const isActive = item.active;
  const statusCls = isPinned ? 'pinned' : isActive ? 'active' : 'inactive';
  const badgeCls  = isPinned ? 'badge-pinned' : item.scheduled ? 'badge-scheduled' : isActive ? 'badge-active' : 'badge-inactive';
  const badgeTxt  = isPinned ? 'Pinned' : item.scheduled ? 'Terjadwal' : isActive ? 'Aktif' : 'Nonaktif';
  const priCls    = `priority-${(item.priority||'low').toLowerCase()}`;
  const highlight = isPinned ? 'pinned-card-highlight' : '';

  return `
  <div class="info-card ${statusCls} ${highlight}" onclick="openInfoDetail('${item.id}')">
    <div style="display:flex;align-items:center;gap:6px;flex-shrink:0;margin-top:2px">
      <div class="priority-dot ${priCls}" title="Prioritas: ${item.priority||'Low'}"></div>
    </div>
    <div class="info-card-body">
      <div class="info-card-title">#${item.numericId||'—'} · ${item.title||'Tanpa Judul'}</div>
      <div class="info-card-meta">
        <span class="status-badge ${badgeCls}">${badgeTxt}</span>
        <span>${item.type||'Info'}</span>
        <span>${item.priority||'Normal'}</span>
        <span>${relTime(item.createdAt)}</span>
        ${item.views ? `<span>${item.views} views</span>` : ''}
      </div>
      <div class="info-card-preview">${(item.content||'').slice(0,80)}${(item.content||'').length>80?'...':''}</div>
    </div>
    <div class="info-card-actions" onclick="event.stopPropagation()">
      <button class="ic-btn" title="Edit" onclick="openEditInfo('${item.id}')">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
      </button>
      <button class="ic-btn ${isActive?'ic-warn':'ic-ok'}" title="${isActive?'Nonaktifkan':'Aktifkan'}"
        onclick="${isActive?`deactivateInfo('${item.id}')`:`activateInfo('${item.id}')`}">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          ${isActive
            ? '<circle cx="12" cy="12" r="10"/><line x1="4.93" y1="4.93" x2="19.07" y2="19.07"/>'
            : '<circle cx="12" cy="12" r="10"/><polyline points="10,8 16,12 10,16"/>'}
        </svg>
      </button>
      <button class="ic-btn ${isPinned?'ic-gold':''}" title="${isPinned?'Unpin':'Pin'}"
        onclick="${isPinned?`unpinInfo('${item.id}')`:`pinInfo('${item.id}')`}">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="${isPinned?'var(--gold)':'none'}" stroke="${isPinned?'var(--gold)':'currentColor'}" stroke-width="2">
          <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/>
        </svg>
      </button>
      <button class="ic-btn ic-danger" title="Hapus" onclick="deleteInfo('${item.id}')">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3,6 5,6 21,6"/><path d="M19,6v14a2,2 0 0 1-2,2H7a2,2 0 0 1-2-2V6m3,0V4a2,2 0 0 1 2-2h4a2,2 0 0 1 2,2v2"/></svg>
      </button>
    </div>
  </div>`;
}

// CRUD
function openCreateInfo() {
  App.editingId = null;
  resetInfoForm();
  document.getElementById('info-modal-title').textContent = 'Buat Informasi Baru';
  document.getElementById('save-info-btn').textContent = 'Publikasikan';
  openModal('info-modal');
}

function openEditInfo(id) {
  const item = App.infoList.find(i => i.id === id);
  if (!item) return;
  App.editingId = id;
  fillInfoForm(item);
  document.getElementById('info-modal-title').textContent = `Edit #${item.numericId||id.slice(0,6)}`;
  document.getElementById('save-info-btn').textContent = 'Simpan Perubahan';
  openModal('info-modal');
  closeModal('info-detail-modal');
}

function resetInfoForm() {
  document.getElementById('info-form').reset();
  document.getElementById('info-status-toggle').classList.add('on');
  document.getElementById('info-pin-toggle').classList.remove('on');
  document.getElementById('title-char-count').textContent = '0/100';
}

function fillInfoForm(item) {
  document.getElementById('info-title-input').value   = item.title || '';
  document.getElementById('info-content-input').value = item.content || '';
  document.getElementById('info-type-select').value   = item.type || 'Announcement';
  document.getElementById('info-priority-select').value = item.priority || 'Normal';
  document.getElementById('info-tags-input').value    = (item.tags||[]).join(', ');
  document.getElementById('info-schedule-input').value = item.scheduleAt ? new Date(item.scheduleAt.seconds*1000).toISOString().slice(0,16) : '';
  document.getElementById('title-char-count').textContent = `${(item.title||'').length}/100`;
  const tog = document.getElementById('info-status-toggle');
  item.active ? tog.classList.add('on') : tog.classList.remove('on');
  const pinTog = document.getElementById('info-pin-toggle');
  item.pinned ? pinTog.classList.add('on') : pinTog.classList.remove('on');
}

function openInfoDetail(id) {
  const item = App.infoList.find(i => i.id === id);
  if (!item) return;
  updateDoc(doc(db, 'announcements', id), { views: increment(1) }).catch(()=>{});
  const typeColor = { Announcement:'var(--info)', Maintenance:'var(--warning)', 'Anime Update':'var(--primary)', News:'var(--success)', Event:'var(--gold)', Promotion:'var(--secondary)', Important:'var(--danger)' };
  setHtml('info-detail-body', `
    <div style="margin-bottom:20px">
      <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;margin-bottom:12px">
        <span style="font-size:0.7rem;color:var(--white-20)">#${item.numericId||'—'}</span>
        <span class="status-badge ${item.pinned?'badge-pinned':item.active?'badge-active':'badge-inactive'}">${item.pinned?'Pinned':item.active?'Aktif':'Nonaktif'}</span>
        <span class="status-badge" style="background:${typeColor[item.type]||'var(--info)'}18;color:${typeColor[item.type]||'var(--info)'};">${item.type||'Info'}</span>
        <span class="status-badge" style="background:var(--white-08);color:var(--white-50)">${item.priority||'Normal'}</span>
      </div>
      <h2 style="font-size:1.25rem;font-weight:800;margin-bottom:10px;line-height:1.3">${item.title||''}</h2>
      ${(item.tags||[]).length?`<div style="display:flex;gap:6px;flex-wrap:wrap;margin-bottom:14px">${item.tags.map(t=>`<span style="padding:2px 8px;background:var(--white-08);border-radius:99px;font-size:0.7rem;color:var(--white-50)">${t}</span>`).join('')}</div>`:''}
      <p style="font-size:0.875rem;color:var(--white-80);line-height:1.85;white-space:pre-wrap;background:var(--black-4);padding:16px;border-radius:var(--r-sm);border:1px solid var(--glass-border)">${item.content||''}</p>
    </div>
    <div class="divider"></div>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;font-size:0.78rem">
      <div><div style="color:var(--white-20);margin-bottom:3px;font-size:0.65rem;text-transform:uppercase;letter-spacing:0.5px">Dibuat</div>${item.createdAt?new Date(item.createdAt.seconds*1000).toLocaleString('id-ID'):'-'}</div>
      <div><div style="color:var(--white-20);margin-bottom:3px;font-size:0.65rem;text-transform:uppercase;letter-spacing:0.5px">Diperbarui</div>${item.updatedAt?new Date(item.updatedAt.seconds*1000).toLocaleString('id-ID'):'-'}</div>
      <div><div style="color:var(--white-20);margin-bottom:3px;font-size:0.65rem;text-transform:uppercase;letter-spacing:0.5px">Views</div>${item.views||0}</div>
      <div><div style="color:var(--white-20);margin-bottom:3px;font-size:0.65rem;text-transform:uppercase;letter-spacing:0.5px">Dibuat oleh</div>${item.createdBy||'Owner'}</div>
    </div>
    <div class="divider"></div>
    <div style="display:flex;gap:8px;flex-wrap:wrap">
      <button class="btn btn-primary" onclick="openEditInfo('${item.id}')">Edit Informasi</button>
      <button class="btn btn-ghost" onclick="${item.active?`deactivateInfo('${item.id}')`:`activateInfo('${item.id}')`}">${item.active?'Nonaktifkan':'Aktifkan'}</button>
      <button class="btn btn-ghost" onclick="${item.pinned?`unpinInfo('${item.id}')`:`pinInfo('${item.id}')`}" style="color:var(--gold)">${item.pinned?'Unpin':'Pin'}</button>
      <button class="btn btn-ghost" onclick="duplicateInfo('${item.id}')">Duplikat</button>
      <button class="btn btn-danger" onclick="deleteInfo('${item.id}')">Hapus</button>
    </div>`);
  openModal('info-detail-modal');
}

async function saveInfo() {
  const title    = document.getElementById('info-title-input').value.trim();
  const content  = document.getElementById('info-content-input').value.trim();
  const type     = document.getElementById('info-type-select').value;
  const priority = document.getElementById('info-priority-select').value;
  const tags     = document.getElementById('info-tags-input').value.split(',').map(t=>t.trim()).filter(Boolean);
  const active   = document.getElementById('info-status-toggle').classList.contains('on');
  const pinned   = document.getElementById('info-pin-toggle').classList.contains('on');
  const schedStr = document.getElementById('info-schedule-input').value;

  if (!title)   { showToast('Judul tidak boleh kosong.', 'error'); return; }
  if (!content) { showToast('Konten tidak boleh kosong.', 'error'); return; }

  const btn = document.getElementById('save-info-btn');
  btn.disabled = true; btn.textContent = 'Menyimpan...';

  try {
    if (pinned) await unpinAllInfo();
    const scheduleAt = schedStr ? Timestamp.fromDate(new Date(schedStr)) : null;
    const isScheduled = !!(scheduleAt && new Date(schedStr) > new Date());

    const data = {
      title, content, type, priority, tags,
      active: isScheduled ? false : active,
      pinned: pinned && !isScheduled,
      scheduled: isScheduled,
      scheduleAt: scheduleAt || null,
      archived: false,
      updatedAt: serverTimestamp(),
      createdBy: App.user?.email || 'Owner',
    };

    if (App.editingId) {
      await updateDoc(doc(db, 'announcements', App.editingId), data);
      showToast('Informasi berhasil diperbarui.', 'success');
    } else {
      const numericId = await getNextId();
      await addDoc(collection(db, 'announcements'), { ...data, numericId, views: 0, createdAt: serverTimestamp() });
      showToast(`Informasi #${numericId} berhasil dibuat.`, 'success');
    }
    closeModal('info-modal');
  } catch (e) {
    showToast('Gagal menyimpan: ' + e.message, 'error');
  } finally {
    btn.disabled = false;
    btn.textContent = App.editingId ? 'Simpan Perubahan' : 'Publikasikan';
  }
}

async function unpinAllInfo() {
  const snap = await getDocs(query(collection(db,'announcements'), where('pinned','==',true)));
  await Promise.all(snap.docs.map(d => updateDoc(doc(db,'announcements',d.id), { pinned:false, active:true })));
}
async function activateInfo(id) {
  await updateDoc(doc(db,'announcements',id), { active:true, updatedAt:serverTimestamp() });
  showToast('Informasi diaktifkan.', 'success');
  closeModal('info-detail-modal');
}
async function deactivateInfo(id) {
  await updateDoc(doc(db,'announcements',id), { active:false, updatedAt:serverTimestamp() });
  showToast('Informasi dinonaktifkan.', 'info');
  closeModal('info-detail-modal');
}
async function pinInfo(id) {
  const ok = await confirm2('Pin Informasi?', 'Post yang sedang di-pin akan otomatis di-unpin.', 'gold', 'Pin');
  if (!ok) return;
  await unpinAllInfo();
  await updateDoc(doc(db,'announcements',id), { pinned:true, active:true, updatedAt:serverTimestamp() });
  showToast('Informasi di-pin.', 'success');
  closeModal('info-detail-modal');
}
async function unpinInfo(id) {
  await updateDoc(doc(db,'announcements',id), { pinned:false, updatedAt:serverTimestamp() });
  showToast('Informasi di-unpin.', 'info');
  closeModal('info-detail-modal');
}
async function deleteInfo(id) {
  const item = App.infoList.find(i => i.id === id);
  const ok = await confirm2('Hapus Informasi?', `"${item?.title||id}" akan dihapus permanen dan tidak bisa dikembalikan.`, 'danger', 'Hapus Permanen');
  if (!ok) return;
  await deleteDoc(doc(db,'announcements',id));
  showToast('Informasi dihapus.', 'success');
  closeModal('info-detail-modal');
}
async function duplicateInfo(id) {
  const item = App.infoList.find(i => i.id === id);
  if (!item) return;
  const numericId = await getNextId();
  const { id:_, numericId:__, ...data } = item;
  await addDoc(collection(db,'announcements'), { ...data, title:`${item.title} (Salinan)`, numericId, active:false, pinned:false, views:0, createdAt:serverTimestamp(), updatedAt:serverTimestamp() });
  showToast('Informasi diduplikat.', 'success');
  closeModal('info-detail-modal');
}

function setInfoFilter(key, val) { App.infoFilter[key] = val; renderInfoList(); }
function setInfoView(view) {
  App.infoView = view;
  document.querySelectorAll('.view-btn').forEach(b => b.classList.remove('active'));
  document.getElementById(`view-${view}`)?.classList.add('active');
  renderInfoList();
}

// Auto scheduler
setInterval(async () => {
  if (!App.user) return;
  const snap = await getDocs(query(collection(db,'announcements'), where('scheduled','==',true))).catch(()=>null);
  if (!snap) return;
  const now = Timestamp.now();
  for (const d of snap.docs) {
    const data = d.data();
    if (data.scheduleAt?.seconds <= now.seconds) {
      await updateDoc(doc(db,'announcements',d.id), { active:true, scheduled:false, updatedAt:serverTimestamp() });
      showToast(`"${data.title}" dipublikasi otomatis.`, 'success');
    }
  }
}, 60000);

// ── BROADCAST ─────────────────────────────────
async function loadBroadcast() {
  const container = document.getElementById('broadcast-list');
  if (!container) return;
  container.innerHTML = '<div style="padding:40px;text-align:center"><div class="spinner" style="margin:0 auto"></div></div>';
  try {
    const snap = await getDocs(query(collection(db,'broadcasts'), orderBy('createdAt','desc'), limit(30)));
    App.broadcasts = snap.docs.map(d => ({ id:d.id, ...d.data() }));
    renderBroadcastList();
  } catch { container.innerHTML = '<div class="empty-state"><p>Gagal memuat.</p></div>'; }
}
function renderBroadcastList() {
  const c = document.getElementById('broadcast-list');
  if (!c) return;
  if (!App.broadcasts.length) { c.innerHTML = `<div class="empty-state"><h3>Belum ada broadcast</h3><p>Kirim broadcast pertama.</p></div>`; return; }
  const clr = { Info:'var(--info)', Warning:'var(--warning)', Update:'var(--success)', Critical:'var(--danger)' };
  c.innerHTML = App.broadcasts.map(b => `
    <div class="broadcast-card">
      <div class="bc-icon" style="background:${clr[b.broadcastType]||'var(--info)'}18;color:${clr[b.broadcastType]||'var(--info)'}">
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07"/><path d="M1 1l22 22"/></svg>
      </div>
      <div style="flex:1;min-width:0">
        <div style="font-size:0.875rem;font-weight:600;margin-bottom:2px">${b.title||''}</div>
        <div style="font-size:0.78rem;color:var(--white-50);margin-bottom:4px">${b.message||''}</div>
        <div style="font-size:0.7rem;color:var(--white-20)">${b.broadcastType||'Info'} · ${relTime(b.createdAt)}</div>
      </div>
      <button class="ic-btn ic-danger" onclick="deleteBroadcast('${b.id}')">
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3,6 5,6 21,6"/><path d="M19,6v14a2,2 0 0 1-2,2H7a2,2 0 0 1-2-2V6"/></svg>
      </button>
    </div>`).join('');
}
async function sendBroadcast() {
  const title = document.getElementById('bc-title').value.trim();
  const msg   = document.getElementById('bc-message').value.trim();
  const type  = document.getElementById('bc-type').value;
  if (!title || !msg) { showToast('Isi judul dan pesan.', 'error'); return; }
  if (type === 'Critical') {
    const c1 = await confirm2('Kirim Critical Broadcast?', 'Notifikasi penting akan dikirim ke semua pengguna Zentra.', 'danger', 'Lanjutkan');
    if (!c1) return;
    const c2 = await confirm2('Konfirmasi Terakhir', `Broadcast Critical "${title}" akan langsung aktif.`, 'danger', 'Kirim Sekarang');
    if (!c2) return;
  }
  const btn = document.getElementById('send-bc-btn');
  btn.disabled = true; btn.textContent = 'Mengirim...';
  try {
    await addDoc(collection(db,'broadcasts'), { title, message:msg, broadcastType:type, active:true, createdAt:serverTimestamp(), createdBy:App.user?.email });
    showToast(`Broadcast "${title}" terkirim.`, 'success');
    document.getElementById('bc-title').value = '';
    document.getElementById('bc-message').value = '';
    loadBroadcast();
  } catch { showToast('Gagal kirim broadcast.', 'error'); }
  finally { btn.disabled = false; btn.textContent = 'Kirim Broadcast'; }
}
async function deleteBroadcast(id) {
  const ok = await confirm2('Hapus Broadcast?', 'Broadcast ini akan dihapus permanen.', 'danger', 'Hapus');
  if (!ok) return;
  await deleteDoc(doc(db,'broadcasts',id));
  showToast('Broadcast dihapus.', 'success');
  loadBroadcast();
}

// ── BANNERS ───────────────────────────────────
async function loadBanners() {
  const c = document.getElementById('banner-list');
  if (!c) return;
  try {
    const snap = await getDocs(query(collection(db,'banners'), orderBy('createdAt','desc')));
    App.banners = snap.docs.map(d => ({ id:d.id, ...d.data() }));
    renderBannerList();
  } catch { c.innerHTML = '<div class="empty-state"><p>Gagal memuat banner.</p></div>'; }
}
function renderBannerList() {
  const c = document.getElementById('banner-list');
  if (!c) return;
  if (!App.banners.length) { c.innerHTML = `<div class="empty-state"><h3>Belum ada banner</h3><p>Tambah banner baru.</p></div>`; return; }
  c.innerHTML = App.banners.map(b => `
    <div class="info-card ${b.active?'active':'inactive'}">
      <div class="info-card-body">
        <div class="info-card-title">${b.title||'Banner'}</div>
        <div class="info-card-meta">
          <span class="status-badge ${b.active?'badge-active':'badge-inactive'}">${b.active?'Aktif':'Nonaktif'}</span>
          <span>${b.link||'—'}</span>
          <span>${relTime(b.createdAt)}</span>
        </div>
      </div>
      <div class="info-card-actions">
        <button class="ic-btn ${b.active?'ic-warn':'ic-ok'}" onclick="${b.active?`disableBanner('${b.id}')`:`enableBanner('${b.id}')`}">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">${b.active?'<circle cx="12" cy="12" r="10"/><line x1="4.93" y1="4.93" x2="19.07" y2="19.07"/>':'<circle cx="12" cy="12" r="10"/><polyline points="10,8 16,12 10,16"/>'}</svg>
        </button>
        <button class="ic-btn ic-danger" onclick="deleteBanner('${b.id}')">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3,6 5,6 21,6"/><path d="M19,6v14a2,2 0 0 1-2,2H7a2,2 0 0 1-2-2V6"/></svg>
        </button>
      </div>
    </div>`).join('');
}
async function saveBanner() {
  const title = document.getElementById('banner-title').value.trim();
  const link  = document.getElementById('banner-link').value.trim();
  if (!title) { showToast('Isi judul banner.', 'error'); return; }
  await addDoc(collection(db,'banners'), { title, link, active:true, createdAt:serverTimestamp() });
  showToast('Banner ditambahkan.', 'success');
  closeModal('banner-modal');
  loadBanners();
}
async function enableBanner(id)  { await updateDoc(doc(db,'banners',id),{active:true});  loadBanners(); }
async function disableBanner(id) { await updateDoc(doc(db,'banners',id),{active:false}); loadBanners(); }
async function deleteBanner(id) {
  const ok = await confirm2('Hapus Banner?','Banner akan dihapus permanen.','danger','Hapus');
  if (!ok) return;
  await deleteDoc(doc(db,'banners',id)); showToast('Banner dihapus.','success'); loadBanners();
}

// ── ANALYTICS ─────────────────────────────────
async function loadAnalytics() {
  try {
    const snap = await getDocs(collection(db,'announcements'));
    const all   = snap.docs.map(d => d.data());
    const top5  = [...all].sort((a,b)=>(b.views||0)-(a.views||0)).slice(0,5);
    const byType = {};
    all.forEach(d => { byType[d.type||'Other'] = (byType[d.type||'Other']||0)+1; });

    setHtml('analytics-body', `
      <div class="stats-row" style="grid-template-columns:repeat(3,1fr);margin-bottom:20px">
        <div class="stat-card gold-accent"><div class="stat-icon gold"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/></svg></div><div class="stat-value">${all.length}</div><div class="stat-label">Total</div></div>
        <div class="stat-card"><div class="stat-icon green"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="20,6 9,17 4,12"/></svg></div><div class="stat-value">${all.filter(d=>d.active).length}</div><div class="stat-label">Aktif</div></div>
        <div class="stat-card"><div class="stat-icon blue"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg></div><div class="stat-value">${all.reduce((s,d)=>s+(d.views||0),0).toLocaleString()}</div><div class="stat-label">Total Views</div></div>
      </div>
      <div class="section-card" style="margin-bottom:16px">
        <div class="section-header"><div class="section-title">Paling Dilihat</div></div>
        ${top5.length ? top5.map((d,i)=>`
          <div style="display:flex;align-items:center;gap:12px;padding:10px 0;border-bottom:1px solid var(--white-04)">
            <div style="width:26px;height:26px;border-radius:50%;background:var(--gold-glow);color:var(--gold-light);display:flex;align-items:center;justify-content:center;font-size:0.72rem;font-weight:800;flex-shrink:0">${i+1}</div>
            <div style="flex:1;font-size:0.85rem;font-weight:500">${d.title||'—'}</div>
            <div style="font-size:0.82rem;color:var(--gold-light);font-weight:700">${d.views||0}</div>
          </div>`).join('') : '<p class="text-muted text-sm" style="padding:12px 0">Belum ada data views.</p>'}
      </div>
      <div class="section-card">
        <div class="section-header"><div class="section-title">Distribusi Kategori</div></div>
        ${Object.entries(byType).map(([type,count])=>`
          <div style="margin-bottom:10px">
            <div style="display:flex;justify-content:space-between;font-size:0.8rem;margin-bottom:4px"><span>${type}</span><span class="text-muted">${count}</span></div>
            <div style="height:6px;background:var(--white-08);border-radius:99px"><div style="height:100%;width:${Math.round(count/all.length*100)}%;background:linear-gradient(90deg,var(--gold-dim),var(--gold-light));border-radius:99px;transition:width 0.8s ease"></div></div>
          </div>`).join('')}
      </div>`);
  } catch { showToast('Gagal memuat analitik.','error'); }
}

// ── SETTINGS ──────────────────────────────────
async function loadSettings() {
  const u = App.user;
  if (u) {
    const name = u.email?.split('@')[0] || 'Owner';
    setText('settings-name', name);
    setText('settings-email', u.email||'—');
    setText('settings-initial', name[0].toUpperCase());
  }
  // Load emergency status
  try {
    const snap = await getDoc(doc(db,'settings','emergency'));
    if (snap.exists() && snap.data().active) {
      setEmergencyUI(true, snap.data().message || '');
    }
  } catch {}
}

let emergencyActive = false;
function setEmergencyUI(active, msg='') {
  emergencyActive = active;
  const statusEl = document.getElementById('emergency-status-text');
  const btnEl    = document.getElementById('emergency-toggle-btn');
  const dotEl    = document.getElementById('emergency-dot');
  if (statusEl) { statusEl.textContent = active ? 'AKTIF' : 'Tidak Aktif'; statusEl.style.color = active ? 'var(--danger)' : 'var(--white-50)'; }
  if (dotEl)    dotEl.style.display = active ? 'block' : 'none';
  if (btnEl)    { btnEl.textContent = active ? 'Nonaktifkan Emergency' : 'Aktifkan Emergency Notice'; btnEl.className = `btn ${active?'btn-success':'btn-danger'} btn-lg w-full`; }
  if (active && msg) { const msgEl = document.getElementById('emergency-msg'); if (msgEl && !msgEl.value) msgEl.value = msg; }
}

async function toggleEmergency() {
  if (!emergencyActive) {
    const c1 = await confirm2('Aktifkan Emergency Notice?','Pesan darurat akan tampil di Zentra untuk semua pengguna.','danger','Lanjutkan');
    if (!c1) return;
    const c2 = await confirm2('Konfirmasi Terakhir','Emergency Notice akan langsung aktif sekarang.','danger','Aktifkan');
    if (!c2) return;
    const msg = document.getElementById('emergency-msg')?.value || 'Sedang dalam maintenance.';
    await setDoc(doc(db,'settings','emergency'), { active:true, message:msg, updatedAt:serverTimestamp() });
    setEmergencyUI(true);
    showToast('Emergency Notice aktif!', 'warning');
  } else {
    const ok = await confirm2('Nonaktifkan Emergency?','Emergency Notice akan dimatikan dari Zentra.','warning','Nonaktifkan');
    if (!ok) return;
    await setDoc(doc(db,'settings','emergency'), { active:false, updatedAt:serverTimestamp() });
    setEmergencyUI(false);
    showToast('Emergency Notice dinonaktifkan.', 'success');
  }
}

// ── HELPERS ───────────────────────────────────
function setText(id, val) { const el = document.getElementById(id); if (el) el.textContent = val; }
function setHtml(id, val) { const el = document.getElementById(id); if (el) el.innerHTML = val; }
function relTime(ts) {
  if (!ts?.seconds) return '—';
  const d = Date.now()/1000 - ts.seconds;
  if (d < 60) return 'Baru saja';
  if (d < 3600) return `${Math.floor(d/60)}m lalu`;
  if (d < 86400) return `${Math.floor(d/3600)}j lalu`;
  return new Date(ts.seconds*1000).toLocaleDateString('id-ID');
}

// ── MODAL ─────────────────────────────────────
function openModal(id) { document.getElementById(id)?.classList.add('open'); }
function closeModal(id) { document.getElementById(id)?.classList.remove('open'); }
function toggleItem(el) { el.classList.toggle('on'); }

// ── CONFIRM ───────────────────────────────────
let _confirmResolve = null;
function confirm2(title, text, type='danger', confirmText='OK') {
  return new Promise(resolve => {
    _confirmResolve = resolve;
    const icon = { danger:'var(--danger)', warning:'var(--warning)', gold:'var(--gold-light)' }[type];
    setText('confirm-title', title);
    setText('confirm-text', text);
    document.getElementById('confirm-ok').textContent = confirmText;
    document.getElementById('confirm-ok').className = `btn ${type==='gold'?'btn-primary':'btn-danger'}`;
    const ic = document.getElementById('confirm-icon');
    ic.className = `confirm-icon ${type}`;
    document.getElementById('confirm-overlay').classList.add('open');
  });
}
function confirmOk()     { _confirmResolve?.(true);  closeConfirm(); }
function confirmCancel() { _confirmResolve?.(false); closeConfirm(); }
function closeConfirm()  { document.getElementById('confirm-overlay')?.classList.remove('open'); _confirmResolve = null; }

// ── TOAST ─────────────────────────────────────
function showToast(msg, type='info') {
  const c = document.getElementById('toast-container');
  if (!c) return;
  const t = document.createElement('div');
  t.className = `toast ${type}`;
  t.innerHTML = `<div class="toast-dot"></div><span>${msg}</span>`;
  c.appendChild(t);
  setTimeout(() => t.remove(), 3200);
}

// ── SIDEBAR ───────────────────────────────────
function openSidebar()  { document.getElementById('sidebar')?.classList.add('open'); document.getElementById('sidebar-overlay')?.classList.add('open'); }
function closeSidebar() { document.getElementById('sidebar')?.classList.remove('open'); document.getElementById('sidebar-overlay')?.classList.remove('open'); }

// ── INIT ──────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  document.getElementById('menu-btn')?.addEventListener('click', openSidebar);
  document.getElementById('sidebar-overlay')?.addEventListener('click', closeSidebar);
  document.getElementById('login-pass')?.addEventListener('keydown', e => { if (e.key==='Enter') handleLogin(); });
  document.getElementById('info-title-input')?.addEventListener('input', function() {
    setText('title-char-count', this.value.length + '/100');
  });
  document.getElementById('info-search')?.addEventListener('input', function() {
    setInfoFilter('search', this.value);
  });
});
