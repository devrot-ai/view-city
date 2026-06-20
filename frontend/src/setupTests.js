import { expect } from 'vitest';

// Make Vitest's `expect` global so jest-dom can extend it safely
globalThis.expect = expect;

// Dynamically import jest-dom so this module can set `expect` first
await import('@testing-library/jest-dom');

import setupMockGoogleMaps from './test-utils/mockGoogleMaps';

// Install a lightweight mock of the Google Maps API for headless tests
setupMockGoogleMaps();

// Provide a minimal canvas 2D context implementation for jsdom (no-op drawing)
if (typeof HTMLCanvasElement !== 'undefined') {
	HTMLCanvasElement.prototype.getContext = function () {
		const ctx = {
			resetTransform: () => {},
			scale: () => {},
			clearRect: () => {},
			save: () => {},
			restore: () => {},
			beginPath: () => {},
			arc: () => {},
			fill: () => {},
			stroke: () => {},
			moveTo: () => {},
			lineTo: () => {},
			translate: () => {},
			rotate: () => {},
			fillText: () => {},
			createRadialGradient: () => ({ addColorStop: () => {} }),
			measureText: () => ({ width: 0 }),
			reset: () => {},
			putImageData: () => {},
			setTransform: () => {},
		};
		return ctx;
	};
}

// Replace `document.createElement('canvas')` to return an element with a no-op 2D context
const _origCreateElement = document.createElement.bind(document);
document.createElement = function (tagName) {
	// For canvas elements, return a div-like element with a no-op 2D context
	if (String(tagName).toLowerCase() === 'canvas') {
		const el = _origCreateElement('div');
		const ctx = {
			resetTransform: () => {},
			scale: () => {},
			clearRect: () => {},
			save: () => {},
			restore: () => {},
			beginPath: () => {},
			arc: () => {},
			fill: () => {},
			stroke: () => {},
			moveTo: () => {},
			lineTo: () => {},
			translate: () => {},
			rotate: () => {},
			fillText: () => {},
			createRadialGradient: () => ({ addColorStop: () => {} }),
			measureText: () => ({ width: 0 }),
			putImageData: () => {},
			setTransform: () => {},
		};
		el.getContext = function () { return ctx; };
		Object.defineProperty(el, 'width', { get: () => 800, set: () => {} });
		Object.defineProperty(el, 'height', { get: () => 600, set: () => {} });
		return el;
	}
	return _origCreateElement(tagName);
};
