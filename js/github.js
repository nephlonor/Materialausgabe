// GitHub API Storage. Bookings werden in data/bookings.json gespeichert,
// jede Änderung zusätzlich in data/audit.json (nicht in der UI sichtbar,
// kann via Settings exportiert werden).

const GH = {
  owner: "nephlonor",
  repo: "materialausgabe",
  branch: "main",
  path: "data/bookings.json",
  auditPath: "data/audit.json",

  hasToken() {
    const t = (typeof APP_CONFIG !== "undefined" && APP_CONFIG.token) || "";
    return t && t !== "__MA_TOKEN__";
  },

  _token() {
    if (!this.hasToken()) {
      throw new Error("Buchungs-Token nicht konfiguriert. Repository-Secret MA_GITHUB_TOKEN setzen und Pages neu deployen.");
    }
    return APP_CONFIG.token;
  },

  async _apiGetPath(path, emptyShape) {
    const url = `https://api.github.com/repos/${this.owner}/${this.repo}/contents/${path}?ref=${this.branch}`;
    const res = await fetch(url, {
      headers: {
        "Authorization": `Bearer ${this._token()}`,
        "Accept": "application/vnd.github+json",
        "X-GitHub-Api-Version": "2022-11-28",
      },
      cache: "no-store",
    });
    if (res.status === 404) return { sha: null, data: emptyShape };
    if (!res.ok) {
      const txt = await res.text();
      throw new Error(`API-Fehler ${res.status}: ${txt.slice(0, 200)}`);
    }
    const json = await res.json();
    const decoded = decodeURIComponent(escape(atob(json.content.replace(/\n/g, ""))));
    return { sha: json.sha, data: JSON.parse(decoded) };
  },

  async _putFilePath(path, data, sha, message) {
    const url = `https://api.github.com/repos/${this.owner}/${this.repo}/contents/${path}`;
    const content = btoa(unescape(encodeURIComponent(JSON.stringify(data, null, 2))));
    const body = { message, content, branch: this.branch };
    if (sha) body.sha = sha;
    const res = await fetch(url, {
      method: "PUT",
      headers: {
        "Authorization": `Bearer ${this._token()}`,
        "Accept": "application/vnd.github+json",
        "X-GitHub-Api-Version": "2022-11-28",
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      const txt = await res.text();
      throw new Error(`Speichern fehlgeschlagen (${res.status}): ${txt.slice(0, 200)}`);
    }
    return await res.json();
  },

  async _withRetryPath(path, emptyShape, mutator, message) {
    for (let attempt = 0; attempt < 5; attempt++) {
      const { sha, data } = await this._apiGetPath(path, emptyShape);
      const newData = mutator(data);
      try {
        await this._putFilePath(path, newData, sha, message);
        return newData;
      } catch (e) {
        if (String(e.message).includes("409") || String(e.message).includes("sha")) {
          await new Promise(r => setTimeout(r, 300 * (attempt + 1)));
          continue;
        }
        throw e;
      }
    }
    throw new Error("Konnte nicht speichern (Konflikt). Bitte erneut versuchen.");
  },

  async _withRetry(mutator, message) {
    return await this._withRetryPath(this.path, { bookings: [] }, (data) => {
      if (!data.bookings) data.bookings = [];
      return mutator(data);
    }, message);
  },

  async loadAll() {
    if (this.hasToken()) {
      const { data } = await this._apiGetPath(this.path, { bookings: [] });
      return data;
    }
    const url = `https://raw.githubusercontent.com/${this.owner}/${this.repo}/${this.branch}/${this.path}?t=${Date.now()}`;
    const res = await fetch(url, { cache: "no-store" });
    if (res.status === 404) return { bookings: [] };
    if (!res.ok) throw new Error(`Laden fehlgeschlagen (${res.status})`);
    return await res.json();
  },

  async loadAudit() {
    if (this.hasToken()) {
      const { data } = await this._apiGetPath(this.auditPath, { entries: [] });
      return data;
    }
    const url = `https://raw.githubusercontent.com/${this.owner}/${this.repo}/${this.branch}/${this.auditPath}?t=${Date.now()}`;
    const res = await fetch(url, { cache: "no-store" });
    if (res.status === 404) return { entries: [] };
    if (!res.ok) throw new Error(`Audit-Log laden fehlgeschlagen (${res.status})`);
    return await res.json();
  },

  async _writeAudit(entry) {
    if (!this.hasToken()) return;
    try {
      await this._withRetryPath(this.auditPath, { entries: [] }, (data) => {
        if (!Array.isArray(data.entries)) data.entries = [];
        data.entries.push(entry);
        return data;
      }, `Audit ${entry.action} ${entry.bookingId || ""}`.trim());
    } catch (e) {
      console.warn("Audit-Eintrag konnte nicht geschrieben werden:", e);
    }
  },

  _auditId() {
    return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
  },

  async addBooking(booking, actor) {
    const result = await this._withRetry((data) => {
      data.bookings.push(booking);
      return data;
    }, `Neue Buchung ${booking.id}`);
    await this._writeAudit({
      id: this._auditId(),
      timestamp: new Date().toISOString(),
      action: "create",
      bookingId: booking.id,
      actor: actor || null,
      booking,
    });
    return result;
  },

  async updateBooking(bookingId, deviceId, idPerson, patch, actor) {
    let before = null, after = null;
    const result = await this._withRetry((data) => {
      const i = data.bookings.findIndex(b => b.id === bookingId);
      if (i === -1) throw new Error("Buchung nicht gefunden");
      const b = data.bookings[i];
      const allowed = b.deviceId === deviceId || (idPerson && b.idPerson === idPerson) || String(idPerson).trim() === "3388";
      if (!allowed) throw new Error("Keine Berechtigung");
      before = JSON.parse(JSON.stringify(b));
      data.bookings[i] = { ...b, ...patch, updatedAt: new Date().toISOString() };
      after = JSON.parse(JSON.stringify(data.bookings[i]));
      return data;
    }, `Buchung ${bookingId} angepasst`);
    await this._writeAudit({
      id: this._auditId(),
      timestamp: new Date().toISOString(),
      action: "update",
      bookingId,
      actor: actor || null,
      before, after,
    });
    return result;
  },

  async deleteBooking(bookingId, deviceId, idPerson, actor) {
    let removed = null;
    const result = await this._withRetry((data) => {
      const i = data.bookings.findIndex(b => b.id === bookingId);
      if (i === -1) throw new Error("Buchung nicht gefunden");
      const b = data.bookings[i];
      const allowed = b.deviceId === deviceId || (idPerson && b.idPerson === idPerson) || String(idPerson).trim() === "3388";
      if (!allowed) throw new Error("Keine Berechtigung");
      removed = JSON.parse(JSON.stringify(b));
      data.bookings.splice(i, 1);
      return data;
    }, `Buchung ${bookingId} gelöscht`);
    await this._writeAudit({
      id: this._auditId(),
      timestamp: new Date().toISOString(),
      action: "delete",
      bookingId,
      actor: actor || null,
      booking: removed,
    });
    return result;
  },

  async deleteNote(bookingId, noteId, deviceId, actor) {
    let removed = null;
    const result = await this._withRetry((data) => {
      const i = data.bookings.findIndex(b => b.id === bookingId);
      if (i === -1) throw new Error("Buchung nicht gefunden");
      const notes = Array.isArray(data.bookings[i].notes) ? data.bookings[i].notes : [];
      const j = notes.findIndex(n => n.id === noteId);
      if (j === -1) throw new Error("Notiz nicht gefunden");
      if (notes[j].authorDeviceId !== deviceId) throw new Error("Keine Berechtigung");
      removed = JSON.parse(JSON.stringify(notes[j]));
      notes.splice(j, 1);
      data.bookings[i].notes = notes;
      return data;
    }, `Notiz ${noteId} gelöscht`);
    await this._writeAudit({
      id: this._auditId(),
      timestamp: new Date().toISOString(),
      action: "note-delete",
      bookingId,
      actor: actor || null,
      note: removed,
    });
    return result;
  },

  async addNote(bookingId, note, actor) {
    const result = await this._withRetry((data) => {
      const i = data.bookings.findIndex(b => b.id === bookingId);
      if (i === -1) throw new Error("Buchung nicht gefunden");
      if (!Array.isArray(data.bookings[i].notes)) data.bookings[i].notes = [];
      data.bookings[i].notes.push(note);
      return data;
    }, `Notiz zu Buchung ${bookingId}`);
    await this._writeAudit({
      id: this._auditId(),
      timestamp: new Date().toISOString(),
      action: "note",
      bookingId,
      actor: actor || null,
      note,
    });
    return result;
  },
};
