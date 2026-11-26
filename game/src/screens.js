// Screen flow outside the cockpit: title and mission select, briefing, pause and the debrief.
// The DOM lives in index.html; this module only shows, hides and fills the panels.
import { MISSIONS } from './missions.js';

const BEST_KEY = 'halcyon-ridge-best';

function readBest() {
  try {
    return JSON.parse(localStorage.getItem(BEST_KEY) || '{}');
  } catch {
    return {};
  }
}

export function createScreens(onStart) {
  const $ = (id) => document.getElementById(id);
  const screens = { current: 'title', best: readBest() };
  const panels = ['title', 'brief', 'pause', 'result'];

  screens.show = (name) => {
    screens.current = name;
    for (const p of panels) $(`screen-${p}`).classList.toggle('hidden', p !== name);
  };

  function renderMissionList() {
    const list = $('mission-list');
    list.innerHTML = '';
    MISSIONS.forEach((m, i) => {
      const b = document.createElement('button');
      b.className = 'mission-card';
      const best = screens.best[m.id];
      b.innerHTML = `<span class="mc-key">${i + 1}</span><span class="mc-name">${m.name}</span>`
        + `<span class="mc-brief">${m.brief}</span>`
        + `<span class="mc-best">${best ? `BEST ${best}` : `FUEL ${Math.round(m.fuel * 100)}%`}</span>`;
      b.addEventListener('click', () => screens.brief(m));
      list.appendChild(b);
    });
  }

  /** Shows the briefing card for a mission; Enter or the button takes off. */
  screens.brief = (def) => {
    screens.pending = def;
    $('brief-name').textContent = def.name;
    $('brief-text').textContent = def.brief;
    $('brief-fuel').textContent = `${Math.round(def.fuel * 100)}%`;
    screens.show('brief');
  };

  screens.launch = () => {
    if (!screens.pending) return;
    screens.show('none');
    onStart(screens.pending);
  };

  /** Fills the debrief with the mission outcome and stores a new best score. */
  screens.result = (mission) => {
    const ok = mission.status === 'success';
    $('result-title').textContent = ok ? 'MISSION COMPLETE' : 'MISSION FAILED';
    $('result-title').className = ok ? 'ok' : 'bad';
    $('result-text').textContent = mission.resultText;
    $('result-score').textContent = ok ? `SCORE ${mission.score}` : '';
    if (ok && (screens.best[mission.def.id] ?? 0) < mission.score) {
      screens.best[mission.def.id] = mission.score;
      try {
        localStorage.setItem(BEST_KEY, JSON.stringify(screens.best));
      } catch {
        /* private mode: keep the best in memory only */
      }
      $('result-score').textContent += '  ·  NEW BEST';
    }
    renderMissionList();
    screens.show('result');
  };

  $('btn-launch').addEventListener('click', () => screens.launch());
  $('btn-back').addEventListener('click', () => screens.show('title'));
  $('btn-resume').addEventListener('click', () => screens.onResume?.());
  $('btn-quit').addEventListener('click', () => screens.onQuit?.());
  $('btn-retry').addEventListener('click', () => screens.onRetry?.());
  $('btn-menu').addEventListener('click', () => screens.onQuit?.());

  renderMissionList();
  return screens;
}
