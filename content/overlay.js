const ROOT_ID = "loadextension-overlay-root";

export class OverlayManager {
  constructor() {
    this.entries = new Map();
    this.root = this.ensureRoot();
    this.repositionScheduled = false;
    this.repositionAll = this.repositionAll.bind(this);
    this.scheduleRepositionAll = this.scheduleRepositionAll.bind(this);
    window.addEventListener("scroll", this.scheduleRepositionAll, true);
    window.addEventListener("resize", this.scheduleRepositionAll);
  }

  scheduleRepositionAll() {
    if (this.repositionScheduled) return;
    this.repositionScheduled = true;
    requestAnimationFrame(() => {
      this.repositionScheduled = false;
      this.repositionAll();
    });
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
    this.mountAnchor(loadId, row, bar, "row-chip");
    bar.classList.add("le-overlay-chip");
  }

  mountAnchor(key, anchor, widget, placement = "cover") {
    if (this.entries.has(key)) return;
    if (!anchor?.isConnected) return;

    widget.dataset.anchorKey = key;
    this.root.appendChild(widget);
    this.entries.set(key, { anchor, widget, placement });
    this.reposition(key);
  }

  mountBetween(key, anchorA, anchorB, widget) {
    if (this.entries.has(key)) return;
    if (!anchorA?.isConnected || !anchorB?.isConnected) return;

    widget.dataset.anchorKey = key;
    this.root.appendChild(widget);
    this.entries.set(key, { anchor: anchorA, anchorB, widget, placement: "between" });
    this.reposition(key);
  }

  reposition(key) {
    const entry = this.entries.get(key);
    if (!entry) return;

    const { anchor, anchorB, widget, placement } = entry;

    if (!anchor?.isConnected || (placement === "between" && !anchorB?.isConnected)) {
      widget.remove();
      this.entries.delete(key);
      return;
    }

    const rect = anchor.getBoundingClientRect();
    if (rect.width < 1 && rect.height < 1) {
      widget.style.display = "none";
      return;
    }

    widget.style.display = "flex";

    if (placement === "between" && anchorB) {
      const rectB = anchorB.getBoundingClientRect();
      const top = Math.min(rect.top, rectB.top) + Math.abs(rectB.top - rect.top) / 2;
      const left = (rect.right + rectB.left) / 2;
      widget.style.top = `${Math.max(4, top - 14)}px`;
      widget.style.left = `${Math.max(4, left - 14)}px`;
      return;
    }

    if (placement === "cover") {
      widget.style.top = `${rect.top}px`;
      widget.style.left = `${rect.left}px`;
      widget.style.width = `${Math.max(rect.width, 90)}px`;
      widget.style.minHeight = `${Math.max(rect.height, 22)}px`;
      return;
    }

    if (placement === "below") {
      widget.style.top = `${rect.bottom + 4}px`;
      widget.style.left = `${rect.left}px`;
      return;
    }

    if (placement === "row-chip") {
      if (rect.height < 20 || rect.width < 80 || rect.bottom < 0 || rect.top > window.innerHeight) {
        widget.style.display = "none";
        return;
      }
      widget.style.top = `${Math.max(4, rect.top + 4)}px`;
      widget.style.left = `${Math.min(window.innerWidth - 8, rect.right - 8)}px`;
    }
  }

  repositionAll() {
    for (const key of this.entries.keys()) {
      this.reposition(key);
    }
  }

  clear() {
    for (const { widget } of this.entries.values()) {
      widget.remove();
    }
    this.entries.clear();
  }

  count() {
    const loadIds = new Set();
    for (const key of this.entries.keys()) {
      loadIds.add(key.split(":")[0]);
    }
    return loadIds.size;
  }
}
