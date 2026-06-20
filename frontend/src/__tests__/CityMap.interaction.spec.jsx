// @vitest-environment jsdom
import React from 'react'; // eslint-disable-line no-unused-vars
import '@testing-library/jest-dom/vitest';
import { describe, expect, test } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import setupMockGoogleMaps from '../test-utils/mockGoogleMaps';

// Ensure the mock is installed before importing the component module
setupMockGoogleMaps();

import CityMap from '../components/Map/CityMap';

const cityData = {
  center: [77.2177, 28.6304],
  nodes: {
    features: [
      {
        geometry: { coordinates: [77.2177, 28.6304] },
        properties: { id: 'N1', zone: 'Z1', signal: 'green', pollution: 5, noise: 12 }
      }
    ]
  },
  edges: { features: [] }
};

describe('CityMap interactions', () => {
  test('clicking near a node shows the Intersection popup', async () => {
    render(
      <div style={{ width: '800px', height: '600px' }}>
        <CityMap mode="simulation" cityData={cityData} edgesState={{}} nodesState={{}} vehicles={[]} accidents={[]} />
      </div>
    );

    // Wait for the loading overlay to disappear (maps mock resolves immediately)
    await waitFor(() => expect(screen.queryByText(/Loading Google Maps Engine/i)).not.toBeInTheDocument());

    // Use the mock map instance to trigger a click event at the node location
    const mockMap = window.__mockMaps && window.__mockMaps[0];
    expect(mockMap).toBeDefined();

    mockMap.trigger('click', { latLng: new window.google.maps.LatLng(28.6304, 77.2177) });

    // The Intersection popup should now appear
    const popup = await screen.findByText(/Intersection/i);
    expect(popup).toBeInTheDocument();
  });
});
