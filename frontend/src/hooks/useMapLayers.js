/**
 * useMapLayers Hook — Manages visibility state for map data layers.
 * 
 * Simplified to support the HTML5 Canvas-based renderer.
 * Eliminates all Mapbox GL specific layout/layer properties logic.
 */

import { useState, useCallback } from 'react';

export function useMapLayers() {
  const [layerVisibility, setLayerVisibility] = useState({
    traffic: true,
    pollution: true,
    noise: true,
    accidents: true,
  });

  const toggleLayer = useCallback((layerName) => {
    setLayerVisibility(prev => ({
      ...prev,
      [layerName]: !prev[layerName],
    }));
  }, []);

  // Dummy functions to maintain API compatibility with any other calls
  const setMap = useCallback(() => {}, []);
  const updateTrafficLayer = useCallback(() => {}, []);
  const updatePollutionLayer = useCallback(() => {}, []);
  const updateNoiseLayer = useCallback(() => {}, []);
  const updateVehicleLayer = useCallback(() => {}, []);
  const updateAccidentLayer = useCallback(() => {}, []);

  return {
    setMap,
    layerVisibility,
    toggleLayer,
    updateTrafficLayer,
    updatePollutionLayer,
    updateNoiseLayer,
    updateVehicleLayer,
    updateAccidentLayer,
  };
}

export default useMapLayers;
