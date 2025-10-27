require("dotenv").config();
const express = require("express");
const morgan = require("morgan");
const routes = require("./routes");
const db = require("./db");

const app = express();
app.use(express.json());
app.use(morgan("dev"));

app.use("/", routes);

// JSON error handler
app.use((err, req, res, next) => {
  console.error(err);
  if (res.headersSent) return next(err);
  if (err.status && err.message)
    return res
      .status(err.status)
      .json({ error: err.message, details: err.details || undefined });
  res.status(500).json({ error: "Internal server error" });
});

const PORT = process.env.PORT || 3000;

(async () => {
  try {
    await db.init();
    app.listen(PORT, () => console.log(`Server listening on port ${PORT}`));
  } catch (err) {
    console.error("Failed to initialize DB", err);
    process.exit(1);
  }
})();
