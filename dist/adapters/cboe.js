"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.getOpenInterest = getOpenInterest;
const axios_1 = __importDefault(require("axios"));
const redis_1 = __importDefault(require("../queue/redis"));
const CACHE_KEY = "cboe:oi";
const CACHE_TTL = 86400;
async function getOpenInterest(symbol) {
    const cached = await redis_1.default.get(`${CACHE_KEY}:${symbol}`);
    if (cached)
        return JSON.parse(cached);
    const { data } = await axios_1.default.get(`https://cdn.cboe.com/api/global/delayed_quotes/options/${symbol}.json`);
    const options = data.data.options;
    const strikeMap = new Map();
    for (const o of options) {
        const name = o.option;
        const typeChar = name.charAt(symbol.length + 6);
        const strike = parseInt(name.slice(symbol.length + 7)) / 1000;
        const oi = o.open_interest ?? 0;
        if (!strikeMap.has(strike)) {
            strikeMap.set(strike, { callOI: 0, putOI: 0 });
        }
        const entry = strikeMap.get(strike);
        if (typeChar === "C")
            entry.callOI += oi;
        else
            entry.putOI += oi;
    }
    const result = Array.from(strikeMap.entries()).map(([strike, { callOI, putOI }]) => ({ strike, callOI, putOI }));
    await redis_1.default.setex(`${CACHE_KEY}:${symbol}`, CACHE_TTL, JSON.stringify(result));
    return result;
}
