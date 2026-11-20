import type { Direction, GridSize, TileData } from '../types/game';

let nextTileId = 1;

export function syncTileIdCounter(tiles: TileData[]): void {
  const maxId = tiles.reduce((max, tile) => Math.max(max, tile.id), 0);
  if (maxId >= nextTileId) {
    nextTileId = maxId + 1;
  }
}

function allocateTileId(): number {
  const id = nextTileId;
  nextTileId += 1;
  return id;
}

export function getActiveTiles(tiles: TileData[]): TileData[] {
  return tiles.filter((tile) => !tile.mergingOut);
}

export function sanitizeTilesForSnapshot(tiles: TileData[]): TileData[] {
  return getActiveTiles(tiles).map(({ id, value, row, col }) => ({
    id,
    value,
    row,
    col,
  }));
}

export function spawnRandomTile(tiles: TileData[], size: GridSize): TileData | null {
  const active = getActiveTiles(tiles);
  const occupied = new Set(active.map((t) => `${t.row},${t.col}`));
  const emptyCells: Array<{ row: number; col: number }> = [];

  for (let r = 0; r < size; r++) {
    for (let c = 0; c < size; c++) {
      if (!occupied.has(`${r},${c}`)) {
        emptyCells.push({ row: r, col: c });
      }
    }
  }

  if (emptyCells.length === 0) return null;

  const chosen = emptyCells[Math.floor(Math.random() * emptyCells.length)];
  const value = Math.random() < 0.9 ? 2 : 4;

  return {
    id: allocateTileId(),
    value,
    row: chosen.row,
    col: chosen.col,
    justSpawned: true,
  };
}

export function createInitialTiles(size: GridSize): TileData[] {
  const tiles: TileData[] = [];
  const first = spawnRandomTile(tiles, size);
  if (first) tiles.push(first);
  const second = spawnRandomTile(tiles, size);
  if (second) tiles.push(second);
  return tiles;
}

export interface MoveResult {
  moved: boolean;
  nextTiles: TileData[];
  scoreDelta: number;
  mergedMaxValue: number;
  reachedTarget: boolean;
}

export function moveTiles(
  currentTiles: TileData[],
  direction: Direction,
  size: GridSize
): MoveResult {
  // Strip any leftover mergingOut ghosts and transient animation flags from active tiles
  const active = getActiveTiles(currentTiles).map((t) => ({
    id: t.id,
    value: t.value,
    row: t.row,
    col: t.col,
  }));

  // Build 2D lookup grid
  const grid: (TileData | null)[][] = Array.from({ length: size }, () =>
    Array.from({ length: size }, () => null)
  );

  for (const tile of active) {
    if (tile.row >= 0 && tile.row < size && tile.col >= 0 && tile.col < size) {
      grid[tile.row][tile.col] = tile;
    }
  }

  let moved = false;
  let scoreDelta = 0;
  let mergedMaxValue = 0;
  let reachedTarget = false;
  const nextTiles: TileData[] = [];

  const isHorizontal = direction === 'left' || direction === 'right';
  const isReverse = direction === 'right' || direction === 'down';

  for (let lineIdx = 0; lineIdx < size; lineIdx++) {
    // Extract tiles along the current row or column in traversal order
    const lineTiles: TileData[] = [];
    for (let step = 0; step < size; step++) {
      const idx = isReverse ? size - 1 - step : step;
      const r = isHorizontal ? lineIdx : idx;
      const c = isHorizontal ? idx : lineIdx;
      const cell = grid[r][c];
      if (cell) lineTiles.push(cell);
    }

    let targetStep = 0;
    let i = 0;

    while (i < lineTiles.length) {
      const first = lineTiles[i];
      const second = i + 1 < lineTiles.length ? lineTiles[i + 1] : null;
      const destIndex = isReverse ? size - 1 - targetStep : targetStep;
      const destRow = isHorizontal ? lineIdx : destIndex;
      const destCol = isHorizontal ? destIndex : lineIdx;

      if (second && first.value === second.value) {
        // Merge first and second into a brand new tile at destination
        const mergedValue = first.value * 2;
        scoreDelta += mergedValue;
        if (mergedValue > mergedMaxValue) mergedMaxValue = mergedValue;
        if (mergedValue === 2048) reachedTarget = true;

        moved = true;

        // Keep both original tiles sliding to destination underneath for 130ms
        nextTiles.push({
          ...first,
          row: destRow,
          col: destCol,
          mergingOut: true,
        });
        nextTiles.push({
          ...second,
          row: destRow,
          col: destCol,
          mergingOut: true,
        });

        // Add the newly forged merged tile on top
        nextTiles.push({
          id: allocateTileId(),
          value: mergedValue,
          row: destRow,
          col: destCol,
          justMerged: true,
        });

        i += 2;
      } else {
        // Slide single tile without merging
        if (first.row !== destRow || first.col !== destCol) {
          moved = true;
        }
        nextTiles.push({
          ...first,
          row: destRow,
          col: destCol,
        });
        i += 1;
      }

      targetStep += 1;
    }
  }

  if (!moved) {
    return {
      moved: false,
      nextTiles: currentTiles,
      scoreDelta: 0,
      mergedMaxValue: 0,
      reachedTarget: false,
    };
  }

  const spawned = spawnRandomTile(nextTiles, size);
  if (spawned) {
    nextTiles.push(spawned);
  }

  return {
    moved: true,
    nextTiles,
    scoreDelta,
    mergedMaxValue,
    reachedTarget,
  };
}

export function canMove(tiles: TileData[], size: GridSize): boolean {
  const active = getActiveTiles(tiles);
  if (active.length < size * size) return true;

  const grid: number[][] = Array.from({ length: size }, () =>
    Array.from({ length: size }, () => 0)
  );

  for (const tile of active) {
    grid[tile.row][tile.col] = tile.value;
  }

  for (let r = 0; r < size; r++) {
    for (let c = 0; c < size; c++) {
      const val = grid[r][c];
      if (val === 0) return true;
      if (r + 1 < size && grid[r + 1][c] === val) return true;
      if (c + 1 < size && grid[r][c + 1] === val) return true;
    }
  }

  return false;
}

export function getHighestTile(tiles: TileData[]): number {
  return getActiveTiles(tiles).reduce((max, tile) => Math.max(max, tile.value), 0);
}

export function getTileClasses(value: number): string {
  switch (value) {
    case 2:
      return 'bg-[#FFFFFF] text-[#1E293B] shadow-[0_2px_0_rgba(15,23,42,0.08),0_1px_3px_rgba(15,23,42,0.06)]';
    case 4:
      return 'bg-[#E4E9F0] text-[#1E293B] shadow-[0_2px_0_rgba(15,23,42,0.1),0_1px_3px_rgba(15,23,42,0.06)]';
    case 8:
      return 'bg-[#FDE047] text-[#1E293B] shadow-[0_2px_0_rgba(161,98,7,0.22),0_2px_6px_rgba(234,179,8,0.18)]';
    case 16:
      return 'bg-[#F59E0B] text-[#18181B] shadow-[0_2px_0_rgba(146,64,14,0.26),0_3px_8px_rgba(245,158,11,0.22)]';
    case 32:
      return 'bg-[#C2410C] text-white shadow-[0_2px_0_rgba(124,45,18,0.35),0_4px_10px_rgba(194,65,12,0.24)]';
    case 64:
      return 'bg-[#DC2626] text-white shadow-[0_2px_0_rgba(127,29,29,0.35),0_4px_12px_rgba(220,38,38,0.28)]';
    case 128:
      return 'bg-[#0F766E] text-white shadow-[0_2px_0_rgba(19,78,74,0.38),0_4px_14px_rgba(15,118,110,0.28)]';
    case 256:
      return 'bg-[#0369A1] text-white shadow-[0_2px_0_rgba(12,74,110,0.38),0_4px_14px_rgba(3,105,161,0.3)]';
    case 512:
      return 'bg-[#2563EB] text-white shadow-[0_2px_0_rgba(30,58,138,0.38),0_5px_16px_rgba(37,99,235,0.32)]';
    case 1024:
      return 'bg-[#4F46E5] text-white shadow-[0_2px_0_rgba(49,46,129,0.4),0_6px_18px_rgba(79,70,229,0.34)]';
    case 2048:
      return 'bg-[#181C24] text-[#FDE047] ring-2 ring-inset ring-amber-300/75 shadow-[0_3px_0_rgba(0,0,0,0.45),0_8px_24px_rgba(24,28,36,0.35)]';
    default:
      return 'bg-[#0F172A] text-[#34D399] ring-2 ring-inset ring-emerald-400/75 shadow-[0_3px_0_rgba(0,0,0,0.5),0_10px_26px_rgba(15,23,42,0.4)]';
  }
}

export function getTileFontSizeClass(value: number, size: GridSize): string {
  const digits = String(value).length;
  if (size === 3) {
    if (digits <= 2) return 'text-4xl sm:text-5xl';
    if (digits === 3) return 'text-3xl sm:text-4xl';
    return 'text-2xl sm:text-3xl';
  }
  if (size === 5) {
    if (digits <= 2) return 'text-2xl sm:text-3xl';
    if (digits === 3) return 'text-xl sm:text-2xl';
    if (digits === 4) return 'text-lg sm:text-xl';
    return 'text-base sm:text-lg';
  }
  // Standard 4x4
  if (digits <= 2) return 'text-3xl sm:text-[2.35rem]';
  if (digits === 3) return 'text-2xl sm:text-3xl';
  if (digits === 4) return 'text-xl sm:text-2xl';
  return 'text-lg sm:text-xl';
}
