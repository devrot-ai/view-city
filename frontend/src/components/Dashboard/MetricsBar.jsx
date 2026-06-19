/**
 * MetricsBar — Top bar with real-time KPI cards.
 * Displays key simulation metrics with animated counters and icons.
 */

import React from 'react';
import AnimatedCounter from '../UI/AnimatedCounter';

export default function MetricsBar({ metrics, performance: perf }) {
  const cards = [
    {
      key: 'speed',
      icon: '⚡',
      value: metrics.avg_speed || 0,
      decimals: 1,
      suffix: ' km/h',
      label: 'Avg Speed',
      className: 'speed',
    },
    {
      key: 'vehicles',
      icon: '🚗',
      value: metrics.total_vehicles || 0,
      decimals: 0,
      label: 'Vehicles',
      className: 'vehicles',
    },
    {
      key: 'congestion',
      icon: '📊',
      value: (metrics.avg_congestion || 0) * 100,
      decimals: 1,
      suffix: '%',
      label: 'Congestion',
      className: 'congestion',
    },
    {
      key: 'pollution',
      icon: '🏭',
      value: metrics.pollution_index || 0,
      decimals: 1,
      label: 'Pollution',
      className: 'pollution',
    },
    {
      key: 'noise',
      icon: '🔊',
      value: metrics.noise_index || 0,
      decimals: 1,
      suffix: ' dB',
      label: 'Noise',
      className: 'noise',
    },
    {
      key: 'accidents',
      icon: '⚠️',
      value: metrics.active_accidents || 0,
      decimals: 0,
      label: 'Accidents',
      className: 'accidents',
    },
  ];

  return (
    <div className="metrics-bar animate-fade-in" id="metrics-bar">
      {cards.map(card => (
        <div key={card.key} className={`metric-card ${card.className}`}>
          <span className="metric-icon">{card.icon}</span>
          <AnimatedCounter
            value={card.value}
            decimals={card.decimals}
            prefix={card.prefix || ''}
            suffix={card.suffix || ''}
            className="metric-value"
          />
          <span className="metric-label">{card.label}</span>
        </div>
      ))}
      {perf?.tick_ms > 0 && (
        <div className="metric-card">
          <span className="perf-badge">{perf.tick_ms}ms/tick</span>
        </div>
      )}
    </div>
  );
}
