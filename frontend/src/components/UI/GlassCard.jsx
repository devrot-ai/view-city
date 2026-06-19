/**
 * GlassCard — Reusable glassmorphism card component.
 */

import React from 'react'; // eslint-disable-line no-unused-vars

export default function GlassCard({ title, icon, children, className = '' }) {
  return (
    <div className={`glass-card ${className}`}>
      {title && (
        <div className="glass-card-header">
          {icon && <span>{icon}</span>}
          <h3>{title}</h3>
        </div>
      )}
      <div className="glass-card-body">
        {children}
      </div>
    </div>
  );
}
