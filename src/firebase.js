/* ==================================================================
   FIREBASE CONFIG — real-time sync so every device (waiter phone,
   cashier counter, admin phone, manager laptop) sees the same live
   data: orders, staff, menu, inventory, stock requests, branch open/
   closed status.

   HOW TO SET THIS UP (5 minutes, free):
   1. Go to https://console.firebase.google.com → "Add project" →
      name it e.g. "hunza-sizzle" → finish the wizard (Analytics is
      optional, you can turn it off).
   2. In the left sidebar: Build → Firestore Database → "Create
      database" → start in **production mode** → pick a region close
      to Pakistan (e.g. asia-south1 / Mumbai) → Enable.
   3. Go to Firestore → Rules tab and paste the rules from
      FIREBASE_SETUP.md in the project root, then Publish.
      (Default rules block everything — the app will look empty /
      broken until you publish those rules.)
   4. Back in the project Overview page, click the "</>" (web) icon to
      register a web app → give it any nickname → you do NOT need
      Firebase Hosting → it will show you a `firebaseConfig` object.
   5. Copy those values into the object below, replacing the
      placeholders. Save this file, then rebuild the app
      (`npm run build`) and re-upload to Hostinger.

   These values are safe to expose in the browser/GitHub — they only
   say "which project to talk to", not a secret password. Real
   protection comes from the Firestore Rules in step 3.
   ================================================================== */

import { initializeApp } from "firebase/app";
import { getFirestore } from "firebase/firestore";

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
