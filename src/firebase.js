/* ==================================================================
   FIREBASE CONFIG — real-time sync so every device (waiter phone,
   cashier counter, admin phone, manager laptop) sees the same live
   data: orders, staff, menu, inventory, stock requests, branch open/
   closed status.

   HOW TO SET THIS UP (5 minutes, free) — see DEPLOYMENT_GUIDE:
   1. https://console.firebase.google.com → "Add project"
   2. Build → Firestore Database → Create database → production mode
      → region asia-south1 (Mumbai) → Enable.
   3. Build → Authentication → Get started → enable "Anonymous"
      (this is what lets the security rules require request.auth != null,
       so ONLY the app can write to your database — see below).
   4. Firestore → Rules tab → paste rules from firestore.rules → Publish.
   5. Project Overview → "</>" (web) icon → register web app →
      copy the firebaseConfig values into the object below.
   6. Save, rebuild (npm run build), re-upload / push.

   These config values are safe to expose in the browser/GitHub — they
   only say "which project to talk to", not a secret password. Real
   protection comes from the Firestore Rules + Anonymous Auth below.
   ================================================================== */

import { initializeApp } from "firebase/app";
import { getFirestore } from "firebase/firestore";
import { getAuth, signInAnonymously, onAuthStateChanged } from "firebase/auth";

const firebaseConfig = {
  apiKey: "AIzaSyBE_ltpEWJMMUYni7Tak-NQOOocLby_Nig",
  authDomain: "onlinefood-a4ec3.firebaseapp.com",
  projectId: "onlinefood-a4ec3",
  storageBucket: "onlinefood-a4ec3.firebasestorage.app",
  messagingSenderId: "487001162053",
  appId: "1:487001162053:web:d3180ae7a3af3bfa1b7e2c",
};

// If the placeholders above haven't been replaced yet, the app still
// runs — it just falls back to local-only demo data (like before),
// so nothing breaks while you're setting Firebase up.
export const FIREBASE_READY = firebaseConfig.apiKey !== "YOUR_API_KEY";

const app = initializeApp(firebaseConfig);
export const db = getFirestore(app);
export const auth = getAuth(app);

/* ── Anonymous Authentication ──────────────────────────────────────
   Every device silently gets a Firebase identity the moment the app
   opens — the customer or staff member does NOT see or do anything
   extra (the app keeps its own username/PIN login on top of this).

   Why it matters: with this, the Firestore security rules can require
   `request.auth != null`, which means only a real, running copy of
   THIS app can read/write your database. Without it, anyone who found
   your project keys could write to the database with a script.

   `authReady` is a promise the app can await before its first write,
   so writes never race ahead of sign-in. It resolves even if sign-in
   fails, so the app still works (it just falls back to open rules).   */
export const authReady = new Promise((resolve) => {
  if (!FIREBASE_READY) { resolve(null); return; }
  let settled = false;
  const finish = (u) => { if (!settled) { settled = true; resolve(u); } };
  onAuthStateChanged(auth, (user) => { if (user) finish(user); });
  signInAnonymously(auth).catch((e) => {
    console.error("Anonymous sign-in failed (app will still run):", e);
    finish(null);
  });
  // Safety: never block the app more than 8s waiting on auth.
  setTimeout(() => finish(auth.currentUser || null), 8000);
});
