import React, { useState, useEffect, useRef, useMemo } from "react";
import {
  Flame, Sun, Moon, ChefHat, Store, Car, ShoppingBag, QrCode, Clock, Bell,
  Star, Plus, Minus, Check, ArrowRight, Play, Pause, LogOut, ClipboardList,
  User, Hash, Receipt, Trash2, ChevronRight, ChevronLeft, ShieldCheck, Users,
  CircleAlert, MapPin, CheckCircle2, Soup, UserPlus, KeyRound, Wallet,
  Lock, Package, AlertTriangle, PackagePlus, X, Search,
  ImagePlus, UtensilsCrossed, Truck, Bike, Home, Phone, CreditCard, Banknote,
  Building2, Navigation, ShoppingCart, BarChart3, TrendingUp, Boxes, Calendar, Pencil, Info, Wifi, WifiOff,
} from "lucide-react";
import { db, FIREBASE_READY } from "./firebase";
import { doc, collection, getDoc, getDocs, setDoc, updateDoc, deleteDoc, onSnapshot, writeBatch, runTransaction, query, orderBy, limit } from "firebase/firestore";

// Firestore rejects `undefined` field values outright (throws synchronously).
// Several order fields are intentionally undefined (e.g. `table` on a delivery
// order) — this strips them before any write so the app never crashes on save.
const sanitize = (obj) => JSON.parse(JSON.stringify(obj));

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

/* ===== Customer-side "my orders" memory =====
   Customers don't log in, so the only way to remember "this browser placed
   this order" across a refresh (or days later, to show order history) is
   localStorage. Kept for 30 days, or until the customer clears it themselves. */
const MY_ORDERS_KEY = "hz_my_orders";
const MY_ORDERS_TTL = 30 * DAY;
function loadMyOrders() {
  try {
    const raw = JSON.parse(localStorage.getItem(MY_ORDERS_KEY) || "[]");
    const fresh = raw.filter((r) => now() - r.at < MY_ORDERS_TTL);
    if (fresh.length !== raw.length) localStorage.setItem(MY_ORDERS_KEY, JSON.stringify(fresh));
    return fresh; // [{ id, at, status }]
  } catch { return []; }
}
function loadMyOrderIds() { return loadMyOrders().map((r) => r.id); }
/* Whether this browser has an order that (as of the last time we heard)
   wasn't finished yet — used on app load, before Firestore has synced
   anything, to decide whether to jump straight into the order flow. */
function hasActiveMyOrder() { return loadMyOrders().some((r) => r.status !== "completed"); }
function rememberMyOrder(id, status) {
  try {
    const raw = JSON.parse(localStorage.getItem(MY_ORDERS_KEY) || "[]");
    const next = [{ id, at: now(), status: status || "new" }, ...raw.filter((r) => r.id !== id)].slice(0, 40);
    localStorage.setItem(MY_ORDERS_KEY, JSON.stringify(next));
  } catch {}
}
/* Keeps the cached status current as an order moves through its stages, so
   the "was it still active?" check above stays accurate on the next visit. */
function updateMyOrderStatus(id, status) {
  try {
    const raw = JSON.parse(localStorage.getItem(MY_ORDERS_KEY) || "[]");
    if (!raw.some((r) => r.id === id)) return;
    localStorage.setItem(MY_ORDERS_KEY, JSON.stringify(raw.map((r) => r.id === id ? { ...r, status } : r)));
  } catch {}
}
function clearMyOrders() { try { localStorage.removeItem(MY_ORDERS_KEY); } catch {} }
const WD = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const dayName = (ts) => WD[new Date(ts).getDay()];
const dayNum = (ts) => new Date(ts).getDate();
const isToday = (ts) => ts >= dayStart(now());
const isYesterday = (ts) => ts >= dayStart(now()) - DAY && ts < dayStart(now());
const isLast7 = (ts) => ts >= dayStart(now()) - 6 * DAY;
const isThisMonth = (ts) => { const n = new Date(), d = new Date(ts); return d.getMonth() === n.getMonth() && d.getFullYear() === n.getFullYear(); };
const isThisYear = (ts) => new Date(ts).getFullYear() === new Date().getFullYear();
/* Human label for a date-group header: "Today" / "Yesterday" / an actual
   date for anything older, so old and new orders never look like one
   undated pile. */
const dayLabel = (ts) => isToday(ts) ? "Today" : isYesterday(ts) ? "Yesterday" : new Date(ts).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });

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
/* What "ready" and "done" are called depends on how the order leaves the
   kitchen — a dine-in table gets served, a takeaway gets collected, a car
   gets brought out, a delivery goes through the rider's own steps. */
const READY_LABEL = { dinein: "Ready to serve", takeaway: "Ready — please collect", carhop: "Ready for car", delivery: "Ready for rider" };
const DONE_LABEL = { dinein: "Mark served", takeaway: "Mark collected", carhop: "Mark delivered to car" };
const DONE_ICON = { dinein: MapPin, takeaway: ShoppingBag, carhop: Car };

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
/* ---- Real dish photos ----------------------------------------------
   Inlined as small thumbnails so a single-file build still shows them.
   The full-size versions live in /public/menu/*.jpg — once the backend
   is live, replace these with the photoUrl coming from the database. */
const IMG_BEEF_QEEMA_PARATHA = "data:image/jpeg;base64,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";
const IMG_BEEF_CHILLI_RICE = "data:image/jpeg;base64,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";
const IMG_CHICKEN_MOMOS = "data:image/jpeg;base64,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";
const IMG_HUNZA_PLATTER = "data:image/jpeg;base64,/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAAoHCAkIBgoJCAkMCwoMDxoRDw4ODx8WGBMaJSEnJiQhJCMpLjsyKSw4LCMkM0Y0OD0/QkNCKDFITUhATTtBQj//2wBDAQsMDA8NDx4RER4/KiQqPz8/Pz8/Pz8/Pz8/Pz8/Pz8/Pz8/Pz8/Pz8/Pz8/Pz8/Pz8/Pz8/Pz8/Pz8/Pz8/Pz//wAARCAFAAUADASIAAhEBAxEB/8QAGwAAAgMBAQEAAAAAAAAAAAAABAUCAwYHAQD/xAA9EAACAQMDAgQEBAUCBgIDAQABAgMABBEFEiExQRMiUWEGMnGBFCORsUJSocHRFeEkM2Jy8PEHghZDkmP/xAAaAQADAQEBAQAAAAAAAAAAAAABAgMABAUG/8QAKxEAAgICAgEEAgIBBQEAAAAAAAECEQMhEjFBBBMiUTJhcYFCBRQjobHB/9oADAMBAAIRAxEAPwB9E8aRndxSfUpwWbsD1+lF3Eg3HJwq0oYG4lLH5Aa4oqzqZUq/xkeZug9BVq/lpuP296kEAPNUF/Ek46DgU7YpdFhic/erFyW+XrwPeq1GBjPA60baRmQ+IeAOFpTEUiO4L2Xlj71WB+LvNqj8tKtv5fBQQxnMj0Vptv4UYz1PWsEMhQRJnsKWzSePcbe3ei7yXA2A0GIjGm4A7m5pQh0ZAAXoKBvZQ0uF+VeBUWnKDGeaFQl5eaIA23izgkc0wVRHF6Zoa3Gce1XsWc4FYwsvFMm7HelD24BJfr2pxfSLApLHFKFLTnxM5X+1DYyPoId0vTmnBjCRAd+n+aG0+MM2TRc7hVZj8vb6VQQU6nNuZYV6dT9KEfzbQOgoy4g3x+K3DOcn6UIw2KPeimYPsOHHoKaR3JmnCqeOgrPJc7IyAeTxTjQlMkm79KJjUo3hWuenGBVVt3kPVun0qq8l5SJe/wC1WxkCPJ7CszAurz7Ydi96u0S3MVt4jjzNSDVNXgivAJmGM5OfSnmnanFd2oMJ8uOOKxgic75OPpQcg3S4HQcfapysQSfWrLdQw57/ALUABdq4RCx6KKrWYyTFj8q8mqbxxGgjXvyagxMdqF/jfk0rCeJuurok9M0zj8mX/wDqtD2MQjhLdzwKuduQq9uPvQMGW/mO7sOlD38n8OavyIotvoOaXSlpJPY1jH0OQMfzcmsX8dQpKp28vW6iAALH7Vg/iiXffhV6ZpounZqvRzmZDG5BFQzWuGkR3hz0JPevZfhFyuU5+hrpjNMjKNMyFSFPrj4YuoVJwcD2pc+l3CHG3pT2LR0m4JllEKdB8xqEpVBsj6DqamPyISzcu9DMSELn7VxpUjouymZyT4aHk9atij2x+9CxxSmUsM470RuZTg54/rSsxNfM4T9TTBJBGmegA4oFEIAAGXY81J9zkRep5NYxZaRm4uTMw46LmnDEQw7v0oe1jVAAOABVdzIZpdgPFYJCLMkpkfoKlcTFVNSdgqiNe3WgLyTcfDX70KNYKzs8hY9D0oi3XLZNUhQevSirUAHJrGDQ3hpgdTV8DbUZmoVfO9Q1C58KA89BQYRNrE5uLvwUPGeaMt1SOAIRnigraLexlbqec0YuT0oroDC4gqLkVVPIJnWMHy9TVMk+xNtRVvDhLnq1MgFd7MN4UcD9qDmIK8elezEEZY8mh5W8uFrXsNFAz4mK12gALDuPeslGuGyae2V6I4wgNMmCjSIPEkZz34FV6pdJaWLMSBx/SqV1CFIR5hgCsvrF+2q3y2sZ/KHzH19qyMxbbWs2s6mZiD4Zbyj2readaC1gWNfuaDsEtrOFY0K7zwT6U0EqtH5D14FZuzJUeSAyHA+lEW42qSwwOtUxeXn1qUsv5ZA71gFRPi3JLdBya+Lma5AHQVAsI4Se7c15ZEodxHJoMI1jYhguOEqxCBLk/wAPP3qEYLJmqXJLgDuaUwU7lzx0NegAKW9eBXgGFHtUXcdOwrGISttjbHQCud6vJu1XntXQJ3AgbPpmub6ixfV+AcZ600QrsZ2SgYrS2qRvCOQDWftwBEOKvErDox/WnToSWx1c2RljwuftSx9EkyeD9xmox3Mi9HI+9Epezj/9hpuQtAbuHOWGaj4sRwCAcUZJp0yHBTI9qp/047ssrD7VqDZX4iBcbRivoxGxztFRvrdYYC4Y8DpQWnW17czB0JCZ6VqMN0ZFbOKv2xsu4AA1VJYXG8YHFEeA6R8qaV2jFLNtBweKH8TaxI617JvyfKaElkIHIxSjBAnUE5PWoARsxORk0qmnOcjpXiXRP1p0kxWxyYVI4YVfbxIBhmApKtw2OpqH450cZJxTKK+gWzWRxW46SLn61RqWnRTwEiRT7A0ttp/FQEGiAzY701L6Ft/YPZ2pkHhjoOKLFgyZ5FRVnU5Uc174sp6g1movwG2BT2+bpVPTNQvLeQMBghRRpty8gkwQwogwPKuCST7ihxjRuTM1OmR5hQzqqjPNM9Xt2tXAbuaWS8rxXJkVM6I7RJCAOtWqeOCP0odfl5r7cVHBpVYWfXE0mNoavrJfCBbue9RKljmpZKqaa2YtEjPKFDHk1qdOQpbgk9eBmsjZKWulz61rFfbCgB5Ap4isPaQdvoKqZw2B2oB5wictzQsl+FHBp6FobEiSQA9KIyqsAKzX+qYbIYZqDat5slx+tajUbVbhAu3PA4qPjRq+c1i21oL/AB/1rxdYZz5csKHE1G6NwmzOaCe6UE5assdUmbAwwFey3eEyxAP/AFGhQaNBcXkbIy7wAaRXltbkmVWy3sKVzX4ByZUH3oyy1CydQJrlKPQNHsbnbgA4q5fEJ+U03s30x0BWRW+hFGI+nA9f61J5kjKDESRyfymrPOvUU9M1iFyMfeqzJZyHAC0n+4/Q3tjIwzHqhyPavhDcD+A0aZ5G/iNexkk+Zj+tehRzgbWiuv5sKH6iqns7cDyIEI6YNWyMm9sknmqmdMY20OjIqMUifLNk+maiJXbrg/UVOSZTGwAC8dTWbZ2TlWI9waVzp0Mo2aItHnzQqR7GqZhYuBuhIz70i/HXA+WVse5zVUt3NK6hmOB6cUeaNwY8TT9PkJBRv0qgabpqueGH2ry0umJAIGAKClv3ViSq9aX3EHgxl+A03/q//mvDp2nEfIx+1Kxqj9o1qyPUpXYKEUZoqaA4MaQ21lF8iNVw/D9oj+tJpL6aNivlz9Kr/HzE/Nj7U/YnQ9LRdoh9zXwKZ4jUUl/EykcyGoeK5PLt+tGgWPjKEH8IoaS6G1iXHHpSdpGJ6ml2t6g9lZFkXcTxQYUAa7q6z34iQnyHnNVRzZA5pMllqN2smoLayNCDkuF4oqCbyjjtXPkXktBroZNJiqi5LD0qAcEc16rLmpIoFBjivmORVQkHrXzSADrQphLI5TEwYCiTfzuPIDQtrIhPmXdTOKVNvlRVq0FonJ7F8jXkp6kVEWdy55Jps0jkcEfYV4Hcd81QXYCmkyH5jj6mvTpODy9ETXUkYzivLa9d28yULCUrpCDliae6dFp8MYEoOfpVSTRuPMmPoakVQjIocqNxsYSLp0gwhx/SgZdItJSSCh+pqltoONwqGGz5TW5G4lw+G4JO6EfWpL8HWz9VSqBcSxdCauj1aZPX9aV5BljstHwTAo/Lbb9GxVUnwZKP+XPKPo9Fx60/cN+tELrLY6sKV5F9B9v9men+Dr4Z2XdwP/saX/8A4nq8Em+G8nyPXmtp/q7EjDn6U3g1e3KjMmDjGMcCleZLwMsN+QxI257VSyyK3UYollkIPlNCzSGEEvXScwNJEwkJY8Go3bxQW7SvwFGTVb3m75fX0oTVHMthMegCHrWaZl2KZNZ8djtjxH2Hc/WgY7re5BHFL/F2+QUVA6KnI5qLR0xpB0expME4FOrS3sSnm5asw1wA4x0o1JjsDKeKlNSa0MqsePaw4PhMMnpWc1CNopSrdM0whuwDktQ+qSJPgJy1SjyTpjtKtASDcAAMmpBHDcZBFMdIhjXzTITTR/wzAnYBRefg6oHt2jNkMTkkk+tfCmlxFEclaD8IZ4rrhnTWznlifgrVjUgxqz8OcZqUcOWC1ZTi1ZCUXHsrweCR1oDWIPGiHl3Kp5p8JDNBHEvCJwKVXqPNNceYlo0Bz+wrneZy6RFZQ7QLuCJBYToQnh7YyuABnnn/ADSiSxsjeRrGAFmbgDt/t6Gl9nK0l0sMrMA0oAbPYsAf3pn8T3ez4iW3ssO0QCBUGcY6AfbFL7j4gjJpjb8HZqG/C20YVBgMRkt9SaJtbS0mjKzW6Nx0Kjik0mvRwRYZcO2OPfFX2HxFZJM6XTMrHIBUZH3oxlG9iXIH1zQIrYpJakqHPMec4pJJp01at9Rg1O6VbOTcItzujcFlx1GevWvJUgJ4IGeR71W0+jpxzbWzOWenyqOhNGC2dRyKc26IrZBFEtGkg6CsVM/scdqmgfP+abvagHIGara3VhgdaDYyVgqQwycSECrBZwxZ2kYqL2xBoLUp2tbfg0vbG6QwHhZxmpFU25BrM288kvmDkn0o6G4lB25/UVTgT5gmpSTm5xExHPaq4bu6ilVZCSueSRTcxJsMjICR70ys7K31CwMirlumPemapCqTbE1zfeGFyNw9RU7W7hnXykVMfDV3PcYZSF7Uv1DRrqynPgZpHCLHjkaHaKpGRXpyO1I4pb6JfOmQO/Si4tYCDEyEf1qEsUvBZZYjHdx0qSSkdKrtNUsZ22s6qffij2jt3H5ci8+9RaaeyyafR0X5o8ggj+tJ9TAMZ4xRkMroD3FJtZuGUECvSRwxFuVLcVXqZ26VcEdkNUxyHFT1A7tHuM/yGjLoC7MdaxtNJnGaPa1k6KKJ0aBdue9MJysJ3DBNccsm6R1RjrYpjsTjM2Vqu4/LiKq3FG3VyZF5pVIGZTjr3po29sWTSJ2Zkml2A80xFs0MoBBc98ChbOKSIhiAD6d6MlLTKVby571w5fVY1LTF96KX7Dob5Ui4i8vTOKonvFkO1eKFhDx+RGLqeuSRjil7NPuO2JyQceUVsLhkdo0PUOWmqG7yDYADkmmWjaRNqDAg7Iu7kft60i0+URXcUl3A0kaMDJGeCR6V0XTbyG9RJLD/AJK+UALt2+2K6aSYXLWhXdfDlxEMwSpKB1BG00hvw9lcm3lQZKZba2eD/wCq1PxPqslk0UEZaJpEO5wOfpWXuE0+BVmurt2cpvEaIc5P8JJ71x+oyNt48f8AbOaeRyXEpguYogWBIAPAPvxVE8c0Usl1ayxSq5O5dwBAIpbqF611IVtIT4YGMIMgD69/rTTQNFkNxBdXQjkTOTbknz+gJFU9Nz48ZbILGCfFWh/6PoWn3qM/iMB4gA+Rm5FZW3lliYXSODODx3I+tdO+INZS9tZtN1LTxbxyEbnJLYwcjBxx9eaSA6Bp6eJCCJSMbom3frmrtKu6DKk6MddC68eMTxmNyu5VPp/bpXlnayXUuCGyDggYyaK1V4p78zpMXaUHyuMEdBQbsyAgcd8ihH5bYH+jo/w1oFhNpu+K+dbqKTzHaMqewOe3tV+pad+HuBbTbCsgLIYhjB9vv2rP6HqkujRwz3KNJBMikyRru684YevvUNc1s6uYnhVoxDkrzhgTW95Q/go4/H9hYXwLO5Mg5jUkyHgA9qTrrgQDLMKb6PqKXmoQRXlu1x4w8N1A+f0P1FXfEN3pepabJaW9oITbDeJwgQJjse5zVYZI3t99AjJrsUJ8QoBy5+4qJ+JId3m/UCsyc1Wy5NdXBFeTNenxHatw5/pQuq31pdxLskHvWZUdqsA4rKCTszm2qH2mG3iuMM6lSPWj5RbcyJIuc9KymMdKmpyKPHdgs0oulMLLkc0T8NXDf6itskvh+K3XPFZMMR0J/Wr4pGUghiCO9M1Ytnbl0qVowplVSO+yoJozIpDhJR69P3rl9l8V6zYgCC+kKj+FvMP607tP/kPVYxi4gt7ge6lT/Sj/AEDZq20aOSYrcW2YscZHGftVM/wnpM6FRFsJ7q2KXW//AMjQHi50yRfeKUH96b2vxxoMq/mvPEfSSHOP0zWTigbYmm/+O7AglJ5FJ9RSuf4E1CJsWd9lR0G7/NN/iD44063hB055HcnkrGUwPvSr4e+MNU1nXLfT7Zk/OY+aeMeUAZJ4ovhWwpyOhQxYPIoHWrNHtXbbyKdIFK7gaAvyrjYehpKKJ7MMIyDivdRST/SZ1UZJXiibsoLyUR/KpwKl4m6LgZ46UsmYylqtxGOjLRDGRkO5j960G8FcND/ShpYYpiI44SXY4AUVuKDzYs0/R73UZStsPKOrHoKeW/wlciRBNLEsYHO3nJ/vWp0ewk02zjg8PkLl+MnJ71YD52z6+tcuVKWn0Z77Ftr8OWCKwZfEbHzM37VP/QrZWzEMD0PNMjPKoIUcE9hURLMOSB0zXP7WJdIaimPTbdUULEiSD/pBDViviZU0/WpIkhEYmRXVlYgZ5yPbkVu/x+PmA49qSfENrFrUAiZVWUH8twOR7fStJxapCzg2hLomjXF6VuLksIHwct8zn/zvW2iUW1uI7YKgjGAF4FVQMsTokfyxjaq9q9d9pBLYLDkHsaqlS0CMeKoUX9pPeuBIgYZyCT/elLfCd885eLwURu7+Yj6Vr4wSdw7Lkg1cwLAZUnPYUqwx7YzZjpPhyRIhHcXUknIOEAAp9oulrEd7LwBhaMRojG+8EkYIB71U92UlwxGBxhatFRWxXZG/dWYpFGpwMEkZ+9K00HTpXM0ljFJI3UlBTlI4QfElk5cZ2iid0CDAGPvTuKfZhZJpmmxxASWFscj5TEv+M1l/iL4JtL6CS50IeBcAZNtnKP7L6GtZqscrN4sIG1fNjPUeg96XRXRiKSZ8p4NJJ1/AeKkjG2TSw/lSxkCMeGyOuOnGCKkNNhubr8hRCG/hPIH0rob29heK09zbRyPgZcjkj61CHSNLjuPEWNhkeUbuh9RXO/TqXkLafaEGi6BFYvJMly5laMphPKvPXNRi0XfZahpokSKa5xiR0JBX2P8AemN3KbO/dC5YE5DHvmvLV7jE1ypyNmxhjsTnNGKjGSS8G4as5ZrOlXWj3r2t4m1x0YdGHqKWgA9+a698S2VvrGiMmw+LAviK3UjHUD2rnA0bxYmltZ45Np5UN5h9q745E+ycvixSEGetT8P3qU9tLESHGKoVHFVtALgtTWM0Kxcd6kszqPmNa0YJ8JxXjK69qHN1KvenPwzeWzaiBqGAmPKcd6OgAyA7RlGU470XCEA5FNPim606Iq1mUOewrPpfDHKL/wD1RAO7e3tnG6VwoFCahqFlB+Var4kh44/zSqe9DuApIHcZonTrWMv4jDNJKVDJWexWTz/mXB9wtMLWDwZVlt90UkZyrocEGryUxgYFeGcKpAPNSbbKUdVk1CG2th5wzYpb/qKTozg8isubmWcgbvLV8UvgH2NOmNpFE93HHOQ5wWaiSxSFnX7Up1a0eZxNE3mXkCmNsJm09WkjZcjGSOM0LEotguyeHAp/ocSzXSTbNyoc5PAJoDR9HWaRZ7vJj/hT1+vtWnfZGqiJdmzsBgYpJ5UtIyiEtIisGzkN1GelUSwlWDLgr2PY0FO7A5U/r6V5HfGIfMRntXM8i8j8foMXcqlSuc96oeO4lYBQMY65wBREMskvmfyIehI6/SrJZREuOg/es/kgdMCGnp80szH2UYqqa4s7NdiKN7cep5oe/v38NjEpwOrnoKQktLMAGJLnGfWoOVOooolfY6/EMLnbnB7GiZd3lYNn3B/vS66Ux37KeSjdfWpNeBEZD09KdOtMDV9B7agIrdUIVSowcHqfels+tSvORxljnI4xQ89wsjFiBQO9STgc07cn5AqQ3bUGdAd3y9AaXXmplZ90gJLHsKhb280snkHHqeB+tU3sLMcMCPpRjFsLaDl1BpGUlug4x2qwXjvJkMazL/lkjLAjoRXyXs0bcncvqOtZpmVG1ttUeIqJPMp9sioX1kt5CZrEgOPMYvX6Vm4r3djz59ieabWV+sbAjIP1peV6fRmq2E6PfhvyZuGxhlPcVc5nt5dkgcxg8OvpVwt7W+cTK3hyHqQOM+tWtci1jeK42uqnG8dDR4a2wXs8Ph3MXg3EZkQnKE8H6+1DyyGCePwI9qjykJ3B9an+Jh4cEb26KK8NtclX5UtjcArYNavoIPe6glvFK0JKblKsg5PpWAg+Gry5k8WORYAxOCz81rviG3lfTZ57Ml7xiJCowMKOprHQ6rJFvcys8pGVUdql6j3EriaKg3xkFz6RrNhbF5oY7y0Xr3I+h6ilUVkup3ccWmo5kc4Mbj5fv6Vq/h7UZhdNFqcwHiDKrjqO4NazTLOzsrSSa1SMNIzFmXBNTwepnuMvAZYVF6OPXunTWt1JbzLiRDgihltic5GDWr+ILC5F/PdwwNJATncvNZ5r+0LbWbYw654r0seVZI2ico8XsAe3fdgLUxYyou8EijUltnORdKKlPOmzCyBvpVLYtCicPjLNkihvFbp/ai5znnrQrZAJxToVkA5SUHsetO9PuCjbGPB6VnnkzxijLCbcmwnzLyPcUGrCjVM3lzQdxcbFPNTt5fFgweoFKr4kMVNIkNZtjqlmpxHnH0rya83Rhk+U0lghBfJ4XPei5biBIiGkVcDgVkmGP7GEV5vCkdutdC3RPp8Efhq0RjHUcdK5NaS7tzo2yLOC5/YeprpljGYtLtoY3MnkB3tx15rnzS8IKabGoRViR7cZ2jlc9vpVYvLeT5x+jYoGWK5XAhZJvXAIA9s0ovTcI+TEwb/p5rnlOS6Q6in5NIZrInPggn/uNSSe3DAQwxhj04rHnUvCIE2+M+rDFOtBmS6naQOGVF4weCTQjklJ0ZwpDZ5PFuwpOR1b3qi6njk3EOGI4yDkV8R82MiXd0I7UJLarFEu7KtzkYx9MVRXTsTQJeTKls8cf8Z5PrQ2jRK92vicY5U56GvpwTMUzkZoy0jSEZGGJ9eKMVydsLdKiF+2293sw5PegrwqMP0BqrXLpYlJ2jjuRSWLWVurPwnOJY+GHqOxoToMbDpt2NynP3oe3nHi+Y80Hb6iEk8Ob5ezVdLCxfxbfzY6isnoLQ7S5eOEkDy+1VrfI7guOAaWi9kjXw5FKkj5WHNeJLGRkqaomLxG/wCFtLyTqkakZLE4oP8A0tEYuJldc9CMHFBmbap2fahWupmmSJMlnOMelFyMosY3GnRrdRx+PGDIfIc4J4zV0qW9mNrTmRyPKAcc/wB6XXl01qvhK5eTuTzivNOtpDILifLO3TPp60tX4CP7cmKDxJZCABnrjApRLqj6pqaRRNiFDgD1oi5nWcFG+RVJbtn0FV6TZQwSRmIMWUZZyOpPbFZxtGToaQyJJcPsxn5RnjFMZ5LiWw3Ww3Tx4yO5FKrWFYbjfLyJCeM1UNTMV6RG2B0wKV62HsL0yS4F+TKGUjghh29KUajFaQatcy29oglY79xbhAewp9EXMXiKxkZV+Yms5rlnC+obJJJxJKoKMhGMVHPax0FNJ2zPX1zi8LzSDIHAHajtG+IptOvzJEFkgxtdWHzetINS07wtQdJZmYnoc0ZYWEuYlZSCzYVAOPrmkuMMdLsSUJ5J2dHXUo7vTM26MpxwCANtZH4j+FzqFqbqK3aC5+mA/wDvTa9I0CxjQuzyvjBx/FUV+JrOG3aS+uQtwDwnzZ9MCufjnxtTj2dNwl8WcivILqxm8K5jaN+wYYzVaXLj+I10L4s0Q65El9al/H2Z2vxkVz25srq0bFxC6fUV7WDOssb8nJkxuDLBeSD+I1NdQfuFP2oA15mugkNfx6NjdEv61bHeWwIIjKsO4xSXNehiKxjTw6rDGQQCPWvLy+t7jmM4b3rNhzREQd+gNCkGzSo17dyeHCskjH+GMZP9Kug06cvuuo5IYwcMzqR9ue9bf4I0STTr+G5mmPiu5Xah8u0DnnHJ6Vf8cWhudQjkhu3klK7Rb7eB9MevvXLlzcY3EMk0jDXlzkqiLtiThVFdP+FNSj1HS4JSh2xARycdCB/jmuc2+lXl5qH4KOA+OD5lPGPcn0ro3wt8OnTrSWKaQM7Sbi0bHbgD0PfrzXHjb7Bj7HaMZ5ijPhQeQBx+lVSo0oLKoKrny4+WrLm4itCqKvzdx7eprJj4mC3pYEGLxNvXnrjpVeXgq6XYyv7IzqRJGMfSp6JpsdhFcGIYEhX+mf8ANF6i34fS3e4kdZGA2rnoewqFvNHDYpl+vJ+takM3oPguBCD4oV8DgMM0DqN6Jcnd9vSs5rWsMr7bchn7D0Hc1nG1i4mUsk/CsFceH0/rW5ykqXRuKW2bI3ESkkEEjuaHn1FAOWFZC4upyoYTuAehKgf0pYuruZyjyZx6jFZSYNNml1O78bPORWcuZQkcu0lWyO//AJ61Vc6qoXK5f6Gkd/eSzHjCD9TTqDkMmkO7HUDczC3kTLnoV708tpZoV/LbenoayfwtcLFqwMpB3eXn0NbqeyS3ljLTRx+KA2GycKe5A5rShxBzXk9jvobuVLeSFzI3AAXP7UxfRhbwGa6dYI8dHfzD7USJLHRLfdp6pLcOvNwTnI9vQewrLX17Ne3RM0jOT6n9vSha6e2bvoMvNUtLeMxWqud3BYryf8VLTICWa6cHdt4B7UDBYhXMjBXIAwBzTD8QUAQAZx0z0pv5M/0CLA8t5vk7nvR8kzISoxxwcYx1qC3CbOSM9zXkc6uSoUZbjNM6qgbLriUNG2yIKMAGoJfLbQ7pCqqvJzSfUtUSAndJgDPHqay9/qlzdzqoOyHqB3P1oJNhNdd/ESFlMZOBnaPU1PS5WffPIAznJGe1ZC3HmBY5NPbK8CKFwfpQUaexrNdp2okPhunSofENuj28N029ooyVYK2OO1KrI+LICPKPUmm2p3ROmrZ2qJLKWDNlsAKKnk/BoMV8kZ27/AyqdhWPA4/iOfrTvQJVurNDlS1uc/Wkt/p0jwlo/AQ45waY/B0QhFwsyBlCnOD7da8yUk0pXtM6klWgz4z/AOI0aKXPEUgJI9KxNmmnXGomeSXzZ4GeldDlhSfQ5IpMNx3rNRQCOVLYWUO2RhlgBuI9q6nk5Q0+/oioJSsdaXPaGMQmVcH/APY3JFG3nw7aXwBS4ilOOA3T9KR3ukqlyPwgxHnBBPOaa2un3gh8aGQeTqoOCPtXnPni3FnS0pdmA1/4L1SzuJJRbq0Ocgx81mzp02/bsO7OMYrvOlXE04MExWQ/ykUs1fRo5rl5I4I1kXldg9PWvT9N/qLkqmjkn6bemcXk0+WNiroQR2qr8MwPKmuq6lpljcTIVYmVx5gy7SDj0oL/APG42+Uc168HzVo5ckfblTOewxBTgrR8QUDAGK1cnwwQSeaqb4ekQZxT0Ts1elz3Gg6bDFeELPHbnfvb/lljwM9sDFT0W7i1OeZyGW6TlN7YDqepx9aqml/45ZARhshh1GDxiqL5TbtFdwht0ThmOcg814c8vKRfJjen4Nl8PaeyTz3sqhTLwqkc4HUn70fPF4kiuZnQI24bT29DXtlKzJO5HkGAhwRQt1cogdC43qOdvNNkUOCQ2NNaQJfRy3d4FgH5aqB4jEAsfpV2nfD9nZXjX8/5t31UkYCe4Hr70XZqtvbJcTk+M65IY/L9q+VPxw8WdiLfnCZxu9z/AIp8UeC/YZb/AIF+u2s2qWbLZoSwOVffjn6HrXPbrVLmFntpnniaMlWDruAI7eorot3ciK8tltVBtsMkqkeVTgFWH36/X2pF8R/D9vdxCedizO2fEU8gnpn1H7UXUnoDg++jM6Fp11c3Y1Kd0aAAoEJz4oIwQPQe/qKBvQNL1GSykjl8SRPIivxuz3HQnrj3x9K2GI9M022tlUHwlVc55wBWZ1CwgvddeWYxzKpUbHXHU9D2H156UcUqlfgrKFxS8gGoE2hfxnYqDt5AbBzjHHGeO1Ibjwbh8hQhPUg8Y9xT64+H4pJz4JAiRiAAxIHPQdqa6L8ORXEjCdVSFAN2ABk+gz0Penc4J2hVifkxA0+RLbx13eFv2FhyM1Q1rliXkDJ7cV1Y6FDb2JWEGLLZB38NjpmsB8UWktjKsix7QDhhjjnpT48vN0hZQ4itbcoytCu0jvmtZbXDXlmom8QTKu4sP+kYA/pS/wCHNKn1a0e6eRUjRiiKvViOpPoBTdrWOxj8CJmAfG/JyeBk8ipZpXollj8Uwa71eKBHgYlSDuHGOCB/fNKn1RM7lDfpQd8zzXzMmCeeM1erDY3iqdxA4PBFPFKrDjdqglPiIRtsaKU/9q0ZBrEM3Xcv/cMUpgkZn8TCqi565yfXiiEnBnKRb1RskL4Z4H/mKZ9FUhm1/F0DgfepxXoTLKQ5AyoB6ml0erR28wS5tdwU5DqoI/Sn9pd/D2oxFZ7OLf13qrQsPuMDFQlkcPyTobjfRk5dPu7qUuYpXYnqpDfpQ+qWf4BsYkcrxuaJlA+hPUVt5fh61YtNpWrXNqeqxzASr9Nwwf3qyRL2K1WO5upPDAOWTBU+npj/ABmjH1ONtJO7BKDo5vDdyM4VUJzx1pzbzrHtEvznt1qd9pQaIS2VvJ+JE5jlkVh4YG3jjqDkH7VCLQdT8M7YwZD0y3Jq85KtEkpvof6RMLqRvDUqB9xQeoRXqFJUufHd2O9I0IK/eiPgxXjuJUmVg4XDBhQI/wBRh1R5I42eEuR5ewzXnvk8jTekdSpJBESQXMHM0kUw9WP9RTTTH/A6TKzvy5K5z39aClaORhALIguf+aU5/WpXzyI8MFrE0gQeYDkVKcbSiiiZorHUIv8AlIglGwA7jSjVbmS21Fbq2YlVPKnrg1O1MSRbb+0eHI8rAlOfrVt5o34q0MljeGZ9ufCkHJ9ge9JihFNxbC5UxzYvBqSq+wmVR8itt3E9D9qP2LLI1jdOYjtxvXqp/vWG024mguPDhZ1lixkHg10K0s11rRmkuG8OR0/KccN96tihz/45ba/8J5m0riymPxNGiZ7uVJygwjbccYwKCW7WeYRxuyGYbhvPRqSXN7cWF1+A1ABmVsgMcq3uKUXGo3IvXcxmNojkJ7Vy5MUnN/8A3wNimmt9mnur+W3kMeoWayJjiQDP9ayWq6zeaRqhNtJut38yBuRg1vtIuYNXsCZYxKCvmHf/AGpZ8WLZ2fw5+EECNJIMJkAkd66fTepjiyUk96oGbHzX8Gesvjldw/GW6sO+2mi/Eul3meTHnsRXNjFk4JxVixKhBVvvX0Ns8yjeWDs8rDYXXGWKt0+/rU7K+8O8lW4j6+STBypHuOmaU6TqLwQCCSM7JDjceDz6Z4qKSi3mwpLedtrZzkbiAc9DXhPE4xs9JtN0dS03VYb63W1O1JlwGCjAK+o/uKZPJsiMSEbQQMkVzHSppZLhz4zrNCu6EqRkHNaK31eC42G5eaO4LZJWQhSR7dvoftSxc+eyLhvRotSu7ddMIuFRi+VGRjmlNlZXUmxg7Jaod4EjEg/Qd68WSO8RjcIpRucZ68+1G3l44tSY12IBgkkDH2qyfLbGSrQDcSeG4AUdPKCaFm1DxHWGWRV2vtK96FudQhkR/DmDNtIBBwwPas207uwkwzMTnAP9anVHbNppIN1e9miuGmhhbYZSBIefTilljPBqcqRYxJAQdzrlWx0BI5/X0q6e+wzR3OVI5Rmz5fX6ZPftULW4iN34aSySRzOF3mXJAG44x35PX68V1wrizkl2PGkhgsjGwVXYhkA5ypJzkjoeKNCXEVoslpKY4ycsJYgcNgcA9cftQK6WNRWdYp2j8Fcnad2BnstE2lw0MAW7XEaJvy+ACB5c/SuNqr4lk/sgNfnglEOo2Ue0Y8y85+1X31hpvxHpLxBxtdSY3Xkq3qPv2qi6mstRVVLru24jbfgj0+vpikel3X+l3lzDLxmQFUXnJNNBtbXYk1eizSGGkWFzYS20KOucMueSfU0Dc3CLDn+Nx69F9PvUfiHUETWPEWFlWeNXO8dSCRn6Ulmvl8ZJJwxTdkDux/xVHFyknRwZFKU+P0MLXR4bhxLLI53gErxijdR0a1trUyWilHxjBcnPHWlQ1aVz/wALGo9WPOKvjjvLtd95IzxLzjoP0FO3JbZ0xgl0EaF8P3OrgyMCkScNkhe3I/T6mtdB8M6ZbJlok8RcfmgkH6jvSjRtTgsg8ckoEajcRjAz0AouLXgZGdmRAHwWYEkZ9B0AqM5Sm6ReMaVgms/B1zOwm067W4hAz4UqiMhj1wQMHt1pfafDd3GVN67WUbHbuK5BPoCMjNatdVUFXEsWXHD7s7R0BIxkV5Pqcij8y8t2PyrGOR164xxVFla7EcPoXW/whGqB4dUuEO3O3YMe3ORigLm2msRLZ6leTKZF3RSqN6MB1Vh1yfUHjv1pzFNGy+E99CCp3bcHufrzVGrT2zbI7rE0co8p245H36j60nJfk4iPktSZmk3R6rHJIS8bYLMAfMfU961S3OnxoWtJmluGXhRxjjnOetJdYmiltRcQ8FMLwCpwenFL9JaSQhWhmB3fOFJDD0PIP6U6cZfKgrS0PjLLGhvXtJUjZPI+CS3+efSsrZ3N08zKWlIJJDBffp9a3SQsthEN6TiJtxaVWLDjhR7e2K91d9OniTxrCMXTR7TNA3h/Q49R70/s43b8iSnLwjOReIFyztJKeFB/hoB1vYJi8kiBS2QQcivZo9T0+8W0nSbIcBkYYIB6Zz60XEk13FPFcbUhBwWbqD7AVCWLg+rsX3ZX0Cm/uPE27lJ9S2RTf4d1HE8kM2AwG5OeDjtQM+jWcltvW7YS56sxTaB7Y5z9aFGk39mRLBNCd3Ct4mSR9xxW9pR2Gm11s6ELbS9VhjvSvhtHwWjPJ+vt9adLdQBkjiIRAAFFcs0jVH0a6KyzMFY/mRScf+CtVq8Lz20N9pkpeMAFo1yOfatDLwdSX9lXDl5G3xVocWsWSSof+Ii5Ur1I9KxSpCJYor4blQkELw2Pf0p5pHxFcxyGCccj+Y7SKR/FhS31MzRghZgG4Hc1TLxyVKPY+LHwl8h38LvH+MaKFioJAIHZf/VE/EM1u8okkC5VyqE9jS/Q/F03TWu7iMLNcLhFI5A/3pm9l42mQNIm6R8yYZeK8quOS2WdPo59r3wxfWcbXkZEtueSy8YpFHcug+VT7mupXtimqaZLarM0TAZwH4+4rnF7p0un3TQXQCsOh9a+h9Pnjljo83LjcWGwSO3hR53Ln5TyBVt1kXLjG0LwAP2onTLUf6hCSOEJLDp0B/uK+vI8XEjEcZrmm1aR0IPvIl0y1068tFdY7mPqZQ5zgZGQOO/HaqiXvJI5IWJkY425oa2l3aXNDcLvjaUMozja3fH170OuoC3uH8GNV3IVOD0qeRRlLRL3lDT7HNnrUtrJtdC2PKOSB9qewhtckjtjcMke0syxjAGOnB6/esW8sbkEygAD5Qv96b6Rra6bNuCGRXTZndgjJHNCHHlUgyzQ8Mti0GP8dMt9c7XgYhSijLe+SaVS3MFnd7CfEXO0GvtTuJ7+/mbfIu+QsoGfp0+1TksrqW23XEcaL0UIOc1RxVFYyZVKn4xTsyZckJg8j2z6Uhs7l7TWAsoCor7cHqD07U4BFnIodysi53K6ldp9DmlE8yQa1HdWwWYJIJNrdMiji8xZpfaNpHaSMVWW6a3ef5sKzDHUZxzUzaWdhJJDqgucKuYmThZQemCeQM+oPQ1lrvV7jULkvvdXOTtLYNPNJudQ8RCH37/JvdQ2ARznrx1rJRjujW35KbgOtykccJLJklcEHrkZHb7Ypq9pFdXYu4TukiJEqqpTIPTbnkY96Km0kW8v4q32yA4LKjFiD3OTnP0oWC6Xx2e3kKZjIcM2GcZ5AxUXJN6K1qmDT6bBPpcgvrgyTGV/w5TkBgMcE8kHjP0rJ3fw7rqQx3Emm3BR/lcAFTj0wa22mWL3OsK0cW+BAZgHPlz64+tbVIJpbaKBnEEUYCneDgHJP2rswRdNnNlaTpHEYDLEVyrwTQ/PldpFM0vrkxiFYkZenHU10D4g0uO8hxJtlC5+YDGPasiujQQNaSWssjMZCrKxBVSMnj2yO9DIklYYbITWcdt5InMlxt8SYkgKp9B64zSm7/EmeVGzuwM5OKdPqgeyktZIi0jpt3N3/wDVQtbJS7xXjoDhiH/iJA4znt0x965Yb+T7OhutIXQyTC0QeclF8xAPC+v7VZZ+NJcieRGIznHtWgu7KCM5tUIWYBAcYyGwDx6cZA96HuitvKkQCmR3CqnQenJ7c0raukjK62V2Vq1zdyXkqr4UbKrKw6Z4Bppr2no2lTPAQiY3BsbQWGNuBjnPTOe9HxvBp+neLIyTXGWVt3Kg59PYk/WsvqurzSExtM0xL4XP8XPpTrTVCP5did5Z7iCODlORkuCOOP7gU7sjKiALJyB2HJojTpYoPFtDlUZcsj+cqOpAA+Y59emaNglgisdkKLbofnkl+YH6n9qMlSpCRRXpWpBr7w2QmbPRf4vtQ2vSmDWvEtHCSGAbowGy5OQR6cAD61bBqGn2aTPa7XmIzJKBuYjPt+woDTdP1D4jnuNQQm0hVhHD4sbZfjIrRjx2xn3SBhdajukRpZWDgGRGbhgnI6+nOKMsjd6u+YITGkh6quAfU4HrV9zoeuQMou7MzREjMkLhh9+4rQQa3aaCiR3URtCFB3SRNj9QCKZy5aFa80R/0+y0e3jku4TdSddshwP9qVXfxAxu/wDgxFYoymMrE5O5Seck/wC1L/jT4ktr2a2/COLuBl3SeGcD2B/rWdSf8ZJiOPZ5SQXbAGPShxm+tIZcV2bBoILuMPf2yy22WUNgBuePKSDg96L0FbjTGa2RnlsypaKU9VX3rzRdFufwmLmUq6qGeJ1GBnpmr4rK8tmWe3uY0sgcSs7kbT3K9z9gai8bn8WO2lsW3iT3OoSyNOkzom1ePmXt96thmMlvsuE8SFfUdDSjU/xh1ISaaskzFtqRDLM4+vc1ZHLNcjLCWCYdVcEfrUMmOS3Yyl4DLhZY5o7oO8tnH/AOSn1rUwTtf/DkN3bneIB0HXA4xispaeNuKMsiqRyApKn705+Gr8WE7qkb+CWLOT8qk1yzT400/wChn+gfUlTwvx9oyRpgblPBJ70quoLbXdPSOa4VLhT5WIBx7U4+Mvhu+1OJbn4fdXRjue3DYOfaufyaXe2G5720uoWXqNjD+ors9PjUqnCSsjOeqaNiI7mG7upNV8QXIG3c4+bjGSfXp9aW3TBkJAySOO3Pv6Vu7GS1u7NRPFvxkZYeZT6E98elD3/wxZ3tvlC1u7Dqp4H17V0ya5XZNWc6u7oQajPGkRSJSB4Ttu6e/f60KyQSsXV3Rj24I/tWl1H4Nugw8PBJOBJny49TWafTNSgkIaynyPRDim72jjnCV2Xxwx7BlvOT/Lx+9FQ2007H8NAZNvfhsfb1qi20zVLgqEsZRjuwwP60fa6RdQsJbyKZNr42oM5HHOQf6cVLi7NDFKT2GWcq20ii4tzuPUuMfcseKNuNWtUdfzFwD5VYCQE/QDGPrVkEaXlk4tZpA0RO+OQEsBn5tvOfpSe605ZL1YvwuDIR4U0Z2xyZOBkHgHPGBiqKUnpnbxpA+qN4sBMYJVRgcYxSu00W91CbbbovTJYngVtbT4ZuoZDHeAM4xuiXzBR6FhxTNJrawXbFCGYfwoMKPbNUS4P5CpuS0Zyz+Drez2vdjx5wc4YAqPt/moPZS6YXNo5CMOVz0p9FfyuFkubcMp8xSJ+cemSAM/ShJb2KYspt5F48zFeF+p7UXOElVhUZR2Z9TeRyBoGyjZAAIGfVasgEVxKJom2SA5wTgZPWozG0/wCJuUuCnhsi+HncrAnnKnrQ+sxR2ccU0Afez/N1Rx29wfY1NxVUiik72aTS7xH1mHdILWHeOEJYL0BOfTIzT691NF1a4MMyNtbZtyGL4bOfQ8j9KxeiQW02nzG6uXjusYj2rkKff1H+1MNEhkRP+LUM4YjK9MdqpGbhGhJRUnY41fUZJVeeaHwYlQBio8px34+lYoaxarLmBxLHHJuG3oCRj9810KTw11C0jPhyIY3XYexx19j71ntV+Dra68eazQW8z8Ep8hOcgkdvqKCkprZq4sRTRRx3it/CcEc9QelHQoFEsjHGcMFPbHHXtwaGhguYYHgvI8SwEr4isHUj6j71Ga7xNiNSScMcqDg+1ckk7cToVdh13eSFFTK+JCoyyNkeoHHtirbSeNppHuQ5QW2Qg5DeYYDZ7ZwftSK8vJWvZZ5my8pJYkYBPriiY7sRujqV2keG6t1Knn+hqkU07j0I9qmG3V1DdzSmFzH/ADBu/wDtSK18RdaWVGVUibfux0xyKdz28MkZdGBdQTgg80jnjnhS85XKKOAwOM4/tTY/12BjBb+/gZY5CBC7EBxjzd+o/vT2z1O+gh8eO2aWFGAOW3KB0weOtItJRryweKfzRuu4nHK4OAR7g4NJbe+voHePxS0UecSE4x6iqKDktiN06OpHXNOntmkW2NvIATgpjnHqBzSSWa1v7eF53kW5RcCSM7VY9htzxUPg+7/FRSJcAtAw+VEDE+2T0o+/+G1vPxDW7ta712tG+Gj45B3A5B/WudVypsr4sJh1WS0HgI298Atv5I+vp9Kslv7S8sJIbtEXI8pCgjP0P9qyV1pesaXz4bmI/wAandnPv36UrfWVZTHOJc9Dxg5HtReOT3EEZLyT1b4dfTro3cSFtPlXcrLyI29CB0z2zVOjx+MkuwBiG6joBTnRNdC3EfhsT4fGO9Op7TT79w0MItLtj5pIQAH5/iXp9xTvI6qXYOCT0Q06WeHT3VeJpGGGJJ46UyW4eRWt5mUleq4ABI7gN7VVptuIoJRfuFNu3JQZ3jrnI619qEqwyGaeHwhcoqxIAHLIeh64HpRV9mddC3WobK2xHZ3FyYwgkgd143E5Ppj/AGoc6xeWjqZIy0WOQzbiv19qa6jNDAqC8QXEm0BgzhsDsKHhFrdTC40mFhKi5aGRtwwOo9xSZFztASpELb470lS0cm2F8YLJHj7ZFKZ/iWzvLeREtG3kHDqm0/XNGauvwzqWjtPDaww38fQxEKc+471l4lMkohQAIPQUmLDjmrt6+xJSaYbpuv6tpsubWZnT+STkVprP49v+lzY7vXa+f6GspdTJaRHw0UuONzc0AdVvADibbu67VAq0vRxzPlVf9f8AgnucdGy0e+Wx1BlMgeHcEl2ncEbsxPv0roVqVlTERGcfJng/SsfplppcNvJdR2xZZuJEkHMrHjAA69Kvi1u30t0ilkkaAjyySAAp6Bv806Soad+DVyIEUyRZ2ZwVY8g1GKJJyDOqluuMdPpQcOrrLKzIyNvTae+eKMskM5yvHccVz/51AP8AjsNWygZN2zzL0JFTkgV0CsmQeuR1qUjvEhCguVxkDoM19G7lSRgcZya7XS15OffYpvdEjystq3gOrbvL0Y+hrL/E9pqTRRpaxvHJJIvibOVIHft+nFb5hkAHGT6Vn/iKQRxJFEsjzu3CoeQB1J9BSSXlFISfTEcMV5aWgiu7h5DsIOwYB9j+g5+vWlxnWSRUuLlkUcEfhw2B/wBwYZp9bpbwTrFqN0ib1yQkgbscZx9jWau4yLnbEviLk/mINu4euK58nKKto6YJPokiSJcCOEF4t3zHIBHcjP7Gq9Y06SeNvwoZsKGJUfKP/BR9lGbZwySMoJ5U8Y/Wnt9+Fls49rASFejAHkHkkelSwtStpDT0c8g0G1ngLTCRJOo3HBPt705OjzyWgtpGI24ZfEQggdqYSQKl2JRKDGx5ypUHnkcdPtVWqtcTSZ0jbscfJPNhwT2JPGOw5roqctkGxXdaTqC4lh/C74ozzA5VpOe4J9+3pV2jC78dYZYJIEXzlpOOAM/2oa+tdf05FuLmEou7aWXa6k+gIJq+w1KW48U7S77NuF9PoPpQfOvkgp/QyN6HjeR5QrxtlWA+WorKbqNHku2mJGduSNo78dPalE9peFxIoVt6klBnOOx6dD/Y1VayGzVULjLAk46jmk4NKiraY+aFFiJjQAkdCM1m7vKwApGqsGIOV5Jz69aay37pEu3nd05pRqt0bfcAgO4b9rUIRp0hZPViO4vcBluEPfDKehpct74h8NVbI96lNcXOoSlY4QoPcCnmi6AABLdtGniDEZY4LHv9a7eMYrZHlJgtolzdRsGlkRQMkbutM4dKkW2E8bsuCMYPOa1H+kaagM1u3gwXC7oo8EkMpwynrj160QlrAtgEFyIywJ2lSenTn35/SsqA5MSWNn4OmBwFZhngjaUAIw2fTJx+lLr21itrBLlkVPH3orRk9Rg5Kng8k9PetNcRulrDDpru0zHLYGDt/wCo5xj296zWqaTqFrYvLNAjgDABfdjnkgf3oKcW6Rmn5C9BvfBtrVYA24n8zZ0Unkfr6091S+kZMvII0JG7wlzgVjtGZ41kleExoQJAVyQRwP3Iz6ZptBqFtch4vCY7SGLNld68g4PTAPf1FQ9r5Mrz0bnSr1bmyEN4r8KGjc8Er0DA/UYpD8U6DZ3tqLhlYMzHZOkfBPQBuM15pkgh062a3flcCWSY8AHghT6AkH9au1LUpI4GSO4iYkZcLkxgcYGT39aD+DtBXy0c91EyW0X4WeExzhh4TFeQPY9xVa3OoxS7jM7xjqgbqP3reSxwavpAFxDHMOiNyHhb1U/2PBrKajp3+mXEYvppGtXBxPBg5OOBg8Kw7gn6V0Q4zRGTcWe3OveHZGK1kki53c5yD+9LbfXmigK5YnOQwOOfWlsl0pOJcEkHkcmqrme3NkFto2RyfMT0P0p44ElQHlGVxrjtH8xcn+Y4q7Sr+Xwp5EuUiZV6luTnjCjuay2xmPJoy1QhgAaosMUhHlkx7CURCNgLE9auhJScfymhgCFHrRMPI2tzSNBR9qhJYBflPNLvDJPNNpo9yLx0pfKWZxDAuXY44qsHonI1L6vaSvFGkgaK3dg4wMkEcHPpST4l11rpVt0wsKDygDr9fWuj6noGlMgnuNGjhJ+WSMGM/wBMf1rFax8L2R3y2txLuxwk3+QKhHDUrLPMmhJ8NfEMtrcR20sjKjHEbdQvoCPT9q6hp/xP4RSO4PgzY4yfK49jXFIyNPuPzAGkjfDKOf61o9G1m1CrZ3UhntTyC3zRn1Ge3tTZMbT5REjNPTO52OpW13a+G8yq3UMRnPHTNFqUSJtzhwuOh71ypIrmzRJLK43QuPKc8GtDba5eIkcMxVyDwVPzfXPauZ+oivzVMr7Lf4vRqJ7tYRlmAJ6VjviB79rhry3R2gYbCE+YcdeKf6fZS3pEtwx3+3QDPGKcfh2jRF+VfQDmpRU5/J6QzcYa8nKoL8SXWJHVWJ6MB5f15/Wmb/kQC8kcNAvmbGEyAefr9q2GpfDtpeIS8CCQ9WCc1hNe+FZrINJBKAo5wX4/Q1Z4b2wLN4QbFq/i38ckezwBJu2OckL2yR39qvM0l08k8rb5HYnNJbSVYbUrNGRMyhssvPp37VOO8dgUDYHoOM1NUviijt7HAlUrskIHsOTXwcJhI41ZmyD4hIA7A7u1AQ79m9clBkthen3717JcjJI+U9zVlHRNvZZP+GdcGYNIMh1U8qR3z6Ur8MW6vM7TxhkdoRHj8zBCnPcc9TVEO2zd9h8QsSWb1Hah5dSmibyQAAqyq+wEcsCc8fQc0U7TsyVPQRLJLBOvhmKRwAr5fB9zn+lDalH+EuFDxSQ7W2BZJN5AwD1985+9BX4mlx4xBY5UNjAGPT05zX2qSGKztXGNo5Yg55IH+KFWM2NoZQUHfHSlesxC4Yb85B4wea8tLk5CuGG4ZBZcZ+lWX0qlUzwTwMD0puPlE78Mps4Y/FjErCGMtjdjpWvGh6ffqiyyouwKF8TICgd8DjJx1rCtDJdXKIMv5sIpyMnPHHrT+O21PSSp1JJYYiOqPncBzzj0qMo2+yseuhzqVlLaQPAtzCUD+JA6t8rdwf8AuHGfUCgbCa71PUV2N4ZfKgyAsqYHIHvgUw0mbT5IUeUm6kkG4tL5wuScAA/TqeaOE0H+opdM+1VjkRevlJRsE/XFNx0I5b6CdNaJNMaeQhp2Jy2Dgc8Yx7VC605NVjYrfxwkDDAoW2nHQ45pHbasblIIs7Y44UQ4xzgdaMv7to7eMYaQtJ0Tqxweaja5Ulobi+xKNKvLGYQSsG3y7Y2jl8pY/wBf/VW6g1qjxWttK/iRxrGqY8qkkls+mT0+9E7rqK4W8coVQMVj3htrEYB6deapXSxJfC4WRmibzNkcg45z9adTTdh46DbSyuZrM2yRRpHI+TI0gzgHgbc5457UWzxNprNIgJYbeecV9AsU5lvmjPgwArwuc0PIsc9vK43Rhicbcjbx1wfeknJTqhopxA3ONLnlgOHQbkYdyByMe4zVVhrOkakotLwKpmUb7eTKrKDyMH+o5+lC6fqAltwrKw25GeysTzn1rFajL4t2UOPyS0YxzwCcVbDjt78E8sqQ+1z4WntcG0kaaA5YRPnen36N9RzWUaAq5U/pT/Tdfv7JUj3GeFTwshyR9D1FMLzW9J1El720ZJW5Lnrn6iulTlF1LZHhGS0ZER44xRFsuJR9actHo0u428N2xJ8oEgA+5IP7UKLMqykYOfSq8rQnGmENktmrosg5FRK4IHtUncRR5PfpSVYbPZ7jYuF5J4AonTbERo00/H87f2qGnWbSP40vBxnJHyj1+tC63qHin8HbcRJw2D1Pp/mrwjxVslKVujd2HxtcQ22y+jNyoXyypjd9x0P1rCfE+speapNNa+LbowAKKxXJ7nAOBVV/M8a5gfAbk7aQSli5LEkk85pa2Eqxu6n9a9ChWBVuQcipFeBmolSKcBqPhj4nl0+b8NfOZLRz1x/yz/iun289o6rJ+W6Mudy+lcJXOQMZzxiuhz/EdnCLFrFMFYwJIj5SuBj/AM9a4vU4OStdl8WSnTOn/iJ3thFYy7FBwSM4+n+9Exf6gIhmQMx7n/1SPQNVhvbNGilySMjsQfQ1o7bUNwIdFDKOQBwD6frXPCDf5SaKSlXSFOrXWsWNoZgr3CdAIhzz9Oayeqvq9tD+KcIodSWgA3GP3PvXR2nVk85OSMnAz9awfxHeoZ2jtjuLcEDoKacVBXys0Jt+DFXGp3E8m+4dck8Ecn6ZoqKYYDKSx70FqdiSu9OCT6cZqrTZgSIHOCvfvSuOrRTleh/+LmEKosnhxg5AycAnvVKnxTluTn1zU9sYHmbeCOoGaut0CYZY/uea6Y7jsk+yprZ2BCKeetLJ4WW5EZBxJ5XKnt7/AHrQszyj1zwAKWX8TxuyONjKcEHgg+9aUaWgJ7Ev4hmeOK5BDLuXeOpJOenqK0txpAhS1nldZI/BVyQuQp9/foce/tSVFNxf+IjOsU4KSPHg+5BHpkA08h121k04i6RpXUGMIGwNpXHIqGRtJUWirYwvUsjpTPeSJvC5VNvz54wPQ85BHpzWfsNMN4wR0EQ2nzpFkZ7Z+tNdDtoILQXmpSNe20TBra2Y53nocjr0A6ccUg1m7uGuzEjFUQAY+UDPJGPqaH4x0H8nsZ6ZZtpGqQXtwmFiJYDjLjBHFM9R1WPVlmGmSuskSm4RSvGV/hx059PWszFqq2kSx3W24hHVHJz9iOlNItfhTRWWGOO3twWdgCBk9sgd+1Tt6kGvBmtI1MXeqbJroxBwzB3yd7dh7f7Yp3qZuFYLbyJIu7MbdWwO+fekul/Cd5qtxBIq7LaYlvF68dyB1rrelaBZ6dZJEGaXA+dxyf8AH0qmaUU9CRX2c8stPvJXMgjRI1HJYkAEj+1OYUjtVgZ8XCspIK8YI7HPvmn+r2qSEQ2+5BIekYwW9eaUXlrBarHCgUy7gTnnH3+tSXKQ9pFkUkEnkCIGYZZQck1YdClnUymaOEEgNGzYJH/qgry5stNlg3RNNIGIdUxtH9/rQJ+JDNeOzoIV28ehx6imlCtMCd7Q2vbyA20dhbMTGh8zDAGcdPel15eCGI26PiJjlh1rODUDkvyvYc0M+oKkLSMcnPlU9zRjjZnJI81WWS1uzEoQRSHxQzLkk5PQ/WlFpb75mLEkZPJ717LJLPKZJmJySQCc49qNtl2J9a7oqkcjdssS1QDkVF7ZWA2rj3q/cCMUZCIzZyeIPOcbOP1+lGgWymG1WHyqcj19aJ8LaM9zVKZ4q4k7cE9KYAOyquXY4Ar6ztnurgSFMj+BT+59q9ghe/uAiLmMHH/caM1S9XTLUwQYaZ+Ccdcdf/qP69KpCHliSl4QNrN+kCfg7NjuPLOP3/xQGk6c9zMuFOM8k9Kos7SW6m58zOcsx610DR9MFtaqBgkDJPUj60/5MTowe5WUo44P60LPZDO6Ntw/qKISZJV/M8x/nHzD6+tSwyjcpDJ6j/zikcR0xabViKj+FcdKbDY/DcH1FfFCvOMj1FI20MKFgZJFbb0OcVrvhnT7C7snvr23W5uFl2iJmIVQMc475pUsasucV8sKhQYy8cg7qcVOT5KroaOnZv2ihtbGK/BEEbMyKsTdQCO2Ohqdl8UQhik0gyo+duAwrBx6rqtvGiC43LG+9BIgJB479ewoa+1q6mQi4jQlskkDqc55qfstdFOa8m/1P4t8QmGxcO7ABir9BUPBtbPTxd31wVl25MUnUknjbjnp64rl0FxHHIZHD7ucbeMHHB/2pjFqa3BV724eUgKF8RuE9sdwPWgsFbeze4ukN9Subu/lb8HbsqeuKXQ6ZeQzib+MMCd3p3GKZi7V23QkDP8AGhxmrkuHc4Zx/wBxXOfbiuKWaadIzsLgBkh3KDgepxii42RF/NkUfQ0qaQhu3I7UDcOJm2uxIH8G7Ab61fHlVIeuSHt5c/hFjdlaMOhdGdcBhyOPXvVccsV9p0ktyxiYvtUjqePTp/uaSxaS80qhA23dw7EkDPWitWuFxHbQECO3Ax7nv9eaaUk5WhkmlTC/9IZ7t4rewmNt4WAXlUkSYBJ3DHH26UdBpEcMfhXKWaPGdrupDN1z1Gc9Oo+lLotXUxE3ULiTrmMAgj70PN8QRHCRQSNj+chf2pXOfXE3FfY6muodPVnswwuefzkOCoIIO0Dpn1rJXV40kx8IF5GPUc8/3oqW5utRdhGjuqjcyQoSFHqcU9+DfhyLU51uL7xFjfPh7G2kj606jyrkLy4mSi09rqJmV2Mu0t4ZHz89j06VXpdiqa1BBfwuYmkw6NwcdwAe9dT174TlswZLJVltyoAxGNyEep9/UVgS1xN8U2NvOkizyXIB3jnrkk1X9Im3as3dk+jRwJFAhiWMbUB4IH1FN4LuYxgW9yGUDAVyDxWHKQS3zQtKUTPlmCnC/XFeT2mpWDgrMWXsQQQfvUaTXVnApzTtM3Uk8oIeWE5xwy9KzWqG4WU3KWkjlOU2AMCe2cc0vg+Iru2JjuQ6jv8A+qYp8Q21zEY1CmR8ANnGK3GMVaKr1ORd7Mrf3zIpMz/8RIcsT1HrmkUt2Z5xtOewABJOenFav4ptVuNIuJXWIzQLvSRDnjuM9+K59DcXEUoeKZ43AIBjbaRng8im9NWSNnR73JDhopvw3iXEsMCfMoklG9uccIMn+lAyzpJsCRnIzl2bJPPHHbjtzQqp1yevWr409K7FFLoRybLgRsz370ZbFzEN3TsaoQgQOpXJJGD6UxQRjTomDefcdy+npQaCWNF4YVtwJPUeh9KtBzyBVAJwM8ir4PMcUgSyJS1RfdcSiCPJAOGI7+1W3BZMW8X/ADm+Yj+Een1ospHpNozyMBJjO7Gdo/yewqsI3sSUq0eXF1HpFmVUgzEYO3t/0j+5rL7pLy6MkhyzenT6D2ry6uXvbnceF6KvXaP8+prQaBp+WVmKouc7mqjd6QnWw/QLARbWkRm+laeFlhbw0ULnu3fNRjEUKYDS7m+U54pppNhE7G5nViic4PeqJUTbs4rLbSRvvRiD6969iuvDceJ5H/mA4P1Fam+0tnm/KAdz1YHgU3k+DNPaBS0LO2OSXbk1CUuG2VWzFAxyAchG7H+E/wCKmDJCcMKeXHwzDag+DGyr6bif3pTLazW/AHiRj+A9qSOWE9DU0fW0sQnV2XKg+ZRxkUbaxQyxy4bbLkbFPQjvz+lLMK5HhE7v5G6/714rspwc5H9KLgFSGyW6y7YQyq0j7WZjgAe9LtT09AqNGcoy5GanHdFOHG5fUVe0iSplW4pOjGc/DHJGKoePGRjBprcDbISKHYo8gDcZOM+nvTJmaFu10PkdlPscVdFe30XyTsR6NzRF6lvHdPHbyeLGpwH243e+KowtBxT7QLC4tcuQPzkViOmB1qD6oHbOxkb1xmhmTjNVFMmkWGH0OpyQ7b4juXs0tkmSNF7hME0OssyuMugYgHJHPPelXhj618Iz6Yo+zFdB9yQ4nnnky0lySe/vQSspkzJIxX96HHiDgPx6GrEkbeMgZ9qHttGUzofwVqDadal5IHC3Dr4Rj6cZHmPatRpmoKuoeFcYjMjlo3ByDk/0rn2h6mkIzcuuWBXBPQfT1pjqNxBcw+JBcshVDt2NgZ7ZqFyUq8FOFxs7ZDKpTAIrK/G1pFHbLqcVjE91bghZgozGCMFvf+1c70749vNMD2t7fmcIBsJj3ke2ev61rLX/AOQtFvbIpeSSIxG1t0DFG96vK2qOdoX6QLGe22yttcDGeoH96Jnh/wBOtpLlJoymw4ycg54x6GsLc63a22rvLptu6WhPRu3PYdcV7quurcWXiRBQq8n1z71BxkiHB2N9PvUuR+HuIdxLkL3+1GS6NbPJjYY3/asbo3xKtjJmSM8jGRzitZZ/FdjOhxIgkPXfwcUzTUfkhXFp6PNXxHo15CSCFhKkk4xxXOkTIGBWp+K76Odo7WzLSRv+bNLggMx6Lj0FZ1YjnAqmGHCP8l4qkfJH6ijrK0a4lKKVDbSw3HGcDNStgI4nQoHMi7cntyOR+lX2x2zBu4qw5DwU/CnPDZyp9aky7YlBBBxzmromUFlZMhlIGDgg9qrO6RQnU54oGPIWJ8vWnMYSwtlcENeS/wDKTr4Y/nb+w+9DQRR2UYnlAdz8iH+I/wCKNto3Gb68JlnmbKg9WP8AitGHJhcuKLLSOLT7U3MzAzNkgOeg/mNZfVNQfULg+Y+GDlQepP8AMff9hVmu6kJpDHHJvGcsw6Ofb/pHb160LptpJPKhOcMeuKu34RFLyw/RtMa4lBVc45IzW5sY9lmVjJjPQ4xVOlWcdrGjRqAcckHp9adw2TTTgR7VY9VAwM+3vTRVCydk9HtZLiddz+RByXXgZ+lOpZCgES4CDg7ahEi6damNXxNIeSD0+1CSSESgr1zk9uaboXsw/wCIJ8vG3vxWh0TV9lv4Vym6MDr6DtSm2tk8U/NMMnoOPtTe0tpDGwjg2eoNSlBSVMonQ0ljtbyEtE4J9O9Z2/0tWJKgZo02M8WZknWMA8rjivHuQuEucKx79v1riyYGtlYzMjfaTkklcN/MKWzLJF5bqPevaQdR9/8ANbyeJGXgAg0suLNCDwCO4NaGWUdPaC0mZDw/LujO9R1I7fUVDGDlTim91pux/EtWMbemaXtgSbbhCjfzKOD9q6U1NaE2uwCfxOuMig3B3cinMse3pyh6HtVDQxt1FaqDYqMbBQ2OGOBVscBbk9KNSyI86c7eeO1WNGVPnHmPNYxXJYv+EjlVTtbvVUenSPE8x4jXue/tWjGou2lx2CqiwqFB2qAWIOck/eqLyEJbxEnbEVOxM5JPr/56UaBZnBA+Rhc59KnJAUyrDzDqPSn0AS2UT+IglQFox15HT/z2pW6tI7E8knk+tZ6CKmU17Ep8Rc9M0xNsNpPpVPhBTmlsNBTRQvheGPUc81C4juRG4jLefIby5zVMLGOXd9qeWtxF4Qz8x7UtB5MRWekSSSBnU4B5LU1ay2r0AAq6W+VAfCBb9qXT3Es2dzHB7URQG9OJCsZzjqRQDxMSc55pt4KtliRn0qQVdjKAvmGMkciihWxRHAXIAXn96MhsJDzszUwnhSZZc/Q1f+LwAPD/AK0ewFW1o3we1e52tXrz+KcFQDUHzgUvkKYRA4EgJ9c0SmNxb9qXISDRkTnoO9EcLQjOfvV9uixqbiYcdFHcmqrdAFLyHCjrRkFu9wzTShhHGpbpwq1krA3R5EGeT8VcLuXOAv7AUFrWqO5eIHBxsbZ0A/kH9z9q91TUPBYxQ5R16f8A+Y/zSNE8Rsc+wqvSpCdu2VRwvPOOP9q3/wAP6ckNsBKG3nsV60p0TTQJVZwVPGDjOTWwiV7O2w3mAOdpzgZpooWTL0SOMrwuFXzEZOD960Oj2vhwieUEgDy54pTpNusysZYgVbBGehPYj2p1e3H4eIkdFwABxnsfuKoIU3r+KTI2QR981G3hMibWHAGQcdPpVscCzqZAclvX9qA1adLK0eRG7bdvvStjI//Z";
const IMG_CHICKEN_MANCHURIAN = "data:image/jpeg;base64,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";
const IMG_CHICKEN_CHOW_MEIN = "data:image/jpeg;base64,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";

const SEED_MENU = [
  { id: "m1", name: "Chicken Chow Mein", price: 1150, em: "🍜", img: IMG_CHICKEN_CHOW_MEIN, cat: "Chinese", desc: "Wok-tossed noodles with chicken, cabbage & spring onion", badge: "Popular", available: true, branches: BOTH },
  { id: "m2", name: "Chicken Manchurian with Rice", price: 1090, em: "🍲", img: IMG_CHICKEN_MANCHURIAN, cat: "Chinese", desc: "Chicken in tangy Manchurian sauce with egg fried rice", badge: "Popular", available: true, branches: BOTH },
  { id: "m3", name: "Beef Chilli with Rice", price: 1250, em: "🍚", img: IMG_BEEF_CHILLI_RICE, cat: "Chinese", desc: "Sliced beef tossed with chilli & spring onion, steamed rice", badge: "Spicy", available: true, branches: BOTH },
  { id: "m4", name: "Chicken Momos", price: 850, em: "🥟", img: IMG_CHICKEN_MOMOS, cat: "Chinese", desc: "10 pcs steamed dumplings with house chilli oil", badge: "Popular", available: true, branches: BOTH },
  { id: "m5", name: "Hunza Special Platter", price: 1950, em: "🍱", img: IMG_HUNZA_PLATTER, cat: "Deals", desc: "Momos, chow mein, fried rice & chicken chilli — serves 2", badge: "Popular", available: true, branches: BOTH },
  { id: "m6", name: "Beef Qeema Paratha", price: 690, em: "🫓", img: IMG_BEEF_QEEMA_PARATHA, cat: "Fast Food", desc: "Crispy paratha stuffed with spiced beef mince, raita", badge: "", available: true, branches: BOTH },
  { id: "m7", name: "Zinger Burger", price: 690, em: "🍔", cat: "Fast Food", desc: "Crispy zinger fillet, lettuce & mayo", badge: "", available: true, branches: BOTH },
  { id: "m8", name: "Loaded Fries", price: 540, em: "🍟", cat: "Fast Food", desc: "Fries loaded with cheese & sauces", badge: "", available: true, branches: BOTH },
  { id: "m9", name: "Chicken Wings", price: 760, em: "🍗", cat: "Fast Food", desc: "6 pcs hot & saucy wings", badge: "Spicy", available: true, branches: ["g91"] },
  { id: "m10", name: "Beef Pizza", price: 1290, em: "🍕", cat: "Fast Food", desc: "Loaded beef & cheese, medium", badge: "", available: true, branches: ["i8"] },
  { id: "m11", name: "Chili Garlic Rice", price: 760, em: "🍚", cat: "Chinese", desc: "Fragrant rice with chilli & garlic", badge: "", available: true, branches: BOTH },
  { id: "m12", name: "Pepsi", price: 180, em: "🥤", cat: "Drinks", desc: "Chilled 345ml can", badge: "", available: true, branches: BOTH },
];

const etaMins = (o) => {
  const left = READY_I - STAGES.indexOf(o.status);
  const units = o.items.reduce((a, b) => a + b.qty, 0);
  const base = o.type === "delivery" ? 14 : 4;
  return Math.max(2, base + left * 3 + Math.ceil(units * 0.8));
};
/* Builds the next free id from the list itself (e.g. "u14"), so a new record can
   never collide with an existing one — a duplicate id would make React confuse
   two rows and could edit or delete the wrong person. */
/* Some embedded browsers/webviews don't expose a global confirm(); calling it
   bare would throw and silently cancel the action. This wrapper degrades safely. */
const askConfirm = (msg) => {
  try { return typeof window !== "undefined" && typeof window.confirm === "function" ? window.confirm(msg) : true; }
  catch (e) { return true; }
};
const nextId = (list, prefix) => {
  const max = list.reduce((m, x) => {
    const n = parseInt(String(x.id || "").replace(/\D/g, ""), 10);
    return Number.isFinite(n) && n > m ? n : m;
  }, 0);
  return prefix + (max + 1);
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
  const rref = useRef(1);
  const [online, setOnline] = useState(!FIREBASE_READY); // "synced" once first Firestore read lands

  useEffect(() => { const t = setInterval(() => setTick((x) => x + 1), 1000); return () => clearInterval(t); }, []);

  /* ================================================================
     CROSS-DEVICE SYNC (Firebase Firestore)
     Without this, every phone/browser has its own private copy of
     orders/staff/menu/etc. — a waiter's order would never show up on
     the admin's phone.

     Orders live in their OWN Firestore document each (collection
     "orders", doc id = order id) — NOT one big array in one document.
     That matters: if two devices both add an order at nearly the same
     moment and they shared a single "list" document, the second
     device's write would silently overwrite the first device's order
     (last write wins on the whole array) — which is exactly why an
     order could vanish before admin ever saw it. With one document per
     order, two devices writing two different orders can never collide.

     Order numbers (#105 etc.) come from an atomic counter document
     (hunza/counters) updated inside a Firestore transaction, so two
     devices can never be handed the same number even if they place an
     order in the same second.

     Staff/menu/inventory/purchases/requests/branchOpen change far less
     often and are small, so they stay as one shared document (hunza/meta).

     If src/firebase.js still has placeholder keys (FIREBASE_READY is
     false), this whole block quietly does nothing and the app behaves
     exactly like before — local-only demo data.                    */
  const remoteMetaRef = useRef(null);

  // Seed Firestore once (first device ever to connect) so every later
  // device — instead of generating its own random demo history — reads
  // the same shared starting data.
  useEffect(() => {
    if (!FIREBASE_READY) return;
    (async () => {
      try {
        const ordersCol = collection(db, "orders");
        const existing = await getDocs(ordersCol);
        if (existing.empty) {
          const all = [...HISTORY, ...seed];
          for (let i = 0; i < all.length; i += 400) {           // Firestore batch limit is 500 writes
            const batch = writeBatch(db);
            all.slice(i, i + 400).forEach((o) => batch.set(doc(db, "orders", o.id), sanitize(o)));
            await batch.commit();
          }
          await setDoc(doc(db, "hunza", "counters"), { orderSeq: QC }, { merge: true });
        }
        const mRef = doc(db, "hunza", "meta");
        const mSnap = await getDoc(mRef);
        if (!mSnap.exists()) await setDoc(mRef, { users: SEED_USERS, menu: SEED_MENU, inventory: SEED_INVENTORY, purchases: SEED_PURCHASES, requests: SEED_REQUESTS, branchOpen: { g91: true, i8: true } });
      } catch (e) { console.error("Firestore seed failed", e); }
    })();
  }, []);

  // Listen for changes made on OTHER devices and apply them here.
  useEffect(() => {
    if (!FIREBASE_READY) return;
    const unsubOrders = onSnapshot(collection(db, "orders"), (snap) => {
      setOrders(snap.docs.map((d) => d.data()));
      setOnline(true);
    }, (e) => { console.error("Firestore orders listen failed", e); });
    const unsubNotifs = onSnapshot(query(collection(db, "notifs"), orderBy("time", "desc"), limit(60)), (snap) => {
      setNotifs(snap.docs.map((d) => d.data()));
    }, (e) => { console.error("Firestore notifs listen failed", e); });
    const unsubMeta = onSnapshot(doc(db, "hunza", "meta"), (snap) => {
      if (!snap.exists()) return;
      const d = snap.data();
      if (JSON.stringify(d) !== JSON.stringify(remoteMetaRef.current)) {
        remoteMetaRef.current = d;
        if (d.users) setUsers(d.users);
        if (d.menu) setMenu(d.menu);
        if (d.inventory) setInventory(d.inventory);
        if (d.purchases) setPurchases(d.purchases);
        if (d.requests) setRequests(d.requests);
        if (d.branchOpen) setBranchOpen(d.branchOpen);
      }
      setOnline(true);
    }, (e) => { console.error("Firestore meta listen failed", e); });
    return () => { unsubOrders(); unsubNotifs(); unsubMeta(); };
  }, []);

  // Push meta changes (staff/menu/inventory/purchases/requests/branchOpen) up
  // to Firestore. Orders are NOT pushed here — each order mutator (addOrder,
  // markReady, cancel…) writes straight to that order's own document instead.
  useEffect(() => {
    if (!FIREBASE_READY) return;
    const current = { users, menu, inventory, purchases, requests, branchOpen };
    const json = JSON.stringify(current);
    if (json === JSON.stringify(remoteMetaRef.current)) return;
    remoteMetaRef.current = current;
    setDoc(doc(db, "hunza", "meta"), sanitize(current)).catch((e) => console.error("Firestore meta write failed", e));
  }, [users, menu, inventory, purchases, requests, branchOpen]);

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
      if (isStaffPath || p.get("staff") === "1" || window.location.hash.toLowerCase() === "#staff") { setPage("staff"); return; }
      // A hard refresh remounts the whole app, resetting `page` back to
      // "home" — if this browser has an order still in progress, jump
      // straight into the order flow so it can resume tracking it (the
      // actual resume-to-Track happens inside OrderFlow once orders sync).
      if (hasActiveMyOrder()) setPage("order");
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

  const updateOrderDoc = (id, patch) => { if (FIREBASE_READY) updateDoc(doc(db, "orders", id), sanitize(patch)).catch((e) => console.error("Firestore order update failed", e)); };

  const setStatus = (id, dir) => {
    const o = orders.find((x) => x.id === id); if (!o) return;
    const ni = Math.min(STAGES.length - 1, Math.max(0, STAGES.indexOf(o.status) + dir));
    const ns = STAGES[ni];
    if (ns !== o.status) { flash(id); if (ns === "ready") toast(`#${o.q} ready · ${o.waiter}`, STAGE.ready.color); }
    if (FIREBASE_READY) updateOrderDoc(id, { status: ns });
    else setOrders((prev) => prev.map((x) => x.id === id ? { ...x, status: ns } : x));
  };
  const markServed = (id) => {
    flash(id);
    if (FIREBASE_READY) updateOrderDoc(id, { status: "completed" });
    else setOrders((prev) => prev.map((o) => o.id === id ? { ...o, status: "completed" } : o));
  };
  const markPreparing = (id) => {
    const o = orders.find((x) => x.id === id); if (!o || o.status !== "new") return;
    flash(id);
    if (FIREBASE_READY) updateOrderDoc(id, { status: "preparing" });
    else setOrders((prev) => prev.map((x) => x.id === id && x.status === "new" ? { ...x, status: "preparing" } : x));
  };

  /* Notifications are addressed to a target: one or more roles, optionally a
     specific person's name and branch. NotifBell filters on these fields.
     These now sync via Firestore too — otherwise a notification pushed by
     the admin's device (e.g. "order ready") would only ever appear in the
     admin's own browser and never reach the waiter's phone. Each notif is
     its own document for the same reason orders are: two devices pushing
     notifs seconds apart must never overwrite one another. */
  const pushNotif = (target, msg, color) => {
    const id = Math.random().toString(36).slice(2);
    const n = { id, ...target, msg, color, time: now() };
    if (FIREBASE_READY) setDoc(doc(db, "notifs", id), sanitize(n)).catch((e) => console.error("Firestore notif write failed", e));
    else setNotifs((p) => [n, ...p].slice(0, 60));
    toast(msg, color);
  };
  /* Marking an order ready notifies whoever must act next:
     the assigned rider for deliveries, otherwise the assigned waiter. */
  const markReady = (id) => {
    const o = orders.find((x) => x.id === id); if (!o) return;
    flash(id);
    if (FIREBASE_READY) updateOrderDoc(id, { status: "ready" });
    else setOrders((prev) => prev.map((x) => x.id === id ? { ...x, status: "ready" } : x));
    if (o.status === "ready" || o.status === "completed") return;
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
    const patch = { deliveryStage: stage, status: stage === "delivered" ? "completed" : o.status, custMsg: `Rider ${o.waiter} ${STEP_MSG[stage]}.` };
    flash(id);
    if (FIREBASE_READY) updateOrderDoc(id, patch);
    else setOrders((prev) => prev.map((x) => x.id === id ? { ...x, ...patch } : x));
    toast(`🔔 Customer #${o.q}: Rider ${STEP_MSG[stage]}.`, "#5A9CFF");
    if (stage === "delivered") pushNotif({ roles: ["manager", "admin"], branch: o.branch }, `🔔 Order #${o.q} delivered by ${o.waiter} (${branchName(o.branch)})`, "#29D3A6");
  };
  const cancel = (id) => {
    if (FIREBASE_READY) deleteDoc(doc(db, "orders", id)).catch((e) => console.error("Firestore order delete failed", e));
    else setOrders((prev) => prev.filter((o) => o.id !== id));
  };
  const togglePriority = (id) => {
    const o = orders.find((x) => x.id === id); if (!o) return;
    if (FIREBASE_READY) updateOrderDoc(id, { priority: !o.priority });
    else setOrders((prev) => prev.map((x) => x.id === id ? { ...x, priority: !x.priority } : x));
  };
  const setPaid = (id) => {
    if (FIREBASE_READY) updateOrderDoc(id, { payment: "paid" });
    else setOrders((prev) => prev.map((o) => o.id === id ? { ...o, payment: "paid" } : o));
  };
  /* Used when a claimed online payment turns out NOT to have arrived — sends
     the order back to "unpaid" so cash can be collected instead. */
  const setUnpaid = (id) => {
    if (FIREBASE_READY) updateOrderDoc(id, { payment: "unpaid" });
    else setOrders((prev) => prev.map((o) => o.id === id ? { ...o, payment: "unpaid" } : o));
  };

  /* Creates an order and routes it automatically:
     delivery → the branch's least-busy rider; everything else → its least-busy
     waiter. Orders start at "new" and wait for the counter to print them.
     Returns a Promise<order> — the order number comes from an atomic Firestore
     counter (when online) so two devices can never be handed the same #. */
  const addOrder = async (partial) => {
    let waiter = partial.waiter;
    if (partial.type === "delivery") waiter = lightestRider(partial.branch);
    else if (partial.source === "qr" || partial.source === "online" || partial.source === "car") waiter = lightestWaiter(partial.branch);

    let q;
    if (FIREBASE_READY) {
      try {
        q = await runTransaction(db, async (tx) => {
          const counterRef = doc(db, "hunza", "counters");
          const snap = await tx.get(counterRef);
          const next = (snap.exists() ? (snap.data().orderSeq || 0) : qref.current) + 1;
          tx.set(counterRef, { orderSeq: next }, { merge: true });
          return next;
        });
      } catch (e) { console.error("Order counter transaction failed, falling back to local count", e); q = ++qref.current; }
    } else {
      q = ++qref.current;
    }

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
    if (FIREBASE_READY) {
      try { await setDoc(doc(db, "orders", o.id), sanitize(o)); }
      catch (e) { console.error("Firestore order write failed", e); setOrders((prev) => [...prev, o]); /* still show it locally even if the write failed */ }
    } else {
      setOrders((prev) => [...prev, o]);
    }
    flash(o.id);
    const where = branchName(partial.branch);
    if (partial.type === "delivery") toast(`Delivery #${q} → ${where} · Rider ${waiter}`, "#9B8CFF");
    else if (partial.source === "online") toast(`Online #${q} → ${where} · ${waiter}`, "#29D3A6");
    else if (partial.source === "car") toast(`Curbside #${q} → ${where} · ${waiter}`, "#29D3A6");
    else if (partial.source === "qr") toast(`#${q} → ${waiter} (${where}, lightest load)`, "#29D3A6");
    else toast(`Order #${q} → ${where} · print at counter`, "#FF6B2C");
    return o;
  };

  const addUser = (u) => {
    setUsers((p) => [...p, { id: nextId(p, "u"), active: true, salary: u.salary || 0, advances: [], joined: now(), payments: [], ...u }]);
    toast(`User created · ${u.name}`, ROLE_META[u.role].color);
  };
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
    return [...p, { id: branch + "-x" + now() + Math.random().toString(36).slice(2, 6), branch, name: name.trim(), unit: unit || "units", stock: qty, low: low || Math.max(1, Math.round(qty * 0.4)) }];
  });
  // Adds stock AND records what was paid, so the dashboard can show cost.
  const buyStock = (branch, name, unit, qty, cost, by) => {
    restock(branch, name, unit, qty);
    setPurchases((p) => [{ id: "pu" + now() + Math.random().toString(36).slice(2, 6), branch, item: name.trim(), unit: unit || "units", qty, cost: cost || 0, by: by || "Staff", date: now() }, ...p]);
    toast(`Stock in: +${qty} ${unit || "units"} ${name.trim()}${cost ? " · " + rs(cost) : ""} (${branchName(branch)})`, "#29D3A6");
  };
  const addRequest = (req) => { const id = "r" + (++rref.current); setRequests((p) => [{ id, status: "pending", createdAt: now(), ...req }, ...p]); toast(`Stock request → admin: ${req.qty} ${req.unit} ${req.item}`, "#FFB22C"); };
  const fulfillRequest = (id) => { const r = requests.find((x) => x.id === id); if (!r || r.status !== "pending") return; restock(r.branch, r.item, r.unit, r.qty); setRequests((p) => p.map((x) => x.id === id ? { ...x, status: "fulfilled" } : x)); toast(`Restocked: +${r.qty} ${r.unit} ${r.item} (${branchName(r.branch)})`, "#29D3A6"); };
  const rejectRequest = (id) => setRequests((p) => p.map((x) => x.id === id ? { ...x, status: "rejected" } : x));

  const addMenuItem = (item) => {
    setMenu((p) => [...p, { id: nextId(p, "m"), available: true, em: "🍽️", badge: "", desc: "", branches: ["g91", "i8"], ...item }]);
    toast(`Menu item added · ${item.name}`, "#FF6B2C");
  };
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
    setStatus, markServed, markPreparing, markReady, riderStep, notifs, cancel, togglePriority, setPaid, setUnpaid, addOrder, addUser, toggleUser, deleteUser,
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
          <div className="hz-logo"><HunzaLogo size={30} compact /></div>
          <div><div className="hz-bn">De-Hunza <span>Sizzle</span></div><div className="hz-bs">{rm.sub}</div></div>
        </div>
        <div className="hz-ident"><span className="hz-ident-ic"><rm.icon size={14} /></span>{rm.label}</div>
        <div className="hz-bar-r">
          {FIREBASE_READY && <span className={"hz-synctag" + (online ? " on" : "")} title={online ? "Synced live with all devices" : "Connecting…"}>{online ? <Wifi size={12} /> : <WifiOff size={12} />}{online ? "Live" : "Connecting…"}</span>}
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
        <div className="hz-brand" onClick={secretTap} title="De-Hunza Sizzle"><div className="hz-logo"><HunzaLogo size={30} compact /></div><div className="hz-bn">De-Hunza <span>Sizzle</span></div></div>
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
            <b>De-Hunza Sizzle · {b.name}</b>
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
        <div className="hz-brand"><div className="hz-logo"><HunzaLogo size={26} compact /></div><div className="hz-bn">De-Hunza <span>Sizzle</span></div></div>
        <span>G-9/1 · I-8 Markaz, Islamabad · © {new Date().getFullYear()} De-Hunza Sizzle</span>
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
        <div className="hz-logo lg"><HunzaLogo size={44} /></div>
        <div className="hz-bn lg">De-Hunza <span>Sizzle</span></div>
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
function Empty({ text, icon: Icon = CircleAlert }) { return <div className="hz-emptybox"><Icon size={18} />{text}</div>; }
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
/* ---------------------------- Brand logo ---------------------------
   De-Hunza Sizzle mark, rebuilt as SVG so it stays sharp at any size
   and can inherit theme colours. `compact` drops the fine detail for
   the small header lockup.                                            */
function HunzaLogo({ size = 34, compact = false }) {
  return (
    <svg width={size} height={size} viewBox="0 0 120 120" fill="none" role="img" aria-label="De-Hunza Sizzle">
      {/* stem rising from the ring */}
      <path d="M80 58 L80 14 Q80 6 87 6 Q94 6 94 14 L94 58 Z" fill="#FFC220" />
      {/* open ring */}
      <circle cx="54" cy="66" r="36" fill="none" stroke="#FFC220" strokeWidth={compact ? 12 : 10}
              pathLength="100" strokeDasharray="72 28" strokeDashoffset="-3" strokeLinecap="round" />
      {/* plate */}
      <circle cx="54" cy="66" r="28" fill="#E23B34" />
      {/* spoon */}
      <ellipse cx="63" cy="55" rx="14" ry="8.5" fill="#FFC220" />
      <rect x="21" y="51.5" width="32" height="7" rx="3.5" fill="#FFC220" />
      {/* fork */}
      {!compact && <>
        <rect x="22" y="68" width="24" height="3.6" rx="1.8" fill="#FFC220" />
        <rect x="22" y="73.4" width="24" height="3.6" rx="1.8" fill="#FFC220" />
        <rect x="22" y="78.8" width="24" height="3.6" rx="1.8" fill="#FFC220" />
      </>}
      <rect x="40" y="66.5" width="12" height="17.5" rx="4" fill="#FFC220" />
      <rect x="50" y="71.5" width="38" height="7" rx="3.5" fill="#FFC220" />
    </svg>
  );
}
/* Cherry blossom from the original wordmark — used on the big lockup. */
function Sakura({ size = 26 }) {
  const petals = [0, 72, 144, 216, 288];
  return (
    <svg width={size} height={size} viewBox="0 0 60 60" aria-hidden="true">
      <g transform="translate(30 30)">
        {petals.map((a) => (
          <path key={a} transform={`rotate(${a})`} d="M0 -4 C7 -12 12 -20 6 -25 Q0 -29 -6 -25 C-12 -20 -7 -12 0 -4 Z"
                fill="#FDE7EC" stroke="#E23B5B" strokeWidth="1.6" />
        ))}
        {petals.map((a) => (
          <rect key={"s" + a} transform={`rotate(${a})`} x="-0.7" y="-13" width="1.4" height="9" rx="0.7" fill="#E23B5B" />
        ))}
        <circle r="2.6" fill="#E23B5B" />
      </g>
    </svg>
  );
}
/* Full lockup: mark + HUNZA / Sizzle wordmark. */
function BrandLockup({ size = 54 }) {
  return (
    <div className="hz-lockup">
      <HunzaLogo size={size} />
      <div className="hz-lockup-txt">
        <span className="hz-lk-1">HUNZA</span>
        <span className="hz-lk-2"><Sakura size={size * 0.36} />Sizzle</span>
      </div>
    </div>
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
            /* Takeaway has no table or car, so show who is collecting it —
               with their phone when the waiter took one, so the counter can
               call the customer when the order is ready. */
            const dval = o.type === "carhop" ? `${o.vehicle} · ${o.spot}`
              : o.type === "takeaway" ? [o.customer, o.phone].filter(Boolean).join(" · ") || "Counter"
              : o.table;
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
              <div className="hz-mfoot" style={{ marginBottom: 10 }}><b>{rs(grand(o))}</b><span className={"hz-pay " + o.payment}>{o.payment === "paid" ? "Prepaid" : o.payment === "pending" ? "Paid online (unverified)" : "Collect cash"}</span></div>
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
/* Counter order pad for a waiter. Three kinds of order can be taken here:
   Table (dine-in), Car-hop (curbside) and Takeaway (customer collects). */
function TakeOrder({ ctx, me, branch, onDone }) {
  const [mode, setMode] = useState("dinein");            // dinein | carhop | takeaway
  const [table, setTable] = useState(""); const [vehicle, setVehicle] = useState(""); const [spot, setSpot] = useState("");
  const [phone, setPhone] = useState("");
  const [name, setName] = useState(""); const [notes, setNotes] = useState(""); const [cart, setCart] = useState({});
  const menu = menuForBranch(ctx.menu, branch);
  const add = (it) => setCart((c) => ({ ...c, [it.name]: { ...it, qty: (c[it.name]?.qty || 0) + 1 } }));
  const sub = (n) => setCart((c) => { const q = (c[n]?.qty || 0) - 1; const x = { ...c }; if (q <= 0) delete x[n]; else x[n] = { ...x[n], qty: q }; return x; });
  const items = Object.values(cart);
  return (
    <div className="hz-form">
      <div className="hz-segt sm wide">
        <button className={mode === "dinein" ? "on" : ""} onClick={() => setMode("dinein")}>Table</button>
        <button className={mode === "carhop" ? "on" : ""} onClick={() => setMode("carhop")}>Car-hop</button>
        <button className={mode === "takeaway" ? "on" : ""} onClick={() => setMode("takeaway")}>Takeaway</button>
      </div>
      {mode === "carhop" && <div className="hz-row2"><label>Vehicle<input value={vehicle} onChange={(e) => setVehicle(e.target.value)} placeholder="ABC-123" /></label><label>Spot<input value={spot} onChange={(e) => setSpot(e.target.value)} placeholder="P5" /></label></div>}
      {mode === "dinein" && <label>Table<input value={table} onChange={(e) => setTable(e.target.value)} placeholder="01" /></label>}
      {mode === "takeaway"
        ? <div className="hz-row2">
            <label>Customer<input value={name} onChange={(e) => setName(e.target.value)} placeholder="Ahmed" /></label>
            <label>Phone (optional)<input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="0300-1234567" /></label>
          </div>
        : <label>Customer (optional)<input value={name} onChange={(e) => setName(e.target.value)} placeholder="Ahmed" /></label>}
      <div className="hz-pickgrid">{menu.map((it) => (
        <button key={it.id} className={"hz-pick" + (cart[it.name] ? " on" : "")} onClick={() => add(it)}><span>{it.em}</span>{it.name}{cart[it.name] && <em>{cart[it.name].qty}</em>}</button>
      ))}</div>
      {items.length > 0 && <div className="hz-minicart">{items.map((i) => (
        <div key={i.name}><span>{i.name}</span><div className="hz-step"><button onClick={() => sub(i.name)}><Minus size={12} /></button><b>{i.qty}</b><button onClick={() => add(i)}><Plus size={12} /></button></div></div>
      ))}</div>}
      <label>Notes<input value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="No spicy" /></label>
      <button className="hz-cta" disabled={!items.length} onClick={() => {
        ctx.addOrder({ source: "waiter", branch, waiter: me, customer: name.trim() || "Guest", type: mode,
          table: mode === "dinein" ? (table || "—") : undefined,
          vehicle: mode === "carhop" ? (vehicle || "—") : undefined,
          spot: mode === "carhop" ? (spot || "—") : undefined,
          phone: mode === "takeaway" ? (phone.trim() || undefined) : undefined,
          notes, items: items.map((i) => ({ name: i.name, qty: i.qty, price: i.price })) }).catch((e) => console.error("Order submit failed", e));
        onDone();
      }}>Submit order<ArrowRight size={15} /></button>
    </div>
  );
}

/* --------------------------- Cashier ------------------------------ */
/* Billing counter — today's and still-active orders for this branch, so the
   cashier can take payment and re-print receipts. */
function Cashier({ ctx, branch }) {
  const list = ctx.orders.filter((o) => o.branch === branch && (ACTIVE(o.status) || isToday(o.createdAt)))
    .sort((a, b) => (a.payment === "paid" ? 1 : 0) - (b.payment === "paid" ? 1 : 0) || b.createdAt - a.createdAt);
  const due = ctx.orders.filter((o) => o.branch === branch && o.payment === "unpaid" && (ACTIVE(o.status) || isToday(o.createdAt))).reduce((a, b) => a + grand(b), 0);
  const pendingCount = ctx.orders.filter((o) => o.branch === branch && o.payment === "pending" && (ACTIVE(o.status) || isToday(o.createdAt))).length;
  const PAY_LABEL = { paid: "Paid", unpaid: "Unpaid", pending: "Pending" };
  return (
    <div className="hz-wrap narrow">
      <Head title="Billing Counter" sub={`${branchName(branch)} · ${rs(due)} cash pending${pendingCount ? ` · ${pendingCount} online payment${pendingCount > 1 ? "s" : ""} to verify` : ""}`} />
      {pendingCount > 0 && <div className="hz-branchnote" style={{ marginBottom: 14 }}><AlertTriangle size={13} />Online payment claims aren't auto-confirmed — check your bank/JazzCash/Easypaisa and verify each one before treating it as paid.</div>}
      <div className="hz-stack">
        {list.map((o) => { const T = typeMeta(o); return (
          <div className={"hz-billrow" + (flashing(ctx, o.id) ? " flash" : "")} key={o.id}>
            <div className="hz-mhead"><span className="hz-tq"><Hash size={12} />{o.q}</span><Badge s={o.status} sm /><span className={"hz-pay " + o.payment}>{PAY_LABEL[o.payment] || o.payment}</span></div>
            <div className="hz-mmeta"><span><T.icon size={12} />{T.label}</span><span><User size={12} />{o.customer}</span></div>
            <div className="hz-mitems">{o.items.map((i) => `${i.qty}× ${i.name}`).join(" · ")}</div>
            <div className="hz-mfoot"><b>{rs(grand(o))}</b><div className="hz-macts">
              {o.payment === "unpaid" && <button className="hz-paybtn" onClick={() => { ctx.setPaid(o.id); ctx.toast(`#${o.q} paid · receipt printed`, "#29D3A6"); }}><Receipt size={14} />Take payment</button>}
              {o.payment === "pending" && <>
                <button className="hz-paybtn" onClick={() => { ctx.setPaid(o.id); ctx.toast(`#${o.q} payment verified`, "#29D3A6"); }}><ShieldCheck size={14} />Verify received</button>
                <button className="hz-mini" title="Payment not received — switch to cash" onClick={() => { ctx.setUnpaid(o.id); ctx.toast(`#${o.q} moved back to cash-due`, "#FF5470"); }}><AlertTriangle size={13} /></button>
              </>}
              {o.payment === "paid" && <button className="hz-mini" onClick={() => ctx.toast(`#${o.q} receipt re-printed`, "#5A9CFF")}><Receipt size={13} /></button>}
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
/* Customer order history — sourced from this browser's localStorage list of
   order ids, cross-referenced against the live synced orders so it always
   shows current status, not a stale snapshot. */
function MyOrders({ ctx, onOpen, onBack }) {
  const [ids, setIds] = useState(() => loadMyOrderIds());
  const list = ids.map((id) => ctx.orders.find((x) => x.id === id)).filter(Boolean).sort((a, b) => b.createdAt - a.createdAt);
  const clear = () => { if (!confirm("Clear your order history on this device? This can't be undone.")) return; clearMyOrders(); setIds([]); };
  return (
    <div className="hz-wrap narrow">
      <Head title="My Orders" sub={list.length ? `${list.length} order${list.length > 1 ? "s" : ""} on this device · kept 30 days` : "Orders you place will show up here"} />
      {list.length === 0 && <Empty icon={ClipboardList} text="No past orders on this device yet." />}
      <div className="hz-stack">{list.map((o) => { const T = typeMeta(o); return (
        <button key={o.id} className="hz-myorder" onClick={() => onOpen(o)}>
          <div className="hz-mhead"><span className="hz-tq"><Hash size={12} />{o.q}</span><Badge s={o.status} sm /><span className="hz-daysep-n" style={{ marginLeft: "auto" }}>{dayLabel(o.createdAt)} · {clock(o.createdAt)}</span></div>
          <div className="hz-mmeta"><span><T.icon size={12} />{T.label}</span><span><Store size={12} />{branchName(o.branch)}</span></div>
          <div className="hz-mitems">{o.items.map((i) => `${i.qty}× ${i.name}`).join(" · ")}</div>
          <div className="hz-mfoot"><b>{rs(grand(o))}</b>{o.status !== "completed" && <span className="hz-eta">Tap to track <ArrowRight size={12} /></span>}</div>
        </button>
      ); })}</div>
      {list.length > 0 && <button className="hz-clearhist" onClick={clear}><Trash2 size={13} />Clear my order history</button>}
    </div>
  );
}

function Track({ o, ctx, onNew }) {
  const i = STAGES.indexOf(o.status); const pos = ctx.queue[o.id];
  // Keeps the local "was this order still active?" cache accurate as status
  // changes live, so a later refresh knows correctly whether to resume it.
  useEffect(() => { updateMyOrderStatus(o.id, o.status); }, [o.id, o.status]);
  /* The generic STAGE labels ("Ready", "Completed") don't tell a customer
     what actually happens next — this makes the timeline say what THEY
     should expect for how their specific order type leaves the kitchen. */
  const stageLabel = (s) => {
    if (s === "ready") return o.type === "delivery" ? "Ready for rider" : o.type === "takeaway" ? "Ready — collect" : o.type === "carhop" ? "Ready" : "Ready to serve";
    if (s === "completed") return o.type === "delivery" ? "Delivered" : o.type === "takeaway" ? "Collected" : o.type === "carhop" ? "Delivered" : "Served";
    return STAGE[s].c;
  };
  const readyMsg = o.type === "delivery" ? "Ready — your rider is about to pick it up." : o.type === "takeaway" ? "Ready — please collect it from the counter." : o.type === "carhop" ? `Ready — ${o.waiter} is bringing it to your car.` : `Ready — ${o.waiter} is bringing it to your table.`;
  const doneMsg = o.type === "delivery" ? "Delivered — enjoy your meal!" : o.type === "takeaway" ? "Picked up — enjoy your meal!" : o.type === "carhop" ? "Brought out to your car — enjoy your meal!" : "Your meal has been served — please enjoy!";
  const delSteps = [{ k: "pickedup", l: "Picked up" }, { k: "onway", l: "On the way" }, { k: "reached", l: "Reached" }, { k: "delivered", l: "Delivered" }];
  const delOrder = ["", "pickedup", "onway", "reached", "delivered"];
  const delIdx = delOrder.indexOf(o.deliveryStage || "");
  return (
    <div className="hz-wrap narrow">
      <Head title="Live Tracking" sub={`Order #${o.q} · ${branchName(o.branch)}`} />
      <div className={"hz-track" + (flashing(ctx, o.id) ? " flash" : "")}>
        <div className="hz-track-hero"><div><div className="hz-th-q">Order #{o.q}</div><div className="hz-th-cur" style={{ color: STAGE[o.status].color }}>{stageLabel(o.status)}</div></div>
          <div className="hz-th-r"><div className="hz-th-big">{o.status === "completed" ? 0 : etaMins(o)}<small>min</small></div>{pos && <div className="hz-th-pos">Queue position {pos}</div>}</div></div>
        <div className="hz-asgn"><ChefHat size={13} />{o.type === "delivery" ? "Rider" : "Your waiter"}: <b>{o.waiter}</b></div>
        {o.custMsg && <div className="hz-custnotif"><Bell size={14} />{o.custMsg}</div>}
        <div className="hz-timeline">{STAGES.map((s, k) => { const done = STAGES.indexOf(s) < i, cur = STAGES.indexOf(s) === i;
          return (<div className={"hz-tl" + (done ? " done" : "") + (cur ? " cur" : "")} key={s}>
            <span className="hz-tl-dot" style={cur || done ? { background: STAGE[s].color, borderColor: STAGE[s].color } : {}}>{done ? <Check size={11} /> : cur ? <span className="hz-tl-live" /> : null}</span>
            {k < STAGES.length - 1 && <span className="hz-tl-line" style={done ? { background: STAGE[s].color } : {}} />}<span className="hz-tl-lbl">{stageLabel(s)}</span></div>); })}</div>
        {o.type === "delivery" && (o.status === "ready" || o.deliveryStage) && o.status !== "completed" && (
          <div className="hz-delrow">{delSteps.map((s, k) => <span key={s.k} className={"hz-delstep" + (delOrder.indexOf(s.k) <= delIdx ? " on" : "")}><Bike size={11} />{s.l}</span>)}</div>
        )}
        {o.status === "ready" && !o.deliveryStage && <div className="hz-cnote ready">{readyMsg}</div>}
        {o.status === "completed" && <div className="hz-cnote done"><CheckCircle2 size={15} />{doneMsg}</div>}
        <div className="hz-track-bill">
          <div className="hz-track-bill-h">Your order</div>
          <div className="hz-track-items">{o.items.map((it) => (
            <div className="hz-track-item" key={it.name}><span>{it.qty}× {it.name}</span><span>{rs(it.price * it.qty)}</span></div>
          ))}</div>
          <div className="hz-track-sums">
            <div className="hz-track-sumrow"><span>Subtotal</span><span>{rs(total(o))}</span></div>
            {o.fee > 0 && <div className="hz-track-sumrow"><span>Delivery fee</span><span>{rs(o.fee)}</span></div>}
            {o.tax > 0 && <div className="hz-track-sumrow"><span>Tax{o.taxRate ? ` (${(o.taxRate * 100).toFixed(0)}%)` : ""}</span><span>{rs(o.tax)}</span></div>}
            <div className="hz-track-sumrow total"><span>Total</span><span>{rs(grand(o))}</span></div>
          </div>
          <div className={"hz-pay bare " + o.payment}>{o.payment === "paid" ? "Paid" : o.payment === "pending" ? "Payment pending verification" : "Pay on " + (o.type === "delivery" ? "delivery" : "collection")}</div>
        </div>
      </div>
      <button className="hz-back wide center" onClick={onNew}>+ Place another order</button>
    </div>
  );
}

/* ===================== ORDER FLOW (public site) ================== */
const ORDER_MODES = [
  { id: "online", label: "Delivery", icon: Bike, soon: false },
  { id: "pickup", label: "Takeaway", icon: ShoppingBag, soon: false },
  { id: "car", label: "Curbside", icon: Car, soon: false },
];
/* The whole customer ordering journey: menu → checkout → live tracking.
   `entry` is set when the customer arrived by scanning a QR code, which locks
   the branch and pre-sets the table (dine-in) or car mode (curbside). */
function OrderFlow({ ctx, dark, setDark, onHome, onStaff, entry }) {
  const qrEntry = !!entry;
  const entryKind = entry?.kind === "car" ? "car" : "dine";
  const dine = qrEntry && entryKind === "dine";
  const [mode, setMode] = useState(qrEntry ? (entryKind === "car" ? "car" : "dine") : "online"); // online (delivery) | pickup | car | dine
  const [branch, setBranch] = useState(qrEntry ? entry.branch : (ctx.branchOpen.g91 !== false ? "g91" : "i8"));
  const [step, setStep] = useState("menu");           // menu | checkout | track | history
  const [cart, setCart] = useState({});
  const [placed, setPlaced] = useState(null);
  const [cat, setCat] = useState("All"); const [q, setQ] = useState("");
  const [setupOpen, setSetupOpen] = useState(false);
  const resumedRef = useRef(false);

  /* Refresh-persistence: if this browser placed an order that isn't finished
     yet, jump straight back to tracking it instead of losing it and showing
     the menu again. Runs once, as soon as synced orders are available. */
  useEffect(() => {
    if (resumedRef.current || step !== "menu") return;
    const ids = loadMyOrderIds();
    if (!ids.length) return;
    const active = ids.map((id) => ctx.orders.find((x) => x.id === id)).find((o) => o && o.status !== "completed");
    if (active) { resumedRef.current = true; updateMyOrderStatus(active.id, active.status); setPlaced(active); setStep("track"); }
    else if (ctx.orders.length) resumedRef.current = true; // orders have synced and none are active — stop checking
  }, [ctx.orders]);

  const add = (it) => setCart((c) => ({ ...c, [it.name]: { ...it, qty: (c[it.name]?.qty || 0) + 1 } }));
  const sub = (n) => setCart((c) => { const x = (c[n]?.qty || 0) - 1; const m = { ...c }; if (x <= 0) delete m[n]; else m[n] = { ...m[n], qty: x }; return m; });
  const items = Object.values(cart); const sum = items.reduce((a, b) => a + b.price * b.qty, 0);
  const closed = ctx.branchOpen[branch] === false;
  const avail = menuForBranch(ctx.menu, branch);
  const cats = ["All", ...new Set(avail.map((m) => m.cat))];
  const shown = avail.filter((m) => (cat === "All" || m.cat === cat) && m.name.toLowerCase().includes(q.toLowerCase()));

  const ctxLabel = dine ? `Dine-in${entry.table ? " · Table " + entry.table : ""} · ${branchName(branch)}`
    : (qrEntry && entryKind === "car") ? `Curbside (car) · ${branchName(branch)}`
    : mode === "online" ? `Delivery · ${branchName(branch)}` : mode === "pickup" ? `Takeaway · ${branchName(branch)}` : `Curbside · ${branchName(branch)}`;

  const bar = (
    <header className="hz-obar">
      <button className="hz-oback" onClick={step === "menu" ? onHome : () => setStep("menu")}><ChevronLeft size={18} /></button>
      <div className="hz-brand"><div className="hz-logo"><HunzaLogo size={30} compact /></div><div><div className="hz-bn">De-Hunza <span>Sizzle</span></div><div className="hz-bs">{qrEntry ? (entryKind === "car" ? "Curbside" : "Dine-in") : "Order"}</div></div></div>
      <button className="hz-ohome" onClick={() => setStep("history")}><ClipboardList size={14} />My Orders</button>
      <button className="hz-ohome" onClick={onHome}><Home size={14} />{qrEntry ? "Exit" : "Home"}</button>
      <button className="hz-icbtn" onClick={() => setDark((v) => !v)}>{dark ? <Sun size={16} /> : <Moon size={16} />}</button>
    </header>
  );

  if (step === "history") {
    return <div className="hz-online">{bar}<div className="hz-owrap"><MyOrders ctx={ctx} onOpen={(o) => { setPlaced(o); setStep("track"); }} onBack={() => setStep("menu")} /></div></div>;
  }
  if (step === "track" && placed) {
    const o = ctx.orders.find((x) => x.id === placed.id) || placed;
    return <div className="hz-online">{bar}<div className="hz-owrap"><Track o={o} ctx={ctx} onNew={() => { setCart({}); setPlaced(null); setStep("menu"); }} /></div></div>;
  }
  if (step === "checkout") {
    return <div className="hz-online">{bar}<div className="hz-owrap"><OrderCheckout ctx={ctx} mode={mode} branch={branch} table={dine ? entry.table : ""} spotPrefill={qrEntry && entryKind === "car" ? entry.spot : ""} items={items} sum={sum} onBack={() => setStep("menu")} onPlaced={(o) => { rememberMyOrder(o.id, o.status); setPlaced(o); setStep("track"); }} /></div></div>;
  }

  return (
    <div className="hz-online">{bar}
      <div className="hz-owrap">
        {qrEntry ? (
          <div className="hz-dinebanner">
            <span className="hz-dine-ic">{entryKind === "car" ? <Car size={18} /> : <QrCode size={18} />}</span>
            <div><b>Welcome to De-Hunza Sizzle</b><span>{branchName(branch)}{entryKind === "car" ? " · Curbside (car)" : entry.table ? ` · Table ${entry.table}` : ""} · scan-to-order</span></div>
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
          <span className="hz-ctxchip">{dine ? <Store size={14} /> : mode === "online" ? <Bike size={14} /> : mode === "pickup" ? <ShoppingBag size={14} /> : <Car size={14} />}{ctxLabel}</span>
          {!qrEntry && <button className="hz-ctxchange" onClick={() => setSetupOpen((v) => !v)}>{setupOpen ? "Done" : "Change"}<ChevronRight size={13} style={{ transform: setupOpen ? "rotate(90deg)" : "none", transition: ".2s" }} /></button>}
        </div>
        {!qrEntry && setupOpen && (
          <div className="hz-setup">
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
function OrderCheckout({ ctx, mode, branch, table, spotPrefill, items, sum, onBack, onPlaced }) {
  const dine = mode === "dine";
  const delivery = mode === "online";
  const pickup = mode === "pickup";
  const [name, setName] = useState(""); const [phone, setPhone] = useState(""); const [address, setAddress] = useState("");
  const [vehicle, setVehicle] = useState(""); const [spot, setSpot] = useState(spotPrefill || ""); const [notes, setNotes] = useState("");
  const [pay, setPay] = useState("cod"); const [err, setErr] = useState(""); const [placing, setPlacing] = useState(false);
  const fee = delivery ? 120 : 0;
  const tRate = taxRate(branch, pay);
  const tax = taxOf(branch, pay, sum + fee);
  const payable = sum + fee + tax;
  const place = () => {
    if (placing) return; // guard against double-tap while the previous request is still in flight
    if (!name.trim()) { setErr("Please enter your name."); return; }
    if ((delivery || pickup) && phone.trim().length < 7) { setErr("Please enter a valid phone number."); return; }
    if (delivery && !address.trim()) { setErr("A delivery address is required."); return; }
    if (mode === "car" && (!vehicle.trim() || !spot.trim())) { setErr("Please enter your vehicle number and parking spot."); return; }
    const money = { fee, tax, taxRate: tRate, payMethod: pay };
    let partial;
    // Online/card payment isn't actually verified here (no payment gateway is
    // wired up) — it only means "customer claims to have paid online", so it
    // starts as "pending" until staff confirm the money actually landed
    // (see Cashier / Manager Operations → "Verify payment"). Cash orders are
    // simply "unpaid" until collected in person, same as before.
    const payStatus = pay === "card" ? "pending" : "unpaid";
    if (dine) {
      partial = { source: "qr", branch, type: "dinein", table: table || "—", customer: name.trim(), notes: notes.trim(), ...money,
        payment: payStatus, items: items.map((i) => ({ name: i.name, qty: i.qty, price: i.price })) };
    } else if (mode === "car") {
      partial = { source: "car", branch, type: "carhop", customer: name.trim(), vehicle: vehicle.trim(), spot: spot.trim(), ...money,
        payment: payStatus, items: items.map((i) => ({ name: i.name, qty: i.qty, price: i.price })) };
    } else {
      partial = { source: "online", branch, type: delivery ? "delivery" : "takeaway", customer: name.trim(), phone: phone.trim(), ...money,
        address: delivery ? address.trim() : undefined, payment: payStatus,
        items: items.map((i) => ({ name: i.name, qty: i.qty, price: i.price })) };
    }
    setErr(""); setPlacing(true);
    ctx.addOrder(partial)
      .then((o) => onPlaced(o))
      .catch((e) => { console.error("Place order failed", e); setPlacing(false); setErr("Couldn't place the order — please check your connection and try again."); });
  };
  const title = dine ? `Dine-in${table ? " · Table " + table : ""}` : mode === "car" ? "Curbside" : delivery ? "Delivery" : "Takeaway";
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
        {(delivery || pickup) && <label><span><Phone size={12} /> Phone</span><input value={phone} onChange={(e) => setPhone(e.target.value.replace(/[^\d-]/g, ""))} placeholder="03xx-xxxxxxx" /></label>}
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
          <button className="hz-cta" disabled={placing} onClick={place}>{placing ? "Placing…" : <>Place order · {rs(payable)}</>}{!placing && <ArrowRight size={15} />}</button></div>

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
/* One icon per stage the customer's own tracking screen shows for this
   order type — clicking a step here updates the order's status live, which
   the customer sees update on their screen within a second or two (same
   Firestore sync used everywhere else). Only the immediate next stage is
   clickable at a time, so staff can't accidentally skip a step or send a
   confusing "delivered" message before the rider actually picked it up. */
function StageIcons({ o, ctx }) {
  const del = o.type === "delivery";
  const steps = del
    ? [
        { key: "new", label: "Received", icon: ClipboardList },
        { key: "preparing", label: "Preparing", icon: ChefHat, action: () => ctx.markPreparing(o.id) },
        { key: "ready", label: "Ready for rider", icon: Check, action: () => ctx.markReady(o.id) },
        { key: "pickedup", label: "Picked up", icon: Bike, action: () => ctx.riderStep(o.id, "pickedup") },
        { key: "onway", label: "On the way", icon: Navigation, action: () => ctx.riderStep(o.id, "onway") },
        { key: "reached", label: "Reached", icon: MapPin, action: () => ctx.riderStep(o.id, "reached") },
        { key: "delivered", label: "Delivered", icon: CheckCircle2, action: () => ctx.riderStep(o.id, "delivered") },
      ]
    : [
        { key: "new", label: "Received", icon: ClipboardList },
        { key: "preparing", label: "Preparing", icon: ChefHat, action: () => ctx.markPreparing(o.id) },
        { key: "ready", label: READY_LABEL[o.type] || "Ready", icon: Check, action: () => ctx.markReady(o.id) },
        { key: "done", label: DONE_LABEL[o.type] || "Done", icon: DONE_ICON[o.type] || CheckCircle2, action: () => ctx.markServed(o.id) },
      ];
  const curIdx = del
    ? (o.status === "completed" ? steps.length - 1 : o.deliveryStage ? steps.findIndex((s) => s.key === o.deliveryStage) : STAGES.indexOf(o.status))
    : (o.status === "completed" ? steps.length - 1 : STAGES.indexOf(o.status));
  return (
    <div className="hz-stageicons">
      {steps.map((s, idx) => {
        const done = idx < curIdx, cur = idx === curIdx, clickable = !!s.action && idx === curIdx + 1;
        return (
          <React.Fragment key={s.key}>
            {idx > 0 && <span className={"hz-stageline" + (idx <= curIdx ? " done" : "")} />}
            <button type="button" disabled={!clickable} title={s.label} aria-label={s.label}
              className={"hz-stageicon" + (done ? " done" : "") + (cur ? " cur" : "") + (clickable ? " clickable" : "")}
              onClick={() => clickable && s.action()}><s.icon size={13} /></button>
          </React.Fragment>
        );
      })}
    </div>
  );
}
/* Live operations: branch open/closed switches, team workload, and the order
   list where staff print tickets and mark orders ready. */
function ManagerOps({ ctx, branch, onPrint }) {
  const inB = (o) => branch === "all" || o.branch === branch;
  const [dayFilter, setDayFilter] = useState("today"); // today | yesterday | week | all
  const DAY_FILTERS = [
    { id: "today", label: "Today", test: (ts) => isToday(ts) },
    { id: "yesterday", label: "Yesterday", test: (ts) => isYesterday(ts) },
    { id: "week", label: "Last 7 Days", test: (ts) => isLast7(ts) },
    { id: "all", label: "All", test: () => true },
  ];
  const dayTest = DAY_FILTERS.find((d) => d.id === dayFilter).test;
  /* Any order still in progress (new/preparing/ready) always stays visible
     regardless of the date filter — an active order from yesterday must
     never silently disappear just because "Today" is selected. Completed/
     cancelled orders, on the other hand, strictly follow the date filter so
     old and new history don't pile up together undated. */
  const all = ctx.orders.filter(inB).filter((o) => ACTIVE(o.status) || dayTest(o.createdAt)).sort((a, b) => (dayStart(b.createdAt) - dayStart(a.createdAt)) || (b.priority - a.priority) || (a.createdAt - b.createdAt));
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
  /* Group the visible orders under date headers (Today / Yesterday / 12 Jan
     2026 …) in the order they naturally sort in — this is what actually
     keeps different days visually separated instead of one long mixed list. */
  const groups = []; { let last = null; for (const o of all) { const lbl = dayLabel(o.createdAt); if (lbl !== last) { groups.push({ label: lbl, items: [] }); last = lbl; } groups[groups.length - 1].items.push(o); } }
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
          <div className="hz-daychips">{DAY_FILTERS.map((d) => <button key={d.id} className={"hz-daychip" + (dayFilter === d.id ? " on" : "")} onClick={() => setDayFilter(d.id)}>{d.label}</button>)}</div>
          {groups.length === 0 && <Empty text="No orders in this range." />}
          {groups.map((g) => (
            <div key={g.label}>
              <div className="hz-daysep"><Calendar size={12} />{g.label}<span className="hz-daysep-n">{g.items.length} order{g.items.length > 1 ? "s" : ""}</span></div>
              <div className="hz-stack">{g.items.map((o) => { const T = typeMeta(o); const del = o.type === "delivery"; return (
            <div className={"hz-mrow" + (flashing(ctx, o.id) ? " flash" : "") + (o.status === "new" ? " isnew" : "")} key={o.id}>
              <div className="hz-mhead"><span className="hz-tq"><Hash size={12} />{o.q}</span><Badge s={o.status} sm /><BranchTag b={o.branch} />{ACTIVE(o.status) && <span className="hz-qpos">Q#{ctx.queue[o.id]}</span>}{(o.source === "qr" || o.source === "online" || o.source === "car") && <span className="hz-srctag">{o.source}</span>}<span className={"hz-pay " + o.payment}>{o.payment === "paid" ? "Paid" : o.payment === "pending" ? "Verify payment" : "Unpaid"}</span></div>
              <div className="hz-mmeta"><span><T.icon size={12} />{T.label}</span><span><User size={12} />{o.customer}</span><span>{del ? <Bike size={12} /> : <Users size={12} />}{o.waiter}</span><span><Clock size={12} />{clock(o.createdAt)}</span></div>
              <div className="hz-mitems">{o.items.map((i) => `${i.qty}× ${i.name}`).join(" · ")}</div>
              <div className="hz-mfoot"><b>{rs(grand(o))}</b>{ACTIVE(o.status) && <span className="hz-eta">ETA {etaMins(o)}m</span>}
                <div className="hz-macts">
                  <button className="hz-printbtn" onClick={() => doPrint(o)}><Receipt size={13} />{o.status === "new" ? "Print" : "Re-print"}</button>
                  <button className={"hz-mini" + (o.priority ? " active" : "")} onClick={() => ctx.togglePriority(o.id)}><Star size={13} /></button>
                  {o.payment === "unpaid" && <button className="hz-mini" title="Mark paid — cash received" onClick={() => ctx.setPaid(o.id)}><Wallet size={13} /></button>}
                  {o.payment === "pending" && <>
                    <button className="hz-mini" title="Verify — online payment received" onClick={() => ctx.setPaid(o.id)}><ShieldCheck size={13} /></button>
                    <button className="hz-mini" title="Not received — switch to cash" onClick={() => ctx.setUnpaid(o.id)}><AlertTriangle size={13} /></button>
                  </>}
                  <button className="hz-mini danger" onClick={() => ctx.cancel(o.id)}><Trash2 size={13} /></button></div>
              {/* Every stage the customer's own tracking screen shows, as clickable icons —
                  tapping one updates their screen live. */}
              {o.status !== "completed" && <StageIcons o={o} ctx={ctx} />}
              </div>
            </div>); })}</div>
            </div>
          ))}
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
      <div className="hz-invlayout">
        <div className="hz-card">
          <div className="hz-card-h"><h3>Inventory</h3><span className="hz-card-sub">{low.length} low · admin &amp; manager</span></div>
          <div className="hz-addstock">
            <div className="hz-addstock-h"><PackagePlus size={13} />Add / restock at <b style={{ color: "var(--ember)" }}>&nbsp;{branchName(targetBranch)}</b><InfoTip label="About adding stock">Type any item name — it is created automatically if it doesn't exist yet.<br /><br />Entering the cost you paid records the purchase, which feeds the “Stock In” totals and the dashboard's money in vs out.</InfoTip></div>
            {branch === "all" && <div className="hz-segt sm" style={{ margin: "0 0 9px" }}>{BRANCHES.map((b) => <button key={b.id} className={addBranch === b.id ? "on" : ""} onClick={() => setAddBranch(b.id)}>{b.name}</button>)}</div>}
            <div className="hz-stockform">
              <label className="hz-sf-item"><span>Item name</span>
                <input value={nm} onChange={(e) => setNm(e.target.value)} placeholder="e.g. Chicken" /></label>
              <label className="hz-sf-qty"><span>Qty</span>
                <input value={qty} onChange={(e) => setQty(e.target.value.replace(/[^\d.]/g, ""))} placeholder="10" /></label>
              <label className="hz-sf-unit"><span>Unit</span>
                <input value={unit} onChange={(e) => setUnit(e.target.value)} placeholder="kg" /></label>
              <label className="hz-sf-cost"><span>Cost paid (optional)</span>
                <div className="hz-costin"><em>Rs</em><input value={cost} onChange={(e) => setCost(e.target.value.replace(/[^\d]/g, ""))} placeholder="0" /></div></label>
              <button className="hz-sf-btn" disabled={!nm.trim() || !(+qty > 0)} onClick={addStock}><Plus size={15} />Add stock</button>
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
              <div className="hz-macts"><button className="hz-mini" title="Edit item" aria-label="Edit item" onClick={() => setEditId(it.id)}><Pencil size={13} /></button><button className="hz-mini danger" title="Remove item" aria-label="Remove item" onClick={() => { if (askConfirm(`Remove "${it.name}" from inventory?`)) ctx.deleteInventory(it.id); }}><Trash2 size={13} /></button></div>
            </div>); })}
            {inv.length === 0 && <Empty text="No items yet — add one above." />}
          </div>
        </div>
        <div className="hz-card hz-buypanel">
          <div className="hz-card-h"><h3>Stock purchases</h3><span className="hz-card-sub">money spent on stock</span></div>
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
          <label><span>Dish photo <InfoTip label="About dish photos">Two ways to add a photo:<br /><br /><b>1. Upload</b> — picks a file from this device. Good for a quick demo.<br /><br /><b>2. Photo URL</b> — a link to the image (your website, Cloudinary, Supabase Storage). <b>This is the one to use once the database is live</b>, because the link is what gets stored against the dish.</InfoTip></span>
            <label className="hz-upload">{img ? <img src={img} alt="preview" /> : <div className="hz-upload-ph"><ImagePlus size={26} /><span>Tap to upload a photo</span></div>}<input type="file" accept="image/*" onChange={onFile} hidden /></label></label>
          <label>Item name<input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Chicken Karahi" /></label>
          <div className="hz-row2"><label>Price (Rs)<input value={price} onChange={(e) => setPrice(e.target.value.replace(/[^\d]/g, ""))} placeholder="0" /></label>
            <label>Category<input list="hz-cats" value={cat} onChange={(e) => setCat(e.target.value)} placeholder="Chinese / Fast Food…" /><datalist id="hz-cats">{cats.map((c) => <option key={c} value={c} />)}</datalist></label></div>
          <label>Available at branch
            <div className="hz-brchecks">{BRANCHES.map((b) => (
              <button key={b.id} className={"hz-brcheck" + (brs.includes(b.id) ? " on" : "")} onClick={() => toggleBr(b.id)}>{brs.includes(b.id) ? <Check size={13} /> : <Plus size={13} />}{b.name}</button>
            ))}</div>
          </label>
          <label>Description (optional)<input value={desc} onChange={(e) => setDesc(e.target.value)} placeholder="Short description" /></label>
          <label>…or paste a photo URL<input value={img.startsWith("data:") ? "" : img} onChange={(e) => setImg(e.target.value.trim())} placeholder="https://…/dish.jpg (optional)" /></label>
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
            <div className="hz-macts"><button className="hz-mini" title="Edit item" aria-label="Edit item" onClick={() => setEditId(it.id)}><Pencil size={13} /></button><button className={"hz-toggle" + (it.available ? " on" : "")} onClick={() => ctx.toggleMenuItem(it.id)}><span className="hz-toggle-knob" /></button><button className="hz-mini danger" onClick={() => { if (askConfirm(`Delete "${it.name}" from the menu?`)) ctx.deleteMenuItem(it.id); }}><Trash2 size={13} /></button></div>
          </div>)
        ))}</div>
      </div>
    </div>
  );
}
/* Inline editor for one menu item: name, price, category and description. */
function MenuEditRow({ it, cats, onCancel, onSave }) {
  const [n, setN] = useState(it.name); const [p, setP] = useState(String(it.price));
  const [c, setC] = useState(it.cat); const [d, setD] = useState(it.desc || ""); const [im, setIm] = useState(it.img || "");
  const ok = n.trim() && +p > 0 && c.trim();
  return (
    <div className="hz-editrow">
      <div className="hz-editrow-h"><Pencil size={13} />Editing menu item</div>
      <div className="hz-form">
        <label>Item name<input value={n} onChange={(e) => setN(e.target.value)} /></label>
        <div className="hz-row2">
          <label>Price (Rs)<input value={p} onChange={(e) => setP(e.target.value.replace(/[^\d]/g, ""))} /></label>
          <label>Category<input list="hz-cats-edit" value={c} onChange={(e) => setC(e.target.value)} /><datalist id="hz-cats-edit">{cats.map((x) => <option key={x} value={x} />)}</datalist></label>
        </div>
        <label>Description<input value={d} onChange={(e) => setD(e.target.value)} placeholder="Short description" /></label>
        <label>Photo URL<input value={im} onChange={(e) => setIm(e.target.value.trim())} placeholder="https://…/dish.jpg (optional)" /></label>
        {im && <div className="hz-imgprev"><img src={im} alt="Preview" onError={(e) => { e.target.style.display = "none"; }} /><span>Photo preview</span></div>}
        <div className="hz-corow2">
          <button className="hz-ghost" onClick={onCancel}><X size={14} />Cancel</button>
          <button className="hz-fulfill" disabled={!ok} onClick={() => onSave({ name: n.trim(), price: +p, cat: c.trim(), desc: d.trim(), img: im.trim() })}><Check size={14} />Save changes</button>
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
              <button className="hz-mini" title="Edit staff" aria-label="Edit staff" onClick={() => setEditId(u.id)}><Pencil size={13} /></button>
              <button className="hz-mini danger" title="Delete staff" aria-label="Delete staff" onClick={() => { if (askConfirm(`Delete ${u.name}'s account? This cannot be undone.`)) ctx.deleteUser(u.id); }}><Trash2 size={13} /></button>
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
  const printRootRef = useRef(null);
  const T = typeMeta(o);
  const fee = o.fee != null ? o.fee : (o.type === "delivery" ? 120 : 0);
  const tax = o.tax || 0;
  const tRate = o.taxRate || 0;
  const subtotal = total(o);
  const when = new Date(o.createdAt).toLocaleString("en-GB", { day: "2-digit", month: "short", year: "numeric", hour: "numeric", minute: "2-digit" });
  const typeLabel = o.type === "delivery" ? "Delivery" : o.type === "takeaway" ? "Pickup" : o.type === "carhop" ? "Curbside" : "Dine-in";
  /* @page { size: 80mm auto } SHOULD let the page end exactly where the
     receipt ends — but several Windows POS-printer drivers silently ignore
     "auto" and fall back to their default registered paper (often A4/Letter),
     which is what prints a blank leading page before the receipt shows up.
     Measuring the receipt's real height and injecting an EXACT millimetre
     value is far more reliably honoured than the "auto" keyword. */
  /* Printing via the app's own window (hiding everything except the
     receipt with CSS, and hoping @page sizing is honoured) has kept
     producing multiple full A4 pages on this printer/driver combo — several
     Windows POS drivers simply don't respect @page sizing or "auto" height
     when the document also contains the full app stylesheet.
     This opens a BRAND NEW, completely bare document — just the receipt's
     markup and a small hand-written stylesheet, nothing else from the app —
     computes its real height once rendered, and prints THAT window. There's
     nothing else on the page for a confused driver to paginate against. */
  const printAs = (w) => {
    setWhich(w); // keeps the on-screen preview toggle in sync too
    // window.open must run synchronously, in direct response to the click —
    // wrapping it in a timeout (like the previous version did) breaks the
    // "user gesture" chain in several browsers and gets silently blocked as
    // a popup. Both receipts already exist in the DOM at all times (only
    // CSS toggles which one shows), so there's no need to wait on React
    // re-rendering `which` before reading the markup.
    const receiptsEl = printRootRef.current && printRootRef.current.querySelector(".hz-receipts");
    const win = receiptsEl && window.open("", "_blank", "width=420,height=720");
    if (!win || !receiptsEl) { setTimeout(() => window.print(), 60); return; } // popup blocked or DOM not ready — fall back
    const pageBreak = w === "both" ? ".hz-receipt.kitchen{page-break-after:always;break-after:page;}" : "";
    win.document.open();
    win.document.write(`<!DOCTYPE html><html><head><meta charset="utf-8"><title>Order #${o.q}</title><style>
      *{margin:0;padding:0;box-sizing:border-box;}
      html,body{background:#fff;}
      body{font-family:"Arial Black","Helvetica Neue",Arial,sans-serif;color:#000;}
      .hz-receipts{display:block;}
      .hz-receipt{width:72mm;max-width:72mm;margin:0 auto;padding:2mm 2mm 3mm;font-size:12.5px;line-height:1.42;font-weight:700;color:#000;}
      .hz-rc-tag{display:inline-block;background:#000;color:#fff;font-weight:900;padding:1mm 2mm;margin-bottom:2mm;}
      .hz-rc-title{font-size:17px;font-weight:900;letter-spacing:.02em;}
      .hz-rc-title.big{font-size:20px;}
      .hz-rc-sub{font-size:11px;margin:0 0 1mm;}
      .hz-rc-hr{border-top:1px solid #000;margin:2mm 0;}
      .hz-rc-row{display:flex;justify-content:space-between;gap:6px;margin:1mm 0;font-size:12px;}
      .hz-rc-row b.addr{max-width:42mm;text-align:right;}
      .hz-rc-row.total{border-top:2px solid #000;border-bottom:2px solid #000;font-size:15px;font-weight:900;padding:1.5mm 0;margin:2mm 0;}
      .hz-rc-items{width:100%;border-collapse:collapse;margin:2mm 0;font-size:11.5px;}
      .hz-rc-items td{padding:1mm 0;vertical-align:top;}
      .hz-rc-items td.qty{white-space:nowrap;padding-right:4px;}
      .hz-rc-items td.amt{width:22mm;text-align:right;}
      .hz-rc-items tr.head td{border-bottom:1.5px solid #000;font-weight:900;}
      .hz-rc-note{font-size:11px;font-style:italic;margin:1mm 0;}
      .hz-rc-foot{text-align:center;font-size:10.5px;margin-top:2mm;}
      ${w === "kitchen" ? ".hz-receipt.bill{display:none;}" : w === "bill" ? ".hz-receipt.kitchen{display:none;}" : pageBreak}
    </style></head><body>${receiptsEl.outerHTML}</body></html>`);
    win.document.close();
    const runPrint = () => {
      try {
        const heightMm = Math.ceil((win.document.body.scrollHeight / 96) * 25.4) + 4;
        const st = win.document.createElement("style");
        st.textContent = `@page{size:80mm ${heightMm}mm;margin:0;}`;
        win.document.head.appendChild(st);
      } catch (e) { console.error("Couldn't size print page", e); }
      win.focus(); win.print();
      setTimeout(() => { try { win.close(); } catch (e) {} }, 400);
    };
    if (win.document.readyState === "complete") setTimeout(runPrint, 80);
    else win.onload = () => setTimeout(runPrint, 80);
  };
  return (
    <div className={"hz-printroot show-" + which} ref={printRootRef} onClick={onClose}>
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
          <div className="hz-rc-sub">De-Hunza Sizzle · {branchName(o.branch)}</div>
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
          <div className="hz-rc-title big">De-Hunza Sizzle</div>
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
          <div className="hz-rc-row"><span>Payment</span><b>{(o.payMethod === "card" ? "CARD/ONLINE · " : o.payMethod ? "CASH · " : "") + (o.payment === "paid" ? "PAID" : o.payment === "pending" ? "PENDING VERIFICATION" : "UNPAID")}</b></div>
          <div className="hz-rc-hr" />
          <div className="hz-rc-foot">Thank you for choosing De-Hunza Sizzle!<br />Chinese &amp; Fast Food · Islamabad</div>
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
.hz[data-theme="dark"]{--bg:#141110;--bg2:#1C1815;--surface:#1F1A16;--surface2:#262019;--border:rgba(255,255,255,.08);--text:#F6EFE6;--muted:#A6968A;--ember:#FF6B2C;--saffron:#FFB22C;--jade:#29D3A6;--rose:#FF5470;--rider:#9B8CFF;--glass:rgba(28,24,21,.8);}
.hz[data-theme="light"]{--bg:#F4EEE3;--bg2:#FBF7EF;--surface:#FFFFFF;--surface2:#FBF6EE;--border:rgba(20,17,16,.09);--text:#2A211B;--muted:#7A6C60;--ember:#E85518;--saffron:#E08A00;--jade:#0E9E78;--rose:#E23B57;--rider:#7A63E8;--glass:rgba(255,255,255,.82);}
.hz button{font-family:inherit;cursor:pointer;border:none;background:none;color:inherit;}
.hz input,.hz select{font-family:inherit;}
.hz h1,.hz h2,.hz h3{margin:0;font-family:var(--fd);letter-spacing:-.02em;}

.hz-logo{width:38px;height:38px;border-radius:11px;display:grid;place-items:center;flex-shrink:0;background:#141110;border:1px solid rgba(255,194,32,.28);box-shadow:0 5px 16px -8px rgba(255,178,44,.7);overflow:hidden;}
.hz[data-theme="light"] .hz-logo{background:#1C1815;}
.hz-logo svg{display:block;}
/* brand lockup (login / hero) */
.hz-lockup{display:flex;align-items:center;gap:12px;}
.hz-lockup-txt{display:flex;flex-direction:column;line-height:.95;}
.hz-lk-1{font-family:var(--fd);font-weight:800;font-size:26px;letter-spacing:.02em;color:var(--text);}
.hz-lk-2{display:flex;align-items:center;gap:4px;font-family:Georgia,"Times New Roman",serif;font-size:22px;color:var(--text);margin-top:-2px;margin-left:22px;}
.hz-lk-2 svg{margin-right:-6px;}
.hz-logo.lg{width:58px;height:58px;border-radius:16px;}
.hz-bn{font-family:var(--fd);font-weight:800;font-size:15px;line-height:1;}
.hz-bn.lg{font-size:26px;margin-top:14px;}
.hz-bn span{background:linear-gradient(135deg,var(--ember),var(--saffron));-webkit-background-clip:text;background-clip:text;-webkit-text-fill-color:transparent;}
.hz-bs{font-size:10.5px;color:var(--muted);text-transform:uppercase;letter-spacing:.06em;margin-top:3px;}

.hz-login{min-height:100vh;display:flex;flex-direction:column;align-items:center;justify-content:center;padding:30px 18px;position:relative;overflow:hidden;}
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
.hz-onlinecta{width:100%;max-width:370px;margin-top:14px;display:flex;align-items:center;gap:13px;padding:15px 17px;border-radius:16px;background:linear-gradient(135deg,var(--ember),var(--saffron));color:#fff;box-shadow:0 14px 32px -12px var(--ember);transition:transform .15s,filter .2s;}
.hz-onlinecta:hover{filter:brightness(1.05);}.hz-onlinecta:active{transform:scale(.98);}
.hz-onlinecta-ic{width:42px;height:42px;border-radius:12px;background:rgba(255,255,255,.2);display:grid;place-items:center;flex-shrink:0;}
.hz-onlinecta b{display:block;font-size:15px;font-family:var(--fd);}.hz-onlinecta span{font-size:12px;opacity:.92;}
.hz-onlinecta>svg:last-child{margin-left:auto;}

.hz-bar{position:sticky;top:0;z-index:30;display:flex;align-items:center;gap:14px;padding:11px 16px;background:var(--glass);backdrop-filter:blur(14px);border-bottom:1px solid var(--border);}
.hz-brand{display:flex;align-items:center;gap:10px;}
.hz-ident{display:inline-flex;align-items:center;gap:8px;padding:6px 12px;border-radius:99px;font-size:12.5px;font-weight:600;background:var(--surface);border:1px solid var(--border);}
.hz-ident-ic{color:var(--ember);display:grid;place-items:center;}
.hz-bar-r{margin-left:auto;display:flex;align-items:center;gap:8px;}
.hz-ctl{display:inline-flex;align-items:center;gap:6px;padding:8px 12px;border-radius:10px;font-size:12.5px;font-weight:600;background:var(--surface);border:1px solid var(--border);color:var(--text);transition:.15s;}
.hz-ctl:hover{border-color:var(--ember);}
.hz-ctl.on{color:#fff;background:linear-gradient(135deg,var(--ember),var(--saffron));border-color:transparent;}
.hz-synctag{display:inline-flex;align-items:center;gap:5px;padding:6px 10px;border-radius:10px;font-size:11px;font-weight:700;background:var(--surface);border:1px solid var(--border);color:var(--danger,#FF5470);}
.hz-synctag.on{color:#29D3A6;border-color:#29D3A633;background:#29D3A61a;}
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
.hz-srctag{font-size:9.5px;font-weight:700;color:var(--jade);background:color-mix(in srgb,var(--jade) 14%,transparent);padding:2px 6px;border-radius:5px;text-transform:uppercase;letter-spacing:.04em;}
.hz-stack{display:flex;flex-direction:column;gap:10px;}

.hz-segt{display:flex;gap:4px;padding:4px;border-radius:11px;background:var(--surface2);border:1px solid var(--border);margin-bottom:14px;}
.hz-segt.sm{margin-bottom:11px;}.hz-segt.wide{max-width:420px;}.hz-segt.wide4{max-width:680px;}.hz-segt.wide5{max-width:780px;}
.hz-segt.wide6{max-width:880px;}.hz-segt.wide7{max-width:980px;}
.hz-segt.wide6 button,.hz-segt.wide7 button{padding:9px 8px;font-size:12px;}
.hz-segt button{flex:1;padding:9px;border-radius:8px;font-size:12.5px;font-weight:600;color:var(--muted);display:inline-flex;align-items:center;justify-content:center;gap:6px;transition:color .2s;}
.hz-segt button.on{color:#fff;background:linear-gradient(135deg,var(--ember),var(--saffron));box-shadow:0 4px 14px -6px var(--ember);}
.hz-segt em{font-style:normal;font-family:var(--fm);font-size:11px;background:rgba(255,255,255,.25);padding:0 6px;border-radius:99px;}

.hz-trow{display:flex;align-items:center;justify-content:space-between;margin-bottom:8px;}
.hz-titems li{font-size:13px;}.hz-titems b{font-family:var(--fm);color:var(--ember);}
.hz-back{padding:9px 12px;border-radius:9px;font-size:12.5px;font-weight:600;color:var(--muted);background:var(--surface2);border:1px solid var(--border);}
.hz-back.wide{flex:1;text-align:center;}.hz-back.center{display:block;margin:14px auto 0;}

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
.hz-cta{display:inline-flex;align-items:center;justify-content:center;gap:6px;padding:12px;border-radius:12px;font-size:13.5px;font-weight:700;color:#fff;background:linear-gradient(135deg,var(--ember),var(--saffron));transition:transform .12s,filter .2s,box-shadow .25s;}
.hz-cta:hover:not(:disabled){box-shadow:0 8px 22px -8px color-mix(in srgb,var(--ember) 55%,transparent);}
.hz-cta:disabled{opacity:.4;cursor:not-allowed;}
.hz-cta:hover:not(:disabled){filter:brightness(1.06);}.hz-cta:active:not(:disabled){transform:scale(.98);}
.hz-corow{display:flex;gap:10px;}.hz-corow .hz-cta{flex:1;}

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
.hz-mrow,.hz-billrow{background:var(--bg2);border:1px solid var(--border);border-radius:14px;padding:12px;}
.hz-myorder{display:block;width:100%;text-align:left;background:var(--bg2);border:1px solid var(--border);border-radius:14px;padding:12px;font:inherit;color:inherit;cursor:pointer;transition:.2s;}
.hz-myorder:hover{border-color:color-mix(in srgb,var(--ember) 40%,var(--border));transform:translateY(-2px);}
.hz-clearhist{display:flex;align-items:center;justify-content:center;gap:6px;width:100%;margin-top:16px;padding:10px;border-radius:10px;font-size:12.5px;font-weight:600;color:var(--muted);background:transparent;border:1px dashed var(--border);}
.hz-clearhist:hover{color:#FF5470;border-color:#FF547055;}
.hz-mhead{display:flex;align-items:center;gap:8px;margin-bottom:8px;flex-wrap:wrap;}
.hz-qpos{font-size:10.5px;color:var(--muted);font-family:var(--fm);}
.hz-pay{margin-left:auto;font-size:10.5px;font-weight:700;padding:3px 8px;border-radius:6px;}
.hz-pay.paid{color:var(--jade);background:color-mix(in srgb,var(--jade) 14%,transparent);}
.hz-pay.unpaid{color:var(--saffron);background:color-mix(in srgb,var(--saffron) 14%,transparent);}
.hz-pay.pending{color:#9B8CFF;background:color-mix(in srgb,#9B8CFF 16%,transparent);}
.hz-mmeta{display:flex;flex-wrap:wrap;gap:9px;font-size:11.5px;color:var(--muted);margin-bottom:7px;}
.hz-mmeta span{display:inline-flex;align-items:center;gap:4px;}
.hz-mitems{font-size:12.5px;margin-bottom:7px;}
.hz-mfoot{display:flex;align-items:center;gap:10px;}.hz-mfoot>b{font-family:var(--fm);font-size:14px;}
.hz-eta{font-size:11px;color:var(--muted);font-family:var(--fm);}
.hz-macts{margin-left:auto;display:flex;gap:6px;}
.hz-mini{width:30px;height:30px;border-radius:10px;display:grid;place-items:center;background:var(--surface2);border:1px solid var(--border);color:var(--muted);transition:.15s;}
.hz-mini:active{transform:scale(.92);}
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
.hz-toggle{width:42px;height:24px;border-radius:99px;background:var(--surface2);border:1px solid var(--border);position:relative;transition:background .25s,border-color .25s;flex-shrink:0;}
.hz-toggle.on{background:linear-gradient(135deg,var(--jade),var(--saffron));border-color:transparent;}
.hz-toggle-knob{position:absolute;top:2px;left:2px;width:18px;height:18px;border-radius:50%;background:#fff;transition:transform .32s cubic-bezier(.34,1.56,.64,1);box-shadow:0 1px 3px rgba(0,0,0,.3);}
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
.hz-daychips{display:flex;gap:6px;flex-wrap:wrap;margin-bottom:12px;}
.hz-daychip{padding:6px 12px;border-radius:8px;font-size:12px;font-weight:700;background:var(--bg2);border:1px solid var(--border);color:var(--muted);cursor:pointer;transition:.15s;}
.hz-daychip:hover{border-color:var(--ember);color:var(--text);}
.hz-daychip.on{color:#fff;background:linear-gradient(135deg,var(--ember),var(--saffron));border-color:transparent;}
.hz-daysep{display:flex;align-items:center;gap:6px;font-size:11.5px;font-weight:700;color:var(--muted);text-transform:uppercase;letter-spacing:.04em;margin:16px 0 8px;padding-bottom:6px;border-bottom:1px dashed var(--border);}
.hz-daysep:first-child{margin-top:0;}
.hz-daysep-n{margin-left:auto;font-weight:600;text-transform:none;letter-spacing:0;color:var(--muted);opacity:.8;}
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
.hz-card,.hz-ticket,.hz-worder,.hz-mrow,.hz-billrow,.hz-fcard,.hz-kpi,.hz-loginbox,.hz-mitemrow,.hz-userrow,.hz-reqrow,.hz-modecard,.hz-branchcard{box-shadow:0 1px 2px color-mix(in srgb,var(--ember) 6%,rgba(0,0,0,.05)),0 16px 32px -22px color-mix(in srgb,var(--ember) 22%,rgba(0,0,0,.65));transition:box-shadow .22s cubic-bezier(.2,.7,.2,1),transform .22s cubic-bezier(.2,.7,.2,1),border-color .2s;}
.hz-modecard:hover,.hz-branchcard:hover{transform:translateY(-3px);border-color:color-mix(in srgb,var(--ember) 35%,var(--border));box-shadow:0 4px 10px color-mix(in srgb,var(--ember) 8%,rgba(0,0,0,.06)),0 22px 40px -20px color-mix(in srgb,var(--ember) 30%,rgba(0,0,0,.7));}
.hz[data-theme="light"] .hz-card,.hz[data-theme="light"] .hz-fcard,.hz[data-theme="light"] .hz-kpi,.hz[data-theme="light"] .hz-loginbox,.hz[data-theme="light"] .hz-modecard,.hz[data-theme="light"] .hz-branchcard{box-shadow:0 1px 2px rgba(120,80,40,.06),0 18px 36px -24px rgba(120,70,30,.45);}
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
.hz ::selection{background:color-mix(in srgb,var(--ember) 35%,transparent);color:var(--text);}
.hz{scrollbar-width:thin;scrollbar-color:var(--border) transparent;}
.hz ::-webkit-scrollbar{width:8px;height:8px;}
.hz ::-webkit-scrollbar-track{background:transparent;}
.hz ::-webkit-scrollbar-thumb{background:var(--border);border-radius:99px;}
.hz ::-webkit-scrollbar-thumb:hover{background:color-mix(in srgb,var(--ember) 40%,var(--border));}

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
.hz-addstock-row input{flex:1;min-width:0;padding:9px 10px;border-radius:9px;background:var(--surface);border:1px solid var(--border);color:var(--text);font-size:13px;outline:none;}
.hz-addstock-row input:focus{border-color:var(--ember);}
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
.hz-printbtn.stage{background:linear-gradient(135deg,var(--jade),#1FA88A);}
.hz-stageicons{display:flex;align-items:center;margin-top:10px;padding-top:10px;border-top:1px dashed var(--border);overflow-x:auto;}
.hz-stageicon{flex-shrink:0;width:26px;height:26px;border-radius:50%;display:grid;place-items:center;background:var(--surface2);border:1.5px solid var(--border);color:var(--muted);transition:.15s;}
.hz-stageicon.done{background:color-mix(in srgb,var(--jade) 18%,transparent);border-color:var(--jade);color:var(--jade);}
.hz-stageicon.cur{background:var(--jade);border-color:var(--jade);color:#0c0a08;box-shadow:0 0 0 3px color-mix(in srgb,var(--jade) 25%,transparent);}
.hz-stageicon.clickable{cursor:pointer;}
.hz-stageicon.clickable:hover{transform:scale(1.12);border-color:var(--ember);}
.hz-stageicon:disabled{cursor:default;}
.hz-stageline{flex:1;min-width:8px;height:2px;background:var(--border);margin:0 -1px;}
.hz-stageline.done{background:var(--jade);}
.hz-printbtn:hover{filter:brightness(1.06);}
.hz-mrow.isnew{border-color:var(--saffron);box-shadow:0 0 0 1px var(--saffron);}
/* Dish photo preview under the menu form */
.hz-imgprev{display:flex;align-items:center;gap:10px;padding:8px;border-radius:10px;background:var(--surface2);border:1px solid var(--border);}
.hz-imgprev img{width:54px;height:54px;object-fit:cover;border-radius:8px;flex-shrink:0;}
.hz-imgprev span{font-size:11px;color:var(--muted);font-weight:600;}

/* Customer live-tracking card — this had no styling at all. */
.hz-track{background:var(--surface);border:1px solid var(--border);border-radius:18px;padding:18px;box-shadow:0 14px 34px -22px rgba(0,0,0,.5);}
.hz-track-bill{margin-top:18px;padding-top:16px;border-top:1px dashed var(--border);}
.hz-track-bill-h{font-size:12px;font-weight:700;text-transform:uppercase;letter-spacing:.04em;color:var(--muted);margin-bottom:10px;}
.hz-track-items{display:flex;flex-direction:column;gap:6px;margin-bottom:10px;}
.hz-track-item{display:flex;justify-content:space-between;font-size:13px;color:var(--text);}
.hz-track-item span:last-child{font-family:var(--fm);color:var(--muted);}
.hz-track-sums{border-top:1px solid var(--border);padding-top:8px;display:flex;flex-direction:column;gap:5px;}
.hz-track-sumrow{display:flex;justify-content:space-between;font-size:12.5px;color:var(--muted);}
.hz-track-sumrow span:last-child{font-family:var(--fm);}
.hz-track-sumrow.total{font-size:16px;font-weight:800;color:var(--text);margin-top:4px;padding-top:8px;border-top:1px solid var(--border);}
.hz-track-sumrow.total span:last-child{color:var(--ember);}
.hz-pay.bare{display:inline-flex;margin:12px 0 0;}
.hz-track.flash{animation:hzFlash .9s ease;}
.hz-track-hero{display:flex;align-items:flex-start;justify-content:space-between;gap:14px;padding-bottom:14px;border-bottom:1px solid var(--border);margin-bottom:14px;}
.hz-th-q{font-size:12px;color:var(--muted);font-weight:600;}
.hz-th-cur{font-family:var(--fd);font-size:22px;font-weight:800;letter-spacing:-.01em;margin-top:2px;}
.hz-th-r{text-align:right;flex-shrink:0;}
.hz-th-big{font-family:var(--fd);font-size:30px;font-weight:800;line-height:1;color:var(--ember);}
.hz-th-big small{font-size:12px;font-weight:600;color:var(--muted);margin-left:3px;}
.hz-th-pos{font-size:11px;color:var(--muted);margin-top:4px;}
@media(max-width:480px){.hz-track{padding:15px;}.hz-th-cur{font-size:19px;}.hz-th-big{font-size:25px;}}

/* Orders panel on the operations screen — keeps a long list scrollable. */
.hz-orderscard .hz-stack{max-height:620px;overflow-y:auto;padding-right:4px;}
.hz-orderscard .hz-stack::-webkit-scrollbar{width:6px;}
.hz-orderscard .hz-stack::-webkit-scrollbar-thumb{background:var(--border);border-radius:99px;}
@media(max-width:900px){.hz-orderscard .hz-stack{max-height:none;overflow:visible;}}

/* Explicit widths for the two small stock fields (grid already sizes them,
   these keep them sane if the grid ever changes). */
.hz-sf-qty input,.hz-sf-unit input{text-align:center;}

/* ---------------- Inventory layout (fixed alignment) ---------------- */
/* Wide list on the left, narrow purchases panel on the right. */
.hz-invlayout{display:grid;grid-template-columns:minmax(0,1fr) 320px;gap:14px;align-items:start;}
@media(max-width:1000px){.hz-invlayout{grid-template-columns:1fr;}}
.hz-invlayout>.hz-card{min-width:0;}

/* Add / restock form — labelled grid so nothing gets clipped. */
.hz-stockform{display:grid;grid-template-columns:minmax(0,2fr) 80px 90px minmax(0,1.4fr) auto;gap:10px;align-items:end;}
.hz-stockform label{display:flex;flex-direction:column;gap:5px;min-width:0;}
.hz-stockform label>span{font-size:10.5px;font-weight:700;text-transform:uppercase;letter-spacing:.04em;color:var(--muted);}
.hz-stockform input{width:100%;min-width:0;padding:10px 11px;border-radius:10px;border:1px solid var(--border);background:var(--surface);color:var(--text);font-size:13px;font-family:inherit;outline:none;transition:.15s;}
.hz-stockform input:focus{border-color:var(--ember);box-shadow:0 0 0 3px color-mix(in srgb,var(--ember) 16%,transparent);}
.hz-stockform input::placeholder{color:var(--muted);opacity:.65;}
.hz-costin{display:flex;align-items:center;gap:7px;background:var(--surface);border:1px solid var(--border);border-radius:10px;padding-left:11px;min-width:0;}
.hz-costin:focus-within{border-color:var(--ember);box-shadow:0 0 0 3px color-mix(in srgb,var(--ember) 16%,transparent);}
.hz-costin em{font-style:normal;font-size:12px;font-weight:700;color:var(--muted);font-family:var(--fm);flex-shrink:0;}
.hz-costin input{border:none;background:transparent;padding-left:0;box-shadow:none!important;}
.hz-sf-btn{display:inline-flex;align-items:center;justify-content:center;gap:6px;height:39px;padding:0 16px;border-radius:10px;font-size:13px;font-weight:700;color:#0c0a08;white-space:nowrap;background:linear-gradient(135deg,var(--jade),var(--saffron));transition:.15s;}
.hz-sf-btn:hover:not(:disabled){filter:brightness(1.07);}
.hz-sf-btn:disabled{opacity:.45;cursor:not-allowed;}
@media(max-width:820px){
  .hz-stockform{grid-template-columns:minmax(0,1fr) 76px 84px;}
  .hz-sf-cost{grid-column:1 / 3;}
  .hz-sf-btn{grid-column:3 / 4;align-self:end;padding:0 10px;}
}
@media(max-width:520px){
  .hz-stockform{grid-template-columns:1fr 1fr;}
  .hz-sf-item{grid-column:1 / -1;}
  .hz-sf-cost{grid-column:1 / -1;}
  .hz-sf-btn{grid-column:1 / -1;width:100%;height:42px;}
}

/* Stock list — one clear row per item. */
.hz-invgrid{display:flex;flex-direction:column;gap:4px;}
.hz-invrow{display:flex;align-items:center;gap:12px;padding:11px 12px;border-radius:11px;border:1px solid transparent;transition:.15s;}
.hz-invrow:hover{background:var(--surface2);border-color:var(--border);}
.hz-invrow .hz-load-main{min-width:0;flex:1;}
.hz-invrow .hz-load-top{flex-wrap:wrap;gap:7px;}
.hz-invrow .hz-qadd2,.hz-invrow .hz-macts{flex-shrink:0;}
@media(max-width:560px){
  .hz-invrow{flex-wrap:wrap;gap:9px;}
  .hz-invrow .hz-load-main{flex:1 1 100%;order:1;}
  .hz-invrow .hz-stock-ic{order:0;}
  .hz-invrow .hz-qadd2{order:2;margin-left:auto;}
  .hz-invrow .hz-macts{order:3;}
}

/* Purchases side panel */
.hz-buypanel{position:sticky;top:78px;}
@media(max-width:1000px){.hz-buypanel{position:static;}}
.hz-buypanel .hz-buyrow{gap:8px;}
.hz-buypanel .hz-buyitem{font-size:12px;}

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
  /* ============ THERMAL RECEIPT PRINTING ============
     Tuned for the Black Copper BC-86AC (80mm roll, 79.5mm paper,
     ~72mm printable width, auto cutter).

     Two things matter on a roll printer:
     1. The "page" must size itself to the content (auto height), or the
        browser assumes an A4 page and feeds a long trail of blank paper.
     2. Everything must be PURE BLACK. Thermal heads are 1-bit — they cannot
        print grey, so grey text comes out faint, broken or invisible. Every
        muted colour used on screen is forced to #000 below.            */
  @page { size: 80mm auto; margin: 0; }
  html, body { margin:0 !important; padding:0 !important; height:auto !important; background:#fff !important; }
  body * { visibility: hidden !important; }
  .hz-printroot, .hz-printroot * { visibility: visible !important; }
  /* Static flow only — absolute positioning stretches the box to a full
     page height and causes the blank-paper trail. */
  .hz-printroot { position:static !important; inset:auto !important; background:#fff !important; backdrop-filter:none;
                  padding:0 !important; margin:0 !important; display:block; width:auto !important; height:auto !important; }
  .hz-print-toolbar, .hz-print-toolbar * { visibility:hidden !important; display:none !important; }
  .hz-receipts { display:block !important; gap:0 !important; margin:0 !important; padding:0 !important; }

  /* 72mm = the printable width of an 80mm head. Wider than this and the
     right-hand column (prices) gets cut off. */
  .hz-receipt {
    width:72mm !important; max-width:72mm !important; box-sizing:border-box;
    margin:0 !important; padding:2mm 2mm 3mm !important;
    border-radius:0 !important; box-shadow:none !important; opacity:1 !important;
    background:#fff !important; color:#000 !important;
    font-family:"Arial Black","Helvetica Neue",Arial,sans-serif !important;
    font-size:12.5px !important; line-height:1.42 !important;
    font-weight:700 !important;                 /* thin strokes print faint */
    -webkit-font-smoothing:none; text-rendering:geometricPrecision;
    page-break-inside:auto; break-inside:auto;
  }
  /* Force every element to solid black — no greys, no opacity, no shadows. */
  .hz-receipt * { color:#000 !important; opacity:1 !important; text-shadow:none !important; box-shadow:none !important;
                  -webkit-print-color-adjust:exact !important; print-color-adjust:exact !important; }
  .hz-receipt .hz-rc-sub,
  .hz-receipt .hz-rc-row span,
  .hz-receipt .hz-rc-foot { color:#000 !important; font-weight:700 !important; }
  /* Solid separators beat dashed/grey ones on a thermal head. */
  .hz-receipt .hz-rc-hr { border-top:1px solid #000 !important; margin:2mm 0 !important; }
  .hz-receipt .hz-rc-row.total { border-top:2px solid #000 !important; border-bottom:2px solid #000 !important;
                                 font-size:15px !important; font-weight:900 !important; padding:1.5mm 0 !important; }
  .hz-receipt .hz-rc-items tr.head td { border-bottom:1.5px solid #000 !important; font-weight:900 !important; }
  .hz-receipt .hz-rc-title { font-size:17px !important; font-weight:900 !important; letter-spacing:.02em !important; }
  .hz-receipt .hz-rc-title.big { font-size:20px !important; }
  /* Inverted tag (white on black) — needs colour-adjust to survive printing. */
  .hz-receipt .hz-rc-tag { background:#000 !important; color:#fff !important; border-radius:0 !important;
                           font-weight:900 !important; padding:1mm 2mm !important; }
  .hz-receipt .hz-rc-items td.amt { width:22mm !important; }
  .hz-receipt .hz-rc-row b.addr { max-width:42mm !important; }

  /* Only break between copies when BOTH are printed in one job, so the cutter
     separates the kitchen ticket from the customer bill. A single copy gets no
     break at all — that break is what wastes a whole extra receipt of paper. */
  .hz-printroot.show-both .hz-receipt.kitchen { page-break-after:always; break-after:page; }
  .hz-printroot.show-kitchen .hz-receipt.bill { display:none !important; }
  .hz-printroot.show-bill .hz-receipt.kitchen { display:none !important; }
  /* Nothing after the last receipt — stops the extra blank feed. */
  .hz-receipt:last-child { page-break-after:auto !important; break-after:auto !important; margin-bottom:0 !important; }
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
