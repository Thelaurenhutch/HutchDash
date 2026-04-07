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

// ── Utility: format a date string nicely ──
const fmtDate = (isoStr) => {
  if (!isoStr) return '';
  const d = new Date(isoStr + 'T00:00:00');
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
};

// ══════════════════════════════════════════
//  CALENDAR
// ══════════════════════════════════════════
function renderCalendar(events) {
  const body = document.getElementById('calendarBody');

  if (!events || events.length === 0) {
    body.innerHTML = `<p class="no-events">No events scheduled today.</p>`;
    return;
  }

  body.innerHTML = events.map(ev => `
    <div class="calendar-event">
      <span class="event-time">${escHtml(ev.time)}</span>
      <div class="event-dot" style="background:${ev.color || '#5B7FA6'}; border-color:var(--brown);"></div>
      <div style="flex:1; min-width:0;">
        <span class="event-title">${escHtml(ev.title)}</span>
        <span class="event-source">${escHtml(ev.source || '')}</span>
      </div>
    </div>
  `).join('');
}

// ══════════════════════════════════════════
//  WORKOUT — STATE & LOGIC
// ══════════════════════════════════════════
let _workoutExercises = [];
const TOTAL_SETS = 3;

function loadWorkoutState() {
  try {
    const raw = localStorage.getItem('hutch_workout_' + getTodayStr());
    return raw ? JSON.parse(raw) : { sets: 0, checks: {} };
  } catch { return { sets: 0, checks: {} }; }
}

function saveWorkoutState(state) {
  localStorage.setItem('hutch_workout_' + getTodayStr(), JSON.stringify(state));
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

function getTodayFoodLog() {
  try {
    const raw = localStorage.getItem('hutch_food_' + getTodayStr());
    return raw ? JSON.parse(raw) : [];
  } catch { return []; }
}

function saveTodayFoodLog(log) {
  localStorage.setItem('hutch_food_' + getTodayStr(), JSON.stringify(log));
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

  const stats = [
    { label: 'CALORIES', unit: 'kcal', cls: 'cal',  logged: totals.cal,  goal: macros.goal_calories },
    { label: 'PROTEIN',  unit: 'g',    cls: 'pro',  logged: totals.pro,  goal: macros.goal_protein  },
    { label: 'CARBS',    unit: 'g',    cls: 'carb', logged: totals.carb, goal: macros.goal_carbs    },
    { label: 'FAT',      unit: 'g',    cls: 'fat',  logged: totals.fat,  goal: macros.goal_fat      },
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
// Client-side done state (persisted in localStorage)
function loadDoneState() {
  try { return JSON.parse(localStorage.getItem('hutch_done') || '{}'); }
  catch { return {}; }
}

function saveDoneState(state) {
  localStorage.setItem('hutch_done', JSON.stringify(state));
}

function renderTodos(todos) {
  const body  = document.getElementById('todosBody');
  const badge = document.getElementById('todosBadge');

  if (!todos || todos.length === 0) {
    body.innerHTML = `<p class="empty-todos">All clear, agent. No objectives outstanding.</p>`;
    if (badge) badge.textContent = '0 ACTIVE';
    return;
  }

  const doneState = loadDoneState();

  // merge server "done" with localStorage
  todos.forEach(t => {
    if (t.done) doneState[t.id] = true;
  });

  const activeTodos = todos.filter(t => !doneState[t.id]);
  if (badge) badge.textContent = `${activeTodos.length} ACTIVE`;

  const html = `<div class="todos-grid">${todos.map(t => {
    const done = !!doneState[t.id];
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
      </div>
    `;
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
  // Duplicate content so the loop looks seamless
  ticker.innerHTML += '&nbsp;&nbsp;&nbsp;' + ticker.innerHTML;
}

// ══════════════════════════════════════════
//  MAIN INIT
// ══════════════════════════════════════════
async function init() {
  setupTicker();

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
