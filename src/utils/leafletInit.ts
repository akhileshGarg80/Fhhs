import L from 'leaflet';

// Ensure globalThis.L is defined before leaflet-rotate evaluates in ESM/Vite
(globalThis as unknown as { L: typeof L }).L = L;

export default L;
