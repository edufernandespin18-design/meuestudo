/**
 * MeuEstudo — Módulo Modo Foco (Pomodoro)
 * Dono: Marcelo Augusto Silva Carneiro
 *
 * Contrato: export function mount(container, services) -> destroy()
 * Persistência: services.storage.read/write na chave "meuestudo:v1:foco".
 *
 * Como o timer funciona:
 *  - Rodando: guardamos `endsAt` (instante-alvo em ms). O restante é sempre
 *    calculado por (endsAt - Date.now()), então segundo plano, suspensão de
 *    timers ou recarregamento da página não "perdem" tempo.
 *  - Pausado/parado: guardamos `remainingMs`.
 *  - O setInterval serve APENAS para atualizar a tela (um único por montagem).
 *  - Ao terminar uma etapa, o módulo passa para a próxima (foco <-> pausa)
 *    PARADA, com mensagem e botão claro para iniciar. Nada começa sozinho.
 *
 * Limites (ditos ao usuário na tela): não bloqueia outros apps e não garante
 * alarme com o app fechado.
 */

const STORAGE_KEY = 'meuestudo:v1:foco';
const DEFAULT_FOCUS_MIN = 25;
const DEFAULT_BREAK_MIN = 5;
const MAX_SUBJECT_LENGTH = 60;
const TICK_MS = 250;

/* ---------- utilidades puras ---------- */

function toMinutes(value, fallback) {
  const n = Number(value);
  return Number.isFinite(n) && n >= 1 && n <= 180 ? Math.round(n) : fallback;
}

function phaseTotalMs(state, phase = state.phase) {
  return (phase === 'break' ? state.breakMinutes : state.focusMinutes) * 60000;
}

/** Valida/normaliza o que veio do storage. Nunca lança erro. */
function sanitize(raw, now) {
  const r = raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : {};
  const state = {
    subject: typeof r.subject === 'string' ? r.subject.trim().slice(0, MAX_SUBJECT_LENGTH) : '',
    phase: r.phase === 'break' ? 'break' : 'focus',
    isRunning: false,
    endsAt: null,
    remainingMs: 0,
    focusMinutes: toMinutes(r.focusMinutes, DEFAULT_FOCUS_MIN),
    breakMinutes: toMinutes(r.breakMinutes, DEFAULT_BREAK_MIN),
  };
  const total = phaseTotalMs(state);

  const rem = Number(r.remainingMs);
  state.remainingMs = Number.isFinite(rem) && rem > 0 && rem <= total ? rem : total;

  if (r.isRunning === true && typeof r.endsAt === 'number' && Number.isFinite(r.endsAt)) {
    state.isRunning = true;
    // Relógio do aparelho alterado: nunca aceitar mais que a duração da etapa.
    state.endsAt = Math.min(r.endsAt, now + total);
  }
  return state;
}

function formatClock(ms) {
  const totalSeconds = Math.max(0, Math.ceil(ms / 1000));
  const m = Math.floor(totalSeconds / 60);
  const s = totalSeconds % 60;
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

function spokenTime(ms) {
  const totalSeconds = Math.max(0, Math.ceil(ms / 1000));
  const m = Math.floor(totalSeconds / 60);
  const s = totalSeconds % 60;
  return `${m} minuto${m === 1 ? '' : 's'} e ${s} segundo${s === 1 ? '' : 's'}`;
}

/** Storage de reserva só para o módulo não quebrar se `services` vier incompleto. */
function fallbackStorage() {
  const mem = {};
  return {
    read: (key, fallback) => (key in mem ? mem[key] : fallback),
    write: (key, value) => { mem[key] = value; },
  };
}

/* ---------- módulo ---------- */

export function mount(container, services) {
  const storage = services && services.storage ? services.storage : fallbackStorage();

  /* --- estado --- */
  let state;
  try {
    state = sanitize(storage.read(STORAGE_KEY, null), Date.now());
  } catch (err) {
    state = sanitize(null, Date.now());
  }
  let tickHandle = null;
  let statusMessage = '';
  let lastPaintedClock = '';

  function persist() {
    try {
      storage.write(STORAGE_KEY, {
        subject: state.subject,
        phase: state.phase,
        isRunning: state.isRunning,
        endsAt: state.isRunning ? state.endsAt : null,
        remainingMs: state.remainingMs,
        focusMinutes: state.focusMinutes,
        breakMinutes: state.breakMinutes,
      });
    } catch (err) {
      statusMessage = 'Não foi possível salvar agora. O timer continua funcionando nesta tela.';
    }
  }

  /* --- DOM --- */
  container.innerHTML = `
    <section class="focus-root" aria-labelledby="focus-title">
      <h2 class="focus-title" id="focus-title">Modo foco</h2>
      <p class="focus-intro"></p>

      <div class="focus-field">
        <label class="focus-label" for="focus-subject">Disciplina da sessão</label>
        <input class="focus-input" id="focus-subject" type="text" list="focus-subject-list"
               maxlength="${MAX_SUBJECT_LENGTH}" autocomplete="off" placeholder="Ex.: Banco de Dados">
        <datalist id="focus-subject-list"></datalist>
      </div>

      <div class="focus-panel" data-phase="focus">
        <p class="focus-phase"><span class="focus-phase-icon" aria-hidden="true"></span><span class="focus-phase-label"></span></p>
        <p class="focus-subject-line"></p>
        <div class="focus-time" role="timer" aria-live="off"></div>
        <div class="focus-progress" aria-hidden="true"><div class="focus-progress-bar"></div></div>
        <div class="focus-actions">
          <button type="button" class="focus-btn focus-btn--primary" data-focus-action="toggle"></button>
          <button type="button" class="focus-btn focus-btn--secondary" data-focus-action="reset">Reiniciar</button>
        </div>
      </div>

      <p class="focus-status" role="status" aria-live="polite"></p>
      <p class="focus-note">O MeuEstudo não bloqueia outros aplicativos. Se você sair da tela ou bloquear o celular,
        o tempo continua contando e é atualizado quando você voltar, mas não há alarme garantido com o app fechado.</p>
    </section>
  `;

  const root = container.querySelector('.focus-root');
  const introEl = root.querySelector('.focus-intro');
  const subjectInput = root.querySelector('#focus-subject');
  const subjectList = root.querySelector('#focus-subject-list');
  const panelEl = root.querySelector('.focus-panel');
  const phaseLabelEl = root.querySelector('.focus-phase-label');
  const subjectLineEl = root.querySelector('.focus-subject-line');
  const timeEl = root.querySelector('.focus-time');
  const barEl = root.querySelector('.focus-progress-bar');
  const toggleBtn = root.querySelector('[data-focus-action="toggle"]');
  const resetBtn = root.querySelector('[data-focus-action="reset"]');
  const statusEl = root.querySelector('.focus-status');

  introEl.textContent =
    `Ciclos de ${state.focusMinutes} min de foco e ${state.breakMinutes} min de pausa, no seu ritmo. ` +
    'Se precisar parar, é só pausar e retomar depois.';

  /* Sugestões de disciplina vindas dos outros módulos (somente leitura, opcional). */
  function loadSubjectSuggestions() {
    const found = new Set();
    ['meuestudo:v1:horarios', 'meuestudo:v1:agenda', 'meuestudo:v1:notas'].forEach((key) => {
      try {
        const data = storage.read(key, []);
        if (Array.isArray(data)) {
          data.forEach((item) => {
            if (item && typeof item.subject === 'string' && item.subject.trim()) {
              found.add(item.subject.trim().slice(0, MAX_SUBJECT_LENGTH));
            }
          });
        }
      } catch (err) { /* sugestões são opcionais */ }
    });
    Array.from(found)
      .sort((a, b) => a.localeCompare(b, 'pt-BR'))
      .slice(0, 50)
      .forEach((name) => {
        const option = document.createElement('option');
        option.value = name;
        subjectList.appendChild(option);
      });
  }

  /* --- lógica do timer --- */

  function currentRemainingMs(now = Date.now()) {
    if (state.isRunning) return Math.max(0, state.endsAt - now);
    return state.remainingMs;
  }

  function completePhase(whileAway) {
    const finished = state.phase;
    state.phase = finished === 'focus' ? 'break' : 'focus';
    state.isRunning = false;
    state.endsAt = null;
    state.remainingMs = phaseTotalMs(state);
    persist();
    stopTicker();

    if (finished === 'focus') {
      statusMessage = (whileAway
        ? 'Sua etapa de foco terminou enquanto você estava fora. '
        : 'Etapa de foco concluída. ') +
        `Quando quiser, comece a pausa de ${state.breakMinutes} min.`;
    } else {
      statusMessage = (whileAway
        ? 'Sua pausa terminou enquanto você estava fora. '
        : 'Pausa concluída. ') +
        'Quando estiver pronto, comece uma nova etapa de foco.';
    }
  }

  /** Recalcula o estado a partir do relógio. Seguro de chamar a qualquer momento. */
  function sync(whileAway = false) {
    if (state.isRunning && state.endsAt - Date.now() <= 0) {
      completePhase(whileAway);
    }
    paint();
  }

  function ensureTicker() {
    if (tickHandle !== null) return;
    tickHandle = setInterval(() => sync(false), TICK_MS);
  }

  function stopTicker() {
    if (tickHandle !== null) {
      clearInterval(tickHandle);
      tickHandle = null;
    }
  }

  function start() {
    if (state.isRunning) return; // evita duplo clique
    if (state.remainingMs <= 0) state.remainingMs = phaseTotalMs(state);
    const resuming = state.remainingMs < phaseTotalMs(state);
    state.endsAt = Date.now() + state.remainingMs;
    state.isRunning = true;
    statusMessage = resuming
      ? 'Sessão retomada. Continue de onde parou.'
      : (state.phase === 'focus' ? 'Foco iniciado. Bom estudo!' : 'Pausa iniciada. Respire um pouco.');
    persist();
    ensureTicker();
    paint();
  }

  function pause() {
    if (!state.isRunning) return;
    state.remainingMs = Math.max(1, currentRemainingMs());
    state.isRunning = false;
    state.endsAt = null;
    statusMessage = 'Sessão pausada. Retome quando quiser.';
    persist();
    stopTicker();
    paint();
  }

  function reset() {
    state.isRunning = false;
    state.endsAt = null;
    state.remainingMs = phaseTotalMs(state);
    statusMessage = 'Etapa reiniciada. Sem pressa: comece quando estiver pronto.';
    persist();
    stopTicker();
    paint();
  }

  /* --- renderização --- */

  function toggleLabel() {
    if (state.isRunning) return 'Pausar';
    if (state.remainingMs < phaseTotalMs(state)) return 'Retomar';
    return state.phase === 'break' ? 'Iniciar pausa' : 'Iniciar foco';
  }

  function paint() {
    const remaining = currentRemainingMs();
    const total = phaseTotalMs(state);
    const clock = formatClock(remaining);
    const phaseName = state.phase === 'break' ? 'Pausa' : 'Foco';

    panelEl.dataset.phase = state.phase;
    panelEl.dataset.running = state.isRunning ? 'true' : 'false';
    phaseLabelEl.textContent = state.isRunning ? `${phaseName} em andamento` : phaseName;

    subjectLineEl.textContent = state.subject
      ? `Disciplina: ${state.subject}`
      : 'Nenhuma disciplina escolhida (opcional)';

    if (clock !== lastPaintedClock) {
      timeEl.textContent = clock;
      timeEl.setAttribute('aria-label', `${phaseName}: ${spokenTime(remaining)} restantes`);
      lastPaintedClock = clock;
    }

    const pct = Math.min(100, Math.max(0, (1 - remaining / total) * 100));
    barEl.style.width = `${pct.toFixed(1)}%`;

    toggleBtn.textContent = toggleLabel();
    toggleBtn.setAttribute('aria-pressed', state.isRunning ? 'true' : 'false');
    subjectInput.disabled = state.isRunning;

    if (statusEl.textContent !== statusMessage) statusEl.textContent = statusMessage;
  }

  /* --- eventos --- */

  function onToggle() {
    if (state.isRunning) pause(); else start();
  }

  function onSubjectInput() {
    state.subject = subjectInput.value.trim().slice(0, MAX_SUBJECT_LENGTH);
    persist();
    paint();
  }

  function onReturnToScreen() {
    if (document.visibilityState === 'hidden') return;
    sync(true); // recalcula pelo relógio ao voltar
  }

  toggleBtn.addEventListener('click', onToggle);
  resetBtn.addEventListener('click', reset);
  subjectInput.addEventListener('input', onSubjectInput);
  document.addEventListener('visibilitychange', onReturnToScreen);
  window.addEventListener('pageshow', onReturnToScreen);
  window.addEventListener('focus', onReturnToScreen);

  /* --- inicialização --- */
  subjectInput.value = state.subject;
  loadSubjectSuggestions();

  if (state.isRunning) {
    if (state.endsAt - Date.now() <= 0) {
      completePhase(true); // terminou enquanto o módulo/página estava fechado
    } else {
      statusMessage = 'Sessão em andamento. O tempo foi atualizado.';
      ensureTicker();
    }
  } else if (state.remainingMs < phaseTotalMs(state)) {
    statusMessage = 'Sessão pausada. Retome quando quiser.';
  }
  paint();

  /* --- limpeza --- */
  return function destroy() {
    stopTicker();
    toggleBtn.removeEventListener('click', onToggle);
    resetBtn.removeEventListener('click', reset);
    subjectInput.removeEventListener('input', onSubjectInput);
    document.removeEventListener('visibilitychange', onReturnToScreen);
    window.removeEventListener('pageshow', onReturnToScreen);
    window.removeEventListener('focus', onReturnToScreen);
    // O estado (endsAt/remainingMs) já está salvo: ao voltar, mount() recalcula.
    container.innerHTML = '';
  };
}
