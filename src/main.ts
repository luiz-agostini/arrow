import { LIVES, newGame, tap, type Game } from './game';
import { generate } from './generate';
import { openEditor, decodeImage as decodeWithCanvas } from './editor';
import { LEVELS, type Level } from './levels';
import { mountBoard, type BoardView } from './render';
import type { Pixels } from './picture';
import { freeArrows } from './solve';
import { startEsteira } from './esteira/view';
import { startHome, type GameId } from './home';
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

const STATUS: Record<Game['status'], string> = { playing: '', won: 'Concluído!', lost: 'Sem vidas' };

export function startApp(
  root: HTMLElement,
  deps: { decodeImage?: (f: File) => Promise<Pixels>; onHome?: () => void } = {},
): void {
  const decode = deps.decodeImage ?? decodeWithCanvas;
  root.innerHTML = `
    <aside class="levels" aria-label="Níveis">
      <h2>Níveis</h2>
      <ol data-role="level-list"></ol>
    </aside>
    <div class="game">
      <header class="hud">
        <button type="button" class="home-button" data-action="home">Início</button>
        <button type="button" class="levels-toggle" data-action="levels" aria-label="Mostrar níveis">☰ Níveis</button>
        <h1>Jogo da Lindinha</h1>
        <span class="level" data-role="level"></span>
        <span class="lives" data-role="lives" aria-label="vidas"></span>
        <span class="moves">Jogadas <b data-role="moves"></b></span>
      </header>
      <main class="stage">
        <svg class="board" role="img" aria-label="tabuleiro"></svg>
        <p class="status" data-role="status" aria-live="polite"></p>
        <div class="zoom-controls">
          <button type="button" data-action="zoom-in" aria-label="Aproximar">+</button>
          <button type="button" data-action="zoom-out" aria-label="Afastar">−</button>
          <button type="button" data-action="zoom-fit" aria-label="Ajustar ao tabuleiro">Ajustar</button>
        </div>
      </main>
      <footer class="controls">
        <button type="button" data-action="restart">Recomeçar</button>
        <button type="button" data-action="hint">Dica</button>
        <button type="button" data-action="next">Próximo nível</button>
        <button type="button" data-action="picture">Usar foto</button>
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
    tick.setAttribute('aria-label', 'concluído');
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

  // The game state changes at once; the slide is only animation, so play continues during it.
  const onTap = (id: number) => {
    const { game: next, result, blocker } = tap(game, id);
    game = next;
    if (result === 'blocked') view.flashBlocked(id, blocker!);
    if (result === 'removed') void view.slideOut(id);
    if (game.status === 'won' && index !== null && !cleared.has(level.name)) {
      cleared.add(level.name);
      saveCleared(cleared);
    }
    update();
  };

  const load = (next: Level, i: number | null) => {
    level = next;
    index = i;
    const board = generate(next.mask, next.seed);
    game = newGame(board);
    view = mountBoard(svg, board, onTap, { palette: next.palette, background: next.background });
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
      role('status').textContent = 'Não foi possível ler essa imagem';
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
    if (action === 'home') deps.onHome?.();
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
    // `view` is read at click time, so the buttons follow whichever board is mounted.
    if (action === 'zoom-in') view.zoom(1.5);
    if (action === 'zoom-out') view.zoom(1 / 1.5);
    if (action === 'zoom-fit') view.fit();
    if (action === 'hint' && game.status === 'playing') {
      const [id] = freeArrows(game.board);
      if (id !== undefined) view.highlight(id);
    }
    if (action === 'next' && !nextButton.disabled && index !== null) load(LEVELS[index + 1], index + 1);
  });

  load(level, index);
}

const GAMES: { id: GameId; name: string }[] = [
  { id: 'setas', name: 'Setas' },
  { id: 'esteira', name: 'Esteira de Cores' },
];

/**
 * Shows the screen for the address hash: `#/setas`, `#/esteira`, or home for anything
 * else. Each screen gets a fresh container, so its listeners leave with it; Esteira's
 * belt is stopped on the way out. Returns a function that stops routing.
 */
export function startRouter(root: HTMLElement): () => void {
  let leave = () => {};
  const goHome = () => {
    location.hash = '#/';
  };
  const show = () => {
    leave();
    leave = () => {};
    // The arrow board's touch loupe lives in <body>; don't let it outlive its screen.
    document.querySelectorAll('body > svg.magnifier').forEach((m) => m.remove());
    const id = location.hash.replace(/^#\/?/, '');
    const screen = document.createElement('div');
    screen.className = `screen screen-${GAMES.some((g) => g.id === id) ? id : 'home'}`;
    root.replaceChildren(screen);
    if (id === 'setas') startApp(screen, { onHome: goHome });
    else if (id === 'esteira') leave = startEsteira(screen, { onHome: goHome });
    else startHome(screen, GAMES);
  };
  window.addEventListener('hashchange', show);
  show();
  return () => {
    window.removeEventListener('hashchange', show);
    leave();
  };
}

const mount = document.getElementById('app');
if (mount) startRouter(mount);
