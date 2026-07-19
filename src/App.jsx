import React, { useState, useEffect, useRef, useMemo } from "react";
import {
  Flame, Sun, Moon, ChefHat, Store, Car, ShoppingBag, QrCode, Clock, Bell,
  Star, Plus, Minus, Check, ArrowRight, Play, Pause, LogOut, ClipboardList,
  User, Hash, Receipt, Trash2, ChevronRight, ChevronLeft, ShieldCheck, Users,
  CircleAlert, MapPin, CheckCircle2, Soup, UserPlus, KeyRound, Wallet,
  Lock, Package, AlertTriangle, PackagePlus, X, Search,
  ImagePlus, UtensilsCrossed, Truck, Bike, Home, Phone, CreditCard, Banknote,
  Building2, Navigation, ShoppingCart, BarChart3, TrendingUp, Boxes, Calendar, Pencil, Info,
} from "lucide-react";

/* ================================================================== */
/*  HUNZA SIZZLE — multi-branch restaurant system + online ordering    */
/*  Branches: G-9/1 & I-8 Markaz (Islamabad). Same system both sides.  */
/* ================================================================== */

const rs = (n) => "Rs " + n.toLocaleString("en-PK");
const now = () => Date.now();
const clock = (ms) => new Date(ms).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
const MN = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const monthKey = (d) => { const x = new Date(d); return x.getFullYear() + "-" + String(x.getMonth() + 1).padStart(2, "0"); };
const monthShort = (key) => { const [y, m] = key.split("-"); return MN[+m - 1]; };
const monthLong = (key) => { const [y, m] = key.split("-"); return MN[+m - 1] + " " + y; };
const monthsBetween = (fromTs, toTs) => { const out = []; const a = new Date(fromTs); a.setDate(1); const b = new Date(toTs || now()); b.setDate(1); let g = 0; while (a <= b && g < 60) { out.push(monthKey(a)); a.setMonth(a.getMonth() + 1); g++; } return out; };
const DAY = 86400000;
const dayStart = (ts) => { const d = new Date(ts); d.setHours(0, 0, 0, 0); return d.getTime(); };
const WD = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const dayName = (ts) => WD[new Date(ts).getDay()];
const dayNum = (ts) => new Date(ts).getDate();
const isToday = (ts) => ts >= dayStart(now());
const isYesterday = (ts) => ts >= dayStart(now()) - DAY && ts < dayStart(now());
const isLast7 = (ts) => ts >= dayStart(now()) - 6 * DAY;
const isThisMonth = (ts) => { const n = new Date(), d = new Date(ts); return d.getMonth() === n.getMonth() && d.getFullYear() === n.getFullYear(); };
const isThisYear = (ts) => new Date(ts).getFullYear() === new Date().getFullYear();

const BRANCHES = [
  { id: "g91", name: "G-9/1", area: "Islamabad", addr: "Karachi Company, G-9/1" },
  { id: "i8", name: "I-8 Markaz", area: "Islamabad", addr: "I-8 Markaz, near Eidgah" },
];
const branchName = (id) => BRANCHES.find((b) => b.id === id)?.name || id;
const menuForBranch = (menu, b) => menu.filter((m) => m.available && (!m.branches || m.branches.includes(b)));

const STAGES = ["new", "preparing", "ready", "completed"];
const STAGE = {
  new:       { k: "New",       c: "Order Received", color: "#FFB22C" },
  preparing: { k: "Preparing", c: "Preparing",      color: "#FF6B2C" },
  ready:     { k: "Ready",     c: "Ready",          color: "#29D3A6" },
  completed: { k: "Done",      c: "Completed",       color: "#9B8CFF" },
};
const ACTIVE = (s) => s !== "completed";
const READY_I = STAGES.indexOf("ready");

const ROLE_META = {
  admin:   { label: "Admin", icon: ShieldCheck, color: "#FF6B2C" },
  manager: { label: "Manager", icon: ClipboardList, color: "#FF8A3C" },
  waiter:  { label: "Waiter", icon: Users, color: "#29D3A6" },
  rider:   { label: "Rider", icon: Bike, color: "#9B8CFF" },
  cashier: { label: "Cashier", icon: Wallet, color: "#5A9CFF" },
  kitchen: { label: "Kitchen Staff", icon: ChefHat, color: "#FFB22C" },
};
// Kitchen staff are payroll-only records (no login / no dashboard).
const NO_LOGIN_ROLES = ["kitchen"];

/* ⚠️ PRODUCTION SWITCH — set to false before going live on your domain.
   true  = shows the tap-to-fill demo account list on the login screen (for demos)
   false = hides it, and staff PINs stay masked everywhere                      */
const DEMO_MODE = true;

/* Staff can reach the sign-in screen by typing any of these paths after the
   domain, e.g. thehunzasizzle.com/admin or /waiter. Customers never see a link
   to them. (Also works: ?staff=1, #staff, or 5 taps on the home-page logo.)
   NOTE: for these to work on a live host, unknown paths must serve index.html —
   see vercel.json in the project root.                                        */
const STAFF_PATHS = ["/admin", "/staff", "/login", "/manager", "/waiter", "/rider", "/cashier", "/kitchen", "/team"];

/* Rejects PINs that are trivial to guess (1234, 0000, 1111 …). A 4-digit PIN has
   only 10,000 combinations, so weak ones are the first an attacker tries. */
const WEAK_PINS = ["0000", "1111", "1212", "1234", "2222", "3333", "4444", "5555", "6666", "7777", "8888", "9999", "123456", "111111", "000000"];
const pinProblem = (pin) => {
  const v = String(pin || "").trim();
  if (v.length < 4) return "PIN must be at least 4 digits.";
  if (WEAK_PINS.includes(v)) return "That PIN is too easy to guess — pick another.";
  if (/^(\d)\1+$/.test(v)) return "Don't repeat the same digit.";
  if (v.length < 6) return null;   // 4-5 digits allowed but 6+ is recommended
  return null;
};

/* ---- Sales tax: I-8 Markaz branch only. Cash/COD 16%, card/online 5% ---- */
const TAX_BRANCH = "i8";
const taxRate = (branch, payMethod) => branch !== TAX_BRANCH ? 0 : (payMethod === "card" ? 0.05 : 0.16);
const taxOf = (branch, payMethod, amount) => Math.round(amount * taxRate(branch, payMethod));

const BOTH = ["g91", "i8"];
const SEED_MENU = [
  { id: "m1", name: "Chicken Chow Mein", price: 1150, em: "🍜", cat: "Chinese", desc: "Wok-tossed noodles with chicken & veggies", badge: "Popular", available: true, branches: BOTH },
  { id: "m2", name: "Beef Manchurian", price: 990, em: "🍲", cat: "Chinese", desc: "Crispy beef in tangy Manchurian sauce", badge: "", available: true, branches: ["g91"] },
  { id: "m3", name: "Chili Garlic Rice", price: 760, em: "🍚", cat: "Chinese", desc: "Fragrant rice with chili & garlic", badge: "Spicy", available: true, branches: BOTH },
  { id: "m4", name: "Egg Fried Rice", price: 620, em: "🍳", cat: "Chinese", desc: "Classic egg fried rice", badge: "", available: true, branches: BOTH },
  { id: "m5", name: "Zinger Burger", price: 690, em: "🍔", cat: "Fast Food", desc: "Crispy zinger fillet, lettuce & mayo", badge: "Popular", available: true, branches: BOTH },
  { id: "m6", name: "Loaded Fries", price: 540, em: "🍟", cat: "Fast Food", desc: "Fries loaded with cheese & sauces", badge: "", available: true, branches: BOTH },
  { id: "m7", name: "Chicken Wings", price: 760, em: "🍗", cat: "Fast Food", desc: "6 pcs hot & saucy wings", badge: "Spicy", available: true, branches: BOTH },
  { id: "m8", name: "Beef Pizza", price: 1290, em: "🍕", cat: "Fast Food", desc: "Loaded beef & cheese, medium", badge: "", available: true, branches: ["i8"] },
  { id: "m9", name: "Pepsi", price: 180, em: "🥤", cat: "Drinks", desc: "Chilled 345ml can", badge: "", available: true, branches: BOTH },
  { id: "m10", name: "Sizzle Duo Deal", price: 1850, em: "🔥", cat: "Deals", desc: "2 burgers + fries + 2 drinks", badge: "Popular", available: true, branches: BOTH },
];

const etaMins = (o) => {
  const left = READY_I - STAGES.indexOf(o.status);
  const units = o.items.reduce((a, b) => a + b.qty, 0);
  const base = o.type === "delivery" ? 14 : 4;
  return Math.max(2, base + left * 3 + Math.ceil(units * 0.8));
};
const total = (o) => o.items.reduce((a, b) => a + b.price * b.qty, 0);
// full amount the customer pays: items + delivery fee + sales tax
const grand = (o) => total(o) + (o.fee || 0) + (o.tax || 0);

const SEED_USERS = [
  { id: "u1", name: "Shahid Ali", username: "admin", pin: "1111", role: "admin", branch: "all", active: true, salary: 0, advances: [] },
  { id: "u2", name: "Usman Tariq", username: "umanager", pin: "1212", role: "manager", branch: "g91", active: true, salary: 90000, advances: [] },
  { id: "u3", name: "Faiz Ahmed", username: "fmanager", pin: "1313", role: "manager", branch: "i8", active: true, salary: 90000, advances: [{ id: "a0", amount: 15000, note: "Eid advance", date: now() - 4 * 864e5 }] },
  { id: "u4", name: "Bilal", username: "bilal", pin: "2222", role: "waiter", branch: "g91", active: true, salary: 45000, advances: [{ id: "a1", amount: 10000, note: "Family emergency", date: now() - 6 * 864e5 }] },
  { id: "u5", name: "Sana", username: "sana", pin: "3333", role: "waiter", branch: "g91", active: true, salary: 45000, advances: [] },
  { id: "u6", name: "Imran", username: "imran", pin: "4444", role: "waiter", branch: "i8", active: true, salary: 45000, advances: [] },
  { id: "u7", name: "Kashif", username: "kashif", pin: "7777", role: "waiter", branch: "i8", active: true, salary: 45000, advances: [] },
  { id: "u8", name: "Rehan", username: "rehan", pin: "5551", role: "rider", branch: "g91", active: true, salary: 38000, advances: [] },
  { id: "u9", name: "Waqas", username: "waqas", pin: "5558", role: "rider", branch: "i8", active: true, salary: 38000, advances: [] },
  { id: "u12", name: "Chef Nadeem", username: "kt-nadeem", pin: "----", role: "kitchen", branch: "g91", active: true, salary: 55000, advances: [] },
  { id: "u13", name: "Chef Saleem", username: "kt-saleem", pin: "----", role: "kitchen", branch: "i8", active: true, salary: 52000, advances: [] },
  { id: "u10", name: "Zain", username: "zain", pin: "6661", role: "cashier", branch: "g91", active: true, salary: 40000, advances: [] },
  { id: "u11", name: "Adnan", username: "adnan", pin: "6668", role: "cashier", branch: "i8", active: true, salary: 40000, advances: [] },
].map((u, i) => {
  if (u.role === "admin") return { ...u, joined: now() - 700 * 864e5, payments: [] };
  const monthsAgo = u.role === "manager" ? 8 : 3 + (i % 3);
  const joined = now() - monthsAgo * 30 * 864e5;
  const all = monthsBetween(joined);
  const paidKeys = all.slice(0, Math.max(0, all.length - 1)); // current month pending
  const payments = paidKeys.map((m) => ({ id: "p" + u.id + m, month: m, amount: u.salary, date: now() }));
  return { ...u, joined, payments };
});
const advTotal = (u) => (u.advances || []).reduce((a, b) => a + b.amount, 0);
const paidMonths = (u) => new Set((u.payments || []).map((p) => p.month));
const salaryPaidTotal = (u) => (u.payments || []).reduce((a, b) => a + b.amount, 0);

let QC = 104;
const seed = [
  { id: "o1", q: 101, branch: "g91", type: "dinein", table: "4", customer: "Ahsan", waiter: "Bilal", source: "waiter",
    items: [{ name: "Chicken Chow Mein", qty: 2, price: 1150 }, { name: "Pepsi", qty: 2, price: 180 }],
    notes: "No spicy", status: "preparing", payment: "unpaid", payMethod: "cod", fee: 0, tax: 0, taxRate: 0, priority: false, createdAt: now() - 14 * 60000 },
  { id: "o2", q: 102, branch: "i8", type: "carhop", vehicle: "ABC-123", spot: "P5", customer: "Ali Khan", waiter: "Imran", source: "car",
    items: [{ name: "Zinger Burger", qty: 1, price: 690 }, { name: "Loaded Fries", qty: 1, price: 540 }],
    notes: "", status: "preparing", payment: "paid", payMethod: "card", fee: 0, tax: 62, taxRate: 0.05, priority: false, createdAt: now() - 8 * 60000 },
  { id: "o3", q: 103, branch: "g91", type: "delivery", address: "House 12, St 4, G-9/2", phone: "0312-1234567", customer: "Hira", waiter: "Rehan", source: "online",
    items: [{ name: "Beef Pizza", qty: 1, price: 1290 }, { name: "Chicken Wings", qty: 1, price: 760 }],
    notes: "Ring the bell", status: "new", payment: "paid", payMethod: "card", fee: 120, tax: 0, taxRate: 0, priority: false, createdAt: now() - 3 * 60000 },
];

// ---- historical (completed) orders so dashboards show real day/week/month/year numbers ----
const HIST_ITEMS = [
  { name: "Chicken Chow Mein", price: 1150 }, { name: "Beef Chow Mein", price: 1250 },
  { name: "Zinger Burger", price: 690 }, { name: "Loaded Fries", price: 540 },
  { name: "Beef Pizza", price: 1290 }, { name: "Chicken Wings", price: 760 },
  { name: "Pepsi", price: 180 }, { name: "Chicken Manchurian", price: 1090 },
  { name: "Chicken Karahi", price: 1650 }, { name: "Spring Rolls", price: 420 },
];
const HIST_STAFF = { g91: { waiters: ["Bilal", "Sana"], riders: ["Rehan"] }, i8: { waiters: ["Imran", "Kashif"], riders: ["Waqas"] } };
const HIST_TYPES = ["dinein", "dinein", "carhop", "takeaway", "delivery", "delivery"];
/* Generates ~120 days of completed demo orders so the dashboard shows realistic
   day / week / month / year figures. In production this data comes from the DB. */
function genHistory() {
  const out = []; let id = 1, q = 100; const rnd = (n) => Math.floor(Math.random() * n);
  for (let d = 1; d <= 120; d++) {
    const base = dayStart(now() - d * DAY);
    const perDay = 4 + rnd(6); // 4..9 orders/day
    for (let k = 0; k < perDay; k++) {
      const branch = rnd(10) < 6 ? "g91" : "i8";
      const type = HIST_TYPES[rnd(HIST_TYPES.length)];
      const st = HIST_STAFF[branch];
      const waiter = type === "delivery" ? st.riders[rnd(st.riders.length)] : st.waiters[rnd(st.waiters.length)];
      const nItems = 1 + rnd(3);
      const items = Array.from({ length: nItems }, () => { const it = HIST_ITEMS[rnd(HIST_ITEMS.length)]; return { name: it.name, price: it.price, qty: 1 + rnd(2) }; });
      const ts = base + (10 + rnd(13)) * 3600000 + rnd(60) * 60000;
      const payMethod = rnd(10) < 4 ? "card" : "cod";
      const fee = type === "delivery" ? 120 : 0;
      const sub = items.reduce((a, b) => a + b.price * b.qty, 0);
      const tax = taxOf(branch, payMethod, sub + fee);
      out.push({ id: "h" + id++, q: q--, branch, type, waiter, source: type === "delivery" ? "online" : type === "carhop" ? "car" : type === "takeaway" ? "online" : "waiter", customer: "Guest", items, notes: "", status: "completed", payment: "paid", payMethod, fee, tax, taxRate: taxRate(branch, payMethod), priority: false, createdAt: ts });
    }
  }
  return out;
}
const HISTORY = genHistory();

// ---- inventory purchases (money spent buying stock = "maal andar aaya") ----
const PURCHASE_ITEMS = [
  { name: "Boneless Chicken", unit: "kg" }, { name: "Beef", unit: "kg" }, { name: "Cooking Oil", unit: "L" },
  { name: "Mozzarella", unit: "kg" }, { name: "Egg Noodles", unit: "packs" }, { name: "Basmati Rice", unit: "kg" },
  { name: "Burger Buns", unit: "pcs" }, { name: "Pepsi Cans", unit: "pcs" },
];
/* Demo stock-purchase records ("money spent buying stock") used by the
   Inventory and Dashboard cost figures. */
function genPurchases() {
  const out = []; let id = 1; const rnd = (n) => Math.floor(Math.random() * n);
  for (let d = 0; d <= 120; d += 2) { // a purchase run every ~2 days
    const base = dayStart(now() - d * DAY) + 9 * 3600000;
    const branch = rnd(2) ? "i8" : "g91";
    const it = PURCHASE_ITEMS[rnd(PURCHASE_ITEMS.length)];
    const qty = 5 + rnd(20);
    const cost = qty * (300 + rnd(700)); // Rs per unit
    out.push({ id: "pu" + id++, branch, item: it.name, unit: it.unit, qty, cost, by: "Admin", date: base });
  }
  return out;
}
const SEED_PURCHASES = genPurchases();

const BASE_INV = [
  { name: "Boneless Chicken", unit: "kg", stock: 4.2, low: 10 },
  { name: "Egg Noodles", unit: "packs", stock: 6, low: 15 },
  { name: "Cooking Oil", unit: "L", stock: 9, low: 12 },
  { name: "Mozzarella", unit: "kg", stock: 2.1, low: 5 },
  { name: "Basmati Rice", unit: "kg", stock: 28, low: 15 },
  { name: "Beef", unit: "kg", stock: 11, low: 8 },
  { name: "Burger Buns", unit: "pcs", stock: 40, low: 30 },
  { name: "Pepsi Cans", unit: "pcs", stock: 18, low: 24 },
];
const SEED_INVENTORY = BRANCHES.flatMap((b, bi) =>
  BASE_INV.map((it, i) => ({ id: `${b.id}-i${i}`, branch: b.id, ...it, stock: +(it.stock * (bi ? 1.6 : 1)).toFixed(1) }))
);
const SEED_REQUESTS = [
  { id: "r1", branch: "g91", item: "Mozzarella", qty: 5, unit: "kg", note: "Running low for pizzas", by: "Kitchen G-9/1", status: "pending", createdAt: now() - 6 * 60000 },
];

/* ==================================================================
   APP ROOT — holds all shared state (orders, staff, menu, inventory,
   purchases, notifications) and passes it down through a single `ctx`
   object. This is a front-end demo: state lives in memory and resets on
   refresh. In production every one of these lists comes from the API.
   ================================================================== */
export default function App() {
  const [dark, setDark] = useState(true);
  const [session, setSession] = useState(null);
  const [page, setPage] = useState("home");
  const [preview, setPreview] = useState(null); // {branch, table} — QR dine-in entry
  const [users, setUsers] = useState(SEED_USERS);
  const [orders, setOrders] = useState([...HISTORY, ...seed]);
  const [inventory, setInventory] = useState(SEED_INVENTORY);
  const [purchases, setPurchases] = useState(SEED_PURCHASES);
  const [requests, setRequests] = useState(SEED_REQUESTS);
  const [menu, setMenu] = useState(SEED_MENU);
  const [branchOpen, setBranchOpen] = useState({ g91: true, i8: true });
  const [toasts, setToasts] = useState([]);
  const [notifs, setNotifs] = useState([]);
  const [tick, setTick] = useState(0);
  const [auto, setAuto] = useState(false);
  const pulse = useRef({});
  const qref = useRef(QC);
  const uref = useRef(11);
  const rref = useRef(1);
  const mref = useRef(10);

  useEffect(() => { const t = setInterval(() => setTick((x) => x + 1), 1000); return () => clearInterval(t); }, []);

  /* On load, work out where the visitor should land:
     - `?b=<branch>&t=<table>` (or `&m=car`) → a scanned QR: open the order page
     - a staff path such as /admin or /waiter → the staff sign-in screen
     - `?staff=1` or `#staff`                 → same staff sign-in screen
     Customers landing on "/" just get the normal home page.                */
  useEffect(() => {
    try {
      const p = new URLSearchParams(window.location.search);
      const b = p.get("b") || p.get("branch");
      if (b && BRANCHES.some((x) => x.id === b)) {
        setPreview({ branch: b, table: p.get("t") || p.get("table") || "", kind: p.get("m") === "car" ? "car" : "dine", spot: p.get("spot") || "" });
        return;
      }
      // Strip any trailing slash so "/admin" and "/admin/" both match.
      const path = window.location.pathname.replace(/\/+$/, "").toLowerCase();
      const isStaffPath = STAFF_PATHS.includes(path);
      if (isStaffPath || p.get("staff") === "1" || window.location.hash.toLowerCase() === "#staff") setPage("staff");
    } catch (e) { /* sandboxed preview — window may be unavailable */ }
  }, []);

  const toast = (msg, color) => {
    const id = Math.random().toString(36).slice(2);
    setToasts((t) => [...t, { id, msg, color }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 3600);
  };
  const flash = (id) => { pulse.current[id] = now(); };

  const activeCount = (w) => orders.filter((o) => o.waiter === w && ACTIVE(o.status)).length;
  // Auto-assignment helpers: find the on-duty team member with the fewest
  // active orders. Staff marked "On leave" (active: false) are skipped.
  const branchWaiters = (b) => users.filter((u) => u.role === "waiter" && u.active && u.branch === b).map((u) => u.name);
  const lightestWaiter = (b) => { const ws = branchWaiters(b); return ws.length ? [...ws].sort((x, y) => activeCount(x) - activeCount(y))[0] : "Unassigned"; };
  const branchRiders = (b) => users.filter((u) => u.role === "rider" && u.active && u.branch === b).map((u) => u.name);
  const lightestRider = (b) => { const ws = branchRiders(b); return ws.length ? [...ws].sort((x, y) => activeCount(x) - activeCount(y))[0] : "Unassigned"; };

  const setStatus = (id, dir) => setOrders((prev) => prev.map((o) => {
    if (o.id !== id) return o;
    const ni = Math.min(STAGES.length - 1, Math.max(0, STAGES.indexOf(o.status) + dir));
    const ns = STAGES[ni];
    if (ns !== o.status) { flash(id); if (ns === "ready") toast(`#${o.q} ready · ${o.waiter}`, STAGE.ready.color); }
    return { ...o, status: ns };
  }));
  const markServed = (id) => setOrders((prev) => prev.map((o) => o.id === id ? (flash(id), { ...o, status: "completed" }) : o));
  const markPreparing = (id) => setOrders((prev) => prev.map((o) => o.id === id && o.status === "new" ? (flash(id), { ...o, status: "preparing" }) : o));

  /* Notifications are addressed to a target: one or more roles, optionally a
     specific person's name and branch. NotifBell filters on these fields. */
  const pushNotif = (target, msg, color) => { const id = Math.random().toString(36).slice(2); setNotifs((p) => [{ id, ...target, msg, color, time: now() }, ...p].slice(0, 60)); toast(msg, color); };
  /* Marking an order ready notifies whoever must act next:
     the assigned rider for deliveries, otherwise the assigned waiter. */
  const markReady = (id) => {
    const o = orders.find((x) => x.id === id); if (!o || o.status === "ready" || o.status === "completed") { setOrders((prev) => prev.map((x) => x.id === id ? { ...x, status: "ready" } : x)); return; }
    setOrders((prev) => prev.map((x) => x.id === id ? { ...x, status: "ready" } : x)); flash(id);
    const del = o.type === "delivery";
    const what = del ? "pick up for delivery" : o.type === "carhop" ? `take to car ${o.vehicle || ""}` : o.type === "takeaway" ? "hand over at counter" : `serve to table ${o.table || ""}`;
    pushNotif({ roles: [del ? "rider" : "waiter"], name: o.waiter, branch: o.branch }, `🔔 ${o.waiter}: Order #${o.q} ready — ${what}`, del ? "#9B8CFF" : "#29D3A6");
  };
  const STEP_MSG = { pickedup: "has picked up your order", onway: "is on the way with your order", reached: "has arrived at your location", delivered: "has delivered your order" };
  /* Advances a delivery through its stages and messages the customer each
     time. The final "delivered" step also completes the order and tells the
     manager and admin. */
  const riderStep = (id, stage) => {
    const o = orders.find((x) => x.id === id); if (!o) return;
    setOrders((prev) => prev.map((x) => x.id === id ? { ...x, deliveryStage: stage, status: stage === "delivered" ? "completed" : x.status, custMsg: `Rider ${o.waiter} ${STEP_MSG[stage]}.` } : x));
    flash(id);
    toast(`🔔 Customer #${o.q}: Rider ${STEP_MSG[stage]}.`, "#5A9CFF");
    if (stage === "delivered") pushNotif({ roles: ["manager", "admin"], branch: o.branch }, `🔔 Order #${o.q} delivered by ${o.waiter} (${branchName(o.branch)})`, "#29D3A6");
  };
  const cancel = (id) => setOrders((prev) => prev.filter((o) => o.id !== id));
  const togglePriority = (id) => setOrders((prev) => prev.map((o) => o.id === id ? { ...o, priority: !o.priority } : o));
  const setPaid = (id) => setOrders((prev) => prev.map((o) => o.id === id ? { ...o, payment: "paid" } : o));

  /* Creates an order and routes it automatically:
     delivery → the branch's least-busy rider; everything else → its least-busy
     waiter. Orders start at "new" and wait for the counter to print them. */
  const addOrder = (partial) => {
    const q = ++qref.current;
    let waiter = partial.waiter;
    if (partial.type === "delivery") waiter = lightestRider(partial.branch);
    else if (partial.source === "qr" || partial.source === "online" || partial.source === "car") waiter = lightestWaiter(partial.branch);
    const o = { id: "o" + q, q, status: "new", payment: partial.payment || "unpaid",
      priority: false, createdAt: now(), notes: "", ...partial, waiter };
    /* Orders taken by a waiter at the counter don't pass fee/tax, so work them
       out here. This keeps sales tax consistent no matter how the order arrived. */
    if (o.fee == null) o.fee = o.type === "delivery" ? 120 : 0;
    if (o.tax == null) {
      const method = o.payMethod || (o.payment === "paid" ? "card" : "cod");
      o.payMethod = method;
      o.taxRate = taxRate(o.branch, method);
      o.tax = taxOf(o.branch, method, o.items.reduce((a, b) => a + b.price * b.qty, 0) + o.fee);
    }
    setOrders((prev) => [...prev, o]);
    flash(o.id);
    const where = branchName(partial.branch);
    if (partial.type === "delivery") toast(`Delivery #${q} → ${where} · Rider ${waiter}`, "#9B8CFF");
    else if (partial.source === "online") toast(`Online #${q} → ${where} · ${waiter}`, "#29D3A6");
    else if (partial.source === "car") toast(`Curbside #${q} → ${where} · ${waiter}`, "#29D3A6");
    else if (partial.source === "qr") toast(`#${q} → ${waiter} (${where}, lightest load)`, "#29D3A6");
    else toast(`Order #${q} → ${where} · print at counter`, "#FF6B2C");
    return o;
  };

  const addUser = (u) => { const id = "u" + (++uref.current); setUsers((p) => [...p, { id, active: true, salary: u.salary || 0, advances: [], joined: now(), payments: [], ...u }]); toast(`User created · ${u.name}`, ROLE_META[u.role].color); };
  const toggleUser = (id) => setUsers((p) => p.map((u) => u.id === id ? { ...u, active: !u.active } : u));
  const deleteUser = (id) => { const u = users.find((x) => x.id === id); setUsers((p) => p.filter((x) => x.id !== id)); toast(`Staff removed · ${u?.name || ""}`, "#FF5470"); };
  /* Every edit records who made it and when, so lists can show
     "Edited by <name> · <time>" — a simple audit trail for the owner. */
  const stamp = () => ({ editedBy: session ? session.name : "System", editedAt: now() });
  const updateUser = (id, patch) => {
    // Usernames must stay unique, otherwise two people could sign in as one account.
    if (patch.username && users.some((u) => u.id !== id && u.username.toLowerCase() === patch.username.toLowerCase())) {
      toast(`Username "${patch.username}" is already taken`, "#FF5470"); return false;
    }
    setUsers((p) => p.map((u) => u.id === id ? { ...u, ...patch, ...stamp() } : u));
    toast(`Staff updated · ${patch.name || ""}`, "#5A9CFF");
    return true;
  };
  const setSalary = (id, amount) => { setUsers((p) => p.map((u) => u.id === id ? { ...u, salary: amount } : u)); toast(`Salary set · ${rs(amount)}`, "#5A9CFF"); };
  const addAdvance = (id, amount, note) => { setUsers((p) => p.map((u) => u.id === id ? { ...u, advances: [...(u.advances || []), { id: "a" + now(), amount, note, date: now() }] } : u)); const u = users.find((x) => x.id === id); toast(`Advance ${rs(amount)} → ${u?.name}`, "#FFB22C"); };
  const paySalary = (id, month, amount) => { const u = users.find((x) => x.id === id); if (!u) return; setUsers((p) => p.map((x) => x.id === id ? { ...x, payments: [...(x.payments || []).filter((q) => q.month !== month), { id: "p" + now(), month, amount, date: now() }] } : x)); toast(`Paid ${monthLong(month)} salary · ${u.name} (${rs(amount)})`, "#29D3A6"); };
  const unpaySalary = (id, month) => { const u = users.find((x) => x.id === id); setUsers((p) => p.map((x) => x.id === id ? { ...x, payments: (x.payments || []).filter((q) => q.month !== month) } : x)); toast(`${monthLong(month)} marked unpaid · ${u?.name}`, "#FF5470"); };

  const addStock = (id, qty) => setInventory((p) => p.map((it) => it.id === id ? { ...it, stock: +(it.stock + qty).toFixed(1) } : it));
  const updateInventory = (id, patch) => { setInventory((p) => p.map((it) => it.id === id ? { ...it, ...patch, ...stamp() } : it)); toast(`Item updated · ${patch.name || ""}`, "#5A9CFF"); };
  const deleteInventory = (id) => { const it = inventory.find((x) => x.id === id); setInventory((p) => p.filter((x) => x.id !== id)); toast(`Item removed · ${it?.name || ""}`, "#FF5470"); };
  // create-or-add by free-text name (no fixed list)
  const restock = (branch, name, unit, qty, low) => setInventory((p) => {
    const i = p.findIndex((x) => x.branch === branch && x.name.toLowerCase() === name.trim().toLowerCase());
    if (i >= 0) { const c = [...p]; c[i] = { ...c[i], stock: +(c[i].stock + qty).toFixed(1) }; return c; }
    return [...p, { id: branch + "-x" + now(), branch, name: name.trim(), unit: unit || "units", stock: qty, low: low || Math.max(1, Math.round(qty * 0.4)) }];
  });
  // Adds stock AND records what was paid, so the dashboard can show cost.
  const buyStock = (branch, name, unit, qty, cost, by) => {
    restock(branch, name, unit, qty);
    setPurchases((p) => [{ id: "pu" + now(), branch, item: name.trim(), unit: unit || "units", qty, cost: cost || 0, by: by || "Staff", date: now() }, ...p]);
    toast(`Stock in: +${qty} ${unit || "units"} ${name.trim()}${cost ? " · " + rs(cost) : ""} (${branchName(branch)})`, "#29D3A6");
  };
  const addRequest = (req) => { const id = "r" + (++rref.current); setRequests((p) => [{ id, status: "pending", createdAt: now(), ...req }, ...p]); toast(`Stock request → admin: ${req.qty} ${req.unit} ${req.item}`, "#FFB22C"); };
  const fulfillRequest = (id) => { const r = requests.find((x) => x.id === id); if (!r || r.status !== "pending") return; restock(r.branch, r.item, r.unit, r.qty); setRequests((p) => p.map((x) => x.id === id ? { ...x, status: "fulfilled" } : x)); toast(`Restocked: +${r.qty} ${r.unit} ${r.item} (${branchName(r.branch)})`, "#29D3A6"); };
  const rejectRequest = (id) => setRequests((p) => p.map((x) => x.id === id ? { ...x, status: "rejected" } : x));

  const addMenuItem = (item) => { const id = "m" + (++mref.current); setMenu((p) => [...p, { id, available: true, em: "🍽️", badge: "", desc: "", branches: ["g91", "i8"], ...item }]); toast(`Menu item added · ${item.name}`, "#FF6B2C"); };
  const toggleMenuItem = (id) => setMenu((p) => p.map((m) => m.id === id ? { ...m, available: !m.available } : m));
  const toggleMenuBranch = (id, b) => setMenu((p) => p.map((m) => { if (m.id !== id) return m; const has = m.branches.includes(b); const branches = has ? m.branches.filter((x) => x !== b) : [...m.branches, b]; return { ...m, branches: branches.length ? branches : m.branches }; }));
  const deleteMenuItem = (id) => { const m = menu.find((x) => x.id === id); setMenu((p) => p.filter((x) => x.id !== id)); toast(`Menu item deleted · ${m?.name || ""}`, "#FF5470"); };
  const updateMenuItem = (id, patch) => { setMenu((p) => p.map((m) => m.id === id ? { ...m, ...patch, ...stamp() } : m)); toast(`Menu item updated · ${patch.name || ""}`, "#5A9CFF"); };
  // Opening/closing a branch instantly controls whether customers can order.
  const toggleBranch = (id) => { setBranchOpen((p) => ({ ...p, [id]: !p[id] })); toast(`${branchName(id)} is now ${branchOpen[id] ? "CLOSED" : "OPEN"}`, branchOpen[id] ? "#FF5470" : "#29D3A6"); };

  useEffect(() => {
    if (!auto) return;
    const t = setInterval(() => setOrders((prev) => {
      const a = prev.filter((o) => ACTIVE(o.status) && STAGES.indexOf(o.status) < READY_I);
      if (!a.length) return prev;
      a.sort((x, y) => STAGES.indexOf(y.status) - STAGES.indexOf(x.status));
      const tgt = a[0]; const ns = STAGES[STAGES.indexOf(tgt.status) + 1];
      flash(tgt.id);
      if (ns === "ready") setTimeout(() => toast(`#${tgt.q} ready · ${tgt.waiter}`, STAGE.ready.color), 0);
      return prev.map((o) => o.id === tgt.id ? { ...o, status: ns } : o);
    }), 3200);
    return () => clearInterval(t);
  }, [auto]);

  const queue = useMemo(() => {
    const a = orders.filter((o) => ACTIVE(o.status));
    a.sort((x, y) => (y.priority - x.priority) || (x.createdAt - y.createdAt));
    const m = {}; a.forEach((o, i) => (m[o.id] = i + 1)); return m;
  }, [orders]);

  const ctx = { orders, queue, users, inventory, requests, menu, branchWaiters, lightestWaiter, branchRiders, lightestRider, activeCount,
    setStatus, markServed, markPreparing, markReady, riderStep, notifs, cancel, togglePriority, setPaid, addOrder, addUser, toggleUser, deleteUser,
    setSalary, addAdvance, paySalary, unpaySalary, addStock, restock, buyStock, purchases, addRequest, fulfillRequest, rejectRequest,
    addMenuItem, toggleMenuItem, toggleMenuBranch, deleteMenuItem, updateMenuItem, updateUser, updateInventory, deleteInventory, branchOpen, toggleBranch,
    pulse: pulse.current, auto, setAuto, toast };

  /* Keep the address bar in step with the screen, so a staff member who opened
     /admin still sees /admin after a refresh, and customers stay on "/". */
  useEffect(() => {
    try {
      if (preview) return;                                  // QR links keep their own URL
      const path = window.location.pathname.replace(/\/+$/, "").toLowerCase();
      if (page === "staff" && !STAFF_PATHS.includes(path)) window.history.replaceState({}, "", "/admin");
      if (page !== "staff" && STAFF_PATHS.includes(path) && !session) window.history.replaceState({}, "", "/");
    } catch (e) { /* sandboxed preview */ }
  }, [page, session, preview]);

  const staffRoles = ["admin", "manager", "waiter", "rider", "cashier"];
  const staffIn = session && staffRoles.includes(session.role);
  const logout = () => { setSession(null); setPage("home"); };

  /* Auto sign-out after 20 minutes of no activity. Staff often share a counter
     tablet, so an unattended session is a real risk. */
  useEffect(() => {
    if (!session) return;
    let last = now();
    const bump = () => { last = now(); };
    const events = ["click", "keydown", "touchstart", "mousemove"];
    events.forEach((e) => window.addEventListener(e, bump, { passive: true }));
    const timer = window.setTimeout(function tickIdle() {
      if (now() - last > 20 * 60000) { logout(); toast("Signed out after 20 minutes of inactivity", "#FFB22C"); }
      else window.setTimeout(tickIdle, 30000);
    }, 30000);
    return () => { events.forEach((e) => window.removeEventListener(e, bump)); window.clearTimeout(timer); };
  }, [session]);

  // QR scan / preview → customer dine-in order, full screen
  if (preview) {
    return (
      <div className="hz" data-theme={dark ? "dark" : "light"}><style>{CSS}</style>
        <OrderFlow ctx={ctx} dark={dark} setDark={setDark} entry={preview}
          onHome={() => { setPreview(null); if (!staffIn) setPage("home"); }} onStaff={() => { setPreview(null); setPage("staff"); }} />
        <Toasts toasts={toasts} />
      </div>
    );
  }

  if (!staffIn) {
    return (
      <div className="hz" data-theme={dark ? "dark" : "light"}><style>{CSS}</style>
        {page === "order"
          ? <OrderFlow ctx={ctx} dark={dark} setDark={setDark} onHome={() => setPage("home")} onStaff={() => setPage("staff")} />
          : page === "staff"
            ? <Login onLogin={setSession} dark={dark} setDark={setDark} users={users} onHome={() => setPage("home")} onOrder={() => setPage("order")} />
            : <HomePage menu={menu} dark={dark} setDark={setDark} branchOpen={branchOpen} onOrder={() => setPage("order")} onStaff={() => setPage("staff")} />}
        <Toasts toasts={toasts} />
      </div>
    );
  }

  const rm = { label: session.name, sub: ROLE_META[session.role].label + (session.branch !== "all" ? " · " + branchName(session.branch) : " · all branches"), icon: ROLE_META[session.role].icon };

  return (
    <div className="hz" data-theme={dark ? "dark" : "light"}><style>{CSS}</style>
      <header className="hz-bar">
        <div className="hz-brand">
          <div className="hz-logo"><Flame size={18} /></div>
          <div><div className="hz-bn">The Hunza <span>Sizzle</span></div><div className="hz-bs">{rm.sub}</div></div>
        </div>
        <div className="hz-ident"><span className="hz-ident-ic"><rm.icon size={14} /></span>{rm.label}</div>
        <div className="hz-bar-r">
          <NotifBell notifs={ctx.notifs} session={session} />
          {(session.role === "manager" || session.role === "admin") && (
            <button className={"hz-ctl" + (auto ? " on" : "")} onClick={() => setAuto((v) => !v)}>
              {auto ? <Pause size={14} /> : <Play size={14} />}{auto ? "Pause" : "Auto-flow"}
            </button>
          )}
          <button className="hz-icbtn" onClick={() => setDark((v) => !v)}>{dark ? <Sun size={16} /> : <Moon size={16} />}</button>
          <button className="hz-ctl" onClick={logout}><LogOut size={14} />Logout</button>
        </div>
      </header>

      <main className="hz-screen" key={session.role + (session.branch || "")}>
        {(session.role === "admin" || session.role === "manager") && <Manager ctx={ctx} isAdmin={session.role === "admin"} myBranch={session.branch} onPreview={(b, opts) => setPreview({ branch: b, table: opts?.table || "", kind: opts?.kind || "dine", spot: opts?.spot || "" })} />}
        {session.role === "waiter" && <Waiter ctx={ctx} me={session.name} branch={session.branch} />}
        {session.role === "rider" && <Rider ctx={ctx} me={session.name} branch={session.branch} />}
        {session.role === "cashier" && <Cashier ctx={ctx} branch={session.branch} />}
      </main>
      <Toasts toasts={toasts} />
    </div>
  );
}

/* ----------------------------- Home page -------------------------- */
/* ------------------------- Public home page -----------------------
   Everything a customer sees. There is deliberately NO visible link to
   the staff login here — staff reach it via `?staff=1` / `#staff`, or by
   tapping the logo 5 times (a quiet shortcut for the team).          */
function HomePage({ menu, dark, setDark, branchOpen, onOrder, onStaff }) {
  // Hidden staff shortcut: 5 quick taps on the logo opens the staff login.
  const taps = useRef({ n: 0, t: 0 });
  const secretTap = () => {
    const t = now();
    taps.current = { n: t - taps.current.t < 900 ? taps.current.n + 1 : 1, t };
    if (taps.current.n >= 5) { taps.current = { n: 0, t: 0 }; onStaff(); }
  };
  const popular = menu.filter((m) => m.available && (m.badge === "Popular" || m.badge === "Spicy")).slice(0, 4);
  const feats = [
    { icon: Bike, t: "Fast delivery", s: "~30 min to your door" },
    { icon: Flame, t: "Wok-fired fresh", s: "Cooked to order, never sitting" },
    { icon: Building2, t: "Two branches", s: "G-9/1 & I-8 Markaz" },
  ];
  return (
    <div className="hz-home">
      <header className="hz-hnav">
        {/* Logo doubles as the hidden staff entry (5 taps) — looks like plain branding. */}
        <div className="hz-brand" onClick={secretTap} title="The Hunza Sizzle"><div className="hz-logo"><Flame size={18} /></div><div className="hz-bn">The Hunza <span>Sizzle</span></div></div>
        <nav className="hz-hnav-links">
          <button className="hz-hlink active" onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })}><Home size={14} />Home</button>
          <button className="hz-hlink" onClick={onOrder}><ShoppingBag size={14} />Order Online</button>
          <button className="hz-icbtn" onClick={() => setDark((v) => !v)}>{dark ? <Sun size={16} /> : <Moon size={16} />}</button>
        </nav>
      </header>

      <section className="hz-hhero">
        <div className="hz-hhero-bg" />
        <div className="hz-embers" aria-hidden="true">{Array.from({ length: 14 }).map((_, i) => { const sz = 4 + (i % 4) * 3; return <span key={i} className="hz-ember" style={{ left: (7 + i * 6.5) + "%", width: sz + "px", height: sz + "px", animationDuration: (7 + (i % 5) * 2.2) + "s", animationDelay: (i * 0.8) + "s" }} />; })}</div>
        <div className="hz-hhero-in">
          <span className="hz-obadge">🔥 Chinese & Fast Food · Islamabad</span>
          <h1>Eat fresh,<br /><span>stay healthy.</span></h1>
          <p>Made daily with fresh ingredients — from smoky chow mein to crispy zingers. Order online (delivery or pickup), or curbside — everything fresh and fast.</p>
          <div className="hz-hcta">
            <button className="hz-cta lg" onClick={onOrder}><ShoppingBag size={17} />Order Online<ArrowRight size={16} /></button>
          </div>
          <div className="hz-hstats"><div><b>2</b><span>Branches</span></div><div><b>{menu.length}+</b><span>Dishes</span></div><div><b>~30<small>m</small></b><span>Delivery</span></div></div>
        </div>
        <div className="hz-hhero-art"><span>🍜</span><span>🍔</span><span>🍕</span><span>🍗</span><span>🍟</span></div>
      </section>

      <section className="hz-hsec">
        <div className="hz-hfeats">{feats.map((f, i) => (
          <div className="hz-hfeat" key={i}><span className="hz-hfeat-ic"><f.icon size={20} /></span><div><b>{f.t}</b><span>{f.s}</span></div></div>
        ))}</div>
      </section>

      {popular.length > 0 && (
        <section className="hz-hsec">
          <div className="hz-hsec-h"><div><span className="hz-eyebrow">Crowd favourites</span><h2>Popular right now</h2></div><button className="hz-ghost" onClick={onOrder}>See full menu<ChevronRight size={15} /></button></div>
          <div className="hz-hmenu">{popular.map((it) => (
            <div className="hz-fcard" key={it.id} onClick={onOrder}>
              <div className="hz-fcard-img">{it.img ? <img src={it.img} alt={it.name} /> : <span className="hz-fcard-em">{it.em}</span>}{it.badge && <span className={"hz-fbadge " + (it.badge === "Spicy" ? "spicy" : "pop")}>{it.badge}</span>}</div>
              <div className="hz-fcard-b"><div className="hz-fcard-n">{it.name}</div>{it.desc && <div className="hz-fcard-d">{it.desc}</div>}
                {it.branches && it.branches.length === 1 && <div className="hz-onlyat"><MapPin size={11} />Only at {branchName(it.branches[0])}</div>}
                <div className="hz-fcard-foot"><span className="hz-fcard-p">{rs(it.price)}</span><span className="hz-addbtn2"><Plus size={15} /></span></div></div>
            </div>
          ))}</div>
        </section>
      )}

      <section className="hz-hsec">
        <div className="hz-hsec-h"><div><span className="hz-eyebrow">Find us</span><h2>Our branches</h2></div></div>
        <div className="hz-hbranches">{BRANCHES.map((b) => { const open = branchOpen?.[b.id] !== false; return (
          <div className={"hz-hbranch" + (open ? "" : " closed")} key={b.id}>
            <div className="hz-hbranch-top"><span className="hz-branch-ic"><Building2 size={20} /></span><span className={open ? "hz-openpill" : "hz-closedpill"}>{open ? "Open now" : "Closed"}</span></div>
            <b>The Hunza Sizzle · {b.name}</b>
            <span className="hz-hbranch-addr"><MapPin size={12} />{b.addr}</span>
            <span className="hz-hbranch-addr"><Clock size={12} />11:00 AM – 2:00 AM daily</span>
            <button className="hz-cta sm" disabled={!open} onClick={onOrder}>{open ? `Order from ${b.name}` : "Currently closed"}{open && <ArrowRight size={14} />}</button>
          </div>
        ); })}</div>
      </section>

      <section className="hz-hband">
        <div className="hz-hband-in"><div><h2>Hungry already?</h2><p>Delivery, pickup, or curbside — your sizzle is minutes away.</p></div><button className="hz-cta lg" onClick={onOrder}><ShoppingBag size={17} />Start your order<ArrowRight size={16} /></button></div>
      </section>

      <footer className="hz-hfoot">
        <div className="hz-brand"><div className="hz-logo"><Flame size={16} /></div><div className="hz-bn">The Hunza <span>Sizzle</span></div></div>
        <span>G-9/1 · I-8 Markaz, Islamabad · © {new Date().getFullYear()} The Hunza Sizzle</span>
      </footer>
    </div>
  );
}

/* ----------------------------- Login ------------------------------ */
/* Staff sign-in screen. Reached only via `?staff=1`, `#staff`, or the hidden
   5-tap logo shortcut — it is never linked from the customer-facing pages.
   Kitchen staff are payroll-only records, so they are rejected here. */
function Login({ onLogin, dark, setDark, users, onHome, onOrder }) {
  const [u, setU] = useState(""); const [p, setP] = useState(""); const [err, setErr] = useState("");
  const [tries, setTries] = useState(0); const [lockUntil, setLockUntil] = useState(0);
  /* Brute-force protection: a 4-digit PIN can otherwise be guessed in seconds.
     After 5 wrong attempts the form locks for 60 seconds.
     NOTE: this only slows an attacker down — real rate limiting must live on the
     server, because anything in the browser can be bypassed. */
  const signIn = () => {
    if (lockUntil > now()) { setErr(`Too many attempts. Try again in ${Math.ceil((lockUntil - now()) / 1000)}s.`); return; }
    const f = users.find((x) => x.username.toLowerCase() === u.trim().toLowerCase() && x.pin === p.trim() && x.active);
    if (!f) {
      const n = tries + 1; setTries(n);
      if (n >= 5) { setLockUntil(now() + 60000); setTries(0); setErr("Too many failed attempts. Locked for 60 seconds."); }
      else setErr(`Wrong username/PIN, or the account is inactive. (${5 - n} attempts left)`);
      return;
    }
    if (NO_LOGIN_ROLES.includes(f.role)) { setErr("Kitchen staff accounts are payroll-only (no login)."); return; }
    setTries(0);
    onLogin({ role: f.role, name: f.name, userId: f.id, branch: f.branch });
  };
  return (
    <div className="hz-login">
      <div className="hz-embers" aria-hidden="true">
        {Array.from({ length: 16 }).map((_, i) => { const sz = 4 + (i % 4) * 3; return (
          <span key={i} className="hz-ember" style={{ left: (6 + i * 6) + "%", width: sz + "px", height: sz + "px", animationDuration: (7 + (i % 5) * 2.2) + "s", animationDelay: (i * 0.7) + "s" }} />
        ); })}
      </div>
      <div className="hz-login-top">
        <button className="hz-oback" onClick={onHome}><ChevronLeft size={18} /></button>
        <button className="hz-icbtn" onClick={() => setDark((v) => !v)}>{dark ? <Sun size={16} /> : <Moon size={16} />}</button>
      </div>
      <div className="hz-login-brand">
        <div className="hz-logo lg"><Flame size={26} /></div>
        <div className="hz-bn lg">The Hunza <span>Sizzle</span></div>
        <div className="hz-login-sub">Staff Login · G-9/1 · I-8 Markaz</div>
      </div>

      <div className="hz-loginbox">
        <div className="hz-loginbox-h"><ShieldCheck size={15} />Staff only</div>
        <div className="hz-form">
          <label><span><User size={12} /> Username</span><input value={u} onChange={(e) => { setU(e.target.value); setErr(""); }} placeholder="e.g. bilal" /></label>
          <label><span><KeyRound size={12} /> PIN</span><input type="password" value={p} onChange={(e) => { setP(e.target.value); setErr(""); }} placeholder="••••" /></label>
          {err && <div className="hz-err"><CircleAlert size={13} />{err}</div>}
          <button className="hz-cta" disabled={!u || !p || lockUntil > now()} onClick={signIn}>{lockUntil > now() ? "Locked" : "Sign in"}<ArrowRight size={15} /></button>
          {DEMO_MODE && <div className="hz-demohint"><b>Demo accounts (tap to fill)</b>
            <div className="hz-demolist">
              {users.filter((x) => x.active && !NO_LOGIN_ROLES.includes(x.role)).map((x) => (
                <button key={x.id} className="hz-demorow" onClick={() => { setU(x.username); setP(x.pin); setErr(""); }}>
                  <span className="hz-demobadge" style={{ color: ROLE_META[x.role].color, background: ROLE_META[x.role].color + "1e" }}>{ROLE_META[x.role].label}</span>
                  {x.username} · {x.pin}<span className="hz-demobr">{x.branch === "all" ? "both" : branchName(x.branch)}</span>
                </button>
              ))}
            </div>
          </div>}
        </div>
      </div>
      <button className="hz-onlinecta" onClick={onOrder}>
        <span className="hz-onlinecta-ic"><ShoppingBag size={20} /></span>
        <div><b>Just want food?</b><span>Order online — delivery, pickup or car</span></div>
        <ArrowRight size={18} />
      </button>
    </div>
  );
}

/* --------------------------- helpers ------------------------------ */
function typeMeta(o) {
  if (o.type === "carhop") return { icon: Car, label: `Car ${o.vehicle} · ${o.spot}` };
  if (o.type === "takeaway") return { icon: ShoppingBag, label: "Pickup" };
  if (o.type === "delivery") return { icon: Truck, label: o.address ? o.address.split(",")[0] : "Delivery" };
  return { icon: Store, label: `Table ${o.table}` };
}
const flashing = (ctx, id) => now() - (ctx.pulse[id] || 0) < 1100;
function Badge({ s, sm }) { const m = STAGE[s]; return <span className={"hz-badge" + (sm ? " sm" : "")} style={{ color: m.color, background: m.color + "1e" }}>{m.k}</span>; }
function BranchTag({ b }) { return <span className="hz-brtag"><Building2 size={10} />{branchName(b)}</span>; }
function Head({ title, sub, right }) { return <div className="hz-head"><div><h1>{title}</h1><p>{sub}</p></div>{right}</div>; }
function Empty({ text }) { return <div className="hz-emptybox"><CircleAlert size={18} />{text}</div>; }
function Toasts({ toasts }) {
  return <div className="hz-toasts">{toasts.map((t) => (
    <div className="hz-toast" key={t.id}><span className="hz-toast-ic" style={{ background: t.color + "22", color: t.color }}><Bell size={14} /></span>{t.msg}</div>
  ))}</div>;
}
const ago = (ms) => { const s = Math.floor((now() - ms) / 1000); if (s < 60) return "just now"; const m = Math.floor(s / 60); if (m < 60) return m + "m ago"; const h = Math.floor(m / 60); return h + "h ago"; };
/* Bell in the staff header. Shows only the notifications addressed to this
   person: matching role, and (when set) matching name and branch. */
function NotifBell({ notifs, session }) {
  const [open, setOpen] = useState(false);
  const [seen, setSeen] = useState(now());
  const mine = (notifs || []).filter((n) => n.roles?.includes(session.role)
    && (n.name ? n.name === session.name : true)
    && (n.branch ? (n.branch === "all" || session.branch === "all" || n.branch === session.branch) : true));
  const unread = mine.filter((n) => n.time > seen).length;
  return (
    <div className="hz-bellwrap">
      <button className={"hz-icbtn" + (unread ? " hasnew" : "")} onClick={() => { setOpen((v) => !v); if (!open) setSeen(now()); }}>
        <Bell size={16} />{unread > 0 && <span className="hz-belldot">{unread}</span>}
      </button>
      {open && (
        <div className="hz-bellpanel">
          <div className="hz-bellpanel-h"><b>Notifications</b><button onClick={() => setOpen(false)}><X size={14} /></button></div>
          {mine.length === 0 && <div className="hz-bellempty">No notifications yet.</div>}
          {mine.slice(0, 20).map((n) => (
            <div className="hz-bellrow" key={n.id}><span className="hz-belldotc" style={{ background: n.color || "var(--ember)" }} /><div><div className="hz-bellmsg">{n.msg.replace(/^🔔\s*/, "")}</div><div className="hz-belltime">{ago(n.time)}</div></div></div>
          ))}
        </div>
      )}
    </div>
  );
}
/* Shows "Edited by <name> · <when>" under a row that has been changed.
   Renders nothing for records nobody has edited yet. */
function EditedBy({ item }) {
  if (!item || !item.editedBy) return null;
  return <span className="hz-editedby"><Pencil size={10} />Edited by {item.editedBy} · {ago(item.editedAt)}</span>;
}
/* A small "i" button that keeps explanatory text out of the way.
   The note only appears when the user taps the icon, so screens stay clean.
   Usage: <InfoTip>Some helpful explanation…</InfoTip>                      */
function InfoTip({ children, icon: Icon = Info, label }) {
  const [open, setOpen] = useState(false);
  return (
    <span className="hz-infowrap">
      <button className={"hz-infobtn" + (open ? " on" : "")} onClick={() => setOpen((v) => !v)} aria-label={label || "More information"} title={label || "More information"}>
        <Icon size={13} />
      </button>
      {open && (
        <span className="hz-infopop">
          <button className="hz-infoclose" onClick={() => setOpen(false)} aria-label="Close"><X size={12} /></button>
          <span className="hz-infotext">{children}</span>
        </span>
      )}
    </span>
  );
}
function Kpi({ icon: Icon, label, val, c }) {
  return <div className="hz-kpi"><span className="hz-kpi-ic" style={{ color: c, background: c + "1e" }}><Icon size={17} /></span><div className="hz-kpi-v">{val}</div><div className="hz-kpi-l">{label}</div></div>;
}
/* Small daily-performance strip for a waiter or rider:
   today's orders, currently active, today's sales, and yesterday's count. */
function MyDay({ ctx, me }) {
  const mine = ctx.orders.filter((o) => o.waiter === me && o.status !== "cancelled");
  const todayH = mine.filter((o) => isToday(o.createdAt));
  const ydayH = mine.filter((o) => isYesterday(o.createdAt)).length;
  const active = mine.filter((o) => ACTIVE(o.status)).length;
  const todaySales = todayH.reduce((a, b) => a + grand(b), 0);
  const cells = [["Today orders", todayH.length, "#FF6B2C"], ["Active now", active, "#FFB22C"], ["Today sales", rs(todaySales), "#29D3A6"], ["Yesterday", ydayH, "#9B8CFF"]];
  return <div className="hz-myday">{cells.map(([l, v, c]) => <div className="hz-md" key={l}><b style={{ color: c }}>{v}</b><span>{l}</span></div>)}</div>;
}
function BranchSwitch({ value, onChange, includeAll }) {
  return (
    <div className="hz-brswitch">
      {includeAll && <button className={value === "all" ? "on" : ""} onClick={() => onChange("all")}>Both</button>}
      {BRANCHES.map((b) => <button key={b.id} className={value === b.id ? "on" : ""} onClick={() => onChange(b.id)}>{b.name}</button>)}
    </div>
  );
}

/* --------------------------- Waiter ------------------------------- */
/* Waiter dashboard — dine-in, curbside and pickup orders assigned to them.
   Delivery orders are excluded; those belong to riders. */
function Waiter({ ctx, me, branch }) {
  const [tab, setTab] = useState("orders");
  const mine = ctx.orders.filter((o) => o.waiter === me && o.type !== "delivery" && ACTIVE(o.status));
  mine.sort((a, b) => (STAGES.indexOf(b.status) - STAGES.indexOf(a.status)));
  const ready = mine.filter((o) => o.status === "ready").length;
  return (
    <div className="hz-wrap narrow">
      <Head title={`Hi, ${me}`} sub={`${branchName(branch)} · ${mine.length} active · ${ready} ready`} />
      <MyDay ctx={ctx} me={me} />
      <div className="hz-segt">
        <button className={tab === "orders" ? "on" : ""} onClick={() => setTab("orders")}>My Orders {mine.length > 0 && <em>{mine.length}</em>}</button>
        <button className={tab === "new" ? "on" : ""} onClick={() => setTab("new")}>Take Order</button>
      </div>
      {tab === "orders" ? (
        <div className="hz-stack">
          {mine.length === 0 && <Empty text="No active orders. New QR / online / curbside orders auto-arrive here." />}
          {mine.map((o) => {
            const T = typeMeta(o); const isReady = o.status === "ready";
            const dlabel = o.type === "carhop" ? "Deliver to CAR" : o.type === "takeaway" ? "Pickup counter" : "Serve at TABLE";
            const dval = o.type === "carhop" ? `${o.vehicle} · ${o.spot}` : o.type === "takeaway" ? "—" : o.table;
            return (
              <div className={"hz-worder" + (flashing(ctx, o.id) ? " flash" : "") + (isReady ? " ready" : "")} key={o.id}>
                <div className="hz-trow"><span className="hz-tq"><Hash size={12} />{o.q}</span><Badge s={o.status} />{(o.source === "qr" || o.source === "online" || o.source === "car") && <span className="hz-srctag">{o.source} · auto</span>}</div>
                <div className="hz-deliverto"><T.icon size={14} /><span>{dlabel}</span><b>{dval}</b></div>
                <div className="hz-witems">{o.items.map((i) => `${i.qty}× ${i.name}`).join(" · ")}{o.notes && <em> · “{o.notes}”</em>}</div>
                {isReady
                  ? <button className="hz-deliverbtn" onClick={() => ctx.markServed(o.id)}>{o.type === "carhop" ? <Car size={15} /> : <MapPin size={15} />}{o.type === "carhop" ? "Delivered to car" : o.type === "takeaway" ? "Handed over" : "Served to table"}</button>
                  : <div className="hz-wstatusnote"><Clock size={13} />Preparing… ETA {etaMins(o)}m</div>}
              </div>
            );
          })}
        </div>
      ) : <TakeOrder ctx={ctx} me={me} branch={branch} onDone={() => setTab("orders")} />}
    </div>
  );
}
/* --------------------------- Rider -------------------------------- */
/* Rider dashboard — delivery orders only, with the customer's address and
   phone, and the step-by-step delivery buttons. */
function Rider({ ctx, me, branch }) {
  const mine = ctx.orders.filter((o) => o.waiter === me && o.type === "delivery" && ACTIVE(o.status));
  mine.sort((a, b) => (STAGES.indexOf(b.status) - STAGES.indexOf(a.status)));
  const ready = mine.filter((o) => o.status === "ready").length;
  return (
    <div className="hz-wrap narrow">
      <Head title={`Hi, ${me}`} sub={`Rider · ${branchName(branch)} · ${mine.length} active · ${ready} ready to go`} />
      <MyDay ctx={ctx} me={me} />
      <div className="hz-stack">
        {mine.length === 0 && <Empty text="No deliveries right now. New online delivery orders auto-arrive here." />}
        {mine.map((o) => { const isReady = o.status === "ready";
          return (
            <div className={"hz-worder" + (flashing(ctx, o.id) ? " flash" : "") + (isReady ? " ready" : "")} key={o.id}>
              <div className="hz-trow"><span className="hz-tq"><Hash size={12} />{o.q}</span><Badge s={o.status} /><span className="hz-srctag">online · auto</span></div>
              <div className="hz-deliverto"><Home size={14} /><span>Deliver to</span><b>{o.customer}</b></div>
              <div className="hz-rideraddr"><MapPin size={13} />{o.address || "—"}{o.phone && <a className="hz-ridercall" href={`tel:${o.phone}`}><Phone size={12} />{o.phone}</a>}</div>
              <div className="hz-witems">{o.items.map((i) => `${i.qty}× ${i.name}`).join(" · ")}{o.notes && <em> · “{o.notes}”</em>}</div>
              <div className="hz-mfoot" style={{ marginBottom: 10 }}><b>{rs(grand(o))}</b><span className={"hz-pay " + o.payment}>{o.payment === "paid" ? "Prepaid" : "Collect cash"}</span></div>
              {!isReady ? (
                <div className="hz-wstatusnote"><Clock size={13} />Preparing… pick up as soon as it is ready · ETA {etaMins(o)}m</div>
              ) : (
                <RiderSteps o={o} ctx={ctx} />
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
/* Delivery progress buttons: Picked up → On the way → Reached → Delivered.
   Each step notifies the customer; "Delivered" also notifies manager + admin. */
function RiderSteps({ o, ctx }) {
  const stage = o.deliveryStage || "";
  const steps = [
    { k: "pickedup", label: "Pick up order", icon: ShoppingBag },
    { k: "onway", label: "On the way", icon: Bike },
    { k: "reached", label: "Reached location", icon: MapPin },
    { k: "delivered", label: "Mark delivered", icon: CheckCircle2 },
  ];
  const order = ["", "pickedup", "onway", "reached", "delivered"];
  const curIdx = order.indexOf(stage);
  const next = steps.find((s) => order.indexOf(s.k) === curIdx + 1);
  return (
    <>
      <div className="hz-ridersteps">
        {steps.map((s) => { const done = order.indexOf(s.k) <= curIdx && curIdx >= 0;
          return <div className={"hz-riderstep" + (done ? " done" : "")} key={s.k}><s.icon size={13} />{s.label.replace("Pick up order", "Picked").replace("Mark delivered", "Delivered").replace(" location", "").replace("On the way", "On way")}</div>;
        })}
      </div>
      {next && <button className="hz-deliverbtn" onClick={() => ctx.riderStep(o.id, next.k)}><next.icon size={15} />{next.label}</button>}
    </>
  );
}
function TakeOrder({ ctx, me, branch, onDone }) {
  const [carhop, setCarhop] = useState(false);
  const [table, setTable] = useState(""); const [vehicle, setVehicle] = useState(""); const [spot, setSpot] = useState("");
  const [name, setName] = useState(""); const [notes, setNotes] = useState(""); const [cart, setCart] = useState({});
  const menu = menuForBranch(ctx.menu, branch);
  const add = (it) => setCart((c) => ({ ...c, [it.name]: { ...it, qty: (c[it.name]?.qty || 0) + 1 } }));
  const sub = (n) => setCart((c) => { const q = (c[n]?.qty || 0) - 1; const x = { ...c }; if (q <= 0) delete x[n]; else x[n] = { ...x[n], qty: q }; return x; });
  const items = Object.values(cart);
  return (
    <div className="hz-form">
      <div className="hz-segt sm"><button className={!carhop ? "on" : ""} onClick={() => setCarhop(false)}>Table</button><button className={carhop ? "on" : ""} onClick={() => setCarhop(true)}>Car-hop</button></div>
      {carhop ? <div className="hz-row2"><label>Vehicle<input value={vehicle} onChange={(e) => setVehicle(e.target.value)} placeholder="ABC-123" /></label><label>Spot<input value={spot} onChange={(e) => setSpot(e.target.value)} placeholder="P5" /></label></div>
        : <label>Table<input value={table} onChange={(e) => setTable(e.target.value)} placeholder="01" /></label>}
      <label>Customer (optional)<input value={name} onChange={(e) => setName(e.target.value)} placeholder="Ahmed" /></label>
      <div className="hz-pickgrid">{menu.map((it) => (
        <button key={it.id} className={"hz-pick" + (cart[it.name] ? " on" : "")} onClick={() => add(it)}><span>{it.em}</span>{it.name}{cart[it.name] && <em>{cart[it.name].qty}</em>}</button>
      ))}</div>
      {items.length > 0 && <div className="hz-minicart">{items.map((i) => (
        <div key={i.name}><span>{i.name}</span><div className="hz-step"><button onClick={() => sub(i.name)}><Minus size={12} /></button><b>{i.qty}</b><button onClick={() => add(i)}><Plus size={12} /></button></div></div>
      ))}</div>}
      <label>Notes<input value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="No spicy" /></label>
      <button className="hz-cta" disabled={!items.length} onClick={() => {
        ctx.addOrder({ source: "waiter", branch, waiter: me, customer: name.trim() || "Guest", type: carhop ? "carhop" : "dinein",
          table: carhop ? undefined : table || "—", vehicle: carhop ? vehicle || "—" : undefined, spot: carhop ? spot || "—" : undefined,
          notes, items: items.map((i) => ({ name: i.name, qty: i.qty, price: i.price })) });
        onDone();
      }}>Submit order<ArrowRight size={15} /></button>
    </div>
  );
}

/* --------------------------- Cashier ------------------------------ */
/* Billing counter — today's and still-active orders for this branch, so the
   cashier can take payment and re-print receipts. */
function Cashier({ ctx, branch }) {
  const list = ctx.orders.filter((o) => o.branch === branch && (ACTIVE(o.status) || isToday(o.createdAt))).sort((a, b) => (a.payment === "unpaid" ? 0 : 1) - (b.payment === "unpaid" ? 0 : 1) || b.createdAt - a.createdAt);
  const due = ctx.orders.filter((o) => o.branch === branch && o.payment === "unpaid" && (ACTIVE(o.status) || isToday(o.createdAt))).reduce((a, b) => a + grand(b), 0);
  return (
    <div className="hz-wrap narrow">
      <Head title="Billing Counter" sub={`${branchName(branch)} · ${rs(due)} pending`} />
      <div className="hz-stack">
        {list.map((o) => { const T = typeMeta(o); return (
          <div className={"hz-billrow" + (flashing(ctx, o.id) ? " flash" : "")} key={o.id}>
            <div className="hz-mhead"><span className="hz-tq"><Hash size={12} />{o.q}</span><Badge s={o.status} sm /><span className={"hz-pay " + o.payment}>{o.payment === "paid" ? "Paid" : "Unpaid"}</span></div>
            <div className="hz-mmeta"><span><T.icon size={12} />{T.label}</span><span><User size={12} />{o.customer}</span></div>
            <div className="hz-mitems">{o.items.map((i) => `${i.qty}× ${i.name}`).join(" · ")}</div>
            <div className="hz-mfoot"><b>{rs(grand(o))}</b><div className="hz-macts">
              {o.payment !== "paid" ? <button className="hz-paybtn" onClick={() => { ctx.setPaid(o.id); ctx.toast(`#${o.q} paid · receipt printed`, "#29D3A6"); }}><Receipt size={14} />Take payment</button>
                : <button className="hz-mini" onClick={() => ctx.toast(`#${o.q} receipt re-printed`, "#5A9CFF")}><Receipt size={13} /></button>}
            </div></div>
          </div>
        ); })}
      </div>
    </div>
  );
}

/* --------------------- shared menu + tracking -------------------- */
function MenuBrowser({ cats, cat, setCat, q, setQ, shown, cart, add, sub }) {
  return (
    <>
      <div className="hz-searchbar"><Search size={16} /><input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search dishes…" /></div>
      <div className="hz-catpills">{cats.map((c) => <button key={c} className={"hz-pill" + (cat === c ? " on" : "")} onClick={() => setCat(c)}>{c}</button>)}</div>
      <div className="hz-menugrid2">
        {shown.length === 0 && <Empty text="No dishes match your search." />}
        {shown.map((it) => (
          <div className="hz-fcard" key={it.id}>
            <div className="hz-fcard-img">{it.img ? <img src={it.img} alt={it.name} /> : <span className="hz-fcard-em">{it.em}</span>}{it.badge && <span className={"hz-fbadge " + (it.badge === "Spicy" ? "spicy" : "pop")}>{it.badge}</span>}</div>
            <div className="hz-fcard-b"><div className="hz-fcard-n">{it.name}</div>{it.desc && <div className="hz-fcard-d">{it.desc}</div>}
              <div className="hz-fcard-foot"><span className="hz-fcard-p">{rs(it.price)}</span>
                {cart[it.name] ? <div className="hz-step"><button onClick={() => sub(it.name)}><Minus size={13} /></button><b>{cart[it.name].qty}</b><button onClick={() => add(it)}><Plus size={13} /></button></div>
                  : <button className="hz-addbtn2" onClick={() => add(it)}><Plus size={15} /></button>}
              </div>
            </div>
          </div>
        ))}
      </div>
    </>
  );
}
/* Customer's live order tracking: status timeline, queue position, ETA, and
   (for deliveries) the rider's progress plus the latest notification. */
function Track({ o, ctx, onNew }) {
  const i = STAGES.indexOf(o.status); const pos = ctx.queue[o.id];
  const readyMsg = o.type === "delivery" ? "Ready — your rider is about to pick it up." : o.type === "takeaway" ? "Ready — please collect it from the counter." : o.type === "carhop" ? `Ready — ${o.waiter} is bringing it to your car.` : `Ready — ${o.waiter} is bringing it to your table.`;
  const doneMsg = o.type === "delivery" ? "Delivered! Enjoy your meal." : o.type === "takeaway" ? "Picked up! Enjoy your meal." : "Delivered! Enjoy your meal.";
  const delSteps = [{ k: "pickedup", l: "Picked up" }, { k: "onway", l: "On the way" }, { k: "reached", l: "Reached" }, { k: "delivered", l: "Delivered" }];
  const delOrder = ["", "pickedup", "onway", "reached", "delivered"];
  const delIdx = delOrder.indexOf(o.deliveryStage || "");
  return (
    <div className="hz-wrap narrow">
      <Head title="Live Tracking" sub={`Order #${o.q} · ${branchName(o.branch)}`} />
      <div className={"hz-track" + (flashing(ctx, o.id) ? " flash" : "")}>
        <div className="hz-track-hero"><div><div className="hz-th-q">Order #{o.q}</div><div className="hz-th-cur" style={{ color: STAGE[o.status].color }}>{STAGE[o.status].c}</div></div>
          <div className="hz-th-r"><div className="hz-th-big">{o.status === "completed" ? 0 : etaMins(o)}<small>min</small></div>{pos && <div className="hz-th-pos">Queue position {pos}</div>}</div></div>
        <div className="hz-asgn"><ChefHat size={13} />{o.type === "delivery" ? "Rider" : "Your waiter"}: <b>{o.waiter}</b></div>
        {o.custMsg && <div className="hz-custnotif"><Bell size={14} />{o.custMsg}</div>}
        <div className="hz-timeline">{STAGES.map((s, k) => { const done = STAGES.indexOf(s) < i, cur = STAGES.indexOf(s) === i;
          return (<div className={"hz-tl" + (done ? " done" : "") + (cur ? " cur" : "")} key={s}>
            <span className="hz-tl-dot" style={cur || done ? { background: STAGE[s].color, borderColor: STAGE[s].color } : {}}>{done ? <Check size={11} /> : cur ? <span className="hz-tl-live" /> : null}</span>
            {k < STAGES.length - 1 && <span className="hz-tl-line" style={done ? { background: STAGE[s].color } : {}} />}<span className="hz-tl-lbl">{STAGE[s].c}</span></div>); })}</div>
        {o.type === "delivery" && (o.status === "ready" || o.deliveryStage) && o.status !== "completed" && (
          <div className="hz-delrow">{delSteps.map((s, k) => <span key={s.k} className={"hz-delstep" + (delOrder.indexOf(s.k) <= delIdx ? " on" : "")}><Bike size={11} />{s.l}</span>)}</div>
        )}
        {o.status === "ready" && !o.deliveryStage && <div className="hz-cnote ready">{readyMsg}</div>}
        {o.status === "completed" && <div className="hz-cnote done"><CheckCircle2 size={15} />{doneMsg}</div>}
      </div>
      <button className="hz-back wide center" onClick={onNew}>+ Place another order</button>
    </div>
  );
}

/* ===================== ORDER FLOW (public site) ================== */
const ORDER_MODES = [
  { id: "online", label: "Online Order", icon: Bike, soon: false },
  { id: "car", label: "Curbside", icon: Car, soon: false },
];
/* The whole customer ordering journey: menu → checkout → live tracking.
   `entry` is set when the customer arrived by scanning a QR code, which locks
   the branch and pre-sets the table (dine-in) or car mode (curbside). */
function OrderFlow({ ctx, dark, setDark, onHome, onStaff, entry }) {
  const qrEntry = !!entry;
  const entryKind = entry?.kind === "car" ? "car" : "dine";
  const dine = qrEntry && entryKind === "dine";
  const [mode, setMode] = useState(qrEntry ? (entryKind === "car" ? "car" : "dine") : "online"); // online | car | dine
  const [sub2, setSub2] = useState("delivery");       // delivery | pickup (online only)
  const [branch, setBranch] = useState(qrEntry ? entry.branch : (ctx.branchOpen.g91 !== false ? "g91" : "i8"));
  const [step, setStep] = useState("menu");           // menu | checkout | track
  const [cart, setCart] = useState({});
  const [placed, setPlaced] = useState(null);
  const [cat, setCat] = useState("All"); const [q, setQ] = useState("");
  const [setupOpen, setSetupOpen] = useState(false);

  const add = (it) => setCart((c) => ({ ...c, [it.name]: { ...it, qty: (c[it.name]?.qty || 0) + 1 } }));
  const sub = (n) => setCart((c) => { const x = (c[n]?.qty || 0) - 1; const m = { ...c }; if (x <= 0) delete m[n]; else m[n] = { ...m[n], qty: x }; return m; });
  const items = Object.values(cart); const sum = items.reduce((a, b) => a + b.price * b.qty, 0);
  const closed = ctx.branchOpen[branch] === false;
  const avail = menuForBranch(ctx.menu, branch);
  const cats = ["All", ...new Set(avail.map((m) => m.cat))];
  const shown = avail.filter((m) => (cat === "All" || m.cat === cat) && m.name.toLowerCase().includes(q.toLowerCase()));

  const ctxLabel = dine ? `Dine-in${entry.table ? " · Table " + entry.table : ""} · ${branchName(branch)}`
    : (qrEntry && entryKind === "car") ? `Curbside (car) · ${branchName(branch)}`
    : mode === "online" ? `${sub2 === "delivery" ? "Delivery" : "Pickup"} · ${branchName(branch)}` : `Curbside · ${branchName(branch)}`;

  const bar = (
    <header className="hz-obar">
      <button className="hz-oback" onClick={step === "menu" ? onHome : () => setStep("menu")}><ChevronLeft size={18} /></button>
      <div className="hz-brand"><div className="hz-logo"><Flame size={18} /></div><div><div className="hz-bn">The Hunza <span>Sizzle</span></div><div className="hz-bs">{qrEntry ? (entryKind === "car" ? "Curbside" : "Dine-in") : "Order"}</div></div></div>
      <button className="hz-ohome" onClick={onHome}><Home size={14} />{qrEntry ? "Exit" : "Home"}</button>
      <button className="hz-icbtn" onClick={() => setDark((v) => !v)}>{dark ? <Sun size={16} /> : <Moon size={16} />}</button>
    </header>
  );

  if (step === "track" && placed) {
    const o = ctx.orders.find((x) => x.id === placed.id) || placed;
    return <div className="hz-online">{bar}<div className="hz-owrap"><Track o={o} ctx={ctx} onNew={() => { setCart({}); setPlaced(null); setStep("menu"); }} /></div></div>;
  }
  if (step === "checkout") {
    return <div className="hz-online">{bar}<div className="hz-owrap"><OrderCheckout ctx={ctx} mode={mode} sub2={sub2} branch={branch} table={dine ? entry.table : ""} spotPrefill={qrEntry && entryKind === "car" ? entry.spot : ""} items={items} sum={sum} onBack={() => setStep("menu")} onPlaced={(o) => { setPlaced(o); setStep("track"); }} /></div></div>;
  }

  return (
    <div className="hz-online">{bar}
      <div className="hz-owrap">
        {qrEntry ? (
          <div className="hz-dinebanner">
            <span className="hz-dine-ic">{entryKind === "car" ? <Car size={18} /> : <QrCode size={18} />}</span>
            <div><b>Welcome to The Hunza Sizzle</b><span>{branchName(branch)}{entryKind === "car" ? " · Curbside (car)" : entry.table ? ` · Table ${entry.table}` : ""} · scan-to-order</span></div>
          </div>
        ) : (
          <div className="hz-modetabs">
            {ORDER_MODES.map((m) => (
              <button key={m.id} className={"hz-modetab" + (mode === m.id ? " on" : "")} onClick={() => { setMode(m.id); setSetupOpen(false); }}>
                <m.icon size={16} />{m.label}
              </button>
            ))}
          </div>
        )}

        <div className="hz-ctxbar">
          <span className="hz-ctxchip">{dine ? <Store size={14} /> : mode === "online" ? (sub2 === "delivery" ? <Bike size={14} /> : <ShoppingBag size={14} />) : <Car size={14} />}{ctxLabel}</span>
          {!qrEntry && <button className="hz-ctxchange" onClick={() => setSetupOpen((v) => !v)}>{setupOpen ? "Done" : "Change"}<ChevronRight size={13} style={{ transform: setupOpen ? "rotate(90deg)" : "none", transition: ".2s" }} /></button>}
        </div>
        {!qrEntry && setupOpen && (
          <div className="hz-setup">
            {mode === "online" && (
              <div className="hz-setup-row"><span className="hz-setup-l">Type</span>
                <div className="hz-segt sm" style={{ margin: 0, flex: 1 }}><button className={sub2 === "delivery" ? "on" : ""} onClick={() => setSub2("delivery")}>Delivery</button><button className={sub2 === "pickup" ? "on" : ""} onClick={() => setSub2("pickup")}>Pickup</button></div>
              </div>
            )}
            <div className="hz-setup-row"><span className="hz-setup-l">Branch</span>
              <div className="hz-segt sm" style={{ margin: 0, flex: 1 }}>{BRANCHES.map((b) => { const op = ctx.branchOpen[b.id] !== false; return <button key={b.id} className={branch === b.id ? "on" : ""} disabled={!op} onClick={() => setBranch(b.id)}>{b.name}{!op ? " (closed)" : ""}</button>; })}</div>
            </div>
            {mode === "car" && <div className="hz-branchnote"><Car size={12} />Curbside<InfoTip label="About curbside orders">We'll ask for your vehicle number and parking spot at checkout, so the team can bring your order straight to your car.</InfoTip></div>}
          </div>
        )}
        {closed
          ? <div className="hz-closedbox"><Store size={30} /><h3>{branchName(branch)} is currently closed</h3><p>This branch is not accepting orders right now. {dine ? "Please try again later." : "Please pick the other branch or try again later."}</p>{!dine && <button className="hz-ghost" onClick={() => setSetupOpen(true)}>Change branch</button>}</div>
          : <MenuBrowser cats={cats} cat={cat} setCat={setCat} q={q} setQ={setQ} shown={shown} cart={cart} add={add} sub={sub} />}
      </div>
      {!closed && items.length > 0 && <button className="hz-floatcart wide" onClick={() => setStep("checkout")}><span className="hz-cartcount"><ShoppingCart size={15} /><b>{items.reduce((a, b) => a + b.qty, 0)}</b></span>Checkout · {rs(sum)}<ArrowRight size={16} /></button>}
    </div>
  );
}
/* Checkout. Collects the details each order type needs, applies the delivery
   fee and (I-8 only) sales tax, then creates the order.
   NOTE: in production these totals must be recalculated on the server. */
function OrderCheckout({ ctx, mode, sub2, branch, table, spotPrefill, items, sum, onBack, onPlaced }) {
  const dine = mode === "dine";
  const delivery = mode === "online" && sub2 === "delivery";
  const [name, setName] = useState(""); const [phone, setPhone] = useState(""); const [address, setAddress] = useState("");
  const [vehicle, setVehicle] = useState(""); const [spot, setSpot] = useState(spotPrefill || ""); const [notes, setNotes] = useState("");
  const [pay, setPay] = useState("cod"); const [err, setErr] = useState("");
  const fee = delivery ? 120 : 0;
  const tRate = taxRate(branch, pay);
  const tax = taxOf(branch, pay, sum + fee);
  const payable = sum + fee + tax;
  const place = () => {
    if (!name.trim()) { setErr("Please enter your name."); return; }
    if (mode === "online" && phone.trim().length < 7) { setErr("Please enter a valid phone number."); return; }
    if (delivery && !address.trim()) { setErr("A delivery address is required."); return; }
    if (mode === "car" && (!vehicle.trim() || !spot.trim())) { setErr("Please enter your vehicle number and parking spot."); return; }
    const money = { fee, tax, taxRate: tRate, payMethod: pay };
    let partial;
    if (dine) {
      partial = { source: "qr", branch, type: "dinein", table: table || "—", customer: name.trim(), notes: notes.trim(), ...money,
        payment: pay === "card" ? "paid" : "unpaid", items: items.map((i) => ({ name: i.name, qty: i.qty, price: i.price })) };
    } else if (mode === "car") {
      partial = { source: "car", branch, type: "carhop", customer: name.trim(), vehicle: vehicle.trim(), spot: spot.trim(), ...money,
        payment: pay === "card" ? "paid" : "unpaid", items: items.map((i) => ({ name: i.name, qty: i.qty, price: i.price })) };
    } else {
      partial = { source: "online", branch, type: delivery ? "delivery" : "takeaway", customer: name.trim(), phone: phone.trim(), ...money,
        address: delivery ? address.trim() : undefined, payment: pay === "card" ? "paid" : "unpaid",
        items: items.map((i) => ({ name: i.name, qty: i.qty, price: i.price })) };
    }
    onPlaced(ctx.addOrder(partial));
  };
  const title = dine ? `Dine-in${table ? " · Table " + table : ""}` : mode === "car" ? "Curbside" : delivery ? "Delivery" : "Pickup";
  return (
    <div className="hz-wrap narrow">
      <Head title="Checkout" sub={`${title} · ${branchName(branch)}`} right={<InfoTip label="How your order is handled">Your order goes to the team member with the lightest workload at that branch — a rider for deliveries, otherwise a waiter.</InfoTip>} />
      <div className="hz-cosum">
        {items.map((i) => <div key={i.name}><span>{i.qty}× {i.name}</span><b>{rs(i.price * i.qty)}</b></div>)}
        <div><span>Subtotal</span><b>{rs(sum)}</b></div>
        {delivery && <div><span>Delivery fee</span><b>{rs(fee)}</b></div>}
        {tax > 0 && <div><span>Sales tax ({Math.round(tRate * 100)}%)</span><b>{rs(tax)}</b></div>}
        <div className="hz-cosum-t"><span>Total</span><b>{rs(payable)}</b></div>
      </div>
      <div className="hz-form">
        <label><span><User size={12} /> Name</span><input value={name} onChange={(e) => setName(e.target.value)} placeholder="Your name" /></label>
        {mode === "online" && <label><span><Phone size={12} /> Phone</span><input value={phone} onChange={(e) => setPhone(e.target.value.replace(/[^\d-]/g, ""))} placeholder="03xx-xxxxxxx" /></label>}
        {delivery && <label><span><Home size={12} /> Delivery address</span><input value={address} onChange={(e) => setAddress(e.target.value)} placeholder="House, street, sector" /></label>}
        {mode === "car" && <div className="hz-row2"><label><span><Car size={12} /> Vehicle</span><input value={vehicle} onChange={(e) => setVehicle(e.target.value)} placeholder="ABC-123" /></label><label><span><MapPin size={12} /> Parking spot</span><input value={spot} onChange={(e) => setSpot(e.target.value)} placeholder="P5" /></label></div>}
        {dine && <label><span><Soup size={12} /> Notes (optional)</span><input value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="No spicy, extra sauce…" /></label>}
        <div className="hz-paypick">
          <button className={"hz-payopt" + (pay === "cod" ? " on" : "")} onClick={() => setPay("cod")}><Banknote size={16} />{delivery ? "Cash on Delivery" : "Cash at counter"}{branch === TAX_BRANCH && <em className="hz-taxhint">+16% tax</em>}</button>
          <button className={"hz-payopt" + (pay === "card" ? " on" : "")} onClick={() => setPay("card")}><CreditCard size={16} />Online Payment{branch === TAX_BRANCH && <em className="hz-taxhint save">+5% tax</em>}</button>
        </div>
        {branch === TAX_BRANCH && <div className="hz-branchnote"><Receipt size={12} />Pay by card and save {rs(taxOf(branch, "cod", sum + fee) - taxOf(branch, "card", sum + fee))}<InfoTip label="About sales tax">Sales tax at {branchName(TAX_BRANCH)} is 16% on cash payments but only 5% on card or online payments, so paying by card costs you less.</InfoTip></div>}
        {err && <div className="hz-err"><CircleAlert size={13} />{err}</div>}
        <div className="hz-corow"><button className="hz-back wide" onClick={onBack}>← Menu</button>
          <button className="hz-cta" onClick={place}>Place order · {rs(payable)}<ArrowRight size={15} /></button></div>

      </div>
    </div>
  );
}
/* ----------------------- Manager / Admin -------------------------- */
/* Shared shell for Admin and Manager. Admin sees every branch plus the Menu
   tab; a manager is locked to their own branch. */
function Manager({ ctx, isAdmin, myBranch, onPreview }) {
  const [tab, setTab] = useState("dash");
  const [branchSel, setBranchSel] = useState("all");
  const [printOrder, setPrintOrder] = useState(null);
  const branch = isAdmin ? branchSel : myBranch;
  const tabs = isAdmin
    ? [["dash", BarChart3, "Dashboard"], ["ops", Store, "Operations"], ["inv", Package, "Inventory"], ["menu", UtensilsCrossed, "Menu"], ["staff", Users, "Staff"], ["pay", Wallet, "Payroll"], ["qr", QrCode, "QR Codes"]]
    : [["dash", BarChart3, "Dashboard"], ["ops", Store, "Operations"], ["inv", Package, "Inventory"], ["staff", Users, "Staff"], ["pay", Wallet, "Payroll"], ["qr", QrCode, "QR Codes"]];
  const staffInScope = ctx.users.filter((u) => branch === "all" ? true : u.branch === branch);
  return (
    <div className="hz-wrap">
      <Head title={isAdmin ? "Admin Dashboard" : "Manager Dashboard"}
        sub={isAdmin ? (branch === "all" ? "Full access · all branches" : `Viewing · ${branchName(branch)}`) : `Branch manager · ${branchName(myBranch)}`}
        right={isAdmin ? <BranchSwitch value={branchSel} onChange={setBranchSel} includeAll /> : <span className="hz-brtag big"><Building2 size={12} />{branchName(myBranch)}</span>} />
      <div className={"hz-segt wide" + tabs.length}>
        {tabs.map(([id, Icon, label]) => (
          <button key={id} className={tab === id ? "on" : ""} onClick={() => setTab(id)}>
            <Icon size={14} />{label}
            {id === "menu" && <em>{ctx.menu.length}</em>}
            {id === "staff" && <em>{staffInScope.length}</em>}
          </button>
        ))}
      </div>
      {tab === "dash" && <Dashboard ctx={ctx} branch={branch} />}
      {tab === "ops" && <ManagerOps ctx={ctx} branch={branch} onPrint={setPrintOrder} />}
      {tab === "inv" && <Inventory ctx={ctx} branch={branch} isAdmin={isAdmin} />}
      {tab === "menu" && isAdmin && <MenuManager ctx={ctx} />}
      {tab === "staff" && <StaffUsers ctx={ctx} isAdmin={isAdmin} myBranch={myBranch} branch={branch} />}
      {tab === "pay" && <Payroll ctx={ctx} isAdmin={isAdmin} myBranch={myBranch} branch={branch} />}
      {tab === "qr" && <QRCodes ctx={ctx} isAdmin={isAdmin} myBranch={myBranch} branch={branch} onPreview={onPreview} />}
      {printOrder && <PrintModal order={printOrder} onClose={() => setPrintOrder(null)} />}
    </div>
  );
}
/* Reporting dashboard: sales for today / yesterday / 7 days / month / year,
   a 7-day chart, money in vs out, tax collected, and per-staff daily activity. */
function Dashboard({ ctx, branch }) {
  const inB = (o) => branch === "all" || o.branch === branch;
  const orders = ctx.orders.filter(inB);
  const purchases = (ctx.purchases || []).filter((p) => branch === "all" || p.branch === branch);
  const good = (o) => o.status !== "cancelled";
  const sales = (pred) => orders.filter((o) => good(o) && pred(o.createdAt)).reduce((a, b) => a + grand(b), 0);
  const cnt = (pred) => orders.filter((o) => good(o) && pred(o.createdAt)).length;
  const spend = (pred) => purchases.filter((p) => pred(p.date)).reduce((a, b) => a + b.cost, 0);

  const monthSales = sales(isThisMonth), monthSpend = spend(isThisMonth);
  const days = Array.from({ length: 7 }, (_, i) => dayStart(now()) - (6 - i) * DAY);
  const series = days.map((d) => ({ d, val: orders.filter((o) => good(o) && o.createdAt >= d && o.createdAt < d + DAY).reduce((a, b) => a + grand(b), 0) }));
  const maxS = Math.max(1, ...series.map((s) => s.val));

  const staff = ctx.users.filter((u) => (u.role === "waiter" || u.role === "rider") && (branch === "all" || u.branch === branch) && u.active);
  const handled = (name, pred) => orders.filter((o) => o.waiter === name && good(o) && pred(o.createdAt));

  const recentBuys = purchases.slice().sort((a, b) => b.date - a.date).slice(0, 6);
  const taxMonth = orders.filter((o) => good(o) && isThisMonth(o.createdAt)).reduce((a, b) => a + (b.tax || 0), 0);
  const taxToday = orders.filter((o) => good(o) && isToday(o.createdAt)).reduce((a, b) => a + (b.tax || 0), 0);
  const branchList = branch === "all" ? BRANCHES.map((b) => b.id) : [branch];

  return (
    <>
      <div className="hz-branchstatus">
        <span className="hz-bs-lbl"><Building2 size={14} />Branch status<InfoTip label="About branch status">Closing a branch immediately stops customers from ordering there — it shows as “Closed” on the home page and cannot be selected at checkout.</InfoTip></span>
        {branchList.map((b) => { const open = ctx.branchOpen[b];
          return (
            <div className={"hz-bs-item" + (open ? " open" : " closed")} key={b}>
              <span className="hz-bs-dot" /><b>{branchName(b)}</b><span className="hz-bs-state">{open ? "Open" : "Closed"}</span>
              <button className={"hz-toggle" + (open ? " on" : "")} onClick={() => ctx.toggleBranch(b)}><span className="hz-toggle-knob" /></button>
            </div>
          );
        })}

      </div>
      <div className="hz-dashrow">
        <DashCard big icon={TrendingUp} label="Today's Sales" val={rs(sales(isToday))} sub={`${cnt(isToday)} orders`} c="#FF6B2C" />
        <DashCard icon={Calendar} label="Yesterday" val={rs(sales(isYesterday))} sub={`${cnt(isYesterday)} orders`} c="#FFB22C" />
        <DashCard icon={BarChart3} label="Last 7 days" val={rs(sales(isLast7))} sub={`${cnt(isLast7)} orders`} c="#29D3A6" />
        <DashCard icon={Calendar} label="This Month" val={rs(monthSales)} sub={`${cnt(isThisMonth)} orders`} c="#5A9CFF" />
        <DashCard icon={Calendar} label="This Year" val={rs(sales(isThisYear))} sub={`${cnt(isThisYear)} orders`} c="#9B8CFF" />
      </div>

      <div className="hz-mgrid">
        <div className="hz-card">
          <div className="hz-card-h"><h3>Last 7 days sales</h3><span className="hz-card-sub">{branch === "all" ? "all branches" : branchName(branch)}</span></div>
          <div className="hz-chart">
            {series.map((s, i) => (
              <div className="hz-chbar" key={i}>
                <span className="hz-chval">{s.val >= 1000 ? Math.round(s.val / 1000) + "k" : s.val}</span>
                <span className="hz-chfill" style={{ height: Math.max(4, (s.val / maxS) * 130) + "px" }} />
                <span className="hz-chlbl">{i === 6 ? "Today" : dayName(s.d)}</span>
              </div>
            ))}
          </div>
        </div>

        <div className="hz-card">
          <div className="hz-card-h"><h3>Money in vs out<InfoTip label="How this is calculated">
            <b>Net</b> is sales minus stock cost only — salaries, rent and utilities are not included.<br /><br />
            Collected sales tax ({branchName(TAX_BRANCH)}) is money you must pay to the government, not profit.
          </InfoTip></h3><span className="hz-card-sub">this month</span></div>
          <div className="hz-moneyrow"><span className="hz-money-ic" style={{ color: "#29D3A6" }}><TrendingUp size={16} /></span><div className="hz-load-main"><b>Sales in</b></div><span className="hz-money-v" style={{ color: "#29D3A6" }}>{rs(monthSales)}</span></div>
          <div className="hz-moneyrow"><span className="hz-money-ic" style={{ color: "#FF5470" }}><Boxes size={16} /></span><div className="hz-load-main"><b>Stock purchased (maal)</b></div><span className="hz-money-v" style={{ color: "#FF5470" }}>− {rs(monthSpend)}</span></div>
          <div className="hz-moneyrow"><span className="hz-money-ic" style={{ color: "#5A9CFF" }}><Receipt size={16} /></span><div className="hz-load-main"><b>Sales tax collected</b><span className="hz-taxsub">today {rs(taxToday)}</span></div><span className="hz-money-v" style={{ color: "#5A9CFF" }}>{rs(taxMonth)}</span></div>
          <div className="hz-moneyrow total"><span className="hz-money-ic"><Wallet size={16} /></span><div className="hz-load-main"><b>Net</b></div><span className="hz-money-v" style={{ color: monthSales - monthSpend >= 0 ? "#29D3A6" : "#FF5470" }}>{rs(monthSales - monthSpend)}</span></div>

          <div className="hz-buyhist">
            <div className="hz-buyhist-h">Recent stock purchases</div>
            {recentBuys.length === 0 && <Empty text="No purchases yet." />}
            {recentBuys.map((p) => <div className="hz-buyrow" key={p.id}><span className="hz-tq"><Boxes size={11} />{p.qty} {p.unit}</span><span className="hz-buyitem">{p.item}{branch === "all" && <BranchTag b={p.branch} />}</span><span className="hz-buycost">{rs(p.cost)}</span><span className="hz-buydate">{dayNum(p.date)} {monthShort(monthKey(p.date))}</span></div>)}
          </div>
        </div>
      </div>

      <div className="hz-card" style={{ marginTop: 14 }}>
        <div className="hz-card-h"><h3>Staff activity — today &amp; yesterday</h3><span className="hz-card-sub">riders &amp; waiters</span></div>
        <div className="hz-staffact-head"><span>Staff</span><span>Today</span><span>Today sales</span><span>Yesterday</span></div>
        {staff.length === 0 && <Empty text="No staff in scope." />}
        {staff.map((u) => { const tH = handled(u.name, isToday), yH = handled(u.name, isYesterday); const tSales = tH.reduce((a, b) => a + grand(b), 0);
          return (
            <div className="hz-staffact" key={u.id}>
              <span className="hz-staffact-name"><span className="hz-wp-av sm" style={{ background: `linear-gradient(135deg, ${ROLE_META[u.role].color}, var(--saffron))` }}>{React.createElement(ROLE_META[u.role].icon, { size: 14 })}</span><b>{u.name}</b><span className="hz-roletag" style={{ color: ROLE_META[u.role].color }}>{ROLE_META[u.role].label}</span>{branch === "all" && <BranchTag b={u.branch} />}</span>
              <span className="hz-staffact-n">{tH.length}</span>
              <span className="hz-staffact-s">{rs(tSales)}</span>
              <span className="hz-staffact-n muted">{yH.length}</span>
            </div>
          );
        })}
      </div>
    </>
  );
}
function DashCard({ icon: Icon, label, val, sub, c, big }) {
  return (
    <div className={"hz-dashcard" + (big ? " big" : "")}>
      <span className="hz-dashcard-ic" style={{ background: c + "22", color: c }}><Icon size={18} /></span>
      <div className="hz-dashcard-lbl">{label}</div>
      <div className="hz-dashcard-val" style={big ? { color: c } : {}}>{val}</div>
      {sub && <div className="hz-dashcard-sub">{sub}</div>}
    </div>
  );
}
/* Live operations: branch open/closed switches, team workload, and the order
   list where staff print tickets and mark orders ready. */
function ManagerOps({ ctx, branch, onPrint }) {
  const inB = (o) => branch === "all" || o.branch === branch;
  const all = ctx.orders.filter(inB).filter((o) => ACTIVE(o.status) || isToday(o.createdAt)).sort((a, b) => (b.priority - a.priority) || (a.createdAt - b.createdAt));
  const active = all.filter((o) => ACTIVE(o.status));
  const revenue = all.reduce((a, b) => a + grand(b), 0);
  const lowStock = ctx.inventory.filter((i) => (branch === "all" || i.branch === branch) && i.stock <= i.low).length;
  const branches = branch === "all" ? BRANCHES.map((b) => b.id) : [branch];
  const team = branches.flatMap((b) => [
    ...ctx.branchWaiters(b).map((w) => ({ w, b, role: "waiter" })),
    ...ctx.branchRiders(b).map((w) => ({ w, b, role: "rider" })),
  ]);
  const maxLoad = Math.max(1, ...team.map((x) => ctx.activeCount(x.w)));
  const doPrint = (o) => { ctx.markPreparing(o.id); onPrint(o); };
  return (
    <>
      <div className="hz-mkpis">
        <Kpi icon={ShoppingBag} label="Orders" val={all.length} c="#FF6B2C" />
        <Kpi icon={Clock} label="Active Now" val={active.length} c="#FFB22C" />
        <Kpi icon={Receipt} label="Revenue" val={rs(revenue)} c="#29D3A6" />
        <Kpi icon={AlertTriangle} label="Low Stock" val={lowStock} c="#FF5470" />
      </div>
      <div className="hz-branchstatus">
        <span className="hz-bs-lbl"><Building2 size={14} />Branch status<InfoTip label="About branch status">Closing a branch immediately stops customers from ordering there — it shows as “Closed” on the home page and cannot be selected at checkout.</InfoTip></span>
        {branches.map((b) => { const open = ctx.branchOpen[b];
          return (
            <div className={"hz-bs-item" + (open ? " open" : " closed")} key={b}>
              <span className="hz-bs-dot" /><b>{branchName(b)}</b><span className="hz-bs-state">{open ? "Open" : "Closed"}</span>
              <button className={"hz-toggle" + (open ? " on" : "")} onClick={() => ctx.toggleBranch(b)}><span className="hz-toggle-knob" /></button>
            </div>
          );
        })}

      </div>
      <div className="hz-mgrid">
        <div className="hz-card">
          <div className="hz-card-h"><h3>Team Load</h3><span className="hz-card-sub">waiters &amp; riders</span></div>
          {team.length === 0 && <Empty text="No active team here." />}
          {team.map(({ w, b, role }) => { const n = ctx.activeCount(w); const lightest = (role === "rider" ? ctx.lightestRider(b) : ctx.lightestWaiter(b)) === w;
            return (<div className="hz-loadrow" key={w + b + role}><span className="hz-wp-av sm" style={{ background: `linear-gradient(135deg, ${ROLE_META[role].color}, var(--saffron))` }}>{React.createElement(ROLE_META[role].icon, { size: 15 })}</span>
              <div className="hz-load-main"><div className="hz-load-top"><b>{w}</b><span className="hz-roletag" style={{ color: ROLE_META[role].color }}>{ROLE_META[role].label}</span>{branch === "all" && <BranchTag b={b} />}{lightest && <span className="hz-nexttag">next →</span>}</div>
                <div className="hz-bar"><span style={{ width: (n / maxLoad) * 100 + "%" }} /></div></div><span className="hz-load-n">{n}</span></div>);
          })}
        </div>
        <div className="hz-card hz-orderscard">
          <div className="hz-card-h"><h3>All Orders</h3><span className="hz-card-sub">print → kitchen ticket + bill</span></div>
          <div className="hz-stack">{all.map((o) => { const T = typeMeta(o); const del = o.type === "delivery"; return (
            <div className={"hz-mrow" + (flashing(ctx, o.id) ? " flash" : "") + (o.status === "new" ? " isnew" : "")} key={o.id}>
              <div className="hz-mhead"><span className="hz-tq"><Hash size={12} />{o.q}</span><Badge s={o.status} sm /><BranchTag b={o.branch} />{ACTIVE(o.status) && <span className="hz-qpos">Q#{ctx.queue[o.id]}</span>}{(o.source === "qr" || o.source === "online" || o.source === "car") && <span className="hz-srctag">{o.source}</span>}<span className={"hz-pay " + o.payment}>{o.payment === "paid" ? "Paid" : "Unpaid"}</span></div>
              <div className="hz-mmeta"><span><T.icon size={12} />{T.label}</span><span><User size={12} />{o.customer}</span><span>{del ? <Bike size={12} /> : <Users size={12} />}{o.waiter}</span><span><Clock size={12} />{clock(o.createdAt)}</span></div>
              <div className="hz-mitems">{o.items.map((i) => `${i.qty}× ${i.name}`).join(" · ")}</div>
              <div className="hz-mfoot"><b>{rs(grand(o))}</b>{ACTIVE(o.status) && <span className="hz-eta">ETA {etaMins(o)}m</span>}
                <div className="hz-macts">
                  <button className="hz-printbtn" onClick={() => doPrint(o)}><Receipt size={13} />{o.status === "new" ? "Print" : "Re-print"}</button>
                  {o.status === "preparing" && <button className="hz-mini" title="Mark ready" onClick={() => ctx.markReady(o.id)}><Check size={13} /></button>}
                  <button className={"hz-mini" + (o.priority ? " active" : "")} onClick={() => ctx.togglePriority(o.id)}><Star size={13} /></button>
                  {o.payment !== "paid" && <button className="hz-mini" onClick={() => ctx.setPaid(o.id)}><Wallet size={13} /></button>}
                  <button className="hz-mini danger" onClick={() => ctx.cancel(o.id)}><Trash2 size={13} /></button></div></div>
            </div>); })}
          </div>
        </div>
      </div>
    </>
  );
}
/* Stock management for admins and managers. Adding stock records both the
   quantity and what was paid, which feeds the cost figures on the dashboard. */
function Inventory({ ctx, branch, isAdmin }) {
  const inB = (x) => branch === "all" || x.branch === branch;
  const inv = ctx.inventory.filter(inB);
  const low = inv.filter((i) => i.stock <= i.low);
  const purchases = (ctx.purchases || []).filter((p) => branch === "all" || p.branch === branch);
  const monthSpend = purchases.filter((p) => isThisMonth(p.date)).reduce((a, b) => a + b.cost, 0);
  const todaySpend = purchases.filter((p) => isToday(p.date)).reduce((a, b) => a + b.cost, 0);
  const lastCost = (name, b) => { const hit = purchases.filter((p) => p.item.toLowerCase() === name.toLowerCase() && p.branch === b).sort((x, y) => y.date - x.date)[0]; return hit ? hit.cost / Math.max(1, hit.qty) : 0; };
  const [editId, setEditId] = useState(null);   // which inventory row is being edited
  const [nm, setNm] = useState(""); const [unit, setUnit] = useState(""); const [qty, setQty] = useState(""); const [cost, setCost] = useState("");
  const [addBranch, setAddBranch] = useState(branch === "all" ? "g91" : branch);
  const targetBranch = branch === "all" ? addBranch : branch;
  const addStock = () => { if (!nm.trim() || !(+qty > 0)) return; ctx.buyStock(targetBranch, nm.trim(), unit.trim() || "units", +qty, +cost || 0, "Manager"); setNm(""); setUnit(""); setQty(""); setCost(""); };
  const recent = purchases.slice().sort((a, b) => b.date - a.date).slice(0, 8);
  return (
    <>
      <div className="hz-mkpis">
        <Kpi icon={Package} label="Items Tracked" val={inv.length} c="#5A9CFF" />
        <Kpi icon={AlertTriangle} label="Low Stock" val={low.length} c="#FF5470" />
        <Kpi icon={Boxes} label="Stock In · Today" val={rs(todaySpend)} c="#FFB22C" />
        <Kpi icon={TrendingUp} label="Stock In · Month" val={rs(monthSpend)} c="#29D3A6" />
      </div>
      <div className="hz-mgrid">
        <div className="hz-card">
          <div className="hz-card-h"><h3>Inventory</h3><span className="hz-card-sub">{low.length} low · admin &amp; manager</span></div>
          <div className="hz-addstock">
            <div className="hz-addstock-h"><PackagePlus size={13} />Add / restock at <b style={{ color: "var(--ember)" }}>&nbsp;{branchName(targetBranch)}</b><InfoTip label="About adding stock">Type any item name — it is created automatically if it doesn't exist yet.<br /><br />Entering the cost you paid records the purchase, which feeds the “Stock In” totals and the dashboard's money in vs out.</InfoTip></div>
            {branch === "all" && <div className="hz-segt sm" style={{ margin: "0 0 9px" }}>{BRANCHES.map((b) => <button key={b.id} className={addBranch === b.id ? "on" : ""} onClick={() => setAddBranch(b.id)}>{b.name}</button>)}</div>}
            <div className="hz-addstock-row">
              <input value={nm} onChange={(e) => setNm(e.target.value)} placeholder="Item (e.g. Chicken)" />
              <input value={qty} onChange={(e) => setQty(e.target.value.replace(/[^\d.]/g, ""))} placeholder="Qty" className="hz-qtyin" />
              <input value={unit} onChange={(e) => setUnit(e.target.value)} placeholder="unit" className="hz-unitin" />
            </div>
            <div className="hz-addstock-row" style={{ marginTop: 8 }}>
              <div className="hz-costin"><span>Rs</span><input value={cost} onChange={(e) => setCost(e.target.value.replace(/[^\d]/g, ""))} placeholder="Total cost paid (optional)" /></div>
              <button className="hz-fulfill" disabled={!nm.trim() || !(+qty > 0)} onClick={addStock}><Plus size={13} />Add stock</button>
            </div>
          </div>
          <div className="hz-invgrid">{inv.map((it) => { const lowFlag = it.stock <= it.low; const max = Math.max(it.low * 1.6, it.stock); const c = lastCost(it.name, it.branch);
            if (editId === it.id) return <InvEditRow key={it.id} it={it} onCancel={() => setEditId(null)} onSave={(patch) => { ctx.updateInventory(it.id, patch); setEditId(null); }} />;
            return (<div className="hz-invrow" key={it.id}>
              <Package size={16} className="hz-stock-ic" style={lowFlag ? { color: "var(--rose)" } : {}} />
              <div className="hz-load-main"><div className="hz-load-top"><b>{it.name}</b>{branch === "all" && <BranchTag b={it.branch} />}{lowFlag && <span className="hz-lowtag">low</span>}<span className="hz-stockval">{it.stock} {it.unit}</span>{c > 0 && <span className="hz-unitcost">~{rs(Math.round(c))}/{it.unit}</span>}</div>
                <div className={"hz-bar" + (lowFlag ? " warn" : "")}><span style={{ width: Math.min(100, (it.stock / max) * 100) + "%" }} /></div>
                <EditedBy item={it} /></div>
              <div className="hz-qadd2"><button onClick={() => ctx.addStock(it.id, 5)}>+5</button><button onClick={() => ctx.addStock(it.id, 10)}>+10</button></div>
              <div className="hz-macts"><button className="hz-mini" title="Edit item" onClick={() => setEditId(it.id)}><Pencil size={13} /></button><button className="hz-mini danger" title="Remove item" onClick={() => { if (confirm(`Remove "${it.name}" from inventory?`)) ctx.deleteInventory(it.id); }}><Trash2 size={13} /></button></div>
            </div>); })}
            {inv.length === 0 && <Empty text="No items yet — add one above." />}
          </div>
        </div>
        <div className="hz-card">
          <div className="hz-card-h"><h3>Stock purchases (maal)</h3><span className="hz-card-sub">money in for stock</span></div>
          <div className="hz-buysum"><div><span className="hz-buysum-l">This month</span><b>{rs(monthSpend)}</b></div><div><span className="hz-buysum-l">Today</span><b>{rs(todaySpend)}</b></div></div>
          <div className="hz-buyhist">
            {recent.length === 0 && <Empty text="No purchases logged. Add stock with a cost above." />}
            {recent.map((p) => <div className="hz-buyrow" key={p.id}><span className="hz-tq"><Boxes size={11} />{p.qty} {p.unit}</span><span className="hz-buyitem">{p.item}{branch === "all" && <BranchTag b={p.branch} />}</span><span className="hz-buycost">{rs(p.cost)}</span><span className="hz-buydate">{dayNum(p.date)} {monthShort(monthKey(p.date))}</span></div>)}
          </div>
        </div>
      </div>
    </>
  );
}
/* Inline editor for a stock item: name, unit, current quantity and the
   low-stock threshold that triggers the "low" warning. */
function InvEditRow({ it, onCancel, onSave }) {
  const [n, setN] = useState(it.name);
  const [u, setU] = useState(it.unit);
  const [st, setSt] = useState(String(it.stock));
  const [low, setLow] = useState(String(it.low));
  const ok = n.trim() && u.trim() && st !== "" && low !== "";
  return (
    <div className="hz-editrow">
      <div className="hz-editrow-h"><Pencil size={13} />Editing stock item</div>
      <div className="hz-form">
        <label>Item name<input value={n} onChange={(e) => setN(e.target.value)} /></label>
        <div className="hz-row2">
          <label>Unit<input value={u} onChange={(e) => setU(e.target.value)} placeholder="kg / pcs / L" /></label>
          <label>Current stock<input value={st} onChange={(e) => setSt(e.target.value.replace(/[^\d.]/g, ""))} /></label>
        </div>
        <label>Low-stock alert below<input value={low} onChange={(e) => setLow(e.target.value.replace(/[^\d.]/g, ""))} /></label>
        <div className="hz-corow2">
          <button className="hz-ghost" onClick={onCancel}><X size={14} />Cancel</button>
          <button className="hz-fulfill" disabled={!ok} onClick={() => onSave({ name: n.trim(), unit: u.trim(), stock: +st, low: +low })}><Check size={14} />Save changes</button>
        </div>
      </div>
    </div>
  );
}
function MenuManager({ ctx }) {
  const [editId, setEditId] = useState(null);   // which menu item is being edited
  const [name, setName] = useState(""); const [price, setPrice] = useState(""); const [cat, setCat] = useState("");
  const [desc, setDesc] = useState(""); const [img, setImg] = useState(""); const [brs, setBrs] = useState(["g91", "i8"]); const [err, setErr] = useState("");
  const cats = [...new Set(ctx.menu.map((m) => m.cat))];
  const onFile = (e) => { const f = e.target.files?.[0]; if (!f) return; if (f.size > 1.5 * 1024 * 1024) { setErr("Photo under 1.5MB please."); return; } const r = new FileReader(); r.onload = () => setImg(r.result); r.readAsDataURL(f); };
  const toggleBr = (b) => setBrs((p) => p.includes(b) ? (p.length > 1 ? p.filter((x) => x !== b) : p) : [...p, b]);
  const create = () => { if (!name.trim() || !(+price > 0) || !cat.trim()) { setErr("Name, valid price, and category are required."); return; } ctx.addMenuItem({ name: name.trim(), price: +price, cat: cat.trim(), desc: desc.trim(), img: img || "", branches: brs }); setName(""); setPrice(""); setDesc(""); setImg(""); setBrs(["g91", "i8"]); setErr(""); };
  return (
    <div className="hz-staffgrid">
      <div className="hz-card">
        <div className="hz-card-h"><h3>Add menu item</h3><span className="hz-card-sub"><ImagePlus size={13} /></span></div>
        <div className="hz-form">
          <label>Photo<label className="hz-upload">{img ? <img src={img} alt="preview" /> : <div className="hz-upload-ph"><ImagePlus size={26} /><span>Tap to upload photo</span></div>}<input type="file" accept="image/*" onChange={onFile} hidden /></label></label>
          <label>Item name<input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Chicken Karahi" /></label>
          <div className="hz-row2"><label>Price (Rs)<input value={price} onChange={(e) => setPrice(e.target.value.replace(/[^\d]/g, ""))} placeholder="0" /></label>
            <label>Category<input list="hz-cats" value={cat} onChange={(e) => setCat(e.target.value)} placeholder="Chinese / Fast Food…" /><datalist id="hz-cats">{cats.map((c) => <option key={c} value={c} />)}</datalist></label></div>
          <label>Available at branch
            <div className="hz-brchecks">{BRANCHES.map((b) => (
              <button key={b.id} className={"hz-brcheck" + (brs.includes(b.id) ? " on" : "")} onClick={() => toggleBr(b.id)}>{brs.includes(b.id) ? <Check size={13} /> : <Plus size={13} />}{b.name}</button>
            ))}</div>
          </label>
          <label>Description (optional)<input value={desc} onChange={(e) => setDesc(e.target.value)} placeholder="Short description" /></label>
          {err && <div className="hz-err"><CircleAlert size={13} />{err}</div>}
          <button className="hz-cta" onClick={create}><Plus size={15} />Add to menu</button>
        </div>
      </div>
      <div className="hz-card">
        <div className="hz-card-h"><h3>Menu items</h3><span className="hz-card-sub">{ctx.menu.length} items · tap branch to toggle</span></div>
        <div className="hz-stack">{ctx.menu.map((it) => (
          editId === it.id
            ? <MenuEditRow key={it.id} it={it} cats={cats} onCancel={() => setEditId(null)} onSave={(patch) => { ctx.updateMenuItem(it.id, patch); setEditId(null); }} />
            : (
          <div className={"hz-mitemrow" + (it.available ? "" : " off")} key={it.id}>
            <div className="hz-mitem-img">{it.img ? <img src={it.img} alt={it.name} /> : <span>{it.em}</span>}</div>
            <div className="hz-mitem-main"><div className="hz-mitem-top"><b>{it.name}</b><span className="hz-tag2">{it.cat}</span></div>
              <div className="hz-mitem-sub"><span className="hz-fcard-p">{rs(it.price)}</span>
                <div className="hz-brmini">{BRANCHES.map((b) => <button key={b.id} className={"hz-brmini-b" + (it.branches?.includes(b.id) ? " on" : "")} onClick={() => ctx.toggleMenuBranch(it.id, b.id)}>{b.name}</button>)}</div>
                {!it.available && <span className="hz-inactive">hidden</span>}</div>
              <EditedBy item={it} />
            </div>
            <div className="hz-macts"><button className="hz-mini" title="Edit item" onClick={() => setEditId(it.id)}><Pencil size={13} /></button><button className={"hz-toggle" + (it.available ? " on" : "")} onClick={() => ctx.toggleMenuItem(it.id)}><span className="hz-toggle-knob" /></button><button className="hz-mini danger" onClick={() => { if (confirm(`Delete "${it.name}" from the menu?`)) ctx.deleteMenuItem(it.id); }}><Trash2 size={13} /></button></div>
          </div>)
        ))}</div>
      </div>
    </div>
  );
}
/* Inline editor for one menu item: name, price, category and description. */
function MenuEditRow({ it, cats, onCancel, onSave }) {
  const [n, setN] = useState(it.name); const [p, setP] = useState(String(it.price));
  const [c, setC] = useState(it.cat); const [d, setD] = useState(it.desc || "");
  const ok = n.trim() && +p > 0 && c.trim();
  return (
    <div className="hz-editrow">
      <div className="hz-editrow-h"><Pencil size={13} />Editing menu item</div>
      <div className="hz-form">
        <label>Item name<input value={n} onChange={(e) => setN(e.target.value)} /></label>
        <div className="hz-row2">
          <label>Price (Rs)<input value={p} onChange={(e) => setP(e.target.value.replace(/[^\d]/g, ""))} /></label>
          <label>Category<input list="hz-cats" value={c} onChange={(e) => setC(e.target.value)} /><datalist id="hz-cats">{cats.map((x) => <option key={x} value={x} />)}</datalist></label>
        </div>
        <label>Description<input value={d} onChange={(e) => setD(e.target.value)} placeholder="Short description" /></label>
        <div className="hz-corow2">
          <button className="hz-ghost" onClick={onCancel}><X size={14} />Cancel</button>
          <button className="hz-fulfill" disabled={!ok} onClick={() => onSave({ name: n.trim(), price: +p, cat: c.trim(), desc: d.trim() })}><Check size={14} />Save changes</button>
        </div>
      </div>
    </div>
  );
}
function PinCell({ pin }) {
  const [show, setShow] = useState(false);
  return <button className="hz-pincell" onClick={() => setShow((v) => !v)} title={show ? "Hide PIN" : "Show PIN"}>{show ? pin : "••••"}</button>;
}
/* Staff accounts: create people, switch them between On duty / On leave
   (someone on leave stops receiving auto-assigned orders and cannot sign in),
   and remove them. Kitchen staff are created without login details. */
function StaffUsers({ ctx, isAdmin, myBranch, branch }) {
  const scope = isAdmin ? branch : myBranch;        // "all" | "g91" | "i8"
  const [editId, setEditId] = useState(null);       // which staff row is being edited
  const defBranch = scope === "all" ? "g91" : scope;
  const [name, setName] = useState(""); const [role, setRole] = useState("waiter"); const [cbranch, setCbranch] = useState(defBranch);
  const [username, setUsername] = useState(""); const [pin, setPin] = useState(""); const [salary, setSalary] = useState(""); const [err, setErr] = useState("");
  const roles = isAdmin ? ["waiter", "rider", "kitchen", "cashier", "manager", "admin"] : ["waiter", "rider", "kitchen", "cashier"];
  const noLogin = NO_LOGIN_ROLES.includes(role);
  const list = ctx.users.filter((u) => scope === "all" ? true : u.branch === scope);
  const create = () => {
    if (!name.trim()) { setErr("Name is required."); return; }
    if (!noLogin) {
      if (!username.trim()) { setErr("A username is required."); return; }
      const problem = pinProblem(pin);
      if (problem) { setErr(problem); return; }
      if (ctx.users.some((u) => u.username.toLowerCase() === username.trim().toLowerCase())) { setErr("That username already exists."); return; }
    }
    const b = role === "admin" ? "all" : (isAdmin ? (scope === "all" ? cbranch : scope) : myBranch);
    const uname = noLogin ? "kt" + now().toString().slice(-6) : username.trim().toLowerCase();
    ctx.addUser({ name: name.trim(), username: uname, pin: noLogin ? "----" : pin.trim(), role, branch: b, salary: +salary || 0 });
    setName(""); setUsername(""); setPin(""); setSalary(""); setErr("");
  };
  return (
    <div className="hz-staffgrid">
      <div className="hz-card">
        <div className="hz-card-h"><h3>Create staff account<InfoTip label="About staff accounts">
          <b>Customers never get accounts</b> — they order online, from their car, or by scanning a QR code.<br /><br />
          <b>Staff sign-in is hidden from customers.</b> Your team can open <b>{(typeof window !== "undefined" ? window.location.host : "yourdomain.com")}/admin</b> — <b>/waiter</b>, <b>/rider</b>, <b>/manager</b> and <b>/cashier</b> all open the same screen.<br /><br />
          Another way in: tap the logo 5 times on the home page.
        </InfoTip></h3><span className="hz-card-sub"><UserPlus size={13} />{scope !== "all" ? branchName(scope) : ""}</span></div>
        <div className="hz-form">
          <label>Full name<input value={name} onChange={(e) => { setName(e.target.value); if (!username) setUsername(e.target.value.toLowerCase().replace(/\s+/g, "")); }} placeholder="e.g. Hamza Khan" /></label>
          <label>Role<div className="hz-rolepick">{roles.map((r) => (
            <button key={r} className={"hz-rp" + (role === r ? " on" : "")} onClick={() => setRole(r)} style={role === r ? { borderColor: ROLE_META[r].color, color: ROLE_META[r].color } : {}}>{React.createElement(ROLE_META[r].icon, { size: 14 })}{ROLE_META[r].label}</button>
          ))}</div></label>
          {role !== "admin" && isAdmin && scope === "all" && <label>Branch<div className="hz-segt sm" style={{ margin: 0 }}>{BRANCHES.map((b) => <button key={b.id} className={cbranch === b.id ? "on" : ""} onClick={() => setCbranch(b.id)}>{b.name}</button>)}</div></label>}
          {role !== "admin" && scope !== "all" && <div className="hz-branchnote"><Building2 size={12} />New account → <b>{branchName(scope)}</b></div>}
          {noLogin
            ? <div className="hz-branchnote"><ChefHat size={12} />Payroll only — no login<InfoTip label="About kitchen staff">Kitchen staff are payroll-only records. They have no username, PIN, or dashboard — you only set their salary and manage it in Payroll.</InfoTip></div>
            : <div className="hz-row2"><label>Username<input value={username} onChange={(e) => setUsername(e.target.value)} placeholder="hamza" /></label><label>PIN (6 digits recommended)<input type="password" value={pin} maxLength={8} onChange={(e) => setPin(e.target.value.replace(/\D/g, ""))} placeholder="••••••" /></label></div>}
          <label>Monthly salary (Rs, optional)<input value={salary} onChange={(e) => setSalary(e.target.value.replace(/[^\d]/g, ""))} placeholder="0" /></label>
          {err && <div className="hz-err"><CircleAlert size={13} />{err}</div>}
          <button className="hz-cta" onClick={create}><UserPlus size={15} />Create account</button>

        </div>
      </div>
      <div className="hz-card">
        <div className="hz-card-h"><h3>Staff accounts</h3><span className="hz-card-sub">{list.length} {scope === "all" ? "total" : branchName(scope)}</span></div>
        <div className="hz-stack">
          {list.length === 0 && <Empty text="No staff in this branch yet." />}
          {list.map((u) => (
          editId === u.id
            ? <StaffEditRow key={u.id} u={u} roles={roles} isAdmin={isAdmin} onCancel={() => setEditId(null)} onSave={(patch) => { if (ctx.updateUser(u.id, patch) !== false) setEditId(null); }} />
            : (
          <div className={"hz-userrow" + (u.active ? "" : " off")} key={u.id}>
            <span className="hz-wp-av sm" style={{ background: `linear-gradient(135deg, ${ROLE_META[u.role].color}, var(--saffron))` }}>{u.name[0]}</span>
            <div className="hz-user-main"><div className="hz-user-top"><b>{u.name}</b><span className="hz-demobadge" style={{ color: ROLE_META[u.role].color, background: ROLE_META[u.role].color + "1e" }}>{ROLE_META[u.role].label}</span>{u.branch !== "all" && <BranchTag b={u.branch} />}</div>
              <div className="hz-user-cred">{NO_LOGIN_ROLES.includes(u.role) ? <><Wallet size={11} />payroll only · no login</> : <><User size={11} />{u.username} <Lock size={11} /><PinCell pin={u.pin} /></>}{u.salary > 0 && <span className="hz-salchip">{rs(u.salary)}/mo</span>}</div>
              <EditedBy item={u} /></div>
            <div className="hz-dutywrap">
              <span className={"hz-dutytag " + (u.active ? "on" : "off")}>{u.active ? "On duty" : "On leave"}</span>
              <button className={"hz-toggle" + (u.active ? " on" : "")} title={u.active ? "Mark on leave" : "Mark on duty"} onClick={() => { ctx.toggleUser(u.id); ctx.toast(`${u.name} → ${u.active ? "On leave" : "On duty"}`, u.active ? "#FF5470" : "#29D3A6"); }}><span className="hz-toggle-knob" /></button>
              <button className="hz-mini" title="Edit staff" onClick={() => setEditId(u.id)}><Pencil size={13} /></button>
              <button className="hz-mini danger" title="Delete staff" onClick={() => { if (confirm(`Delete ${u.name}'s account? This cannot be undone.`)) ctx.deleteUser(u.id); }}><Trash2 size={13} /></button>
            </div>
          </div>)
        ))}</div>
      </div>
    </div>
  );
}
/* Inline editor for a staff member: name, login details, role and salary.
   Kitchen staff have no login, so those fields are hidden for them. */
function StaffEditRow({ u, roles, isAdmin, onCancel, onSave }) {
  const [n, setN] = useState(u.name);
  const [un, setUn] = useState(u.username);
  const [pin, setPin] = useState(u.pin === "----" ? "" : u.pin);
  const [role, setRole] = useState(u.role);
  const [sal, setSal] = useState(String(u.salary || ""));
  const [br, setBr] = useState(u.branch);
  const noLogin = NO_LOGIN_ROLES.includes(role);
  const ok = n.trim() && (noLogin || (un.trim() && pin.trim().length >= 4));
  const save = () => onSave({
    name: n.trim(), role, branch: role === "admin" ? "all" : br,
    username: noLogin ? u.username : un.trim().toLowerCase(),
    pin: noLogin ? "----" : pin.trim(),
    salary: +sal || 0,
  });
  return (
    <div className="hz-editrow">
      <div className="hz-editrow-h"><Pencil size={13} />Editing staff member</div>
      <div className="hz-form">
        <label>Full name<input value={n} onChange={(e) => setN(e.target.value)} /></label>
        {isAdmin && <label>Role<div className="hz-rolepick">{roles.map((r) => (
          <button key={r} className={"hz-rp" + (role === r ? " on" : "")} onClick={() => setRole(r)} style={role === r ? { borderColor: ROLE_META[r].color, color: ROLE_META[r].color } : {}}>{React.createElement(ROLE_META[r].icon, { size: 14 })}{ROLE_META[r].label}</button>
        ))}</div></label>}
        {isAdmin && role !== "admin" && <label>Branch<div className="hz-segt sm" style={{ margin: 0 }}>{BRANCHES.map((b) => <button key={b.id} className={br === b.id ? "on" : ""} onClick={() => setBr(b.id)}>{b.name}</button>)}</div></label>}
        {noLogin
          ? <div className="hz-branchnote"><ChefHat size={12} />Payroll only — no username or PIN</div>
          : <div className="hz-row2"><label>Username<input value={un} onChange={(e) => setUn(e.target.value)} /></label><label>PIN<input value={pin} maxLength={6} onChange={(e) => setPin(e.target.value.replace(/\D/g, ""))} /></label></div>}
        <label>Monthly salary (Rs)<input value={sal} onChange={(e) => setSal(e.target.value.replace(/[^\d]/g, ""))} placeholder="0" /></label>
        <div className="hz-corow2">
          <button className="hz-ghost" onClick={onCancel}><X size={14} />Cancel</button>
          <button className="hz-fulfill" disabled={!ok} onClick={save}><Check size={14} />Save changes</button>
        </div>
      </div>
    </div>
  );
}
/* Monthly payroll: set a salary, record advances, and mark any month paid or
   unpaid for each staff member (kitchen staff included). */
function Payroll({ ctx, isAdmin, myBranch, branch }) {
  const [edit, setEdit] = useState(null); // {id, mode:'salary'|'advance'|'paymonth'}
  const [val, setVal] = useState(""); const [note, setNote] = useState(""); const [pm, setPm] = useState("");
  const staff = ctx.users.filter((u) => u.role !== "admin" && (isAdmin ? (branch === "all" || u.branch === branch) : u.branch === myBranch));
  const curKey = monthKey(now());
  const totSal = staff.reduce((a, b) => a + (b.salary || 0), 0);
  const totAdv = staff.reduce((a, b) => a + advTotal(b), 0);
  const pendingThisMonth = staff.filter((u) => !paidMonths(u).has(curKey)).reduce((a, b) => a + (b.salary || 0), 0);
  const open = (u, mode) => { setEdit({ id: u.id, mode }); setVal(mode === "paymonth" ? String(u.salary || "") : ""); setNote(""); setPm(curKey); };
  const save = (u) => {
    const amt = +val;
    if (edit.mode === "salary") { if (!(amt > 0)) return; ctx.setSalary(u.id, amt); }
    else if (edit.mode === "advance") { if (!(amt > 0)) return; ctx.addAdvance(u.id, amt, note.trim()); }
    else if (edit.mode === "paymonth") { if (!(amt > 0) || !pm) return; ctx.paySalary(u.id, pm, amt); }
    setEdit(null); setVal(""); setNote("");
  };
  const scopeLabel = (isAdmin ? branch : myBranch) === "all" ? "all branches" : branchName(isAdmin ? branch : myBranch);
  return (
    <>
      <div className="hz-mkpis">
        <Kpi icon={Wallet} label="Monthly Payroll" val={rs(totSal)} c="#5A9CFF" />
        <Kpi icon={Receipt} label={`${monthShort(curKey)} Pending`} val={rs(pendingThisMonth)} c="#FF5470" />
        <Kpi icon={Banknote} label="Advances Out" val={rs(totAdv)} c="#FFB22C" />
      </div>
      <div className="hz-card">
        <div className="hz-card-h"><h3>Payroll · {scopeLabel}</h3><span className="hz-card-sub">{staff.length} staff · tap a month or use “Add salary”</span></div>
        <div className="hz-stack">
          {staff.length === 0 && <Empty text="No staff in this branch." />}
          {staff.map((u) => {
            const isEdit = edit?.id === u.id; const paid = paidMonths(u);
            const display = monthsBetween(u.joined || now(), now() + 70 * 864e5).filter((m, idx, arr) => arr.indexOf(m) === idx);
            (u.payments || []).forEach((p) => { if (!display.includes(p.month)) display.push(p.month); });
            display.sort();
            const monthsToNow = monthsBetween(u.joined || now());
            const paidCount = monthsToNow.filter((m) => paid.has(m)).length;
            const owed = monthsToNow.filter((m) => !paid.has(m)).length * (u.salary || 0);
            return (
              <div className="hz-payrow" key={u.id}>
                <div className="hz-payrow-top">
                  <span className="hz-wp-av sm" style={{ background: `linear-gradient(135deg, ${ROLE_META[u.role].color}, var(--saffron))` }}>{u.name[0]}</span>
                  <div className="hz-pay-id"><b>{u.name}</b><span className="hz-demobadge" style={{ color: ROLE_META[u.role].color, background: ROLE_META[u.role].color + "1e" }}>{ROLE_META[u.role].label}</span>{u.branch !== "all" && <BranchTag b={u.branch} />}<span className="hz-joined">joined {monthLong(monthKey(u.joined || now()))}</span></div>
                  <div className="hz-pay-nums">
                    <div className="hz-pay-num"><span>Salary/mo</span><b>{u.salary ? rs(u.salary) : "—"}</b></div>
                    <div className="hz-pay-num"><span>Paid</span><b className="rem">{paidCount}/{monthsToNow.length}</b></div>
                    <div className="hz-pay-num"><span>Owed</span><b className="adv">{rs(owed)}</b></div>
                  </div>
                </div>

                <div className="hz-months">
                  {display.map((m) => { const isP = paid.has(m); const cur = m === curKey;
                    return <button key={m} className={"hz-month" + (isP ? " paid" : "") + (cur ? " cur" : "")} onClick={() => isP ? ctx.unpaySalary(u.id, m) : ctx.paySalary(u.id, m, u.salary || 0)} title={isP ? "Paid — tap to undo" : "Tap to mark paid"}>
                      {isP ? <Check size={11} /> : <Banknote size={11} />}{monthShort(m)} {m.split("-")[0].slice(2)}{cur ? " •" : ""}
                    </button>;
                  })}
                </div>

                {u.advances?.length > 0 && <div className="hz-advlist"><span className="hz-advlbl">Advances:</span>{u.advances.map((a) => <span key={a.id} className="hz-advchip"><Banknote size={11} />{rs(a.amount)}{a.note ? ` · ${a.note}` : ""}</span>)}</div>}

                {isEdit ? (
                  <div className="hz-payedit">
                    {edit.mode === "paymonth" && <div className="hz-monthpick">
                      <span className="hz-monthpick-l"><Clock size={12} />Month</span>
                      <input type="month" className="hz-monthin" value={pm} onChange={(e) => setPm(e.target.value)} />
                      {pm && paid.has(pm) && <span className="hz-paidnote">already paid — amount will update</span>}
                    </div>}
                    <input autoFocus value={val} onChange={(e) => setVal(e.target.value.replace(/[^\d]/g, ""))} placeholder={edit.mode === "salary" ? "Monthly salary (Rs)" : edit.mode === "advance" ? "Advance amount (Rs)" : "Amount paid (Rs)"} />
                    {edit.mode === "advance" && <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Note (optional)" />}
                    <button className="hz-fulfill" disabled={edit.mode === "paymonth" && !pm} onClick={() => save(u)}><Check size={13} />{edit.mode === "paymonth" ? "Pay" : "Save"}</button>
                    <button className="hz-mini" onClick={() => setEdit(null)}><X size={13} /></button>
                  </div>
                ) : (
                  <div className="hz-payacts">
                    <button className="hz-paybtn2 pay" onClick={() => open(u, "paymonth")}><Banknote size={13} />Add salary (month)</button>
                    <button className="hz-paybtn2" onClick={() => open(u, "salary")}><Wallet size={13} />Set salary</button>
                    <button className="hz-paybtn2 adv" onClick={() => open(u, "advance")}><Plus size={13} />Add advance</button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </>
  );
}
/* ----------------------------- QR Codes --------------------------- */
/* QR generator. Table QRs encode `?b=<branch>&t=<table>`; car QRs encode
   `?b=<branch>&m=car&spot=<spot>`. Scanning opens this app with the branch and
   table/car already set, so the order arrives tagged to that table or car. */
function QRCodes({ ctx, isAdmin, myBranch, branch, onPreview }) {
  const scope = isAdmin ? branch : myBranch;
  // QR links must always point at the site root (never at /admin, where staff are).
  const [base, setBase] = useState(() => { try { const o = window.location.origin; return o && o.startsWith("http") ? o + "/" : "https://order.thehunzasizzle.pk"; } catch (e) { return "https://order.thehunzasizzle.pk"; } });
  const [qbranch, setQbranch] = useState(scope === "all" ? "g91" : scope);
  const [kind, setKind] = useState("table"); // table | car
  const [table, setTable] = useState("");
  const [spot, setSpot] = useState("");
  const [count, setCount] = useState("6");
  const [imgErr, setImgErr] = useState(false);
  const activeBranch = scope === "all" ? qbranch : scope;
  const sep = (u) => u.includes("?") ? "&" : "?";
  const tableLink = (b, t) => `${base}${sep(base)}b=${b}${t ? "&t=" + t : ""}`;
  const carLink = (b, s) => `${base}${sep(base)}b=${b}&m=car${s ? "&spot=" + s : ""}`;
  const link = kind === "car" ? carLink(activeBranch, spot.trim()) : tableLink(activeBranch, table.trim());
  const qrSrc = (data, size) => `https://api.qrserver.com/v1/create-qr-code/?size=${size}x${size}&margin=10&qzone=1&data=${encodeURIComponent(data)}`;
  const copy = () => { try { navigator.clipboard.writeText(link); ctx.toast("Link copied", "#5A9CFF"); } catch (e) { ctx.toast("Copy failed — select manually", "#FF5470"); } };
  const preview = () => kind === "car" ? onPreview(activeBranch, { kind: "car", spot: spot.trim() }) : onPreview(activeBranch, { kind: "dine", table: table.trim() });
  const n = Math.min(12, Math.max(1, +count || 6));
  const slots = Array.from({ length: n }, (_, i) => String(i + 1));
  const subLabel = kind === "car" ? `Curbside${spot ? " · Spot " + spot : ""}` : (table ? `Table ${table}` : "branch-wide");
  return (
    <>
      <div className="hz-qrhead"><QrCode size={15} /><div><b>Scan-to-order QR codes<InfoTip label="How scan-to-order works">A separate QR for every table (dine-in) or car (curbside).<br /><br />Scanning opens that branch's order page with the {kind === "car" ? "car order" : "table"} already set, and the order then shows against that {kind === "car" ? "car" : "table"} for Admin and Manager.</InfoTip></b><span>Generate a QR for each table or parking spot.</span></div></div>

      <div className="hz-segt wide" style={{ maxWidth: 360, marginBottom: 14 }}>
        <button className={kind === "table" ? "on" : ""} onClick={() => { setKind("table"); setImgErr(false); }}><QrCode size={14} />Table QR</button>
        <button className={kind === "car" ? "on" : ""} onClick={() => { setKind("car"); setImgErr(false); }}><Car size={14} />Car QR</button>
      </div>

      <div className="hz-staffgrid">
        <div className="hz-card">
          <div className="hz-card-h"><h3>{kind === "car" ? "Car QR settings" : "Table QR settings"}<InfoTip label="About the app link">
            Enter the URL where this app is hosted (your domain). Every QR points there.<br /><br />
            Use <b>Preview as customer</b> to see exactly what a scan opens.
          </InfoTip></h3><span className="hz-card-sub">{branchName(activeBranch)}</span></div>
          <div className="hz-form">
            <label><span><Navigation size={12} /> App link (where the QR points)</span><input value={base} onChange={(e) => { setBase(e.target.value); setImgErr(false); }} placeholder="https://your-app-url" /></label>

            {scope === "all" && <label>Branch<div className="hz-segt sm" style={{ margin: 0 }}>{BRANCHES.map((b) => <button key={b.id} className={qbranch === b.id ? "on" : ""} onClick={() => { setQbranch(b.id); setImgErr(false); }}>{b.name}</button>)}</div></label>}
            {kind === "table"
              ? <label>Table number (optional)<input value={table} onChange={(e) => { setTable(e.target.value.replace(/[^\dA-Za-z-]/g, "")); setImgErr(false); }} placeholder="e.g. 1  (blank = branch-wide)" /></label>
              : <label>Parking spot / lane (optional)<input value={spot} onChange={(e) => { setSpot(e.target.value.replace(/[^\dA-Za-z-]/g, "")); setImgErr(false); }} placeholder="e.g. P5  (blank = any spot)" /></label>}
          </div>
        </div>
        <div className="hz-card hz-qrprev">
          <div className="hz-card-h"><h3>Your QR code<InfoTip label="Where to put this QR">{kind === "car" ? "Display the car QR at the parking area or counter so customers can scan from their car." : "Place the table QR on that table so seated customers can scan it and order from their seat."}</InfoTip></h3><span className="hz-card-sub">{branchName(activeBranch)} · {subLabel}</span></div>
          <div className="hz-qrframe">
            {imgErr
              ? <div className="hz-qrfallback"><QrCode size={64} /><span>The QR preview needs an internet connection. Copy the link below and use it in any QR generator.</span></div>
              : <img className="hz-qrimg" src={qrSrc(link, 240)} alt="QR code" onError={() => setImgErr(true)} />}
          </div>
          <div className="hz-qrlink"><span>{link}</span></div>
          <div className="hz-qracts">
            <button className="hz-cta sm" onClick={preview}><Play size={14} />Preview as customer</button>
            <button className="hz-ghost" onClick={copy}><ClipboardList size={14} />Copy link</button>
          </div>

        </div>
      </div>

      <div className="hz-card" style={{ marginTop: 14 }}>
        <div className="hz-card-h"><h3>Quick {kind === "car" ? "car-spot" : "table"} QR codes · {branchName(activeBranch)}</h3>
          <span className="hz-card-sub">{kind === "car" ? "spots" : "tables"}&nbsp;<input className="hz-countin" value={count} onChange={(e) => setCount(e.target.value.replace(/[^\d]/g, ""))} /></span></div>
        <div className="hz-qrgrid">
          {slots.map((t) => { const lnk = kind === "car" ? carLink(activeBranch, t) : tableLink(activeBranch, t);
            return (
              <div className="hz-qrcell" key={t}>
                <div className="hz-qrcell-top">{kind === "car" ? "Spot " : "Table "}{t}</div>
                {imgErr ? <div className="hz-qrcell-fb"><QrCode size={34} /></div> : <img src={qrSrc(lnk, 130)} alt={"QR " + t} onError={() => setImgErr(true)} />}
                <button className="hz-mini" onClick={() => kind === "car" ? onPreview(activeBranch, { kind: "car", spot: t }) : onPreview(activeBranch, { kind: "dine", table: t })}><Play size={13} /></button>
              </div>
            );
          })}
        </div>
      </div>
    </>
  );
}
/* ------------------------- Print receipts ------------------------ */
/* Receipt printing. Two separate receipts are rendered:
   1. Kitchen ticket — items only, deliberately without prices.
   2. Customer bill  — full details and prices (address for delivery, table for
      dine-in, vehicle and spot for curbside), plus fee and tax.
   The chosen one is printed via CSS `@media print` rules. */
function PrintModal({ order: o, onClose }) {
  const [which, setWhich] = useState("both");
  const T = typeMeta(o);
  const fee = o.fee != null ? o.fee : (o.type === "delivery" ? 120 : 0);
  const tax = o.tax || 0;
  const tRate = o.taxRate || 0;
  const subtotal = total(o);
  const when = new Date(o.createdAt).toLocaleString("en-GB", { day: "2-digit", month: "short", year: "numeric", hour: "numeric", minute: "2-digit" });
  const typeLabel = o.type === "delivery" ? "Delivery" : o.type === "takeaway" ? "Pickup" : o.type === "carhop" ? "Curbside" : "Dine-in";
  const printAs = (w) => { setWhich(w); setTimeout(() => window.print(), 60); };
  return (
    <div className={"hz-printroot show-" + which} onClick={onClose}>
      <div className="hz-print-toolbar" onClick={(e) => e.stopPropagation()}>
        <span><Receipt size={15} />Order #{o.q} · {branchName(o.branch)}</span>
        <div className="hz-print-btns">
          <button className="hz-printbtn kit" onClick={() => printAs("kitchen")}><ChefHat size={14} />Print Kitchen Ticket</button>
          <button className="hz-printbtn bill" onClick={() => printAs("bill")}><Receipt size={14} />Print Customer Bill</button>
          <button className="hz-ghost" onClick={() => printAs("both")}>Print both</button>
          <button className="hz-ghost close" onClick={onClose}><X size={14} />Close</button>
        </div>
      </div>
      <div className="hz-receipts" onClick={(e) => e.stopPropagation()}>
        {/* 1) KITCHEN TICKET — no prices */}
        <div className="hz-receipt kitchen">
          <div className="hz-rc-tag">KITCHEN COPY</div>
          <div className="hz-rc-title">KITCHEN TICKET</div>
          <div className="hz-rc-sub">The Hunza Sizzle · {branchName(o.branch)}</div>
          <div className="hz-rc-hr" />
          <div className="hz-rc-row"><span>Order</span><b>#{o.q}</b></div>
          <div className="hz-rc-row"><span>Type</span><b>{typeLabel}</b></div>
          <div className="hz-rc-row"><span>{o.type === "dinein" ? "Table" : o.type === "carhop" ? "Vehicle" : o.type === "delivery" ? "For" : "Name"}</span><b>{o.type === "dinein" ? (o.table || "—") : o.type === "carhop" ? `${o.vehicle} · ${o.spot}` : o.customer}</b></div>
          <div className="hz-rc-row"><span>Time</span><b>{clock(o.createdAt)}</b></div>
          <div className="hz-rc-hr" />
          <table className="hz-rc-items"><tbody>
            {o.items.map((i, k) => <tr key={k}><td className="qty">{i.qty}×</td><td>{i.name}</td></tr>)}
          </tbody></table>
          {o.notes && <><div className="hz-rc-hr" /><div className="hz-rc-note">NOTE: {o.notes}</div></>}
          <div className="hz-rc-hr" />
          <div className="hz-rc-foot">** NO PRICES — KITCHEN COPY **</div>
        </div>

        {/* 2) CUSTOMER BILL — full details + prices */}
        <div className="hz-receipt bill">
          <div className="hz-rc-tag alt">CUSTOMER COPY</div>
          <div className="hz-rc-title big">The Hunza Sizzle</div>
          <div className="hz-rc-sub">{branchName(o.branch)} · {BRANCHES.find((b) => b.id === o.branch)?.addr}</div>
          <div className="hz-rc-sub">Sales Receipt</div>
          <div className="hz-rc-hr" />
          <div className="hz-rc-row"><span>Order</span><b>#{o.q}</b></div>
          <div className="hz-rc-row"><span>Date</span><b>{when}</b></div>
          <div className="hz-rc-row"><span>Type</span><b>{typeLabel}</b></div>
          <div className="hz-rc-row"><span>Customer</span><b>{o.customer}</b></div>
          {o.type === "dinein" && <div className="hz-rc-row"><span>Table No.</span><b>{o.table || "—"}</b></div>}
          {o.type === "carhop" && <div className="hz-rc-row"><span>Vehicle</span><b>{o.vehicle} · {o.spot}</b></div>}
          {o.phone && <div className="hz-rc-row"><span>Phone</span><b>{o.phone}</b></div>}
          {o.type === "delivery" && <div className="hz-rc-row"><span>Address</span><b className="addr">{o.address || "—"}</b></div>}
          <div className="hz-rc-row"><span>Handled by</span><b>{o.waiter}</b></div>
          <div className="hz-rc-hr" />
          <table className="hz-rc-items"><tbody>
            <tr className="head"><td className="qty">Qty</td><td>Item</td><td className="amt">Amount</td></tr>
            {o.items.map((i, k) => <tr key={k}><td className="qty">{i.qty}×</td><td>{i.name}</td><td className="amt">{rs(i.price * i.qty)}</td></tr>)}
          </tbody></table>
          <div className="hz-rc-hr" />
          <div className="hz-rc-row"><span>Subtotal</span><b>{rs(subtotal)}</b></div>
          {fee > 0 && <div className="hz-rc-row"><span>Delivery fee</span><b>{rs(fee)}</b></div>}
          {tax > 0 && <div className="hz-rc-row"><span>Sales tax ({Math.round(tRate * 100)}%)</span><b>{rs(tax)}</b></div>}
          <div className="hz-rc-row total"><span>TOTAL</span><b>{rs(subtotal + fee + tax)}</b></div>
          <div className="hz-rc-row"><span>Payment</span><b>{(o.payMethod === "card" ? "CARD/ONLINE · " : o.payMethod ? "CASH · " : "") + (o.payment === "paid" ? "PAID" : "UNPAID")}</b></div>
          <div className="hz-rc-hr" />
          <div className="hz-rc-foot">Thank you for choosing The Hunza Sizzle!<br />Chinese &amp; Fast Food · Islamabad</div>
        </div>
      </div>
    </div>
  );
}
/* ------------------------------- CSS ------------------------------ */
const CSS = `
@import url('https://fonts.googleapis.com/css2?family=Bricolage+Grotesque:opsz,wght@12..96,600;12..96,700;12..96,800&family=JetBrains+Mono:wght@400;500;700&family=Plus+Jakarta+Sans:wght@400;500;600;700&display=swap');
.hz{--fd:'Bricolage Grotesque',sans-serif;--fb:'Plus Jakarta Sans',sans-serif;--fm:'JetBrains Mono',monospace;font-family:var(--fb);color:var(--text);background:var(--bg);min-height:100vh;-webkit-font-smoothing:antialiased;}
.hz *{box-sizing:border-box;}
.hz[data-theme="dark"]{--bg:#141110;--bg2:#1C1815;--surface:#1F1A16;--surface2:#262019;--border:rgba(255,255,255,.08);--text:#F6EFE6;--muted:#A6968A;--ember:#FF6B2C;--saffron:#FFB22C;--jade:#29D3A6;--rose:#FF5470;--glass:rgba(28,24,21,.8);}
.hz[data-theme="light"]{--bg:#F4EEE3;--bg2:#FBF7EF;--surface:#FFFFFF;--surface2:#FBF6EE;--border:rgba(20,17,16,.09);--text:#2A211B;--muted:#7A6C60;--ember:#E85518;--saffron:#E08A00;--jade:#0E9E78;--rose:#E23B57;--glass:rgba(255,255,255,.82);}
.hz button{font-family:inherit;cursor:pointer;border:none;background:none;color:inherit;}
.hz input,.hz select{font-family:inherit;}
.hz h1,.hz h2,.hz h3{margin:0;font-family:var(--fd);letter-spacing:-.02em;}

.hz-logo{width:34px;height:34px;border-radius:10px;display:grid;place-items:center;color:#fff;background:linear-gradient(135deg,var(--ember),var(--saffron));box-shadow:0 5px 16px -6px var(--ember);flex-shrink:0;animation:flameFlick 3.4s ease-in-out infinite;}
.hz-logo.lg{width:58px;height:58px;border-radius:16px;}
.hz-bn{font-family:var(--fd);font-weight:800;font-size:15px;line-height:1;}
.hz-bn.lg{font-size:26px;margin-top:14px;}
.hz-bn span{background:linear-gradient(135deg,var(--ember),var(--saffron));-webkit-background-clip:text;background-clip:text;-webkit-text-fill-color:transparent;}
.hz-bs{font-size:10.5px;color:var(--muted);text-transform:uppercase;letter-spacing:.06em;margin-top:3px;}

.hz-login{min-height:100vh;display:flex;flex-direction:column;align-items:center;justify-content:center;padding:30px 18px;position:relative;overflow:hidden;}
.hz-login-theme{position:absolute;top:18px;right:18px;z-index:2;}
.hz-login-brand{text-align:center;margin-bottom:22px;}
.hz-login-sub{font-size:13px;color:var(--muted);margin-top:8px;}
.hz-loginbox{width:100%;max-width:370px;background:var(--surface);border:1px solid var(--border);border-radius:18px;padding:18px;}
.hz-err{display:flex;align-items:center;gap:6px;font-size:12px;color:var(--rose);background:color-mix(in srgb,var(--rose) 12%,transparent);padding:9px 11px;border-radius:9px;}
.hz-demohint{margin-top:6px;border-top:1px solid var(--border);padding-top:12px;}
.hz-demohint>b{font-size:11px;text-transform:uppercase;letter-spacing:.05em;color:var(--muted);}
.hz-demolist{display:flex;flex-direction:column;gap:6px;margin-top:8px;max-height:188px;overflow-y:auto;}
.hz-demorow{display:flex;align-items:center;gap:8px;padding:8px 10px;border-radius:9px;background:var(--surface2);border:1px solid var(--border);font-size:12px;font-family:var(--fm);color:var(--muted);text-align:left;transition:.15s;}
.hz-demorow:hover{border-color:var(--ember);color:var(--text);}
.hz-demobadge{font-family:var(--fb);font-size:9.5px;font-weight:700;padding:2px 7px;border-radius:5px;text-transform:uppercase;letter-spacing:.03em;}
.hz-demobr{margin-left:auto;font-size:10px;opacity:.7;}
.hz-custlogin{text-align:center;padding:8px 4px;}
.hz-qrbox{width:104px;height:104px;border-radius:18px;margin:6px auto 14px;display:grid;place-items:center;color:var(--ember);background:var(--surface2);border:1.5px dashed color-mix(in srgb,var(--ember) 45%,var(--border));}
.hz-scan-t{font-family:var(--fd);font-weight:700;font-size:15px;}
.hz-scan-s{font-size:12px;color:var(--muted);margin:5px 0 0;}
.hz-onlinecta{width:100%;max-width:370px;margin-top:14px;display:flex;align-items:center;gap:13px;padding:15px 17px;border-radius:16px;background:linear-gradient(135deg,var(--ember),var(--saffron));color:#fff;box-shadow:0 14px 32px -12px var(--ember);transition:transform .15s,filter .2s;}
.hz-onlinecta:hover{filter:brightness(1.05);}.hz-onlinecta:active{transform:scale(.98);}
.hz-onlinecta-ic{width:42px;height:42px;border-radius:12px;background:rgba(255,255,255,.2);display:grid;place-items:center;flex-shrink:0;}
.hz-onlinecta b{display:block;font-size:15px;font-family:var(--fd);}.hz-onlinecta span{font-size:12px;opacity:.92;}
.hz-onlinecta>svg:last-child{margin-left:auto;}
.hz-login-foot{font-size:11.5px;color:var(--muted);margin-top:18px;text-align:center;max-width:370px;}

.hz-bar{position:sticky;top:0;z-index:30;display:flex;align-items:center;gap:14px;padding:11px 16px;background:var(--glass);backdrop-filter:blur(14px);border-bottom:1px solid var(--border);}
.hz-brand{display:flex;align-items:center;gap:10px;}
.hz-ident{display:inline-flex;align-items:center;gap:8px;padding:6px 12px;border-radius:99px;font-size:12.5px;font-weight:600;background:var(--surface);border:1px solid var(--border);}
.hz-ident-ic{color:var(--ember);display:grid;place-items:center;}
.hz-bar-r{margin-left:auto;display:flex;align-items:center;gap:8px;}
.hz-ctl{display:inline-flex;align-items:center;gap:6px;padding:8px 12px;border-radius:10px;font-size:12.5px;font-weight:600;background:var(--surface);border:1px solid var(--border);color:var(--text);transition:.15s;}
.hz-ctl:hover{border-color:var(--ember);}
.hz-ctl.on{color:#fff;background:linear-gradient(135deg,var(--ember),var(--saffron));border-color:transparent;}
.hz-icbtn{width:36px;height:36px;border-radius:10px;display:grid;place-items:center;background:var(--surface);border:1px solid var(--border);color:var(--text);transition:transform .14s,border-color .15s;}
.hz-icbtn:active{transform:scale(.9);}
.hz-bellwrap{position:relative;}
.hz-icbtn.hasnew{border-color:var(--ember);color:var(--ember);}
.hz-belldot{position:absolute;top:-5px;right:-5px;min-width:16px;height:16px;padding:0 4px;border-radius:99px;background:var(--rose);color:#fff;font-size:9.5px;font-weight:700;display:grid;place-items:center;}
.hz-bellpanel{position:absolute;top:44px;right:0;z-index:40;width:290px;max-height:380px;overflow-y:auto;background:var(--surface);border:1px solid var(--border);border-radius:14px;box-shadow:0 20px 50px -18px rgba(0,0,0,.6);padding:6px;}
.hz-bellpanel-h{display:flex;align-items:center;justify-content:space-between;padding:8px 10px;font-size:13px;}
.hz-bellpanel-h button{color:var(--muted);}
.hz-bellempty{padding:20px;text-align:center;color:var(--muted);font-size:12.5px;}
.hz-bellrow{display:flex;gap:9px;padding:9px 10px;border-radius:9px;}
.hz-bellrow:hover{background:var(--surface2);}
.hz-belldotc{width:8px;height:8px;border-radius:50%;margin-top:5px;flex-shrink:0;}
.hz-bellmsg{font-size:12.5px;line-height:1.35;}
.hz-belltime{font-size:10.5px;color:var(--muted);margin-top:2px;}
.hz-ridersteps{display:flex;flex-wrap:wrap;gap:6px;margin-bottom:10px;}
.hz-riderstep{display:inline-flex;align-items:center;gap:4px;font-size:10.5px;font-weight:700;padding:4px 9px;border-radius:8px;border:1px solid var(--border);color:var(--muted);background:var(--surface2);}
.hz-riderstep.done{color:var(--jade);border-color:color-mix(in srgb,var(--jade) 45%,var(--border));background:color-mix(in srgb,var(--jade) 12%,transparent);}
.hz-delrow{display:flex;flex-wrap:wrap;gap:6px;margin-top:10px;}
.hz-delstep{display:inline-flex;align-items:center;gap:4px;font-size:10.5px;font-weight:700;padding:4px 9px;border-radius:99px;border:1px solid var(--border);color:var(--muted);}
.hz-delstep.on{color:#fff;background:linear-gradient(135deg,var(--rider,#9B8CFF),var(--saffron));border-color:transparent;}
.hz-custnotif{display:flex;align-items:center;gap:8px;font-size:12.5px;font-weight:600;color:var(--jade);background:color-mix(in srgb,var(--jade) 12%,transparent);border-radius:10px;padding:9px 12px;margin-bottom:12px;}

.hz-screen{padding:18px 16px 50px;}
.hz-wrap{max-width:1180px;margin:0 auto;}
.hz-wrap.narrow{max-width:560px;}
.hz-head{margin-bottom:18px;display:flex;align-items:flex-start;justify-content:space-between;gap:12px;flex-wrap:wrap;}
.hz-head h1{font-size:23px;font-weight:800;}
.hz-head p{margin:4px 0 0;color:var(--muted);font-size:13px;}
.hz-brswitch{display:flex;gap:3px;padding:3px;border-radius:11px;background:var(--surface);border:1px solid var(--border);}
.hz-brswitch button{padding:7px 13px;border-radius:8px;font-size:12px;font-weight:600;color:var(--muted);transition:.15s;}
.hz-brswitch button.on{color:#fff;background:linear-gradient(135deg,var(--ember),var(--saffron));box-shadow:0 3px 12px -4px var(--ember);}
.hz-brtag{display:inline-flex;align-items:center;gap:3px;font-size:9.5px;font-weight:700;color:var(--saffron);background:color-mix(in srgb,var(--saffron) 14%,transparent);padding:2px 7px;border-radius:5px;}

@keyframes flash{0%{box-shadow:0 0 0 0 var(--ember);}30%{box-shadow:0 0 0 2px var(--ember),0 8px 26px -10px var(--ember);}100%{box-shadow:0 0 0 0 transparent;}}
.flash{animation:flash 1.1s ease-out;}
.hz-badge{padding:4px 9px;border-radius:99px;font-size:11px;font-weight:700;}.hz-badge.sm{padding:3px 7px;font-size:10px;}
.hz-tq{display:inline-flex;align-items:center;gap:3px;font-family:var(--fm);font-weight:700;font-size:13px;}
.hz-pri{color:var(--saffron);margin-left:3px;}
.hz-srctag{font-size:9.5px;font-weight:700;color:var(--jade);background:color-mix(in srgb,var(--jade) 14%,transparent);padding:2px 6px;border-radius:5px;text-transform:uppercase;letter-spacing:.04em;}
.hz-stack{display:flex;flex-direction:column;gap:10px;}

.hz-segt{display:flex;gap:4px;padding:4px;border-radius:11px;background:var(--surface2);border:1px solid var(--border);margin-bottom:14px;}
.hz-segt.sm{margin-bottom:11px;}.hz-segt.wide{max-width:420px;}.hz-segt.wide4{max-width:680px;}.hz-segt.wide5{max-width:780px;}
.hz-segt.wide6{max-width:880px;}.hz-segt.wide7{max-width:980px;}
.hz-segt.wide6 button,.hz-segt.wide7 button{padding:9px 8px;font-size:12px;}
.hz-segt button{flex:1;padding:9px;border-radius:8px;font-size:12.5px;font-weight:600;color:var(--muted);display:inline-flex;align-items:center;justify-content:center;gap:6px;transition:color .2s;}
.hz-segt button.on{color:#fff;background:linear-gradient(135deg,var(--ember),var(--saffron));box-shadow:0 4px 14px -6px var(--ember);}
.hz-segt em{font-style:normal;font-family:var(--fm);font-size:11px;background:rgba(255,255,255,.25);padding:0 6px;border-radius:99px;}

.hz-kcols{display:grid;grid-template-columns:repeat(auto-fill,minmax(280px,1fr));gap:12px;}
.hz-ticket{background:var(--surface);border:1px solid var(--border);border-radius:13px;padding:13px;}
.hz-ticket.hot{border-color:var(--rose);}
.hz-trow{display:flex;align-items:center;justify-content:space-between;margin-bottom:8px;}
.hz-tmeta{display:flex;align-items:center;gap:5px;font-size:11.5px;color:var(--muted);margin-bottom:9px;}
.hz-tmins{margin-left:auto;display:inline-flex;align-items:center;gap:3px;font-family:var(--fm);}
.hz-titems{list-style:none;margin:0 0 8px;padding:0;display:flex;flex-direction:column;gap:4px;}
.hz-titems li{font-size:13px;}.hz-titems b{font-family:var(--fm);color:var(--ember);}
.hz-tnote{font-size:11.5px;color:var(--muted);font-style:italic;margin-bottom:9px;}
.hz-tacts{display:flex;gap:7px;align-items:center;}
.hz-adv{flex:1;display:inline-flex;align-items:center;justify-content:center;gap:5px;padding:9px;border-radius:9px;font-size:12.5px;font-weight:700;color:#fff;background:linear-gradient(135deg,var(--ember),var(--saffron));}
.hz-back{padding:9px 12px;border-radius:9px;font-size:12.5px;font-weight:600;color:var(--muted);background:var(--surface2);border:1px solid var(--border);}
.hz-back.wide{flex:1;text-align:center;}.hz-back.center{display:block;margin:14px auto 0;}
.hz-waitwaiter{flex:1;display:inline-flex;align-items:center;gap:6px;justify-content:center;padding:9px;border-radius:9px;font-size:11.5px;font-weight:600;color:var(--jade);background:color-mix(in srgb,var(--jade) 12%,transparent);}

.hz-worder{background:var(--surface);border:1px solid var(--border);border-radius:13px;padding:14px;}
.hz-worder.ready{border-color:var(--jade);box-shadow:0 0 0 1px var(--jade);}
.hz-deliverto{display:flex;align-items:center;gap:7px;font-size:12.5px;margin:9px 0;color:var(--muted);}
.hz-deliverto b{margin-left:auto;font-family:var(--fm);color:var(--text);font-size:13px;}
.hz-deliverto span{font-weight:600;text-transform:uppercase;font-size:10.5px;letter-spacing:.04em;}
.hz-witems{font-size:12.5px;margin-bottom:11px;}.hz-witems em{color:var(--muted);font-style:italic;}
.hz-deliverbtn{width:100%;display:inline-flex;align-items:center;justify-content:center;gap:7px;padding:11px;border-radius:10px;font-size:13px;font-weight:700;color:#0c0a08;background:linear-gradient(135deg,var(--jade),var(--saffron));}
.hz-wstatusnote{display:inline-flex;align-items:center;gap:6px;font-size:12px;color:var(--muted);}

.hz-form{display:flex;flex-direction:column;gap:11px;}
.hz-form label{display:flex;flex-direction:column;gap:5px;font-size:12px;font-weight:600;color:var(--muted);}
.hz-form label span{display:inline-flex;align-items:center;gap:5px;}
.hz-form input,.hz-select{padding:10px 12px;border-radius:10px;background:var(--surface);border:1px solid var(--border);color:var(--text);font-size:13.5px;outline:none;}
.hz-loginbox .hz-form input{background:var(--surface2);}
.hz-form input:focus,.hz-select:focus{border-color:var(--ember);}
.hz-row2{display:grid;grid-template-columns:1fr 1fr;gap:10px;}
.hz-rolepick{display:grid;grid-template-columns:1fr 1fr;gap:7px;}
.hz-rp{display:inline-flex;align-items:center;gap:6px;padding:9px 11px;border-radius:9px;font-size:12px;font-weight:600;background:var(--surface);border:1px solid var(--border);color:var(--muted);transition:.15s;}
.hz-pickgrid{display:grid;grid-template-columns:1fr 1fr;gap:8px;}
.hz-pick{position:relative;display:flex;align-items:center;gap:7px;padding:10px 11px;border-radius:10px;font-size:12px;font-weight:600;background:var(--surface);border:1px solid var(--border);color:var(--text);text-align:left;transition:.15s;}
.hz-pick.on{border-color:var(--ember);}.hz-pick em{margin-left:auto;font-style:normal;font-family:var(--fm);color:var(--ember);}
.hz-minicart{display:flex;flex-direction:column;gap:7px;background:var(--surface2);border-radius:11px;padding:11px;}
.hz-minicart>div{display:flex;align-items:center;justify-content:space-between;font-size:12.5px;}
.hz-step{display:flex;align-items:center;gap:9px;}
.hz-step button{width:26px;height:26px;border-radius:7px;display:grid;place-items:center;background:var(--surface2);border:1px solid var(--border);}
.hz-step b{font-family:var(--fm);min-width:14px;text-align:center;}
.hz-cta{display:inline-flex;align-items:center;justify-content:center;gap:6px;padding:12px;border-radius:11px;font-size:13.5px;font-weight:700;color:#fff;background:linear-gradient(135deg,var(--ember),var(--saffron));transition:transform .12s,filter .2s;}
.hz-cta:disabled{opacity:.4;cursor:not-allowed;}
.hz-cta:hover:not(:disabled){filter:brightness(1.06);}.hz-cta:active:not(:disabled){transform:scale(.98);}
.hz-corow{display:flex;gap:10px;}.hz-corow .hz-cta{flex:1;}
.hz-coinfo{display:flex;align-items:flex-start;gap:7px;font-size:11.5px;color:var(--muted);}

.hz-cust-wrap{max-width:680px;margin:0 auto;}
.hz-hero{position:relative;border-radius:18px;overflow:hidden;padding:26px 20px;margin-bottom:14px;}
.hz-hero-bg{position:absolute;inset:0;background:linear-gradient(135deg,var(--ember),var(--saffron));opacity:.92;}
.hz-hero-bg::after{content:"";position:absolute;inset:0;background:radial-gradient(circle at 80% -10%,rgba(255,255,255,.35),transparent 55%);}
.hz-hero-in{position:relative;}
.hz-hero .hz-qrtag{background:rgba(255,255,255,.22);color:#fff;}
.hz-hero-title{font-size:27px;font-weight:800;color:#fff;margin-top:12px;letter-spacing:-.02em;}
.hz-hero-title span{color:#2a1206;}
.hz-hero-sub{font-size:13px;color:rgba(255,255,255,.92);margin:4px 0 0;}
.hz-searchbar{display:flex;align-items:center;gap:9px;padding:11px 14px;border-radius:13px;background:var(--surface);border:1px solid var(--border);color:var(--muted);margin-bottom:12px;}
.hz-searchbar input{flex:1;border:none;outline:none;background:none;color:var(--text);font-size:13.5px;}
.hz-catpills{display:flex;gap:8px;overflow-x:auto;padding-bottom:4px;margin-bottom:14px;}
.hz-pill{flex-shrink:0;padding:8px 15px;border-radius:99px;font-size:12.5px;font-weight:600;color:var(--muted);background:var(--surface);border:1px solid var(--border);transition:.15s;}
.hz-pill.on{color:#fff;background:linear-gradient(135deg,var(--ember),var(--saffron));border-color:transparent;}
.hz-pill:active{transform:scale(.96);}
.hz-menugrid2{display:grid;grid-template-columns:repeat(auto-fill,minmax(200px,1fr));gap:13px;}
.hz-fcard{background:var(--surface);border:1px solid var(--border);border-radius:16px;overflow:hidden;transition:transform .18s,border-color .18s;}
.hz-fcard:hover{transform:translateY(-3px);border-color:color-mix(in srgb,var(--ember) 40%,var(--border));}
.hz-fcard-img{position:relative;height:120px;display:grid;place-items:center;background:radial-gradient(circle at 50% 30%,color-mix(in srgb,var(--saffron) 28%,transparent),color-mix(in srgb,var(--ember) 15%,transparent));overflow:hidden;}
.hz-fcard-img img{width:100%;height:100%;object-fit:cover;transition:transform .4s cubic-bezier(.2,.7,.2,1);}
.hz-fcard-em{font-size:52px;transition:transform .4s cubic-bezier(.2,.7,.2,1);}
.hz-fcard:hover .hz-fcard-img img,.hz-fcard:hover .hz-fcard-em{transform:scale(1.08);}
.hz-fbadge{position:absolute;top:8px;left:8px;font-size:9.5px;font-weight:700;padding:3px 8px;border-radius:99px;text-transform:uppercase;letter-spacing:.04em;color:#fff;}
.hz-fbadge.pop{background:rgba(20,17,16,.6);}.hz-fbadge.spicy{background:var(--rose);}
.hz-fcard-b{padding:12px;}
.hz-fcard-n{font-size:14px;font-weight:700;}
.hz-fcard-d{font-size:11.5px;color:var(--muted);margin-top:4px;line-height:1.35;min-height:31px;}
.hz-fcard-foot{display:flex;align-items:center;justify-content:space-between;margin-top:10px;}
.hz-fcard-p{font-family:var(--fm);font-weight:700;font-size:15px;color:var(--ember);}
.hz-addbtn2{width:34px;height:34px;border-radius:10px;display:grid;place-items:center;color:#fff;background:linear-gradient(135deg,var(--ember),var(--saffron));box-shadow:0 4px 12px -4px var(--ember);transition:transform .18s;}
.hz-addbtn2:hover{transform:scale(1.08) rotate(90deg);}.hz-addbtn2:active{transform:scale(.95);}
.hz-floatcart{position:sticky;bottom:16px;width:100%;display:flex;align-items:center;gap:10px;justify-content:center;padding:14px;border-radius:13px;font-size:13.5px;font-weight:700;color:#fff;background:linear-gradient(135deg,var(--ember),var(--saffron));box-shadow:0 14px 36px -12px var(--ember);margin-top:6px;transition:transform .12s;}
.hz-floatcart:active{transform:scale(.99);}
.hz-floatcart span{background:rgba(255,255,255,.22);padding:3px 9px;border-radius:99px;}.hz-floatcart b{font-family:var(--fm);}
.hz-cartcount{display:inline-flex;align-items:center;gap:5px;}

.hz-cosum{background:var(--surface);border:1px solid var(--border);border-radius:12px;padding:13px;display:flex;flex-direction:column;gap:7px;margin-bottom:16px;}
.hz-cosum>div{display:flex;justify-content:space-between;font-size:12.5px;color:var(--muted);}
.hz-cosum b{font-family:var(--fm);color:var(--text);}
.hz-cosum-t{border-top:1px solid var(--border);padding-top:8px;font-weight:700;color:var(--text)!important;}
.hz-paypick{display:grid;grid-template-columns:1fr 1fr;gap:9px;}
.hz-payopt{display:inline-flex;align-items:center;gap:7px;justify-content:center;padding:12px;border-radius:11px;font-size:12.5px;font-weight:600;background:var(--surface);border:1px solid var(--border);color:var(--muted);transition:.15s;}
.hz-payopt.on{color:var(--text);border-color:var(--ember);background:color-mix(in srgb,var(--ember) 8%,var(--surface));}
.hz-payopt.on svg{color:var(--ember);}

.hz-track-hero{display:flex;justify-content:space-between;align-items:center;background:var(--surface);border:1px solid var(--border);border-radius:14px;padding:16px;margin-bottom:12px;}
.hz-th-q{font-family:var(--fm);font-size:13px;color:var(--muted);}
.hz-th-cur{font-family:var(--fd);font-weight:800;font-size:21px;margin-top:3px;}
.hz-th-r{text-align:right;}
.hz-th-big{font-family:var(--fm);font-weight:700;font-size:30px;line-height:1;}.hz-th-big small{font-size:12px;color:var(--muted);margin-left:3px;}
.hz-th-pos{font-size:11px;color:var(--muted);margin-top:4px;}
.hz-asgn{display:flex;align-items:center;gap:6px;font-size:12.5px;color:var(--muted);margin-bottom:16px;}.hz-asgn b{color:var(--text);}
.hz-timeline{display:flex;flex-direction:column;padding-left:3px;margin-bottom:6px;}
.hz-tl{position:relative;display:flex;align-items:center;gap:11px;padding-bottom:15px;}
.hz-tl-dot{width:22px;height:22px;border-radius:50%;border:2px solid var(--border);background:var(--surface);display:grid;place-items:center;color:#fff;flex-shrink:0;z-index:1;}
.hz-tl-line{position:absolute;left:10px;top:22px;width:2px;height:100%;background:var(--border);}
.hz-tl-live{width:8px;height:8px;border-radius:50%;background:#fff;animation:bl 1s infinite;}
@keyframes bl{50%{opacity:.3;}}
.hz-tl-lbl{font-size:13px;color:var(--muted);font-weight:500;}
.hz-tl.done .hz-tl-lbl{color:var(--text);}.hz-tl.cur .hz-tl-lbl{color:var(--text);font-weight:700;}
.hz-tl.cur .hz-tl-dot{animation:ringPulse 1.8s infinite;}
.hz-cnote{display:flex;align-items:center;gap:7px;padding:11px 13px;border-radius:11px;font-size:13px;font-weight:600;background:var(--surface2);margin-top:8px;}
.hz-cnote.ready,.hz-cnote.done{color:var(--jade);background:color-mix(in srgb,var(--jade) 13%,transparent);}

.hz-mkpis{display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:12px;margin-bottom:14px;}
/* duty toggle + tax bits */
.hz-dutywrap{display:flex;align-items:center;gap:8px;flex-shrink:0;}
.hz-dutytag{font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.03em;padding:3px 8px;border-radius:99px;white-space:nowrap;}
.hz-dutytag.on{color:var(--jade);background:color-mix(in srgb,var(--jade) 14%,transparent);}
.hz-dutytag.off{color:var(--rose);background:color-mix(in srgb,var(--rose) 14%,transparent);}
.hz-userrow.off{opacity:.6;}
.hz-taxhint{display:block;font-size:10px;font-style:normal;font-weight:700;opacity:.85;margin-top:2px;}
.hz-taxhint.save{color:var(--jade);}
.hz-taxsub{display:block;font-size:11px;color:var(--muted);}
/* info "i" icon + its pop-over note */
.hz-infowrap{position:relative;display:inline-flex;vertical-align:middle;margin-left:6px;}
.hz-infobtn{display:inline-grid;place-items:center;width:19px;height:19px;border-radius:50%;border:1px solid var(--border);background:var(--surface2);color:var(--muted);flex-shrink:0;cursor:pointer;transition:.15s;}
.hz-infobtn:hover{color:var(--ember);border-color:var(--ember);}
.hz-infobtn.on{color:#fff;background:var(--ember);border-color:var(--ember);}
.hz-infopop{position:absolute;top:26px;left:50%;transform:translateX(-50%);z-index:60;width:min(280px,78vw);background:var(--surface);border:1px solid var(--border);border-radius:12px;box-shadow:0 18px 44px -16px rgba(0,0,0,.55);padding:12px 30px 12px 13px;text-align:left;}
.hz-infopop::before{content:"";position:absolute;top:-6px;left:50%;transform:translateX(-50%) rotate(45deg);width:10px;height:10px;background:var(--surface);border-left:1px solid var(--border);border-top:1px solid var(--border);}
.hz-infotext{display:block;font-size:12px;line-height:1.55;color:var(--muted);font-weight:500;font-style:normal;letter-spacing:0;text-transform:none;}
.hz-infotext b{color:var(--text);}
.hz-infoclose{position:absolute;top:7px;right:7px;color:var(--muted);padding:2px;}
.hz-infoclose:hover{color:var(--text);}
.hz-branchnote{display:flex;align-items:center;gap:6px;font-size:11.5px;color:var(--muted);font-weight:600;}
.hz-branchnote b{color:var(--text);}
@media(max-width:520px){.hz-infopop{left:auto;right:-6px;transform:none;}.hz-infopop::before{left:auto;right:14px;transform:rotate(45deg);}}
/* inline edit rows + audit trail */
.hz-editrow{background:var(--surface);border:1.5px solid var(--ember);border-radius:13px;padding:13px;}
.hz-editrow-h{display:flex;align-items:center;gap:7px;font-size:11.5px;font-weight:700;text-transform:uppercase;letter-spacing:.05em;color:var(--ember);margin-bottom:10px;}
.hz-corow2{display:flex;gap:9px;justify-content:flex-end;}
.hz-corow2 .hz-ghost,.hz-corow2 .hz-fulfill{padding:9px 15px;}
.hz-editedby{display:inline-flex;align-items:center;gap:4px;font-size:10.5px;color:var(--muted);margin-top:5px;font-style:italic;}
.hz-salchip{font-size:10.5px;font-weight:700;color:var(--jade);background:color-mix(in srgb,var(--jade) 12%,transparent);padding:2px 7px;border-radius:99px;margin-left:6px;}
.hz-pincell{font-family:var(--fm);font-size:11.5px;letter-spacing:.08em;color:var(--muted);background:var(--surface2);border:1px solid var(--border);border-radius:6px;padding:1px 7px;cursor:pointer;}
.hz-pincell:hover{color:var(--text);}
/* dashboard */
.hz-dashrow{display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:12px;margin-bottom:14px;}
.hz-dashcard{background:var(--surface);border:1px solid var(--border);border-radius:16px;padding:15px;}
.hz-dashcard.big{background:linear-gradient(150deg,color-mix(in srgb,var(--ember) 14%,var(--surface)),var(--surface));border-color:color-mix(in srgb,var(--ember) 30%,var(--border));}
.hz-dashcard-ic{display:inline-flex;padding:8px;border-radius:10px;margin-bottom:10px;}
.hz-dashcard-lbl{font-size:12px;color:var(--muted);font-weight:600;}
.hz-dashcard-val{font-size:22px;font-weight:800;font-family:var(--fd);letter-spacing:-.01em;margin-top:2px;}
.hz-dashcard.big .hz-dashcard-val{font-size:26px;}
.hz-dashcard-sub{font-size:11px;color:var(--muted);margin-top:2px;}
.hz-chart{display:flex;align-items:flex-end;justify-content:space-between;gap:8px;height:180px;padding:10px 4px 0;}
.hz-chbar{flex:1;display:flex;flex-direction:column;align-items:center;justify-content:flex-end;gap:6px;height:100%;}
.hz-chfill{width:100%;max-width:38px;border-radius:7px 7px 0 0;background:linear-gradient(180deg,var(--ember),var(--saffron));transition:height .5s cubic-bezier(.2,.8,.2,1);}
.hz-chval{font-size:10.5px;font-weight:700;color:var(--muted);font-family:var(--fm);}
.hz-chlbl{font-size:10.5px;color:var(--muted);font-weight:600;}
.hz-moneyrow{display:flex;align-items:center;gap:11px;padding:10px 0;border-bottom:1px dashed var(--border);}
.hz-moneyrow.total{border-bottom:none;border-top:2px solid var(--border);margin-top:2px;font-size:1.05em;}
.hz-money-ic{display:inline-flex;}
.hz-money-v{font-weight:800;font-family:var(--fm);}
.hz-buyhist{margin-top:12px;}
.hz-buyhist-h{font-size:11px;text-transform:uppercase;letter-spacing:.05em;color:var(--muted);font-weight:700;margin-bottom:6px;}
.hz-buyrow{display:flex;align-items:center;gap:10px;padding:7px 0;border-bottom:1px solid var(--border);font-size:12.5px;}
.hz-buyrow:last-child{border-bottom:none;}
.hz-buyitem{flex:1;font-weight:600;display:flex;align-items:center;gap:6px;}
.hz-buycost{font-weight:800;font-family:var(--fm);color:var(--rose);}
.hz-buydate{font-size:11px;color:var(--muted);min-width:52px;text-align:right;}
.hz-buysum{display:flex;gap:10px;margin-bottom:8px;}
.hz-buysum>div{flex:1;background:var(--surface2);border-radius:11px;padding:10px 12px;}
.hz-buysum-l{display:block;font-size:11px;color:var(--muted);}
.hz-buysum b{font-size:17px;font-family:var(--fd);}
.hz-staffact-head,.hz-staffact{display:grid;grid-template-columns:2fr 1fr 1.3fr 1fr;align-items:center;gap:8px;}
.hz-staffact-head{font-size:10.5px;text-transform:uppercase;letter-spacing:.04em;color:var(--muted);font-weight:700;padding:4px 0 8px;border-bottom:1px solid var(--border);}
.hz-staffact-head span:not(:first-child),.hz-staffact-n,.hz-staffact-s{text-align:right;}
.hz-staffact{padding:9px 0;border-bottom:1px solid var(--border);}
.hz-staffact:last-child{border-bottom:none;}
.hz-staffact-name{display:flex;align-items:center;gap:8px;min-width:0;}
.hz-staffact-name b{font-size:13px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}
.hz-staffact-n{font-weight:800;font-family:var(--fm);}
.hz-staffact-n.muted{color:var(--muted);font-weight:600;}
.hz-staffact-s{font-weight:700;font-family:var(--fm);color:var(--jade);font-size:12.5px;}
/* my-day strip */
.hz-myday{display:grid;grid-template-columns:repeat(4,1fr);gap:8px;margin-bottom:14px;}
.hz-md{background:var(--surface);border:1px solid var(--border);border-radius:13px;padding:11px 8px;text-align:center;}
.hz-md b{display:block;font-size:19px;font-weight:800;font-family:var(--fd);}
.hz-md span{font-size:10.5px;color:var(--muted);}
.hz-costin{display:flex;align-items:center;gap:6px;flex:1;background:var(--surface2);border:1px solid var(--border);border-radius:10px;padding:0 10px;}
.hz-costin span{color:var(--muted);font-size:13px;font-weight:700;}
.hz-costin input{border:none;background:transparent;flex:1;padding:10px 0;color:var(--text);outline:none;}
.hz-unitcost{font-size:10.5px;color:var(--jade);font-weight:700;font-family:var(--fm);}
.hz-kpi{background:var(--surface);border:1px solid var(--border);border-radius:14px;padding:15px;}
.hz-kpi-ic{width:36px;height:36px;border-radius:10px;display:grid;place-items:center;margin-bottom:11px;}
.hz-kpi-v{font-family:var(--fm);font-size:21px;font-weight:700;letter-spacing:-.02em;}
.hz-kpi-l{font-size:12px;color:var(--muted);margin-top:3px;}
.hz-mgrid{display:grid;grid-template-columns:300px 1fr;gap:14px;align-items:start;}
.hz-staffgrid{display:grid;grid-template-columns:1fr 1fr;gap:14px;align-items:start;}
.hz-card{background:var(--surface);border:1px solid var(--border);border-radius:16px;padding:17px;}
.hz-card-h{display:flex;align-items:flex-start;justify-content:space-between;margin-bottom:15px;}
.hz-card-h h3{font-size:15px;font-weight:700;}
.hz-card-sub{font-size:11.5px;color:var(--muted);display:inline-flex;align-items:center;gap:4px;}
.hz-loadrow{display:flex;align-items:center;gap:11px;margin-bottom:13px;}
.hz-load-main{flex:1;min-width:0;}
.hz-load-top{display:flex;align-items:center;gap:8px;font-size:13px;margin-bottom:6px;flex-wrap:wrap;}
.hz-nexttag{font-size:9.5px;font-weight:700;color:var(--jade);background:color-mix(in srgb,var(--jade) 14%,transparent);padding:2px 7px;border-radius:99px;text-transform:uppercase;}
.hz-bar{height:7px;border-radius:99px;background:var(--surface2);overflow:hidden;}
.hz-bar span{display:block;height:100%;border-radius:99px;background:linear-gradient(90deg,var(--ember),var(--saffron));transition:width .4s;}
.hz-bar.warn span{background:linear-gradient(90deg,var(--rose),var(--saffron));}
.hz-load-n{font-family:var(--fm);font-weight:700;font-size:15px;}
.hz-wp-av{width:38px;height:38px;border-radius:11px;background:linear-gradient(135deg,var(--jade),var(--saffron));color:#0c0a08;display:grid;place-items:center;font-weight:800;font-family:var(--fd);flex-shrink:0;}
.hz-wp-av.sm{width:32px;height:32px;font-size:14px;border-radius:9px;color:#fff;}
.hz-mrow,.hz-billrow{background:var(--bg2);border:1px solid var(--border);border-radius:12px;padding:12px;}
.hz-mhead{display:flex;align-items:center;gap:8px;margin-bottom:8px;flex-wrap:wrap;}
.hz-qpos{font-size:10.5px;color:var(--muted);font-family:var(--fm);}
.hz-pay{margin-left:auto;font-size:10.5px;font-weight:700;padding:3px 8px;border-radius:6px;}
.hz-pay.paid{color:var(--jade);background:color-mix(in srgb,var(--jade) 14%,transparent);}
.hz-pay.unpaid{color:var(--saffron);background:color-mix(in srgb,var(--saffron) 14%,transparent);}
.hz-mmeta{display:flex;flex-wrap:wrap;gap:9px;font-size:11.5px;color:var(--muted);margin-bottom:7px;}
.hz-mmeta span{display:inline-flex;align-items:center;gap:4px;}
.hz-mitems{font-size:12.5px;margin-bottom:7px;}
.hz-mfoot{display:flex;align-items:center;gap:10px;}.hz-mfoot>b{font-family:var(--fm);font-size:14px;}
.hz-eta{font-size:11px;color:var(--muted);font-family:var(--fm);}
.hz-macts{margin-left:auto;display:flex;gap:6px;}
.hz-mini{width:30px;height:30px;border-radius:8px;display:grid;place-items:center;background:var(--surface2);border:1px solid var(--border);color:var(--muted);transition:.15s;}
.hz-mini:hover{color:var(--text);}.hz-mini.active{color:var(--saffron);border-color:var(--saffron);}
.hz-mini.danger:hover{color:var(--rose);border-color:var(--rose);}
.hz-paybtn{display:inline-flex;align-items:center;gap:6px;padding:8px 13px;border-radius:9px;font-size:12.5px;font-weight:700;color:#0c0a08;background:linear-gradient(135deg,var(--jade),var(--saffron));}
.hz-fulfill{display:inline-flex;align-items:center;gap:5px;padding:7px 11px;border-radius:9px;font-size:12px;font-weight:700;color:#0c0a08;background:linear-gradient(135deg,var(--jade),var(--saffron));}

.hz-stockrow,.hz-invrow{display:flex;align-items:center;gap:11px;}
.hz-stock-ic{color:var(--saffron);flex-shrink:0;}
.hz-stockval{margin-left:auto;font-family:var(--fm);font-size:12px;color:var(--muted);}
.hz-lowtag{font-size:9px;font-weight:700;color:var(--rose);background:color-mix(in srgb,var(--rose) 14%,transparent);padding:2px 6px;border-radius:5px;text-transform:uppercase;letter-spacing:.04em;}
.hz-qadd2{display:flex;gap:5px;flex-shrink:0;}
.hz-qadd2 button{padding:6px 9px;border-radius:8px;font-size:11.5px;font-weight:700;font-family:var(--fm);color:var(--jade);background:var(--surface2);border:1px solid var(--border);transition:.15s;}
.hz-qadd2 button:hover{border-color:var(--jade);}
.hz-reqrow{display:flex;align-items:center;gap:11px;background:var(--bg2);border:1px solid var(--border);border-radius:12px;padding:11px;margin-bottom:9px;}
.hz-req-ic{width:32px;height:32px;border-radius:9px;display:grid;place-items:center;color:var(--saffron);background:color-mix(in srgb,var(--saffron) 14%,transparent);flex-shrink:0;}
.hz-req-main{flex:1;min-width:0;}
.hz-req-top{font-size:13px;display:flex;align-items:center;gap:6px;flex-wrap:wrap;}.hz-req-top b{font-family:var(--fm);color:var(--ember);}
.hz-req-sub{font-size:11px;color:var(--muted);margin-top:3px;}
.hz-reqhistory{margin-top:12px;border-top:1px solid var(--border);padding-top:11px;}
.hz-reqhistory-h{font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.05em;color:var(--muted);margin-bottom:8px;}
.hz-reqmini{display:flex;align-items:center;gap:9px;padding:7px 9px;border-radius:9px;background:var(--surface2);margin-bottom:6px;font-size:12px;}
.hz-reqitem{flex:1;color:var(--muted);}
.hz-reqstatus{font-size:9.5px;font-weight:700;padding:2px 7px;border-radius:5px;text-transform:uppercase;}
.hz-reqstatus.pending{color:var(--saffron);background:color-mix(in srgb,var(--saffron) 14%,transparent);}
.hz-reqstatus.fulfilled{color:var(--jade);background:color-mix(in srgb,var(--jade) 14%,transparent);}
.hz-reqstatus.rejected{color:var(--rose);background:color-mix(in srgb,var(--rose) 14%,transparent);}

.hz-upload{display:block;border:1.5px dashed color-mix(in srgb,var(--ember) 40%,var(--border));border-radius:13px;overflow:hidden;cursor:pointer;background:var(--surface2);}
.hz-upload img{width:100%;height:150px;object-fit:cover;display:block;}
.hz-upload-ph{height:130px;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:8px;color:var(--muted);font-size:12.5px;font-weight:600;}
.hz-mitemrow{display:flex;align-items:center;gap:11px;background:var(--bg2);border:1px solid var(--border);border-radius:12px;padding:10px;}
.hz-mitemrow.off{opacity:.55;}
.hz-mitem-img{width:48px;height:48px;border-radius:11px;overflow:hidden;display:grid;place-items:center;font-size:24px;background:radial-gradient(circle at 50% 35%,color-mix(in srgb,var(--saffron) 26%,transparent),color-mix(in srgb,var(--ember) 14%,transparent));flex-shrink:0;}
.hz-mitem-img img{width:100%;height:100%;object-fit:cover;}
.hz-mitem-main{flex:1;min-width:0;}
.hz-mitem-top{display:flex;align-items:center;gap:8px;}
.hz-mitem-top b{font-size:13.5px;}
.hz-tag2{font-size:9.5px;font-weight:700;color:var(--muted);border:1px solid var(--border);padding:1px 6px;border-radius:5px;text-transform:uppercase;letter-spacing:.03em;}
.hz-mitem-sub{display:flex;align-items:center;gap:8px;margin-top:4px;}
.hz-mitem-sub .hz-fcard-p{font-size:13px;}
.hz-toggle{width:42px;height:24px;border-radius:99px;background:var(--surface2);border:1px solid var(--border);position:relative;transition:.2s;flex-shrink:0;}
.hz-toggle.on{background:linear-gradient(135deg,var(--jade),var(--saffron));border-color:transparent;}
.hz-toggle-knob{position:absolute;top:2px;left:2px;width:18px;height:18px;border-radius:50%;background:#fff;transition:.2s;box-shadow:0 1px 3px rgba(0,0,0,.3);}
.hz-toggle.on .hz-toggle-knob{transform:translateX(18px);}
.hz-userrow{display:flex;align-items:center;gap:11px;background:var(--bg2);border:1px solid var(--border);border-radius:12px;padding:11px;}
.hz-user-main{flex:1;min-width:0;}
.hz-user-top{display:flex;align-items:center;gap:8px;flex-wrap:wrap;}.hz-user-top b{font-size:13.5px;}
.hz-inactive{font-size:9.5px;font-weight:700;color:var(--muted);background:var(--surface2);padding:2px 7px;border-radius:5px;text-transform:uppercase;}
.hz-user-cred{display:flex;align-items:center;gap:5px;font-size:11.5px;color:var(--muted);font-family:var(--fm);margin-top:4px;}

/* online ordering site */
.hz-online{min-height:100vh;}
.hz-obar{position:sticky;top:0;z-index:30;display:flex;align-items:center;gap:12px;padding:11px 16px;background:var(--glass);backdrop-filter:blur(14px);border-bottom:1px solid var(--border);}
.hz-oback{width:34px;height:34px;border-radius:10px;display:grid;place-items:center;background:var(--surface);border:1px solid var(--border);color:var(--text);}
.hz-omode{display:inline-flex;align-items:center;gap:6px;font-size:12px;font-weight:600;color:var(--muted);background:var(--surface);border:1px solid var(--border);padding:6px 11px;border-radius:99px;}
.hz-omode button{color:var(--ember);font-weight:700;font-size:11px;text-decoration:underline;margin-left:2px;}
.hz-owrap{max-width:760px;margin:0 auto;padding:18px 16px 60px;}
.hz-ohero{position:relative;overflow:hidden;padding:34px 24px 30px;}
.hz-ohero-bg{position:absolute;inset:0;background:linear-gradient(120deg,var(--ember),var(--saffron));}
.hz-ohero-bg::after{content:"";position:absolute;inset:0;background:radial-gradient(circle at 85% 120%,rgba(255,255,255,.3),transparent 50%),radial-gradient(circle at 10% -20%,rgba(255,255,255,.25),transparent 45%);}
.hz-ohero-in{position:relative;max-width:760px;margin:0 auto;}
.hz-obadge{display:inline-block;font-size:12px;font-weight:700;color:#fff;background:rgba(20,17,16,.28);padding:6px 13px;border-radius:99px;}
.hz-ohero h1{font-size:42px;line-height:1.02;color:#fff;margin-top:14px;font-weight:800;letter-spacing:-.03em;}
.hz-ohero h1 span{color:#2a1206;}
.hz-ohero p{position:relative;max-width:420px;color:rgba(255,255,255,.94);font-size:14px;margin:12px auto 0;max-width:760px;}
.hz-ohero-art{position:absolute;right:18px;top:50%;transform:translateY(-50%);display:flex;gap:6px;font-size:38px;opacity:.9;filter:drop-shadow(0 6px 10px rgba(0,0,0,.2));}
.hz-ohero-art span{animation:floatY 3s ease-in-out infinite;}
.hz-ohero-art span:nth-child(2){animation-delay:.4s;}.hz-ohero-art span:nth-child(3){animation-delay:.8s;}.hz-ohero-art span:nth-child(4){animation-delay:1.2s;}
.hz-ostep-h{font-family:var(--fd);font-weight:700;font-size:13px;color:var(--muted);text-transform:uppercase;letter-spacing:.05em;margin:6px 0 11px;}
.hz-modecards{display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:22px;}
.hz-modecard{position:relative;display:flex;flex-direction:column;align-items:flex-start;gap:5px;padding:18px;border-radius:16px;background:var(--surface);border:1.5px solid var(--border);text-align:left;transition:.18s;}
.hz-modecard:hover{transform:translateY(-2px);}
.hz-modecard.on{border-color:var(--ember);background:color-mix(in srgb,var(--ember) 7%,var(--surface));}
.hz-modeic{width:48px;height:48px;border-radius:13px;display:grid;place-items:center;color:var(--ember);background:color-mix(in srgb,var(--ember) 13%,transparent);margin-bottom:6px;}
.hz-modecard b{font-family:var(--fd);font-size:16px;}
.hz-modecard>span:last-of-type{font-size:11.5px;color:var(--muted);}
.hz-modecheck{position:absolute;top:14px;right:14px;color:#fff;background:var(--ember);border-radius:50%;padding:3px;width:22px;height:22px;}
.hz-branchcards{display:flex;flex-direction:column;gap:10px;margin-bottom:22px;}
.hz-branchcard{display:flex;align-items:center;gap:13px;padding:15px;border-radius:15px;background:var(--surface);border:1.5px solid var(--border);text-align:left;transition:.16s;}
.hz-branchcard:hover{transform:translateY(-2px);}
.hz-branchcard.on{border-color:var(--ember);background:color-mix(in srgb,var(--ember) 7%,var(--surface));}
.hz-branch-ic{width:44px;height:44px;border-radius:12px;display:grid;place-items:center;color:var(--saffron);background:color-mix(in srgb,var(--saffron) 14%,transparent);flex-shrink:0;}
.hz-branch-info{flex:1;min-width:0;}
.hz-branch-info b{font-size:14.5px;}
.hz-branch-info span{display:flex;align-items:center;gap:4px;font-size:11.5px;color:var(--muted);margin-top:3px;}
.hz-openpill{font-size:10px;font-weight:700;color:var(--jade);background:color-mix(in srgb,var(--jade) 14%,transparent);padding:3px 9px;border-radius:99px;text-transform:uppercase;}
.hz-closedpill{font-size:10px;font-weight:700;color:var(--rose);background:color-mix(in srgb,var(--rose) 14%,transparent);padding:3px 9px;border-radius:99px;text-transform:uppercase;}
.hz-hbranch.closed{opacity:.72;}
.hz-branchstatus{display:flex;align-items:center;gap:14px;flex-wrap:wrap;background:var(--surface);border:1px solid var(--border);border-radius:14px;padding:12px 15px;margin-bottom:14px;}
.hz-bs-lbl{display:inline-flex;align-items:center;gap:6px;font-size:12px;font-weight:700;color:var(--muted);text-transform:uppercase;letter-spacing:.04em;}
.hz-bs-item{display:inline-flex;align-items:center;gap:8px;padding:6px 11px;border-radius:99px;background:var(--surface2);border:1px solid var(--border);}
.hz-bs-item b{font-size:13px;}
.hz-bs-dot{width:8px;height:8px;border-radius:50%;}
.hz-bs-item.open .hz-bs-dot{background:var(--jade);box-shadow:0 0 0 3px color-mix(in srgb,var(--jade) 22%,transparent);}
.hz-bs-item.closed .hz-bs-dot{background:var(--rose);}
.hz-bs-item.closed b{color:var(--muted);}
.hz-bs-state{font-size:10.5px;font-weight:700;text-transform:uppercase;}
.hz-bs-item.open .hz-bs-state{color:var(--jade);}.hz-bs-item.closed .hz-bs-state{color:var(--rose);}
.hz-bs-hint{font-size:11px;color:var(--muted);margin-left:auto;}
.hz-closedbox{text-align:center;padding:44px 20px;background:var(--surface);border:1px solid var(--border);border-radius:16px;color:var(--muted);}
.hz-closedbox svg{color:var(--rose);}
.hz-closedbox h3{font-size:19px;font-weight:800;color:var(--text);margin:12px 0 6px;}
.hz-closedbox p{font-size:13px;margin:0 auto 16px;max-width:340px;}
.hz-ostart{width:100%;}
.hz-omenu-head{margin-bottom:14px;}
.hz-omenu-head h2{font-size:24px;font-weight:800;}
.hz-omenu-head span{font-size:12.5px;color:var(--muted);}
.hz-floatcart.wide{max-width:760px;margin-left:auto;margin-right:auto;}

.hz-emptybox{display:flex;align-items:center;gap:8px;justify-content:center;color:var(--muted);font-size:12.5px;padding:24px 14px;text-align:center;}
.hz-toasts{position:fixed;bottom:18px;right:18px;z-index:60;display:flex;flex-direction:column;gap:9px;max-width:330px;}
.hz-toast{position:relative;overflow:hidden;display:flex;align-items:center;gap:10px;padding:12px 14px;border-radius:12px;font-size:12.5px;font-weight:600;background:var(--surface);border:1px solid var(--border);box-shadow:0 18px 44px -16px rgba(0,0,0,.5);animation:sl .3s ease-out;}
.hz-toast-ic{width:28px;height:28px;border-radius:8px;display:grid;place-items:center;flex-shrink:0;}
.hz-toast::after{content:"";position:absolute;left:0;bottom:0;height:2px;width:100%;background:linear-gradient(90deg,var(--ember),var(--saffron));transform-origin:left;animation:toastbar 3.6s linear forwards;}
@keyframes sl{from{transform:translateX(40px);opacity:0;}to{transform:none;opacity:1;}}
@keyframes toastbar{from{transform:scaleX(1);}to{transform:scaleX(0);}}

/* motion + polish */
@keyframes hzUp{from{opacity:0;transform:translateY(14px);}to{opacity:1;transform:none;}}
@keyframes hzFade{from{opacity:0;}to{opacity:1;}}
@keyframes emberRise{0%{transform:translateY(0) scale(.6);opacity:0;}12%{opacity:.85;}80%{opacity:.5;}100%{transform:translateY(-105vh) scale(1.15);opacity:0;}}
@keyframes meshDrift{0%{transform:translate3d(0,0,0) scale(1);}100%{transform:translate3d(0,-14px,0) scale(1.06);}}
@keyframes flameFlick{0%,100%{box-shadow:0 5px 16px -7px var(--ember);transform:rotate(0deg);}40%{box-shadow:0 8px 26px -5px var(--saffron);transform:rotate(-3deg) scale(1.03);}70%{box-shadow:0 6px 20px -6px var(--ember);transform:rotate(2deg);}}
@keyframes ringPulse{0%{box-shadow:0 0 0 0 color-mix(in srgb,var(--jade) 55%,transparent);}70%{box-shadow:0 0 0 8px transparent;}100%{box-shadow:0 0 0 0 transparent;}}
@keyframes barSlide{to{background-position:200% 0;}}
@keyframes floatY{0%,100%{transform:translateY(0);}50%{transform:translateY(-8px);}}
.hz-screen,.hz-owrap{animation:hzUp .5s cubic-bezier(.2,.7,.2,1);}
:where(.hz-kpis,.hz-mkpis,.hz-mgrid,.hz-staffgrid,.hz-kcols,.hz-menugrid2,.hz-stack,.hz-catpills,.hz-modecards,.hz-branchcards)>*{animation:hzUp .5s cubic-bezier(.2,.7,.2,1) backwards;}
:where(.hz-kpis,.hz-mkpis,.hz-mgrid,.hz-staffgrid,.hz-kcols,.hz-menugrid2,.hz-stack,.hz-catpills,.hz-modecards,.hz-branchcards)>*:nth-child(1){animation-delay:.02s;}
:where(.hz-kpis,.hz-mkpis,.hz-mgrid,.hz-staffgrid,.hz-kcols,.hz-menugrid2,.hz-stack,.hz-catpills,.hz-modecards,.hz-branchcards)>*:nth-child(2){animation-delay:.07s;}
:where(.hz-kpis,.hz-mkpis,.hz-mgrid,.hz-staffgrid,.hz-kcols,.hz-menugrid2,.hz-stack,.hz-catpills,.hz-modecards,.hz-branchcards)>*:nth-child(3){animation-delay:.12s;}
:where(.hz-kpis,.hz-mkpis,.hz-mgrid,.hz-staffgrid,.hz-kcols,.hz-menugrid2,.hz-stack,.hz-catpills,.hz-modecards,.hz-branchcards)>*:nth-child(4){animation-delay:.17s;}
:where(.hz-kpis,.hz-mkpis,.hz-mgrid,.hz-staffgrid,.hz-kcols,.hz-menugrid2,.hz-stack,.hz-catpills,.hz-modecards,.hz-branchcards)>*:nth-child(5){animation-delay:.22s;}
:where(.hz-kpis,.hz-mkpis,.hz-mgrid,.hz-staffgrid,.hz-kcols,.hz-menugrid2,.hz-stack,.hz-catpills,.hz-modecards,.hz-branchcards)>*:nth-child(n+6){animation-delay:.27s;}
.hz-head,.hz-segt.wide,.hz-segt.wide4{animation:hzUp .5s .04s cubic-bezier(.2,.7,.2,1) backwards;}
.hz-card,.hz-ticket,.hz-worder,.hz-mrow,.hz-billrow,.hz-fcard,.hz-kpi,.hz-loginbox,.hz-mitemrow,.hz-userrow,.hz-reqrow,.hz-modecard,.hz-branchcard{box-shadow:0 1px 2px rgba(0,0,0,.05),0 14px 30px -22px rgba(0,0,0,.65);}
.hz[data-theme="light"] .hz-card,.hz[data-theme="light"] .hz-fcard,.hz[data-theme="light"] .hz-kpi,.hz[data-theme="light"] .hz-loginbox,.hz[data-theme="light"] .hz-modecard,.hz[data-theme="light"] .hz-branchcard{box-shadow:0 1px 2px rgba(120,80,40,.05),0 16px 34px -24px rgba(120,70,30,.4);}
.hz-bar::after,.hz-obar::after{content:"";position:absolute;left:0;right:0;bottom:-1px;height:1.5px;background:linear-gradient(90deg,transparent,var(--ember),var(--saffron),transparent);background-size:200% 100%;animation:barSlide 7s linear infinite;opacity:.55;}
.hz-cta,.hz-floatcart,.hz-onlinecta{position:relative;overflow:hidden;}
.hz-cta::after,.hz-floatcart::after{content:"";position:absolute;top:0;left:-60%;width:38%;height:100%;background:linear-gradient(90deg,transparent,rgba(255,255,255,.4),transparent);transform:skewX(-20deg);pointer-events:none;}
.hz-cta:hover::after,.hz-floatcart:hover::after{animation:sheen .75s ease;}
@keyframes sheen{to{left:135%;}}
.hz-login::before{content:"";position:fixed;inset:0;z-index:0;pointer-events:none;background:radial-gradient(42% 50% at 14% 8%,color-mix(in srgb,var(--ember) 22%,transparent),transparent 70%),radial-gradient(46% 56% at 86% 88%,color-mix(in srgb,var(--jade) 15%,transparent),transparent 70%),radial-gradient(40% 40% at 92% 6%,color-mix(in srgb,var(--saffron) 16%,transparent),transparent 70%);animation:meshDrift 16s ease-in-out infinite alternate;}
.hz-login>*{position:relative;z-index:1;}
.hz-embers{position:fixed;inset:0;z-index:0;overflow:hidden;pointer-events:none;}
.hz-ember{position:absolute;bottom:-12px;border-radius:50%;background:radial-gradient(circle,var(--saffron),color-mix(in srgb,var(--ember) 60%,transparent) 55%,transparent 72%);opacity:0;animation-name:emberRise;animation-iteration-count:infinite;animation-timing-function:ease-in;filter:blur(.3px);}
.hz-login-brand{animation:hzUp .6s cubic-bezier(.2,.7,.2,1) backwards;}
.hz-loginbox{animation:hzUp .6s .12s cubic-bezier(.2,.7,.2,1) backwards;}
.hz-onlinecta{animation:hzUp .6s .2s cubic-bezier(.2,.7,.2,1) backwards;}
.hz button:focus-visible,.hz input:focus-visible,.hz select:focus-visible{outline:2px solid var(--ember);outline-offset:2px;border-radius:8px;}

/* HOME + ORDERFLOW ADDITIONS */
.hz-login-top{position:absolute;top:18px;left:0;right:0;z-index:2;display:flex;align-items:center;justify-content:space-between;padding:0 18px;}
.hz-loginbox-h{display:inline-flex;align-items:center;gap:6px;font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.05em;color:var(--ember);margin-bottom:13px;}
.hz-ghost{display:inline-flex;align-items:center;gap:6px;padding:9px 14px;border-radius:10px;font-size:12.5px;font-weight:600;background:var(--surface);border:1px solid var(--border);color:var(--text);transition:.15s;}
.hz-ghost:hover{border-color:var(--ember);color:var(--ember);}
.hz-ghost.lg{padding:13px 19px;font-size:14px;}
.hz-cta.lg{padding:14px 22px;font-size:14.5px;}
.hz-cta.sm{padding:9px 14px;font-size:12.5px;border-radius:9px;}

.hz-home{min-height:100vh;}
.hz-hnav{position:sticky;top:0;z-index:30;display:flex;align-items:center;justify-content:space-between;gap:14px;padding:12px 20px;background:var(--glass);backdrop-filter:blur(14px);border-bottom:1px solid var(--border);}
.hz-hnav-links{display:flex;align-items:center;gap:8px;}
.hz-hlink{display:inline-flex;align-items:center;gap:6px;padding:8px 13px;border-radius:99px;font-size:13px;font-weight:600;color:var(--muted);transition:.15s;}
.hz-hlink:hover{color:var(--text);background:var(--surface);}
.hz-hlink.active{color:var(--ember);}
.hz-hhero{position:relative;overflow:hidden;padding:64px 24px 60px;}
.hz-hhero-bg{position:absolute;inset:0;background:radial-gradient(60% 80% at 80% 0%,color-mix(in srgb,var(--ember) 26%,transparent),transparent 60%),radial-gradient(50% 60% at 0% 100%,color-mix(in srgb,var(--jade) 16%,transparent),transparent 60%);}
.hz-hhero-in{position:relative;max-width:1100px;margin:0 auto;z-index:1;}
.hz-hhero h1{font-size:clamp(34px,6vw,62px);line-height:1.02;font-weight:800;letter-spacing:-.03em;margin-top:16px;}
.hz-hhero h1 span{background:linear-gradient(135deg,var(--ember),var(--saffron));-webkit-background-clip:text;background-clip:text;-webkit-text-fill-color:transparent;}
.hz-hhero p{max-width:520px;font-size:15px;color:var(--muted);margin:16px 0 0;line-height:1.5;}
.hz-hcta{display:flex;gap:12px;margin-top:26px;flex-wrap:wrap;}
.hz-hstats{display:flex;gap:30px;margin-top:34px;}
.hz-hstats b{font-family:var(--fm);font-size:26px;font-weight:700;}.hz-hstats small{font-size:14px;}
.hz-hstats span{display:block;font-size:11.5px;color:var(--muted);text-transform:uppercase;letter-spacing:.05em;margin-top:2px;}
.hz-hhero-art{position:absolute;right:-10px;top:50%;transform:translateY(-50%);display:flex;flex-direction:column;gap:10px;font-size:54px;opacity:.92;filter:drop-shadow(0 8px 14px rgba(0,0,0,.25));z-index:1;}
.hz-hhero-art span{animation:floatY 3.4s ease-in-out infinite;}
.hz-hhero-art span:nth-child(2){animation-delay:.5s;}.hz-hhero-art span:nth-child(3){animation-delay:1s;}.hz-hhero-art span:nth-child(4){animation-delay:1.5s;}.hz-hhero-art span:nth-child(5){animation-delay:2s;}
.hz-hsec{max-width:1100px;margin:0 auto;padding:34px 20px 0;}
.hz-hsec-h{display:flex;align-items:flex-end;justify-content:space-between;gap:14px;margin-bottom:18px;flex-wrap:wrap;}
.hz-eyebrow{font-size:11.5px;font-weight:700;text-transform:uppercase;letter-spacing:.07em;color:var(--ember);}
.hz-hsec-h h2{font-size:25px;font-weight:800;margin-top:6px;}
.hz-hfeats{display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:13px;}
.hz-hfeat{display:flex;align-items:center;gap:13px;padding:17px;border-radius:15px;background:var(--surface);border:1px solid var(--border);}
.hz-hfeat-ic{width:42px;height:42px;border-radius:12px;display:grid;place-items:center;color:var(--ember);background:color-mix(in srgb,var(--ember) 13%,transparent);flex-shrink:0;}
.hz-hfeat b{display:block;font-size:14.5px;}.hz-hfeat span{font-size:12px;color:var(--muted);}
.hz-hmenu{display:grid;grid-template-columns:repeat(auto-fill,minmax(210px,1fr));gap:14px;}
.hz-hmenu .hz-fcard{cursor:pointer;}
.hz-hbranches{display:grid;grid-template-columns:1fr 1fr;gap:14px;}
.hz-hbranch{display:flex;flex-direction:column;gap:8px;padding:20px;border-radius:17px;background:var(--surface);border:1px solid var(--border);}
.hz-hbranch-top{display:flex;align-items:center;justify-content:space-between;margin-bottom:4px;}
.hz-hbranch b{font-size:16px;font-family:var(--fd);}
.hz-hbranch-addr{display:flex;align-items:center;gap:6px;font-size:12.5px;color:var(--muted);}
.hz-hbranch .hz-cta{margin-top:8px;align-self:flex-start;}
.hz-hband{max-width:1100px;margin:40px auto 0;padding:0 20px;}
.hz-hband-in{display:flex;align-items:center;justify-content:space-between;gap:20px;flex-wrap:wrap;padding:30px;border-radius:20px;background:linear-gradient(120deg,var(--ember),var(--saffron));color:#fff;overflow:hidden;position:relative;}
.hz-hband-in::after{content:"";position:absolute;inset:0;background:radial-gradient(circle at 90% -20%,rgba(255,255,255,.3),transparent 50%);}
.hz-hband-in>div{position:relative;}
.hz-hband h2{font-size:25px;font-weight:800;}
.hz-hband p{font-size:14px;opacity:.94;margin:6px 0 0;}
.hz-hband-in .hz-cta{position:relative;background:#1a1410;color:#fff;}
.hz-hfoot{max-width:1100px;margin:46px auto 0;padding:24px 20px;border-top:1px solid var(--border);display:flex;align-items:center;justify-content:space-between;gap:14px;flex-wrap:wrap;}
.hz-hfoot>span{font-size:12px;color:var(--muted);}

.hz-ohome{display:inline-flex;align-items:center;gap:6px;padding:8px 13px;border-radius:99px;font-size:12.5px;font-weight:600;background:var(--surface);border:1px solid var(--border);color:var(--text);transition:.15s;}
.hz-ohome:hover{border-color:var(--ember);}
.hz-obar .hz-icbtn{margin-left:0;}
.hz-modetabs{display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:16px;}
.hz-modetab{display:inline-flex;align-items:center;justify-content:center;gap:7px;padding:13px 8px;border-radius:13px;font-size:13px;font-weight:700;background:var(--surface);border:1.5px solid var(--border);color:var(--muted);transition:.16s;position:relative;}
.hz-modetab:hover{transform:translateY(-2px);}
.hz-modetab.on{color:#fff;background:linear-gradient(135deg,var(--ember),var(--saffron));border-color:transparent;box-shadow:0 8px 22px -10px var(--ember);}
.hz-modetab em{font-style:normal;font-size:8.5px;font-weight:700;text-transform:uppercase;letter-spacing:.04em;background:var(--saffron);color:#1a1410;padding:1px 5px;border-radius:5px;position:absolute;top:-6px;right:8px;}
.hz-ctxbar{display:flex;align-items:center;justify-content:space-between;gap:10px;background:var(--surface);border:1px solid var(--border);border-radius:12px;padding:10px 13px;margin-bottom:12px;}
.hz-ctxchip{display:inline-flex;align-items:center;gap:7px;font-size:13px;font-weight:600;}
.hz-ctxchip svg{color:var(--ember);}
.hz-ctxchange{display:inline-flex;align-items:center;gap:3px;font-size:12.5px;font-weight:700;color:var(--ember);}
.hz-setup{display:flex;flex-direction:column;gap:11px;background:var(--surface2);border:1px solid var(--border);border-radius:13px;padding:14px;margin-bottom:14px;animation:hzUp .3s;}
.hz-setup-row{display:flex;align-items:center;gap:12px;}
.hz-setup-l{font-size:12px;font-weight:700;color:var(--muted);width:54px;flex-shrink:0;}
.hz-qrsoon{text-align:center;padding:40px 20px;background:var(--surface);border:1px solid var(--border);border-radius:18px;}
.hz-qrbox.big{width:120px;height:120px;border-radius:22px;margin:0 auto 18px;}
.hz-qrsoon h3{font-size:20px;font-weight:800;}
.hz-qrsoon p{max-width:420px;margin:10px auto 18px;font-size:13.5px;color:var(--muted);line-height:1.5;}

/* admin/manager additions */
.hz-brtag.big{font-size:11px;padding:5px 11px;border-radius:99px;}
.hz-addstock{background:var(--surface2);border:1px solid var(--border);border-radius:12px;padding:12px;margin-bottom:14px;}
.hz-addstock-h{display:flex;align-items:center;gap:6px;font-size:12px;font-weight:700;color:var(--muted);margin-bottom:9px;}
.hz-addstock-row{display:flex;gap:7px;}
.hz-addstock-row input{flex:1;min-width:0;padding:9px 10px;border-radius:9px;background:var(--surface);border:1px solid var(--border);color:var(--text);font-size:13px;outline:none;}
.hz-addstock-row input:focus{border-color:var(--ember);}
.hz-addstock-row .hz-qtyin{flex:0 0 56px;}.hz-addstock-row .hz-unitin{flex:0 0 72px;}
.hz-addstock-row .hz-fulfill{flex-shrink:0;}
.hz-brchecks{display:flex;gap:8px;}
.hz-brcheck{display:inline-flex;align-items:center;gap:6px;padding:9px 14px;border-radius:10px;font-size:12.5px;font-weight:600;background:var(--surface);border:1.5px solid var(--border);color:var(--muted);transition:.15s;}
.hz-brcheck.on{border-color:var(--jade);color:var(--jade);background:color-mix(in srgb,var(--jade) 9%,var(--surface));}
.hz-brmini{display:inline-flex;gap:5px;}
.hz-brmini-b{font-size:10px;font-weight:700;padding:2px 8px;border-radius:6px;border:1px solid var(--border);color:var(--muted);background:var(--surface2);transition:.15s;}
.hz-brmini-b.on{color:var(--jade);border-color:var(--jade);background:color-mix(in srgb,var(--jade) 12%,transparent);}
.hz-onlyat{display:inline-flex;align-items:center;gap:4px;font-size:10.5px;font-weight:700;color:var(--saffron);background:color-mix(in srgb,var(--saffron) 13%,transparent);padding:2px 8px;border-radius:6px;margin-top:7px;}

.hz-payrow{background:var(--bg2);border:1px solid var(--border);border-radius:13px;padding:13px;}
.hz-payrow-top{display:flex;align-items:center;gap:11px;flex-wrap:wrap;}
.hz-pay-id{display:flex;align-items:center;gap:7px;flex-wrap:wrap;}.hz-pay-id b{font-size:13.5px;}
.hz-pay-nums{margin-left:auto;display:flex;gap:18px;}
.hz-pay-num{text-align:right;}
.hz-pay-num span{display:block;font-size:10px;color:var(--muted);text-transform:uppercase;letter-spacing:.04em;}
.hz-pay-num b{font-family:var(--fm);font-size:14px;}
.hz-pay-num b.adv{color:var(--saffron);}.hz-pay-num b.rem{color:var(--jade);}
.hz-advlist{display:flex;flex-wrap:wrap;gap:6px;margin-top:10px;}
.hz-advchip{display:inline-flex;align-items:center;gap:4px;font-size:10.5px;font-weight:600;color:var(--muted);background:var(--surface2);border:1px solid var(--border);padding:3px 9px;border-radius:99px;}
.hz-payacts{display:flex;gap:8px;margin-top:11px;}
.hz-paybtn2{display:inline-flex;align-items:center;gap:6px;padding:8px 13px;border-radius:9px;font-size:12px;font-weight:700;background:var(--surface2);border:1px solid var(--border);color:var(--text);transition:.15s;}
.hz-paybtn2:hover{border-color:var(--ember);}
.hz-paybtn2.adv:hover{border-color:var(--saffron);color:var(--saffron);}
.hz-paybtn2.pay{color:#0c0a08;background:linear-gradient(135deg,var(--jade),var(--saffron));border-color:transparent;}
.hz-paybtn2.pay:hover{filter:brightness(1.05);}
.hz-monthpick{flex:0 0 100%;display:flex;align-items:center;gap:9px;flex-wrap:wrap;}
.hz-monthpick-l{display:inline-flex;align-items:center;gap:5px;font-size:11px;font-weight:700;color:var(--muted);text-transform:uppercase;letter-spacing:.04em;}
.hz-monthin{padding:9px 11px;border-radius:9px;background:var(--surface);border:1px solid var(--border);color:var(--text);font-size:13px;font-family:var(--fm);outline:none;color-scheme:dark;}
.hz[data-theme="light"] .hz-monthin{color-scheme:light;}
.hz-monthin:focus{border-color:var(--ember);}
.hz-paidnote{font-size:11px;font-weight:600;color:var(--saffron);}

/* QR codes */
.hz-qrhead{display:flex;align-items:flex-start;gap:11px;background:var(--surface);border:1px solid var(--border);border-radius:14px;padding:14px 16px;margin-bottom:14px;}
.hz-qrhead>svg{color:var(--ember);margin-top:2px;flex-shrink:0;}
.hz-qrhead b{display:block;font-size:14px;font-family:var(--fd);}
.hz-qrhead span{font-size:12px;color:var(--muted);}
.hz-qrprev{text-align:center;}
.hz-qrframe{display:grid;place-items:center;padding:16px;background:#fff;border-radius:14px;margin:4px auto 12px;width:fit-content;}
.hz-qrimg{display:block;width:230px;height:230px;border-radius:6px;}
.hz-qrfallback{width:230px;height:230px;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:10px;color:#9a8;text-align:center;font-size:11.5px;padding:18px;}
.hz-qrfallback span{color:#666;}
.hz-qrlink{background:var(--surface2);border:1px solid var(--border);border-radius:9px;padding:9px 11px;font-family:var(--fm);font-size:11.5px;color:var(--muted);word-break:break-all;margin-bottom:11px;}
.hz-qracts{display:flex;gap:9px;justify-content:center;margin-bottom:11px;flex-wrap:wrap;}
.hz-qracts .hz-cta{flex:0 0 auto;}
.hz-countin{width:46px;padding:4px 7px;border-radius:7px;background:var(--surface);border:1px solid var(--border);color:var(--text);font-family:var(--fm);font-size:12px;outline:none;text-align:center;}
.hz-qrgrid{display:grid;grid-template-columns:repeat(auto-fill,minmax(120px,1fr));gap:12px;}
.hz-qrcell{display:flex;flex-direction:column;align-items:center;gap:8px;padding:12px;background:var(--bg2);border:1px solid var(--border);border-radius:12px;}
.hz-qrcell-top{font-size:12px;font-weight:700;}
.hz-qrcell img{width:108px;height:108px;background:#fff;padding:6px;border-radius:8px;}
.hz-qrcell-fb{width:108px;height:108px;display:grid;place-items:center;background:#fff;border-radius:8px;color:#bbb;}

/* dine-in banner */
.hz-dinebanner{display:flex;align-items:center;gap:12px;padding:15px 17px;border-radius:16px;background:linear-gradient(120deg,var(--ember),var(--saffron));color:#fff;margin-bottom:14px;box-shadow:0 14px 32px -14px var(--ember);}
.hz-dine-ic{width:42px;height:42px;border-radius:12px;background:rgba(255,255,255,.2);display:grid;place-items:center;flex-shrink:0;}
.hz-dinebanner b{display:block;font-size:15px;font-family:var(--fd);}
.hz-dinebanner span{font-size:12px;opacity:.94;}

/* rider / team / print */
.hz-rideraddr{display:flex;align-items:center;gap:6px;font-size:12px;color:var(--muted);margin:2px 0 9px;flex-wrap:wrap;}
.hz-ridercall{display:inline-flex;align-items:center;gap:4px;margin-left:auto;color:var(--jade);font-weight:700;font-family:var(--fm);font-size:12px;text-decoration:none;}
.hz-roletag{font-size:9.5px;font-weight:700;text-transform:uppercase;letter-spacing:.04em;}
.hz-printbtn{display:inline-flex;align-items:center;gap:5px;padding:7px 12px;border-radius:9px;font-size:12px;font-weight:700;color:#fff;background:linear-gradient(135deg,var(--ember),var(--saffron));}
.hz-printbtn:hover{filter:brightness(1.06);}
.hz-mrow.isnew{border-color:var(--saffron);box-shadow:0 0 0 1px var(--saffron);}
.hz-invgrid{display:grid;grid-template-columns:1fr 1fr;gap:12px 20px;}
@media(max-width:640px){.hz-invgrid{grid-template-columns:1fr;}}

.hz-printroot{position:fixed;inset:0;z-index:200;background:rgba(10,8,6,.72);backdrop-filter:blur(3px);display:flex;flex-direction:column;align-items:center;overflow:auto;padding:20px;}
.hz-print-toolbar{width:100%;max-width:760px;display:flex;align-items:center;justify-content:space-between;gap:12px;color:#fff;margin-bottom:16px;font-weight:700;font-size:13px;}
.hz-print-toolbar>span{display:inline-flex;align-items:center;gap:7px;}
.hz-print-toolbar>div{display:flex;gap:9px;}
.hz-print-toolbar .hz-ghost{background:rgba(255,255,255,.14);border-color:transparent;color:#fff;}
.hz-print-btns{display:flex;gap:9px;flex-wrap:wrap;}
.hz-print-toolbar .hz-printbtn.kit{background:#111;color:#fff;}
.hz-print-toolbar .hz-printbtn.bill{background:linear-gradient(135deg,var(--ember),var(--saffron));}
.hz-print-toolbar .hz-ghost{background:rgba(255,255,255,.14);border-color:transparent;color:#fff;}
.hz-receipts{display:flex;gap:18px;flex-wrap:wrap;justify-content:center;}
.hz-receipt{width:300px;background:#fff;color:#111;border-radius:6px;padding:18px 20px;font-family:var(--fm);font-size:12px;line-height:1.5;}
.hz-rc-tag{display:inline-block;font-size:9px;font-weight:700;letter-spacing:.1em;background:#111;color:#fff;padding:2px 8px;border-radius:3px;margin-bottom:8px;}
.hz-rc-tag.alt{background:#E85518;}
.hz-rc-title{font-family:var(--fd);font-weight:800;font-size:18px;text-align:center;letter-spacing:.02em;}
.hz-rc-title.big{font-size:22px;}
.hz-rc-sub{text-align:center;font-size:10.5px;color:#555;}
.hz-rc-hr{border-top:1px dashed #bbb;margin:9px 0;}
.hz-rc-row{display:flex;justify-content:space-between;gap:10px;}
.hz-rc-row span{color:#555;}
.hz-rc-row b{text-align:right;}
.hz-rc-row b.addr{max-width:180px;font-weight:600;}
.hz-rc-row.total{font-size:15px;font-weight:800;border-top:1px solid #111;border-bottom:1px solid #111;padding:4px 0;margin-top:3px;}
.hz-rc-items{width:100%;border-collapse:collapse;}
.hz-rc-items td{padding:2px 0;vertical-align:top;}
.hz-rc-items td.qty{width:34px;font-weight:700;}
.hz-rc-items td.amt{text-align:right;white-space:nowrap;width:80px;}
.hz-rc-items tr.head td{font-weight:700;border-bottom:1px solid #111;color:#111;}
.hz-rc-note{font-weight:700;}
.hz-rc-foot{text-align:center;font-size:10px;color:#555;margin-top:2px;}
.hz-printroot.show-kitchen .hz-receipt.bill{opacity:.35;}
.hz-printroot.show-bill .hz-receipt.kitchen{opacity:.35;}
@media print {
  body * { visibility: hidden !important; }
  .hz-printroot, .hz-printroot * { visibility: visible !important; }
  .hz-printroot { position:absolute; inset:0; background:#fff !important; backdrop-filter:none; padding:0; display:block; }
  .hz-print-toolbar, .hz-print-toolbar * { visibility: hidden !important; display:none !important; }
  .hz-receipts { gap:0; }
  .hz-receipt { width:100%; max-width:320px; page-break-after:always; border-radius:0; opacity:1 !important; }
  .hz-printroot.show-kitchen .hz-receipt.bill { display:none !important; }
  .hz-printroot.show-bill .hz-receipt.kitchen { display:none !important; }
}
.hz-payedit{display:flex;gap:7px;align-items:center;margin-top:11px;flex-wrap:wrap;}
.hz-payedit input{flex:1;min-width:120px;padding:9px 11px;border-radius:9px;background:var(--surface);border:1px solid var(--border);color:var(--text);font-size:13px;outline:none;}
.hz-payedit input:focus{border-color:var(--ember);}
.hz-joined{font-size:10.5px;color:var(--muted);font-style:italic;}
.hz-months{display:flex;flex-wrap:wrap;gap:6px;margin-top:11px;}
.hz-month{display:inline-flex;align-items:center;gap:4px;font-size:11px;font-weight:700;font-family:var(--fm);padding:5px 10px;border-radius:8px;border:1px solid var(--border);background:var(--surface2);color:var(--muted);transition:.15s;}
.hz-month:hover{border-color:var(--saffron);color:var(--text);}
.hz-month.paid{color:var(--jade);border-color:color-mix(in srgb,var(--jade) 45%,var(--border));background:color-mix(in srgb,var(--jade) 12%,transparent);}
.hz-month.cur:not(.paid){color:var(--rose);border-color:color-mix(in srgb,var(--rose) 45%,var(--border));background:color-mix(in srgb,var(--rose) 10%,transparent);animation:ringPulse 2.4s infinite;}
.hz-advlbl{font-size:10.5px;font-weight:700;color:var(--muted);text-transform:uppercase;letter-spacing:.04em;align-self:center;}
@media(max-width:560px){.hz-pay-nums{width:100%;margin-left:0;justify-content:space-between;gap:8px;}.hz-pay-num{text-align:left;}}


@media(max-width:620px){.hz-modetabs{grid-template-columns:1fr;}.hz-hbranches{grid-template-columns:1fr;}.hz-hhero-art{display:none;}.hz-hstats{gap:22px;}}
@media(max-width:760px){.hz-mgrid,.hz-staffgrid{grid-template-columns:1fr;}.hz-ohero h1{font-size:34px;}.hz-ohero-art{display:none;}}
@media(max-width:520px){.hz-menugrid2{grid-template-columns:1fr 1fr;}.hz-ident{display:none;}.hz-hero-title{font-size:23px;}.hz-segt.wide4 button{font-size:11px;padding:8px 5px;}.hz-modecards{grid-template-columns:1fr;}}
@media(prefers-reduced-motion:reduce){.hz *,.hz *::before,.hz *::after{animation:none!important;transition:none!important;}.hz-embers,.hz-login::before{display:none;}}

/* ================= MOBILE / RESPONSIVE ================= */
/* iOS safe areas (notch) */
.hz-bar,.hz-obar{padding-left:max(14px,env(safe-area-inset-left));padding-right:max(14px,env(safe-area-inset-right));}
.hz-wrap,.hz-owrap{padding-bottom:calc(28px + env(safe-area-inset-bottom));}
.hz-floatcart{bottom:calc(18px + env(safe-area-inset-bottom));}

@media(max-width:900px){
  /* tab bars scroll horizontally instead of squashing */
  .hz-segt{overflow-x:auto;-webkit-overflow-scrolling:touch;scrollbar-width:none;}
  .hz-segt::-webkit-scrollbar{display:none;}
  .hz-segt button{flex:0 0 auto;white-space:nowrap;}
  .hz-segt.wide5,.hz-segt.wide6,.hz-segt.wide7{display:flex;}
}
@media(max-width:768px){
  .hz-wrap{padding:16px 14px 40px;}
  .hz-head h1{font-size:22px;}
  .hz-head{flex-wrap:wrap;gap:10px;}
  .hz-dashrow{grid-template-columns:1fr 1fr;}
  .hz-dashcard.big{grid-column:1 / -1;}
  .hz-dashcard-val{font-size:19px;}
  .hz-dashcard.big .hz-dashcard-val{font-size:24px;}
  .hz-mkpis{grid-template-columns:1fr 1fr;}
  .hz-myday{grid-template-columns:1fr 1fr;}
  .hz-branchstatus{gap:10px;}
  .hz-bs-hint{margin-left:0;flex-basis:100%;}
  .hz-chart{height:150px;gap:5px;}
  .hz-chfill{max-width:30px;}
  .hz-chval{font-size:9.5px;}
  .hz-chlbl{font-size:9.5px;}
  /* staff activity → 2 columns, labels stacked */
  .hz-staffact-head{display:none;}
  .hz-staffact{grid-template-columns:1fr auto;gap:4px 10px;}
  .hz-staffact-name{grid-column:1;grid-row:1 / span 2;}
  .hz-staffact-n,.hz-staffact-s{text-align:right;font-size:12px;}
  .hz-staffact-n::after{content:" today";font-size:9.5px;color:var(--muted);font-weight:600;}
  .hz-staffact-n.muted::after{content:" yest.";}
  /* forms & rows stack */
  .hz-addstock-row{flex-wrap:wrap;}
  .hz-addstock-row input{min-width:0;}
  .hz-addstock-row .hz-qtyin,.hz-addstock-row .hz-unitin{flex:1 1 90px;}
  .hz-costin{flex:1 1 100%;}
  .hz-row2{grid-template-columns:1fr;}
  .hz-corow{flex-direction:column-reverse;gap:9px;}
  .hz-corow .hz-cta,.hz-corow .hz-back{width:100%;}
  .hz-paypick{grid-template-columns:1fr;}
  /* order rows */
  .hz-mfoot{flex-wrap:wrap;gap:8px;}
  .hz-macts{margin-left:auto;flex-wrap:wrap;}
  .hz-mmeta{gap:8px 12px;flex-wrap:wrap;font-size:11px;}
  .hz-userrow{flex-wrap:wrap;}
  .hz-dutywrap{width:100%;justify-content:flex-end;}
  /* notifications panel fits screen */
  .hz-bellpanel{width:min(300px,calc(100vw - 28px));right:-8px;}
  /* print preview */
  .hz-print-toolbar{flex-direction:column;align-items:stretch;gap:10px;}
  .hz-print-btns{flex-direction:column;}
  .hz-print-btns button{width:100%;justify-content:center;}
  .hz-receipt{width:100%;max-width:340px;}
  .hz-qrgrid{grid-template-columns:repeat(auto-fill,minmax(108px,1fr));}
}
@media(max-width:480px){
  .hz-wrap{padding:14px 12px 40px;}
  .hz-dashrow,.hz-mkpis{grid-template-columns:1fr 1fr;gap:9px;}
  .hz-dashcard{padding:12px;}
  .hz-md b{font-size:17px;}
  .hz-bn{font-size:15px;}
  .hz-bar-r{gap:6px;}
  .hz-ctl span,.hz-ctl{font-size:11px;}
  .hz-hero-title{font-size:21px;}
  .hz-cosum{font-size:13px;}
  .hz-buyrow{flex-wrap:wrap;font-size:12px;}
  .hz-buydate{min-width:0;}
  .hz-bs-item{flex:1 1 100%;justify-content:space-between;}
}
/* tap targets comfortable on touch devices */
@media(hover:none){
  .hz-mini,.hz-icbtn{min-width:38px;min-height:38px;}
  .hz-toggle{min-width:44px;min-height:26px;}
  button{touch-action:manipulation;}
}
`;
