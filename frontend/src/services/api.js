/**
 * API Service — REST + WebSocket client for the simulation backend.
 * 
 * Centralizes all network communication.
 * WebSocket includes auto-reconnect with exponential backoff.
 */

const API_BASE = '/api';

// ── REST API Client ──────────────────────────────────────────────

async function fetchJSON(url, options = {}) {
  const response = await fetch(`${API_BASE}${url}`, {
    headers: { 'Content-Type': 'application/json' },
    ...options,
  });
  if (!response.ok) {
    throw new Error(`API error: ${response.status} ${response.statusText}`);
  }
  return response.json();
}

export const api = {
  /** Get full city state (initial load) */
  getCity: () => fetchJSON('/city'),

  /** Get current metrics */
  getMetrics: () => fetchJSON('/metrics'),

  /** Get available policies */
  getAvailablePolicies: () => fetchJSON('/policies/available'),

  /** Get active policies */
  getActivePolicies: () => fetchJSON('/policies/active'),

  /** Apply a policy */
  applyPolicy: (policyType, zoneId, parameters = {}, edgeIds = null) =>
    fetchJSON('/policies/apply', {
      method: 'POST',
      body: JSON.stringify({
        policy_type: policyType,
        zone_id: zoneId,
        edge_ids: edgeIds,
        parameters,
      }),
    }),

  /** Reset policies */
  resetPolicies: (zoneId = null, policyType = null, edgeIds = null) =>
    fetchJSON('/policies/reset', {
      method: 'POST',
      body: JSON.stringify({ zone_id: zoneId, policy_type: policyType, edge_ids: edgeIds }),
    }),

  /** Control simulation */
  controlSimulation: (action, speed = null) =>
    fetchJSON('/simulation/control', {
      method: 'POST',
      body: JSON.stringify({ action, speed }),
    }),

  /** Get AI recommendations */
  getRecommendations: () => fetchJSON('/ai/recommendations'),

  /** Toggle AI autopilot */
  toggleAutopilot: () =>
    fetchJSON('/ai/autopilot', { method: 'POST' }),

  /** Get zone metrics */
  getZoneMetrics: (zoneId) => fetchJSON(`/zones/${zoneId}/metrics`),
};


// ── WebSocket Client ─────────────────────────────────────────────

export class SimulationWebSocket {
  constructor(onMessage, onStatusChange) {
    this.onMessage = onMessage;
    this.onStatusChange = onStatusChange;
    this.ws = null;
    this.reconnectAttempts = 0;
    this.maxReconnectAttempts = 10;
    this.reconnectDelay = 1000;
    this.isIntentionallyClosed = false;
  }

  connect() {
    this.isIntentionallyClosed = false;
    this.onStatusChange?.('connecting');

    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = `${protocol}//${window.location.host}/ws`;

    try {
      this.ws = new WebSocket(wsUrl);
    } catch (err) {
      console.warn('WebSocket connection error', err);
      this.onStatusChange?.('disconnected');
      this._scheduleReconnect();
      return;
    }

    this.ws.onopen = () => {
      this.reconnectAttempts = 0;
      this.reconnectDelay = 1000;
      this.onStatusChange?.('connected');
    };

    this.ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        if (data && data.type === 'batch' && Array.isArray(data.messages)) {
          // Dispatch each message in the batch to the handler
          data.messages.forEach((m) => {
            try { this.onMessage?.(m); } catch (e) { /* ignore handler errors */ }
          });
        } else {
          this.onMessage?.(data);
        }
      } catch (e) {
        console.warn('Failed to parse WebSocket message:', e);
      }
    };

    this.ws.onclose = () => {
      if (!this.isIntentionallyClosed) {
        this.onStatusChange?.('disconnected');
        this._scheduleReconnect();
      }
    };

    this.ws.onerror = () => {
      this.onStatusChange?.('disconnected');
    };
  }

  send(data) {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(data));
    }
  }

  sendControl(action, speed = null) {
    this.send({ type: 'control', action, speed });
  }

  disconnect() {
    this.isIntentionallyClosed = true;
    this.ws?.close();
  }

  _scheduleReconnect() {
    if (this.reconnectAttempts >= this.maxReconnectAttempts) {
      this.onStatusChange?.('failed');
      return;
    }

    this.reconnectAttempts++;
    const delay = Math.min(this.reconnectDelay * Math.pow(1.5, this.reconnectAttempts), 15000);

    setTimeout(() => {
      if (!this.isIntentionallyClosed) {
        this.connect();
      }
    }, delay);
  }
}

export default api;
