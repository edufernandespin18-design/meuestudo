// Testes automatizados da casca (sem dependências): node tests/shell.test.mjs
import assert from 'node:assert/strict';

let passed = 0;
const test = (name, fn) => { fn(); passed++; console.log('  ok  ' + name); };

// ---- localStorage simulado ----
function installLocalStorage({ broken = false, quota = false } = {}) {
  const store = new Map();
  globalThis.window = {
    localStorage: {
      getItem: (k) => { if (broken) throw new Error('blocked'); return store.has(k) ? store.get(k) : null; },
      setItem: (k, v) => { if (broken) throw new Error('blocked'); if (quota && !k.includes('__probe__')) throw new Error('QuotaExceeded'); store.set(k, String(v)); },
      removeItem: (k) => { if (broken) throw new Error('blocked'); store.delete(k); },
    },
  };
  return store;
}

async function freshStorage(opts) {
  const store = installLocalStorage(opts);
  const mod = await import('../js/storage.js?' + Math.random());
  return { mod, store };
}

console.log('storage.js');
{
  let { mod, store } = await freshStorage();
  test('read de chave ausente devolve fallback', () => assert.deepEqual(mod.read('x', []), []));
  test('write/read faz ida e volta', () => {
    assert.equal(mod.write('k', [{ a: 1 }]), true);
    assert.deepEqual(mod.read('k', []), [{ a: 1 }]);
  });
  test('JSON corrompido devolve fallback sem lançar erro', () => {
    store.set('bad', '{nao-e-json');
    assert.deepEqual(mod.read('bad', ['f']), ['f']);
  });
  test('tipo incompatível (objeto onde se espera array) devolve fallback', () => {
    store.set('t', JSON.stringify({ a: 1 }));
    assert.deepEqual(mod.read('t', []), []);
  });
  test('valor "null" salvo onde se espera array devolve fallback', () => {
    store.set('n', 'null');
    assert.deepEqual(mod.read('n', []), []);
  });
  test('write de valor não serializável retorna false', () => {
    const circ = {}; circ.self = circ;
    assert.equal(mod.write('c', circ), false);
  });
  test('remove apaga somente a chave pedida', () => {
    mod.write('a', [1]); mod.write('b', [2]); mod.remove('a');
    assert.deepEqual(mod.read('a', []), []); assert.deepEqual(mod.read('b', []), [2]);
  });
  test('isPersistent true com armazenamento normal', () => assert.equal(mod.isPersistent(), true));
  test('KEYS tem as quatro chaves versionadas do contrato', () => {
    assert.deepEqual(Object.values(mod.KEYS), [
      'meuestudo:v1:horarios', 'meuestudo:v1:agenda', 'meuestudo:v1:notas', 'meuestudo:v1:foco']);
  });
}
{
  const { mod } = await freshStorage({ broken: true });
  test('armazenamento bloqueado: usa memória e não quebra', () => {
    assert.equal(mod.isPersistent(), false);
    assert.equal(mod.write('m', [1, 2]), true);
    assert.deepEqual(mod.read('m', []), [1, 2]);
  });
}
{
  const { mod } = await freshStorage({ quota: true });
  test('cota cheia: write retorna false, app segue e valor fica em memória', () => {
    assert.equal(mod.write('q', [9]), false);
    assert.deepEqual(mod.read('q', []), [9]);
  });
}

console.log('ui.js (seletores do painel)');
{
  const ui = await import('../js/ui.js');
  const seg = new Date(2026, 10, 9);   // segunda-feira 09/11/2026
  const lessons = [
    { id: '1', weekday: 1, subject: 'Português', startTime: '09:00', endTime: '09:50' },
    { id: '2', weekday: 1, subject: 'Matemática', startTime: '07:30', endTime: '08:20' },
    { id: '3', weekday: 2, subject: 'Biologia', startTime: '07:30', endTime: '08:20' },
    { id: '4', weekday: 1, subject: '   ', startTime: '10:00', endTime: '10:50' },
    null,
  ];
  test('aulas do dia: filtra por dia da semana e ordena por horário', () => {
    assert.deepEqual(ui.selectTodayLessons(lessons, seg).map((l) => l.id), ['2', '1']);
  });
  test('aulas do dia: entrada inválida devolve lista vazia', () => {
    assert.deepEqual(ui.selectTodayLessons(null, seg), []);
    assert.deepEqual(ui.selectTodayLessons({ a: 1 }, seg), []);
  });
  const today = '2026-11-12';
  const items = [
    { id: 'a', title: 'Prova de Química', date: '2026-11-20', status: 'pendente' },
    { id: 'b', title: 'Trabalho de História', date: '2026-11-12', time: '14:00', status: 'pendente' },
    { id: 'c', title: 'Trabalho de História (manhã)', date: '2026-11-12', time: '08:00', status: 'pendente' },
    { id: 'd', title: 'Já feito', date: '2026-11-13', status: 'concluida' },
    { id: 'e', title: 'Atrasado', date: '2026-11-01', status: 'pendente' },
    { id: 'f', title: 'Sem data válida', date: '31/12/2026', status: 'pendente' },
    { id: 'g', title: 'Sem horário', date: '2026-11-12', status: 'pendente' },
  ];
  test('próximos: só pendentes de hoje em diante, ordenados por data e hora', () => {
    assert.deepEqual(ui.selectUpcoming(items, today).map((i) => i.id), ['c', 'b', 'g', 'a']);
  });
  test('próximos: respeita o limite', () => assert.equal(ui.selectUpcoming(items, today, 2).length, 2));
  test('pendentes atrasados são contados (para convite neutro a reagendar)', () => {
    assert.equal(ui.countPendingPast(items, today), 1);
  });
  test('isDone: valor do contrato (concluida) e variações toleradas', () => {
    for (const s of ['concluida', 'CONCLUIDA', 'concluída', 'done', 'completed']) assert.equal(ui.isDone({ status: s }), true);
    for (const s of ['pendente', 'pending', '', undefined]) assert.equal(ui.isDone({ status: s }), false);
  });
  test('todayISO usa data local no formato YYYY-MM-DD', () => assert.equal(ui.todayISO(new Date(2026, 10, 9)), '2026-11-09'));
  test('parseISODate rejeita datas inexistentes', () => {
    assert.equal(ui.parseISODate('2026-02-30'), null);
    assert.ok(ui.parseISODate('2026-02-28'));
  });
  test('relativeDayLabel: Hoje / Amanhã / data curta', () => {
    assert.equal(ui.relativeDayLabel('2026-11-12', today), 'Hoje');
    assert.equal(ui.relativeDayLabel('2026-11-13', today), 'Amanhã');
    assert.equal(ui.relativeDayLabel('2026-11-20', today), 'Sex, 20/11');
  });
  test('escapeHTML neutraliza marcação', () => {
    assert.equal(ui.escapeHTML('<img src=x onerror="a()">'), '&lt;img src=x onerror=&quot;a()&quot;&gt;');
  });
  test('normalizeTime valida HH:MM', () => {
    assert.equal(ui.normalizeTime('7:05'), '07:05'); assert.equal(ui.normalizeTime('25:00'), ''); assert.equal(ui.normalizeTime(''), '');
  });
  test('greeting muda conforme a hora', () => {
    assert.equal(ui.greeting(new Date(2026, 10, 9, 8)), 'Bom dia');
    assert.equal(ui.greeting(new Date(2026, 10, 9, 15)), 'Boa tarde');
    assert.equal(ui.greeting(new Date(2026, 10, 9, 20)), 'Boa noite');
  });
}

console.log(`\n${passed} testes passaram.`);
