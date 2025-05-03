export function getUpstreamAuthorizeUrl({
    upstream_url,
    client_id,
    scope,
    redirect_uri,
    state,
}: {
    upstream_url: string;
    client_id: string;
    scope: string;
    redirect_uri: string;
    state?: string;
}) {
    const u = new URL(upstream_url);
    u.searchParams.set("client_id", client_id);
    u.searchParams.set("redirect_uri", redirect_uri);
    u.searchParams.set("scope", scope);
    if (state) u.searchParams.set("state", state);
    u.searchParams.set("response_type", "code");
    return u.href;
}

export async function fetchUpstreamAuthToken({ upstream_url, client_id, client_secret, code, redirect_uri }: {
    upstream_url: string;
    client_id: string;
    client_secret: string;
    code: string;
    redirect_uri: string;
}): Promise<[string, null] | [null, Response]> {
    const resp = await fetch(upstream_url, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({ client_id, client_secret, code, redirect_uri }).toString(),
    });
    if (!resp.ok) return [null, new Response("Token exchange failed", { status: 500 })];
    const body = await resp.formData();
    const token = body.get("access_token") as string;
    return token ? [token, null] : [null, new Response("No access_token", { status: 400 })];
}
