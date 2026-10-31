"use client";
// The agent orb: a WebGL plasma sphere (three.js). Warm while idle or listening, cool while thinking.
// While listening it breathes with the microphone level (voiceLevel).
import { useEffect, useRef } from "react";
import { voiceLevel } from "./use-voice-input";

export type OrbMode = "idle" | "listening" | "thinking";

const NOISE = `
vec3 mod289(vec3 x){return x-floor(x*(1./289.))*289.;}
vec4 mod289(vec4 x){return x-floor(x*(1./289.))*289.;}
vec4 permute(vec4 x){return mod289(((x*34.)+1.)*x);}
vec4 taylorInvSqrt(vec4 r){return 1.79284291400159-0.85373472095314*r;}
float snoise(vec3 v){
 const vec2 C=vec2(1./6.,1./3.);const vec4 D=vec4(0.,.5,1.,2.);
 vec3 i=floor(v+dot(v,C.yyy));vec3 x0=v-i+dot(i,C.xxx);
 vec3 g=step(x0.yzx,x0.xyz);vec3 l=1.-g;vec3 i1=min(g.xyz,l.zxy);vec3 i2=max(g.xyz,l.zxy);
 vec3 x1=x0-i1+C.xxx;vec3 x2=x0-i2+C.yyy;vec3 x3=x0-D.yyy;
 i=mod289(i);
 vec4 p=permute(permute(permute(i.z+vec4(0.,i1.z,i2.z,1.))+i.y+vec4(0.,i1.y,i2.y,1.))+i.x+vec4(0.,i1.x,i2.x,1.));
 float n_=0.142857142857;vec3 ns=n_*D.wyz-D.xzx;
 vec4 j=p-49.*floor(p*ns.z*ns.z);vec4 x_=floor(j*ns.z);vec4 y_=floor(j-7.*x_);
 vec4 x=x_*ns.x+ns.yyyy;vec4 y=y_*ns.x+ns.yyyy;vec4 h=1.-abs(x)-abs(y);
 vec4 b0=vec4(x.xy,y.xy);vec4 b1=vec4(x.zw,y.zw);
 vec4 s0=floor(b0)*2.+1.;vec4 s1=floor(b1)*2.+1.;vec4 sh=-step(h,vec4(0.));
 vec4 a0=b0.xzyw+s0.xzyw*sh.xxyy;vec4 a1=b1.xzyw+s1.xzyw*sh.zzww;
 vec3 p0=vec3(a0.xy,h.x);vec3 p1=vec3(a0.zw,h.y);vec3 p2=vec3(a1.xy,h.z);vec3 p3=vec3(a1.zw,h.w);
 vec4 norm=taylorInvSqrt(vec4(dot(p0,p0),dot(p1,p1),dot(p2,p2),dot(p3,p3)));
 p0*=norm.x;p1*=norm.y;p2*=norm.z;p3*=norm.w;
 vec4 m=max(.6-vec4(dot(x0,x0),dot(x1,x1),dot(x2,x2),dot(x3,x3)),0.);m=m*m;
 return 42.*dot(m*m,vec4(dot(p0,x0),dot(p1,x1),dot(p2,x2),dot(p3,x3)));
}`;
const VERT = `${NOISE}
uniform float uTime;uniform float uLevel;varying vec3 vN;varying vec3 vV;varying float vD;
void main(){
 float t=uTime*.32;
 float n=snoise(normal*1.4+vec3(t,t*.8,-t));
 float n2=snoise(normal*3.2-vec3(t*1.6));
 float d=n*(.06+uLevel*.30)+n2*(.015+uLevel*.09);
 vec3 p=position+normal*d;vD=d;
 vN=normalize(normalMatrix*normal);
 vec4 mv=modelViewMatrix*vec4(p,1.);vV=normalize(-mv.xyz);
 gl_Position=projectionMatrix*mv;
}`;
const FRAG = `
uniform float uTime;uniform float uLevel;uniform float uMode;varying vec3 vN;varying vec3 vV;varying float vD;
void main(){
 vec3 N=normalize(vN);float facing=max(dot(N,vV),0.);
 float fres=pow(1.-facing,2.4);
 float k=.5+.5*sin(vD*22.+uTime*.9+N.y*2.4+N.x*1.3);
 vec3 warm=mix(vec3(1.,.62,.24),vec3(1.,.30,.48),k);
 vec3 cool=mix(vec3(.50,.36,1.),vec3(.28,.78,1.),k);
 vec3 col=mix(warm,cool,uMode);
 float core=pow(facing,4.);
 vec3 c=col*(.10+fres*1.9)+mix(vec3(1.,.9,.75),vec3(.85,.9,1.),uMode)*core*(.18+uLevel*1.1)+col*core*.35;
 gl_FragColor=vec4(c,clamp(.35+fres*.9+core*.4,0.,1.));
}`;

const MODE_VALUE: Record<OrbMode, number> = { idle: 0, listening: 0, thinking: 1 };
const WARM_GLOW = "radial-gradient(circle, rgba(255,170,80,0.30), rgba(240,80,140,0.10) 38%, transparent 66%)";
const COOL_GLOW = "radial-gradient(circle, rgba(120,110,255,0.28), rgba(60,180,255,0.10) 38%, transparent 66%)";

export function Orb({ mode, className }: { mode: OrbMode; className?: string }) {
  const host = useRef<HTMLDivElement>(null);
  const glow = useRef<HTMLDivElement>(null);
  const modeRef = useRef(mode);
  useEffect(() => {
    modeRef.current = mode;
  }, [mode]);

  useEffect(() => {
    let alive = true;
    let raf = 0;
    let cleanup = () => {};
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    void import("three").then((T) => {
      const el = host.current;
      if (!alive || !el) return;
      let r: InstanceType<typeof T.WebGLRenderer>;
      try {
        r = new T.WebGLRenderer({ antialias: true, alpha: true, premultipliedAlpha: false });
      } catch {
        return; // no WebGL: the glow alone still reads as the orb
      }
      r.setPixelRatio(Math.min(2, devicePixelRatio));
      Object.assign(r.domElement.style, { position: "absolute", inset: "0", width: "100%", height: "100%" });
      el.appendChild(r.domElement);
      const scene = new T.Scene();
      const cam = new T.PerspectiveCamera(32, 1, 0.1, 50);
      cam.position.z = 4.6;
      const u = { uTime: { value: 0 }, uLevel: { value: 0.1 }, uMode: { value: MODE_VALUE[modeRef.current] } };
      const mesh = new T.Mesh(
        new T.IcosahedronGeometry(1, 48),
        new T.ShaderMaterial({ uniforms: u, vertexShader: VERT, fragmentShader: FRAG, transparent: true, depthWrite: false }),
      );
      scene.add(mesh);
      const N = 700;
      const pos = new Float32Array(N * 3);
      for (let i = 0; i < N; i++) {
        const z = Math.random() * 2 - 1;
        const th = Math.random() * Math.PI * 2;
        const rad = 1.25 + Math.random() * 0.45;
        const s = Math.sqrt(1 - z * z);
        pos.set([rad * s * Math.cos(th), rad * z, rad * s * Math.sin(th)], i * 3);
      }
      const pg = new T.BufferGeometry();
      pg.setAttribute("position", new T.BufferAttribute(pos, 3));
      const pm = new T.PointsMaterial({ size: 0.012, color: 0xffd9a8, transparent: true, opacity: 0.4, blending: T.AdditiveBlending, depthWrite: false });
      const pts = new T.Points(pg, pm);
      scene.add(pts);

      const size = () => {
        const w = el.clientWidth || 100;
        const h = el.clientHeight || 100;
        r.setSize(w, h, false);
        cam.aspect = w / h;
        cam.updateProjectionMatrix();
      };
      const ro = new ResizeObserver(size);
      ro.observe(el);
      size();

      let lv = 0.1;
      let md = u.uMode.value;
      const t0 = performance.now();
      const loop = () => {
        raf = requestAnimationFrame(loop);
        const t = (performance.now() - t0) / 1000;
        const m = modeRef.current;
        const target = m === "thinking" ? 0.22 + 0.08 * Math.sin(t * 2.2) : m === "listening" ? voiceLevel.current : 0.1 + 0.05 * Math.sin(t / 1.1);
        lv += (target - lv) * 0.12;
        md += (MODE_VALUE[m] - md) * 0.04;
        const speed = reduce ? 0.2 : m === "thinking" ? 2.2 : 1;
        u.uTime.value += 0.016 * speed * (1 + lv * 2);
        u.uLevel.value = lv;
        u.uMode.value = md;
        mesh.rotation.y = t * 0.12 * speed;
        mesh.rotation.x = Math.sin(t * 0.2) * 0.2;
        pts.rotation.y = -t * (0.05 + lv * 0.2);
        pts.rotation.z = t * 0.03;
        pts.scale.setScalar(1 + lv * 0.25);
        pm.opacity = 0.18 + lv * 0.6;
        pm.color.setRGB(1 - md * 0.35, 0.85, 0.66 + md * 0.34);
        if (glow.current) {
          glow.current.style.transform = `scale(${0.85 + lv * 0.5})`;
          glow.current.style.opacity = String(0.45 + lv * 0.9);
          glow.current.style.background = md > 0.5 ? COOL_GLOW : WARM_GLOW;
        }
        r.render(scene, cam);
      };
      loop();
      cleanup = () => {
        cancelAnimationFrame(raf);
        ro.disconnect();
        r.dispose();
        r.forceContextLoss();
        r.domElement.remove();
      };
    });
    return () => {
      alive = false;
      cleanup();
    };
  }, []);

  return (
    <div ref={host} className={`relative ${className ?? ""}`} aria-hidden="true">
      <div ref={glow} className="pointer-events-none absolute -inset-[40%] rounded-full" style={{ background: WARM_GLOW, transition: "background 1.2s" }} />
    </div>
  );
}
