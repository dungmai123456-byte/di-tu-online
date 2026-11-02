const express = require("express");
const http = require("http");
const fs = require("fs");
const path = require("path");
const { Server } = require("socket.io");
const app = express();
const server = http.createServer(app);
const io = new Server(server);
app.use(express.static("public"));

// File-based score storage. On Render's ephemeral filesystem this survives normal
// reconnects but may reset when the service is recreated/redeployed.
const DATA_FILE = process.env.DATA_FILE || path.join(__dirname, "data", "players.json");
fs.mkdirSync(path.dirname(DATA_FILE), { recursive: true });
let profiles = {};
try { profiles = JSON.parse(fs.readFileSync(DATA_FILE, "utf8")); } catch (_) { profiles = {}; }
function saveProfiles() { fs.writeFileSync(DATA_FILE, JSON.stringify(profiles, null, 2)); }
function keyFor(name) { return name.normalize("NFKC").trim().toLocaleLowerCase("vi"); }
function cleanName(value) { return String(value || "Hành giả").trim().slice(0, 18) || "Hành giả"; }
const ranks = [
  { name: "Người mới nhập môn", min: 0 },
  { name: "Chú tiểu", min: 50 },
  { name: "Sa di", min: 200 },
  { name: "Tăng sĩ", min: 500 },
  { name: "Hành giả tinh tấn", min: 1000 },
  { name: "Bậc tu tập", min: 2500 }
];
function rankFor(score) { return [...ranks].reverse().find(r => score >= r.min).name; }
function leaderboard() {
  return Object.values(profiles).sort((a,b) => b.score-a.score || a.name.localeCompare(b.name, "vi")).slice(0,10)
    .map((p,i) => ({ rank: i+1, name:p.name, score:p.score, level:rankFor(p.score) }));
}
const players = new Map();
const actionCooldowns = new Map();
const ACTIONS = {
  incense: { label: "Thắp hương", x: 420, z: 235, points: 5 },
  sutra: { label: "Tụng kinh", x: 420, z: 180, points: 5 },
  fish: { label: "Cho cá ăn", x: 145, z: 390, points: 5 },
  merit: { label: "Làm công đức", x: 420, z: 285, points: 5 }
};
const ACTION_RADIUS = 95;
const ACTION_COOLDOWN_MS = 10000;
io.on("connection", socket => {
  socket.on("join", rawName => {
    const name = cleanName(rawName), key = keyFor(name);
    if (!profiles[key]) profiles[key] = { name, score: 0 };
    else profiles[key].name = name;
    saveProfiles();
    const player = { id:socket.id, name, x:420+Math.random()*160, y:300+Math.random()*100,
      color:["#f3c969","#8bc6a5","#9eb9e8","#e9a6a6","#c6a4df"][Math.floor(Math.random()*5)] };
    players.set(socket.id, player);
    socket.data.profileKey = key;
    actionCooldowns.set(socket.id, {});
    socket.emit("welcome", { id:socket.id, players:[...players.values()], score:profiles[key].score,
      level:rankFor(profiles[key].score), leaderboard:leaderboard() });
    socket.broadcast.emit("playerJoined", player);
    io.emit("onlineCount", players.size);
  });
  socket.on("move", position => {
    const player=players.get(socket.id); if(!player || !position) return;
    player.x=Math.max(35,Math.min(805,Number(position.x)||player.x));
    player.y=Math.max(100,Math.min(565,Number(position.y)||player.y));
    socket.broadcast.emit("playerMoved",{id:socket.id,x:player.x,y:player.y});
  });
  socket.on("performAction", actionKey => {
    const player=players.get(socket.id), action=ACTIONS[String(actionKey||"")];
    if(!player || !action) return;
    if(Math.hypot(player.x-action.x,player.y-action.z)>ACTION_RADIUS) {
      socket.emit("actionResult",{ok:false,message:`Bạn cần đến gần khu vực ${action.label.toLowerCase()} hơn.`}); return;
    }
    const now=Date.now(), cooldowns=actionCooldowns.get(socket.id)||{};
    const remaining=ACTION_COOLDOWN_MS-(now-(cooldowns[actionKey]||0));
    if(remaining>0) { socket.emit("actionResult",{ok:false,message:`Vui lòng chờ ${Math.ceil(remaining/1000)} giây để thực hiện lại.`}); return; }
    cooldowns[actionKey]=now; actionCooldowns.set(socket.id,cooldowns);
    const profile=profiles[socket.data.profileKey]; if(!profile) return;
    profile.score+=action.points; saveProfiles();
    const score=profile.score, level=rankFor(score);
    io.emit("playerAction",{id:socket.id,name:player.name,action:actionKey,label:action.label,points:action.points,score,level});
    io.emit("leaderboardUpdate",leaderboard());
    socket.emit("actionResult",{ok:true,message:`${action.label}: +${action.points} điểm công đức.`,score,level});
  });
  socket.on("chat", message => {
    const player=players.get(socket.id); if(!player) return;
    const text=String(message||"").trim().slice(0,180);
    if(text) io.emit("chat",{name:player.name,text,time:new Date().toLocaleTimeString("vi-VN",{hour:"2-digit",minute:"2-digit"})});
  });
  socket.on("disconnect",()=>{
    if(players.delete(socket.id)){io.emit("playerLeft",socket.id);actionCooldowns.delete(socket.id);io.emit("onlineCount",players.size);}
  });
});
const PORT=process.env.PORT||3000;
server.listen(PORT,"0.0.0.0",()=>console.log(`Đi Tu Online running on ${PORT}`));
