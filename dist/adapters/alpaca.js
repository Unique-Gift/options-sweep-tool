"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.getEquityContext = getEquityContext;
const axios_1 = __importDefault(require("axios"));
const headers = () => ({
    "APCA-API-KEY-ID": process.env.ALPACA_API_KEY,
    "APCA-API-SECRET-KEY": process.env.ALPACA_SECRET_KEY,
});
async function getEquityContext(symbol) {
    try {
        const { data } = await axios_1.default.get(`https://data.alpaca.markets/v2/stocks/${symbol}/snapshot`, { headers: headers(), timeout: 10000 });
        const daily = data.dailyBar;
        const prev = data.prevDailyBar;
        const trade = data.latestTrade;
        return {
            price: trade.p,
            volume: daily.v,
            avgDailyVolume: prev?.v ?? daily.v,
            relativeVolume: daily.v / (prev?.v ?? daily.v),
            high: daily.h,
            low: daily.l,
            open: daily.o,
            prevClose: prev?.c ?? daily.o,
            atr: Math.abs(daily.h - daily.l),
        };
    }
    catch (err) {
        console.error("Alpaca equity failed, falling back to CBOE:", err);
        const { data } = await axios_1.default.get(`https://cdn.cboe.com/api/global/delayed_quotes/options/${symbol}.json`);
        const price = data.data.current_price;
        return {
            price,
            volume: 0,
            avgDailyVolume: 0,
            relativeVolume: 1,
            high: price,
            low: price,
            open: price,
            prevClose: price,
            atr: 0,
        };
    }
}
