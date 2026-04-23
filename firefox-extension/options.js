'use strict';

const STORAGE_KEYS = [
  'supabaseUrl',
  'supabaseAnonKey',
  'scraperSecret',
  'pollMinutes',
  'activeHoursStart',
  'activeHoursEnd',
  'enabled',
];

const form = document.getElementById('settings');
const statusEl = document.getElementById('status');
const stateEl = document.getElementById('state');
const runNowBtn = document.getElementById('run-now');

const setStatus = (message, isError = false) => {
  statusEl.textContent = message;
  statusEl.style.color = isError ? '#d33' : '';
  if (message) {
    setTimeout(() => {
      if (statusEl.textContent === message) statusEl.textContent = '';
    }, 4000);
  }
};

const loadSettings = async () => {
  const stored = await browser.storage.local.get(STORAGE_KEYS);
  for (const key of STORAGE_KEYS) {
    const input = form.elements[key];
    if (!input) continue;
    const value = stored[key];
    if (value === undefined) continue;
    if (input.type === 'checkbox') {
      input.checked = Boolean(value);
    } else {
      input.value = value ?? '';
    }
  }
};

const refreshStateDisplay = async () => {
  try {
    const response = await browser.runtime.sendMessage({ type: 'get-state' });
    if (!response) {
      stateEl.textContent = '(no response from background script)';
      return;
    }
    const { state, settings } = response;
    const shown = {
      enabled: settings.enabled,
      pollMinutes: settings.pollMinutes,
      activeHoursStart: settings.activeHoursStart,
      activeHoursEnd: settings.activeHoursEnd,
      lastRunAt: state.lastRunAt,
      consecutiveFailures: state.consecutiveFailures,
      lastRunSummary: state.lastRunSummary,
      stuckNotifiedAt: state.stuckNotifiedAt,
    };
    stateEl.textContent = JSON.stringify(shown, null, 2);
  } catch (err) {
    stateEl.textContent = `(error: ${err.message})`;
  }
};

form.addEventListener('submit', async (event) => {
  event.preventDefault();
  const patch = {};
  for (const key of STORAGE_KEYS) {
    const input = form.elements[key];
    if (!input) continue;
    if (input.type === 'checkbox') {
      patch[key] = input.checked;
    } else if (input.type === 'number') {
      const n = Number(input.value);
      patch[key] = Number.isFinite(n) ? n : 0;
    } else {
      patch[key] = input.value.trim();
    }
  }
  try {
    await browser.storage.local.set(patch);
    setStatus('Saved.');
    await refreshStateDisplay();
  } catch (err) {
    setStatus(`Save failed: ${err.message}`, true);
  }
});

runNowBtn.addEventListener('click', async () => {
  setStatus('Triggering run…');
  try {
    await browser.runtime.sendMessage({ type: 'run-now' });
    setStatus('Run triggered — refresh in a few seconds to see updated state.');
    setTimeout(refreshStateDisplay, 1500);
  } catch (err) {
    setStatus(`Run failed: ${err.message}`, true);
  }
});

(async () => {
  await loadSettings();
  await refreshStateDisplay();
  setInterval(refreshStateDisplay, 5000);
})();
