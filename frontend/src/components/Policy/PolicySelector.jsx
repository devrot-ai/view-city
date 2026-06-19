/**
 * PolicySelector — Policy selection, zone targeting, and application panel.
 */

import React, { useState, useEffect } from 'react';
import GlassCard from '../UI/GlassCard';
import ImpactPreview from './ImpactPreview';
import api from '../../services/api';

const POLICY_ICONS = {
  BAN_HONKING: '🔇',
  CLOSE_ROAD: '🚧',
  SPEED_LIMIT: '🐌',
  GREEN_CORRIDOR: '🟢',
};

export default function PolicySelector({ zones = [], activePolicies = {} }) {
  const [policies, setPolicies] = useState([]);
  const [selectedPolicy, setSelectedPolicy] = useState(null);
  const [selectedZone, setSelectedZone] = useState('');
  const [impact, setImpact] = useState(null);
  const [loading, setLoading] = useState(false);

  // Fetch available policies
  useEffect(() => {
    api.getAvailablePolicies()
      .then(data => setPolicies(data.policies || []))
      .catch(() => {});
  }, []);

  const handleApply = async () => {
    if (!selectedPolicy || !selectedZone) return;

    setLoading(true);
    try {
      const result = await api.applyPolicy(
        selectedPolicy.type,
        selectedZone,
        selectedPolicy.default_parameters || {}
      );
      setImpact(result);
    } catch (e) {
      console.error('Failed to apply policy:', e);
    } finally {
      setLoading(false);
    }
  };

  const handleReset = async () => {
    setLoading(true);
    try {
      await api.resetPolicies();
      setImpact(null);
    } catch (e) {
      console.error('Failed to reset policies:', e);
    } finally {
      setLoading(false);
    }
  };

  const activeKeys = Object.keys(activePolicies);

  return (
    <GlassCard title="Policies" icon="📋">
      <div className="policy-list">
        {policies.map(policy => {
          const isActive = activeKeys.some(k => k.startsWith(policy.type));
          const isSelected = selectedPolicy?.type === policy.type;

          return (
            <div
              key={policy.type}
              className={`policy-card ${isActive ? 'active' : ''} ${isSelected ? 'active' : ''}`}
              onClick={() => setSelectedPolicy(isSelected ? null : policy)}
              id={`policy-${policy.type}`}
            >
              <div className="policy-card-header">
                <span className="policy-name">
                  {POLICY_ICONS[policy.type] || '📌'} {policy.name}
                </span>
                {isActive && (
                  <span className="policy-badge active">Active</span>
                )}
              </div>
              <p className="policy-description">{policy.description}</p>
            </div>
          );
        })}
      </div>

      {selectedPolicy && (
        <>
          {/* Zone Selector */}
          <select
            className="zone-select"
            value={selectedZone}
            onChange={(e) => setSelectedZone(e.target.value)}
            id="zone-select"
          >
            <option value="">Select a zone...</option>
            {zones.map(z => (
              <option key={z} value={z}>{z}</option>
            ))}
          </select>

          <button
            className="btn-apply"
            onClick={handleApply}
            disabled={!selectedZone || loading}
            id="btn-apply-policy"
          >
            {loading ? 'Applying...' : `Apply ${selectedPolicy.name}`}
          </button>

          <button
            className="btn-reset"
            onClick={handleReset}
            disabled={loading}
            id="btn-reset-policies"
          >
            Reset All Policies
          </button>

          {/* Impact Preview */}
          {impact && <ImpactPreview impact={impact} />}
        </>
      )}
    </GlassCard>
  );
}
