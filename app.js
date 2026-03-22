'use strict';

// ===== ストレージ =====
const STORAGE_KEYS = { sessions: 'study_sessions', subjects: 'study_subjects' };

function loadData(key) {
  try { return JSON.parse(localStorage.getItem(key)) || null; } catch { return null; }
}

function saveData(key, data) {
  localStorage.setItem(key, JSON.stringify(data));
}

// ===== 状態 =====
let subjects = loadData(STORAGE_KEYS.subjects) || [
  { id: 's1', name: '数学', color: '#4f8ef7' },
  { id: 's2', name: '英語', color: '#27ae60' },
  { id: 's3', name: '理科', color: '#e84040' },
  { id: 's4', name: '社会', color: '#f5a623' },
];

let sessions = loadData(STORAGE_KEYS.sessions) || [];

let timerState = {
  status: 'idle', // idle | running | paused
  startTime: null,
  elapsed: 0,
  intervalId: null,
};

// ===== DOM参照 =====
const $ = id => document.getElementById(id);

const timerDisplay  = $('timerDisplay');
const startBtn      = $('startBtn');
const pauseBtn      = $('pauseBtn');
const stopBtn       = $('stopBtn');
const subjectSelect = $('subjectSelect');
const sessionNote   = $('sessionNote');
const todayDate     = $('todayDate');
const subjectModal  = $('subjectModal');
const newSubjectInput = $('newSubjectInput');
const newSubjectColor = $('newSubjectColor');

// ===== 初期化 =====
function init() {
  todayDate.textContent = formatDate(new Date());
  renderSubjectSelect();
  renderTodayStats();
  renderSessionList();
  renderWeeklyChart();
  renderAllSubjectsStats();
  setupEventListeners();
}

// ===== イベント設定 =====
function setupEventListeners() {
  startBtn.addEventListener('click', handleStart);
  pauseBtn.addEventListener('click', handlePause);
  stopBtn.addEventListener('click', handleStop);

  $('manageSubjectsBtn').addEventListener('click', () => {
    renderSubjectListModal();
    subjectModal.classList.remove('hidden');
  });
  $('closeModalBtn').addEventListener('click', () => subjectModal.classList.add('hidden'));
  subjectModal.addEventListener('click', e => { if (e.target === subjectModal) subjectModal.classList.add('hidden'); });

  $('addSubjectBtn').addEventListener('click', handleAddSubject);
  newSubjectInput.addEventListener('keydown', e => { if (e.key === 'Enter') handleAddSubject(); });

  document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      document.querySelectorAll('.tab-content').forEach(c => c.classList.add('hidden'));
      $(`${btn.dataset.tab}Tab`).classList.remove('hidden');
      if (btn.dataset.tab === 'weekly') renderWeeklyChart();
    });
  });
}

// ===== タイマー操作 =====
function handleStart() {
  if (timerState.status === 'idle') {
    timerState.elapsed = 0;
  }
  timerState.status = 'running';
  timerState.startTime = Date.now();
  timerState.intervalId = setInterval(tickTimer, 500);
  updateTimerButtons();
  timerDisplay.className = 'timer-display running';
}

function handlePause() {
  if (timerState.status !== 'running') return;
  clearInterval(timerState.intervalId);
  timerState.elapsed += Date.now() - timerState.startTime;
  timerState.status = 'paused';
  updateTimerButtons();
  timerDisplay.className = 'timer-display paused';
}

function handleStop() {
  if (timerState.status === 'running') {
    timerState.elapsed += Date.now() - timerState.startTime;
  }
  clearInterval(timerState.intervalId);

  const durationMs = timerState.elapsed;
  if (durationMs < 5000) {
    alert('5秒以上計測してから終了してください。');
    resetTimer();
    return;
  }

  const subjectId = subjectSelect.value;
  const note = sessionNote.value.trim();
  const session = {
    id: 'sess_' + Date.now(),
    subjectId,
    durationMs,
    note,
    date: new Date().toISOString(),
  };

  sessions.unshift(session);
  saveData(STORAGE_KEYS.sessions, sessions);

  resetTimer();
  sessionNote.value = '';
  renderTodayStats();
  renderSessionList();
  renderAllSubjectsStats();
  if (!document.querySelector('[data-tab="weekly"]').classList.contains('active') === false) {
    renderWeeklyChart();
  }
}

function tickTimer() {
  const current = timerState.elapsed + (Date.now() - timerState.startTime);
  timerDisplay.textContent = formatDuration(current);
}

function resetTimer() {
  clearInterval(timerState.intervalId);
  timerState = { status: 'idle', startTime: null, elapsed: 0, intervalId: null };
  timerDisplay.textContent = '00:00:00';
  timerDisplay.className = 'timer-display';
  updateTimerButtons();
}

function updateTimerButtons() {
  const s = timerState.status;
  startBtn.disabled  = s === 'running';
  pauseBtn.disabled  = s !== 'running';
  stopBtn.disabled   = s === 'idle';
  startBtn.textContent = s === 'paused' ? '再開' : '開始';
}

// ===== 科目セレクト =====
function renderSubjectSelect() {
  subjectSelect.innerHTML = '';
  subjects.forEach(sub => {
    const opt = document.createElement('option');
    opt.value = sub.id;
    opt.textContent = sub.name;
    subjectSelect.appendChild(opt);
  });
}

// ===== 今日の統計 =====
function renderTodayStats() {
  const todaySessions = getTodaySessions();
  const totalMs = todaySessions.reduce((sum, s) => sum + s.durationMs, 0);
  $('totalTodayTime').textContent = formatDurationHM(totalMs);
  $('totalTodaySessions').textContent = todaySessions.length;

  // 科目別バー
  const bySubject = groupBySubject(todaySessions);
  const container = $('subjectBreakdown');
  container.innerHTML = '';

  if (Object.keys(bySubject).length === 0) return;

  const maxMs = Math.max(...Object.values(bySubject).map(v => v.totalMs));

  Object.entries(bySubject).forEach(([subId, data]) => {
    const sub = getSubject(subId);
    const pct = maxMs > 0 ? (data.totalMs / maxMs) * 100 : 0;
    const row = document.createElement('div');
    row.className = 'subject-bar-row';
    row.innerHTML = `
      <span class="subject-bar-label" title="${sub.name}">${sub.name}</span>
      <div class="subject-bar-track">
        <div class="subject-bar-fill" style="width:${pct}%;background:${sub.color}"></div>
      </div>
      <span class="subject-bar-time">${formatDurationHM(data.totalMs)}</span>
    `;
    container.appendChild(row);
  });
}

// ===== セッション履歴 =====
function renderSessionList() {
  const list = $('sessionList');
  const recent = sessions.slice(0, 50);

  if (recent.length === 0) {
    list.innerHTML = '<p class="empty-message">まだ記録がありません</p>';
    return;
  }

  list.innerHTML = '';
  let lastDate = '';

  recent.forEach(sess => {
    const date = sess.date.slice(0, 10);
    if (date !== lastDate) {
      const header = document.createElement('div');
      header.style.cssText = 'font-size:0.78rem;font-weight:700;color:var(--text-muted);padding:10px 0 4px;text-transform:uppercase;letter-spacing:0.05em;';
      header.textContent = formatDateLabel(new Date(sess.date));
      list.appendChild(header);
      lastDate = date;
    }

    const sub = getSubject(sess.subjectId);
    const item = document.createElement('div');
    item.className = 'session-item';
    item.innerHTML = `
      <span class="session-color-dot" style="background:${sub.color}"></span>
      <div class="session-info">
        <div class="session-subject">${sub.name}</div>
        <div class="session-meta">${formatTime(new Date(sess.date))}${sess.note ? ' · ' + escapeHtml(sess.note) : ''}</div>
      </div>
      <span class="session-duration">${formatDurationHM(sess.durationMs)}</span>
      <button class="session-delete" data-id="${sess.id}" title="削除">✕</button>
    `;
    item.querySelector('.session-delete').addEventListener('click', () => deleteSession(sess.id));
    list.appendChild(item);
  });
}

function deleteSession(id) {
  if (!confirm('このセッションを削除しますか？')) return;
  sessions = sessions.filter(s => s.id !== id);
  saveData(STORAGE_KEYS.sessions, sessions);
  renderTodayStats();
  renderSessionList();
  renderAllSubjectsStats();
}

// ===== 週間グラフ =====
function renderWeeklyChart() {
  const canvas = $('weeklyChart');
  const ctx = canvas.getContext('2d');
  const dpr = window.devicePixelRatio || 1;
  const w = canvas.offsetWidth || 400;
  const h = 200;
  canvas.width = w * dpr;
  canvas.height = h * dpr;
  canvas.style.width = w + 'px';
  canvas.style.height = h + 'px';
  ctx.scale(dpr, dpr);
  ctx.clearRect(0, 0, w, h);

  const days = [];
  for (let i = 6; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    days.push(d);
  }

  const dayTotals = days.map(d => {
    const key = d.toISOString().slice(0, 10);
    return sessions
      .filter(s => s.date.slice(0, 10) === key)
      .reduce((sum, s) => sum + s.durationMs, 0);
  });

  const maxMs = Math.max(...dayTotals, 1);
  const paddingLeft = 44, paddingBottom = 28, paddingTop = 16, paddingRight = 12;
  const chartW = w - paddingLeft - paddingRight;
  const chartH = h - paddingBottom - paddingTop;
  const barW = (chartW / days.length) * 0.55;
  const barGap = chartW / days.length;

  // 横グリッド
  ctx.strokeStyle = '#e2e8f0';
  ctx.lineWidth = 1;
  [0.25, 0.5, 0.75, 1].forEach(ratio => {
    const y = paddingTop + chartH * (1 - ratio);
    ctx.beginPath();
    ctx.moveTo(paddingLeft, y);
    ctx.lineTo(w - paddingRight, y);
    ctx.stroke();

    ctx.fillStyle = '#6b7280';
    ctx.font = '10px sans-serif';
    ctx.textAlign = 'right';
    ctx.fillText(formatDurationHM(maxMs * ratio), paddingLeft - 4, y + 4);
  });

  // バー
  days.forEach((d, i) => {
    const ms = dayTotals[i];
    const barH = (ms / maxMs) * chartH;
    const x = paddingLeft + barGap * i + (barGap - barW) / 2;
    const y = paddingTop + chartH - barH;

    const isToday = i === 6;
    ctx.fillStyle = isToday ? '#4f8ef7' : '#c7d8fe';
    ctx.beginPath();
    ctx.roundRect(x, y, barW, barH, [4, 4, 0, 0]);
    ctx.fill();

    // 曜日ラベル
    ctx.fillStyle = isToday ? '#4f8ef7' : '#6b7280';
    ctx.font = isToday ? 'bold 11px sans-serif' : '11px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(getDayLabel(d), x + barW / 2, h - 8);
  });
}

// ===== 全科目統計 =====
function renderAllSubjectsStats() {
  const container = $('allSubjectsStats');
  const bySubject = groupBySubject(sessions);

  if (Object.keys(bySubject).length === 0) {
    container.innerHTML = '<p class="empty-message">まだ記録がありません</p>';
    return;
  }

  const sorted = Object.entries(bySubject).sort((a, b) => b[1].totalMs - a[1].totalMs);

  container.innerHTML = '';
  sorted.forEach(([subId, data]) => {
    const sub = getSubject(subId);
    const row = document.createElement('div');
    row.className = 'all-subject-row';
    row.innerHTML = `
      <span class="all-subject-dot" style="background:${sub.color}"></span>
      <span class="all-subject-name">${sub.name}</span>
      <span class="all-subject-sessions">${data.count}回</span>
      <span class="all-subject-time">${formatDurationHM(data.totalMs)}</span>
    `;
    container.appendChild(row);
  });
}

// ===== 科目管理 =====
function handleAddSubject() {
  const name = newSubjectInput.value.trim();
  if (!name) { newSubjectInput.focus(); return; }
  if (subjects.some(s => s.name === name)) { alert('同じ名前の科目が既に存在します。'); return; }

  subjects.push({ id: 'sub_' + Date.now(), name, color: newSubjectColor.value });
  saveData(STORAGE_KEYS.subjects, subjects);
  newSubjectInput.value = '';
  renderSubjectSelect();
  renderSubjectListModal();
}

function renderSubjectListModal() {
  const list = $('subjectList');
  list.innerHTML = '';
  subjects.forEach(sub => {
    const li = document.createElement('li');
    li.innerHTML = `
      <span class="subject-list-dot" style="background:${sub.color}"></span>
      <span class="subject-list-name">${escapeHtml(sub.name)}</span>
      <button class="btn btn-icon" data-del="${sub.id}" title="削除">🗑️</button>
    `;
    li.querySelector('[data-del]').addEventListener('click', () => deleteSubject(sub.id));
    list.appendChild(li);
  });
}

function deleteSubject(id) {
  if (subjects.length <= 1) { alert('科目は最低1つ必要です。'); return; }
  if (!confirm('この科目を削除しますか？（記録は残ります）')) return;
  subjects = subjects.filter(s => s.id !== id);
  saveData(STORAGE_KEYS.subjects, subjects);
  renderSubjectSelect();
  renderSubjectListModal();
}

// ===== ユーティリティ =====
function getTodaySessions() {
  const today = new Date().toISOString().slice(0, 10);
  return sessions.filter(s => s.date.slice(0, 10) === today);
}

function groupBySubject(sessArr) {
  const map = {};
  sessArr.forEach(s => {
    if (!map[s.subjectId]) map[s.subjectId] = { totalMs: 0, count: 0 };
    map[s.subjectId].totalMs += s.durationMs;
    map[s.subjectId].count++;
  });
  return map;
}

function getSubject(id) {
  return subjects.find(s => s.id === id) || { name: '不明', color: '#aaa' };
}

function formatDuration(ms) {
  const s = Math.floor(ms / 1000);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  return `${pad(h)}:${pad(m)}:${pad(sec)}`;
}

function formatDurationHM(ms) {
  const totalMin = Math.floor(ms / 60000);
  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;
  if (h > 0) return `${h}時間${m}分`;
  return `${m}分`;
}

function formatDate(d) {
  return d.toLocaleDateString('ja-JP', { year: 'numeric', month: 'long', day: 'numeric', weekday: 'long' });
}

function formatDateLabel(d) {
  const today = new Date().toISOString().slice(0, 10);
  const key = d.toISOString().slice(0, 10);
  if (key === today) return '今日';
  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);
  if (key === yesterday.toISOString().slice(0, 10)) return '昨日';
  return d.toLocaleDateString('ja-JP', { month: 'short', day: 'numeric', weekday: 'short' });
}

function formatTime(d) {
  return d.toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit' });
}

function getDayLabel(d) {
  const days = ['日', '月', '火', '水', '木', '金', '土'];
  return days[d.getDay()];
}

function pad(n) { return String(n).padStart(2, '0'); }

function escapeHtml(str) {
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

// ===== 起動 =====
init();
