// Material-Katalog. Preise in CHF.
const MATERIALS = [
  {
    group: "GK / Graukarton (80 × 55 cm)",
    items: [
      { id: "gk-80x55-1.0", label: "1 mm",   price: 1.50 },
      { id: "gk-80x55-1.5", label: "1.5 mm", price: 1.80 },
      { id: "gk-80x55-2.0", label: "2 mm",   price: 2.20 },
      { id: "gk-80x55-2.5", label: "2.5 mm", price: 2.90 },
      { id: "gk-80x55-3.0", label: "3 mm",   price: 3.10 },
    ],
  },
  {
    group: "GK / Graukarton (80 × 110 cm)",
    items: [
      { id: "gk-80x110-1.0", label: "1 mm",   price: 2.75 },
      { id: "gk-80x110-1.5", label: "1.5 mm", price: 3.20 },
      { id: "gk-80x110-2.0", label: "2 mm",   price: 3.80 },
      { id: "gk-80x110-2.5", label: "2.5 mm", price: 5.10 },
      { id: "gk-80x110-3.0", label: "3 mm",   price: 5.35 },
    ],
  },
  {
    group: "HK / Holzkarton (90 × 60 cm)",
    items: [
      { id: "hk-90x60-1.0", label: "1 mm",   price: 2.70 },
      { id: "hk-90x60-1.5", label: "1.5 mm", price: 4.55 },
      { id: "hk-90x60-2.0", label: "2 mm",   price: 4.85 },
      { id: "hk-90x60-2.5", label: "2.5 mm", price: 7.15 },
    ],
  },
];

const MATERIAL_INDEX = (() => {
  const idx = {};
  for (const g of MATERIALS) {
    for (const it of g.items) {
      idx[it.id] = { ...it, group: g.group };
    }
  }
  return idx;
})();

function formatCHF(n) {
  return new Intl.NumberFormat("de-CH", { style: "currency", currency: "CHF" }).format(n);
}
