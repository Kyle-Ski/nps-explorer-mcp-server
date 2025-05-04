import { McpServer, ResourceTemplate } from "@modelcontextprotocol/sdk/server/mcp.js";
import { NpsApiService } from "../services/npsService";

export function registerParkResources(server: McpServer, npsService: NpsApiService) {
    // Park resource
    server.resource(
        "park",
        new ResourceTemplate("park://{parkCode}", { list: undefined }),
        async (uri, vars) => {
            const code = Array.isArray(vars.parkCode) ? vars.parkCode[0] : vars.parkCode;
            const park = await npsService.getParkById(code);
            return { contents: [{ uri: uri.href, text: JSON.stringify(park, null, 2) }] };
        }
    );

    // Add a resource for NPS parks information
    server.resource("parks", "mcp://resource/parks", (uri) => {
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
    server.resource(
        "activities",
        "mcp://resource/activities",
        async (uri) => {
            const activities = await npsService.getActivities();
            return { contents: [{ uri: uri.href, text: JSON.stringify(activities, null, 2) }] };
        }
    );

    // Parks by activity
    server.resource(
        "parksByActivity",
        new ResourceTemplate("parks-by-activity://{activityId}", { list: undefined }),
        async (uri, vars) => {
            const activityId = Array.isArray(vars.activityId) ? vars.activityId[0] : vars.activityId;
            const parks = await npsService.getParksByActivity(activityId);
            return { contents: [{ uri: uri.href, text: JSON.stringify(parks, null, 2) }] };
        }
    );

    // Park alerts
    server.resource(
        "parkAlerts",
        new ResourceTemplate("alerts://{parkCode}", { list: undefined }),
        async (uri, vars) => {
            const parkCode = Array.isArray(vars.parkCode) ? vars.parkCode[0] : vars.parkCode;
            const alerts = await npsService.getAlertsByPark(parkCode);
            return { contents: [{ uri: uri.href, text: JSON.stringify(alerts, null, 2) }] };
        }
    );

    // Park events
    server.resource(
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
    server.resource(
        "campgrounds",
        new ResourceTemplate("campgrounds://{parkCode}", { list: undefined }),
        async (uri, vars) => {
            const parkCode = Array.isArray(vars.parkCode) ? vars.parkCode[0] : vars.parkCode;
            const campgrounds = await npsService.getCampgroundsByPark(parkCode);
            return { contents: [{ uri: uri.href, text: JSON.stringify(campgrounds, null, 2) }] };
        }
    );
}