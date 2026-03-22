"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const mcp_js_1 = require("@modelcontextprotocol/sdk/server/mcp.js");
const streamableHttp_js_1 = require("@modelcontextprotocol/sdk/server/streamableHttp.js");
const express_1 = __importDefault(require("express"));
//import { createContextMiddleware } from "@ctxprotocol/sdk";
const zod_1 = require("zod");
const pipeline_1 = require("./classification/pipeline");
const yahoo_1 = require("./adapters/yahoo");
const baselines_1 = require("./data/baselines");
const formatter_1 = require("./utils/formatter");
const node_cron_1 = __importDefault(require("node-cron"));
const app = (0, express_1.default)();
app.use(express_1.default.json());
//app.use("/mcp", createContextMiddleware());
node_cron_1.default.schedule("0 20 * * 1-5", async () => {
    const watchlist = ["SPY", "QQQ", "AAPL", "TSLA", "NVDA"];
    for (const symbol of watchlist) {
        await (0, baselines_1.computeBaselines)(symbol).catch(console.error);
    }
});
app.get("/health", (_req, res) => res.json({ status: "ok" }));
app.post("/mcp", async (req, res) => {
    const transport = new streamableHttp_js_1.StreamableHTTPServerTransport({
        sessionIdGenerator: undefined,
    });
    const server = new mcp_js_1.McpServer({
        name: "options-sweep-tool",
        version: "1.0.0",
    });
    server.tool("scan_sweeps", "Scan for unusual options sweep activity on a given ticker. Detects large block orders with anomalous volume, order character, IV context, and strike selection. Returns plain-English signal classification within 30 seconds.", {
        symbol: zod_1.z
            .string()
            .default("SPY")
            .describe("The ticker symbol to scan e.g. SPY, QQQ, AAPL, TSLA, NVDA"),
    }, async ({ symbol = "SPY" }) => {
        const sym = symbol.toUpperCase();
        const { price } = await (0, yahoo_1.getQuote)(sym);
        const sweeps = await (0, pipeline_1.classifySymbol)(sym, price);
        const top = sweeps.slice(0, 10);
        const data = {
            symbol: sym,
            sweepsFound: sweeps.length,
            topSweeps: top.map((s) => ({
                strike: s.strike,
                expiration: s.expiration,
                type: s.type,
                volume: s.volume,
                openInterest: s.openInterest,
                composite: s.score.composite,
                signal: s.score.signal,
            })),
            summary: (0, formatter_1.formatSweepList)(top),
        };
        return {
            content: [{ type: "text", text: data.summary }],
            structuredContent: data,
        };
    });
    server.tool("get_cached_sweeps", "Retrieve the most recently detected sweeps for a ticker from the intraday cache. Returns results instantly.", {
        symbol: zod_1.z
            .string()
            .default("SPY")
            .describe("The ticker symbol to retrieve cached sweeps for"),
    }, async ({ symbol = "SPY" }) => {
        const sym = symbol.toUpperCase();
        const sweeps = await (0, pipeline_1.getCachedSweeps)(sym);
        const top = sweeps.slice(0, 10);
        const data = {
            symbol: sym,
            sweepsFound: sweeps.length,
            topSweeps: top.map((s) => ({
                strike: s.strike,
                expiration: s.expiration,
                type: s.type,
                volume: s.volume,
                openInterest: s.openInterest,
                composite: s.score.composite,
                signal: s.score.signal,
            })),
            summary: (0, formatter_1.formatSweepList)(top),
        };
        return {
            content: [{ type: "text", text: data.summary }],
            structuredContent: data,
        };
    });
    await server.connect(transport);
    await transport.handleRequest(req, res, req.body);
});
const PORT = process.env.PORT ?? 3000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
