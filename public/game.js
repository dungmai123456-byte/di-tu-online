import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.160.0/build/three.module.js';
import { OrbitControls } from 'https://cdn.jsdelivr.net/npm/three@0.160.0/examples/jsm/controls/OrbitControls.js';

const socket = io();
const login = document.getElementById('login');
const game = document.getElementById('game');
const mount = document.getElementById('world');
const players = new Map();
const keys = new Set();
let myId = null, joined = false, scene, camera, renderer, clock, me;
let audioCtx = null, masterGain = null, ambienceTimer = null, soundOn = true, controls = null;
const WORLD_W = 840, WORLD_D = 600, movers = [];

// --- Âm thanh tạo trực tiếp bằng Web Audio, không cần tải tệp âm thanh ---
function startAudio(){
  if(!audioCtx){audioCtx=new (window.AudioContext||window.webkitAudioContext)();masterGain=audioCtx.createGain();masterGain.gain.value=.24;masterGain.connect(audioCtx.destination);}
  if(audioCtx.state==='suspended') audioCtx.resume();
  soundOn=true; masterGain.gain.setTargetAtTime(.24,audioCtx.currentTime,.2);
  if(!ambienceTimer){
    const drone=audioCtx.createOscillator(), filter=audioCtx.createBiquadFilter(), gain=audioCtx.createGain();
    drone.type='sine';drone.frequency.value=110;filter.type='lowpass';filter.frequency.value=260;gain.gain.value=.025;
    drone.connect(filter);filter.connect(gain);gain.connect(masterGain);drone.start();
    // Tiếng gió/nước rất nhẹ bằng nhiễu lọc tần số thấp.
    const noiseBuffer=audioCtx.createBuffer(1,audioCtx.sampleRate*2,audioCtx.sampleRate),noiseData=noiseBuffer.getChannelData(0);for(let i=0;i<noiseData.length;i++)noiseData[i]=Math.random()*2-1;
    const wind=audioCtx.createBufferSource(),windFilter=audioCtx.createBiquadFilter(),windGain=audioCtx.createGain();wind.buffer=noiseBuffer;wind.loop=true;windFilter.type='lowpass';windFilter.frequency.value=380;windGain.gain.value=.012;wind.connect(windFilter);windFilter.connect(windGain);windGain.connect(masterGain);wind.start();
    const stream=audioCtx.createBufferSource(),streamFilter=audioCtx.createBiquadFilter(),streamGain=audioCtx.createGain();stream.buffer=noiseBuffer;stream.loop=true;streamFilter.type='bandpass';streamFilter.frequency.value=900;streamFilter.Q.value=.4;streamGain.gain.value=.006;stream.connect(streamFilter);streamFilter.connect(streamGain);streamGain.connect(masterGain);stream.start();
    ambienceTimer=setInterval(()=>{if(soundOn)birdCall();},8500+Math.random()*6500);
    birdCall();
  }
  document.getElementById('soundToggle').textContent='🔊 Âm thanh: Bật';
}
function toggleSound(){if(!audioCtx)startAudio();else{soundOn=!soundOn;masterGain.gain.setTargetAtTime(soundOn?.24:0,audioCtx.currentTime,.15);document.getElementById('soundToggle').textContent=soundOn?'🔊 Âm thanh: Bật':'🔇 Âm thanh: Tắt';}}
function bell(){if(!audioCtx)startAudio();if(!soundOn)return;[0,1,2].forEach((n)=>{const o=audioCtx.createOscillator(),g=audioCtx.createGain();const t=audioCtx.currentTime+n*.12;o.type='sine';o.frequency.setValueAtTime(660-n*85,t);o.frequency.exponentialRampToValueAtTime(180,t+3.2);g.gain.setValueAtTime(.0001,t);g.gain.exponentialRampToValueAtTime(.22/(n+1),t+.025);g.gain.exponentialRampToValueAtTime(.0001,t+3.4);o.connect(g);g.connect(masterGain);o.start(t);o.stop(t+3.5);});}
function birdCall(){if(!audioCtx||!soundOn)return;for(let i=0;i<2;i++){const o=audioCtx.createOscillator(),g=audioCtx.createGain();const t=audioCtx.currentTime+i*.18;o.type='sine';o.frequency.setValueAtTime(1700+Math.random()*500,t);o.frequency.exponentialRampToValueAtTime(1150,t+.13);g.gain.setValueAtTime(.0001,t);g.gain.linearRampToValueAtTime(.045,t+.025);g.gain.exponentialRampToValueAtTime(.0001,t+.16);o.connect(g);g.connect(masterGain);o.start(t);o.stop(t+.17);}}
function footstep(){if(!audioCtx||!soundOn)return;const n=audioCtx.createBufferSource(),len=.07,buf=audioCtx.createBuffer(1,audioCtx.sampleRate*len,audioCtx.sampleRate),d=buf.getChannelData(0);for(let i=0;i<d.length;i++)d[i]=(Math.random()*2-1)*(1-i/d.length);n.buffer=buf;const f=audioCtx.createBiquadFilter(),g=audioCtx.createGain();f.type='lowpass';f.frequency.value=170;g.gain.value=.09;n.connect(f);f.connect(g);g.connect(masterGain);n.start();}
document.getElementById('soundToggle').addEventListener('click',toggleSound);
document.getElementById('bellButton').addEventListener('click',bell);

function mat(color,roughness=1){return new THREE.MeshStandardMaterial({color,roughness});}
function box(parent,w,h,d,x,y,z,material){const m=new THREE.Mesh(new THREE.BoxGeometry(w,h,d),material);m.position.set(x,y,z);m.castShadow=true;m.receiveShadow=true;parent.add(m);return m;}
function cylinder(parent,rt,rb,h,x,y,z,material,segments=12){const m=new THREE.Mesh(new THREE.CylinderGeometry(rt,rb,h,segments),material);m.position.set(x,y,z);m.castShadow=true;m.receiveShadow=true;parent.add(m);return m;}
function cone(parent,r,h,x,y,z,material,segments=4){const m=new THREE.Mesh(new THREE.ConeGeometry(r,h,segments),material);m.position.set(x,y,z);m.castShadow=true;parent.add(m);return m;}
function makeTree(x,z,scale=1){const g=new THREE.Group();g.position.set(x,0,z);g.scale.setScalar(scale);cylinder(g,.22,.34,2.3,0,1.15,0,mat('#75523b'),8);for(let i=0;i<5;i++){const crown=new THREE.Mesh(new THREE.IcosahedronGeometry(1.05-i*.09,1),mat(i%2?'#5e8d60':'#6f9d69'));crown.position.set((Math.random()-.5)*.8,2.2+i*.35,(Math.random()-.5)*.8);crown.castShadow=true;g.add(crown);}scene.add(g);}
function makeTemple(){const g=new THREE.Group();g.position.set(420,0,145);const cream=mat('#ead8b7'),red=mat('#9e4938'),dark=mat('#633b2e'),gold=mat('#d7b45e');
 box(g,210,72,130,0,36,0,cream);box(g,220,9,140,0,76,0,dark);box(g,18,66,12,-68,33,67,red);box(g,18,66,12,68,33,67,red);
 // mái nhiều tầng
 const roof1=new THREE.Mesh(new THREE.ConeGeometry(150,48,4),red);roof1.rotation.y=Math.PI/4;roof1.scale.z=.68;roof1.position.set(0,98,0);roof1.castShadow=true;g.add(roof1);
 const roof2=new THREE.Mesh(new THREE.ConeGeometry(112,36,4),mat('#b65b43'));roof2.rotation.y=Math.PI/4;roof2.scale.z=.7;roof2.position.set(0,125,0);roof2.castShadow=true;g.add(roof2);
 cylinder(g,2,2,30,0,151,0,gold,8);box(g,48,42,5,0,35,67,dark);box(g,10,38,7,-13,34,70,gold);box(g,10,38,7,13,34,70,gold);
 const sign=box(g,70,16,3,0,66,71,gold);sign.castShadow=false;
 for(let x of [-88,88]){cylinder(g,1.5,1.5,24,x,92,0,gold,8);}
 scene.add(g);
 // bậc tam cấp
 for(let i=0;i<3;i++)box(scene,125-i*12,3,16,420,2+i*2,78+i*12,mat('#b9a68b'));
}
function makeGate(){const g=new THREE.Group();g.position.set(420,0,465);const stone=mat('#d9c8a6'),roof=mat('#a34b39');for(let x of [-95,0,95])box(g,18,68,18,x,34,0,stone);box(g,220,12,28,0,72,0,roof);const r=new THREE.Mesh(new THREE.ConeGeometry(130,36,4),roof);r.rotation.y=Math.PI/4;r.scale.z=.42;r.position.y=94;g.add(r);box(g,58,36,4,0,35,12,mat('#704333'));scene.add(g);}
function makePond(){const water=new THREE.Mesh(new THREE.CylinderGeometry(75,75,2,48),mat('#6daeb0'));water.scale.z=.66;water.position.set(145,1,390);scene.add(water);const rim=new THREE.Mesh(new THREE.TorusGeometry(75,4,8,48),mat('#b6a889'));rim.rotation.x=Math.PI/2;rim.scale.z=.66;rim.position.set(145,2,390);scene.add(rim);for(let i=0;i<7;i++){const a=i*2.4;const x=145+Math.cos(a)*(22+i*6),z=390+Math.sin(a)*(15+i*4);const leaf=new THREE.Mesh(new THREE.CircleGeometry(9,8),mat('#548d5d'));leaf.rotation.x=-Math.PI/2;leaf.position.set(x,2.5,z);scene.add(leaf);const flower=new THREE.Mesh(new THREE.SphereGeometry(4,8,6),mat('#efb4c1'));flower.scale.y=.45;flower.position.set(x,4,z);scene.add(flower);}}
function makeLantern(x,z){const g=new THREE.Group();g.position.set(x,0,z);cylinder(g,1,1,26,0,13,0,mat('#75523b'),8);box(g,12,15,12,0,30,0,mat('#b94f3f'));box(g,15,3,15,0,39,0,mat('#d8b45e'));const light=new THREE.PointLight('#ffc979',.7,45);light.position.set(0,32,0);g.add(light);scene.add(g);}
function makeWorld(){
 scene=new THREE.Scene();scene.background=new THREE.Color('#b9d5d0');scene.fog=new THREE.Fog('#b9d5d0',650,1250);
 camera=new THREE.PerspectiveCamera(48,1,.1,2200);camera.position.set(420,560,850);camera.lookAt(420,0,300);
 controls=new OrbitControls(camera,mount);controls.target.set(420,0,300);controls.enableDamping=true;controls.maxPolarAngle=Math.PI/2.05;controls.minDistance=260;controls.maxDistance=1100;
 renderer=new THREE.WebGLRenderer({antialias:true});renderer.setPixelRatio(Math.min(devicePixelRatio,2));renderer.shadowMap.enabled=true;renderer.shadowMap.type=THREE.PCFSoftShadowMap;renderer.outputColorSpace=THREE.SRGBColorSpace;renderer.toneMapping=THREE.ACESFilmicToneMapping;mount.appendChild(renderer.domElement);
 scene.add(new THREE.HemisphereLight('#fff2d7','#6e806b',2));const sun=new THREE.DirectionalLight('#fff0d0',2.2);sun.position.set(-220,500,250);sun.castShadow=true;sun.shadow.mapSize.set(2048,2048);sun.shadow.camera.left=-600;sun.shadow.camera.right=600;sun.shadow.camera.top=600;sun.shadow.camera.bottom=-600;scene.add(sun);
 const grass=mat('#91ae7c');box(scene,WORLD_W,8,WORLD_D,420,-5,300,grass);
 // lối đi đá
 box(scene,120,2,500,420,0,300,mat('#c7b99d'));box(scene,390,2,70,420,0,300,mat('#c7b99d'));
 for(let z=220;z<430;z+=28)for(let x=350;x<490;x+=28)box(scene,24,.7,24,x,.8,z,mat('#d2c6ae'));
 makeTemple();makeGate();makePond();
 for(let i=0;i<22;i++){const x=35+(i*137)%770,z=35+(i*83)%520;if((x<275||x>565)&&Math.abs(z-300)>65)makeTree(x,z,.75+((i%4)*.12));}
 [[310,215],[530,215],[300,420],[540,420],[370,500],[470,500]].forEach(p=>makeLantern(...p));
 // bụi hoa dọc sân
 for(let i=0;i<38;i++){const x=20+(i*59)%800,z=30+(i*97)%540;if(x>270&&x<570&&z>90&&z<210)continue;const f=new THREE.Mesh(new THREE.SphereGeometry(3,6,5),mat(i%2?'#e9b2b6':'#e8d58e'));f.position.set(x,3,z);scene.add(f);}
 clock=new THREE.Clock();resize();window.addEventListener('resize',resize);renderer.domElement.addEventListener('pointerdown',onGroundClick);
 animate();
}
function resize(){if(!renderer)return;const w=mount.clientWidth,h=mount.clientHeight;renderer.setSize(w,h,false);camera.aspect=w/h;camera.updateProjectionMatrix();}
function makeMonk(color='#c98d52'){
 const g=new THREE.Group();const robe=mat(color),skin=mat('#e9bd98'),dark=mat('#44382e');
 cylinder(g,7,10,24,0,16,0,robe,10);const head=new THREE.Mesh(new THREE.SphereGeometry(7,14,12),skin);head.position.y=34;head.castShadow=true;g.add(head);
 // đầu cạo tóc và cổ áo
 const scalp=new THREE.Mesh(new THREE.SphereGeometry(7.1,14,10,0,Math.PI*2,0,Math.PI/2),mat('#57483b'));scalp.position.y=35;g.add(scalp);
 const sash=box(g,3,20,2,5,17,7,mat('#e2bd77'));sash.rotation.z=-.2;
 const armL=cylinder(g,2.5,2.5,15,-10,19,0,robe,8);armL.rotation.z=-.25;const armR=cylinder(g,2.5,2.5,15,10,19,0,robe,8);armR.rotation.z=.25;
 const legL=cylinder(g,3,3,9,-4,4,0,dark,8),legR=cylinder(g,3,3,9,4,4,0,dark,8);
 g.userData={robe,armL,armR,legL,legR};return g;
}
function addPlayer(p){if(players.has(p.id))return;const model=makeMonk(p.color);model.position.set(p.x,0,p.y);scene.add(model);const label=document.createElement('canvas');label.width=256;label.height=64;const c=label.getContext('2d');c.fillStyle='rgba(40,48,37,.72)';c.roundRect(8,8,240,48,18);c.fill();c.font='bold 25px system-ui';c.textAlign='center';c.fillStyle='white';c.fillText(p.name.slice(0,18),128,41);const tex=new THREE.CanvasTexture(label);const sprite=new THREE.Sprite(new THREE.SpriteMaterial({map:tex,transparent:true,depthTest:false}));sprite.scale.set(58,15,1);sprite.position.y=53;model.add(sprite);players.set(p.id,{...p,model,step:0});if(p.id===myId)me=players.get(p.id);}
function syncPlayer(p){let q=players.get(p.id);if(!q){addPlayer(p);q=players.get(p.id);}q.x=p.x;q.y=p.y;q.model.position.x=p.x;q.model.position.z=p.y;}
function removePlayer(id){const p=players.get(id);if(p){scene.remove(p.model);players.delete(id);}}
function addSystem(text){const el=document.createElement('div');el.className='system';el.textContent=text;document.getElementById('messages').appendChild(el);scrollMessages();}
function addMessage(m){const p=document.createElement('p'),time=document.createElement('small'),name=document.createElement('b');time.textContent=m.time+' ';name.textContent=m.name+': ';p.append(time,name,document.createTextNode(m.text));document.getElementById('messages').appendChild(p);scrollMessages();}
function scrollMessages(){const b=document.getElementById('messages');b.scrollTop=b.scrollHeight;}
function move(dx,dz){if(!me)return;const nx=THREE.MathUtils.clamp(me.x+dx,25,815),nz=THREE.MathUtils.clamp(me.y+dz,25,575);me.x=nx;me.y=nz;me.model.position.set(nx,0,nz);socket.emit('move',{x:nx,y:nz});me.step++;if(me.step%7===0)footstep();}
function onGroundClick(e){if(!joined)return;const rect=renderer.domElement.getBoundingClientRect(),mouse=new THREE.Vector2((e.clientX-rect.left)/rect.width*2-1,-((e.clientY-rect.top)/rect.height)*2+1);const ray=new THREE.Raycaster();ray.setFromCamera(mouse,camera);const ground=new THREE.Plane(new THREE.Vector3(0,1,0),0),point=new THREE.Vector3();if(ray.ray.intersectPlane(ground,point)){const dx=point.x-me.x,dz=point.z-me.y,steps=Math.max(1,Math.ceil(Math.hypot(dx,dz)/5));let i=0;const timer=setInterval(()=>{i++;move(dx/steps,dz/steps);if(i>=steps)clearInterval(timer);},45);}}
function animate(){requestAnimationFrame(animate);if(!renderer)return;const dt=Math.min(clock.getDelta(),.05);for(const p of players.values()){p.model.position.y=Math.sin(performance.now()*.004+p.x*.01)*.5;}if(controls)controls.update();renderer.render(scene,camera);}

socket.on('welcome',data=>{myId=data.id;data.players.forEach(addPlayer);document.getElementById('myScore').textContent=data.score||0;document.getElementById('myRank').textContent='Cấp bậc: '+(data.level||'Người mới nhập môn');renderLeaderboard(data.leaderboard||[]);addSystem('Bạn đã bước vào Chùa An Nhiên.');});
socket.on('playerJoined',p=>{addPlayer(p);addSystem(`${p.name} đã vào chùa.`);});
socket.on('playerMoved',p=>{const q=players.get(p.id);if(q){q.x=p.x;q.y=p.y;q.model.position.x=p.x;q.model.position.z=p.y;}});
socket.on('playerLeft',id=>{const p=players.get(id);if(p)addSystem(`${p.name} đã rời chùa.`);removePlayer(id);});
socket.on('onlineCount',n=>document.getElementById('onlineCount').textContent=n);
socket.on('chat',addMessage);
socket.on('actionResult',r=>{const n=document.getElementById('actionNotice');n.textContent=r.message;if(r.ok){document.getElementById('myScore').textContent=r.score;document.getElementById('myRank').textContent='Cấp bậc: '+r.level;}});
socket.on('leaderboardUpdate',renderLeaderboard);
function renderLeaderboard(rows){const el=document.getElementById('leaderboard');if(!el)return;el.innerHTML='';if(!rows.length){el.innerHTML='<li>Chưa có dữ liệu</li>';return;}rows.forEach(p=>{const li=document.createElement('li');li.textContent=`${p.name} · ${p.level}`;const score=document.createElement('span');score.textContent=`${p.score} điểm`;li.appendChild(score);el.appendChild(li);});}
socket.on('playerAction',r=>{if(r.id!==myId)addSystem(`${r.name} vừa ${r.label.toLowerCase()} (+${r.points} điểm).`);});
document.querySelectorAll('.activity-button').forEach(btn=>btn.addEventListener('click',()=>socket.emit('performAction',btn.dataset.action)));
document.getElementById('joinForm').addEventListener('submit',e=>{e.preventDefault();const name=document.getElementById('nameInput').value.trim()||'Hành giả';login.classList.add('hidden');game.classList.remove('hidden');joined=true;makeWorld();startAudio();socket.emit('join',name);});
document.getElementById('chatForm').addEventListener('submit',e=>{e.preventDefault();const input=document.getElementById('chatInput');if(input.value.trim())socket.emit('chat',input.value);input.value='';});
window.addEventListener('keydown',e=>{const k=e.key.toLowerCase();if(['arrowup','arrowdown','arrowleft','arrowright','w','a','s','d'].includes(k)&&!['INPUT','TEXTAREA'].includes(document.activeElement.tagName)){e.preventDefault();keys.add(k);}});
window.addEventListener('keyup',e=>keys.delete(e.key.toLowerCase()));
setInterval(()=>{if(!joined||!me)return;let dx=0,dz=0;if(keys.has('arrowup')||keys.has('w'))dz-=4;if(keys.has('arrowdown')||keys.has('s'))dz+=4;if(keys.has('arrowleft')||keys.has('a'))dx-=4;if(keys.has('arrowright')||keys.has('d'))dx+=4;if(dx||dz){const len=Math.hypot(dx,dz);move(dx/len*4,dz/len*4);}},50);
