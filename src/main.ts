import { LIVES, newGame, tap, type Game } from './game';
import { generate } from './generate';
import { openEditor, decodeImage as decodeWithCanvas } from './editor';
import { LEVELS, type Level } from './levels';
import { mountBoard, type BoardView } from './render';
import type { Pixels } from './picture';
import { freeArrows } from './solve';
import './style.css';

const CLEARED_KEY = 'arrow.cleared';
/** Older versions stored how many levels had been cleared in order. */
const LEGACY_PROGRESS_KEY = 'arrow.progress';

/** Names of the built-in levels cleared so far; empty when storage is empty or unavailable. */
function loadCleared(): Set<string> {
  try {
    const saved = localStorage.getItem(CLEARED_KEY);
    if (saved) return new Set((JSON.parse(saved) as unknown[]).filter((n): n is string => typeof n === 'string'));
    const n = Number(localStorage.getItem(LEGACY_PROGRESS_KEY));
    return new Set(Number.isInteger(n) && n > 0 ? LEVELS.slice(0, n).map((l) => l.name) : []);
  } catch {
    return new Set();
  }
}

function saveCleared(cleared: Set<string>): void {
  try {
    localStorage.setItem(CLEARED_KEY, JSON.stringify([...cleared]));
  } catch {
    // Progress is a convenience; the game works without it.
  }
}

const STATUS: Record<Game['status'], string> = { playing: '', won: 'Cleared!', lost: 'Out of lives' };

export function startApp(root: HTMLElement, deps: { decodeImage?: (f: File) => Promise<Pixels> } = {}): void {
  const decode = deps.decodeImage ?? decodeWithCanvas;
  root.innerHTML = `
    <aside class="levels" aria-label="Levels">
      <h2>Levels</h2>
      <ol data-role="level-list"></ol>
    </aside>
    <div class="game">
      <header class="hud">
        <button type="button" class="levels-toggle" data-action="levels" aria-label="Show levels">☰ Levels</button>
        <h1>Arrow Escape</h1>
        <span class="level" data-role="level"></span>
        <span class="lives" data-role="lives" aria-label="lives"></span>
        <span class="moves">Moves <b data-role="moves"></b></span>
      </header>
      <main class="stage">
        <svg class="board" role="img" aria-label="puzzle board"></svg>
        <p class="status" data-role="status" aria-live="polite"></p>
      </main>
      <footer class="controls">
        <button type="button" data-action="restart">Restart</button>
        <button type="button" data-action="hint">Hint</button>
        <button type="button" data-action="next">Next level</button>
        <button type="button" data-action="picture">From picture</button>
        <input type="file" accept="image/*" data-role="picture-input" hidden />
      </footer>
    </div>
    <section class="editor" data-role="editor" hidden></section>`;
  const svg = root.querySelector('svg')!;
  const role = (r: string) => root.querySelector<HTMLElement>(`[data-role="${r}"]`)!;
  const nextButton = root.querySelector<HTMLButtonElement>('[data-action="next"]')!;

  const cleared = loadCleared();
  const list = role('level-list');
  const entries = LEVELS.map((l, i) => {
    const item = document.createElement('li');
    const button = document.createElement('button');
    button.type = 'button';
    button.dataset.level = String(i);
    button.textContent = l.name;
    const tick = document.createElement('span');
    tick.className = 'tick';
    tick.setAttribute('aria-label', 'cleared');
    tick.textContent = '✓';
    button.append(tick);
    item.append(button);
    list.append(item);
    return button;
  });

  // A built-in level has an index; a picture level has none and is never saved as cleared.
  let index: number | null = Math.max(0, LEVELS.findIndex((l) => !cleared.has(l.name)));
  let level: Level = LEVELS[index];
  let game: Game;
  let view: BoardView;
  let busy = false;
  let loads = 0;

  const update = () => {
    role('level').textContent = level.name;
    role('lives').textContent = '♥'.repeat(game.lives) + '♡'.repeat(Math.max(0, LIVES - game.lives));
    role('moves').textContent = String(game.moves);
    role('status').textContent = STATUS[game.status];
    root.dataset.status = game.status;
    nextButton.disabled = index === null || index >= LEVELS.length - 1;
    entries.forEach((button, i) => {
      button.classList.toggle('cleared', cleared.has(LEVELS[i].name));
      if (i === index) button.setAttribute('aria-current', 'true');
      else button.removeAttribute('aria-current');
    });
  };

  const onTap = (id: number) => {
    if (busy) return;
    const { game: next, result, blocker } = tap(game, id);
    game = next;
    if (result === 'blocked') view.flashBlocked(id, blocker!);
    if (result === 'removed') {
      busy = true;
      const token = loads;
      view.slideOut(id).then(() => {
        // A slide from a board that was since replaced must not unlock this one.
        if (token === loads) busy = false;
      });
    }
    if (game.status === 'won' && index !== null && !cleared.has(level.name)) {
      cleared.add(level.name);
      saveCleared(cleared);
    }
    update();
  };

  const load = (next: Level, i: number | null) => {
    level = next;
    index = i;
    busy = false;
    loads++;
    const board = generate(next.mask, next.seed);
    game = newGame(board);
    view = mountBoard(svg, board, onTap, next.palette);
    update();
  };

  const input = root.querySelector<HTMLInputElement>('[data-role="picture-input"]')!;
  input.addEventListener('change', async () => {
    const file = input.files?.[0];
    if (!file) return;
    input.value = '';
    let pixels: Pixels;
    try {
      pixels = await decode(file);
    } catch {
      role('status').textContent = "Couldn't read that picture";
      return;
    }
    openEditor(role('editor'), pixels, (picked) => load(picked, null));
  });

  root.addEventListener('click', (e) => {
    const picked = (e.target as Element).closest<HTMLElement>('[data-level]')?.dataset.level;
    if (picked !== undefined) {
      load(LEVELS[Number(picked)], Number(picked));
      delete root.dataset.drawer;
      return;
    }
    const action = (e.target as Element).closest('[data-action]')?.getAttribute('data-action');
    if (action === 'levels') {
      if (root.dataset.drawer) delete root.dataset.drawer;
      else root.dataset.drawer = 'open';
    } else if (root.dataset.drawer && !(e.target as Element).closest('.levels')) {
      // A tap outside the open drawer only closes it.
      delete root.dataset.drawer;
      return;
    }
    if (action === 'restart') load(level, index);
    if (action === 'picture') input.click();
    if (action === 'hint' && game.status === 'playing') {
      const [id] = freeArrows(game.board);
      if (id !== undefined) view.highlight(id);
    }
    if (action === 'next' && !nextButton.disabled && index !== null) load(LEVELS[index + 1], index + 1);
  });

  load(level, index);
}

const mount = document.getElementById('app');
if (mount) startApp(mount);
