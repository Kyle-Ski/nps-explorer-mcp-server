import { McpAgent } from "agents/mcp";
import { McpServer, ResourceTemplate } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { HttpClient } from "./utils/httpClient";
import { NpsApiService, type Park } from "./services/npsService";
import { RecGovService } from "./services/recGovService";
import { WeatherApiService, type ForecastDay } from "./services/weatherService";
import OAuthProvider from "@cloudflare/workers-oauth-provider";
import { GitHubHandler } from "./githubHandler";

export interface Env {
    NpsMcpAgent: DurableObjectNamespace;
    OAUTH_KV: KVNamespace;
    GITHUB_CLIENT_ID: string;
    GITHUB_CLIENT_SECRET: string;
    COOKIE_ENCRYPTION_KEY: string;
    NPS_API_KEY: string;
    RECGOV_API_KEY: string;
    WEATHER_API_KEY: string;
    ANTHROPIC_API_KEY: string;
}

type State = { counter: number };

export class NpsMcpAgent extends McpAgent<Env, State> {
    server = new McpServer({
        name: "NPS MCP Server",
        version: "1.0.0",
    });

    initialState: State = {
        counter: 1,
    };

    async init() {
        const http = new HttpClient();
        const npsService = new NpsApiService(http, this.env.NPS_API_KEY);
        const recGovService = new RecGovService(http, this.env.RECGOV_API_KEY);
        const weatherService = new WeatherApiService(http, this.env.WEATHER_API_KEY);

        // Add a resource for counter
        this.server.resource("counter", "mcp://resource/counter", (uri) => {
            return {
                contents: [{ uri: uri.href, text: String(this.state.counter) }],
            };
        });

        // Park resource
        this.server.resource(
            "park",
            new ResourceTemplate("park://{parkCode}", { list: undefined }),
            async (uri, vars) => {
                const code = Array.isArray(vars.parkCode) ? vars.parkCode[0] : vars.parkCode;
                const park = await npsService.getParkById(code);
                return { contents: [{ uri: uri.href, text: JSON.stringify(park, null, 2) }] };
            }
        );

        // Facilities by activity
        this.server.resource(
            "facilities",
            new ResourceTemplate("facilities://{activityId}", { list: undefined }),
            async (uri, vars) => {
                const idStr = Array.isArray(vars.activityId) ? vars.activityId[0] : vars.activityId;
                const facs = await recGovService.getFacilitiesByActivity(+idStr);
                return { contents: [{ uri: uri.href, text: JSON.stringify(facs, null, 2) }] };
            }
        );

        // 7-day forecast by freeform location
        this.server.resource(
            "forecast",
            new ResourceTemplate("weather://{location}", { list: undefined }),
            async (uri, vars) => {
                const loc = Array.isArray(vars.location) ? vars.location[0] : vars.location;
                const forecast = await weatherService.get7DayForecastByLocation(loc);
                return { contents: [{ uri: uri.href, text: JSON.stringify(forecast, null, 2) }] };
            }
        );

        // Add a resource for NPS parks information
        this.server.resource("parks", "mcp://resource/parks", (uri) => {
            // This would typically fetch data from an API or database
            return {
                contents: [
                    {
                        uri: uri.href,
                        text: "Information about National Parks"
                    }
                ],
            };
        });

        // Park activities resource
        this.server.resource(
            "activities",
            "mcp://resource/activities",
            async (uri) => {
                const activities = await npsService.getActivities();
                return { contents: [{ uri: uri.href, text: JSON.stringify(activities, null, 2) }] };
            }
        );

        // Parks by activity
        this.server.resource(
            "parksByActivity",
            new ResourceTemplate("parks-by-activity://{activityId}", { list: undefined }),
            async (uri, vars) => {
                const activityId = Array.isArray(vars.activityId) ? vars.activityId[0] : vars.activityId;
                const parks = await npsService.getParksByActivity(activityId);
                return { contents: [{ uri: uri.href, text: JSON.stringify(parks, null, 2) }] };
            }
        );

        // Park alerts
        this.server.resource(
            "parkAlerts",
            new ResourceTemplate("alerts://{parkCode}", { list: undefined }),
            async (uri, vars) => {
                const parkCode = Array.isArray(vars.parkCode) ? vars.parkCode[0] : vars.parkCode;
                const alerts = await npsService.getAlertsByPark(parkCode);
                return { contents: [{ uri: uri.href, text: JSON.stringify(alerts, null, 2) }] };
            }
        );

        // Park events
        this.server.resource(
            "parkEvents",
            new ResourceTemplate("events://{parkCode}", { list: undefined }),
            async (uri, vars) => {
                const parkCode = Array.isArray(vars.parkCode) ? vars.parkCode[0] : vars.parkCode;
                // Get events for the next 30 days
                const today = new Date();
                const endDate = new Date();
                endDate.setDate(today.getDate() + 30);

                const startDateStr = today.toISOString().split('T')[0];
                const endDateStr = endDate.toISOString().split('T')[0];

                const events = await npsService.getEventsByPark(
                    parkCode,
                    startDateStr,
                    endDateStr
                );
                return { contents: [{ uri: uri.href, text: JSON.stringify(events, null, 2) }] };
            }
        );

        // Park campgrounds
        this.server.resource(
            "campgrounds",
            new ResourceTemplate("campgrounds://{parkCode}", { list: undefined }),
            async (uri, vars) => {
                const parkCode = Array.isArray(vars.parkCode) ? vars.parkCode[0] : vars.parkCode;
                const campgrounds = await npsService.getCampgroundsByPark(parkCode);
                return { contents: [{ uri: uri.href, text: JSON.stringify(campgrounds, null, 2) }] };
            }
        );

        // Detailed weather forecast
        this.server.resource(
            "detailedForecast",
            new ResourceTemplate("detailed-weather://{location}", { list: undefined }),
            async (uri, vars) => {
                const location = Array.isArray(vars.location) ? vars.location[0] : vars.location;
                const forecast = await weatherService.getDetailedForecast(decodeURIComponent(location));
                return { contents: [{ uri: uri.href, text: JSON.stringify(forecast, null, 2) }] };
            }
        );

        // Weather alerts
        this.server.resource(
            "weatherAlerts",
            new ResourceTemplate("weather-alerts://{location}", { list: undefined }),
            async (uri, vars) => {
                const location = Array.isArray(vars.location) ? vars.location[0] : vars.location;
                const alerts = await weatherService.getWeatherAlerts(decodeURIComponent(location));
                return { contents: [{ uri: uri.href, text: JSON.stringify(alerts, null, 2) }] };
            }
        );

        // Air quality
        this.server.resource(
            "airQuality",
            new ResourceTemplate("air-quality://{location}", { list: undefined }),
            async (uri, vars) => {
                const location = Array.isArray(vars.location) ? vars.location[0] : vars.location;
                const airQuality = await weatherService.getAirQuality(decodeURIComponent(location));
                return { contents: [{ uri: uri.href, text: JSON.stringify(airQuality, null, 2) }] };
            }
        );

        // Recreation areas by state
        this.server.resource(
            "recAreasByState",
            new ResourceTemplate("rec-areas://{stateCode}", { list: undefined }),
            async (uri, vars) => {
                const stateCode = Array.isArray(vars.stateCode) ? vars.stateCode[0] : vars.stateCode;
                const areas = await recGovService.getRecAreasByState(stateCode);
                return { contents: [{ uri: uri.href, text: JSON.stringify(areas, null, 2) }] };
            }
        );

        // Tool for comprehensive park information
        this.server.tool(
            "getParkOverview",
            "Get comprehensive overview of a national park including alerts, events, and weather",
            {
                parkCode: z.string().describe("The park code (e.g., 'yose' for Yosemite)")
            },
            async ({ parkCode }) => {
                try {
                    // Get park info
                    const park = await npsService.getParkById(parkCode);
                    if (!park) {
                        return {
                            content: [{ type: "text", text: `Could not find park with code: ${parkCode}` }]
                        };
                    }

                    // Get alerts
                    const alerts = await npsService.getAlertsByPark(parkCode);

                    // Get weather
                    const forecast = await weatherService.get7DayForecastByLocation(park.name);

                    // Get upcoming events
                    const today = new Date();
                    const endDate = new Date();
                    endDate.setDate(today.getDate() + 14); // Next 2 weeks

                    const events = await npsService.getEventsByPark(
                        parkCode,
                        today.toISOString().split('T')[0],
                        endDate.toISOString().split('T')[0]
                    );

                    // Get campgrounds
                    const campgrounds = await npsService.getCampgroundsByPark(parkCode);

                    // Format a comprehensive response
                    let response = `# ${park.name} Overview\n\n`;

                    // Basic info
                    response += `## About\n${park.description || "No description available."}\n\n`;

                    // Location
                    if (park.latitude && park.longitude) {
                        response += `**Location**: ${park.latitude}, ${park.longitude}\n\n`;
                    }

                    // Alerts
                    response += `## Current Alerts (${alerts.length})\n`;
                    if (alerts.length === 0) {
                        response += "No current alerts for this park.\n\n";
                    } else {
                        alerts.slice(0, 3).forEach(alert => {
                            response += `- **${alert.title}** (${alert.category}): ${alert.description.substring(0, 100)}...\n`;
                        });
                        if (alerts.length > 3) {
                            response += `- Plus ${alerts.length - 3} more alerts\n`;
                        }
                        response += "\n";
                    }

                    // Weather
                    response += `## 7-Day Weather Forecast\n`;
                    if (!forecast || forecast.length === 0) {
                        response += "Weather forecast not available.\n\n";
                    } else {
                        forecast.forEach(day => {
                            response += `- **${day.date}**: ${day.minTempF}°F to ${day.maxTempF}°F, ${day.condition}\n`;
                        });
                        response += "\n";
                    }

                    // Upcoming events
                    response += `## Upcoming Events (${events.length})\n`;
                    if (events.length === 0) {
                        response += "No upcoming events in the next 14 days.\n\n";
                    } else {
                        events.slice(0, 5).forEach(event => {
                            response += `- **${event.title}** (${event.dateStart}): ${event.location}\n`;
                        });
                        if (events.length > 5) {
                            response += `- Plus ${events.length - 5} more events\n`;
                        }
                        response += "\n";
                    }

                    // Campgrounds
                    response += `## Camping Options (${campgrounds.length})\n`;
                    if (campgrounds.length === 0) {
                        response += "No campgrounds available in this park.\n\n";
                    } else {
                        campgrounds.slice(0, 3).forEach(campground => {
                            let siteInfo = "";
                            if (campground.totalSites) {
                                siteInfo = ` (${campground.totalSites} sites)`;
                            }
                            response += `- **${campground.name}**${siteInfo}\n`;
                        });
                        if (campgrounds.length > 3) {
                            response += `- Plus ${campgrounds.length - 3} more campgrounds\n`;
                        }
                    }

                    return {
                        content: [{ type: "text", text: response }]
                    };
                } catch (error: any) {
                    console.error("Error in getParkOverview:", error);
                    return {
                        content: [{ type: "text", text: `Error retrieving park overview: ${error.message}` }]
                    };
                }
            }
        );

        // Tool to get trail information
        this.server.tool(
            "getTrailInfo",
            "Get detailed information about trails in national parks including difficulty, length, elevation gain, and current conditions",
            {
                parkCode: z.string().describe("The park code (e.g., 'yose' for Yosemite)"),
                trailId: z.string().optional().describe("Specific trail ID (optional)"),
                difficulty: z.enum(["easy", "moderate", "strenuous"]).optional().describe("Filter trails by difficulty level"),
                minLength: z.number().optional().describe("Minimum trail length in miles"),
                maxLength: z.number().optional().describe("Maximum trail length in miles")
            },
            async ({ parkCode, trailId, difficulty, minLength, maxLength }) => {
                try {
                    // Get trails for the specified park with all the filters
                    const trails = await recGovService.getTrailsByPark(parkCode, {
                        trailId,
                        difficulty,
                        minLength,
                        maxLength
                    });

                    if (!trails || trails.length === 0) {
                        return {
                            content: [{
                                type: "text",
                                text: `No trails found in park ${parkCode} matching your criteria.`
                            }]
                        };
                    }

                    // Get park info for context
                    const park = await npsService.getParkById(parkCode);

                    // Format response
                    let response = `# Trails in ${park ? park.name : parkCode}\n\n`;
                    response += `Found ${trails.length} trails matching your criteria:\n\n`;

                    trails.forEach((trail, index) => {
                        response += `## ${index + 1}. ${trail.name}\n`;

                        if (trail.description) {
                            response += `${trail.description}\n\n`;
                        }

                        if (trail.length) {
                            response += `**Length:** ${trail.length} miles\n`;
                        }

                        if (trail.difficulty) {
                            response += `**Difficulty:** ${trail.difficulty}\n`;
                        }

                        if (trail.elevationGain) {
                            response += `**Elevation Gain:** ${trail.elevationGain} ft\n`;
                        }

                        if (trail.surfaceType) {
                            response += `**Surface:** ${trail.surfaceType}\n`;
                        }

                        if (trail.trailUse && trail.trailUse.length > 0) {
                            response += `**Permitted Uses:** ${trail.trailUse.join(", ")}\n`;
                        }

                        if (trail.trailhead) {
                            response += `**Trailhead Coordinates:** ${trail.trailhead.latitude}, ${trail.trailhead.longitude}\n`;
                        }

                        response += `\n---\n\n`;
                    });

                    return {
                        content: [{ type: "text", text: response }]
                    };
                } catch (error: any) {
                    console.error("Error in getTrailInfo:", error);
                    return {
                        content: [{
                            type: "text",
                            text: `Error retrieving trail information: ${error.message}`
                        }]
                    };
                }
            }
        );

        // Tool to find parks based on multiple criteria
        this.server.tool(
            "findParks",
            "Find national parks based on criteria such as state, activities, or amenities",
            {
                stateCode: z.string().optional().describe("Two-letter state code (e.g., CA, NY)"),
                activity: z.string().optional().describe("Activity to filter parks by (e.g., hiking, camping)"),
                q: z.string().optional().describe("Free text search query"),
                limit: z.number().optional().default(10).describe("Maximum number of results to return")
            },
            async ({ stateCode, activity, q, limit }) => {
                try {
                    let parks: Park[] = [];

                    // Use existing service methods based on provided parameters
                    if (stateCode) {
                        parks = await npsService.getParksByState(stateCode);
                    } else if (activity) {
                        parks = await npsService.getParksByActivity(activity);
                    } else if (q) {
                        // Assuming you have or will implement a search method in NpsApiService
                        parks = await npsService.searchParks(q);
                    } else {
                        // Get all parks with a reasonable limit if no criteria provided
                        parks = await npsService.getParks(limit);
                    }

                    if (!parks || parks.length === 0) {
                        return {
                            content: [{
                                type: "text",
                                text: "No parks found matching your criteria."
                            }]
                        };
                    }

                    // Apply limit
                    parks = parks.slice(0, limit);

                    // Format the response
                    let response = `# National Parks Search Results\n\nFound ${parks.length} parks matching your criteria:\n\n`;

                    parks.forEach((park, index) => {
                        response += `## ${index + 1}. ${park.name}\n`;
                        response += `**Park Code:** ${park.parkCode}\n`;

                        if (park.description) {
                            response += `**Description:** ${park.description.substring(0, 200)}${park.description.length > 200 ? '...' : ''}\n`;
                        }

                        if (park.states) {
                            response += `**States:** ${park.states}\n`;
                        }

                        if (park.url) {
                            response += `**Website:** ${park.url}\n`;
                        }

                        response += '\n';
                    });

                    return {
                        content: [{ type: "text", text: response }]
                    };
                } catch (error: any) {
                    console.error("Error in findParks:", error);
                    return {
                        content: [{
                            type: "text",
                            text: `Error finding parks: ${error.message}`
                        }]
                    };
                }
            }
        );

        // Tool to get current alerts for a park
        this.server.tool(
            "getParkAlerts",
            "Get current alerts, closures, and notifications for specified national parks",
            {
                parkCode: z.string().describe("The park code (e.g., 'yose' for Yosemite)"),
                limit: z.number().optional().default(10).describe("Maximum number of alerts to return"),
                sortBy: z.enum(["date", "title", "category"]).optional().default("date").describe("How to sort the alerts")
            },
            async ({ parkCode, limit, sortBy }) => {
                try {
                    // Get alerts using existing service
                    const alerts = await npsService.getAlertsByPark(parkCode);

                    if (!alerts || alerts.length === 0) {
                        return {
                            content: [{
                                type: "text",
                                text: `No current alerts for park: ${parkCode}`
                            }]
                        };
                    }

                    // Get park info for context
                    const park = await npsService.getParkById(parkCode);

                    // Sort alerts
                    let sortedAlerts = [...alerts];
                    if (sortBy === "date") {
                        sortedAlerts.sort((a, b) => new Date(b.lastIndexedDate).getTime() - new Date(a.lastIndexedDate).getTime());
                    } else if (sortBy === "title") {
                        sortedAlerts.sort((a, b) => a.title.localeCompare(b.title));
                    } else if (sortBy === "category") {
                        sortedAlerts.sort((a, b) => a.category.localeCompare(b.category));
                    }

                    // Apply limit
                    sortedAlerts = sortedAlerts.slice(0, limit);

                    // Format response
                    let response = `# Current Alerts for ${park ? park.name : parkCode}\n\n`;

                    if (sortedAlerts.length === 0) {
                        response += "No current alerts.\n";
                    } else {
                        response += `Found ${sortedAlerts.length} alerts:\n\n`;

                        sortedAlerts.forEach((alert, index) => {
                            response += `## ${index + 1}. ${alert.title}\n`;
                            response += `**Category:** ${alert.category}\n`;
                            response += `**Last Updated:** ${new Date(alert.lastIndexedDate).toLocaleDateString()}\n\n`;
                            response += `${alert.description}\n\n`;

                            if (alert.url) {
                                response += `**More Information:** ${alert.url}\n`;
                            }

                            response += `---\n\n`;
                        });
                    }

                    return {
                        content: [{ type: "text", text: response }]
                    };
                } catch (error: any) {
                    console.error("Error in getParkAlerts:", error);
                    return {
                        content: [{
                            type: "text",
                            text: `Error retrieving park alerts: ${error.message}`
                        }]
                    };
                }
            }
        );

        // Tool to get upcoming events at a park
        this.server.tool(
            "getParkEvents",
            "Get upcoming events at national parks including ranger talks, guided hikes, and educational programs",
            {
                parkCode: z.string().describe("The park code (e.g., 'yose' for Yosemite)"),
                startDate: z.string().optional().describe("Start date for event search (YYYY-MM-DD)"),
                endDate: z.string().optional().describe("End date for event search (YYYY-MM-DD)"),
                limit: z.number().optional().default(10).describe("Maximum number of events to return")
            },
            async ({ parkCode, startDate, endDate, limit }) => {
                try {
                    // Set default dates if not provided
                    const today = new Date();
                    const defaultEndDate = new Date();
                    defaultEndDate.setDate(today.getDate() + 30); // Next 30 days

                    const effectiveStartDate = startDate || today.toISOString().split('T')[0];
                    const effectiveEndDate = endDate || defaultEndDate.toISOString().split('T')[0];

                    // Get events using existing service
                    const events = await npsService.getEventsByPark(
                        parkCode,
                        effectiveStartDate,
                        effectiveEndDate
                    );

                    if (!events || events.length === 0) {
                        return {
                            content: [{
                                type: "text",
                                text: `No events found for park ${parkCode} from ${effectiveStartDate} to ${effectiveEndDate}`
                            }]
                        };
                    }

                    // Get park info for context
                    const park = await npsService.getParkById(parkCode);

                    // Apply limit
                    const limitedEvents = events.slice(0, limit);

                    // Format response
                    let response = `# Upcoming Events at ${park ? park.name : parkCode}\n\n`;
                    response += `**Date Range:** ${effectiveStartDate} to ${effectiveEndDate}\n\n`;

                    if (limitedEvents.length === 0) {
                        response += "No upcoming events found.\n";
                    } else {
                        response += `Found ${events.length} events${events.length > limit ? `, showing the first ${limit}` : ''}:\n\n`;

                        limitedEvents.forEach((event, index) => {
                            response += `## ${index + 1}. ${event.title}\n`;

                            if (event.dateStart) {
                                response += `**Date:** ${new Date(event.dateStart).toLocaleDateString()}`;

                                if (event.times && event.times.length > 0) {
                                    response += ` at ${event.times[0].timeStart}`;
                                }

                                response += `\n`;
                            }

                            if (event.location) {
                                response += `**Location:** ${event.location}\n`;
                            }

                            if (event.description) {
                                response += `\n${event.description}\n\n`;
                            }

                            if (event.feeInfo) {
                                response += `**Fee Info:** ${event.feeInfo}\n`;
                            }

                            if (event.contactName || event.contactEmailAddress) {
                                response += `**Contact:** ${event.contactName || ''} ${event.contactEmailAddress ? `(${event.contactEmailAddress})` : ''}\n`;
                            }

                            response += `\n---\n\n`;
                        });
                    }

                    return {
                        content: [{ type: "text", text: response }]
                    };
                } catch (error: any) {
                    console.error("Error in getParkEvents:", error);
                    return {
                        content: [{
                            type: "text",
                            text: `Error retrieving park events: ${error.message}`
                        }]
                    };
                }
            }
        );

        // Tool for finding available camping near a location
        this.server.tool(
            "findNearbyRecreation",
            "Find recreation areas and camping options near a location",
            {
                location: z.string().describe("Location name or coordinates"),
                distance: z.number().optional().default(50).describe("Search radius in miles"),
                activityType: z.string().optional().describe("Type of activity (e.g., 'camping', 'hiking')")
            },
            async ({ location, distance, activityType }) => {
                try {
                    // First get weather forecast to extract coordinates
                    const forecast = await weatherService.get7DayForecastByLocation(location);
                    if (!forecast || forecast.length === 0) {
                        return {
                            content: [{ type: "text", text: `Could not find location: ${location}` }]
                        };
                    }

                    // Get detailed weather to extract coordinates
                    const detailedForecast = await weatherService.getDetailedForecast(location, 1);

                    // TODO: Mock for this example - in real implementation we'd need to extract coords
                    const latitude = 37.7749;
                    const longitude = -122.4194;

                    // Get nearby facilities
                    const facilities = await recGovService.getFacilitiesByLocation(
                        latitude,
                        longitude,
                        distance
                    );

                    if (!facilities || facilities.length === 0) {
                        return {
                            content: [{
                                type: "text",
                                text: `No recreation facilities found within ${distance} miles of ${location}`
                            }]
                        };
                    }

                    // Filter by activity type if provided
                    let filteredFacilities = facilities;
                    if (activityType) {
                        // This is a mock filter - in reality you'd need to check activities for each facility
                        filteredFacilities = facilities.filter(f =>
                            f.facilityName.toLowerCase().includes(activityType.toLowerCase())
                        );
                    }

                    // Format response
                    let response = `# Recreation Near ${location}\n\n`;

                    // Weather summary
                    response += `## Current Weather\n`;
                    response += `The current forecast shows ${detailedForecast[0].condition} with temperatures `;
                    response += `from ${detailedForecast[0].minTempF}°F to ${detailedForecast[0].maxTempF}°F.\n\n`;

                    // Facilities
                    response += `## Available Facilities (${filteredFacilities.length})\n`;
                    if (filteredFacilities.length === 0) {
                        response += `No ${activityType || "recreation"} facilities found within ${distance} miles.\n\n`;
                    } else {
                        filteredFacilities.slice(0, 8).forEach((facility, index) => {
                            response += `### ${index + 1}. ${facility.facilityName}\n`;
                            if (facility.facilityDescription) {
                                response += `${facility.facilityDescription.substring(0, 150)}...\n\n`;
                            }
                            response += `**Location**: ${facility.latitude}, ${facility.longitude}\n`;

                            if (facility.facilityPhone) {
                                response += `**Phone**: ${facility.facilityPhone}\n`;
                            }

                            if (facility.facilityReservationUrl) {
                                response += `**Reservations**: ${facility.facilityReservationUrl}\n`;
                            }

                            response += `\n`;
                        });

                        if (filteredFacilities.length > 8) {
                            response += `...and ${filteredFacilities.length - 8} more facilities\n\n`;
                        }
                    }

                    return {
                        content: [{ type: "text", text: response }]
                    };
                } catch (error: any) {
                    console.error("Error in findNearbyRecreation:", error);
                    return {
                        content: [{ type: "text", text: `Error finding nearby recreation: ${error.message}` }]
                    };
                }
            }
        );

        // Tool for planning a visit based on weather
        this.server.tool(
            "planParkVisit",
            "Get recommendations for the best time to visit a park based on weather",
            {
                parkCode: z.string().describe("The park code (e.g., 'yose' for Yosemite)"),
                startDate: z.string().optional().describe("Start date of your trip (YYYY-MM-DD)"),
                endDate: z.string().optional().describe("End date of your trip (YYYY-MM-DD)")
            },
            async ({ parkCode, startDate, endDate }) => {
                try {
                    // Get park info
                    const park = await npsService.getParkById(parkCode);
                    if (!park) {
                        return {
                            content: [{ type: "text", text: `Could not find park with code: ${parkCode}` }]
                        };
                    }

                    // Get current alerts
                    const alerts = await npsService.getAlertsByPark(parkCode);

                    // Get weather forecast
                    const forecast = await weatherService.get7DayForecastByLocation(park.name);

                    // Get detailed forecast for more data
                    const detailedForecast = await weatherService.getDetailedForecast(park.name);

                    // Weather analysis - find days with best weather
                    const goodWeatherDays: { date: string, score: number, conditions: string }[] = [];

                    if (detailedForecast && detailedForecast.length > 0) {
                        detailedForecast.forEach(day => {
                            // Simple weather scoring algorithm
                            let score = 0;

                            // Prefer temperatures between 65-80°F
                            const avgTemp = (day.maxTempF + day.minTempF) / 2;
                            if (avgTemp >= 65 && avgTemp <= 80) {
                                score += 3;
                            } else if (avgTemp >= 50 && avgTemp <= 85) {
                                score += 2;
                            } else {
                                score += 1;
                            }

                            // Prefer low chance of rain
                            if (day.chanceOfRain < 20) {
                                score += 3;
                            } else if (day.chanceOfRain < 40) {
                                score += 2;
                            } else if (day.chanceOfRain < 60) {
                                score += 1;
                            }

                            // Prefer good conditions
                            const goodConditions = ['sunny', 'clear', 'partly cloudy'];
                            if (goodConditions.some(c => day.condition.toLowerCase().includes(c))) {
                                score += 2;
                            }

                            goodWeatherDays.push({
                                date: day.date,
                                score,
                                conditions: `${day.minTempF}°F to ${day.maxTempF}°F, ${day.condition}, ${day.chanceOfRain}% chance of rain`
                            });
                        });
                    }

                    // Sort by score
                    goodWeatherDays.sort((a, b) => b.score - a.score);

                    // Format response
                    let response = `# Visit Planning for ${park.name}\n\n`;

                    // Check for alerts that might affect visit
                    const closureAlerts = alerts.filter(a =>
                        a.title.toLowerCase().includes('closure') ||
                        a.title.toLowerCase().includes('closed') ||
                        a.category.toLowerCase().includes('closure')
                    );

                    if (closureAlerts.length > 0) {
                        response += `## ⚠️ Important Alerts\n`;
                        closureAlerts.forEach(alert => {
                            response += `- **${alert.title}**: ${alert.description.substring(0, 100)}...\n`;
                        });
                        response += `\n`;
                    }

                    // Weather forecast
                    response += `## 7-Day Weather Outlook\n`;
                    if (!forecast || forecast.length === 0) {
                        response += "Weather forecast not available.\n\n";
                    } else {
                        forecast.forEach(day => {
                            response += `- **${day.date}**: ${day.minTempF}°F to ${day.maxTempF}°F, ${day.condition}\n`;
                        });
                        response += "\n";
                    }

                    // Best days recommendation
                    if (goodWeatherDays.length > 0) {
                        response += `## Recommended Visit Days\n`;
                        response += `Based on the weather forecast, here are the best days to visit:\n\n`;

                        goodWeatherDays.slice(0, 3).forEach((day, index) => {
                            response += `${index + 1}. **${day.date}**: ${day.conditions}\n`;
                        });
                        response += `\n`;
                    }

                    // TODO: Trip planning advice based on specific park
                    response += `## Planning Tips\n`;

                    // Park-specific tips
                    if (park.parkCode === 'yose') {
                        response += `- Yosemite's waterfalls are typically most impressive in spring and early summer\n`;
                        response += `- The Tioga Road (Highway 120 through the park) is typically closed November through May\n`;
                        response += `- Reservations are required during peak summer months\n`;
                    } else if (park.parkCode === 'grca') {
                        response += `- The North Rim is typically open May 15 through October 15\n`;
                        response += `- Summer temperatures at the bottom of the canyon can exceed 100°F\n`;
                        response += `- Winter brings snow to the rims but mild weather in the canyon\n`;
                    } else {
                        // Generic park tips
                        response += `- Check for any entrance reservation requirements\n`;
                        response += `- Visit early morning or late afternoon to avoid crowds\n`;
                        response += `- Check the official park website for seasonal road closures\n`;
                    }

                    response += `\n`;

                    // If a specific trip date range was provided
                    if (startDate && endDate) {
                        response += `## Your Trip: ${startDate} to ${endDate}\n`;
                        // Compare with forecast dates to see if we have weather data for their trip
                        const tripStartDate = new Date(startDate);
                        const tripEndDate = new Date(endDate);

                        if (forecast && forecast.length > 0) {
                            const forecastStartDate = new Date(forecast[0].date);
                            const forecastEndDate = new Date(forecast[forecast.length - 1].date);

                            if (tripStartDate <= forecastEndDate && tripEndDate >= forecastStartDate) {
                                response += `We have some weather forecast data for your trip dates!\n\n`;

                                // Filter forecast data for trip dates
                                const tripForecast = forecast.filter(day => {
                                    const dayDate = new Date(day.date);
                                    return dayDate >= tripStartDate && dayDate <= tripEndDate;
                                });

                                if (tripForecast.length > 0) {
                                    response += `Weather during your visit:\n`;
                                    tripForecast.forEach(day => {
                                        response += `- **${day.date}**: ${day.minTempF}°F to ${day.maxTempF}°F, ${day.condition}\n`;
                                    });
                                } else {
                                    response += `Your trip dates are outside our current 3-day forecast window.\n`;
                                }
                            } else {
                                response += `Your trip dates are outside our current 3-day forecast window.\n`;
                            }
                        }
                    }

                    return {
                        content: [{ type: "text", text: response }]
                    };
                } catch (error: any) {
                    console.error("Error in planParkVisit:", error);
                    return {
                        content: [{ type: "text", text: `Error planning park visit: ${error.message}` }]
                    };
                }
            }
        );

        // Add a tool to increment counter
        this.server.tool(
            "add",
            "Add to the counter, stored in the MCP",
            { a: z.number() },
            async ({ a }) => {
                this.setState({ ...this.state, counter: this.state.counter + a });
                return {
                    content: [
                        {
                            type: "text",
                            text: String(`Added ${a}, total is now ${this.state.counter}`),
                        },
                    ],
                };
            }
        );

        // Tool to get park weather forecast - using services directly instead of resources
        this.server.tool(
            "getParkWeatherForecast",
            "Get detailed weather forecast for a national park by park code",
            {
                parkCode: z.string().describe("The park code (e.g., 'yose' for Yosemite)")
            },
            async ({ parkCode }) => {
                try {
                    // Get park directly from service
                    const park = await npsService.getParkById(parkCode);

                    if (!park) {
                        return {
                            content: [{ type: "text", text: `Could not find park with code: ${parkCode}` }]
                        };
                    }

                    // Get weather forecast using the service
                    const forecast = await weatherService.get7DayForecastByLocation(park.name);

                    if (!forecast || forecast.length === 0) {
                        return {
                            content: [{ type: "text", text: `Found park ${park.name}, but could not retrieve weather forecast.` }]
                        };
                    }

                    // Format response
                    return {
                        content: [
                            {
                                type: "text",
                                text: `Weather forecast for ${park.name}:\n\n${formatWeatherForecast(forecast, park.name)}`
                            }
                        ]
                    };
                } catch (error: any) {
                    console.error("Error in getParkWeatherForecast:", error);
                    return {
                        content: [{ type: "text", text: `Error retrieving park weather forecast: ${error.message}` }]
                    };
                }
            }
        );

        // Tool to search parks by state
        this.server.tool(
            "searchParksByState",
            "Search for national parks in a specific state",
            {
                stateCode: z.string().describe("Two-letter state code (e.g., CA, NY)")
            },
            async ({ stateCode }) => {
                try {
                    const parks = await npsService.getParksByState(stateCode);

                    if (!parks || parks.length === 0) {
                        return {
                            content: [{ type: "text", text: `No parks found in state: ${stateCode}` }]
                        };
                    }

                    // Format results
                    let response = `Found ${parks.length} parks in ${stateCode}:\n\n`;
                    parks.forEach((park, index) => {
                        response += `${index + 1}. **${park.name}** (ID: ${park.id})\n`;
                        if (park.description) {
                            response += `   ${park.description.substring(0, 150)}...\n\n`;
                        }
                    });

                    return {
                        content: [{ type: "text", text: response }]
                    };
                } catch (error: any) {
                    console.error("Error in searchParksByState:", error);
                    return {
                        content: [{ type: "text", text: `Error searching for parks: ${error.message}` }]
                    };
                }
            }
        );

        // Tool to get facilities by activity
        this.server.tool(
            "getFacilitiesByActivity",
            "Find recreation facilities by activity ID",
            {
                activityId: z.number().describe("Recreation.gov activity ID")
            },
            async ({ activityId }) => {
                try {
                    const facilities = await recGovService.getFacilitiesByActivity(activityId);

                    if (!facilities || facilities.length === 0) {
                        return {
                            content: [{ type: "text", text: `No facilities found for activity ID: ${activityId}` }]
                        };
                    }

                    // Format results
                    let response = `Found ${facilities.length} facilities for activity ID ${activityId}:\n\n`;
                    facilities.forEach((facility, index) => {
                        response += `${index + 1}. **${facility.facilityName}** (ID: ${facility.facilityID})\n`;
                        response += `   Location: ${facility.latitude}, ${facility.longitude}\n\n`;
                    });

                    return {
                        content: [{ type: "text", text: response }]
                    };
                } catch (error: any) {
                    console.error("Error in getFacilitiesByActivity:", error);
                    return {
                        content: [{ type: "text", text: `Error retrieving facilities: ${error.message}` }]
                    };
                }
            }
        );

        // Tool to get weather forecast by coordinates
        this.server.tool(
            "getWeatherByCoordinates",
            "Get weather forecast by latitude and longitude coordinates",
            {
                latitude: z.number().describe("Latitude coordinate"),
                longitude: z.number().describe("Longitude coordinate")
            },
            async ({ latitude, longitude }) => {
                try {
                    // Get forecast directly using the service
                    const forecast = await weatherService.get7DayForecastByCoords(latitude, longitude);

                    if (!forecast || forecast.length === 0) {
                        return {
                            content: [{ type: "text", text: `Could not retrieve weather forecast for coordinates: ${latitude}, ${longitude}` }]
                        };
                    }

                    // Format response
                    return {
                        content: [
                            {
                                type: "text",
                                text: `3-Day Weather Forecast for coordinates ${latitude}, ${longitude}:\n\n${formatWeatherForecast(forecast)}`
                            }
                        ]
                    };
                } catch (error: any) {
                    console.error("Error in getWeatherByCoordinates:", error);
                    return {
                        content: [{ type: "text", text: `Error retrieving weather forecast: ${error.message}` }]
                    };
                }
            }
        );

        // Helper function for formatting weather forecast with proper types
        function formatWeatherForecast(forecast: ForecastDay[], locationName?: string): string {
            let header = locationName ? `3-Day Forecast for ${locationName}:\n\n` : "7-Day Forecast:\n\n";

            if (!Array.isArray(forecast) || forecast.length === 0) {
                return header + "No forecast data available.";
            }

            let formattedForecast = header;

            forecast.forEach(day => {
                formattedForecast += `• ${day.date}: ${day.minTempF}°F to ${day.maxTempF}°F, ${day.condition}\n`;
            });

            return formattedForecast;
        }
    }

    onStateUpdate(state: State) {
        console.log({ stateUpdate: state });
    }
}

export default new OAuthProvider({
    apiRoute: "/mcp",
    // @ts-ignore TS2322: fetch-signature mismatch
    apiHandler: NpsMcpAgent.mount("/mcp", { binding: "NpsMcpAgent" }),
    // @ts-ignore TS2322: fetch-signature mismatch
    defaultHandler: GitHubHandler,
    authorizeEndpoint: "/authorize",
    tokenEndpoint: "/token",
    clientRegistrationEndpoint: "/register"
})
