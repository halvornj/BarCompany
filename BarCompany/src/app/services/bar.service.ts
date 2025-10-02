import { Injectable } from '@angular/core';
import { Observable, of } from 'rxjs';
import { map, catchError } from 'rxjs/operators';

export interface Bar {
  id: string;
  name: string;
  lat: number;
  lng: number;
  address?: string;
  phone?: string;
  website?: string;
  openingHours?: string;
  cuisine?: string;
}

export interface MapBounds {
  south: number;
  west: number;
  north: number;
  east: number;
}

export interface BarCrawlRoute {
  bars: Bar[];
  totalDistance: number;
  estimatedWalkingTime: number; // in minutes
}

@Injectable({
  providedIn: 'root'
})
export class BarService {
  
  constructor() { }

  /**
   * Fetch bars using Overpass API based on map bounds
   */
  getBarsInArea(bounds: MapBounds): Observable<Bar[]> {
    console.log(`Loading bars in area: ${bounds.south.toFixed(3)},${bounds.west.toFixed(3)} to ${bounds.north.toFixed(3)},${bounds.east.toFixed(3)}`);
    
    // Check if we're in Oslo area - if so, provide fallback data
    const isOsloArea = bounds.south > 59.8 && bounds.north < 60.0 && bounds.west > 10.5 && bounds.east < 11.0;
    
    // Overpass API query for bars, pubs, and nightclubs in the specified bounds
    const overpassQuery = `[out:json][timeout:25];
(
  node["amenity"="bar"](${bounds.south},${bounds.west},${bounds.north},${bounds.east});
  node["amenity"="pub"](${bounds.south},${bounds.west},${bounds.north},${bounds.east});
  node["amenity"="nightclub"](${bounds.south},${bounds.west},${bounds.north},${bounds.east});
  node["amenity"="biergarten"](${bounds.south},${bounds.west},${bounds.north},${bounds.east});
  way["amenity"="bar"](${bounds.south},${bounds.west},${bounds.north},${bounds.east});
  way["amenity"="pub"](${bounds.south},${bounds.west},${bounds.north},${bounds.east});
  way["amenity"="nightclub"](${bounds.south},${bounds.west},${bounds.north},${bounds.east});
);
out center;`;

    return this.fetchFromOverpass(overpassQuery).pipe(
      map(data => this.parseOverpassResponse(data, bounds)),
      catchError(error => {
        console.error('Overpass API failed:', error.message);
        console.log('Falling back to mock data for testing...');
        // If we're in Oslo area and API fails, return mock data
        if (isOsloArea) {
          return of(this.getOsloMockBars());
        }
        return of([]);
      })
    );
  }

  /**
   * Convenience method for Oslo (backwards compatibility)
   */
  getBarsInOslo(): Observable<Bar[]> {
    const osloBounds: MapBounds = {
      south: 59.85,
      west: 10.6,
      north: 59.95,
      east: 10.8
    };
    return this.getBarsInArea(osloBounds);
  }

  private fetchFromOverpass(query: string): Observable<any> {
    return new Observable(observer => {
      // Add delay to avoid rate limiting
      setTimeout(() => {
        fetch('https://overpass-api.de/api/interpreter', {
          method: 'POST',
          body: query,
          headers: {
            'Content-Type': 'text/plain; charset=utf-8',
            'User-Agent': 'BarCompanyApp/1.0'
          }
        })
        .then(response => {
          if (!response.ok) {
            throw new Error(`HTTP ${response.status}: ${response.statusText}`);
          }
          
          // Check if response is JSON
          const contentType = response.headers.get('content-type');
          if (!contentType || !contentType.includes('application/json')) {
            throw new Error('Response is not JSON - likely rate limited');
          }
          
          return response.json();
        })
        .then(data => {
          if (!data || typeof data !== 'object') {
            throw new Error('Invalid JSON response');
          }
          observer.next(data);
          observer.complete();
        })
        .catch(error => {
          console.warn('Overpass API error:', error.message);
          observer.error(error);
        });
      }, 1000); // 1 second delay to avoid rate limits
    });
  }

  private parseOverpassResponse(data: any, bounds?: MapBounds): Bar[] {
    if (!data || !data.elements || !Array.isArray(data.elements)) {
      console.warn('Invalid Overpass response structure');
      return [];
    }
    
    console.log(`Raw Overpass data: ${data.elements.length} elements`);
    
    const bars = data.elements
      .filter((element: any) => {
        // Must have coordinates and a name
        const hasCoords = (element.lat && element.lon) || (element.center?.lat && element.center?.lon);
        const hasName = element.tags?.name;
        return hasCoords && hasName;
      })
      .map((element: any): Bar => {
        // Handle both node and way elements
        const lat = element.lat || element.center?.lat;
        const lon = element.lon || element.center?.lon;
        
        return {
          id: element.id.toString(),
          name: element.tags.name,
          lat: parseFloat(lat),
          lng: parseFloat(lon),
          address: this.formatOverpassAddress(element.tags),
          phone: element.tags.phone || element.tags['contact:phone'],
          website: element.tags.website || element.tags['contact:website'],
          openingHours: element.tags.opening_hours,
          cuisine: element.tags.cuisine || element.tags.brewery
        };
      })
      .filter((bar: Bar) => {
        // Additional filtering within bounds if provided
        if (bounds) {
          return bar.lat >= bounds.south && bar.lat <= bounds.north && 
                 bar.lng >= bounds.west && bar.lng <= bounds.east;
        }
        return true;
      })
      .slice(0, 50); // Limit results
    
    console.log(`Parsed ${bars.length} bars from Overpass API`);
    return bars;
  }

  private formatOverpassAddress(tags: any): string | undefined {
    const parts = [];
    
    // Street and house number
    if (tags['addr:street']) {
      if (tags['addr:housenumber']) {
        parts.push(`${tags['addr:street']} ${tags['addr:housenumber']}`);
      } else {
        parts.push(tags['addr:street']);
      }
    }
    
    // City
    if (tags['addr:city']) {
      parts.push(tags['addr:city']);
    } else if (tags['addr:postcode']) {
      parts.push(`${tags['addr:postcode']} Oslo`);
    }
    
    return parts.length > 0 ? parts.join(', ') : undefined;
  }

  /**
   * Plan a bar crawl route with specified number of bars
   */
  planBarCrawl(allBars: Bar[], numberOfBars: number, startLocation?: { lat: number; lng: number }): BarCrawlRoute {
    console.log(`planBarCrawl called with ${allBars.length} bars, requesting ${numberOfBars} bars`);
    
    if (allBars.length === 0 || numberOfBars <= 0) {
      console.log('Returning empty route - no bars or invalid number');
      return { bars: [], totalDistance: 0, estimatedWalkingTime: 0 };
    }

    // If we don't have enough bars, use what we have
    const actualNumberOfBars = Math.min(numberOfBars, allBars.length);
    console.log(`Planning route for ${actualNumberOfBars} bars`);
    
    let selectedBars: Bar[];
    
    if (startLocation) {
      console.log(`Starting from location: ${startLocation.lat}, ${startLocation.lng}`);
      selectedBars = this.findOptimalRouteFromStart(allBars, actualNumberOfBars, startLocation);
    } else {
      console.log('Finding optimal cluster');
      selectedBars = this.findOptimalCluster(allBars, actualNumberOfBars);
    }

    console.log(`Selected ${selectedBars.length} bars for route`);
    
    const totalDistance = this.calculateTotalRouteDistance(selectedBars);
    const estimatedWalkingTime = Math.round(totalDistance * 12); // ~5 km/h walking speed

    const result = {
      bars: selectedBars,
      totalDistance: Math.round(totalDistance * 1000) / 1000, // Round to 3 decimal places
      estimatedWalkingTime
    };
    
    console.log('Route planned successfully:', result);
    return result;
  }

  private findOptimalRouteFromStart(bars: Bar[], count: number, start: { lat: number; lng: number }): Bar[] {
    if (count <= 0) return [];
    
    const route: Bar[] = [];
    const remaining = [...bars];
    let currentLocation = start;

    // Greedy algorithm: always go to nearest unvisited bar
    for (let i = 0; i < count && remaining.length > 0; i++) {
      const nearestIndex = this.findNearestBarIndex(remaining, currentLocation);
      const nearestBar = remaining.splice(nearestIndex, 1)[0];
      route.push(nearestBar);
      currentLocation = { lat: nearestBar.lat, lng: nearestBar.lng };
    }

    return route;
  }

  private findOptimalCluster(bars: Bar[], count: number): Bar[] {
    if (count <= 0) return [];
    if (count >= bars.length) return [...bars];

    // Find the cluster of bars that minimizes total walking distance
    let bestRoute: Bar[] = [];
    let bestDistance = Infinity;

    // Try starting from each bar and see which gives the shortest route
    for (let startIdx = 0; startIdx < Math.min(bars.length, 20); startIdx++) {
      const startBar = bars[startIdx];
      const route = this.findOptimalRouteFromStart(
        bars.filter(b => b.id !== startBar.id),
        count - 1,
        { lat: startBar.lat, lng: startBar.lng }
      );
      route.unshift(startBar); // Add start bar to beginning

      const routeDistance = this.calculateTotalRouteDistance(route);
      if (routeDistance < bestDistance) {
        bestDistance = routeDistance;
        bestRoute = route;
      }
    }

    return bestRoute;
  }

  private findNearestBarIndex(bars: Bar[], location: { lat: number; lng: number }): number {
    let nearestIndex = 0;
    let shortestDistance = this.calculateDistance(
      location.lat, location.lng,
      bars[0].lat, bars[0].lng
    );

    for (let i = 1; i < bars.length; i++) {
      const distance = this.calculateDistance(
        location.lat, location.lng,
        bars[i].lat, bars[i].lng
      );
      if (distance < shortestDistance) {
        shortestDistance = distance;
        nearestIndex = i;
      }
    }

    return nearestIndex;
  }

  private calculateTotalRouteDistance(bars: Bar[]): number {
    if (bars.length < 2) return 0;

    let totalDistance = 0;
    for (let i = 0; i < bars.length - 1; i++) {
      totalDistance += this.calculateDistance(
        bars[i].lat, bars[i].lng,
        bars[i + 1].lat, bars[i + 1].lng
      );
    }

    return totalDistance;
  }

  private calculateDistance(lat1: number, lng1: number, lat2: number, lng2: number): number {
    // Haversine formula for calculating distance between two points on Earth
    const R = 6371; // Earth's radius in kilometers
    const dLat = this.toRadians(lat2 - lat1);
    const dLng = this.toRadians(lng2 - lng1);
    
    const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
              Math.cos(this.toRadians(lat1)) * Math.cos(this.toRadians(lat2)) *
              Math.sin(dLng / 2) * Math.sin(dLng / 2);
    
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
  }

  private toRadians(degrees: number): number {
    return degrees * (Math.PI / 180);
  }

  /**
   * Mock Oslo bars for testing when API fails
   */
  private getOsloMockBars(): Bar[] {
    return [
      {
        id: '1',
        name: 'Himkok',
        lat: 59.9127,
        lng: 10.7460,
        address: 'Storgata 27, Oslo',
        phone: '+47 22 42 99 80'
      },
      {
        id: '2',
        name: 'Torggata Botaniske',
        lat: 59.9189,
        lng: 10.7513,
        address: 'Torggata 2, Oslo',
        phone: '+47 22 99 60 40'
      },
      {
        id: '3',
        name: 'Crowbar & Bryggeri',
        lat: 59.9185,
        lng: 10.7585,
        address: 'Torggata 32, Oslo'
      },
      {
        id: '4',
        name: 'Brygg Oslo',
        lat: 59.9075,
        lng: 10.7569,
        address: 'Brynjulf Bulls plass 1, Oslo'
      },
      {
        id: '5',
        name: 'Magic Ice Bar Oslo',
        lat: 59.9115,
        lng: 10.7423,
        address: 'Kristian IVs gate 12, Oslo',
        phone: '+47 400 05 100'
      },
      {
        id: '6',
        name: 'Territoriet Bar',
        lat: 59.9144,
        lng: 10.7521,
        address: 'Markveien 58, Oslo'
      },
      {
        id: '7',
        name: 'Dubliner Folk Pub',
        lat: 59.9138,
        lng: 10.7387,
        address: 'Rådhusgata 28, Oslo',
        phone: '+47 22 82 88 92'
      },
      {
        id: '8',
        name: 'Summit Bar',
        lat: 59.9127,
        lng: 10.7398,
        address: 'Sonja Henies plass 3, Oslo'
      },
      {
        id: '9',
        name: 'Rorbua Pub',
        lat: 59.9095,
        lng: 10.7421,
        address: 'Stranden 71, Oslo',
        phone: '+47 22 83 19 64'
      },
      {
        id: '10',
        name: 'Cafe Ser',
        lat: 59.9156,
        lng: 10.7467,
        address: 'Brenneriveien 9, Oslo'
      }
    ];
  }
}