require("winston-mongodb");
const winston = require("winston");

const logger = winston.createLogger({
  level: "info",
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.json()
  ),
  transports: [
    new winston.transports.Console({ level: "debug" }),
    new winston.transports.File({
      filename: "logs/errors.log",
      level: "error",
    }),
    new winston.transports.MongoDB({
      db: process.env.DB,
      level: "error",
    }),
  ],
});

// Catch unhandled synchronours errors that weren't caught in try-catch blocks
process.on("uncaughtException", (err) => {
  logger.error("Uncaught Exception", err);
  logger.on("finish", () => {
    process.exit(1);
  });
  logger.end();
});

// Catch unhandled promise rejection
process.on("unhandledRejection", (err) => {
  logger.error("Unhandled Promise Rejection", err);
  logger.on("finish", () => {
    process.exit(1);
  });
  logger.end();
});

module.exports = logger;
