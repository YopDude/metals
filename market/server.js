const express = require('express');
const cors = require('cors');

const app = express();
const PORT = process.env.PORT || 3000;

// Enabled open CORS handling to safely allow your GitHub Pages frontends, 
// local environments, and external cron utilities to fetch read-only data.
app.use(cors());

let cachedData = null;
let lastFetchTime = 0;
const ONE_HOUR = 60 * 60 * 1000; 

// Helper function to handle fetching and caching data
async function updateCacheIfNeeded() {
    const now = Date.now();
    const apiKey = process.env.MARKET_API_KEY;

    if (!apiKey) {
        throw new Error("Server configuration missing: MARKET_API_KEY env variable is required.");
    }

    if (!cachedData || (now - lastFetchTime > ONE_HOUR)) {
        console.log("Cache expired or empty. Querying Open Exchange Rates API...");
        
        const response = await fetch(`https://openexchangerates.org/api/latest.json?app_id=${apiKey}`);
        
        if (!response.ok) {
            throw new Error(`Provider HTTP Error: ${response.status}`);
        }
        
        const rawJson = await response.json();
        const rates = rawJson.rates;

        if (!rates || !rates.XAU || !rates.XAG || !rates.NZD) {
            throw new Error("Malformed payload structure received from Open Exchange Rates.");
        }

        cachedData = {  
            gold: (1 / parseFloat(rates.XAU)).toFixed(2),       
            silver: (1 / parseFloat(rates.XAG)).toFixed(2),     
            platinum: (1 / parseFloat(rates.XPT || 0.0010)).toFixed(2),   
            palladium: (1 / parseFloat(rates.XPD || 0.0011)).toFixed(2),  
            usd_nzd: (parseFloat(rates.NZD)).toFixed(4),
            serverUpdatedAt: new Date(now).toUTCString()
        };

        lastFetchTime = now;
        console.log("Successfully cached new hourly data payload from Open Exchange Rates.");
    }
}

app.get('/api/prices', async (req, res) => {
    try {
        await updateCacheIfNeeded();
        res.json(cachedData);
    } catch (error) {
        console.error("Backend fetch routine failed:", error.message);
        
        if (cachedData) {
            console.log("Serving stale cache data due to provider error.");
            return res.json({
                ...cachedData,
                warning: "Serving stale cache due to provider error",
                errorMessage: error.message
            });
        }
        
        res.status(502).json({ error: "Upstream market data unavailable and cache empty." });
    }
});

// Lightweight cron endpoint to wake up Render and update cache without large payloads
app.get('/api/cron-ping', async (req, res) => {
    try {
        await updateCacheIfNeeded();
        // Return minimal JSON instead of plain text to ensure clear tracking
        return res.status(200).json({ status: "ok" });
    } catch (error) {
        console.error("Cron ping background fetch failed:", error.message);
        // Return a small JSON error payload rather than full stack traces or HTML pages
        return res.status(200).json({ status: "error", message: error.message });
    }
});

app.listen(PORT, () => {
    console.log(`Secure Hourly Cache Server initialized on port ${PORT}`);
});