# Real-time sync (Firebase) + Hostinger par live karna

Ye guide batati hai: **har device (waiter/cashier/admin/manager phone) par
same live data kaise dikhega**, aur phir app ko **Hostinger** par kaise
daalna hai.

> Pehle jo masla tha: is app mein backend/database nahi tha, is liye har
> phone/browser apna **alag** data rakhta tha — waiter ka order admin ke
> phone par nazar nahi aata tha. Ab **Firebase Firestore** laga diya gaya
> hai jo sab devices ko real-time mein sync karta hai (~1 second mein
> update) — har order ka apna alag document hai, is liye do devices ka
> order kabhi ek doosre ko overwrite nahi karta, aur order number bhi
> ek shared counter se atomically milta hai (do devices ko kabhi same
> number nahi milega). Jab tak neeche wala setup nahi karte, app pehle
> jaisa hi local-only chalega — kuch tootega nahi.

---

## Step 1 — Firebase project banayein (5 minute, free)

1. **console.firebase.google.com** kholein → Google account se login →
   **"Add project"**.
2. Naam likhein (misal `hunza-sizzle`) → Continue → Google Analytics
   optional hai, chahen to off kar dein → **Create project**.
3. Left sidebar mein **Build → Firestore Database** → **"Create
   database"**.
   - Location: koi bhi Asia wala region theek hai (misal `asia-south1`
     — Mumbai — Pakistan ke sabse qareeb).
   - Mode: **Production mode** chunein (Test mode 30 din baad khud lock
     ho jata hai).
   - **Enable**.
4. Same project ke Overview page par **`</>`** (web) icon dabayein → app
   ka nickname likhein (misal `hunza-web`) → **Firebase Hosting ki tick
   na lagayein** (hum Hostinger use kar rahe hain) → **Register app**.
5. Ab ek `firebaseConfig` object dikhega, kuch aisا:
   ```js
   const firebaseConfig = {
     apiKey: "AIzaSy...",
     authDomain: "hunza-sizzle.firebaseapp.com",
     projectId: "hunza-sizzle",
     storageBucket: "hunza-sizzle.appspot.com",
     messagingSenderId: "123456789",
     appId: "1:123456789:web:abcdef",
   };
   ```
   Ye poora object copy kar lein.

---

## Step 2 — Keys project mein daalein

`src/firebase.js` file kholein aur `firebaseConfig` object ke andar wahi
values paste kar dein jo Firebase ne di thi (placeholders replace kar
dein). Save karein.

---

## Step 3 — Anonymous Authentication enable karein (zaroori)

App ab har device ko khamoshi se ek Firebase identity deta hai (customer/staff
ko kuch alag se karna nahi padta) — isi ki wajah se database ko properly lock
kar sakte hain (neeche Step 4 dekhein).

Firebase console → **Build → Authentication → Get started** → **Sign-in
method** tab → **"Anonymous"** provider dhoondein → **Enable** kar ke Save
kar dein.

> ⚠️ Ye step miss na karein — agar Anonymous auth enable nahi hai, to app
> sign-in nahi kar payega aur (naye rules ke sath) database khaali/band jaisa
> nazar aayega.

## Step 4 — Firestore Rules set karein (zaroori)

Firebase console → **Firestore Database → Rules** tab → jo likha hai
usay poora replace kar ke project root ki `firestore.rules` file ka poora
content paste karein, phir **Publish** dabayein.

Ye rules ab sirf "koi bhi likh sakta hai" nahi hain — inme ye cheezein hain:
- **Sign-in zaroori** — sirf woh device likh/parh sakta hai jo app ke through
  (Anonymous Auth se) sign in hua ho. Koi bahar ka script sirf `apiKey` dekh
  kar seedha likh nahi sakta.
- **Size guard** — koi bhi document ~900KB se bada nahi ho sakta (Firestore
  ki 1MB limit se surakhit fasla), taake koi bohot badi image accidentally
  poora quota na kha jaye.
- **Basic validation** naye orders par (order number, items, branch zaroori
  hain).

> Agar business badi ho jaye aur staff members ko alag-alag permissions
> (jaise sirf apne branch ka data) chahiye hon, to ye rules role-based banayi
> ja sakti hain — filhal ye setup 2-branch restaurant ke liye kaafi mehfooz
> hai.

---

## Step 5 — Local par test karein

```bash
npm install
npm run dev
```

Do alag browser windows (ya ek phone + ek laptop) kholein, dono par app
kholein. Ek par waiter se order lein — doosri window mein admin/manager
dashboard mein **1-2 second mein** order nazar aa jana chahiye. Header
mein ek chhota **"Live"** badge bhi dikhega jab sync connect ho jaye.

---

## Step 6 — Hostinger par deploy karein

Hostinger par ye ek **static site** ki tarah upload hoti hai (Vercel ki
tarah auto-detect nahi karta, is liye build khud kar ke upload karna
hoga):

1. Production build banayein:
   ```bash
   npm run build
   ```
   Ye `/dist` folder banayega jismein poori site hai.
2. Hostinger **hPanel** mein login karein → **Websites → apni site**
   choose karein → **File Manager** kholein (ya FTP/SFTP use karein).
3. `public_html` folder ke andar jayein (ya jahan aapka domain point
   karta hai) → **saari purani files hata dein** (agar koi default
   Hostinger page hai) → apne local `/dist` folder ke andar ki **saari
   files aur folders** wahan upload kar dein (`index.html`, `assets/`
   folder, `manifest.webmanifest`, `menu/` folder, `_redirects` waghera).
4. Kyunke ye ek **Single Page App** hai (React Router jaisa nahi, lekin
   staff paths jaise `/admin` bhi handle karta hai), agar aap `/admin`
   ya `/waiter` type URL seedha kholte hain to Hostinger ko batana hoga
   ke unknown paths bhi `index.html` serve karein. `public_html` mein
   ek `.htaccess` file banayein (agar Hostinger Apache use kar raha hai
   — zyada tar shared hosting Apache hoti hai) is content ke saath:
   ```
   <IfModule mod_rewrite.c>
     RewriteEngine On
     RewriteCond %{REQUEST_FILENAME} !-f
     RewriteCond %{REQUEST_FILENAME} !-d
     RewriteRule ^ index.html [L]
   </IfModule>
   ```
5. Apna domain ke DNS records Hostinger ki taraf point ho (agar domain
   bhi Hostinger se liya hai to already ho ga; warna registrar mein A
   record Hostinger ke IP par set karein).
6. Domain kholein aur check karein — home page, `/admin` (staff login),
   customer order flow, sab kaam karna chahiye.

---

## Har naye update ke baad

Jab bhi `src/App.jsx` ya `src/firebase.js` mein koi change karein:
```bash
npm run build
```
phir naye `/dist` ka content dobara Hostinger File Manager mein upload
kar dein (purani files overwrite ho jayengi).

---

## Kya sync hota hai ab

- **Orders** — sab kuch: naya order, status change (preparing/ready),
  payment, priority, cancel — sab real-time sync hai.
- **Staff (users), Menu, Inventory, Stock requests, Branch open/closed**
  — ye bhi sync hain (ek chhoti si delay ke saath, ~1 second).
- **Notifications bell / toasts** — abhi bhi **per-device** hain (har
  phone apne notifications khud generate karta hai) — ye is update ka
  hissa nahi tha.
