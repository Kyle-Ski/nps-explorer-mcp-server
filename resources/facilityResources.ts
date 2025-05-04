import { McpServer, ResourceTemplate } from "@modelcontextprotocol/sdk/server/mcp.js";
import { RecGovService } from "../services/recGovService";

export function registerFacilityResources(server: McpServer, recGovService: RecGovService) {
    // Facilities by activity
    server.resource(
        "facilities",
        new ResourceTemplate("facilities://{activityId}", { list: undefined }),
        async (uri, vars) => {
            const idStr = Array.isArray(vars.activityId) ? vars.activityId[0] : vars.activityId;
            const facs = await recGovService.getFacilitiesByActivity(+idStr);
            return { contents: [{ uri: uri.href, text: JSON.stringify(facs, null, 2) }] };
        }
    );

    // Recreation areas by state
    server.resource(
        "recAreasByState",
        new ResourceTemplate("rec-areas://{stateCode}", { list: undefined }),
        async (uri, vars) => {
            const stateCode = Array.isArray(vars.stateCode) ? vars.stateCode[0] : vars.stateCode;
            const areas = await recGovService.getRecAreasByState(stateCode);
            return { contents: [{ uri: uri.href, text: JSON.stringify(areas, null, 2) }] };
        }
    );
}