
import React from 'react';

// Added React.FC typing to ManaIcon to resolve "Property 'key' does not exist" error on line 46
export const ManaIcon: React.FC<{ type: string, size?: number }> = ({ type, size = 20 }) => {
  const colors: Record<string, string> = {
    W: '#f8f6d8', // White
    U: '#0e68ab', // Blue
    B: '#150b00', // Black
    R: '#d3202a', // Red
    G: '#00733e', // Green
    C: '#969696', // Colorless
    X: '#969696', // Variable
  };

  const isNumeric = !isNaN(Number(type));
  const bgColor = colors[type] || '#969696';
  const textColor = (type === 'W' || type === 'C' || isNumeric || type === 'X') ? '#000' : '#fff';

  return (
    <div 
      className="rounded-full flex items-center justify-center border border-gray-950/20 font-bold shadow-sm shrink-0"
      style={{ 
        width: size, 
        height: size, 
        backgroundColor: bgColor,
        color: textColor,
        fontSize: size * 0.6,
        lineHeight: 1,
        fontFamily: 'Beleren Bold, sans-serif'
      }}
    >
      {type}
    </div>
  );
};

// Added React.FC typing for consistency across mana-related components
export const ManaCost: React.FC<{ cost?: string, size?: number }> = ({ cost, size = 16 }) => {
  if (!cost) return null;
  
  // Extract symbols inside curly braces, e.g., {3}{U}{B} -> ["3", "U", "B"]
  const symbols = cost.match(/\{(.+?)\}/g)?.map(s => s.slice(1, -1)) || [];
  
  return (
    <div className="flex gap-0.5 items-center flex-wrap">
      {symbols.map((symbol, idx) => (
        <ManaIcon key={idx} type={symbol} size={size} />
      ))}
    </div>
  );
};
