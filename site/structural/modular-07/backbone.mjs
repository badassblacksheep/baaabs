// Metres in the survey-frame datum. All registry and drawing positions share this model.
export const IN = 0.0254;
const KG_TO_LB = 1 / 0.45359237;
const distance = (a,b) => Math.hypot(...a.map((v,i)=>v-b[i]));
const tubeArea = (w,h,t) => w*h-(w-2*t)*(h-2*t);

export function compareDecks(ctx) {
  const d = ctx.design.deck, f = ctx.frame;
  const [sw,sl] = d.stockSheetIn;
  const [w,h,t] = d.frameSectionIn.map(v=>v*IN);
  return d.formats.map(format=>{
    const {lengthIn:L,widthIn:W} = format;
    const rows=f.deckLengthIn/L, cols=f.deckWidthIn/W;
    if (![rows,cols].every(Number.isInteger)) throw Error('Cassette grid does not tile this deck');
    const perSheet=Math.max(Math.floor(sw/W)*Math.floor(sl/L),Math.floor(sw/L)*Math.floor(sl/W));
    if (!perSheet) throw Error('One-piece plywood face exceeds the study sheet');
    const count=rows*cols, sheets=Math.ceil(count/perSheet);
    const ribs=Math.ceil(L/d.maxRibPitchIn)-1;
    const steelM=(2*L+(2+ribs)*(W-2*d.frameSectionIn[0]))*IN;
    const steelLb=steelM*tubeArea(w,h,t)*ctx.material.densityKgM3*KG_TO_LB;
    const plyLb=W*L/144*d.plyLbFt2;
    return {...format,rows,cols,count,ribs,sheets,yield:count*W*L/(sheets*sw*sl),
      eachLb:steelLb+plyLb,steelM,deckLb:count*(steelLb+plyLb),seats:4*count};
  });
}

// Each piece is transported as one assembly. Centre lines and section references feed
// the drawing, cargo mass estimate and Python frame solver.
export function primaryGeometry(frame, primary) {
  const find=name=>{
    const member=frame.members.find(m=>m.name===name);
    if(!member)throw Error('Missing frame section '+name);
    return member;
  };
  const upper=find('Deck edge girder'), lower=find('Truss lower chord driver');
  const upright=find('Truss vertical driver 1'), web=find('Truss web driver 0');
  const cross=find('Floor joist 00'), tie=find('Lower transverse tie 0'), brace=find('Roof bay 1 diagonal');
  const [front,rear]=frame.deckBoundsM, n=primary.bayCount, pitch=(rear-front)/n;
  const width=-upper.a[1]*2, high=upper.a[2], low=lower.a[2], ys=[-width/2,width/2];
  const sideX=Array.from({length:n+1},(_,i)=>front+i*pitch);
  const pieces=[], sides=['driver','passenger'];
  function member(name,section,a,b,properties={}) {
    return {...section,sectionRef:section.name,name,a,b,...properties};
  }
  function single(id,m,group) {
    pieces.push({id,group,members:[m],sizeM:[distance(m.a,m.b),m.width,m.depth]});
  }
  for(let i=0;i<n;i++) for(const [j,y] of ys.entries()) {
    const x=sideX[i], end=sideX[i+1], side=sides[j];
    const id=side+' truss '+(i+1), members=[];
    function bar(role,section,x0,z0,x1,z1,properties) {
      members.push(member(role+' '+side+' '+i,section,[x0,y,z0],[x1,y,z1],properties));
    }
    bar('Deck edge module',upper,x,high,end,high,{crowdRail:true});
    bar('Lower chord',lower,x,low,end,low);
    // Both module ends travel. Coincident upright pairs contribute one effective
    // section to the compliance study until the connection is characterized.
    bar('Leading vertical',upright,x,low,x,high,{duplicateSeamUpright:i>0});
    bar('Trailing vertical',upright,end,low,end,high);
    for(const sx of frame.pairXsM.filter(v=>v>x && v<end))
      bar('Shore vertical '+sx,upright,sx,low,sx,high);
    bar('Side diagonal',web,x,i%2?high:low,end,i%2?low:high);
    const sizeM=[pitch+upright.width,Math.max(lower.width,upper.width,upright.width,web.width),
      high-low+(upper.depth+lower.depth)/2];
    pieces.push({id,group:'ladder',bay:i,members,sizeM});
    const label='Plan diagonal '+(i+1)+' '+side;
    // The archived mesh uses the Roof bay prefix for unwelded brace crossings.
    single(label,member('Roof bay '+label,brace,[x,y,high],[end,-y,high]));
  }
  for(const [i,x] of sideX.entries()){
    single('Cross tie '+i+' upper',member('Floor joist '+i,cross,[x,ys[0],high],[x,ys[1],high]));
    single('Cross tie '+i+' lower',member('Lower tie '+i,tie,[x,ys[0],low],[x,ys[1],low]));
  }
  for(const m of frame.members.filter(m=>/corner post|portal|knee brace|transverse sill/i.test(m.name)))
    single(m.name,member(m.name,m,m.a,m.b),'portal');
  return {pieces,seams:sideX.slice(1,-1),sideX,pitch,width,high,low,ys,upper,cross,sides,front};
}

export function buildBackbone(ctx) {
  const {design,frame,material,analysis}=ctx;
  const d=design.deck, selected=analysis.selected;
  const {pieces,sideX,pitch,width,high,low,ys,upper,cross,sides,front}=primaryGeometry(frame,design.primary);
  const items=[],nodes=[],cargo=[],ledger=[];
  const drawing=(layer,kind,points,label,extra={})=>items.push({layer,kind,points,label,...extra});
  const mass=(length,s)=>length*tubeArea(s.width,s.depth,s.wall/material.designWallFactor)*material.densityKgM3;
  function part(layer,id,sizeM,count,massKg=null) {
    cargo.push({layer,id,sizeM,count});
    ledger.push({layer,id,sizeM,count,massKg});
  }
  function node(classId,x,side,z,station,level,normal,layer) {
    const id=[classId,side,station,level].join('.');
    const tangent=normal[0]?[0,1,0]:[1,0,0];
    nodes.push({id,classId,positionM:[x,ys[sides.indexOf(side)],z],side,station,level,
      normal,tangent,layer,...design.unreviewedInterface});
    return nodes.at(-1);
  }
  function beam(layer,id,a,b,section,extras={}) {
    drawing(layer,'line',[a,b],id,extras);
    part(layer,id,[distance(a,b),section.width,section.depth],1,mass(distance(a,b),section));
  }
  for(const piece of pieces) {
    let kg=0;
    for(const m of piece.members) {
      drawing('primary','line',[m.a,m.b],piece.id,{group:piece.group,bay:piece.bay});
      kg+=mass(distance(m.a,m.b),m);
    }
    part('primary',piece.id,piece.sizeM,1,kg);
  }
  for(const [i,x] of sideX.entries()) {
    for(const [z,level] of [[high,'upper'],[low,'lower']]) {
      for(const [j,side] of sides.entries()) {
        const sign=j?1:-1;
        if(i>0 && i<sideX.length-1) node('splice',x,side,z,i,level,[1,0,0],'primary');
        node('cross',x,side,z,i,level,[0,-sign,0],'primary');
        node('panel',x,side,z,i,level,[0,sign,0],'panels');
      }
    }
  }
  for(const [i,p] of frame.shorePositions.entries()){
    const bottom=[p[0],p[1],frame.shoreGeometry.landingM];
    drawing('shores','line',[p,bottom],'Body shore '+(i+1));
    const [l,w]=frame.shoreGeometry.bottomPlateM, t=frame.shoreGeometry.padThicknessM;
    drawing('shores','box',[[p[0]-l/2,p[1]-w/2,bottom[2]-t],[p[0]+l/2,p[1]+w/2,bottom[2]]],'Provisional body landing');
    node('shore',p[0],sides[p[1]<0?0:1],p[2],Math.floor(i/2),'lower',[0,0,-1],'shores');
    part('shores','Shore '+(i+1),[l,w,p[2]-bottom[2]+t],1,frame.shoreMassEachLbf/KG_TO_LB);
  }
  const L=selected.lengthIn*IN, W=selected.widthIn*IN, deckWidth=frame.deckWidthIn*IN;
  const carrierZ=high+(upper.depth+cross.depth)/2;
  for(let i=0;i<=selected.rows;i++){
    const x=front+i*L;
    beam('deck','Removable deck carrier '+i,[x,-deckWidth/2,carrierZ],[x,deckWidth/2,carrierZ],cross,{group:'carrier'});
    for(const side of sides)node('deck',x,side,high+upper.depth/2,i,'bearing',[0,0,1],'deck');
  }
  const frameHeight=d.frameSectionIn[1]*IN, frameZ=carrierZ+(cross.depth+frameHeight)/2,
    plyBase=frameZ+frameHeight/2,ply=d.plyThicknessIn*IN;
  for(let i=0;i<selected.rows;i++) for(let j=0;j<selected.cols;j++) {
    const x=front+i*L,y=-deckWidth/2+j*W, label='Cassette '+(i+1)+' / '+(j+1);
    const extra={group:'cassette',bay:i,lane:j,rows:selected.rows,cols:selected.cols};
    const p=(dx,dy)=>[x+dx,y+dy,frameZ];
    for(const dy of [0,W]) drawing('deck','line',[p(0,dy),p(L,dy)],label,extra);
    for(let k=0;k<selected.ribs+2;k++){const dx=k*L/(selected.ribs+1);drawing('deck','line',[p(dx,0),p(dx,W)],label,extra)}
    drawing('deck','polygon',[[x,y,plyBase+ply],[x+L,y,plyBase+ply],[x+L,y+W,plyBase+ply],[x,y+W,plyBase+ply]],label+' · plywood',{...extra,face:true});
  }
  part('deck','Cassette '+selected.id,[L,W,frameHeight+ply],selected.count,selected.eachLb/KG_TO_LB);
  const a=design.audio, driver=ys[0], outside=driver-a.trialCradleOutreachM;
  const stageXs=a.stageStations.map(i=>sideX[i]);
  for(const [i,x] of stageXs.entries()){
    for(const [level,z,cls] of [['upper',high,'upperAudio'],['lower',low,'lowerAudio']]){
      node(cls,x,'driver',z,a.stageStations[i],level,a.projectionLocal,'audio');
    }
    const top=[x,driver,high],root=[x,driver,low];
    const elbow=[x,driver-a.trialDropOffsetM,low],heel=[x,elbow[1],a.trialCradleHeightM],toe=[x,outside,a.trialCradleHeightM];
    // Open upper receiver, separate two-level cradle adapter. No cabinet is flown.
    drawing('audio','line',[top,[x,driver-0.16,high]],'Empty upper receiver');
    for(const [aa,bb,label] of [[root,elbow,'Lower receiver arm'],[top,elbow,'Receiver brace'],[elbow,heel,'Outboard drop leg'],[heel,toe,'Shelf bearer'],[elbow,toe,'Cradle diagonal']]) {
      drawing('audio','line',[aa,bb],label);
    }
  }
  for(const y of [driver-a.trialDropOffsetM,outside])drawing('audio','line',stageXs.map(x=>[x,y,a.trialCradleHeightM]),'Lower cradle rail');
  // Standalone equipment, outside the parked vehicle. Its footprint never drives primary nodes.
  const [depth,w,h]=a.mvp.sizeM;
  stageXs.forEach((x,i)=>{
    const y=outside-depth;
    drawing('audio','box',[[x-w/2,y-depth/2,0],[x+w/2,y+depth/2,h]],a.mvp.model+' '+(i+1),{group:'mvp'});
    drawing('audio','line',[[x,y-depth/2,h/2],[x,y-depth/2-0.72,h/2]],'Ground projection · driver side',{arrow:true,group:'mvp'});
  });
  part('audio',a.mvp.model,a.mvp.sizeM,a.mvp.count,a.mvp.eachKg);
  return {items,nodes,cargo,ledger,stageXs,width,high,low,pitch,driver,outside,deckTop:plyBase+ply};
}

export function equipmentDemand(ctx,model,massKg) {
  const {design,donor}=ctx, a=design.audio, weightN=massKg*a.gravityMS2;
  const x=model.stageXs.reduce((s,v)=>s+v,0)/model.stageXs.length, cgY=model.outside;
  const rearShare=(x/IN-donor.frontAxleIn)/donor.wheelbaseIn;
  return {weightKN:weightN/1000,localMomentKNm:weightN*a.trialCradleOutreachM/1000,
    rollKNm:weightN*Math.abs(cgY)/1000,brakeKN:weightN*a.brakingStudyG/1000,
    frontKg:massKg*(1-rearShare),rearKg:massKg*rearShare,x,cgY};
}
