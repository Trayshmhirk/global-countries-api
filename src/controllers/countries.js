const axios = require("axios");
const db = require("../db");
const fs = require("fs").promises;
const path = require("path");
const { generateSummaryImage } = require("../image");

const COUNTRIES_API =
  "https://restcountries.com/v2/all?fields=name,capital,region,population,flag,currencies";
const EXCHANGE_API = "https://open.er-api.com/v6/latest/USD";

function randMultiplier() {
  // inclusive 1000-2000
  return Math.floor(Math.random() * (2000 - 1000 + 1)) + 1000;
}

async function refresh(req, res, next) {
  // Fetch external APIs in parallel but report which one failed (if any)
  let countriesResp, ratesResp;
  try {
    const results = await Promise.allSettled([
      axios.get(COUNTRIES_API, { timeout: 15000 }),
      axios.get(EXCHANGE_API, { timeout: 15000 }),
    ]);

    const countriesResult = results[0];
    const ratesResult = results[1];

    if (countriesResult.status !== "fulfilled") {
      console.error("Countries API fetch failed", countriesResult.reason);
      return res.status(503).json({
        error: "External data source unavailable",
        details: "Could not fetch data from countries API",
      });
    }
    if (ratesResult.status !== "fulfilled") {
      console.error("Exchange API fetch failed", ratesResult.reason);
      return res.status(503).json({
        error: "External data source unavailable",
        details: "Could not fetch data from exchange rates API",
      });
    }

    countriesResp = countriesResult.value.data;
    ratesResp = ratesResult.value.data;
  } catch (err) {
    console.error("External API fetch unexpected error", err.message || err);
    return res.status(503).json({
      error: "External data source unavailable",
      details: "Could not fetch data from external APIs",
    });
  }

  if (!Array.isArray(countriesResp)) {
    return res.status(503).json({
      error: "External data source unavailable",
      details: "Invalid response from countries API",
    });
  }
  if (!ratesResp || !ratesResp.rates) {
    return res.status(503).json({
      error: "External data source unavailable",
      details: "Invalid response from exchange rates API",
    });
  }

  const rates = ratesResp.rates; // map currency_code -> rate
  const pool = db.getPool();
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();

    const timestamp = new Date();

    for (const c of countriesResp) {
      const name = c.name || null;
      const capital = c.capital || null;
      const region = c.region || null;
      const population = typeof c.population === "number" ? c.population : null;
      const flag_url = c.flag || null;

      // currency handling
      let currency_code = null;
      let exchange_rate = null;
      let estimated_gdp = null;

      if (
        Array.isArray(c.currencies) &&
        c.currencies.length > 0 &&
        c.currencies[0] &&
        c.currencies[0].code
      ) {
        currency_code = c.currencies[0].code;
        if (Object.prototype.hasOwnProperty.call(rates, currency_code)) {
          exchange_rate = Number(rates[currency_code]);
          // compute estimated_gdp
          const multiplier = randMultiplier();
          if (population != null && exchange_rate) {
            estimated_gdp = (population * multiplier) / exchange_rate;
          } else {
            estimated_gdp = null;
          }
        } else {
          // currency not found in rates
          exchange_rate = null;
          estimated_gdp = null;
        }
      } else {
        // no currency
        currency_code = null;
        exchange_rate = null;
        estimated_gdp = 0;
      }

      // validation for required fields per spec: name and population are required.
      if (!name || population == null) {
        // skip storing invalid entries
        continue;
      }

      // Upsert by name (name is unique)
      const q = `INSERT INTO countries (name, capital, region, population, currency_code, exchange_rate, estimated_gdp, flag_url, last_refreshed_at)
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
                 ON DUPLICATE KEY UPDATE capital = VALUES(capital), region = VALUES(region), population = VALUES(population), currency_code = VALUES(currency_code), exchange_rate = VALUES(exchange_rate), estimated_gdp = VALUES(estimated_gdp), flag_url = VALUES(flag_url), last_refreshed_at = VALUES(last_refreshed_at)`;
      await conn.query(q, [
        name,
        capital,
        region,
        population,
        currency_code,
        exchange_rate,
        estimated_gdp,
        flag_url,
        timestamp,
      ]);
    }

    // update metadata last_refreshed_at
    await conn.query("UPDATE metadata SET value = ? WHERE `key` = ?", [
      timestamp.toISOString(),
      "last_refreshed_at",
    ]);

    await conn.commit();

    // generate image after successful commit
    try {
      // gather data for image
      const [rows] = await pool.query(
        "SELECT * FROM countries ORDER BY estimated_gdp DESC LIMIT 5"
      );
      const [[{ value: totalRow }]] = await pool.query(
        "SELECT COUNT(*) as value FROM countries"
      );
      const total = totalRow && totalRow.value ? totalRow.value : null;
      await generateSummaryImage({ total: total, top5: rows, timestamp });
    } catch (imgErr) {
      console.error("Failed to generate image", imgErr);
      // image failure should not fail refresh response
    }

    return res.json({ ok: true, total_refreshed_at: timestamp.toISOString() });
  } catch (err) {
    await conn.rollback();
    console.error("DB error during refresh", err);
    return next(err);
  } finally {
    conn.release();
  }
}

// GET /countries?region=&currency=&sort=gdp_desc
async function list(req, res, next) {
  try {
    const pool = db.getPool();
    const filters = [];
    const params = [];
    if (req.query.region) {
      filters.push("region = ?");
      params.push(req.query.region);
    }
    if (req.query.currency) {
      filters.push("currency_code = ?");
      params.push(req.query.currency);
    }
    let q =
      "SELECT id, name, capital, region, population, currency_code, exchange_rate, estimated_gdp, flag_url, last_refreshed_at FROM countries";
    if (filters.length) q += " WHERE " + filters.join(" AND ");
    if (req.query.sort === "gdp_desc") q += " ORDER BY estimated_gdp DESC";

    const [rows] = await pool.query(q, params);
    return res.json(rows);
  } catch (err) {
    return next(err);
  }
}

// GET /countries/:name
async function getOne(req, res, next) {
  try {
    const pool = db.getPool();
    const name = req.params.name;
    if (!name)
      return res
        .status(400)
        .json({ error: "Validation failed", details: { name: "is required" } });
    const [rows] = await pool.query(
      "SELECT id, name, capital, region, population, currency_code, exchange_rate, estimated_gdp, flag_url, last_refreshed_at FROM countries WHERE LOWER(name) = LOWER(?) LIMIT 1",
      [name]
    );
    if (rows.length === 0)
      return res.status(404).json({ error: "Country not found" });
    return res.json(rows[0]);
  } catch (err) {
    return next(err);
  }
}

// DELETE /countries/:name
async function deleteOne(req, res, next) {
  try {
    const pool = db.getPool();
    const name = req.params.name;
    if (!name)
      return res
        .status(400)
        .json({ error: "Validation failed", details: { name: "is required" } });
    const [result] = await pool.query(
      "DELETE FROM countries WHERE LOWER(name) = LOWER(?)",
      [name]
    );
    if (result.affectedRows === 0)
      return res.status(404).json({ error: "Country not found" });
    return res.json({ ok: true });
  } catch (err) {
    return next(err);
  }
}

async function status(req, res, next) {
  try {
    const pool = db.getPool();
    const [[{ value: total }]] = await pool.query(
      "SELECT COUNT(*) as value FROM countries"
    );
    const [rows] = await pool.query(
      "SELECT value FROM metadata WHERE `key` = ?",
      ["last_refreshed_at"]
    );
    const last = rows.length ? rows[0].value : null;
    return res.json({
      total_countries: total || 0,
      last_refreshed_at: last || null,
    });
  } catch (err) {
    return next(err);
  }
}

async function getImage(req, res, next) {
  try {
    const pool = db.getPool();
    // fetch full rows including flag_url so image generator can draw flags
    const [rows] = await pool.query(
      "SELECT name, estimated_gdp, flag_url FROM countries WHERE estimated_gdp IS NOT NULL ORDER BY estimated_gdp DESC LIMIT 5"
    );

    const [[totalRow]] = await pool.query(
      "SELECT COUNT(*) AS total FROM countries"
    );
    const total = totalRow.total || 0;
    const timestamp = new Date();

    // Generate the image
    await generateSummaryImage({ total, top5: rows, timestamp });

    // Always serve the summary.png which is our consistent filename
    const imagePath = path.join(process.cwd(), "cache", "summary.png");
    const img = await fs.readFile(imagePath);

    res.setHeader("Content-Type", "image/png");
    res.send(img);
  } catch (err) {
    console.error("getImage error:", err);
    next(err);
  }
}

module.exports = { refresh, list, getOne, deleteOne, status, getImage };
