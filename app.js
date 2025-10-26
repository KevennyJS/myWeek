const STORAGE_KEY = 'weeklyTasks.v1';

let deferredPrompt = null;

window.addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault();
  deferredPrompt = e;
  const btn = document.getElementById('installBtn');
  btn.style.display = 'inline-flex';
});

document.getElementById('installBtn').addEventListener('click', async () => {
  if (!deferredPrompt) return;
  deferredPrompt.prompt();
  await deferredPrompt.userChoice;
  deferredPrompt = null;
  document.getElementById('installBtn').style.display = 'none';
});

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./service-worker.js');
  });
}

const el = {
  form: document.getElementById('taskForm'),
  title: document.getElementById('titleInput'),
  desc: document.getElementById('descInput'),
  // deadline inputs + display/modal
  deadlineDate: document.getElementById('deadlineDateInput'),
  deadlineTime: document.getElementById('deadlineTimeInput'),
  deadlinePreview: document.getElementById('deadlinePreview'),
  deadlineDisplay: document.getElementById('deadlineDisplay'),
  deadlineDisplayText: document.getElementById('deadlineDisplayText'),
  deadlineModal: document.getElementById('deadlineModal'),
  deadlineApplyBtn: document.getElementById('deadlineApplyBtn'),
  deadlineCancelBtn: document.getElementById('deadlineCancelBtn'),
  // task modal controls
  taskModal: document.getElementById('taskModal'),
  taskModalTitle: document.getElementById('taskModalTitle'),
  taskCancelBtn: document.getElementById('taskCancelBtn'),
  taskSubmitBtn: document.getElementById('taskSubmitBtn'),
  openTaskModalBtn: document.getElementById('openTaskModalBtn'),
  priority: document.getElementById('priorityInput'),
  list: document.getElementById('taskList'),
  empty: document.getElementById('emptyState'),
  onlyWeek: document.getElementById('onlyWeekToggle'),
  search: document.getElementById('searchInput')
};

function toInputDate(date) {
  const d = new Date(date);
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}
function toInputTime(date) {
  const d = new Date(date);
  const hour = String(d.getHours()).padStart(2, '0');
  const min = String(d.getMinutes()).padStart(2, '0');
  return `${hour}:${min}`;
}
function combineDeadline(dateStr, timeStr) {
  return `${dateStr}T${timeStr}`;
}
function updateDeadlinePreview() {
  const ds = el.deadlineDate.value;
  const ts = el.deadlineTime.value;
  if (!ds || !ts) { el.deadlinePreview.textContent = ''; el.deadlineDisplayText.textContent = 'Selecionar data e hora'; return; }
  const d = new Date(combineDeadline(ds, ts));
  const pretty = d.toLocaleString('pt-BR', { dateStyle: 'full', timeStyle: 'short' });
  el.deadlinePreview.textContent = pretty;
  el.deadlineDisplayText.textContent = pretty;
}

// Modal helpers
let deadlineOldState = null;
function openDeadlineModal() {
  deadlineOldState = { date: el.deadlineDate.value, time: el.deadlineTime.value, preview: el.deadlinePreview.textContent };
  el.deadlineModal.classList.remove('hidden');
  el.deadlineModal.setAttribute('aria-hidden', 'false');
}
function closeDeadlineModal() {
  el.deadlineModal.classList.add('hidden');
  el.deadlineModal.setAttribute('aria-hidden', 'true');
}

function setDeadlineFromDate(d) {
  el.deadlineDate.value = toInputDate(d);
  el.deadlineTime.value = toInputTime(d);
  updateDeadlinePreview();
}

function loadTasks() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function saveTasks(tasks) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(tasks));
}

function startOfWeek(date) {
  const d = new Date(date);
  const day = d.getDay();
  const diff = d.getDate() - day + (day === 0 ? -6 : 1);
  return new Date(d.setDate(diff));
}

function endOfWeek(date) {
  const sow = startOfWeek(date);
  return new Date(sow.getFullYear(), sow.getMonth(), sow.getDate() + 6, 23, 59, 59, 999);
}

function daysUntil(deadline) {
  const now = new Date();
  const diffMs = new Date(deadline) - now;
  return Math.floor(diffMs / (1000 * 60 * 60 * 24));
}

function isOverdue(deadline) {
  return new Date(deadline) < new Date();
}

function urgencyScore(task) {
  const p = task.priority === 'high' ? 3 : task.priority === 'medium' ? 2 : 1;
  const d = daysUntil(task.deadline);
  let tScore = 0;
  if (d < 0) tScore = 10;
  else if (d === 0) tScore = 8;
  else if (d <= 1) tScore = 6;
  else if (d <= 3) tScore = 4;
  else if (d <= 7) tScore = 2;
  return p * 2 + tScore;
}

function formatDateTime(value) {
  const d = new Date(value);
  return d.toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' });
}

function renderTasks() {
  const tasks = loadTasks();
  const query = el.search.value?.toLowerCase().trim() || '';
  const onlyWeek = el.onlyWeek.checked;

  const sow = startOfWeek(new Date());
  const eow = endOfWeek(new Date());

  const filtered = tasks.filter(t => {
    const matches = !query || t.title.toLowerCase().includes(query) || t.description.toLowerCase().includes(query);
    const withinWeek = new Date(t.deadline) >= sow && new Date(t.deadline) <= eow;
    return matches && (!onlyWeek || withinWeek);
  });

  filtered.sort((a, b) => urgencyScore(b) - urgencyScore(a));

  el.list.innerHTML = '';
  if (filtered.length === 0) {
    el.empty.style.display = 'flex';
    return;
  }
  el.empty.style.display = 'none';

  for (const t of filtered) {
    const li = document.createElement('li');
    const overdue = isOverdue(t.deadline);
    const cls = [
      'task-card',
      overdue ? 'overdue' : '',
      t.priority
    ].join(' ').trim();

    li.className = cls;

    const left = document.createElement('div');
    const right = document.createElement('div');
    right.className = 'task-actions';

    const h3 = document.createElement('h3');
    h3.className = 'task-title';
    const statusIcon = document.createElement('span');
    statusIcon.className = 'material-symbols-rounded';
    statusIcon.textContent = t.done ? 'task_alt' : 'radio_button_unchecked';
    h3.appendChild(statusIcon);
    const titleText = document.createElement('span');
    titleText.textContent = t.title;
    h3.appendChild(titleText);

    const meta = document.createElement('div');
    meta.className = 'task-meta';
    const badgeDeadline = document.createElement('span');
    badgeDeadline.className = 'badge deadline';
    badgeDeadline.innerHTML = `<span class="material-symbols-rounded">schedule</span> ${formatDateTime(t.deadline)}`;
    const badgeDays = document.createElement('span');
    badgeDays.className = 'badge days';
    const d = daysUntil(t.deadline);
    badgeDays.innerHTML = `<span class="material-symbols-rounded">hourglass_bottom</span> ${d < 0 ? 'Atrasada' : d === 0 ? 'Hoje' : d === 1 ? 'Amanhã' : `${d} dias`}`;
    const badgePriority = document.createElement('span');
    badgePriority.className = `badge priority-${t.priority}`;
    badgePriority.innerHTML = `<span class="material-symbols-rounded">flag</span> ${t.priority === 'high' ? 'Alta' : t.priority === 'medium' ? 'Média' : 'Baixa'}`;
    meta.appendChild(badgeDeadline);
    meta.appendChild(badgeDays);
    meta.appendChild(badgePriority);

    const desc = document.createElement('p');
    desc.className = 'task-desc';
    desc.textContent = t.description || '';

    left.appendChild(h3);
    left.appendChild(meta);
    if (t.description) left.appendChild(desc);

    const btnDone = document.createElement('button');
    btnDone.className = 'icon-btn done';
    btnDone.innerHTML = `<span class="material-symbols-rounded">${t.done ? 'undo' : 'done'}</span>`;
    btnDone.title = t.done ? 'Desmarcar como feita' : 'Marcar como feita';
    btnDone.onclick = () => {
      const all = loadTasks();
      const idx = all.findIndex(x => x.id === t.id);
      if (idx >= 0) {
        all[idx].done = !all[idx].done;
        saveTasks(all);
        renderTasks();
      }
    };

    const btnEdit = document.createElement('button');
    btnEdit.className = 'icon-btn';
    btnEdit.innerHTML = `<span class="material-symbols-rounded">edit</span>`;
    btnEdit.title = 'Editar';
    btnEdit.onclick = () => {
      el.title.value = t.title;
      el.desc.value = t.description || '';
      const d = new Date(t.deadline);
      el.deadlineDate.value = toInputDate(d);
      el.deadlineTime.value = toInputTime(d);
      el.priority.value = t.priority;
      el.form.dataset.editing = t.id;
      el.taskSubmitBtn.innerHTML = '<span class="material-symbols-rounded">save</span> Atualizar';
      el.taskModalTitle.innerHTML = '<span class="material-symbols-rounded">edit</span> Editar atividade';
      updateDeadlinePreview();
      openTaskModal(true);
    };

    const btnDelete = document.createElement('button');
    btnDelete.className = 'icon-btn';
    btnDelete.innerHTML = `<span class="material-symbols-rounded">delete</span>`;
    btnDelete.title = 'Excluir';
    btnDelete.onclick = () => {
      const all = loadTasks().filter(x => x.id !== t.id);
      saveTasks(all);
      renderTasks();
    };

    right.appendChild(btnDone);
    right.appendChild(btnEdit);
    right.appendChild(btnDelete);

    li.appendChild(left);
    li.appendChild(right);

    el.list.appendChild(li);
  }
}

function openTaskModal(isEdit = false) {
  // reset default unless editing
  if (!isEdit) {
    el.form.reset();
    const d = new Date();
    d.setHours(18, 0, 0, 0);
    setDeadlineFromDate(d);
    el.priority.value = 'medium';
    el.form.dataset.editing = '';
    el.taskSubmitBtn.innerHTML = '<span class="material-symbols-rounded">save</span> Adicionar';
    el.taskModalTitle.innerHTML = '<span class="material-symbols-rounded">add_task</span> Nova atividade';
  }
  updateDeadlinePreview();
  el.taskModal.classList.remove('hidden');
  el.taskModal.setAttribute('aria-hidden', 'false');
}
function closeTaskModal() {
  el.taskModal.classList.add('hidden');
  el.taskModal.setAttribute('aria-hidden', 'true');
}

// abrir pelo botão do header
el.openTaskModalBtn.addEventListener('click', () => openTaskModal(false));
// cancelar fecha modal
el.taskCancelBtn.addEventListener('click', () => {
  closeTaskModal();
});
// fechar ao clicar no backdrop
el.taskModal.querySelector('.modal-backdrop').addEventListener('click', closeTaskModal);
// ESC fecha modal de tarefa
window.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && !el.taskModal.classList.contains('hidden')) {
    closeTaskModal();
  }
});

el.form.addEventListener('submit', (e) => {
  e.preventDefault();
  const title = el.title.value.trim();
  const description = el.desc.value.trim();
  const deadlineDate = el.deadlineDate.value;
  const deadlineTime = el.deadlineTime.value;
  const priority = el.priority.value;

  if (!title || !deadlineDate || !deadlineTime || !priority) return;

  const deadline = combineDeadline(deadlineDate, deadlineTime);

  const tasks = loadTasks();
  const editingId = el.form.dataset.editing;
  if (editingId) {
    const idx = tasks.findIndex(t => t.id === editingId);
    if (idx >= 0) {
      tasks[idx] = { ...tasks[idx], title, description, deadline, priority };
    }
    delete el.form.dataset.editing;
    el.taskSubmitBtn.innerHTML = '<span class="material-symbols-rounded">save</span> Adicionar';
    el.taskModalTitle.innerHTML = '<span class="material-symbols-rounded">add_task</span> Nova atividade';
  } else {
    const id = crypto.randomUUID ? crypto.randomUUID() : String(Date.now()) + Math.random().toString(16).slice(2);
    tasks.push({ id, title, description, deadline, priority, done: false, createdAt: Date.now() });
  }

  saveTasks(tasks);
  el.form.reset();
  updateDeadlinePreview();
  closeTaskModal();
  renderTasks();
});

el.form.addEventListener('reset', () => {
  delete el.form.dataset.editing;
  el.taskSubmitBtn.innerHTML = '<span class="material-symbols-rounded">save</span> Adicionar';
  el.taskModalTitle.innerHTML = '<span class="material-symbols-rounded">add_task</span> Nova atividade';
  updateDeadlinePreview();
});

// preencher ao editar
el.onlyWeek.addEventListener('change', renderTasks);
el.search.addEventListener('input', renderTasks);

// Atualiza preview quando o usuário altera data/hora
el.deadlineDate.addEventListener('input', updateDeadlinePreview);
el.deadlineTime.addEventListener('input', updateDeadlinePreview);

// Abrir modal ao clicar no display
el.deadlineDisplay.addEventListener('click', openDeadlineModal);
// Fechar ao clicar no backdrop
el.deadlineModal.querySelector('.modal-backdrop').addEventListener('click', closeDeadlineModal);
// Cancelar restaura valores
el.deadlineCancelBtn.addEventListener('click', () => {
  if (deadlineOldState) {
    el.deadlineDate.value = deadlineOldState.date || '';
    el.deadlineTime.value = deadlineOldState.time || '';
    el.deadlinePreview.textContent = deadlineOldState.preview || '';
    updateDeadlinePreview();
  }
  closeDeadlineModal();
});
// Aplicar apenas fecha (valores já estão nos inputs)
el.deadlineApplyBtn.addEventListener('click', () => {
  updateDeadlinePreview();
  closeDeadlineModal();
});
// ESC fecha modal
window.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && !el.deadlineModal.classList.contains('hidden')) {
    el.deadlineCancelBtn.click();
  }
});

// Atalhos rápidos de deadline
for (const btn of document.querySelectorAll('.quick-picks .chip-btn')) {
  btn.addEventListener('click', () => {
    const now = new Date();
    const pick = btn.dataset.pick;
    let d = new Date(now);
    if (pick === 'today-18') {
      d.setHours(18, 0, 0, 0);
    } else if (pick === 'tomorrow-9') {
      d.setDate(d.getDate() + 1);
      d.setHours(9, 0, 0, 0);
    } else if (pick === 'next-monday-9') {
      // próxima segunda
      const day = d.getDay();
      const add = ((8 - day) % 7) || 7; // sempre próxima
      d.setDate(d.getDate() + add);
      d.setHours(9, 0, 0, 0);
    } else if (pick === 'end-week-18') {
      const eow = endOfWeek(now);
      d = new Date(eow);
      d.setHours(18, 0, 0, 0);
    } else if (pick === 'in-1h') {
      d.setHours(d.getHours() + 1);
    } else if (pick === 'in-3d') {
      d.setDate(d.getDate() + 3);
      d.setHours(18, 0, 0, 0);
    }
    setDeadlineFromDate(d);
  });
}

// Define valores iniciais de deadline (ex.: hoje 18h)
(function initDefaultDeadline(){
  if (!el.deadlineDate.value && !el.deadlineTime.value) {
    const d = new Date();
    d.setHours(18, 0, 0, 0);
    setDeadlineFromDate(d);
  }
  updateDeadlinePreview();
})();

renderTasks();