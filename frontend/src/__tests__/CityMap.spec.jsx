// @vitest-environment jsdom
import React from 'react';
import '@testing-library/jest-dom/vitest';
import { describe, expect, test } from 'vitest';
import { render, screen } from '@testing-library/react';
import CityMap from '../components/Map/CityMap';

describe('CityMap', () => {
  test('shows loading placeholder when Google Maps is not available', () => {
    render(React.createElement(CityMap));
    expect(screen.getByText(/Loading Google Maps Engine/i)).toBeInTheDocument();
  });
});
