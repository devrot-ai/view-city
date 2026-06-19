// @vitest-environment jsdom
import React from 'react'; // eslint-disable-line no-unused-vars
import '@testing-library/jest-dom/vitest';
import { describe, expect, test, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import RouteOptimizerPanel from '../components/Dashboard/RouteOptimizerPanel';

describe('RouteOptimizerPanel', () => {
  test('renders AI recommendation and responds to route selection', () => {
    const routes = [
      {
        summary: 'A Road',
        legs: [
          {
            distance: { value: 10000, text: '10 km' },
            duration: { value: 600, text: '10 mins' },
            duration_in_traffic: { value: 660, text: '11 mins' },
            steps: [],
          },
        ],
      },
      {
        summary: 'B Highway',
        legs: [
          {
            distance: { value: 15000, text: '15 km' },
            duration: { value: 900, text: '15 mins' },
            steps: [],
          },
        ],
      },
    ];

    const onSelectRoute = vi.fn();
    const { container } = render(
      <RouteOptimizerPanel
        routes={routes}
        onSelectRoute={onSelectRoute}
        onOriginSelected={() => {}}
        onDestinationSelected={() => {}}
        onClear={() => {}}
        googleMapsLoaded={false}
      />
    );

    // AI recommendation summary should be present
    expect(screen.getByText(/AI Recommendation/i)).toBeInTheDocument();

    // There should be two route cards rendered
    const cards = container.querySelectorAll('.policy-card');
    expect(cards.length).toBe(2);

    // Clicking a card should call onSelectRoute with the index
    fireEvent.click(cards[1]);
    expect(onSelectRoute).toHaveBeenCalledWith(1);
  });
});
