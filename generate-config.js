// Vercel runs this automatically (set as the Build Command) before every deploy.
// It reads the real key values from Vercel's Environment Variables (set in the dashboard,
// never committed to git) and writes them into config.js, which the site actually loads.
const fs = require('fs');

const config = {
  FIREBASE_API_KEY: process.env.FIREBASE_API_KEY || "",
  GEMINI_API_KEY: process.env.GEMINI_API_KEY || "",
  DAILY_API_KEY: process.env.DAILY_API_KEY || "",
  DAILY_SUBDOMAIN: process.env.DAILY_SUBDOMAIN || ""
};

const missing = Object.entries(config).filter(([, v]) => !v).map(([k]) => k);
if (missing.length) {
  console.warn(`Warning: these Environment Variables are not set in Vercel yet: ${missing.join(', ')}`);
}

const fileContent = `window.APP_CONFIG = ${JSON.stringify(config, null, 2)};\n`;
fs.writeFileSync('config.js', fileContent);
console.log('config.js generated from environment variables.');