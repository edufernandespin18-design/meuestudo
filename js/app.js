/* =========================================================
   MeuEstudo — app.js
   Casca da aplicação: roteamento por hash, carregador de módulos
   (contrato mount/destroy), painel inicial e registro do PWA.

   Contrato de módulo (ver README):
     export function mount(container, services) { ...; return destroy }
   services = {
     storage: { read, write, remove, isPersistent, KEYS },
     ui:      (utilitários de js/ui.js),
     navigate(route),
     route:   'horarios' | 'agenda' | 'notas' | 'foco'
   }
   ========================================================= */

import * as storage from './storage.js';
import * as ui from './ui.js';

const ROUTES = {
  inicio:   { title: 'Início' },
  horarios: { title: 'Horários', module: './modules/horarios-agenda.js' },
  agenda:   { title: 'Agenda',   module: './modules/horarios-agenda.js' },
  notas:    { title: 'Notas',    module: './modules/notas.js' },
  foco:     { title: 'Foco',     module: './modules/foco.js' },
};
const DEFAULT_ROUTE = 'inicio';

const container = document.getElementById('app');
const navLinks = Array.from(document.querySelectorAll('.bottom-nav__link'));

let currentDestroy = null;
let renderToken = 0;

const services = {
  storage: {
    read: storage.read,
    write: storage.write,
    remove: storage.remove,
    isPersistent: storage.isPersistent,
    KEYS: storage.KEYS,
  },
  ui,
  navigate,
};

/* ---------- Roteamento ---------- */

function currentRoute() {
  const name = location.hash.replace(/^#\/?/, '').split(/[?/]/)[0];
  return Object.prototype.hasOwnProperty.call(ROUTES, name) ? name : DEFAULT_ROUTE;
}

export function navigate(route) {
  const target = Object.prototype.hasOwnProperty.call(ROUTES, route) ? route : DEFAULT_ROUTE;
  if (location.hash === `#/${target}`) {
    render();
  } else {
    location.hash = `#/${target}`;
  }
}

function teardown() {
  if (typeof currentDestroy === 'function') {
    try {
      currentDestroy();
    } catch (err) {
      console.error('Erro ao encerrar módulo:', err);
    }
  }
  currentDestroy = null;
}

function updateNav(route) {
  navLinks.forEach((link) => {
    if (link.dataset.route === route) link.setAttribute('aria-current', 'page');
    else link.removeAttribute('aria-current');
  });
  document.title = route === DEFAULT_ROUTE ? 'MeuEstudo' : `${ROUTES[route].title} · MeuEstudo`;
}

function showPlaceholder(route) {
  container.innerHTML = `
    <h1 tabindex="-1" id="screen-title">${ui.escapeHTML(ROUTES[route].title)}</h1>
    <div class="empty">
      <p><strong>Esta tela ainda está sendo preparada.</strong></p>
      <p>Você pode continuar usando as outras áreas do MeuEstudo normalmente.</p>
      <p><a class="btn btn--secondary" href="#/inicio">Voltar ao início</a></p>
    </div>`;
}

function showModuleError(route) {
  container.innerHTML = `
    <h1 tabindex="-1" id="screen-title">${ui.escapeHTML(ROUTES[route].title)}</h1>
    <div class="notice notice--error" role="alert">
      <p><strong>Não foi possível abrir esta tela.</strong></p>
      <p>Seus dados continuam salvos. Tente abrir de novo; se persistir, volte ao início.</p>
      <p><button type="button" class="btn btn--small" id="retry-btn">Tentar de novo</button></p>
    </div>`;
  document.getElementById('retry-btn')?.addEventListener('click', () => render());
}

async function render() {
  const route = currentRoute();
  const token = ++renderToken;

  teardown();
  updateNav(route);
  container.innerHTML = '<p class="loading">Carregando…</p>';

  if (route === 'inicio') {
    renderHome();
    focusTitle();
    return;
  }

  const def = ROUTES[route];
  let mod;
  try {
    mod = await import(def.module);
  } catch (err) {
    if (token !== renderToken) return;
    // Módulo ainda não entregue (ou falha de rede/cache): tela neutra, app segue funcionando.
    console.warn(`Módulo "${route}" indisponível:`, err);
    showPlaceholder(route);
    focusTitle();
    return;
  }
  if (token !== renderToken) return; // usuário já navegou para outra tela

  if (typeof mod.mount !== 'function') {
    console.error(`Módulo "${route}" não exporta mount(container, services).`);
    showModuleError(route);
    focusTitle();
    return;
  }

  container.innerHTML = '';
  try {
    const destroy = mod.mount(container, { ...services, route });
    currentDestroy = typeof destroy === 'function' ? destroy : null;
  } catch (err) {
    console.error(`Erro ao montar "${route}":`, err);
    currentDestroy = null;
    showModuleError(route);
  }
  focusTitle();
}

function focusTitle() {
  const heading = container.querySelector('h1');
  if (heading) {
    heading.setAttribute('tabindex', '-1');
    heading.focus({ preventScroll: true });
  } else {
    container.focus({ preventScroll: true });
  }
  window.scrollTo(0, 0);
}

/* ---------- Painel inicial ---------- */

function renderHome() {
  const now = new Date();
  const today = ui.todayISO(now);

  const lessons = ui.selectTodayLessons(storage.read(storage.KEYS.horarios, []), now);
  const agenda = storage.read(storage.KEYS.agenda, []);
  const upcoming = ui.selectUpcoming(agenda, today, 5);
  const pastPending = ui.countPendingPast(agenda, today);

  const lessonsHTML = lessons.length
    ? `<ul class="list">${lessons.map((l) => `
        <li class="list__item">
          <span class="home__time">${ui.escapeHTML(ui.normalizeTime(l.startTime) || '--:--')}${l.endTime && ui.normalizeTime(l.endTime) ? `–${ui.escapeHTML(ui.normalizeTime(l.endTime))}` : ''}</span>
          <span class="list__main">
            <span class="list__title">${ui.escapeHTML(l.subject)}</span>
            ${l.room ? `<span class="list__meta"> · ${ui.escapeHTML(l.room)}</span>` : ''}
          </span>
        </li>`).join('')}</ul>`
    : `<div class="empty">
         <p>Você ainda não cadastrou aulas para hoje.</p>
         <p><a class="btn btn--secondary btn--small" href="#/horarios">Adicionar sua primeira aula</a></p>
       </div>`;

  const upcomingHTML = upcoming.length
    ? `<ul class="list">${upcoming.map((a) => `
        <li class="list__item">
          <span class="list__main">
            <span class="list__title">${ui.escapeHTML(a.title)}</span>
            <span class="list__meta">${ui.escapeHTML(ui.relativeDayLabel(a.date, today))}${ui.normalizeTime(a.time) ? ` · ${ui.escapeHTML(ui.normalizeTime(a.time))}` : ''}${a.subject ? ` · ${ui.escapeHTML(a.subject)}` : ''}</span>
          </span>
          <span class="badge badge--info">Pendente</span>
        </li>`).join('')}</ul>`
    : `<div class="empty">
         <p>Nenhum compromisso por vir.</p>
         <p><a class="btn btn--secondary btn--small" href="#/agenda">Adicionar um compromisso</a></p>
       </div>`;

  const pastHTML = pastPending > 0
    ? `<p class="notice notice--warn" style="margin-top:12px">
         Você tem ${pastPending} ${pastPending === 1 ? 'item pendente' : 'itens pendentes'} de datas anteriores.
         Quando quiser, <a href="#/agenda">reagende na Agenda</a>.
       </p>`
    : '';

  const storageNotice = storage.isPersistent()
    ? ''
    : `<p class="notice notice--warn">Seu navegador está bloqueando o armazenamento. Seus dados vão valer só até fechar esta aba. Saia do modo privado para salvar normalmente.</p>`;

  container.innerHTML = `
    <h1 class="home__greeting" id="screen-title" tabindex="-1">${ui.escapeHTML(ui.greeting(now))}!</h1>
    <p class="home__date">${ui.escapeHTML(ui.formatDateLong(now))}</p>
    ${storageNotice}

    <section class="card" aria-labelledby="home-today">
      <div class="home__section-head"><h2 id="home-today">Aulas de hoje</h2></div>
      ${lessonsHTML}
    </section>

    <section class="card" aria-labelledby="home-upcoming">
      <div class="home__section-head"><h2 id="home-upcoming">Próximos compromissos</h2></div>
      ${upcomingHTML}
      ${pastHTML}
    </section>

    <section class="card" aria-labelledby="home-shortcuts">
      <h2 id="home-shortcuts" class="card__title">Ir para</h2>
      <ul class="shortcuts">
        <li><a href="#/horarios">Horários</a></li>
        <li><a href="#/agenda">Agenda</a></li>
        <li><a href="#/notas">Notas</a></li>
        <li><a href="#/foco">Foco</a></li>
      </ul>
    </section>

    <section class="card home__help" aria-labelledby="home-help">
      <h2 id="home-help" class="card__title">Sobre seus dados e instalação</h2>
      <details>
        <summary>Onde meus dados ficam salvos?</summary>
        <p>No próprio aparelho, neste navegador. Não há cadastro, e nada é enviado para a internet.</p>
        <ul>
          <li>Os dados <strong>não passam</strong> para outro celular, computador ou navegador.</li>
          <li>Limpar os dados do site, ou usar aba privada, pode apagar o que você salvou.</li>
        </ul>
      </details>
      <details>
        <summary>Como instalar no celular?</summary>
        <p><strong>Android (Chrome):</strong></p>
        <ol>
          <li>Toque no menu ⋮ do navegador.</li>
          <li>Escolha “Instalar app” ou “Adicionar à tela inicial”.</li>
        </ol>
        <p><strong>iPhone (Safari):</strong></p>
        <ol>
          <li>Toque em Compartilhar.</li>
          <li>Escolha “Adicionar à Tela de Início”.</li>
        </ol>
        <p>Os passos podem variar conforme a versão do sistema e do navegador.</p>
      </details>
      <details>
        <summary>Funciona sem internet?</summary>
        <p>Depois do primeiro acesso, a estrutura do app abre sem internet. A primeira visita precisa de conexão.</p>
      </details>
    </section>`;
}

/* ---------- PWA: instalação e Service Worker ---------- */

let deferredInstall = null;
const installBtn = document.getElementById('btn-install');

window.addEventListener('beforeinstallprompt', (event) => {
  event.preventDefault();
  deferredInstall = event;
  if (installBtn) installBtn.hidden = false;
});

installBtn?.addEventListener('click', async () => {
  if (!deferredInstall) return;
  deferredInstall.prompt();
  try {
    await deferredInstall.userChoice;
  } catch (err) {
    console.warn('Instalação não concluída:', err);
  }
  deferredInstall = null;
  installBtn.hidden = true;
});

window.addEventListener('appinstalled', () => {
  deferredInstall = null;
  if (installBtn) installBtn.hidden = true;
  ui.toast('MeuEstudo instalado!');
});

function registerServiceWorker() {
  if (!('serviceWorker' in navigator)) return;
  const secure = location.protocol === 'https:' || location.hostname === 'localhost' || location.hostname === '127.0.0.1';
  if (!secure) return;
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./sw.js').catch((err) => {
      console.warn('Service Worker não registrado:', err);
    });
  });
}

/* ---------- Inicialização ---------- */

window.addEventListener('hashchange', render);

// Pede ao navegador para não descartar os dados locais sob pouco espaço (silencioso, opcional).
try {
  navigator.storage?.persist?.();
} catch (err) {
  /* sem problema: recurso opcional */
}

registerServiceWorker();
render();
