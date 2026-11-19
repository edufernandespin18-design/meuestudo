/**
 * MeuEstudo — módulo Horários + Agenda (v0.3)
 *
 * Contrato: export function mount(container, services) → destroy()
 * Persistência: somente services.storage.read / write
 * Chaves: meuestudo:v1:horarios  e  meuestudo:v1:agenda
 *
 * Aba inicial: "horarios" por padrão. Se o integrador montar o mesmo módulo
 * nas rotas `horarios` e `agenda`, basta passar a rota em
 * `container.dataset.route` ou `services.route` (valor "agenda" abre a agenda).
 */

const KEY_HORARIOS = 'meuestudo:v1:horarios';
const KEY_AGENDA = 'meuestudo:v1:agenda';

const WEEKDAYS = [
  { long: 'Domingo', short: 'Dom' },
  { long: 'Segunda-feira', short: 'Seg' },
  { long: 'Terça-feira', short: 'Ter' },
  { long: 'Quarta-feira', short: 'Qua' },
  { long: 'Quinta-feira', short: 'Qui' },
  { long: 'Sexta-feira', short: 'Sex' },
  { long: 'Sábado', short: 'Sáb' },
];
const DAY_ORDER = [1, 2, 3, 4, 5, 6, 0];

const TYPES = {
  atividade: 'Atividade',
  prova: 'Prova',
  trabalho: 'Trabalho',
  compromisso: 'Compromisso',
};
const PRIORITIES = { baixa: 'Baixa', normal: 'Normal', alta: 'Alta' };
const STATUSES = ['pendente', 'concluida'];

const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;

/* ------------------------------------------------------------------ */
/* Utilitários                                                         */
/* ------------------------------------------------------------------ */

const PROP_KEYS = new Set(['value', 'checked', 'hidden', 'disabled', 'selected']);

function append(node, children) {
  for (const child of children.flat(Infinity)) {
    if (child === null || child === undefined || child === false) continue;
    node.appendChild(child instanceof Node ? child : document.createTextNode(String(child)));
  }
}

/** Cria elementos sem innerHTML (texto do usuário nunca vira HTML). */
function el(tag, props, ...children) {
  const node = document.createElement(tag);
  for (const [key, val] of Object.entries(props || {})) {
    if (val === null || val === undefined || val === false) continue;
    if (key === 'class') node.className = val;
    else if (PROP_KEYS.has(key)) node[key] = val;
    else node.setAttribute(key, val === true ? '' : String(val));
  }
  append(node, children);
  return node;
}

function newId(prefix) {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return `${prefix}-${crypto.randomUUID()}`;
  }
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

function pad(n) {
  return String(n).padStart(2, '0');
}

function todayISO() {
  const d = new Date();
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function isValidDate(s) {
  if (typeof s !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const [y, m, d] = s.split('-').map(Number);
  if (y < 2000 || y > 2100) return false;
  const dt = new Date(y, m - 1, d);
  return dt.getFullYear() === y && dt.getMonth() === m - 1 && dt.getDate() === d;
}

/** Dias de `a` até `b` (b - a), ambos "AAAA-MM-DD". */
function daysBetween(a, b) {
  const [ya, ma, da] = a.split('-').map(Number);
  const [yb, mb, db] = b.split('-').map(Number);
  return Math.round((Date.UTC(yb, mb - 1, db) - Date.UTC(ya, ma - 1, da)) / 86400000);
}

function formatDate(iso) {
  const [y, m, d] = iso.split('-').map(Number);
  const sameYear = y === new Date().getFullYear();
  return new Date(y, m - 1, d).toLocaleDateString('pt-BR', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    ...(sameYear ? {} : { year: 'numeric' }),
  });
}

function relativeLabel(diff) {
  if (diff === 0) return 'Hoje';
  if (diff === 1) return 'Amanhã';
  if (diff === -1) return 'Ontem';
  return diff > 0 ? `Em ${diff} dias` : `Há ${-diff} dias`;
}

function clean(obj) {
  return Object.fromEntries(
    Object.entries(obj).filter(([, v]) => v !== '' && v !== undefined && v !== null)
  );
}

function text(v) {
  return typeof v === 'string' ? v.trim() : '';
}

/* ------------------------------------------------------------------ */
/* Validação / normalização dos dados lidos do storage                 */
/* ------------------------------------------------------------------ */

function sanitizeLesson(r) {
  if (!r || typeof r !== 'object') return null;
  const weekday = Number(r.weekday);
  const subject = text(r.subject);
  if (typeof r.id !== 'string' || !r.id) return null;
  if (!Number.isInteger(weekday) || weekday < 0 || weekday > 6) return null;
  if (!subject) return null;
  if (!TIME_RE.test(r.startTime) || !TIME_RE.test(r.endTime)) return null;
  if (r.endTime <= r.startTime) return null;
  return clean({ ...r, weekday, subject, room: text(r.room) });
}

function sanitizeItem(r) {
  if (!r || typeof r !== 'object') return null;
  const title = text(r.title);
  if (typeof r.id !== 'string' || !r.id) return null;
  if (!title || !isValidDate(r.date)) return null;
  return clean({
    ...r,
    title,
    type: Object.hasOwn(TYPES, r.type) ? r.type : 'atividade',
    time: TIME_RE.test(r.time) ? r.time : '',
    subject: text(r.subject),
    priority: Object.hasOwn(PRIORITIES, r.priority) ? r.priority : 'normal',
    status: STATUSES.includes(r.status) ? r.status : 'pendente',
    notes: text(r.notes),
  });
}

function dedupe(list) {
  const seen = new Set();
  return list.filter((r) => (seen.has(r.id) ? false : seen.add(r.id)));
}

/* ------------------------------------------------------------------ */
/* Ordenação                                                           */
/* ------------------------------------------------------------------ */

const byLesson = (a, b) =>
  a.startTime.localeCompare(b.startTime) ||
  a.endTime.localeCompare(b.endTime) ||
  a.subject.localeCompare(b.subject, 'pt-BR');

const byItem = (a, b) => {
  const d = a.date.localeCompare(b.date);
  if (d) return d;
  if (a.time && b.time) {
    const t = a.time.localeCompare(b.time);
    if (t) return t;
  } else if (a.time || b.time) {
    return a.time ? -1 : 1; // com horário vem antes de "dia todo"
  }
  return a.title.localeCompare(b.title, 'pt-BR');
};

/* ------------------------------------------------------------------ */
/* Módulo                                                              */
/* ------------------------------------------------------------------ */

export function mount(container, services) {
  const storage = services && services.storage;

  container.replaceChildren();
  const root = el('div', { class: 'schedule-root' });
  container.appendChild(root);

  if (!storage || typeof storage.read !== 'function' || typeof storage.write !== 'function') {
    root.appendChild(
      el(
        'p',
        { class: 'schedule-fatal', role: 'alert' },
        'Não foi possível acessar o armazenamento do app. Recarregue a página e tente de novo.'
      )
    );
    return function destroy() {
      root.remove();
    };
  }

  const uid = Math.random().toString(36).slice(2, 7);

  function loadList(key, sanitize) {
    let raw;
    try {
      raw = storage.read(key, []);
    } catch (_) {
      raw = [];
    }
    return Array.isArray(raw) ? dedupe(raw.map(sanitize).filter(Boolean)) : [];
  }

  const route = (services && services.route) || (container.dataset && container.dataset.route);

  const state = {
    tab: route === 'agenda' ? 'agenda' : 'horarios',
    selectedDay: new Date().getDay(),
    lessons: loadList(KEY_HORARIOS, sanitizeLesson),
    items: loadList(KEY_AGENDA, sanitizeItem),
    lessonForm: null, // { id: string|null }
    itemForm: null, // { id: string|null }
    lessonDelete: null,
    itemDelete: null,
    rescheduleId: null,
    showDone: false,
  };

  /* ---------------- esqueleto fixo ---------------- */

  const refs = {};

  refs.status = el('p', { class: 'schedule-status', role: 'status', 'aria-live': 'polite' });

  refs.tabHorarios = el(
    'button',
    { type: 'button', class: 'schedule-tab', 'data-action': 'tab', 'data-tab': 'horarios' },
    'Horários'
  );
  refs.tabAgenda = el(
    'button',
    { type: 'button', class: 'schedule-tab', 'data-action': 'tab', 'data-tab': 'agenda' },
    'Agenda'
  );
  const tabs = el(
    'div',
    { class: 'schedule-tabs', role: 'group', 'aria-label': 'Seção' },
    refs.tabHorarios,
    refs.tabAgenda
  );

  refs.days = el('div', { class: 'schedule-days', role: 'group', 'aria-label': 'Dia da semana' });
  refs.dayHead = el('div', { class: 'schedule-dayhead' });
  refs.lessonForm = el('div', { class: 'schedule-form-slot' });
  refs.lessonList = el('div', { class: 'schedule-list-slot' });
  refs.schedulePanel = el(
    'section',
    { class: 'schedule-panel', 'aria-labelledby': `${uid}-t-schedule` },
    el('h2', { class: 'schedule-title', id: `${uid}-t-schedule` }, 'Horários'),
    refs.days,
    refs.dayHead,
    refs.lessonForm,
    refs.lessonList
  );

  refs.agendaHead = el('div', { class: 'agenda-head' });
  refs.itemForm = el('div', { class: 'agenda-form-slot' });
  refs.agendaList = el('div', { class: 'agenda-list-slot' });
  refs.agendaPanel = el(
    'section',
    { class: 'agenda-panel', 'aria-labelledby': `${uid}-t-agenda` },
    el('h2', { class: 'schedule-title', id: `${uid}-t-agenda` }, 'Agenda'),
    refs.agendaHead,
    refs.itemForm,
    refs.agendaList
  );

  root.append(tabs, refs.status, refs.schedulePanel, refs.agendaPanel);

  /* ---------------- helpers de UI ---------------- */

  function announce(message) {
    refs.status.textContent = message || '';
  }

  function focusAction(action, id) {
    const target = [...root.querySelectorAll(`[data-action="${action}"]`)].find(
      (n) => id === undefined || n.dataset.id === id
    );
    if (target) target.focus();
    return Boolean(target);
  }

  function btn(prefix, variant, label, data, ariaLabel) {
    return el(
      'button',
      {
        type: 'button',
        class: `${prefix}-btn ${prefix}-btn--${variant}`,
        'aria-label': ariaLabel,
        ...Object.fromEntries(Object.entries(data).map(([k, v]) => [`data-${k}`, v])),
      },
      label
    );
  }

  function field(prefix, formKey, name, labelText, control, opts = {}) {
    const id = `${uid}-${formKey}-${name}`;
    control.id = id;
    control.name = name;
    control.setAttribute('aria-describedby', `${id}-err${opts.hint ? ` ${id}-hint` : ''}`);
    return el(
      'div',
      { class: `${prefix}-field` },
      el(
        'label',
        { class: `${prefix}-label`, for: id },
        labelText,
        opts.optional ? el('span', { class: `${prefix}-optional` }, ' (opcional)') : null
      ),
      control,
      opts.hint ? el('p', { class: `${prefix}-hint`, id: `${id}-hint` }, opts.hint) : null,
      el('p', {
        class: `${prefix}-error`,
        id: `${id}-err`,
        'data-error-for': name,
        hidden: true,
      })
    );
  }

  function input(prefix, props) {
    return el('input', { class: `${prefix}-input`, autocomplete: 'off', ...props });
  }

  function select(prefix, options, value) {
    const s = el(
      'select',
      { class: `${prefix}-input` },
      options.map(([v, l]) => el('option', { value: v }, l))
    );
    s.value = String(value);
    return s;
  }

  /** Mostra mensagens de erro no próprio formulário. Retorna true se não há erros. */
  function showErrors(form, errors) {
    let first = null;
    form.querySelectorAll('[name]').forEach((control) => {
      const msg = errors[control.name];
      const p = form.querySelector(`[data-error-for="${control.name}"]`);
      if (p) {
        p.textContent = msg || '';
        p.hidden = !msg;
      }
      if (msg) {
        control.setAttribute('aria-invalid', 'true');
        if (!first) first = control;
      } else {
        control.removeAttribute('aria-invalid');
      }
    });
    const summary = form.querySelector('[data-summary]');
    if (summary) {
      summary.textContent = first ? 'Corrija os campos indicados para salvar.' : '';
      summary.hidden = !first;
    }
    if (first) first.focus();
    return !first;
  }

  function persist(key, next, stateKey) {
    try {
      const result = storage.write(key, next);
      if (result === false) throw new Error('write returned false');
      state[stateKey] = next;
      return true;
    } catch (_) {
      announce('Não foi possível salvar. Tente de novo; se continuar, libere espaço no navegador.');
      return false;
    }
  }

  /* ---------------- abas ---------------- */

  function renderTabs() {
    const isSchedule = state.tab === 'horarios';
    refs.tabHorarios.setAttribute('aria-pressed', String(isSchedule));
    refs.tabAgenda.setAttribute('aria-pressed', String(!isSchedule));
    refs.tabHorarios.classList.toggle('is-active', isSchedule);
    refs.tabAgenda.classList.toggle('is-active', !isSchedule);
    refs.schedulePanel.hidden = !isSchedule;
    refs.agendaPanel.hidden = isSchedule;
  }

  /* ---------------- HORÁRIOS ---------------- */

  function renderDays() {
    const today = new Date().getDay();
    refs.days.replaceChildren(
      ...DAY_ORDER.map((d) => {
        const count = state.lessons.filter((l) => l.weekday === d).length;
        const label =
          `${WEEKDAYS[d].long}${d === today ? ', hoje' : ''}, ` +
          (count === 1 ? '1 aula' : `${count} aulas`);
        return el(
          'button',
          {
            type: 'button',
            class:
              'schedule-day' +
              (d === state.selectedDay ? ' is-selected' : '') +
              (d === today ? ' is-today' : ''),
            'data-action': 'day',
            'data-day': d,
            'aria-pressed': String(d === state.selectedDay),
            'aria-label': label,
          },
          el('span', { class: 'schedule-day-name', 'aria-hidden': 'true' }, WEEKDAYS[d].short),
          el('span', { class: 'schedule-day-today', 'aria-hidden': 'true' }, d === today ? 'Hoje' : ''),
          el('span', { class: 'schedule-day-count', 'aria-hidden': 'true' }, count ? String(count) : '')
        );
      })
    );
  }

  function renderDayHead() {
    const today = new Date().getDay();
    const count = state.lessons.filter((l) => l.weekday === state.selectedDay).length;
    refs.dayHead.replaceChildren(
      el(
        'div',
        { class: 'schedule-dayhead-text' },
        el(
          'h3',
          { class: 'schedule-dayname' },
          WEEKDAYS[state.selectedDay].long,
          state.selectedDay === today ? el('span', { class: 'schedule-badge' }, 'Hoje') : null
        ),
        el('p', { class: 'schedule-count' }, count === 1 ? '1 aula' : `${count} aulas`)
      ),
      btn('schedule', 'primary', 'Adicionar aula', { action: 'add-lesson' })
    );
  }

  function renderLessonForm() {
    const slot = refs.lessonForm;
    slot.replaceChildren();
    if (!state.lessonForm) return;

    const editing = state.lessonForm.id
      ? state.lessons.find((l) => l.id === state.lessonForm.id)
      : null;
    const v = editing || {
      weekday: state.selectedDay,
      subject: '',
      startTime: '',
      endTime: '',
      room: '',
    };
    const titleId = `${uid}-lf-title`;

    const form = el(
      'form',
      {
        class: 'schedule-form',
        novalidate: true,
        'data-form': 'lesson',
        'aria-labelledby': titleId,
      },
      el('h3', { class: 'schedule-form-title', id: titleId }, editing ? 'Editar aula' : 'Nova aula'),
      el('p', { class: 'schedule-error schedule-summary', 'data-summary': true, hidden: true }),
      field(
        'schedule',
        'lf',
        'subject',
        'Disciplina',
        input('schedule', { type: 'text', maxlength: 60, value: v.subject, 'aria-required': 'true' })
      ),
      field(
        'schedule',
        'lf',
        'weekday',
        'Dia da semana',
        select(
          'schedule',
          DAY_ORDER.map((d) => [String(d), WEEKDAYS[d].long]),
          v.weekday
        )
      ),
      el(
        'div',
        { class: 'schedule-row' },
        field(
          'schedule',
          'lf',
          'startTime',
          'Início',
          input('schedule', { type: 'time', value: v.startTime, 'aria-required': 'true' })
        ),
        field(
          'schedule',
          'lf',
          'endTime',
          'Fim',
          input('schedule', { type: 'time', value: v.endTime, 'aria-required': 'true' })
        )
      ),
      field(
        'schedule',
        'lf',
        'room',
        'Sala ou local',
        input('schedule', { type: 'text', maxlength: 40, value: v.room || '' }),
        { optional: true }
      ),
      el(
        'div',
        { class: 'schedule-form-actions' },
        el('button', { type: 'submit', class: 'schedule-btn schedule-btn--primary' }, 'Salvar aula'),
        btn('schedule', 'ghost', 'Cancelar', { action: 'cancel-lesson-form' })
      )
    );
    slot.appendChild(form);
  }

  function renderLessonList() {
    const slot = refs.lessonList;
    slot.replaceChildren();
    const today = new Date().getDay();

    if (!state.lessons.length) {
      slot.appendChild(
        el(
          'div',
          { class: 'schedule-empty' },
          el('p', { class: 'schedule-empty-title' }, 'Sua grade ainda está vazia'),
          el(
            'p',
            { class: 'schedule-empty-text' },
            'Cadastre as aulas da semana para ver, a cada dia, o que vem pela frente. Se a escola mudar a grade, é só editar.'
          ),
          btn('schedule', 'primary', 'Cadastrar primeira aula', { action: 'add-lesson' })
        )
      );
      return;
    }

    const list = state.lessons.filter((l) => l.weekday === state.selectedDay).sort(byLesson);
    if (!list.length) {
      slot.appendChild(
        el(
          'div',
          { class: 'schedule-empty' },
          el(
            'p',
            { class: 'schedule-empty-title' },
            `Nenhuma aula cadastrada para ${WEEKDAYS[state.selectedDay].long.toLowerCase()}`
          ),
          el('p', { class: 'schedule-empty-text' }, 'Use "Adicionar aula" se esse dia tiver aulas.')
        )
      );
      return;
    }

    slot.appendChild(
      el(
        'ol',
        { class: 'schedule-list' },
        list.map((l) => {
          const confirming = state.lessonDelete === l.id;
          return el(
            'li',
            { class: 'schedule-card' + (state.selectedDay === today ? ' is-today' : '') },
            el(
              'p',
              { class: 'schedule-time' },
              el('span', { class: 'schedule-sr' }, 'Das '),
              el('span', { class: 'schedule-start' }, l.startTime),
              el('span', { class: 'schedule-sr' }, ' às '),
              el('span', { class: 'schedule-end' }, l.endTime)
            ),
            el(
              'div',
              { class: 'schedule-card-body' },
              el('p', { class: 'schedule-subject' }, l.subject),
              l.room ? el('p', { class: 'schedule-room' }, l.room) : null,
              confirming
                ? el(
                    'div',
                    { class: 'schedule-confirm', role: 'group', 'aria-label': 'Confirmar exclusão' },
                    el('p', { class: 'schedule-confirm-text' }, `Excluir ${l.subject}? Isso não pode ser desfeito.`),
                    el(
                      'div',
                      { class: 'schedule-actions' },
                      btn('schedule', 'danger', 'Excluir', { action: 'confirm-delete-lesson', id: l.id }),
                      btn('schedule', 'ghost', 'Cancelar', { action: 'cancel-delete-lesson', id: l.id })
                    )
                  )
                : el(
                    'div',
                    { class: 'schedule-actions' },
                    btn('schedule', 'ghost', 'Editar', { action: 'edit-lesson', id: l.id }, `Editar aula de ${l.subject}`),
                    btn('schedule', 'ghost', 'Excluir', { action: 'delete-lesson', id: l.id }, `Excluir aula de ${l.subject}`)
                  )
            )
          );
        })
      )
    );
  }

  function renderSchedule() {
    renderDays();
    renderDayHead();
    renderLessonList();
  }

  function saveLesson(form) {
    const fd = new FormData(form);
    const subject = text(String(fd.get('subject') || ''));
    const weekday = Number(fd.get('weekday'));
    const startTime = String(fd.get('startTime') || '');
    const endTime = String(fd.get('endTime') || '');
    const room = text(String(fd.get('room') || ''));

    const errors = {};
    if (!subject) errors.subject = 'Informe a disciplina.';
    if (!Number.isInteger(weekday) || weekday < 0 || weekday > 6) errors.weekday = 'Escolha o dia da semana.';
    if (!TIME_RE.test(startTime)) errors.startTime = 'Informe a hora de início (ex.: 07:00).';
    if (!TIME_RE.test(endTime)) errors.endTime = 'Informe a hora de fim (ex.: 07:50).';
    else if (TIME_RE.test(startTime) && endTime <= startTime) {
      errors.endTime = 'A hora de fim precisa ser depois do início.';
    }
    if (!showErrors(form, errors)) return;

    const editingId = state.lessonForm && state.lessonForm.id;
    let savedId = editingId;
    let next;
    if (editingId && state.lessons.some((l) => l.id === editingId)) {
      next = state.lessons.map((l) =>
        l.id === editingId ? clean({ ...l, weekday, subject, startTime, endTime, room }) : l
      );
    } else {
      savedId = newId('aula');
      next = [...state.lessons, clean({ id: savedId, weekday, subject, startTime, endTime, room })];
    }
    if (!persist(KEY_HORARIOS, next, 'lessons')) return;

    state.selectedDay = weekday;
    state.lessonForm = null;
    state.lessonDelete = null;
    renderLessonForm();
    renderSchedule();
    announce(`Aula de ${subject} salva em ${WEEKDAYS[weekday].long.toLowerCase()}.`);
    focusAction('edit-lesson', savedId);
  }

  function deleteLesson(id) {
    const lesson = state.lessons.find((l) => l.id === id);
    const next = state.lessons.filter((l) => l.id !== id);
    if (!persist(KEY_HORARIOS, next, 'lessons')) return;
    state.lessonDelete = null;
    if (state.lessonForm && state.lessonForm.id === id) {
      state.lessonForm = null;
      renderLessonForm();
    }
    renderSchedule();
    announce(lesson ? `Aula de ${lesson.subject} excluída.` : 'Aula excluída.');
    focusAction('add-lesson');
  }

  /* ---------------- AGENDA ---------------- */

  function renderAgendaHead() {
    refs.agendaHead.replaceChildren(
      el(
        'p',
        { class: 'agenda-intro' },
        'Provas, trabalhos, atividades e compromissos, do mais próximo ao mais distante.'
      ),
      btn('agenda', 'primary', 'Nova atividade', { action: 'add-item' })
    );
  }

  function renderItemForm() {
    const slot = refs.itemForm;
    slot.replaceChildren();
    if (!state.itemForm) return;

    const editing = state.itemForm.id ? state.items.find((i) => i.id === state.itemForm.id) : null;
    const v = editing || {
      title: '',
      type: 'atividade',
      date: todayISO(),
      time: '',
      subject: '',
      priority: 'normal',
      notes: '',
    };
    const titleId = `${uid}-if-heading`;
    const listId = `${uid}-if-subjects`;
    const subjects = [...new Set(state.lessons.map((l) => l.subject))].sort((a, b) =>
      a.localeCompare(b, 'pt-BR')
    );

    const subjectInput = input('agenda', { type: 'text', maxlength: 60, value: v.subject || '', list: listId });
    const notesInput = el('textarea', { class: 'agenda-input agenda-textarea', rows: 3, maxlength: 300 });
    notesInput.value = v.notes || '';

    const form = el(
      'form',
      {
        class: 'agenda-form',
        novalidate: true,
        'data-form': 'item',
        'aria-labelledby': titleId,
      },
      el('h3', { class: 'agenda-form-title', id: titleId }, editing ? 'Editar item' : 'Novo item'),
      el('p', { class: 'agenda-error agenda-summary', 'data-summary': true, hidden: true }),
      field(
        'agenda',
        'if',
        'title',
        'Título',
        input('agenda', { type: 'text', maxlength: 80, value: v.title, 'aria-required': 'true' })
      ),
      field('agenda', 'if', 'type', 'Tipo', select('agenda', Object.entries(TYPES), v.type)),
      el(
        'div',
        { class: 'agenda-row' },
        field(
          'agenda',
          'if',
          'date',
          'Data',
          input('agenda', { type: 'date', value: v.date, 'aria-required': 'true' })
        ),
        field('agenda', 'if', 'time', 'Horário', input('agenda', { type: 'time', value: v.time || '' }), {
          optional: true,
        })
      ),
      field('agenda', 'if', 'subject', 'Disciplina', subjectInput, { optional: true }),
      el('datalist', { id: listId }, subjects.map((s) => el('option', { value: s }))),
      field('agenda', 'if', 'priority', 'Prioridade', select('agenda', Object.entries(PRIORITIES), v.priority)),
      field('agenda', 'if', 'notes', 'Observação', notesInput, { optional: true }),
      el(
        'div',
        { class: 'agenda-form-actions' },
        el('button', { type: 'submit', class: 'agenda-btn agenda-btn--primary' }, 'Salvar item'),
        btn('agenda', 'ghost', 'Cancelar', { action: 'cancel-item-form' })
      )
    );
    slot.appendChild(form);
  }

  function renderRescheduleForm(item) {
    const titleId = `${uid}-rs-title`;
    return el(
      'form',
      {
        class: 'agenda-reschedule',
        novalidate: true,
        'data-form': 'reschedule',
        'data-id': item.id,
        'aria-labelledby': titleId,
      },
      el('p', { class: 'agenda-reschedule-title', id: titleId }, 'Escolha a nova data'),
      el('p', { class: 'agenda-error agenda-summary', 'data-summary': true, hidden: true }),
      el(
        'div',
        { class: 'agenda-row' },
        field('agenda', 'rs', 'date', 'Nova data', input('agenda', { type: 'date', value: item.date })),
        field('agenda', 'rs', 'time', 'Horário', input('agenda', { type: 'time', value: item.time || '' }), {
          optional: true,
        })
      ),
      el(
        'div',
        { class: 'agenda-actions' },
        el('button', { type: 'submit', class: 'agenda-btn agenda-btn--primary' }, 'Salvar nova data'),
        btn('agenda', 'ghost', 'Cancelar', { action: 'cancel-reschedule' })
      )
    );
  }

  function renderItem(item, today) {
    const done = item.status === 'concluida';
    const diff = daysBetween(today, item.date);
    const overdue = !done && diff < 0;
    const confirming = state.itemDelete === item.id;
    const rescheduling = !done && state.rescheduleId === item.id;

    const classes = ['agenda-card', `agenda-priority-${item.priority}`];
    if (done) classes.push('is-done');
    if (overdue) classes.push('is-overdue');

    let actions;
    if (confirming) {
      actions = el(
        'div',
        { class: 'agenda-confirm', role: 'group', 'aria-label': 'Confirmar exclusão' },
        el('p', { class: 'agenda-confirm-text' }, `Excluir "${item.title}"? Isso não pode ser desfeito.`),
        el(
          'div',
          { class: 'agenda-actions' },
          btn('agenda', 'danger', 'Excluir', { action: 'confirm-delete-item', id: item.id }),
          btn('agenda', 'ghost', 'Cancelar', { action: 'cancel-delete-item', id: item.id })
        )
      );
    } else {
      actions = el(
        'div',
        { class: 'agenda-actions' },
        done
          ? btn('agenda', 'primary', 'Reabrir', { action: 'toggle-item', id: item.id }, `Reabrir: ${item.title}`)
          : btn('agenda', 'primary', 'Concluir', { action: 'toggle-item', id: item.id }, `Concluir: ${item.title}`),
        done
          ? null
          : btn('agenda', 'ghost', 'Reagendar', { action: 'reschedule-item', id: item.id }, `Reagendar: ${item.title}`),
        btn('agenda', 'ghost', 'Editar', { action: 'edit-item', id: item.id }, `Editar: ${item.title}`),
        btn('agenda', 'ghost', 'Excluir', { action: 'delete-item', id: item.id }, `Excluir: ${item.title}`)
      );
    }

    return el(
      'li',
      { class: classes.join(' ') },
      el(
        'div',
        { class: 'agenda-tags' },
        el('span', { class: 'agenda-tag agenda-tag--type' }, TYPES[item.type]),
        item.priority !== 'normal'
          ? el('span', { class: `agenda-tag agenda-tag--${item.priority}` }, `Prioridade ${PRIORITIES[item.priority].toLowerCase()}`)
          : null,
        overdue ? el('span', { class: 'agenda-tag agenda-tag--overdue' }, 'Atrasada') : null,
        done ? el('span', { class: 'agenda-tag agenda-tag--done' }, 'Concluída') : null
      ),
      el('p', { class: 'agenda-title' }, item.title),
      el(
        'p',
        { class: 'agenda-when' },
        formatDate(item.date),
        item.time ? ` às ${item.time}` : '',
        done ? null : el('span', { class: 'agenda-relative' }, ` · ${relativeLabel(diff)}`)
      ),
      item.subject ? el('p', { class: 'agenda-subject' }, item.subject) : null,
      item.notes ? el('p', { class: 'agenda-notes' }, item.notes) : null,
      rescheduling ? renderRescheduleForm(item) : actions
    );
  }

  function renderAgendaList() {
    const slot = refs.agendaList;
    slot.replaceChildren();

    if (!state.items.length) {
      slot.appendChild(
        el(
          'div',
          { class: 'agenda-empty' },
          el('p', { class: 'agenda-empty-title' }, 'Nada na agenda por enquanto'),
          el(
            'p',
            { class: 'agenda-empty-text' },
            'Registre provas, trabalhos e atividades com a data para não depender da memória.'
          ),
          btn('agenda', 'primary', 'Cadastrar primeiro item', { action: 'add-item' })
        )
      );
      return;
    }

    const today = todayISO();
    const pending = state.items.filter((i) => i.status === 'pendente').sort(byItem);
    const done = state.items.filter((i) => i.status === 'concluida').sort((a, b) => byItem(b, a));

    const groups = [
      ['Atrasadas', pending.filter((i) => i.date < today), 'overdue'],
      ['Hoje', pending.filter((i) => i.date === today), 'today'],
      ['Próximos', pending.filter((i) => i.date > today), 'upcoming'],
    ];

    if (!pending.length) {
      slot.appendChild(
        el(
          'div',
          { class: 'agenda-empty agenda-empty--clear' },
          el('p', { class: 'agenda-empty-title' }, 'Tudo em dia'),
          el('p', { class: 'agenda-empty-text' }, 'Nenhuma pendência na agenda.')
        )
      );
    }

    for (const [title, list, kind] of groups) {
      if (!list.length) continue;
      slot.appendChild(
        el(
          'section',
          { class: `agenda-group agenda-group--${kind}` },
          el('h3', { class: 'agenda-group-title' }, title, el('span', { class: 'agenda-group-count' }, String(list.length))),
          el('ul', { class: 'agenda-items' }, list.map((i) => renderItem(i, today)))
        )
      );
    }

    if (done.length) {
      const details = el(
        'details',
        { class: 'agenda-done', open: state.showDone },
        el('summary', { class: 'agenda-done-summary' }, `Concluídas (${done.length})`),
        el('ul', { class: 'agenda-items' }, done.map((i) => renderItem(i, today)))
      );
      slot.appendChild(details);
    }
  }

  function saveItem(form) {
    const fd = new FormData(form);
    const title = text(String(fd.get('title') || ''));
    const type = String(fd.get('type') || '');
    const date = String(fd.get('date') || '');
    const time = String(fd.get('time') || '');
    const subject = text(String(fd.get('subject') || ''));
    const priority = String(fd.get('priority') || '');
    const notes = text(String(fd.get('notes') || ''));

    const errors = {};
    if (!title) errors.title = 'Informe o título.';
    if (!Object.hasOwn(TYPES, type)) errors.type = 'Escolha o tipo.';
    if (!isValidDate(date)) errors.date = 'Informe uma data válida.';
    if (time && !TIME_RE.test(time)) errors.time = 'Use o formato 14:30 ou deixe em branco.';
    if (!Object.hasOwn(PRIORITIES, priority)) errors.priority = 'Escolha a prioridade.';
    if (!showErrors(form, errors)) return;

    const editingId = state.itemForm && state.itemForm.id;
    let savedId = editingId;
    let next;
    let message;
    if (editingId && state.items.some((i) => i.id === editingId)) {
      next = state.items.map((i) =>
        i.id === editingId ? clean({ ...i, title, type, date, time, subject, priority, notes }) : i
      );
      message = `"${title}" atualizado.`;
    } else {
      savedId = newId('atv');
      next = [
        ...state.items,
        clean({ id: savedId, title, type, date, time, subject, priority, status: 'pendente', notes }),
      ];
      message = `"${title}" salvo na agenda.`;
    }
    if (!persist(KEY_AGENDA, next, 'items')) return;

    state.itemForm = null;
    state.itemDelete = null;
    state.rescheduleId = null;
    renderItemForm();
    renderAgendaList();
    announce(message);
    focusAction('toggle-item', savedId);
  }

  function saveReschedule(form) {
    const id = form.dataset.id;
    const fd = new FormData(form);
    const date = String(fd.get('date') || '');
    const time = String(fd.get('time') || '');
    const errors = {};
    if (!isValidDate(date)) errors.date = 'Informe uma data válida.';
    if (time && !TIME_RE.test(time)) errors.time = 'Use o formato 14:30 ou deixe em branco.';
    if (!showErrors(form, errors)) return;

    const item = state.items.find((i) => i.id === id);
    if (!item) return;
    const next = state.items.map((i) => (i.id === id ? clean({ ...i, date, time }) : i));
    if (!persist(KEY_AGENDA, next, 'items')) return;

    state.rescheduleId = null;
    if (state.itemForm && state.itemForm.id === id) {
      state.itemForm = null;
      renderItemForm();
    }
    renderAgendaList();
    announce(`"${item.title}" reagendado para ${formatDate(date)}.`);
    focusAction('toggle-item', id);
  }

  function toggleItem(id) {
    const item = state.items.find((i) => i.id === id);
    if (!item) return;
    const nextStatus = item.status === 'concluida' ? 'pendente' : 'concluida';
    const next = state.items.map((i) => (i.id === id ? { ...i, status: nextStatus } : i));
    if (!persist(KEY_AGENDA, next, 'items')) return;
    state.rescheduleId = null;
    if (nextStatus === 'concluida') state.showDone = true;
    if (state.itemForm && state.itemForm.id === id) {
      // o formulário aberto precisa refletir o item; fecha para evitar edição sobre dado antigo
      state.itemForm = null;
      renderItemForm();
    }
    renderAgendaList();
    announce(nextStatus === 'concluida' ? `"${item.title}" concluído.` : `"${item.title}" reaberto.`);
    focusAction('toggle-item', id);
  }

  function deleteItem(id) {
    const item = state.items.find((i) => i.id === id);
    const next = state.items.filter((i) => i.id !== id);
    if (!persist(KEY_AGENDA, next, 'items')) return;
    state.itemDelete = null;
    if (state.rescheduleId === id) state.rescheduleId = null;
    if (state.itemForm && state.itemForm.id === id) {
      state.itemForm = null;
      renderItemForm();
    }
    renderAgendaList();
    announce(item ? `"${item.title}" excluído.` : 'Item excluído.');
    focusAction('add-item');
  }

  /* ---------------- eventos (delegados no root) ---------------- */

  function onClick(event) {
    const target = event.target.closest('[data-action]');
    if (!target || !root.contains(target)) return;
    const { action, id } = target.dataset;
    announce('');

    switch (action) {
      case 'tab':
        state.tab = target.dataset.tab === 'agenda' ? 'agenda' : 'horarios';
        renderTabs();
        break;

      /* horários */
      case 'day':
        state.selectedDay = Number(target.dataset.day);
        state.lessonDelete = null;
        renderSchedule();
        // mantém o foco no dia escolhido (os botões foram recriados)
        {
          const chosen = [...refs.days.children].find((n) => n.dataset.day === String(state.selectedDay));
          if (chosen) chosen.focus();
        }
        break;
      case 'add-lesson':
        state.lessonForm = { id: null };
        renderLessonForm();
        refs.lessonForm.querySelector('[name="subject"]').focus();
        break;
      case 'edit-lesson': {
        const lesson = state.lessons.find((l) => l.id === id);
        if (!lesson) break;
        state.selectedDay = lesson.weekday;
        state.lessonForm = { id };
        state.lessonDelete = null;
        renderSchedule();
        renderLessonForm();
        refs.lessonForm.querySelector('[name="subject"]').focus();
        break;
      }
      case 'cancel-lesson-form': {
        const editingId = state.lessonForm && state.lessonForm.id;
        state.lessonForm = null;
        renderLessonForm();
        if (!(editingId && focusAction('edit-lesson', editingId))) focusAction('add-lesson');
        break;
      }
      case 'delete-lesson':
        state.lessonDelete = id;
        renderLessonList();
        focusAction('cancel-delete-lesson', id);
        break;
      case 'cancel-delete-lesson':
        state.lessonDelete = null;
        renderLessonList();
        focusAction('delete-lesson', id);
        break;
      case 'confirm-delete-lesson':
        deleteLesson(id);
        break;

      /* agenda */
      case 'add-item':
        state.itemForm = { id: null };
        renderItemForm();
        refs.itemForm.querySelector('[name="title"]').focus();
        break;
      case 'edit-item':
        state.itemForm = { id };
        state.itemDelete = null;
        state.rescheduleId = null;
        renderAgendaList();
        renderItemForm();
        refs.itemForm.querySelector('[name="title"]').focus();
        break;
      case 'cancel-item-form': {
        const editingId = state.itemForm && state.itemForm.id;
        state.itemForm = null;
        renderItemForm();
        if (!(editingId && focusAction('edit-item', editingId))) focusAction('add-item');
        break;
      }
      case 'toggle-item':
        toggleItem(id);
        break;
      case 'reschedule-item':
        state.rescheduleId = id;
        state.itemDelete = null;
        renderAgendaList();
        {
          const dateField = root.querySelector('[data-form="reschedule"] [name="date"]');
          if (dateField) dateField.focus();
        }
        break;
      case 'cancel-reschedule': {
        const rescheduledId = state.rescheduleId;
        state.rescheduleId = null;
        renderAgendaList();
        focusAction('reschedule-item', rescheduledId);
        break;
      }
      case 'delete-item':
        state.itemDelete = id;
        state.rescheduleId = null;
        renderAgendaList();
        focusAction('cancel-delete-item', id);
        break;
      case 'cancel-delete-item':
        state.itemDelete = null;
        renderAgendaList();
        focusAction('delete-item', id);
        break;
      case 'confirm-delete-item':
        deleteItem(id);
        break;
      default:
        break;
    }
  }

  function onSubmit(event) {
    const form = event.target.closest('form');
    if (!form || !root.contains(form)) return;
    event.preventDefault();
    announce('');
    switch (form.dataset.form) {
      case 'lesson':
        saveLesson(form);
        break;
      case 'item':
        saveItem(form);
        break;
      case 'reschedule':
        saveReschedule(form);
        break;
      default:
        break;
    }
  }

  // `toggle` não propaga; captura para lembrar se "Concluídas" está aberta.
  function onToggle(event) {
    const details = event.target;
    if (details && details.classList && details.classList.contains('agenda-done')) {
      state.showDone = details.open;
    }
  }

  root.addEventListener('click', onClick);
  root.addEventListener('submit', onSubmit);
  root.addEventListener('toggle', onToggle, true);

  /* ---------------- primeira renderização ---------------- */

  renderTabs();
  renderSchedule();
  renderAgendaHead();
  renderAgendaList();

  return function destroy() {
    root.removeEventListener('click', onClick);
    root.removeEventListener('submit', onSubmit);
    root.removeEventListener('toggle', onToggle, true);
    root.remove();
  };
}
