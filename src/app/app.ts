import { Component, signal } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { Barcard } from './barcard/barcard';
import { LeafletDirective, LeafletLayersControlDirective, LeafletLayersDirective } from '@bluehalo/ngx-leaflet';
import * as Leaflet from 'leaflet';
import type { OverpassJson, OverpassNode } from "overpass-ts";
import { overpass } from 'overpass-ts';



const TESTING_BB = [59.9, 10.7, 60.0, 10.8];

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



    constructor() {

        let userPosition: Promise<GeolocationPosition | null> = GetUserPosition();
        userPosition.then((res) => { console.log(res) });

        //this is very stupid, just for testing the data.
        let nodesPromise: Promise<Array<OverpassNode> | null> = getLocalBars(TESTING_BB);

        nodesPromise.then((res: Array<OverpassNode> | null) => {
            if (res == null) {
                return;
            }
            const markers = res.map((el) => {
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
            })
            this.mandatoryLayers[0] = new Leaflet.LayerGroup(markers);
        });




    }

}



/*TODO this could just take a position, and construct the bounding-box.


  
  */

async function getLocalBars(bounding_box: Array<number>): Promise<Array<OverpassNode> | null> {

    const BB_STR = bounding_box.join(',');

    //overpass api (used for hitting openstreetmap)
    let response: Response | null = await overpass(
        `[out:json];
(
node["amenity"="biergarten"](${BB_STR});
node["amenity"="bar"](${BB_STR});
node["amenity"="pub"](${BB_STR});
node["amenity"="nightclub"](${BB_STR});

);
(._;>;);
out body;`);
    if (response == null || !response.ok) {
        throw new ReferenceError("todo exceptions :)");
    }// res ok
    const json = await response.json() as OverpassJson;
    console.log(json);
    if (json.elements == undefined) {
        throw new ReferenceError("todo exceptions :)");
    }
    return json.elements as Array<OverpassNode>;

}


//this is horrible structure, and not code that sohuld be used, THIS WHOLE FILE IS JUST FOR TESTING WHAT IS POSSIBLE. NOT TO BE SHIPPED.
/*
  requests permission and gets user location.
  @returns: Geolocationposition on success, null with quiet failure on non-success.
  TODO: implement handling for missing permissions, so on.
  */

async function GetUserPosition(): Promise<GeolocationPosition | null> {

    if (navigator.geolocation) {
        return await new Promise((resolve, reject) => {
            navigator.geolocation.getCurrentPosition(resolve, reject, {
                maximumAge: 1000 * 600, //1000ms * 600 = 600s, 10 mins
                timeout: 1000 * 5, //5 second timeout
                enableHighAccuracy: false
            });
        });

    } else { //TODO actually throw an exception, if this were real code.
        console.error("browser/agent does not support geolocation.");
    }
    return null;

}

