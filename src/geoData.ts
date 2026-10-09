export interface GeoPlace {
  0?: string;
  1?: string;
  2?: string;
  [index: number]: string | number | undefined;
  name: string;
  region: string;
  country: string;
  population: number;
  lat: number;
  lon: number;
  nombre?: string;
  región?: string;
  país?: string;
}

export const GEO_PLACES: ReadonlyArray<GeoPlace> = [
  { name: "New York City", region: "NY", country: "US", lat: 40.7143, lon: -74.006, population: 8175133, 0: "New York City", 1: "NY", 2: "US" },
  { name: "Los Angeles", region: "CA", country: "US", lat: 34.0522, lon: -118.2437, population: 3971883, 0: "Los Angeles", 1: "CA", 2: "US" },
  { name: "Chicago", region: "IL", country: "US", lat: 41.85, lon: -87.65, population: 2720546, 0: "Chicago", 1: "IL", 2: "US" },
  { name: "Toronto", region: "ON", country: "CA", lat: 43.7001, lon: -79.4163, population: 2600000, 0: "Toronto", 1: "ON", 2: "CA" },
  { name: "Houston", region: "TX", country: "US", lat: 29.7633, lon: -95.3633, population: 2296224, 0: "Houston", 1: "TX", 2: "US" },
  { name: "Miami", region: "FL", country: "US", lat: 25.7743, lon: -80.1937, population: 441003, 0: "Miami", 1: "FL", 2: "US" },
  { name: "Orlando", region: "FL", country: "US", lat: 28.5383, lon: -81.3792, population: 270934, 0: "Orlando", 1: "FL", 2: "US" },
  { name: "Austin", region: "TX", country: "US", lat: 30.2672, lon: -97.7431, population: 931830, 0: "Austin", 1: "TX", 2: "US" },
  { name: "Tampa", region: "FL", country: "US", lat: 27.9475, lon: -82.4584, population: 369075, 0: "Tampa", 1: "FL", 2: "US" },
  { name: "Atlanta", region: "GA", country: "US", lat: 33.749, lon: -84.388, population: 463878, 0: "Atlanta", 1: "GA", 2: "US" },
  { name: "Seattle", region: "WA", country: "US", lat: 47.6062, lon: -122.3321, population: 684451, 0: "Seattle", 1: "WA", 2: "US" },
  { name: "Denver", region: "CO", country: "US", lat: 39.7392, lon: -104.9847, population: 682545, 0: "Denver", 1: "CO", 2: "US" },
  { name: "Dallas", region: "TX", country: "US", lat: 32.7831, lon: -96.8067, population: 1300092, 0: "Dallas", 1: "TX", 2: "US" }
];
