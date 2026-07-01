const express = require('express');
const cors = require('cors');

const app = express();
const PORT = process.env.PORT || 3000;

const allowedOrigins = ['https://yopdude.github.io', 'http://127.0.0.1:5500', 'http://localhost:5500'];

app.use(cors({
    origin: function (origin, callback) {
        // Allow requests with no origin (like mobile apps, uptime monitors, or curl requests)
        if (!origin) return callback(null, true);
        if (allowedOrigins.indexOf(origin) === -1) {
            const msg = 'The CORS policy for this site does not allow access from the specified Origin.';
            return callback(new Error(msg), false);
        }
        return callback(null, true);
    }
}));

let cachedData = null;
let lastFetchTime = 0;
const ONE_HOUR = 60 * 60 * 1000; 

app.get('/api/prices', async (req, res) => {
    const now = Date.now();
    const apiKey = process.env.MARKET_API_KEY;

    if (!apiKey) {
        return res.status(500).json({ error: "Server configuration missing: MARKET_API_KEY env variable is required." });
    }

    // Determine if cache is either missing or older than 1 hour
    if (!cachedData || (now - lastFetchTime > ONE_HOUR)) {
        try {
            console.log("Cache expired or empty. Querying CurrencyFreaks API...");
            
            const response = await fetch(`https://api.currencyfreaks.com/v2.0/rates/latest?apikey=${apiKey}`);
            
            if (!response.ok) {
                throw new Error(`Provider HTTP Error: ${response.status}`);
            }
            
            const rawJson = await response.json();
            const rates = rawJson.rates;

            if (!rates || !rates.XAU || !rates.XAG || !rates.NZD) {
                throw new Error("Malformed payload structure received from upstream API provider.");
            }

            // Mathematical Conversion: API provides items relative to 1 USD base value parameters
            // Yield calculations to give price inside structural USD per Troy ounce configurations
            cachedData = {
                gold: (1 / parseFloat(rates.XAU)).toFixed(2),       
                silver: (1 / parseFloat(rates.XAG)).toFixed(2),     
                platinum: (1 / parseFloat(rates.XPT || 0.0010)).toFixed(2),   
                palladium: (1 / parseFloat(rates.XPD || 0.0011)).toFixed(2),  
                nzd_usd: (parseFloat(rates.NZD)).toFixed(4), // 1 USD = X NZD
                serverUpdatedAt: new Date(now).toUTCString()
            };

            lastFetchTime = now;
            console.log("Successfully cached new hourly data payload.");

        } catch (error) {
            console.error("Backend fetch routine failed:", error.message);
            
            // If the upstream API fails but we have an old cache available, fallback to it
            if (cachedData) {
                console.log("Serving stale cache data due to provider error.");
                return res.json({
                    ...cachedData,
                    warning: "Serving stale cache due to provider error",
                    errorMessage: error.message
                });
            }
            
            // Fatal backup response if upstream fails and server has completely blank variables
            return res.status(502).json({ error: "Upstream market data unavailable and cache empty." });
        }
    }

    // Serve fresh or valid cached data cleanly
    res.json(cachedData);
});

app.listen(PORT, () => {
    console.log(`Secure Hourly Cache Server initialized on port ${PORT}`);
});