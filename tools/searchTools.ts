// src/tools/search-tools.ts

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { NpsApiService, type Park } from "../services/npsService";
import { RecGovService } from "../services/recGovService";
import { NominatimGeocodingService } from "../services/geocodingService";

export function registerSearchTools(
    server: McpServer,
    npsService: NpsApiService,
    recGovService: RecGovService,
    geocodingService: NominatimGeocodingService
) {
    // Tool to find parks based on multiple criteria
    server.tool(
        "findParks",
        "Find national parks based on criteria such as keyword search, state, activities, or amenities",
        {
            q: z.string().optional().describe("Free text search query for park name or description"),
            stateCode: z.string().optional().describe("Two-letter state code (e.g., CA, NY)"),
            activity: z.string().optional().describe("Activity to filter parks by (e.g., hiking, camping)"),
            limit: z.number().optional().default(10).describe("Maximum number of results to return"),
            start: z.number().optional().default(0).describe("Starting index for pagination")
        },
        async ({ q, stateCode, activity, limit, start }) => {
            try {
                let parks: Park[] = [];

                // Select the appropriate service method based on parameters provided
                if (q !== undefined || stateCode !== undefined) {
                    parks = await npsService.searchParks(q, stateCode, limit, start);
                }
                else if (activity) {
                    // For activity filtering, use the existing method
                    parks = await npsService.getParksByActivity(activity);
                    // Apply manual pagination if needed
                    parks = parks.slice(start, Math.min(parks.length, start + limit));
                }
                else {
                    // If no specific criteria, get all parks with pagination
                    parks = await npsService.getParks(limit, start);
                }

                if (!parks || parks.length === 0) {
                    return {
                        content: [{
                            type: "text",
                            text: "No parks found matching your criteria."
                        }]
                    };
                }

                // Format the response with comprehensive information
                let response = `# National Parks Search Results\n\n`;
                response += `Found ${parks.length} parks matching your criteria${start > 0 ? ` (starting at result ${start + 1})` : ''}:\n\n`;

                parks.forEach((park, index) => {
                    response += `## ${index + 1}. ${park.name}\n`;
                    response += `**Park Code:** ${park.parkCode}\n`;

                    if (park.states) {
                        response += `**States:** ${park.states}\n`;
                    }

                    if (park.latitude && park.longitude) {
                        response += `**Location:** ${park.latitude}, ${park.longitude}\n`;
                    }

                    if (park.description) {
                        const shortDesc = park.description.length > 200
                            ? park.description.substring(0, 200) + '...'
                            : park.description;
                        response += `**Description:** ${shortDesc}\n`;
                    }

                    // Include a few key activities if available
                    if (park.activities && park.activities.length > 0) {
                        const topActivities = park.activities.slice(0, 5).map((a: any) => a.name).join(", ");
                        response += `**Popular Activities:** ${topActivities}${park.activities.length > 5 ? ', and more' : ''}\n`;
                    }

                    if (park.entranceFees && park.entranceFees.length > 0) {
                        const fee = park.entranceFees[0];
                        response += `**Entrance Fee:** $${fee.cost} (${fee.title})\n`;
                    }

                    if (park.url) {
                        response += `**Website:** ${park.url}\n`;
                    }

                    // Add a sample image if available
                    if (park.images && park.images.length > 0) {
                        response += `\n![${park.images[0].caption || park.name}](${park.images[0].url})\n`;
                    }

                    response += '\n---\n\n';
                });

                // Add pagination information
                if (parks.length >= limit) {
                    const nextStart = start + limit;
                    response += `\n*To see more results, search with start=${nextStart}*\n`;
                }

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

    // Tool to search parks by state
    server.tool(
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
    server.tool(
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
}