import { Component, Directive, signal } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { Barcard } from './barcard/barcard';
import { LeafletDirective, LeafletLayersControlDirective, LeafletLayersDirective } from '@bluehalo/ngx-leaflet';
import * as L from 'leaflet';
import type { OverpassJson, OverpassNode } from "overpass-ts";
import { overpass } from 'overpass-ts';
import 'leaflet-routing-machine';
import { OverpassError } from 'overpass-ts/dist/common';


const AMOUNT_OF_BARS_PER_ROUTE = 5; //c-style define, this should be gotten from user input at some point. just for testing.


@Component({
    selector: 'app-root',
    imports: [RouterOutlet, Barcard, LeafletDirective, LeafletLayersControlDirective, LeafletLayersDirective],
    templateUrl: './app.html',
    styleUrl: './app.scss'
})
export class App {
    protected readonly title = signal('BarCompany');
    userPosition: L.LatLng = new L.LatLng(59.91126206884584, 10.744979731139079);


    options: L.MapOptions = {
        layers: [
            L.tileLayer('https://tile.openstreetmap.bzh/ca/{z}/{x}/{y}.png', {
                maxZoom: 18,
                minZoom: 12,
                attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors, Tiles courtesy of <a href="https://www.openstreetmap.cat" target="_blank">Breton OpenStreetMap Team</a>'
            }),

        ],
        zoom: 15,
        center: this.userPosition
    };

    protected readonly layersControl = {
        baseLayers: {
            'Open Street Map': L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
                attribution: '&amp;copy; OpenStreetMap contributors',
                maxZoom: 18,
                minZoom: 12
            }),
            'cat': L.tileLayer('https://tile.openstreetmap.bzh/ca/{z}/{x}/{y}.png', {
                maxZoom: 18,
                minZoom: 12,
                attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors, Tiles courtesy of <a href="https://www.openstreetmap.cat" target="_blank">Breton OpenStreetMap Team</a>'
            }),
            'esri_street': L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Street_Map/MapServer/tile/{z}/{y}/{x}', {
                minZoom: 12,
                maxZoom: 18,
                attribution: 'Tiles &copy; Esri &mdash; Source: Esri, DeLorme, NAVTEQ, USGS, Intermap, iPC, NRCAN, Esri Japan, METI, Esri China (Hong Kong), Esri (Thailand), TomTom, 2012'
            }),
            'esri_wold_image': L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', {
                attribution: 'Tiles &copy; Esri &mdash; Source: Esri, i-cubed, USDA, USGS, AEX, GeoEye, Getmapping, Aerogrid, IGN, IGP, UPR-EGP, and the GIS User Community'
            }),
        },

        overlays: {}

    }

    protected mandatoryLayers = [
        new L.LayerGroup()
    ]





    onMapReady(map: L.Map) {

        console.log("map ready")

        //THIS is the reason why this file will not be put into anything resembling production: .then()s
        let userPositionPromise: Promise<GeolocationPosition | null> = GetUserPosition();
        userPositionPromise.then((res) => {
            const userCoordinates = res ? new L.LatLng(res.coords.latitude, res.coords.longitude) : new L.LatLng(59.912527852972985, 10.746832664717447); //res or default

            this.userPosition = userCoordinates;

            //this is very stupid, just for testing the data.
            let nodesPromise: Promise<Array<OverpassNode> | null> = getLocalBars(userCoordinates);

            nodesPromise.then((res: Array<OverpassNode> | null) => {
                if (res == null) {
                    return;
                }
                const markers = res.map((el) => {
                    let node = el as OverpassNode;
                    let marker: L.Marker = new L.Marker([node.lat, node.lon], {
                        icon: L.icon({
                            iconSize: [15, 25],
                            shadowSize: [25, 50],
                            //			    iconAnchor: [13, 0],
                            shadowAnchor: [7, 37],
                            iconUrl: 'assets/marker-icon.png',
                            iconRetinaUrl: 'assets/marker-icon-2x.png',
                            shadowUrl: 'assets/marker-shadow.png'
                        })
                    });

                    if (node.tags == null) {
                        throw new ReferenceError("overpass returned a node with no tags)")
                    }


                    marker.bindPopup(node.tags["name"]);
                    marker.addEventListener('click', (() => {
                        let control = generateRouteFromPoint(new L.LatLng(node.lat, node.lon), res);
                        control.addTo(map);
                        console.debug('removing marker layer?')
                        this.mandatoryLayers[0] = new L.LayerGroup();

                    }));
                    return marker;
                })
                this.mandatoryLayers[0] = new L.LayerGroup(markers);

            });





        })


    }

}



/*
  TODO docstr
  */

async function getLocalBars(centerLocation: L.LatLng): Promise<Array<OverpassNode> | null> {
    //this is the difference, in degrees of lat/lon, between the user and the edge of where to fetch bars. They shold probably just be fetched in a circle.
    const BOX_SZ_DG: number = 0.1;
    //array of [left-edge, bottom-edge, right-edge, top-edge. used for join, more efficient to do both in a reduce/fold]
    const bounding_box: number[] = [centerLocation.lat - BOX_SZ_DG, centerLocation.lng - BOX_SZ_DG, centerLocation.lat + BOX_SZ_DG, centerLocation.lng + BOX_SZ_DG]; //jesus that is ugly.
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

/*
  todo docs
  NOTE: this def does not return a layergroup, return whatever openRouteService gives (or convert to something you can slap onto Leaflet
*/
function generateRouteFromPoint(start: L.LatLng, allNodes: Array<OverpassNode>) {

    const nodes: Array<OverpassNode> = findNCloseNodes(allNodes, [], AMOUNT_OF_BARS_PER_ROUTE, start);

    const markers: Array<L.LatLng> = nodes.map((el) => { return new L.LatLng(el.lat, el.lon) })

    return L.Routing.control({
        waypoints: markers,

        router: L.routing.osrmv1({
            language: 'en',
            profile: 'foot'
        })
    })

}




/*
  I LOVE RECURSION
  TODO docs
  */
function findNCloseNodes(nodes: Array<OverpassNode>, found: Array<OverpassNode>, target_length: number, center: L.LatLng, search_radius: number = 0.2): Array<OverpassNode> {

    if (found.length === target_length) {
        console.debug("found close nodes: ")
        console.debug(found);
        return found;
    }
    if (nodes.length === 0) { return found; }

    let current_node: OverpassNode = nodes[0];
    const new_center = new L.LatLng(current_node.lat, current_node.lon);

    if (calculateDistance(center, new_center) < search_radius && !found.includes(current_node)) {
        console.debug(`new: ${nodes[0]}`);

        found.push(nodes[0]);
        return findNCloseNodes(nodes.slice(1), found, target_length, new_center, search_radius);
    } else {
        return findNCloseNodes(nodes.slice(1), found, target_length, center, search_radius);
    }
}

/*
  calculates distance between two points, a and b. returns distance in kilometers
  
  stole this from my own old code from 3 years ago.
  */
function calculateDistance(a: L.LatLng, b: L.LatLng): number {
    const toRadian = (angle: number) => (Math.PI / 180) * angle;
    const distance = (_a: number, _b: number) => (Math.PI / 180) * (_a - _b);
    const RADIUS_OF_EARTH_IN_KM = 6371;

    const dLat = distance(a.lat, b.lat);
    const dLon = distance(b.lng, b.lng);

    var lat1 = toRadian(a.lat);
    var lat2 = toRadian(b.lat);

    // Haversine Formula
    const hav =
        Math.pow(Math.sin(dLat / 2), 2) +
        Math.pow(Math.sin(dLon / 2), 2) * Math.cos(lat1) * Math.cos(lat2);

    const c = 2 * Math.asin(Math.sqrt(hav));

    console.debug(RADIUS_OF_EARTH_IN_KM * c);

    return RADIUS_OF_EARTH_IN_KM * c;

}
