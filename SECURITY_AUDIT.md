# De-De-Hunza Sizzle — Security Audit Report

**Date:** July 2026
**Scope:** the front-end application (`src/App.jsx`) as it exists today.
**Method:** static code scan + 38 automated attack tests run in a real DOM
(XSS injection, URL tampering, role escalation, authentication abuse, data
leakage), plus a manual review of the shipped JavaScript bundle.

---

## Summary

| | |
|---|---|
| Automated security tests | **38 passed, 0 failed** |
| Issues found and fixed in this pass | **3** (brute force, weak PINs, unattended sessions) |
| **Critical issues that cannot be fixed in the front-end** | **4** — see Section 3 |

**Bottom line:** the app is well-behaved against the attacks a browser can
prevent — there is no XSS, no injection, no data leakage, and the role rules work
as intended. **But the app has no server**, and that is a fundamental problem:
every credential and every rule currently lives in the customer's browser, where
anyone can read and change them. This build is safe to demo publicly; it is
**not safe to run a real restaurant's money and staff data on** until the backend
exists.

---

## 1. What was tested and passed ✅

### Injection / XSS (7 tests)
Script payloads (`<img src=x onerror=…>`, `"><script>…`) were submitted through
the customer name, phone, notes, and URL parameters, then followed all the way to
the admin screen and the printed receipt.
**Result:** nothing executed anywhere. React escapes all output, and the code
uses no `dangerouslySetInnerHTML`, `eval`, `innerHTML`, or `document.write`.

### URL / parameter tampering (4 tests)
Malicious `?b=` branch values are rejected (unknown branch → normal home page).
Malicious `?t=` table values render as harmless text.

### Role escalation (5 tests)
- A waiter who opens `/admin` and signs in gets the **waiter** dashboard, not the admin one.
- Managers have no Menu tab and see only their own branch's data.
- Kitchen (payroll-only) accounts cannot sign in at all.

### Authentication (6 tests)
Wrong PIN, empty PIN, and SQL-injection-style input are all rejected. Staff
marked **On leave** are refused sign-in immediately.

### Data exposure (6 tests)
Nothing is written to `localStorage`, `sessionStorage`, or cookies. Staff PINs
are masked (`••••`) in the staff list and only revealed on an explicit click.

### Transport & third parties (4 tests)
No `http://` requests, no unsafe `target="_blank"` links. The only external calls
are Google Fonts and the QR image service (`api.qrserver.com`), both over HTTPS.
*Note: the QR service receives the URL being encoded — fine for table links, but
never put anything private in a QR.*

---

## 2. Issues found — and fixed in this pass 🔧

### 2.1 No brute-force protection (was: HIGH)
A 4-digit PIN has 10,000 combinations. The login screen accepted unlimited
guesses, so any PIN could be found in seconds by a simple script.
**Fixed:** 5 wrong attempts now lock the form for 60 seconds, and the remaining
attempt count is shown. *(A determined attacker can still bypass a browser-side
lock — real rate limiting must be on the server.)*

### 2.2 Weak PINs allowed (was: HIGH)
`1234`, `0000`, `1111` and similar were accepted when creating staff. These are
the first PINs anyone tries.
**Fixed:** obvious and repeated-digit PINs are now rejected, 6 digits are
recommended, and the PIN field is masked while typing.

### 2.3 Sessions never expired (was: MEDIUM)
Staff often share a counter tablet. A signed-in session stayed open forever, so
anyone walking past could use the previous person's account.
**Fixed:** automatic sign-out after 20 minutes with no activity.

---

## 3. Critical issues that CANNOT be fixed without a backend ⚠️

These are not bugs in the code — they are consequences of having no server. I
verified each one by inspecting the JavaScript bundle that gets served to every
visitor.

### 3.1 All staff PINs are readable by anyone — CRITICAL
Anyone can open the browser's "View source" (or download `app.js`) and read
every username, PIN, and role. My test extracted **13 accounts including the
admin PIN** from the built bundle in under a second.
**Consequence:** anyone on the internet can sign in as admin.
**Only fix:** move accounts to a database, store PINs as **argon2 hashes**, and
verify them on the server. (The `hunza-backend` scaffold already does this.)

### 3.2 All authorisation is decided in the browser — CRITICAL
"Is this person an admin?" is answered by JavaScript running on the attacker's own
machine. With browser devtools, anyone can change their role to `admin` and open
every screen — no password needed.
**Only fix:** the server must check the role on **every** request. Hiding a button
is a convenience, never a security control.

### 3.3 Prices and totals are calculated in the browser — CRITICAL
Order totals, delivery fee and sales tax are all computed client-side. In a live
system with payments, a customer could alter the price before it is submitted.
**Only fix:** the server must recalculate every total from its own database and
ignore any amount sent by the browser. (The backend scaffold does this already.)

### 3.4 Nothing is stored or logged — HIGH
Data lives in memory and disappears on refresh. There is no durable record of
orders, no backup, and the "Edited by …" audit trail is lost with it.
**Only fix:** a real database with automated backups and an `audit_log` table.

---

## 4. Before you go live — checklist

**Do these before real customers or staff use the system:**

- [ ] Build the backend (auth, RBAC, server-side totals) — see `hunza-backend/`
      and `ARCHITECTURE_AND_SECURITY.md`.
- [ ] Set `DEMO_MODE = false` in `src/App.jsx` (hides the demo account list).
- [ ] **Delete every demo account** (`admin/1111` etc.) and create real ones with
      6-digit PINs.
- [ ] Serve everything over HTTPS (Vercel does this automatically).
- [ ] Keep the security headers in `vercel.json`.
- [ ] Turn on database backups — and test a restore.
- [ ] Run `npm audit` monthly and apply updates.
- [ ] Use a licensed payment gateway; never handle raw card numbers yourself.
- [ ] Remove a staff member's access the same day they leave.
- [ ] Commission an independent penetration test before processing real payments.

---

## 5. Honest conclusion

The application code itself is clean: **no XSS, no injection, no leakage, correct
role behaviour, and 38/38 security tests passing.** The three weaknesses that
could be fixed in the browser have been fixed.

What remains is architectural, not cosmetic: **a front-end-only app cannot be
secured**, because the attacker controls the browser. Anyone telling you
otherwise is mistaken. The current build is excellent for demos, client
presentations, and staff training — but treat every PIN in it as public, and do
not put real customer data or payments through it until the backend is live.

No system is ever 100% secure; the aim is to make attacks expensive and to detect
them quickly. Moving authentication, authorisation, and money calculations to the
server does the bulk of that work.
