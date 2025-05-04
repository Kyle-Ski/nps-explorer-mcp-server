import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { NpsApiService } from "../services/npsService";
import { RecGovService } from "../services/recGovService";
import { WeatherApiService } from "../services/weatherService";
import { NominatimGeocodingService } from "../services/geocodingService";
import { formatWeatherForecast } from "../utils/formatting";

export function registerPlanningTools(
    server: McpServer,
    npsService: NpsApiService,
    recGovService: RecGovService,
    weatherService: WeatherApiService,
    geocodingService: NominatimGeocodingService
) {
    // Tool for planning a visit based on weather
    server.tool(
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

                // Park-specific tips
                response += `## Planning Tips\n`;
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

    // Tool for finding nearby recreation
    server.tool(
        "findNearbyRecreation",
        "Find recreation areas and camping options near a location",
        {
            location: z.string().describe("Location name or coordinates"),
            distance: z.number().optional().default(50).describe("Search radius in miles"),
            activityType: z.string().optional().describe("Type of activity (e.g., 'camping', 'hiking', 'biking', 'fishing')"),
            includeTrails: z.boolean().optional().default(true).describe("Include trails in the results")
        },
        async ({ location, distance, activityType, includeTrails }) => {
            try {
                // First get coordinates from weather service
                const coordinates = await geocodingService.getCoordinates(location);

                if (!coordinates) {
                    return {
                        content: [{ type: "text", text: `Could not identify the location: ${location}. Please try a more specific location name or provide coordinates.` }]
                    };
                }

                const { latitude, longitude } = coordinates;

                // Ensure minimum search radius for small towns
                const adjustedDistance = distance < 25 ? 25 : distance;

                // Get facilities from Recreation.gov API
                const facilities = await recGovService.getFacilitiesByLocation(
                    latitude,
                    longitude,
                    adjustedDistance
                );

                // Find national parks in the area
                const nearbyParks = await npsService.searchParksByLocation(
                    latitude,
                    longitude,
                    5
                );

                // Get trail data if requested
                let trails: any[] = [];
                if (includeTrails) {
                    // For each nearby park, get its trails
                    for (const park of nearbyParks) {
                        if (park.parkCode) {
                            const parkTrails = await recGovService.getTrailsByPark(park.parkCode);
                            trails = trails.concat(parkTrails);
                        }
                    }
                }

                // Filter by activity type if provided
                let filteredFacilities = facilities;
                if (activityType) {
                    filteredFacilities = facilities.filter(f => {
                        const nameLower = f.facilityName.toLowerCase();
                        const descLower = f.facilityDescription ? f.facilityDescription.toLowerCase() : '';
                        return nameLower.includes(activityType.toLowerCase()) ||
                            descLower.includes(activityType.toLowerCase());
                    });
                }

                // Filter trails by activity if provided
                let filteredTrails = trails;
                if (activityType && trails.length > 0) {
                    filteredTrails = trails.filter(trail => {
                        if (trail.trailUse && Array.isArray(trail.trailUse)) {
                            return trail.trailUse.some((use: any) =>
                                use.toLowerCase().includes(activityType.toLowerCase())
                            );
                        }

                        const nameLower = trail.name.toLowerCase();
                        const descLower = trail.description ? trail.description.toLowerCase() : '';
                        return nameLower.includes(activityType.toLowerCase()) ||
                            descLower.includes(activityType.toLowerCase());
                    });
                }

                // Get weather forecast for context
                const forecast = await weatherService.get7DayForecastByLocation(location);

                // Format response
                let response = `# Recreation Near ${location}\n\n`;

                // Weather summary
                response += `## Current Weather\n`;
                if (forecast && forecast.length > 0) {
                    response += `The current forecast shows ${forecast[0].condition} with temperatures `;
                    response += `from ${forecast[0].minTempF}°F to ${forecast[0].maxTempF}°F.\n\n`;
                } else {
                    response += `Weather information not available.\n\n`;
                }

                // Check what we found
                const foundSomething =
                    filteredFacilities.length > 0 ||
                    nearbyParks.length > 0 ||
                    filteredTrails.length > 0;

                if (!foundSomething) {
                    response += `## No Recreation Areas Found\n`;
                    response += `We couldn't find any specific ${activityType || "recreation"} areas within ${adjustedDistance} miles of ${location}. `;
                    response += `This may be due to limitations in our data sources. You might try:\n\n`;
                    response += `1. Increasing your search radius\n`;
                    response += `2. Searching for a nearby larger city\n`;
                    response += `3. Checking local county and city park websites\n`;
                    response += `4. Consulting regional hiking or recreation guides\n\n`;
                } else {
                    // National Parks
                    if (nearbyParks.length > 0) {
                        response += `## Nearby National Parks (${nearbyParks.length})\n`;
                        nearbyParks.forEach((park, index) => {
                            response += `### ${index + 1}. ${park.name}\n`;
                            if (park.description) {
                                response += `${park.description.substring(0, 150)}...\n\n`;
                            }
                            if (park.url) {
                                response += `[Visit Website](${park.url})\n\n`;
                            }
                        });
                    }

                    // Recreation Facilities
                    if (filteredFacilities.length > 0) {
                        response += `## Recreation Facilities (${filteredFacilities.length})\n`;
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

                    // Trails
                    if (filteredTrails.length > 0) {
                        response += `## Hiking Trails (${filteredTrails.length})\n`;
                        filteredTrails.slice(0, 8).forEach((trail, index) => {
                            response += `### ${index + 1}. ${trail.name}\n`;

                            if (trail.description) {
                                response += `${trail.description.substring(0, 150)}...\n\n`;
                            }

                            if (trail.length) {
                                response += `**Length**: ${trail.length} miles\n`;
                            }

                            if (trail.difficulty) {
                                response += `**Difficulty**: ${trail.difficulty}\n`;
                            }

                            if (trail.elevationGain) {
                                response += `**Elevation Gain**: ${trail.elevationGain} ft\n`;
                            }

                            if (trail.trailUse && trail.trailUse.length > 0) {
                                response += `**Activities**: ${trail.trailUse.join(", ")}\n`;
                            }

                            response += `\n`;
                        });

                        if (filteredTrails.length > 8) {
                            response += `...and ${filteredTrails.length - 8} more trails\n\n`;
                        }
                    }
                }

                // General recreation advice without location specificity
                response += `## Additional Resources\n`;
                response += `Here are some additional resources for finding recreation opportunities:\n\n`;
                response += `- **AllTrails**: Comprehensive trail guides and user reviews\n`;
                response += `- **Recreation.gov**: Official site for booking campsites and permits on federal lands\n`;
                response += `- **National Park Service**: Information about national parks, monuments, and historic sites\n`;
                response += `- **Local Visitor Centers**: Often have the most up-to-date information on trails and conditions\n`;
                response += `- **State Park Websites**: Offer information on state-managed recreation areas\n\n`;

                response += `For the most accurate information about trail conditions, always check recent reviews and visitor center updates before your trip.\n`;

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

    // Tool to get park weather forecast
    server.tool(
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

    // Tool to get weather forecast by coordinates
    server.tool(
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
}