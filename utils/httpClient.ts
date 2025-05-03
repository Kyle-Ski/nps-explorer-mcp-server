export class HttpClient {
    async get<T>(url: string, init?: RequestInit): Promise<T> {
        const res = await fetch(url, init);
        if (!res.ok) {
            throw new Error(`GET ${url} failed: ${res.status}`);
        }
        return (await res.json()) as T;
    }
}