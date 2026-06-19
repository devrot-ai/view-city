/**
 * AnimatedCounter — Smooth number transition with counting animation.
 */

import React, { useState, useEffect, useRef } from 'react';

export default function AnimatedCounter({
  value,
  decimals = 0,
  duration = 300,
  prefix = '',
  suffix = '',
  className = '',
}) {
  const [displayValue, setDisplayValue] = useState(value);
  const prevRef = useRef(value);
  const rafRef = useRef(null);

  useEffect(() => {
    const from = prevRef.current;
    const to = value;
    prevRef.current = value;

    if (from === to) return;

    const startTime = performance.now();

    function animate(currentTime) {
      const elapsed = currentTime - startTime;
      const progress = Math.min(elapsed / duration, 1);

      // Ease out cubic
      const eased = 1 - Math.pow(1 - progress, 3);
      const current = from + (to - from) * eased;

      setDisplayValue(current);

      if (progress < 1) {
        rafRef.current = requestAnimationFrame(animate);
      }
    }

    rafRef.current = requestAnimationFrame(animate);

    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, [value, duration]);

  const formatted = typeof displayValue === 'number'
    ? displayValue.toFixed(decimals)
    : displayValue;

  return (
    <span className={className}>
      {prefix}{formatted}{suffix}
    </span>
  );
}
