"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.computeBaselines = computeBaselines;
exports.getBaseline = getBaseline;
const redis_1 = __importDefault(require("../queue/redis"));
const yahoo_1 = require("../adapters/yahoo");
const BASELINE_TTL = 86400;
async function computeBaselines(symbol) {
    const { chains, price } = await (0, yahoo_1.fetchCBOEData)(symbol, 0);
    for (const chain of chains) {
        const contracts = [...chain.calls, ...chain.puts];
        for (const contract of contracts) {
            const key = `baseline:${symbol}:${chain.expiration}:${contract.strike}`;
            const existing = await redis_1.default.get(key);
            const prev = existing ? JSON.parse(existing) : null;
            const avgVolume = prev
                ? Math.round((prev.avgVolume * 29 + contract.volume) / 30)
                : contract.volume;
            const ivPercentile = prev
                ? calculateIVPercentile(contract.impliedVolatility, prev.ivPercentile)
                : 50;
            const baseline = {
                symbol,
                strike: contract.strike,
                expiration: chain.expiration,
                avgVolume,
                ivPercentile,
                updatedAt: Date.now(),
            };
            await redis_1.default.setex(key, BASELINE_TTL, JSON.stringify(baseline));
        }
    }
}
async function getBaseline(symbol, expiration, strike) {
    const key = `baseline:${symbol}:${expiration}:${strike}`;
    const cached = await redis_1.default.get(key);
    return cached ? JSON.parse(cached) : null;
}
function calculateIVPercentile(currentIV, prevPercentile) {
    const weight = 0.1;
    const normalizedIV = Math.min(Math.max(currentIV * 100, 0), 100);
    return Math.round(prevPercentile * (1 - weight) + normalizedIV * weight);
}
