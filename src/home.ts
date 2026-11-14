export type GameId = 'setas' | 'esteira';

const BLURBS: Record<GameId, string> = {
  setas: 'Tire as setas do tabuleiro, uma de cada vez, sem bater em outra.',
  esteira: 'Mande as cores para a esteira e limpe a imagem bloco por bloco.',
};

/** The first screen: one card per game, each a link to that game's route. */
export function startHome(root: HTMLElement, games: { id: GameId; name: string }[]): void {
  root.innerHTML = `
    <div class="home">
      <h1>Jogo da Lindinha</h1>
      <nav class="game-cards" aria-label="Jogos">${games
        .map((g) => `<a class="game-card" href="#/${g.id}"><h2>${g.name}</h2><p>${BLURBS[g.id]}</p></a>`)
        .join('')}</nav>
    </div>`;
}
