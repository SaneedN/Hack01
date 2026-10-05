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

async function api(path, opts = {}) {
  const res = await fetch("/api" + path, {
    method: opts.method || "GET",
    headers: { "Content-Type": "application/json" },
    body: opts.body ? JSON.stringify(opts.body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || res.statusText);
  return data;
}

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
  $view.innerHTML = `
    <h2>Dashboard</h2>
    <div class="grid stats">
      <div class="card stat"><span class="muted">Customers</span><b>${d.customers}</b></div>
      <div class="card stat"><span class="muted">Orders</span><b>${d.orders}</b></div>
      <div class="card stat"><span class="muted">Revenue</span><b>${money(d.revenue, d.currency)}</b></div>
      <div class="card stat"><span class="muted">Delayed (>${d.delayDays}d)</span><b>${d.delayedOrders.length}</b></div>
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
  $view.innerHTML = `<h2>Customers</h2><input id="search" placeholder="Search by name or email..." /><div class="card" id="list"></div>`;
  const load = async (q = "") => {
    const rows = await api("/customers?search=" + encodeURIComponent(q));
    document.getElementById("list").innerHTML = `<table>
      <tr><th>Name</th><th>Email</th><th>Orders</th><th>Spent</th><th>Tags</th></tr>
      ${rows.map((c) => `<tr class="click" data-href="#/customers/${c.id}"><td>${esc(fullName(c))}</td><td>${esc(c.email)}</td>
        <td>${c.order_count}</td><td>${money(c.total_spent)}</td><td>${tagList(c.tags).map((t) => `<span class="tag">${esc(t)}</span>`).join("")}</td></tr>`).join("") || `<tr><td colspan="5" class="muted">No customers found</td></tr>`}</table>`;
  };
  let timer;
  document.getElementById("search").addEventListener("input", (e) => { clearTimeout(timer); timer = setTimeout(() => load(e.target.value), 250); });
  await load();
}

async function customerView(id) {
  const c = await api("/customers/" + id);
  const currency = c.orders[0]?.currency;
  $view.innerHTML = `
    <a class="back" href="#/customers">&larr; Customers</a>
    <h2>${esc(fullName(c))}</h2>
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
  $("aiSummary").onclick = run($("aiSummary"), async () => {
    $("aiOut").textContent = "Thinking...";
    const r = await api(`/customers/${id}/ai-summary`, { method: "POST", body: {} });
    $("aiOut").innerHTML = `<p style="color:var(--ink)">${esc(r.summary)}</p><p style="color:var(--ink)"><b>Next best action:</b> ${esc(r.nextBestAction)}</p><span class="muted">source: ${esc(r.source)}</span>`;
  });
}

async function ordersView() {
  $view.innerHTML = `<h2>Orders</h2><div class="card" id="olist"></div>`;
  document.getElementById("olist").innerHTML = ordersTable(await api("/orders"));
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

/* ---------- router ---------- */
async function route() {
  const hash = location.hash || "#/";
  const [, page, id] = hash.split("/");
  document.querySelectorAll("[data-nav]").forEach((a) => a.classList.toggle("active", a.dataset.nav === (page || "dashboard")));
  try {
    if (!page) await dashboardView();
    else if (page === "customers") await (id ? customerView(id) : customersView());
    else if (page === "orders") await (id ? orderView(id) : ordersView());
    else $view.innerHTML = "<p>Page not found.</p>";
  } catch (e) {
    $view.innerHTML = `<div class="card"><b>Something went wrong</b><p class="muted">${esc(e.message)}</p></div>`;
  }
}

document.addEventListener("click", (e) => {
  const row = e.target.closest("[data-href]");
  if (row) location.hash = row.dataset.href;
});
window.addEventListener("hashchange", route);
route();
