import type { HttpClient } from "../utils/httpClient";

export interface WeatherInfo {
    location: string;
    temp_f: number;
    condition: string;
}

export interface ForecastDay {
    date: string;
    maxTempF: number;
    minTempF: number;
    condition: string;
}

export interface DetailedForecastDay extends ForecastDay {
    sunrise: string;
    sunset: string;
    humidity: number;
    precipitation: number;
    windSpeed: number;
    windDirection: string;
    chanceOfRain: number;
    uvIndex: number;
    hourlyForecast?: HourlyForecast[];
}

export interface HourlyForecast {
    time: string;
    tempF: number;
    condition: string;
    windSpeed: number;
    chanceOfRain: number;
    feelsLike: number;
}

export interface WeatherAlert {
    alertType: string;
    severity: string;
    headline: string;
    message: string;
    effective: string;
    expires: string;
    areas: string;
}

export interface AirQuality {
    location: string;
    aqi: number;
    co: number;
    no2: number;
    o3: number;
    so2: number;
    pm2_5: number;
    pm10: number;
    usEpaIndex: number;
}

export interface IWeatherService {
    getCurrentWeatherByCoords(latitude: number, longitude: number): Promise<WeatherInfo>;
    get7DayForecastByCoords(latitude: number, longitude: number): Promise<ForecastDay[]>;
    get7DayForecastByLocation(location: string): Promise<ForecastDay[]>;
    // New methods
    getHourlyForecast(location: string, days?: number): Promise<HourlyForecast[]>;
    getDetailedForecast(location: string, days?: number): Promise<DetailedForecastDay[]>;
    getWeatherAlerts(location: string): Promise<WeatherAlert[]>;
    getAirQuality(location: string): Promise<AirQuality>;
    getAstronomy(location: string, date?: string): Promise<any>;
    getHistoricalWeather(location: string, date: string): Promise<any>;
    getFutureWeather(location: string, date: string): Promise<any>;
}

interface CurrentApiResponse {
    location: { name: string };
    current: {
        temp_f: number;
        condition: { text: string };
        wind_mph: number;
        wind_dir: string;
        humidity: number;
        feelslike_f: number;
        uv: number;
        air_quality?: any;
    };
}

interface ForecastApiResponse {
    forecast: {
        forecastday: Array<{
            date: string;
            day: {
                maxtemp_f: number;
                mintemp_f: number;
                condition: { text: string };
                daily_chance_of_rain: number;
                avghumidity: number;
                totalprecip_in: number;
                maxwind_mph: number;
                uv: number;
            };
            astro: {
                sunrise: string;
                sunset: string;
            };
            hour: Array<{
                time: string;
                temp_f: number;
                condition: { text: string };
                wind_mph: number;
                chance_of_rain: number;
                feelslike_f: number;
            }>;
        }>;
    };
}

interface AlertsApiResponse {
    alerts: {
        alert: Array<{
            headline: string;
            msgtype: string;
            severity: string;
            desc: string;
            effective: string;
            expires: string;
            areas: string;
        }>;
    };
}

export class WeatherApiService implements IWeatherService {
    private readonly baseUrl = "https://api.weatherapi.com/v1";

    constructor(
        private readonly http: HttpClient,
        private readonly apiKey: string
    ) { }

    async getCurrentWeatherByCoords(
        latitude: number,
        longitude: number
    ): Promise<WeatherInfo> {
        const url = `${this.baseUrl}/current.json?key=${this.apiKey}&q=${latitude},${longitude}`;
        const resp = await this.http.get<CurrentApiResponse>(url);
        return {
            location: resp.location.name,
            temp_f: resp.current.temp_f,
            condition: resp.current.condition.text,
        };
    }

    async get7DayForecastByCoords(
        latitude: number,
        longitude: number
    ): Promise<ForecastDay[]> {
        const url = `${this.baseUrl}/forecast.json?key=${this.apiKey}&q=${latitude},${longitude}&days=7`;
        const resp = await this.http.get<ForecastApiResponse>(url);
        return resp.forecast.forecastday.map((f) => ({
            date: f.date,
            maxTempF: f.day.maxtemp_f,
            minTempF: f.day.mintemp_f,
            condition: f.day.condition.text,
        }));
    }

    async get7DayForecastByLocation(
        location: string
    ): Promise<ForecastDay[]> {
        // URL-encode the full location string (commas & spaces → %2C, %20, etc)
        const encodedLocation = encodeURIComponent(location);
        const url = `${this.baseUrl}/forecast.json?key=${this.apiKey}&q=${encodedLocation}&days=7`;
        const resp = await this.http.get<ForecastApiResponse>(url);
        return resp.forecast.forecastday.map((f) => ({
            date: f.date,
            maxTempF: f.day.maxtemp_f,
            minTempF: f.day.mintemp_f,
            condition: f.day.condition.text,
        }));
    }

    // Get hourly forecast
    async getHourlyForecast(location: string, days: number = 1): Promise<HourlyForecast[]> {
        const encodedLocation = encodeURIComponent(location);
        const url = `${this.baseUrl}/forecast.json?key=${this.apiKey}&q=${encodedLocation}&days=${days}`;
        const resp = await this.http.get<ForecastApiResponse>(url);

        const hourlyForecasts: HourlyForecast[] = [];

        for (const day of resp.forecast.forecastday) {
            for (const hour of day.hour) {
                hourlyForecasts.push({
                    time: hour.time,
                    tempF: hour.temp_f,
                    condition: hour.condition.text,
                    windSpeed: hour.wind_mph,
                    chanceOfRain: hour.chance_of_rain,
                    feelsLike: hour.feelslike_f
                });
            }
        }

        return hourlyForecasts;
    }

    // Get detailed forecast with more data
    async getDetailedForecast(location: string, days: number = 7): Promise<DetailedForecastDay[]> {
        const encodedLocation = encodeURIComponent(location);
        const url = `${this.baseUrl}/forecast.json?key=${this.apiKey}&q=${encodedLocation}&days=${days}`;
        const resp = await this.http.get<ForecastApiResponse>(url);

        return resp.forecast.forecastday.map(f => ({
            date: f.date,
            maxTempF: f.day.maxtemp_f,
            minTempF: f.day.mintemp_f,
            condition: f.day.condition.text,
            sunrise: f.astro.sunrise,
            sunset: f.astro.sunset,
            humidity: f.day.avghumidity,
            precipitation: f.day.totalprecip_in,
            windSpeed: f.day.maxwind_mph,
            windDirection: "N/A", // Not directly available in daily summary
            chanceOfRain: f.day.daily_chance_of_rain,
            uvIndex: f.day.uv,
            hourlyForecast: f.hour.map(h => ({
                time: h.time,
                tempF: h.temp_f,
                condition: h.condition.text,
                windSpeed: h.wind_mph,
                chanceOfRain: h.chance_of_rain,
                feelsLike: h.feelslike_f
            }))
        }));
    }

    // Get weather alerts
    async getWeatherAlerts(location: string): Promise<WeatherAlert[]> {
        const encodedLocation = encodeURIComponent(location);
        const url = `${this.baseUrl}/forecast.json?key=${this.apiKey}&q=${encodedLocation}&days=1&alerts=yes`;
        const resp = await this.http.get<ForecastApiResponse & AlertsApiResponse>(url);

        if (!resp.alerts || !resp.alerts.alert) {
            return [];
        }

        return resp.alerts.alert.map(alert => ({
            alertType: alert.msgtype,
            severity: alert.severity,
            headline: alert.headline,
            message: alert.desc,
            effective: alert.effective,
            expires: alert.expires,
            areas: alert.areas
        }));
    }

    // Get air quality
    async getAirQuality(location: string): Promise<AirQuality> {
        const encodedLocation = encodeURIComponent(location);
        const url = `${this.baseUrl}/current.json?key=${this.apiKey}&q=${encodedLocation}&aqi=yes`;
        const resp = await this.http.get<CurrentApiResponse>(url);

        const airQuality = resp.current.air_quality || {};

        return {
            location: resp.location.name,
            aqi: airQuality.air_quality_index || 0,
            co: airQuality.co || 0,
            no2: airQuality.no2 || 0,
            o3: airQuality.o3 || 0,
            so2: airQuality.so2 || 0,
            pm2_5: airQuality.pm2_5 || 0,
            pm10: airQuality.pm10 || 0,
            usEpaIndex: airQuality.us - airQuality.epa - airQuality.index || 0
        };
    }

    // Get astronomy data
    async getAstronomy(location: string, date?: string): Promise<any> {
        const encodedLocation = encodeURIComponent(location);
        const dateParam = date || new Date().toISOString().split('T')[0];
        const url = `${this.baseUrl}/astronomy.json?key=${this.apiKey}&q=${encodedLocation}&dt=${dateParam}`;

        const resp = await this.http.get<{
            astronomy: {
                astro: {
                    sunrise: string;
                    sunset: string;
                    moonrise: string;
                    moonset: string;
                    moon_phase: string;
                    moon_illumination: string;
                }
            }
        }>(url);

        return resp.astronomy.astro;
    }

    // Get historical weather
    async getHistoricalWeather(location: string, date: string): Promise<any> {
        const encodedLocation = encodeURIComponent(location);
        const url = `${this.baseUrl}/history.json?key=${this.apiKey}&q=${encodedLocation}&dt=${date}`;

        const resp = await this.http.get<any>(url);
        return resp;
    }

    // Get future weather (for locations where available)
    async getFutureWeather(location: string, date: string): Promise<any> {
        const encodedLocation = encodeURIComponent(location);
        const url = `${this.baseUrl}/future.json?key=${this.apiKey}&q=${encodedLocation}&dt=${date}`;

        const resp = await this.http.get<any>(url);
        return resp;
    }
}