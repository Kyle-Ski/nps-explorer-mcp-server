import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { NpsApiService } from "../services/npsService";
import { WeatherApiService } from "../services/weatherService";
import type { RecGovService } from "../services/recGovService";

export function registerParkTools(
    server: McpServer,
    npsService: NpsApiService,
    weatherService: WeatherApiService,
    recGovService: RecGovService
) {
    // Tool for comprehensive park information
    server.tool(
        "getParkInfo",
        "Get comprehensive information about a national park including both static details and current conditions",
        {
            parkCode: z.string().describe("The park code (e.g., 'yose' for Yosemite)"),
            includeBasics: z.boolean().optional().default(true).describe("Include basic park information"),
            includeAlerts: z.boolean().optional().default(true).describe("Include current alerts"),
            includeWeather: z.boolean().optional().default(true).describe("Include weather forecast"),
            includeEvents: z.boolean().optional().default(true).describe("Include upcoming events"),
            includeCamping: z.boolean().optional().default(true).describe("Include camping options"),
            includeImages: z.boolean().optional().default(true).describe("Include park images")
        },
        async ({ parkCode, includeBasics, includeAlerts, includeWeather, includeEvents, includeCamping, includeImages }) => {
            try {
                // Get park info
                const park = await npsService.getParkById(parkCode);
                if (!park) {
                    return {
                        content: [{ type: "text", text: `Could not find park with code: ${parkCode}` }]
                    };
                }

                let response = `# ${park.name}\n\n`;

                // STATIC INFORMATION (from getParkDetails)
                if (includeBasics) {
                    // Basic description
                    if (park.description) {
                        response += `## Overview\n${park.description}\n\n`;
                    }

                    // Location information
                    response += `## Location\n`;
                    if (park.states) {
                        response += `**States:** ${park.states}\n`;
                    }
                    if (park.latitude && park.longitude) {
                        response += `**Coordinates:** ${park.latitude}, ${park.longitude}\n`;
                    }
                    response += `\n`;

                    // Official website
                    if (park.url) {
                        response += `**Official Website:** ${park.url}\n\n`;
                    }

                    // Entrance fees
                    if (park.entranceFees && park.entranceFees.length > 0) {
                        response += `## Entrance Fees\n`;
                        park.entranceFees.forEach(fee => {
                            response += `### ${fee.title}\n`;
                            response += `**Cost:** $${fee.cost}\n`;
                            response += `${fee.description}\n\n`;
                        });
                    }

                    // Operating hours
                    if (park.operatingHours && park.operatingHours.length > 0) {
                        response += `## Operating Hours\n`;
                        park.operatingHours.forEach(hours => {
                            response += `### ${hours.name}\n`;
                            if (hours.description) {
                                response += `${hours.description}\n\n`;
                            }

                            // Weekly schedule
                            response += "**Weekly Schedule:**\n";
                            if (hours.standardHours) {
                                response += `- Sunday: ${hours.standardHours.sunday}\n`;
                                response += `- Monday: ${hours.standardHours.monday}\n`;
                                response += `- Tuesday: ${hours.standardHours.tuesday}\n`;
                                response += `- Wednesday: ${hours.standardHours.wednesday}\n`;
                                response += `- Thursday: ${hours.standardHours.thursday}\n`;
                                response += `- Friday: ${hours.standardHours.friday}\n`;
                                response += `- Saturday: ${hours.standardHours.saturday}\n`;
                            }
                            response += `\n`;
                        });
                    }

                    // Activities
                    if (park.activities && park.activities.length > 0) {
                        response += `## Available Activities\n`;
                        const activityGroups = [];
                        for (let i = 0; i < park.activities.length; i += 5) {
                            activityGroups.push(park.activities.slice(i, i + 5).map(a => a.name).join(", "));
                        }
                        activityGroups.forEach(group => {
                            response += `${group}\n`;
                        });
                        response += `\n`;
                    }
                }

                // DYNAMIC/CURRENT INFORMATION (from getParkOverview)

                // Alerts
                if (includeAlerts) {
                    const alerts = await npsService.getAlertsByPark(parkCode);
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
                }

                // Weather
                if (includeWeather) {
                    const forecast = await weatherService.get7DayForecastByLocation(park.name);
                    response += `## 7-Day Weather Forecast\n`;
                    if (!forecast || forecast.length === 0) {
                        response += "Weather forecast not available.\n\n";
                    } else {
                        forecast.forEach(day => {
                            response += `- **${day.date}**: ${day.minTempF}°F to ${day.maxTempF}°F, ${day.condition}\n`;
                        });
                        response += "\n";
                    }
                }

                // Upcoming events
                if (includeEvents) {
                    // Get events for the next 14 days
                    const today = new Date();
                    const endDate = new Date();
                    endDate.setDate(today.getDate() + 14);

                    const startDateStr = today.toISOString().split('T')[0];
                    const endDateStr = endDate.toISOString().split('T')[0];

                    const events = await npsService.getEventsByPark(
                        parkCode,
                        startDateStr,
                        endDateStr
                    );

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
                }

                // Campgrounds
                if (includeCamping) {
                    const campgrounds = await npsService.getCampgroundsByPark(parkCode);
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
                        response += "\n";
                    }
                }

                // Images
                if (includeImages && park.images && park.images.length > 0) {
                    response += `## Gallery\n`;
                    park.images.slice(0, 3).forEach((image, index) => {
                        response += `### Image ${index + 1}: ${image.title}\n`;
                        response += `![${image.caption || image.title}](${image.url})\n\n`;
                        if (image.caption) {
                            response += `*${image.caption}*\n\n`;
                        }
                    });

                    if (park.images.length > 3) {
                        response += `*Plus ${park.images.length - 3} more images available*\n\n`;
                    }
                }

                return {
                    content: [{ type: "text", text: response }]
                };
            } catch (error: any) {
                console.error("Error in getParkInfo:", error);
                return {
                    content: [{ type: "text", text: `Error retrieving park information: ${error.message}` }]
                };
            }
        }
    );

    // Tool to get current alerts for a park
    server.tool(
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
    server.tool(
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

    // Tool to get campground information for a park
    server.tool(
        "getCampgrounds",
        "List campgrounds within a given national park with detailed information",
        {
            parkCode: z.string().describe("The park code (e.g., 'yose' for Yosemite)"),
            limit: z.number().optional().default(10).describe("Maximum number of campgrounds to return"),
            start: z.number().optional().default(0).describe("Starting index for pagination")
        },
        async ({ parkCode, limit, start }) => {
            try {
                // Get park info for context
                const park = await npsService.getParkById(parkCode);
                if (!park) {
                    return {
                        content: [{ type: "text", text: `No park found with code: ${parkCode}` }]
                    };
                }

                // Get all campgrounds for this park
                let campgrounds = await npsService.getCampgroundsByPark(parkCode);

                // Apply pagination manually if needed
                const totalCount = campgrounds.length;
                campgrounds = campgrounds.slice(start, start + limit);

                if (campgrounds.length === 0) {
                    return {
                        content: [{ type: "text", text: `No campgrounds found in ${park.name} (Park Code: ${parkCode}).` }]
                    };
                }

                // Format a detailed response
                let response = `# Campgrounds in ${park.name}\n\n`;

                // Summary info
                response += `Found ${totalCount} campgrounds${totalCount > limit ? `, showing ${Math.min(limit, campgrounds.length)} (${start + 1}-${start + campgrounds.length})` : ''}.\n\n`;

                // Detailed campground information
                campgrounds.forEach((campground, index) => {
                    response += `## ${index + 1 + start}. ${campground.name}\n\n`;

                    if (campground.description) {
                        response += `${campground.description}\n\n`;
                    }

                    // Campsite information
                    if (campground.totalSites) {
                        response += `**Total Sites:** ${campground.totalSites}\n\n`;
                    }

                    if (campground.campsites) {
                        response += `**Campsite Breakdown:**\n`;
                        if (campground.campsites.tentOnly > 0) {
                            response += `- Tent-only sites: ${campground.campsites.tentOnly}\n`;
                        }
                        if (campground.campsites.electricalHookups > 0) {
                            response += `- Sites with electrical hookups: ${campground.campsites.electricalHookups}\n`;
                        }
                        if (campground.campsites.rvOnly > 0) {
                            response += `- RV-only sites: ${campground.campsites.rvOnly}\n`;
                        }
                        if (campground.campsites.walkBoatTo > 0) {
                            response += `- Walk-in/boat-in sites: ${campground.campsites.walkBoatTo}\n`;
                        }
                        if (campground.campsites.group > 0) {
                            response += `- Group sites: ${campground.campsites.group}\n`;
                        }
                        if (campground.campsites.horse > 0) {
                            response += `- Horse sites: ${campground.campsites.horse}\n`;
                        }
                        response += `\n`;
                    }

                    // Fee information
                    if (campground.fees && campground.fees.length > 0) {
                        response += `**Fees:**\n`;
                        campground.fees.forEach(fee => {
                            response += `- ${fee.title}: $${fee.cost}\n`;
                            if (fee.description) {
                                response += `  ${fee.description}\n`;
                            }
                        });
                        response += `\n`;
                    }

                    // Reservation information
                    if (campground.reservationInfo) {
                        response += `**Reservation Information:**\n${campground.reservationInfo}\n\n`;
                    }

                    if (campground.reservationUrl) {
                        response += `**Make Reservations:** [${campground.reservationUrl}](${campground.reservationUrl})\n\n`;
                    }

                    response += `---\n\n`;
                });

                // Pagination help
                if (totalCount > start + limit) {
                    const nextStart = start + limit;
                    response += `*To see more campgrounds, use start=${nextStart} and limit=${limit}*\n\n`;
                }

                // Additional information about camping in the park
                response += `## Camping Information for ${park.name}\n\n`;
                response += `Always check the official park website for the most current information about campground status, `;
                response += `seasonal closures, and reservation requirements. Many popular campgrounds fill up months in advance, `;
                response += `especially during peak season. Some campgrounds may offer first-come, first-served sites in addition to reservable sites.\n\n`;

                if (park.url) {
                    response += `Visit the official park website for more details: [${park.url}](${park.url})\n`;
                }

                return {
                    content: [{ type: "text", text: response }]
                };
            } catch (error: any) {
                console.error("Error in getCampgrounds:", error);
                return {
                    content: [{
                        type: "text",
                        text: `Error retrieving campground information: ${error.message}`
                    }]
                };
            }
        }
    );

    // Tool to get trail information
    server.tool(
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
}