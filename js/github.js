// GitHub API Storage. Bookings werden in data/bookings.json gespeichert.
// Lesen erfolgt anonym (public repo). Schreiben benötigt den geteilten Token aus
// APP_CONFIG.token (wird beim Pages-Deploy aus Repository-Secret injiziert).

const GH = {
  owner: "nephlonor",
  repo: "materialausgabe",
  branch: "main",
  path: "data/bookings.json",

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

  async loadAll() {
    // Wenn Token vorhanden: via API lesen (umgeht raw.githubusercontent CDN-Cache).
    // Sonst Fallback auf raw (für anonymen Read ohne Token).
    if (this.hasToken()) {
      const { data } = await this._apiGet();
      return data;
    }
    const url = `https://raw.githubusercontent.com/${this.owner}/${this.repo}/${this.branch}/${this.path}?t=${Date.now()}`;
    const res = await fetch(url, { cache: "no-store" });
    if (res.status === 404) return { bookings: [] };
    if (!res.ok) throw new Error(`Laden fehlgeschlagen (${res.status})`);
    return await res.json();
  },

  async _apiGet() {
    const url = `https://api.github.com/repos/${this.owner}/${this.repo}/contents/${this.path}?ref=${this.branch}`;
    const res = await fetch(url, {
      headers: {
        "Authorization": `Bearer ${this._token()}`,
        "Accept": "application/vnd.github+json",
        "X-GitHub-Api-Version": "2022-11-28",
      },
      cache: "no-store",
    });
    if (res.status === 404) return { sha: null, data: { bookings: [] } };
    if (!res.ok) {
      const txt = await res.text();
      throw new Error(`API-Fehler ${res.status}: ${txt.slice(0, 200)}`);
    }
    const json = await res.json();
    const decoded = decodeURIComponent(escape(atob(json.content.replace(/\n/g, ""))));
    return { sha: json.sha, data: JSON.parse(decoded) };
  },

  async _putFile(data, sha, message) {
    const url = `https://api.github.com/repos/${this.owner}/${this.repo}/contents/${this.path}`;
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

  async _withRetry(mutator, message) {
    for (let attempt = 0; attempt < 4; attempt++) {
      const { sha, data } = await this._apiGet();
      if (!data.bookings) data.bookings = [];
      const newData = mutator(data);
      try {
        await this._putFile(newData, sha, message);
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

  async addBooking(booking) {
    return await this._withRetry((data) => {
      data.bookings.push(booking);
      return data;
    }, `Neue Buchung ${booking.id}`);
  },

  async updateBooking(bookingId, deviceId, patch) {
    return await this._withRetry((data) => {
      const i = data.bookings.findIndex(b => b.id === bookingId);
      if (i === -1) throw new Error("Buchung nicht gefunden");
      if (data.bookings[i].deviceId !== deviceId) throw new Error("Keine Berechtigung");
      data.bookings[i] = { ...data.bookings[i], ...patch, updatedAt: new Date().toISOString() };
      return data;
    }, `Buchung ${bookingId} angepasst`);
  },

  async deleteBooking(bookingId, deviceId) {
    return await this._withRetry((data) => {
      const i = data.bookings.findIndex(b => b.id === bookingId);
      if (i === -1) throw new Error("Buchung nicht gefunden");
      if (data.bookings[i].deviceId !== deviceId) throw new Error("Keine Berechtigung");
      data.bookings.splice(i, 1);
      return data;
    }, `Buchung ${bookingId} gelöscht`);
  },

  async addNote(bookingId, note) {
    return await this._withRetry((data) => {
      const i = data.bookings.findIndex(b => b.id === bookingId);
      if (i === -1) throw new Error("Buchung nicht gefunden");
      if (!Array.isArray(data.bookings[i].notes)) data.bookings[i].notes = [];
      data.bookings[i].notes.push(note);
      return data;
    }, `Notiz zu Buchung ${bookingId}`);
  },
};
