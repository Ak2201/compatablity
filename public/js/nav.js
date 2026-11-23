// Screen history for the header Back button. Each screen calls navSet(key, render) when it opens, using a
// fixed name for the screen (so re-renders of the same screen do not add history). navRoot starts a fresh
// history at a root screen (sign-in, home). navBack returns to the previous screen without adding history.
let stack = [];
let current = null;
let restoring = false;
let refresher = () => {};

export function onNavChange(fn) { refresher = fn; refresh(); }

function refresh() {
  try { refresher(stack.length > 0); } catch { /* header not ready yet */ }
}

export function navSet(key, render) {
  if (restoring) {
    restoring = false;
    current = { key, render };
    refresh();
    return;
  }
  if (current && current.key !== key) stack.push(current);
  current = { key, render };
  refresh();
}

export function navRoot(key, render) {
  restoring = false;
  stack = [];
  current = { key, render };
  refresh();
}

export function navBack() {
  const prev = stack.pop();
  if (!prev) return;
  restoring = true;
  try {
    prev.render();
  } finally {
    restoring = false;
    current = prev;
    refresh();
  }
}
