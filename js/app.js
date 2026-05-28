// State
const state = {
  profile: null,        // { firstName, lastName, idPerson, email, jahreskurs }
  deviceId: null,       // automatisch generierte ID pro Browser
  view: "book",         // book | list | edit
  cart: {},             // { materialId: qty }
  bookings: [],         // alle Buchungen vom Server
};

const LS = {
  profile: "ma.profile.v1",
  deviceId: "ma.deviceId.v1",
};

// Boot
document.addEventListener("DOMContentLoaded", () => {
  loadLocal();
  ensureDeviceId();
  document.getElementById("settings-btn").addEventListener("click", openSettings);
  document.querySelectorAll(".tab").forEach(t => {
    t.addEventListener("click", () => switchView(t.dataset.view));
  });
  if (!state.profile) {
    renderProfile(true);
  } else {
    showApp();
    renderCurrentView();
    refreshBookings();
  }
});

function loadLocal() {
  try {
    const p = localStorage.getItem(LS.profile);
    if (p) state.profile = JSON.parse(p);
    const d = localStorage.getItem(LS.deviceId);
    if (d) state.deviceId = d;
  } catch {}
}

function currentActor() {
  if (!state.profile) return { deviceId: state.deviceId || null };
  return {
    deviceId: state.deviceId,
    firstName: state.profile.firstName,
    lastName: state.profile.lastName,
    idPerson: state.profile.idPerson,
    email: state.profile.email,
  };
}

async function exportAuditLog() {
  try {
    const data = await GH.loadAudit();
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `audit-log-${new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-")}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    toast(`${(data.entries || []).length} Audit-Einträge exportiert`, "success");
    return data;
  } catch (e) {
    console.error(e);
    toast("Audit-Log Export fehlgeschlagen: " + e.message, "error");
  }
}
window.exportAuditLog = exportAuditLog;
window.loadAuditLog = () => GH.loadAudit();

function ensureDeviceId() {
  if (state.deviceId) return;
  const id = (crypto.randomUUID && crypto.randomUUID()) ||
    (Date.now().toString(36) + Math.random().toString(36).slice(2, 12));
  localStorage.setItem(LS.deviceId, id);
  state.deviceId = id;
}

function saveProfile(p) {
  state.profile = p;
  localStorage.setItem(LS.profile, JSON.stringify(p));
}

function show(el, displayValue) {
  if (typeof el === "string") el = document.getElementById(el);
  if (!el) return;
  el.hidden = false;
  el.style.display = displayValue || "";
}
function hide(el) {
  if (typeof el === "string") el = document.getElementById(el);
  if (!el) return;
  el.hidden = true;
  el.style.display = "none";
}

function showApp() {
  show("tabs", "flex");
}

function switchView(v) {
  state.view = v;
  document.querySelectorAll(".tab").forEach(t => {
    t.classList.toggle("active", t.dataset.view === v);
  });
  renderCurrentView();
}

function renderCurrentView() {
  if (state.view === "book") renderBook();
  else if (state.view === "list") renderList();
  else if (state.view === "edit") renderEdit();
}

// Toast
let toastTimer;
function toast(msg, kind) {
  const el = document.getElementById("toast");
  el.textContent = msg;
  el.className = "toast" + (kind ? " " + kind : "");
  show(el, "block");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { hide(el); }, 3000);
}

// Modal
function modal({ title, body, okText = "OK", cancelText = "Abbrechen", onOk }) {
  return new Promise((resolve) => {
    const m = document.getElementById("modal");
    document.getElementById("modal-title").textContent = title;
    const b = document.getElementById("modal-body");
    b.innerHTML = "";
    if (typeof body === "string") b.innerHTML = body;
    else if (body instanceof Node) b.appendChild(body);
    const okBtn = document.getElementById("modal-ok");
    const cancelBtn = document.getElementById("modal-cancel");
    okBtn.textContent = okText;
    cancelBtn.textContent = cancelText;
    show(m, "flex");
    const close = (val) => { hide(m); okBtn.onclick = null; cancelBtn.onclick = null; resolve(val); };
    okBtn.onclick = async () => {
      if (onOk) {
        const r = await onOk(b);
        if (r === false) return;
      }
      close(true);
    };
    cancelBtn.onclick = () => close(false);
  });
}

// ================= Profile =================
function renderProfile(initial) {
  const main = document.getElementById("main");
  const p = state.profile || {};
  document.getElementById("page-title").textContent = initial ? "Willkommen" : "Profil";
  main.innerHTML = `
    <div class="card">
      <h2>${initial ? "Studenten-Daten" : "Profil bearbeiten"}</h2>
      <p class="muted">Diese Angaben werden mit jeder Buchung gespeichert.</p>
      <label class="field"><span>Vorname *</span><input id="f-first" type="text" value="${esc(p.firstName || "")}" autocomplete="given-name" /></label>
      <label class="field"><span>Nachname *</span><input id="f-last" type="text" value="${esc(p.lastName || "")}" autocomplete="family-name" /></label>
      <label class="field"><span>ID-Person *</span><input id="f-id" type="text" value="${esc(p.idPerson || "")}" inputmode="numeric" /></label>
      <label class="field"><span>E-Mail *</span><input id="f-email" type="email" value="${esc(p.email || "")}" autocomplete="email" /></label>
      <label class="field"><span>Jahreskurs *</span><input id="f-kurs" type="text" value="${esc(p.jahreskurs || "")}" placeholder="z.B. JK2 2025/26" /></label>
      <button id="save-profile" class="btn primary block">Speichern</button>
    </div>
  `;
  document.getElementById("save-profile").onclick = () => {
    const data = {
      firstName: val("f-first"),
      lastName: val("f-last"),
      idPerson: val("f-id"),
      email: val("f-email"),
      jahreskurs: val("f-kurs"),
    };
    for (const k of Object.keys(data)) {
      if (!data[k]) { toast("Bitte alle Felder ausfüllen", "error"); return; }
    }
    if (!/^\S+@\S+\.\S+$/.test(data.email)) { toast("Ungültige E-Mail", "error"); return; }
    saveProfile(data);
    toast("Profil gespeichert", "success");
    showApp();
    switchView("book");
    refreshBookings();
  };
}

// ================= Settings =================
async function openSettings() {
  const wrap = document.createElement("div");
  wrap.innerHTML = `
    <p class="muted" style="margin-top:0">Dein Gerät hat eine automatisch erzeugte ID. Buchungen von diesem Gerät kannst du bearbeiten.</p>
    <div class="hint">Geräte-ID: <code>${esc(state.deviceId || "—")}</code></div>
    <div class="btn-row" style="flex-direction:column">
      <button id="s-edit-profile" class="btn block">Profil bearbeiten</button>
      <button id="s-export-audit" class="btn block">Audit-Log exportieren</button>
      <button id="s-logout" class="btn danger block">Gerät zurücksetzen und mit neuer ID verknüpfen</button>
    </div>
    <p class="muted" style="font-size:12px;margin:8px 0 0">Bereits erfasste Buchungen bleiben erhalten, können jedoch nicht mehr angepasst werden.</p>
  `;
  wrap.querySelector("#s-edit-profile").onclick = () => {
    hide("modal");
    renderProfile(false);
  };
  wrap.querySelector("#s-export-audit").onclick = () => {
    exportAuditLog();
  };
  wrap.querySelector("#s-logout").onclick = async () => {
    if (confirm("Gerät zurücksetzen und mit neuer ID verknüpfen? Bereits erfasste Buchungen bleiben erhalten, können jedoch nicht mehr angepasst werden.")) {
      localStorage.removeItem(LS.profile);
      localStorage.removeItem(LS.deviceId);
      state.profile = null;
      state.deviceId = null;
      hide("modal");
      hide("tabs");
      renderProfile(true);
    }
  };
  await modal({
    title: "Einstellungen",
    body: wrap,
    okText: "Schliessen",
    cancelText: "Abbrechen",
  });
}

// ================= Book =================
function renderBook() {
  document.getElementById("page-title").textContent = "Buchen";
  const main = document.getElementById("main");
  const groupsHtml = MATERIALS.map((g, gi) => `
    <details class="material-group" ${gi === 0 ? "open" : ""}>
      <summary>${esc(g.group)}</summary>
      ${g.items.map(it => renderMaterialRow(it)).join("")}
    </details>
  `).join("");
  const warnHtml = GH.hasToken() ? "" : `<div class="hint" style="border-color:var(--danger); color:var(--danger)">Buchungs-Token nicht konfiguriert. Bitte Repository-Secret <code>MA_GITHUB_TOKEN</code> setzen und Pages neu deployen.</div>`;
  main.innerHTML = `
    <div class="card">
      <h2>Eingeloggt als ${esc(state.profile.firstName)} ${esc(state.profile.lastName)}</h2>
      <p class="muted">Wähle Materialien und Mengen. Mehrfachauswahl möglich.</p>
      <button id="guest-btn" class="btn block" style="margin-top:10px">Eine Gastbuchung tätigen</button>
    </div>
    ${warnHtml}
    ${groupsHtml}
    <div class="summary-bar">
      <div class="total"><span class="lbl">Total</span><span id="total" class="val">${formatCHF(0)}</span></div>
      <button id="book-btn" class="btn primary block" disabled>Buchen</button>
    </div>
  `;
  main.querySelectorAll(".qty-control").forEach(c => bindQty(c));
  document.getElementById("book-btn").onclick = submitBooking;
  document.getElementById("guest-btn").onclick = submitGuestBooking;
  updateTotal();
}

function renderMaterialRow(it) {
  const qty = state.cart[it.id] || 0;
  return `
    <div class="material-row" data-id="${it.id}">
      <div class="label">
        <span class="name">${esc(it.label)}</span>
        <span class="price">${formatCHF(it.price)} / Stk.</span>
      </div>
      <div class="qty-control" data-id="${it.id}">
        <button data-act="dec" aria-label="Weniger">−</button>
        <input type="number" min="0" max="999" value="${qty}" />
        <button data-act="inc" aria-label="Mehr">+</button>
      </div>
      <div class="sub" data-sub="${it.id}">${formatCHF(qty * it.price)}</div>
    </div>
  `;
}

function bindQty(ctrl) {
  const id = ctrl.dataset.id;
  const input = ctrl.querySelector("input");
  const setQty = (n) => {
    n = Math.max(0, Math.min(999, n | 0));
    state.cart[id] = n;
    input.value = n;
    const sub = document.querySelector(`[data-sub="${id}"]`);
    if (sub) sub.textContent = formatCHF(n * MATERIAL_INDEX[id].price);
    updateTotal();
  };
  ctrl.querySelector('[data-act="inc"]').onclick = () => setQty((state.cart[id] || 0) + 1);
  ctrl.querySelector('[data-act="dec"]').onclick = () => setQty((state.cart[id] || 0) - 1);
  input.oninput = () => setQty(parseInt(input.value || "0", 10));
}

function cartTotal() {
  let t = 0;
  for (const [id, q] of Object.entries(state.cart)) {
    if (MATERIAL_INDEX[id]) t += q * MATERIAL_INDEX[id].price;
  }
  return t;
}
function cartItemCount() {
  return Object.values(state.cart).reduce((a, b) => a + b, 0);
}

function updateTotal() {
  const t = cartTotal();
  const el = document.getElementById("total");
  if (el) el.textContent = formatCHF(t);
  const btn = document.getElementById("book-btn");
  if (btn) btn.disabled = cartItemCount() === 0;
}

async function submitGuestBooking() {
  if (cartItemCount() === 0) {
    toast("Bitte zuerst Materialien wählen", "error");
    return;
  }
  if (!GH.hasToken()) {
    toast("Buchungs-Token fehlt – siehe Hinweis oben", "error");
    return;
  }
  const wrap = document.createElement("div");
  wrap.innerHTML = `
    <p class="muted" style="margin-top:0">Daten des Gastes einmalig eingeben. Nach der Bestätigung kann die Buchung <b>nicht mehr angepasst</b> werden.</p>
    <label class="field"><span>Vorname *</span><input id="g-first" type="text" autocomplete="off" /></label>
    <label class="field"><span>Nachname *</span><input id="g-last" type="text" autocomplete="off" /></label>
    <label class="field"><span>ID-Person *</span><input id="g-id" type="text" inputmode="numeric" autocomplete="off" /></label>
    <label class="field"><span>E-Mail *</span><input id="g-email" type="email" autocomplete="off" /></label>
    <label class="field"><span>Jahreskurs *</span><input id="g-kurs" type="text" autocomplete="off" /></label>
  `;
  const guest = {};
  const ok = await modal({
    title: "Gastbuchung – Daten",
    body: wrap,
    okText: "Weiter",
    onOk: (root) => {
      const data = {
        firstName: root.querySelector("#g-first").value.trim(),
        lastName: root.querySelector("#g-last").value.trim(),
        idPerson: root.querySelector("#g-id").value.trim(),
        email: root.querySelector("#g-email").value.trim(),
        jahreskurs: root.querySelector("#g-kurs").value.trim(),
      };
      for (const k of Object.keys(data)) {
        if (!data[k]) { toast("Bitte alle Felder ausfüllen", "error"); return false; }
      }
      if (!/^\S+@\S+\.\S+$/.test(data.email)) { toast("Ungültige E-Mail", "error"); return false; }
      Object.assign(guest, data);
    },
  });
  if (!ok) return;

  const items = Object.entries(state.cart)
    .filter(([, q]) => q > 0)
    .map(([id, q]) => ({
      materialId: id,
      label: MATERIAL_INDEX[id].label,
      group: MATERIAL_INDEX[id].group,
      unitPrice: MATERIAL_INDEX[id].price,
      qty: q,
    }));
  const total = cartTotal();
  const summary = `
    <p class="muted" style="margin-top:0">Gast: <b>${esc(guest.firstName)} ${esc(guest.lastName)}</b> · ID ${esc(guest.idPerson)} · ${esc(guest.jahreskurs)}</p>
    <ul style="margin:0 0 10px; padding-left:18px; font-size:14px">
      ${items.map(i => `<li>${esc(i.group)} — ${esc(i.label)} × ${i.qty} = ${formatCHF(i.qty * i.unitPrice)}</li>`).join("")}
    </ul>
    <div style="display:flex; justify-content:space-between; font-weight:600; padding-top:8px; border-top:1px solid var(--border)">
      <span>Total</span><span>${formatCHF(total)}</span>
    </div>
    <p class="muted" style="font-size:12px; margin-top:10px">Gastbuchungen können nach Bestätigung nicht mehr bearbeitet werden.</p>`;
  const confirmed = await modal({ title: "Gastbuchung bestätigen", body: summary, okText: "Buchen" });
  if (!confirmed) return;

  const booking = {
    id: newId(),
    deviceId: "guest",
    guest: true,
    createdAt: new Date().toISOString(),
    ...guest,
    items,
    total,
    notes: [],
  };
  try {
    await GH.addBooking(booking, currentActor());
    toast("Gastbuchung gespeichert", "success");
    state.cart = {};
    await refreshBookings();
    renderBook();
  } catch (e) {
    console.error(e);
    toast("Fehler: " + e.message, "error");
  }
}

async function submitBooking() {
  if (cartItemCount() === 0) return;
  if (!GH.hasToken()) {
    toast("Buchungs-Token fehlt – siehe Hinweis oben", "error");
    return;
  }
  const items = Object.entries(state.cart)
    .filter(([, q]) => q > 0)
    .map(([id, q]) => ({
      materialId: id,
      label: MATERIAL_INDEX[id].label,
      group: MATERIAL_INDEX[id].group,
      unitPrice: MATERIAL_INDEX[id].price,
      qty: q,
    }));
  const total = cartTotal();

  const summary = `
    <ul style="margin:0 0 10px; padding-left:18px; font-size:14px">
      ${items.map(i => `<li>${esc(i.group)} — ${esc(i.label)} × ${i.qty} = ${formatCHF(i.qty * i.unitPrice)}</li>`).join("")}
    </ul>
    <div style="display:flex; justify-content:space-between; font-weight:600; padding-top:8px; border-top:1px solid var(--border)">
      <span>Total</span><span>${formatCHF(total)}</span>
    </div>`;
  const ok = await modal({ title: "Buchung bestätigen", body: summary, okText: "Buchen" });
  if (!ok) return;

  const btn = document.getElementById("book-btn");
  btn.disabled = true;
  btn.innerHTML = '<span class="spinner"></span> Speichern …';

  const booking = {
    id: newId(),
    deviceId: state.deviceId,
    createdAt: new Date().toISOString(),
    firstName: state.profile.firstName,
    lastName: state.profile.lastName,
    idPerson: state.profile.idPerson,
    email: state.profile.email,
    jahreskurs: state.profile.jahreskurs,
    items,
    total,
    notes: [],
  };
  try {
    await GH.addBooking(booking, currentActor());
    toast("Buchung gespeichert", "success");
    state.cart = {};
    await refreshBookings();
    renderBook();
  } catch (e) {
    console.error(e);
    toast("Fehler: " + e.message, "error");
    btn.disabled = false;
    btn.textContent = "Buchen";
  }
}

// ================= List =================
async function refreshBookings() {
  try {
    const data = await GH.loadAll();
    state.bookings = Array.isArray(data.bookings) ? data.bookings : [];
    if (state.view === "list") renderList();
    if (state.view === "edit") renderEdit();
  } catch (e) {
    console.error(e);
  }
}

function renderList() {
  document.getElementById("page-title").textContent = "Buchungsliste";
  const main = document.getElementById("main");
  main.innerHTML = `
    <div class="card" style="display:flex;justify-content:space-between;align-items:center;">
      <div><b>${state.bookings.length}</b> <span class="muted">Buchungen gesamt</span></div>
      <button id="reload" class="btn">Neu laden</button>
    </div>
    <div id="list" class="booking-list"></div>
  `;
  document.getElementById("reload").onclick = async () => {
    toast("Lade …");
    await refreshBookings();
    toast("Aktualisiert", "success");
  };
  const list = document.getElementById("list");
  if (!state.bookings.length) {
    list.innerHTML = `<div class="empty">Noch keine Buchungen.</div>`;
    return;
  }
  const sorted = [...state.bookings].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  list.innerHTML = sorted.map(b => bookingCardHtml(b, { clickToEdit: true })).join("");
  bindBookingActions(list, { clickToEdit: true });
}

function bookingCardHtml(b, opts = {}) {
  const own = !b.guest && b.deviceId && b.deviceId === state.deviceId;
  const date = new Date(b.createdAt);
  const when = date.toLocaleString("de-CH", { dateStyle: "short", timeStyle: "short" });
  const notes = Array.isArray(b.notes) ? b.notes : [];
  const notesHtml = notes.length ? `
    <div class="notes">
      <div class="notes-title">Notizen</div>
      ${notes.map(n => {
        const ownNote = n.authorDeviceId && n.authorDeviceId === state.deviceId && n.id;
        return `
        <div class="note">
          <div class="note-text">${esc(n.text)}</div>
          <div class="note-foot">
            <span class="note-meta">— ${esc(n.author || "?")} · ${esc(new Date(n.createdAt).toLocaleString("de-CH", { dateStyle: "short", timeStyle: "short" }))}</span>
            ${ownNote ? `<button class="note-del" title="Notiz löschen" data-del-note="${esc(b.id)}|${esc(n.id)}">×</button>` : ""}
          </div>
        </div>`;
      }).join("")}
    </div>` : "";
  const tags = [];
  if (b.guest) tags.push(`<span class="tag tag-guest">Gast</span>`);
  if (own) tags.push(`<span class="tag tag-own">Eigene</span>`);
  const clickable = own && opts.clickToEdit;
  return `
    <div class="booking-item ${own ? "own" : ""} ${b.guest ? "guest" : ""} ${clickable ? "clickable" : ""}"
         ${clickable ? `data-direct-edit="${esc(b.id)}"` : ""}>
      ${tags.length ? `<div class="tags">${tags.join("")}</div>` : ""}
      <div class="head">
        <span class="who">${esc(b.firstName)} ${esc(b.lastName)}</span>
        <span class="when">${esc(when)}</span>
      </div>
      <div class="meta">${esc(b.jahreskurs)} · ID ${esc(b.idPerson)}</div>
      <ul>
        ${b.items.map(i => `<li>${esc(i.group)} — ${esc(i.label)} × ${i.qty} <span class="muted">(${formatCHF(i.qty * i.unitPrice)})</span></li>`).join("")}
      </ul>
      ${notesHtml}
      <div class="foot">
        <span class="sum">${formatCHF(b.total)}</span>
        <div style="display:flex;gap:6px;flex-wrap:wrap;justify-content:flex-end">
          <button class="btn small" data-note="${esc(b.id)}">Notiz +</button>
          ${own && opts.withActions ? `
            <button class="btn small" data-edit="${esc(b.id)}">Bearbeiten</button>
            <button class="btn small danger" data-del="${esc(b.id)}">Löschen</button>` : ""}
        </div>
      </div>
    </div>
  `;
}

function bindBookingActions(container, opts = {}) {
  container.querySelectorAll("[data-note]").forEach(btn => {
    btn.onclick = (e) => { e.stopPropagation(); addNoteToBooking(btn.dataset.note); };
  });
  container.querySelectorAll("[data-edit]").forEach(btn => {
    btn.onclick = (e) => { e.stopPropagation(); editBooking(btn.dataset.edit); };
  });
  container.querySelectorAll("[data-del]").forEach(btn => {
    btn.onclick = (e) => { e.stopPropagation(); deleteBooking(btn.dataset.del); };
  });
  container.querySelectorAll("[data-del-note]").forEach(btn => {
    btn.onclick = (e) => {
      e.stopPropagation();
      const [bid, nid] = btn.dataset.delNote.split("|");
      deleteNoteFromBooking(bid, nid);
    };
  });
  if (opts.clickToEdit) {
    container.querySelectorAll("[data-direct-edit]").forEach(card => {
      card.onclick = () => editBooking(card.dataset.directEdit);
    });
  }
}

async function addNoteToBooking(id) {
  const b = state.bookings.find(x => x.id === id);
  if (!b) return;
  if (!GH.hasToken()) { toast("Buchungs-Token fehlt", "error"); return; }
  const wrap = document.createElement("div");
  wrap.innerHTML = `
    <p class="muted" style="margin-top:0">Notiz zu Buchung von <b>${esc(b.firstName)} ${esc(b.lastName)}</b> hinzufügen.</p>
    <label class="field"><span>Text *</span><textarea id="n-text" rows="4" placeholder="Notiz …"></textarea></label>
  `;
  let text = null;
  const ok = await modal({
    title: "Notiz hinzufügen",
    body: wrap,
    okText: "Speichern",
    onOk: (root) => {
      const t = root.querySelector("#n-text").value.trim();
      if (!t) { toast("Notiz darf nicht leer sein", "error"); return false; }
      text = t;
    },
  });
  if (!ok || !text) return;
  const note = {
    id: newId(),
    text,
    author: state.profile ? `${state.profile.firstName} ${state.profile.lastName}` : "Anonym",
    authorDeviceId: state.deviceId,
    createdAt: new Date().toISOString(),
  };
  try {
    await GH.addNote(id, note, currentActor());
    toast("Notiz gespeichert", "success");
    await refreshBookings();
  } catch (e) {
    toast("Fehler: " + e.message, "error");
  }
}

async function deleteNoteFromBooking(bookingId, noteId) {
  const ok = await modal({
    title: "Notiz löschen?",
    body: "Diese Aktion kann nicht rückgängig gemacht werden.",
    okText: "Löschen",
  });
  if (!ok) return;
  try {
    await GH.deleteNote(bookingId, noteId, state.deviceId, currentActor());
    toast("Notiz gelöscht", "success");
    await refreshBookings();
  } catch (e) {
    toast("Fehler: " + e.message, "error");
  }
}

// ================= Edit =================
function renderEdit() {
  document.getElementById("page-title").textContent = "Buchungen anpassen";
  const main = document.getElementById("main");
  const own = state.bookings
    .filter(b => b.deviceId && b.deviceId === state.deviceId)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  main.innerHTML = `
    <div class="card">
      <h2>Deine Buchungen</h2>
      <p class="muted">Nur Buchungen von diesem Gerät können angepasst werden. Sortiert nach Datum.</p>
    </div>
    <div id="own-list" class="booking-list"></div>
  `;
  const list = document.getElementById("own-list");
  if (!own.length) {
    list.innerHTML = `<div class="empty">Keine eigenen Buchungen vorhanden.</div>`;
    return;
  }
  list.innerHTML = own.map(b => bookingCardHtml(b, { withActions: true })).join("");
  bindBookingActions(list);
}

async function editBooking(id) {
  const b = state.bookings.find(x => x.id === id);
  if (!b) return;
  const wrap = document.createElement("div");
  wrap.innerHTML = `<p class="muted" style="margin-top:0">Mengen anpassen (0 = entfernen)</p>` +
    b.items.map((it, i) => `
      <div class="material-row" style="border:1px solid var(--border); border-radius:8px; margin-bottom:8px">
        <div class="label">
          <span class="name">${esc(it.group)} — ${esc(it.label)}</span>
          <span class="price">${formatCHF(it.unitPrice)} / Stk.</span>
        </div>
        <div class="qty-control">
          <button data-act="dec" data-i="${i}">−</button>
          <input type="number" min="0" max="999" data-i="${i}" value="${it.qty}" />
          <button data-act="inc" data-i="${i}">+</button>
        </div>
      </div>
    `).join("");

  const newQtys = b.items.map(i => i.qty);
  const refreshInputs = () => {
    wrap.querySelectorAll("input[data-i]").forEach(inp => {
      inp.value = newQtys[+inp.dataset.i];
    });
  };
  wrap.querySelectorAll("button[data-act]").forEach(btn => {
    btn.onclick = () => {
      const i = +btn.dataset.i;
      newQtys[i] = Math.max(0, newQtys[i] + (btn.dataset.act === "inc" ? 1 : -1));
      refreshInputs();
    };
  });
  wrap.querySelectorAll("input[data-i]").forEach(inp => {
    inp.oninput = () => { newQtys[+inp.dataset.i] = Math.max(0, parseInt(inp.value || "0", 10)); };
  });

  let patch = null;
  const ok = await modal({
    title: "Buchung anpassen",
    body: wrap,
    okText: "Speichern",
    onOk: () => {
      const newItems = b.items
        .map((it, i) => ({ ...it, qty: newQtys[i] }))
        .filter(it => it.qty > 0);
      if (!newItems.length) { toast("Mindestens eine Position nötig (oder löschen)", "error"); return false; }
      patch = { items: newItems, total: newItems.reduce((s, it) => s + it.qty * it.unitPrice, 0) };
    },
  });
  if (!ok || !patch) return;
  try {
    await GH.updateBooking(id, state.deviceId, patch, currentActor());
    toast("Gespeichert", "success");
    await refreshBookings();
  } catch (e) {
    toast("Fehler: " + e.message, "error");
  }
}

async function deleteBooking(id) {
  const ok = await modal({
    title: "Buchung löschen?",
    body: "Diese Aktion kann nicht rückgängig gemacht werden.",
    okText: "Löschen",
  });
  if (!ok) return;
  try {
    await GH.deleteBooking(id, state.deviceId, currentActor());
    toast("Gelöscht", "success");
    await refreshBookings();
  } catch (e) {
    toast("Fehler: " + e.message, "error");
  }
}

// ================= Helpers =================
function val(id) { return document.getElementById(id).value.trim(); }
function esc(s) {
  return String(s ?? "").replace(/[&<>"']/g, c => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  }[c]));
}
function newId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}
