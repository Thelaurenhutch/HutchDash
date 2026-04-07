/* ═══════════════════════════════════════════
   HUTCHDASH — script.js
   Fetches data/data.json and renders the
   Wes Anderson × Retro Gaming dashboard.
═══════════════════════════════════════════ */

const DATA_URL = 'data/data.json';

// Categories for todos
const CATEGORIES = ['Work', 'Personal', 'Health', 'Fitness', 'Errands', 'Other'];
const CAT_COLORS  = {
  Work: '#5B7FA6', Personal: '#D4A853', Health: '#C65D52',
  Fitness: '#6B9F78', Errands: '#9B7EC8', Other: '#2C2416'
};

// ── Utility: clamp a percentage 0–100 ──
const pct = (val, max) => Math.min(100, Math.round((val / max) * 100));

// ── Utility: today as YYYY-MM-DD ──
const getTodayStr = () => new Date().toISOString().slice(0, 10);

// ══════════════════════════════════════════
//  FIREBASE STATE
// ══════════════════════════════════════════
let _db         = null;
let _currentUid = null;
let _unsubWorkout = null, _unsubFood = null, _unsubTodos = null;
let _unsubCalDone = null, _unsubMacroGoals = null, _unsubWorkoutPlan = null;

// In-memory state — pre-loaded from localStorage, then overridden by Firestore
const _today = getTodayStr();
let _workoutState = (() => {
  try {
    const r = localStorage.getItem('hutch_workout_' + _today);
    return r ? JSON.parse(r) : { sets: 0, checks: {} };
  } catch { return { sets: 0, checks: {} }; }
})();

let _foodLog = (() => {
  try {
    const r = localStorage.getItem('hutch_food_' + _today);
    return r ? JSON.parse(r) : [];
  } catch { return []; }
})();

let _doneState = (() => {
  try { return JSON.parse(localStorage.getItem('hutch_done') || '{}'); }
  catch { return {}; }
})();

let _currentTodos = [];

// Persistent todo list (not per-day)
let _todoList = (() => {
  try { return JSON.parse(localStorage.getItem('hutch_todos') || '[]'); }
  catch { return []; }
})();
let _showDone = false;

// Persistent workout plan { Mon: {label, exercises}, Tue: ... }
let _workoutPlan = (() => {
  try { return JSON.parse(localStorage.getItem('hutch_workout_plan') || 'null'); }
  catch { return null; }
})();

// ── Utility: format a date string nicely ──
const fmtDate = (isoStr) => {
  if (!isoStr) return '';
  const d = new Date(isoStr + 'T00:00:00');
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
};

// ══════════════════════════════════════════
//  CALENDAR
// ══════════════════════════════════════════
let _calEvents    = [];
let _calDoneState = (() => {
  try { return JSON.parse(localStorage.getItem('hutch_cal_done_' + getTodayStr()) || '{}'); }
  catch { return {}; }
})();

function saveCalDoneState(state) {
  _calDoneState = state;
  localStorage.setItem('hutch_cal_done_' + getTodayStr(), JSON.stringify(state));
  if (_db && _currentUid) {
    _db.collection('users').doc(_currentUid)
       .collection('calendar').doc(getTodayStr())
       .set({ done: state }).catch(console.error);
  }
}

function renderCalendar(events) {
  _calEvents = events || [];
  renderCalendarFromState();
}

function renderCalendarFromState() {
  const body   = document.getElementById('calendarBody');
  const events = _calEvents;

  if (!events || events.length === 0) {
    body.innerHTML = `<p class="no-events">No events scheduled today.</p>`;
    return;
  }

  body.innerHTML = events.map((ev, idx) => {
    const done = !!_calDoneState[String(idx)];
    return `
    <div class="calendar-event${done ? ' cal-event-done' : ''}" onclick="toggleCalEvent(${idx})">
      <span class="event-time">${escHtml(ev.time)}</span>
      <div class="event-dot" style="background:${ev.color || '#5B7FA6'}; border-color:var(--brown);"></div>
      <div style="flex:1; min-width:0;">
        <span class="event-title">${escHtml(ev.title)}</span>
        <span class="event-source">${escHtml(ev.source || '')}</span>
      </div>
      <div class="cal-check">${done ? '✔' : ''}</div>
    </div>`;
  }).join('');
}

function toggleCalEvent(idx) {
  const state = { ..._calDoneState };
  state[String(idx)] = !state[String(idx)];
  saveCalDoneState(state);
  renderCalendarFromState();
}

// ══════════════════════════════════════════
//  WORKOUT — STATE & LOGIC
// ══════════════════════════════════════════
let _workoutExercises = [];
const TOTAL_SETS = 3;

function loadWorkoutState() { return _workoutState; }

function saveWorkoutState(state) {
  _workoutState = state;
  localStorage.setItem('hutch_workout_' + getTodayStr(), JSON.stringify(state));
  if (_db && _currentUid) {
    _db.collection('users').doc(_currentUid)
       .collection('workout').doc(getTodayStr())
       .set(state).catch(console.error);
  }
}

function renderWorkout(workout) {
  // Prefer the internal plan over data.json
  if (_workoutPlan) { renderWorkoutFromPlan(); return; }
  const body  = document.getElementById('workoutBody');
  const badge = document.getElementById('workoutBadge');

  if (!workout || !workout.exercises || workout.exercises.length === 0) {
    body.innerHTML = `<p class="rest-day">No plan yet. Click <strong>EDIT WEEK</strong> in the header to build your schedule.</p>`;
    if (badge) badge.textContent = 'SET UP';
    return;
  }

  if (badge) badge.textContent = workout.label || workout.day || 'DAY';
  _workoutExercises = workout.exercises;
  renderWorkoutFromState(loadWorkoutState(), false);
}

function renderWorkoutFromPlan() {
  const body  = document.getElementById('workoutBody');
  const badge = document.getElementById('workoutBadge');
  const day   = new Date().toLocaleDateString('en-US', { weekday: 'short' });
  const plan  = _workoutPlan;

  if (!plan || !plan[day] || !plan[day].exercises || plan[day].exercises.length === 0) {
    body.innerHTML = `<p class="rest-day">&#9733; REST DAY &mdash; YOU'VE EARNED IT &#9733;</p>`;
    if (badge) badge.textContent = plan ? day.toUpperCase() : 'SET UP';
    return;
  }

  const dayData = plan[day];
  if (badge) badge.textContent = dayData.label || day.toUpperCase();
  _workoutExercises = dayData.exercises;
  renderWorkoutFromState(loadWorkoutState(), false);
}

function renderWorkoutFromState(state, flash) {
  const body      = document.getElementById('workoutBody');
  const exercises = _workoutExercises;

  // ── All sets complete ──
  if (state.sets >= TOTAL_SETS) {
    body.innerHTML = `
      <div class="workout-complete">
        <div class="workout-complete-icon">★</div>
        <div class="workout-complete-text">MISSION COMPLETE</div>
        <div class="workout-complete-sub">All ${TOTAL_SETS} sets logged. Outstanding, agent.</div>
        <button class="workout-reset-btn" onclick="resetWorkout()">↺ RESET</button>
      </div>`;
    return;
  }

  // ── Set progress pips ──
  const pips = Array.from({ length: TOTAL_SETS }, (_, i) =>
    `<div class="set-pip${i < state.sets ? ' set-pip-done' : ''}"></div>`
  ).join('');

  const progressHtml = `
    <div class="set-counter${flash ? ' set-counter-flash' : ''}" id="setCounter">
      <span class="set-counter-label">SET PROGRESS</span>
      <div class="set-pips">${pips}</div>
      <span class="set-counter-num">${state.sets} / ${TOTAL_SETS}</span>
    </div>`;

  // ── Exercise rows with checkboxes ──
  const rowsHtml = exercises.map((ex, i) => {
    const checked = !!state.checks[String(i)];
    return `
      <div class="exercise-row${checked ? ' ex-checked' : ''}"
           onclick="toggleExercise(${i})">
        <div class="ex-checkbox${checked ? ' ex-checkbox-done' : ''}">${checked ? '✔' : ''}</div>
        <span class="exercise-name">${escHtml(ex.name)}</span>
        <span class="exercise-sets">${ex.sets}×${ex.reps}</span>
      </div>
      ${ex.notes ? `<div class="exercise-notes">${escHtml(ex.notes)}</div>` : ''}`;
  }).join('');

  body.innerHTML = progressHtml + rowsHtml;

  if (flash) {
    setTimeout(() => {
      document.getElementById('setCounter')?.classList.remove('set-counter-flash');
    }, 700);
  }
}

function toggleExercise(idx) {
  const state = loadWorkoutState();
  state.checks[String(idx)] = !state.checks[String(idx)];

  const allDone = _workoutExercises.every((_, i) => !!state.checks[String(i)]);
  if (allDone) {
    state.sets += 1;
    state.checks = {};
    saveWorkoutState(state);
    renderWorkoutFromState(state, true);
  } else {
    saveWorkoutState(state);
    renderWorkoutFromState(state, false);
  }
}

function resetWorkout() {
  const state = { sets: 0, checks: {} };
  saveWorkoutState(state);
  renderWorkoutFromState(state, false);
}

// ══════════════════════════════════════════
//  MACROS — FOOD LOG (localStorage)
// ══════════════════════════════════════════
let _baseMacros = null;
// Persistent macro goals (not per-day — survives across days)
let _macroGoals = (() => {
  try { return JSON.parse(localStorage.getItem('hutch_macro_goals') || 'null'); }
  catch { return null; }
})();

function openMacroModal() {
  const modal = document.getElementById('macroModal');
  if (!modal) return;
  const g = _macroGoals || (_baseMacros ? {
    cal: _baseMacros.goal_calories, pro: _baseMacros.goal_protein,
    carb: _baseMacros.goal_carbs,  fat: _baseMacros.goal_fat
  } : {});
  document.getElementById('gsCalories').value = g.cal  || '';
  document.getElementById('gsProtein').value  = g.pro  || '';
  document.getElementById('gsCarbs').value    = g.carb || '';
  document.getElementById('gsFat').value      = g.fat  || '';
  modal.classList.add('modal-open');
  setTimeout(() => document.getElementById('gsCalories')?.focus(), 100);
}

function closeMacroModal(event) {
  if (event && event.target !== document.getElementById('macroModal')) return;
  document.getElementById('macroModal')?.classList.remove('modal-open');
}

function toggleMacroSettings() { openMacroModal(); }

function saveMacroSettings() {
  const goals = {
    cal:  parseFloat(document.getElementById('gsCalories')?.value) || 0,
    pro:  parseFloat(document.getElementById('gsProtein')?.value)  || 0,
    carb: parseFloat(document.getElementById('gsCarbs')?.value)    || 0,
    fat:  parseFloat(document.getElementById('gsFat')?.value)      || 0,
  };
  _macroGoals = goals;
  localStorage.setItem('hutch_macro_goals', JSON.stringify(goals));
  if (_db && _currentUid) {
    _db.collection('users').doc(_currentUid)
       .collection('settings').doc('macros')
       .set(goals).catch(console.error);
  }
  document.getElementById('macroModal')?.classList.remove('modal-open');
  renderMacrosFromState();
}

function getTodayFoodLog()     { return _foodLog; }

function saveTodayFoodLog(log) {
  _foodLog = log;
  localStorage.setItem('hutch_food_' + getTodayStr(), JSON.stringify(log));
  if (_db && _currentUid) {
    _db.collection('users').doc(_currentUid)
       .collection('food').doc(getTodayStr())
       .set({ items: log }).catch(console.error);
  }
}

function renderMacros(macros) {
  _baseMacros = macros;
  renderMacrosFromState();
}

function renderMacrosFromState() {
  const body   = document.getElementById('macrosBody');
  const macros = _baseMacros;
  if (!macros) { body.innerHTML = ''; return; }

  const foodLog = getTodayFoodLog();
  const extra   = foodLog.reduce((acc, item) => ({
    cal:  acc.cal  + (item.cal  || 0),
    pro:  acc.pro  + (item.pro  || 0),
    carb: acc.carb + (item.carb || 0),
    fat:  acc.fat  + (item.fat  || 0),
  }), { cal: 0, pro: 0, carb: 0, fat: 0 });

  const totals = {
    cal:  (macros.logged_calories || 0) + extra.cal,
    pro:  (macros.logged_protein  || 0) + extra.pro,
    carb: (macros.logged_carbs    || 0) + extra.carb,
    fat:  (macros.logged_fat      || 0) + extra.fat,
  };

  const goals = _macroGoals || {
    cal:  macros.goal_calories,
    pro:  macros.goal_protein,
    carb: macros.goal_carbs,
    fat:  macros.goal_fat,
  };
  const stats = [
    { label: 'CALORIES', unit: 'kcal', cls: 'cal',  logged: totals.cal,  goal: goals.cal  },
    { label: 'PROTEIN',  unit: 'g',    cls: 'pro',  logged: totals.pro,  goal: goals.pro  },
    { label: 'CARBS',    unit: 'g',    cls: 'carb', logged: totals.carb, goal: goals.carb },
    { label: 'FAT',      unit: 'g',    cls: 'fat',  logged: totals.fat,  goal: goals.fat  },
  ];

  const barsHtml = stats.map(s => {
    const p       = pct(s.logged, s.goal);
    const isOver  = s.logged > s.goal;
    const fillCls = `bar-fill ${s.cls}${isOver ? ' bar-over' : ''}`;
    return `
      <div class="macro-stat">
        <div class="macro-label-row">
          <span class="macro-label">${s.label}</span>
          <span class="macro-values">${s.logged} / ${s.goal}${s.unit}</span>
        </div>
        <div class="bar-track">
          <div class="${fillCls}" style="width:${p}%;"></div>
        </div>
      </div>`;
  }).join('');

  const totalHtml = `
    <div class="macro-total-row">
      <div class="macro-total-item">
        <span class="macro-total-num">${totals.cal}</span>
        <span class="macro-total-lbl">kcal</span>
      </div>
      <div class="macro-total-item">
        <span class="macro-total-num">${totals.pro}g</span>
        <span class="macro-total-lbl">protein</span>
      </div>
      <div class="macro-total-item">
        <span class="macro-total-num">${totals.carb}g</span>
        <span class="macro-total-lbl">carbs</span>
      </div>
      <div class="macro-total-item">
        <span class="macro-total-num">${totals.fat}g</span>
        <span class="macro-total-lbl">fat</span>
      </div>
    </div>`;

  // ── Logged food entries ──
  const foodListHtml = foodLog.length > 0 ? `
    <div class="food-log-list">
      <div class="food-log-header">▸ LOGGED TODAY</div>
      ${foodLog.map((item, idx) => `
        <div class="food-log-item">
          <span class="food-log-name">${escHtml(item.name)}</span>
          <span class="food-log-macros">${item.cal}kcal · ${item.pro}p · ${item.carb}c · ${item.fat}f</span>
          <button class="food-log-delete" onclick="deleteFood(${idx})" aria-label="Remove">✕</button>
        </div>`).join('')}
    </div>` : '';

  // ── Add food form ──
  const formHtml = `
    <div class="food-form-wrap">
      <button class="food-add-btn" id="foodToggleBtn" onclick="toggleFoodForm()">+ LOG FOOD</button>
      <div class="food-form" id="foodForm">
        <div class="food-form-title">NEW FOOD ENTRY</div>
        <div class="food-search-wrap">
          <input class="food-input food-input-wide" id="foodSearchInput" type="text"
                 placeholder="Search food (e.g. Greek yogurt)..." autocomplete="off"
                 oninput="onFoodSearchInput(this.value)" onkeydown="onFoodSearchKey(event)" />
          <div class="food-dropdown" id="foodDropdown"></div>
        </div>
        <div class="food-selected-info" id="foodSelectedInfo"></div>
        <div class="food-input-row">
          <div class="food-input-group">
            <label class="food-input-label">SERVING (g)</label>
            <input class="food-input" id="foodServing" type="number" placeholder="100" min="1"
                   oninput="onServingChange()" />
          </div>
          <div class="food-input-group">
            <label class="food-input-label">CAL</label>
            <input class="food-input" id="foodCal" type="number" placeholder="0" min="0" />
          </div>
          <div class="food-input-group">
            <label class="food-input-label">PROTEIN</label>
            <input class="food-input" id="foodPro" type="number" placeholder="0g" min="0" />
          </div>
          <div class="food-input-group">
            <label class="food-input-label">CARBS</label>
            <input class="food-input" id="foodCarb" type="number" placeholder="0g" min="0" />
          </div>
          <div class="food-input-group">
            <label class="food-input-label">FAT</label>
            <input class="food-input" id="foodFat" type="number" placeholder="0g" min="0" />
          </div>
        </div>
        <button class="food-submit-btn" onclick="submitFood()">▶ ADD ENTRY</button>
      </div>
    </div>`;

  body.innerHTML = barsHtml + totalHtml + foodListHtml + formHtml;
}

// ══════════════════════════════════════════
//  FOOD SEARCH — USDA FoodData Central
// ══════════════════════════════════════════
const USDA_KEY         = 'xmDNgaI8ze5h5oVNPc1ApvZBil3ezcKbd72xO9T0';
const USDA_SEARCH      = 'https://api.nal.usda.gov/fdc/v1/foods/search';
const USDA_DETAIL      = 'https://api.nal.usda.gov/fdc/v1/food/';
const NUTRIENT_IDS     = { cal: 1008, pro: 1003, carb: 1005, fat: 1004 };

let _foodSearchTimer   = null;
let _foodPer100        = null;  // { cal, pro, carb, fat } per 100g for selected food
let _foodSelectedName  = '';
let _dropdownItems     = [];
let _dropdownIdx       = -1;

function onFoodSearchInput(val) {
  clearTimeout(_foodSearchTimer);
  const dd = document.getElementById('foodDropdown');
  if (!val || val.length < 2) { if (dd) dd.innerHTML = ''; return; }
  if (dd) dd.innerHTML = '<div class="food-dd-loading">Searching...</div>';
  _foodSearchTimer = setTimeout(() => searchUSDA(val), 400);
}

async function searchUSDA(query) {
  const dd = document.getElementById('foodDropdown');
  try {
    const resp = await fetch(`${USDA_SEARCH}?query=${encodeURIComponent(query)}&pageSize=8&dataType=Survey%20(FNDDS),SR%20Legacy,Foundation&api_key=${USDA_KEY}`);
    const data = await resp.json();
    _dropdownItems = data.foods || [];
    _dropdownIdx   = -1;
    renderDropdown(_dropdownItems);
  } catch(e) {
    if (dd) dd.innerHTML = '<div class="food-dd-loading">Search failed. Try again.</div>';
  }
}

function renderDropdown(foods) {
  const dd = document.getElementById('foodDropdown');
  if (!dd) return;
  if (!foods.length) { dd.innerHTML = '<div class="food-dd-loading">No results found.</div>'; return; }
  dd.innerHTML = foods.map((f, i) => {
    const brand = f.brandOwner ? ` <span class="food-dd-brand">${escHtml(f.brandOwner)}</span>` : '';
    return `<div class="food-dd-item" data-idx="${i}" onmousedown="selectFoodFromDropdown(${i})">${escHtml(f.description)}${brand}</div>`;
  }).join('');
  dd.style.display = 'block';
}

function onFoodSearchKey(e) {
  const items = document.querySelectorAll('.food-dd-item');
  if (!items.length) return;
  if (e.key === 'ArrowDown') {
    e.preventDefault();
    _dropdownIdx = Math.min(_dropdownIdx + 1, items.length - 1);
  } else if (e.key === 'ArrowUp') {
    e.preventDefault();
    _dropdownIdx = Math.max(_dropdownIdx - 1, 0);
  } else if (e.key === 'Enter' && _dropdownIdx >= 0) {
    e.preventDefault();
    selectFoodFromDropdown(_dropdownIdx);
    return;
  } else if (e.key === 'Escape') {
    document.getElementById('foodDropdown').innerHTML = '';
    return;
  }
  items.forEach((el, i) => el.classList.toggle('food-dd-active', i === _dropdownIdx));
}

async function selectFoodFromDropdown(idx) {
  const food = _dropdownItems[idx];
  if (!food) return;

  // Hide dropdown, show loading
  const dd   = document.getElementById('foodDropdown');
  const info = document.getElementById('foodSelectedInfo');
  if (dd)   dd.innerHTML = '';
  if (info) info.innerHTML = '<span class="food-selected-loading">Loading macros...</span>';

  _foodSelectedName = food.description;
  document.getElementById('foodSearchInput').value = food.description;

  try {
    const resp = await fetch(`${USDA_DETAIL}${food.fdcId}?api_key=${USDA_KEY}`);
    const detail = await resp.json();

    // Extract per-100g nutrients
    const n = {};
    for (const item of (detail.foodNutrients || [])) {
      const nid = item.nutrient?.id || item.nutrientId;
      const val = item.amount ?? item.value ?? 0;
      for (const [key, tid] of Object.entries(NUTRIENT_IDS)) {
        if (nid === tid) n[key] = Math.round(val * 10) / 10;
      }
    }
    _foodPer100 = { cal: n.cal||0, pro: n.pro||0, carb: n.carb||0, fat: n.fat||0 };

    // Set default serving to 100g and fill fields
    document.getElementById('foodServing').value = 100;
    fillMacroFields(100);

    if (info) info.innerHTML = `
      <span class="food-selected-name">✔ ${escHtml(food.description)}</span>
      <span class="food-selected-per">Per 100g: ${_foodPer100.cal}kcal · ${_foodPer100.pro}g P · ${_foodPer100.carb}g C · ${_foodPer100.fat}g F</span>`;
  } catch(e) {
    if (info) info.innerHTML = '<span class="food-selected-loading">Could not load macros.</span>';
  }
}

function fillMacroFields(grams) {
  if (!_foodPer100) return;
  const m = grams / 100;
  document.getElementById('foodCal').value  = Math.round(_foodPer100.cal  * m * 10) / 10;
  document.getElementById('foodPro').value  = Math.round(_foodPer100.pro  * m * 10) / 10;
  document.getElementById('foodCarb').value = Math.round(_foodPer100.carb * m * 10) / 10;
  document.getElementById('foodFat').value  = Math.round(_foodPer100.fat  * m * 10) / 10;
}

function onServingChange() {
  const g = parseFloat(document.getElementById('foodServing')?.value);
  if (g > 0) fillMacroFields(g);
}

function toggleFoodForm() {
  const form = document.getElementById('foodForm');
  const btn  = document.getElementById('foodToggleBtn');
  if (!form) return;
  const open = form.classList.toggle('food-form-open');
  if (btn) btn.textContent = open ? '− CANCEL' : '+ LOG FOOD';
  if (open) {
    _foodPer100 = null;
    _foodSelectedName = '';
    setTimeout(() => document.getElementById('foodSearchInput')?.focus(), 50);
  }
}

function submitFood() {
  const name = _foodSelectedName || document.getElementById('foodSearchInput')?.value.trim();
  if (!name) { document.getElementById('foodSearchInput')?.focus(); return; }

  const serving = parseFloat(document.getElementById('foodServing')?.value) || 100;
  const label   = _foodSelectedName ? `${name} (${serving}g)` : name;

  const entry = {
    id:   Date.now(),
    name: label,
    cal:  parseFloat(document.getElementById('foodCal')?.value)  || 0,
    pro:  parseFloat(document.getElementById('foodPro')?.value)  || 0,
    carb: parseFloat(document.getElementById('foodCarb')?.value) || 0,
    fat:  parseFloat(document.getElementById('foodFat')?.value)  || 0,
  };
  const log = getTodayFoodLog();
  log.push(entry);
  saveTodayFoodLog(log);
  _foodPer100 = null;
  _foodSelectedName = '';
  renderMacrosFromState();
}

function deleteFood(idx) {
  const log = getTodayFoodLog();
  log.splice(idx, 1);
  saveTodayFoodLog(log);
  renderMacrosFromState();
}

// ══════════════════════════════════════════
//  TODOS — Persistent internal (no Notion)
// ══════════════════════════════════════════
function getWeekStart() {
  const d = new Date();
  const day = d.getDay();
  d.setDate(d.getDate() - (day === 0 ? 6 : day - 1));
  d.setHours(0, 0, 0, 0);
  return d;
}

function saveTodos(list) {
  _todoList = list;
  localStorage.setItem('hutch_todos', JSON.stringify(list));
  if (_db && _currentUid) {
    _db.collection('users').doc(_currentUid)
       .collection('data').doc('todos')
       .set({ items: list }).catch(console.error);
  }
}

// renderTodos is called by init() — just delegates to state renderer
function renderTodos() { renderTodosFromState(); }

function renderTodosFromState() {
  const body  = document.getElementById('todosBody');
  const badge = document.getElementById('todosBadge');

  // Auto-prune: remove done items from a previous week
  const weekStart = getWeekStart();
  const pruned = _todoList.filter(t => !t.done || new Date(t.doneAt || 0) >= weekStart);
  if (pruned.length !== _todoList.length) saveTodos(pruned);

  const visible = _showDone ? pruned : pruned.filter(t => !t.done);
  const activeCount = pruned.filter(t => !t.done).length;
  const doneCount   = pruned.filter(t => t.done).length;

  if (badge) badge.textContent = `${activeCount} ACTIVE`;

  const filterBtn = document.getElementById('todoFilterBtn');
  if (filterBtn) {
    filterBtn.textContent = _showDone ? '▲ HIDE DONE' : `▼ SHOW DONE (${doneCount})`;
    filterBtn.style.display = doneCount > 0 ? '' : 'none';
  }

  const sorted = [...visible].sort((a, b) => {
    if (a.done !== b.done) return a.done ? 1 : -1;
    const da = a.due ? new Date(a.due) : new Date('9999');
    const db = b.due ? new Date(b.due) : new Date('9999');
    return da - db;
  });

  const listHtml = sorted.length === 0 ? `<p class="empty-todos">All clear, agent. No objectives outstanding.</p>` :
    `<div class="todo-list">${sorted.map(t => {
      const color     = CAT_COLORS[t.category] || '#2C2416';
      const isOverdue = !t.done && t.due && new Date(t.due + 'T23:59:59') < new Date();
      return `
        <div class="todo-item${t.done ? ' done' : ''}${isOverdue ? ' overdue' : ''}">
          <div class="todo-check-col" onclick="toggleTodo('${t.id}')">
            <div class="todo-checkbox${t.done ? ' todo-checked' : ''}">${t.done ? '&#10004;' : ''}</div>
          </div>
          <div class="todo-content">
            <span class="todo-title">${escHtml(t.title)}</span>
            <div class="todo-meta">
              <span class="todo-cat-badge" style="background:${color}">${escHtml(t.category)}</span>
              ${t.due ? `<span class="todo-due${isOverdue ? ' todo-overdue-text' : ''}">&#128197; ${fmtDate(t.due)}</span>` : ''}
            </div>
          </div>
          <button class="todo-delete-btn" onclick="deleteTodo('${t.id}')" title="Delete">&#10005;</button>
        </div>`; }).join('')}
    </div>`;

  const formHtml = `
    <div class="todo-add-wrap">
      <button class="todo-add-toggle-btn" id="todoAddBtn" onclick="toggleTodoForm()">+ ADD TASK</button>
      <div class="todo-add-form" id="todoAddForm">
        <input class="todo-form-input" id="newTodoTitle" type="text" placeholder="Task title..."
               autocomplete="off" onkeydown="if(event.key==='Enter')submitTodo()" />
        <div class="todo-form-row">
          <select class="todo-form-select" id="newTodoCat">
            ${CATEGORIES.map(c => `<option value="${c}">${c}</option>`).join('')}
          </select>
          <input class="todo-form-input todo-form-date" id="newTodoDue" type="date" />
          <button class="todo-form-submit" onclick="submitTodo()">&#9658; ADD</button>
        </div>
      </div>
    </div>`;

  body.innerHTML = listHtml + formHtml;
}

function toggleTodoForm() {
  const form = document.getElementById('todoAddForm');
  const btn  = document.getElementById('todoAddBtn');
  if (!form) return;
  const open = form.classList.toggle('todo-form-open');
  if (btn) btn.textContent = open ? '− CANCEL' : '+ ADD TASK';
  if (open) {
    document.getElementById('newTodoDue').value = getTodayStr();
    setTimeout(() => document.getElementById('newTodoTitle')?.focus(), 50);
  }
}

function submitTodo() {
  const titleEl = document.getElementById('newTodoTitle');
  const title   = titleEl?.value.trim();
  if (!title) { titleEl?.focus(); return; }
  const todo = {
    id:       String(Date.now()),
    title,
    category: document.getElementById('newTodoCat')?.value || 'Other',
    due:      document.getElementById('newTodoDue')?.value || null,
    done:     false,
    doneAt:   null,
    created:  getTodayStr(),
  };
  saveTodos([..._todoList, todo]);
  renderTodosFromState();
  titleEl.value = '';
  document.getElementById('newTodoDue').value = getTodayStr();
  setTimeout(() => titleEl.focus(), 50);
}

function toggleTodo(id) {
  const list = _todoList.map(t => {
    if (t.id !== id) return t;
    const done = !t.done;
    return { ...t, done, doneAt: done ? new Date().toISOString() : null };
  });
  saveTodos(list);
  renderTodosFromState();
}

function deleteTodo(id) {
  saveTodos(_todoList.filter(t => t.id !== id));
  renderTodosFromState();
}

function toggleShowDone() {
  _showDone = !_showDone;
  renderTodosFromState();
}

// ══════════════════════════════════════════
//  WORKOUT PLAN — Internal weekly builder
// ══════════════════════════════════════════
const PLAN_DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
let _planEditDay = 'Mon';

function saveWorkoutPlan(plan) {
  _workoutPlan = plan;
  localStorage.setItem('hutch_workout_plan', JSON.stringify(plan));
  if (_db && _currentUid) {
    _db.collection('users').doc(_currentUid)
       .collection('data').doc('workout_plan')
       .set({ plan }).catch(console.error);
  }
}

function openWorkoutPlanModal() {
  const modal = document.getElementById('workoutPlanModal');
  if (!modal) return;
  _planEditDay = new Date().toLocaleDateString('en-US', { weekday: 'short' });
  if (!PLAN_DAYS.includes(_planEditDay)) _planEditDay = 'Mon';
  try { renderPlanModalDay(_planEditDay); } catch(e) { console.error('renderPlanModalDay error', e); }
  modal.classList.add('modal-open');
}

function closeWorkoutPlanModal(event) {
  if (event && event.target !== document.getElementById('workoutPlanModal')) return;
  document.getElementById('workoutPlanModal')?.classList.remove('modal-open');
}

function selectPlanDay(day) {
  _planEditDay = day;
  renderPlanModalDay(day);
}

function renderPlanModalDay(day) {
  document.querySelectorAll('.plan-day-tab').forEach(t =>
    t.classList.toggle('plan-day-tab-active', t.dataset.day === day));

  const dayData = (_workoutPlan || {})[day] || { label: '', exercises: [] };
  const bodyEl  = document.getElementById('planModalBody');
  if (!bodyEl) return;

  bodyEl.innerHTML = `
    <input class="plan-label-input" id="planDayLabel" type="text"
           placeholder="Day label (e.g. UPPER BODY)"
           value="${escHtml(dayData.label || '')}" />
    <div class="plan-exercises" id="planExercises">
      ${(dayData.exercises || []).map((ex, i) => renderPlanExRow(ex, i)).join('')}
    </div>
    <button class="plan-add-ex-btn" onclick="addPlanExercise()">+ ADD EXERCISE</button>
    <div class="plan-save-row">
      <button class="plan-save-day-btn" id="planSaveBtn" onclick="savePlanDay('${day}')">&#9658; SAVE ${day.toUpperCase()}</button>
      <button class="plan-clear-day-btn" onclick="clearPlanDay('${day}')">&#10005; CLEAR DAY</button>
    </div>`;
}

function renderPlanExRow(ex, i) {
  return `
    <div class="plan-ex-row" data-idx="${i}">
      <input class="plan-input plan-input-name" type="text"  placeholder="Exercise" value="${escHtml(ex.name  || '')}" data-field="name" />
      <input class="plan-input plan-input-num"  type="number" placeholder="Sets"    value="${ex.sets  || ''}"          min="1" data-field="sets" />
      <span class="plan-ex-x">&#215;</span>
      <input class="plan-input plan-input-num"  type="number" placeholder="Reps"    value="${ex.reps  || ''}"          min="1" data-field="reps" />
      <input class="plan-input plan-input-notes" type="text" placeholder="Notes"   value="${escHtml(ex.notes || '')}" data-field="notes" />
      <button class="plan-ex-del" onclick="removePlanExRow(this)">&#10005;</button>
    </div>`;
}

function addPlanExercise() {
  const container = document.getElementById('planExercises');
  if (!container) return;
  const idx = container.querySelectorAll('.plan-ex-row').length;
  container.insertAdjacentHTML('beforeend', renderPlanExRow({}, idx));
  container.lastElementChild?.querySelector('.plan-input-name')?.focus();
}

function removePlanExRow(btn) { btn.closest('.plan-ex-row')?.remove(); }

function savePlanDay(day) {
  const label = document.getElementById('planDayLabel')?.value.trim() || '';
  const exercises = [...document.querySelectorAll('#planExercises .plan-ex-row')]
    .map(row => ({
      name:  row.querySelector('[data-field="name"]')?.value.trim()  || '',
      sets:  parseInt(row.querySelector('[data-field="sets"]')?.value)  || 0,
      reps:  parseInt(row.querySelector('[data-field="reps"]')?.value)  || 0,
      notes: row.querySelector('[data-field="notes"]')?.value.trim() || '',
    })).filter(e => e.name);

  const plan = { ...(_workoutPlan || {}) };
  plan[day] = { label, exercises };
  saveWorkoutPlan(plan);

  const btn = document.getElementById('planSaveBtn');
  if (btn) { btn.innerHTML = '&#10004; SAVED!'; setTimeout(() => btn.innerHTML = `&#9658; SAVE ${day.toUpperCase()}`, 1400); }

  const today = new Date().toLocaleDateString('en-US', { weekday: 'short' });
  if (day === today) renderWorkoutFromPlan();
}

function clearPlanDay(day) {
  const plan = { ...(_workoutPlan || {}) };
  plan[day] = { label: '', exercises: [] };
  saveWorkoutPlan(plan);
  renderPlanModalDay(day);
}

// ══════════════════════════════════════════
//  TICKER — duplicate content for looping
// ══════════════════════════════════════════
function setupTicker() {
  const ticker = document.querySelector('.ticker-inner');
  if (!ticker) return;
  ticker.innerHTML += '&nbsp;&nbsp;&nbsp;' + ticker.innerHTML;
}

// ══════════════════════════════════════════
//  FIREBASE — Auth, Firestore, real-time sync
// ══════════════════════════════════════════
function initFirebase() {
  if (
    typeof FIREBASE_CONFIG === 'undefined' ||
    FIREBASE_CONFIG.apiKey.startsWith('REPLACE')
  ) {
    console.info('[HUTCHDASH] Firebase not configured — using localStorage only.');
    return;
  }
  try {
    firebase.initializeApp(FIREBASE_CONFIG);
    _db = firebase.firestore();
    firebase.auth().onAuthStateChanged(user => {
      if (user) {
        _currentUid = user.uid;
        updateAuthUI(user);
        setupFirestoreListeners();
      } else {
        _currentUid = null;
        updateAuthUI(null);
        teardownListeners();
      }
    });
  } catch (e) {
    console.error('[HUTCHDASH] Firebase init error:', e);
  }
}

function setupFirestoreListeners() {
  if (!_db || !_currentUid) return;
  teardownListeners();
  const today = getTodayStr();
  const base  = _db.collection('users').doc(_currentUid);

  _unsubWorkout = base.collection('workout').doc(today)
    .onSnapshot(snap => {
      if (!snap.exists) return;
      const data = snap.data();
      if (JSON.stringify(data) !== JSON.stringify(_workoutState)) {
        _workoutState = data;
        localStorage.setItem('hutch_workout_' + today, JSON.stringify(data));
        if (_workoutExercises.length > 0) renderWorkoutFromState(_workoutState, false);
      }
    }, e => console.warn('[HUTCHDASH] Workout listener:', e));

  _unsubFood = base.collection('food').doc(today)
    .onSnapshot(snap => {
      if (!snap.exists) return;
      const items = snap.data().items || [];
      if (JSON.stringify(items) !== JSON.stringify(_foodLog)) {
        _foodLog = items;
        localStorage.setItem('hutch_food_' + today, JSON.stringify(items));
        if (_baseMacros) renderMacrosFromState();
      }
    }, e => console.warn('[HUTCHDASH] Food listener:', e));

  _unsubTodos = base.collection('data').doc('todos')
    .onSnapshot(snap => {
      if (!snap.exists) return;
      const items = snap.data().items || [];
      if (JSON.stringify(items) !== JSON.stringify(_todoList)) {
        _todoList = items;
        localStorage.setItem('hutch_todos', JSON.stringify(items));
        renderTodosFromState();
      }
    }, e => console.warn('[HUTCHDASH] Todos listener:', e));

  _unsubCalDone = base.collection('calendar').doc(today)
    .onSnapshot(snap => {
      if (!snap.exists) return;
      const done = snap.data().done || {};
      if (JSON.stringify(done) !== JSON.stringify(_calDoneState)) {
        _calDoneState = done;
        localStorage.setItem('hutch_cal_done_' + today, JSON.stringify(done));
        renderCalendarFromState();
      }
    }, e => console.warn('[HUTCHDASH] Calendar listener:', e));

  _unsubMacroGoals = base.collection('settings').doc('macros')
    .onSnapshot(snap => {
      if (!snap.exists) return;
      const g = snap.data();
      if (JSON.stringify(g) !== JSON.stringify(_macroGoals)) {
        _macroGoals = g;
        localStorage.setItem('hutch_macro_goals', JSON.stringify(g));
        if (_baseMacros) renderMacrosFromState();
      }
    }, e => console.warn('[HUTCHDASH] MacroGoals listener:', e));

  _unsubWorkoutPlan = base.collection('data').doc('workout_plan')
    .onSnapshot(snap => {
      if (!snap.exists) return;
      const plan = snap.data().plan || null;
      if (JSON.stringify(plan) !== JSON.stringify(_workoutPlan)) {
        _workoutPlan = plan;
        localStorage.setItem('hutch_workout_plan', JSON.stringify(plan));
        renderWorkoutFromPlan();
      }
    }, e => console.warn('[HUTCHDASH] WorkoutPlan listener:', e));
}

function teardownListeners() {
  if (_unsubWorkout)    { _unsubWorkout();    _unsubWorkout    = null; }
  if (_unsubFood)       { _unsubFood();       _unsubFood       = null; }
  if (_unsubTodos)      { _unsubTodos();      _unsubTodos      = null; }
  if (_unsubCalDone)    { _unsubCalDone();    _unsubCalDone    = null; }
  if (_unsubMacroGoals) { _unsubMacroGoals(); _unsubMacroGoals = null; }
  if (_unsubWorkoutPlan){ _unsubWorkoutPlan(); _unsubWorkoutPlan = null; }
}

function updateAuthUI(user) {
  const dot    = document.getElementById('authDot');
  const text   = document.getElementById('authStatusText');
  const btn    = document.getElementById('authBtn');
  const avatar = document.getElementById('authAvatar');
  if (user) {
    if (dot)    { dot.className = 'auth-dot auth-dot-on'; }
    if (text)   { text.textContent = (user.displayName || user.email || 'SIGNED IN').toUpperCase(); }
    if (btn)    { btn.textContent = 'SIGN OUT'; btn.onclick = signOutUser; }
    if (avatar && user.photoURL) { avatar.src = user.photoURL; avatar.style.display = 'block'; }
  } else {
    if (dot)    { dot.className = 'auth-dot auth-dot-off'; }
    if (text)   { text.textContent = 'NOT SYNCED — LOCAL MODE'; }
    if (btn)    { btn.textContent = 'SIGN IN WITH GOOGLE'; btn.onclick = signInWithGoogle; }
    if (avatar) { avatar.style.display = 'none'; }
  }
}

function signInWithGoogle() {
  if (!_db) return;
  firebase.auth()
    .signInWithPopup(new firebase.auth.GoogleAuthProvider())
    .catch(e => console.error('[HUTCHDASH] Sign-in error:', e));
}

function signOutUser() {
  if (!_db) return;
  firebase.auth().signOut()
    .catch(e => console.error('[HUTCHDASH] Sign-out error:', e));
}

// ══════════════════════════════════════════
//  MAIN INIT
// ══════════════════════════════════════════
async function init() {
  setupTicker();
  initFirebase();

  let data;
  try {
    const resp = await fetch(DATA_URL + '?_=' + Date.now());
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
    data = await resp.json();
  } catch (err) {
    console.error('Failed to load dashboard data:', err);
    document.getElementById('calendarBody').innerHTML =
      `<p class="no-events">⚠ Could not load data.json</p>`;
    document.getElementById('workoutBody').innerHTML  =
      `<p class="rest-day">⚠ Data unavailable</p>`;
    document.getElementById('macrosBody').innerHTML   = '';
    document.getElementById('todosBody').innerHTML    =
      `<p class="empty-todos">⚠ Data unavailable</p>`;
    return;
  }

  // ── Header Date ──
  const dateEl = document.getElementById('headerDate');
  if (dateEl) dateEl.textContent = data.date || new Date().toDateString();

  // ── Last Synced ──
  const syncEl = document.getElementById('lastSynced');
  if (syncEl && data.generated_at) {
    const d = new Date(data.generated_at);
    syncEl.textContent = d.toLocaleString('en-US', {
      month: 'short', day: 'numeric',
      hour: '2-digit', minute: '2-digit',
    });
  }

  // ── Render sections ──
  renderCalendar(data.calendar || []);
  renderWorkout(data.workout   || null);  // uses local plan if available
  renderMacros(data.macros     || null);
  renderTodos();                           // uses internal localStorage/Firestore
}

// ── HTML escape helper ──
function escHtml(str) {
  if (str == null) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#x27;');
}

document.addEventListener('DOMContentLoaded', init);
document.addEventListener('keydown', e => {
  if (e.key === 'Escape') { closeMacroModal(); closeWorkoutPlanModal(); }
});
