import { LIVES, newGame, tap, type Game } from './game';
import { generate } from './generate';
import { LEVELS } from './levels';
import { mountBoard, type BoardView } from './render';
import { freeArrows } from './solve';
import './style.css';

const PROGRESS_KEY = 'arrow.progress';

/** Number of levels cleared so far; 0 when storage is empty or unavailable. */
function loadProgress(): number {
  try {
    const n = Number(localStorage.getItem(PROGRESS_KEY));
    return Number.isInteger(n) && n > 0 ? n : 0;
  } catch {
    return 0;
  }
}

function saveProgress(n: number): void {
  try {
    localStorage.setItem(PROGRESS_KEY, String(n));
  } catch {
    // Progress is a convenience; the game works without it.
  }
}

const STATUS: Record<Game['status'], string> = { playing: '', won: 'Cleared!', lost: 'Out of lives' };

export function startApp(root: HTMLElement): void {
  root.innerHTML = `
    <header class="hud">
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
    </footer>`;
  const svg = root.querySelector('svg')!;
  const role = (r: string) => root.querySelector<HTMLElement>(`[data-role="${r}"]`)!;
  const nextButton = root.querySelector<HTMLButtonElement>('[data-action="next"]')!;

  let progress = loadProgress();
  let index = Math.min(progress, LEVELS.length - 1);
  let game: Game;
  let view: BoardView;
  let busy = false;
  let loads = 0;

  const update = () => {
    role('level').textContent = LEVELS[index].name;
    role('lives').textContent = '♥'.repeat(game.lives) + '♡'.repeat(Math.max(0, LIVES - game.lives));
    role('moves').textContent = String(game.moves);
    role('status').textContent = STATUS[game.status];
    root.dataset.status = game.status;
    nextButton.disabled = index >= LEVELS.length - 1 || (game.status !== 'won' && index >= progress);
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
    if (game.status === 'won' && index + 1 > progress) {
      progress = index + 1;
      saveProgress(progress);
    }
    update();
  };

  const load = (i: number) => {
    index = i;
    busy = false;
    loads++;
    const board = generate(LEVELS[i].mask, LEVELS[i].seed);
    game = newGame(board);
    view = mountBoard(svg, board, onTap);
    update();
  };

  root.addEventListener('click', (e) => {
    const action = (e.target as Element).closest('[data-action]')?.getAttribute('data-action');
    if (action === 'restart') load(index);
    if (action === 'hint' && game.status === 'playing') {
      const [id] = freeArrows(game.board);
      if (id !== undefined) view.highlight(id);
    }
    if (action === 'next' && !nextButton.disabled) load(index + 1);
  });

  load(index);
}

const mount = document.getElementById('app');
if (mount) startApp(mount);
