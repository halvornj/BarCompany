import { Component, OnInit, OnDestroy, ElementRef, ViewChild } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import * as L from 'leaflet';
import { BarService, Bar, MapBounds, BarCrawlRoute } from '../services/bar.service';
import { Subscription } from 'rxjs';

@Component({
  selector: 'app-map',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './map.component.html',
  styleUrls: ['./map.component.css']
})
export class MapComponent implements OnInit, OnDestroy {
  @ViewChild('mapContainer', { static: true }) mapContainer!: ElementRef;
  
  private map: L.Map | null = null;
  private barMarkers: L.Marker[] = [];
  private barsSubscription: Subscription | null = null;
  private routePolyline: L.Polyline | null = null;
  
  // Bar crawl properties
  public numberOfBars: number = 4;
  public currentBars: Bar[] = [];
  public currentRoute: BarCrawlRoute | null = null;
  public isShowingRoute: boolean = false;

  constructor(private barService: BarService) {}

  ngOnInit(): void {
    this.initializeMap();
    // Load bars after map is initialized
    setTimeout(() => this.loadBars(), 500);
  }

  ngOnDestroy(): void {
    if (this.barsSubscription) {
      this.barsSubscription.unsubscribe();
    }
    if (this.map) {
      this.map.remove();
    }
  }

  private initializeMap(): void {
    // Fix for default markers not showing up
    delete (L.Icon.Default.prototype as any)._getIconUrl;
    L.Icon.Default.mergeOptions({
      iconRetinaUrl: 'assets/leaflet/marker-icon-2x.png',
      iconUrl: 'assets/leaflet/marker-icon.png',
      shadowUrl: 'assets/leaflet/marker-shadow.png',
    });

    // Initialize the map
    this.map = L.map(this.mapContainer.nativeElement, {
      center: [59.9139, 10.7522], // Oslo, Norway coordinates
      zoom: 13
    });

    // Add tile layer
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      attribution: '© <a href="http://www.openstreetmap.org/copyright">OpenStreetMap</a>'
    }).addTo(this.map);

    // Add map event listeners
    this.map.on('click', (e: L.LeafletMouseEvent) => {
      L.popup()
        .setLatLng(e.latlng)
        .setContent(`You clicked the map at ${e.latlng.toString()}`)
        .openOn(this.map!);
    });

    // Disabled automatic loading to prevent API overload
    // Bars will only load on manual refresh or initial load
    // this.map.on('moveend zoomend', () => {
    //   this.loadBars();
    // });
  }

  private loadBars(): void {
    if (!this.map) return;

    // Get current map bounds
    const bounds = this.map.getBounds();
    const mapBounds: MapBounds = {
      south: bounds.getSouth(),
      west: bounds.getWest(), 
      north: bounds.getNorth(),
      east: bounds.getEast()
    };

    // Cancel previous subscription if still running
    if (this.barsSubscription) {
      this.barsSubscription.unsubscribe();
    }

    this.barsSubscription = this.barService.getBarsInArea(mapBounds).subscribe({
      next: (bars: Bar[]) => {
        this.currentBars = bars;
        this.addBarMarkers(bars);
      },
      error: (error) => {
        console.error('Error loading bars:', error);
      }
    });
  }

  private addBarMarkers(bars: Bar[]): void {
    if (!this.map) return;

    // Clear existing markers
    this.clearBarMarkers();

    // Create custom icon for bars
    const barIcon = L.icon({
      iconUrl: 'assets/leaflet/marker-icon.png',
      shadowUrl: 'assets/leaflet/marker-shadow.png',
      iconSize: [25, 41],
      iconAnchor: [12, 41],
      popupAnchor: [1, -34],
      shadowSize: [41, 41],
      className: 'bar-marker'
    });

    // Add markers for each bar
    bars.forEach((bar: Bar) => {
      const marker = L.marker([bar.lat, bar.lng], { icon: barIcon })
        .addTo(this.map!)
        .bindPopup(this.createBarPopupContent(bar));

      this.barMarkers.push(marker);
    });

    console.log(`Added ${bars.length} bar markers to the map`);
  }

  private createBarPopupContent(bar: Bar): string {
    let content = `<div class="bar-popup">
      <h3>${bar.name}</h3>`;
    
    if (bar.address) {
      content += `<p><strong>Address:</strong> ${bar.address}</p>`;
    }
    
    if (bar.phone) {
      content += `<p><strong>Phone:</strong> <a href="tel:${bar.phone}">${bar.phone}</a></p>`;
    }
    
    if (bar.website) {
      content += `<p><strong>Website:</strong> <a href="${bar.website}" target="_blank" rel="noopener">Visit Website</a></p>`;
    }
    
    if (bar.openingHours) {
      content += `<p><strong>Hours:</strong> ${bar.openingHours}</p>`;
    }
    
    if (bar.cuisine) {
      content += `<p><strong>Cuisine:</strong> ${bar.cuisine}</p>`;
    }
    
    content += '</div>';
    return content;
  }

  private clearBarMarkers(): void {
    this.barMarkers.forEach(marker => {
      if (this.map) {
        this.map.removeLayer(marker);
      }
    });
    this.barMarkers = [];
  }

  public refreshBars(): void {
    this.loadBars();
  }

  public planBarCrawl(): void {
    if (this.currentBars.length === 0) {
      alert('No bars available. Please wait for bars to load or move to an area with bars.');
      return;
    }

    if (this.numberOfBars > this.currentBars.length) {
      alert(`Only ${this.currentBars.length} bars available in this area. Please reduce the number or zoom out to see more bars.`);
      return;
    }

    // Get map center as starting point
    const center = this.map?.getCenter();
    const startLocation = center ? { lat: center.lat, lng: center.lng } : undefined;

    console.log(`Planning route for ${this.numberOfBars} bars from ${this.currentBars.length} available bars`);
    
    try {
      this.currentRoute = this.barService.planBarCrawl(this.currentBars, this.numberOfBars, startLocation);
      
      if (!this.currentRoute || !this.currentRoute.bars || this.currentRoute.bars.length === 0) {
        console.error('Failed to plan route - no route returned');
        alert('Failed to plan bar crawl route. Please try again.');
        return;
      }
      
      console.log(`Route planned: ${this.currentRoute.bars.length} bars, ${this.currentRoute.totalDistance}km`);
      this.displayBarCrawlRoute();
    } catch (error) {
      console.error('Error planning bar crawl:', error);
      alert('Error planning bar crawl. Please try again.');
    }
  }

  private displayBarCrawlRoute(): void {
    console.log('displayBarCrawlRoute called, currentRoute:', this.currentRoute);
    console.log('map exists:', !!this.map);
    
    if (!this.currentRoute) {
      console.error('currentRoute is null in displayBarCrawlRoute');
      return;
    }
    
    if (!this.map) {
      console.error('map is null in displayBarCrawlRoute');
      return;
    }
    
    if (!this.currentRoute.bars) {
      console.error('currentRoute.bars is null');
      return;
    }
    
    console.log(`Displaying route with ${this.currentRoute.bars.length} bars`);

    // Clear existing visual elements but keep currentRoute
    this.clearVisualElements();

    // Clear existing markers and show only route bars
    this.clearBarMarkers();

    // Create different icons for route bars
    const routeIcons = [
      this.createRouteIcon('#e74c3c', '1'), // Red for start
      this.createRouteIcon('#f39c12', '2'), // Orange
      this.createRouteIcon('#f1c40f', '3'), // Yellow
      this.createRouteIcon('#2ecc71', '4'), // Green
      this.createRouteIcon('#3498db', '5'), // Blue
      this.createRouteIcon('#9b59b6', '6'), // Purple
      this.createRouteIcon('#1abc9c', '7'), // Teal
      this.createRouteIcon('#e67e22', '8'), // Dark orange
    ];

    // Add numbered markers for route bars
    this.currentRoute.bars.forEach((bar: Bar, index: number) => {
      const icon = routeIcons[index] || routeIcons[routeIcons.length - 1];
      const marker = L.marker([bar.lat, bar.lng], { icon })
        .addTo(this.map!)
        .bindPopup(this.createRouteBarPopupContent(bar, index + 1));

      this.barMarkers.push(marker);
    });

    // Draw route line
    const routeCoordinates = this.currentRoute.bars.map(bar => [bar.lat, bar.lng] as [number, number]);
    this.routePolyline = L.polyline(routeCoordinates, {
      color: '#e74c3c',
      weight: 4,
      opacity: 0.8,
      dashArray: '10, 5'
    }).addTo(this.map);

    // Fit map to show entire route
    const group = new L.FeatureGroup([this.routePolyline, ...this.barMarkers]);
    this.map.fitBounds(group.getBounds().pad(0.1));

    this.isShowingRoute = true;
    console.log(`Bar crawl planned: ${this.currentRoute.bars.length} bars, ${this.currentRoute.totalDistance.toFixed(2)}km, ~${this.currentRoute.estimatedWalkingTime} minutes walking`);
  }

  private createRouteIcon(color: string, number: string): L.Icon {
    const svgIcon = `
      <svg width="25" height="41" viewBox="0 0 25 41" xmlns="http://www.w3.org/2000/svg">
        <path fill="${color}" stroke="#fff" stroke-width="2" d="M12.5,0 C19.4,0 25,5.6 25,12.5 C25,19.4 12.5,41 12.5,41 S0,19.4 0,12.5 C0,5.6 5.6,0 12.5,0 Z"/>
        <circle cx="12.5" cy="12.5" r="8" fill="#fff"/>
        <text x="12.5" y="17" font-family="Arial" font-size="10" font-weight="bold" text-anchor="middle" fill="${color}">${number}</text>
      </svg>
    `;

    return L.icon({
      iconUrl: `data:image/svg+xml;base64,${btoa(svgIcon)}`,
      iconSize: [25, 41],
      iconAnchor: [12, 41],
      popupAnchor: [1, -34],
      className: 'route-marker'
    });
  }

  private createRouteBarPopupContent(bar: Bar, stopNumber: number): string {
    let content = `<div class="route-bar-popup">
      <h3>🍺 Stop ${stopNumber}: ${bar.name}</h3>`;
    
    if (bar.address) {
      content += `<p><strong>📍 Address:</strong> ${bar.address}</p>`;
    }
    
    if (bar.phone) {
      content += `<p><strong>📞 Phone:</strong> <a href="tel:${bar.phone}">${bar.phone}</a></p>`;
    }
    
    if (bar.website) {
      content += `<p><strong>🌐 Website:</strong> <a href="${bar.website}" target="_blank" rel="noopener">Visit Website</a></p>`;
    }
    
    if (bar.openingHours) {
      content += `<p><strong>🕐 Hours:</strong> ${bar.openingHours}</p>`;
    }
    
    content += '</div>';
    return content;
  }

  private clearVisualElements(): void {
    // Clear existing route line
    if (this.routePolyline && this.map) {
      this.map.removeLayer(this.routePolyline);
      this.routePolyline = null;
    }
    
    // Clear existing markers
    this.clearBarMarkers();
  }

  public clearRoute(): void {
    this.clearVisualElements();
    this.isShowingRoute = false;
    this.currentRoute = null;
  }

  public showAllBars(): void {
    this.clearRoute();
    this.addBarMarkers(this.currentBars);
  }

  public getRouteInfo(): string {
    if (!this.currentRoute) return '';
    return `${this.currentRoute.bars.length} bars • ${this.currentRoute.totalDistance.toFixed(2)}km • ~${this.currentRoute.estimatedWalkingTime} min walk`;
  }
}