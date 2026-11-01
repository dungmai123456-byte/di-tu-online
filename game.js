const socket = io();
const login = document.getElementById("login");
const game = document.getElementById("game");
const canvas = document.getElementById("world");
const ctx = canvas.getContext("2d");
const players = new Map();
let myId = null;
let joined = false;
let target = null;
const keys = new Set();

document.getElementById("joinForm").addEventListener("submit", (e) => {
  e.preventDefault();
  const name = document.getElementById("nameInput").value.trim() || "Hành giả";
  socket.emit("join", name);
  login.classList.add("hidden");
  game.classList.remove("hidden");
  joined = true;
});

socket.on("welcome", data => {
  myId = data.id;
  data.players.forEach(p => players.set(p.id, p));
  addSystem("Bạn đã bước vào Chùa An Nhiên.");
  draw();
});
socket.on("playerJoined", p => { players.set(p.id,p); addSystem(`${p.name} đã vào chùa.`); draw(); });
socket.on("playerMoved", p => { const old=players.get(p.id); if(old){old.x=p.x;old.y=p.y;draw();} });
socket.on("playerLeft", id => { const p=players.get(id); if(p)addSystem(`${p.name} đã rời chùa.`); players.delete(id); draw(); });
socket.on("onlineCount", n => document.getElementById("onlineCount").textContent=n);
socket.on("chat", m => addMessage(m));

function addSystem(text){const el=document.createElement("div");el.className="system";el.textContent=text;document.getElementById("messages").appendChild(el);scrollMessages();}
function addMessage(m){const p=document.createElement("p");const time=document.createElement("small");time.textContent=m.time+" ";const name=document.createElement("b");name.textContent=m.name+": ";p.append(time,name,document.createTextNode(m.text));document.getElementById("messages").appendChild(p);scrollMessages();}
function scrollMessages(){const box=document.getElementById("messages");box.scrollTop=box.scrollHeight;}
document.getElementById("chatForm").addEventListener("submit",e=>{e.preventDefault();const input=document.getElementById("chatInput");if(input.value.trim())socket.emit("chat",input.value);input.value="";});

function draw(){
  if(!joined)return;
  ctx.clearRect(0,0,840,600);
  ctx.fillStyle="#dce9d3";ctx.fillRect(0,0,840,600);
  // garden paths
  ctx.fillStyle="#c9b99a";ctx.fillRect(0,260,840,100);ctx.fillRect(365,80,110,440);
  ctx.fillStyle="#b5d0a8";
  for(let i=0;i<18;i++){const x=(i*97+30)%820,y=(i*71+25)%580;if((x<330||x>510)&&(y<245||y>375)){ctx.beginPath();ctx.arc(x,y,13,0,Math.PI*2);ctx.fill();}}
  // temple
  ctx.fillStyle="#e9d7b5";ctx.fillRect(290,55,260,150);
  ctx.fillStyle="#a94f3e";ctx.beginPath();ctx.moveTo(270,90);ctx.lineTo(420,20);ctx.lineTo(570,90);ctx.closePath();ctx.fill();
  ctx.fillStyle="#f4d58c";ctx.fillRect(315,105,210,100);
  ctx.fillStyle="#7d4938";ctx.fillRect(390,135,60,70);
  ctx.fillStyle="#fff2cf";ctx.font="bold 18px sans-serif";ctx.textAlign="center";ctx.fillText("CHÙA AN NHIÊN",420,122);
  ctx.fillStyle="#fff";ctx.font="14px sans-serif";ctx.fillText("🪷",420,178);
  // pond
  ctx.fillStyle="#9dcbd0";ctx.beginPath();ctx.ellipse(120,455,75,43,0,0,Math.PI*2);ctx.fill();
  ctx.fillStyle="#f0a8bd";for(let i=0;i<4;i++){ctx.beginPath();ctx.arc(90+i*20,445+(i%2)*18,6,0,Math.PI*2);ctx.fill();}
  // players
  for(const p of players.values()){
    ctx.fillStyle="#00000020";ctx.beginPath();ctx.ellipse(p.x,p.y+17,15,5,0,0,Math.PI*2);ctx.fill();
    ctx.fillStyle=p.color;ctx.beginPath();ctx.arc(p.x,p.y,13,0,Math.PI*2);ctx.fill();
    ctx.fillStyle="#3f3028";ctx.beginPath();ctx.arc(p.x,p.y-3,8,Math.PI,Math.PI*2);ctx.fill();
    ctx.fillStyle="#fff";ctx.font="12px sans-serif";ctx.textAlign="center";ctx.fillText(p.name,p.x,p.y-23);
    if(p.id===myId){ctx.strokeStyle="#fff";ctx.lineWidth=2;ctx.beginPath();ctx.arc(p.x,p.y,16,0,Math.PI*2);ctx.stroke();}
  }
}
function move(dx,dy){const p=players.get(myId);if(!p)return;p.x=Math.max(25,Math.min(815,p.x+dx));p.y=Math.max(95,Math.min(575,p.y+dy));socket.emit("move",{x:p.x,y:p.y});draw();}
window.addEventListener("keydown",e=>{if(["ArrowUp","ArrowDown","ArrowLeft","ArrowRight","w","a","s","d"].includes(e.key.toLowerCase())){e.preventDefault();keys.add(e.key.toLowerCase());}});
window.addEventListener("keyup",e=>keys.delete(e.key.toLowerCase()));
setInterval(()=>{if(!joined)return;let dx=0,dy=0;if(keys.has("arrowup")||keys.has("w"))dy-=5;if(keys.has("arrowdown")||keys.has("s"))dy+=5;if(keys.has("arrowleft")||keys.has("a"))dx-=5;if(keys.has("arrowright")||keys.has("d"))dx+=5;if(dx||dy)move(dx,dy);},50);
canvas.addEventListener("click",e=>{const r=canvas.getBoundingClientRect();const x=(e.clientX-r.left)*canvas.width/r.width,y=(e.clientY-r.top)*canvas.height/r.height;const p=players.get(myId);if(!p)return;const dx=x-p.x,dy=y-p.y;const steps=Math.max(1,Math.ceil(Math.hypot(dx,dy)/5));let i=0;const timer=setInterval(()=>{i++;move(dx/steps,dy/steps);if(i>=steps)clearInterval(timer);},50);});
draw();