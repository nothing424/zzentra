# ZENTRA — Everything Anime, One Place

Platform anime super app dengan Liquid Glass UI, AI assistant, streaming, wiki, dan Telegram bot.

---

## Cara Deploy

### 1. Buka Langsung (Static)

Buka `index.html` di browser. Semua fitur langsung berjalan.
Gunakan Live Server (VS Code) atau server statis apapun.

### 2. Deploy ke Vercel / Netlify

Upload seluruh folder ke GitHub, lalu connect ke Vercel/Netlify.
Root directory: folder ini.

### 3. Jalankan via Python Server (local)

```bash
python3 -m http.server 3000
# Buka http://localhost:3000
```

---

## Setup Telegram Bot

### Install dependencies:
```bash
pip install python-telegram-bot firebase-admin python-dotenv
```

### Setup .env:
```bash
cp .env.example .env
# Edit .env dengan token bot dan owner ID kamu
```

### Dapatkan Bot Token:
1. Chat @BotFather di Telegram
2. /newbot → ikuti instruksi
3. Salin token ke .env

### Dapatkan Owner ID:
1. Chat @userinfobot di Telegram
2. Salin ID kamu ke .env

### Jalankan bot:
```bash
python3 telegram_bot.py
```

---

## Struktur File

```
zentra/
├── index.html          ← App utama (buka ini)
├── offline.html        ← Halaman offline PWA
├── manifest.json       ← PWA manifest
├── sw.js               ← Service Worker
├── css/
│   └── style.css       ← Liquid Glass design system
├── js/
│   └── app.js          ← Logic utama aplikasi
├── providers/
│   └── samehadaku.js   ← Streaming provider
├── icons/              ← PWA icons (semua ukuran)
├── telegram_bot.py     ← Telegram admin bot
├── generate_icons.py   ← Generator icons PWA
└── .env.example        ← Template environment
```

---

## Fitur

- Streaming anime (Jikan API + Samehadaku provider)
- Zentra AI (DeepSeek AI untuk rekomendasi anime)
- Zentra Builder (buat app dengan AI)
- Wiki anime lengkap
- Database karakter & voice actor
- Library anime personal
- Statistik menonton
- Sistem pengumuman realtime
- Telegram Admin Bot
- PWA (installable di Android & Desktop)
- Gesture control video (YouTube-style)
- Subtitle Indonesia & Inggris
- Multi-server streaming
- Continue watching
- Offline support

---

## Perintah Telegram Bot

| Perintah | Fungsi |
|----------|--------|
| `/buatinfo [judul] \| [isi]` | Buat pengumuman baru |
| `/listinfo` | Lihat semua pengumuman aktif |
| `/detailinfo [id]` | Detail pengumuman |
| `/editinfo [id] \| [judul] \| [isi]` | Edit pengumuman |
| `/hapusinfo [id]` | Hapus pengumuman |
| `/aktifinfo [id]` | Aktifkan pengumuman |
| `/nonaktifinfo [id]` | Nonaktifkan pengumuman |
| `/pininfo [id]` | Sematkan pengumuman |

---

## Teknologi

- HTML5, CSS3, JavaScript (Vanilla)
- Jikan API v4 (data anime)
- Zentra AI API (DeepSeek)
- Service Worker (PWA/offline)
- Firebase Firestore (opsional, untuk sync)
- Python + python-telegram-bot (bot admin)
- Samehadaku scraper (streaming)

---

Dibuat dengan semangat oleh komunitas anime Indonesia.
