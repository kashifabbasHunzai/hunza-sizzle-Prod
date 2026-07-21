# De-De-Hunza Sizzle — Test Report

**Date:** July 2026 · **Scope:** front-end application (`src/App.jsx`)

| Layer | Tests | Result |
|---|---|---|
| Unit tests (pure logic) | 46 | ✅ all pass |
| Integration tests (business workflows) | 11 workflows | ✅ all pass |
| Flow / UI tests | 69 | ✅ all pass |
| Security tests | 31 | ✅ all pass |
| Inventory + data-integrity tests | 23 | ✅ all pass |
| **Total** | **180 checks** | **0 failures, 0 React errors** |
| CSS / design audit | 21 checks | 0 high, 0 medium, 3 low |

---

## 1. Unit tests (46)

Pure functions tested in isolation — the calculations the business depends on.

- **Money formatting** — thousands separators, zero, millions.
- **Sales tax** — I-8 only; 16% cash, 5% card; G-9/1 never taxed; card always cheaper;
  unknown payment method defaults to cash (safer for the business); tax is always a
  whole rupee amount.
- **Order totals** — items × quantity, empty orders, delivery fee + tax, missing
  fee/tax on older orders, and one full real-world delivery bill verified by hand.
- **Date helpers** — today/yesterday never overlap, the millisecond before midnight
  counts as yesterday, "last 7 days" includes today and the previous six but not the
  eighth, month keys are zero-padded, month ranges cross year boundaries correctly.
- **Unique IDs** — 50 consecutive creations never collide (this is the bug that
  previously let one staff edit affect another person).
- **PIN strength** — short, well-known and repeated-digit PINs rejected; strong ones
  accepted; empty/undefined handled safely.
- **Menu availability** — customers only see items sold at their branch; hidden items
  never appear.
- **Payroll** — advance totals, paid-month tracking, and new employees starting clean.
- **ETA** — shrinks as an order progresses, delivery takes longer than dine-in, never
  negative at any stage.
- **Configuration sanity** — every role has a label/icon/valid colour, the taxed
  branch actually exists, staff URL paths are well formed, stages are in order.

## 2. Integration tests (11 workflows)

Real journeys driven through the actual UI, exactly as a person would:

1. **Online delivery, end to end** — customer orders → auto-assigned to a *rider* (not
   a waiter) → admin prints (kitchen ticket has no prices, bill shows the address) →
   marked ready → rider does Pick up → On the way → Reached → Delivered → admin is
   notified.
2. **QR table order** — scanning locks the table, the order reaches a waiter *of that
   branch*.
3. **Branch open/close** — closing stops customers ordering; reopening restores it.
4. **Hiring** — a new employee appears in staff, payroll (with salary), the assignment
   pool and the dashboard, and can sign in and work.
5. **Leave** — someone on leave stops receiving orders and cannot sign in.
6. **Stock purchase** — raises stock, logs the purchase, and increases the dashboard's
   money-out by *exactly* the amount paid.
7. **Menu edit** — a price change is instantly what customers are charged, with an
   "Edited by" audit trail.
8. **Sales tax reporting** — 16% cash / 5% card at checkout, itemised on the printed
   bill, and totalled in "Sales tax collected".
9. **Manager scoping** — no Menu tab, no other-branch orders, staff, stock or payroll.
10. **Payroll cycle** — salary, advance and monthly payment work together.
11. **Console cleanliness** — no React errors across every workflow above.

## 3. CSS / design audit (21 checks)

**Passing:** dark and light themes define the same 12 variables · 9 responsive
breakpoints including a small-phone one · no oversized fixed widths · horizontal
overflow guarded · `prefers-reduced-motion` respected · focus styles present · touch
tap targets sized for fingers · print stylesheet with page breaks · iPhone safe areas
· stylesheet 71.8 KB.

**Colour contrast (WCAG):** body text 16.3:1, ember 6.6:1, jade 9.8:1, saffron
10.4:1, rose 6.0:1 — all comfortably above the 4.5:1 requirement.

**Remaining low-priority notes:** ~36 unused style rules inside media queries,
four selectors intentionally repeated for responsive overrides, and some grids using
bare `fr` units. None affect appearance or behaviour.

---

## 4. Bugs found and fixed during testing

| # | Severity | Issue | Fix |
|---|---|---|---|
| 1 | **High** | Sales tax was skipped on orders taken by a waiter at the counter — I-8 bills were short by 16% | Tax is now calculated in one place for every order, however it arrives |
| 2 | **High** | New staff were given IDs that already belonged to kitchen staff (`u12`), so editing or deleting one person could affect another | IDs are now derived from the list itself and can never collide |
| 3 | **High** | The customer's live-tracking card had no styling at all | Proper card styling added, including a mobile layout |
| 4 | Medium | No brute-force protection — a 4-digit PIN could be guessed in seconds | 5 wrong attempts lock the form for 60 seconds |
| 5 | Medium | Weak PINs (`1234`, `0000`, `1111`) were accepted | Rejected; 6 digits recommended; PIN masked while typing |
| 6 | Medium | Sessions never expired on shared counter tablets | Automatic sign-out after 20 minutes idle |
| 7 | Medium | Editing a staff member could duplicate an existing username | Duplicates rejected with a clear message |
| 8 | Medium | The 7-tab admin bar had no width rules | Layout added for 6- and 7-tab bars |
| 9 | Medium | Inventory sat in a 300px column — the add-stock form was clipped and the list looked broken | Rebuilt as a wide list with a labelled form and a side panel |
| 10 | Low | `confirm()` was called bare and crashed in some webviews, silently cancelling deletes | Safe wrapper with a fallback |
| 11 | Low | Two `<datalist>` elements shared one HTML id | Unique ids |
| 12 | Low | `--rider` colour was used but never defined | Defined in both themes |
| 13 | Low | 27 dead style rules from removed features | Removed (2.5 KB) |
| 14 | Low | Icon-only buttons lacked accessible labels | `aria-label` added |

---

## 5. What testing cannot fix

These remain by design until the backend exists (see `SECURITY_AUDIT.md`):

- **All staff PINs are readable** in the JavaScript anyone can download.
- **Authorisation is decided in the browser**, so it can be bypassed with devtools.
- **Prices and totals are calculated client-side.**
- **Nothing is saved** — data resets on refresh.

The application logic is correct and well covered by tests; the remaining risk is
architectural, not a defect in the code.
