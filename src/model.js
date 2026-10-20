export const categories = [
  { id: 'water', name: '水', icon: 'drop', color: '#6ba7b7', bg: '#edf5f7', types: [] },
  { id: 'coffee', name: '咖啡', icon: 'cup', color: '#a58a71', bg: '#f5f0eb', types: [] },
  { id: 'milktea', name: '奶茶', icon: 'juice', color: '#bf8e83', bg: '#f8efeb', types: [] },
  { id: 'juice', name: '果汁', icon: 'juice', color: '#d09b58', bg: '#fcf4e8', types: [] },
  { id: 'soda', name: '碳酸饮料', icon: 'soda', color: '#9593b7', bg: '#f2f0f8', types: [] },
  { id: 'other', name: '其他', icon: 'cup', color: '#799894', bg: '#eef5f3', types: [] },
];
export const storageKey = 'water-diary-v1';
export const clientKey = 'drink-what-client-id';
export const presetBrands = {
  water: ['农夫山泉', '怡宝', '百岁山', '依云'],
  coffee: ['瑞幸', '星巴克', 'Manner', '库迪', 'Costa', 'Tims'],
  milktea: ['喜茶', '奈雪的茶', '茶百道', '蜜雪冰城', '古茗', '沪上阿姨', '霸王茶姬', 'CoCo都可', '一点点'],
  juice: ['汇源', '农夫山泉', '美汁源', '味全'],
  soda: ['可口可乐', '百事可乐', '雪碧', '芬达', '元气森林'],
  other: [],
};
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
  const fresh = { version: 5, records: [], goal: 2000, brands: [] };
  if (!saved || !Array.isArray(saved.records)) saved = { records: [] };
  fresh.goal = Number.isFinite(saved.goal) && saved.goal >= 100 && saved.goal <= 10000 ? saved.goal : 2000;
  const sourceBrands = [...(Array.isArray(saved.brands) ? saved.brands : []), ...(Array.isArray(saved.custom) ? saved.custom : [])];
  const brandMap = new Map();
  const addBrand = (category, name, id) => {
    const normalizedCategory = normalizeCategory(category || 'other');
    const normalizedName = String(name || '未命名品牌').trim() || '未命名品牌';
    const key = `${normalizedCategory}:${normalizedName.toLocaleLowerCase()}`;
    if (!brandMap.has(key)) {
      brandMap.set(key, {
        id: id || crypto.randomUUID(), name: normalizedName, category: normalizedCategory, drinks: [],
      });
    }
    return brandMap.get(key);
  };
  sourceBrands.forEach(brand => {
    const target = addBrand(brand.category, brand.name, brand.id);
    (Array.isArray(brand.drinks) ? brand.drinks : []).forEach(drink => {
      const name = String(drink.name || drink.typeName || '').trim();
      if (name && !target.drinks.some(item => item.name === name)) {
        target.drinks.push({
          id: drink.id || crypto.randomUUID(), name,
          caffeinePer100: numberOrNull(drink.caffeinePer100),
          caloriesPer100: numberOrNull(drink.caloriesPer100),
        });
      }
    });
  });
  const legacyTypes = Array.isArray(saved.types) ? saved.types : [];
  legacyTypes.forEach(type => {
    const brand = addBrand(type.category, type.brandName || type.brand || type.name, type.brandId);
    const name = String(type.drinkName || type.typeName || type.name || '').trim();
    if (name && name !== brand.name && !brand.drinks.some(item => item.name === name)) {
      brand.drinks.push({ id: type.id || crypto.randomUUID(), name, caffeinePer100: numberOrNull(type.caffeinePer100), caloriesPer100: numberOrNull(type.caloriesPer100) });
    }
  });
  // Seed once for both new users and existing local/cloud data.
  // A deleted preset stays deleted after the version 5 migration.
  if (!(saved.version >= 5)) {
    Object.entries(presetBrands).forEach(([category, names]) => {
      names.forEach(name => addBrand(category, name));
    });
  }
  const validRecords = saved.records.filter(r => r && Number.isFinite(r.amount) && r.amount > 0 && /^\d{4}-\d{2}-\d{2}$/.test(r.date) && /^\d{2}:\d{2}$/.test(r.time));
  fresh.records = validRecords.map(r => {
    const oldCategory = categories.find(c => c.id === r.drink);
    const legacyBrand = brandMap.get(`${normalizeCategory(r.category || oldCategory?.id || 'other')}:${String(r.brandName || '').trim().toLocaleLowerCase()}`);
    const category = normalizeCategory(r.category || oldCategory?.id || legacyBrand?.category || 'other');
    const brand = [...brandMap.values()].find(item => item.id === r.brandId || item.id === r.typeId) || legacyBrand;
    const brandName = String(r.brandName || brand?.name || r.typeName || '未命名品牌').trim();
    const drinkName = String(r.drinkName || r.typeName || brandName).trim();
    const targetBrand = brand || (saved.version >= 5 ? null : addBrand(category, brandName));
    if (!(saved.version >= 5) && targetBrand && !targetBrand.drinks.some(item => item.name === drinkName) && drinkName !== targetBrand.name) {
      targetBrand.drinks.push({ id: r.drinkId || crypto.randomUUID(), name: drinkName, caffeinePer100: null, caloriesPer100: null });
    }
    return {
      ...r, category, brandId: targetBrand?.id || null, brandName: targetBrand?.name || brandName, drinkName, typeName: drinkName,
      caffeine: numberOrNull(r.caffeine), calories: numberOrNull(r.calories), note: typeof r.note === 'string' ? r.note : '',
    };
  });
  fresh.brands = [...brandMap.values()];
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
