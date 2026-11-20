import type { ScoreDelta } from '../types/game';

interface ScoreBoxProps {
  label: string;
  value: number;
  deltas?: ScoreDelta[];
  highlight?: boolean;
}

export function ScoreBox({ label, value, deltas = [], highlight = false }: ScoreBoxProps) {
  return (
    <div
      className={`relative flex flex-col justify-center min-w-[92px] sm:min-w-[108px] px-3.5 py-2 rounded-xl border transition-colors duration-200 ${
        highlight
          ? 'bg-[#181C24] border-[#181C24] text-white'
          : 'bg-white border-slate-200/90 text-slate-900 shadow-[0_1px_2px_rgba(15,23,42,0.04)]'
      }`}
    >
      <span
        className={`text-xs font-medium leading-none mb-1 ${
          highlight ? 'text-slate-300' : 'text-slate-500'
        }`}
      >
        {label}
      </span>
      <span className="font-mono tabular-nums text-lg sm:text-xl font-bold leading-tight tracking-tight">
        {value.toLocaleString()}
      </span>

      {deltas.map((delta) => (
        <span
          key={delta.id}
          aria-hidden="true"
          className="pointer-events-none absolute -top-2 right-3 font-mono tabular-nums text-sm font-bold text-[#C2410C] animate-score-float"
        >
          +{delta.amount}
        </span>
      ))}
    </div>
  );
}
