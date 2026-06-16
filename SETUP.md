# ZENTRA — Setup Lengkap

## Struktur Folder

```
zentra-full/
├── index.html          ← Zentra App (anime platform)
├── js/app.js           ← Logic Zentra App
├── firebase-config.js  ← ⭐ EDIT FILE INI untuk connect Firebase
├── control/
│   ├── index.html      ← Zentra Control (admin panel)
│   └── js/app.js       ← Logic Zentra Control
└── ...
```

## Langkah Setup (5 menit)

### 1. Buat Firebase Project
- Buka https://console.firebase.google.com
- Add project → nama bebas (misal: "zentra-app")
- Disable Google Analytics → Create

### 2. Aktifkan Authentication
- Build → Authentication → Get started
- Sign-in method → Email/Password → Enable → Save
- Users → Add user:
  - Email    : owner@zentra.app
  - Password : ZentraOwner2026!

### 3. Aktifkan Firestore
- Build → Firestore Database → Create database
- Start in production mode → pilih region → Done

### 4. Firestore Security Rules
Buka Firestore → Rules → paste ini:

```
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /announcements/{doc} {
      allow read: if true;
      allow write: if request.auth != null && request.auth.token.email == 'owner@zentra.app';
    }
    match /broadcasts/{doc} {
      allow read: if true;
      allow write: if request.auth != null && request.auth.token.email == 'owner@zentra.app';
    }
    match /settings/{doc} {
      allow read: if true;
      allow write: if request.auth != null && request.auth.token.email == 'owner@zentra.app';
    }
    match /banners/{doc} {
      allow read: if true;
      allow write: if request.auth != null && request.auth.token.email == 'owner@zentra.app';
    }
    match /{document=**} {
      allow read, write: if request.auth != null && request.auth.token.email == 'owner@zentra.app';
    }
  }
}
```

### 5. Salin Firebase Config
- Project Settings (ikon gear) → General → scroll bawah
- Your apps → Add app → Web → Register
- Salin firebaseConfig
- Buka file `firebase-config.js` → paste nilai-nilainya

### 6. Jalankan
- Buka `index.html` = Zentra App
- Buka `control/index.html` = Zentra Control
- Login Control: owner@zentra.app / ZentraOwner2026!

## Cara Kerja

```
Buat info di Zentra Control
         ↓
  Firestore (cloud)
         ↓
  Zentra App update otomatis
  (realtime, tanpa refresh)
```

## Authorized Domains (kalau deploy online)
Firebase Console → Authentication → Settings → Authorized domains
→ tambahkan domain kamu (misal: zentra.vercel.app)
