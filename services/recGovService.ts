import type { HttpClient } from "../utils/httpClient";

export interface Facility {
    facilityID: number;
    facilityName: string;
    latitude: number;
    longitude: number;
    facilityDescription?: string;
    facilityTypeDescription?: string;
    facilityPhone?: string;
    facilityEmail?: string;
    facilityReservationUrl?: string;
    facilityDirections?: string;
    facilityAdaAccess?: string;
}

export interface Trail {
    id: string;
    name: string;
    parkCode: string;
    length?: number;
    difficulty?: string;
    description?: string;
    elevationGain?: number;
    trailType?: string;
    surfaceType?: string;
    trailUse?: string[];
    trailhead?: {
        latitude: number;
        longitude: number;
        name?: string;
    };
    images?: Array<{ url: string, caption: string, title: string }>;
}

export interface Activity {
    activityID: number;
    activityName: string;
    activityParentID?: number;
}

export interface Availability {
    facilityID: number;
    campSiteID?: number;
    availableDate: string;
    availableStatus: 'Available' | 'Not Available' | 'Reserved';
    price?: number;
    siteType?: string;
}

export interface PermitEntrance {
    permitEntranceId: number;
    permitEntranceName: string;
    permitEntranceDescription?: string;
    permitEntranceType?: string;
    facility?: Facility;
}

export interface Tour {
    tourId: number;
    tourName: string;
    tourType?: string;
    tourDuration?: number;
    tourDescription?: string;
    facility?: Facility;
}

export interface IRecGovService {
    getFacilitiesByActivity(activityId: number): Promise<Facility[]>;
    getActivities(): Promise<Activity[]>;
    searchFacilities(query: string, limit?: number): Promise<Facility[]>;
    getFacilitiesByLocation(latitude: number, longitude: number, radius?: number): Promise<Facility[]>;
    checkFacilityAvailability(facilityId: number, startDate: string, endDate: string): Promise<Availability[]>;
    checkCampsiteAvailability(campsiteId: number, startDate: string, endDate: string): Promise<Availability[]>;
    getPermitEntrances(facilityId: number): Promise<PermitEntrance[]>;
    getTours(facilityId: number): Promise<Tour[]>;
    getRecAreasByState(stateCode: string): Promise<any[]>;
    getTrailsByPark(parkCode: string, query?: { trailId?: string, difficulty?: string, minLength?: number, maxLength?: number }): Promise<Trail[]>;
}

interface RecGovApiResponse {
    RECDATA: Array<{
        FacilityID: number;
        FacilityName: string;
        FacilityLatitude: number;
        FacilityLongitude: number;
        FacilityDescription?: string;
        FacilityTypeDescription?: string;
        FacilityPhone?: string;
        FacilityEmail?: string;
        FacilityReservationURL?: string;
        FacilityDirections?: string;
        FacilityAdaAccess?: string;
    }>;
    METADATA: {
        RESULTS: {
            CURRENT_COUNT: number;
            TOTAL_COUNT: number;
        };
    };
}

export class RecGovService implements IRecGovService {
    private readonly baseUrl = "https://ridb.recreation.gov/api/v1";

    constructor(
        private readonly http: HttpClient,
        private readonly apiKey: string
    ) { }

    async getTrailsByPark(
        parkCode: string,
        query?: {
            trailId?: string;
            difficulty?: string;
            minLength?: number;
            maxLength?: number
        }
    ): Promise<Trail[]> {
        try {
            // Map the NPS park code to Recreation.gov rec area ID
            const recAreaId = await this.parkToRecAreaId(parkCode);

            if (!recAreaId) {
                console.warn(`Could not find RecArea ID for park code: ${parkCode}`);
                return [];
            }

            // Fetch facilities for the rec area
            const url = `${this.baseUrl}/recareas/${recAreaId}/facilities`;
            const resp = await this.http.get<{ RECDATA: any[] }>(url, {
                headers: {
                    Accept: "application/json",
                    apikey: this.apiKey,
                },
            });

            if (!resp.RECDATA || resp.RECDATA.length === 0) {
                console.warn(`No facilities found for RecArea ID: ${recAreaId}`);
                return [];
            }

            // Filter for trail facilities
            let trails = resp.RECDATA.filter(facility =>
                facility.FacilityTypeDescription === "Trail" ||
                (facility.FacilityName && facility.FacilityName.toLowerCase().includes("trail"))
            );

            if (trails.length === 0) {
                console.warn(`No trails found for RecArea ID: ${recAreaId}`);

                // As a fallback, we could search for trails by name including the park name
                const parkName = await this.getParkNameFromCode(parkCode);
                if (parkName) {
                    const searchUrl = `${this.baseUrl}/facilities?query=${encodeURIComponent(parkName + " trail")}`;
                    const searchResp = await this.http.get<{ RECDATA: any[] }>(searchUrl, {
                        headers: {
                            Accept: "application/json",
                            apikey: this.apiKey,
                        },
                    });

                    trails = searchResp.RECDATA.filter(facility =>
                        facility.FacilityTypeDescription === "Trail" ||
                        (facility.FacilityName && facility.FacilityName.toLowerCase().includes("trail"))
                    );
                }
            }

            // For each trail, fetch additional details to get attributes like length and difficulty
            const detailedTrails = [];

            for (const trail of trails) {
                try {
                    const detailUrl = `${this.baseUrl}/facilities/${trail.FacilityID}`;
                    const detailResp = await this.http.get<{ RECDATA: any }>(detailUrl, {
                        headers: {
                            Accept: "application/json",
                            apikey: this.apiKey,
                        },
                    });

                    if (detailResp.RECDATA) {
                        detailedTrails.push({
                            ...trail,
                            Attributes: detailResp.RECDATA.ATTRIBUTES
                        });
                    } else {
                        detailedTrails.push(trail);
                    }
                } catch (error) {
                    console.warn(`Error fetching details for trail ${trail.FacilityID}:`, error);
                    detailedTrails.push(trail);
                }
            }

            // Apply additional filters if provided
            let filteredTrails = [...detailedTrails];

            if (query) {
                if (query.trailId) {
                    filteredTrails = filteredTrails.filter(trail =>
                        trail.FacilityID.toString() === query.trailId
                    );
                }

                if (query.difficulty) {
                    filteredTrails = filteredTrails.filter(trail => {
                        const difficultyAttr = this.getAttributeValue(trail, "Trail Difficulty");
                        return difficultyAttr &&
                            difficultyAttr.toLowerCase().includes(query.difficulty!.toLowerCase());
                    });
                }

                if (query.minLength) {
                    filteredTrails = filteredTrails.filter(trail => {
                        const lengthAttr = this.getAttributeValue(trail, "Trail Length");
                        return lengthAttr && parseFloat(lengthAttr) >= (query.minLength || 0);
                    });
                }

                if (query.maxLength) {
                    filteredTrails = filteredTrails.filter(trail => {
                        const lengthAttr = this.getAttributeValue(trail, "Trail Length");
                        return lengthAttr && parseFloat(lengthAttr) <= (query.maxLength || Infinity);
                    });
                }
            }

            // Map to the Trail interface
            return filteredTrails.map(trail => this.mapTrailResponse(trail, parkCode));
        } catch (error) {
            console.error(`Error in getTrailsByPark for parkCode ${parkCode}:`, error);
            throw error;
        }
    }

    // Helper for getting attribute value
    private getAttributeValue(facility: any, attributeName: string): string | undefined {
        if (!facility.Attributes) {
            return undefined;
        }

        // Handle different attribute formats based on the API responses
        if (Array.isArray(facility.Attributes)) {
            const attr = facility.Attributes.find((a: any) =>
                a.AttributeName === attributeName ||
                a.AttributeKey === attributeName
            );
            return attr ? attr.AttributeValue : undefined;
        } else if (facility.Attributes.ATTRIBUTES && Array.isArray(facility.Attributes.ATTRIBUTES)) {
            const attr = facility.Attributes.ATTRIBUTES.find((a: any) =>
                a.AttributeName === attributeName ||
                a.AttributeKey === attributeName
            );
            return attr ? attr.AttributeValue : undefined;
        }

        return undefined;
    }

    // Helper method to map API response to Trail interface
    private mapTrailResponse(trail: any, parkCode: string): Trail {
        // Extract trail attributes
        const getAttributeValue = (name: string) => {
            const attr = trail.Attributes?.find((a: any) => a.AttributeName === name);
            return attr ? attr.AttributeValue : undefined;
        };

        const length = getAttributeValue("Trail Length");
        const difficulty = getAttributeValue("Trail Difficulty");
        const elevationGain = getAttributeValue("Elevation Gain");
        const surfaceType = getAttributeValue("Trail Surface");

        // Map trail uses from attributes
        const trailUses: string[] = [];
        // Check for each official activity from the NPS API
        if (getAttributeValue("Arts and Culture") === "Yes") trailUses.push("Arts and Culture");
        if (getAttributeValue("Astronomy") === "Yes") trailUses.push("Astronomy");
        if (getAttributeValue("Auto and ATV") === "Yes") trailUses.push("Auto and ATV");
        if (getAttributeValue("Biking") === "Yes") trailUses.push("Biking");
        if (getAttributeValue("Boating") === "Yes") trailUses.push("Boating");
        if (getAttributeValue("Camping") === "Yes") trailUses.push("Camping");
        if (getAttributeValue("Canyoneering") === "Yes") trailUses.push("Canyoneering");
        if (getAttributeValue("Caving") === "Yes") trailUses.push("Caving");
        if (getAttributeValue("Climbing") === "Yes") trailUses.push("Climbing");
        if (getAttributeValue("Compass and GPS") === "Yes") trailUses.push("Compass and GPS");
        if (getAttributeValue("Dog Sledding") === "Yes") trailUses.push("Dog Sledding");
        if (getAttributeValue("Fishing") === "Yes") trailUses.push("Fishing");
        if (getAttributeValue("Flying") === "Yes") trailUses.push("Flying");
        if (getAttributeValue("Food") === "Yes") trailUses.push("Food");
        if (getAttributeValue("Golf") === "Yes") trailUses.push("Golf");
        if (getAttributeValue("Guided Tours") === "Yes") trailUses.push("Guided Tours");
        if (getAttributeValue("Hands-On") === "Yes") trailUses.push("Hands-On");
        if (getAttributeValue("Hiking") === "Yes") trailUses.push("Hiking");
        if (getAttributeValue("Horse Trekking") === "Yes") trailUses.push("Horse Trekking");
        if (getAttributeValue("Hunting and Gathering") === "Yes") trailUses.push("Hunting and Gathering");
        if (getAttributeValue("Ice Skating") === "Yes") trailUses.push("Ice Skating");
        if (getAttributeValue("Junior Ranger Program") === "Yes") trailUses.push("Junior Ranger Program");
        if (getAttributeValue("Living History") === "Yes") trailUses.push("Living History");
        if (getAttributeValue("Museum Exhibits") === "Yes") trailUses.push("Museum Exhibits");
        if (getAttributeValue("Paddling") === "Yes") trailUses.push("Paddling");
        if (getAttributeValue("Park Film") === "Yes") trailUses.push("Park Film");
        if (getAttributeValue("Playground") === "Yes") trailUses.push("Playground");
        if (getAttributeValue("SCUBA Diving") === "Yes") trailUses.push("SCUBA Diving");
        if (getAttributeValue("Shopping") === "Yes") trailUses.push("Shopping");
        if (getAttributeValue("Skiing") === "Yes") trailUses.push("Skiing");
        if (getAttributeValue("Snorkeling") === "Yes") trailUses.push("Snorkeling");
        if (getAttributeValue("Snow Play") === "Yes") trailUses.push("Snow Play");
        if (getAttributeValue("Snowmobiling") === "Yes") trailUses.push("Snowmobiling");
        if (getAttributeValue("Snowshoeing") === "Yes") trailUses.push("Snowshoeing");
        if (getAttributeValue("Surfing") === "Yes") trailUses.push("Surfing");
        if (getAttributeValue("Swimming") === "Yes") trailUses.push("Swimming");
        if (getAttributeValue("Team Sports") === "Yes") trailUses.push("Team Sports");
        if (getAttributeValue("Tubing") === "Yes") trailUses.push("Tubing");
        if (getAttributeValue("Water Skiing") === "Yes") trailUses.push("Water Skiing");
        if (getAttributeValue("Wildlife Watching") === "Yes") trailUses.push("Wildlife Watching");

        // We should also check for the activity IDs in case those are used instead of names
        const activityIdMap: Record<string, string> = {
            "09DF0950-D319-4557-A57E-04CD2F63FF42": "Arts and Culture",
            "13A57703-BB1A-41A2-94B8-53B692EB7238": "Astronomy",
            "5F723BAD-7359-48FC-98FA-631592256E35": "Auto and ATV",
            "7CE6E935-F839-4FEC-A63E-052B1DEF39D2": "Biking",
            "071BA73C-1D3C-46D4-A53C-00D5602F7F0E": "Boating",
            "A59947B7-3376-49B4-AD02-C0423E08C5F7": "Camping",
            "07CBCA6A-46B8-413F-8B6C-ABEDEBF9853E": "Canyoneering",
            "BA316D0F-92AE-4E00-8C80-DBD605DC58C3": "Caving",
            "B12FAAB9-713F-4B38-83E4-A273F5A43C77": "Climbing",
            "C11D3746-5063-4BD0-B245-7178D1AD866C": "Compass and GPS",
            "8C495067-8E94-4D78-BBD4-3379DACF6550": "Dog Sledding",
            "AE42B46C-E4B7-4889-A122-08FE180371AE": "Fishing",
            "D72206E4-6CD1-4441-A355-F8F1827466B1": "Flying",
            "1DFACD97-1B9C-4F5A-80F2-05593604799E": "Food",
            "3F3ABD16-2C52-4EAA-A1F6-4235DE5686F0": "Golf",
            "B33DC9B6-0B7D-4322-BAD7-A13A34C584A3": "Guided Tours",
            "42FD78B9-2B90-4AA9-BC43-F10E9FEA8B5A": "Hands-On",
            "BFF8C027-7C8F-480B-A5F8-CD8CE490BFBA": "Hiking",
            "0307955A-B65C-4CE4-A780-EB36BAAADF0B": "Horse Trekking",
            "8386EEAF-985F-4DE8-9037-CCF91975AC94": "Hunting and Gathering",
            "5FF5B286-E9C3-430E-B612-3380D8138600": "Ice Skating",
            "DF4A35E0-7983-4A3E-BC47-F37B872B0F25": "Junior Ranger Program",
            "B204DE60-5A24-43DD-8902-C81625A09A74": "Living History",
            "C8F98B28-3C10-41AE-AA99-092B3B398C43": "Museum Exhibits",
            "4D224BCA-C127-408B-AC75-A51563C42411": "Paddling",
            "0C0D142F-06B5-4BE1-8B44-491B90F93DEB": "Park Film",
            "7779241F-A70B-49BC-86F0-829AE332C708": "Playground",
            "42CF4021-8524-428E-866A-D33097A4A764": "SCUBA Diving",
            "24380E3F-AD9D-4E38-BF13-C8EEB21893E7": "Shopping",
            "F9B1D433-6B86-4804-AED7-B50A519A3B7C": "Skiing",
            "3EBF7EAC-68FC-4754-B6A4-0C38A1583D45": "Snorkeling",
            "C38B3C62-1BBF-4EA1-A1A2-35DE21B74C17": "Snow Play",
            "7C912B83-1B1B-4807-9B66-97C12211E48E": "Snowmobiling",
            "01D717BC-18BB-4FE4-95BA-6B13AD702038": "Snowshoeing",
            "AE3C95F5-E05B-4A28-81DD-1C5FD4BE88E2": "Surfing",
            "587BB2D3-EC35-41B2-B3F7-A39E2B088AEE": "Swimming",
            "94369BFD-F186-477E-8713-AE2A745154DA": "Team Sports",
            "4D06CEED-90C6-4B69-B264-32CC90B69BA6": "Tubing",
            "8A1C7B17-C2C6-4F7C-9539-EA1E19971D80": "Water Skiing",
            "0B685688-3405-4E2A-ABBA-E3069492EC50": "Wildlife Watching"
        };

        // Check if activities are stored by ID in attributes
        Object.entries(activityIdMap).forEach(([id, name]) => {
            if (getAttributeValue(id) === "Yes" && !trailUses.includes(name)) {
                trailUses.push(name);
            }
        });

        // Also check if activities are listed in a single attribute
        const activitiesAttribute = getAttributeValue("Activities");
        if (activitiesAttribute) {
            try {
                // It might be stored as JSON
                const activities = JSON.parse(activitiesAttribute);
                if (Array.isArray(activities)) {
                    activities.forEach(activity => {
                        if (typeof activity === "string" && !trailUses.includes(activity)) {
                            trailUses.push(activity);
                        } else if (activity.name && !trailUses.includes(activity.name)) {
                            trailUses.push(activity.name);
                        } else if (activity.id && activityIdMap[activity.id] && !trailUses.includes(activityIdMap[activity.id])) {
                            trailUses.push(activityIdMap[activity.id]);
                        }
                    });
                }
            } catch (e) {
                // If it's not JSON, it might be comma-separated
                activitiesAttribute.split(',').forEach((activity: any) => {
                    const trimmedActivity = activity.trim();
                    if (trimmedActivity && !trailUses.includes(trimmedActivity)) {
                        trailUses.push(trimmedActivity);
                    }
                });
            }
        }

        return {
            id: trail.FacilityID.toString(),
            name: trail.FacilityName,
            parkCode,
            length: length ? parseFloat(length) : undefined,
            difficulty,
            description: trail.FacilityDescription,
            elevationGain: elevationGain ? parseFloat(elevationGain) : undefined,
            trailType: getAttributeValue("Trail Type"),
            surfaceType,
            trailUse: trailUses,
            trailhead: trail.FacilityLatitude && trail.FacilityLongitude ? {
                latitude: trail.FacilityLatitude,
                longitude: trail.FacilityLongitude,
                name: trail.FacilityName
            } : undefined
        };
    }

    // Park code to RecArea ID mapping function
    private async parkToRecAreaId(parkCode: string): Promise<number | null> {
        // In a production system, we might maintain a mapping database or cache
        // For now, we'll use a combination of hardcoded mappings and API search

        // Well-known park codes to rec area IDs mapping
        const knownMappings: Record<string, number> = {
            'yose': 2991, // Yosemite National Park
            'grca': 2733, // Grand Canyon National Park
            'zion': 3042, // Zion National Park
            'yell': 3039, // Yellowstone National Park
            'glac': 2725, // Glacier National Park
            'romo': 2959, // Rocky Mountain National Park
            'seki': 2979, // Sequoia & Kings Canyon National Parks
            'olym': 2918, // Olympic National Park
            'acad': 2674, // Acadia National Park
            'grsm': 2734, // Great Smoky Mountains National Park
        };

        // If we have a mapping, use it
        if (knownMappings[parkCode]) {
            return knownMappings[parkCode];
        }

        // Otherwise, try to search for it
        try {
            const parkName = await this.getParkNameFromCode(parkCode);

            if (!parkName) {
                console.warn(`Unable to resolve park name for code: ${parkCode}`);
                return null;
            }

            const url = `${this.baseUrl}/recareas?query=${encodeURIComponent(parkName)}`;
            const resp = await this.http.get<{ RECDATA: any[] }>(url, {
                headers: {
                    Accept: "application/json",
                    apikey: this.apiKey,
                },
            });

            if (!resp.RECDATA || resp.RECDATA.length === 0) {
                console.warn(`No RecAreas found for query: ${parkName}`);
                return null;
            }

            // Try to find best match
            // First look for exact matches in name
            let bestMatch = resp.RECDATA.find(area =>
                area.RecAreaName.toLowerCase() === parkName.toLowerCase() ||
                area.RecAreaName.toLowerCase().includes(parkName.toLowerCase() + " national park")
            );

            // If no exact match, use the first one that contains the park name
            if (!bestMatch) {
                bestMatch = resp.RECDATA.find(area =>
                    area.RecAreaName.toLowerCase().includes(parkName.toLowerCase())
                );
            }

            // Fallback to first result if still no match
            if (!bestMatch && resp.RECDATA.length > 0) {
                bestMatch = resp.RECDATA[0];
            }

            return bestMatch ? bestMatch.RecAreaID : null;
        } catch (error) {
            console.error("Error mapping park code to rec area ID:", error);
            return null;
        }
    }

    async getFacilitiesByActivity(activityId: number): Promise<Facility[]> {
        const url = `${this.baseUrl}/facilities?activity=${activityId}`;
        const resp = await this.http.get<RecGovApiResponse>(url, {
            headers: {
                Accept: "application/json",
                apikey: this.apiKey,
            },
        });
        return resp.RECDATA.map((f) => this.mapFacilityResponse(f));
    }

    // Get all available activities
    async getActivities(): Promise<Activity[]> {
        const url = `${this.baseUrl}/activities`;
        const resp = await this.http.get<{ RECDATA: any[] }>(url, {
            headers: {
                Accept: "application/json",
                apikey: this.apiKey,
            },
        });

        return resp.RECDATA.map(activity => ({
            activityID: activity.ActivityID,
            activityName: activity.ActivityName,
            activityParentID: activity.ActivityParentID
        }));
    }

    // Search facilities by name or keyword
    async searchFacilities(query: string, limit: number = 20): Promise<Facility[]> {
        const url = `${this.baseUrl}/facilities?query=${encodeURIComponent(query)}&limit=${limit}`;
        const resp = await this.http.get<RecGovApiResponse>(url, {
            headers: {
                Accept: "application/json",
                apikey: this.apiKey,
            },
        });

        return resp.RECDATA.map(f => this.mapFacilityResponse(f));
    }

    // Find facilities near a location
    async getFacilitiesByLocation(latitude: number, longitude: number, radius: number = 25): Promise<Facility[]> {
        const url = `${this.baseUrl}/facilities?latitude=${latitude}&longitude=${longitude}&radius=${radius}`;
        const resp = await this.http.get<RecGovApiResponse>(url, {
            headers: {
                Accept: "application/json",
                apikey: this.apiKey,
            },
        });

        return resp.RECDATA.map(f => this.mapFacilityResponse(f));
    }

    // Check availability for a facility (campground)
    async checkFacilityAvailability(facilityId: number, startDate: string, endDate: string): Promise<Availability[]> {
        // The actual Recreation.gov API doesn't have this endpoint directly
        // This might require direct access to their reservation system or a third-party service
        // For demonstration purposes, we'll simulate with a mock implementation

        // In a real implementation, we might need to:
        // 1. Get all campsites for the facility
        // 2. Check availability for each campsite

        return this.mockAvailabilityCheck(facilityId, startDate, endDate);
    }

    async checkCampgroundAvailability(
        facilityId: string | number,
        startDate: string,
        endDate: string,
        campsiteType?: string
    ): Promise<{
        facilityId: number;
        facilityName: string;
        availableSites: number;
        totalSites: number;
        availableDates: {
            date: string;
            sites: Array<{
                siteId: number;
                siteName: string;
                siteType: string;
                isAvailable: boolean;
                price?: number;
            }>;
        }[];
        reservationUrl?: string;
    }> {
        // For real implementation, we would call the Recreation.gov API
        // Here's a more realistic shape for the output

        // In a real scenario, we'd look up the campground details first
        const facilityDetails = await this.getFacilityDetails(Number(facilityId));

        // Then get availability for each campsite in the facility
        const availabilityData = await this.checkFacilityAvailability(
            Number(facilityId),
            startDate,
            endDate
        );

        // Process the results into a more user-friendly format
        const dateRange = this.getDateRange(startDate, endDate);
        const availableDates: any[] = [];

        for (const date of dateRange) {
            const sitesForDate = availabilityData.filter(a =>
                a.availableDate === date &&
                (!campsiteType || a.siteType === campsiteType)
            );

            const availableSitesForDate = sitesForDate.filter(s =>
                s.availableStatus === 'Available'
            );

            availableDates.push({
                date,
                sites: sitesForDate.map(site => ({
                    siteId: site.campSiteID,
                    siteName: `Site ${site.campSiteID}`, // We'd get actual names from the API
                    siteType: site.siteType || 'Standard', // We'd get actual types from the API
                    isAvailable: site.availableStatus === 'Available',
                    price: site.price
                }))
            });
        }

        // Count totals
        const totalSites = availableDates[0]?.sites.length || 0;
        const availableSites = availableDates.reduce((count, date) =>
            count + date.sites.filter((s: any) => s.isAvailable).length,
            0) / dateRange.length; // Average over all dates

        return {
            facilityId: Number(facilityId),
            facilityName: facilityDetails?.facilityName || `Facility ${facilityId}`,
            availableSites,
            totalSites,
            availableDates,
            reservationUrl: facilityDetails?.facilityReservationUrl ||
                `https://www.recreation.gov/camping/campgrounds/${facilityId}`
        };
    }

    // Get facility details
    async getFacilityDetails(facilityId: number): Promise<Facility | null> {
        try {
            const url = `${this.baseUrl}/facilities/${facilityId}`;
            const resp = await this.http.get<{ RECDATA: any }>(url, {
                headers: {
                    Accept: "application/json",
                    apikey: this.apiKey,
                },
            });

            if (!resp.RECDATA) {
                console.warn(`No data returned for facility ID: ${facilityId}`);
                return null;
            }

            return this.mapFacilityResponse(resp.RECDATA);
        } catch (error) {
            console.error(`Error getting facility details for ID ${facilityId}:`, error);
            return null;
        }
    }

    private async getParkNameFromCode(parkCode: string): Promise<string | null> {
        // Well-known park codes to names mapping
        const parkMap: Record<string, string> = {
            'yose': 'Yosemite',
            'grca': 'Grand Canyon',
            'zion': 'Zion',
            'yell': 'Yellowstone',
            'glac': 'Glacier',
            'romo': 'Rocky Mountain',
            'seki': 'Sequoia Kings Canyon',
            'olym': 'Olympic',
            'acad': 'Acadia',
            'grsm': 'Great Smoky Mountains',
            'dena': 'Denali',
            'jotr': 'Joshua Tree',
            'arch': 'Arches',
            'brca': 'Bryce Canyon',
            'cany': 'Canyonlands',
            'care': 'Capitol Reef',
            'cave': 'Carlsbad Caverns',
            'chis': 'Channel Islands',
            'crla': 'Crater Lake',
            'depo': 'Death Valley',
            'ever': 'Everglades',
            'gumo': 'Guadalupe Mountains',
            'havo': 'Hawaii Volcanoes',
            'hosp': 'Hot Springs',
            'isro': 'Isle Royale',
            'kefj': 'Kenai Fjords',
            'lavo': 'Lassen Volcanic',
            'maca': 'Mammoth Cave',
            'meve': 'Mesa Verde',
            'mora': 'Mount Rainier',
            'noca': 'North Cascades',
            'pefo': 'Petrified Forest',
            'redw': 'Redwood',
            'sagu': 'Saguaro',
            'shen': 'Shenandoah',
            'thro': 'Theodore Roosevelt',
            'voya': 'Voyageurs',
            'wica': 'Wind Cave',
            'wrst': 'Wrangell St Elias',
        };

        if (parkMap[parkCode]) {
            return parkMap[parkCode];
        }

        // In a real implementation, we would call the NPS API directly
        // or maintain a complete database of park codes

        // For now, we'll return null for unknown codes
        return null;
    }


    // Helper method to generate a range of dates as strings
    private getDateRange(startDate: string, endDate: string): string[] {
        const start = new Date(startDate);
        const end = new Date(endDate);
        const dates: string[] = [];

        let current = new Date(start);
        while (current <= end) {
            dates.push(current.toISOString().split('T')[0]);
            current.setDate(current.getDate() + 1);
        }

        return dates;
    }

    // Check availability for a specific campsite
    async checkCampsiteAvailability(campsiteId: number, startDate: string, endDate: string): Promise<Availability[]> {
        // Similar to above, this would require direct access to their reservation system
        // This is a mock implementation

        return [{
            facilityID: Math.floor(campsiteId / 1000), // Simulate facility ID
            campSiteID: campsiteId,
            availableDate: startDate,
            availableStatus: Math.random() > 0.5 ? 'Available' : 'Reserved',
            price: Math.floor(Math.random() * 30) + 20,
            siteType: 'campsite'
        }];
    }

    // Get permit entrances for a facility
    async getPermitEntrances(facilityId: number): Promise<PermitEntrance[]> {
        const url = `${this.baseUrl}/facilities/${facilityId}/permitentrances`;
        const resp = await this.http.get<{ RECDATA: any[] }>(url, {
            headers: {
                Accept: "application/json",
                apikey: this.apiKey,
            },
        });

        return resp.RECDATA.map(entrance => ({
            permitEntranceId: entrance.PermitEntranceID,
            permitEntranceName: entrance.PermitEntranceName,
            permitEntranceDescription: entrance.PermitEntranceDescription,
            permitEntranceType: entrance.PermitEntranceType
        }));
    }

    // Get tours for a facility
    async getTours(facilityId: number): Promise<Tour[]> {
        const url = `${this.baseUrl}/facilities/${facilityId}/tours`;
        const resp = await this.http.get<{ RECDATA: any[] }>(url, {
            headers: {
                Accept: "application/json",
                apikey: this.apiKey,
            },
        });

        return resp.RECDATA.map(tour => ({
            tourId: tour.TourID,
            tourName: tour.TourName,
            tourType: tour.TourType,
            tourDuration: tour.TourDuration,
            tourDescription: tour.TourDescription
        }));
    }

    // Get recreation areas by state
    async getRecAreasByState(stateCode: string): Promise<any[]> {
        const url = `${this.baseUrl}/recareas?state=${stateCode}`;
        const resp = await this.http.get<{ RECDATA: any[] }>(url, {
            headers: {
                Accept: "application/json",
                apikey: this.apiKey,
            },
        });

        return resp.RECDATA;
    }

    // Helper method to map API response to Facility interface
    private mapFacilityResponse(f: any): Facility {
        return {
            facilityID: f.FacilityID,
            facilityName: f.FacilityName,
            latitude: f.FacilityLatitude,
            longitude: f.FacilityLongitude,
            facilityDescription: f.FacilityDescription,
            facilityTypeDescription: f.FacilityTypeDescription,
            facilityPhone: f.FacilityPhone,
            facilityEmail: f.FacilityEmail,
            facilityReservationUrl: f.FacilityReservationURL,
            facilityDirections: f.FacilityDirections,
            facilityAdaAccess: f.FacilityAdaAccess
        };
    }

    // Mock function for availability checking
    private mockAvailabilityCheck(facilityId: number, startDate: string, endDate: string): Availability[] {
        const dateStart = new Date(startDate);
        const dateEnd = new Date(endDate);
        const daysDiff = Math.ceil((dateEnd.getTime() - dateStart.getTime()) / (1000 * 3600 * 24));

        const result: Availability[] = [];

        for (let i = 0; i < daysDiff; i++) {
            const currentDate = new Date(dateStart);
            currentDate.setDate(dateStart.getDate() + i);

            // Create 3 random campsites
            for (let siteId = 1; siteId <= 3; siteId++) {
                result.push({
                    facilityID: facilityId,
                    campSiteID: facilityId * 1000 + siteId,
                    availableDate: currentDate.toISOString().split('T')[0],
                    availableStatus: Math.random() > 0.6 ? 'Available' : 'Reserved',
                    price: Math.floor(Math.random() * 30) + 20,
                    siteType: 'campsite'
                });
            }
        }

        return result;
    }
}