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
  expect(($('[data-action="next"]') as HTMLButtonElement).disabled).toBe(true);
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

test('clearing the board wins, saves progress and unlocks the next level', async () => {
  startApp(root);
  for (const id of solve(level1)!) {
    tapArrow(id);
    await settle();
  }
  expect(text('status')).toBe('Cleared!');
  expect(localStorage.getItem('arrow.progress')).toBe('1');
  click('[data-action="next"]');
  expect(text('level')).toBe('Fish');
  expect(text('moves')).toBe('0');
});

test('saved progress resumes at the next unsolved level', () => {
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
