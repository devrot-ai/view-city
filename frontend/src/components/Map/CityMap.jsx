/**
 * CityMap — Google Maps + High-performance HTML5 Canvas 2D overlay.
 * 
 * Supports two distinct operational modes:
 * 1. 'simulation': Concentric circular digital twin of Connaught Place, New Delhi.
 * 2. 'routing': India-wide AI Route Optimization using Directions Service and Autocomplete.
 */

import React, { useEffect, useRef, useState, useCallback, memo } from 'react';
import api from '../../services/api';
import { getGeoDistance, distanceToSegmentGeo } from '../../utils/geo';

const Fragment = React.Fragment;

// Custom dark map style for Google Maps to match cyberpunk aesthetics
const darkMapStyle = [
  { elementType: "geometry", stylers: [{ color: "#0a0e1a" }] },
  { elementType: "labels.text.stroke", stylers: [{ color: "#0a0e1a" }] },
  { elementType: "labels.text.fill", stylers: [{ color: "#94a3b8" }] },
  {
    featureType: "administrative.locality",
    elementType: "labels.text.fill",
    stylers: [{ color: "#a78bfa" }],
  },
  {
    featureType: "poi",
    elementType: "labels.text.fill",
    stylers: [{ color: "#64748b" }],
  },
  {
    featureType: "poi.park",
    elementType: "geometry",
    stylers: [{ color: "#0f172a" }],
  },
  {
    featureType: "poi.park",
    elementType: "labels.text.fill",
    stylers: [{ color: "#10b981" }],
  },
  {
    featureType: "road",
    elementType: "geometry",
    stylers: [{ color: "#111827" }],
  },
  {
    featureType: "road",
    elementType: "geometry.stroke",
    stylers: [{ color: "#1f2937" }],
  },
  {
    featureType: "road",
    elementType: "labels.text.fill",
    stylers: [{ color: "#64748b" }],
  },
  {
    featureType: "road.highway",
    elementType: "geometry",
    stylers: [{ color: "#1e1b4b" }],
  },
  {
    featureType: "road.highway",
    elementType: "geometry.stroke",
    stylers: [{ color: "#312e81" }],
  },
  {
    featureType: "water",
    elementType: "geometry",
    stylers: [{ color: "#020617" }],
  },
  {
    featureType: "water",
    elementType: "labels.text.fill",
    stylers: [{ color: "#3b82f6" }],
  },
];

// Helper to load Google Maps script dynamically
const loadGoogleMapsScript = (key) => {
  return new Promise((resolve, reject) => {
    if (window.google && window.google.maps) {
      resolve(window.google.maps);
      return;
    }
    const existing = document.getElementById('google-maps-script');
    if (existing) {
      if (window.google && window.google.maps) {
        resolve(window.google.maps);
      } else {
        const prevCallback = window.initGoogleMap;
        window.initGoogleMap = () => {
          if (prevCallback) prevCallback();
          resolve(window.google.maps);
        };
      }
      return;
    }

    // Set callback on window
    window.initGoogleMap = () => {
      resolve(window.google.maps);
    };

    const script = document.createElement('script');
    script.id = 'google-maps-script';
    // Load geometry and places libraries with async loading callback to avoid console warnings
    script.src = `https://maps.googleapis.com/maps/api/js?key=${key || ''}&libraries=geometry,places&loading=async&callback=initGoogleMap&v=weekly`;
    script.async = true;
    script.defer = true;
    script.onerror = (err) => reject(err);
    document.head.appendChild(script);
  });
};

function CityMap({
  mode = 'simulation', // 'simulation' or 'routing'
  cityData,
  edgesState,
  nodesState,
  vehicles = [],
  accidents = [],
  layerVisibility = { traffic: true, pollution: true, noise: true, accidents: true },
  onMapReady,
  
  // Routing-specific props
  origin = null,
  destination = null,
  onOriginSelected,
  onDestinationSelected,
  onRoutesCalculated,
  selectedRouteIndex = 0,
}) {
  const mapContainerRef = useRef(null);
  const canvasRef = useRef(null);
  const bgCanvasRef = useRef(null);
  const fgCanvasRef = useRef(null);
  
  const [mapsLoaded, setMapsLoaded] = useState(false);
  const [hoveredEntity, setHoveredEntity] = useState(null);
  const [clickedEntity, setClickedEntity] = useState(null);
  const [mousePos, setMousePos] = useState({ x: 0, y: 0 });
  const [zoomLevel, setZoomLevel] = useState(15.5);

  const mapRef = useRef(null);
  const overlayRef = useRef(null);
  const projectionRef = useRef(null);
  
  // Draggable route markers
  const originMarkerRef = useRef(null);
  const destinationMarkerRef = useRef(null);
  const directionsServiceRef = useRef(null);
  const directionsRendererRef = useRef(null);
  const hasRoutesRef = useRef(false);

  const animTimeRef = useRef(0);

  // Precomputed node/edge lookup to avoid rebuilding per-frame
  const nodeMapRef = useRef(null);
  const edgesListRef = useRef(null);
  const lastRenderRef = useRef(0);
  const MAX_FPS = 30;

  // Sync refs to avoid stale closures in event listeners
  const modeRef = useRef(mode);
  const originRef = useRef(origin);
  const destinationRef = useRef(destination);

  // Keep stable refs for callback props to avoid reattaching map listeners
  const onOriginSelectedRef = useRef(onOriginSelected);
  const onDestinationSelectedRef = useRef(onDestinationSelected);

  useEffect(() => { modeRef.current = mode; }, [mode]);
  useEffect(() => { originRef.current = origin; }, [origin]);
  useEffect(() => { destinationRef.current = destination; }, [destination]);
  useEffect(() => { onOriginSelectedRef.current = onOriginSelected; }, [onOriginSelected]);
  useEffect(() => { onDestinationSelectedRef.current = onDestinationSelected; }, [onDestinationSelected]);

  // 1. Load Google Maps API Script
  useEffect(() => {
    const key = import.meta.env.VITE_GOOGLE_MAPS_TOKEN || import.meta.env.VITE_GOOGLE_MAPS_API_KEY || '';
    loadGoogleMapsScript(key)
      .then(() => {
        setMapsLoaded(true);
      })
      .catch((e) => {
        console.error('Failed to load Google Maps API:', e);
      });
     
  }, []);

  // Auto-dismiss Google Maps warning dialog for developer/local fallback mode
  useEffect(() => {
    const interval = setInterval(() => {
      const dismissBtn = document.querySelector('.dismissButton');
      if (dismissBtn) {
        dismissBtn.click();
      }
    }, 1000);
    return () => clearInterval(interval);
    // this is intentionally no deps because it operates on document global
     
  }, []);


  // 2. Geographic helpers are provided by src/utils/geo so they can be unit tested

  const findEntityAtLatLng = useCallback((lat, lng) => {
    if (!cityData) return null;

    const toleranceDegrees = 0.00028 / Math.max(0.2, (zoomLevel - 13));

    for (const node of cityData.nodes.features) {
      const [nlng, nlat] = node.geometry.coordinates;
      const dist = getGeoDistance(lat, lng, nlat, nlng);
      if (dist < toleranceDegrees) {
        const dynamicNode = nodesState[node.properties.id] || {};
        return {
          type: 'node',
          id: node.properties.id,
          properties: { ...node.properties, ...dynamicNode },
        };
      }
    }

    const nodeMap = {};
    for (const n of cityData.nodes.features) {
      nodeMap[n.properties.id] = n.geometry.coordinates;
    }

    let nearestEdge = null;
    let minEdgeDist = 0.0001 / Math.max(0.2, (zoomLevel - 13));

    for (const edge of cityData.edges.features) {
      const fromCoord = nodeMap[edge.properties.from];
      const toCoord = nodeMap[edge.properties.to];
      if (fromCoord && toCoord) {
        const dist = distanceToSegmentGeo(lat, lng, fromCoord[1], fromCoord[0], toCoord[1], toCoord[0]);
        if (dist < minEdgeDist) {
          minEdgeDist = dist;
          const dynamicEdge = edgesState[edge.properties.id] || {};
          nearestEdge = {
            type: 'edge',
            id: edge.properties.id,
            properties: { ...edge.properties, ...dynamicEdge },
          };
        }
      }
    }

    return nearestEdge;
  }, [cityData, edgesState, nodesState, zoomLevel]);

  // Keep a ref of the finder function so long-lived map listeners don't capture
  // a stale closure and to satisfy eslint's exhaustive-deps rules.
  const findEntityAtLatLngRef = useRef(findEntityAtLatLng);
  useEffect(() => {
    findEntityAtLatLngRef.current = findEntityAtLatLng;
  }, [findEntityAtLatLng]);

  // Precompute nodeMap and edges list when cityData or dynamic state changes.
  useEffect(() => {
    if (!cityData) {
      nodeMapRef.current = null;
      edgesListRef.current = null;
      return;
    }

    const nm = {};
    for (const n of cityData.nodes.features) {
      nm[n.properties.id] = {
        coords: n.geometry.coordinates,
        props: { ...n.properties, ...(nodesState[n.properties.id] || {}) },
      };
    }

    nodeMapRef.current = nm;
    edgesListRef.current = cityData.edges.features;
  }, [cityData, edgesState, nodesState]);

  // 3. Initialize Map Instance
  useEffect(() => {
    if (!mapsLoaded || !mapContainerRef.current || mapRef.current) return;

    const center = cityData?.center || [77.2177, 28.6304]; // Connaught Place center
    
    const googleMap = new window.google.maps.Map(mapContainerRef.current, {
      center: { lat: center[1], lng: center[0] },
      zoom: 15.5,
      tilt: 0,
      mapTypeId: 'roadmap',
      disableDefaultUI: true,
      zoomControl: true,
      styles: darkMapStyle,
    });

    mapRef.current = googleMap;

    // Instantiate Directions Service & Renderer
    directionsServiceRef.current = new window.google.maps.DirectionsService();
    directionsRendererRef.current = new window.google.maps.DirectionsRenderer({
      map: googleMap,
      suppressMarkers: true, // Custom markers for start/end
      polylineOptions: {
        strokeColor: '#8b5cf6', // Violet
        strokeOpacity: 0.8,
        strokeWeight: 6,
      }
    });

    // Track zoom level
    googleMap.addListener('zoom_changed', () => {
      setZoomLevel(googleMap.getZoom());
    });

    // Create Canvas Overlay (two layers: background + foreground)
    const bgCanvas = document.createElement('canvas');
    const fgCanvas = document.createElement('canvas');
    bgCanvasRef.current = bgCanvas;
    fgCanvasRef.current = fgCanvas;

    class CanvasOverlay extends window.google.maps.OverlayView {
      onAdd() {
        const pane = this.getPanes().overlayLayer;

        bgCanvas.style.position = 'absolute';
        bgCanvas.style.top = '0';
        bgCanvas.style.left = '0';
        bgCanvas.style.pointerEvents = 'none';
        pane.appendChild(bgCanvas);

        fgCanvas.style.position = 'absolute';
        fgCanvas.style.top = '0';
        fgCanvas.style.left = '0';
        fgCanvas.style.pointerEvents = 'none';
        pane.appendChild(fgCanvas);
      }

      draw() {
        const projection = this.getProjection();
        if (!projection) return;

        projectionRef.current = projection;

        const mapDiv = googleMap.getDiv();
        const width = mapDiv.offsetWidth;
        const height = mapDiv.offsetHeight;

        [bgCanvas, fgCanvas].forEach((c) => {
          c.style.width = width + 'px';
          c.style.height = height + 'px';
          c.style.position = 'absolute';
          c.style.top = '0';
          c.style.left = '0';
          c.style.pointerEvents = 'none';
          const dpr = window.devicePixelRatio || 1;
          if (c.width !== width * dpr || c.height !== height * dpr) {
            c.width = width * dpr;
            c.height = height * dpr;
          }
        });
      }

      onRemove() {
        if (bgCanvas.parentNode) bgCanvas.parentNode.removeChild(bgCanvas);
        if (fgCanvas.parentNode) fgCanvas.parentNode.removeChild(fgCanvas);
      }
    }

    const overlay = new CanvasOverlay();
    overlay.setMap(googleMap);
    overlayRef.current = overlay;

    // Click handler (Context Aware) — use ref-stable finder to avoid stale closures
    googleMap.addListener('click', (e) => {
        if (modeRef.current === 'routing') {
          const latLng = e.latLng;
          if (!originRef.current) {
            onOriginSelectedRef.current(`Point A (${latLng.lat().toFixed(4)}, ${latLng.lng().toFixed(4)})`, latLng);
          } else if (!destinationRef.current) {
            onDestinationSelectedRef.current(`Point B (${latLng.lat().toFixed(4)}, ${latLng.lng().toFixed(4)})`, latLng);
          }
        } else {
          const clicked = findEntityAtLatLngRef.current(e.latLng.lat(), e.latLng.lng());
          setClickedEntity(clicked);
        }
    });

    // Hover handler (use ref-stable finder)
    googleMap.addListener('mousemove', (e) => {
      if (modeRef.current === 'simulation') {
        const hovered = findEntityAtLatLngRef.current(e.latLng.lat(), e.latLng.lng());
        setHoveredEntity(hovered);
      } else {
        setHoveredEntity(null);
      }
    });

    if (onMapReady) {
      onMapReady(googleMap);
    }

    return () => {
      overlay.setMap(null);
      mapRef.current = null;
    };
  }, [mapsLoaded, cityData, onMapReady]);

  // Handle markers and directions rendering inside 'routing' mode
  useEffect(() => {
    if (!mapsLoaded || !mapRef.current || mode !== 'routing') {
      // Clear markers and routes if not in routing mode
      if (originMarkerRef.current) originMarkerRef.current.setMap(null);
      if (destinationMarkerRef.current) destinationMarkerRef.current.setMap(null);
      if (directionsRendererRef.current) directionsRendererRef.current.setDirections({ routes: [] });
      originMarkerRef.current = null;
      destinationMarkerRef.current = null;
      return;
    }

    const map = mapRef.current;

    // Manage Origin Marker
    if (origin && origin.location) {
      if (originMarkerRef.current) {
        originMarkerRef.current.setPosition(origin.location);
      } else {
        originMarkerRef.current = new window.google.maps.Marker({
          position: origin.location,
          map: map,
          draggable: true,
          label: { text: 'A', color: '#ffffff', fontWeight: 'bold' },
          icon: {
            path: window.google.maps.SymbolPath.CIRCLE,
            fillColor: '#6366f1', // Neon Indigo
            fillOpacity: 0.9,
            strokeColor: '#ffffff',
            strokeWeight: 2,
            scale: 12,
          }
        });

        originMarkerRef.current.addListener('dragend', () => {
          const pos = originMarkerRef.current.getPosition();
          if (onOriginSelectedRef.current) onOriginSelectedRef.current(`Point A (${pos.lat().toFixed(4)}, ${pos.lng().toFixed(4)})`, pos);
        });
      }
    } else {
      if (originMarkerRef.current) {
        originMarkerRef.current.setMap(null);
        originMarkerRef.current = null;
      }
    }

    // Manage Destination Marker
    if (destination && destination.location) {
      if (destinationMarkerRef.current) {
        destinationMarkerRef.current.setPosition(destination.location);
      } else {
        destinationMarkerRef.current = new window.google.maps.Marker({
          position: destination.location,
          map: map,
          draggable: true,
          label: { text: 'B', color: '#ffffff', fontWeight: 'bold' },
          icon: {
            path: window.google.maps.SymbolPath.CIRCLE,
            fillColor: '#f43f5e', // Neon Rose
            fillOpacity: 0.9,
            strokeColor: '#ffffff',
            strokeWeight: 2,
            scale: 12,
          }
        });

        destinationMarkerRef.current.addListener('dragend', () => {
          const pos = destinationMarkerRef.current.getPosition();
          if (onDestinationSelectedRef.current) onDestinationSelectedRef.current(`Point B (${pos.lat().toFixed(4)}, ${pos.lng().toFixed(4)})`, pos);
        });
      }
    } else {
      if (destinationMarkerRef.current) {
        destinationMarkerRef.current.setMap(null);
        destinationMarkerRef.current = null;
      }
    }

    // Get Directions
    if (origin?.location && destination?.location) {
      directionsServiceRef.current.route({
        origin: origin.location,
        destination: destination.location,
        travelMode: window.google.maps.TravelMode.DRIVING,
        provideRouteAlternatives: true,
      }, (response, status) => {
        if (status === 'OK') {
          hasRoutesRef.current = true;
          onRoutesCalculated(response.routes);
          directionsRendererRef.current.setDirections(response);
          directionsRendererRef.current.setRouteIndex(selectedRouteIndex);
        } else {
          console.warn('Google Maps Directions Service failed:', status);
        }
      });
    } else {
      // Clear route lines if incomplete Origin/Destination
      if (directionsRendererRef.current) {
        directionsRendererRef.current.setDirections({ routes: [] });
      }
      if (hasRoutesRef.current) {
        hasRoutesRef.current = false;
        onRoutesCalculated([]);
      }
    }
  }, [origin, destination, mode, mapsLoaded, onRoutesCalculated, selectedRouteIndex]);

  // Sync selected index of active route
  useEffect(() => {
    if (directionsRendererRef.current && mode === 'routing') {
      directionsRendererRef.current.setRouteIndex(selectedRouteIndex);
    }
  }, [selectedRouteIndex, mode]);

  // Project coordinate function using current Google Map projection
  const project = (lng, lat) => {
    if (!projectionRef.current) return [0, 0];
    const latLng = new window.google.maps.LatLng(lat, lng);
    const pos = projectionRef.current.fromLatLngToDivPixel(latLng);
    return [pos.x, pos.y];
  };

  const handleContainerMouseMove = (e) => {
    setMousePos({ x: e.clientX, y: e.clientY });
  };

  // Close the floating popup
  const handleClosePopup = () => {
    setClickedEntity(null);
  };

  // Toggle a road closure policy for the given edge id (best-effort)
  const handleToggleRoadClosure = async (edgeId, currentlyClosed) => {
    try {
      if (api && api.applyPolicy) {
        if (currentlyClosed) {
          await api.resetPolicies(null, null, [edgeId]);
        } else {
          await api.applyPolicy('CLOSE_ROAD', null, {}, [edgeId]);
        }
      } else {
        console.warn('API applyPolicy/resetPolicies unavailable');
      }
    } catch (err) {
      console.warn('toggleRoadClosure failed:', err);
    }
  };

  // 4. Drawing and animation loop (Simulation Mode Only)
  useEffect(() => {
    const bg = bgCanvasRef.current;
    const fg = fgCanvasRef.current;
    if (!bg || !fg || !cityData || !mapRef.current) return;

    const nativeGetContextFg = fg.getContext && fg.getContext.bind(fg);
    const nativeGetContextBg = bg.getContext && bg.getContext.bind(bg);

    const ctxFg = (typeof nativeGetContextFg === 'function' ? nativeGetContextFg('2d') : null) || {
      clearRect: () => {},
      save: () => {},
      restore: () => {},
      beginPath: () => {},
      arc: () => {},
      fill: () => {},
      stroke: () => {},
      moveTo: () => {},
      lineTo: () => {},
      translate: () => {},
      rotate: () => {},
      fillText: () => {},
      createRadialGradient: () => ({ addColorStop: () => {} }),
      measureText: () => ({ width: 0 }),
      putImageData: () => {},
      setTransform: () => {},
      resetTransform: () => {},
      scale: () => {},
    };

    const ctxBg = (typeof nativeGetContextBg === 'function' ? nativeGetContextBg('2d') : null) || ctxFg;

    let animationFrameId;

    const renderBackground = () => {
      try {
        const mapDiv = mapRef.current.getDiv();
        const width = mapDiv.offsetWidth;
        const height = mapDiv.offsetHeight;
        const dpr = window.devicePixelRatio || 1;
        const w = width * dpr;
        const h = height * dpr;
        if (bg.width !== w || bg.height !== h) {
          bg.width = w;
          bg.height = h;
        }
        ctxBg.resetTransform && ctxBg.resetTransform();
        ctxBg.scale && ctxBg.scale(dpr, dpr);
        ctxBg.clearRect(0, 0, width, height);

        const zoom = mapRef.current.getZoom();
        const scaleFactor = Math.pow(2, zoom - 15.5);

        // Draw base road geometry
        const nm = nodeMapRef.current || {};
        (edgesListRef.current || []).forEach((edge) => {
          const fromNode = nm[edge.properties.from];
          const toNode = nm[edge.properties.to];
          if (!fromNode || !toNode) return;
          const [ax, ay] = project(fromNode.coords[0], fromNode.coords[1]);
          const [bx, by] = project(toNode.coords[0], toNode.coords[1]);
          ctxBg.strokeStyle = '#1f2937';
          ctxBg.lineWidth = 1.0 * scaleFactor;
          ctxBg.beginPath();
          ctxBg.moveTo(ax, ay);
          ctxBg.lineTo(bx, by);
          ctxBg.stroke();
        });

        // Draw base nodes
        Object.values(nm).forEach((n) => {
          const [x, y] = project(n.coords[0], n.coords[1]);
          ctxBg.fillStyle = '#94a3b8';
          ctxBg.beginPath();
          ctxBg.arc(x, y, 2 * scaleFactor, 0, Math.PI * 2);
          ctxBg.fill();
        });
      } catch (e) {
        // Ignore background render errors
      }
    };

    const render = () => {
      // Throttle rendering to MAX_FPS
      const nowMs = (performance && performance.now ? performance.now() : Date.now());
      const minInterval = 1000 / MAX_FPS;
      if (nowMs - lastRenderRef.current < minInterval) {
        animationFrameId = requestAnimationFrame(render);
        return;
      }
      lastRenderRef.current = nowMs;

      if (mode !== 'simulation') {
        // Clear foreground once when switching out of simulation
        const dpr = window.devicePixelRatio || 1;
        const width = fg.width / dpr;
        const height = fg.height / dpr;
        ctxFg.resetTransform && ctxFg.resetTransform();
        ctxFg.scale && ctxFg.scale(dpr, dpr);
        ctxFg.clearRect && ctxFg.clearRect(0, 0, width, height);
        return; // Exit loop completely to avoid forced reflow
      }

      animTimeRef.current += 0.05;

      const mapDiv = mapRef.current.getDiv();
      const width = mapDiv.offsetWidth;
      const height = mapDiv.offsetHeight;

      const dpr = window.devicePixelRatio || 1;
      if (fg.width !== width * dpr || fg.height !== height * dpr) {
        fg.width = width * dpr;
        fg.height = height * dpr;
      }

      ctxFg.resetTransform && ctxFg.resetTransform();
      ctxFg.scale && ctxFg.scale(dpr, dpr);
      ctxFg.clearRect && ctxFg.clearRect(0, 0, width, height);

      const zoom = mapRef.current.getZoom();
      const scaleFactor = Math.pow(2, zoom - 15.5);

      // Draw vehicles on foreground
      const nodeMap = nodeMapRef.current || {};
      vehicles.forEach((v) => {
        const fromNode = nodeMap[v.edge_from];
        const toNode = nodeMap[v.edge_to];
        if (!fromNode || !toNode) return;

        const [ax, ay] = project(fromNode.coords[0], fromNode.coords[1]);
        const [bx, by] = project(toNode.coords[0], toNode.coords[1]);

        const dx = bx - ax;
        const dy = by - ay;
        const len = Math.sqrt(dx * dx + dy * dy);
        if (len === 0) return;

        const nx = dx / len;
        const ny = dy / len;
        const offsetDist = Math.max(1.2, 2.5 * scaleFactor);
        const ox = ny * offsetDist;
        const oy = -nx * offsetDist;

        const sfx = ax + ox;
        const sfy = ay + oy;
        const stx = bx + ox;
        const sty = by + oy;

        const p = v.progress || 0;
        const vx = sfx + (stx - sfx) * p;
        const vy = sfy + (sty - sfy) * p;

        let vColor = '#a78bfa';
        let radius = 2.5 * scaleFactor;

        if (v.type === 'bus') {
          vColor = '#f59e0b';
          radius = 3.6 * scaleFactor;
        } else if (v.type === 'truck') {
          vColor = '#f97316';
          radius = 3.6 * scaleFactor;
        } else if (v.type === 'motorcycle') {
          vColor = '#06b6d4';
          radius = 1.8 * scaleFactor;
        }

        if (v.honking) {
          const honkPulse = (1.5 + Math.sin(animTimeRef.current * 3.5)) * 3 * scaleFactor;
          ctxFg.strokeStyle = 'rgba(244, 63, 94, 0.45)';
          ctxFg.lineWidth = 1;
          ctxFg.beginPath();
          ctxFg.arc(vx, vy, radius + honkPulse, 0, Math.PI * 2);
          ctxFg.stroke();
        }

        ctxFg.fillStyle = vColor;
        ctxFg.beginPath();
        ctxFg.arc(vx, vy, radius, 0, Math.PI * 2);
        ctxFg.fill();

        ctxFg.strokeStyle = '#ffffff';
        ctxFg.lineWidth = 0.5 * scaleFactor;
        ctxFg.beginPath();
        ctxFg.arc(vx, vy, radius, 0, Math.PI * 2);
        ctxFg.stroke();
      });

      // Draw accidents as pulses
      accidents.forEach((a) => {
        const fromNode = nodeMap[a.from_node];
        const toNode = nodeMap[a.to_node];
        if (!fromNode || !toNode) return;
        const [ax, ay] = project(fromNode.coords[0], fromNode.coords[1]);
        const [bx, by] = project(toNode.coords[0], toNode.coords[1]);
        const mx = (ax + bx) / 2;
        const my = (ay + by) / 2;
        const pulse = (1.2 + Math.sin(animTimeRef.current * 1.5)) * 0.5;
        const maxRad = (8 + (a.severity || 0.5) * 10) * scaleFactor * pulse;
        ctxFg.fillStyle = 'rgba(239, 68, 68, 0.2)';
        ctxFg.beginPath();
        ctxFg.arc(mx, my, maxRad, 0, Math.PI * 2);
        ctxFg.fill();
      });

      animationFrameId = requestAnimationFrame(render);
    };

    renderBackground();
    render();

    return () => {
      cancelAnimationFrame(animationFrameId);
    };
  }, [cityData, edgesState, nodesState, vehicles, accidents, layerVisibility, hoveredEntity, clickedEntity, zoomLevel, mode]);

  return (
    <div 
      className="map-container" 
      ref={mapContainerRef}
      onMouseMove={handleContainerMouseMove}
      style={{ position: 'relative', width: '100%', height: '100%' }}
    >
      {!mapsLoaded && (
        <div style={{
          position: 'absolute',
          top: 0,
          left: 0,
          width: '100%',
          height: '100%',
          background: 'var(--bg-primary)',
          display: 'flex',
          justifyContent: 'center',
          alignItems: 'center',
          zIndex: 100,
          color: 'var(--text-secondary)',
          fontSize: 'var(--text-base)',
          fontFamily: 'var(--font-sans)',
        }}>
          <div>Loading Google Maps Engine...</div>
        </div>
      )}

      {/* Floating Glassmorphic Click Popup (Simulation Mode Only) */}
      {clickedEntity && mode === 'simulation' && (
        <div 
          className="glass-card animate-slide-up"
          style={{
            position: 'absolute',
            top: '80px',
            left: '20px',
            zIndex: 40,
            width: '280px',
            pointerEvents: 'auto',
          }}
        >
          <div className="glass-card-header" style={{ justifyContent: 'space-between' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span style={{ fontSize: '18px' }}>
                {clickedEntity.type === 'node' ? '🚦' : '🛣️'}
              </span>
              <h3>
                {clickedEntity.type === 'node' 
                  ? `Intersection ${clickedEntity.id}` 
                  : `${clickedEntity.properties.road_type?.toUpperCase()} Road`}
              </h3>
            </div>
            <button 
              onClick={handleClosePopup}
              style={{
                background: 'transparent',
                border: 'none',
                color: 'var(--text-secondary)',
                cursor: 'pointer',
                fontSize: '16px',
                fontWeight: 'bold',
                padding: '2px 6px',
              }}
            >
              ✕
            </button>
          </div>
          <div className="glass-card-body" style={{ display: 'flex', flexDirection: 'column', gap: '8px', fontSize: '12px' }}>
            {clickedEntity.type === 'node' ? (
              <Fragment>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ color: 'var(--text-secondary)' }}>Zone:</span>
                  <strong style={{ color: 'var(--accent-violet)' }}>{clickedEntity.properties.zone}</strong>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ color: 'var(--text-secondary)' }}>Signal State:</span>
                  <strong style={{ 
                    color: clickedEntity.properties.signal === 'green' ? 'var(--accent-emerald)' : 
                           clickedEntity.properties.signal === 'yellow' ? 'var(--accent-amber)' : 'var(--accent-rose)'
                  }}>
                    {clickedEntity.properties.signal?.toUpperCase()}
                  </strong>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ color: 'var(--text-secondary)' }}>Pollution:</span>
                  <strong style={{ color: 'var(--accent-amber)' }}>{clickedEntity.properties.pollution?.toFixed(1) || 0} API</strong>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ color: 'var(--text-secondary)' }}>Noise Level:</span>
                  <strong style={{ color: 'var(--accent-fuchsia)' }}>{clickedEntity.properties.noise?.toFixed(1) || 0} dB</strong>
                </div>
              </Fragment>
            ) : (
              <Fragment>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ color: 'var(--text-secondary)' }}>From → To:</span>
                  <strong>{clickedEntity.properties.from} → {clickedEntity.properties.to}</strong>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ color: 'var(--text-secondary)' }}>Active Vehicles:</span>
                  <strong style={{ color: 'var(--accent-violet)' }}>{clickedEntity.properties.vehicles || 0} / {clickedEntity.properties.capacity}</strong>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ color: 'var(--text-secondary)' }}>Avg Speed:</span>
                  <strong style={{ color: 'var(--accent-cyan)' }}>{clickedEntity.properties.speed?.toFixed(1) || 0} km/h</strong>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ color: 'var(--text-secondary)' }}>Speed Limit:</span>
                  <strong>{clickedEntity.properties.speed_limit?.toFixed(0)} km/h</strong>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ color: 'var(--text-secondary)' }}>Congestion:</span>
                  <strong style={{ 
                    color: clickedEntity.properties.congestion > 0.8 ? 'var(--accent-rose)' : 
                           clickedEntity.properties.congestion > 0.5 ? 'var(--accent-amber)' : 'var(--accent-emerald)'
                  }}>
                    {((clickedEntity.properties.congestion || 0) * 100).toFixed(0)}%
                  </strong>
                </div>
                {clickedEntity.properties.accident && (
                  <div style={{ color: 'var(--accent-rose)', fontWeight: 'bold', display: 'flex', alignItems: 'center', gap: '4px', marginTop: '4px' }}>
                    ⚠️ Accident Reported on Road
                  </div>
                )}
                {clickedEntity.properties.is_closed && (
                  <div style={{ color: 'var(--accent-amber)', fontWeight: 'bold', display: 'flex', alignItems: 'center', gap: '4px', marginTop: '4px' }}>
                    🚧 Road Closed (Policy Active)
                  </div>
                )}
                <button
                  onClick={() => handleToggleRoadClosure(clickedEntity.id, clickedEntity.properties.is_closed)}
                  style={{
                    marginTop: '8px',
                    padding: '6px 12px',
                    borderRadius: '4px',
                    border: '1px solid var(--glass-border)',
                    background: clickedEntity.properties.is_closed ? 'rgba(16, 185, 129, 0.1)' : 'rgba(239, 68, 68, 0.1)',
                    color: clickedEntity.properties.is_closed ? 'var(--accent-emerald)' : 'var(--accent-rose)',
                    cursor: 'pointer',
                    fontSize: '11px',
                    fontWeight: '600',
                    textAlign: 'center',
                  }}
                >
                  {clickedEntity.properties.is_closed ? '🔓 Reopen Road' : '🚧 Close Road'}
                </button>
              </Fragment>
            )}
          </div>
        </div>
      )}

      {/* Floating Hover Tooltip (Simulation Mode Only) */}
      {hoveredEntity && !clickedEntity && mode === 'simulation' && (
        <div
          style={{
            position: 'fixed',
            top: mousePos.y + 12 + 'px',
            left: mousePos.x + 12 + 'px',
            background: 'var(--glass-bg)',
            backdropFilter: 'blur(8px)',
            border: '1px solid var(--glass-border)',
            borderRadius: '6px',
            padding: '6px 12px',
            pointerEvents: 'none',
            zIndex: 50,
            fontSize: '11px',
            boxShadow: 'var(--shadow-md)',
            color: 'var(--text-primary)',
          }}
        >
          {hoveredEntity.type === 'node' ? (
            <div>
              <strong>🚦 Intersection {hoveredEntity.id}</strong> (Zone {hoveredEntity.properties.zone})
              <div style={{ color: 'var(--text-secondary)', marginTop: '2px' }}>
                Signal: <span style={{ color: hoveredEntity.properties.signal === 'green' ? 'var(--accent-emerald)' : 'var(--accent-rose)' }}>{hoveredEntity.properties.signal}</span>
              </div>
            </div>
          ) : (
            <div>
              <strong>🛣️ {hoveredEntity.properties.road_type?.toUpperCase()} ROAD</strong>
              <div style={{ color: 'var(--text-secondary)', marginTop: '2px' }}>
                Congestion: <span style={{ color: hoveredEntity.properties.congestion > 0.7 ? 'var(--accent-rose)' : 'var(--accent-emerald)' }}>{((hoveredEntity.properties.congestion || 0) * 100).toFixed(0)}%</span>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );

}
export default memo(CityMap, (prevProps, nextProps) => {
  // If mode changed, we MUST re-render
  if (prevProps.mode !== nextProps.mode) return false;

  if (nextProps.mode === 'simulation') {
    // In simulation mode, we only care about simulation props
    return (
      prevProps.cityData === nextProps.cityData &&
      prevProps.edgesState === nextProps.edgesState &&
      prevProps.nodesState === nextProps.nodesState &&
      prevProps.vehicles === nextProps.vehicles &&
      prevProps.accidents === nextProps.accidents &&
      prevProps.layerVisibility === nextProps.layerVisibility
    );
  } else {
    // In routing mode, we only care about routing props
    return (
      prevProps.origin === nextProps.origin &&
      prevProps.destination === nextProps.destination &&
      prevProps.selectedRouteIndex === nextProps.selectedRouteIndex
    );
  }
});
