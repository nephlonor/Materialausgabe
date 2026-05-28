// GitHub API Storage. Bookings werden in data/bookings.json gespeichert.
// Lesen erfolgt anonym (public repo). Schreiben benötigt einen Fine-grained PAT
// mit "Contents: Read and write" Berechtigung auf diesem Repo.

const GH = {
  owner: "nephlonor",
  repo: "materialausgabe",
  branch: "main",
  path: "data/bookings.json",

  _cachedSha: null,

  async _publicRead() {
    // Anonym via raw.githubusercontent.com - umgeht API-Rate-Limits.
    const url = `https://raw.githubusercontent.com/${this.owner}/${this.repo}/${this.branch}/${this.path}?t=${Date.now()}`;
    const res = await fetch(url, { cache: "no-store" });
    if (res.status === 404) return { bookings: [] };
    if (!res.ok) throw new Error(`Laden fehlgeschlagen (${res.status})`);
    return await res.json();
  },

  async _apiGet(token) {
    const url = `https://api.github.com/repos/${this.owner}/${this.repo}/contents/${this.path}?ref=${this.branch}`;
    const res = await fetch(url, {
      headers: {
        "Authorization": `Bearer ${token}`,
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

  async loadAll() {
    try {
      return await this._publicRead();
    } catch (e) {
      console.warn("Public read failed, trying empty:", e);
      return { bookings: [] };
    }
  },

  async _putFile(token, data, sha, message) {
    const url = `https://api.github.com/repos/${this.owner}/${this.repo}/contents/${this.path}`;
    const content = btoa(unescape(encodeURIComponent(JSON.stringify(data, null, 2))));
    const body = { message, content, branch: this.branch };
    if (sha) body.sha = sha;
    const res = await fetch(url, {
      method: "PUT",
      headers: {
        "Authorization": `Bearer ${token}`,
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

  async _withRetry(token, mutator, message) {
    // Optimistic concurrency: SHA holen, mutieren, schreiben. Bei Konflikt retry.
    for (let attempt = 0; attempt < 4; attempt++) {
      const { sha, data } = await this._apiGet(token);
      if (!data.bookings) data.bookings = [];
      const newData = mutator(data);
      try {
        const res = await this._putFile(token, newData, sha, message);
        this._cachedSha = res.content && res.content.sha;
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

  async addBooking(token, booking) {
    return await this._withRetry(token, (data) => {
      data.bookings.push(booking);
      return data;
    }, `Neue Buchung ${booking.id}`);
  },

  async updateBooking(token, bookingId, owner, patch) {
    return await this._withRetry(token, (data) => {
      const i = data.bookings.findIndex(b => b.id === bookingId);
      if (i === -1) throw new Error("Buchung nicht gefunden");
      if (data.bookings[i].idPerson !== owner) throw new Error("Keine Berechtigung");
      data.bookings[i] = { ...data.bookings[i], ...patch, updatedAt: new Date().toISOString() };
      return data;
    }, `Buchung ${bookingId} angepasst`);
  },

  async deleteBooking(token, bookingId, owner) {
    return await this._withRetry(token, (data) => {
      const i = data.bookings.findIndex(b => b.id === bookingId);
      if (i === -1) throw new Error("Buchung nicht gefunden");
      if (data.bookings[i].idPerson !== owner) throw new Error("Keine Berechtigung");
      data.bookings.splice(i, 1);
      return data;
    }, `Buchung ${bookingId} gelöscht`);
  },

  async verifyToken(token) {
    const res = await fetch("https://api.github.com/user", {
      headers: { "Authorization": `Bearer ${token}`, "Accept": "application/vnd.github+json" },
    });
    return res.ok;
  },
};
