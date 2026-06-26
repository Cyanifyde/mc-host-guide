function parseNumber(value) {
  if (value === undefined || value === null || value === "") return null;
  const number = Number(String(value).replace("$", "").replace(",", "").trim());
  return Number.isFinite(number) ? number : null;
}

function debounce(callback, delay = 140) {
  let handle = null;
  return (...args) => {
    window.clearTimeout(handle);
    handle = window.setTimeout(() => callback(...args), delay);
  };
}

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
  const count = root.querySelector("[data-result-count]");
  const empty = document.querySelector("[data-empty-results]");
  const clear = root.querySelector("[data-clear-filters]");
  const activeFilterRoot = root.querySelector("[data-active-filters]");
  const rangeInputs = Array.from(root.querySelectorAll("[data-range-key]"));
  const sortButtons = Array.from(document.querySelectorAll("[data-sort-button]"));
  const rows = Array.from(body.querySelectorAll(".host-row"));

  const chipGroups = [
    {
      label: "Tag",
      param: "tags",
      rowKey: "tags",
      buttonKey: "tagFilter",
      buttons: Array.from(root.querySelectorAll("[data-tag-filter]")),
      active: new Set(),
    },
    {
      label: "Region",
      param: "regions",
      rowKey: "locationTags",
      buttonKey: "locationFilter",
      buttons: Array.from(root.querySelectorAll("[data-location-filter]")),
      active: new Set(),
    },
    {
      label: "Support",
      param: "support",
      rowKey: "support",
      buttonKey: "supportFilter",
      buttons: Array.from(root.querySelectorAll("[data-support-filter]")),
      active: new Set(),
    },
  ];

  function splitValues(value) {
    return (value || "").split(/\s+/).filter(Boolean);
  }

  function rangeFor(key) {
    const inputs = rangeInputs.filter((input) => input.dataset.rangeKey === key);
    const min = inputs.find((input) => input.dataset.rangeBound === "min");
    const max = inputs.find((input) => input.dataset.rangeBound === "max");
    return {
      min: min ? parseNumber(min.value) : null,
      max: max ? parseNumber(max.value) : null,
    };
  }

  function rangeMatches(row, key) {
    const range = rangeFor(key);
    if (range.min === null && range.max === null) return true;
    const value = parseNumber(row.dataset[key]);
    if (value === null) return false;
    if (range.min !== null && value < range.min) return false;
    if (range.max !== null && value > range.max) return false;
    return true;
  }

  function restoreState() {
    const params = new URLSearchParams(window.location.search);
    search.value = params.get("q") || localStorage.getItem("mcHostSearch") || "";
    sort.value = params.get("sort") || localStorage.getItem("mcHostSort") || "rank";
    tier.value = params.get("tier") || "";
    category.value = params.get("category") || "";
    status.value = params.get("status") || "";

    for (const input of rangeInputs) {
      input.value = params.get(input.dataset.rangeParam) || "";
    }

    for (const group of chipGroups) {
      group.active.clear();
      for (const value of (params.get(group.param) || "").split(",").filter(Boolean)) {
        group.active.add(value);
      }
    }
    syncChipButtons();
    syncSortButtons();
  }

  function syncChipButtons() {
    for (const group of chipGroups) {
      for (const button of group.buttons) {
        const value = button.dataset[group.buttonKey];
        const active = group.active.has(value);
        button.classList.toggle("active", active);
        button.setAttribute("aria-pressed", String(active));
      }
    }
  }

  function syncSortButtons() {
    for (const button of sortButtons) {
      const active = button.dataset.sortValue === sort.value;
      button.classList.toggle("active", active);
      button.setAttribute("aria-sort", active ? sortDirection(sort.value) : "none");
    }
  }

  function sortDirection(value) {
    if (value.endsWith("-desc")) return "descending";
    if (value.endsWith("-asc") || value === "name" || value === "rank") return "ascending";
    return "other";
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

    for (const input of rangeInputs) {
      if (input.value) params.set(input.dataset.rangeParam, input.value);
    }
    for (const group of chipGroups) {
      if (group.active.size) params.set(group.param, Array.from(group.active).join(","));
    }

    const query = params.toString();
    const next = query ? `${window.location.pathname}?${query}` : window.location.pathname;
    window.history.replaceState(null, "", next);
  }

  function rowMatches(row) {
    const query = search.value.trim().toLowerCase();
    const matchesQuery = !query || (row.dataset.search || "").toLowerCase().includes(query);
    const matchesTier = !tier.value || row.dataset.tier === tier.value;
    const matchesCategory =
      !category.value || splitValues(row.dataset.categories).includes(category.value);
    const matchesStatus = !status.value || row.dataset.status === status.value;
    const matchesGroups = chipGroups.every((group) => {
      const rowValues = splitValues(row.dataset[group.rowKey]);
      return Array.from(group.active).every((value) => rowValues.includes(value));
    });
    const rangeKeys = Array.from(new Set(rangeInputs.map((input) => input.dataset.rangeKey)));
    const matchesRanges = rangeKeys.every((key) => rangeMatches(row, key));
    return matchesQuery && matchesTier && matchesCategory && matchesStatus && matchesGroups && matchesRanges;
  }

  function compareNumber(a, b, key, direction = "desc") {
    const aValue = parseNumber(a.dataset[key]);
    const bValue = parseNumber(b.dataset[key]);
    if (aValue === null && bValue === null) return Number(a.dataset.rank) - Number(b.dataset.rank);
    if (aValue === null) return 1;
    if (bValue === null) return -1;
    return direction === "asc" ? aValue - bValue : bValue - aValue;
  }

  function sortRows(visibleRows) {
    const value = sort.value;
    return visibleRows.sort((a, b) => {
      if (value === "name") return a.dataset.name.localeCompare(b.dataset.name);
      if (value === "tier") {
        return Number(a.dataset.tierOrder) - Number(b.dataset.tierOrder)
          || Number(a.dataset.rank) - Number(b.dataset.rank);
      }
      if (value === "price-asc") return compareNumber(a, b, "price", "asc");
      if (value === "plan-ram-desc") return compareNumber(a, b, "planRam");
      if (value === "players-desc") return compareNumber(a, b, "players");
      if (value === "base-ghz-desc") return compareNumber(a, b, "baseGhz");
      if (value === "peak-ghz-desc") return compareNumber(a, b, "peakGhz");
      if (value === "max-memory-desc") return compareNumber(a, b, "maxMemory");
      if (value === "memory-speed-desc") return compareNumber(a, b, "memorySpeed");
      if (value === "benchmark-desc") return compareNumber(a, b, "benchmark");
      if (value === "verified-desc") {
        return (b.dataset.verified || "").localeCompare(a.dataset.verified || "")
          || Number(a.dataset.rank) - Number(b.dataset.rank);
      }
      return Number(a.dataset.rank) - Number(b.dataset.rank);
    });
  }

  function addFilterChip(label, value, clearHandler) {
    if (!activeFilterRoot) return;
    const chip = document.createElement("button");
    chip.className = "active-filter-chip";
    chip.type = "button";
    chip.textContent = `${label}: ${value} x`;
    chip.addEventListener("click", clearHandler);
    activeFilterRoot.appendChild(chip);
  }

  function renderActiveFilters() {
    if (!activeFilterRoot) return;
    activeFilterRoot.textContent = "";
    if (search.value.trim()) {
      addFilterChip("Search", search.value.trim(), () => {
        search.value = "";
        applyFilters();
      });
    }
    for (const item of [
      ["Tier", tier],
      ["Category", category],
      ["Status", status],
    ]) {
      const [label, input] = item;
      if (input.value) {
        const selected = input.options[input.selectedIndex]?.textContent || input.value;
        addFilterChip(label, selected, () => {
          input.value = "";
          applyFilters();
        });
      }
    }
    for (const input of rangeInputs) {
      if (!input.value) continue;
      const label = input.closest("label")?.querySelector("span")?.textContent || "Range";
      addFilterChip(label, input.value, () => {
        input.value = "";
        applyFilters();
      });
    }
    for (const group of chipGroups) {
      for (const value of group.active) {
        addFilterChip(group.label, value, () => {
          group.active.delete(value);
          syncChipButtons();
          applyFilters();
        });
      }
    }
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
    syncSortButtons();
    renderActiveFilters();
    writeState();
  }

  const debouncedApply = debounce(applyFilters);
  search.addEventListener("input", debouncedApply);
  for (const input of [sort, tier, category, status]) {
    input.addEventListener("change", applyFilters);
  }
  for (const input of rangeInputs) {
    input.addEventListener("input", debouncedApply);
  }
  for (const group of chipGroups) {
    for (const button of group.buttons) {
      button.addEventListener("click", () => {
        const value = button.dataset[group.buttonKey];
        if (group.active.has(value)) group.active.delete(value);
        else group.active.add(value);
        syncChipButtons();
        applyFilters();
      });
    }
  }
  for (const button of sortButtons) {
    button.addEventListener("click", () => {
      sort.value = button.dataset.sortValue;
      applyFilters();
    });
  }

  clear.addEventListener("click", () => {
    search.value = "";
    sort.value = "rank";
    tier.value = "";
    category.value = "";
    status.value = "";
    for (const input of rangeInputs) input.value = "";
    for (const group of chipGroups) group.active.clear();
    syncChipButtons();
    applyFilters();
  });

  restoreState();
  applyFilters();
}

function wirePlanEditor() {
  const root = document.querySelector("[data-plan-editor]");
  if (!root) return;
  const rows = root.querySelector("[data-plan-rows]");
  const template = root.querySelector("[data-plan-template]");
  const add = document.querySelector("[data-add-plan]");
  const form = root.closest("form");

  function setFieldError(input, message) {
    input.classList.toggle("invalid", Boolean(message));
    input.setCustomValidity(message);
    let error = input.parentElement?.querySelector(".field-error");
    if (!message) {
      error?.remove();
      return;
    }
    if (!error) {
      error = document.createElement("span");
      error.className = "field-error";
      input.parentElement?.appendChild(error);
    }
    error.textContent = message;
  }

  function validateNumberInput(input) {
    if (!input.value.trim()) {
      setFieldError(input, "");
      return true;
    }
    const value = parseNumber(input.value);
    let message = "";
    if (value === null) message = "Use a number.";
    else if (value < 0) message = "Use zero or higher.";
    setFieldError(input, message);
    return !message;
  }

  function validatePlanRows() {
    const inputs = Array.from(root.querySelectorAll("[data-plan-number]"));
    return inputs.every(validateNumberInput);
  }

  add?.addEventListener("click", () => {
    rows.appendChild(template.content.cloneNode(true));
    const lastRow = rows.querySelector("[data-plan-row]:last-child input");
    lastRow?.focus();
  });

  root.addEventListener("click", (event) => {
    const remove = event.target.closest("[data-remove-plan]");
    if (!remove) return;
    const row = remove.closest("[data-plan-row]");
    row?.remove();
  });

  root.addEventListener("input", (event) => {
    const input = event.target.closest("[data-plan-number]");
    if (input) validateNumberInput(input);
  });

  root.addEventListener("blur", (event) => {
    const input = event.target.closest("[data-plan-number]");
    if (input) validateNumberInput(input);
  }, true);

  form?.addEventListener("submit", (event) => {
    if (validatePlanRows()) return;
    event.preventDefault();
    root.querySelector(".invalid")?.focus();
  });
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

  function markChanged() {
    refreshRanks();
    if (status) status.textContent = "Order changed. Save to persist.";
  }

  function moveItem(item, direction) {
    if (!item) return;
    const sibling = direction === "up" ? item.previousElementSibling : item.nextElementSibling;
    if (!sibling || !sibling.classList.contains("reorder-item")) return;
    if (direction === "up") list.insertBefore(item, sibling);
    else list.insertBefore(sibling, item);
    item.focus();
    markChanged();
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
    markChanged();
  });

  list.addEventListener("dragover", (event) => {
    event.preventDefault();
    const target = event.target.closest(".reorder-item");
    if (!target || !dragging || target === dragging) return;
    const box = target.getBoundingClientRect();
    const after = event.clientY > box.top + box.height / 2;
    list.insertBefore(dragging, after ? target.nextSibling : target);
  });

  list.addEventListener("click", (event) => {
    const button = event.target.closest("[data-move-order]");
    if (!button) return;
    moveItem(button.closest(".reorder-item"), button.dataset.moveOrder);
  });

  list.addEventListener("keydown", (event) => {
    if (!event.altKey || !["ArrowUp", "ArrowDown"].includes(event.key)) return;
    const item = event.target.closest(".reorder-item");
    if (!item) return;
    event.preventDefault();
    moveItem(item, event.key === "ArrowUp" ? "up" : "down");
  });

  save.addEventListener("click", async () => {
    const order = Array.from(list.querySelectorAll(".reorder-item")).map((item) => item.dataset.id);
    const endpoint = save.dataset.reorderEndpoint;
    if (!endpoint) {
      status.textContent = "Save endpoint missing.";
      return;
    }
    status.textContent = "Saving...";
    save.disabled = true;
    try {
      const response = await fetch(endpoint, {
        method: "POST",
        headers: {"Content-Type": "application/json"},
        body: JSON.stringify({order}),
      });
      status.textContent = response.ok ? "Saved." : "Save failed.";
    } catch {
      status.textContent = "Save failed.";
    } finally {
      save.disabled = false;
    }
  });
}

document.addEventListener("DOMContentLoaded", () => {
  wireDirectoryFilters();
  wirePlanEditor();
  wireReorder();
});
