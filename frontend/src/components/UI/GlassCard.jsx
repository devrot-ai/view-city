/**
 * GlassCard — Reusable glassmorphism card component.
 */

// No default React import required for JSX automatic runtime

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
