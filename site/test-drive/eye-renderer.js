/* Render the same embedded glTF eye textures/clips in the lightweight game. */
export async function createEyeRenderer(gl, doc, data, binOffset) {
  const accessors = new Map();
  function read(id) {
    if (accessors.has(id)) return accessors.get(id);
    const a=doc.accessors[id], b=doc.bufferViews[a.bufferView];
    const Type={5121:Uint8Array,5123:Uint16Array,5125:Uint32Array,5126:Float32Array}[a.componentType];
    const width={SCALAR:1,VEC2:2,VEC3:3,VEC4:4}[a.type];
    const values=new Type(data,binOffset+(b.byteOffset||0)+(a.byteOffset||0),a.count*width);
    accessors.set(id,values);return values;
  }
  const identity=[1,0,0,0,0,1,0,0,0,0,1,0,0,0,0,1];
  function multiply(a,b) {
    const c=new Array(16).fill(0);
    for(let col=0;col<4;col++)for(let row=0;row<4;row++)for(let k=0;k<4;k++)c[col*4+row]+=a[k*4+row]*b[col*4+k];
    return c;
  }
  function matrix(n) {
    if(n.matrix)return n.matrix;
    const [x,y,z,w]=n.rotation||[0,0,0,1],s=n.scale||[1,1,1],t=n.translation||[0,0,0];
    return [(1-2*(y*y+z*z))*s[0],2*(x*y+z*w)*s[0],2*(x*z-y*w)*s[0],0,
      2*(x*y-z*w)*s[1],(1-2*(x*x+z*z))*s[1],2*(y*z+x*w)*s[1],0,
      2*(x*z+y*w)*s[2],2*(y*z-x*w)*s[2],(1-2*(x*x+y*y))*s[2],0,...t,1];
  }
  const vertex=`attribute vec3 pos;attribute vec2 uv;varying vec2 texUV;
    uniform mat4 model;uniform vec3 eye,side,up,look,origin;uniform float angle,focal,aspect,shift;
    void main(){vec3 p=(model*vec4(pos,1.)).xyz;float c=cos(angle),s=sin(angle);
    p=vec3(c*p.x-s*p.z,p.y,s*p.x+c*p.z)+origin-eye;float d=dot(look,p);
    gl_Position=vec4(dot(side,p)*focal/aspect+d*shift,dot(up,p)*focal,d*1.0002-.15,d);texUV=uv;}`;
  const fragment=`precision mediump float;varying vec2 texUV;uniform sampler2D image;uniform vec3 color;
    void main(){gl_FragColor=vec4(texture2D(image,texUV).rgb*color,1.);}`;
  const program=gl.createProgram();
  for(const [type,source] of [[gl.VERTEX_SHADER,vertex],[gl.FRAGMENT_SHADER,fragment]]) {
    const shader=gl.createShader(type);gl.shaderSource(shader,source);gl.compileShader(shader);
    if(!gl.getShaderParameter(shader,gl.COMPILE_STATUS))throw Error(gl.getShaderInfoLog(shader));gl.attachShader(program,shader);
  }
  gl.linkProgram(program);if(!gl.getProgramParameter(program,gl.LINK_STATUS))throw Error(gl.getProgramInfoLog(program));
  const uniforms=Object.fromEntries(['model','eye','side','up','look','origin','angle','focal','aspect','shift','image','color'].map(k=>[k,gl.getUniformLocation(program,k)]));
  const pos=gl.getAttribLocation(program,'pos'),uv=gl.getAttribLocation(program,'uv');
  function texture() {
    const t=gl.createTexture();gl.bindTexture(gl.TEXTURE_2D,t);
    gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,gl.LINEAR);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MAG_FILTER,gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_S,gl.CLAMP_TO_EDGE);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_T,gl.CLAMP_TO_EDGE);return t;
  }
  const white=texture();gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA,1,1,0,gl.RGBA,gl.UNSIGNED_BYTE,new Uint8Array([255,255,255,255]));
  const textures=new Map(),meshes=[],parents=new Map();
  function visit(id,parent) {
    parents.set(id,parent);const n=doc.nodes[id];
    if(n.extras?.eye_revision && n.mesh!=null)for(const p of doc.meshes[n.mesh].primitives) {
      const xyz=read(p.attributes.POSITION),uvs=p.attributes.TEXCOORD_0!=null?read(p.attributes.TEXCOORD_0):null,indices=read(p.indices),vertices=[];
      for(const i of indices)vertices.push(xyz[i*3],xyz[i*3+1],xyz[i*3+2],uvs?.[i*2]||0,uvs?.[i*2+1]||0);
      const buffer=gl.createBuffer();gl.bindBuffer(gl.ARRAY_BUFFER,buffer);gl.bufferData(gl.ARRAY_BUFFER,new Float32Array(vertices),gl.STATIC_DRAW);
      const material=doc.materials[p.material].pbrMetallicRoughness,tex=material.baseColorTexture?.index;
      if(tex!=null)textures.set(tex,null);
      meshes.push({node:id,buffer,count:indices.length,tex,color:(material.baseColorFactor||[1,1,1]).slice(0,3).map(v=>v**(1/2.2))});
    }
    for(const child of n.children||[])visit(child,id);
  }
  for(const root of doc.scenes[doc.scene||0].nodes)visit(root,null);
  for(const tex of textures.keys()) {
    const image=doc.images[doc.textures[tex].source],view=doc.bufferViews[image.bufferView];
    const bitmap=await createImageBitmap(new Blob([new Uint8Array(data,binOffset+(view.byteOffset||0),view.byteLength)],{type:image.mimeType}));
    const t=texture();gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA,gl.RGBA,gl.UNSIGNED_BYTE,bitmap);bitmap.close();textures.set(tex,t);
  }
  const clip=doc.animations?.find(a=>a.name==='BAAABS | Eye cycle');
  const channels=(clip?.channels||[]).map(c=>{const s=clip.samplers[c.sampler];return {...c.target,interpolation:s.interpolation||'LINEAR',times:read(s.input),values:read(s.output),width:doc.accessors[s.output].type==='VEC4'?4:3};});
  const duration=Math.max(1,...channels.map(c=>c.times[c.times.length-1]));
  const reduced=matchMedia('(prefers-reduced-motion: reduce)');
  return function drawEyes(camera,origin,angle,time) {
    const at=reduced.matches?0:time%duration,animated=new Map(),world=new Map();
    for(const c of channels) {
      let lo=0,hi=c.times.length-1;
      while(lo+1<hi){const mid=(lo+hi)>>1;if(c.times[mid]<=at)lo=mid;else hi=mid;}
      const f=c.interpolation==='STEP'?0:Math.max(0,Math.min(1,(at-c.times[lo])/(c.times[hi]-c.times[lo])));
      const value=Array.from({length:c.width},(_,i)=>c.values[lo*c.width+i]*(1-f)+c.values[hi*c.width+i]*f);
      if(c.path==='rotation'){const len=Math.hypot(...value);for(let i=0;i<4;i++)value[i]/=len;}
      if(!animated.has(c.node))animated.set(c.node,{...doc.nodes[c.node]});animated.get(c.node)[c.path]=value;
    }
    function nodeWorld(id) {
      if(world.has(id))return world.get(id);
      const parent=parents.get(id),m=multiply(parent==null?identity:nodeWorld(parent),matrix(animated.get(id)||doc.nodes[id]));world.set(id,m);return m;
    }
    gl.useProgram(program);
    for(const k of ['eye','side','up','look'])gl.uniform3fv(uniforms[k],camera[k]);
    for(const k of ['focal','aspect','shift'])gl.uniform1f(uniforms[k],camera[k]);
    gl.uniform3fv(uniforms.origin,origin);gl.uniform1f(uniforms.angle,angle);gl.activeTexture(gl.TEXTURE0);gl.uniform1i(uniforms.image,0);
    gl.enableVertexAttribArray(pos);gl.enableVertexAttribArray(uv);
    for(const mesh of meshes) {
      const m=nodeWorld(mesh.node);if(Math.hypot(m[0],m[1],m[2])<1e-7)continue;
      gl.uniformMatrix4fv(uniforms.model,false,m);gl.uniform3fv(uniforms.color,mesh.color);gl.bindTexture(gl.TEXTURE_2D,textures.get(mesh.tex)||white);
      gl.bindBuffer(gl.ARRAY_BUFFER,mesh.buffer);gl.vertexAttribPointer(pos,3,gl.FLOAT,false,20,0);gl.vertexAttribPointer(uv,2,gl.FLOAT,false,20,12);gl.drawArrays(gl.TRIANGLES,0,mesh.count);
    }
  };
}
