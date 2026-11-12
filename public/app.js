'use strict';

const $ = (sel) => document.querySelector(sel);
const STATUS_ORDER = ['todo', 'in_progress', 'done'];
let sprints = [];
let currentId = null;

async function api(path, options = {}) {
  const res = await fetch(path, {
    headers: { 'Content-Type': 'application/json' },
    ...options,
    body: options.body ? JSON.stringify(options.body) : undefined,
  });
  if (res.status === 204) return null;
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `Request failed (${res.status})`);
  return data;
}

function showMessage(text) {
  $('#message').textContent = text || '';
  if (text) setTimeout(() => { if ($('#message').textContent === text) $('#message').textContent = ''; }, 5000);
}

// Wrap async handlers so errors are shown instead of lost
const safe = (fn) => async (...args) => { try { await fn(...args); } catch (e) { showMessage(e.message); } };

async function checkReady() {
  const pill = $('#dbStatus');
  try {
    const r = await fetch('/ready');
    pill.textContent = r.ok ? 'PostgreSQL + MongoDB connected' : 'database not ready';
    pill.className = 'pill ' + (r.ok ? 'ok' : 'bad');
  } catch { pill.textContent = 'server unreachable'; pill.className = 'pill bad'; }
}

async function loadSprints(selectId) {
  sprints = await api('/api/sprints');
  const select = $('#sprintSelect');
  select.replaceChildren(...sprints.map((s) => {
    const o = document.createElement('option');
    o.value = s.id; o.textContent = `${s.name} (${s.status})`;
    return o;
  }));
  const has = (id) => sprints.some((s) => s.id === id);
  currentId = has(selectId) ? selectId : has(currentId) ? currentId
    : (sprints.find((s) => s.status === 'active') || sprints[0] || {}).id || null;
  if (currentId) select.value = currentId;
  await renderBoard();
}

async function renderBoard() {
  const show = !!currentId;
  ['#sprintInfo', '#taskForm', '#board'].forEach((s) => $(s).classList.toggle('hidden', !show));
  $('#empty').classList.toggle('hidden', show);
  $('#sprintSelect').classList.toggle('hidden', !show);
  if (!show) return;

  const [summary, tasks] = await Promise.all([
    api(`/api/sprints/${currentId}/summary`),
    api(`/api/tasks?sprintId=${currentId}`),
  ]);
  const s = summary.sprint;
  $('#sprintName').textContent = s.name;
  $('#sprintMeta').textContent = `${s.start_date} → ${s.end_date}${s.goal ? ' · Goal: ' + s.goal : ''}`;
  $('#statusSelect').value = s.status;
  $('#bar').style.width = summary.percentComplete + '%';
  $('#progressText').textContent =
    `${summary.percentComplete}% complete · ${summary.points.done} of ${summary.points.total} story points done`;

  document.querySelectorAll('.col').forEach((col) => {
    const status = col.dataset.status;
    const list = tasks.filter((t) => t.status === status);
    col.querySelector('.count').textContent = `(${list.length})`;
    col.querySelector('.list').replaceChildren(...list.map(taskCard));
  });
}

function button(label, title, onClick, cls = 'ghost') {
  const b = document.createElement('button');
  b.className = cls; b.textContent = label; b.title = title;
  b.addEventListener('click', safe(onClick));
  return b;
}

function taskCard(task) {
  const card = document.createElement('div');
  card.className = 'task';
  const t = document.createElement('div'); t.className = 't'; t.textContent = task.title;
  const meta = document.createElement('div'); meta.className = 'meta';
  meta.textContent = `${task.storyPoints} pt${task.storyPoints === 1 ? '' : 's'}${task.assignee ? ' · ' + task.assignee : ''}`;
  const actions = document.createElement('div'); actions.className = 'actions';

  const i = STATUS_ORDER.indexOf(task.status);
  const move = (to) => async () => { await api(`/api/tasks/${task._id}`, { method: 'PATCH', body: { status: STATUS_ORDER[to] } }); await renderBoard(); };
  if (i > 0) actions.append(button('←', 'Move back', move(i - 1)));
  if (i < 2) actions.append(button('→', 'Move forward', move(i + 1)));
  actions.append(button('✕', 'Delete task', async () => {
    await api(`/api/tasks/${task._id}`, { method: 'DELETE' }); await renderBoard();
  }));
  card.append(t, meta, actions);
  return card;
}

// ---- events ----
$('#sprintSelect').addEventListener('change', safe(async (e) => { currentId = Number(e.target.value); await renderBoard(); }));

$('#statusSelect').addEventListener('change', safe(async (e) => {
  await api(`/api/sprints/${currentId}`, { method: 'PATCH', body: { status: e.target.value } });
  await loadSprints(currentId);
}));

$('#deleteSprint').addEventListener('click', safe(async () => {
  if (!confirm('Delete this sprint and all its tasks?')) return;
  await api(`/api/sprints/${currentId}`, { method: 'DELETE' });
  currentId = null;
  await loadSprints();
}));

$('#sprintForm').addEventListener('submit', safe(async (e) => {
  e.preventDefault();
  const form = e.target;
  const f = Object.fromEntries(new FormData(form));
  const created = await api('/api/sprints', { method: 'POST', body: f });
  form.reset(); setDefaultDates();
  $('#newSprint').open = false;
  await loadSprints(created.id);
}));

$('#taskForm').addEventListener('submit', safe(async (e) => {
  e.preventDefault();
  const form = e.target;
  const f = Object.fromEntries(new FormData(form));
  await api('/api/tasks', { method: 'POST', body: {
    title: f.title, assignee: f.assignee, storyPoints: Number(f.storyPoints), sprintId: currentId } });
  form.reset();
  form.elements.storyPoints.value = 1;
  await renderBoard();
}));

function setDefaultDates() {
  const iso = (d) => d.toISOString().slice(0, 10);
  const start = new Date(), end = new Date(Date.now() + 13 * 86400000);
  $('#sprintForm [name=start_date]').value = iso(start);
  $('#sprintForm [name=end_date]').value = iso(end);
}

setDefaultDates();
checkReady();
safe(() => loadSprints())();
