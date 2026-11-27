import math, itertools
P = {'reflective': dict(border=(24,24,26),
 R=[(244,241,234),(198,46,42),(136,36,34),(74,26,26),(28,27,29)],
 G=[(244,241,234),(48,152,68),(36,104,48),(26,58,34),(28,27,29)],
 B=[(244,241,234),(42,86,186),(32,60,128),(24,38,72),(28,27,29)]),
 'vibrant': dict(border=(18,18,20),
 R=[(250,248,242),(232,38,36),(162,30,30),(88,22,24),(20,20,22)],
 G=[(250,248,242),(44,192,68),(32,130,48),(22,70,32),(20,20,22)],
 B=[(250,248,242),(40,102,232),(30,72,160),(22,42,88),(20,20,22)])}
b=0.15
def s2l(c):
    c/=255; return c/12.92 if c<=0.04045 else ((c+0.055)/1.055)**2.4
def l2s(l):
    l=max(0,min(1,l)); return round(255*(12.92*l if l<=0.0031308 else 1.055*l**(1/2.4)-0.055))
def lab(r,g,bb):
    x=(r*.4124564+g*.3575761+bb*.1804375)/.95047; y=r*.2126729+g*.7151522+bb*.072175; z=(r*.0193339+g*.119192+bb*.9503041)/1.08883
    f=lambda t: t**(1/3) if t>0.008856 else 7.787*t+16/116
    fx,fy,fz=f(x),f(y),f(z); return (116*fy-16,500*(fx-fy),200*(fy-fz))
def d76(a,c): return math.dist(a,c)
def d2000(l1,l2):
    L1,a1,b1=l1; L2,a2,b2=l2
    C1=math.hypot(a1,b1); C2=math.hypot(a2,b2); Cb=(C1+C2)/2
    G=0.5*(1-math.sqrt(Cb**7/(Cb**7+25**7)))
    a1p=(1+G)*a1; a2p=(1+G)*a2; C1p=math.hypot(a1p,b1); C2p=math.hypot(a2p,b2)
    h=lambda a,b_: (math.degrees(math.atan2(b_,a))%360) if (a or b_) else 0
    h1=h(a1p,b1); h2=h(a2p,b2)
    dL=L2-L1; dC=C2p-C1p
    if C1p*C2p==0: dh=0
    else:
        dh=h2-h1
        if dh>180: dh-=360
        elif dh<-180: dh+=360
    dH=2*math.sqrt(C1p*C2p)*math.sin(math.radians(dh/2))
    Lb=(L1+L2)/2; Cbp=(C1p+C2p)/2
    if C1p*C2p==0: hb=h1+h2
    else:
        hb=(h1+h2)/2 if abs(h1-h2)<=180 else ((h1+h2+360)/2 if h1+h2<360 else (h1+h2-360)/2)
    T=1-.17*math.cos(math.radians(hb-30))+.24*math.cos(math.radians(2*hb))+.32*math.cos(math.radians(3*hb+6))-.2*math.cos(math.radians(4*hb-63))
    dth=30*math.exp(-((hb-275)/25)**2); Rc=2*math.sqrt(Cbp**7/(Cbp**7+25**7))
    Sl=1+.015*(Lb-50)**2/math.sqrt(20+(Lb-50)**2); Sc=1+.045*Cbp; Sh=1+.015*Cbp*T
    Rt=-math.sin(math.radians(2*dth))*Rc
    return math.sqrt((dL/Sl)**2+(dC/Sc)**2+(dH/Sh)**2+Rt*(dC/Sc)*(dH/Sh))
def build(p):
    out=[]
    for ri,gi,bi in itertools.product(range(5),repeat=3):
        lin=[(1-b)/3*(s2l(p['R'][ri][c])+s2l(p['G'][gi][c])+s2l(p['B'][bi][c]))+b*s2l(p['border'][c]) for c in range(3)]
        out.append(((ri,gi,bi),lin,lab(*lin),tuple(l2s(x) for x in lin)))
    return out
targets={'white fur (235,225,222)':(235,225,222),'cream (240,222,190)':(240,222,190),'ginger (222,150,90)':(222,150,90),
 'bright orange (237,145,33)':(237,145,33),'dark ginger (160,95,50)':(160,95,50),'neutral grey 128':(128,128,128),
 'neutral grey 200':(200,200,200),'pink nose (200,120,110)':(200,120,110),'plate shadow (190,185,200)':(190,185,200),'black (12,12,14)':(12,12,14)}
names='□●◐◑■'
for pk in ('reflective','vibrant'):
    L=build(P[pk]); print('=====',pk)
    lums=[c[2][0] for c in L]; print('achievable L* range: %.1f .. %.1f ; darkest mix sRGB %s ; brightest %s'%(min(lums),max(lums),min(L,key=lambda c:c[2][0])[3],max(L,key=lambda c:c[2][0])[3]))
    for name,t in targets.items():
        tl=lab(*[s2l(x) for x in t])
        c76=min(L,key=lambda c:d76(tl,c[2])); c00=min(L,key=lambda c:d2000(tl,c[2]))
        f=lambda c:'%s%s%s mix=%s'%(names[c[0][0]],names[c[0][1]],names[c[0][2]],c[3])
        print('%-30s L*=%4.1f | dE76 pick %-26s dE76=%5.1f dE00=%5.1f | dE00 pick %-26s dE00=%5.1f'%(name,tl[0],f(c76),d76(tl,c76[2]),d2000(tl,c76[2]),f(c00),d2000(tl,c00[2])))
