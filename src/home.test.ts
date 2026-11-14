import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { startHome } from './home';
import { startRouter } from './main';

let root: HTMLElement;
let stopRouter: () => void = () => {};
const go = (hash: string) => {
  location.hash = hash;
  window.dispatchEvent(new HashChangeEvent('hashchange'));
};
const cards = () => [...root.querySelectorAll<HTMLAnchorElement>('a.game-card')];
const click = (sel: string) => root.querySelector(sel)!.dispatchEvent(new MouseEvent('click', { bubbles: true }));

beforeEach(() => {
  vi.useFakeTimers();
  localStorage.clear();
  history.replaceState(null, '', '#/');
  root = document.createElement('div');
  document.body.append(root);
});

afterEach(() => {
  stopRouter();
  vi.useRealTimers();
  root.remove();
});

test('the home screen shows one card per game', () => {
  startHome(root, [
    { id: 'setas', name: 'Setas' },
    { id: 'esteira', name: 'Esteira de Cores' },
  ]);
  expect(cards().map((a) => [a.getAttribute('href'), a.querySelector('h2')!.textContent])).toEqual([
    ['#/setas', 'Setas'],
    ['#/esteira', 'Esteira de Cores'],
  ]);
});

test.each(['', '#/', '#/x'])('hash "%s" shows the home screen', (hash) => {
  history.replaceState(null, '', hash || location.pathname);
  stopRouter = startRouter(root);
  expect(cards()).toHaveLength(2);
});

test('#/setas shows the arrow game and #/esteira the new one', () => {
  stopRouter = startRouter(root);
  go('#/setas');
  expect(root.querySelector('[data-role="level"]')).not.toBeNull();
  expect(root.querySelector('.esteira')).toBeNull();
  go('#/esteira');
  expect(root.querySelector('.esteira')).not.toBeNull();
});

test('going back to #/ shows home again', () => {
  stopRouter = startRouter(root);
  go('#/setas');
  go('#/');
  expect(cards()).toHaveLength(2);
});

test.each(['#/setas', '#/esteira'])('Início in %s goes home', (hash) => {
  stopRouter = startRouter(root);
  go(hash);
  click('[data-action="home"]');
  expect(location.hash).toBe('#/');
});

test('leaving Esteira stops its belt', () => {
  stopRouter = startRouter(root);
  go('#/esteira');
  click('[data-column="0"]');
  go('#/');
  expect(() => vi.advanceTimersByTime(10_000)).not.toThrow();
  expect(vi.getTimerCount()).toBe(0);
});
