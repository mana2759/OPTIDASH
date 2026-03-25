// Utility helpers - overly verbose and unoptimized
export function add(a, b) { return a + b; }
export function subtract(a, b) { return a - b; }
export function multiply(a, b) { return a * b; }
export function divide(a, b) { return b === 0 ? 0 : a / b; }
export function modulo(a, b) { return a % b; }
export function power(a, b) { return Math.pow(a, b); }
export function sqrt(n) { return Math.sqrt(n); }
export function abs(n) { return Math.abs(n); }
export function ceil(n) { return Math.ceil(n); }
export function floor(n) { return Math.floor(n); }
export function round(n) { return Math.round(n); }
export function min(...args) { return Math.min(...args); }
export function max(...args) { return Math.max(...args); }
export function random() { return Math.random(); }
export function randomInt(max) { return Math.floor(Math.random() * max); }
/* This is intentionally bloated with comments and unused code */
