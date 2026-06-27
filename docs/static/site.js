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

function escapeHtml(value) {
  return String(value || "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
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
  const hostingType = root.querySelector("[data-filter-hosting-type]");
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
    setText(row, "[data-selected-memory]", formatMetric(offer.memorySpeed, " MHz"));
    setText(row, "[data-selected-benchmark]", offer.benchmark || "-");
    setText(row, "[data-selected-price]", offer.price ? `${offer.estimated ? "Approx. " : ""}$${offer.price}/mo` : "No price");
    setText(row, "[data-selected-price-per-gb]", offer.pricePerGb ? `$${offer.pricePerGb}/GB` : "-");
    setText(row, "[data-selected-plan]", offer.planName || "Plan");
    setText(row, "[data-selected-tier-chip]", `${offer.estimated ? "Estimated" : "Showing"} ${offer.label || offer.planName || "Default tier"}`);
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
    hostingType.value = params.get("hosting_type") || "";
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
    if (hostingType.value) params.set("hosting_type", hostingType.value);
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
    const matchesHostingType =
      !hostingType.value || splitValues(row.dataset.hostingTypes).includes(hostingType.value);
    const matchesStatus = !status.value || row.dataset.status === status.value;
    const matchesGroups = chipGroups.every((group) => {
      if (group.offerKey) return true;
      const rowValues = splitValues(row.dataset[group.rowKey]);
      return Array.from(group.active).every((value) => rowValues.includes(value));
    });
    const matchesOffers = candidateOffers(row).length > 0;
    return (
      matchesQuery
      && matchesTier
      && matchesCategory
      && matchesHostingType
      && matchesStatus
      && matchesGroups
      && matchesOffers
    );
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
      ["Type", hostingType],
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
  for (const input of [sort, tier, category, hostingType, status]) {
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
    set("[data-tier-detail-label]", offer.label || offer.planName || "Selected plan");
    set("[data-tier-detail-price]", offer.price ? `${offer.estimated ? "Approx. " : ""}${formatMoney(offer.price, "/mo")}` : "-");
    set("[data-tier-detail-price-per-gb]", formatMoney(offer.pricePerGb, "/GB"));
    set("[data-tier-detail-ram]", formatGb(offer.planRam));
    set("[data-tier-detail-players]", offer.players || "-");
    set("[data-tier-detail-cpu]", offer.cpuModel || "-");
    set("[data-tier-detail-cores]", offer.cores || "-");
    set("[data-tier-detail-ghz]", `${offer.baseGhz || "-"} / ${offer.peakGhz || "-"} GHz`);
    set("[data-tier-detail-memory-speed]", offer.memorySpeed ? `${offer.memorySpeed} MHz` : "-");
    set("[data-tier-detail-benchmark]", offer.benchmark || "-");
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
  const form = document.querySelector("[data-host-form]");
  const root = document.querySelector("[data-plan-editor]");
  const modeSwitch = document.querySelector("[data-plan-mode-switch]");
  const panels = Array.from(document.querySelectorAll("[data-entry-panel]"));
  const packageRows = document.querySelector("[data-package-rows]");
  const packageTemplate = document.querySelector("[data-package-template]");
  const cpuRows = document.querySelector("[data-cpu-rows]");
  const cpuTemplate = document.querySelector("[data-cpu-template]");
  const packageOptions = document.querySelector("#package-name-options");
  const preview = document.querySelector("[data-estimate-preview]");
  if (!form || (!root && !modeSwitch)) return;

  const defaultRamSamples = [1, 2, 4, 6, 8, 12, 16, 24, 32, 48, 64, 96, 128, 256];

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
    const inputs = Array.from(form.querySelectorAll("[data-plan-number]"));
    return inputs.every(validateNumberInput);
  }

  function selectedMode() {
    return form.querySelector('input[name="plan_entry_mode"]:checked')?.value || "estimated";
  }

  function syncMode() {
    const mode = selectedMode();
    for (const panel of panels) {
      panel.hidden = panel.dataset.entryPanel !== mode;
    }
    renderEstimatePreview();
  }

  function splitValues(value) {
    return String(value || "").split(/\n|,/).map((item) => item.trim()).filter(Boolean);
  }

  function value(row, name) {
    return row.querySelector(`[name="${name}"]`)?.value.trim() || "";
  }

  function numberValue(raw) {
    const value = parseNumber(raw);
    return value === null ? null : value;
  }

  function formatNumber(value) {
    if (value === null || value === undefined || Number.isNaN(value)) return "";
    return Number.isInteger(value) ? String(value) : String(Number(value.toFixed(2))).replace(/\.0+$/, "");
  }

  function packageLabel(row) {
    return value(row, "package_name") || value(row, "package_id") || "Package";
  }

  function packageKey(row) {
    return (value(row, "package_id") || packageLabel(row)).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  }

  function readPackages() {
    return Array.from(packageRows?.querySelectorAll("[data-package-row]") || []).map((row) => ({
      key: packageKey(row),
      name: packageLabel(row),
      pricePerGb: numberValue(value(row, "package_price_per_gb_usd")),
      ramMin: numberValue(value(row, "package_ram_min_gb")),
      ramMax: numberValue(value(row, "package_ram_max_gb")),
      samples: splitValues(value(row, "package_sample_ram_gb")).map(numberValue).filter((item) => item !== null && item > 0),
      regions: splitValues(value(row, "package_location_tags")),
      support: splitValues(value(row, "package_support_channels")),
    })).filter((item) => item.name !== "Package" || item.pricePerGb !== null || item.ramMin !== null || item.ramMax !== null || item.samples.length);
  }

  function readCpus() {
    return Array.from(cpuRows?.querySelectorAll("[data-cpu-row]") || []).map((row) => ({
      label: value(row, "cpu_label") || value(row, "cpu_cpu_model") || "CPU",
      packageKey: (value(row, "cpu_package_id") || "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, ""),
      model: value(row, "cpu_cpu_model"),
      cores: value(row, "cpu_cpu_cores"),
      peak: value(row, "cpu_boost_clock_ghz"),
      benchmark: value(row, "cpu_benchmark_score"),
    })).filter((item) => item.label !== "CPU" || item.model || item.cores || item.peak || item.benchmark);
  }

  function ramSamplesForPackage(pkg) {
    let samples = pkg.samples.length ? [...pkg.samples] : [];
    if (!samples.length && (pkg.ramMin !== null || pkg.ramMax !== null)) {
      const min = pkg.ramMin ?? 1;
      const max = pkg.ramMax ?? min;
      samples = defaultRamSamples.filter((sample) => sample >= min && sample <= max);
    }
    if (pkg.ramMin !== null) samples.push(pkg.ramMin);
    if (pkg.ramMax !== null) samples.push(pkg.ramMax);
    if (pkg.ramMin !== null) samples = samples.filter((sample) => sample >= pkg.ramMin);
    if (pkg.ramMax !== null) samples = samples.filter((sample) => sample <= pkg.ramMax);
    return [...new Set(samples.filter((sample) => sample > 0))].sort((a, b) => a - b);
  }

  function syncPackageOptions() {
    if (!packageOptions) return;
    packageOptions.textContent = "";
    for (const pkg of readPackages()) {
      const option = document.createElement("option");
      option.value = pkg.name;
      packageOptions.appendChild(option);
    }
  }

  function renderEstimatePreview() {
    if (!preview) return;
    syncPackageOptions();
    if (selectedMode() !== "estimated") {
      preview.textContent = "";
      return;
    }
    const packages = readPackages();
    const cpus = readCpus();
    const rows = [];
    for (const pkg of packages) {
      const matchingCpus = cpus.filter((cpu) => !cpu.packageKey || cpu.packageKey === pkg.key);
      const cpuList = matchingCpus.length ? matchingCpus : [{label: "Listed CPU", model: "", cores: "", peak: "", benchmark: ""}];
      for (const cpu of cpuList) {
        for (const ram of ramSamplesForPackage(pkg)) {
          rows.push({
            label: `${pkg.name} / ${cpu.label} / ${formatNumber(ram)} GB`,
            price: pkg.pricePerGb === null ? "" : formatNumber(pkg.pricePerGb * ram),
            perGb: pkg.pricePerGb === null ? "" : formatNumber(pkg.pricePerGb),
            cpu: cpu.model || cpu.label,
            cores: cpu.cores,
            peak: cpu.peak,
            benchmark: cpu.benchmark,
            regions: pkg.regions.join(", "),
            support: pkg.support.join(", "),
          });
        }
      }
    }
    if (!rows.length) {
      preview.innerHTML = '<strong>Generated estimate preview</strong><p class="muted">Add a package with RAM range or samples to preview generated rows.</p>';
      return;
    }
    const sampleRows = rows.slice(0, 10).map((row) => `
      <article class="estimate-preview-card">
        <strong>${escapeHtml(row.label)}</strong>
        <dl>
          <div><dt>Price</dt><dd>${row.price ? `$${escapeHtml(row.price)}/mo` : "-"}</dd></div>
          <div><dt>$/GB</dt><dd>${row.perGb ? `$${escapeHtml(row.perGb)}/GB` : "-"}</dd></div>
          <div><dt>CPU</dt><dd>${escapeHtml(row.cpu || "-")}</dd></div>
          <div><dt>Cores</dt><dd>${escapeHtml(row.cores || "-")}</dd></div>
          <div><dt>Peak</dt><dd>${row.peak ? `${escapeHtml(row.peak)} GHz` : "-"}</dd></div>
          <div><dt>Regions</dt><dd>${escapeHtml(row.regions || "-")}</dd></div>
        </dl>
      </article>
    `);
    preview.innerHTML = `
      <strong>Generated estimate preview</strong>
      <p class="muted">${rows.length} estimated comparison row${rows.length === 1 ? "" : "s"} will be generated. Showing first ${Math.min(rows.length, 10)}.</p>
      <div class="estimate-preview-list">${sampleRows.join("")}</div>
    `;
  }

  function addFromTemplate(container, template, rowSelector) {
    if (!container || !template) return;
    container.appendChild(template.content.cloneNode(true));
    container.querySelector(`${rowSelector}:last-child input`)?.focus();
    renderEstimatePreview();
  }

  document.querySelector("[data-add-plan]")?.addEventListener("click", () => {
    addFromTemplate(root?.querySelector("[data-plan-rows]"), root?.querySelector("[data-plan-template]"), "[data-plan-row]");
  });

  document.querySelector("[data-add-package]")?.addEventListener("click", () => {
    addFromTemplate(packageRows, packageTemplate, "[data-package-row]");
  });

  document.querySelector("[data-add-cpu]")?.addEventListener("click", () => {
    addFromTemplate(cpuRows, cpuTemplate, "[data-cpu-row]");
  });

  form.addEventListener("click", (event) => {
    const removePlan = event.target.closest("[data-remove-plan]");
    const removePackage = event.target.closest("[data-remove-package]");
    const removeCpu = event.target.closest("[data-remove-cpu]");
    if (removePlan) removePlan.closest("[data-plan-row]")?.remove();
    if (removePackage) removePackage.closest("[data-package-row]")?.remove();
    if (removeCpu) removeCpu.closest("[data-cpu-row]")?.remove();
    if (removePlan || removePackage || removeCpu) renderEstimatePreview();
  });

  form.addEventListener("input", (event) => {
    const input = event.target.closest("[data-plan-number]");
    if (input) validateNumberInput(input);
    if (event.target.closest("[data-package-row], [data-cpu-row]")) renderEstimatePreview();
  });

  form.addEventListener("change", (event) => {
    if (event.target.matches('input[name="plan_entry_mode"]')) syncMode();
    if (event.target.closest("[data-package-row], [data-cpu-row]")) renderEstimatePreview();
  });

  form.addEventListener("blur", (event) => {
    const input = event.target.closest("[data-plan-number]");
    if (input) validateNumberInput(input);
  }, true);

  form?.addEventListener("submit", (event) => {
    if (validatePlanRows()) return;
    event.preventDefault();
    form.querySelector(".invalid")?.focus();
  });

  syncMode();
}

function wireAiImport() {
  const panel = document.querySelector("[data-ai-import]");
  if (!panel) return;
  const form = panel.closest("form");
  const endpoint = panel.dataset.aiImportEndpoint;
  const run = panel.querySelector("[data-ai-import-run]");
  const status = panel.querySelector("[data-ai-import-status]");
  const sources = panel.querySelector("[data-ai-import-sources]");
  const urlInput = panel.querySelector("[data-ai-import-url]");
  const modelInput = panel.querySelector("[data-ai-import-model]");
  const notesInput = panel.querySelector("[data-ai-import-notes]");
  const webSearchInput = panel.querySelector("[data-ai-import-web-search]");

  function setStatus(message, tone = "") {
    if (!status) return;
    status.textContent = message;
    status.dataset.tone = tone;
  }

  function values(value) {
    if (Array.isArray(value)) return value.filter(Boolean);
    if (!value) return [];
    return String(value).split(/\n|,/).map((item) => item.trim()).filter(Boolean);
  }

  function setField(name, value) {
    const field = form?.elements[name];
    if (!field || field instanceof RadioNodeList) return;
    field.value = value || "";
  }

  function setListField(name, value) {
    setField(name, values(value).join("\n"));
  }

  function setCheckboxGroup(name, selectedValues) {
    const selected = new Set(values(selectedValues));
    for (const input of form.querySelectorAll(`input[name="${name}"]`)) {
      input.checked = selected.has(input.value);
    }
  }

  function setRadioGroup(name, value) {
    for (const input of form.querySelectorAll(`input[name="${name}"]`)) {
      input.checked = input.value === value;
    }
  }

  function setPlanField(row, field, value) {
    const input = row.querySelector(`[name="plan_${field}"]`);
    if (!input) return;
    if (["location_tags", "support_channels", "server_types"].includes(field)) {
      input.value = values(value).join("\n");
      return;
    }
    input.value = value || "";
  }

  function replacePlanRows(plans) {
    const rows = form.querySelector("[data-plan-rows]");
    const template = form.querySelector("[data-plan-template]");
    if (!rows || !template) return;
    rows.textContent = "";
    const draftPlans = plans?.length ? plans : [{}];
    for (const plan of draftPlans) {
      rows.appendChild(template.content.cloneNode(true));
      const row = rows.querySelector("[data-plan-row]:last-child");
      for (const field of [
        "name",
        "price_monthly_usd",
        "ram_gb",
        "player_slots",
        "recommended_players",
        "storage_gb",
        "storage_type",
        "plan_url",
        "price_notes",
        "cpu_model",
        "cpu_vendor",
        "cpu_cores",
        "cpu_allocation",
        "advertised_clock_ghz",
        "boost_clock_ghz",
        "memory_speed_mhz",
        "benchmark_score",
        "panel",
        "ddos_protection",
        "modpack_support",
        "location_tags",
        "support_channels",
        "server_types",
        "support_notes",
        "notes",
      ]) {
        setPlanField(row, field, plan?.[field]);
      }
    }
  }

  function setPackageField(row, field, value) {
    const input = row.querySelector(`[name="package_${field}"]`);
    if (!input) return;
    if (["sample_ram_gb", "locations", "location_tags", "support_channels", "server_types"].includes(field)) {
      input.value = values(value).join("\n");
      return;
    }
    input.value = value || "";
  }

  function replacePackageRows(packages) {
    const rows = form.querySelector("[data-package-rows]");
    const template = form.querySelector("[data-package-template]");
    if (!rows || !template) return;
    rows.textContent = "";
    const draftPackages = packages?.length ? packages : [{}];
    for (const packageRow of draftPackages) {
      rows.appendChild(template.content.cloneNode(true));
      const row = rows.querySelector("[data-package-row]:last-child");
      for (const field of [
        "id",
        "name",
        "price_per_gb_usd",
        "ram_min_gb",
        "ram_max_gb",
        "plan_url",
        "storage_gb",
        "storage_type",
        "panel",
        "ddos_protection",
        "modpack_support",
        "player_slots_per_gb",
        "recommended_players_per_gb",
        "sample_ram_gb",
        "locations",
        "location_tags",
        "support_channels",
        "server_types",
        "support_notes",
        "price_notes",
        "notes",
      ]) {
        setPackageField(row, field, packageRow?.[field]);
      }
    }
  }

  function setCpuField(row, field, value) {
    const input = row.querySelector(`[name="${field === "notes" ? "cpu_option_notes" : `cpu_${field}`}"]`);
    if (input) input.value = value || "";
  }

  function replaceCpuRows(cpus) {
    const rows = form.querySelector("[data-cpu-rows]");
    const template = form.querySelector("[data-cpu-template]");
    if (!rows || !template) return;
    rows.textContent = "";
    const draftCpus = cpus?.length ? cpus : [{}];
    for (const cpu of draftCpus) {
      rows.appendChild(template.content.cloneNode(true));
      const row = rows.querySelector("[data-cpu-row]:last-child");
      for (const field of [
        "id",
        "label",
        "package_id",
        "cpu_model",
        "cpu_vendor",
        "cpu_cores",
        "cpu_allocation",
        "advertised_clock_ghz",
        "boost_clock_ghz",
        "memory_speed_mhz",
        "benchmark_score",
        "notes",
      ]) {
        setCpuField(row, field, cpu?.[field]);
      }
    }
  }

  function escapeHtml(value) {
    return String(value || "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;");
  }

  function renderSources(sourceUrls, warnings) {
    if (!sources) return;
    const items = [
      ...(sourceUrls || []).slice(0, 8).map((source) => `<li><a href="${escapeHtml(source)}" rel="noreferrer">${escapeHtml(source)}</a></li>`),
      ...(warnings || []).map((warning) => `<li class="warning">${escapeHtml(warning)}</li>`),
    ];
    sources.hidden = !items.length;
    sources.innerHTML = items.length ? `<strong>Import context</strong><ul>${items.join("")}</ul>` : "";
  }

  function fillHost(host, plans) {
    for (const field of [
      "name",
      "website_url",
      "plan_url",
      "logo_url",
      "summary",
      "cpu_model",
      "cpu_vendor",
      "advertised_clock_ghz",
      "boost_clock_ghz",
      "memory_speed_mhz",
      "benchmark_score",
      "benchmark_notes",
      "cpu_notes",
      "ram_notes",
      "storage_type",
      "panel",
      "ddos_protection",
      "modpack_support",
      "support_notes",
      "price_notes",
      "last_verified",
      "status",
      "trust_notes",
      "recommendation_tier",
      "caveats",
    ]) {
      setField(field, host?.[field]);
    }
    for (const field of [
      "tags",
      "locations",
      "location_tags",
      "support_channels",
      "server_types",
      "source_urls",
      "pros",
      "cons",
    ]) {
      setListField(field, host?.[field]);
    }
    setCheckboxGroup("hosting_types", host?.hosting_types || ["minecraft"]);
    setCheckboxGroup("category_picks", host?.category_picks || []);
    setRadioGroup("plan_entry_mode", host?.plan_entry_mode || "estimated");
    replacePackageRows(host?.pricing_packages || []);
    replaceCpuRows(host?.cpu_options || []);
    replacePlanRows(plans || host?.plans || []);
    form.dispatchEvent(new Event("change", {bubbles: true}));
    form.dispatchEvent(new Event("input", {bubbles: true}));
  }

  async function runImport() {
    if (!endpoint || !urlInput?.value.trim()) {
      setStatus("Enter a webpage URL.", "error");
      urlInput?.focus();
      return;
    }
    run.disabled = true;
    setStatus("Fetching pages and asking Ollama...");
    renderSources([], []);
    try {
      const response = await fetch(endpoint, {
        method: "POST",
        headers: {"Content-Type": "application/json"},
        body: JSON.stringify({
          url: urlInput.value.trim(),
          notes: notesInput?.value || "",
          model: modelInput?.value || "",
          web_search: Boolean(webSearchInput?.checked),
        }),
      });
      const payload = await response.json();
      if (!response.ok || !payload.ok) throw new Error(payload.error || "Import failed.");
      fillHost(payload.host, payload.plan_tiers);
      renderSources(payload.sources, payload.warnings);
      const estimateRows = (payload.pricing_packages?.length || 0) + (payload.cpu_options?.length || 0);
      const exactRows = payload.plan_tiers?.length || 0;
      const modeLabel = payload.host?.plan_entry_mode === "exact"
        ? `${exactRows} exact plan row(s)`
        : `${estimateRows} package/CPU row(s)`;
      setStatus(`Draft filled with ${modeLabel}. Review before saving.`, "success");
    } catch (error) {
      setStatus(error.message || "Import failed.", "error");
    } finally {
      run.disabled = false;
    }
  }

  run?.addEventListener("click", runImport);
  panel.addEventListener("keydown", (event) => {
    if (event.key !== "Enter" || !event.target.matches("input")) return;
    event.preventDefault();
    runImport();
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
  wireAiImport();
  wireReorder();
});
