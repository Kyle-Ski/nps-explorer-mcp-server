import type { AuthRequest, OAuthHelpers } from "@cloudflare/workers-oauth-provider";
import { Hono } from "hono";
import { fetchUpstreamAuthToken, getUpstreamAuthorizeUrl } from "./utils";
import { type Env } from "./mcp-server";
import { Octokit } from "octokit";

const app = new Hono<{ Bindings: Env & { OAUTH_PROVIDER: OAuthHelpers } }>();

// 1) Kick off the GitHub login
app.get("/authorize", async (c) => {
    const oauthReqInfo = await c.env.OAUTH_PROVIDER.parseAuthRequest(c.req.raw);
    return Response.redirect(
        getUpstreamAuthorizeUrl({
            upstream_url: "https://github.com/login/oauth/authorize",
            scope: "read:user",
            client_id: c.env.GITHUB_CLIENT_ID,
            redirect_uri: new URL("/callback", c.req.raw.url).href,
            state: btoa(JSON.stringify(oauthReqInfo)),
        })
    );
});

// 2) GitHub redirects back here with ?code=
app.get("/callback", async (c) => {
    const oauthReqInfo = JSON.parse(atob(c.req.query("state")!)) as AuthRequest;
    const [accessToken, err] = await fetchUpstreamAuthToken({
        upstream_url: "https://github.com/login/oauth/access_token",
        client_id: c.env.GITHUB_CLIENT_ID,
        client_secret: c.env.GITHUB_CLIENT_SECRET,
        code: c.req.query("code") || "",
        redirect_uri: new URL("/callback", c.req.raw.url).href,
    });
    if (err) return err;
    const user = await new Octokit({ auth: accessToken }).rest.users.getAuthenticated();
    const { login, name, email } = user.data;
    const { redirectTo } = await c.env.OAUTH_PROVIDER.completeAuthorization({
        request: oauthReqInfo,
        userId: login,
        metadata: { label: name },
        scope: oauthReqInfo.scope,
        props: { login, name, email, accessToken },
    });
    return Response.redirect(redirectTo);
});

export { app as GitHubHandler };
