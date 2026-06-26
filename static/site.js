function wireDirectoryFilters() {
  const root = document.querySelector("[data-directory-filters]");
  const table = document.querySelector("[data-directory-list]");
  if (!root || !table) return;

  const body = table.querySelector("tbody");
  const search = root.querySelector("[data-filter-search]");
  const sort = root.querySelector("[data-filter-sort]");
  const tier = root.querySelector("[data-filter-tier]");
  const category = root.querySelector("[data-filter-category]");
  const status = root.querySelector("[data-filter-status]");
  const tagButtons = Array.from(root.querySelectorAll("[data-tag-filter]"));
  const count = root.querySelector("[data-result-count]");
  const empty = document.querySelector("[data-empty-results]");
  const clear = root.querySelector("[data-clear-filters]");
  const rows = Array.from(body.querySelectorAll(".host-row"));
  const activeTags = new Set();

  function restoreState() {
    const params = new URLSearchParams(window.location.search);
    search.value = params.get("q") || localStorage.getItem("mcHostSearch") || "";
    sort.value = params.get("sort") || localStorage.getItem("mcHostSort") || "rank";
    tier.value = params.get("tier") || "";
    category.value = params.get("category") || "";
    status.value = params.get("status") || "";
    const tags = (params.get("tags") || "").split(",").filter(Boolean);
    for (const tag of tags) activeTags.add(tag);
    syncTagButtons();
  }

  function syncTagButtons() {
    for (const button of tagButtons) {
      button.classList.toggle("active", activeTags.has(button.dataset.tagFilter));
    }
  }

  function writeState() {
    localStorage.setItem("mcHostSearch", search.value);
    localStorage.setItem("mcHostSort", sort.value);
    const params = new URLSearchParams();
    if (search.value.trim()) params.set("q", search.value.trim());
    if (sort.value !== "rank") params.set("sort", sort.value);
    if (tier.value) params.set("tier", tier.value);
    if (category.value) params.set("category", category.value);
    if (status.value) params.set("status", status.value);
    if (activeTags.size) params.set("tags", Array.from(activeTags).join(","));
    const query = params.toString();
    const next = query ? `${window.location.pathname}?${query}` : window.location.pathname;
    window.history.replaceState(null, "", next);
  }

  function rowMatches(row) {
    const query = search.value.trim().toLowerCase();
    const rowTags = (row.dataset.tags || "").split(" ").filter(Boolean);
    const matchesQuery = !query || (row.dataset.search || "").toLowerCase().includes(query);
    const matchesTier = !tier.value || row.dataset.tier === tier.value;
    const matchesCategory =
      !category.value || (row.dataset.categories || "").split(" ").includes(category.value);
    const matchesStatus = !status.value || row.dataset.status === status.value;
    const matchesTags = Array.from(activeTags).every((tag) => rowTags.includes(tag));
    return matchesQuery && matchesTier && matchesCategory && matchesStatus && matchesTags;
  }

  function sortRows(visibleRows) {
    const value = sort.value;
    return visibleRows.sort((a, b) => {
      if (value === "name") return a.dataset.name.localeCompare(b.dataset.name);
      if (value === "tier") {
        return Number(a.dataset.tierOrder) - Number(b.dataset.tierOrder)
          || Number(a.dataset.rank) - Number(b.dataset.rank);
      }
      if (value === "ghz-desc") {
        return Number(b.dataset.ghz || 0) - Number(a.dataset.ghz || 0)
          || Number(a.dataset.rank) - Number(b.dataset.rank);
      }
      if (value === "verified-desc") {
        return (b.dataset.verified || "").localeCompare(a.dataset.verified || "")
          || Number(a.dataset.rank) - Number(b.dataset.rank);
      }
      return Number(a.dataset.rank) - Number(b.dataset.rank);
    });
  }

  function applyFilters() {
    const visibleRows = sortRows(rows.filter(rowMatches));
    for (const row of rows) row.hidden = true;
    for (const row of visibleRows) {
      row.hidden = false;
      body.appendChild(row);
    }
    count.textContent = visibleRows.length;
    if (empty) empty.hidden = visibleRows.length !== 0;
    writeState();
  }

  for (const input of [search, sort, tier, category, status]) {
    input.addEventListener(input === search ? "input" : "change", applyFilters);
  }

  for (const button of tagButtons) {
    button.addEventListener("click", () => {
      const tag = button.dataset.tagFilter;
      if (activeTags.has(tag)) activeTags.delete(tag);
      else activeTags.add(tag);
      syncTagButtons();
      applyFilters();
    });
  }

  clear.addEventListener("click", () => {
    search.value = "";
    sort.value = "rank";
    tier.value = "";
    category.value = "";
    status.value = "";
    activeTags.clear();
    syncTagButtons();
    applyFilters();
  });

  restoreState();
  applyFilters();
}

function wireReorder() {
  const list = document.querySelector("[data-reorder-list]");
  const save = document.querySelector("[data-save-order]");
  const status = document.querySelector("[data-order-status]");
  if (!list || !save) return;

  let dragging = null;

  function refreshRanks() {
    Array.from(list.querySelectorAll(".reorder-item")).forEach((item, index) => {
      item.querySelector(".reorder-rank").textContent = index + 1;
    });
  }

  list.addEventListener("dragstart", (event) => {
    const item = event.target.closest(".reorder-item");
    if (!item) return;
    dragging = item;
    item.classList.add("dragging");
    event.dataTransfer.effectAllowed = "move";
    event.dataTransfer.setData("text/plain", item.dataset.id);
  });

  list.addEventListener("dragend", () => {
    if (dragging) dragging.classList.remove("dragging");
    dragging = null;
    refreshRanks();
    status.textContent = "Order changed. Save to persist.";
  });

  list.addEventListener("dragover", (event) => {
    event.preventDefault();
    const target = event.target.closest(".reorder-item");
    if (!target || !dragging || target === dragging) return;
    const box = target.getBoundingClientRect();
    const after = event.clientY > box.top + box.height / 2;
    list.insertBefore(dragging, after ? target.nextSibling : target);
  });

  save.addEventListener("click", async () => {
    const order = Array.from(list.querySelectorAll(".reorder-item")).map((item) => item.dataset.id);
    status.textContent = "Saving...";
    const response = await fetch("/hosts/reorder", {
      method: "POST",
      headers: {"Content-Type": "application/json"},
      body: JSON.stringify({order}),
    });
    if (!response.ok) {
      status.textContent = "Save failed.";
      return;
    }
    status.textContent = "Saved.";
  });
}

document.addEventListener("DOMContentLoaded", () => {
  wireDirectoryFilters();
  wireReorder();
});
