import { categories, storageKey, dateKey, fromDate, numberOrNull, migrate, summarize, monthCells } from './model.js';
import { pullState, pushState, currentUser, authenticate, logout } from './cloud.js';

const paths = {
  drop: '<path d="M12 3C9 7 5.5 10.5 5.5 15a6.5 6.5 0 0 0 13 0C18.5 10.5 15 7 12 3Z"/><path d="M9 15a3 3 0 0 0 3 3"/>',
  home: '<path d="m3 10 9-7 9 7v10H3Z"/><path d="M9 20v-7h6v7"/>',
  calendar: '<rect x="3" y="5" width="18" height="16" rx="3"/><path d="M7 3v4m10-4v4M3 11h18"/>',
  settings: '<path d="M4 7h16M4 17h16"/><circle cx="9" cy="7" r="3" fill="white"/><circle cx="15" cy="17" r="3" fill="white"/>',
  plus: '<path d="M12 5v14M5 12h14"/>', arrow: '<path d="m9 5 7 7-7 7"/>',
  check: '<path d="m5 12 4 4L19 6"/>', cup: '<path d="M5 8h12v9a4 4 0 0 1-4 4H9a4 4 0 0 1-4-4ZM17 9h2a3 3 0 0 1 0 6h-2"/>',
  tea: '<path d="M4 10h14v5a6 6 0 0 1-6 6h-2a6 6 0 0 1-6-6ZM18 11h2a3 3 0 0 1 0 6h-2"/>',
  juice: '<path d="M5 8h14l-2 13H7ZM13 8l3-6h4M6 13h12"/>',
  soda: '<path d="M8 3h8v4l2 3v11H6V10l2-3ZM8 7h8M6 12h12"/>',
  trash: '<path d="M3 6h18M9 6V3h6v3M5 6l1 15h12l1-15M10 10v7m4-7v7"/>',
  close: '<path d="m6 6 12 12M6 18 18 6"/>', download: '<path d="M12 3v12m-4-4 4 4 4-4M4 16v5h16v-5"/>',
};
const icon = name => `<svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.65" stroke-linecap="round" stroke-linejoin="round">${paths[name] || paths.cup}</svg>`;
const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const fmt = n => Number(n || 0).toLocaleString();
let state = migrate(JSON.parse(localStorage.getItem(storageKey) || 'null'));
let page = 'home', selectedDate = dateKey(new Date()), month = fromDate(selectedDate), undoRecord, toastTimer;
let cloudReady = false, cloudSyncTimer;
let user = null, revision = 0, syncQueue = Promise.resolve(), syncError = '', dirty = false;
const cacheKey = () => user ? `${storageKey}:account:${user.id}` : storageKey;
const persist = () => localStorage.setItem(cacheKey(), JSON.stringify(user ? { state, revision, dirty } : state));
const allCategories = () => categories;
const categoryOf = id => allCategories().find(c => c.id === id) || categories.at(-1);
const brandsFor = category => state.brands.filter(b => b.category === category);
const brandOf = id => state.brands.find(b => b.id === id);
const drinksFor = brand => brandOf(brand)?.drinks || [];
const mergeStates = (remote, local) => {
  const merged = migrate(remote);
  const brandKey = brand => `${brand.category}:${brand.name.toLocaleLowerCase()}`;
  const brandMap = new Map(merged.brands.map(brand => [brandKey(brand), brand]));
  local.brands.forEach(brand => {
    const key = brandKey(brand);
    const target = brandMap.get(key) || (() => {
      const created = { ...brand, drinks: [] };
      merged.brands.push(created); brandMap.set(key, created); return created;
    })();
    const drinkNames = new Set(target.drinks.map(drink => drink.name.toLocaleLowerCase()));
    brand.drinks.forEach(drink => { if (!drinkNames.has(drink.name.toLocaleLowerCase())) target.drinks.push(drink); });
  });
  const records = new Map(merged.records.map(record => [record.id, record]));
  local.records.forEach(record => records.set(record.id, record));
  merged.records = [...records.values()];
  if (local.goal !== 2000) merged.goal = local.goal;
  return migrate(merged);
};
const save = () => {
  try {
    dirty = !!user;
    persist();
    if (cloudReady && user) {
      clearTimeout(cloudSyncTimer);
      cloudSyncTimer = setTimeout(syncNow, 250);
    }
    return true;
  } catch { return false; }
};
function syncNow() {
  clearTimeout(cloudSyncTimer);
  const owner = user?.id, snapshot = JSON.parse(JSON.stringify(state));
  if (!owner || !cloudReady || !dirty) return syncQueue;
  syncQueue = syncQueue.then(async () => {
    if (user?.id !== owner || syncError) return;
    try {
      const result = await pushState(snapshot, revision);
      revision = result.revision;
      dirty = JSON.stringify(state) !== JSON.stringify(snapshot);
      persist();
      updateAccountStatus();
    } catch (error) {
      syncError = error.message;
      updateAccountStatus();
      toast(error.message);
    }
  });
  return syncQueue;
}
function updateAccountStatus() {
  const button = document.querySelector('#account-button');
  if (button) button.textContent = user ? `${user.username} · ${syncError ? '同步失败' : dirty ? '待同步' : cloudReady ? '已同步' : '加载中'}` : '登录 / 注册';
}
const daily = date => state.records.filter(r => r.date === date).sort((a, b) => b.time.localeCompare(a.time));
const total = date => daily(date).reduce((s, r) => s + r.amount, 0);
const nav = (id, text, symbol) => `<button class="nav-item ${page === id ? 'active' : ''}" data-page="${id}">${icon(symbol)}<span>${text}</span></button>`;
function toast(message, undo = false) {
  clearTimeout(toastTimer); const el = document.querySelector('#toast');
  el.innerHTML = `${icon('check')}<span>${esc(message)}</span>${undo ? '<button id="undo">撤销</button>' : ''}`; el.classList.add('show');
  if (undo) document.querySelector('#undo').onclick = () => { if (undoRecord) { state.records.push(undoRecord); undoRecord = null; save(); render(); toast('记录已恢复'); } };
  toastTimer = setTimeout(() => el?.classList.remove('show'), 5000);
}
function render() {
  const amount = total(selectedDate), summary = summarize(daily(selectedDate)), percent = Math.round(amount / state.goal * 100);
  document.querySelector('#app').innerHTML = `<aside class="sidebar"><a class="brand" href="#">${icon('drop')}<span>喝点什么<small>DRINK DIARY</small></span></a><nav class="main-nav">${nav('home', '今天', 'home')}${nav('calendar', '饮水日历', 'calendar')}</nav><div class="sidebar-bottom"><button class="nav-item" data-action="manage">${icon('cup')}<span>品牌管理</span></button><button class="nav-item" data-action="settings">${icon('settings')}<span>设置</span></button></div></aside><main class="main"><header class="topbar"><div class="breadcrumb">喝点什么 <span>/</span><strong>${page === 'home' ? '今日饮水' : '饮水日历'}</strong></div><div class="topbar-actions"><button class="header-button" data-action="manage" aria-label="品牌管理">${icon('cup')}</button><button class="header-button" data-action="settings" aria-label="设置">${icon('settings')}</button></div></header><div class="page-content">${page === 'home' ? homePage(amount, summary, percent) : calendarPage()} </div></main><dialog id="modal"></dialog><div id="toast" role="status" aria-live="polite"></div>`;
  bind();
  const account = document.createElement('button');
  account.id = 'account-button'; account.className = 'text-button';
  account.onclick = () => user ? openAccount() : openAuth();
  document.querySelector('.topbar-actions').prepend(account);
  updateAccountStatus();
}
function homePage(amount, summary, percent) {
  return `<section class="page-heading"><h1>今日饮水</h1><label class="date-picker">${icon('calendar')}<input type="date" id="view-date" value="${selectedDate}" max="${dateKey(new Date())}"></label></section><section class="overview-grid"><div class="card progress-card"><div class="progress-content"><div class="section-label">饮品总量</div><div class="big-number">${fmt(amount)}<span>ml</span></div><div class="goal-line">每日目标 <strong>${fmt(state.goal)} ml</strong><button class="text-button" data-action="settings">修改目标 ${icon('arrow')}</button></div><div class="progress-track"><div style="width:${Math.min(percent, 100)}%"></div></div><div class="progress-caption"><span>${amount >= state.goal ? '已达标' : `还差 ${fmt(state.goal - amount)} ml`}</span><strong>${percent}%</strong></div><div class="little-stats">${summary.count} 杯</div></div><div class="water-visual"><div class="orbit"></div><div class="glass"><div class="water-fill" style="height:${Math.max(10, Math.min(percent, 95))}%"></div></div></div></div><div class="card nutrition-card"><div class="nutrition-item"><span>咖啡因</span><strong>${summary.caffeineKnown ? fmt(summary.caffeine) : '—'} <small>mg</small></strong></div><div class="nutrition-item"><span>热量</span><strong>${summary.caloriesKnown ? fmt(summary.calories) : '—'} <small>kcal</small></strong></div></div></section><section class="card quick-card"><div class="section-heading"><h2>记录饮品</h2><button class="text-button" data-action="manage">${icon('plus')} 管理品牌</button></div><div class="drink-grid">${allCategories().map(c => `<button class="drink-option" data-drink="${esc(c.id)}" style="--drink-color:${c.color};--drink-bg:${c.bg}"><span class="drink-icon">${icon(c.icon)}</span><strong>${esc(c.name)}</strong><span class="type-count">${brandsFor(c.id).length} 个品牌</span></button>`).join('')}</div></section>${recordCard()}`;
}
function recordCard() {
  const rows = daily(selectedDate), s = summarize(rows);
  return `<section class="card records-card"><div class="section-heading"><h2>${selectedDate} <span class="count-badge">${rows.length} 杯</span></h2><div class="record-actions"><button class="text-button" data-action="export">${icon('download')} 导出</button><button class="text-button" data-drink="water">${icon('plus')} 记录</button></div></div><div class="record-list">${rows.length ? rows.map(r => `<div class="record-row"><span class="record-icon">${icon(categoryOf(r.category).icon)}</span><div class="record-info"><strong>${esc(r.drinkName || r.typeName)}</strong><span>${esc(r.brandName || '')} · ${esc(r.time)}</span></div><div class="record-nutrition"><span>咖啡因 ${r.caffeine == null ? '—' : `${r.caffeine} mg`}</span><span>热量 ${r.calories == null ? '—' : `${r.calories} kcal`}</span></div><strong class="record-amount">${fmt(r.amount)}<span> ml</span></strong><button class="delete-button" data-delete="${esc(r.id)}" aria-label="删除记录">${icon('trash')}</button></div>`).join('') : '<div class="empty-state">暂无记录</div>'}</div>${rows.length ? `<div class="record-footer"><span>${fmt(s.amount)} ml</span><span>咖啡因 ${s.caffeineKnown ? fmt(s.caffeine) : '—'} mg</span><span>热量 ${s.caloriesKnown ? fmt(s.calories) : '—'} kcal</span></div>` : ''}</section>`;
}
function calendarPage() {
  return `<section class="page-heading"><h1>饮水日历</h1><button class="outline-button" data-action="today">今天</button></section><section class="calendar-summary"><div class="card"><span>本月总量</span><strong>${fmt(state.records.filter(r => r.date.startsWith(`${month.getFullYear()}-${String(month.getMonth() + 1).padStart(2, '0')}`)).reduce((s, r) => s + r.amount, 0))} <small>ml</small></strong></div></section><section class="card calendar-card"><div class="section-heading"><h2>${month.getFullYear()} 年 ${month.getMonth() + 1} 月</h2><div class="month-controls"><button data-action="prev-month">${icon('arrow')}</button><button data-action="next-month">${icon('arrow')}</button></div></div><div class="heat-legend"><span>少</span>${[.06,.25,.45,.68,.88].map(v => `<i style="--heat-opacity:${v}"></i>`).join('')}<span>多</span><small>按每日总量</small></div><div class="weekdays">${['一','二','三','四','五','六','日'].map(d => `<span>${d}</span>`).join('')}</div><div class="calendar-grid">${monthCells(month).map(cell => { const amount = total(cell.key); const rows = daily(cell.key); const opacity = amount ? Math.min(.12 + amount / state.goal * .76, .88) : .06; return `<button class="calendar-day ${cell.inMonth ? '' : 'outside'} ${cell.key === selectedDate ? 'selected' : ''}" style="--heat-opacity:${opacity}" data-day="${cell.key}"><span class="day-number">${cell.day}</span>${rows.length ? `<span class="day-total">${fmt(amount)} ml</span>` : ''}</button>`; }).join('')}</div></section><div class="calendar-detail">${recordCard()}</div>`;
}
function bind() {
  if (user && !cloudReady) return;
  document.querySelector('.brand').onclick = e => { e.preventDefault(); page = 'home'; render(); };
  document.querySelectorAll('[data-page]').forEach(el => el.onclick = () => { page = el.dataset.page; render(); });
  document.querySelector('#view-date')?.addEventListener('change', e => { if (e.target.value <= dateKey(new Date())) { selectedDate = e.target.value; render(); } });
  document.querySelectorAll('[data-drink]').forEach(el => el.onclick = () => openRecord(el.dataset.drink));
  document.querySelectorAll('[data-day]').forEach(el => el.onclick = () => { if (el.dataset.day <= dateKey(new Date())) { selectedDate = el.dataset.day; render(); } });
  document.querySelectorAll('[data-delete]').forEach(el => el.onclick = () => { undoRecord = state.records.find(r => r.id === el.dataset.delete); state.records = state.records.filter(r => r.id !== el.dataset.delete); save(); render(); toast('记录已删除', true); });
  document.querySelectorAll('[data-action]').forEach(el => el.onclick = () => { const a = el.dataset.action; if (a === 'manage') openManage(); if (a === 'settings') openSettings(); if (a === 'export') exportRecords(); if (a === 'today') { selectedDate = dateKey(new Date()); month = fromDate(selectedDate); render(); } if (a === 'prev-month') { month = new Date(month.getFullYear(), month.getMonth() - 1, 1, 12); render(); } if (a === 'next-month') { month = new Date(month.getFullYear(), month.getMonth() + 1, 1, 12); render(); } });
}
function modalHead(title) { return `<div class="modal-head"><h2>${title}</h2><button data-close class="close-button" aria-label="关闭">${icon('close')}</button></div>`; }
function openModal(html) { const modal = document.querySelector('#modal'); modal.innerHTML = html; modal.showModal(); modal.querySelector('[data-close]').onclick = () => modal.close(); }
const categoryOptions = selected => allCategories().map(c => `<option value="${esc(c.id)}" ${c.id === selected ? 'selected' : ''}>${esc(c.name)}</option>`).join('');
const brandOptions = (category, selected) => brandsFor(category).map(b => `<option value="${esc(b.id)}" ${b.id === selected ? 'selected' : ''}>${esc(b.name)}</option>`).join('');
const drinkOptions = (brand, selected) => drinksFor(brand).map(d => `<option value="${esc(d.id)}" ${d.id === selected ? 'selected' : ''}>${esc(d.name)}</option>`).join('');
function openRecord(category = 'water') {
  const now = new Date(), recordDate = selectedDate <= dateKey(now) ? selectedDate : dateKey(now);
  openModal(`${modalHead('记录饮品')}<form id="record-form"><div class="form-row"><label>大类<select id="record-category">${categoryOptions(category)}</select></label><label>品牌<select id="record-brand-select"><option value="">直接输入品牌</option>${brandOptions(category)}</select></label></div><input class="standard-input" id="brand" placeholder="没有品牌？输入品牌名称" maxlength="40"><div class="form-row"><label>饮品名称<select id="record-drink"><option value="">直接输入名称</option></select></label><label><input class="standard-input" id="drink-name" placeholder="例如：美式 / 原味" maxlength="40"></label></div><label class="field-label" for="amount">容量 <span>ml</span></label><div class="amount-input"><input type="number" id="amount" min="1" max="10000" value="250" required><span>ml</span></div><div class="amount-options">${[100,200,250,350,500].map(a => `<button type="button" data-amount="${a}">${a} ml</button>`).join('')}</div><div class="form-row nutrition-form"><label>咖啡因（mg）<input type="number" id="caffeine" min="0" step=".1"></label><label>热量（kcal）<input type="number" id="calories" min="0" step=".1"></label></div><div class="form-row"><label>日期<input type="date" id="date" value="${recordDate}" max="${dateKey(now)}" required></label><label>时间<input type="time" id="time" value="${String(now.getHours()).padStart(2,'0')}:${String(now.getMinutes()).padStart(2,'0')}" required></label></div><button class="primary-button" type="submit">${icon('check')} 保存</button></form>`);
  const form = document.querySelector('#record-form'), categoryInput = document.querySelector('#record-category'), brandSelect = document.querySelector('#record-brand-select'), drinkSelect = document.querySelector('#record-drink');
  const brandInput = document.querySelector('#brand');
  const refreshDrinks = () => { drinkSelect.innerHTML = `<option value="">直接输入名称</option>${drinkOptions(brandSelect.value)}`; document.querySelector('#drink-name').value = ''; document.querySelector('#caffeine').value = ''; document.querySelector('#calories').value = ''; };
  const selectBrand = () => { brandInput.value = ''; brandInput.hidden = !!brandSelect.value; brandInput.required = !brandSelect.value; refreshDrinks(); };
  const refreshBrands = () => {
    brandSelect.innerHTML = `${brandOptions(categoryInput.value)}<option value="">其他 / 自定义品牌</option>`;
    selectBrand();
  };
  categoryInput.onchange = refreshBrands; brandSelect.onchange = selectBrand;
  refreshBrands();
  drinkSelect.onchange = () => { const d = drinksFor(brandSelect.value).find(d => d.id === drinkSelect.value); document.querySelector('#drink-name').value = d?.name || ''; if (d) { document.querySelector('#caffeine').value = d.caffeinePer100 == null ? '' : (d.caffeinePer100 * Number(document.querySelector('#amount').value) / 100).toFixed(1); document.querySelector('#calories').value = d.caloriesPer100 == null ? '' : (d.caloriesPer100 * Number(document.querySelector('#amount').value) / 100).toFixed(1); } };
  document.querySelectorAll('[data-amount]').forEach(b => b.onclick = () => { document.querySelector('#amount').value = b.dataset.amount; });
  form.onsubmit = e => { e.preventDefault(); const brandID = brandSelect.value, brand = document.querySelector('#brand').value.trim() || brandOf(brandID)?.name, drinkID = drinkSelect.value, drink = document.querySelector('#drink-name').value.trim() || drinksFor(brandID).find(d => d.id === drinkID)?.name, date = document.querySelector('#date').value, amount = Number(document.querySelector('#amount').value); if (!brand || !drink || !Number.isInteger(amount) || date > dateKey(new Date())) return; const existingBrand = brandOf(brandID); const existingDrink = drinksFor(brandID).find(d => d.id === drinkID); state.records.push({ id: crypto.randomUUID(), date, time: document.querySelector('#time').value, amount, category: categoryInput.value, brandId: existingBrand?.id || null, brandName: brand, drinkId: existingDrink?.id || null, drinkName: drink, typeName: drink, caffeine: numberOrNull(document.querySelector('#caffeine').value), calories: numberOrNull(document.querySelector('#calories').value), note: '' }); save(); selectedDate = date; document.querySelector('#modal').close(); render(); if (!existingBrand && confirm(`是否把品牌“${brand}”保存到品牌列表？`)) { state.brands.push({ id: crypto.randomUUID(), category: categoryInput.value, name: brand, drinks: [] }); save(); render(); } else if (existingBrand && !existingDrink && confirm(`是否把“${drink}”保存到品牌“${brand}”下？`)) { existingBrand.drinks.push({ id: crypto.randomUUID(), name: drink, caffeinePer100: null, caloriesPer100: null }); save(); render(); } };
}
function openManage(category = 'coffee') {
  openModal(`${modalHead('品牌与饮品管理')}<label class="field-label">大类</label><select id="manage-category" class="standard-input">${categoryOptions(category)}</select><div id="brand-list" class="type-list"></div><form id="brand-form"><label class="field-label">新增品牌</label><input class="standard-input" name="brand" placeholder="例如：瑞幸" required><button class="primary-button" type="submit">${icon('plus')} 添加品牌</button></form><form id="drink-form"><label class="field-label">选择品牌</label><select class="standard-input" name="brand"></select><label class="field-label">新增饮品名称</label><input class="standard-input" name="drink" placeholder="例如：美式" required><div class="form-row nutrition-form"><label>咖啡因/100ml<input name="caffeine" type="number" step=".1"></label><label>热量/100ml<input name="calories" type="number" step=".1"></label></div><button class="primary-button" type="submit">${icon('plus')} 添加到品牌</button></form>`);
  const categoryInput = document.querySelector('#manage-category'), list = document.querySelector('#brand-list'), drinkForm = document.querySelector('#drink-form');
  function refresh() { const brands = brandsFor(categoryInput.value); list.innerHTML = brands.length ? brands.map(b => `<div class="brand-management-row"><strong>${esc(b.name)}</strong><button data-remove-brand="${esc(b.id)}" aria-label="删除品牌">${icon('trash')}</button><div>${b.drinks.map(d => `<span>${esc(d.name)} <button data-remove-drink="${esc(d.id)}" data-brand-id="${esc(b.id)}" aria-label="删除饮品">${icon('close')}</button></span>`).join('')}</div></div>`).join('') : '<div class="empty-state">还没有品牌，请添加</div>'; drinkForm.elements.brand.innerHTML = brands.map(b => `<option value="${esc(b.id)}">${esc(b.name)}</option>`).join(''); list.querySelectorAll('[data-remove-brand]').forEach(b => b.onclick = () => { state.brands = state.brands.filter(x => x.id !== b.dataset.removeBrand); save(); refresh(); }); list.querySelectorAll('[data-remove-drink]').forEach(b => b.onclick = () => { const brand = brandOf(b.dataset.brandId); if (brand) brand.drinks = brand.drinks.filter(d => d.id !== b.dataset.removeDrink); save(); refresh(); }); }
  categoryInput.onchange = refresh; refresh();
  document.querySelector('#brand-form').onsubmit = e => { e.preventDefault(); const name = new FormData(e.target).get('brand').trim(); if (!name || brandsFor(categoryInput.value).some(b => b.name === name)) return; state.brands.push({ id: crypto.randomUUID(), category: categoryInput.value, name, drinks: [] }); save(); e.target.reset(); refresh(); };
  drinkForm.onsubmit = e => { e.preventDefault(); const data = new FormData(e.target), brand = brandOf(data.get('brand')); if (!brand) return; brand.drinks.push({ id: crypto.randomUUID(), name: data.get('drink').trim(), caffeinePer100: numberOrNull(data.get('caffeine')), caloriesPer100: numberOrNull(data.get('calories')) }); save(); e.target.reset(); refresh(); };
}
function openSettings() { openModal(`${modalHead('设置')}<form id="settings-form"><label class="field-label">每日目标（ml）</label><div class="amount-input"><input name="goal" type="number" min="100" max="10000" value="${state.goal}" required><span>ml</span></div><button class="primary-button" type="submit">保存</button></form>`); document.querySelector('#settings-form').onsubmit = e => { e.preventDefault(); state.goal = Number(new FormData(e.target).get('goal')); save(); document.querySelector('#modal').close(); render(); }; }
function exportRecords() { const cell = v => `"${String(v ?? '').replace(/"/g, '""')}"`; const csv = '\uFEFF' + [['日期','时间','大类','品牌','饮品名称','容量(ml)','咖啡因(mg)','热量(kcal)'], ...state.records.map(r => [r.date,r.time,categoryOf(r.category).name,r.brandName,r.drinkName || r.typeName,r.amount,r.caffeine,r.calories])].map(r => r.map(cell).join(',')).join('\r\n'); const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([csv], {type:'text/csv;charset=utf-8'})); a.download = `喝点什么-${dateKey(new Date())}.csv`; a.click(); toast('已导出'); }
function openAuth(mode = 'login') {
  openModal(`${modalHead(mode === 'login' ? '登录' : '注册账号')}<form id="auth-form">
    <label class="field-label" for="username">账号</label>
    <input class="standard-input" id="username" name="username" autocomplete="username" pattern="[A-Za-z0-9_]{3,32}" minlength="3" maxlength="32" placeholder="字母、数字或下划线，3–32位" required>
    <label class="field-label" for="password">密码</label>
    <input class="standard-input" id="password" name="password" type="password" autocomplete="${mode === 'login' ? 'current-password' : 'new-password'}" minlength="8" maxlength="128" required>
    ${mode === 'register' ? '<label class="field-label" for="password-confirm">确认密码</label><input class="standard-input" id="password-confirm" type="password" autocomplete="new-password" required>' : ''}
    <p id="auth-error" role="alert"></p><button class="primary-button" type="submit">${mode === 'login' ? '登录' : '注册'}</button>
    <button class="text-button" type="button" id="auth-switch">${mode === 'login' ? '还没有账号？注册' : '已有账号？登录'}</button>
    </form>`);
  document.querySelector('#auth-switch').onclick = () => openAuth(mode === 'login' ? 'register' : 'login');
  document.querySelector('#auth-form').onsubmit = async e => {
    e.preventDefault();
    const form = e.target, button = form.querySelector('[type=submit]'), error = form.querySelector('#auth-error');
    if (mode === 'register' && form.password.value !== document.querySelector('#password-confirm').value) { error.textContent = '两次输入的密码不一致'; return; }
    button.disabled = true;
    try {
      const result = await authenticate(mode, form.username.value, form.password.value);
      await loadAccount(result.user);
      toast('已登录');
    } catch (err) { error.textContent = err.message; button.disabled = false; }
  };
}
async function loadAccount(account) {
  clearTimeout(cloudSyncTimer);
  user = account; cloudReady = false; syncError = ''; undoRecord = null;
  const cached = JSON.parse(localStorage.getItem(cacheKey()) || 'null');
  state = migrate(cached?.state); revision = cached?.revision || 0; dirty = !!cached?.dirty;
  render();
  try {
    const remote = await pullState();
    if (dirty) {
      if (revision !== remote.revision) syncError = '云端已有新版本，本机未同步修改已保留，请在账号中选择处理方式';
    } else {
      state = migrate(remote.state); revision = remote.revision;
      dirty = !remote.state || remote.state.version !== state.version;
    }
    cloudReady = true; persist(); render();
    if (dirty && !syncError) await syncNow();
  } catch (error) { syncError = error.message; cloudReady = true; render(); toast(error.message); }
}
function openAccount() {
  openModal(`${modalHead('账号')}<p>${esc(user.username)}</p>
    <p role="status">${esc(syncError || (dirty ? '有修改尚未同步' : '已同步到云端'))}</p>
    <button class="outline-button" id="retry-sync">重试同步本机修改</button>
    <button class="outline-button" id="reload-cloud">加载云端最新数据</button>
    <button class="outline-button" id="import-guest">导入此浏览器原有记录</button>
    <button class="outline-button" id="account-export">导出记录</button>
    <button class="outline-button" id="account-logout">退出登录</button>`);
  document.querySelector('#account-export').onclick = exportRecords;
  document.querySelector('#retry-sync').onclick = async () => {
    syncError = ''; dirty = true; await syncNow(); openAccount();
  };
  document.querySelector('#reload-cloud').onclick = async () => {
    if (dirty && !confirm('加载云端数据会替换本机未同步修改。请先导出记录。是否继续？')) return;
    try {
      const remote = await pullState();
      localStorage.setItem(`${cacheKey()}:backup`, JSON.stringify(state));
      state = migrate(remote.state); revision = remote.revision; dirty = false; syncError = '';
      persist(); render(); toast('已加载云端数据');
    } catch (error) { toast(error.message); }
  };
  document.querySelector('#import-guest').onclick = async () => {
    if (!confirm('把此浏览器登录前的记录和自定义饮品合并到当前账号？')) return;
    state = mergeStates(state, migrate(JSON.parse(localStorage.getItem(storageKey) || 'null')));
    save(); await syncNow(); render(); toast(syncError || '已导入');
  };
  document.querySelector('#account-logout').onclick = async () => {
    await syncNow();
    if (dirty && !confirm('部分修改尚未同步，仍保留在本机。是否退出？')) return;
    try {
      await logout(); user = null; cloudReady = false; syncError = ''; dirty = false; revision = 0; undoRecord = null;
      state = migrate(JSON.parse(localStorage.getItem(storageKey) || 'null'));
      render();
    } catch (error) { toast(error.message); }
  };
}
render();
currentUser().then(result => {
  if (result.user) return loadAccount(result.user);
}).catch(error => { toast(error.message); });
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible' && user && !dirty) {
    syncQueue.then(() => loadAccount(user));
  }
});
