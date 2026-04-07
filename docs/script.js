/* ═══════════════════════════════════════════
   HUTCHDASH — script.js
   Fetches data/data.json and renders the
   Wes Anderson × Retro Gaming dashboard.
═══════════════════════════════════════════ */

const DATA_URL = 'data/data.json';

// ── Utility: clamp a percentage 0–100 ──
const pct = (val, max) => Math.min(100, Math.round((val / max) * 100));

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
//  WORKOUT
// ══════════════════════════════════════════
function renderWorkout(workout) {
  const body  = document.getElementById('workoutBody');
  const badge = document.getElementById('workoutBadge');

  if (!workout) {
    body.innerHTML = `<p class="rest-day">★ REST DAY — YOU'VE EARNED IT ★</p>`;
    return;
  }

  if (badge) badge.textContent = workout.label || workout.day || 'DAY';

  const exercises = workout.exercises || [];

  if (exercises.length === 0) {
    body.innerHTML = `<p class="rest-day">★ REST DAY — YOU'VE EARNED IT ★</p>`;
    return;
  }

  const labelHtml = workout.label
    ? `<div class="workout-day-label">${escHtml(workout.label)}</div>`
    : '';

  const rowsHtml = exercises.map(ex => `
    <div class="exercise-row">
      <span class="exercise-name">${escHtml(ex.name)}</span>
      <span class="exercise-sets">${ex.sets}×${ex.reps}</span>
    </div>
    ${ex.notes ? `<div class="exercise-notes">${escHtml(ex.notes)}</div>` : ''}
  `).join('');

  body.innerHTML = labelHtml + rowsHtml;
}

// ══════════════════════════════════════════
//  MACROS
// ══════════════════════════════════════════
function renderMacros(macros) {
  const body = document.getElementById('macrosBody');
  if (!macros) { body.innerHTML = ''; return; }

  const stats = [
    {
      label: 'CALORIES', unit: 'kcal', cls: 'cal',
      logged: macros.logged_calories, goal: macros.goal_calories,
    },
    {
      label: 'PROTEIN', unit: 'g', cls: 'pro',
      logged: macros.logged_protein, goal: macros.goal_protein,
    },
    {
      label: 'CARBS', unit: 'g', cls: 'carb',
      logged: macros.logged_carbs, goal: macros.goal_carbs,
    },
    {
      label: 'FAT', unit: 'g', cls: 'fat',
      logged: macros.logged_fat, goal: macros.goal_fat,
    },
  ];

  const barsHtml = stats.map(s => {
    const p        = pct(s.logged, s.goal);
    const isOver   = s.logged > s.goal;
    const fillCls  = `bar-fill ${s.cls}${isOver ? ' bar-over' : ''}`;
    return `
      <div class="macro-stat">
        <div class="macro-label-row">
          <span class="macro-label">${s.label}</span>
          <span class="macro-values">${s.logged} / ${s.goal}${s.unit}</span>
        </div>
        <div class="bar-track">
          <div class="${fillCls}" style="width:${p}%;"></div>
        </div>
      </div>
    `;
  }).join('');

  const totalHtml = `
    <div class="macro-total-row">
      <div class="macro-total-item">
        <span class="macro-total-num">${macros.logged_calories}</span>
        <span class="macro-total-lbl">kcal</span>
      </div>
      <div class="macro-total-item">
        <span class="macro-total-num">${macros.logged_protein}g</span>
        <span class="macro-total-lbl">protein</span>
      </div>
      <div class="macro-total-item">
        <span class="macro-total-num">${macros.logged_carbs}g</span>
        <span class="macro-total-lbl">carbs</span>
      </div>
      <div class="macro-total-item">
        <span class="macro-total-num">${macros.logged_fat}g</span>
        <span class="macro-total-lbl">fat</span>
      </div>
    </div>
  `;

  body.innerHTML = barsHtml + totalHtml;
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
