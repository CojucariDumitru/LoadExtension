const ROOT_ID = "loadextension-overlay-root";

export class OverlayManager {
  constructor() {
    this.entries = new Map();
    this.root = this.ensureRoot();
    this.repositionAll = this.repositionAll.bind(this);
    window.addEventListener("scroll", this.repositionAll, true);
    window.addEventListener("resize", this.repositionAll);
  }

  ensureRoot() {
    let root = document.getElementById(ROOT_ID);
    if (!root) {
      root = document.createElement("div");
      root.id = ROOT_ID;
      root.className = "le-overlay-root";
      document.documentElement.appendChild(root);
    }
    return root;
  }

  mount(loadId, row, bar) {
    if (this.entries.has(loadId)) return;

    bar.classList.add("le-overlay-chip");
    bar.dataset.loadId = loadId;
    this.root.appendChild(bar);
    this.entries.set(loadId, { row, bar });
    this.reposition(loadId);
  }

  reposition(loadId) {
    const entry = this.entries.get(loadId);
    if (!entry) return;

    const { row, bar } = entry;
    if (!row.isConnected) {
      bar.remove();
      this.entries.delete(loadId);
      return;
    }

    const rect = row.getBoundingClientRect();
    if (rect.height < 20 || rect.width < 80 || rect.bottom < 0 || rect.top > window.innerHeight) {
      bar.style.display = "none";
      return;
    }

    bar.style.display = "flex";
    bar.style.top = `${Math.max(4, rect.top + 4)}px`;
    bar.style.left = `${Math.min(window.innerWidth - 8, rect.right - 8)}px`;
  }

  repositionAll() {
    for (const loadId of this.entries.keys()) {
      this.reposition(loadId);
    }
  }

  clear() {
    for (const { bar } of this.entries.values()) {
      bar.remove();
    }
    this.entries.clear();
  }

  count() {
    return this.entries.size;
  }
}
