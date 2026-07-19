# The Hunza Sizzle — Go-Live Guide (domain, database, server, security)

Aap ke paas domain hai aur ab is app ko **real life me chalana** hai. Ye guide
shuru se aakhir tak step-by-step batati hai: kya banana hai, kis tarteeb se, aur
kitna kharcha aayega.

> **Sab se ahem baat pehle:** abhi jo app aap ke paas hai woh **front-end
> prototype** hai — saara data browser ki memory me hai, refresh par reset ho jata
> hai, aur har user ko apna alag data dikhta hai. Sirf isay domain par daal dene
> se ye "real system" nahi ban jayega. Real system ke liye **backend + database**
> lagana zaroori hai (Phase 2), warna orders save nahi honge aur staff/admin ek
> doosre ka data nahi dekh payenge.

---

## Aap ke paas kya kya hoga (3 hisse)

```
[ Phone / Laptop browser ]  →  [ Backend API (server) ]  →  [ Database ]
   front-end (React app)         auth + rules + hisaab        PostgreSQL
   → yourdomain.com              → api.yourdomain.com         (managed)
```

| Hissa | Kya karta hai | Kahan chalega |
|-------|---------------|---------------|
| Front-end | Jo customer/staff dekhte hain | Vercel ya Netlify (free) |
| Backend API | Login, orders, hisaab, rules | Railway / Render / Fly.io |
| Database | Sab kuch permanently save | Neon / Supabase (managed Postgres) |

---

# PHASE 1 — Front-end ko domain par live karna (aaj ho sakta hai)

Is phase ke baad aap ka **demo** aap ke domain par chalega — client ko dikhane,
QR test karne, aur mobile par check karne ke liye. (Data abhi bhi save nahi hoga.)

### Step 1.1 — Code GitHub par push karein
Project folder me:
```bash
git add .
git commit -m "responsive + security prep"
git push
```

### Step 1.2 — Vercel par deploy
1. **vercel.com** → *Continue with GitHub* → login.
2. **Add New → Project** → apna `hunza-sizzle` repo **Import**.
3. Framework khud **Vite** detect hoga → **Deploy** dabayein.
4. 1–2 minute me live URL mil jayega (jaise `hunza-sizzle.vercel.app`).

### Step 1.3 — Apna domain jodein
1. Vercel project → **Settings → Domains → Add** → apna domain likhein
   (misal `thehunzasizzle.com` aur `www.thehunzasizzle.com`).
2. Vercel aap ko DNS records dega. Ab **apne domain registrar** (jahan se domain
   khareeda: GoDaddy / Namecheap / PKNIC etc.) ke DNS panel me jayein:
   - **A record**: `@` → Vercel ka diya hua IP (aam tor par `76.76.21.21`)
   - **CNAME**: `www` → `cname.vercel-dns.com`
   *(Bilkul wahi values daalein jo Vercel aap ko dikhata hai.)*
3. 10 minute se 24 ghante me DNS phail jata hai. Vercel khud **HTTPS (SSL)**
   certificate laga dega — free.

### Step 1.4 — QR codes ko live URL par set karein
App me **Admin → QR Codes → "App link"** me apna domain daalein
(`https://thehunzasizzle.com`). Ab jo QR banenge woh kisi bhi phone se scan karne
par app khol denge.

### Step 1.5 — Mobile par check karein
Apne phone se domain kholein aur dekhein: home, order flow, checkout, staff
login, dashboard. (App responsive bana di gayi hai — chhoti screen par tabs
scroll hote hain, cards 2-column ho jate hain, print preview stack ho jata hai.)

**Tip:** phone me *Add to Home Screen* karke app jaise chalta hai (manifest laga
diya hai).

---

# PHASE 2 — Database + Backend (asal system yahan banta hai)

Ye woh hissa hai jiske baghair orders save nahi hote. Aap ke paas pehle se
`hunza-backend.zip` maujood hai (Node + Express + Prisma + PostgreSQL, security
ke saath). Us par ye steps chalte hain.

## Step 2.1 — Database banayein (PostgreSQL, managed)

**Kaunsa database?** → **PostgreSQL**. Aur isay khud manage na karein — *managed*
service lein taake backup, patching, encryption sab woh sambhalein.

Options (dono me free tier hai):
- **Neon** (neon.tech) — sirf Postgres, bohot aasan.
- **Supabase** (supabase.com) — Postgres + built-in auth + storage. Agar aap
  developer hire nahi kar rahe to **Supabase behtar hai**.

Steps (Neon example):
1. neon.tech par sign up → **Create project** → region: Singapore ya Frankfurt
   (Pakistan ke liye latency theek rehti hai).
2. Aap ko ek **connection string** milegi:
   `postgresql://user:password@host/dbname?sslmode=require`
3. Isay mehfooz rakhein — ye kabhi code me ya GitHub par na daalein.

## Step 2.2 — Backend deploy karein

1. `hunza-backend` folder ko **alag GitHub repo** me daalein (`hunza-api`).
2. **Railway.app** (ya Render.com) par → *New Project → Deploy from GitHub* →
   `hunza-api` repo chunein.
3. Us platform ke **Variables / Environment** section me ye set karein:
   ```
   NODE_ENV=production
   DATABASE_URL=<Neon wali connection string>
   JWT_SECRET=<lamba random text>
   JWT_EXPIRES_IN=8h
   CORS_ORIGIN=https://thehunzasizzle.com
   SEED_ADMIN_USERNAME=admin
   SEED_ADMIN_PIN=<strong 6+ digit PIN>
   ```
   `JWT_SECRET` banane ke liye apne laptop par:
   ```bash
   node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"
   ```
4. Deploy hone ke baad ek dafa migration + seed chalayein (platform ke shell se):
   ```bash
   npx prisma migrate deploy
   npm run seed
   ```
5. Backend ka apna subdomain banayein: registrar me **CNAME** `api` → jo host
   address de (misal `hunza-api.up.railway.app`), taake API
   `https://api.thehunzasizzle.com` par chale.

## Step 2.3 — Baaki API routes complete karayein

Scaffold me **auth + orders** ke routes maujood hain. Ab inhe usi secure pattern
par likhna hoga:
- `menu` (public read; admin/manager write)
- `inventory` + purchases (admin/manager)
- `staff` (admin; manager apni branch)
- `payroll` (admin/manager)
- `notifications` + real-time (Socket.IO)
- `reports` (dashboard ke aankdon ke liye — server par calculate hon)

> Ye kaam ek Node developer ka **1–3 hafte** ka hai. Agar aap khud engineer nahi
> hain to ye hissa hire karna hi sab se samajhdari hai.

## Step 2.4 — Front-end ko API se jodein

React app me har `fetch` par cookie bhejna zaroori hai:
```js
const API = import.meta.env.VITE_API_URL;      // https://api.thehunzasizzle.com

const res = await fetch(`${API}/api/orders`, {
  method: "POST",
  credentials: "include",                      // ← auth cookie ke liye lazmi
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify(payload),
});
```
Vercel ke project settings me **Environment Variable** daalein:
`VITE_API_URL = https://api.thehunzasizzle.com`

---

# PHASE 3 — Security (go-live se pehle lazmi)

**Imaandaar baat:** koi system 100% "un-hackable" nahi hota. Security ek layered,
chalta rehne wala amal hai. Neeche wali cheezein karna zaroori hain:

### App ki taraf (abhi kar sakte hain)
- [ ] `App.jsx` me `DEMO_MODE = false` kar dein — login screen se demo accounts
      ki list hat jayegi.
- [ ] Saare **demo accounts delete** karein; sirf asli staff banayein.
- [ ] **Admin PIN 6+ digits** rakhein; har banday ka alag PIN.
- [ ] Job chhorne wale staff ko foran **On leave / delete** karein.

### Backend ki taraf (scaffold me pehle se maujood)
- [x] PIN **argon2id** se hashed (raw PIN kabhi store nahi hota)
- [x] JWT **httpOnly + Secure + SameSite** cookie me
- [x] **RBAC** + branch scoping har route par
- [x] Har input **zod** se validate
- [x] **Order ki qeemat server par DB se dobara calculate** (client par bharosa nahi)
- [x] **Rate limiting** (login par sakht — PIN brute-force rokta hai)
- [x] **helmet** headers + **CORS** sirf aap ke domain tak
- [x] Secrets `.env` me, GitHub se bahar

### Infrastructure
- [ ] **HTTPS** har jagah (Vercel/Railway free dete hain)
- [ ] Database ke **automated backups** on karein — aur ek dafa **restore test**
      karein (backup tabhi backup hai jab restore ho jaye)
- [ ] Monthly: `npm audit` chala kar packages update karein
- [ ] Uptime + error alerts laga dein

### Payments (bohot ahem)
Card/online payment **khud handle na karein**. Ek licensed gateway use karein
(misal Safepay, PayFast Pakistan, ya 2Checkout/Stripe jahan available ho). Aap ka
server kabhi **raw card number na dekhe na store kare** — warna PCI-DSS compliance
aap ke sar par aa jati hai.

### Legal / privacy
- [ ] Customer ko batayein aap kya data rakhte hain (naam, phone, address) aur kyun
- [ ] Sales tax (I-8 wala 16%/5%) apne accountant se confirm karayein — rates
      badalte rehte hain
- [ ] Go-live se pehle ek **independent security review / penetration test**

---

# Kharcha (approx, monthly)

| Cheez | Free tier | Chhota business |
|-------|-----------|-----------------|
| Domain | — | ~$10–15 / saal |
| Front-end (Vercel) | Free kaafi hai | $0–20 |
| Backend (Railway/Render) | Free (sota hai) | $5–20 |
| Database (Neon/Supabase) | Free (chhota) | $10–25 |
| **Total** | **$0** (demo) | **~$20–60 / month** |

Real customers ke liye free tier par na chalein — free backends idle hone par
"sleep" ho jate hain (pehla order 30 second lega).

---

# Tarteeb (kya pehle, kya baad me)

1. **Aaj** — Phase 1: domain par front-end live + mobile test + QR link set.
2. **Hafta 1** — Database + backend deploy, admin account banao.
3. **Hafta 2–4** — Baaki API routes + front-end ko API se jorna (developer).
4. **Go-live se pehle** — Phase 3 ki poori checklist + backup restore test.
5. **Har mahine** — updates, backups check, access review.

---

## Ek chhota mashwara

Agar aap khud engineer nahi hain, do raaste hain:
- **Supabase** use karein — Postgres + auth + row-level security ek jagah, backend
  ka bohot sa kaam bach jata hai.
- Ya ek **Node/React developer hire karein** (Pakistan me is scope ka kaam aam
  tor par 2–6 hafte). Unhe ye guide, `ARCHITECTURE_AND_SECURITY.md`, aur
  `hunza-backend` scaffold de dein — unka kaam aadha ho jayega.

Kisi bhi surat me: **paise ka hisaab (orders, totals, tax) hamesha server par
calculate hona chahiye, browser par kabhi nahi.**
