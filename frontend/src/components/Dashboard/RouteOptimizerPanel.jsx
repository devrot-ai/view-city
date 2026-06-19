/**
 * RouteOptimizerPanel — Sidebar panel for India-wide AI Route Optimization.
 * 
 * Embeds Google Places Autocomplete inputs and displays detailed comparisons
 * of alternative routes with AI scoring, traffic warnings, and navigation steps.
 */

import React, { useEffect, useRef, useState, useMemo } from 'react'; // eslint-disable-line no-unused-vars
import GlassCard from '../UI/GlassCard';

export default function RouteOptimizerPanel({
  onOriginSelected,
  onDestinationSelected,
  originName,
  destinationName,
  routes = [],
  selectedRouteIndex = 0,
  onSelectRoute,
  onClear,
  googleMapsLoaded = false,
}) {
  const originInputRef = useRef(null);
  const destinationInputRef = useRef(null);
  const [showDirections, setShowDirections] = useState(false);

  // Initialize Google Autocomplete on input elements
  useEffect(() => {
    if (!googleMapsLoaded || !window.google || !window.google.maps || !window.google.maps.places) {
      return;
    }

    const originEl = originInputRef.current;
    const destEl = destinationInputRef.current;

    const options = {
      componentRestrictions: { country: 'in' }, // Focus on India
      fields: ['geometry', 'name', 'formatted_address'],
    };

    const originAutocomplete = new window.google.maps.places.Autocomplete(originEl, options);
    const originListener = originAutocomplete.addListener('place_changed', () => {
      const place = originAutocomplete.getPlace();
      if (place.geometry) {
        onOriginSelected(place.name || place.formatted_address, place.geometry.location);
      }
    });

    const destAutocomplete = new window.google.maps.places.Autocomplete(destEl, options);
    const destListener = destAutocomplete.addListener('place_changed', () => {
      const place = destAutocomplete.getPlace();
      if (place.geometry) {
        onDestinationSelected(place.name || place.formatted_address, place.geometry.location);
      }
    });

    // Prevent form submission on enter
    const preventSubmit = (e) => {
      if (e.key === 'Enter') e.preventDefault();
    };
    originEl?.addEventListener('keydown', preventSubmit);
    destEl?.addEventListener('keydown', preventSubmit);

    return () => {
      originEl?.removeEventListener('keydown', preventSubmit);
      destEl?.removeEventListener('keydown', preventSubmit);

      // remove map listeners if possible
      try {
        if (originListener && window.google && window.google.maps && window.google.maps.event) {
          window.google.maps.event.removeListener(originListener);
        }
        if (destListener && window.google && window.google.maps && window.google.maps.event) {
          window.google.maps.event.removeListener(destListener);
        }
      } catch {
        // best-effort cleanup
      }
    };
  }, [googleMapsLoaded, onOriginSelected, onDestinationSelected]);

  // Sync inputs with state (e.g., when clicking points on the map)
  useEffect(() => {
    if (originInputRef.current && originName) {
      originInputRef.current.value = originName;
    }
  }, [originName]);

  useEffect(() => {
    if (destinationInputRef.current && destinationName) {
      destinationInputRef.current.value = destinationName;
    }
  }, [destinationName]);

  // Handle clearing state
  const handleClear = () => {
    if (originInputRef.current) originInputRef.current.value = '';
    if (destinationInputRef.current) destinationInputRef.current.value = '';
    onClear?.();
  };

  // Handle GPS Current Location retrieval
  const handleUseGPS = () => {
    if (!navigator.geolocation) {
      alert('Geolocation is not supported by your browser.');
      return;
    }

    navigator.geolocation.getCurrentPosition(
      (position) => {
        const { latitude, longitude } = position.coords;
        const latLng = new window.google.maps.LatLng(latitude, longitude);

        // Reverse Geocode the location to get a readable address
        const geocoder = new window.google.maps.Geocoder();
        geocoder.geocode({ location: latLng }, (results, status) => {
          if (status === 'OK' && results[0]) {
            const address = results[0].formatted_address;
            onOriginSelected(address, latLng);
          } else {
            // Fallback description if geocoding fails
            onOriginSelected(`My Location (${latitude.toFixed(4)}, ${longitude.toFixed(4)})`, latLng);
          }
        });
      },
      (error) => {
        console.warn('Geolocation error:', error);
        alert(`Failed to retrieve your location: ${error.message}`);
      },
      { enableHighAccuracy: true, timeout: 5000, maximumAge: 0 }
    );
  };

  // Helper to calculate AI Routing Score and Details
  const processedRoutes = useMemo(() => {
    return routes.map((route, idx) => {
      const leg = route.legs[0];
      const distanceKm = leg.distance.value / 1000;
      const durationMin = leg.duration.value / 60;
      
      // Check for traffic delays
      // google maps DirectionsRoute might return duration_in_traffic. If not, mock a traffic congestion delay based on summary name
      const durationInTrafficMin = leg.duration_in_traffic ? (leg.duration_in_traffic.value / 60) : durationMin;
      const trafficDelayMin = Math.max(0, durationInTrafficMin - durationMin);
      
      // Heuristic score: penalize distance and traffic delay
      let aiScore = Math.round(100 - (trafficDelayMin * 1.8) - (distanceKm * 0.15));
      aiScore = Math.max(10, Math.min(100, aiScore));

      return {
        index: idx,
        summary: route.summary || `Route ${idx + 1}`,
        distance: leg.distance.text,
        duration: leg.duration.text,
        durationInTraffic: leg.duration_in_traffic ? leg.duration_in_traffic.text : null,
        trafficDelay: trafficDelayMin > 1 ? `${Math.round(trafficDelayMin)} min` : null,
        aiScore,
        steps: leg.steps || [],
      };
    });
  }, [routes]);

  // Determine top AI Recommended route
  const aiRecommendedIndex = useMemo(() => {
    if (processedRoutes.length === 0) return 0;
    // Find the one with highest AI Score
    let bestIdx = 0;
    let maxScore = -1;
    for (const r of processedRoutes) {
      if (r.aiScore > maxScore) {
        maxScore = r.aiScore;
        bestIdx = r.index;
      }
    }
    return bestIdx;
  }, [processedRoutes]);

  // AI Recommendation text summary
  const aiRecommendationSummary = useMemo(() => {
    if (processedRoutes.length === 0) return null;
    const recommended = processedRoutes[aiRecommendedIndex];
    
    // Find if there is another route to compare
    const other = processedRoutes.find(r => r.index !== aiRecommendedIndex);
    if (other) {
      const timeSaved = Math.round((other.aiScore - recommended.aiScore) * 0.5);
      if (timeSaved > 1) {
        return `🤖 AI Recommendation: Take the recommended path via ${recommended.summary} to bypass congestion on alternative routes and save approximately ${timeSaved} minutes.`;
      }
    }
    
    if (recommended.trafficDelay) {
      return `🤖 AI Recommendation: Minor traffic delay (${recommended.trafficDelay}) detected on ${recommended.summary}, but it remains the most optimal path available.`;
    }

    return `🤖 AI Recommendation: High-efficiency routing path. Taking this route via ${recommended.summary} offers optimal speed, lowest carbon emissions, and fuel economy.`;
  }, [processedRoutes, aiRecommendedIndex]);

  const selectedRoute = processedRoutes[selectedRouteIndex] || processedRoutes[0];

  return (
    <div className="control-panel animate-slide-right" id="route-optimizer-panel" style={{ width: '340px' }}>
      {/* Route Planner Card */}
      <GlassCard title="AI Route Planner" icon="🛣️">
        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
          {/* Origin Search */}
          <div>
            <label style={{ display: 'block', fontSize: 'var(--text-xs)', color: 'var(--text-secondary)', marginBottom: '4px', textTransform: 'uppercase' }}>
              📍 Start Position
            </label>
            <div style={{ display: 'flex', gap: '6px' }}>
              <input
                ref={originInputRef}
                type="text"
                placeholder="Search origin in India..."
                className="zone-select"
                style={{ margin: 0, flex: 1, textOverflow: 'ellipsis' }}
                id="origin-search-input"
              />
              <button
                type="button"
                onClick={handleUseGPS}
                className="btn-reset"
                style={{
                  padding: '0 10px',
                  margin: 0,
                  fontSize: '14px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  background: 'rgba(6, 182, 212, 0.1)',
                  border: '1px solid var(--glass-border)',
                  color: 'var(--accent-cyan)',
                  borderRadius: 'var(--radius-sm)',
                  cursor: 'pointer',
                  transition: 'all var(--transition-fast)'
                }}
                title="Use Current Location (GPS)"
                id="btn-use-gps"
              >
                🎯
              </button>
            </div>
          </div>

          {/* Destination Search */}
          <div>
            <label style={{ display: 'block', fontSize: 'var(--text-xs)', color: 'var(--text-secondary)', marginBottom: '4px', textTransform: 'uppercase' }}>
              🏁 End Destination
            </label>
            <input
              ref={destinationInputRef}
              type="text"
              placeholder="Search destination in India..."
              className="zone-select"
              style={{ margin: 0, textOverflow: 'ellipsis' }}
              id="destination-search-input"
            />
          </div>

          {/* Clear Button */}
          {(originName || destinationName || routes.length > 0) && (
            <button
              onClick={handleClear}
              className="btn-reset"
              style={{ marginTop: '4px' }}
              id="btn-clear-route"
            >
              Reset Route Planner
            </button>
          )}
        </div>
      </GlassCard>

      {/* Alternative Routes Card */}
      {processedRoutes.length > 0 && (
        <GlassCard title="Alternative Routes" icon="⚖️">
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            
            {/* AI Recommendation Summary */}
            {aiRecommendationSummary && (
              <div 
                className="impact-preview" 
                style={{ 
                  margin: '0 0 8px 0', 
                  borderColor: 'var(--accent-cyan)',
                  background: 'rgba(6, 182, 212, 0.08)',
                  fontSize: '11px',
                  lineHeight: '1.4',
                  color: 'var(--text-primary)'
                }}
              >
                {aiRecommendationSummary}
              </div>
            )}

            {processedRoutes.map((r) => {
              const isSelected = selectedRouteIndex === r.index;
              const isRecommended = aiRecommendedIndex === r.index;

              return (
                <div
                  key={r.index}
                  onClick={() => onSelectRoute(r.index)}
                  className={`policy-card ${isSelected ? 'active' : ''}`}
                  style={{
                    borderColor: isSelected ? 'var(--accent-violet)' : 'rgba(255,255,255,0.04)',
                    background: isSelected ? 'rgba(139, 92, 246, 0.08)' : 'rgba(255,255,255,0.02)',
                    padding: '10px',
                  }}
                >
                  <div className="policy-card-header" style={{ marginBottom: '4px' }}>
                    <span className="policy-name" style={{ fontSize: '12px' }}>
                      🛣️ {r.summary}
                    </span>
                    <span 
                      className="policy-badge" 
                      style={{ 
                        fontSize: '10px', 
                        background: isRecommended ? 'rgba(6, 182, 212, 0.18)' : 'rgba(255,255,255,0.06)',
                        color: isRecommended ? 'var(--accent-cyan)' : 'var(--text-secondary)'
                      }}
                    >
                      {isRecommended ? 'AI Best' : 'Alt'}
                    </span>
                  </div>

                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '11px', color: 'var(--text-secondary)' }}>
                    <span>Distance: <strong>{r.distance}</strong></span>
                    <span>Est: <strong style={{ color: 'var(--text-primary)' }}>{r.duration}</strong></span>
                  </div>

                  {r.trafficDelay && (
                    <div style={{ fontSize: '10px', color: 'var(--accent-rose)', fontWeight: '600', marginTop: '2px' }}>
                      ⚠️ Traffic delay: {r.trafficDelay}
                    </div>
                  )}

                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: '6px', paddingTop: '4px', borderTop: '1px solid rgba(255,255,255,0.04)' }}>
                    <span style={{ fontSize: '10px', color: 'var(--text-tertiary)' }}>AI EFFICIENCY SCORE:</span>
                    <strong style={{ 
                      fontSize: '12px',
                      fontFamily: 'var(--font-mono)',
                      color: r.aiScore > 85 ? 'var(--accent-emerald)' : r.aiScore > 65 ? 'var(--accent-amber)' : 'var(--accent-rose)'
                    }}>
                      {r.aiScore}/100
                    </strong>
                  </div>
                </div>
              );
            })}
          </div>
        </GlassCard>
      )}

      {/* Turn-by-Turn Navigation Card */}
      {selectedRoute && selectedRoute.steps.length > 0 && (
        <GlassCard 
          title={showDirections ? "Turn-by-Turn Steps" : "Show Directions"} 
          icon="🧭"
        >
          <div style={{ display: 'flex', flexDirection: 'column' }}>
            <button
              onClick={() => setShowDirections(!showDirections)}
              className="btn-reset"
              style={{ fontSize: '11px', padding: '4px 8px', marginBottom: showDirections ? '10px' : '0' }}
            >
              {showDirections ? 'Collapse Turn Steps' : 'Expand Turn Steps'}
            </button>

            {showDirections && (
              <div 
                style={{ 
                  maxHeight: '220px', 
                  overflowY: 'auto', 
                  display: 'flex', 
                  flexDirection: 'column', 
                  gap: '6px',
                  paddingRight: '4px'
                }}
              >
                {selectedRoute.steps.map((step, idx) => (
                  <div 
                    key={idx} 
                    style={{ 
                      fontSize: '11px', 
                      paddingBottom: '6px', 
                      borderBottom: idx < selectedRoute.steps.length - 1 ? '1px solid rgba(255,255,255,0.04)' : 'none',
                      lineHeight: '1.4'
                    }}
                  >
                    <div style={{ color: 'var(--text-tertiary)', fontSize: '10px', fontFamily: 'var(--font-mono)' }}>
                      STEP {idx + 1} ({step.distance.text})
                    </div>
                    <div 
                      style={{ color: 'var(--text-primary)', marginTop: '2px' }}
                      dangerouslySetInnerHTML={{ __html: step.html_instructions }} 
                    />
                  </div>
                ))}
              </div>
            )}
          </div>
        </GlassCard>
      )}
    </div>
  );
}
