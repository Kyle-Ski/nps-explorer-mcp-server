import { McpServer, ResourceTemplate } from "@modelcontextprotocol/sdk/server/mcp.js";
import { WeatherApiService } from "../services/weatherService";

export function registerWeatherResources(server: McpServer, weatherService: WeatherApiService) {
    // 7-day forecast by freeform location
    server.resource(
        "forecast",
        new ResourceTemplate("weather://{location}", { list: undefined }),
        async (uri, vars) => {
            const loc = Array.isArray(vars.location) ? vars.location[0] : vars.location;
            const forecast = await weatherService.get7DayForecastByLocation(loc);
            return { contents: [{ uri: uri.href, text: JSON.stringify(forecast, null, 2) }] };
        }
    );

    // Detailed weather forecast
    server.resource(
        "detailedForecast",
        new ResourceTemplate("detailed-weather://{location}", { list: undefined }),
        async (uri, vars) => {
            const location = Array.isArray(vars.location) ? vars.location[0] : vars.location;
            const forecast = await weatherService.getDetailedForecast(decodeURIComponent(location));
            return { contents: [{ uri: uri.href, text: JSON.stringify(forecast, null, 2) }] };
        }
    );

    // Weather alerts
    server.resource(
        "weatherAlerts",
        new ResourceTemplate("weather-alerts://{location}", { list: undefined }),
        async (uri, vars) => {
            const location = Array.isArray(vars.location) ? vars.location[0] : vars.location;
            const alerts = await weatherService.getWeatherAlerts(decodeURIComponent(location));
            return { contents: [{ uri: uri.href, text: JSON.stringify(alerts, null, 2) }] };
        }
    );

    // Air quality
    server.resource(
        "airQuality",
        new ResourceTemplate("air-quality://{location}", { list: undefined }),
        async (uri, vars) => {
            const location = Array.isArray(vars.location) ? vars.location[0] : vars.location;
            const airQuality = await weatherService.getAirQuality(decodeURIComponent(location));
            return { contents: [{ uri: uri.href, text: JSON.stringify(airQuality, null, 2) }] };
        }
    );
}