// @vitest-environment jsdom
import React from 'react'; // eslint-disable-line no-unused-vars
import '@testing-library/jest-dom/vitest';
import { describe, test, expect, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import RouteOptimizerPanel from '../components/Dashboard/RouteOptimizerPanel';
import setupMockGoogleMaps from '../test-utils/mockGoogleMaps';

describe('RouteOptimizerPanel Autocomplete', () => {
  test('selecting a place via Autocomplete calls onOriginSelected and updates input', async () => {
    setupMockGoogleMaps();

    const onOriginSelected = vi.fn();

    render(
      <RouteOptimizerPanel
        routes={[]}
        onSelectRoute={() => {}}
        onOriginSelected={onOriginSelected}
        onDestinationSelected={() => {}}
        onClear={() => {}}
        googleMapsLoaded={true}
      />
    );

    // Autocomplete instance created for origin input should be first
    const inst = window.__mockAutocompleteInstances && window.__mockAutocompleteInstances[0];
    expect(inst).toBeDefined();

    // Simulate selecting a place with geometry
    const place = {
      name: 'Test Place',
      formatted_address: '123 Test St, Test City',
      geometry: { location: new window.google.maps.LatLng(12.34, 56.78) },
    };

    inst.triggerPlaceChanged(place);

    await waitFor(() => expect(onOriginSelected).toHaveBeenCalled());

    const args = onOriginSelected.mock.calls[0];
    expect(args[0]).toMatch(/Test Place|123 Test St/);
    expect(args[1]).toHaveProperty('lat');
  });
});
