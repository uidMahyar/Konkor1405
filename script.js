'use strict';

/* ============================================================
   Data: subject presets with official coefficients (انسانی)
   ============================================================ */
const SUBJECT_PRESETS = {
  sarasari: {
    label: 'سراسری',
    subjects: [
      { name: 'ریاضی و آمار', coef: 6 },
      { name: 'علوم و فنون ادبی', coef: 8 },
      { name: 'جامعه‌شناسی', coef: 5 },
      { name: 'روان‌شناسی', coef: 2 },
      { name: 'عربی، زبان قرآن', coef: 5 },
      { name: 'تاریخ', coef: 5 },
      { name: 'جغرافیا', coef: 5 },
      { name: 'فلسفه و منطق', coef: 5 },
      { name: 'اقتصاد', coef: 2 },
    ],
  },
  farhangian: {
    label: 'فرهنگیان',
    subjects: [
      { name: 'ریاضی و آمار', coef: 6 },
      { name: 'علوم و فنون ادبی', coef: 8 },
      { name: 'جامعه‌شناسی', coef: 5 },
      { name: 'روان‌شناسی', coef: 2 },
      { name: 'عربی، زبان قرآن', coef: 5 },
      { name: 'تاریخ', coef: 5 },
      { name: 'جغرافیا', coef: 5 },
      { name: 'فلسفه و منطق', coef: 5 },
      { name: 'اقتصاد', coef: 2 },
      { name: 'هوش و استعداد معلمی', coef: 3 },
      { name: 'تعلیم و تربیت اسلامی', coef: 2 },
    ],
  },
  zaban: {
    label: 'زبان',
    subjects: [
      { name: 'زبان تخصصی', coef: 4 },
      { name: 'هوش و استعداد معلمی', coef: 3 },
      { name: 'تعلیم و تربیت اسلامی', coef: 2 },
    ],
  },
};

/* ============================================================
   Persian digit helpers
   ============================================================ */
const FA_DIGITS = ['۰', '۱', '۲', '۳', '۴', '۵', '۶', '۷', '۸', '۹'];
function faNum(n) {
  return String(n).replace(/[0-9]/g, d => FA_DIGITS[d]);
}
function normalizeDigits(str) {
  const fa = { '۰': '0', '۱': '1', '۲': '2', '۳': '3', '۴': '4', '۵': '5', '۶': '6', '۷': '7', '۸': '8', '۹': '9' };
  const ar = { '٠': '0', '١': '1', '٢': '2', '٣': '3', '٤': '4', '٥': '5', '٦': '6', '٧': '7', '٨': '8', '٩': '9' };
  return str.replace(/[۰-۹]/g, d => fa[d]).replace(/[٠-٩]/g, d => ar[d]);
}

/* ============================================================
   Storage
   ============================================================ */
const STORAGE_KEY = 'pasokhbarg_exams_v1';

function loadExams() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch (e) {
    return [];
  }
}
function saveExams() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(exams));
  } catch (e) { /* storage unavailable — ignore silently */ }
}

let exams = loadExams();
let currentExamId = null;
let sheetMode = 'answers'; // 'answers' | 'key'
let editingExisting = false;
let timerInterval = null;
let bellWatcherInterval = null;
let endBellAudio = null;
let sheetPracticeSubjectIdx = null; // null = پاسخنامه‌ی کامل؛ عدد = محدود به همون درسِ برگه‌ی تمرین

function getCurrentExam() {
  return exams.find(e => e.id === currentExamId) || null;
}

/* ============================================================
   End-of-exam bell — رینگ زنگ پایان آزمون
   مستقل از صفحه‌ی فعلی: از لحظه‌ی باز شدن اپ، هر ثانیه چک می‌کنه
   آیا آزمونی که تایمرش روشنه به پایان زمانش رسیده یا نه، صرف نظر
   از این‌که کاربر الان تو کدوم صفحه‌ست (پاسخنامه، کارنامه، خونه...)
   ============================================================ */
function playEndBell() {
  try {
    if (!endBellAudio) endBellAudio = new Audio('sound/end.mp3');
    endBellAudio.currentTime = 0;
    endBellAudio.play().catch(() => { /* پخش خودکار بلاک شد — کاربر باید یه بار با صفحه تعامل کرده باشه */ });
  } catch (e) { /* پخش صدا در دسترس نیست — نادیده گرفته می‌شه */ }
}

function checkExamsForExpiry() {
  const now = Date.now();
  let anyChanged = false;
  exams.forEach(exam => {
    if (!exam.durationMinutes || !exam.timerStartedAt || exam.bellPlayed) return;
    const totalMs = exam.durationMinutes * 60 * 1000;
    if (now - exam.timerStartedAt >= totalMs) {
      exam.bellPlayed = true;
      anyChanged = true;
      playEndBell();
    }
  });
  if (anyChanged) saveExams();
}

function startBellWatcher() {
  if (bellWatcherInterval) return;
  checkExamsForExpiry();
  bellWatcherInterval = setInterval(checkExamsForExpiry, 1000);
}

/* ============================================================
   Sheet countdown timer (نمایش عددی — فقط وقتی صفحه‌ی پاسخنامه بازه)
   ============================================================ */
function stopTimerInterval() {
  if (timerInterval) {
    clearInterval(timerInterval);
    timerInterval = null;
  }
}

function formatTimer(ms) {
  const totalSec = Math.max(0, Math.ceil(ms / 1000));
  const m = Math.floor(totalSec / 60);
  const s = totalSec % 60;
  return faNum(String(m).padStart(2, '0')) + ':' + faNum(String(s).padStart(2, '0'));
}

function updateTimerDisplay() {
  const exam = getCurrentExam();
  const wrap = document.getElementById('sheet-timer');
  const valueEl = document.getElementById('sheet-timer-value');
  if (!exam || !exam.durationMinutes || !exam.timerStartedAt) return;

  const totalMs = exam.durationMinutes * 60 * 1000;
  const remaining = totalMs - (Date.now() - exam.timerStartedAt);

  if (remaining <= 0) {
    valueEl.textContent = '۰۰:۰۰';
    wrap.classList.add('expired');
    wrap.classList.remove('warning');
    stopTimerInterval();
    return;
  }
  valueEl.textContent = formatTimer(remaining);
  wrap.classList.toggle('warning', remaining <= 60000);
}

document.getElementById('sheet-timer').addEventListener('click', () => {
  const exam = getCurrentExam();
  if (!exam || !exam.durationMinutes) return;
  if (!confirm(`تایمر از اول شروع بشه (${faNum(exam.durationMinutes)} دقیقه)؟`)) return;
  exam.timerStartedAt = Date.now();
  exam.bellPlayed = false;
  saveExams();
  document.getElementById('sheet-timer').classList.remove('expired', 'warning');
  stopTimerInterval();
  updateTimerDisplay();
  timerInterval = setInterval(updateTimerDisplay, 1000);
});

/* ============================================================
   Navigation
   ============================================================ */
function showScreen(id) {
  document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
  document.getElementById(id).classList.add('active');
  window.scrollTo(0, 0);
}

document.querySelectorAll('[data-nav="home"]').forEach(btn => {
  btn.addEventListener('click', () => {
    stopTimerInterval();
    renderExamList();
    showScreen('screen-home');
  });
});

/* ============================================================
   Home screen
   ============================================================ */
function escapeHtml(str) {
  const d = document.createElement('div');
  d.textContent = str;
  return d.innerHTML;
}

function renderExamList() {
  const list = document.getElementById('exam-list');
  const empty = document.getElementById('empty-state');
  list.innerHTML = '';

  if (exams.length === 0) {
    empty.hidden = false;
    return;
  }
  empty.hidden = true;

  [...exams].sort((a, b) => b.createdAt - a.createdAt).forEach(exam => {
    const card = document.createElement('div');
    card.className = 'exam-card';

    const totalQ = exam.subjects.reduce((s, sub) => s + sub.count, 0);
    const answeredCount = Object.keys(exam.answers || {}).length;
    const keyedCount = Object.keys(exam.key || {}).length;

    let scoreHtml;
    if (keyedCount > 0) {
      const { overall } = computeResults(exam);
      scoreHtml = overall === null
        ? `<span class="exam-card-score pending">کلید ناقص</span>`
        : `<span class="exam-card-score">${faNum(overall.toFixed(0))}٪</span>`;
    } else {
      scoreHtml = `<span class="exam-card-score pending">${answeredCount > 0 ? 'بدون کلید' : 'شروع نشده'}</span>`;
    }

    const dateStr = new Date(exam.createdAt).toLocaleDateString('fa-IR');
    card.innerHTML = `
      <div class="exam-card-main">
        <span class="exam-card-name">${escapeHtml(exam.name)}</span>
        <span class="exam-card-meta">${SUBJECT_PRESETS[exam.type].label} · ${faNum(totalQ)} سوال · ${dateStr}</span>
      </div>
      ${scoreHtml}
      <button class="exam-card-edit" aria-label="تغییر نام آزمون" type="button">✐</button>
      <button class="exam-card-del" aria-label="حذف آزمون" type="button">✕</button>
    `;

    card.addEventListener('click', (e) => {
      if (e.target.closest('.exam-card-del') || e.target.closest('.exam-card-edit')) return;
      openExam(exam.id);
    });
    card.querySelector('.exam-card-edit').addEventListener('click', (e) => {
      e.stopPropagation();
      const newName = prompt('نام جدید آزمون:', exam.name);
      if (newName === null) return; // انصراف
      const trimmed = newName.trim();
      if (!trimmed) return;
      exam.name = trimmed;
      saveExams();
      renderExamList();
    });
    card.querySelector('.exam-card-del').addEventListener('click', (e) => {
      e.stopPropagation();
      if (confirm(`آزمون «${exam.name}» حذف بشه؟ این کار برگشت‌ناپذیره.`)) {
        exams = exams.filter(x => x.id !== exam.id);
        saveExams();
        renderExamList();
      }
    });

    list.appendChild(card);
  });
}

function openExam(id) {
  currentExamId = id;
  sheetPracticeSubjectIdx = null;
  const exam = getCurrentExam();
  const keyedCount = Object.keys(exam.key || {}).length;
  if (keyedCount > 0) {
    renderResults();
    showScreen('screen-results');
  } else {
    sheetMode = 'answers';
    renderSheet();
    showScreen('screen-sheet');
  }
}

document.getElementById('btn-new-exam').addEventListener('click', () => {
  currentExamId = null;
  openSetup(null);
});

/* ============================================================
   Setup screen
   ============================================================ */
let setupType = 'sarasari';
let setupSubjects = [];

function defaultExamName() {
  return `آزمون ${new Date().toLocaleDateString('fa-IR')}`;
}

function openSetup(existingExam) {
  const nameInput = document.getElementById('exam-name');
  const durationInput = document.getElementById('exam-duration');
  if (existingExam) {
    editingExisting = true;
    nameInput.value = existingExam.name;
    durationInput.value = existingExam.durationMinutes || '';
    setupType = existingExam.type;
    setupSubjects = SUBJECT_PRESETS[existingExam.type].subjects.map(s => {
      const match = existingExam.subjects.find(es => es.name === s.name);
      return { name: s.name, coef: match ? match.coef : s.coef, count: match ? match.count : 0 };
    });
  } else {
    editingExisting = false;
    nameInput.value = defaultExamName();
    durationInput.value = '';
    setupType = 'sarasari';
    setupSubjects = SUBJECT_PRESETS.sarasari.subjects.map(s => ({ ...s, count: 0 }));
  }
  renderTypeTabs();
  renderSubjectsTable();
  showScreen('screen-setup');
}

function renderTypeTabs() {
  document.querySelectorAll('.type-tab').forEach(tab => {
    tab.classList.toggle('active', tab.dataset.type === setupType);
  });
}

document.querySelectorAll('.type-tab').forEach(tab => {
  tab.addEventListener('click', () => {
    const type = tab.dataset.type;
    if (type === setupType) return;
    setupType = type;
    setupSubjects = SUBJECT_PRESETS[type].subjects.map(s => ({ ...s, count: 0 }));
    renderTypeTabs();
    renderSubjectsTable();
  });
});

function renderSubjectsTable() {
  const rowsEl = document.getElementById('subjects-rows');
  rowsEl.innerHTML = '';
  setupSubjects.forEach((sub, idx) => {
    const row = document.createElement('div');
    row.className = 'subjects-row';
    row.innerHTML = `
      <span class="subject-name">${sub.name}</span>
      <input type="number" class="subject-coef" min="0" step="1" value="${sub.coef}">
      <input type="number" class="subject-count${sub.count === 0 ? ' zero' : ''}" min="0" step="1" value="${sub.count || ''}" placeholder="۰">
    `;
    row.querySelector('.subject-coef').addEventListener('input', (e) => {
      setupSubjects[idx].coef = Number(e.target.value) || 0;
    });
    const countInput = row.querySelector('.subject-count');
    countInput.addEventListener('input', (e) => {
      setupSubjects[idx].count = Math.max(0, Math.floor(Number(e.target.value)) || 0);
      countInput.classList.toggle('zero', setupSubjects[idx].count === 0);
      updateSubjectsTotal();
    });
    rowsEl.appendChild(row);
  });
  updateSubjectsTotal();
}

function updateSubjectsTotal() {
  const total = setupSubjects.reduce((s, sub) => s + (sub.count || 0), 0);
  document.getElementById('subjects-total-count').textContent = faNum(total);
}

document.getElementById('btn-start-sheet').addEventListener('click', () => {
  const active = setupSubjects.filter(s => s.count > 0);
  if (active.length === 0) {
    alert('برای حداقل یه درس تعداد سوال وارد کن.');
    return;
  }
  const name = document.getElementById('exam-name').value.trim() || defaultExamName();
  const durationRaw = document.getElementById('exam-duration').value;
  const durationMinutes = Math.max(0, Math.floor(Number(normalizeDigits(durationRaw))) || 0);

  let cursor = 1;
  const subjectsWithRange = active.map(s => {
    const start = cursor;
    const end = cursor + s.count - 1;
    cursor = end + 1;
    return { name: s.name, coef: s.coef, count: s.count, start, end };
  });

  if (editingExisting && currentExamId) {
    const exam = getCurrentExam();
    const before = JSON.stringify(exam.subjects.map(s => [s.name, s.count]));
    const after = JSON.stringify(subjectsWithRange.map(s => [s.name, s.count]));
    if (before !== after && (Object.keys(exam.answers).length || Object.keys(exam.key).length)) {
      if (!confirm('تغییر تعداد سوالا باعث می‌شه پاسخ‌ها و کلید این آزمون پاک بشن. ادامه بدم؟')) return;
      exam.answers = {};
      exam.key = {};
    }
    exam.name = name;
    exam.type = setupType;
    exam.subjects = subjectsWithRange;
    if (exam.durationMinutes !== durationMinutes) {
      exam.durationMinutes = durationMinutes;
      exam.timerStartedAt = null; // duration changed — clock restarts fresh next time the sheet opens
      exam.bellPlayed = false;
    }
  } else {
    const exam = {
      id: 'exam_' + Date.now() + '_' + Math.random().toString(36).slice(2, 7),
      name,
      type: setupType,
      createdAt: Date.now(),
      subjects: subjectsWithRange,
      answers: {},
      key: {},
      durationMinutes,
      timerStartedAt: null,
      bellPlayed: false,
    };
    exams.push(exam);
    currentExamId = exam.id;
  }
  saveExams();

  sheetPracticeSubjectIdx = null;
  sheetMode = 'answers';
  renderSheet();
  showScreen('screen-sheet');
});

document.getElementById('btn-edit-setup').addEventListener('click', () => {
  openSetup(getCurrentExam());
});

document.getElementById('btn-sheet-home').addEventListener('click', () => {
  if (sheetPracticeSubjectIdx !== null) {
    sheetPracticeSubjectIdx = null;
    renderPractice();
    showScreen('screen-practice');
  } else {
    renderExamList();
    showScreen('screen-home');
  }
});

document.getElementById('btn-sheet-practice-done').addEventListener('click', () => {
  sheetPracticeSubjectIdx = null;
  renderPractice();
  showScreen('screen-practice');
});

/* ============================================================
   Sheet screen (answers / key — shared renderer)
   ============================================================ */
function renderSheet() {
  const exam = getCurrentExam();
  if (!exam) return;
  const practiceMode = sheetPracticeSubjectIdx !== null;
  const practiceSubject = practiceMode ? exam.subjects[sheetPracticeSubjectIdx] : null;

  document.getElementById('sheet-exam-name').textContent = exam.name;
  document.getElementById('sheet-title').textContent = practiceMode
    ? `تمرین: ${practiceSubject.name}`
    : (sheetMode === 'answers' ? 'ثبت پاسخ‌های شما' : 'ثبت کلید سوالات');
  document.getElementById('btn-sheet-back').textContent = sheetMode === 'answers' ? 'بازگشت' : 'مرحله قبل';
  document.getElementById('btn-sheet-next').textContent = sheetMode === 'answers' ? 'بعدی: ثبت کلید' : 'مشاهده کارنامه';
  document.getElementById('bulk-input').value = '';
  document.querySelector('.bulkfill').hidden = practiceMode;
  document.querySelector('.bulk-hint').hidden = practiceMode;
  document.getElementById('sheet-footer-normal').hidden = practiceMode;
  document.getElementById('sheet-footer-practice').hidden = !practiceMode;

  stopTimerInterval();
  const timerWrap = document.getElementById('sheet-timer');
  if (!practiceMode && sheetMode === 'answers' && exam.durationMinutes > 0) {
    if (!exam.timerStartedAt) {
      exam.timerStartedAt = Date.now();
      exam.bellPlayed = false;
      saveExams();
    }
    timerWrap.hidden = false;
    timerWrap.classList.remove('expired', 'warning');
    updateTimerDisplay();
    timerInterval = setInterval(updateTimerDisplay, 1000);
  } else {
    timerWrap.hidden = true;
  }

  const grid = document.getElementById('sheet-grid');
  grid.innerHTML = '';
  const dataStore = practiceMode ? exam.answers : (sheetMode === 'answers' ? exam.answers : exam.key);
  if (!exam.completedQuestions) exam.completedQuestions = {};

  const subjectsToRender = practiceMode ? [practiceSubject] : exam.subjects;

  subjectsToRender.forEach(sub => {
    const group = document.createElement('div');
    group.className = 'subject-group';
    const titleEl = document.createElement('div');
    titleEl.className = 'subject-group-title';
    titleEl.innerHTML = `<span class="name">${sub.name}</span><span class="range">${faNum(sub.start)}–${faNum(sub.end)}</span>`;
    group.appendChild(titleEl);

    for (let q = sub.start; q <= sub.end; q++) {
      const row = document.createElement('div');
      const selected = dataStore[q];
      const isCompleted = !!exam.completedQuestions[q];

      if (practiceMode) {
        // همون رنگ‌آمیزیِ درست/غلط/بی‌پاسخ که تو «لیست پاسخ‌ها» استفاده می‌شه
        const a = exam.answers[q];
        const k = exam.key[q];
        const gradable = a !== undefined && k !== undefined;
        const isCorrect = gradable && a === k;
        const isWrong = gradable && a !== k;
        const isBlankWithKey = a === undefined && k !== undefined;

        row.className = 'qrow-practice-wrap';
        row.innerHTML = `
          <div class="qrow${gradable ? '' : ' qrow-blank'}">
            <span class="qrow-num">${faNum(q)}</span>
            <span class="qrow-options">
              ${[1, 2, 3, 4].map(opt => {
                let cls = 'opt opt-readonly';
                if (isCorrect && opt === a) cls += ' opt-correct';
                else if (isWrong && opt === a) cls += ' opt-wrong';
                else if (isWrong && opt === k) cls += ' opt-correct-outline';
                else if (isBlankWithKey && opt === k) cls += ' opt-blank-correct';
                return `<span class="${cls}">${faNum(opt)}</span>`;
              }).join('')}
            </span>
          </div>
          <button type="button" class="btn-complete-q${isCompleted ? ' is-active' : ''}" data-complete-q="${q}">${isCompleted ? '✓ تکمیل شد' : 'تکمیل'}</button>
        `;
      } else {
        row.className = 'qrow';
        row.innerHTML = `
          <span class="qrow-num">${faNum(q)}</span>
          <span class="qrow-options">
            ${[1, 2, 3, 4].map(opt => `<button type="button" class="opt${selected === opt ? ' selected' : ''}" data-q="${q}" data-opt="${opt}">${faNum(opt)}</button>`).join('')}
          </span>
        `;
      }
      group.appendChild(row);
    }
    grid.appendChild(group);
  });

  if (!practiceMode) {
    grid.querySelectorAll('.opt').forEach(btn => {
      btn.addEventListener('click', () => {
        const q = Number(btn.dataset.q);
        const opt = Number(btn.dataset.opt);
        const store = sheetMode === 'answers' ? exam.answers : exam.key;
        if (store[q] === opt) delete store[q];
        else store[q] = opt;
        saveExams();
        renderSheet();
      });
    });
  }

  if (practiceMode) {
    grid.querySelectorAll('.btn-complete-q').forEach(btn => 
