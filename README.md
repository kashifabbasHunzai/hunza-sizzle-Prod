# De-De-Hunza Sizzle — Restaurant Management System (prototype)

Multi-branch restaurant system for **De-De-Hunza Sizzle** (Chinese & Fast Food, Islamabad).
Branches: **G-9/1** and **I-8 Markaz**.

Roles: Admin, Manager, Kitchen, Waiter, Cashier — plus a public **online ordering**
website (delivery / pickup / curbside) and **scan-to-order QR** dine-in flow.

> ⚠️ This is a **front-end prototype**. All data lives in the browser (React state)
> and resets on refresh. There is no backend, database, or real authentication yet.

---

## Run it locally

Requires **Node.js 18+**.

```bash
npm install
npm run dev
```

Open the URL Vite prints (usually http://localhost:5173).

Build for production:

```bash
npm run build      # output goes to /dist
npm run preview    # preview the production build
```

---

## Demo logins

| Role    | Username   | PIN  | Branch     |
|---------|------------|------|------------|
| Admin   | `admin`    | 1111 | all        |
| Manager | `umanager` | 1212 | G-9/1      |
| Manager | `fmanager` | 1313 | I-8 Markaz |
| Waiter  | `bilal`    | 2222 | G-9/1      |
| Rider   | `rehan`    | 5551 | G-9/1      |
| Cashier | `zain`     | 6661 | G-9/1      |

Customers order from the **Home page → Order Online**, or via a **QR code**
(Admin → QR Codes tab → "Preview as customer").

---

## Push this to GitHub

```bash
git init
git add .
git commit -m "De-De-Hunza Sizzle RMS prototype"
git branch -M main
git remote add origin https://github.com/<YOUR-USERNAME>/hunza-sizzle.git
git push -u origin main
```

If git asks for a password, use a **Personal Access Token** (GitHub → Settings →
Developer settings → Personal access tokens), not your account password.

---

## Deploy (so the QR codes actually open the app)

Easiest option — **Vercel** or **Netlify**: import the GitHub repo, framework
auto-detected as Vite, and it deploys on every push. Copy the live URL into the
app's **Admin → QR Codes → "App link"** field, then the generated QR codes will
open the app on any phone.

For **GitHub Pages**, set `base: "/hunza-sizzle/"` in `vite.config.js`, then
`npm run build` and publish the `/dist` folder.
