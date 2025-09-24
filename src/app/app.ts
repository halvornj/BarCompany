import { Component, signal } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { Barcard } from './barcard/barcard';
import { LeafletDirective } from '@bluehalo/ngx-leaflet';
import * as Leaflet from 'leaflet';
import type { OverpassJson } from "overpass-ts";
import { overpass } from 'overpass-ts';



@Component({
    selector: 'app-root',
    imports: [RouterOutlet, Barcard, LeafletDirective],
    templateUrl: './app.html',
    styleUrl: './app.scss'
})
export class App {
    protected readonly title = signal('BarCompany');

    options: Leaflet.MapOptions = {
        layers: [
            Leaflet.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
                attribution: '&amp;copy; OpenStreetMap contributors'
            })
        ],
        zoom: 15,
        center: new Leaflet.LatLng(59.912527852972985, 10.746832664717447)
    };


    //overpass api (used for hitting openstreetmap)
    request: Promise<Response | void> = overpass(`[out:json]; node["amenity"="bar"](59.9,10.7,60.0,10.8 ); out ids;`)
        .then((res: Response) => {
            if (!res.ok) {
                throw new ReferenceError("todo exceptions :)");
            }// res ok
            res.json().then((val: OverpassJson) => {
                console.log(val);
            });
        });

}
