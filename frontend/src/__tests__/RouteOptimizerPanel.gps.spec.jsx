// @vitest-environment jsdom
import React from 'react'; // eslint-disable-line no-unused-vars
import '@testing-library/jest-dom/vitest';
import { describe, test, expect, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import RouteOptimizerPanel from '../components/Dashboard/RouteOptimizerPanel';
import setupMockGoogleMaps from '../test-utils/mockGoogleMaps';

describe('RouteOptimizerPanel GPS', () => {
  test('uses geolocation and calls onOriginSelected with reverse geocoded address', async () => {
    const onOriginSelected = vi.fn();

    // Ensure Google Maps mock is installed and Mock geolocation API is available
    setupMockGoogleMaps();

    // Mock geolocation API
    global.navigator.geolocation = {
      getCurrentPosition: (success) => {
        success({ coords: { latitude: 28.6304, longitude: 77.2177 } });
      }
    };

    // Ensure Google Maps mock is present (setupTests installs it), and override geocoder to return expected address
    window.google = window.google || {};
    window.google.maps = window.google.maps || {};
    window.google.maps.Geocoder = window.google.maps.Geocoder || function() {};
    window.google.maps.Geocoder.prototype.geocode = function (opts, cb) {
      cb([{ formatted_address: 'Reversed Address, Test' }], 'OK');
    };

    render(
      <RouteOptimizerPanel
        onOriginSelected={onOriginSelected}
        onDestinationSelected={() => {}}
        onClear={() => {}}
        googleMapsLoaded={true}
      />
    );

    const btn = screen.getByTitle('Use Current Location (GPS)');
    fireEvent.click(btn);

    await waitFor(() => expect(onOriginSelected).toHaveBeenCalled());

    const callArgs = onOriginSelected.mock.calls[0];
    expect(callArgs[0]).toMatch(/Reversed Address/);
    expect(callArgs[1]).toHaveProperty('lat');
    expect(typeof callArgs[1].lat === 'function' || typeof callArgs[1].lat === 'number').toBeTruthy();
  });
});
