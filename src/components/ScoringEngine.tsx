"use client";

import { useState, useEffect } from "react";

const INITIAL_WEIGHTS = {
  kills: 30,
  tech: 25,
  hero: 20,
  troop: 15,
  modVehicle: 5,
  structure: 5
};

export default function ScoringEngine() {
  const [weights, setWeights] = useState(INITIAL_WEIGHTS);
  
  const total = Object.values(weights).reduce((a, b) => a + b, 0);

  const handleWeightChange = (key: keyof typeof INITIAL_WEIGHTS, value: number) => {
    const otherWeightsTotal = Object.entries(weights)
      .filter(([k]) => k !== key)
      .reduce((sum, [_, v]) => sum + v, 0);
    
    const maxAllowed = 100 - otherWeightsTotal;
    const cappedValue = Math.max(0, Math.min(value, maxAllowed));
    
    setWeights(prev => ({ ...prev, [key]: cappedValue }));
  };

  return (
    <div className="flex-col gap-4">
      <div style={{ backgroundColor: 'rgba(112, 0, 255, 0.05)', padding: '0.75rem', borderRadius: '4px', borderLeft: '3px solid var(--accent-purple)', marginBottom: '0.5rem' }}>
        <p style={{ fontSize: '0.8125rem', color: 'var(--text-muted)', lineHeight: '1.4', margin: 0 }}>
          <strong style={{ color: 'var(--accent-purple)' }}>RANKING LOGIC:</strong> This engine calculates a weighted score based on individual player stats. Adjust the sliders below to prioritize different combat aspects. The sum must equal 100% for calculation.
        </p>
      </div>

      <div className="flex-col gap-2">
        <div className="flex-row justify-between">
          <label className="cyber-label">Kills Weight</label>
          <span style={{ color: 'var(--accent-neon)', fontFamily: 'var(--font-mono)', fontSize: '0.8rem' }}>{weights.kills}%</span>
        </div>
        <input 
          type="range" 
          className="w-full" 
          value={weights.kills} 
          min="0" max="100"
          onChange={(e) => handleWeightChange('kills', parseInt(e.target.value))}
        />
      </div>

      <div className="flex-col gap-2">
        <div className="flex-row justify-between">
          <label className="cyber-label">Tech Power Weight</label>
          <span style={{ color: 'var(--accent-neon)', fontFamily: 'var(--font-mono)', fontSize: '0.8rem' }}>{weights.tech}%</span>
        </div>
        <input 
          type="range" 
          className="w-full" 
          value={weights.tech} 
          min="0" max="100"
          onChange={(e) => handleWeightChange('tech', parseInt(e.target.value))}
        />
      </div>

      <div className="flex-col gap-2">
        <div className="flex-row justify-between">
          <label className="cyber-label">Hero Power Weight</label>
          <span style={{ color: 'var(--accent-neon)', fontFamily: 'var(--font-mono)', fontSize: '0.8rem' }}>{weights.hero}%</span>
        </div>
        <input 
          type="range" 
          className="w-full" 
          value={weights.hero} 
          min="0" max="100"
          onChange={(e) => handleWeightChange('hero', parseInt(e.target.value))}
        />
      </div>

      <div className="flex-col gap-2">
        <div className="flex-row justify-between">
          <label className="cyber-label">Troop Power Weight</label>
          <span style={{ color: 'var(--accent-neon)', fontFamily: 'var(--font-mono)', fontSize: '0.8rem' }}>{weights.troop}%</span>
        </div>
        <input 
          type="range" 
          className="w-full" 
          value={weights.troop} 
          min="0" max="100"
          onChange={(e) => handleWeightChange('troop', parseInt(e.target.value))}
        />
      </div>

      <div className="flex-col gap-2">
        <div className="flex-row justify-between">
          <label className="cyber-label">Mod Vehicle Weight</label>
          <span style={{ color: 'var(--accent-neon)', fontFamily: 'var(--font-mono)', fontSize: '0.8rem' }}>{weights.modVehicle}%</span>
        </div>
        <input 
          type="range" 
          className="w-full" 
          value={weights.modVehicle} 
          min="0" max="100"
          onChange={(e) => handleWeightChange('modVehicle', parseInt(e.target.value))}
        />
      </div>

      <div className="flex-col gap-2">
        <div className="flex-row justify-between">
          <label className="cyber-label">Structure Weight</label>
          <span style={{ color: 'var(--accent-neon)', fontFamily: 'var(--font-mono)', fontSize: '0.8rem' }}>{weights.structure}%</span>
        </div>
        <input 
          type="range" 
          className="w-full" 
          value={weights.structure} 
          min="0" max="100"
          onChange={(e) => handleWeightChange('structure', parseInt(e.target.value))}
        />
      </div>

      <div style={{ 
        padding: '0.5rem', 
        backgroundColor: total === 100 ? 'rgba(0, 255, 204, 0.1)' : 'rgba(255, 51, 102, 0.1)',
        borderRadius: '4px',
        marginTop: '0.5rem'
      }}>
        <p style={{ 
          color: total === 100 ? 'var(--accent-neon)' : 'var(--accent-red)', 
          fontSize: '0.75rem', 
          fontFamily: 'var(--font-mono)',
          textAlign: 'center',
          margin: 0
        }}>
          TOTAL: {total}% {total !== 100 ? "(MUST EQUAL 100%)" : "(OPTIMIZED)"}
        </p>
      </div>
      
      <button 
        className="cyber-button primary w-full" 
        style={{ marginTop: '0.5rem' }}
        disabled={total !== 100}
        onClick={() => alert("Weights updated! Recalculating scores...")}
      >
        Apply Weights
      </button>
    </div>
  );
}
