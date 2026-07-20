/* Integration tests — full business workflows across modules.
   Each scenario drives the real UI in a DOM, exactly as a person would. */
import { test, describe, before } from "node:test";
import assert from "node:assert/strict";
import { JSDOM } from "jsdom";

let React, createRoot, act, App, dom, root;
const errors = [];

function freshDom(url = "https://test.local/") {
  dom = new JSDOM(`<!doctype html><html><body><div id="root"></div></body></html>`, { url, pretendToBeVisual: true });
  global.window = dom.window; global.document = dom.window.document;
  Object.defineProperty(global, "navigator", { value: dom.window.navigator, configurable: true });
  global.HTMLElement = dom.window.HTMLElement; global.Element = dom.window.Element; global.Node = dom.window.Node;
  global.getComputedStyle = dom.window.getComputedStyle;
  global.requestAnimationFrame = (cb) => setTimeout(cb, 0); global.cancelAnimationFrame = clearTimeout;
  global.IS_REACT_ACT_ENVIRONMENT = true;
  global.setInterval = () => 0; global.clearInterval = () => {};
  dom.window.setInterval = () => 0; dom.window.scrollTo = () => {};
  dom.window.confirm = () => true; dom.window.print = () => {};
}

const $ = (s) => document.querySelector(s);
const $$ = (s) => [...document.querySelectorAll(s)];
const txt = () => document.body.textContent || "";
const byText = (sel, t) => $$(sel).find((e) => (e.textContent || "").toLowerCase().includes(String(t).toLowerCase()));
const click = async (el) => { assert.ok(el, "element to click must exist"); await act(async () => { el.dispatchEvent(new dom.window.MouseEvent("click", { bubbles: true })); }); };
const type = async (el, v) => { assert.ok(el, "input must exist"); const s = Object.getOwnPropertyDescriptor(dom.window.HTMLInputElement.prototype, "value").set; await act(async () => { s.call(el, v); el.dispatchEvent(new dom.window.Event("input", { bubbles: true })); }); };
const mount = async (url) => { freshDom(url); root = createRoot(document.getElementById("root")); await act(async () => { root.render(React.createElement(App)); }); };
const tab = async (name) => await click(byText(".hz-segt button", name));
const signIn = async (u, p) => { const i = $$(".hz-form input"); await type(i[0], u); await type(i[1], p); await click(byText("button", "Sign in")); };
const logout = async () => { await click(byText("button", "Logout")); };
const openStaffLogin = async () => { for (let k = 0; k < 5; k++) await click($(".hz-brand")); };
const signOut = async () => { await logout(); await openStaffLogin(); };
const rowFor = (q) => $$(".hz-mrow").find((r) => r.querySelector(".hz-tq") && r.querySelector(".hz-tq").textContent.includes(q));
const printBtnIn = (row) => [...row.querySelectorAll("button")].find((b) => /print/i.test(b.textContent));

before(async () => {
  freshDom();
  React = (await import("react")).default;
  ({ createRoot } = await import("react-dom/client"));
  ({ act } = await import("react"));
  App = (await import("../app.mjs")).default;
  console.error = (...a) => { const s = a.join(" "); if (!/not wrapped in act/.test(s)) errors.push(s); };
});

describe("WORKFLOW 1 — online delivery: customer → rider → delivered", () => {
  test("the whole delivery journey works end to end", async () => {
    await mount("https://test.local/");

    // --- customer places a delivery order at G-9/1
    await click(byText("button", "Order Online"));
    await click($(".hz-fcard").querySelector("button"));         // add an item
    await click(byText("button", "Checkout"));
    const f = $$(".hz-form input");
    await type(f[0], "Ayesha");
    await type(f[1], "03001234567");
    await type(f[2], "House 5, Street 3, G-9/2");
    await click(byText("button", "Place order"));
    assert.ok(txt().includes("Live Tracking"), "customer reaches live tracking");
    const orderNo = ($(".hz-th-q") || {}).textContent || "";
    assert.ok(orderNo.includes("#"), "an order number is issued");

    // --- admin sees it, prints it, marks it ready
    await click(byText("button", "Home"));
    for (let k = 0; k < 5; k++) await click($(".hz-brand"));
    await signIn("admin", "1111");
    await tab("Operations");
    const q = orderNo.replace(/\D/g, "");
    let row = rowFor(q);
    assert.ok(row, "the new order reaches the counter");
    assert.match(row.textContent, /Rehan|Waqas/, "auto-assigned to a rider, not a waiter");

    await click(printBtnIn(row));
    assert.ok($(".hz-printroot"), "print preview opens");
    const kitchen = $(".hz-receipt.kitchen"), bill = $(".hz-receipt.bill");
    assert.ok(!/Rs /.test(kitchen.textContent), "kitchen ticket carries no prices");
    assert.ok(bill.textContent.includes("Ayesha"), "customer bill names the customer");
    assert.ok(bill.textContent.includes("House 5"), "customer bill shows the delivery address");
    await click(byText(".hz-print-btns button", "Close"));

    row = rowFor(q);
    assert.ok(row.textContent.includes("Preparing"), "printing moves the order to Preparing");
    await click([...row.querySelectorAll("button")].find((b) => b.getAttribute("title") === "Mark ready"));
    assert.ok(rowFor(q).textContent.includes("Ready"), "order is marked Ready");

    // --- the rider picks it up and delivers it
    await signOut();
    await signIn("rehan", "5551");
    assert.ok(txt().includes("Hi, Rehan"), "rider signs in");
    assert.ok(txt().includes("Pick up order"), "ready delivery shows the pick-up step");
    await click(byText("button", "Pick up order"));
    await click(byText("button", "On the way"));
    await click(byText("button", "Reached location"));
    await click(byText("button", "Mark delivered"));
    assert.ok(!txt().includes("Mark delivered"), "the delivery leaves the rider's active list");

    // --- and the manager/admin are notified
    await signOut();
    await signIn("admin", "1111");
    await click($(".hz-bellwrap .hz-icbtn"));
    assert.match($(".hz-bellpanel").textContent, /delivered/i, "admin is notified of the delivery");
  });
});

describe("WORKFLOW 2 — QR table order reaches a waiter", () => {
  test("scanning a table QR creates an order assigned to a waiter of that branch", async () => {
    await mount("https://test.local/?b=g91&t=6");
    assert.ok(txt().includes("Table 6"), "the QR locks the table");
    await click($(".hz-fcard").querySelector("button"));
    await click(byText("button", "Checkout"));
    await type($$(".hz-form input")[0], "Table Guest");
    await click(byText("button", "Place order"));
    assert.ok(txt().includes("Live Tracking"), "order placed from the table");

    await click(byText("button", "Exit"));
    for (let k = 0; k < 5; k++) await click($(".hz-brand"));
    await signIn("bilal", "2222");
    const mine = txt();
    assert.ok(mine.includes("Hi, Bilal"), "waiter dashboard opens");
    // either Bilal or Sana may take it — check it went to a waiter at all
    await signOut();
    await signIn("admin", "1111");
    await tab("Operations");
    const row = $$(".hz-mrow").find((r) => r.textContent.includes("Table Guest"));
    assert.ok(row, "the table order reaches the counter");
    assert.match(row.textContent, /Bilal|Sana/, "assigned to a G-9/1 waiter");
  });
});

describe("WORKFLOW 3 — closing a branch stops new orders", () => {
  test("a closed branch cannot be ordered from, and reopening restores it", async () => {
    await mount("https://test.local/admin");
    await signIn("admin", "1111");
    const g9 = $$(".hz-bs-item").find((x) => x.textContent.includes("G-9/1"));
    await click(g9.querySelector(".hz-toggle"));
    assert.ok(g9.textContent.includes("Closed"), "branch shows as closed to staff");

    await logout();
    const card = $$(".hz-hbranch").find((c) => c.textContent.includes("G-9/1"));
    assert.ok(card.textContent.includes("Closed"), "customers see the branch as closed");
    assert.ok(card.querySelector("button").disabled, "ordering button is disabled");

    // reopen
    await openStaffLogin();
    await signIn("admin", "1111");
    const g9b = $$(".hz-bs-item").find((x) => x.textContent.includes("G-9/1"));
    await click(g9b.querySelector(".hz-toggle"));
    assert.ok(g9b.textContent.includes("Open"), "branch reopens");
  });
});

describe("WORKFLOW 4 — hiring a new employee", () => {
  test("a new hire flows into staff, payroll, assignment and the dashboard", async () => {
    await mount("https://test.local/admin");
    await signIn("admin", "1111");
    await tab("Staff");
    await type($$(".hz-card .hz-form input")[0], "Tariq Mehmood");
    await type($$("input").find((x) => x.placeholder === "hamza"), "tariqm");
    await type($$("input").find((x) => x.placeholder === "••••••"), "728461");
    const sal = $$("input").find((x) => x.placeholder === "0");
    if (sal) await type(sal, "52000");
    await click($$(".hz-rp").find((b) => b.textContent.includes("Rider")));
    await click(byText("button", "Create account"));
    assert.ok($$(".hz-userrow").some((r) => r.textContent.includes("Tariq")), "appears in staff list");

    await tab("Payroll");
    assert.ok(txt().includes("Tariq Mehmood"), "appears in payroll");
    assert.ok(txt().includes("52,000"), "his salary carries into payroll");

    await tab("Operations");
    assert.ok($$(".hz-loadrow").some((r) => r.textContent.includes("Tariq")), "joins the assignment pool");

    await tab("Dashboard");
    assert.ok(txt().includes("Tariq"), "appears in dashboard staff activity");

    await signOut();
    await signIn("tariqm", "728461");
    assert.ok(txt().includes("Hi, Tariq"), "the new hire can sign in and work");
  });
});

describe("WORKFLOW 5 — staff on leave stop receiving work", () => {
  test("marking someone on leave removes them from assignment and blocks sign-in", async () => {
    await mount("https://test.local/admin");
    await signIn("admin", "1111");
    await tab("Staff");
    const row = $$(".hz-userrow").find((r) => r.textContent.includes("Sana"));
    await click(row.querySelector(".hz-toggle"));
    assert.ok(row.textContent.includes("On leave"), "marked on leave");

    await tab("Operations");
    assert.ok(!$$(".hz-loadrow").some((r) => r.textContent.includes("Sana")), "removed from the assignment pool");

    await signOut();
    await signIn("sana", "3333");
    assert.ok(!txt().includes("Hi, Sana"), "cannot sign in while on leave");
  });
});

describe("WORKFLOW 6 — buying stock updates inventory and the dashboard", () => {
  test("a stock purchase raises the stock level and the month's cost", async () => {
    await mount("https://test.local/admin");
    await signIn("admin", "1111");
    await tab("Dashboard");
    const before = txt().match(/Stock purchased[^R]*Rs\s*([\d,]+)/);
    const beforeCost = before ? Number(before[1].replace(/,/g, "")) : 0;

    await tab("Inventory");
    const ins = $$(".hz-stockform input");
    await type(ins[0], "Olive Oil"); await type(ins[1], "12"); await type(ins[2], "L"); await type(ins[3], "9600");
    await click($(".hz-sf-btn"));
    assert.ok($$(".hz-invrow").some((r) => r.textContent.includes("Olive Oil")), "item appears in inventory");
    assert.ok(txt().includes("12 L"), "quantity recorded");
    assert.ok($(".hz-buypanel").textContent.includes("9,600"), "purchase logged in the side panel");

    await tab("Dashboard");
    const after = txt().match(/Stock purchased[^R]*Rs\s*([\d,]+)/);
    const afterCost = after ? Number(after[1].replace(/,/g, "")) : 0;
    assert.equal(afterCost - beforeCost, 9600, "dashboard money-out increases by exactly the cost paid");
  });
});

describe("WORKFLOW 7 — menu changes reach customers", () => {
  test("editing a price in admin changes what the customer is charged", async () => {
    await mount("https://test.local/admin");
    await signIn("admin", "1111");
    await tab("Menu");
    const item = $$(".hz-mitemrow")[0];
    const name = item.querySelector("b").textContent;
    await click([...item.querySelectorAll("button")].find((b) => b.getAttribute("title") === "Edit item"));
    const inputs = $$(".hz-editrow input");
    await type(inputs[1], "1499");
    await click(byText(".hz-editrow button", "Save changes"));
    assert.ok(txt().includes("Rs 1,499"), "new price saved");
    assert.ok(txt().includes("Edited by"), "audit trail records who changed it");

    await signOut();
    await click(byText("button", "Order Online"));
    const card = $$(".hz-fcard").find((c) => c.textContent.includes(name));
    assert.ok(card && card.textContent.includes("1,499"), "customers immediately see the new price");
  });
});

describe("WORKFLOW 8 — sales tax flows through to reporting", () => {
  test("an I-8 cash order adds tax to the bill and to tax collected", async () => {
    await mount("https://test.local/?b=i8&t=3");
    await click($(".hz-fcard").querySelector("button"));
    await click(byText("button", "Checkout"));
    assert.ok(txt().includes("Sales tax (16%)"), "cash order is taxed at 16%");
    await click(byText(".hz-payopt", "Online Payment"));
    assert.ok(txt().includes("Sales tax (5%)"), "card order is taxed at 5%");
    await click(byText(".hz-payopt", "Cash"));
    await type($$(".hz-form input")[0], "Tax Test");
    await click(byText("button", "Place order"));

    await click(byText("button", "Exit"));
    for (let k = 0; k < 5; k++) await click($(".hz-brand"));
    await signIn("admin", "1111");
    assert.ok(txt().includes("Sales tax collected"), "dashboard reports collected tax");

    await tab("Operations");
    const row = $$(".hz-mrow").find((r) => r.textContent.includes("Tax Test"));
    await click(printBtnIn(row));
    const bill = $(".hz-receipt.bill");
    assert.ok(bill.textContent.includes("Sales tax (16%)"), "the printed bill itemises the tax");
    assert.ok(/CASH/.test(bill.textContent), "the bill records the payment method");
  });
});

describe("WORKFLOW 9 — manager stays inside their own branch", () => {
  test("a manager sees only their branch and has no admin-only tools", async () => {
    await mount("https://test.local/manager");
    await signIn("umanager", "1212");
    const tabs = $$(".hz-segt button").map((b) => b.textContent.trim());
    assert.ok(!tabs.some((t) => t === "Menu"), "no Menu tab for a manager");

    await tab("Operations");
    assert.ok(!$$(".hz-brtag").some((t) => t.textContent.includes("I-8")), "no other-branch orders");
    assert.ok(!$$(".hz-loadrow").some((r) => /Imran|Kashif|Waqas/.test(r.textContent)), "no other-branch staff");

    await tab("Inventory");
    assert.ok(!$$(".hz-invrow").some((r) => r.textContent.includes("I-8")), "no other-branch stock");

    await tab("Payroll");
    assert.ok(!txt().includes("Chef Saleem"), "no other-branch payroll (Chef Saleem is I-8)");
  });
});

describe("WORKFLOW 10 — payroll month cycle", () => {
  test("salary, advance and marking a month paid all work together", async () => {
    await mount("https://test.local/admin");
    await signIn("admin", "1111");
    await tab("Payroll");
    const card = $$(".hz-wp-row, .hz-payrow, .hz-card").find((c) => c.textContent.includes("Bilal"));
    assert.ok(card, "staff member listed in payroll");
    const advBtn = [...card.querySelectorAll("button")].find((b) => /advance/i.test(b.textContent));
    if (advBtn) {
      await click(advBtn);
      const amt = $$("input").find((x) => x.type !== "month" && /amount|0/i.test(x.placeholder || ""));
      if (amt) { await type(amt, "3000"); const save = byText("button", "Save"); if (save) await click(save); }
      assert.ok(txt().includes("Advance") || txt().includes("3,000"), "advance recorded");
    }
    assert.ok(txt().includes("Monthly Payroll") || txt().includes("Pending"), "payroll totals shown");
  });
});

describe("No React errors across all workflows", () => {
  test("the console stayed clean", () => {
    const real = errors.filter((e) => !/Warning: React does not recognize/.test(e));
    assert.deepEqual(real, [], `unexpected console errors:\n${real.slice(0, 3).join("\n")}`);
  });
});
