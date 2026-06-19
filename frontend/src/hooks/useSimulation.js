/**
 * useSimulation Hook — WebSocket connection and simulation state management.
 * 
 * Provides:
 * - Real-time simulation state via WebSocket
 * - Control functions (play, pause, step, reset)
 * - Connection status tracking
 * - Metric history for sparkline charts
 */

import { useState, useEffect, useRef, useCallback } from 'react';
import { SimulationWebSocket } from '../services/api';

const MAX_HISTORY = 120; // Keep last 120 data points for charts

export function useSimulation() {
  // Connection state
  const [connectionStatus, setConnectionStatus] = useState('disconnected');
  const wsRef = useRef(null);

  // Simulation state
  const [cityData, setCityData] = useState(null);
  const [metrics, setMetrics] = useState({
    total_vehicles: 0,
    avg_speed: 0,
    avg_congestion: 0,
    pollution_index: 0,
    noise_index: 0,
    active_accidents: 0,
    total_intersections: 0,
    total_roads: 0,
  });
  const [vehicles, setVehicles] = useState([]);
  const [accidents, setAccidents] = useState([]);
  const [tick, setTick] = useState(0);
  const [simTime, setSimTime] = useState(0);
  const [isRunning, setIsRunning] = useState(false);
  const [speed, setSpeed] = useState(1.0);
  const [performance, setPerformance] = useState({ tick_ms: 0, avg_tick_ms: 0 });

  // Delta updates tracking
  const [edgesState, setEdgesState] = useState({});
  const [nodesState, setNodesState] = useState({});

  // Metric history for charts
  const [metricsHistory, setMetricsHistory] = useState({
    speed: [],
    congestion: [],
    pollution: [],
    noise: [],
    vehicles: [],
  });

  // Handle incoming WebSocket messages
  const handleMessage = useCallback((data) => {
    if (data.type === 'full_state') {
      // Initial full state load
      setCityData(data.city);
      setMetrics(data.metrics || {});
      setVehicles(data.vehicles || []);
      setAccidents(data.accidents || []);
      setTick(data.tick || 0);
      setSimTime(data.sim_time || 0);
      setIsRunning(data.is_running || false);
      setSpeed(data.speed || 1.0);

      // Initialize edge/node state from full city data
      if (data.city?.edges?.features) {
        const edges = {};
        for (const f of data.city.edges.features) {
          edges[f.properties.id] = f.properties;
        }
        setEdgesState(edges);
      }
      if (data.city?.nodes?.features) {
        const nodes = {};
        for (const f of data.city.nodes.features) {
          nodes[f.properties.id] = f.properties;
        }
        setNodesState(nodes);
      }
    } else if (data.type === 'state_update') {
      // Delta update — merge changes
      setTick(data.tick);
      setSimTime(data.sim_time);
      setVehicles(data.vehicles || []);
      setAccidents(data.accidents || []);
      setPerformance(data.performance || {});

      if (data.metrics) {
        setMetrics(prev => ({ ...prev, ...data.metrics }));

        // Append to history
        setMetricsHistory(prev => {
          const next = { ...prev };
          next.speed = [...prev.speed, data.metrics.avg_speed || 0].slice(-MAX_HISTORY);
          next.congestion = [...prev.congestion, data.metrics.avg_congestion || 0].slice(-MAX_HISTORY);
          next.pollution = [...prev.pollution, data.metrics.pollution_index || 0].slice(-MAX_HISTORY);
          next.noise = [...prev.noise, data.metrics.noise_index || 0].slice(-MAX_HISTORY);
          next.vehicles = [...prev.vehicles, data.metrics.total_vehicles || 0].slice(-MAX_HISTORY);
          return next;
        });
      }

      // Merge edge deltas
      if (data.edges_changed?.length) {
        setEdgesState(prev => {
          const next = { ...prev };
          for (const edge of data.edges_changed) {
            next[edge.id] = { ...next[edge.id], ...edge };
          }
          return next;
        });
      }

      // Merge node deltas
      if (data.nodes_changed?.length) {
        setNodesState(prev => {
          const next = { ...prev };
          for (const node of data.nodes_changed) {
            next[node.id] = { ...next[node.id], ...node };
          }
          return next;
        });
      }
    } else if (data.type === 'pong') {
      // Keep-alive response — ignore
    }
  }, []);

  // Initialize WebSocket on mount
  useEffect(() => {
    const ws = new SimulationWebSocket(handleMessage, setConnectionStatus);
    wsRef.current = ws;
    ws.connect();

    return () => {
      ws.disconnect();
    };
  }, [handleMessage]);

  // Control functions
  const play = useCallback((newSpeed) => {
    const s = newSpeed ?? speed;
    setIsRunning(true);
    setSpeed(s);
    wsRef.current?.sendControl('play', s);
  }, [speed]);

  const pause = useCallback(() => {
    setIsRunning(false);
    wsRef.current?.sendControl('pause');
  }, []);

  const step = useCallback(() => {
    wsRef.current?.sendControl('step');
  }, []);

  const reset = useCallback(() => {
    setIsRunning(false);
    setTick(0);
    setSimTime(0);
    setMetricsHistory({ speed: [], congestion: [], pollution: [], noise: [], vehicles: [] });
    wsRef.current?.sendControl('reset');
  }, []);

  const setSimSpeed = useCallback((newSpeed) => {
    setSpeed(newSpeed);
    if (isRunning) {
      wsRef.current?.sendControl('speed', newSpeed);
    }
  }, [isRunning]);

  return {
    // Connection
    connectionStatus,

    // City data (initial load)
    cityData,

    // Real-time state
    metrics,
    vehicles,
    accidents,
    tick,
    simTime,
    isRunning,
    speed,
    performance,

    // Delta state
    edgesState,
    nodesState,

    // History for charts
    metricsHistory,

    // Controls
    play,
    pause,
    step,
    reset,
    setSimSpeed,
  };
}

export default useSimulation;
