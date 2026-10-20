export const categories = [
  { id: 'water', name: '水', icon: 'drop', color: '#6ba7b7', bg: '#edf5f7', types: [] },
  { id: 'coffee', name: '咖啡', icon: 'cup', color: '#a58a71', bg: '#f5f0eb', types: [] },
  { id: 'milktea', name: '奶茶', icon: 'juice', color: '#bf8e83', bg: '#f8efeb', types: [] },
  { id: 'juice', name: '果汁', icon: 'juice', color: '#d09b58', bg: '#fcf4e8', types: [] },
  { id: 'soda', name: '碳酸饮料', icon: 'soda', color: '#9593b7', bg: '#f2f0f8', types: [] },
  { id: 'other', name: '其他', icon: 'cup', color: '#799894', bg: '#eef5f3', types: [] },
];
export const storageKey = 'water-diary-v1';
export function dateKey(date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}
export function fromDate(value) { return new Date(`${value}T12:00:00`); }
export function numberOrNull(value) {
  if (value === '' || value === null || value === undefined) return null;
  const n = Number(value);
  return Number.isFinite(n) && n >= 0 ? n : null;
}
function normalizeCategory(id) {
  return ['tea', 'milk'].includes(id) ? 'other' : id;
}
export function migrate(saved) {
  const fresh = { version: 3, records: [], goal: 2000, custom: [], categories: [] };
  if (!saved || !Array.isArray(saved.records)) return fresh;
  fresh.goal = Number.isFinite(saved.goal) && saved.goal >= 100 && saved.goal <= 10000 ? saved.goal : 2000;
  fresh.categories = Array.isArray(saved.categories) ? saved.categories : [];
  fresh.custom = (Array.isArray(saved.custom) ? saved.custom : []).map(d => ({
    id: d.id || crypto.randomUUID(), name: d.name || '未命名品牌',
    category: normalizeCategory(d.category || 'other'),
    drinks: Array.isArray(d.drinks) ? d.drinks : [],
  }));
  const customById = new Map(fresh.custom.map(d => [d.id, d]));
  fresh.records = saved.records.filter(r => r && Number.isFinite(r.amount) && r.amount > 0 && /^\d{4}-\d{2}-\d{2}$/.test(r.date) && /^\d{2}:\d{2}$/.test(r.time)).map(r => {
    const oldCategory = categories.find(c => c.id === r.drink);
    const category = normalizeCategory(r.category || oldCategory?.id || customById.get(r.brandId || r.typeId || r.drink)?.category || 'other');
    const brand = customById.get(r.brandId || r.typeId || r.drink);
    const brandName = r.brandName || brand?.name || r.typeName || '未命名品牌';
    const drinkName = r.drinkName || r.typeName || brandName;
    return {
      ...r, category, brandId: r.brandId || brand?.id || null, brandName, drinkName, typeName: drinkName,
      caffeine: numberOrNull(r.caffeine), calories: numberOrNull(r.calories), note: typeof r.note === 'string' ? r.note : '',
    };
  });
  return fresh;
}
export function summarize(records) {
  const sum = field => records.reduce((n, r) => n + (r[field] ?? 0), 0);
  return {
    amount: sum('amount'), count: records.length,
    caffeine: sum('caffeine'), calories: sum('calories'),
    caffeineKnown: records.filter(r => r.caffeine !== null && r.caffeine !== undefined).length,
    caloriesKnown: records.filter(r => r.calories !== null && r.calories !== undefined).length,
  };
}
export function monthCells(month) {
  const start = new Date(month.getFullYear(), month.getMonth(), 1, 12);
  const offset = (start.getDay() + 6) % 7;
  const length = new Date(month.getFullYear(), month.getMonth() + 1, 0).getDate();
  const count = Math.ceil((offset + length) / 7) * 7;
  return Array.from({ length: count }, (_, i) => {
    const date = new Date(start); date.setDate(i - offset + 1);
    return { key: dateKey(date), day: date.getDate(), inMonth: date.getMonth() === month.getMonth() };
  });
}
