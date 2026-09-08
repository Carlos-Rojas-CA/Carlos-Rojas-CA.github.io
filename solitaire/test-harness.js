const results = [];
let currentSection = 'general';

export function section(name) {
  currentSection = name;
}

export function test(name, fn) {
  try {
    fn();
    results.push({ ok: true, section: currentSection, name });
  } catch (e) {
    results.push({ ok: false, section: currentSection, name, message: e.message });
  }
}

export function assert(cond, message = 'assertion failed') {
  if (!cond) throw new Error(message);
}

export function assertEqual(actual, expected, message = '') {
  const a = JSON.stringify(actual);
  const b = JSON.stringify(expected);
  if (a !== b) throw new Error(`${message} expected ${b}, got ${a}`);
}

export function summary() {
  return {
    results,
    pass: results.filter((r) => r.ok).length,
    fail: results.filter((r) => !r.ok).length,
  };
}

// Deterministic linear congruential generator so shuffles are reproducible in tests.
export function seededRng(seed) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}
