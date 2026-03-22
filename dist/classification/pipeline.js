"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.classifySymbol = classifySymbol;
exports.getCachedSweeps = getCachedSweeps;
const yahoo_1 = require("../adapters/yahoo");
const alpaca_1 = require("../adapters/alpaca");
const baselines_1 = require("../data/baselines");
const scoring_1 = require("./scoring");
const redis_1 = __importDefault(require("../queue/redis"));
async function classifySymbol(symbol, currentPrice) {
    const [context, cboe] = await Promise.all([
        (0, alpaca_1.getEquityContext)(symbol),
        (0, yahoo_1.fetchCBOEData)(symbol, currentPrice),
    ]);
    const price = context.price || cboe.price || currentPrice;
    const { chains, oiMap } = cboe;
    const results = [];
    for (const chain of chains) {
        const daysToExpiration = Math.round((new Date(chain.expiration).getTime() - Date.now()) / 86400000);
        const qualifying = [
            ...chain.calls.filter((c) => c.volume >= 10).map((c) => ({ contract: c, type: "call" })),
            ...chain.puts.filter((c) => c.volume >= 10).map((c) => ({ contract: c, type: "put" })),
        ];
        const baselines = await Promise.all(qualifying.map(({ contract }) => (0, baselines_1.getBaseline)(symbol, chain.expiration, contract.strike)));
        for (let i = 0; i < qualifying.length; i++) {
            const { contract, type } = qualifying[i];
            const baseline = baselines[i];
            const strikeOIData = oiMap[contract.strike];
            const strikeOI = strikeOIData
                ? { strike: contract.strike, callOI: strikeOIData.callOI, putOI: strikeOIData.putOI }
                : null;
            const score = (0, scoring_1.scoreContract)(contract, baseline, price, daysToExpiration, strikeOI, context);
            if (score.composite < 30)
                continue;
            results.push({
                symbol,
                strike: contract.strike,
                expiration: chain.expiration,
                type,
                volume: contract.volume,
                openInterest: strikeOI
                    ? strikeOI.callOI + strikeOI.putOI
                    : contract.openInterest,
                impliedVolatility: contract.impliedVolatility,
                currentPrice: price,
                score,
                detectedAt: Date.now(),
            });
        }
    }
    if (results.length > 0) {
        await redis_1.default.setex(`sweeps:${symbol}`, 3600, JSON.stringify(results));
    }
    return results;
}
async function getCachedSweeps(symbol) {
    const cached = await redis_1.default.get(`sweeps:${symbol}`);
    return cached ? JSON.parse(cached) : [];
}
