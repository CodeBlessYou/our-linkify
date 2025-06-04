const mongoose = require("mongoose");
const logger = require("../config/logger");

module.exports = function () {
  mongoose
    .connect(process.env.DB)
    .then(() => console.log("MongoDB connected successfully!"))
    .catch((err) => {
      logger.error("MongoDB Connection Failed", err);
      logger.on("finish", () => {
        process.exit(1);
      });
      logger.end();
    });
};
