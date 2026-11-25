// Weather title renderer. The shader programs and their motion parameters come from the supplied editor.
(() => {
'use strict';
const sources = {
vertexShader: `#version 300 es
precision highp float;
out vec2 vUv;

void main(){vec2 p=vec2((gl_VertexID==1)?3.:-1.,(gl_VertexID==2)?3.:-1.);vUv=vec2(p.x*.5+.5,.5-p.y*.5);gl_Position=vec4(p,0.,1.);}`,
fragmentShader: `#version 300 es
precision highp float;
precision highp int;
in vec2 vUv;out vec4 frag;
uniform sampler2D uField,uGlyphAtlas;
uniform vec2 uTexSize;
uniform int uEffect,uGlyphCount,uHitCount,uRowCount,uGlyphOverflow;
uniform vec2 uRowSplits;
uniform vec4 uGlyph[32],uHits[72],uRows[3];
uniform vec3 uInk,uPaper;
uniform vec4 uUvMotion; // mode, intensity, width, pace

uniform float uPhase,uStrength,uScale,uDensity,uChaos,uAngle,uElastic,uSeed;
uniform vec4 uExtra;
uniform float uLandingSpeed,uSuperDay,uGarland,uBlizzard;
uniform vec3 uDrizzle;
uniform vec4 uHail;
uniform vec3 uHeavySnow; // cap thickness, slide progress, glyph load
uniform vec3 uSnowRows; // occupied source rows
const float PI=3.14159265359;const vec2 SIZE=vec2(1920.,806.);
float hash(float n){return fract(sin(n*127.1+uSeed*11.7)*43758.5453);}
float field(vec2 p){vec2 t=p/SIZE*uTexSize-.5;if(any(lessThan(t,vec2(0.)))||any(greaterThan(t,uTexSize-1.)))return 100.;ivec2 a=ivec2(floor(t)),b=ivec2(min(vec2(a)+1.,uTexSize-1.));vec2 f=fract(t);return mix(mix(texelFetch(uField,a,0).r,texelFetch(uField,ivec2(b.x,a.y),0).r,f.x),mix(texelFetch(uField,ivec2(a.x,b.y),0).r,texelFetch(uField,b,0).r,f.x),f.y);}
float glyphMeta(int column){return texelFetch(uGlyphAtlas,ivec2(column,0),0).r;}
float glyphField(vec2 p,int index){
 int m=index*6;
 ivec2 start=ivec2(glyphMeta(m),glyphMeta(m+1));
 ivec2 size=ivec2(glyphMeta(m+2),glyphMeta(m+3));
 vec2 origin=vec2(glyphMeta(m+4),glyphMeta(m+5));
 vec2 t=p*(uTexSize.x/SIZE.x)-origin-.5;
 if(any(lessThan(t,vec2(0.)))||any(greaterThan(t,vec2(size-1))))return 100.;
 ivec2 a=ivec2(floor(t)),b=min(a+1,size-1);
 vec2 f=fract(t);
 return mix(mix(texelFetch(uGlyphAtlas,start+a,0).r,texelFetch(uGlyphAtlas,start+ivec2(b.x,a.y),0).r,f.x),
            mix(texelFetch(uGlyphAtlas,start+ivec2(a.x,b.y),0).r,texelFetch(uGlyphAtlas,start+b,0).r,f.x),f.y);
}
float verticalInkIntegral(ivec2 start,ivec2 size,vec2 q){
 ivec2 a=ivec2(floor(q)),b=min(a+1,size);
 b.x=min(b.x,size.x-1);
 vec2 f=fract(q);
 return mix(mix(texelFetch(uGlyphAtlas,start+a,0).r,texelFetch(uGlyphAtlas,ivec2(start.x+b.x,start.y+a.y),0).r,f.x),
            mix(texelFetch(uGlyphAtlas,ivec2(start.x+a.x,start.y+b.y),0).r,texelFetch(uGlyphAtlas,start+b,0).r,f.x),f.y);
}
float glyphTrailBand(ivec2 start,ivec2 size,vec2 q,float radius){
 float lo=max(0.,q.y-radius),hi=min(float(size.y),q.y+radius);
 if(hi<=lo)return 0.;
 return (verticalInkIntegral(start,size,vec2(q.x,hi))-verticalInkIntegral(start,size,vec2(q.x,lo)))/(2.*radius);
}
float glyphSmear(vec2 p,int index,float swept){
 int m=index*6;
 ivec2 start=ivec2(glyphMeta(m),glyphMeta(m+1));
 ivec2 size=ivec2(glyphMeta(m+2),glyphMeta(m+3));
 float scale=uTexSize.x/SIZE.x;
 vec2 q=p*scale-vec2(glyphMeta(m+4),glyphMeta(m+5));
 q.x-=.5;
 if(q.x<0.||q.x>=float(size.x))return 0.;
 q.x=min(q.x,float(size.x-1));
 start.y+=size.y+1;
 float span=abs(swept)*scale;
 q.y+=swept*scale*.14;
 // Nested bands taper the trail towards its ends.
 return clamp(.26*glyphTrailBand(start,size,q,span*.17)
             +.41*glyphTrailBand(start,size,q,span*.33)
             +.33*glyphTrailBand(start,size,q,span*.50),0.,1.);
}
// Isolate the SOURCE row before deformation; never crop the output at a fixed screen Y.
float rowDivider(int r){return (uRows[r].w+uRows[r+1].y)*.5;}
float rowField(vec2 p,int r){
 float clip=-100.;
 if(r>0)clip=max(clip,rowDivider(r-1)-p.y);
 if(r+1<uRowCount)clip=max(clip,p.y-rowDivider(r));
 return max(field(p),clip);
}
float opacity(float d){float w=clamp(.55*fwidth(d),.48,1.2);return 1.-smoothstep(-w,w,d);}
float bump(float x){return exp(-x*x);}
float envelope(float age,float life){float v=age/life;if(v<0.||v>=1.)return 0.;return sin(PI*v)*sin(PI*v);}
uniform vec4 uWeather; // temperature, intensity, rain, snow
uniform vec3 uDaySwing; // shared pivot and seesaw angle
uniform vec4 uChill; // displacement, cycles, blur length, row phase
uniform float uChillPause;
uniform vec3 uChillOffset,uChillSweep;
uniform vec2 uDayMotion; // selected mood, strength
uniform vec3 uWeatherExtra; // wind, thunder, goosebumps
uniform vec4 uThermal; // melting top, bottom, reach, shimmer
uniform float uMeltSoft;
uniform vec4 uColdGoose; // goose size, frequency, spacing in yzw
uniform vec4 uRainShape; // power, radius, ring width, fall speed
uniform vec2 uWindShape; // amplitude, frequency
uniform vec4 uSnowShape; // speed, density, wind, blur
uniform float uSnowGust;
uniform vec2 uColdShape; // amount, prickliness of standalone cold
uniform vec3 uMixRain; // fall speed, streak length, opacity
uniform vec4 uStrongWind; // strength, direction, flight, streams
uniform vec3 uStrongAir; // gust, travel time, cycle seconds
uniform vec3 uStormTeeth; // tooth spacing, height variation, third strike pause
uniform vec4 uSquallBend[32]; // sweep at the top, bend through the middle
uniform vec4 uColdCenter[32],uColdInverse[32];
uniform sampler2D uRainField;
uniform int uRainFieldReady,uRainPass;

float snowNoise(vec2 p);
float snowHash(vec2 p);

float hailDent(vec2 q,vec4 box,int glyph){
 float h=max(1.,box.w-box.y);
 if(q.y>box.y+.34*h||uHail.x<=0.)return 0.;
 float fall=1.-smoothstep(box.y,box.y+.34*h,q.y);
 float offset=0.;
 for(int j=0;j<5;j++){
  if(float(j)>=uHail.z)break;
  float seed=float(glyph)*11.3+float(j)*17.7;
  float age=fract(uPhase-hash(seed));
  float life=mix(.15,.35,uHail.w);
  if(age>=life)continue;
  float t=age/life;
  float rebound=exp(-4.*t)*cos(t*PI*(1.+2.*uHail.w));
  float x=mix(box.x,box.z,.10+.8*hash(seed+2.));
  offset+=smoothstep(0.,.12,t)*(1.-smoothstep(.75,1.,t))*rebound*bump((q.x-x)/uHail.y);
 }
 return clamp(offset,-.24,1.)*uHail.x*h*.115*fall;
}
float stormField(vec2 p,int glyph);
float topContourWeight(vec2 p,int glyph){
 if(glyph<0)return 0.;
 int m=glyph*6;
 int start=int(glyphMeta(m)),roof=int(glyphMeta(m+1)+glyphMeta(m+3));
 int width=int(glyphMeta(m+2));
 float column=clamp(p.x*uTexSize.x/SIZE.x-glyphMeta(m+4)-.5,0.,float(width-1));
 float top=texelFetch(uGlyphAtlas,ivec2(start+int(column+.5),roof),0).r;
 float exposed=1.-smoothstep(2.,7.,abs(p.y-top));
 if(exposed<=0.)return 0.;
 vec2 dx=vec2(1.,0.),dy=vec2(0.,1.);
 vec2 n=vec2(glyphField(p+dx,glyph)-glyphField(p-dx,glyph),glyphField(p+dy,glyph)-glyphField(p-dy,glyph));
 return exposed*smoothstep(.40,.82,-n.y/max(.001,length(n)));
}
// A white foreground layer, independent of the glyph mask.
vec3 heavySnowLayer(vec2 p,vec3 scene){
 float thickness=uHeavySnow.x;
 if(thickness<=.01)return scene;
 float coverage=0.;
 for(int row=0;row<uRowCount;row++){
  vec4 bounds=uRows[row];
  if(uSnowRows[row]<.5)continue;
  float lag=float(row)*.055;
  float slide=smoothstep(lag,1.,uHeavySnow.y);
  float release=smoothstep(.55,1.,slide);
  vec2 q=p-vec2(42.*release,0.);
  float pad=18.+thickness*.14+16.*smoothstep(0.,.34,slide);
  float left=bounds.x-pad,right=bounds.z+pad;
  float span=right-left,mid=(left+right)*.5;
  float u=clamp((q.x-left)/span,0.,1.);
  float crown=.67*bump((u-.16)/.112)+1.02*bump((u-.47)/.155)+.78*bump((u-.80)/.126);
  float top=bounds.y-thickness*(.38+.82*crown);
  float scallops=.91*bump((u-.14)/.075)
                +1.00*bump((u-.43)/.093)
                +.76*bump((u-.72)/.076)
                +.63*bump((u-.91)/.049);
  float wave=scallops-.35;
  float fallWave=min(67.,max(28.,thickness*1.35))*wave;
  float resting=bounds.y+thickness*(.92+.16*crown)+min(thickness*1.20,64.)*wave;
  float bottom=mix(resting,bounds.w+39.+fallWave,smoothstep(0.,.42,slide));
  float liftOut=(SIZE.y-bounds.w+92.)*release;
  bottom+=liftOut;
  top=mix(top,bounds.w+28.-thickness*(1.15+.48*crown),smoothstep(.48,.84,slide))+liftOut;
  float radius=min(thickness*.25,span*.15);
  vec2 d=vec2(abs(q.x-mid)-(span*.5-radius),abs(q.y-(top+bottom)*.5)-((bottom-top)*.5-radius));
  float sd=length(max(d,0.))+min(max(d.x,d.y),0.)-radius;
  float enter=max(smoothstep(.1,12.,thickness),smoothstep(0.,.24,slide));
  coverage=max(coverage,enter*(1.-smoothstep(-.75,.75,sd)));
 }
 return mix(scene,vec3(1.),coverage);
}
float coldDistance(vec2 p,int row,out vec2 sourcePoint,out int sourceGlyph,out float trail){
 sourcePoint=p;sourceGlyph=-1;trail=0.;
 float sweep=row<0?0.:uChillSweep[row];
 float result=100.,unmovedClip=-100.;
 for(int i=0;i<32;i++){
  if(i>=uGlyphCount)break;
  vec4 box=uGlyph[i], center=uColdCenter[i];
  vec2 pivot=(box.xy+box.zw)*.5, halfSize=(box.zw-box.xy)*.5;
  int glyphRow=pivot.y<uRowSplits.x?0:pivot.y<uRowSplits.y?1:2;
  if(row>=0&&row!=glyphRow)continue;
  if(uGlyphOverflow==1){
   vec2 gap=abs(p-pivot)-halfSize-1.;
   unmovedClip=max(unmovedClip,-max(gap.x,gap.y));
  }
  vec2 local=p-center.xy;
  vec4 inverse=uColdInverse[i];
  vec2 outside=abs(local)-center.zw;
  if(outside.x>12.||outside.y>12.+abs(sweep)*.75)continue;
  vec2 q=pivot+vec2(dot(inverse.xy,local),dot(inverse.zw,local));
  if(uEffect==60&&uWeatherExtra.x>1.&&uWindShape.x>.001){
   // Inverse horizontal shear within this glyph. The upper part swings further.
   float vertical=clamp((box.w-q.y)/max(1.,box.w-box.y),0.,1.);
   vec2 bend=uSquallBend[i].xy;
   q.x-=bend.x*vertical*vertical+bend.y*sin(PI*vertical)*vertical;
  }
  if(uEffect==60)q.y-=hailDent(q,box,i);
  float sd=glyphField(q,i);
  if(abs(sd)<7.&&uColdShape.y>.001){
   // Short directional teeth and fine chips, following each moving glyph.
   vec2 crystal=q;
   float teeth=pow(smoothstep(.25,.9,snowNoise(crystal*vec2(.17,1.1))),2.);
   float chips=snowNoise(crystal*vec2(.73,.49))-.5;
   float band=floor(q.y/(1.3+2.4*snowNoise(vec2(q.y*.013,19.))));
   float tear=(snowHash(vec2(band,73.))-.5)*2.*smoothstep(.58,.85,snowNoise(q*.041));
   sd-=(4.6*teeth+1.4*chips-.55+tear)*uColdShape.x*uColdShape.y*bump(sd/4.);
  }
  if(abs(sweep)>.6){
   float blur=glyphSmear(q,i,sweep*inverse.w);
   trail=max(trail,blur*smoothstep(.6,4.,abs(sweep)));
  }
  if(sd<result){result=sd;sourcePoint=q;sourceGlyph=i;}
 }
 if(uGlyphOverflow==1){
  float base=row<0?field(p):rowField(p,row);
  float stationary=max(base,unmovedClip);
  if(stationary<result){result=stationary;sourcePoint=p;sourceGlyph=-1;}
 }
 return result;
}

// Invert the vertical stretch at each column so each tongue stays attached.
vec3 heatSample(vec2 q,vec4 box,int row,float phase){
 float h=max(1.,box.w-box.y);
 float mid=(box.y+box.w)*.5;
 float dy=q.y-mid;
 bool upper=dy<0.;
 float depth=abs(dy),side=upper?uThermal.x:uThermal.y;
 float offset=upper?.9:2.8;
 float warm=.5-.5*cos(phase);
 float tip=smoothstep(0.,.85,depth/(h*.5));
 float wave=sin(clamp((q.y-box.y)/h,0.,1.)*8.2+phase+(q.x-box.x)*.003+float(row)*.8);
 // Invert each axis separately. The low-frequency lateral bend stays
 // monotone in X even when the sharper vertical pockets are at full reach.
 q.x-=uThermal.w*uWeather.y*side*warm*tip*wave;
 float x=q.x-box.x;
 float local=.5+.5*cos(phase-x*.006-offset-float(row)*.85);
 // Broad lobes keep the stretch coherent across the width of a stroke.
 float pocket=.5+.5*cos(x*.018+.65*sin(x*.009+phase+offset)+offset+uSeed*.37);
 pocket*=pocket;
 float flow=uWeather.y*side*warm*(.45+.55*local);
 float reach=uThermal.z*flow*(.10+.90*pocket);
 // Adjacent facing edges share the line gap.
 int neighbor=upper?row-1:row+1;
 if(neighbor>=0&&neighbor<uRowCount){
  float clearance=max(0.,upper?box.y-uRows[neighbor].w:uRows[neighbor].y-box.w);
  reach=clearance*.43*tanh(reach/max(1.,clearance*.43));
 }
 float curve=reach/max(1.,.25*h*h);
 float sourceDepth=2.*depth/(1.+sqrt(1.+4.*curve*depth));
 q.y=mid+sign(dy)*sourceDepth;
 return vec3(q,flow*tip*(.45+.55*pocket));
}

// Map each edge to a continuous circuit around its glyph. A horizontal
// or vertical stroke gets a straight, symmetric triangular profile.
vec2 stormCircuit(vec2 edge,vec4 box){
 vec2 size=max(vec2(1.),box.zw-box.xy);
 vec2 p=(edge-(box.xy+box.zw)*.5)/(size*.5);
 p/=max(.001,max(abs(p.x),abs(p.y)));
 float distanceAlong;
 if(abs(p.x)>abs(p.y)){
  distanceAlong=p.x>0.?size.x+(p.y+1.)*size.y*.5
    :2.*size.x+size.y+(1.-p.y)*size.y*.5;
 }else{
  distanceAlong=p.y<0.?(p.x+1.)*size.x*.5
    :size.x+size.y+(1.-p.x)*size.x*.5;
 }
 return vec2(distanceAlong,2.*(size.x+size.y));
}

float stormField(vec2 p,int glyph){return glyph<0?field(p):glyphField(p,glyph);}
float stormDistance(vec2 source,float sd,float burst,vec4 row,int glyphIndex){
 float height=max(1.,row.w-row.y);
 float reach=burst*min(29.,height*.16);
 float variation=uStormTeeth.y;
 if(reach<.001||sd< -2.||sd>reach*(1.+.83*variation)+2.)return sd;
 float radius=clamp(height*.019,1.,4.);
 vec2 dx=vec2(radius,0.),dy=vec2(0.,radius);
 vec2 gradient=vec2(stormField(source+dx,glyphIndex)-stormField(source-dx,glyphIndex),
                    stormField(source+dy,glyphIndex)-stormField(source-dy,glyphIndex));
 vec2 normal=gradient/max(length(gradient),.001);
 vec2 edge=source-normal*sd;
 float probe=reach*1.8+3.;
 float clearance=stormField(edge+normal*probe,glyphIndex)/probe;
 reach*=mix(.46,1.,smoothstep(.12,.84,clearance));
 vec4 box=glyphIndex<0?row:uGlyph[glyphIndex];
 float nearest=1e6,seed=41.+float(max(0,glyphIndex))*17.;
 for(int i=0;glyphIndex<0&&i<32;i++){
  if(i>=uGlyphCount)break;
  vec4 glyph=uGlyph[i];
  vec2 gap=abs(edge-(glyph.xy+glyph.zw)*.5)-(glyph.zw-glyph.xy)*.5;
  float distanceToBox=max(gap.x,gap.y);
  if(distanceToBox<nearest){nearest=distanceToBox;box=glyph;seed=41.+float(i)*17.;}
 }
 vec2 circuit=stormCircuit(edge,box);
 float teeth=max(4.,round(circuit.y/uStormTeeth.x));
 float cell=circuit.x/circuit.y*teeth;
 float profile=1.-abs(2.*fract(cell)-1.);
 float size=mix(1.,.17+1.66*hash(floor(cell)+seed),variation);
 return sd-reach*profile*size;
}

float lightningStrike(float time,float start,float lengthSeconds){
 float progress=(time-start)/lengthSeconds;
 return smoothstep(0.,.075,progress)*(1.-smoothstep(.32,1.,progress));
}
float stormPulse(){
 float duration=uStrongAir.z,seconds=uPhase*duration;
 float lengthSeconds=clamp(duration*.010,.036,.060);
 float first=duration*.20;
 float second=first+clamp(duration*.020,.070,.120);
 float third=second+lengthSeconds+uStormTeeth.z*duration;
 return max(max(.93*lightningStrike(seconds,first,lengthSeconds),
                lightningStrike(seconds,second,lengthSeconds)),
            1.12*lightningStrike(seconds,third,lengthSeconds));
}

// Air streams from the reference, with a periodic clock for seamless export.
vec3 strongAirSample(vec2 p,float ph){
 float motion=round(uStrongAir.y*.38);
 float travel=ph*motion;
 float gust=uStrongAir.x*uStrongWind.x;
 vec2 drift=vec2(sin(travel),cos(travel))*.55;
 float bend=snowNoise(vec2(p.y*.008,p.x*.003)+drift)-.5;
 float strip=floor(p.y/36.);
 float center=(strip+.25+.5*snowHash(vec2(strip+7.,13.)))*36.;
 center+=sin(p.x*.011-travel*uStrongWind.y+strip*2.7)*7.;
 float delta=p.y-center;
 float packet=pow(snowNoise(vec2(p.x*.017,strip*9.1)+drift),2.);
 // Fade the optical displacement to zero at the strip boundary, where
 // the next stream uses a different center and packet.
 float stripEdge=18.-abs(p.y-(strip+.5)*36.);
 float stream=exp(-delta*delta/4.)*smoothstep(0.,4.,stripEdge)*packet*uStrongWind.w*gust;
 vec2 offset=vec2(bend*9.,(snowNoise(p*vec2(.009,.004)-drift)-.5)*4.)*gust;
 offset.y+=delta*stream*.7;
 // A wider, soft optical band keeps the same peak opacity.
 float visibleCenter=clamp(center,strip*36.+10.,strip*36.+26.);
 float visibleDelta=p.y-visibleCenter;
 float band=exp(-visibleDelta*visibleDelta/34.)*(1.-smoothstep(7.,10.,abs(visibleDelta)));
 return vec3(offset,band*packet*uStrongWind.w*gust);
}

// One broad crest at long distances. The ring thickness is independent
// of radius, and increasing the radius does not add oscillations.
float rippleProfile(float len,float radius,float progress){
 float width=max(2.,uRainShape.z);
 float calm=smoothstep(108.,157.,radius);
 float front=radius*progress;
 float relative=len-front;
 float phase=relative*(2.5/width);
 float band=relative/(radius*.35+1.);
 float old=sin(phase)*exp(-band*band);
 float broad=relative/(width+3.8*calm);
 float crest=1.65*broad*exp(-.72*broad*broad);
 return mix(old,crest,calm)*(1.-len/radius);
}
// Freeze the selected center from impact until the packet dies.
float rainClock(float phaseOffset){return uPhase*uRainShape.w-phaseOffset;}
float rainGeneration(float clock){
 float event=floor(clock);
 // A recorded loop repeats by design. The live clock continues to new sites.
 return uRainPass<0?mod(event,uRainShape.w):event+float(uRainPass)*uRainShape.w;
}
vec4 rainDirectHit(int index){
 vec4 hit=uHits[index];
 int shift=int(mod(rainGeneration(rainClock(hit.z))*29.,72.));
 hit.xy=uHits[(index+shift)%72].xy;
 return hit;
}
vec4 rainGridHit(vec2 id,vec2 cellSize){
 float seed=dot(id,vec2(17.13,93.71));
 float phaseOffset=1.-hash(seed+9.);
 float key=seed+mod(rainGeneration(rainClock(phaseOffset)),1021.)*73.17;
 vec2 center=(id+.13+.74*vec2(hash(key),hash(key+3.)))*cellSize;
 return vec4(center,phaseOffset,hash(seed+15.));
}

vec2 rainWave(vec2 p,vec4 hit){
 // A faster event clock schedules more impacts. Ripple age is measured
 // on the unscaled timeline, so each wave expands at the same speed.
 float age=fract(rainClock(hit.z))/uRainShape.w;
 if(age>=.24)return vec2(0.);
 float radius=uRainShape.y;
 vec2 delta=(p-hit.xy)/2.4;
 float len=length(delta);
 if(len>=radius)return vec2(0.);
 float life=envelope(age,.24);
 return delta/max(.001,len)*rippleProfile(len,radius,age/.24)*life*32.*uWeather.z*uRainShape.x*(.5+hit.w);
}

bool hasGlyphMotion(){
 return uHail.x>.001||(uSuperDay>.5&&(uSuperDay<3.5||uSuperDay>4.5))||(uDayMotion.x>.5&&uDayMotion.x<2.5&&uDayMotion.y>.001)||uChill.x>.001||uChill.z>.001||(uWeather.x>2.5&&uWeather.y>.001)
   ||uHeavySnow.z>.001||uColdShape.x>.001||uStrongWind.x*uStrongWind.z>.001
   ||(uWeatherExtra.x>1.&&uWindShape.x>.001);
}
float movingEdgeWidth(float distanceToEdge){
 // Signed distances are in source coordinates. A flattened glyph can
 // cover many source pixels per output pixel; filter in screen space.
 vec2 gradient=vec2(dFdx(distanceToEdge),dFdy(distanceToEdge));
 return clamp(.5*length(gradient),.35,5.);
}
float chillClock(float phase,int row,float frequency,float delay){
 return phase*frequency+float(row)*delay;
}
float chillEnvelope(float phase){
 if(uChillPause<=.001)return 1.;
 float t=fract(phase),ramp=min(.10,(1.-uChillPause)*.24);
 return smoothstep(0.,ramp,t)*(1.-smoothstep(1.-uChillPause-ramp,1.-uChillPause,t));
}
float weatherRowDistance(vec2 p,int r,out float heat,out float trail){
 trail=0.;
 float ph=fract(uPhase)*2.*PI;
 float wind=uWeatherExtra.x*uWindShape.x,thunder=uWeatherExtra.y;
 float burst=thunder>.001?stormPulse():0.;
 vec4 box=uRows[r];float height=max(1.,box.w-box.y);
 vec2 q=p-vec2(0.,uChillOffset[r]);float v=clamp((p.y-box.y)/height,0.,1.);
 float windPhase=ph*uWindShape.y;
 float localPhase=(p.x-box.x)*.0025+float(r)*.5;
 float wave=sin(windPhase-localPhase);
 float bend=wind*(35.+45.*(.5-.5*cos(ph)))*wave*pow(1.-v,1.6);
 if(uStrongWind.x>.001)q+=strongAirSample(p,ph).xy;
 else if(uWeatherExtra.x<.5)q.x-=bend;
 heat=0.;
 if(uWeather.x>1.5&&uWeather.x<2.5&&uWeather.y>.001){
  vec3 samplePoint=heatSample(q,box,r,ph);
  q=samplePoint.xy;
  heat=samplePoint.z;
 }
 if(uWeather.z>.0001&&uWeather.w==0.&&uRainShape.x>.0001){
  vec2 offset=vec2(0.);
  if(uRainFieldReady==1){
   vec2 uv=q/SIZE;
   if(all(greaterThanEqual(uv,vec2(0.)))&&all(lessThanEqual(uv,vec2(1.))))
    offset=texture(uRainField,vec2(uv.x,1.-uv.y)).rg*uWeather.z*uRainShape.x;
  }else{
   for(int i=0;i<72;i++){
    if(i>=uHitCount)break;
    offset+=rainWave(q,rainDirectHit(i));
   }
   // Software or older graphics configurations can evaluate the same
   // packet directly when a floating-point target is unavailable.
   int extra=max(0,uHitCount-72);
   if(extra>0){
    int rows=max(1,int(round(sqrt(float(extra)*SIZE.y/SIZE.x))));
    int cols=(extra+rows-1)/rows;
    vec2 cellSize=SIZE/vec2(float(cols),float(rows));
    ivec2 lo=clamp(ivec2(floor((q-2.4*uRainShape.y)/cellSize)),ivec2(0),ivec2(cols-1,rows-1));
    ivec2 hi=clamp(ivec2(floor((q+2.4*uRainShape.y)/cellSize)),ivec2(0),ivec2(cols-1,rows-1));
    for(int y=lo.y;y<=hi.y;y++)for(int x=lo.x;x<=hi.x;x++){
     if(y*cols+x>=extra)continue;
     vec2 id=vec2(float(x),float(y));
     offset+=rainWave(q,rainGridHit(id,cellSize));
    }
   }
  }
  // Keep broad overlapping waves from folding the same contour many
  // times when both the radius and the number of drops are high.
  float overlap=float(uHitCount)*uRainShape.y*uRainShape.z*uRainShape.w/36000.;
  float large=smoothstep(108.,165.,uRainShape.y);
  float crowd=smoothstep(36.,300.,float(uHitCount))*large;
  offset*=inversesqrt(1.+overlap*.13*crowd);
  float magnitude=length(offset);
  float limit=mix(150.,44.,crowd)*(1.+.3*max(0.,uRainShape.x-1.));
  q+=mix(offset,offset*(limit*tanh(magnitude/limit)/max(.001,magnitude)),crowd);
 }
 vec2 contourSource=q;
 bool glyphMotion=hasGlyphMotion();
 int contourGlyph=-1;
 float sd=100.;
 if((glyphMotion||uColdGoose.x>.5)&&uGlyphCount>0){
  float glyphDistance=coldDistance(q,r,contourSource,contourGlyph,trail);
  if(glyphMotion)sd=glyphDistance;
 }
 if(!glyphMotion||uGlyphCount==0)sd=rowField(q,r);

 if(uColdGoose.x>.5&&abs(sd)<8.){
  float top=topContourWeight(contourSource,contourGlyph);
  float k=2.*PI/uDrizzle.y;
  float wave=sin(contourSource.x*k+ph*uDrizzle.z)*cos(contourSource.y*k-ph*uDrizzle.z);
  float micro=sin(contourSource.x*2.*PI/uColdGoose.w+ph*uColdGoose.z);
  sd+=top*(uDrizzle.x*wave+uWeatherExtra.z*uColdGoose.y*micro)*bump(sd/4.)*(1.-smoothstep(6.,8.,abs(sd)));
 }else if(uColdGoose.x<.5&&uWeatherExtra.z>0.){
  float k=2.*PI/uColdGoose.w;
  float micro=sin(q.x*k+ph*uColdGoose.z)*cos(q.y*k-ph*uColdGoose.z);
  sd+=uWeatherExtra.z*uColdGoose.y*micro*exp(-abs(sd)/7.);
 }
 sd=stormDistance(contourSource,sd,thunder*burst,box,contourGlyph);
 return sd;
}

float weatherDistance(vec2 p,out float edgeHeat,out float trail){
 edgeHeat=0.;trail=0.;
 float nearest=100.;
 for(int r=0;r<uRowCount;r++){
  float heat,rowTrail;
  float sd=weatherRowDistance(p,r,heat,rowTrail);
  trail=max(trail,rowTrail);
  if(sd<nearest){nearest=sd;edgeHeat=heat;}
 }
 return nearest;
}

// Adapted from the user-supplied weather-type-studio-1010 reference.
float snowHash(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}
vec2 snowHash2(vec2 p){return vec2(snowHash(p),snowHash(p+vec2(19.7,73.1)));}
float snowNoise(vec2 p){
  vec2 i=floor(p),f=fract(p);f=f*f*f*(f*(f*6.0-15.0)+10.0);
  return mix(mix(snowHash(i),snowHash(i+vec2(1,0)),f.x),mix(snowHash(i+vec2(0,1)),snowHash(i+vec2(1,1)),f.x),f.y);
}
vec4 snowLayer(vec2 p,float depth,float cell,float t){
  float wind=uSnowShape.z+uWeatherExtra.x*.65;
  cell/=max(.3,(.75+3.8*pow(uWeather.w,.85))*sqrt(uSnowShape.y));
  p.x-=(wind*29.*(t+uSnowGust*(.22/.7*(1.-cos(t*.7))+.18/.23*(cos(3.1)-cos(t*.23+3.1)))))*depth;
  p.x+=(snowNoise(vec2(p.y*.009-t*.13,depth*7.1+t*.19))-.5)*(10.0+24.0*min(abs(wind),1.65))*depth*(1.0+uSnowGust*.3);
  p.y-=t*(12.0+24.0*depth);
  p.y+=(snowNoise(p*.006+vec2(t*.16,depth*19.0))-.5)*uSnowGust*uWeather.w*5.0*depth;
  float gust=1.0+uSnowGust*(.22*sin(t*.7)+.18*sin(t*.23+3.1));
  vec2 velocity=vec2(wind*29.0*depth*gust,12.0+24.0*depth)*uSnowShape.x;
  vec2 axis=velocity/max(length(velocity),.001),normal=vec2(-axis.y,axis.x);
  float motion=min(cell*.4,length(velocity)*.032*uSnowShape.w);
  vec2 base=floor(p/cell);vec4 result=vec4(0.0);
  for(int y=-1;y<=1;y++)for(int x=-1;x<=1;x++){
    vec2 id=base+vec2(float(x),float(y)),rnd=snowHash2(id+depth*93.0);
    vec2 center=(id+.24+.52*rnd)*cell,delta=p-center;
    float enabled=smoothstep(snowHash(id+37.0)*.96,snowHash(id+37.0)*.96+.04,uWeather.w);
    float radius=(1.7+2.4*rnd.x)*depth,focus=.35+pow(max(depth-1.0,0.0),2.0)*1.8;
    float width=min(cell*.5,radius+focus),longitudinal=min(cell*.62,width+motion);
    vec2 oriented=length(velocity)>.001?vec2(dot(delta,axis),dot(delta,normal)):delta;
    vec2 bodySize=vec2(longitudinal,width),haloSize=min(vec2(cell*.62),vec2(radius+focus*2.0+3.0)+vec2(motion,0.0));
    float bodyDistance=length(oriented/bodySize),haloDistance=length(oriented/haloSize);
    if(enabled>.001&&haloDistance<1.7){
      float angle=atan(delta.y,delta.x),d=length(delta);
      float crystal=1.0+.12*cos(angle*6.0+rnd.x*8.0)*exp(-d/max(radius,.5));
      float body=exp(-bodyDistance*bodyDistance*1.7)*(1.0-smoothstep(1.1,1.7,bodyDistance))*crystal;
      float halo=exp(-haloDistance*haloDistance)*(1.0-smoothstep(1.0,1.7,haloDistance));
      float opacity=mix(.18,.85,smoothstep(.35,1.8,depth))*enabled*sqrt(width/max(longitudinal,.01));
      result+=vec4(body*opacity,halo*opacity*min(1.0,depth*.4),delta/(radius+focus+3.0)*halo*opacity*.4);
    }
  }
  return result;
}

vec4 snowField(vec2 p,float t){return snowLayer(p,.38,55.,t)+snowLayer(p,.65,76.,t)+snowLayer(p,1.,98.,t)+snowLayer(p,1.55,135.,t)+snowLayer(p,2.5,195.,t);}
vec4 loopingSnow(vec2 p){
 float span=6.*uSnowShape.x,t=uPhase*span;
 vec4 a=snowField(p,t);
 if(uPhase<=.65)return a;
 return mix(a,snowField(p,t-span),smoothstep(.65,1.,uPhase));
}

// Falling streaks adapted from the rain layers of the snow reference.
vec2 streakLayer(vec2 p,float depth,float t){
 float slope=uSnowShape.z*.48+uWeatherExtra.x*.24;
 vec2 cell=vec2(34.,210.)/depth;
 float flowX=p.x-p.y*slope-t*3.*depth;
 float baseColumn=floor(flowX/cell.x);
 vec2 result=vec2(0.);
 for(int x=-1;x<=1;x++){
  float column=baseColumn+float(x);
  float speed=(235.+230.*depth)*(.8+.4*snowHash(vec2(column,depth*41.)));
  float flowY=p.y-t*speed,baseRow=floor(flowY/cell.y);
  for(int y=-1;y<=1;y++){
   vec2 id=vec2(column,baseRow+float(y));
   vec2 rnd=snowHash2(id+depth*31.);
   vec2 delta=vec2(flowX,flowY)-(id+vec2(.18+.64*rnd.x,.76))*cell;
   float threshold=snowHash(id+63.)*.97;
   float enabled=smoothstep(threshold,threshold+.03,uWeather.z);
   float len=min(cell.y*.85,uMixRain.y*(13.+24.*depth)*(.55+.8*rnd.y));
   if(enabled<=.001||abs(delta.x)>cell.x*.7||delta.y< -len||delta.y>5.)continue;
   float width=.34+.39*depth+pow(max(depth-1.1,0.),2.)*1.4;
   float tail=smoothstep(-len,-len*.2,delta.y)*(1.-smoothstep(-1.,2.+depth,delta.y));
   float opacity=enabled*(.19+.19*depth)*tail;
   result+=opacity*vec2(exp(-pow(delta.x/(width+.48),2.))*.76,exp(-pow(delta.x/(width*2.7),2.))*.36);
  }
 }
 return result;
}
vec2 streakField(vec2 p,float t){
 return streakLayer(p,.45,t)+streakLayer(p,.75,t)+streakLayer(p,1.,t)
       +streakLayer(p,1.5,t)+streakLayer(p,2.1,t);
}
vec2 loopingStreaks(vec2 p){
 float span=6.*uMixRain.x,t=fract(uPhase)*span;
 vec2 streaks=streakField(p,t);
 if(uPhase>.65&&uPhase<1.)streaks=mix(streaks,streakField(p,t-span),smoothstep(.65,1.,uPhase));
 return streaks;
}

// Match the reference fog field in artboard coordinates.
float sceneDistance(vec2 p,out float edgeHeat,out float trail){
 edgeHeat=0.;trail=0.;
 if(uEffect==60){
  if(abs(uDaySwing.z)>.00001){
   float c=cos(uDaySwing.z),s=sin(uDaySwing.z);
   p=uDaySwing.xy+mat2(c,-s,s,c)*(p-uDaySwing.xy);
  }
  return weatherDistance(p,edgeHeat,trail);
 }
 if(uEffect==61&&uColdShape.x>.001&&uGlyphCount>0){vec2 sourcePoint;int sourceGlyph;return coldDistance(p,-1,sourcePoint,sourceGlyph,trail);}
 return field(p);
}
vec2 rubberJump(float age,float landingSpeed){
 float apex=.35,contact=apex+.35/landingSpeed;
 float airborne=(age-apex)/(age<apex?apex:contact-apex);
 float mainLift=max(0.,1.-airborne*airborne);
 float reboundTime=(age-contact-.032)/.19;
 float rebound=max(0.,4.*reboundTime*(1.-reboundTime));
 float preload=.38*max(bump((age-.984)/.024),bump((age+.016)/.024));
 float impact=bump((age-contact-.009)/.028);
 float stretch=.47*bump((age-.066)/.035)+.32*bump((age-contact-.071)/.024);
 return vec2(mainLift+.16*rebound,stretch-impact-preload);
}

// Integrate across each tap's footprint so widely spaced trail samples
// don't turn into visible, separate bands on straight letter edges.
float trailCoverage(float sd,float slope,float stepSize){
 float width=max(.62,.5*stepSize*min(abs(slope),1.));
 return clamp(.5-sd/(2.*width),0.,1.);
}

float staticGlyphDistance(vec2 p){
 if(uGlyphOverflow==0)return 100.;
 float clip=-100.;
 for(int i=0;i<32;i++){
  vec4 box=uGlyph[i];
  vec2 gap=abs(p-(box.xy+box.zw)*.5)-(box.zw-box.xy)*.5-1.;
  clip=max(clip,-max(gap.x,gap.y));
 }
 return max(field(p),clip);
}

vec3 paperGarland(vec2 p){
 float nearest=staticGlyphDistance(p),alpha=0.,halo=0.;
 for(int i=0;i<32;i++){
  if(i>=uGlyphCount)break;
  vec4 box=uGlyph[i],pose=uColdCenter[i],optics=uColdInverse[i];
  if(optics.z<=.001)continue;
  vec2 local=p-pose.xy;
  vec2 q=vec2(dot(vec2(pose.w,pose.z),local)/optics.x,dot(vec2(-pose.z,pose.w),local));
  q+=vec2((box.x+box.z)*.5,optics.y);
  if(any(lessThan(q,box.xy-vec2(8.)))||any(greaterThan(q,box.zw+vec2(8.))))continue;
  float d=glyphField(q,i);
  if(optics.z>=.999)nearest=min(nearest,d);
  else alpha=max(alpha,optics.z*(1.-smoothstep(-.75,.75,d)));
  if(optics.w>.5)halo=max(halo,optics.z*(1.-smoothstep(0.,7.,d)));
 }
 float width=movingEdgeWidth(nearest);
 alpha=max(alpha,1.-smoothstep(-width,width,nearest));
 vec3 paper=mix(uPaper,vec3(1.,.75,.37),.20*halo);
 return mix(paper,uInk,alpha);
}

void main(){vec2 p=vUv*SIZE,s=p;float ph=uPhase*2.*PI,am=uStrength,d=100.;int row=p.y<uRowSplits.x?0:p.y<uRowSplits.y?1:2;vec4 rb=uRows[row];
 if(uEffect==62||(uEffect==60&&uGarland>.5)){frag=vec4(paperGarland(p),1.);return;}
 if(uEffect==60||uEffect==14||uEffect==61){
  float edgeHeat,trail;
  float sd=sceneDistance(p,edgeHeat,trail);vec4 snow=vec4(0.);
  if(uEffect==60&&uWeather.w>.0001&&sd<35.)snow=loopingSnow(p)*(1.-smoothstep(25.,35.,sd));
  vec2 streaks=vec2(0.);
  if(uEffect==60&&uWeather.w>0.&&uWeather.z>0.&&uMixRain.z>0.&&sd<14.)
   streaks=loopingStreaks(p)*(1.-smoothstep(5.,14.,sd));
  vec2 source=p+snow.zw;
  if(snow.y>.0001)sd=sceneDistance(source,edgeHeat,trail);
  float focus=.6+min(snow.y,1.)*2.;
  if(uEffect==60&&uWeather.x>1.5&&uWeather.x<2.5&&uWeather.y>.001){
   // Measure edge softness in artboard pixels. In stretched regions a
   // fixed source-space radius can wash out the entire stroke.
   float screenSlope=clamp(length(vec2(dFdx(sd),dFdy(sd))),.025,3.);
   focus=mix(focus,screenSlope*(focus+edgeHeat*uMeltSoft),smoothstep(0.,.045,edgeHeat));
  }
  if(hasGlyphMotion())focus=max(focus,movingEdgeWidth(sd));
  if(uEffect==60&&uWeatherExtra.y>.001&&stormPulse()>0.)focus=max(focus,clamp(.55*fwidth(sd),.6,1.35));
  // Composite the trail behind the ink. It can only add coverage.
  float alpha=1.-smoothstep(-focus,focus,sd);
  alpha+=(1.-alpha)*.38*trail*chillEnvelope(uPhase);
  if(uEffect==60&&uStrongWind.x>.001){
   float stream=strongAirSample(p,fract(uPhase)*2.*PI).z;
   alpha*=1.-clamp(stream*.27,0.,.22);
  }
  alpha*=1.-clamp(snow.y*.22,0.,.4);
  alpha*=1.-clamp(snow.x,0.,.90)*alpha*.90;
  alpha*=1.-clamp((streaks.x+streaks.y)*uMixRain.z,0.,.82);
  float scattering=.5-.5*cos(ph);
  alpha*=1.-smoothstep(0.,.30,scattering*uBlizzard);
  vec3 ink=uInk;
  if(uEffect==60&&uUvMotion.x>.5&&uUvMotion.y>0.){
   const vec3 violet=vec3(107.,59.,189.)/255.;
   float t=fract(uPhase*uUvMotion.w);
   float axis=p.x-264.-1300.*t+.30*(p.y-400.)+66.*sin(p.y*.016);
   float exposure=bump(axis/(uUvMotion.z*1.4142))*smoothstep(0.,.14,t)*(1.-smoothstep(.82,1.,t));
   ink=mix(ink,violet,exposure*uUvMotion.y);
  }
  vec3 scene=mix(uPaper,ink,clamp(alpha,0.,1.));
  if(uEffect==60)scene=heavySnowLayer(p,scene);
  frag=vec4(scene,1.);return;
 }
 if(am<.00001){frag=vec4(mix(uPaper,uInk,opacity(field(p))),1.);return;}
 if(uEffect==15){
 // Original editor's concentric wave packet, in its 720px coordinate system.
 vec2 off=vec2(0.);float unit=2.4;
 for(int i=0;i<24;i++){if(i>=uHitCount)break;vec4 hit=uHits[i];
 float age=fract(uPhase-mix(float(i)/max(1.,float(uHitCount)),hit.z,.65+.35*uChaos));
 float life=mix(.26,.58,uElastic),radius=mix(55.,160.,uScale);
 vec2 q=(p-hit.xy)/unit;float len=length(q),travel=age/life,front=radius*travel;
 float env=envelope(age,life)*bump((len-front)/(radius*.35+1.))*max(0.,1.-len/radius);
 float wave=sin((len-front)*2.4*.12);
 off+=q/max(.001,len)*(26./1.5)*am*(.5+hit.w)*env*wave*unit;
 }s=p+off;d=field(s);
 }
 else if(uEffect==18){
 d=staticGlyphDistance(p);
 for(int g=0;g<32;g++){
  if(g>=uGlyphCount)break;
  vec4 box=uGlyph[g];
  float height=max(1.,box.w-box.y),offset=0.;
  if(p.x<box.x-3.||p.x>box.z+3.||p.y<box.y-20.||p.y>box.w+3.)continue;
  if(p.y<box.y+height*.34){
   float fall=1.-smoothstep(box.y,box.y+height*.34,p.y);
   for(int i=0;i<24;i++){
    if(i>=uHitCount)break;
    vec4 hit=uHits[i];
    if(abs(hit.y-box.y)>height*.32)continue;
    float age=fract(uPhase-mix(float(i)/max(1.,float(uHitCount)),hit.z,uChaos));
    float life=mix(.18,.56,uElastic),t=age/life;
    float impulse=t<1.?min(1.,t/.06)*exp(-t*5.)*cos(t*PI*(1.+uElastic*2.))*(1.-smoothstep(.78,1.,t)):0.;
    float wid=18.+uScale*75.;
    offset+=am*(16.+25.*hit.w)*impulse*bump((p.x-hit.x)/wid)*fall;
   }
   offset=clamp(offset,-height*.025,height*.12);
  }
  d=min(d,glyphField(p-vec2(0.,offset),g));
 }
}
 else if(uEffect==12){
 for(int r=0;r<uRowCount;r++){
 vec4 bounds=uRows[r];float height=max(1.,bounds.w-bounds.y);
 float vertical=clamp((p.y-bounds.y)/height,0.,1.);
 float x=(p.x-128.)/1396.,q=.5-.5*cos(ph);
 float travel=sin(ph-x*(1.+uDensity*3.)+float(r)*.4);
 float base=pow(1.-vertical,1.4+uScale);
 float rebound=sin(ph*2.-x*3.)*uElastic*.2;
 vec2 dir=vec2(cos(uAngle),sin(uAngle)*.3);
 vec2 source=p-dir*am*(22.+65.*q)*(travel+rebound)*base;
 d=min(d,rowField(source,r));
 }}
 else if(uEffect==11){float q=.5-.5*cos(ph);d=field(p);float a=opacity(d)*(uDensity<.0001?1.:(1.-smoothstep(0.,.23,q*am)));frag=vec4(mix(uPaper,uInk,a),1.);return;}
 else if(uEffect==34||uEffect==54){float depth=uExtra.x,spacing=uExtra.y,freq=uExtra.z;float noise=sin(p.x/spacing*PI*2.+ph*freq)*cos(p.y/spacing*PI*2.-ph*freq)+uChaos*.35*sin(p.x*.11-p.y*.13+ph*freq);float source=field(p);vec2 normal=normalize(vec2(field(p+vec2(1.,0.))-field(p-vec2(1.,0.)),field(p+vec2(0.,1.))-field(p-vec2(0.,1.)))+vec2(.00001));float fall=uEffect==34?smoothstep(-.1,.65,-normal.y):1.;d=source+am*depth*noise*fall*exp(-abs(source)/6.);}
 else if(uEffect==52){
 float split=mix(rb.y,rb.w,uExtra.y);
 float q=clamp((split-p.y)/max(1.,split-rb.y),0.,1.),weight=q*q*(3.-2.*q);
 float phase=ph+float(row)*uExtra.w;
 float shift=am*uExtra.x*weight*(sin(phase)+uExtra.z*.3*sin(q*PI)*cos(phase));
 s.x-=shift;
 if(uScale*am>.05){
  float trail=uScale*am*weight*abs(cos(phase)),a=0.,stepSize=trail/25.;
  for(int k=0;k<25;k++){
   vec2 t=s+vec2((float(k)-12.)*stepSize,0.);
   float sd=rowField(t,row);
   a+=trailCoverage(sd,dFdx(sd),stepSize)/25.;
  }
  frag=vec4(mix(uPaper,uInk,a),1.);return;
 }
 d=rowField(s,row);
}
 else if(uEffect==17){float a=0.;
 for(int k=0;k<21;k++){float sampleAlpha=0.;
 for(int r=0;r<uRowCount;r++){
 float phase=chillClock(ph,r,uExtra.y,uExtra.w);
 float dy=sin(phase)*uExtra.x*am;
 float smear=uExtra.z*am*(.18+.82*abs(cos(phase)));
 float stepSize=smear/21.;
 vec2 t=p;t.y-=dy+(float(k)-10.)*stepSize;
 float sd=rowField(t,r);
 sampleAlpha=max(sampleAlpha,trailCoverage(sd,dFdy(sd),stepSize));
 }a+=sampleAlpha/21.;}
 frag=vec4(mix(uPaper,uInk,a),1.);return;}

 else if(uEffect==19||uEffect==8){for(int i=0;i<32;i++){if(i>=uGlyphCount)break;vec4 b=uGlyph[i];float cx=(b.x+b.z)*.5,bottom=b.w,height=max(1.,b.w-b.y),width=b.z-b.x;vec2 t=p;float scaleY=1.,scaleX=1.,dy=0.,dx=0.,angle=0.;if(uEffect==19){float delay=float(i)*uExtra.y+uChaos*hash(float(i))*.12;float age=fract((uPhase-delay)*uExtra.w);vec2 jump=rubberJump(age,uLandingSpeed);dy=-am*uExtra.x*jump.x;scaleY=max(.45,1.+am*uExtra.z*jump.y);scaleX=inversesqrt(scaleY);}else{float phase=ph+float(i)*uExtra.w+uChaos*hash(float(i))*PI*2.;dx=am*uExtra.x*sin(phase);dy=am*uExtra.y*cos(phase);scaleY=max(.4,1.+am*uExtra.z*sin(phase));angle=am*uScale*.25*sin(phase);}
 vec2 q=t-vec2(cx+dx,bottom+dy);float cs=cos(-angle),sn=sin(-angle);q=mat2(cs,sn,-sn,cs)*q;q/=vec2(scaleX,scaleY);t=q+vec2(cx,bottom);float isolated=glyphField(t,i);d=min(d,isolated*min(scaleY,scaleX));}
  d=min(d,staticGlyphDistance(p));
 }else d=field(p);
 float coverage=opacity(d);
 if(uEffect==19||uEffect==8){
  float edge=movingEdgeWidth(d);
  coverage=1.-smoothstep(-edge,edge,d);
 }
 frag=vec4(mix(uPaper,uInk,coverage),1.);
}`,
particleVertex: `#version 300 es
precision highp float;
layout(location=0)in vec4 aPoint;
uniform float uPhase,uStrength,uScale,uDensity,uChaos,uAngle,uSeed,uElastic;
uniform vec2 uResolution;
out float vOpacity;
uniform int uComposite;uniform float uWind,uSnow;
void main(){float ph=uPhase*6.2831853,q=pow(.5-.5*cos(ph),mix(1.7,.7,uElastic)),seed=aPoint.z;vec2 dir=vec2(cos(uAngle),sin(uAngle));vec2 p=aPoint.xy+dir*uStrength*q*(80.+260.*seed)+vec2(sin(ph+seed*31.),cos(ph*2.+seed*23.))*q*uChaos*180.;p+=vec2(cos(seed*41.+ph),sin(seed*41.+ph))*uStrength*q*(35.+uScale*100.);if(uComposite==1){
 p=aPoint.xy+vec2((35.+seed*160.)*(.3+uWind),25.+seed*60.)*q*uSnow;
 p+=vec2(sin(ph+seed*31.),cos(ph+seed*23.))*q*25.*uSnow;
 }
 gl_Position=vec4(p.x/1920.*2.-1.,1.-p.y/806.*2.,0.,1.);gl_PointSize=(1.2+uScale*2.5)*(0.7+aPoint.w*.6)*uResolution.x/1920.;vOpacity=smoothstep(0.,.18,q*uStrength);if(uComposite==1)vOpacity*=uSnow*.8;}`,
particleFragment: `#version 300 es
precision highp float;
uniform vec3 uInk;
in float vOpacity;out vec4 frag;
void main(){float d=length(gl_PointCoord-.5);float a=(1.-smoothstep(.34,.5,d))*vOpacity;frag=vec4(uInk,a);}`,
rainVertex: `#version 300 es
precision highp float;
uniform vec4 uHits[72];
uniform int uHitCount,uRainPass;
uniform float uSeed;
uniform vec4 uRainShape;
uniform float uPhase;
out vec2 delta;
flat out float age, weight;
const vec2 SIZE=vec2(1920.,806.);
float hash(float n){return fract(sin(n*127.1+uSeed*11.7)*43758.5453);}
// Freeze the selected center from impact until the packet dies.
float rainClock(float phaseOffset){return uPhase*uRainShape.w-phaseOffset;}
float rainGeneration(float clock){
 float event=floor(clock);
 // A recorded loop repeats by design. The live clock continues to new sites.
 return uRainPass<0?mod(event,uRainShape.w):event+float(uRainPass)*uRainShape.w;
}
vec4 rainDirectHit(int index){
 vec4 hit=uHits[index];
 int shift=int(mod(rainGeneration(rainClock(hit.z))*29.,72.));
 hit.xy=uHits[(index+shift)%72].xy;
 return hit;
}
vec4 rainGridHit(vec2 id,vec2 cellSize){
 float seed=dot(id,vec2(17.13,93.71));
 float phaseOffset=1.-hash(seed+9.);
 float key=seed+mod(rainGeneration(rainClock(phaseOffset)),1021.)*73.17;
 vec2 center=(id+.13+.74*vec2(hash(key),hash(key+3.)))*cellSize;
 return vec4(center,phaseOffset,hash(seed+15.));
}

void main(){
 int index=gl_InstanceID;
 vec4 hit;
 if(index<72)hit=rainDirectHit(index);
 else{
  int extra=uHitCount-72,cell=index-72;
  int rows=max(1,int(round(sqrt(float(extra)*SIZE.y/SIZE.x))));
  int cols=(extra+rows-1)/rows;
  vec2 id=vec2(float(cell%cols),float(cell/cols));
  vec2 cellSize=SIZE/vec2(float(cols),float(rows));
  hit=rainGridHit(id,cellSize);
 }
 age=fract(rainClock(hit.z))/uRainShape.w;
 weight=.5+hit.w;
 vec2 corner=vec2((gl_VertexID&1)==0?-1.:1.,(gl_VertexID&2)==0?-1.:1.);
 delta=corner*uRainShape.y;
 vec2 p=(hit.xy+delta*2.4)/SIZE;
 gl_Position=age>=.24?vec4(2.,2.,0.,1.):vec4(p.x*2.-1.,1.-p.y*2.,0.,1.);
}`,
rainFragment: `#version 300 es
precision highp float;
in vec2 delta;
flat in float age,weight;
uniform vec4 uRainShape;
out vec4 frag;
// One broad crest at long distances. The ring thickness is independent
// of radius, and increasing the radius does not add oscillations.
float rippleProfile(float len,float radius,float progress){
 float width=max(2.,uRainShape.z);
 float calm=smoothstep(108.,157.,radius);
 float front=radius*progress;
 float relative=len-front;
 float phase=relative*(2.5/width);
 float band=relative/(radius*.35+1.);
 float old=sin(phase)*exp(-band*band);
 float broad=relative/(width+3.8*calm);
 float crest=1.65*broad*exp(-.72*broad*broad);
 return mix(old,crest,calm)*(1.-len/radius);
}
void main(){
 float radius=uRainShape.y,len=length(delta);
 if(len>=radius)discard;
 float progress=age/.24;
 float life=sin(3.14159265359*progress);
 vec2 offset=delta/max(.001,len)*rippleProfile(len,radius,progress)*life*life*32.*weight;
 frag=vec4(offset,0.,0.);
}`,
fogFragment: `#version 300 es
precision highp float;
in vec2 vUv;
out vec4 frag;
uniform sampler2D uScene;
uniform vec3 uPaper;
uniform vec4 uFogShape;
uniform vec2 uFogOptics,uFogAxis;
uniform float uPhase;
const vec2 SIZE=vec2(1920.,806.);
const float PI=3.14159265359;
float snowHash(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}
vec2 snowHash2(vec2 p){return vec2(snowHash(p),snowHash(p+vec2(19.7,73.1)));}
float snowNoise(vec2 p){
  vec2 i=floor(p),f=fract(p);f=f*f*f*(f*(f*6.0-15.0)+10.0);
  return mix(mix(snowHash(i),snowHash(i+vec2(1,0)),f.x),mix(snowHash(i+vec2(0,1)),snowHash(i+vec2(1,1)),f.x),f.y);
}
float fogPatch(vec2 p,float t){
 vec2 drift=p*(.0038/uFogShape.w)+vec2(t*.055,-t*.021);
 vec2 warp=vec2(snowNoise(drift*.7),snowNoise(drift*.7+27.));
 vec2 q=drift+warp*1.1;
 float coverage=.55*snowNoise(q)+.28*snowNoise(q*2.03+17.3)+.17*snowNoise(q*4.11+41.7);
 return smoothstep(.22,.76,coverage);
}
float fogAmount(vec2 p){
 float cycle=fract(uPhase),span=uFogShape.y,t=cycle*span;
 if(uFogShape.z<.5){
  float gradient=smoothstep(.02,1.,p.y/SIZE.y+.08*min(span,1.)*sin(cycle*2.*PI*max(1.,round(span/4.))));
  return uFogShape.x*(.08+.92*gradient);
 }
 float coverage=fogPatch(p,t);
 if(cycle>.65)coverage=mix(coverage,fogPatch(p,t-span),smoothstep(.65,1.,cycle));
 return uFogShape.x*(.08+.92*coverage);
}

void main(){
 vec2 uv=vec2(vUv.x,1.-vUv.y);
 float fog=fogAmount(vUv*SIZE);
 float sigma=pow(fog,1.2)*uFogOptics.x;
 vec3 color=textureLod(uScene,uv,0.).rgb;
 if(sigma>.45){
  // Separable Gaussian with mip filtering between taps. Sampling closer
  // together than one sigma avoids stepping on large, soft contours.
  float lod=max(0.,log2(max(1.,sigma*.46)));
  vec3 soft=vec3(0.);
  float total=0.;
  for(int i=-6;i<=6;i++){
   float stepSize=float(i)*.42;
   float weight=exp(-.5*stepSize*stepSize);
   soft+=textureLod(uScene,uv+uFogAxis*stepSize*sigma/SIZE,lod).rgb*weight;
   total+=weight;
  }
  color=mix(color,soft/total,smoothstep(.45,1.4,sigma));
 }
 if(uFogAxis.y>0.)color=mix(uPaper,color,exp(-fog*1.75*uFogOptics.y));
 frag=vec4(color,1.);
}`
};
const base = {"uvMode":0,"uvFadeStrength":0.73,"uvFadeWidth":290,"uvFadeSpeed":1,"comfortPower":1,"comfortHeight":100,"swingCycles":1,"swingPivot":0.5,"leanAngle":31,"leanDelay":0.032,"leanHold":0.48,"chillAmplitude":24,"chillCycles":5,"chillPause":0,"chillTrail":70,"chillOffset":0.6,"pumpCount":2,"pumpAmount":0.04,"pumpWidth":0.1,"heavySnowOn":0,"heavySnowCap":46,"heavySnowLoad":0.65,"heavySnowShed":1,"garlandOn":0,"garlandTopDepth":42,"garlandDepth":2.4,"garlandTilt":0.25,"garlandLights":0,"drizzleOn":0,"drizzleDepth":1.35,"drizzleSpacing":14,"drizzleCycles":8,"hailOn":0,"hailDepth":0.7,"hailWidth":36,"hailCount":3,"hailElastic":0.5,"blizzardOn":0,"blizzardDensity":0.5,"blizzardSize":0.4,"blizzardForce":1,"blizzardAngle":-22,"superDay":0,"garlandSag":85,"garlandFlutter":58,"dayMode":0,"dayPower":0.8,"meltTop":0.85,"meltBottom":1,"meltStretch":125,"meltWave":24,"meltSoft":6,"coldSpeed":1.2,"coldShiver":0.91,"coldElastic":0.28,"coldDry":0.4,"mixRainOpacity":0.4,"mixRainSpeed":0.8,"mixRainLength":1.25,"strongRest":32,"strongSpeed":1.65,"strongGust":1,"strongDirection":1,"strongFlight":1,"strongStreams":1,"flagFlutter":3,"squallKick":0.85,"fog":0,"fogSpeed":0.55,"fogMode":1,"fogSize":1,"fogVeil":1,"rippleForce":1,"rippleRadius":110,"rippleSpacing":8.7,"rainFallSpeed":1,"rainCount":24,"windForce":1,"windFrequency":2,"windFlex":1,"windChaos":0.6,"goose":0,"gooseDepth":2,"gooseFrequency":8,"gooseSpacing":12,"snowSpeed":0.8,"snowDensity":1,"snowWind":0.15,"snowBlur":0.65,"snowGust":0.55,"tempMode":-2,"tempPower":0.7,"rain":0,"snow":0,"windMode":0,"storm":0,"stormToothWidth":34,"stormVariety":0.32,"stormPause":0.075,"strength":1,"duration":6,"fogCount":5,"fogBlur":22,"fogSoft":0.25,"fogHold":0.2,"fogDelay":0.05,"scale":0.4,"density":0.5,"chaos":0.45,"angle":0,"elastic":0.5,"depth":1.35,"spacing":14,"frequency":8,"amplitude":48,"split":0.5,"curl":0.8,"trail":12,"rowPhase":0.6,"jumpSpeed":2,"landingSpeed":1,"height":70,"delay":0.035,"squash":0.32,"x":28,"y":32,"stretch":0.22,"phase":0.6,"rotation":0.2,"seed":42};
const presets = {
  "Прохлада": {},
  "Холод": {
    "coldSpeed": 1.7,
    "coldShiver": 1,
    "tempPower": 1
  },
  "Жара": {
    "meltTop": 0.78,
    "meltBottom": 0.85,
    "meltStretch": 80,
    "meltWave": 29,
    "meltSoft": 12,
    "tempMode": 2,
    "tempPower": 0.52
  },
  "Ветер": {
    "meltTop": 0.78,
    "meltBottom": 0.85,
    "meltStretch": 80,
    "meltWave": 29,
    "meltSoft": 12,
    "strongRest": 0,
    "rippleForce": 1.4,
    "rippleRadius": 109,
    "rippleSpacing": 5.7,
    "rainFallSpeed": 3,
    "rainCount": 80,
    "windForce": 0.77,
    "snowSpeed": 4,
    "snowDensity": 2.1,
    "snowWind": 0.65,
    "snowBlur": 1,
    "snowGust": 0,
    "tempMode": 0,
    "tempPower": 0.52,
    "windMode": 2
  },
  "Холод и дождь": {
    "meltTop": 0.78,
    "meltBottom": 0.85,
    "meltStretch": 80,
    "meltWave": 29,
    "meltSoft": 12,
    "coldSpeed": 2.1,
    "coldShiver": 0.76,
    "strongRest": 0,
    "rippleForce": 1.4,
    "rippleRadius": 89,
    "rippleSpacing": 5.7,
    "rainCount": 28,
    "windForce": 0.77,
    "snowSpeed": 4,
    "snowDensity": 2.1,
    "snowWind": 0.65,
    "snowBlur": 1,
    "snowGust": 0,
    "tempPower": 0.43,
    "rain": 0.65
  },
  "Холод, дождь и ветер": {
    "meltTop": 0.78,
    "meltBottom": 0.85,
    "meltStretch": 80,
    "meltWave": 29,
    "meltSoft": 12,
    "coldSpeed": 2.1,
    "coldShiver": 0.76,
    "strongRest": 0,
    "rippleForce": 1.4,
    "rippleRadius": 89,
    "rippleSpacing": 5.7,
    "rainCount": 65,
    "windForce": 0.28,
    "windFrequency": 5,
    "snowSpeed": 4,
    "snowDensity": 2.1,
    "snowWind": 0.65,
    "snowBlur": 1,
    "snowGust": 0,
    "tempPower": 0.43,
    "rain": 0.65,
    "windMode": 2
  },
  "Холод и снег": {
    "meltTop": 0.78,
    "meltBottom": 0.85,
    "meltStretch": 80,
    "meltWave": 29,
    "meltSoft": 12,
    "coldSpeed": 2.1,
    "coldShiver": 0.76,
    "strongRest": 0,
    "rippleForce": 1.4,
    "rippleRadius": 89,
    "rippleSpacing": 5.7,
    "rainCount": 65,
    "windForce": 0.28,
    "windFrequency": 5,
    "snowSpeed": 4.6,
    "snowDensity": 2.85,
    "snowWind": 0.65,
    "snowBlur": 1,
    "snowGust": 0.8,
    "tempPower": 0.8,
    "snow": 0.55
  },
  "Снег и ветер": {
    "meltTop": 0.78,
    "meltBottom": 0.85,
    "meltStretch": 80,
    "meltWave": 29,
    "meltSoft": 12,
    "coldSpeed": 2.1,
    "coldShiver": 0.76,
    "strongRest": 0,
    "rippleForce": 1.4,
    "rippleRadius": 89,
    "rippleSpacing": 5.7,
    "rainCount": 65,
    "windForce": 1.28,
    "windFrequency": 4,
    "snowSpeed": 4.6,
    "snowDensity": 2.85,
    "snowWind": 0.65,
    "snowBlur": 1,
    "snowGust": 0.8,
    "tempMode": 0,
    "tempPower": 0.8,
    "snow": 0.55,
    "windMode": 1
  },
  "Снег и УФ": {
    "uvMode": 1,
    "uvFadeStrength": 0.8,
    "uvFadeSpeed": 2,
    "meltTop": 0.78,
    "meltBottom": 0.85,
    "meltStretch": 80,
    "meltWave": 29,
    "meltSoft": 12,
    "coldSpeed": 2.1,
    "coldShiver": 0.76,
    "strongRest": 0,
    "rippleForce": 1.4,
    "rippleRadius": 89,
    "rippleSpacing": 5.7,
    "rainCount": 65,
    "windForce": 1.28,
    "windFrequency": 4,
    "snowSpeed": 4.6,
    "snowDensity": 2.85,
    "snowWind": 0.65,
    "snowBlur": 1,
    "snowGust": 0.8,
    "tempMode": 0,
    "tempPower": 0.8,
    "snow": 0.55
  },
  "УФ": {
    "uvMode": 1,
    "uvFadeStrength": 1,
    "uvFadeSpeed": 3,
    "meltTop": 0.78,
    "meltBottom": 0.85,
    "meltStretch": 80,
    "meltWave": 29,
    "meltSoft": 12,
    "coldSpeed": 2.1,
    "coldShiver": 0.76,
    "strongRest": 0,
    "rippleForce": 1.4,
    "rippleRadius": 89,
    "rippleSpacing": 5.7,
    "rainCount": 65,
    "windForce": 1.28,
    "windFrequency": 4,
    "snowSpeed": 4.6,
    "snowDensity": 2.85,
    "snowWind": 0.65,
    "snowBlur": 1,
    "snowGust": 0.8,
    "tempMode": 0,
    "tempPower": 0.8
  },
  "Гроза": {
    "uvFadeStrength": 1,
    "uvFadeSpeed": 3,
    "meltTop": 0.78,
    "meltBottom": 0.85,
    "meltStretch": 80,
    "meltWave": 29,
    "meltSoft": 12,
    "coldSpeed": 2.1,
    "coldShiver": 0.76,
    "strongRest": 0,
    "rippleForce": 1.4,
    "rippleRadius": 89,
    "rippleSpacing": 5.7,
    "rainCount": 65,
    "windForce": 1.28,
    "windFrequency": 4,
    "snowSpeed": 4.6,
    "snowDensity": 2.85,
    "snowWind": 0.65,
    "snowBlur": 1,
    "snowGust": 0.8,
    "tempMode": 0,
    "tempPower": 0.8,
    "storm": 1,
    "stormToothWidth": 20,
    "stormVariety": 0.75,
    "stormPause": 0.13
  },
  "Станет приятнее — до зелёного уровня": {
    "comfortPower": 0.63,
    "comfortHeight": 66,
    "chillCycles": 2,
    "chillPause": 42,
    "pumpAmount": 0.075,
    "pumpWidth": 0.15,
    "superDay": 1,
    "coldSpeed": 1,
    "coldShiver": 0.8,
    "tempMode": 0,
    "delay": 0.085,
    "squash": 0.18
  },
  "Станет приятнее — без зелёного уровня": {
    "comfortPower": 0.38,
    "comfortHeight": 0,
    "chillCycles": 2,
    "chillPause": 42,
    "pumpAmount": 0.075,
    "pumpWidth": 0.15,
    "superDay": 1,
    "coldSpeed": 1,
    "coldShiver": 0.8,
    "tempMode": 0,
    "jumpSpeed": 1,
    "delay": 0.085,
    "squash": 0.26
  },
  "день — подарок небес": {
    "comfortHeight": 66,
    "chillCycles": 2,
    "chillPause": 42,
    "pumpAmount": 0.075,
    "pumpWidth": 0.15,
    "superDay": 1,
    "coldSpeed": 1,
    "coldShiver": 0.8,
    "tempMode": 0,
    "jumpSpeed": 4,
    "delay": 0.07,
    "squash": 0.08
  },
  "Станет неприятнее": {
    "comfortHeight": 64,
    "leanDelay": 0.015,
    "leanHold": 0.5,
    "chillCycles": 2,
    "chillPause": 42,
    "pumpAmount": 0.075,
    "pumpWidth": 0.15,
    "dayMode": 2,
    "dayPower": 0.25,
    "coldSpeed": 1,
    "coldShiver": 0.8,
    "tempMode": 0,
    "jumpSpeed": 4,
    "delay": 0.115,
    "squash": 0.06,
    "seed": 3607
  },
  "День с переменами": {
    "comfortHeight": 64,
    "swingCycles": 2,
    "leanDelay": 0.015,
    "leanHold": 0.5,
    "chillCycles": 2,
    "chillPause": 42,
    "pumpAmount": 0.075,
    "pumpWidth": 0.15,
    "dayMode": 1,
    "dayPower": 1,
    "coldSpeed": 1,
    "coldShiver": 0.8,
    "tempMode": 0,
    "jumpSpeed": 4,
    "delay": 0.115,
    "squash": 0.06,
    "seed": 3607
  },
  "весь день хорошо": {
    "comfortPower": 0.82,
    "comfortHeight": 40,
    "chillCycles": 2,
    "chillPause": 42,
    "pumpAmount": 0.075,
    "pumpWidth": 0.15,
    "superDay": 1,
    "coldSpeed": 1,
    "coldShiver": 0.8,
    "tempMode": 0,
    "jumpSpeed": 4,
    "delay": 0.07,
    "squash": 0.02
  },
  "будьте осторожны, ладно?": {
    "chillCycles": 2,
    "chillPause": 42,
    "pumpAmount": 0.12,
    "pumpWidth": 0.15,
    "superDay": 5,
    "coldSpeed": 1,
    "coldShiver": 0.8,
    "tempMode": 0
  },
  "день такой никакой": {
    "swingPivot": 0.8,
    "leanAngle": 46,
    "leanDelay": 0,
    "chillAmplitude": 14,
    "chillCycles": 3,
    "chillPause": 71,
    "chillTrail": 34,
    "chillOffset": 2.32,
    "pumpCount": 1,
    "pumpAmount": 0.05,
    "pumpWidth": 0.26,
    "dayPower": 0.57,
    "meltBottom": 0,
    "meltStretch": 67,
    "meltWave": 0,
    "meltSoft": 0,
    "coldSpeed": 1,
    "coldShiver": 0.8,
    "squallKick": 1,
    "windForce": 0.1,
    "windFrequency": 1,
    "windFlex": 0,
    "windChaos": 1,
    "tempMode": 0,
    "windMode": 3
  },
  "день проверки на прочность": {
    "chillAmplitude": 40,
    "chillTrail": 65,
    "chillOffset": 0.5,
    "pumpAmount": 0.075,
    "pumpWidth": 0.15,
    "dayMode": 3,
    "coldSpeed": 1,
    "coldShiver": 0.8,
    "tempMode": 0
  },
  "Слабый дождь": {
    "meltTop": 0.78,
    "meltBottom": 0.85,
    "meltStretch": 80,
    "meltWave": 29,
    "meltSoft": 12,
    "rippleForce": 1.89,
    "rippleRadius": 96,
    "rippleSpacing": 6.3,
    "rainCount": 9,
    "tempMode": 0,
    "tempPower": 0.52,
    "rain": 0.44
  },
  "Дождь": {
    "meltTop": 0.78,
    "meltBottom": 0.85,
    "meltStretch": 80,
    "meltWave": 29,
    "meltSoft": 12,
    "rippleForce": 2,
    "rippleRadius": 108,
    "rippleSpacing": 5.9,
    "rainFallSpeed": 2,
    "rainCount": 74,
    "tempMode": 0,
    "tempPower": 0.52,
    "rain": 0.59
  },
  "Сильный дождь": {
    "meltTop": 0.78,
    "meltBottom": 0.85,
    "meltStretch": 80,
    "meltWave": 29,
    "meltSoft": 12,
    "rippleForce": 1.4,
    "rippleRadius": 109,
    "rippleSpacing": 5.7,
    "rainFallSpeed": 3,
    "rainCount": 80,
    "tempMode": 0,
    "tempPower": 0.52,
    "rain": 0.6
  },
  "Слабый снег": {
    "meltTop": 0.78,
    "meltBottom": 0.85,
    "meltStretch": 80,
    "meltWave": 29,
    "meltSoft": 12,
    "rippleForce": 1.4,
    "rippleRadius": 109,
    "rippleSpacing": 5.7,
    "rainFallSpeed": 3,
    "rainCount": 80,
    "snowSpeed": 1.1,
    "snowDensity": 0.25,
    "snowWind": 0.1,
    "snowBlur": 0.5,
    "snowGust": 0,
    "tempMode": 0,
    "tempPower": 0.52,
    "snow": 0.65
  },
  "Снег": {
    "meltTop": 0.78,
    "meltBottom": 0.85,
    "meltStretch": 80,
    "meltWave": 29,
    "meltSoft": 12,
    "rippleForce": 1.4,
    "rippleRadius": 109,
    "rippleSpacing": 5.7,
    "rainFallSpeed": 3,
    "rainCount": 80,
    "snowSpeed": 3.7,
    "snowDensity": 0.25,
    "snowWind": 0.25,
    "snowBlur": 0.5,
    "snowGust": 0,
    "tempMode": 0,
    "tempPower": 0.52,
    "snow": 0.68
  },
  "Сильный снег": {
    "meltTop": 0.78,
    "meltBottom": 0.85,
    "meltStretch": 80,
    "meltWave": 29,
    "meltSoft": 12,
    "rippleForce": 1.4,
    "rippleRadius": 109,
    "rippleSpacing": 5.7,
    "rainFallSpeed": 3,
    "rainCount": 80,
    "snowSpeed": 4,
    "snowDensity": 2.1,
    "snowWind": 0.65,
    "snowBlur": 1,
    "snowGust": 0,
    "tempMode": 0,
    "tempPower": 0.52,
    "snow": 0.58
  }
};

const normalize = text => text.toLowerCase().replaceAll('ё','е').replace(/\s+/g,' ').trim();
const titles = new Map();
for (const [group, variants] of Object.entries(titleCatalog)) {
  for (const title of variants) {
    const key = normalize(title);
    const name = group === 'Особенные и дефолтные состояния' ? key : group;
    if (Object.hasOwn(presets,name)) titles.set(key,{...base,...presets[name]});
  }
}
const W=1920,H=806,DIRECT_RAIN_HITS=72;
const state={effect:60,mode:'text',ink:'#000000',paper:'#ffffff',params:{}};
let phase=0,rainPass=0,ready=false,gl,program,particles,texture,glyphTexture,fogProgram,fogTarget,fogScratch,rainProgram,rainTarget,pointBuffer,pointCount=0,glyphs=[],glyphOverflow=false,hits=[],topHits=[],sites=[],rowBounds=[],rowEdges=[],swingFrame=[W/2,H/2,0],quality=.5;
const recording=false;
let canvas=document.createElement('canvas');
const mask=document.createElement('canvas');
const rgba=s=>[parseInt(s.slice(1,3),16)/255,parseInt(s.slice(3,5),16)/255,parseInt(s.slice(5,7),16)/255];
function random(n,seed){let x=Math.sin(n*127.1+seed*311.7)*43758.5453;return x-Math.floor(x)}
let parallelCompile;
let linking=[];
function compile(type,source){
 const shader=gl.createShader(type);
 gl.shaderSource(shader,source);gl.compileShader(shader);
 return shader;
}
function checkLink(program){
 if(!gl.getProgramParameter(program,gl.LINK_STATUS))throw Error(gl.getProgramInfoLog(program)||'Title shader link failed');
}
function link(vertex,fragment){
 const program=gl.createProgram(),vs=compile(gl.VERTEX_SHADER,vertex),fs=compile(gl.FRAGMENT_SHADER,fragment);
 gl.attachShader(program,vs);gl.attachShader(program,fs);gl.linkProgram(program);
 gl.deleteShader(vs);gl.deleteShader(fs);
 if(parallelCompile)linking.push(program);else checkLink(program);
 return program;
}
function programsReady(){
 if(!linking.length)return true;
 if(!linking.every(p=>gl.getProgramParameter(p,parallelCompile.COMPLETION_STATUS_KHR)))return false;
 linking.forEach(checkLink);linking=[];
 return true;
}
const locations=new WeakMap();
function loc(program,name){
 let uniforms=locations.get(program);
 if(!uniforms){uniforms=new Map();locations.set(program,uniforms);}
 if(!uniforms.has(name)) uniforms.set(name,gl.getUniformLocation(program,name));
 return uniforms.get(name);
}
function renderTarget(width,height,format,type,filter){
 const image=gl.createTexture();
 gl.bindTexture(gl.TEXTURE_2D,image);
 gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,filter);
 gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MAG_FILTER,gl.LINEAR);
 gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_S,gl.CLAMP_TO_EDGE);
 gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_T,gl.CLAMP_TO_EDGE);
 gl.texImage2D(gl.TEXTURE_2D,0,format,width,height,0,gl.RGBA,type,null);
 const framebuffer=gl.createFramebuffer();
 gl.bindFramebuffer(gl.FRAMEBUFFER,framebuffer);
 gl.framebufferTexture2D(gl.FRAMEBUFFER,gl.COLOR_ATTACHMENT0,gl.TEXTURE_2D,image,0);
 const complete=gl.checkFramebufferStatus(gl.FRAMEBUFFER)===gl.FRAMEBUFFER_COMPLETE;
 gl.bindFramebuffer(gl.FRAMEBUFFER,null);
 if(!complete){
  gl.deleteFramebuffer(framebuffer);
  gl.deleteTexture(image);
  return null;
 }
 return {image,framebuffer,width,height};
}
function renderRainField(c,shape){
 gl.bindFramebuffer(gl.FRAMEBUFFER,rainTarget.framebuffer);
 gl.viewport(0,0,rainTarget.width,rainTarget.height);
 gl.clearBufferfv(gl.COLOR,0,[0,0,0,0]);
 gl.enable(gl.BLEND);
 gl.blendFunc(gl.ONE,gl.ONE);
 gl.useProgram(rainProgram);
 gl.uniform1f(loc(rainProgram,'uPhase'),phase);
 gl.uniform1i(loc(rainProgram,'uRainPass'),recording?-1:rainPass);
 gl.uniform1f(loc(rainProgram,'uSeed'),c.seed);
 gl.uniform1i(loc(rainProgram,'uHitCount'),c.rainCount);
 gl.uniform4fv(loc(rainProgram,'uRainShape'),shape);
 gl.uniform4fv(loc(rainProgram,'uHits[0]'),Float32Array.from(hits));
 gl.drawArraysInstanced(gl.TRIANGLE_STRIP,0,4,c.rainCount);
 gl.disable(gl.BLEND);
}
function renderFog(c){
 gl.activeTexture(gl.TEXTURE2);
 gl.useProgram(fogProgram);
 gl.uniform1i(loc(fogProgram,'uScene'),2);
 gl.uniform1f(loc(fogProgram,'uPhase'),phase);
 gl.uniform3fv(loc(fogProgram,'uPaper'),rgba(state.paper));
 gl.uniform4fv(loc(fogProgram,'uFogShape'),[c.fog,c.fogSpeed*c.duration,c.fogMode,c.fogSize]);
 gl.uniform2f(loc(fogProgram,'uFogOptics'),c.fogBlur,c.fogVeil);
 if(c.fogBlur>.45){
  gl.bindFramebuffer(gl.FRAMEBUFFER,fogScratch.framebuffer);
  gl.bindTexture(gl.TEXTURE_2D,fogTarget.image);
  gl.generateMipmap(gl.TEXTURE_2D);
  gl.uniform2f(loc(fogProgram,'uFogAxis'),1,0);
  gl.drawArrays(gl.TRIANGLES,0,3);
 }
 gl.bindFramebuffer(gl.FRAMEBUFFER,null);
 gl.bindTexture(gl.TEXTURE_2D,c.fogBlur>.45?fogScratch.image:fogTarget.image);
 gl.generateMipmap(gl.TEXTURE_2D);
 gl.uniform2f(loc(fogProgram,'uFogAxis'),0,1);
 gl.drawArrays(gl.TRIANGLES,0,3);
 gl.activeTexture(gl.TEXTURE0);
}
function initGL(){
 gl=canvas.getContext('webgl2',{alpha:false,antialias:false,preserveDrawingBuffer:false,failIfMajorPerformanceCaveat:true});
 if(!gl)return false;
 parallelCompile=gl.getExtension('KHR_parallel_shader_compile');
 program=link(sources.vertexShader,sources.fragmentShader);
 if([...titles.values()].some(c=>c.blizzardOn))particles=link(sources.particleVertex,sources.particleFragment);
 if(gl.getExtension('EXT_color_buffer_float')){
   rainProgram=link(sources.rainVertex,sources.rainFragment);
   rainTarget=renderTarget(W/2,H/2,gl.RGBA16F,gl.HALF_FLOAT,gl.LINEAR);
 }
 texture=gl.createTexture();gl.bindTexture(gl.TEXTURE_2D,texture);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,gl.NEAREST);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MAG_FILTER,gl.NEAREST);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_S,gl.CLAMP_TO_EDGE);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_T,gl.CLAMP_TO_EDGE);glyphTexture=gl.createTexture();
 gl.bindTexture(gl.TEXTURE_2D,glyphTexture);
 gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,gl.NEAREST);
 gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MAG_FILTER,gl.NEAREST);
pointBuffer=gl.createBuffer();return true;
}
function distance(mask,w,h,target){let d=new Float32Array(w*h);for(let i=0;i<d.length;i++)d[i]=(mask[i]>127)===target?0:1e5;for(let y=0;y<h;y++)for(let x=0;x<w;x++){let i=y*w+x,v=d[i];if(x)v=Math.min(v,d[i-1]+1);if(y){v=Math.min(v,d[i-w]+1);if(x)v=Math.min(v,d[i-w-1]+1.41421356);if(x<w-1)v=Math.min(v,d[i-w+1]+1.41421356)}d[i]=v}for(let y=h-1;y>=0;y--)for(let x=w-1;x>=0;x--){let i=y*w+x,v=d[i];if(x<w-1)v=Math.min(v,d[i+1]+1);if(y<h-1){v=Math.min(v,d[i+w]+1);if(x)v=Math.min(v,d[i+w-1]+1.41421356);if(x<w-1)v=Math.min(v,d[i+w+1]+1.41421356)}d[i]=v}return d}
function measureSwingFrame(points){
 if(!points.length)return [W/2,H/2,0];
 let left=W,right=0,top=H,bottom=0;
 for(const [x,y] of points){
  left=Math.min(left,x);right=Math.max(right,x);
  top=Math.min(top,y);bottom=Math.max(bottom,y);
 }
 const cx=(left+right)*.5,cy=(top+bottom)*.5;
 const halfWidth=(right-left)*.5+4,halfHeight=(bottom-top)*.5+4;
 const roomX=Math.min(cx,W-cx)-4,roomY=Math.min(cy,H-cy)-4;
 let lo=0,hi=Math.PI/15;
 for(let i=0;i<12;i++){
  const angle=(lo+hi)*.5,sin=Math.sin(angle),cos=Math.cos(angle);
  const fits=halfWidth*cos+halfHeight*sin<=roomX&&halfHeight*cos+halfWidth*sin<=roomY;
  if(fits)lo=angle;
  else hi=angle;
 }
 return [cx,cy,lo];
}

// Store an independent signed distance field for each animated glyph.
function buildGlyphTexture(alpha,sourceWidth,sourceHeight,customDraws){
 const padding=10*quality;
 const tiles=glyphs.map(([left,top,right,bottom],index)=>{
  const x=Math.floor(left*quality)-padding,y=Math.floor(top*quality)-padding;
  const width=Math.max(1,Math.ceil(right*quality)-x+padding);
  const height=Math.max(1,Math.ceil(bottom*quality)-y+padding);
  return {x,y,width,height,index};
 });
 const atlasWidth=Math.max(192,2048,...tiles.map(t=>t.width));
 let x=0,y=1,shelf=0;
 for(const tile of tiles){
  if(x+tile.width>atlasWidth){x=0;y+=shelf;shelf=0;}
  tile.u=x;tile.v=y;
  x+=tile.width;shelf=Math.max(shelf,2*tile.height+2);
 }
 const atlasHeight=y+shelf;
 const data=new Float32Array(atlasWidth*atlasHeight);
 const scratch=document.createElement('canvas');
 for(const tile of tiles){
  const {x,y,width,height,u,v,index}=tile;
  const pixels=new Uint8Array(width*height);
  if(customDraws){
   const glyph=customDraws[index];
   scratch.width=width;scratch.height=height;
   const ctx=scratch.getContext('2d',{willReadFrequently:true});
   ctx.font=layout.font;
   ctx.setTransform(quality*layout.units,0,0,quality*layout.units,quality*glyph.x-x,quality*glyph.y-y);
   ctx.fillText(glyph.ch,0,0);
   const rgba=ctx.getImageData(0,0,width,height).data;
   for(let i=0;i<pixels.length;i++)pixels[i]=rgba[i*4+3];
  }else{
   const box=glyphs[index],mid=(box[1]+box[3])*.5;
   const row=mid<rowEdges[1]?0:mid<rowEdges[2]?1:2;
   const left=Math.max(0,Math.floor(box[0]*quality));
   const right=Math.min(sourceWidth,Math.ceil(box[2]*quality));
   for(let sy=Math.max(y,rowEdges[row]*quality);sy<Math.min(y+height,sourceHeight,rowEdges[row+1]*quality);sy++){
    pixels.set(alpha.subarray(sy*sourceWidth+left,sy*sourceWidth+right),(sy-y)*width+left-x);
   }
  }
  const outside=distance(pixels,width,height,true),inside=distance(pixels,width,height,false);
  for(let j=0;j<height;j++)for(let k=0;k<width;k++){
   const at=j*width+k,a=pixels[at];
   data[(v+j)*atlasWidth+u+k]=a>0&&a<255?(.5-a/255)/quality
    :(outside[at]>0?outside[at]-.5:-(inside[at]-.5))/quality;
  }
  // The reserved atlas row holds the first visible pixel in each column.
  for(let k=0;k<width;k++){
   let j=0;
   while(j<height&&pixels[j*width+k]<128)j++;
   data[(v+height)*atlasWidth+u+k]=j<height?(y+j+.5)/quality:2*H;
  }
  // Prefix sums of alpha make a vertical motion trail a constant-cost lookup.
  for(let k=0;k<width;k++){
   let coverage=0;
   for(let j=0;j<height;j++){
    coverage+=pixels[j*width+k]/255;
    data[(v+height+2+j)*atlasWidth+u+k]=coverage;
   }
  }
  data.set([u,v,width,height,x,y],index*6);
 }
 gl.activeTexture(gl.TEXTURE3);
 gl.bindTexture(gl.TEXTURE_2D,glyphTexture);
 gl.texImage2D(gl.TEXTURE_2D,0,gl.R32F,atlasWidth,atlasHeight,0,gl.RED,gl.FLOAT,data);
 gl.activeTexture(gl.TEXTURE0);
}

let snowRows=[0,0,0];
// Visit each occupied region before adding a second impact there.
function rainHitSites(seed){
 const cells=Array.from({length:rowBounds.length*8},()=>[]);
 for(const point of sites){
  const [x,y]=point;
  const row=y<rowEdges[1]?0:y<rowEdges[2]?1:2;
  const [left,top,right,bottom]=rowBounds[row];
  const column=Math.max(0,Math.min(3,Math.floor(4*(x-left)/Math.max(1,right-left))));
  const half=y<(top+bottom)*.5?0:1;
  cells[row*8+half*4+column].push(point);
 }
 const order=cells.map((points,index)=>({points,key:random(index+503,seed)}))
  .filter(cell=>cell.points.length).sort((a,b)=>a.key-b.key);
 return Array.from({length:DIRECT_RAIN_HITS},(_,i)=>{
  if(!order.length)return [W/2,H/2];
  const {points}=order[i%order.length];
  return points[Math.floor(random(i+311,seed)*points.length)];
 });
}

function updateRandomData(){
 if(!gl)return;
 const c=state.params[state.effect];
 const candidates=state.effect===60?rainHitSites(c.seed):state.effect===18
  ?topHits.filter(p=>glyphs.some(b=>p[0]>=b[0]&&p[0]<=b[2]&&p[1]<b[1]+(b[3]-b[1])*.3))
  :sites;
 const rain=state.effect===60;
 hits=[];
 for(let i=0;i<(rain?DIRECT_RAIN_HITS:24);i++){
  const point=rain?candidates[i]:candidates.length
   ?candidates[Math.floor(random(i+311,c.seed)*candidates.length)]:[W/2,H/2];
  hits.push(...point,random(i+75,c.seed),random(i+99,c.seed));
 }
 pointCount=state.effect===60&&c.blizzardOn?26000:state.effect===11?Math.round(c.density*26000):0;let points=new Float32Array(pointCount*4);for(let i=0;i<pointCount;i++){let q=sites.length?sites[Math.floor(random(i+4,c.seed)*sites.length)]:[0,0];points.set([q[0]+random(i+17,c.seed)*3,q[1]+random(i+71,c.seed)*3,random(i+83,c.seed),random(i+101,c.seed)],i*4)}gl.bindBuffer(gl.ARRAY_BUFFER,pointBuffer);gl.bufferData(gl.ARRAY_BUFFER,points,gl.STATIC_DRAW)}
function extras(id,c){if(id===34||id===54)return[c.depth,c.spacing,c.frequency,0];if(id===52)return[c.amplitude,c.split,c.curl,c.rowPhase];if(id===17)return[c.amplitude,c.frequency,c.trail,c.rowPhase];if(id===19)return[c.height,c.delay,c.squash,c.jumpSpeed];if(id===8)return[c.x,c.y,c.stretch,c.phase];return[0,0,0,0]}
function uniforms(prog,c){gl.uniform1f(loc(prog,'uPhase'),phase);gl.uniform1f(loc(prog,'uStrength'),c.strength);gl.uniform1f(loc(prog,'uScale'),state.effect===52?c.trail:state.effect===8?c.rotation:c.scale);gl.uniform1f(loc(prog,'uDensity'),c.density);gl.uniform1f(loc(prog,'uChaos'),c.chaos);gl.uniform1f(loc(prog,'uElastic'),c.elastic);gl.uniform1f(loc(prog,'uAngle'),c.angle*Math.PI/180);gl.uniform1f(loc(prog,'uSeed'),c.seed);gl.uniform3fv(loc(prog,'uInk'),rgba(state.ink));gl.uniform3fv(loc(prog,'uPaper'),rgba(state.paper))}
// Reference motion, evaluated once per glyph. Whole harmonics close the export loop.
function windNoise(position,period){
 const i=Math.floor(position),f=position-i;
 const a=random((i%period+period)%period,0);
 const b=random(((i+1)%period+period)%period,0);
 const blend=f*f*f*(f*(f*6-15)+10);
 return a+(b-a)*blend;
}

function randomForBounce(index,seed){
 const value=Math.sin(index*127.1+seed*11.7)*43758.5453;
 return value-Math.floor(value);
}
function easedRange(start,end,value){
 const t=Math.max(0,Math.min(1,(value-start)/(end-start)));
 return t*t*(3-2*t);
}
function specialDayPose(power,i,indexInRow,hasNext,hasPrevious,c=base){
 const [left,top,right,bottom]=glyphs[i];
 const height=Math.max(1,bottom-top);
 const pose={x:0,y:0,angle:0,scaleX:1,scaleY:1,shear:0};
 const pair=Math.floor(indexInRow/2);
 const towardRight=indexInRow%2===0?hasNext:!hasPrevious;
 const neighbor=glyphs[i+(towardRight?1:-1)];
 const gap=towardRight?(hasNext?neighbor[0]-right:0):(hasPrevious?left-neighbor[2]:0);
 const direction=towardRight?1:-1;
 const time=phase-.10-c.leanDelay*(pair%5)-.045*(indexInRow%2);
 const slump=power*easedRange(0,.15,time)*(1-easedRange(c.leanHold,Math.min(.78,c.leanHold+.24),time));
 pose.x=direction*slump*(height*.047+Math.min(height*.17,Math.max(0,gap)*.75));
 pose.y=height*.14*slump;
 pose.angle=-c.leanAngle*Math.PI/180*direction*slump;
 pose.scaleY=1-.11*slump;
 pose.shear=direction*.09*slump;
 return pose;
}

function rubberJump(age,landingSpeed,brisk=false){
 const apex=brisk?.27:.35;
 const descent=(brisk?.24:.35)/landingSpeed;
 const contact=apex+descent;
 const airborne=(age-apex)/(age<apex?apex:descent);
 const main=Math.max(0,1-airborne*airborne);
 const reboundTime=(age-contact-(brisk?.018:.032))/(brisk?.13:.19);
 const rebound=Math.max(0,4*reboundTime*(1-reboundTime));
 const pulse=(center,width)=>Math.exp(-Math.pow((age-center)/width,2));
 const preload=.38*Math.max(pulse(.984,.024),pulse(-.016,.024));
 const impact=brisk?1.1*pulse(contact+.006,.018):pulse(contact+.009,.028);
 const stretch=brisk?.47*pulse(.048,.025)+.34*pulse(contact+.047,.018):
  .47*pulse(.066,.035)+.32*pulse(contact+.071,.024);
 return {lift:main+(brisk?.20:.16)*rebound,shape:stretch-impact-preload};
}

function comfortJumpOffsets(c,count){
 const offsets=new Float32Array(count);
 if(count<2||c.delay===0)return offsets;
 // A coprime stride visits each slot once and separates neighboring glyphs.
 const gcd=(a,b)=>b===0?a:gcd(b,a%b);
 let stride=1;
 for(let candidate=2;candidate<count;candidate++){
  if(gcd(candidate,count)===1&&Math.abs(candidate/count-.382)<Math.abs(stride/count-.382))
   stride=candidate;
 }
 const start=Math.floor(randomForBounce(101,c.seed)*count);
 const spread=1-Math.exp(-c.delay/.016);
 for(let i=0;i<count;i++)offsets[i]=spread*((start+i*stride)%count)/count;
 return offsets;
}

function attentionPump(c){
 const pulse=start=>easedRange(start,start+c.pumpWidth*.24,phase)
  *(1-easedRange(start+c.pumpWidth*.31,start+c.pumpWidth,phase));
 return c.pumpAmount*(pulse(.14)+(c.pumpCount===2?.85*pulse(.41):0));
}

function snowCapPose(c){
 const buildup=easedRange(.05,.53,phase);
 const fall=Math.max(0,Math.min(1,(phase-.65)*c.heavySnowShed/.16));
 return {buildup,fall};
}

function uploadGlyphMotion(c,amount,elasticity,wind,squall,comfort,day,superDay,snowLoad){
 const TAU=2*Math.PI, t=TAU*(phase%1), speed=c.coldSpeed*c.duration/TAU;
 const wave=(rate,offset)=>Math.sin(t*Math.round(rate*speed)+offset);
 const airSpeed=c.strongSpeed*c.duration/TAU;
 const gustPeriod=Math.max(1,Math.round(c.strongSpeed*c.duration*.36));
 const gustTime=c.strongSpeed>0?(phase%1)*gustPeriod:0;
 const shifts=new Float32Array(32*4), matrices=new Float32Array(32*4), bends=new Float32Array(32*4);
 const rowOf=box=>{const y=(box[1]+box[3])*.5;return y<rowEdges[1]?0:y<rowEdges[2]?1:2;};
 const rowIndices=[0,0,0];
 const pump=superDay===5?attentionPump(c):0;
 const jumpOffsets=superDay===1&&comfort>.001?comfortJumpOffsets(c,glyphs.length):null;
 glyphs.forEach(([left,top,right,bottom],i)=>{
  const seed=i+1, random=Math.sin(seed*127.1)*43758.5453;
  const rnd=random-Math.floor(random), offset=seed*2.399963;
  const ramp=Math.max(0,Math.min(1,(wave(1.8+rnd,offset)+.5)/1.3));
  const burst=.35+.65*ramp*ramp*(3-2*ramp);
  const size=Math.max(1,bottom-top)/.72, shake=amount*c.coldShiver*burst;
  let dx=(wave(27+rnd*12,offset)+.28*wave(53,offset*2.1))*shake*size*.024;
  let dy=(wave(32+rnd*9,offset*1.7)+.28*wave(47,offset*2.7))*shake*size*.024;
  const spring=wave(12+rnd*5,offset)*burst*amount*elasticity*.115;
  let angle=wave(21+rnd*8,offset)*shake*.018;
  let sy=1+spring, shear=spring*.24;
  let sweep=0,curl=0;
  if(wind>.001){
   const pulse=windNoise(gustTime-(seed%11)*.045,gustPeriod);
   const push=.32*(1-c.strongGust)+(.12+3*pulse*pulse)*c.strongGust;
   const flutter=Math.sin(t*Math.round((2.1+rnd)*airSpeed)+offset)*.09;
   const w=wind*c.strongFlight;
   const room=c.strongDirection>=0?W-right:left;
   const limit=Math.min(185,Math.max(1,room-14));
   dx+=limit*Math.tanh(w*c.strongDirection*size*.95*Math.max(0,push+flutter)/limit);
   dy+=w*size*.035*Math.sin(t*Math.round(.8*airSpeed)+offset)*push;
   angle+=w*c.strongDirection*(.06+.05*rnd)*push;
   shear+=w*c.strongDirection*.075*push/sy;
  }
  if(squall>.001){
   const rate=c.windFrequency*c.flagFlutter;
   const swing=t*Math.max(1,rate+(i%3)-1)+offset*(.4+.6*c.windChaos)+c.seed*.07;
   const cross=t*(rate+1)+offset*1.67;
   const gust=.62+.38*Math.pow(.5+.5*Math.sin(t*c.windFrequency+offset*.73),1.08);
   const energy=squall*gust;
   const kick=c.squallKick;
   const whip=Math.sin(swing)+kick*.32*Math.sin(swing*2+offset);
   dx+=energy*size*(.15*whip+.08*c.windChaos*Math.sin(cross));
   dy+=energy*size*(.12*Math.cos(cross)+.055*Math.sin(swing*2));
   angle+=energy*(.24*Math.sin(swing+.8)+.13*kick*Math.cos(cross));
   sy*=1+energy*.085*Math.sin(cross+.7);
   sweep=energy*c.windFlex*size*.25*whip;
   curl=energy*c.windFlex*size*.23*Math.sin(cross+1.2);
  }
  let sx=1/sy;
  if(comfort>.001){
   const brisk=superDay===1;
   const offset=brisk?jumpOffsets[i]:(i*c.delay+c.chaos*randomForBounce(i,c.seed)*.12)*c.jumpSpeed;
   const jumpClock=phase*c.jumpSpeed-offset;
   const age=jumpClock-Math.floor(jumpClock);
   const jump=rubberJump(age,c.landingSpeed,brisk);
   const stretch=Math.max(.45,1+comfort*c.squash*jump.shape);
   dy-=comfort*(superDay===1?c.comfortHeight:superDay===2?62:c.height)*jump.lift;
   dy+=(top-bottom)*.5*(stretch-1);
   sy*=stretch;
   sx/=Math.sqrt(stretch);
  }
  const height=bottom-top;
  if(superDay===3){
   const amount=.02+.18*rnd;
   const scale=1+amount*Math.sin(t*(1+i%2)+offset);
   sx*=scale;sy*=scale;dy-=height*(scale-1)*.5;
  }else if(pump>0){
   sx*=1+pump;
   sy*=1+pump;
  }
  if(snowLoad>0){
   const compression=snowLoad*.16;
   sx*=1+snowLoad*.18;
   sy*=1-compression;
   dy+=height*compression*.5;
   const row=rowOf(glyphs[i]),[rowLeft,,rowRight]=rowBounds[row];
   dx+=((left+right-rowLeft-rowRight)*.5)*snowLoad*.035;
  }
  if(day>.001){
   const row=rowOf(glyphs[i]),indexInRow=rowIndices[row]++;
   const hasPrevious=i>0&&rowOf(glyphs[i-1])===row;
   const hasNext=i+1<glyphs.length&&rowOf(glyphs[i+1])===row;
   const pose=specialDayPose(day,i,indexInRow,hasNext,hasPrevious,c);
   dx+=pose.x;
   dy+=pose.y;
   angle+=pose.angle;
   sx*=pose.scaleX;
   sy*=pose.scaleY;
   shear+=pose.shear;
  }
  bends.set([sweep,curl,0,0],i*4);
  const sn=Math.sin(angle), cs=Math.cos(angle);
  // Inverse of the reference rotation, shear and volume-preserving scale.
  const a=(cs-shear*sn)/sx, b=(-sn-shear*cs)/sx, d=sn/sy, e=cs/sy;
  // Bound the forward transform, including the outline sampling margin.
  const determinant=Math.abs(a*e-b*d);
  const halfWidth=(right-left)*.5+Math.abs(sweep)+Math.abs(curl)+4;
  const halfHeight=(bottom-top)*.5+4;
  shifts.set([(left+right)*.5+dx,(top+bottom)*.5+dy,
   (Math.abs(e)*halfWidth+Math.abs(b)*halfHeight)/determinant+6,
   (Math.abs(d)*halfWidth+Math.abs(a)*halfHeight)/determinant+6],i*4);
  matrices.set([a,b,d,e],i*4);
 });
 if(!gl)return {shifts,matrices,bends};
 gl.uniform4fv(loc(program,'uColdCenter[0]'),shifts);
 gl.uniform4fv(loc(program,'uColdInverse[0]'),matrices);
 if(squall>.001)gl.uniform4fv(loc(program,'uSquallBend[0]'),bends);
}
// Choose separated spots in the composition, alternating between its rows.
function garlandLightOrder(glyphRows,rows,visibleRows){
 const targets=[[.08,0],[.52,1],[.90,0]];
 const positions=glyphs.map(([l,,r],i)=>{
  const row=rows[glyphRows[i]];
  return [((l+r)*.5-row.left)/Math.max(1,row.right-row.left),
   visibleRows.indexOf(row)/Math.max(1,visibleRows.length-1)];
 });
 const order=[];
 for(const [x,y] of targets){
  if(order.length===positions.length)break;
  let nearest=-1,best=Infinity;
  positions.forEach(([u,v],i)=>{
   if(order.includes(i))return;
   const distance=(x-u)**2+.65*(y-v)**2;
   if(distance<best){nearest=i;best=distance;}
  });
  order.push(nearest);
 }
 return order;
}

function uploadGarland(c){
 const center=new Float32Array(128),optics=new Float32Array(128);
 if(glyphs.length){
  const top=Math.min(...glyphs.map(b=>b[1])),bottom=Math.max(...glyphs.map(b=>b[3]));
  const flutter=c.garlandFlutter/100,clock=2*Math.PI*phase;
  const rowOf=([,t,,b])=>(t+b)/2<rowEdges[1]?0:(t+b)/2<rowEdges[2]?1:2;
  const rows=rowBounds.map(([left,top,right,bottom],row)=>{
   const bottoms=glyphs.filter(box=>rowOf(box)===row).map(box=>box[3]).sort((a,b)=>a-b);
   return {left,right,count:bottoms.length,baseline:bottoms[Math.floor(bottoms.length/2)]??bottom,active:bottoms.length>0};
  });
  const visibleRows=rows.filter(row=>row.active);
  const sag=Math.min(c.garlandSag,Math.max(0,H-(bottom-top)-70)/1.05);
  const deepest=sag*(1+.05*flutter*Math.sin(clock));
  const upper=c.garlandTopDepth/100,lower=c.garlandDepth/2.4;
  const shift=(H-top-bottom-deepest)*.5;
  const glyphRows=glyphs.map(rowOf);
  const lights=c.garlandLights?garlandLightOrder(glyphRows,rows,visibleRows):[];
  const cursor=phase*lights.length;
  glyphs.forEach(([l,,r],i)=>{
   const x=(l+r)*.5;
   const row=rows[glyphRows[i]];
   const half=Math.max(1,(row.right-row.left)*.5);
   const u=Math.max(-1,Math.min(1,(x-row.left-half)/half));
   const offset=u*4.6;
   const rank=visibleRows.indexOf(row);
   const ratio=visibleRows.length===1?upper:upper+(lower-upper)*rank/(visibleRows.length-1);
   const depth=Math.min(deepest*ratio,half*.36);
   const angle=c.garlandTilt*Math.atan2(-2*depth*u,Math.max(210,half));
   const sway=flutter*(Math.sin(clock-offset)+.28*Math.sin(2*clock+offset*1.7));
   const twist=.19*Math.sin(i*2.31)+sway*.59;
   const slot=lights.indexOf(i);
   let lit=1;
   if(slot>=0){
    const age=cursor-slot;
    const cut=Math.min(.06,.045*lights.length/c.duration);
    const dark=easedRange(.13,.13+cut,age)*(1-easedRange(.42,.59,age));
    lit=1-dark;
   }
   center.set([x,row.baseline+shift+(row.count>1?depth*(1-u*u):0),Math.sin(angle),Math.cos(angle)],i*4);
   optics.set([Math.max(.5,Math.cos(twist)),row.baseline,lit,c.garlandLights],i*4);
  });
 }
 gl.uniform4fv(loc(program,'uColdCenter[0]'),center);
 gl.uniform4fv(loc(program,'uColdInverse[0]'),optics);
}
function chillRowMotion(c,power){
 const offsets=[0,0,0],smears=[0,0,0];
 if(power<=0)return {offsets,smears};
 const rows=rowBounds.map((bounds,row)=>({bounds,row})).filter(({row})=>snowRows[row]);
 if(!rows.length)return {offsets,smears};
 const pause=c.chillPause/100,active=1-pause;
 const ramp=Math.min(.10,active*.24);
 const envelope=pause<=.001?1:easedRange(0,ramp,phase)*(1-easedRange(active-ramp,active,phase));
 const clock=2*Math.PI*phase*c.chillCycles/active;
 const amplitude=c.chillAmplitude*power*envelope;
 const top=rows[0].bounds[1],bottom=rows.at(-1).bounds[3];
 let stagger=amplitude;
 for(let i=1;i<rows.length;i++){
  const gap=rows[i].bounds[1]-rows[i-1].bounds[3];
  stagger=Math.min(stagger,Math.max(0,gap-4)*.45);
 }
 const common=Math.sin(clock)*(amplitude-stagger);
 const limit=(value,lo,hi)=>Math.min(Math.max(value,lo),hi);
 for(const {bounds,row} of rows){
  const angle=clock+row*c.chillOffset;
  offsets[row]=limit(common+Math.sin(angle)*stagger,2-top,H-bottom-2);
 }
 for(let i=0;i<rows.length;i++){
  const {bounds,row}=rows[i];
  const upper=rows[i-1],lower=rows[i+1];
  const top=bounds[1]+offsets[row],bottom=bounds[3]+offsets[row];
  let room=Math.min(top,H-bottom);
  if(upper)room=Math.min(room,(top-upper.bounds[3]-offsets[upper.row])*.5);
  if(lower)room=Math.min(room,(lower.bounds[1]+offsets[lower.row]-bottom)*.5);
  const angle=clock+row*c.chillOffset;
  const direction=Math.cos(angle);
  const length=Math.min(c.chillTrail*power*envelope*Math.abs(direction)*.90,Math.max(0,(room-1)/.75));
  smears[row]=Math.sign(direction)*length;
 }
 return {offsets,smears};
}

function render(){if(!ready)return;let c=state.params[state.effect];
 const superDay=state.effect===60?c.superDay:0;
 const rainShape=[c.rippleForce,c.rippleRadius,c.rippleSpacing,c.rainFallSpeed];
 const denseRain=!!rainTarget&&state.effect===60&&c.rain>0&&c.snow===0&&c.rippleForce>0&&c.rainCount>DIRECT_RAIN_HITS;
 const fog=!!fogTarget&&!!fogScratch&&(state.effect===60||state.effect===14)&&c.fog>.001;
 if(denseRain)renderRainField(c,rainShape);
 gl.bindFramebuffer(gl.FRAMEBUFFER,fog?fogTarget.framebuffer:null);
 gl.viewport(0,0,canvas.width,canvas.height);
 gl.disable(gl.BLEND);
 gl.activeTexture(gl.TEXTURE1);
 gl.bindTexture(gl.TEXTURE_2D,denseRain?rainTarget.image:texture);
 gl.activeTexture(gl.TEXTURE0);
 gl.useProgram(program);
 const uvMode=state.effect===60?c.uvMode:0;
 gl.uniform4fv(loc(program,'uUvMotion'),[uvMode,c.uvFadeStrength,c.uvFadeWidth,c.uvFadeSpeed]);
 gl.uniform1i(loc(program,'uRainField'),1);
 gl.uniform1i(loc(program,'uGlyphAtlas'),3);
 gl.uniform1i(loc(program,'uRainPass'),recording?-1:rainPass);
 gl.uniform1i(loc(program,'uRainFieldReady'),denseRain?1:0);uniforms(program,c);gl.uniform1i(loc(program,'uEffect'),state.effect);gl.uniform2f(loc(program,'uTexSize'),W*quality,H*quality);gl.uniform1i(loc(program,'uField'),0);gl.uniform1i(loc(program,'uGlyphCount'),glyphs.length);gl.uniform1i(loc(program,'uGlyphOverflow'),glyphOverflow?1:0);gl.uniform4fv(loc(program,'uGlyph[0]'),Float32Array.from(glyphs.flat().concat(Array((32-glyphs.length)*4).fill(0))));gl.uniform4fv(loc(program,'uRows[0]'),Float32Array.from(rowBounds.flat()));gl.uniform1i(loc(program,'uRowCount'),rowBounds.length);gl.uniform2f(loc(program,'uRowSplits'),rowEdges[1]??H,rowEdges[2]??H);gl.uniform1i(loc(program,'uHitCount'),state.effect===60?(c.rain>0?c.rainCount:0):Math.round(c.density*22));gl.uniform4fv(loc(program,'uWeather'),[superDay?0:c.tempMode,c.tempPower,c.rain,c.snow]);gl.uniform3fv(loc(program,'uWeatherExtra'),[superDay?0:[0,.3,.8,1.5][c.windMode],c.storm,c.goose]);
 const garland=state.effect===62||(state.effect===60&&c.garlandOn===1);
 const heavySnow=state.effect===60&&c.heavySnowOn?snowCapPose(c):null;
 const snowLoad=heavySnow?heavySnow.buildup*c.heavySnowLoad*(1-easedRange(.06,.65,heavySnow.fall)):0;
 const snowThickness=heavySnow&&heavySnow.fall<1?heavySnow.buildup*c.heavySnowCap:0;
 gl.uniform3fv(loc(program,'uHeavySnow'),[snowThickness,heavySnow?.fall??0,snowLoad]);
 if(snowThickness>0)gl.uniform3fv(loc(program,'uSnowRows'),snowRows);
 gl.uniform1f(loc(program,'uGarland'),garland?1:0);
 gl.uniform3fv(loc(program,'uDrizzle'),state.effect===60&&c.drizzleOn?[c.drizzleDepth,c.drizzleSpacing,c.drizzleCycles]:[0,14,8]);
 gl.uniform4fv(loc(program,'uHail'),state.effect===60&&c.hailOn?[c.hailDepth,c.hailWidth,c.hailCount,c.hailElastic]:[0,36,3,.5]);
 gl.uniform1f(loc(program,'uSuperDay'),superDay);
 gl.uniform1f(loc(program,'uBlizzard'),state.effect===60&&c.blizzardOn?c.blizzardForce:0);
 gl.uniform4fv(loc(program,'uThermal'),[c.meltTop,c.meltBottom,c.meltStretch,c.meltWave]);
 gl.uniform1f(loc(program,'uMeltSoft'),c.meltSoft);
 gl.uniform4fv(loc(program,'uColdGoose'),[state.effect===60&&c.drizzleOn?1:0,c.gooseDepth,c.gooseFrequency,c.gooseSpacing]);
 const cold=state.effect===61?Math.min(c.strength,1):state.effect===60&&!superDay&&c.tempMode===-2?c.tempPower:0;
 const standaloneCold=state.effect===61;
 gl.uniform2f(loc(program,'uColdShape'),cold,standaloneCold?c.coldDry:0);
 const windRest=c.strongRest/100;
 const windEnvelope=windRest===0?1:easedRange(windRest*.5,windRest*.5+.11,phase)
  *(1-easedRange(1-windRest*.5-.11,1-windRest*.5,phase));
 const strongWind=state.effect===60&&!superDay&&c.windMode===2?c.windForce*windEnvelope:0;
 const squall=state.effect===60&&!superDay&&c.windMode===3?c.windForce:0;
 const comfort=superDay===1?c.comfortPower:superDay===2?.14:!superDay&&state.effect===60&&c.tempMode===3?c.tempPower:0;
 const day=state.effect===60&&!superDay&&c.dayMode>0?c.dayPower:0;
 gl.uniform2f(loc(program,'uDayMotion'),day>0?c.dayMode:0,day);
 const seesaw=c.dayMode===1?day:0;
 const [pivotX,pivotY,limit]=swingFrame;
 const width=glyphs.length?Math.max(...glyphs.map(b=>b[2]))-Math.min(...glyphs.map(b=>b[0])):0;
 gl.uniform3fv(loc(program,'uDaySwing'),[pivotX+width*(c.swingPivot-.5),pivotY,seesaw*limit*(1-Math.abs(c.swingPivot-.5))*Math.sin(2*Math.PI*c.swingCycles*phase)]);
 const glyphDay=c.dayMode===2?day:0;
 const chill={amplitude:c.chillAmplitude,frequency:c.chillCycles,trail:c.chillTrail,rowPhase:c.chillOffset};
 const chillPower=superDay===4?.82:c.dayMode===3?day:0;
 gl.uniform4fv(loc(program,'uChill'),[chill.amplitude*chillPower,chill.frequency,chill.trail*chillPower,chill.rowPhase]);
 const chillMotion=chillRowMotion(c,chillPower);
 gl.uniform3fv(loc(program,'uChillOffset'),chillMotion.offsets);
 gl.uniform3fv(loc(program,'uChillSweep'),chillMotion.smears);
 if((state.effect===60&&c.hailOn&&c.hailDepth>.001)||cold>.001||strongWind*c.strongFlight>.001||squall>.001||comfort>.001||glyphDay>.001||seesaw>.001||chillPower>.001||(superDay>0&&superDay!==4)||(state.effect===60&&c.drizzleOn)||snowLoad>.001)uploadGlyphMotion(c,cold,standaloneCold?c.coldElastic:0,strongWind,squall,comfort,glyphDay,superDay,snowLoad);
 const period=Math.max(1,Math.round(c.strongSpeed*c.duration*.36));
 const pulse=windNoise(c.strongSpeed>0?(phase%1)*period:0,period);
 const gust=.32*(1-c.strongGust)+(.12+3*pulse*pulse)*c.strongGust;
 gl.uniform4fv(loc(program,'uStrongWind'),[strongWind,c.strongDirection,c.strongFlight,c.strongStreams]);
 gl.uniform3fv(loc(program,'uStrongAir'),[gust,c.strongSpeed*c.duration,c.duration]);
 gl.uniform3fv(loc(program,'uMixRain'),[c.mixRainSpeed,c.mixRainLength,1-c.mixRainOpacity]);
 gl.uniform1f(loc(program,'uChillPause'),c.chillPause/100);
 gl.uniform3fv(loc(program,'uStormTeeth'),[c.stormToothWidth,c.stormVariety,c.stormPause]);
 gl.uniform1f(loc(program,'uLandingSpeed'),c.landingSpeed);
 gl.uniform4fv(loc(program,'uRainShape'),rainShape);
 gl.uniform2f(loc(program,'uWindShape'),c.windForce,c.windFrequency);
 gl.uniform4fv(loc(program,'uSnowShape'),[c.snowSpeed,c.snowDensity,c.snowWind,c.snowBlur]);
 gl.uniform1f(loc(program,'uSnowGust'),c.snowGust);gl.uniform4fv(loc(program,'uHits[0]'),Float32Array.from(hits));gl.uniform4fv(loc(program,'uExtra'),extras(state.effect,c));if(garland)uploadGarland(c);
 gl.drawArrays(gl.TRIANGLES,0,3);
 if((state.effect===11||(state.effect===60&&c.blizzardOn))&&sites.length){gl.useProgram(particles);
 const blizzard=state.effect===60;
 uniforms(particles,blizzard?{...c,strength:c.blizzardForce,scale:c.blizzardSize,angle:c.blizzardAngle}:c);
 gl.uniform1i(loc(particles,'uComposite'),0);gl.uniform1f(loc(particles,'uWind'),[0,.3,.8,1.5][c.windMode]);gl.uniform1f(loc(particles,'uSnow'),c.snow);gl.uniform2f(loc(particles,'uResolution'),W,H);gl.bindBuffer(gl.ARRAY_BUFFER,pointBuffer);gl.enableVertexAttribArray(0);gl.vertexAttribPointer(0,4,gl.FLOAT,false,0,0);gl.enable(gl.BLEND);gl.blendFunc(gl.SRC_ALPHA,gl.ONE_MINUS_SRC_ALPHA);gl.drawArrays(gl.POINTS,0,state.effect===60?Math.round(c.blizzardDensity*pointCount):pointCount);gl.disable(gl.BLEND);gl.disableVertexAttribArray(0)}
 if(fog)renderFog(c);
}
const heading=document.getElementById('sheet-heading');
const title=document.getElementById('title');
const viewport=document.createElement('div');
viewport.className='title-motion-viewport';
viewport.setAttribute('aria-hidden','true');
viewport.append(canvas);
heading.append(viewport);
const reduce=matchMedia('(prefers-reduced-motion: reduce)');
let layout, raster, attemptedGL=false, raf=0, pending=0, lastFrame=0, elapsed=0, signature='', onscreen=true;
let finished=false;
let selectedPreset;
const entranceDuration=550,settleDuration=800;
const lowMemory=navigator.deviceMemory>0 && navigator.deviceMemory<=2;
const fewCores=navigator.hardwareConcurrency>0 && navigator.hardwareConcurrency<=2;
let skipMotion=lowMemory || fewCores;
let startAfter=0, previousProbe=0, probeFrames=0, lateProbeFrames=0;
let recentFrameTimes=[],earlyRestAt=null;
const strengths=['tempPower','rain','snow','storm','uvFadeStrength','windForce','comfortPower','dayPower','pumpAmount'];
const makeCanvas=()=>document.createElement('canvas');
function measureLayout(){
 const style=getComputedStyle(title);
 const rect=title.getBoundingClientRect();
 const font=style.fontWeight+' '+style.fontSize+' '+style.fontFamily;
 const rgb=style.color.match(/[\d.]+/g);
 if(rgb?.length>=3)state.ink='#'+rgb.slice(0,3).map(value=>Math.round(Number(value)).toString(16).padStart(2,'0')).join('');
 const probe=document.createElement('span');
 Object.assign(probe.style,{position:'absolute',visibility:'hidden',whiteSpace:'nowrap',font,lineHeight:style.lineHeight,margin:0,padding:0,top:0,left:0});
 const sample=document.createTextNode('Нд');
 const marker=document.createElement('i');marker.style.cssText='display:inline-block;width:0;height:0;vertical-align:baseline';
 probe.append(sample,marker);heading.append(probe);
 const range=document.createRange();
 range.selectNodeContents(sample);
 const baseline=marker.getBoundingClientRect().top-range.getBoundingClientRect().top;
 probe.remove();
 // Let glyphs travel into the sheet gutters without reaching the edge of the texture.
 const sideRoom=Math.max(32,(sheet.clientWidth-rect.width)/2);
 const units=Math.min(W/(rect.width+2*sideRoom),H/(rect.height+32));
 const padX=(W/units-rect.width)/2, padY=(H/units-rect.height)/2;
 const letters=[],rows=[];
 const ctx=mask.getContext('2d',{willReadFrequently:true});ctx.font=font;
 const node=title.firstChild;
 for(let i=0;i<node.length;){
   const ch=String.fromCodePoint(node.textContent.codePointAt(i));
   range.setStart(node,i);i+=ch.length;range.setEnd(node,i);
   if(!ch.trim())continue;
   const char=range.getBoundingClientRect();
   const x=(char.left-rect.left+padX)*units, y=(char.top-rect.top+baseline+padY)*units;
   const m=ctx.measureText(ch);
   const box=[x-m.actualBoundingBoxLeft*units,y-m.actualBoundingBoxAscent*units,x+m.actualBoundingBoxRight*units,y+m.actualBoundingBoxDescent*units];
   let row=rows.length-1;
   if(row<0 || Math.abs(rows[row].top-char.top)>1){rows.push({top:char.top,box:box.slice()});row++;}
   const bounds=rows[row].box;
   for(let k=0;k<4;k++)bounds[k]=(k<2?Math.min:Math.max)(bounds[k],box[k]);
   letters.push({ch,x,y,box,row});
 }
 const parent=heading.getBoundingClientRect();
 return {font,units,letters,rows,padX,padY,left:rect.left-parent.left,top:rect.top-parent.top};
}
function positionCanvas(){
 const {units,padX,padY,left,top}=layout;
 const w=W/units,h=H/units;
 const dpr=Math.min(3,window.devicePixelRatio||1);
 canvas.width=Math.round(w*dpr);canvas.height=Math.round(h*dpr);
 // Sample the glyph field at least as densely as the displayed pixels on touch screens.
 quality=canvas.width<=W/2?.5:canvas.width<=W?1:2;
 Object.assign(canvas.style,{left:(left-padX)+'px',top:(16+top-padY)+'px',width:w+'px',height:h+'px'});
}
function prepare(){
 rowBounds=layout.rows.map(r=>r.box);
 rowEdges=[0,...rowBounds.slice(1).map((r,i)=>Math.round((r[1]+rowBounds[i][3])/2)),H];
 snowRows=[0,1,2].map(i=>Number(i<rowBounds.length));
 glyphs=layout.letters.slice(0,32).map(g=>g.box);
 glyphOverflow=layout.letters.length>32;
 sites=[];topHits=[];
 if(!gl){
   swingFrame=measureSwingFrame(layout.letters.flatMap(({box:b})=>[[b[0],b[1]],[b[2],b[3]]]));
   return;
 }
 const w=W*quality,h=H*quality;
 mask.width=w;mask.height=h;
 const ctx=mask.getContext('2d',{willReadFrequently:true});ctx.font=layout.font;
 const scale=quality*layout.units;
 for(const {ch,x,y} of layout.letters){
   ctx.setTransform(scale,0,0,scale,x*quality,y*quality);ctx.fillText(ch,0,0);
 }
 const pixels=ctx.getImageData(0,0,w,h).data,alpha=new Uint8Array(w*h);
 for(let i=0;i<alpha.length;i++)alpha[i]=pixels[i*4+3];
 for(let y=0;y<h;y+=2)for(let x=0;x<w;x+=2)if(alpha[y*w+x]>127)sites.push([x/quality,y/quality]);
 swingFrame=measureSwingFrame(sites);
 const field=distance(alpha,w,h,true),inside=distance(alpha,w,h,false);
 for(let i=0;i<field.length;i++){
   const a=alpha[i];
   field[i]=(a>0&&a<255?.5-a/255:field[i]>0?field[i]-.5:.5-inside[i])/quality;
 }
 gl.activeTexture(gl.TEXTURE0);gl.bindTexture(gl.TEXTURE_2D,texture);
 gl.texImage2D(gl.TEXTURE_2D,0,gl.R32F,w,h,0,gl.RED,gl.FLOAT,field);
 buildGlyphTexture(alpha,w,h,layout.letters);
 updateRandomData();
}
function useFallback(){
 gl=null;linking=[];canvas.remove();canvas=makeCanvas();viewport.append(canvas);
 raster=canvas.getContext('2d');positionCanvas();
}
function paintFallback(){
 const c=state.params[60], ctx=raster;
 const sx=canvas.width/W,sy=canvas.height/H;
 const clock=phase*Math.PI*2,day=c.dayMode?c.dayPower:0;
 const rest=c.strongRest/100;
 const envelope=rest===0?1:easedRange(rest*.5,rest*.5+.11,phase)*(1-easedRange(1-rest*.5-.11,1-rest*.5,phase));
 const cold=c.tempMode===-2?c.tempPower:0;
 const comfort=c.superDay===1?c.comfortPower:0;
 const {shifts,matrices}=uploadGlyphMotion(c,cold,0,c.windMode===2?c.windForce*envelope:0,c.windMode===3?c.windForce:0,comfort,c.dayMode===2?day:0,c.superDay,0);
 const chill=chillRowMotion(c,c.dayMode===3?day:0);
 ctx.resetTransform();ctx.clearRect(0,0,canvas.width,canvas.height);
 ctx.setTransform(sx,0,0,sy,0,0);ctx.font=layout.font;
 if(c.dayMode===1){
   const [x,y,limit]=swingFrame;
   ctx.translate(x,y);ctx.rotate(day*limit*Math.sin(clock*c.swingCycles));ctx.translate(-x,-y);
 }
 for(const [i,g] of layout.letters.entries()){
   const b=g.box,mx=(b[0]+b[2])/2,my=(b[1]+b[3])/2;
   ctx.save();
   ctx.translate(0,chill.offsets[g.row]||0);
   if(i<glyphs.length){
     const off=i*4,[a,b,d,e]=matrices.subarray(off,off+4),det=a*e-b*d;
     ctx.translate(shifts[off],shifts[off+1]);ctx.transform(e/det,-d/det,-b/det,a/det,0,0);ctx.translate(-mx,-my);
   }
   const seed=random(i,c.seed);
   if(c.tempMode===2){
     const melt=(.5+.5*Math.sin(clock+seed*5))*c.tempPower;
     ctx.translate(mx,b[1]);ctx.transform(1,0,.045*melt,1+.16*melt*c.meltStretch/125,0,0);ctx.translate(-mx,-b[1]);
   }
   if(c.rain>0){
     const ripple=Math.sin(clock*Math.max(1,Math.round(c.rainFallSpeed*3))+seed*19);
     const amount=c.rain*c.rippleForce*ripple;
     ctx.translate(mx,my);ctx.transform(1+.021*amount,.016*amount,.035*amount,1-.035*amount,0,0);ctx.translate(-mx,-my);
   }
   if(c.storm){const pulse=Math.pow(Math.max(0,Math.sin(clock*3+seed*.5)),26);ctx.translate(pulse*Math.sin(i*3)*12*c.storm,0);}
   ctx.translate(g.x,g.y);ctx.scale(layout.units,layout.units);
   ctx.fillStyle=state.ink;ctx.fillText(g.ch,0,0);ctx.restore();
 }
 if(c.uvMode || c.snow){
   ctx.setTransform(sx,0,0,sy,0,0);ctx.globalCompositeOperation='source-atop';
   if(c.uvMode){
     const t=(phase*c.uvFadeSpeed)%1,p=(W+H+2*c.uvFadeWidth)*t-c.uvFadeWidth;
     const grad=ctx.createLinearGradient(p/2-c.uvFadeWidth/2,p/2-c.uvFadeWidth/2,p/2+c.uvFadeWidth/2,p/2+c.uvFadeWidth/2);
     grad.addColorStop(0,'transparent');grad.addColorStop(.5,'rgba(138,86,221,'+c.uvFadeStrength+')');grad.addColorStop(1,'transparent');ctx.fillStyle=grad;ctx.fillRect(0,0,W,H);
   }
   if(c.snow){
     ctx.fillStyle='rgba(255,255,255,.92)';ctx.beginPath();
     const count=Math.round(2100*c.snow*c.snowDensity);
     for(let i=0;i<count;i++){
       const depth=random(i+2,c.seed),speed=.5+depth*.6;
       const y=(random(i+11,c.seed)*H+phase*H*Math.max(1,Math.round(speed*c.snowSpeed)))%H;
       const x=(random(i+127,c.seed)*W+c.snowWind*55*Math.sin(clock+depth*6)+W)%W,r=1.6+depth*3.8;
       ctx.moveTo(x+r,y);ctx.arc(x,y,r,0,Math.PI*2);
     }
     ctx.fill();
   }
   ctx.globalCompositeOperation='source-over';
 }
}
function visible(){
 return sheet.open && !about.open && !feedback.open && !document.hidden && !reduce.matches && onscreen;
}
function stop(){
 cancelAnimationFrame(raf);cancelAnimationFrame(pending);pending=0;raf=0;lastFrame=0;
 previousProbe=0;recentFrameTimes=[];
 heading.classList.remove('motion-ready');
}
// Only a sheet opening or a new day starts a fresh pass. Visibility and layout updates resume it.
function reset(){
 stop();finished=false;elapsed=0;phase=0;rainPass=0;earlyRestAt=null;
 // Wait until the opening slide or day transition finishes before preparing the shader.
 startAfter=performance.now()+400;probeFrames=0;lateProbeFrames=0;
}
function frame(now){
 raf=0;
 if(!visible()){stop();return;}
 const diff=lastFrame?now-lastFrame:0;
 if(!lastFrame || diff>=1000/61){
   elapsed+=diff;lastFrame=now;
   const duration=selectedPreset.duration*1000;
   if(elapsed>=duration || (earlyRestAt!==null && elapsed-earlyRestAt>=180)){finished=true;stop();return;}
   if(diff>0 && earlyRestAt===null){
     recentFrameTimes.push(diff);
     if(recentFrameTimes.length>10)recentFrameTimes.shift();
     if(recentFrameTimes.length===10 && recentFrameTimes.filter(ms=>ms>40).length>=7){
       // Give interaction the frame budget for the rest of this page visit.
       skipMotion=true;earlyRestAt=elapsed;
     }
   }
   const intro=Math.min(entranceDuration,duration/3);
   const enter=Math.min(1,elapsed/intro);
   const tail=Math.min(settleDuration,duration/2);
   const progress=Math.max(0,(elapsed-duration+tail)/tail);
   // Integrate the speed ramps so a single preset still covers exactly one cycle.
   const clock=elapsed-intro*(enter-enter*enter/2)-tail*progress*progress/2;
   phase=clock/(duration-(intro+tail)/2);
   const release=earlyRestAt===null?1:1-easedRange(0,180,elapsed-earlyRestAt);
   const amplitude=easedRange(0,1,enter)*(1-easedRange(0,1,progress))*release;
   for(const key of strengths)state.params[60][key]=selectedPreset[key]*amplitude;
   try{if(gl)render();else paintFallback();}
   catch(error){
     if(!gl){stop();console.warn('Title animation:',error);return;}
     console.warn('Title WebGL:',error);useFallback();prepare();paintFallback();
   }
   if(!heading.classList.contains('motion-ready'))heading.classList.add('motion-ready');
 }
 raf=requestAnimationFrame(frame);
}
function start(now){
 pending=0;
 if(skipMotion || finished || !visible())return;
 // Measure the UI before allocating a canvas context or rasterising any glyph.
 if(startAfter){
   if(previousProbe){
     probeFrames++;
     if(now-previousProbe>40)lateProbeFrames++;
   }
   previousProbe=now;
   if(now<startAfter){pending=requestAnimationFrame(start);return;}
   startAfter=0;
   if(probeFrames>=5 && lateProbeFrames/probeFrames>=.7){finished=true;return;}
 }
 const preset=titles.get(normalize(title.textContent));
 if(!preset || !title.firstChild)return;
 const key=[title.textContent,title.clientWidth,title.clientHeight,getComputedStyle(title).fontSize,devicePixelRatio].join('|');
 try{
   if(selectedPreset!==preset || elapsed===0){
     selectedPreset=preset;state.params[60]={...preset};
   }
   if(!attemptedGL){
     attemptedGL=true;
     try{initGL();}catch(error){console.warn('Title WebGL:',error);gl=null;linking=[];}
   }
   if(gl && linking.length){
     try{if(!programsReady()){pending=requestAnimationFrame(start);return;}}
     catch(error){console.warn('Title WebGL:',error);gl=null;linking=[];}
   }
   if(signature!==key || !ready){
     signature=key;
     layout=measureLayout();
     if(!gl && !raster)useFallback();else positionCanvas();
     try{prepare();}
     catch(error){
       if(!gl)throw error;
       console.warn('Title WebGL:',error);useFallback();prepare();
     }
     ready=true;
   }
   if(!raf)frame(performance.now());
 }catch(error){signature='';ready=false;stop();console.warn('Title animation:',error);}
}
function queue(){if(!skipMotion && !finished && !pending)pending=requestAnimationFrame(start);}
window.comfortTitleMotion={queue,reset};
canvas.addEventListener('webglcontextlost',event=>{
 event.preventDefault();stop();gl=null;linking=[];raster=null;signature='';ready=false;queue();
});
const sync=()=>{if(visible())queue();else stop();};
new MutationObserver(sync).observe(sheet,{attributes:true,attributeFilter:['open']});
for(const dialog of [about,feedback])new MutationObserver(sync).observe(dialog,{attributes:true,attributeFilter:['open']});
if('IntersectionObserver' in window){
 new IntersectionObserver(([entry])=>{onscreen=entry.isIntersecting;sync();},{root:sheet}).observe(heading);
}
reduce.addEventListener('change',sync);document.addEventListener('visibilitychange',sync);
document.fonts.ready.then(()=>{signature='';queue();});

})();
