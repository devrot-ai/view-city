/**
 * CityMap — Google Maps + High-performance HTML5 Canvas 2D overlay.
 * 
 * Supports two distinct operational modes:
 * 1. 'simulation': Concentric circular digital twin of Connaught Place, New Delhi.
 * 2. 'routing': India-wide AI Route Optimization using Directions Service and Autocomplete.
 */

import { useEffect, useRef, useState, memo } from 'react';
import api from '../../services/api';

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

  // Sync refs to avoid stale closures in event listeners
  const modeRef = useRef(mode);
  const originRef = useRef(origin);
  const destinationRef = useRef(destination);

  useEffect(() => { modeRef.current = mode; }, [mode]);
  useEffect(() => { originRef.current = origin; }, [origin]);
  useEffect(() => { destinationRef.current = destination; }, [destination]);

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


  // 2. Compute geographic distance for mouse collision check
  const getGeoDistance = (lat1, lng1, lat2, lng2) => {
    const dy = lat1 - lat2;
    const dx = (lng1 - lng2) * Math.cos(28.63 * Math.PI / 180);
    return Math.sqrt(dx * dx + dy * dy);
  };

  // Find nearest segment from point to line in lat/lng degrees space
  const distanceToSegmentGeo = (px, py, ax, ay, bx, by) => {
    const cosLat = Math.cos(28.63 * Math.PI / 180);
    const pax = (py - ay) * cosLat;
    const pay = px - ax;
    const bax = (by - ay) * cosLat;
    const bay = bx - ax;

    const lenSq = bax * bax + bay * bay;
    if (lenSq === 0) return Math.sqrt(pax * pax + pay * pay);

    let t = (pax * bax + pay * bay) / lenSq;
    t = Math.max(0, Math.min(1, t));

    const projX = ax + t * (bx - ax);
    const projY = ay + t * (by - ay);

    const dx = (py - projY) * cosLat;
    const dy = px - projX;
    return Math.sqrt(dx * dx + dy * dy);
  };

  const findEntityAtLatLng = (lat, lng) => {
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
  };

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

    // Create Canvas Overlay
    const canvas = document.createElement('canvas');
    canvasRef.current = canvas;

    class CanvasOverlay extends window.google.maps.OverlayView {
      onAdd() {
        const pane = this.getPanes().overlayLayer;
        pane.appendChild(canvas);
      }

      draw() {
        const projection = this.getProjection();
        if (!projection) return;

        projectionRef.current = projection;

        const mapDiv = googleMap.getDiv();
        const width = mapDiv.offsetWidth;
        const height = mapDiv.offsetHeight;

        canvas.style.width = width + 'px';
        canvas.style.height = height + 'px';
        canvas.style.position = 'absolute';
        canvas.style.top = '0';
        canvas.style.left = '0';
        canvas.style.pointerEvents = 'none';
      }

      onRemove() {
        if (canvas.parentNode) {
          canvas.parentNode.removeChild(canvas);
        }
      }
    }

    const overlay = new CanvasOverlay();
    overlay.setMap(googleMap);
    overlayRef.current = overlay;

    // Click handler (Context Aware)
    googleMap.addListener('click', (e) => {
      if (modeRef.current === 'routing') {
        const latLng = e.latLng;
        if (!originRef.current) {
          onOriginSelected(`Point A (${latLng.lat().toFixed(4)}, ${latLng.lng().toFixed(4)})`, latLng);
        } else if (!destinationRef.current) {
          onDestinationSelected(`Point B (${latLng.lat().toFixed(4)}, ${latLng.lng().toFixed(4)})`, latLng);
        }
      } else {
        const clicked = findEntityAtLatLng(e.latLng.lat(), e.latLng.lng());
        setClickedEntity(clicked);
      }
    });

    // Hover handler
    googleMap.addListener('mousemove', (e) => {
      if (modeRef.current === 'simulation') {
        const hovered = findEntityAtLatLng(e.latLng.lat(), e.latLng.lng());
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
  }, [mapsLoaded, cityData]);

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
          onOriginSelected(`Point A (${pos.lat().toFixed(4)}, ${pos.lng().toFixed(4)})`, pos);
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
          onDestinationSelected(`Point B (${pos.lat().toFixed(4)}, ${pos.lng().toFixed(4)})`, pos);
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
  }, [origin, destination, mode, mapsLoaded]);

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
    const canvas = canvasRef.current;
    if (!canvas || !cityData || !mapRef.current) return;

    const ctx = canvas.getContext('2d');
    let animationFrameId;

    const render = () => {
      if (mode !== 'simulation') {
        // Clear canvas once when switching out of simulation
        const dpr = window.devicePixelRatio || 1;
        const width = canvas.width / dpr;
        const height = canvas.height / dpr;
        ctx.resetTransform();
        ctx.scale(dpr, dpr);
        ctx.clearRect(0, 0, width, height);
        return; // Exit loop completely to avoid forced reflow
      }

      animTimeRef.current += 0.05;

      const mapDiv = mapRef.current.getDiv();
      const width = mapDiv.offsetWidth;
      const height = mapDiv.offsetHeight;

      const dpr = window.devicePixelRatio || 1;
      if (canvas.width !== width * dpr || canvas.height !== height * dpr) {
        canvas.width = width * dpr;
        canvas.height = height * dpr;
      }
      
      ctx.resetTransform();
      ctx.scale(dpr, dpr);
      ctx.clearRect(0, 0, width, height);

      const zoom = mapRef.current.getZoom();
      const scaleFactor = Math.pow(2, zoom - 15.5);

      // Build Node lookup
      const nodeMap = {};
      for (const n of cityData.nodes.features) {
        nodeMap[n.properties.id] = {
          coords: n.geometry.coordinates,
          props: { ...n.properties, ...(nodesState[n.properties.id] || {}) }
        };
      }

      // === DRAW POLLUTION HEATMAP LAYER (Radial Gradients) ===
      if (layerVisibility.pollution) {
        ctx.save();
        ctx.globalCompositeOperation = 'screen';
        for (const nid in nodeMap) {
          const node = nodeMap[nid];
          const [lng, lat] = node.coords;
          const [x, y] = project(lng, lat);
          
          const pollutionVal = node.props.pollution || 0;
          if (pollutionVal > 2) {
            const rad = (30 + pollutionVal * 0.7) * scaleFactor;
            const grad = ctx.createRadialGradient(x, y, 0, x, y, rad);
            
            const opacity = 0.25 * Math.min(1, pollutionVal / 50);
            
            let colorStops = [
              [0, `rgba(239, 68, 68, ${opacity})`],
              [0.3, `rgba(245, 158, 11, ${opacity * 0.6})`],
              [0.6, `rgba(139, 92, 246, ${opacity * 0.3})`],
              [1, 'rgba(0, 0, 0, 0)']
            ];
            
            for (const [stop, col] of colorStops) {
              grad.addColorStop(stop, col);
            }
            
            ctx.fillStyle = grad;
            ctx.beginPath();
            ctx.arc(x, y, rad, 0, Math.PI * 2);
            ctx.fill();
          }
        }
        ctx.restore();
      }

      // === DRAW NOISE RIPPLES ===
      if (layerVisibility.noise) {
        ctx.save();
        for (const nid in nodeMap) {
          const node = nodeMap[nid];
          const [lng, lat] = node.coords;
          const [x, y] = project(lng, lat);
          
          const noiseVal = node.props.noise || 0;
          if (noiseVal > 30) {
            const maxRad = (15 + noiseVal * 0.45) * scaleFactor;
            const speed = 0.8;
            const t = (animTimeRef.current * speed) % 1.0;
            
            ctx.strokeStyle = `rgba(217, 70, 239, ${0.45 * (1 - t) * (noiseVal / 100)})`;
            ctx.lineWidth = 1.5;
            ctx.beginPath();
            ctx.arc(x, y, maxRad * t, 0, Math.PI * 2);
            ctx.stroke();

            ctx.fillStyle = `rgba(217, 70, 239, ${0.05 * (noiseVal / 100)})`;
            ctx.beginPath();
            ctx.arc(x, y, maxRad * t * 0.7, 0, Math.PI * 2);
            ctx.fill();
          }
        }
        ctx.restore();
      }

      // === DRAW ROADS (TRAFFIC SEGMENTS) ===
      if (layerVisibility.traffic) {
        cityData.edges.features.forEach((edge) => {
          const fromNode = nodeMap[edge.properties.from];
          const toNode = nodeMap[edge.properties.to];
          if (!fromNode || !toNode) return;

          const [fx, fy] = project(fromNode.coords[0], fromNode.coords[1]);
          const [tx, ty] = project(toNode.coords[0], toNode.coords[1]);

          const dx = tx - fx;
          const dy = ty - fy;
          const len = Math.sqrt(dx * dx + dy * dy);
          if (len === 0) return;

          const nx = dx / len;
          const ny = dy / len;
          
          const offsetDist = Math.max(1.2, 2.5 * scaleFactor); 
          const ox = ny * offsetDist;
          const oy = -nx * offsetDist;

          const sfx = fx + ox;
          const sfy = fy + oy;
          const stx = tx + ox;
          const sty = ty + oy;

          const dynamicEdge = edgesState[edge.properties.id] || {};
          const isClosed = dynamicEdge.is_closed !== undefined ? dynamicEdge.is_closed : edge.properties.is_closed;
          const congestion = dynamicEdge.congestion !== undefined ? dynamicEdge.congestion : edge.properties.congestion;
          const roadType = edge.properties.road_type || 'local';

          let lineWidth = 1.8 * scaleFactor;
          if (roadType === 'highway') lineWidth = 4 * scaleFactor;
          else if (roadType === 'main') lineWidth = 2.8 * scaleFactor;

          const isHovered = hoveredEntity?.type === 'edge' && hoveredEntity.id === edge.properties.id;
          const isClicked = clickedEntity?.type === 'edge' && clickedEntity.id === edge.properties.id;

          // Road Casing
          ctx.strokeStyle = isHovered || isClicked ? 'rgba(167, 139, 250, 0.7)' : '#070a14';
          ctx.lineWidth = lineWidth + (1.2 * scaleFactor);
          ctx.lineCap = 'round';
          ctx.beginPath();
          ctx.moveTo(sfx, sfy);
          ctx.lineTo(stx, sty);
          ctx.stroke();

          // Road Fill
          if (isClosed) {
            ctx.strokeStyle = '#374151';
          } else {
            let roadColor = '#10b981';
            if (congestion > 0.8) roadColor = '#ef4444';
            else if (congestion > 0.6) roadColor = '#f97316';
            else if (congestion > 0.4) roadColor = '#f59e0b';
            else if (congestion > 0.2) roadColor = '#84cc16';
            
            ctx.strokeStyle = roadColor;
          }

          ctx.lineWidth = lineWidth;
          ctx.beginPath();
          ctx.moveTo(sfx, sfy);
          ctx.lineTo(stx, sty);
          ctx.stroke();

          // Tiny directional arrows
          if (zoom > 14 && !isClosed) {
            ctx.fillStyle = 'rgba(255, 255, 255, 0.38)';
            const arrowSpacing = 70 * scaleFactor;
            const numArrows = Math.max(1, Math.floor(len / arrowSpacing));
            
            for (let i = 1; i <= numArrows; i++) {
              const fraction = i / (numArrows + 1);
              const ax = sfx + dx * fraction;
              const ay = sfy + dy * fraction;

              ctx.save();
              ctx.translate(ax, ay);
              ctx.rotate(Math.atan2(dy, dx));
              ctx.beginPath();
              ctx.moveTo(-2.5 * scaleFactor, -1.8 * scaleFactor);
              ctx.lineTo(1 * scaleFactor, 0);
              ctx.lineTo(-2.5 * scaleFactor, 1.8 * scaleFactor);
              ctx.fill();
              ctx.restore();
            }
          }
        });
      }

      // === DRAW INTERSECTIONS (TRAFFIC SIGNALS) ===
      cityData.nodes.features.forEach((node) => {
        const [lng, lat] = node.geometry.coordinates;
        const [x, y] = project(lng, lat);

        const dynamicNode = nodesState[node.properties.id] || {};
        const signal = dynamicNode.signal || node.properties.signal || 'green';

        let sigColor = '#22c55e';
        if (signal === 'yellow') sigColor = '#eab308';
        else if (signal === 'red') sigColor = '#ef4444';

        const isHovered = hoveredEntity?.type === 'node' && hoveredEntity.id === node.properties.id;
        const isClicked = clickedEntity?.type === 'node' && clickedEntity.id === node.properties.id;

        if (isHovered || isClicked) {
          ctx.shadowBlur = 12;
          ctx.shadowColor = sigColor;
          ctx.fillStyle = 'rgba(255, 255, 255, 0.9)';
          ctx.beginPath();
          ctx.arc(x, y, 6.5 * scaleFactor, 0, Math.PI * 2);
          ctx.fill();
          ctx.shadowBlur = 0;
        }

        ctx.fillStyle = '#0a0e1a';
        ctx.beginPath();
        ctx.arc(x, y, 4.8 * scaleFactor, 0, Math.PI * 2);
        ctx.fill();

        ctx.fillStyle = sigColor;
        ctx.beginPath();
        ctx.arc(x, y, 3.5 * scaleFactor, 0, Math.PI * 2);
        ctx.fill();
      });

      // === DRAW VEHICLES ===
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
          ctx.strokeStyle = 'rgba(244, 63, 94, 0.45)';
          ctx.lineWidth = 1;
          ctx.beginPath();
          ctx.arc(vx, vy, radius + honkPulse, 0, Math.PI * 2);
          ctx.stroke();
        }

        ctx.fillStyle = vColor;
        ctx.beginPath();
        ctx.arc(vx, vy, radius, 0, Math.PI * 2);
        ctx.fill();

        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 0.5 * scaleFactor;
        ctx.beginPath();
        ctx.arc(vx, vy, radius, 0, Math.PI * 2);
        ctx.stroke();
      });

      // === DRAW ACCIDENTS ===
      if (layerVisibility.accidents) {
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

          ctx.fillStyle = 'rgba(239, 68, 68, 0.2)';
          ctx.beginPath();
          ctx.arc(mx, my, maxRad, 0, Math.PI * 2);
          ctx.fill();

          ctx.strokeStyle = 'rgba(239, 68, 68, 0.45)';
          ctx.lineWidth = 1.2;
          ctx.beginPath();
          ctx.arc(mx, my, maxRad * 0.7, 0, Math.PI * 2);
          ctx.stroke();

          ctx.fillStyle = '#ef4444';
          ctx.beginPath();
          const r = 5 * scaleFactor;
          ctx.moveTo(mx, my - r);
          ctx.lineTo(mx - r, my + r);
          ctx.lineTo(mx + r, my + r);
          ctx.closePath();
          ctx.fill();

          ctx.fillStyle = '#ffffff';
          ctx.font = `bold ${7 * scaleFactor}px sans-serif`;
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.fillText('!', mx, my + r * 0.45);
        });
      }

      animationFrameId = requestAnimationFrame(render);
    };

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
              <>
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
              </>
            ) : (
              <>
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
              </>
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
