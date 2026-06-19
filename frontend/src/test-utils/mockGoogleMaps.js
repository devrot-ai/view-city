export default function setupMockGoogleMaps() {
  if (typeof window === 'undefined') return;
  window.__mockMaps = window.__mockMaps || [];
  window.google = window.google || {};
  window.google.maps = window.google.maps || {};

  class MockMap {
    constructor(el, opts) {
      this._listeners = {};
      this._div = document.createElement('div');
      Object.defineProperty(this._div, 'offsetWidth', { get: () => 800 });
      Object.defineProperty(this._div, 'offsetHeight', { get: () => 600 });
      this.getDiv = () => this._div;
      this.getZoom = () => 15.5;
      this._listeners = {};
      window.__mockMaps.push(this);
    }
    addListener(event, cb) {
      this._listeners[event] = this._listeners[event] || [];
      this._listeners[event].push(cb);
      return { remove: () => {} };
    }
    trigger(event, arg) {
      (this._listeners[event] || []).forEach((fn) => fn(arg));
    }
    getPanes() { return { overlayLayer: this._div }; }
  }

  class LatLng {
    constructor(lat, lng) { this._lat = lat; this._lng = lng; }
    lat() { return this._lat; }
    lng() { return this._lng; }
  }

  class OverlayView {
    setMap(map) { this._map = map; if (this.onAdd) this.onAdd(); if (this.draw) this.draw(); }
    getPanes() { return { overlayLayer: document.createElement('div') }; }
    getProjection() {
      return {
        fromLatLngToDivPixel: (latLng) => ({ x: Math.round((latLng.lng() + 180) * 2), y: Math.round((latLng.lat() + 90) * 2) })
      };
    }
  }

  class Marker {
    constructor(opts) { this._position = opts.position; this._map = opts.map; this._listeners = {}; }
    setPosition(pos) { this._position = pos; }
    getPosition() { return this._position; }
    addListener(event, cb) { this._listeners[event] = this._listeners[event] || []; this._listeners[event].push(cb); return { remove: ()=>{} }; }
    setMap(map) { this._map = map; }
  }

  class DirectionsService {
    route(opts, cb) { cb({ routes: [] }, 'OK'); }
  }

  class DirectionsRenderer {
    constructor(opts) { this._map = opts && opts.map; }
    setDirections() {}
    setRouteIndex() {}
    setMap() {}
  }

  window.google.maps.Map = MockMap;
  window.google.maps.LatLng = LatLng;
  window.google.maps.OverlayView = OverlayView;
  window.google.maps.Marker = Marker;
  window.google.maps.DirectionsService = DirectionsService;
  window.google.maps.DirectionsRenderer = DirectionsRenderer;
  window.google.maps.SymbolPath = { CIRCLE: 'CIRCLE' };
  window.google.maps.TravelMode = { DRIVING: 'DRIVING' };
  window.google.maps.event = { removeListener: () => {} };
}
