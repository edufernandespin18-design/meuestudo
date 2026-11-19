/* =========================================================
   MeuEstudo — storage.js
   ÚNICA porta de acesso ao localStorage de todo o projeto.
   Nenhum outro arquivo deve usar localStorage diretamente.

   API:
     read(key, fallback)   -> valor salvo, ou fallback se ausente/inválido
     write(key, value)     -> true/false (nunca lança exceção)
     remove(key)           -> true/false
     isPersistent()        -> false se o navegador bloqueou o armazenamento
                              (nesse caso, os dados valem só até fechar a aba)
     lastError()           -> última falha registrada (ou null)

   Regras de robustez:
     - JSON inválido ou corrompido => devolve fallback (sem tela branca).
     - Se o fallback é array/objeto e o valor salvo tem outro tipo,
       o valor é considerado inválido e o fallback é devolvido.
     - Armazenamento indisponível (navegação privada, bloqueio, cota cheia)
       => usa memória temporária e sinaliza por isPersistent().
   Nunca usa localStorage.clear(): só mexe nas chaves "meuestudo:".
   ========================================================= */

export const KEYS = Object.freeze({
  horarios: 'meuestudo:v1:horarios',
  agenda: 'meuestudo:v1:agenda',
  notas: 'meuestudo:v1:notas',
  foco: 'meuestudo:v1:foco',
});

const memory = new Map();
let persistent = null;   // null = ainda não testado
let errorInfo = null;

function detectPersistence() {
  if (persistent !== null) return persistent;
  try {
    const probe = 'meuestudo:__probe__';
    window.localStorage.setItem(probe, '1');
    window.localStorage.removeItem(probe);
    persistent = true;
  } catch (err) {
    persistent = false;
    errorInfo = err;
  }
  return persistent;
}

function sameKind(value, fallback) {
  if (Array.isArray(fallback)) return Array.isArray(value);
  if (fallback !== null && typeof fallback === 'object') {
    return value !== null && typeof value === 'object' && !Array.isArray(value);
  }
  if (fallback === null || fallback === undefined) return true;
  return typeof value === typeof fallback;
}

export function isPersistent() {
  return detectPersistence();
}

export function lastError() {
  return errorInfo;
}

export function read(key, fallback = null) {
  try {
    const raw = detectPersistence() ? window.localStorage.getItem(key) : memory.get(key);
    if (raw === null || raw === undefined) return fallback;
    const parsed = JSON.parse(raw);
    return sameKind(parsed, fallback) ? parsed : fallback;
  } catch (err) {
    errorInfo = err;
    return fallback;
  }
}

export function write(key, value) {
  let serialized;
  try {
    serialized = JSON.stringify(value);
    if (serialized === undefined) throw new TypeError('Valor não serializável');
  } catch (err) {
    errorInfo = err;
    return false;
  }
  try {
    if (detectPersistence()) {
      window.localStorage.setItem(key, serialized);
    } else {
      memory.set(key, serialized);
    }
    return true;
  } catch (err) {
    // Cota cheia ou bloqueio súbito: mantém em memória para a sessão.
    errorInfo = err;
    memory.set(key, serialized);
    persistent = false;
    return false;
  }
}

export function remove(key) {
  try {
    memory.delete(key);
    if (detectPersistence()) window.localStorage.removeItem(key);
    return true;
  } catch (err) {
    errorInfo = err;
    return false;
  }
}
