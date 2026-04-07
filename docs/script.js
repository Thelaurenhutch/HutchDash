/* ═══════════════════════════════════════════
   HUTCHDASH — script.js
   Fetches data/data.json and renders the
   Wes Anderson × Retro Gaming dashboard.
═══════════════════════════════════════════ */

const DATA_URL = 'data/data.json';

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
let _unsubCalDone = null, _unsubMacroGoals = null;

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
  const body  = document.getElementById('workoutBody');
  const badge = document.getElementById('workoutBadge');

  if (!workout || !workout.exercises || workout.exercises.length === 0) {
    body.innerHTML = `<p class="rest-day">★ REST DAY — YOU'VE EARNED IT ★</p>`;
    return;
  }

  if (badge) badge.textContent = workout.label || workout.day || 'DAY';
  _workoutExercises = workout.exercises;
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

function toggleMacroSettings() {
  const panel = document.getElementById('macroSettingsPanel');
  if (!panel) return;
  const open = panel.classList.toggle('macro-settings-open');
  if (open) {
    const g = _macroGoals || (_baseMacros ? {
      cal: _baseMacros.goal_calories, pro: _baseMacros.goal_protein,
      carb: _baseMacros.goal_carbs,  fat: _baseMacros.goal_fat
    } : {});
    document.getElementById('gsCalories').value = g.cal  || '';
    document.getElementById('gsProtein').value  = g.pro  || '';
    document.getElementById('gsCarbs').value    = g.carb || '';
    document.getElementById('gsFat').value      = g.fat  || '';
    setTimeout(() => document.getElementById('gsCalories')?.focus(), 50);
  }
}

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
  document.getElementById('macroSettingsPanel')?.classList.remove('macro-settings-open');
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
        <input class="food-input food-input-wide" id="foodName" type="text"
               placeholder="Food name (e.g. Chicken breast)" autocomplete="off" />
        <div class="food-input-row">
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

function toggleFoodForm() {
  const form = document.getElementById('foodForm');
  const btn  = document.getElementById('foodToggleBtn');
  if (!form) return;
  const open = form.classList.toggle('food-form-open');
  if (btn) btn.textContent = open ? '− CANCEL' : '+ LOG FOOD';
  if (open) setTimeout(() => document.getElementById('foodName')?.focus(), 50);
}

function submitFood() {
  const name = document.getElementById('foodName')?.value.trim();
  if (!name) { document.getElementById('foodName')?.focus(); return; }

  const entry = {
    id:   Date.now(),
    name,
    cal:  parseFloat(document.getElementById('foodCal')?.value)  || 0,
    pro:  parseFloat(document.getElementById('foodPro')?.value)  || 0,
    carb: parseFloat(document.getElementById('foodCarb')?.value) || 0,
    fat:  parseFloat(document.getElementById('foodFat')?.value)  || 0,
  };
  const log = getTodayFoodLog();
  log.push(entry);
  saveTodayFoodLog(log);
  renderMacrosFromState();
}

function deleteFood(idx) {
  const log = getTodayFoodLog();
  log.splice(idx, 1);
  saveTodayFoodLog(log);
  renderMacrosFromState();
}

// ══════════════════════════════════════════
//  TODOS
// ══════════════════════════════════════════
// Done state — in-memory, synced to Firestore when signed in
function loadDoneState() { return _doneState; }

function saveDoneState(state) {
  _doneState = state;
  localStorage.setItem('hutch_done', JSON.stringify(state));
  if (_db && _currentUid) {
    _db.collection('users').doc(_currentUid)
       .collection('todos').doc(getTodayStr())
       .set({ done: state }).catch(console.error);
  }
}

function renderTodos(todos) {
  _currentTodos = todos || [];
  renderTodosFromState();
}

function renderTodosFromState() {
  const todos = _currentTodos;
  const body  = document.getElementById('todosBody');
  const badge = document.getElementById('todosBadge');

  if (!todos || todos.length === 0) {
    body.innerHTML = `<p class="empty-todos">All clear, agent. No objectives outstanding.</p>`;
    if (badge) badge.textContent = '0 ACTIVE';
    return;
  }

  const doneState = loadDoneState();
  todos.forEach(t => { if (t.done) doneState[t.id] = true; });

  const activeCount = todos.filter(t => !doneState[t.id]).length;
  if (badge) badge.textContent = `${activeCount} ACTIVE`;

  const html = `<div class="todos-grid">${todos.map(t => {
    const done      = !!doneState[t.id];
    const checkMark = done ? '✔' : '';
    return `
      <div class="todo-item${done ? ' done' : ''}"
           data-id="${escHtml(String(t.id))}"
           onclick="toggleTodo('${escHtml(String(t.id))}', this)">
        <div class="todo-checkbox">${checkMark}</div>
        <div class="todo-content">
          <span class="todo-name">${escHtml(t.name)}</span>
          <div class="todo-meta">
            <span class="priority-badge ${escHtml(t.priority || 'None')}">${escHtml(t.priority || 'NONE')}</span>
            ${t.due ? `<span class="todo-due">due ${fmtDate(t.due)}</span>` : ''}
          </div>
        </div>
      </div>`;
  }).join('')}</div>`;

  body.innerHTML = html;
}

function toggleTodo(id, el) {
  const doneState = loadDoneState();
  doneState[id] = !doneState[id];
  saveDoneState(doneState);

  const checkbox = el.querySelector('.todo-checkbox');
  if (doneState[id]) {
    el.classList.add('done');
    checkbox.textContent = '✔';
  } else {
    el.classList.remove('done');
    checkbox.textContent = '';
  }

  // Update badge count
  const allItems = document.querySelectorAll('.todo-item');
  const activeCount = [...allItems].filter(i => !i.classList.contains('done')).length;
  const badge = document.getElementById('todosBadge');
  if (badge) badge.textContent = `${activeCount} ACTIVE`;
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

  _unsubTodos = base.collection('todos').doc(today)
    .onSnapshot(snap => {
      if (!snap.exists) return;
      const done = snap.data().done || {};
      if (JSON.stringify(done) !== JSON.stringify(_doneState)) {
        _doneState = done;
        localStorage.setItem('hutch_done', JSON.stringify(done));
        if (_currentTodos.length > 0) renderTodosFromState();
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
}

function teardownListeners() {
  if (_unsubWorkout)   { _unsubWorkout();   _unsubWorkout   = null; }
  if (_unsubFood)      { _unsubFood();      _unsubFood      = null; }
  if (_unsubTodos)     { _unsubTodos();     _unsubTodos     = null; }
  if (_unsubCalDone)   { _unsubCalDone();   _unsubCalDone   = null; }
  if (_unsubMacroGoals){ _unsubMacroGoals(); _unsubMacroGoals = null; }
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
  renderWorkout(data.workout   || null);
  renderMacros(data.macros     || null);
  renderTodos(data.todos       || []);
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
