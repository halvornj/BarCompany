import { Component, signal } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { Barcard } from './barcard/barcard';
import { LeafletDirective, LeafletLayersControlDirective, LeafletLayersDirective } from '@bluehalo/ngx-leaflet';
import * as Leaflet from 'leaflet';
import type { OverpassJson, OverpassNode } from "overpass-ts";
import { overpass } from 'overpass-ts';



const TESTING_BB = `59.9,10.7,60.0,10.8`;

@Component({
    selector: 'app-root',
    imports: [RouterOutlet, Barcard, LeafletDirective, LeafletLayersControlDirective, LeafletLayersDirective],
    templateUrl: './app.html',
    styleUrl: './app.scss'
})
export class App {
    protected readonly title = signal('BarCompany');

    options: Leaflet.MapOptions = {
        layers: [
            Leaflet.tileLayer('https://tile.openstreetmap.bzh/ca/{z}/{x}/{y}.png', {
                maxZoom: 18,
                minZoom: 12,
                attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors, Tiles courtesy of <a href="https://www.openstreetmap.cat" target="_blank">Breton OpenStreetMap Team</a>'
            }),

        ],
        zoom: 15,
        center: new Leaflet.LatLng(59.912527852972985, 10.746832664717447)
    };

    protected readonly layersControl = {
        baseLayers: {
            'Open Street Map': Leaflet.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
                attribution: '&amp;copy; OpenStreetMap contributors',
                maxZoom: 18,
                minZoom: 12
            }),
            'cat': Leaflet.tileLayer('https://tile.openstreetmap.bzh/ca/{z}/{x}/{y}.png', {
                maxZoom: 18,
                minZoom: 12,
                attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors, Tiles courtesy of <a href="https://www.openstreetmap.cat" target="_blank">Breton OpenStreetMap Team</a>'
            }),
            'esri_street': Leaflet.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Street_Map/MapServer/tile/{z}/{y}/{x}', {
                minZoom: 12,
                maxZoom: 18,
                attribution: 'Tiles &copy; Esri &mdash; Source: Esri, DeLorme, NAVTEQ, USGS, Intermap, iPC, NRCAN, Esri Japan, METI, Esri China (Hong Kong), Esri (Thailand), TomTom, 2012'
            }),
            'esri_wold_image': Leaflet.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', {
                attribution: 'Tiles &copy; Esri &mdash; Source: Esri, i-cubed, USDA, USGS, AEX, GeoEye, Getmapping, Aerogrid, IGN, IGP, UPR-EGP, and the GIS User Community'
            }),
        },

        overlays: {}

    }

    protected mandatoryLayers = [
        new Leaflet.LayerGroup()
    ]


    //overpass api (used for hitting openstreetmap)
    request: Promise<Response | void> = overpass(
        `[out:json];
(
node["amenity"="biergarten"](${TESTING_BB});
node["amenity"="bar"](${TESTING_BB});
node["amenity"="pub"](${TESTING_BB});
node["amenity"="nightclub"](${TESTING_BB});

);
(._;>;);
out body;`)
        .then((res: Response) => {
            if (!res.ok) {
                throw new ReferenceError("todo exceptions :)");
            }// res ok
            res.json().then((val: OverpassJson) => {
                console.log(val);
                //this is very stupid, just for testing the data.
                const markers = val.elements.map((el) => {
                    let node = el as OverpassNode;
                    let marker: Leaflet.Marker = new Leaflet.Marker([node.lat, node.lon], {
                        icon: Leaflet.icon({
                            iconSize: [15, 25],
                            shadowSize: [25, 50],
                            //			    iconAnchor: [13, 0],
                            shadowAnchor: [7, 37],
                            iconUrl: 'assets/marker-icon.png',
                            iconRetinaUrl: 'assets/marker-icon-2x.png',
                            shadowUrl: 'assets/marker-shadow.png'
                        })
                    });
                    node.tags ? marker.bindPopup(node.tags["name"]) : console.error("overpass recieved node with no tags");
                    return marker;
                });

                this.mandatoryLayers[0] = new Leaflet.LayerGroup(markers);
            });
        });

}

