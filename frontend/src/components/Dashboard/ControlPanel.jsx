/**
 * ControlPanel — Right sidebar with simulation controls, layer toggles, and policies.
 */

import React from 'react';
import GlassCard from '../UI/GlassCard';
import SimulationClock from './SimulationClock';

export default function ControlPanel({
  isRunning,
  speed,
  tick,
  simTime,
  onPlay,
  onPause,
  onStep,
  onReset,
  onSpeedChange,
  layerVisibility,
  onToggleLayer,
  connectionStatus,
}) {
  return (
    <div className="control-panel animate-slide-right" id="control-panel">
      {/* Simulation Controls */}
      <GlassCard title="Simulation" icon="🎮">
        <div className="sim-controls" style={{ position: 'relative', all: 'unset', display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
          <button
            className={`sim-btn ${isRunning ? 'active' : ''}`}
            onClick={isRunning ? onPause : onPlay}
            title={isRunning ? 'Pause' : 'Play'}
            id="btn-play-pause"
          >
            {isRunning ? '⏸' : '▶'}
          </button>

          <button
            className="sim-btn"
            onClick={onStep}
            title="Step (1 tick)"
            disabled={isRunning}
            id="btn-step"
          >
            ⏭
          </button>

          <button
            className="sim-btn danger"
            onClick={onReset}
            title="Reset Simulation"
            id="btn-reset"
          >
            🔄
          </button>

          <SimulationClock tick={tick} simTime={simTime} />
        </div>

        {/* Speed Control */}
        <div className="speed-control" style={{ marginTop: '12px' }}>
          <span className="speed-label">🐢</span>
          <input
            type="range"
            className="speed-slider"
            min="0.1"
            max="5"
            step="0.1"
            value={speed}
            onChange={(e) => onSpeedChange(parseFloat(e.target.value))}
            id="speed-slider"
          />
          <span className="speed-label">🐇</span>
          <span className="speed-label" style={{ minWidth: '42px' }}>{speed.toFixed(1)}×</span>
        </div>
      </GlassCard>

      {/* Layer Toggles */}
      <GlassCard title="Data Layers" icon="🗺️">
        <div className="layer-toggles">
          {[
            { key: 'traffic', label: 'Traffic Flow', className: 'traffic' },
            { key: 'pollution', label: 'Pollution Heatmap', className: 'pollution' },
            { key: 'noise', label: 'Noise Levels', className: 'noise' },
            { key: 'accidents', label: 'Accident Markers', className: 'accidents' },
          ].map(layer => (
            <div
              key={layer.key}
              className="layer-toggle"
              onClick={() => onToggleLayer(layer.key)}
              id={`toggle-${layer.key}`}
            >
              <span className={`layer-dot ${layer.className} ${layerVisibility[layer.key] ? '' : 'off'}`} />
              <span className="layer-label">{layer.label}</span>
            </div>
          ))}
        </div>
      </GlassCard>
    </div>
  );
}
