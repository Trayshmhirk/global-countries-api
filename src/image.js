const PImage = require("pureimage");
const fs = require("fs").promises;
const path = require("path");
const axios = require("axios");

async function generateSummaryImage({ total, top5, timestamp }) {
  const width = 900;
  const height = 600;
  const img = PImage.make(width, height);
  const ctx = img.getContext("2d");

  // background
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, width, height);

  // load font
  const fontPath = path.join(__dirname, "fonts", "SourceSansPro-Regular.ttf");
  const font = PImage.registerFont(fontPath, "SourceSansPro");
  font.loadSync();
  ctx.font = "24pt SourceSansPro";
  ctx.fillStyle = "#000000";

  ctx.fillText("Countries Summary", 40, 60);
  ctx.fillText(`Total countries: ${total}`, 40, 110);
  ctx.fillText(`Last refreshed: ${timestamp.toISOString()}`, 40, 150);
  ctx.fillText("Top 5 countries by estimated GDP:", 40, 200);

  let y = 240;
  for (let i = 0; i < Math.min(5, top5.length); i++) {
    const c = top5[i];
    const gdp = c.estimated_gdp
      ? Number(c.estimated_gdp).toLocaleString(undefined, {
          maximumFractionDigits: 2,
        })
      : "N/A";

    // draw flag if available
    if (c.flag_url) {
      try {
        // Convert flag URL to use PNG from flagcdn
        let imgUrl = c.flag_url;
        if (imgUrl && imgUrl.includes("flagcdn.com")) {
          // Convert URL to use PNG format from flagcdn
          const urlParts = imgUrl.split("/");
          const countryCode = urlParts[urlParts.length - 1].split(".")[0];
          if (countryCode) {
            imgUrl = `https://flagcdn.com/w160/${countryCode.toLowerCase()}.png`;
          }
        } else if (imgUrl && imgUrl.includes("restcountries.eu")) {
          // Handle restcountries.eu URLs by converting to flagcdn
          const countryCode = imgUrl.split("/").pop().split(".")[0];
          if (countryCode) {
            imgUrl = `https://flagcdn.com/w160/${countryCode.toLowerCase()}.png`;
          }
        }

        const response = await axios.get(imgUrl, {
          responseType: "arraybuffer",
          timeout: 10000,
        });

        // Create a buffer from the response data
        const buffer = Buffer.from(response.data);

        // Create a readable stream from the buffer
        const stream = new (require("stream").Readable)();
        stream.push(buffer);
        stream.push(null);

        // Decode the image - assume PNG since we're using flagcdn PNG endpoint
        const flagImg = await PImage.decodePNGFromStream(stream);
        const flagSize = 48; // larger so it is visible
        const flagX = 40;
        const flagY = y - flagSize / 2;
        ctx.drawImage(flagImg, flagX, flagY, flagSize, flagSize);
      } catch (err) {
        console.warn(`Failed to load flag for ${c.name}:`, err.message);
      }
    }

    const textX = 40 + 48 + 16; // flag + padding
    ctx.fillText(`${i + 1}. ${c.name} — ${gdp}`, textX, y);
    y += 64; // spacing to match flag size
  }

  // ensure cache dir
  const outDir = path.join(process.cwd(), "cache");
  await fs.mkdir(outDir, { recursive: true });

  // Include timestamp in filename to prevent caching issues
  const fileTimestamp = new Date().toISOString().replace(/[:.]/g, "-");
  const outPath = path.join(outDir, `summary_${fileTimestamp}.png`);

  // Also save a copy as summary.png for consistent access
  const latestPath = path.join(outDir, "summary.png");

  const stream = await fs.open(outPath, "w");
  await PImage.encodePNGToStream(img, stream.createWriteStream());
  await stream.close();

  // Copy to summary.png
  await fs.copyFile(outPath, latestPath);
}

module.exports = { generateSummaryImage };
