// Prevent the SPA from re-rendering while a Chinese/Japanese/Korean IME is composing text.
// app.js listens to bubbling `input` events and re-renders the whole page; without this
// capture-phase guard the composition candidate is destroyed after each pinyin keystroke.
const IME_INPUT_IDS = new Set(['filter-keyword']);

function isImeInput(target) {
  return target instanceof HTMLInputElement && IME_INPUT_IDS.has(target.id);
}

document.addEventListener('compositionstart', (event) => {
  if (!isImeInput(event.target)) return;
  event.target.dataset.imeComposing = '1';
}, true);

document.addEventListener('input', (event) => {
  if (!isImeInput(event.target)) return;
  if (event.isComposing || event.target.dataset.imeComposing === '1') {
    event.stopImmediatePropagation();
  }
}, true);

document.addEventListener('compositionend', (event) => {
  if (!isImeInput(event.target)) return;
  event.target.dataset.imeComposing = '0';
  // Browsers normally emit a final non-composing input event. If one is not emitted,
  // this fallback commits the finished text on the next task without interrupting IME.
  const input = event.target;
  const valueAtEnd = input.value;
  setTimeout(() => {
    if (!input.isConnected || input.value !== valueAtEnd) return;
    input.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: 'insertCompositionText', data: null }));
  }, 0);
}, true);
