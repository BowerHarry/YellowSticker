'use strict';

const enabledLine = document.getElementById('enabled-line');
const lastRunEl = document.getElementById('last-run');
const failuresEl = document.getElementById('failures');
const summaryEl = document.getElementById('summary');

const refresh = async () => {
  try {
    const { state, settings } = await browser.runtime.sendMessage({ type: 'get-state' });
    const dotClass = settings.enabled
      ? state.consecutiveFailures > 0
        ? 'warn'
        : 'on'
      : 'off';
    const label = settings.enabled
      ? state.consecutiveFailures > 0
        ? 'Enabled (recent cycle blocked)'
        : 'Enabled'
      : 'Disabled';
    enabledLine.textContent = '';
    const dotEl = document.createElement('span');
    dotEl.className = `dot ${dotClass}`;
    enabledLine.appendChild(dotEl);
    enabledLine.appendChild(document.createTextNode(label));
    lastRunEl.textContent = `Last run: ${state.lastRunAt ?? 'never'}`;
    failuresEl.textContent = `Consecutive blocked cycles: ${state.consecutiveFailures ?? 0}`;
    summaryEl.textContent = state.lastRunSummary
      ? JSON.stringify(state.lastRunSummary, null, 2)
      : '';
  } catch (err) {
    enabledLine.textContent = `Error: ${err.message}`;
  }
};

document.getElementById('run').addEventListener('click', async () => {
  await browser.runtime.sendMessage({ type: 'run-now' });
  setTimeout(refresh, 1500);
});

document.getElementById('options').addEventListener('click', () => {
  browser.runtime.openOptionsPage();
  window.close();
});

refresh();
setInterval(refresh, 3000);
