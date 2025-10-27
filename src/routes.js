const express = require("express");
const router = express.Router();
const ctrl = require("./controllers/countries");

router.post("/countries/refresh", ctrl.refresh);
router.get("/countries", ctrl.list);
router.get("/countries/image", ctrl.getImage);
router.get("/countries/:name", ctrl.getOne);
router.delete("/countries/:name", ctrl.deleteOne);
router.get("/status", ctrl.status);

module.exports = router;
