## Overview

This repository is a modified version of Cloudflare’s [remote-MCP-GitHub-OAuth demo](https://github.com/cloudflare/ai/tree/main/demos/remote-mcp-github-oauth#readme), extended into a **National Parks Service Explorer**. It provides an LLM context on U.S. national parks by integrating:

- The **National Park Service API**  
- The **Recreation.gov API**  
- A **Weather API (I chose [https://www.weatherapi.com/](https://www.weatherapi.com/))**  

It runs as a Model Context Protocol (MCP) server on Cloudflare Workers, letting you query park overviews, trails, alerts, events, weather forecasts, and more via simple tool calls to the LLM.

> **Looking for the original demo?**  
> See Cloudflare’s instructions [here](https://github.com/cloudflare/ai/tree/main/demos/remote-mcp-github-oauth#access-the-remote-mcp-server-from-claude-desktop).
>
> **Want to add this tool directly to your Claude Desktop?**  
> Checkout the instructions [here](https://github.com/cloudflare/ai/tree/main/demos/remote-mcp-github-oauth#readme)  
>
> **Want to clone their example directly? Use their command line to get a server going on your machine:**
```bash
 npm create cloudflare@latest -- my-mcp-server --template=cloudflare/ai/demos/remote-mcp-github-oauth
```

---

## 📋 Prerequisites

- A Cloudflare account with Workers and KV enabled  
- Node.js v18.20.4+ and npm  
- Your own API keys for:  
  - National Park Service API  
  - Recreation.gov API  
  - Weather API ([weatherapi](https://www.weatherapi.com/))  

---

## ⚙️ Setup

1. **Clone this repo**  
   ```bash
   git clone https://github.com/Kyle-Ski/nps-explorer-mcp-server.git
   cd nps-explorer-mcp-server
   ```

2. **Copy and fill `.dev.vars`**  
   ```bash
   cp .dev.vars.example .dev.vars
   ```
   _Then open .dev.vars and populate with your own secrets._
  * [NPS API]( https://www.nps.gov/subjects/developer/api-documentation.htm)
  * [rec.gov API](https://ridb.recreation.gov/docs)
  * [Weather API (or whatever you choose)](https://www.weatherapi.com/)
  * [Create a GitHub OAuth App](https://github.com/settings/applications)

3. **Install dependencies**  
  ```bash
  npm i
  ```

4. **Run Locally**
  ```bash
  npm start
  ```

## 🚀 Deployment

  ```bash
  npm run deploy
  ```

## 🧰 Tools

| Tool Name                | Description                                                                                       | Status             |
|--------------------------|---------------------------------------------------------------------------------------------------|--------------------|
| `getParkInfo`        | Get comprehensive information about a national park including both static details and current conditions               | working            |
| `getTrailInfo`           | Get detailed information about trails (difficulty, length, elevation gain, current conditions)     | 🚧 under construction |
| `findParks`              | Find national parks based on criteria such as state, activities, or amenities                     | working            |
| `getParkAlerts`          | Get current alerts, closures, and notifications for specified parks                               | working            |
| `getParkEvents`          | Get upcoming events at parks including ranger talks, guided hikes, and educational programs       | working            |
| `findNearbyRecreation`   | Find recreation areas and camping options near a given location                                   | ⚠️ not working correctly        |
| `planParkVisit`          | Get recommendations for the best time to visit a park based on historical and forecast weather    | working            |
| `getParkWeatherForecast` | Get detailed weather forecast for a national park by park code                                    | working            |


## 🧪 Testing
Once your server is up and running, use the [MCP Server Inspector Tool](https://modelcontextprotocol.io/docs/tools/inspector)
to make sure your server can connect and show you the tools and resources it has access to. 
```bash
npx @modelcontextprotocol/inspector
```

## 🛜 For Production 
_All of this is in the original [Cloudflare README.md](https://github.com/cloudflare/ai/tree/main/demos/remote-mcp-github-oauth#readme)_  
**Cloudflare recommends creating a local and remote GitHub OAuth App:**
* For the Homepage URL, specify `https://mcp-github-oauth.<your-subdomain>.workers.dev`
* For the Authorization callback URL, specify `https://mcp-github-oauth.<your-subdomain>.workers.dev/callback`
* Note your Client ID and generate a Client secret and add them via Wrangler.
```bash
wrangler secret put GITHUB_CLIENT_ID
wrangler secret put GITHUB_CLIENT_SECRET
wrangler secret put COOKIE_ENCRYPTION_KEY # add any random string here e.g. openssl rand -hex 32
```
**Set up a KV namespace**
* Create the KV namespace: wrangler kv:namespace create "OAUTH_KV"
* Update the Wrangler file with the KV ID

## 📚 Reference
* Original Cloudflare Demo README:
[https://github.com/cloudflare/ai/tree/main/demos/remote-mcp-github-oauth#readme](https://github.com/cloudflare/ai/tree/main/demos/remote-mcp-github-oauth#readme)
* Model Context Protocol:
[https://modelcontextprotocol.io/introduction](https://modelcontextprotocol.io/introduction)
* Connecting an agent to your server:

## 🧑‍🔧 Troubleshooting and Common Issues
_Check out the MCP [troubleshooting docs](https://modelcontextprotocol.io/docs/tools/debugging)_
**Connecting to Claude Desktop Fails:**
* Most commonly due to Node incompatibility issues, use node v18.20.4+ locally and checkout [this guide](https://kyle.czajkowski.tech/blog/troubleshooting-claude-s-remote-connection-to-mcp-servers) I wrote.

## 🤝 Contributing
1. Fork this repository

2. Create a feature branch (git checkout -b feature-name)

3. Commit your changes (git commit -m 'Add new tool')

4. Push to the branch (git push origin feature-name)

5. Open a Pull Request

## ⚖️ License
his project is licensed under the MIT License. See [LICENSE](https://github.com/Kyle-Ski/nps-explorer-mcp-server/blob/main/LICENSE) for details.
