import { test, describe } from "node:test";
import assert from "node:assert/strict";
import * as U from "./units.mjs";

const DAY = 86400000;

describe("Money formatting", () => {
  test("formats PKR with thousands separators", () => {
    assert.equal(U.rs(0), "Rs 0");
    assert.equal(U.rs(1150), "Rs 1,150");
    assert.equal(U.rs(1234567), "Rs 1,234,567");
  });
});

describe("Sales tax rules (I-8 only: 16% cash, 5% card)", () => {
  test("G-9/1 is never taxed", () => {
    assert.equal(U.taxRate("g91", "cod"), 0);
    assert.equal(U.taxRate("g91", "card"), 0);
    assert.equal(U.taxOf("g91", "cod", 10000), 0);
  });
  test("I-8 cash = 16%", () => {
    assert.equal(U.taxRate("i8", "cod"), 0.16);
    assert.equal(U.taxOf("i8", "cod", 1000), 160);
  });
  test("I-8 card = 5%", () => {
    assert.equal(U.taxRate("i8", "card"), 0.05);
    assert.equal(U.taxOf("i8", "card", 1000), 50);
  });
  test("card is always cheaper than cash at I-8", () => {
    for (const amt of [500, 1234, 98765]) {
      assert.ok(U.taxOf("i8", "card", amt) < U.taxOf("i8", "cod", amt));
    }
  });
  test("unknown payment method is treated as cash (safer for the business)", () => {
    assert.equal(U.taxRate("i8", undefined), 0.16);
  });
  test("tax is a whole rupee amount (no fractions on receipts)", () => {
    const t = U.taxOf("i8", "cod", 1333);
    assert.equal(t, Math.round(t));
  });
});

describe("Order totals", () => {
  const order = (items, extra = {}) => ({ items, ...extra });
  test("total = sum of item price x qty", () => {
    assert.equal(U.total(order([{ price: 1150, qty: 2 }, { price: 180, qty: 3 }])), 2840);
  });
  test("total of an empty order is 0", () => {
    assert.equal(U.total(order([])), 0);
  });
  test("grand adds delivery fee and tax", () => {
    const o = order([{ price: 1000, qty: 1 }], { fee: 120, tax: 179 });
    assert.equal(U.grand(o), 1299);
  });
  test("grand works when fee/tax are missing (older orders)", () => {
    assert.equal(U.grand(order([{ price: 500, qty: 2 }])), 1000);
  });
  test("a full I-8 cash delivery adds up correctly", () => {
    const items = [{ price: 1290, qty: 1 }, { price: 760, qty: 1 }];
    const sub = 2050, fee = 120;
    const tax = U.taxOf("i8", "cod", sub + fee);      // 16% of 2170 = 347
    assert.equal(tax, 347);
    assert.equal(U.grand(order(items, { fee, tax })), 2517);
  });
});

describe("Date helpers used by the dashboard", () => {
  test("dayStart zeroes the clock", () => {
    const d = new Date(U.dayStart(Date.now()));
    assert.equal(d.getHours(), 0);
    assert.equal(d.getMinutes(), 0);
    assert.equal(d.getSeconds(), 0);
  });
  test("isToday / isYesterday do not overlap", () => {
    const noon = U.dayStart(Date.now()) + 12 * 3600000;
    const yNoon = noon - DAY;
    assert.ok(U.isToday(noon) && !U.isYesterday(noon));
    assert.ok(U.isYesterday(yNoon) && !U.isToday(yNoon));
  });
  test("boundary: one millisecond before midnight is yesterday", () => {
    const justBefore = U.dayStart(Date.now()) - 1;
    assert.ok(U.isYesterday(justBefore));
    assert.ok(!U.isToday(justBefore));
  });
  test("isLast7 covers today and the previous 6 days, not the 8th", () => {
    assert.ok(U.isLast7(Date.now()));
    assert.ok(U.isLast7(U.dayStart(Date.now()) - 6 * DAY));
    assert.ok(!U.isLast7(U.dayStart(Date.now()) - 7 * DAY - 1));
  });
  test("this month / this year", () => {
    assert.ok(U.isThisMonth(Date.now()));
    assert.ok(U.isThisYear(Date.now()));
    assert.ok(!U.isThisYear(new Date("2001-05-05").getTime()));
  });
  test("monthKey format is YYYY-MM and zero-padded", () => {
    assert.equal(U.monthKey(new Date("2026-03-09")), "2026-03");
    assert.equal(U.monthKey(new Date("2026-11-30")), "2026-11");
  });
  test("monthsBetween is inclusive and ordered", () => {
    const a = new Date("2026-01-15").getTime(), b = new Date("2026-04-02").getTime();
    assert.deepEqual(U.monthsBetween(a, b), ["2026-01", "2026-02", "2026-03", "2026-04"]);
  });
  test("monthsBetween handles a single month and a year boundary", () => {
    const one = new Date("2026-06-10").getTime();
    assert.deepEqual(U.monthsBetween(one, one), ["2026-06"]);
    const dec = new Date("2025-12-01").getTime(), jan = new Date("2026-01-20").getTime();
    assert.deepEqual(U.monthsBetween(dec, jan), ["2025-12", "2026-01"]);
  });
});

describe("Unique id generation (the duplicate-staff bug)", () => {
  test("returns a fresh id above every existing one", () => {
    const list = [{ id: "u1" }, { id: "u12" }, { id: "u9" }];
    assert.equal(U.nextId(list, "u"), "u13");
  });
  test("never collides with seeded ids", () => {
    let list = [{ id: "u12" }, { id: "u13" }];
    for (let i = 0; i < 50; i++) {
      const id = U.nextId(list, "u");
      assert.ok(!list.some((x) => x.id === id), `collision on ${id}`);
      list = [...list, { id }];
    }
  });
  test("works on an empty list and ignores malformed ids", () => {
    assert.equal(U.nextId([], "m"), "m1");
    assert.equal(U.nextId([{ id: "weird" }, { id: null }], "m"), "m1");
  });
});

describe("PIN strength rules", () => {
  test("rejects short PINs", () => assert.ok(U.pinProblem("12")));
  test("rejects well-known weak PINs", () => {
    for (const p of ["1234", "0000", "1111", "9999", "123456"]) {
      assert.ok(U.pinProblem(p), `${p} should be rejected`);
    }
  });
  test("rejects repeated digits", () => assert.ok(U.pinProblem("777777")));
  test("accepts a strong PIN", () => {
    assert.equal(U.pinProblem("483927"), null);
    assert.equal(U.pinProblem("5837"), null);
  });
  test("handles empty / undefined safely", () => {
    assert.ok(U.pinProblem(""));
    assert.ok(U.pinProblem(undefined));
  });
});

describe("Menu availability per branch", () => {
  const menu = [
    { id: "m1", name: "Chow Mein", available: true, branches: ["g91", "i8"] },
    { id: "m2", name: "G9 Special", available: true, branches: ["g91"] },
    { id: "m3", name: "Hidden", available: false, branches: ["g91", "i8"] },
  ];
  test("shows only items sold at that branch", () => {
    const g9 = U.menuForBranch(menu, "g91").map((m) => m.name);
    const i8 = U.menuForBranch(menu, "i8").map((m) => m.name);
    assert.deepEqual(g9, ["Chow Mein", "G9 Special"]);
    assert.deepEqual(i8, ["Chow Mein"]);
  });
  test("hidden (unavailable) items are never offered", () => {
    assert.ok(!U.menuForBranch(menu, "g91").some((m) => m.name === "Hidden"));
  });
});

describe("Payroll helpers", () => {
  test("advTotal sums a staff member's advances", () => {
    assert.equal(U.advTotal({ advances: [{ amount: 10000 }, { amount: 5000 }] }), 15000);
    assert.equal(U.advTotal({ advances: [] }), 0);
    assert.equal(U.advTotal({}), 0);
  });
  test("paidMonths reflects recorded payments", () => {
    const u = { payments: [{ month: "2026-05" }, { month: "2026-06" }] };
    const set = U.paidMonths(u);
    assert.ok(set.has("2026-05") && set.has("2026-06"));
    assert.ok(!set.has("2026-07"));
  });
  test("paidMonths is empty for a brand-new employee", () => {
    assert.equal(U.paidMonths({}).size, 0);
  });
});

describe("ETA estimation", () => {
  test("shrinks as the order progresses", () => {
    const items = [{ qty: 2 }];
    const eNew = U.etaMins({ status: "new", items, type: "dinein" });
    const ePrep = U.etaMins({ status: "preparing", items, type: "dinein" });
    const eReady = U.etaMins({ status: "ready", items, type: "dinein" });
    assert.ok(eNew >= ePrep && ePrep >= eReady);
  });
  test("delivery takes longer than dine-in", () => {
    const items = [{ qty: 1 }];
    assert.ok(U.etaMins({ status: "new", items, type: "delivery" }) >
              U.etaMins({ status: "new", items, type: "dinein" }));
  });
  test("never returns a negative time", () => {
    for (const s of U.STAGES) {
      assert.ok(U.etaMins({ status: s, items: [{ qty: 1 }], type: "dinein" }) >= 0);
    }
  });
});

describe("Configuration sanity", () => {
  test("both branches exist with names and addresses", () => {
    assert.equal(U.BRANCHES.length, 2);
    for (const b of U.BRANCHES) { assert.ok(b.id && b.name && b.addr); }
  });
  test("branchName resolves ids and tolerates unknown ones", () => {
    assert.equal(U.branchName("g91"), "G-9/1");
    assert.equal(U.branchName("i8"), "I-8 Markaz");
    assert.ok(typeof U.branchName("nope") === "string");
  });
  test("every role has a label, icon and colour", () => {
    for (const [role, meta] of Object.entries(U.ROLE_META)) {
      assert.ok(meta.label, `${role} label`);
      assert.ok(meta.icon, `${role} icon`);
      assert.match(meta.color, /^#[0-9A-Fa-f]{6}$/, `${role} colour`);
    }
  });
  test("kitchen staff are payroll-only", () => {
    assert.ok(U.NO_LOGIN_ROLES.includes("kitchen"));
    assert.ok(!U.NO_LOGIN_ROLES.includes("waiter"));
  });
  test("the taxed branch actually exists", () => {
    assert.ok(U.BRANCHES.some((b) => b.id === U.TAX_BRANCH));
  });
  test("staff URL paths all start with a slash and are lowercase", () => {
    for (const p of U.STAFF_PATHS) {
      assert.match(p, /^\/[a-z]+$/, `${p} should be a simple lowercase path`);
    }
  });
  test("order stages are in a sensible order", () => {
    assert.deepEqual(U.STAGES, ["new", "preparing", "ready", "completed"]);
  });
});

describe("Order type metadata", () => {
  test("each order type has a label and icon", () => {
    for (const t of ["dinein", "carhop", "takeaway", "delivery"]) {
      const m = U.typeMeta({ type: t });
      assert.ok(m.label, `${t} label`);
      assert.ok(m.icon, `${t} icon`);
    }
  });
});

describe("Relative time labels", () => {
  test("recent is 'just now', older uses minutes/hours", () => {
    assert.equal(U.ago(Date.now()), "just now");
    assert.match(U.ago(Date.now() - 5 * 60000), /m ago/);
    assert.match(U.ago(Date.now() - 3 * 3600000), /h ago/);
  });
});

describe("Safe confirm wrapper", () => {
  test("does not throw when window is unavailable", () => {
    assert.doesNotThrow(() => U.askConfirm("delete?"));
  });
});
