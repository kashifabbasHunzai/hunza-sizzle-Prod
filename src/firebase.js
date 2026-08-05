import { initializeApp } from "firebase/app";
import { getFirestore } from "firebase/firestore";
import { getAuth, signInAnonymously, onAuthStateChanged } from "firebase/auth";

const firebaseConfig = {
  apiKey: "AIzaSyDPGABfNabnqFjKXkJP4fz1hCWtiEDN60M",
  authDomain: "hunza-sizzle-live.firebaseapp.com",
  projectId: "hunza-sizzle-live",
  storageBucket: "hunza-sizzle-live.firebasestorage.app",
  messagingSenderId: "258592505013",
  appId: "1:258592505013:web:a2776e56b54dca518692fc",
};

export const FIREBASE_READY = firebaseConfig.apiKey !== "YOUR_API_KEY";

const app = initializeApp(firebaseConfig);
export const db = getFirestore(app);
export const auth = getAuth(app);

export const authReady = new Promise((resolve) => {
  if (!FIREBASE_READY) { resolve(null); return; }
  let settled = false;
  const finish = (u) => { if (!settled) { settled = true; resolve(u); } };
  onAuthStateChanged(auth, (user) => { if (user) finish(user); });
  signInAnonymously(auth).catch((e) => {
    console.error("Anonymous sign-in failed (app will still run):", e);
    finish(null);
  });
  setTimeout(() => finish(auth.currentUser || null), 8000);
});
