
import React from 'react';
import { Deck } from '../types';

interface ManaCurveProps {
  deck: Deck;
}

export const ManaCurve: React.FC<ManaCurveProps> = ({ deck }) => {
  const curve = Array(8).fill(0); // 0, 1, 2, 3, 4, 5, 6, 7+
  
  deck.mainboard.forEach(item => {
    // Lands typically have cmc 0 but aren't counted in traditional "mana curves" 
    // unless they are spells. Let's filter non-spell 0-drops if they are lands.
    const isLand = item.card.type_line?.toLowerCase().includes('land');
    if (isLand) return;

    const cmc = item.card.cmc ?? 0;
    const index = Math.min(Math.floor(cmc), 7);
    curve[index] += item.count;
  });

  const maxCount = Math.max(...curve, 1);

  return (
    <div className="w-full bg-black/40 rounded-xl p-3 border border-gray-800/50 shadow-inner">
      <div className="flex justify-between items-center mb-3">
        <span className="text-[9px] uppercase tracking-widest font-bold text-gray-500">Mana Distribution</span>
        <span className="text-[9px] font-mono text-amber-500/70">Spell Count: {curve.reduce((a, b) => a + b, 0)}</span>
      </div>
      <div className="flex items-end justify-between h-20 gap-1 px-1">
        {curve.map((count, idx) => {
          const height = (count / maxCount) * 100;
          return (
            <div key={idx} className="flex-1 flex flex-col items-center gap-2 group">
              <div className="w-full relative flex flex-col justify-end h-full">
                {/* Bar */}
                <div 
                  className="w-full bg-gradient-to-t from-amber-900/40 to-amber-500/60 rounded-t-sm transition-all duration-500 group-hover:from-amber-800 group-hover:to-amber-400 relative overflow-hidden"
                  style={{ height: `${height}%` }}
                >
                  {/* Subtle shine on bar */}
                  <div className="absolute inset-0 bg-white/5 opacity-0 group-hover:opacity-100 transition-opacity"></div>
                </div>
                {/* Count tooltip on hover */}
                <div className="absolute -top-5 left-1/2 -translate-x-1/2 opacity-0 group-hover:opacity-100 transition-opacity text-[8px] font-bold text-amber-400 whitespace-nowrap bg-black/80 px-1 rounded">
                  {count}
                </div>
              </div>
              {/* Label */}
              <span className="text-[8px] font-bold text-gray-600 group-hover:text-amber-500/80 transition-colors">
                {idx === 7 ? '7+' : idx}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
};
