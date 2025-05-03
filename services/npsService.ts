import type { HttpClient } from "../utils/httpClient";

export interface Park {
    id: string;
    name: string;
    description?: string;
    url?: string;
    parkCode?: string;
    states?: string;
    latitude?: number;
    longitude?: number;
    activities?: Array<{ id: string, name: string }>;
    topics?: Array<{ id: string, name: string }>;
    entranceFees?: Array<{ cost: string, description: string, title: string }>;
    operatingHours?: Array<{
        standardHours: {
            sunday: string;
            monday: string;
            tuesday: string;
            wednesday: string;
            thursday: string;
            friday: string;
            saturday: string;
        };
        name: string;
        description: string;
    }>;
    images?: Array<{ url: string, caption: string, title: string }>;
}

export interface Alert {
    id: string;
    title: string;
    description: string;
    url?: string;
    parkCode: string;
    category: string;
    lastIndexedDate: string
}

export interface Event {
    id: string;
    title: string;
    description: string;
    location: string;
    dateStart: string;
    dateEnd: string;
    times: Array<{ timeStart: string, timeEnd: string }>;
    parkCode: string;
    feeInfo: string;
    contactName: string;
    contactEmailAddress: string;
}

export interface Campground {
    id: string;
    name: string;
    description: string;
    parkCode: string;
    reservationUrl?: string;
    reservationInfo?: string;
    fees?: Array<{ cost: string, description: string, title: string }>;
    totalSites?: number;
    campsites?: {
        totalSites: number;
        tentOnly: number;
        electricalHookups: number;
        rvOnly: number;
        walkBoatTo: number;
        group: number;
        horse: number;
    };
}

export interface Activity {
    id: string;
    name: string;
}

export interface INpsApiService {
    getParksByState(stateCode: string): Promise<Park[]>;
    getParkById(id: string): Promise<Park>;
    searchParks(query?: string, stateCode?: string, limit?: number, start?: number): Promise<Park[]>;
    getActivities(): Promise<Activity[]>;
    getParksByActivity(activityId: string): Promise<Park[]>;
    getAlertsByPark(parkCode: string): Promise<Alert[]>;
    getEventsByPark(parkCode: string, startDate?: string, endDate?: string): Promise<Event[]>;
    getCampgroundsByPark(parkCode: string): Promise<Campground[]>;
    getVisitorCenters(parkCode: string): Promise<any[]>;
    getThingsToDo(parkCode: string): Promise<any[]>;
    getParks(limit?: number): Promise<Park[]>;
    searchParksByLocation(latitude: number, longitude: number, maxResults?: number): Promise<Park[]>;
}

export class NpsApiService implements INpsApiService {
    private readonly baseUrl = "https://developer.nps.gov/api/v1";

    constructor(
        private readonly http: HttpClient,
        private readonly apiKey: string
    ) { }

    async searchParksByLocation(latitude: number, longitude: number, maxResults: number = 5): Promise<Park[]> {
        console.log(`NPS SERVICE: searchParksByLocation(${latitude}, ${longitude}, ${maxResults})`);

        // NPS API doesn't directly support lat/lon search, so we'll do a bounding box search
        // This creates a roughly 50-mile radius search box around the coordinates
        const miles = 50;
        const lat_range = miles / 69.0; // Approx miles per degree of latitude
        const lon_range = miles / (Math.cos(latitude * Math.PI / 180) * 69.0); // Adjust for longitude

        const north = latitude + lat_range;
        const south = latitude - lat_range;
        const east = longitude + lon_range;
        const west = longitude - lon_range;

        const boundingBox = `${north},${west},${south},${east}`;

        // The NPS API doesn't directly support bounding box, so we'll get all parks
        // and filter them ourselves
        const parks = await this.getParks(100);

        return parks.filter(park => {
            if (!park.latitude || !park.longitude) return false;

            return (
                park.latitude >= south &&
                park.latitude <= north &&
                park.longitude >= west &&
                park.longitude <= east
            );
        }).slice(0, maxResults);
    }

    async getParks(limit: number = 50, start: number = 0): Promise<Park[]> {
        console.log(`NPS SERVICE: getParks(limit: ${limit}, start: ${start}): Promise<Park[]>`);
        const url = `${this.baseUrl}/parks?limit=${limit}&start=${start}&api_key=${this.apiKey}`;
        const resp = await this.http.get<NpsApiResponse>(url);
        return resp.data.map((p) => this.mapParkResponse(p));
    }

    async getParksByState(stateCode: string): Promise<Park[]> {
        console.log("NPS SERVICE: async getParksByState(stateCode: string): Promise<Park[]> {")
        const url = `${this.baseUrl}/parks?stateCode=${stateCode}&api_key=${this.apiKey}`;
        const resp = await this.http.get<NpsApiResponse>(url);
        return resp.data.map((p) => this.mapParkResponse(p));
    }

    async getParkById(id: string): Promise<Park> {
        console.log("NPS SERVICE: async getParkById(id: string): Promise<Park> {")
        const url = `${this.baseUrl}/parks?parkCode=${id}&api_key=${this.apiKey}`;
        const resp = await this.http.get<NpsApiResponse>(url);
        const park = resp.data[0];
        return this.mapParkResponse(park);
    }

    // Search parks by keywords
    async searchParks(query?: string, stateCode?: string, limit: number = 10, start: number = 0): Promise<Park[]> {
        console.log(`NPS SERVICE: searchParks(query: ${query}, stateCode: ${stateCode}, limit: ${limit}, start: ${start})`);

        let url = `${this.baseUrl}/parks?api_key=${this.apiKey}&limit=${limit}&start=${start}`;

        if (query) {
            url += `&q=${encodeURIComponent(query)}`;
        }

        if (stateCode) {
            url += `&stateCode=${encodeURIComponent(stateCode)}`;
        }

        const resp = await this.http.get<NpsApiResponse>(url);
        return resp.data.map((p) => this.mapParkResponse(p));
    }

    // Get all activities
    async getActivities(): Promise<Activity[]> {
        console.log("NPS SERVICE: async getActivities(): Promise<Activity[]> {")
        const url = `${this.baseUrl}/activities?api_key=${this.apiKey}`;
        const resp = await this.http.get<{ data: Activity[] }>(url);
        return resp.data;
    }

    // Get parks by activity
    async getParksByActivity(activityId: string): Promise<Park[]> {
        console.log("NPS SERVICE: async getParksByActivity(activityId: string): Promise<Park[]> {")
        const url = `${this.baseUrl}/activities/parks?id=${activityId}&api_key=${this.apiKey}`;
        const resp = await this.http.get<{ data: [{ parks: string[] }] }>(url);

        // The response format for this endpoint is different, so we need to process it differently
        const parkCodes = resp.data[0].parks;

        // If there are no parks, return an empty array
        if (!parkCodes.length) return [];

        // Get detailed info for each park
        const parksParam = parkCodes.join(',');
        const parksUrl = `${this.baseUrl}/parks?parkCode=${parksParam}&api_key=${this.apiKey}`;
        const parksResp = await this.http.get<NpsApiResponse>(parksUrl);

        return parksResp.data.map((p) => this.mapParkResponse(p));
    }

    // Get alerts for a park
    async getAlertsByPark(parkCode: string): Promise<Alert[]> {
        console.log("NPS SERVICE: async getAlertsByPark(parkCode: string): Promise<Alert[]> {")
        const url = `${this.baseUrl}/alerts?parkCode=${parkCode}&api_key=${this.apiKey}`;
        const resp = await this.http.get<{ data: any[] }>(url);

        return resp.data.map(alert => ({
            id: alert.id,
            title: alert.title,
            description: alert.description,
            url: alert.url,
            parkCode: alert.parkCode,
            category: alert.category,
            lastIndexedDate: alert.lastIndexedDate
        }));
    }

    // Get events for a park
    async getEventsByPark(parkCode: string, startDate?: string, endDate?: string): Promise<Event[]> {
        let url = `${this.baseUrl}/events?parkCode=${parkCode}&api_key=${this.apiKey}`;

        if (startDate) {
            url += `&dateStart=${startDate}`;
        }

        if (endDate) {
            url += `&dateEnd=${endDate}`;
        }

        const resp = await this.http.get<{ data: any[] }>(url);

        return resp.data.map(event => ({
            id: event.id,
            title: event.title,
            description: event.description,
            location: event.location,
            dateStart: event.datestart,
            dateEnd: event.dateend,
            times: event.times || [],
            parkCode: event.parkCode,
            feeInfo: event.feeInfo,
            contactName: event.contactName,
            contactEmailAddress: event.contactEmailAddress
        }));
    }

    // Get campgrounds for a park
    async getCampgroundsByPark(parkCode: string): Promise<Campground[]> {
        console.log("NPS SERVICE: async getCampgroundsByPark(parkCode: string): Promise<Campground[]> {")
        const url = `${this.baseUrl}/campgrounds?parkCode=${parkCode}&api_key=${this.apiKey}`;
        const resp = await this.http.get<{ data: any[] }>(url);

        return resp.data.map(campground => ({
            id: campground.id,
            name: campground.name,
            description: campground.description,
            parkCode: campground.parkCode,
            reservationUrl: campground.reservationUrl,
            reservationInfo: campground.reservationInfo,
            fees: campground.fees,
            totalSites: campground.totalSites,
            campsites: campground.campsites
        }));
    }

    // Get visitor centers for a park
    async getVisitorCenters(parkCode: string): Promise<any[]> {
        console.log("NPS SERVICE: async getVisitorCenters(parkCode: string): Promise<any[]> {")
        const url = `${this.baseUrl}/visitorcenters?parkCode=${parkCode}&api_key=${this.apiKey}`;
        const resp = await this.http.get<{ data: any[] }>(url);
        return resp.data;
    }

    // Get things to do in a park
    async getThingsToDo(parkCode: string): Promise<any[]> {
        console.log("NPS SERVICE: async getThingsToDo(parkCode: string): Promise<any[]> {")
        const url = `${this.baseUrl}/thingstodo?parkCode=${parkCode}&api_key=${this.apiKey}`;
        const resp = await this.http.get<{ data: any[] }>(url);
        return resp.data;
    }

    // Helper method to map API response to Park interface
    private mapParkResponse(p: any): Park {
        return {
            id: p.id,
            name: p.fullName,
            description: p.description,
            url: p.url,
            parkCode: p.parkCode,
            states: p.states,
            latitude: parseFloat(p.latitude) || undefined,
            longitude: parseFloat(p.longitude) || undefined,
            activities: p.activities,
            topics: p.topics,
            entranceFees: p.entranceFees,
            operatingHours: p.operatingHours,
            images: p.images
        };
    }
}

interface NpsApiResponse {
    data: Array<{
        id: string;
        fullName: string;
        description?: string;
        url?: string;
        parkCode?: string;
        states?: string;
        latitude?: string;
        longitude?: string;
        activities?: Array<{ id: string, name: string }>;
        topics?: Array<{ id: string, name: string }>;
        entranceFees?: Array<{ cost: string, description: string, title: string }>;
        operatingHours?: any[];
        images?: any[];
    }>;
    total: string;
}