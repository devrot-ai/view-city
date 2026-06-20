/**
 * SimulationClock — Shows simulation time and tick count.
 */

// React default import not required for modern JSX runtime

export default function SimulationClock({ tick, simTime }) {
  // Convert simTime (seconds) to mm:ss format
  const minutes = Math.floor(simTime / 60);
  const seconds = Math.floor(simTime % 60);
  const timeStr = `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;

  return (
    <div className="sim-clock">
      <span className="time">{timeStr}</span>
      <span className="tick-label">T{tick}</span>
    </div>
  );
}
