function wireDirectoryFilters() {
  const root = document.querySelector("[data-directory-filters]");
  const list = document.querySelector("[data-directory-list]");
  if (!root || !list) return;

  const search = root.querySelector("[data-filter-search]");
  const tier = root.querySelector("[data-filter-tier]");
  const category = root.querySelector("[data-filter-category]");
  const cards = Array.from(list.querySelectorAll(".host-card"));

  function applyFilters() {
    const query = (search.value || "").trim().toLowerCase();
    const tierValue = tier.value;
    const categoryValue = category.value;
    for (const card of cards) {
      const matchesQuery = !query || (card.dataset.search || "").toLowerCase().includes(query);
      const matchesTier = !tierValue || card.dataset.tier === tierValue;
      const categories = (card.dataset.categories || "").split(" ");
      const matchesCategory = !categoryValue || categories.includes(categoryValue);
      card.hidden = !(matchesQuery && matchesTier && matchesCategory);
    }
  }

  search.addEventListener("input", applyFilters);
  tier.addEventListener("change", applyFilters);
  category.addEventListener("change", applyFilters);
}

document.addEventListener("DOMContentLoaded", wireDirectoryFilters);
