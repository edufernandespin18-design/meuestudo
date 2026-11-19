/* =========================================================
   MeuEstudo — ui.js
   Utilitários compartilhados (aprovados para uso dos módulos):
   escape de texto, datas/horas, mensagens (toast) e seletores
   usados pelo painel inicial.
   ========================================================= */

const WEEKDAYS = ['domingo', 'segunda-feira', 'terça-feira', 'quarta-feira', 'quinta-feira', 'sexta-feira', 'sábado'];
const WEEKDAYS_SHORT = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];
const MONTHS = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];

/** Escapa texto do usuário antes de inserir via innerHTML. */
export function escapeHTML(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export function weekdayName(index) {
  return WEEKDAYS[index] ?? '';
}

export function weekdayShort(index) {
  return WEEKDAYS_SHORT[index] ?? '';
}

function pad(n) {
  return String(n).padStart(2, '0');
}

/** Data local no formato YYYY-MM-DD (não usa UTC, evita erro de fuso). */
export function todayISO(date = new Date()) {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

/** Converte "YYYY-MM-DD" em Date local; devolve null se inválida. */
export function parseISODate(iso) {
  if (typeof iso !== 'string') return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (!m) return null;
  const y = Number(m[1]), mo = Number(m[2]), d = Number(m[3]);
  const date = new Date(y, mo - 1, d);
  if (date.getFullYear() !== y || date.getMonth() !== mo - 1 || date.getDate() !== d) return null;
  return date;
}

/** "Qui, 12/11" */
export function formatDateShort(iso) {
  const d = parseISODate(iso);
  if (!d) return '';
  return `${WEEKDAYS_SHORT[d.getDay()]}, ${pad(d.getDate())}/${pad(d.getMonth() + 1)}`;
}

/** "quinta-feira, 12 de novembro" */
export function formatDateLong(date = new Date()) {
  return `${WEEKDAYS[date.getDay()]}, ${date.getDate()} de ${MONTHS[date.getMonth()]}`;
}

/** Rótulo relativo: Hoje / Amanhã / Qui, 12/11 */
export function relativeDayLabel(iso, today = todayISO()) {
  if (iso === today) return 'Hoje';
  const t = parseISODate(today);
  const d = parseISODate(iso);
  if (t && d) {
    const diff = Math.round((d - t) / 86400000);
    if (diff === 1) return 'Amanhã';
  }
  return formatDateShort(iso);
}

/** Aceita "HH:MM"; devolve string normalizada ou '' se inválida. */
export function normalizeTime(value) {
  const m = /^(\d{1,2}):(\d{2})/.exec(String(value ?? ''));
  if (!m) return '';
  const h = Number(m[1]), mi = Number(m[2]);
  if (h > 23 || mi > 59) return '';
  return `${pad(h)}:${pad(mi)}`;
}

export function greeting(date = new Date()) {
  const h = date.getHours();
  if (h < 12) return 'Bom dia';
  if (h < 18) return 'Boa tarde';
  return 'Boa noite';
}

/* ---------- Seletores do painel (puros, testáveis) ---------- */

// Contrato oficial: status = 'pendente' | 'concluida'. As demais grafias são aceitas só por tolerância.
const DONE_VALUES = ['concluida', 'concluída', 'concluido', 'concluído', 'done', 'completed'];

/** Concluída = status 'concluida' (contrato). Grafias equivalentes também são aceitas. */
export function isDone(item) {
  return DONE_VALUES.includes(String(item?.status ?? '').trim().toLowerCase());
}

/** Aulas do dia da semana de `date`, ordenadas pelo horário inicial. */
export function selectTodayLessons(lessons, date = new Date()) {
  if (!Array.isArray(lessons)) return [];
  const wd = date.getDay();
  return lessons
    .filter((l) => l && Number(l.weekday) === wd && String(l.subject ?? '').trim() !== '')
    .sort((a, b) => normalizeTime(a.startTime).localeCompare(normalizeTime(b.startTime)));
}

/** Próximos compromissos pendentes (data de hoje em diante), em ordem. */
export function selectUpcoming(items, today = todayISO(), limit = 5) {
  if (!Array.isArray(items)) return [];
  return items
    .filter((i) => i && String(i.title ?? '').trim() !== '' && !isDone(i)
      && parseISODate(i.date) && i.date >= today)
    .sort((a, b) => {
      if (a.date !== b.date) return a.date < b.date ? -1 : 1;
      return (normalizeTime(a.time) || '99:99').localeCompare(normalizeTime(b.time) || '99:99');
    })
    .slice(0, limit);
}

/** Quantidade de pendências com data anterior a hoje (para convite neutro a reagendar). */
export function countPendingPast(items, today = todayISO()) {
  if (!Array.isArray(items)) return 0;
  return items.filter((i) => i && String(i.title ?? '').trim() !== '' && !isDone(i)
    && parseISODate(i.date) && i.date < today).length;
}

/* ---------- Mensagens (toast) ---------- */

let toastTimer = null;

/** Mostra uma mensagem curta. type: 'info' | 'error'. */
export function toast(message, type = 'info') {
  const el = document.getElementById('toast');
  if (!el) return;
  el.textContent = message;
  el.classList.toggle('toast--error', type === 'error');
  el.classList.add('toast--show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('toast--show'), 3500);
}

/** Gera um id estável para registros. */
export function newId() {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `id-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}
