"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.fetchCBOEData = fetchCBOEData;
exports.getQuote = getQuote;
const axios_1 = __importDefault(require("axios"));
const blackscholes_1 = require("../utils/blackscholes");
async function fetchCBOEData(symbol, currentPrice) {
    const { data } = await axios_1.default.get(`https://cdn.cboe.com/api/global/delayed_quotes/options/${symbol}.json`, { timeout: 15000 });
    const price = data.data.current_price || currentPrice;
    const rawOptions = data.data.options;
    const grouped = new Map();
    const oiMap = {};
    for (const o of rawOptions) {
        const name = o.option;
        const typeChar = name.charAt(symbol.length + 6);
        const optionType = typeChar === "C" ? "call" : "put";
        const strikeRaw = parseInt(name.slice(symbol.length + 7)) / 1000;
        const expRaw = name.slice(symbol.length, symbol.length + 6);
        const expiration = `20${expRaw.slice(0, 2)}-${expRaw.slice(2, 4)}-${expRaw.slice(4, 6)}`;
        const daysToExpiration = Math.max(1, Math.round((new Date(expiration).getTime() - Date.now()) / 86400000));
        const oi = o.open_interest ?? 0;
        if (!oiMap[strikeRaw])
            oiMap[strikeRaw] = { callOI: 0, putOI: 0 };
        if (typeChar === "C")
            oiMap[strikeRaw].callOI += oi;
        else
            oiMap[strikeRaw].putOI += oi;
        const distanceFromPrice = Math.abs(strikeRaw - price) / price;
        if (distanceFromPrice > 0.15 || daysToExpiration > 60)
            continue;
        if (!grouped.has(expiration)) {
            grouped.set(expiration, { calls: [], puts: [] });
        }
        const lastPrice = o.last_trade_price ?? 0;
        const contract = {
            strike: strikeRaw,
            bid: o.bid ?? 0,
            ask: o.ask ?? 0,
            volume: o.volume ?? 0,
            openInterest: oi,
            impliedVolatility: (0, blackscholes_1.calculateIV)(lastPrice, price, strikeRaw, daysToExpiration, optionType),
            lastPrice,
            inTheMoney: optionType === "call"
                ? strikeRaw < price
                : strikeRaw > price,
        };
        if (optionType === "call") {
            grouped.get(expiration).calls.push(contract);
        }
        else {
            grouped.get(expiration).puts.push(contract);
        }
    }
    const chains = Array.from(grouped.entries())
        .slice(0, 3)
        .map(([expiration, { calls, puts }]) => ({ symbol, expiration, calls, puts }));
    return { chains, oiMap, price };
}
async function getQuote(symbol) {
    const { data } = await axios_1.default.get(`https://cdn.cboe.com/api/global/delayed_quotes/options/${symbol}.json`, { timeout: 15000 });
    return {
        price: data.data.current_price,
        volume: data.data.total_volume ?? 0,
    };
}
