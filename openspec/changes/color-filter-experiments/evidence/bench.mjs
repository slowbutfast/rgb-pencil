const D=Math.PI/180;
function d2000(L1,a1,b1,L2,a2,b2){
  const C1=Math.hypot(a1,b1),C2=Math.hypot(a2,b2),Cb=(C1+C2)/2,Cb7=Cb**7;
  const G=0.5*(1-Math.sqrt(Cb7/(Cb7+6103515625)));
  const a1p=(1+G)*a1,a2p=(1+G)*a2,C1p=Math.hypot(a1p,b1),C2p=Math.hypot(a2p,b2);
  const h=(a,b)=>(a||b)?((Math.atan2(b,a)/D)+360)%360:0;
  const h1=h(a1p,b1),h2=h(a2p,b2);
  const dL=L2-L1,dC=C2p-C1p; let dh=0;
  if(C1p*C2p!==0){dh=h2-h1; if(dh>180)dh-=360; else if(dh<-180)dh+=360;}
  const dH=2*Math.sqrt(C1p*C2p)*Math.sin(dh*D/2);
  const Lb=(L1+L2)/2,Cbp=(C1p+C2p)/2; let hb;
  if(C1p*C2p===0)hb=h1+h2; else hb=Math.abs(h1-h2)<=180?(h1+h2)/2:(h1+h2<360?(h1+h2+360)/2:(h1+h2-360)/2);
  const T=1-.17*Math.cos((hb-30)*D)+.24*Math.cos(2*hb*D)+.32*Math.cos((3*hb+6)*D)-.2*Math.cos((4*hb-63)*D);
  const dth=30*Math.exp(-(((hb-275)/25)**2)),Cp7=Cbp**7,Rc=2*Math.sqrt(Cp7/(Cp7+6103515625));
  const Sl=1+.015*(Lb-50)**2/Math.sqrt(20+(Lb-50)**2),Sc=1+.045*Cbp,Sh=1+.015*Cbp*T,Rt=-Math.sin(2*dth*D)*Rc;
  const x=dL/Sl,y=dC/Sc,z=dH/Sh; return Math.sqrt(x*x+y*y+z*z+Rt*y*z);
}
const N=125, cands=new Float64Array(N*3); for(let i=0;i<N*3;i++)cands[i]=(Math.random()*100)*(i%3===0?1:1)-(i%3?50:0);
function search(t){let best=1e9,bi=0;for(let i=0;i<N;i++){const d=d2000(t[0],t[1],t[2],cands[i*3],cands[i*3+1],cands[i*3+2]);if(d<best){best=d;bi=i}}return bi}
const cells=6912; const ts=[];for(let i=0;i<cells;i++)ts.push([Math.random()*100,Math.random()*80-40,Math.random()*80-40]);
for(let w=0;w<2;w++)for(const t of ts)search(t);
const t0=performance.now(); for(const t of ts)search(t); const ms=performance.now()-t0;
console.log(`full 125-combo CIEDE2000 over ${cells} cells (96x72): ${ms.toFixed(0)} ms ; per 56x42 (2352 cells) ≈ ${(ms*2352/cells).toFixed(0)} ms`);
