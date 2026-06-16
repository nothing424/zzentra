# Zentra Control — Setup Guide

## Login Credentials
Email    : owner@zentra.app
Password : ZentraOwner2026!

## Langkah Setup Firebase

### 1. Buat Firebase Project
1. Buka https://console.firebase.google.com
2. Klik "Add project" → beri nama "zentra-control"
3. Disable Google Analytics (opsional) → Create project

### 2. Aktifkan Authentication
1. Build → Authentication → Get started
2. Sign-in method → Email/Password → Enable → Save
3. Users → Add user:
   - Email   : owner@zentra.app
   - Password: ZentraOwner2026!

### 3. Aktifkan Firestore
1. Build → Firestore Database → Create database
2. Pilih "Start in production mode"
3. Pilih region terdekat (asia-southeast1)

### 4. Firestore Rules
Paste rules berikut di Firestore → Rules:

rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /{document=**} {
      allow read, write: if request.auth != null && request.auth.token.email == 'owner@zentra.app';
    }
  }
}

### 5. Dapatkan Firebase Config
1. Project Settings (gear icon) → General
2. Scroll ke "Your apps" → Add app → Web (</>)
3. Register app → salin firebaseConfig
4. Paste ke file js/app.js bagian FIREBASE_CONFIG

### 6. Deploy / Jalankan
- Buka index.html langsung di browser, atau
- Upload ke hosting (Vercel, Netlify, GitHub Pages)
- Pastikan domain ditambahkan di Firebase Auth → Settings → Authorized domains
