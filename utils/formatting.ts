// src/utils/formatting.ts

// src/utils/formatting.ts
import type { ForecastDay } from "../services/weatherService";

/**
 * Helper function for formatting weather forecast with proper types
 */
export function formatWeatherForecast(forecast: ForecastDay[], locationName?: string): string {
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

/**
 * Helper function to extract a single value from an array of variables
 */
export function getSingleVarValue<T>(varValue: T | T[]): T {
    return Array.isArray(varValue) ? varValue[0] : varValue;
}