import { McpAgent } from "agents/mcp";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { HttpClient } from "./utils/httpClient";
import { NpsApiService } from "./services/npsService";
import { RecGovService } from "./services/recGovService";
import { WeatherApiService } from "./services/weatherService";
import { NominatimGeocodingService } from "./services/geocodingService";
import { registerParkResources } from "./resources/parkResources";
import { registerFacilityResources } from "./resources/facilityResources";
import { registerWeatherResources } from "./resources/weatherResources";
import { registerParkTools } from "./tools/parkTools";
import { registerPlanningTools } from "./tools/planningTools";
import { registerSearchTools } from "./tools/searchTools";
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
        // Initialize service dependencies
        const http = new HttpClient();
        const geocodingService = new NominatimGeocodingService(http);
        const npsService = new NpsApiService(http, this.env.NPS_API_KEY);
        const recGovService = new RecGovService(http, this.env.RECGOV_API_KEY);
        const weatherService = new WeatherApiService(http, this.env.WEATHER_API_KEY);

        // Register resources
        registerParkResources(this.server, npsService);
        registerFacilityResources(this.server, recGovService);
        registerWeatherResources(this.server, weatherService);

        // Register tools
        registerParkTools(this.server, npsService, weatherService, recGovService);
        registerPlanningTools(this.server, npsService, recGovService, weatherService, geocodingService);
        registerSearchTools(this.server, npsService, recGovService, geocodingService);
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
});