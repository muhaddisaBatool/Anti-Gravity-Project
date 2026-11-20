import { useRef } from 'react';
import { RotateCcw, Trophy, Undo2 } from 'lucide-react';
import type { Direction, GameStatus, GridSize, TileData } from '../types/game';
import { getTileClasses, getTileFontSizeClass } from '../utils/gameLogic';

interface GameBoardProps {
  gridSize: GridSize;
  tiles: TileData[];
  status: GameStatus;
  score: number;
  canUndo: boolean;
  onMove: (direction: Direction) => void;
  onContinuePlaying: () => void;
  onRestart: () => void;
  onUndo: () => void;
}

const SWIPE_THRESHOLD_PX = 24;

export function GameBoard({
  gridSize,
  tiles,
  status,
  score,
  canUndo,
  onMove,
  onContinuePlaying,
  onRestart,
  onUndo,
}: GameBoardProps) {
  const pointerStartRef = useRef<{ x: number; y: number; pointerId: number } | null>(null);
  const swipeHandledRef = useRef(false);

  const handlePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (status !== 'PLAYING') return;
    // Only primary mouse button or touch/pen
    if (e.pointerType === 'mouse' && e.button !== 0) return;

    pointerStartRef.current = {
      x: e.clientX,
      y: e.clientY,
      pointerId: e.pointerId,
    };
    swipeHandledRef.current = false;
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!pointerStartRef.current || swipeHandledRef.current) return;
    if (e.pointerId !== pointerStartRef.current.pointerId) return;

    const dx = e.clientX - pointerStartRef.current.x;
    const dy = e.clientY - pointerStartRef.current.y;
    const absX = Math.abs(dx);
    const absY = Math.abs(dy);

    if (Math.max(absX, absY) >= SWIPE_THRESHOLD_PX) {
      swipeHandledRef.current = true;
      if (absX > absY) {
        onMove(dx > 0 ? 'right' : 'left');
      } else {
        onMove(dy > 0 ? 'down' : 'up');
      }
      pointerStartRef.current = null;
    }
  };

  const handlePointerUpOrCancel = (e: React.PointerEvent<HTMLDivElement>) => {
    if (pointerStartRef.current && e.pointerId === pointerStartRef.current.pointerId) {
      pointerStartRef.current = null;
      swipeHandledRef.current = false;
    }
  };

  const totalCells = gridSize * gridSize;

  return (
    <div
      className="relative w-full aspect-square bg-[#CFD6E0] rounded-[20px] p-3 sm:p-3.5 shadow-[inset_0_2px_5px_rgba(15,23,42,0.08),0_12px_32px_-8px_rgba(15,23,42,0.12)] select-none touch-none"
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUpOrCancel}
      onPointerCancel={handlePointerUpOrCancel}
      role="application"
      aria-label={`${gridSize} by ${gridSize} 2048 game board`}
    >
      <div className="relative w-full h-full" data-board-size={gridSize}>
        {/* Static background cell slots */}
        <div className="board-bg-grid w-full h-full" aria-hidden="true">
          {Array.from({ length: totalCells }).map((_, idx) => (
            <div
              key={idx}
              className="rounded-[10px] bg-[#BCC4D0]/85 shadow-[inset_0_1px_2px_rgba(15,23,42,0.05)]"
            />
          ))}
        </div>

        {/* Animated active & merging-out tiles */}
        <div className="absolute inset-0 pointer-events-none">
          {tiles.map((tile) => {
            const tileColors = getTileClasses(tile.value);
            const fontSize = getTileFontSizeClass(tile.value, gridSize);
            const animClass = tile.justMerged
              ? 'animate-tile-merge'
              : tile.justSpawned
                ? 'animate-tile-spawn'
                : '';

            const zLayer = tile.mergingOut ? 'z-10' : tile.justMerged ? 'z-20' : 'z-[15]';

            return (
              <div
                key={tile.id}
                data-row={tile.row}
                data-col={tile.col}
                className={`tile-positioner ${zLayer}`}
              >
                <div
                  className={`w-full h-full rounded-[10px] flex items-center justify-center font-display font-bold tracking-tight tabular-nums select-none ${fontSize} ${tileColors} ${animClass}`}
                >
                  {tile.value}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Victory 2048 Prompt Overlay */}
      {status === 'WON_PROMPT' && (
        <div
          className="absolute inset-0 z-30 rounded-[20px] bg-slate-900/75 backdrop-blur-xs flex flex-col items-center justify-center p-6 text-center animate-overlay-enter"
          role="dialog"
          aria-modal="true"
          aria-labelledby="win-heading"
        >
          <div className="w-12 h-12 rounded-xl bg-amber-300 text-slate-950 flex items-center justify-center mb-4 shadow-md">
            <Trophy className="w-6 h-6" aria-hidden="true" />
          </div>
          <h2
            id="win-heading"
            className="font-display text-3xl font-extrabold text-white tracking-tight mb-2"
          >
            You reached 2048
          </h2>
          <p className="text-sm text-slate-200 max-w-xs mb-6 leading-relaxed">
            Score {score.toLocaleString()} points. Keep going to chase higher tiles or start a
            fresh board.
          </p>
          <div className="flex flex-wrap items-center justify-center gap-3">
            <button
              type="button"
              onClick={onContinuePlaying}
              className="px-5 py-2.5 rounded-lg bg-amber-300 hover:bg-amber-200 text-slate-950 text-sm font-semibold transition-colors duration-150 whitespace-nowrap shrink-0 cursor-pointer focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-amber-300"
            >
              Keep Playing
            </button>
            <button
              type="button"
              onClick={onRestart}
              className="px-5 py-2.5 rounded-lg bg-white/15 hover:bg-white/25 text-white text-sm font-semibold transition-colors duration-150 whitespace-nowrap shrink-0 cursor-pointer focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
            >
              Play Again
            </button>
          </div>
        </div>
      )}

      {/* Game Over Overlay */}
      {status === 'GAME_OVER' && (
        <div
          className="absolute inset-0 z-30 rounded-[20px] bg-[#F3F4F7]/88 backdrop-blur-xs flex flex-col items-center justify-center p-6 text-center animate-overlay-enter"
          role="dialog"
          aria-modal="true"
          aria-labelledby="gameover-heading"
        >
          <h2
            id="gameover-heading"
            className="font-display text-3xl font-extrabold text-slate-900 tracking-tight mb-2"
          >
            No moves left
          </h2>
          <p className="text-sm text-slate-600 max-w-xs mb-6 leading-relaxed">
            Final score{' '}
            <span className="font-mono tabular-nums font-bold text-slate-900">
              {score.toLocaleString()}
            </span>
            . Step back one move or reset the board.
          </p>
          <div className="flex flex-wrap items-center justify-center gap-3">
            {canUndo && (
              <button
                type="button"
                onClick={onUndo}
                className="inline-flex items-center gap-2 px-4 py-2.5 rounded-lg bg-white border border-slate-300 hover:bg-slate-50 text-slate-800 text-sm font-semibold transition-colors duration-150 whitespace-nowrap shrink-0 cursor-pointer focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-slate-900"
              >
                <Undo2 className="w-4 h-4" aria-hidden="true" />
                Undo Move
              </button>
            )}
            <button
              type="button"
              onClick={onRestart}
              className="inline-flex items-center gap-2 px-5 py-2.5 rounded-lg bg-[#C2410C] hover:bg-[#9A3412] text-white text-sm font-semibold transition-colors duration-150 whitespace-nowrap shrink-0 cursor-pointer focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#C2410C]"
            >
              <RotateCcw className="w-4 h-4" aria-hidden="true" />
              Play Again
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
