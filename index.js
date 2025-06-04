require("dotenv").config();

const express = require("express");
const { Server } = require("socket.io");
const http = require("http");

const app = express();
const PORT = process.env.PORT || 3000;
const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"],
  },
});

require("./startups/db")();
require("./startups/prod")(app);
require("./startups/routes")(app);
require("./startups/socket")(io);

server.listen(PORT, () => console.log(`Server is running on port ${PORT}...`));
