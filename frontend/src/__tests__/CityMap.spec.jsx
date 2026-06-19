import { render, screen } from '@testing-library/react';
import CityMap from '../components/Map/CityMap';

describe('CityMap', () => {
  test('shows loading placeholder when Google Maps is not available', () => {
    render(<CityMap />);
    expect(screen.getByText(/Loading Google Maps Engine/i)).toBeInTheDocument();
  });
});
