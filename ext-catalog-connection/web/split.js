// SPDX-FileCopyrightText: 2026 Massimo Antonini
// SPDX-License-Identifier: MPL-2.0

/**
 * A column beside the rest of a page that the person widens by dragging its edge or with the keyboard
 * (EXT-026): the resizable pane of the UI kit of the platform, <mk-split-pane> (MK-105), where the shell
 * defines it. The shell defines the elements of the kit only for the frontends that run as modules, not
 * in the frame of an isolated one (mosaikit/mosaikit#173): there this module draws a handle of its own
 * that behaves the same way, keys and stored width included, until the frame has them too.
 */

/** The element of the kit. */
export const SPLIT_PANE = 'mk-split-pane';

/** The pixels a key moves the handle, and with Shift, as the kit does. */
const STEP = 16;
const LARGE_STEP = 64;

/** The styles of the column of the module, with the --mk-* tokens of the theme. */
export const SPLIT_STYLE = `
  .split { display: flex; min-width: 0; }
  .split > .split-pane { flex: none; min-width: 0; }
  .split > .split-rest { flex: 1; min-width: 0; }
  .split > .split-handle { flex: none; width: 6px; margin: 0 -3px; position: relative; z-index: 1; cursor: col-resize;
                           touch-action: none; background: linear-gradient(var(--mk-line), var(--mk-line)) center / 1px 100% no-repeat; }
  .split > .split-handle:hover, .split > .split-handle.dragging { background-color: var(--mk-accent-soft, var(--mk-surface)); }
  .split > .split-handle:focus-visible { outline: 2px solid var(--mk-focus); outline-offset: -2px; }
`;

/**
 * A pane and the rest of the page beside it.
 *
 * @param {HTMLElement} pane the column, such as the filters
 * @param {HTMLElement} rest what is beside it
 * @param {{ name: string, width: number, min: number, max: number, label: string }} options `name` keeps
 *     the width in the browser, shared with the pane of the kit of the same name
 * @returns {HTMLElement} the element to place in the page
 */
export function splitPane(pane, rest, options) {
  if (customElements.get(SPLIT_PANE)) {
    const split = document.createElement(SPLIT_PANE);
    split.setAttribute('name', options.name);
    split.setAttribute('width', String(options.width));
    split.setAttribute('min', String(options.min));
    split.setAttribute('max', String(options.max));
    split.setAttribute('label', options.label);
    pane.slot = 'pane';
    split.append(pane, rest);
    return split;
  }
  return ownSplit(pane, rest, options);
}

function ownSplit(pane, rest, { name, width, min, max, label }) {
  const split = document.createElement('div');
  split.className = 'split';
  const column = document.createElement('div');
  column.className = 'split-pane';
  column.append(pane);
  const handle = document.createElement('div');
  handle.className = 'split-handle';
  handle.setAttribute('role', 'separator');
  handle.setAttribute('aria-orientation', 'vertical');
  handle.setAttribute('aria-label', label);
  handle.setAttribute('aria-valuemin', String(min));
  handle.setAttribute('aria-valuemax', String(max));
  handle.tabIndex = 0;
  const others = document.createElement('div');
  others.className = 'split-rest';
  others.append(rest);
  split.append(column, handle, others);
  const clamp = (value) => Math.round(Math.min(Math.max(min, max), Math.max(min, value)));
  let current = clamp(stored(name) ?? width);
  const apply = () => {
    column.style.width = `${current}px`;
    handle.setAttribute('aria-valuenow', String(current));
  };
  const resize = (value) => {
    const next = clamp(value);
    if (next === current) {
      return;
    }
    current = next;
    apply();
    store(name, next);
    split.dispatchEvent(new CustomEvent('mk-pane-resize', { detail: { width: next }, bubbles: true, composed: true }));
  };
  handle.addEventListener('keydown', (event) => {
    const step = event.shiftKey ? LARGE_STEP : STEP;
    const next = {
      ArrowLeft: current - step,
      ArrowDown: current - step,
      ArrowRight: current + step,
      ArrowUp: current + step,
      Home: min,
      End: max,
    }[event.key];
    if (next !== undefined) {
      event.preventDefault();
      resize(next);
    }
  });
  handle.addEventListener('pointerdown', (event) => {
    event.preventDefault();
    handle.setPointerCapture?.(event.pointerId);
    handle.classList.add('dragging');
    const start = event.clientX;
    const from = current;
    const rtl = getComputedStyle(split).direction === 'rtl';
    const move = (moved) => resize(from + (moved.clientX - start) * (rtl ? -1 : 1));
    const stop = () => {
      handle.classList.remove('dragging');
      handle.removeEventListener('pointermove', move);
      handle.removeEventListener('pointerup', stop);
      handle.removeEventListener('pointercancel', stop);
    };
    handle.addEventListener('pointermove', move);
    handle.addEventListener('pointerup', stop);
    handle.addEventListener('pointercancel', stop);
  });
  apply();
  return split;
}

/** The key of the width of a pane in the storage of the browser, the one of the kit. */
function key(name) {
  return `mk.pane-width.${name}`;
}

function stored(name) {
  try {
    const value = Number(globalThis.localStorage?.getItem(key(name)));
    return Number.isFinite(value) && value > 0 ? value : undefined;
  } catch {
    return undefined;
  }
}

function store(name, width) {
  try {
    globalThis.localStorage?.setItem(key(name), String(width));
  } catch {
    // Not kept: the column opens with its default width next time.
  }
}
