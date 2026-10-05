const $view = document.getElementById("view");
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const date = (d) => (d ? new Date(d).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" }) : "-");
const money = (v, c = "INR") => {
  try { return new Intl.NumberFormat("en-IN", { style: "currency", currency: c }).format(v); }
  catch { return `${c} ${Number(v).toFixed(2)}`; }
};
const badge = (s) => `<span class="badge ${esc(s)}">${esc(s)}</span>`;
const fullName = (c) => `${c.first_name || ""} ${c.last_name || ""}`.trim() || c.email;
const tagList = (t) => (t ? t.split(",").filter(Boolean) : []);

let token = localStorage.getItem("crm_token");
let me = null;
const isAdmin = () => me && me.role === "admin";

async function api(path, opts = {}) {
  const res = await fetch("/api" + path, {
    method: opts.method || "GET",
    headers: { "Content-Type": "application/json", ...(token ? { Authorization: "Bearer " + token } : {}) },
    body: opts.body ? JSON.stringify(opts.body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (res.status === 401 && !path.startsWith("/auth/login")) { showLogin(); throw new Error("Please sign in"); }
  if (!res.ok) throw new Error(data.error || res.statusText);
  return data;
}

const segBadge = (s) => `<span class="seg ${esc(s)}">${esc(s)}</span>`;

function pager(p, onPage) {
  const id = "pg" + Math.random().toString(36).slice(2, 7);
  setTimeout(() => {
    document.getElementById(id + "p")?.addEventListener("click", () => onPage(p.page - 1));
    document.getElementById(id + "n")?.addEventListener("click", () => onPage(p.page + 1));
  });
  return `<div class="pager"><span class="muted">${p.total} total &middot; page ${p.page} of ${p.pages}</span>
    <button class="secondary" id="${id}p" ${p.page <= 1 ? "disabled" : ""}>Prev</button>
    <button class="secondary" id="${id}n" ${p.page >= p.pages ? "disabled" : ""}>Next</button></div>`;
}

/* Inline SVG bar chart: no chart library needed */
function barChart(rows) {
  const w = 600, h = 160, pad = 24, max = Math.max(...rows.map((r) => r.revenue), 1);
  const bw = (w - pad * 2) / rows.length;
  return `<svg class="chart" viewBox="0 0 ${w} ${h + 22}" role="img" aria-label="Revenue per day, last 14 days">
    ${rows.map((r, i) => {
      const bh = Math.round((r.revenue / max) * h);
      return `<rect x="${pad + i * bw + 3}" y="${h - bh}" width="${bw - 6}" height="${bh}" rx="3" fill="#4f46e5"><title>${esc(r.date)}: ${money(r.revenue)} (${r.orders} orders)</title></rect>
        ${i % 2 === 0 ? `<text x="${pad + i * bw + bw / 2}" y="${h + 15}" font-size="10" text-anchor="middle" fill="#6b7280">${esc(r.date.slice(5))}</text>` : ""}`;
    }).join("")}</svg>`;
}

const statusBars = (counts) => {
  const entries = Object.entries(counts), max = Math.max(...entries.map(([, n]) => n), 1);
  return `<div class="bars">${entries.map(([s, n]) => `<div class="bar-row"><span>${esc(s)}</span><i style="width:${(n / max) * 200}px"></i><b>${n}</b></div>`).join("") || '<p class="muted">No orders yet.</p>'}</div>`;
};

/* ---------- auth ---------- */
function showLogin() {
  token = null; me = null; localStorage.removeItem("crm_token");
  document.getElementById("shell").hidden = true;
  document.getElementById("login").hidden = false;
}
async function boot() {
  if (!token) return showLogin();
  try { me = await api("/auth/me"); } catch { return showLogin(); }
  document.getElementById("login").hidden = true;
  document.getElementById("shell").hidden = false;
  document.getElementById("meName").textContent = me.name;
  document.getElementById("meRole").textContent = me.role;
  document.getElementById("teamNav").hidden = !isAdmin();
  route();
}
document.getElementById("loginBtn").onclick = async () => {
  const err = document.getElementById("loginError");
  err.textContent = "";
  try {
    const r = await api("/auth/login", { method: "POST", body: { email: document.getElementById("loginEmail").value, password: document.getElementById("loginPassword").value } });
    token = r.token; localStorage.setItem("crm_token", token);
    document.getElementById("loginPassword").value = "";
    boot();
  } catch (e) { err.textContent = e.message; }
};
document.getElementById("loginPassword").addEventListener("keydown", (e) => { if (e.key === "Enter") document.getElementById("loginBtn").click(); });
document.getElementById("logout").onclick = (e) => { e.preventDefault(); showLogin(); };

function toast(msg) {
  const t = document.getElementById("toast");
  t.textContent = msg; t.style.display = "block";
  setTimeout(() => (t.style.display = "none"), 2500);
}

const ordersTable = (rows, showCustomer = true) => `
  <table><tr><th>Order</th>${showCustomer ? "<th>Customer</th>" : ""}<th>Date</th><th>Total</th><th>Status</th></tr>
  ${rows.map((o) => `<tr class="click" data-href="#/orders/${o.id}">
    <td>#${o.woocommerce_order_id}</td>${showCustomer ? `<td>${esc(fullName(o))}</td>` : ""}
    <td>${date(o.order_date)}</td><td>${money(o.total, o.currency)}</td><td>${badge(o.status)}</td></tr>`).join("") || `<tr><td colspan="5" class="muted">No orders yet</td></tr>`}
  </table>`;

/* ---------- views ---------- */
async function dashboardView() {
  const d = await api("/dashboard");
  const pc = document.getElementById("triageCount");
  pc.hidden = !d.pendingTriage; pc.textContent = d.pendingTriage;
  $view.innerHTML = `
    <h2>Dashboard</h2>
    <div class="grid stats">
      <div class="card stat"><span class="muted">Customers</span><b>${d.customers}</b></div>
      <div class="card stat"><span class="muted">Orders</span><b>${d.orders}</b></div>
      <div class="card stat"><span class="muted">Revenue</span><b>${money(d.revenue, d.currency)}</b></div>
      <div class="card stat"><span class="muted">Delayed (>${d.delayDays}d)</span><b>${d.delayedOrders.length}</b></div>
      <div class="card stat"><span class="muted">Open tasks</span><b>${d.openTasks}</b></div>
      <div class="card stat"><span class="muted">Awaiting approval</span><b>${d.pendingTriage}</b></div>
    </div>
    <div class="grid two">
      <div class="card"><h3>Revenue, last 14 days</h3>${barChart(d.revenueByDay)}</div>
      <div class="card"><h3>Orders by status</h3>${statusBars(d.statusCounts)}
        <h3 style="margin-top:16px">Customer segments</h3>
        <p>${Object.entries(d.segments).map(([k, v]) => `<a href="#/customers?segment=${esc(k)}">${segBadge(k)}</a> <b>${v}</b>&nbsp;&nbsp;`).join("")}</p></div>
    </div>
    <div class="card"><h3>Recent orders</h3>${ordersTable(d.recentOrders)}</div>
    <div class="grid two">
      <div class="card"><h3>Recent customers</h3>
        <table>${d.recentCustomers.map((c) => `<tr class="click" data-href="#/customers/${c.id}"><td>${esc(fullName(c))}</td><td class="muted">${esc(c.email)}</td></tr>`).join("") || `<tr><td class="muted">No customers yet</td></tr>`}</table></div>
      <div class="card"><h3>Delayed orders (still processing)</h3>
        ${d.delayedOrders.length ? ordersTable(d.delayedOrders) : `<p class="muted">Nothing delayed.</p>`}</div>
    </div>`;
}

async function customersView() {
  const initialSeg = new URLSearchParams((location.hash.split("?")[1]) || "").get("segment") || "";
  $view.innerHTML = `<h2>Customers</h2>
    <div class="toolbar">
      <input id="search" placeholder="Search by name or email..." />
      <select id="segment">${["", "vip", "at-risk", "new", "regular"].map((v) => `<option value="${v}" ${v === initialSeg ? "selected" : ""}>${v ? v : "All segments"}</option>`).join("")}</select>
      <select id="sort"><option value="recent">Newest</option><option value="spent">Top spenders</option><option value="orders">Most orders</option></select>
    </div><div class="card" id="list"></div>`;
  let page = 1;
  const load = async () => {
    const q = new URLSearchParams({ search: document.getElementById("search").value, segment: document.getElementById("segment").value, sort: document.getElementById("sort").value, page, pageSize: 10 });
    const p = await api("/customers?" + q);
    document.getElementById("list").innerHTML = `<table>
      <tr><th>Name</th><th>Email</th><th>Segment</th><th>Orders</th><th>Spent</th><th>Tags</th></tr>
      ${p.items.map((c) => `<tr class="click" data-href="#/customers/${c.id}"><td>${esc(fullName(c))}</td><td>${esc(c.email)}</td><td>${segBadge(c.segment)}</td>
        <td>${c.order_count}</td><td>${money(c.total_spent)}</td><td>${tagList(c.tags).map((t) => `<span class="tag">${esc(t)}</span>`).join("")}</td></tr>`).join("") || `<tr><td colspan="6" class="muted">No customers found</td></tr>`}</table>` +
      pager(p, (n) => { page = n; load(); });
  };
  let timer;
  document.getElementById("search").addEventListener("input", () => { clearTimeout(timer); timer = setTimeout(() => { page = 1; load(); }, 250); });
  ["segment", "sort"].forEach((id) => document.getElementById(id).addEventListener("change", () => { page = 1; load(); }));
  await load();
}

async function customerView(id) {
  const c = await api("/customers/" + id);
  const currency = c.orders[0]?.currency;
  $view.innerHTML = `
    <a class="back" href="#/customers">&larr; Customers</a>
    <h2>${esc(fullName(c))} ${segBadge(c.segment)}</h2>
    <div class="grid two">
      <div class="card"><h3>Profile</h3>
        <p>${esc(c.email)}<br>${esc(c.phone || "no phone")}<br><span class="muted">${esc(c.address || "no address")}</span></p>
        <p><b>${c.order_count}</b> orders &middot; <b>${money(c.total_spent, currency)}</b> spent &middot; last order ${date(c.last_order_date)}</p>
        <div id="tags">${tagList(c.tags).map((t) => `<span class="tag">${esc(t)}</span>`).join("") || '<span class="muted">No tags</span>'}</div>
        <input id="tagsInput" placeholder="tags, comma separated (e.g. vip, at-risk)" value="${esc(c.tags)}" style="margin-top:10px" />
        <button class="secondary" id="saveTags">Save tags</button>
      </div>
      <div class="card ai"><h3>AI assistant</h3>
        <button id="aiSummary">Generate AI summary</button>
        <div id="aiOut" class="muted" style="margin-top:10px">Summary and next best action will appear here.</div>
        <hr style="border:0;border-top:1px solid #ddd6fe;margin:14px 0">
        <b>Triage a customer message</b>
        <textarea id="triageMsg" rows="3" placeholder="Paste what the customer wrote..."></textarea>
        <button id="triageBtn">Run triage agent</button>
      </div>
    </div>
    <div class="card"><h3>Order history</h3>${ordersTable(c.orders, false)}</div>
    <div class="grid two">
      <div class="card"><h3>Send message</h3>
        <input id="msgSubject" placeholder="Subject" />
        <textarea id="msgBody" rows="6" placeholder="Write a message..."></textarea>
        <button id="sendMsg">Send email</button><button class="secondary" id="draftBtn">Draft with AI</button>
        <p class="muted">AI drafts are never sent automatically: review, edit, then send.</p>
        <h3 style="margin-top:18px">Notes</h3>
        <textarea id="noteBody" rows="2" placeholder="Internal note..."></textarea>
        <button class="secondary" id="addNote">Add note</button>
        ${c.notes.map((n) => `<p><span class="muted">${date(n.created_at)}</span><br>${esc(n.note)}</p>`).join("")}
      </div>
      <div class="card"><h3>Communication history</h3><div class="timeline">
        ${c.communications.map((m) => `<div><b>${esc(m.subject || m.type)}</b> ${badge(m.status)}
          <span class="muted">${date(m.created_at)} &middot; ${esc(m.type)}</span><pre>${esc(m.message)}</pre></div>`).join("") || '<p class="muted">No messages yet.</p>'}
      </div></div>
    </div>`;

  const run = (btn, fn) => async () => {
    btn.disabled = true;
    try { await fn(); } catch (e) { toast(e.message); } finally { btn.disabled = false; }
  };
  const $ = (s) => document.getElementById(s);

  $("saveTags").onclick = run($("saveTags"), async () => {
    const tags = $("tagsInput").value.split(",").map((t) => t.trim()).filter(Boolean);
    await api(`/customers/${id}/tags`, { method: "PATCH", body: { tags } });
    toast("Tags saved"); route();
  });
  $("addNote").onclick = run($("addNote"), async () => {
    await api(`/customers/${id}/notes`, { method: "POST", body: { note: $("noteBody").value } });
    route();
  });
  $("sendMsg").onclick = run($("sendMsg"), async () => {
    await api(`/customers/${id}/messages`, { method: "POST", body: { subject: $("msgSubject").value, message: $("msgBody").value } });
    toast("Message sent"); route();
  });
  $("draftBtn").onclick = run($("draftBtn"), async () => {
    const r = await api(`/customers/${id}/draft-reply`, { method: "POST", body: {} });
    $("msgBody").value = r.draft;
    if (!$("msgSubject").value) $("msgSubject").value = "Following up on your order";
    toast(`Draft ready (${r.source}). Review before sending.`);
  });
  $("triageBtn").onclick = run($("triageBtn"), async () => {
    await api("/triage", { method: "POST", body: { message: $("triageMsg").value, customerId: Number(id) } });
    toast("Triage ready: review it in the AI Triage queue"); location.hash = "#/triage";
  });
  $("aiSummary").onclick = run($("aiSummary"), async () => {
    $("aiOut").textContent = "Thinking...";
    const r = await api(`/customers/${id}/ai-summary`, { method: "POST", body: {} });
    $("aiOut").innerHTML = `<p style="color:var(--ink)">${esc(r.summary)}</p><p style="color:var(--ink)"><b>Next best action:</b> ${esc(r.nextBestAction)}</p><span class="muted">source: ${esc(r.source)}</span>`;
  });
}

async function ordersView() {
  const statuses = ["", "processing", "completed", "on-hold", "pending", "cancelled", "refunded", "failed"];
  $view.innerHTML = `<h2>Orders</h2><div class="toolbar"><input id="osearch" placeholder="Search order #, name or email..." />
    <select id="ostatus">${statuses.map((v) => `<option value="${v}">${v || "All statuses"}</option>`).join("")}</select></div><div class="card" id="olist"></div>`;
  let page = 1;
  const load = async () => {
    const q = new URLSearchParams({ search: document.getElementById("osearch").value, status: document.getElementById("ostatus").value, page, pageSize: 10 });
    const p = await api("/orders?" + q);
    document.getElementById("olist").innerHTML = ordersTable(p.items) + pager(p, (n) => { page = n; load(); });
  };
  let timer;
  document.getElementById("osearch").addEventListener("input", () => { clearTimeout(timer); timer = setTimeout(() => { page = 1; load(); }, 250); });
  document.getElementById("ostatus").addEventListener("change", () => { page = 1; load(); });
  await load();
}

async function orderView(id) {
  const o = await api("/orders/" + id);
  $view.innerHTML = `
    <a class="back" href="#/orders">&larr; Orders</a>
    <h2>Order #${o.woocommerce_order_id} ${badge(o.status)}</h2>
    <div class="grid two">
      <div class="card"><h3>Details</h3>
        <p>Customer: <a href="#/customers/${o.customer_id}">${esc(fullName(o))}</a><br>Date: ${date(o.order_date)}<br>Total: <b>${money(o.total, o.currency)}</b></p>
        <table><tr><th>Item</th><th>Qty</th><th>Price</th></tr>
        ${o.items.map((i) => `<tr><td>${esc(i.product_name)}</td><td>${i.quantity}</td><td>${money(i.price, o.currency)}</td></tr>`).join("")}</table></div>
      <div class="card"><h3>Status timeline</h3><div class="timeline">
        ${o.history.map((h) => `<div>${h.from_status ? badge(h.from_status) + " &rarr; " : ""}${badge(h.to_status)} <span class="muted">${date(h.changed_at)}</span></div>`).join("")}
      </div></div>
    </div>`;
}


async function triageView() {
  const items = await api("/triage");
  const pc = document.getElementById("triageCount");
  pc.hidden = !items.length; pc.textContent = items.length;
  $view.innerHTML = `<h2>AI Triage queue</h2>
    <div class="card"><h3>New message</h3>
      <input id="tEmail" placeholder="Customer email (so the agent can look up their orders)" />
      <textarea id="tMsg" rows="3" placeholder="Paste the customer's message..."></textarea>
      <button id="tRun">Run triage agent</button>
      <p class="muted">The agent classifies the message, looks up the customer's orders with tools and drafts a reply. Nothing is sent until you approve.</p></div>
    ${items.map((t) => `<div class="triage-item ${esc(t.urgency)}" data-id="${t.id}">
      <b>${esc(t.category)}</b> &middot; ${esc(t.urgency)} urgency &middot; <span class="muted">${t.email ? esc(t.email) : "unknown customer"} &middot; source: ${esc(t.source)}</span>
      <p><i>"${esc(t.message)}"</i></p><p>${esc(t.summary)}</p>
      <div class="steps">Agent steps: ${t.steps.map((s) => esc(s.tool)).join(" &rarr; ") || "none"}</div>
      <textarea rows="5" class="draft">${esc(t.draft_reply)}</textarea>
      ${t.suggested_task ? `<p class="muted">Will also create task: ${esc(t.suggested_task)}</p>` : ""}
      <button class="approve">Approve &amp; send</button><button class="danger reject">Reject</button></div>`).join("") || '<div class="card muted">Nothing waiting for approval.</div>'}`;
  document.getElementById("tRun").onclick = async (e) => {
    e.target.disabled = true;
    try {
      await api("/triage", { method: "POST", body: { message: document.getElementById("tMsg").value, email: document.getElementById("tEmail").value || undefined } });
      toast("Triage ready"); route();
    } catch (err) { toast(err.message); e.target.disabled = false; }
  };
  $view.querySelectorAll(".triage-item").forEach((el) => {
    const id = el.dataset.id;
    el.querySelector(".approve").onclick = async () => {
      try { const r = await api(`/triage/${id}/approve`, { method: "POST", body: { body: el.querySelector(".draft").value } }); toast(`Approved (email ${r.email})`); route(); } catch (err) { toast(err.message); }
    };
    el.querySelector(".reject").onclick = async () => {
      try { await api(`/triage/${id}/reject`, { method: "POST", body: {} }); route(); } catch (err) { toast(err.message); }
    };
  });
}

async function tasksView() {
  const tasks = await api("/tasks");
  $view.innerHTML = `<h2>Tasks</h2>
    <div class="card"><div class="toolbar"><input id="taskTitle" placeholder="New task..." /><button id="taskAdd">Add</button></div>
    <table><tr><th>Task</th><th>Customer</th><th>Source</th><th></th></tr>
    ${tasks.map((t) => `<tr><td>${esc(t.title)}</td><td>${t.customer_id ? `<a href="#/customers/${t.customer_id}">${esc(fullName(t))}</a>` : "-"}</td><td><span class="tag">${esc(t.source)}</span></td>
      <td><button class="secondary done" data-id="${t.id}">Done</button></td></tr>`).join("") || '<tr><td colspan="4" class="muted">No open tasks.</td></tr>'}</table></div>`;
  document.getElementById("taskAdd").onclick = async () => {
    try { await api("/tasks", { method: "POST", body: { title: document.getElementById("taskTitle").value } }); route(); } catch (err) { toast(err.message); }
  };
  $view.querySelectorAll(".done").forEach((b) => (b.onclick = async () => { await api(`/tasks/${b.dataset.id}/complete`, { method: "POST", body: {} }); route(); }));
}

async function teamView() {
  if (!isAdmin()) { $view.innerHTML = '<div class="card">Admins only.</div>'; return; }
  const users = await api("/auth/users");
  $view.innerHTML = `<h2>Team &amp; Admin</h2>
    <div class="grid two">
      <div class="card"><h3>Automation</h3>
        <button id="syncBtn">Sync orders from WooCommerce</button>
        <button class="secondary" id="followBtn">Run delayed-order follow-ups</button>
        <p class="muted">Sync imports existing customers and orders silently (no emails). Follow-ups email each delayed order once and open a task.</p><div id="adminOut"></div></div>
      <div class="card"><h3>Add staff member</h3>
        <input id="uName" placeholder="Name" /><input id="uEmail" placeholder="Email" /><input id="uPass" type="password" placeholder="Password (8+ chars)" />
        <select id="uRole"><option value="staff">staff</option><option value="admin">admin</option></select> <button id="uAdd">Create user</button></div>
    </div>
    <div class="card"><h3>Users</h3><table><tr><th>Name</th><th>Email</th><th>Role</th></tr>
      ${users.map((u) => `<tr><td>${esc(u.name)}</td><td>${esc(u.email)}</td><td><span class="tag">${esc(u.role)}</span></td></tr>`).join("")}</table></div>`;
  const out = (msg) => (document.getElementById("adminOut").textContent = msg);
  document.getElementById("syncBtn").onclick = async (e) => {
    e.target.disabled = true; out("Syncing...");
    try { const r = await api("/admin/sync/woocommerce", { method: "POST", body: {} }); out(`Fetched ${r.fetched}, imported ${r.imported}, skipped ${r.skipped}.`); } catch (err) { out(err.message); }
    e.target.disabled = false;
  };
  document.getElementById("followBtn").onclick = async () => {
    try { const r = await api("/admin/automation/followups", { method: "POST", body: {} }); out(`Checked ${r.checked}, notified ${r.notified}, skipped ${r.skipped}.`); } catch (err) { out(err.message); }
  };
  document.getElementById("uAdd").onclick = async () => {
    try {
      await api("/auth/users", { method: "POST", body: { name: document.getElementById("uName").value, email: document.getElementById("uEmail").value, password: document.getElementById("uPass").value, role: document.getElementById("uRole").value } });
      toast("User created"); route();
    } catch (err) { toast(err.message); }
  };
}

/* ---------- router ---------- */
async function route() {
  const hash = location.hash || "#/";
  const [, pageRaw, id] = hash.split("?")[0].split("/");
  const page = pageRaw;
  document.querySelectorAll("[data-nav]").forEach((a) => a.classList.toggle("active", a.dataset.nav === (page || "dashboard")));
  try {
    if (!page) await dashboardView();
    else if (page === "customers") await (id ? customerView(id) : customersView());
    else if (page === "orders") await (id ? orderView(id) : ordersView());
    else if (page === "triage") await triageView();
    else if (page === "tasks") await tasksView();
    else if (page === "team") await teamView();
    else $view.innerHTML = "<p>Page not found.</p>";
  } catch (e) {
    $view.innerHTML = `<div class="card"><b>Something went wrong</b><p class="muted">${esc(e.message)}</p></div>`;
  }
}

document.addEventListener("click", (e) => {
  const row = e.target.closest("[data-href]");
  if (row) location.hash = row.dataset.href;
});
window.addEventListener("hashchange", () => { if (me) route(); });
boot();
