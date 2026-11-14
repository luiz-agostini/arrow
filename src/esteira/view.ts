import { DARK_BG, fitContrast } from '../colors';
import { esteiraLevels, type EsteiraLevel, type Shooter } from './level';
import { BELT_CAPACITY, launch, lineAt, newGame, tick, type State } from './sim';

/** Belt speed: 30 steps per second. */
export const TICK_MS = 1000 / 30;
/** Size of one block in SVG units, and the belt's distance from the picture. */
const BLOCK = 12;
const BELT_GAP = 1.4;
const SHOWN_PER_COLUMN = 3;
const CLEARED_KEY = 'esteira.cleared';

const NS = 'http://www.w3.org/2000/svg';
const svgEl = <K extends keyof SVGElementTagNameMap>(tag: K, attrs: Record<string, string | number>) => {
  const node = document.createElementNS(NS, tag);
  for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, String(v));
  return node;
};

function loadCleared(): Set<string> {
  try {
    return new Set(JSON.parse(localStorage.getItem(CLEARED_KEY) ?? '[]') as string[]);
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

/** Where a shooter at belt position `step` sits, in blocks: just outside the side it faces from. */
function beltPoint(w: number, h: number, step: number): { x: number; y: number } {
  const { x, y, dx, dy } = lineAt(w, h, step);
  return { x: x + 0.5 - dx * BELT_GAP, y: y + 0.5 - dy * BELT_GAP };
}

/**
 * Esteira de Cores: tap the front shooter of a column, or a parked one, to send it round
 * the belt. Returns a function that stops the belt (call it when leaving the screen).
 */
export function startEsteira(root: HTMLElement, opts: { level?: EsteiraLevel; onHome?: () => void } = {}): () => void {
  const levels = opts.level ? [opts.level] : esteiraLevels();
  const cleared = loadCleared();
  let index = Math.max(0, levels.findIndex((l) => !cleared.has(l.name)));
  let state: State;
  let timer: ReturnType<typeof setInterval> | null = null;

  root.innerHTML = `
    <div class="esteira">
      <header class="hud">
        <button type="button" class="home-button" data-action="home">Início</button>
        <h1>Esteira de Cores</h1>
        <span class="level" data-role="level"></span>
        <span class="belt-count">Esteira <b data-role="belt"></b></span>
        <select data-role="picker" aria-label="Nível">${levels.map((l, i) => `<option value="${i}">${l.name}</option>`).join('')}</select>
      </header>
      <main class="stage">
        <svg class="board esteira-board" role="img" aria-label="tabuleiro"></svg>
        <p class="status" data-role="status" aria-live="polite"></p>
      </main>
      <div class="esteira-slots"></div>
      <div class="esteira-columns"></div>
      <footer class="controls">
        <button type="button" data-action="restart">Recomeçar</button>
      </footer>
    </div>`;
  const svg = root.querySelector<SVGSVGElement>('svg.esteira-board')!;
  const slotsEl = root.querySelector<HTMLElement>('.esteira-slots')!;
  const columnsEl = root.querySelector<HTMLElement>('.esteira-columns')!;
  const picker = root.querySelector<HTMLSelectElement>('[data-role="picker"]')!;
  const role = (r: string) => root.querySelector<HTMLElement>(`[data-role="${r}"]`)!;
  const colour = (s: Shooter) => fitContrast(state.level.palette[s.color] ?? '#ffffff', DARK_BG);
  const token = (s: Shooter) => `<span class="token" style="--token:${colour(s)}">${s.ammo}</span>`;
  let rects: (SVGRectElement | null)[] = [];
  let beltLayer: SVGGElement;

  const drawBoard = () => {
    const { width: w, height: h } = state.level;
    const pad = BELT_GAP + 1;
    svg.setAttribute('viewBox', [-pad * BLOCK, -pad * BLOCK, (w + 2 * pad) * BLOCK, (h + 2 * pad) * BLOCK].join(' '));
    svg.replaceChildren();
    svg.append(
      svgEl('rect', { class: 'backdrop', x: -pad * BLOCK, y: -pad * BLOCK, width: (w + 2 * pad) * BLOCK, height: (h + 2 * pad) * BLOCK, rx: BLOCK }),
      svgEl('rect', {
        class: 'track',
        x: (0.5 - BELT_GAP) * BLOCK,
        y: (0.5 - BELT_GAP) * BLOCK,
        width: (w - 1 + 2 * BELT_GAP) * BLOCK,
        height: (h - 1 + 2 * BELT_GAP) * BLOCK,
        rx: BLOCK,
      }),
    );
    rects = state.cells.map((c, i) => {
      if (c === null) return null;
      const r = svgEl('rect', {
        class: 'block',
        'data-x': i % w,
        'data-y': Math.floor(i / w),
        x: (i % w) * BLOCK + 0.5,
        y: Math.floor(i / w) * BLOCK + 0.5,
        width: BLOCK - 1,
        height: BLOCK - 1,
        rx: 2.5,
        fill: fitContrast(state.level.palette[c], DARK_BG),
      });
      svg.append(r);
      return r;
    });
    beltLayer = svgEl('g', { class: 'belt' });
    svg.append(beltLayer);
  };

  let shownQueues = '';
  const renderQueues = () => {
    slotsEl.innerHTML = state.slots
      .map((s, i) => `<button type="button" class="slot" data-slot="${i}" ${s ? '' : 'disabled'} aria-label="Vaga ${i + 1}">${s ? token(s) : ''}</button>`)
      .join('');
    columnsEl.innerHTML = state.columns
      .map(
        (c, i) =>
          `<button type="button" class="column" data-column="${i}" ${c.length ? '' : 'disabled'} aria-label="Coluna ${i + 1}">${c
            .slice(0, SHOWN_PER_COLUMN)
            .map(token)
            .join('')}</button>`,
      )
      .join('');
  };

  const update = () => {
    const { width: w, height: h } = state.level;
    state.cells.forEach((c, i) => {
      if (c === null && rects[i]) {
        rects[i]!.remove();
        rects[i] = null;
      }
    });
    beltLayer.replaceChildren(
      ...state.belt.map(({ shooter, step }) => {
        const p = beltPoint(w, h, step);
        const g = svgEl('g', { class: 'shooter', 'data-id': shooter.id, transform: `translate(${p.x * BLOCK} ${p.y * BLOCK})` });
        g.append(svgEl('circle', { r: BLOCK * 0.75, fill: colour(shooter) }));
        const label = svgEl('text', { 'text-anchor': 'middle', 'dominant-baseline': 'central', 'font-size': BLOCK * 0.8 });
        label.textContent = String(shooter.ammo);
        g.append(label);
        return g;
      }),
    );
    // Only rebuild the buttons when they change: replacing them every belt step would
    // swallow taps whose press and release straddle a rebuild.
    const queues = JSON.stringify([state.slots, state.columns.map((c) => c.slice(0, SHOWN_PER_COLUMN))]);
    if (queues !== shownQueues) {
      shownQueues = queues;
      renderQueues();
    }
    role('belt').textContent = `${state.belt.length}/${BELT_CAPACITY}`;
    role('status').textContent = state.status === 'won' ? 'Concluído!' : state.status === 'lost' ? 'Sem espaço' : '';
    root.dataset.status = state.status;
  };

  const stopTimer = () => {
    if (timer !== null) clearInterval(timer);
    timer = null;
  };

  const step = () => {
    const before = state.status;
    state = tick(state);
    if (state.status === 'won' && before === 'playing') {
      cleared.add(state.level.name);
      saveCleared(cleared);
    }
    if (state.status !== 'playing') stopTimer();
    update();
  };

  const load = (i: number) => {
    stopTimer();
    index = i;
    state = newGame(levels[index]);
    picker.value = String(index);
    role('level').textContent = levels[index].name;
    drawBoard();
    shownQueues = '';
    update();
    timer = setInterval(step, TICK_MS);
  };

  root.onclick = (e) => {
    const target = e.target as Element;
    const column = target.closest<HTMLElement>('[data-column]')?.dataset.column;
    const slot = target.closest<HTMLElement>('[data-slot]')?.dataset.slot;
    const action = target.closest('[data-action]')?.getAttribute('data-action');
    if (column !== undefined) state = launch(state, { column: Number(column) });
    if (slot !== undefined) state = launch(state, { slot: Number(slot) });
    if (column !== undefined || slot !== undefined) update();
    if (action === 'restart') load(index);
    if (action === 'home') opts.onHome?.();
  };
  picker.onchange = () => load(Number(picker.value));

  load(index);
  return stopTimer;
}
