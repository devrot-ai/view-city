/**
 * App.jsx — Main application component.
 * 
 * Orchestrates the Mapbox map, metrics bar, control panel,
 * policy selector, and AI recommendations panel.
 */

import { useState, useEffect, useCallback, useMemo } from 'react';
import './styles/index.css';

import CityMap from './components/Map/CityMap';
import MetricsBar from './components/Dashboard/MetricsBar';
import ControlPanel from './components/Dashboard/ControlPanel';
import PolicySelector from './components/Policy/PolicySelector';
import RouteOptimizerPanel from './components/Dashboard/RouteOptimizerPanel';
import GlassCard from './components/UI/GlassCard';
import useSimulation from './hooks/useSimulation';
import useMapLayers from './hooks/useMapLayers';
import api from './services/api';

export default function App() {
  // Tab Mode ('simulation' | 'routing')
  const [mode, setMode] = useState('simulation');

  // Route Optimizer state
  const [origin, setOrigin] = useState(null);
  const [destination, setDestination] = useState(null);
  const [routes, setRoutes] = useState([]);
  const [selectedRouteIndex, setSelectedRouteIndex] = useState(0);

  // Simulation state from WebSocket
  const sim = useSimulation();

  // Map layer management
  const layers = useMapLayers();

  // AI recommendations
  const [recommendations, setRecommendations] = useState([]);
  const [autopilot, setAutopilot] = useState(false);

  // Zones list (derived from simulation state)
  const zones = useMemo(() => sim.cityData?.zones || [], [sim.cityData?.zones]);

  // Active policies
  const [activePolicies, setActivePolicies] = useState({});

  // Handlers for Route Optimizer
  const handleOriginSelected = useCallback((name, location) => {
    setOrigin({ name, location });
  }, []);

  const handleDestinationSelected = useCallback((name, location) => {
    setDestination({ name, location });
  }, []);

  const handleRoutesCalculated = useCallback((routesList) => {
    setRoutes(routesList || []);
    setSelectedRouteIndex(0);
  }, []);

  const handleClearRoute = useCallback(() => {
    setOrigin(null);
    setDestination(null);
    setRoutes([]);
    setSelectedRouteIndex(0);
  }, []);

  // zones derived via useMemo above — no setState inside effects

  // Fetch recommendations periodically
  useEffect(() => {
    if (!sim.isRunning) return;

    const interval = setInterval(async () => {
      try {
        const data = await api.getRecommendations();
        setRecommendations(data.recommendations || []);
        setAutopilot(data.autopilot || false);
      } catch (err) {
        console.warn('getRecommendations failed:', err);
      }
    }, 5000);

    return () => clearInterval(interval);
  }, [sim.isRunning]);

  // Fetch active policies periodically
  useEffect(() => {
    const interval = setInterval(async () => {
      try {
        const data = await api.getActivePolicies();
        setActivePolicies(data.active || {});
      } catch (err) {
        console.warn('getActivePolicies failed:', err);
      }
    }, 3000);

    return () => clearInterval(interval);
  }, []);

  const handleMapReady = useCallback((map) => {
    layers.setMap(map);
  }, [layers]);

  const handleToggleAutopilot = async () => {
    try {
      const data = await api.toggleAutopilot();
      setAutopilot(data.autopilot);
    } catch (e) {
      console.error('Failed to toggle autopilot:', e);
    }
  };

  const getPriorityClass = (priority) => {
    if (priority >= 0.7) return 'high';
    if (priority >= 0.4) return 'medium';
    return 'low';
  };

  return (
    <div className="app-container">
      {/* Full-screen Cyberpunk Canvas Map */}
      <CityMap
        mode={mode}
        cityData={sim.cityData}
        edgesState={sim.edgesState}
        nodesState={sim.nodesState}
        vehicles={sim.vehicles}
        accidents={sim.accidents}
        layerVisibility={layers.layerVisibility}
        onMapReady={handleMapReady}
        origin={origin}
        destination={destination}
        onOriginSelected={handleOriginSelected}
        onDestinationSelected={handleDestinationSelected}
        onRoutesCalculated={handleRoutesCalculated}
        selectedRouteIndex={selectedRouteIndex}
      />

      {/* Connection Status */}
      <div className="connection-status" id="connection-status">
        <span className={`status-dot ${sim.connectionStatus}`} />
        <span>
          {sim.connectionStatus === 'connected'
            ? 'Live'
            : sim.connectionStatus === 'connecting'
            ? 'Connecting...'
            : 'Disconnected'}
        </span>
      </div>

      {/* Mode Switcher Tabs */}
      <div className="mode-tabs">
        <button
          className={`mode-tab-btn ${mode === 'simulation' ? 'active' : ''}`}
          onClick={() => setMode('simulation')}
          id="mode-tab-simulation"
        >
          🏙️ Digital Twin CP
        </button>
        <button
          className={`mode-tab-btn ${mode === 'routing' ? 'active' : ''}`}
          onClick={() => setMode('routing')}
          id="mode-tab-routing"
        >
          🛣️ AI Route Optimizer
        </button>
      </div>

      {mode === 'routing' ? (
        <RouteOptimizerPanel
          onOriginSelected={handleOriginSelected}
          onDestinationSelected={handleDestinationSelected}
          originName={origin ? origin.name : ''}
          destinationName={destination ? destination.name : ''}
          routes={routes}
          selectedRouteIndex={selectedRouteIndex}
          onSelectRoute={setSelectedRouteIndex}
          onClear={handleClearRoute}
          googleMapsLoaded={true}
        />
      ) : (
        <>
          {/* Top Metrics Bar */}
          <MetricsBar
            metrics={sim.metrics}
            performance={sim.performance}
          />

          {/* Right Control Panel */}
          <ControlPanel
            isRunning={sim.isRunning}
            speed={sim.speed}
            tick={sim.tick}
            simTime={sim.simTime}
            onPlay={() => sim.play()}
            onPause={sim.pause}
            onStep={sim.step}
            onReset={sim.reset}
            onSpeedChange={sim.setSimSpeed}
            layerVisibility={layers.layerVisibility}
            onToggleLayer={layers.toggleLayer}
            connectionStatus={sim.connectionStatus}
          />

          {/* Policy Selector (below control panel) */}
          <div style={{
            position: 'absolute',
            top: '380px',
            right: '16px',
            zIndex: 20,
            width: '320px',
          }}>
            <PolicySelector
              zones={zones}
              activePolicies={activePolicies}
            />
          </div>

          {/* AI Recommendations Panel */}
          <div className="ai-panel animate-slide-up" id="ai-panel">
            <GlassCard title="AI Advisor" icon="🤖">
              {/* Autopilot Toggle */}
              <div
                className={`autopilot-toggle ${autopilot ? 'active' : ''}`}
                onClick={handleToggleAutopilot}
                id="autopilot-toggle"
              >
                <div className="toggle-switch" />
                <span className="autopilot-label">
                  Autopilot {autopilot ? 'ON' : 'OFF'}
                </span>
              </div>

              {/* Recommendations List */}
              {recommendations.length > 0 ? (
                recommendations.map((rec, i) => (
                  <div className="recommendation-item" key={i}>
                    <div className={`rec-priority ${getPriorityClass(rec.priority)}`}>
                      {rec.priority.toFixed(1)}
                    </div>
                    <div className="rec-content">
                      <div className="rec-type">
                        {rec.policy_type?.replace('_', ' ')} → {rec.zone_id}
                      </div>
                      <div className="rec-reason">{rec.reason}</div>
                      <div className="rec-impact">{rec.expected_impact}</div>
                    </div>
                  </div>
                ))
              ) : (
                <div style={{
                  fontSize: 'var(--text-xs)',
                  color: 'var(--text-tertiary)',
                  textAlign: 'center',
                  padding: '12px',
                }}>
                  {sim.isRunning
                    ? 'Analyzing traffic patterns...'
                    : 'Start the simulation to get AI recommendations'}
                </div>
              )}
            </GlassCard>
          </div>

          {/* Bottom Simulation Controls (floating) */}
          <div className="sim-controls animate-slide-up" id="sim-controls-bar">
            <button
              className={`sim-btn ${sim.isRunning ? 'active' : ''}`}
              onClick={sim.isRunning ? sim.pause : () => sim.play()}
              title={sim.isRunning ? 'Pause' : 'Play'}
            >
              {sim.isRunning ? '⏸' : '▶'}
            </button>
            <button className="sim-btn" onClick={sim.step} disabled={sim.isRunning} title="Step">
              ⏭
            </button>
            <button className="sim-btn danger" onClick={sim.reset} title="Reset">
              🔄
            </button>

            <div className="speed-control">
              <span className="speed-label">🐢</span>
              <input
                type="range"
                className="speed-slider"
                min="0.1"
                max="5"
                step="0.1"
                value={sim.speed}
                onChange={(e) => sim.setSimSpeed(parseFloat(e.target.value))}
              />
              <span className="speed-label">🐇</span>
              <span className="speed-label" style={{ minWidth: '40px' }}>{sim.speed.toFixed(1)}×</span>
            </div>

            <div className="sim-clock">
              <span className="time">
                {String(Math.floor(sim.simTime / 60)).padStart(2, '0')}:
                {String(Math.floor(sim.simTime % 60)).padStart(2, '0')}
              </span>
              <span className="tick-label">Tick {sim.tick}</span>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
