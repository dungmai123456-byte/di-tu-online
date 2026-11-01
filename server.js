const express = require("express");
const http = require("http");
const { Server } = require("socket.io");

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.static("public"));

const players = new Map();
const cleanName = (value) => String(value || "Hành giả").trim().slice(0, 18) || "Hành giả";

io.on("connection", (socket) => {
  socket.on("join", (rawName) => {
    const name = cleanName(rawName);
    const player = {
      id: socket.id,
      name,
      x: 420 + Math.random() * 160,
      y: 300 + Math.random() * 100,
      color: ["#f3c969", "#8bc6a5", "#9eb9e8", "#e9a6a6", "#c6a4df"][Math.floor(Math.random() * 5)]
    };
    players.set(socket.id, player);
    socket.emit("welcome", { id: socket.id, players: [...players.values()] });
    socket.broadcast.emit("playerJoined", player);
    io.emit("onlineCount", players.size);
  });

  socket.on("move", (position) => {
    const player = players.get(socket.id);
    if (!player || !position) return;
    player.x = Math.max(35, Math.min(805, Number(position.x) || player.x));
    player.y = Math.max(100, Math.min(565, Number(position.y) || player.y));
    socket.broadcast.emit("playerMoved", { id: socket.id, x: player.x, y: player.y });
  });

  socket.on("chat", (message) => {
    const player = players.get(socket.id);
    if (!player) return;
    const text = String(message || "").trim().slice(0, 180);
    if (text) io.emit("chat", { name: player.name, text, time: new Date().toLocaleTimeString("vi-VN", {hour:"2-digit", minute:"2-digit"}) });
  });

  socket.on("disconnect", () => {
    if (players.delete(socket.id)) {
      io.emit("playerLeft", socket.id);
      io.emit("onlineCount", players.size);
    }
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, "0.0.0.0", () => console.log(`Đi Tu Online running on ${PORT}`));