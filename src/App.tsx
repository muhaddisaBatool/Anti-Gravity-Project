import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ArrowDown,
  ArrowLeft,
  ArrowRight,
  ArrowUp,
  RotateCcw,
  Undo2,
  Volume2,
  VolumeX,
} from 'lucide-react';
import { GameBoard } from './components/GameBoard';
import { ScoreBox } from './components/ScoreBox';
import type {
  Direction,
  GameStatus,
  GridSize,
  HistorySnapshot,
  PersistedGameState,
  ScoreDelta,
  TileData,
} from './types/game';
import {
  canMove,
  createInitialTiles,
  getHighestTile,
  getTileClasses,
  moveTiles,
  sanitizeTilesForSnapshot,
  syncTileIdCounter,
} from './utils/gameLogic';
import {
  playGameOverSound,
  playMergeSound,
  playSlideSound,
  playWinSound,
} from './utils/sound';

const STORAGE_KEY = 'tactile_2048_state_v1';
const MAX_HISTORY = 15;
const GRID_SIZES: GridSize[] = [3, 4, 5];
const PROGRESSION_VALUES = [2, 4, 8, 16, 32, 64, 128, 256, 512, 1024, 2048];

function loadSavedState(): PersistedGameState {
  const defaultBest: Record<GridSize, number> = { 3: 0, 4: 0, 5: 0 };

  if (typeof window !== 'undefined') {
    try {
      const raw = window.localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as Partial<PersistedGameState>;
        const gridSize: GridSize =
          parsed.gridSize === 3 || parsed.gridSize === 4 || parsed.gridSize === 5
            ? parsed.gridSize
            : 4;
        const tiles = Array.isArray(parsed.tiles) && parsed.tiles.length > 0
          ? sanitizeTilesForSnapshot(parsed.tiles)
          : createInitialTiles(gridSize);

        syncTileIdCounter(tiles);
        if (Array.isArray(parsed.history)) {
          parsed.history.forEach((snap) => syncTileIdCounter(snap.tiles ?? []));
        }

        const status: GameStatus =
          parsed.status === 'WON_PROMPT' || parsed.status === 'GAME_OVER'
            ? parsed.status
            : canMove(tiles, gridSize)
              ? 'PLAYING'
              : 'GAME_OVER';

        return {
          gridSize,
          tiles,
          score: typeof parsed.score === 'number' ? parsed.score : 0,
          moves: typeof parsed.moves === 'number' ? parsed.moves : 0,
          hasWon: Boolean(parsed.hasWon),
          status,
          bestScores: {
            3: parsed.bestScores?.[3] ?? 0,
            4: parsed.bestScores?.[4] ?? 0,
            5: parsed.bestScores?.[5] ?? 0,
          },
          soundEnabled: parsed.soundEnabled !== undefined ? Boolean(parsed.soundEnabled) : true,
          history: Array.isArray(parsed.history) ? parsed.history.slice(-MAX_HISTORY) : [],
        };
      }
    } catch {
      // Fall back to fresh state if storage is corrupted
    }
  }

  return {
    gridSize: 4,
    tiles: createInitialTiles(4),
    score: 0,
    moves: 0,
    hasWon: false,
    status: 'PLAYING',
    bestScores: defaultBest,
    soundEnabled: true,
    history: [],
  };
}

export default function App() {
  const [initialState] = useState<PersistedGameState>(() => loadSavedState());

  const [gridSize, setGridSize] = useState<GridSize>(initialState.gridSize);
  const [tiles, setTiles] = useState<TileData[]>(initialState.tiles);
  const [score, setScore] = useState<number>(initialState.score);
  const [moves, setMoves] = useState<number>(initialState.moves);
  const [hasWon, setHasWon] = useState<boolean>(initialState.hasWon);
  const [status, setStatus] = useState<GameStatus>(initialState.status);
  const [bestScores, setBestScores] = useState<Record<GridSize, number>>(initialState.bestScores);
  const [soundEnabled, setSoundEnabled] = useState<boolean>(initialState.soundEnabled);
  const [history, setHistory] = useState<HistorySnapshot[]>(initialState.history);
  const [scoreDeltas, setScoreDeltas] = useState<ScoreDelta[]>([]);

  const cleanupTimerRef = useRef<number | null>(null);
  const deltaIdRef = useRef(1);

  const clearCleanupTimer = useCallback(() => {
    if (cleanupTimerRef.current !== null) {
      window.clearTimeout(cleanupTimerRef.current);
      cleanupTimerRef.current = null;
    }
  }, []);

  // Persist current board state cleanly (without transient animation flags)
  useEffect(() => {
    try {
      const payload: PersistedGameState = {
        gridSize,
        tiles: sanitizeTilesForSnapshot(tiles),
        score,
        moves,
        hasWon,
        status,
        bestScores,
        soundEnabled,
        history,
      };
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
    } catch {
      // Ignore storage quota errors
    }
  }, [gridSize, tiles, score, moves, hasWon, status, bestScores, soundEnabled, history]);

  useEffect(() => {
    return () => clearCleanupTimer();
  }, [clearCleanupTimer]);

  const scheduleTileCleanup = useCallback(() => {
    clearCleanupTimer();
    cleanupTimerRef.current = window.setTimeout(() => {
      setTiles((prev) => prev.filter((tile) => !tile.mergingOut));
      cleanupTimerRef.current = null;
    }, 145);
  }, [clearCleanupTimer]);

  const triggerScoreDelta = useCallback((amount: number) => {
    if (amount <= 0) return;
    const id = deltaIdRef.current++;
    setScoreDeltas((prev) => [...prev.slice(-4), { id, amount }]);
    window.setTimeout(() => {
      setScoreDeltas((prev) => prev.filter((item) => item.id !== id));
    }, 700);
  }, []);

  const handleMove = useCallback(
    (direction: Direction) => {
      if (status !== 'PLAYING') return;

      const result = moveTiles(tiles, direction, gridSize);
      if (!result.moved) return;

      const snapshot: HistorySnapshot = {
        tiles: sanitizeTilesForSnapshot(tiles),
        score,
        moves,
        hasWon,
      };

      const nextScore = score + result.scoreDelta;
      const nextMoves = moves + 1;

      setHistory((prev) => [...prev.slice(-(MAX_HISTORY - 1)), snapshot]);
      setTiles(result.nextTiles);
      setScore(nextScore);
      setMoves(nextMoves);

      if (nextScore > bestScores[gridSize]) {
        setBestScores((prev) => ({ ...prev, [gridSize]: nextScore }));
      }

      if (result.scoreDelta > 0) {
        triggerScoreDelta(result.scoreDelta);
      }

      const newlyWon = result.reachedTarget && !hasWon;
      const noMovesRemaining = !canMove(result.nextTiles, gridSize);

      if (newlyWon) {
        setHasWon(true);
        setStatus('WON_PROMPT');
        if (soundEnabled) playWinSound();
      } else if (noMovesRemaining) {
        setStatus('GAME_OVER');
        if (soundEnabled) playGameOverSound();
      } else if (soundEnabled) {
        if (result.mergedMaxValue > 0) {
          playMergeSound(result.mergedMaxValue);
        } else {
          playSlideSound();
        }
      }

      scheduleTileCleanup();
    },
    [
      status,
      tiles,
      gridSize,
      score,
      moves,
      hasWon,
      bestScores,
      soundEnabled,
      triggerScoreDelta,
      scheduleTileCleanup,
    ]
  );

  const handleRestart = useCallback(
    (targetSize: GridSize = gridSize) => {
      clearCleanupTimer();
      setGridSize(targetSize);
      setTiles(createInitialTiles(targetSize));
      setScore(0);
      setMoves(0);
      setHasWon(false);
      setStatus('PLAYING');
      setHistory([]);
      setScoreDeltas([]);
    },
    [gridSize, clearCleanupTimer]
  );

  const handleUndo = useCallback(() => {
    if (history.length === 0) return;
    clearCleanupTimer();
    const last = history[history.length - 1];
    setHistory((prev) => prev.slice(0, -1));
    setTiles(last.tiles);
    setScore(last.score);
    setMoves(last.moves);
    setHasWon(last.hasWon);
    setStatus('PLAYING');
    if (soundEnabled) playSlideSound();
  }, [history, clearCleanupTimer, soundEnabled]);

  const handleContinuePlaying = useCallback(() => {
    setStatus('PLAYING');
  }, []);

  // Global keyboard shortcuts
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA')) return;

      switch (e.key) {
        case 'ArrowUp':
        case 'w':
        case 'W':
          e.preventDefault();
          handleMove('up');
          break;
        case 'ArrowDown':
        case 's':
        case 'S':
          e.preventDefault();
          handleMove('down');
          break;
        case 'ArrowLeft':
        case 'a':
        case 'A':
          e.preventDefault();
          handleMove('left');
          break;
        case 'ArrowRight':
        case 'd':
        case 'D':
          e.preventDefault();
          handleMove('right');
          break;
        case 'z':
        case 'Z':
        case 'u':
        case 'U':
          e.preventDefault();
          handleUndo();
          break;
        case 'r':
        case 'R':
          if (!e.metaKey && !e.ctrlKey) {
            e.preventDefault();
            handleRestart(gridSize);
          }
          break;
      }
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [handleMove, handleUndo, handleRestart, gridSize]);

  const highestTile = getHighestTile(tiles);
  const targetRatio = Math.min(100, Math.round((Math.log2(Math.max(highestTile, 2)) / 11) * 100));

  return (
    <div className="min-h-screen bg-[#F3F4F7] text-[#181C24] flex flex-col">
      <main className="flex-1 w-full max-w-5xl mx-auto px-4 sm:px-8 py-6 sm:py-10 flex flex-col justify-center">
        <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,480px)_minmax(0,320px)] gap-8 lg:gap-12 items-start justify-center mx-auto w-full">
          {/* Primary Game Arena */}
          <section aria-label="2048 Game Board" className="w-full max-w-[480px] mx-auto lg:mx-0">
            {/* Header Row: Wordmark + Score Counters */}
            <header className="flex items-center justify-between gap-4 mb-5">
              <div>
                <h1 className="font-display text-4xl sm:text-5xl font-extrabold tracking-tight text-slate-900 leading-none">
                  2048
                </h1>
                <p className="text-xs sm:text-sm text-slate-500 mt-1.5">
                  Merge matching tiles to reach 2048
                </p>
              </div>

              <div className="flex items-center gap-2.5 shrink-0">
                <ScoreBox label="Score" value={score} deltas={scoreDeltas} highlight />
                <ScoreBox label="Best" value={bestScores[gridSize]} />
              </div>
            </header>

            {/* Control Bar */}
            <div className="flex items-center justify-between gap-3 mb-4">
              {/* Segmented Grid Size Selector */}
              <div
                className="inline-flex items-center p-1 bg-slate-200/80 rounded-lg"
                role="group"
                aria-label="Board size"
              >
                {GRID_SIZES.map((size) => (
                  <button
                    key={size}
                    type="button"
                    onClick={() => {
                      if (size !== gridSize) handleRestart(size);
                    }}
                    className={`px-2.5 py-1.5 text-xs font-semibold rounded-md transition-colors duration-150 whitespace-nowrap shrink-0 cursor-pointer focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-slate-900 ${
                      gridSize === size
                        ? 'bg-white text-slate-900 shadow-xs'
                        : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    {size}×{size}
                  </button>
                ))}
              </div>

              {/* Action Buttons */}
              <div className="flex items-center gap-2 shrink-0">
                <button
                  type="button"
                  onClick={handleUndo}
                  disabled={history.length === 0}
                  aria-label={`Undo last move (${history.length} available)`}
                  title="Undo (Z)"
                  className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-white border border-slate-200/90 text-xs font-semibold text-slate-700 hover:bg-slate-50 hover:text-slate-900 disabled:opacity-40 disabled:pointer-events-none transition-colors duration-150 whitespace-nowrap shrink-0 cursor-pointer focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-slate-900"
                >
                  <Undo2 className="w-3.5 h-3.5" aria-hidden="true" />
                  <span>Undo</span>
                </button>

                <button
                  type="button"
                  onClick={() => setSoundEnabled((prev) => !prev)}
                  aria-label={soundEnabled ? 'Mute sound effects' : 'Enable sound effects'}
                  title={soundEnabled ? 'Sound On' : 'Sound Off'}
                  className="inline-flex items-center justify-center w-9 h-9 rounded-lg bg-white border border-slate-200/90 text-slate-700 hover:bg-slate-50 hover:text-slate-900 transition-colors duration-150 shrink-0 cursor-pointer focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-slate-900"
                >
                  {soundEnabled ? (
                    <Volume2 className="w-4 h-4" aria-hidden="true" />
                  ) : (
                    <VolumeX className="w-4 h-4 text-slate-400" aria-hidden="true" />
                  )}
                </button>

                <button
                  type="button"
                  onClick={() => handleRestart(gridSize)}
                  className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-[#C2410C] hover:bg-[#9A3412] text-white text-xs font-semibold transition-colors duration-150 whitespace-nowrap shrink-0 cursor-pointer shadow-xs focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#C2410C]"
                >
                  <RotateCcw className="w-3.5 h-3.5" aria-hidden="true" />
                  <span>New Game</span>
                </button>
              </div>
            </div>

            {/* Interactive 2048 Board */}
            <GameBoard
              gridSize={gridSize}
              tiles={tiles}
              status={status}
              score={score}
              canUndo={history.length > 0}
              onMove={handleMove}
              onContinuePlaying={handleContinuePlaying}
              onRestart={() => handleRestart(gridSize)}
              onUndo={handleUndo}
            />

            <p className="text-xs text-slate-500 mt-3.5 text-center sm:text-left">
              Swipe on the board or use Arrow keys / WASD · Press Z to undo · R to restart
            </p>
          </section>

          {/* Companion Panel: Session Progress, Tactile Controls & Tile Scale */}
          <aside
            aria-label="Game Details and Controls"
            className="w-full max-w-[480px] mx-auto lg:mx-0 lg:pt-2 flex flex-col gap-7"
          >
            {/* Clean Unboxed Session Stats */}
            <div className="border-b border-slate-200 pb-6">
              <h2 className="font-display text-sm font-bold text-slate-900 mb-4">
                Current Session
              </h2>

              <div className="grid grid-cols-3 gap-4 mb-5">
                <div>
                  <div className="text-xs text-slate-500 mb-0.5">Moves</div>
                  <div className="font-mono tabular-nums text-xl font-bold text-slate-900">
                    {moves.toLocaleString()}
                  </div>
                </div>
                <div>
                  <div className="text-xs text-slate-500 mb-0.5">Peak Tile</div>
                  <div className="font-mono tabular-nums text-xl font-bold text-slate-900">
                    {highestTile}
                  </div>
                </div>
                <div>
                  <div className="text-xs text-slate-500 mb-0.5">Undos Left</div>
                  <div className="font-mono tabular-nums text-xl font-bold text-slate-900">
                    {history.length}
                  </div>
                </div>
              </div>

              <div>
                <div className="flex items-center justify-between text-xs mb-2">
                  <span className="text-slate-500 font-medium">Goal Progress</span>
                  <span className="font-mono tabular-nums font-semibold text-slate-700">
                    {Math.min(highestTile, 2048)} / 2048 ({targetRatio}%)
                  </span>
                </div>
                <div
                  className="w-full h-2 rounded-full bg-slate-200 overflow-hidden"
                  role="progressbar"
                  aria-valuenow={targetRatio}
                  aria-valuemin={0}
                  aria-valuemax={100}
                  aria-label="Progress toward 2048 tile"
                >
                  <div
                    className="h-full bg-[#C2410C] transition-transform duration-200 origin-left"
                    style={{ transform: `scaleX(${targetRatio / 100})` }}
                  />
                </div>
              </div>
            </div>

            {/* Tactile On-Screen Directional Pad (Desktop & Accessibility) */}
            <div className="border-b border-slate-200 pb-6">
              <div className="flex items-center justify-between mb-3">
                <h2 className="font-display text-sm font-bold text-slate-900">
                  Directional Controls
                </h2>
                <span className="text-xs text-slate-500">Click or tap to slide</span>
              </div>

              <div className="grid grid-cols-3 gap-2 w-40 mx-auto lg:mx-0">
                <div />
                <button
                  type="button"
                  onClick={() => handleMove('up')}
                  disabled={status !== 'PLAYING'}
                  aria-label="Slide tiles up"
                  className="h-11 rounded-lg bg-white border border-slate-200/90 hover:bg-slate-50 active:translate-y-px flex items-center justify-center text-slate-700 disabled:opacity-40 transition-all duration-100 cursor-pointer shadow-2xs focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-slate-900"
                >
                  <ArrowUp className="w-4 h-4" aria-hidden="true" />
                </button>
                <div />

                <button
                  type="button"
                  onClick={() => handleMove('left')}
                  disabled={status !== 'PLAYING'}
                  aria-label="Slide tiles left"
                  className="h-11 rounded-lg bg-white border border-slate-200/90 hover:bg-slate-50 active:translate-y-px flex items-center justify-center text-slate-700 disabled:opacity-40 transition-all duration-100 cursor-pointer shadow-2xs focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-slate-900"
                >
                  <ArrowLeft className="w-4 h-4" aria-hidden="true" />
                </button>
                <button
                  type="button"
                  onClick={() => handleMove('down')}
                  disabled={status !== 'PLAYING'}
                  aria-label="Slide tiles down"
                  className="h-11 rounded-lg bg-white border border-slate-200/90 hover:bg-slate-50 active:translate-y-px flex items-center justify-center text-slate-700 disabled:opacity-40 transition-all duration-100 cursor-pointer shadow-2xs focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-slate-900"
                >
                  <ArrowDown className="w-4 h-4" aria-hidden="true" />
                </button>
                <button
                  type="button"
                  onClick={() => handleMove('right')}
                  disabled={status !== 'PLAYING'}
                  aria-label="Slide tiles right"
                  className="h-11 rounded-lg bg-white border border-slate-200/90 hover:bg-slate-50 active:translate-y-px flex items-center justify-center text-slate-700 disabled:opacity-40 transition-all duration-100 cursor-pointer shadow-2xs focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-slate-900"
                >
                  <ArrowRight className="w-4 h-4" aria-hidden="true" />
                </button>
              </div>
            </div>

            {/* Tile Progression Scale */}
            <div>
              <h2 className="font-display text-sm font-bold text-slate-900 mb-3">
                Tile Progression
              </h2>
              <div className="grid grid-cols-4 sm:grid-cols-6 lg:grid-cols-4 gap-2">
                {PROGRESSION_VALUES.map((val) => {
                  const unlocked = highestTile >= val;
                  return (
                    <div
                      key={val}
                      className={`h-10 rounded-lg font-display font-bold text-xs tabular-nums flex items-center justify-center transition-opacity duration-200 ${getTileClasses(val)} ${
                        unlocked ? 'opacity-100' : 'opacity-45'
                      }`}
                    >
                      {val}
                    </div>
                  );
                })}
              </div>
            </div>
          </aside>
        </div>
      </main>
    </div>
  );
}
