import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { generate } from './generate';
import { LEVELS } from './levels';
import { startApp } from './main';
import { blockerOf, exitRay } from './model';
import { SPEED } from './render';
import { freeArrows, solve } from './solve';

const level1 = generate(LEVELS[0].mask, LEVELS[0].seed);
let root: HTMLElement;

const $ = (sel: string) => root.querySelector<HTMLElement>(sel)!;
const text = (role: string) => $(`[data-role="${role}"]`).textContent;
const click = (sel: string) => $(sel).dispatchEvent(new MouseEvent('click', { bubbles: true }));
const tapArrow = (id: number) => click(`path.hit[data-id="${id}"]`);
const settle = () => vi.runAllTimersAsync();

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['setTimeout', 'requestAnimationFrame', 'performance'] });
  localStorage.clear();
  root = document.createElement('div');
  document.body.append(root);
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  root.remove();
});

test('starts on the first level with full lives', () => {
  startApp(root);
  expect(text('level')).toBe('Heart');
  expect(text('lives')).toBe('♥♥♥');
  expect(text('moves')).toBe('0');
  expect(root.querySelectorAll('g.arrow')).toHaveLength(level1.arrows.length);
  expect(($('[data-action="next"]') as HTMLButtonElement).disabled).toBe(false);
});

test('taps during a slide are ignored', async () => {
  startApp(root);
  const [a, b] = freeArrows(level1);
  tapArrow(a);
  tapArrow(b);
  tapArrow(a);
  await settle();
  expect(text('moves')).toBe('1');
  expect(root.querySelectorAll('g.arrow')).toHaveLength(level1.arrows.length - 1);
});

test('a slide from before a restart does not unlock input on the new board', async () => {
  startApp(root);
  const ms = (id: number) => {
    const arrow = level1.arrows.find((x) => x.id === id)!;
    return ((exitRay(level1, arrow).length + arrow.cells.length + 1) / SPEED) * 1000;
  };
  const free = freeArrows(level1).sort((x, y) => ms(x) - ms(y));
  const short = free[0];
  const long = free[free.length - 1];
  const other = free[1];
  expect(ms(long)).toBeGreaterThan(ms(short) + 50);

  tapArrow(short);
  click('[data-action="restart"]');
  tapArrow(long);
  // The old slide ends while the new one is still running.
  await vi.advanceTimersByTimeAsync(ms(short) + 20);
  tapArrow(other);
  expect(text('moves')).toBe('1');
});

test('a blocked tap costs a life', async () => {
  startApp(root);
  const blocked = level1.arrows.find((a) => blockerOf(level1, a.id) !== null)!;
  tapArrow(blocked.id);
  expect(text('lives')).toBe('♥♥♡');
  expect(root.querySelector(`g.arrow[data-id="${blocked.id}"]`)!.classList.contains('blocked')).toBe(true);
});

test('hint highlights a free arrow', () => {
  startApp(root);
  click('[data-action="hint"]');
  const hinted = root.querySelectorAll('g.arrow.hint');
  expect(hinted).toHaveLength(1);
  expect(freeArrows(level1)).toContain(Number(hinted[0].getAttribute('data-id')));
});

test('clearing the board wins, saves it as cleared and moves on with Next', async () => {
  startApp(root);
  for (const id of solve(level1)!) {
    tapArrow(id);
    await settle();
  }
  expect(text('status')).toBe('Cleared!');
  expect(JSON.parse(localStorage.getItem('arrow.cleared')!)).toEqual(['Heart']);
  expect(root.querySelector('[data-level="0"]')!.classList.contains('cleared')).toBe(true);
  click('[data-action="next"]');
  expect(text('level')).toBe('Fish');
  expect(text('moves')).toBe('0');
});

test('progress saved by older versions resumes at the next unsolved level', () => {
  localStorage.setItem('arrow.progress', '2');
  startApp(root);
  expect(text('level')).toBe('Rocket');
});

test('losing all lives ends the game; restart resets it', async () => {
  startApp(root);
  const blocked = level1.arrows.find((a) => blockerOf(level1, a.id) !== null)!;
  for (let i = 0; i < 3; i++) tapArrow(blocked.id);
  expect(text('status')).toBe('Out of lives');
  click('[data-action="restart"]');
  expect(text('lives')).toBe('♥♥♥');
  expect(text('status')).toBe('');
  expect(root.querySelectorAll('g.arrow')).toHaveLength(level1.arrows.length);
});

test('works when storage throws', () => {
  vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
    throw new Error('blocked');
  });
  startApp(root);
  expect(text('level')).toBe('Heart');
});

const listed = () => [...root.querySelectorAll<HTMLButtonElement>('[data-level]')];

test('the level pane lists every level in order', () => {
  startApp(root);
  expect(listed().map((b) => b.textContent!.replace('✓', '').trim())).toEqual(LEVELS.map((l) => l.name));
  expect(listed()[0].getAttribute('aria-current')).toBe('true');
});

test('any level can be picked from the pane, without unlocking it first', () => {
  startApp(root);
  const last = LEVELS.length - 1;
  click(`[data-level="${last}"]`);
  expect(text('level')).toBe(LEVELS[last].name);
  expect(text('moves')).toBe('0');
  expect(listed()[last].getAttribute('aria-current')).toBe('true');
  expect(listed()[0].hasAttribute('aria-current')).toBe(false);
  expect(($('[data-action="next"]') as HTMLButtonElement).disabled).toBe(true);
});

test('starts at the first level not yet cleared and marks cleared ones', () => {
  localStorage.setItem('arrow.cleared', JSON.stringify(['Heart', 'Fish', 'Cat']));
  startApp(root);
  expect(text('level')).toBe('Rocket');
  expect(listed().filter((b) => b.classList.contains('cleared')).map((b) => b.dataset.level)).toEqual(['0', '1', '3']);
});

test('the Levels button opens the pane as a drawer and picking a level closes it', () => {
  startApp(root);
  click('[data-action="levels"]');
  expect(root.dataset.drawer).toBe('open');
  click('[data-level="2"]');
  expect(root.dataset.drawer).toBeUndefined();
  expect(text('level')).toBe(LEVELS[2].name);
});

test('tapping outside the open drawer closes it', () => {
  startApp(root);
  click('[data-action="levels"]');
  click('[data-role="level"]');
  expect(root.dataset.drawer).toBeUndefined();
  expect(text('level')).toBe('Heart');
});
