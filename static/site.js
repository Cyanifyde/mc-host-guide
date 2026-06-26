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
  const counts = Array.from(document.querySelectorAll("[data-result-count]"));
  const empty = document.querySelector("[data-empty-results]");
  const clear = root.querySelector("[data-clear-filters]");
  const activeFilterRoot = document.querySelector("[data-active-filters]");
  const mobileFilterToggle = document.querySelector("[data-mobile-filter-toggle]");
  const rangeInputs = Array.from(root.querySelectorAll("[data-range-key]"));
  const exactInputs = Array.from(root.querySelectorAll("[data-exact-key]"));
  const sliderInputs = Array.from(root.querySelectorAll("[data-slider-target]"));
  const sortButtons = Array.from(document.querySelectorAll("[data-sort-button]"));
  const rows = Array.from(body.querySelectorAll(".host-row"));

  for (const row of rows) {
    try {
      row._offers = JSON.parse(row.dataset.offers || "[]");
    } catch {
      row._offers = [];
    }
  }

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
      offerKey: "locationTags",
      buttonKey: "locationFilter",
      buttons: Array.from(root.querySelectorAll("[data-location-filter]")),
      active: new Set(),
    },
    {
      label: "Support",
      param: "support",
      rowKey: "support",
      offerKey: "supportChannels",
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

  function pairedSliderControl(slider) {
    const target = slider.dataset.sliderTarget;
    return root.querySelector(`[data-range-param="${target}"], [data-exact-param="${target}"]`);
  }

  function sliderForInput(input) {
    const param = input.dataset.rangeParam || input.dataset.exactParam;
    if (!param) return null;
    return root.querySelector(`[data-slider-target="${param}"]`);
  }

  function syncSliderFromInput(input) {
    const slider = sliderForInput(input);
    if (!slider) return;
    slider.value = input.value || slider.min || "0";
  }

  function syncSlidersFromInputs() {
    for (const input of [...rangeInputs, ...exactInputs]) syncSliderFromInput(input);
  }

  function offerMetric(offer, key) {
    return parseNumber(offer?.[key]);
  }

  function rangeMatchesOffer(offer, key) {
    const range = rangeFor(key);
    if (range.min === null && range.max === null) return true;
    const value = offerMetric(offer, key);
    if (value === null) return false;
    if (range.min !== null && value < range.min) return false;
    if (range.max !== null && value > range.max) return false;
    return true;
  }

  function exactMatchesOffer(offer, input) {
    const expected = parseNumber(input.value);
    if (expected === null) return true;
    const actual = offerMetric(offer, input.dataset.exactKey);
    return actual !== null && actual === expected;
  }

  function fallbackOffer(row) {
    return {
      label: "Default tier",
      price: row.dataset.price || "",
      pricePerGb: row.dataset.pricePerGb || "",
      planRam: row.dataset.planRam || "",
      players: row.dataset.players || "",
      recommendedPlayers: row.dataset.recommendedPlayers || "",
      cores: row.dataset.cores || "",
      cpuModel: row.dataset.cpuModel || "",
      baseGhz: row.dataset.baseGhz || "",
      peakGhz: row.dataset.peakGhz || "",
      maxMemory: row.dataset.maxMemory || "",
      memorySpeed: row.dataset.memorySpeed || "",
      benchmark: row.dataset.benchmark || "",
      locationTags: splitValues(row.dataset.locationTags),
      supportChannels: splitValues(row.dataset.support),
      panel: "",
      ddosProtection: "",
      modpackSupport: "",
      supportNotes: "",
    };
  }

  function offersFor(row) {
    return row._offers?.length ? row._offers : [fallbackOffer(row)];
  }

  function candidateOffers(row) {
    let candidates = offersFor(row);
    for (const group of chipGroups) {
      if (!group.offerKey || !group.active.size) continue;
      candidates = candidates.filter((offer) => {
        const values = offer[group.offerKey] || [];
        return Array.from(group.active).every((value) => values.includes(value));
      });
    }
    const rangeKeys = Array.from(new Set(rangeInputs.map((input) => input.dataset.rangeKey)));
    candidates = candidates.filter((offer) => rangeKeys.every((key) => rangeMatchesOffer(offer, key)));
    candidates = candidates.filter((offer) => exactInputs.every((input) => exactMatchesOffer(offer, input)));
    return candidates;
  }

  function offerSortSpec() {
    const value = sort.value;
    if (value === "price-asc") return ["price", "asc"];
    if (value === "price-per-gb-asc") return ["pricePerGb", "asc"];
    if (value === "plan-ram-desc") return ["planRam", "desc"];
    if (value === "cpu-cores-desc") return ["cores", "desc"];
    if (value === "players-desc") return ["players", "desc"];
    if (value === "base-ghz-desc") return ["baseGhz", "desc"];
    if (value === "peak-ghz-desc") return ["peakGhz", "desc"];
    if (value === "max-memory-desc") return ["maxMemory", "desc"];
    if (value === "memory-speed-desc") return ["memorySpeed", "desc"];
    if (value === "benchmark-desc") return ["benchmark", "desc"];
    return null;
  }

  function compareOfferMetric(a, b, key, direction = "desc") {
    const aValue = offerMetric(a, key);
    const bValue = offerMetric(b, key);
    if (aValue === null && bValue === null) return 0;
    if (aValue === null) return 1;
    if (bValue === null) return -1;
    return direction === "asc" ? aValue - bValue : bValue - aValue;
  }

  function selectedOffer(row) {
    const candidates = candidateOffers(row);
    const offers = candidates.length ? candidates : offersFor(row);
    const sortSpec = offerSortSpec();
    if (sortSpec) {
      const [key, direction] = sortSpec;
      return [...offers].sort((a, b) => compareOfferMetric(a, b, key, direction))[0];
    }
    const exactCore = exactInputs.find((input) => input.dataset.exactKey === "cores" && input.value);
    if (exactCore) {
      return [...offers].sort((a, b) => compareOfferMetric(a, b, "price", "asc"))[0];
    }
    return offers[0];
  }

  function formatMetric(value, suffix = "") {
    return value ? `${value}${suffix}` : "-";
  }

  function setText(row, selector, value) {
    const target = row.querySelector(selector);
    if (target) target.textContent = value;
  }

  function renderSelectedOffer(row, offer) {
    if (!offer) return;
    setText(row, "[data-selected-cpu]", offer.cpuModel || "Unknown CPU");
    setText(row, "[data-selected-hardware]", offer.hardwareName || "Default hardware");
    setText(row, "[data-selected-tier-label]", offer.label || "Default tier");
    setText(row, "[data-selected-cores]", offer.cores || "-");
    setText(row, "[data-selected-base]", formatMetric(offer.baseGhz, " GHz"));
    setText(row, "[data-selected-peak]", formatMetric(offer.peakGhz, " GHz"));
    setText(row, "[data-selected-max-memory]", formatMetric(offer.maxMemory, " GB"));
    setText(row, "[data-selected-memory]", formatMetric(offer.memorySpeed, " MHz"));
    setText(row, "[data-selected-benchmark]", offer.benchmark || "-");
    setText(row, "[data-selected-price]", offer.price ? `$${offer.price}/mo` : "No price");
    setText(row, "[data-selected-price-per-gb]", offer.pricePerGb ? `$${offer.pricePerGb}/GB` : "-");
    setText(row, "[data-selected-plan]", offer.planName || "Plan");
    setText(row, "[data-selected-tier-chip]", `Showing ${offer.label || offer.planName || "Default tier"}`);
    setText(
      row,
      "[data-selected-plan-detail]",
      `${offer.planRam || "-"} GB RAM - ${offer.players || "-"} slots - ${offer.storage || "-"} GB storage`,
    );

    const regions = row.querySelector("[data-selected-regions]");
    if (regions) {
      regions.textContent = "";
      const tags = offer.locationTags || [];
      if (!tags.length) {
        const emptyTag = document.createElement("span");
        emptyTag.className = "muted";
        emptyTag.textContent = "Unknown";
        regions.appendChild(emptyTag);
      } else {
        for (const tag of tags) {
          const pill = document.createElement("span");
          pill.className = "pill location-pill";
          pill.textContent = tag;
          regions.appendChild(pill);
        }
      }
    }

    const support = row.querySelector("[data-selected-support]");
    if (support) {
      support.textContent = "";
      const channels = offer.supportChannels || [];
      if (!channels.length) {
        const emptyChannel = document.createElement("span");
        emptyChannel.className = "muted";
        emptyChannel.textContent = "Unknown";
        support.appendChild(emptyChannel);
      } else {
        for (const channel of channels) {
          const pill = document.createElement("span");
          pill.className = "pill support-pill";
          pill.textContent = channel;
          support.appendChild(pill);
        }
      }
    }

    const featureParts = [offer.panel, offer.ddosProtection, offer.modpackSupport].filter(Boolean);
    setText(row, "[data-selected-features]", featureParts.length ? featureParts.join(" - ") : "Unknown features");
    setText(row, "[data-selected-support-note]", offer.supportNotes || offer.priceNotes || "");

    const hostLink = row.querySelector("[data-selected-host-link]");
    if (hostLink && row.dataset.detailUrl) {
      const tierParam = offer.id ? `?tier=${encodeURIComponent(offer.id)}` : "";
      hostLink.href = `${row.dataset.detailUrl}${tierParam}`;
    }
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
    for (const input of exactInputs) {
      input.value = params.get(input.dataset.exactParam) || "";
    }

    for (const group of chipGroups) {
      group.active.clear();
      for (const value of (params.get(group.param) || "").split(",").filter(Boolean)) {
        group.active.add(value);
      }
    }
    syncChipButtons();
    syncSlidersFromInputs();
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
    for (const input of exactInputs) {
      if (input.value) params.set(input.dataset.exactParam, input.value);
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
      if (group.offerKey) return true;
      const rowValues = splitValues(row.dataset[group.rowKey]);
      return Array.from(group.active).every((value) => rowValues.includes(value));
    });
    const matchesOffers = candidateOffers(row).length > 0;
    return matchesQuery && matchesTier && matchesCategory && matchesStatus && matchesGroups && matchesOffers;
  }

  function compareNumber(a, b, key, direction = "desc") {
    const aValue = offerMetric(a._selectedOffer, key);
    const bValue = offerMetric(b._selectedOffer, key);
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
      if (value === "price-per-gb-asc") return compareNumber(a, b, "pricePerGb", "asc");
      if (value === "plan-ram-desc") return compareNumber(a, b, "planRam");
      if (value === "cpu-cores-desc") return compareNumber(a, b, "cores");
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
        syncSliderFromInput(input);
        applyFilters();
      });
    }
    for (const input of exactInputs) {
      if (!input.value) continue;
      const label = input.closest("label")?.querySelector("span")?.textContent || "Exact";
      addFilterChip(label, input.value, () => {
        input.value = "";
        syncSliderFromInput(input);
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
    for (const row of rows) {
      row._selectedOffer = selectedOffer(row);
      renderSelectedOffer(row, row._selectedOffer);
    }
    const visibleRows = sortRows(rows.filter(rowMatches));
    for (const row of rows) row.hidden = true;
    for (const row of visibleRows) {
      row.hidden = false;
      body.appendChild(row);
    }
    for (const counter of counts) counter.textContent = visibleRows.length;
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
    input.addEventListener("input", () => {
      syncSliderFromInput(input);
      debouncedApply();
    });
  }
  for (const input of exactInputs) {
    input.addEventListener("input", () => {
      syncSliderFromInput(input);
      debouncedApply();
    });
  }
  for (const slider of sliderInputs) {
    slider.addEventListener("input", () => {
      const input = pairedSliderControl(slider);
      if (!input) return;
      input.value = slider.value === slider.min ? "" : slider.value;
      debouncedApply();
    });
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
    for (const input of exactInputs) input.value = "";
    syncSlidersFromInputs();
    for (const group of chipGroups) group.active.clear();
    syncChipButtons();
    applyFilters();
  });

  mobileFilterToggle?.addEventListener("click", () => {
    const isOpen = root.classList.toggle("open");
    mobileFilterToggle.setAttribute("aria-expanded", String(isOpen));
  });

  restoreState();
  applyFilters();
}

function wireHostForm() {
  const form = document.querySelector("[data-host-form]");
  const status = document.querySelector("[data-unsaved-status]");
  if (!form || !status) return;

  let dirty = false;

  function markDirty() {
    if (dirty) return;
    dirty = true;
    status.textContent = "Unsaved changes";
    status.classList.add("dirty");
  }

  form.addEventListener("input", markDirty);
  form.addEventListener("change", markDirty);
  form.addEventListener("submit", () => {
    status.textContent = "Saving...";
    status.classList.remove("dirty");
  });
  document.addEventListener("keydown", (event) => {
    if (!(event.ctrlKey || event.metaKey) || event.key.toLowerCase() !== "s") return;
    event.preventDefault();
    form.requestSubmit();
  });
}

function wireHostTierDetail() {
  const detail = document.querySelector("[data-tier-detail]");
  const rows = Array.from(document.querySelectorAll("[data-tier-row]"));
  if (!detail || !rows.length) return;

  function readOffer(row) {
    try {
      return JSON.parse(row.dataset.tierOffer || "{}");
    } catch {
      return {};
    }
  }

  function set(selector, value) {
    const target = detail.querySelector(selector);
    if (target) target.textContent = value || "-";
  }

  function formatMoney(value, suffix = "") {
    return value ? `$${value}${suffix}` : "-";
  }

  function formatGb(value) {
    return value ? `${value} GB` : "-";
  }

  function selectTier(row, updateUrl = false) {
    if (!row) return;
    const offer = readOffer(row);
    for (const item of rows) item.classList.toggle("selected", item === row);
    set("[data-tier-detail-label]", offer.label || offer.planName || "Selected tier");
    set("[data-tier-detail-price]", formatMoney(offer.price, "/mo"));
    set("[data-tier-detail-price-per-gb]", formatMoney(offer.pricePerGb, "/GB"));
    set("[data-tier-detail-ram]", formatGb(offer.planRam));
    set("[data-tier-detail-players]", offer.players || "-");
    set("[data-tier-detail-cpu]", offer.cpuModel || "-");
    set("[data-tier-detail-cores]", offer.cores || "-");
    set("[data-tier-detail-ghz]", `${offer.baseGhz || "-"} / ${offer.peakGhz || "-"} GHz`);
    set(
      "[data-tier-detail-memory]",
      `${offer.maxMemory ? `${offer.maxMemory} GB` : "-"} max, ${offer.memorySpeed ? `${offer.memorySpeed} MHz` : "-"}`,
    );
    set("[data-tier-detail-regions]", (offer.locationTags || []).join(", ") || "-");
    set("[data-tier-detail-support]", (offer.supportChannels || []).join(", ") || "-");
    set(
      "[data-tier-detail-features]",
      [offer.panel, offer.ddosProtection, offer.modpackSupport].filter(Boolean).join(" - ") || "-",
    );
    set(
      "[data-tier-detail-storage]",
      `${offer.storage ? `${offer.storage} GB` : "-"}${offer.storageType ? `, ${offer.storageType}` : ""}`,
    );

    const link = detail.querySelector("[data-tier-detail-url]");
    if (link) {
      if (offer.url) link.href = offer.url;
      link.hidden = !offer.url && !link.getAttribute("href");
    }

    if (updateUrl && offer.id) {
      const params = new URLSearchParams(window.location.search);
      params.set("tier", offer.id);
      window.history.replaceState(null, "", `${window.location.pathname}?${params.toString()}`);
    }
  }

  for (const row of rows) {
    row.addEventListener("click", () => selectTier(row, true));
    row.addEventListener("keydown", (event) => {
      if (!["Enter", " "].includes(event.key)) return;
      event.preventDefault();
      selectTier(row, true);
    });
  }

  const requestedTier = new URLSearchParams(window.location.search).get("tier");
  const initial = rows.find((row) => row.dataset.tierId === requestedTier) || rows[0];
  selectTier(initial, false);
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
  wireHostTierDetail();
  wireHostForm();
  wirePlanEditor();
  wireReorder();
});
