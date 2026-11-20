export type Direction = 'up' | 'down' | 'left' | 'right';

export type GridSize = 3 | 4 | 5;

export type GameStatus = 'PLAYING' | 'WON_PROMPT' | 'GAME_OVER';

export interface TileData {
  id: number;
  value: number;
  row: number;
  col: number;
  justSpawned?: boolean;
  justMerged?: boolean;
  mergingOut?: boolean;
}

export interface HistorySnapshot {
  tiles: TileData[];
  score: number;
  moves: number;
  hasWon: boolean;
}

export interface ScoreDelta {
  id: number;
  amount: number;
}

export interface PersistedGameState {
  gridSize: GridSize;
  tiles: TileData[];
  score: number;
  moves: number;
  hasWon: boolean;
  status: GameStatus;
  bestScores: Record<GridSize, number>;
  soundEnabled: boolean;
  history: HistorySnapshot[];
}
