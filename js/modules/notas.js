/* MeuEstudo v0.3 — Módulo Notas, médias e estimador (brief 03, reexecução)
 *
 * Contrato (Contrato Técnico Compartilhado v0.3):
 *   export function mount(container, services) -> destroy()
 *   services.storage.read(key, fallback) / services.storage.write(key, value)
 *   Chave: meuestudo:v1:notas (única chave que este módulo lê ou grava)
 *   Prefixo CSS: grade-
 *
 * Dado salvo: array de boletins, um por disciplina, exatamente neste formato:
 *   { id, subject, targetAverage, totalAssessments,
 *     grades: [{ id, label, score, date }] }
 *   - totalAssessments: inteiro >= 1 (obrigatório na interface). Só pode vir
 *     null se um dado já salvo estiver corrompido; a tela então pede o total.
 *   - date: "AAAA-MM-DD" ou "" quando não informada.
 *
 * Regras de cálculo (pesos iguais; o módulo NÃO conhece a regra da escola):
 *   média atual               = soma das notas / quantidade de notas
 *   média necessária restantes = (M × N − S) / R
 */

const STORAGE_KEY = 'meuestudo:v1:notas';
const MIN_SCORE = 0;
const MAX_SCORE = 10;
const EPS = 1e-9;
const DEFAULT_TARGET = 6;
const MAX_SUBJECT_LENGTH = 60;
const MAX_LABEL_LENGTH = 40;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/* ---------------------------------------------------------------- */
/* Funções puras (exportadas para facilitar teste)                   */
/* ---------------------------------------------------------------- */

/** Texto -> número. Vazio -> null; inválido -> NaN. Aceita vírgula decimal. */
export function parseDecimal(raw) {
  if (raw === null || raw === undefined) return null;
  const text = String(raw).trim().replace(',', '.');
  if (text === '') return null;
  if (!/^\d+(\.\d+)?$/.test(text)) return NaN;
  return Number(text);
}

/** Total de avaliações: vazio -> null; inteiro >= 1; inválido -> NaN. */
export function parseTotal(raw) {
  if (raw === null || raw === undefined) return null;
  const text = String(raw).trim();
  if (text === '') return null;
  if (!/^\d+$/.test(text)) return NaN;
  const n = Number(text);
  return n >= 1 ? n : NaN;
}

export function isValidScore(value) {
  return typeof value === 'number' && Number.isFinite(value) && value >= MIN_SCORE && value <= MAX_SCORE;
}

/** Média aritmética simples; null se não houver notas válidas. */
export function calcAverage(grades) {
  const valid = (grades || []).filter((g) => g && isValidScore(g.score));
  if (valid.length === 0) return null;
  return valid.reduce((acc, g) => acc + g.score, 0) / valid.length;
}

/**
 * Estimativa da média necessária nas avaliações restantes (pesos iguais).
 * status: 'missing-data' | 'invalid' | 'no-remaining' | 'achieved'
 *       | 'unreachable' | 'reachable'
 */
export function estimateNeeded({ target, total, grades }) {
  const valid = (grades || []).filter((g) => g && isValidScore(g.score));
  const average = calcAverage(valid);
  if (!isValidScore(target) || !Number.isInteger(total) || total < 1) {
    return { status: 'missing-data', average };
  }
  const remaining = total - valid.length;
  if (remaining < 0) return { status: 'invalid', average };
  if (remaining === 0) return { status: 'no-remaining', average, remaining };

  const sum = valid.reduce((acc, g) => acc + g.score, 0);
  const needed = (target * total - sum) / remaining;
  if (needed <= EPS) return { status: 'achieved', average, remaining, needed };
  if (needed > MAX_SCORE + EPS) return { status: 'unreachable', average, remaining, needed };
  return { status: 'reachable', average, remaining, needed };
}

/* ---------------------------------------------------------------- */
/* Utilitários internos                                              */
/* ---------------------------------------------------------------- */

function genId() {
  try {
    if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
      return crypto.randomUUID();
    }
  } catch (_) { /* usa alternativa */ }
  return 'n' + Date.now().toString(36) + Math.random().toString(36).slice(2, 10);
}

/** 7.5 -> "7,5"; 8 -> "8,0"; 5.25 -> "5,25" */
function fmt(n) {
  let s = Number(n).toFixed(2);
  if (s.endsWith('0')) s = s.slice(0, -1);
  return s.replace('.', ',');
}

function fmtDate(iso) {
  if (typeof iso !== 'string' || !DATE_RE.test(iso)) return '';
  const [y, m, d] = iso.split('-');
  return `${d}/${m}/${y}`;
}

function plural(n, one, many) {
  return `${n} ${n === 1 ? one : many}`;
}

/** Sanitiza o que veio do armazenamento (ausente, antigo ou corrompido). */
function normalize(raw) {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((d) => d && typeof d === 'object' && typeof d.subject === 'string' && d.subject.trim())
    .map((d) => ({
      id: typeof d.id === 'string' && d.id ? d.id : genId(),
      subject: d.subject.trim().slice(0, MAX_SUBJECT_LENGTH),
      targetAverage: isValidScore(d.targetAverage) ? d.targetAverage : DEFAULT_TARGET,
      totalAssessments:
        Number.isInteger(d.totalAssessments) && d.totalAssessments >= 1 ? d.totalAssessments : null,
      grades: Array.isArray(d.grades)
        ? d.grades
            .filter((g) => g && typeof g === 'object' && isValidScore(g.score))
            .map((g) => ({
              id: typeof g.id === 'string' && g.id ? g.id : genId(),
              label:
                typeof g.label === 'string' && g.label.trim()
                  ? g.label.trim().slice(0, MAX_LABEL_LENGTH)
                  : 'Avaliação',
              score: g.score,
              date: typeof g.date === 'string' && DATE_RE.test(g.date) ? g.date : '',
            }))
        : [],
    }));
}

/** Criador de elementos. Usa textContent: nunca interpreta HTML. */
function h(tag, props, ...children) {
  const el = document.createElement(tag);
  for (const [key, value] of Object.entries(props || {})) {
    if (value === null || value === undefined || value === false) continue;
    if (key === 'class') el.className = value;
    else if (key === 'text') el.textContent = value;
    else el.setAttribute(key, value === true ? '' : String(value));
  }
  for (const child of children.flat()) {
    if (child === null || child === undefined || child === false) continue;
    el.append(child instanceof Node ? child : document.createTextNode(String(child)));
  }
  return el;
}

/** replaceChildren nativo escreveria "null" como texto: filtramos antes. */
function setChildren(el, nodes) {
  el.replaceChildren(...nodes.filter((n) => n !== null && n !== undefined && n !== false));
}

function field(id, labelText, inputProps, hint) {
  const hintId = hint ? `${id}-hint` : null;
  return h(
    'div',
    { class: 'grade-field' },
    h('label', { class: 'grade-label', for: id, text: labelText }),
    h('input', { class: 'grade-input', id, 'aria-describedby': hintId, ...inputProps }),
    hint ? h('p', { class: 'grade-hint', id: hintId, text: hint }) : null
  );
}

/* ---------------------------------------------------------------- */
/* Módulo                                                            */
/* ---------------------------------------------------------------- */

// No máximo uma instância ativa: um mount() repetido sem destroy() não deixa
// listeners da instância anterior para trás.
let activeInstance = null;

export function mount(container, services) {
  if (activeInstance) activeInstance.destroy();

  const controller = new AbortController();
  const { signal } = controller;

  let data = [];
  try {
    data = normalize(services.storage.read(STORAGE_KEY, []));
  } catch (_) {
    data = [];
  }

  let editing = null; // { disciplineId, gradeId }
  let notice = '';
  let pendingFocus = null;

  const root = h('section', { class: 'grade-root', 'aria-labelledby': 'grade-title' });
  container.replaceChildren(root);

  const SAVE_ERROR =
    'Não foi possível salvar neste navegador. O que você digitou pode não permanecer depois de fechar o app.';

  function persist() {
    try {
      return services.storage.write(STORAGE_KEY, data) !== false;
    } catch (_) {
      return false;
    }
  }

  function showError(form, message) {
    const el = form.querySelector('.grade-error');
    if (el) el.textContent = message;
  }

  function findDiscipline(id) {
    return data.find((d) => d.id === id);
  }

  /* ---------------- renderização ---------------- */

  function estimatorText(d, est) {
    const rest = est.remaining;
    const restText = rest === 1 ? 'na avaliação restante' : `nas ${rest} avaliações restantes`;
    switch (est.status) {
      case 'missing-data':
        return 'Informe a meta e o total de avaliações do período (em “Configurar disciplina”) para ver a estimativa.';
      case 'invalid':
        return 'O total de avaliações é menor que a quantidade de notas registradas. Ajuste o total em “Configurar disciplina”.';
      case 'no-remaining':
        return `Não há avaliações restantes configuradas. Média atual: ${fmt(est.average)} (meta: ${fmt(d.targetAverage)}).`;
      case 'achieved':
        return `Considerando as notas registradas, a meta de ${fmt(d.targetAverage)} já foi atingida.`;
      case 'unreachable':
        return `Com esses parâmetros, a meta de ${fmt(d.targetAverage)} não é alcançável: seria necessário ${fmt(est.needed)} ${restText}, acima da nota máxima (10). Você pode ajustar a meta ou o total de avaliações para simular outros cenários.`;
      default:
        return `Para chegar à meta de ${fmt(d.targetAverage)}, a ${rest === 1 ? 'nota' : 'média'} necessária ${restText} seria ${fmt(est.needed)}.`;
    }
  }

  function renderEstimator(d) {
    const est = estimateNeeded({ target: d.targetAverage, total: d.totalAssessments, grades: d.grades });
    return h(
      'div',
      { class: 'grade-estimator' },
      h('h4', { class: 'grade-subtitle', text: 'Estimativa para as próximas avaliações' }),
      h('p', { class: 'grade-estimator-text', text: estimatorText(d, est) }),
      h('p', {
        class: 'grade-hint',
        text: 'Simulação que supõe avaliações de pesos iguais. Não é resultado oficial nem garantia de aprovação: a escola pode usar outros critérios.',
      })
    );
  }

  function gradeForm(d, g) {
    const isEdit = Boolean(g);
    const prefix = `grade-${d.id}-${isEdit ? g.id : 'new'}`;
    return h(
      'form',
      {
        class: 'grade-form grade-form--grade',
        'data-action': 'save-grade',
        'data-discipline': d.id,
        'data-grade': isEdit ? g.id : null,
        novalidate: true,
      },
      h('h4', { class: 'grade-subtitle', text: isEdit ? 'Editar nota' : 'Adicionar nota' }),
      field(`${prefix}-label`, 'Nome da avaliação', {
        name: 'label',
        type: 'text',
        maxlength: MAX_LABEL_LENGTH,
        placeholder: 'Ex.: Prova 1',
        value: isEdit ? g.label : '',
        autocomplete: 'off',
      }),
      field(
        `${prefix}-score`,
        'Nota (0 a 10)',
        {
          name: 'score',
          type: 'text',
          inputmode: 'decimal',
          value: isEdit ? fmt(g.score) : '',
          autocomplete: 'off',
          required: true,
        },
        'Pode usar vírgula ou ponto, por exemplo 7,5.'
      ),
      field(`${prefix}-date`, 'Data (opcional)', { name: 'date', type: 'date', value: isEdit ? g.date : '' }),
      h('p', { class: 'grade-error', role: 'alert' }),
      h(
        'div',
        { class: 'grade-actions' },
        h('button', {
          class: 'grade-btn grade-btn--primary',
          type: 'submit',
          text: isEdit ? 'Salvar nota' : 'Adicionar nota',
        }),
        isEdit
          ? h('button', { class: 'grade-btn', type: 'button', 'data-action': 'cancel-edit', text: 'Cancelar' })
          : null
      )
    );
  }

  function renderGradeList(d) {
    if (d.grades.length === 0) {
      return h('p', { class: 'grade-empty-inline', text: 'Nenhuma nota registrada nesta disciplina ainda.' });
    }
    return h(
      'ul',
      { class: 'grade-items' },
      d.grades.map((g) => {
        if (editing && editing.disciplineId === d.id && editing.gradeId === g.id) {
          return h('li', { class: 'grade-item grade-item--editing' }, gradeForm(d, g));
        }
        const date = fmtDate(g.date);
        return h(
          'li',
          { class: 'grade-item' },
          h(
            'div',
            { class: 'grade-item-info' },
            h('span', { class: 'grade-item-label', text: g.label }),
            date ? h('span', { class: 'grade-item-date', text: date }) : null
          ),
          h('span', { class: 'grade-item-score', text: fmt(g.score) }),
          h(
            'div',
            { class: 'grade-item-actions' },
            h('button', {
              class: 'grade-btn grade-btn--small',
              type: 'button',
              'data-action': 'edit-grade',
              'data-discipline': d.id,
              'data-grade': g.id,
              'aria-label': `Editar ${g.label}`,
              text: 'Editar',
            }),
            h('button', {
              class: 'grade-btn grade-btn--small grade-btn--danger',
              type: 'button',
              'data-action': 'delete-grade',
              'data-discipline': d.id,
              'data-grade': g.id,
              'aria-label': `Excluir ${g.label}`,
              text: 'Excluir',
            })
          )
        );
      })
    );
  }

  function disciplineSettings(d) {
    const p = `grade-${d.id}-cfg`;
    return h(
      'details',
      { class: 'grade-settings' },
      h('summary', { class: 'grade-settings-summary', text: 'Configurar disciplina' }),
      h(
        'form',
        { class: 'grade-form', 'data-action': 'save-discipline', 'data-discipline': d.id, novalidate: true },
        field(`${p}-subject`, 'Disciplina', {
          name: 'subject',
          type: 'text',
          maxlength: MAX_SUBJECT_LENGTH,
          value: d.subject,
          required: true,
          autocomplete: 'off',
        }),
        field(`${p}-target`, 'Meta de média (0 a 10)', {
          name: 'target',
          type: 'text',
          inputmode: 'decimal',
          value: fmt(d.targetAverage),
          required: true,
          autocomplete: 'off',
        }),
        field(
          `${p}-total`,
          'Total de avaliações do período',
          {
            name: 'total',
            type: 'text',
            inputmode: 'numeric',
            value: d.totalAssessments === null ? '' : String(d.totalAssessments),
            autocomplete: 'off',
            required: true,
          },
          'Inclua as que já têm nota e as que ainda vão acontecer.'
        ),
        h('p', { class: 'grade-error', role: 'alert' }),
        h(
          'div',
          { class: 'grade-actions' },
          h('button', { class: 'grade-btn grade-btn--primary', type: 'submit', text: 'Salvar configurações' })
        )
      ),
      h(
        'div',
        { class: 'grade-actions grade-actions--danger' },
        h('button', {
          class: 'grade-btn grade-btn--danger',
          type: 'button',
          'data-action': 'delete-discipline',
          'data-discipline': d.id,
          text: 'Excluir disciplina',
        })
      )
    );
  }

  /** Barra decorativa (aria-hidden): os números já estão no texto. */
  function renderMeter(average, target) {
    const fill = h('span', { class: 'grade-meter-fill' });
    const goal = h('span', { class: 'grade-meter-goal' });
    fill.style.width = `${average === null ? 0 : Math.min(100, (average / MAX_SCORE) * 100)}%`;
    goal.style.left = `${Math.min(100, (target / MAX_SCORE) * 100)}%`;
    return h('div', { class: 'grade-meter', 'aria-hidden': 'true' }, fill, goal);
  }

  function renderDiscipline(d) {
    const average = calcAverage(d.grades);
    const status = average === null ? null : average + EPS >= d.targetAverage ? 'ok' : 'below';
    const countText =
      d.totalAssessments === null
        ? plural(d.grades.length, 'nota registrada', 'notas registradas')
        : `${d.grades.length} de ${plural(d.totalAssessments, 'avaliação', 'avaliações')} com nota`;
    return h(
      'article',
      { class: 'grade-card', 'aria-label': d.subject },
      h(
        'div',
        { class: 'grade-card-head' },
        h('h3', { class: 'grade-card-title', text: d.subject }),
        status
          ? h('span', {
              class: `grade-badge grade-badge--${status}`,
              text: status === 'ok' ? 'Na meta' : 'Abaixo da meta',
            })
          : null
      ),
      h(
        'dl',
        { class: 'grade-summary' },
        h(
          'div',
          { class: 'grade-stat grade-stat--main' },
          h('dt', { text: 'Média atual' }),
          h('dd', { class: 'grade-stat-value', text: average === null ? '—' : fmt(average) })
        ),
        h(
          'div',
          { class: 'grade-stat' },
          h('dt', { text: 'Meta' }),
          h('dd', { class: 'grade-stat-value', text: fmt(d.targetAverage) })
        )
      ),
      renderMeter(average, d.targetAverage),
      h('p', { class: 'grade-count', text: countText }),
      h('p', { class: 'grade-hint', text: 'Média aritmética simples das notas registradas.' }),
      renderGradeList(d),
      editing && editing.disciplineId === d.id ? null : gradeForm(d, null),
      renderEstimator(d),
      disciplineSettings(d)
    );
  }

  function renderCreateForm() {
    return h(
      'form',
      { class: 'grade-form grade-form--create', 'data-action': 'create-discipline', novalidate: true },
      h('h3', { class: 'grade-subtitle', text: 'Nova disciplina' }),
      field('grade-new-subject', 'Disciplina', {
        name: 'subject',
        type: 'text',
        maxlength: MAX_SUBJECT_LENGTH,
        placeholder: 'Ex.: Matemática',
        required: true,
        autocomplete: 'off',
      }),
      field('grade-new-target', 'Meta de média (0 a 10)', {
        name: 'target',
        type: 'text',
        inputmode: 'decimal',
        value: fmt(DEFAULT_TARGET),
        required: true,
        autocomplete: 'off',
      }),
      field(
        'grade-new-total',
        'Total de avaliações do período',
        { name: 'total', type: 'text', inputmode: 'numeric', autocomplete: 'off', required: true },
        'Inclua as que já aconteceram e as que ainda vão acontecer. Ele é usado na estimativa.'
      ),
      h('p', { class: 'grade-error', role: 'alert' }),
      h(
        'div',
        { class: 'grade-actions' },
        h('button', { class: 'grade-btn grade-btn--primary', type: 'submit', text: 'Adicionar disciplina' })
      )
    );
  }

  function render() {
    setChildren(root, [
      h(
        'header',
        { class: 'grade-header' },
        h('h2', { class: 'grade-title', id: 'grade-title', text: 'Notas e médias' }),
        h('p', {
          class: 'grade-intro',
          text: 'Registre suas notas por disciplina e acompanhe a média. Tudo fica salvo só neste aparelho.',
        })
      ),
      // Região de status sempre presente (leitores de tela anunciam mudanças).
      h('p', { class: 'grade-notice', role: 'status', text: notice }),
      data.length === 0
        ? h('p', {
            class: 'grade-empty',
            text: 'Você ainda não cadastrou disciplinas. Adicione a primeira para registrar suas notas.',
          })
        : h('div', { class: 'grade-list' }, data.map(renderDiscipline)),
      renderCreateForm(),
    ]);
    if (pendingFocus) {
      const target = root.querySelector(pendingFocus);
      pendingFocus = null;
      if (target && typeof target.focus === 'function') target.focus();
    }
  }

  /* ---------------- ações ---------------- */

  function readDisciplineForm(form) {
    const fd = new FormData(form);
    const subject = String(fd.get('subject') || '').trim();
    if (!subject) return { error: 'Informe o nome da disciplina.' };
    if (subject.length > MAX_SUBJECT_LENGTH) {
      return { error: `O nome pode ter no máximo ${MAX_SUBJECT_LENGTH} caracteres.` };
    }
    let target = parseDecimal(fd.get('target'));
    if (target === null) target = DEFAULT_TARGET;
    if (Number.isNaN(target) || !isValidScore(target)) {
      return { error: 'A meta de média deve ser um número entre 0 e 10.' };
    }
    const total = parseTotal(fd.get('total'));
    if (total === null || Number.isNaN(total)) {
      return { error: 'Informe o total de avaliações do período (número inteiro, a partir de 1).' };
    }
    return { subject, target, total };
  }

  function onCreateDiscipline(form) {
    const r = readDisciplineForm(form);
    if (r.error) return showError(form, r.error);
    const d = { id: genId(), subject: r.subject, targetAverage: r.target, totalAssessments: r.total, grades: [] };
    data.push(d);
    notice = persist() ? 'Disciplina adicionada.' : SAVE_ERROR;
    pendingFocus = `[data-action="save-grade"][data-discipline="${d.id}"] input[name="label"]`;
    render();
  }

  function onSaveDiscipline(form) {
    const d = findDiscipline(form.dataset.discipline);
    if (!d) return;
    const r = readDisciplineForm(form);
    if (r.error) return showError(form, r.error);
    if (r.total < d.grades.length) {
      return showError(
        form,
        `Esta disciplina já tem ${plural(d.grades.length, 'nota', 'notas')}. O total de avaliações não pode ser menor que isso.`
      );
    }
    d.subject = r.subject;
    d.targetAverage = r.target;
    d.totalAssessments = r.total;
    notice = persist() ? 'Configurações salvas.' : SAVE_ERROR;
    render();
  }

  function onSaveGrade(form) {
    const d = findDiscipline(form.dataset.discipline);
    if (!d) return;
    const gradeId = form.dataset.grade || null;
    const fd = new FormData(form);

    const score = parseDecimal(fd.get('score'));
    if (score === null) return showError(form, 'Informe a nota.');
    if (Number.isNaN(score) || !isValidScore(score)) {
      return showError(form, 'A nota deve ser um número entre 0 e 10.');
    }
    const label = String(fd.get('label') || '').trim().slice(0, MAX_LABEL_LENGTH);
    const dateRaw = String(fd.get('date') || '');
    const date = DATE_RE.test(dateRaw) ? dateRaw : '';

    if (gradeId) {
      const g = d.grades.find((x) => x.id === gradeId);
      if (!g) return;
      g.label = label || g.label;
      g.score = score;
      g.date = date;
      editing = null;
      notice = persist() ? 'Nota atualizada.' : SAVE_ERROR;
    } else {
      if (d.totalAssessments !== null && d.grades.length >= d.totalAssessments) {
        return showError(
          form,
          'Você já registrou todas as avaliações previstas. Aumente o total em “Configurar disciplina” para adicionar mais notas.'
        );
      }
      d.grades.push({ id: genId(), label: label || `Avaliação ${d.grades.length + 1}`, score, date });
      notice = persist() ? 'Nota adicionada.' : SAVE_ERROR;
      pendingFocus = `[data-action="save-grade"][data-discipline="${d.id}"]:not([data-grade]) input[name="label"]`;
    }
    render();
  }

  function onSubmit(event) {
    const form = event.target.closest('form[data-action]');
    if (!form || !root.contains(form)) return;
    event.preventDefault();
    switch (form.dataset.action) {
      case 'create-discipline': onCreateDiscipline(form); break;
      case 'save-discipline': onSaveDiscipline(form); break;
      case 'save-grade': onSaveGrade(form); break;
      default: break;
    }
  }

  function onClick(event) {
    const btn = event.target.closest('button[data-action]');
    if (!btn || !root.contains(btn) || btn.type === 'submit') return;
    const d = findDiscipline(btn.dataset.discipline);

    switch (btn.dataset.action) {
      case 'edit-grade':
        if (!d) return;
        editing = { disciplineId: d.id, gradeId: btn.dataset.grade };
        notice = '';
        pendingFocus = `[data-action="save-grade"][data-grade="${btn.dataset.grade}"] input[name="label"]`;
        render();
        break;
      case 'cancel-edit':
        editing = null;
        notice = '';
        render();
        break;
      case 'delete-grade': {
        if (!d) return;
        const g = d.grades.find((x) => x.id === btn.dataset.grade);
        if (!g || !window.confirm(`Excluir a nota “${g.label}”?`)) return;
        d.grades = d.grades.filter((x) => x.id !== g.id);
        editing = null;
        notice = persist() ? 'Nota excluída.' : SAVE_ERROR;
        render();
        break;
      }
      case 'delete-discipline':
        if (!d || !window.confirm(`Excluir a disciplina “${d.subject}” e todas as suas notas?`)) return;
        data = data.filter((x) => x.id !== d.id);
        editing = null;
        notice = persist() ? 'Disciplina excluída.' : SAVE_ERROR;
        render();
        break;
      default:
        break;
    }
  }

  root.addEventListener('submit', onSubmit, { signal });
  root.addEventListener('click', onClick, { signal });
  render();

  function destroy() {
    controller.abort();
    root.remove();
    if (activeInstance && activeInstance.destroy === destroy) activeInstance = null;
  }

  activeInstance = { destroy };
  return destroy;
}
