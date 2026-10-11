'use client';
import { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import type { SystemGraph, SystemNode } from '@/lib/system-graph';

const colors:Record<string,number>={brain:0xe9ff3b,system:0x91caff,model:0xbba0ff,bot:0x45d9bc,module:0xffae75};
export function SystemVisualization() {
  const mount=useRef<HTMLDivElement>(null);
  const graphRef=useRef<SystemGraph|null>(null);
  const signatureRef=useRef('');
  const [graph,setGraph]=useState<SystemGraph|null>(null);
  const [selected,setSelected]=useState<SystemNode|null>(null);
  const [error,setError]=useState('');
  useEffect(()=>{
    let stopped=false;
    let timer:ReturnType<typeof setTimeout>;
    const poll=async()=>{try{if(document.hidden)return;const r=await fetch('/api/system',{cache:'no-store',signal:AbortSignal.timeout(6000)});if(!r.ok)throw Error('System snapshot unavailable');const data=await r.json();if(!stopped){signatureRef.current=JSON.stringify([data.nodes,data.links]);graphRef.current=data;setGraph(data);setError('');}}catch(e){if(!stopped)setError(String(e));}finally{if(!stopped)timer=setTimeout(poll,4000);}};
    void poll();return()=>{stopped=true;clearTimeout(timer);};
  },[]);
  useEffect(()=>{
    const host=mount.current;if(!host)return;
    let renderer:THREE.WebGLRenderer;
    try{renderer=new THREE.WebGLRenderer({antialias:true,alpha:false});}catch{setError('3D rendering is unavailable on this device. Live system data remains available below.');return;}
    renderer.setPixelRatio(Math.min(devicePixelRatio,1.5));renderer.setClearColor(0x080b16);host.appendChild(renderer.domElement);
    const scene=new THREE.Scene();scene.fog=new THREE.FogExp2(0x080b16,.019);
    const camera=new THREE.PerspectiveCamera(48,1,.1,150);camera.position.set(0,6,33);
    const controls=new OrbitControls(camera,renderer.domElement);controls.enableDamping=true;controls.target.set(0,1,0);controls.minDistance=9;controls.maxDistance=45;
    scene.add(new THREE.AmbientLight(0xffffff,1.7));const light=new THREE.PointLight(0xe9ff3b,30);light.position.set(0,5,5);scene.add(light);
    const stars=new Float32Array(1800);for(let i=0;i<stars.length;i++){stars[i]=(Math.sin(i*127.1)*43758.5453%1)*55;}
    const starsGeometry=new THREE.BufferGeometry();starsGeometry.setAttribute('position',new THREE.BufferAttribute(stars,3));scene.add(new THREE.Points(starsGeometry,new THREE.PointsMaterial({color:0x8495b4,size:.045,transparent:true,opacity:.5})));
    let group=new THREE.Group();scene.add(group);let signature='';let dirty=true;const clickable:THREE.Object3D[]=[];const pulses:THREE.Object3D[]=[];
    const dispose=(g:THREE.Object3D)=>g.traverse((o:any)=>{o.geometry?.dispose();if(o.material)for(const m of Array.isArray(o.material)?o.material:[o.material]){m.map?.dispose();m.dispose();}});
    const label=(text:string,color:string)=>{const canvas=document.createElement('canvas');canvas.width=512;canvas.height=80;const ctx=canvas.getContext('2d')!;ctx.fillStyle=color;ctx.font='27px system-ui';ctx.textAlign='center';ctx.fillText(text.slice(0,37),256,45);const texture=new THREE.CanvasTexture(canvas);const sprite=new THREE.Sprite(new THREE.SpriteMaterial({map:texture,transparent:true,depthTest:false}));sprite.scale.set(3.6,.56,1);return sprite;};
    const rebuild=(data:SystemGraph)=>{
      scene.remove(group);dispose(group);group=new THREE.Group();scene.add(group);clickable.length=0;pulses.length=0;dirty=true;
      const byId=new Map(data.nodes.map(n=>[n.id,n]));
      for(const center of data.nodes.filter(n=>n.kind==='brain'||n.kind==='system')){
        const points:number[]=[];const fibers:THREE.Vector3[]=[];
        const size=center.kind==='brain'?1.8:1.3;
        for(let i=0;i<520;i++){const angle=i*2.399963,level=1-2*(i+.5)/520;const radius=Math.sqrt(1-level*level);const lobe=i%2?1:-1;const p=new THREE.Vector3(lobe*(.3+Math.abs(Math.cos(angle))*radius)*size,level*size*.76,Math.sin(angle)*radius*size*.85);p.add(new THREE.Vector3(...center.position));points.push(p.x,p.y,p.z);if(i%5===0){fibers.push(p,new THREE.Vector3(...center.position));}}
        const neuralGeometry=new THREE.BufferGeometry();neuralGeometry.setAttribute('position',new THREE.Float32BufferAttribute(points,3));group.add(new THREE.Points(neuralGeometry,new THREE.PointsMaterial({color:center.id==='brain'?0xe9ff3b:center.id==='micky'?0x45d9bc:0xbba0ff,size:.04,transparent:true,opacity:.65})));
        group.add(new THREE.LineSegments(new THREE.BufferGeometry().setFromPoints(fibers),new THREE.LineBasicMaterial({color:center.id==='brain'?0xe9ff3b:0x6585af,transparent:true,opacity:.1})));
      }
      for(const n of data.nodes){const radius=n.kind==='brain'?.85:n.kind==='system'?.55:n.kind==='model'?.3:.16;const mesh=new THREE.Mesh(new THREE.IcosahedronGeometry(radius,n.kind==='brain'?2:1),new THREE.MeshStandardMaterial({color:colors[n.kind],emissive:colors[n.kind],emissiveIntensity:n.status==='active'?.7:.18,wireframe:n.kind==='brain'||n.kind==='system',roughness:.4,transparent:true,opacity:n.kind==='brain'?.35:.8}));mesh.position.set(...n.position);mesh.userData.node=n;group.add(mesh);clickable.push(mesh);if(n.kind!=='bot'){const caption=label(n.label,n.kind==='brain'?'#e9ff3b':'#b8c9e1');caption.position.copy(mesh.position).add(new THREE.Vector3(0,-radius-.45,0));group.add(caption);}}
      for(const edge of data.links){const a=byId.get(edge.source),b=byId.get(edge.target);if(!a||!b)continue;const geometry=new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(...a.position),new THREE.Vector3(...b.position)]);const line=new THREE.Line(geometry,new THREE.LineBasicMaterial({color:edge.active?0xe9ff3b:0x486080,transparent:true,opacity:edge.active?.75:.25}));group.add(line);if(edge.active){const pulse=new THREE.Mesh(new THREE.SphereGeometry(.065,8,8),new THREE.MeshBasicMaterial({color:0xe9ff3b}));pulse.userData.path={a:new THREE.Vector3(...a.position),b:new THREE.Vector3(...b.position)};group.add(pulse);}}
    };
    const resize=new ResizeObserver(()=>{dirty=true;const w=host.clientWidth,h=host.clientHeight;renderer.setSize(w,h);camera.aspect=w/Math.max(h,1);camera.updateProjectionMatrix();});resize.observe(host);
    const ray=new THREE.Raycaster();const click=(e:MouseEvent)=>{const rect=renderer.domElement.getBoundingClientRect();ray.setFromCamera(new THREE.Vector2((e.clientX-rect.left)/rect.width*2-1,-(e.clientY-rect.top)/rect.height*2+1),camera);const hit=ray.intersectObjects(clickable)[0];if(hit)setSelected(hit.object.userData.node);};renderer.domElement.addEventListener('click',click);
    controls.addEventListener('change',()=>{dirty=true;});
    let frame=0,lastPaint=0;const animate=(time:number)=>{frame=requestAnimationFrame(animate);if(document.hidden)return;const data=graphRef.current;if(data&&signatureRef.current!==signature){signature=signatureRef.current;rebuild(data);group.traverse(o=>{if(o.userData.path)pulses.push(o);});}controls.update();if(!dirty&&(!pulses.length||time-lastPaint<33))return;for(const pulse of pulses){const path=pulse.userData.path;pulse.position.lerpVectors(path.a,path.b,(time/2500)%1);}renderer.render(scene,camera);lastPaint=time;dirty=false;};frame=requestAnimationFrame(animate);
    return()=>{cancelAnimationFrame(frame);resize.disconnect();controls.dispose();renderer.domElement.removeEventListener('click',click);dispose(scene);renderer.dispose();renderer.domElement.remove();};
  },[]);
  return <div className="flex flex-col h-full min-h-0 bg-[#080b16]">
    <div className="px-6 py-4 border-b border-white/10 flex items-center justify-between"><div><h1 className="font-semibold text-lg">Visualization</h1><p className="text-xs text-slate-400">Live system map · drag to orbit · scroll to zoom · select a node</p></div><span className="text-xs text-lime-200">{graph?.counts.running??0} running · {graph?.counts.models??0} models · {graph?.counts.bots??0} bots</span></div>
    <div className="relative flex-1 min-h-[300px]"><div ref={mount} className="absolute inset-0" aria-label="3D map of models, Micky and OpenMausBot"/>{selected&&<div className="absolute top-4 right-4 w-64 p-4 rounded-xl bg-slate-950/90 border border-white/15"><button className="float-right text-slate-400" onClick={()=>setSelected(null)} aria-label="Close node details">×</button><p className="font-medium">{selected.label}</p><p className="text-xs text-lime-200 mt-2">{selected.status}</p><p className="text-xs text-slate-400 mt-2">{selected.detail}</p></div>}<div className="absolute bottom-3 left-5 text-xs text-slate-400">Connections show configured roles and observed task state—not model weights or inferred thought.</div></div>
    <div className="px-6 py-3 border-t border-white/10 text-xs flex flex-wrap gap-6"><span>● Micky connected</span><span className={graph?.openmaus.ready?'text-teal-300':'text-amber-300'}>● OpenMausBot {graph?.openmaus.ready?'connected':'offline'}</span>{graph?.workspaces.map(workspace=><span key={workspace.id} className={workspace.ready?'text-teal-300':'text-amber-300'}>● {workspace.label} {workspace.ready?'connected':'offline'}</span>)}<span>{graph?new Date(graph.at).toLocaleTimeString():'Connecting…'}</span>{error&&<span className="text-amber-300">{error}</span>}</div>
    <div className="max-h-28 overflow-auto px-6 pb-3 text-xs text-slate-400">{graph?.events.slice(0,5).map(e=><div key={e.id} className="py-1 truncate"><span className="text-slate-200 mr-3">{e.status}</span>{e.text}</div>)}</div>
  </div>;
}
