import type { HttpClient } from "../utils/httpClient";

export interface GeocodingResult {
    latitude: number;
    longitude: number;
    displayName: string;
    confidence?: number;
}

export interface IGeocodingService {
    getCoordinates(locationQuery: string): Promise<GeocodingResult | null>;
}

export class NominatimGeocodingService implements IGeocodingService {
    private readonly baseUrl = "https://nominatim.openstreetmap.org";

    constructor(private readonly http: HttpClient) { }

    async getCoordinates(locationQuery: string): Promise<GeocodingResult | null> {
        try {
            const encodedQuery = encodeURIComponent(locationQuery);
            const url = `${this.baseUrl}/search?q=${encodedQuery}&format=json&limit=1`;

            // Add a User-Agent header as required by Nominatim's usage policy
            const headers = {
                "User-Agent": "NationalParksInfo/1.0",
                "Accept": "application/json"
            };

            const response = await this.http.get<any[]>(url, { headers });

            if (response && response.length > 0) {
                const result = response[0];
                return {
                    latitude: parseFloat(result.lat),
                    longitude: parseFloat(result.lon),
                    displayName: result.display_name
                };
            }

            return null;
        } catch (error) {
            console.error("Error in geocoding service:", error);
            return null;
        }
    }
}