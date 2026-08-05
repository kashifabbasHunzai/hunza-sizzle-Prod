# What Changed — Latest Update (Production + Auth)

Ye update production launch ke liye hai. Neeche jo badla wo saaf likha hai.

## 1. Firebase Authentication (Anonymous) — NEW
- `src/firebase.js` me anonymous sign-in add kiya. Har device khamoshi se
  Firebase identity le leta hai (staff/customer ko kuch extra nahi karna).
- Iska faida: ab `firestore.rules` `request.auth != null` require karti hain —
  matlab sirf app ke through hi database likha ja sakta hai, bahar se koi
  script nahi.
- **ZAROORI SETUP:** Firebase Console → Build → Authentication → Get started
  → "Anonymous" provider enable karein. Warna app sign-in nahi kar payega.

## 2. Production mode
- `src/App.jsx`: `DEMO_MODE = false` — login screen par demo accounts/PINs
  ab nazar nahi aayenge.

## 3. Security rules (`firestore.rules`)
- Testing-mode ("koi bhi sab kuch") band. Ab signed-in + size-guarded.
- Launch se pehle Firebase Console → Firestore → Rules me paste karke Publish karein.

## 4. Hostinger routing (`public/.htaccess`)
- /admin, /waiter jaisi URLs refresh par 404 na dein, iske liye.
- Build ke baad ye dist/ me chala jaayega (public/ ki har cheez copy hoti hai).

## 5. Session ke pichle bug fixes (pehle se code me)
- Notification badge positioning + refresh par jhooti ring band.
- Toast 8 second.
- Multiple payment screenshots (koi overwrite nahi).
- Car-hop/takeaway online order me item add ho to "pay balance" flow.
- Bill par saaf address; thermal print portrait.

## Data lifetime
- App orders/sales data KABHI khud delete nahi karta. Data lifetime safe hai
  (Firebase khud kuch nahi mitata). Sirf manual cancel/delete par hi jaata hai.
- Free plan 1GB. Photos base64 me Firestore me hain — agar bahut volume ho to
  guide me bataya gaya Firebase Storage par move karne ka tareeqa.

Poora step-by-step: DEPLOYMENT_GUIDE.docx parhein.
