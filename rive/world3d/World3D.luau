-- Dariokart 3D world renderer (Rive Scripting: a Luau layout script driving a WGSL shader).
--
-- Every frame it renders, with Rive's GPU API:
--   1. a 2048² sun shadow map of the course, karts, items and billboard scenery
--   2. the scene in HDR (half float when available) with 4x MSAA: sky, course, Rive billboards and
--      instanced karts / drivers / items, lit physically with filtered shadows (World3DShader.wgsl)
--   3. bloom (bright pass + two downsamples) and a filmic composite into the layout's GPU canvas
--
-- The game drives it through three strings on the `World` view model:
--
--   mesh  : "<staticVerts>,<model0Verts>,...;<spriteVerts>;<base64 vertex bytes>;<base64 sprite bytes>"
--           20 bytes per vertex: position f32x3, normal snorm8x4, colour unorm8x4 (alpha = material).
--           Static geometry first, then each instanced model. Rebuilt when a race starts.
--           Sprites are the Rive billboards (scenery, signs, banner, crowd): 32 bytes per vertex,
--           position f32x3, offset f32x2, uv f32x2, normal snorm8x4, textured from the atlas.
--   atlas : "<width>,<height>,<levels>;<base64 RGBA of every mip level>" the Rive artboards the game
--           baked into one texture. Set once.
--   frame : comma separated numbers: 80 uniform floats (the shader's `U` struct), then for every
--           model: instanceCount followed by instanceCount * 16 floats. Updated every frame.
--           The last model is the soft contact shadow, drawn alpha-blended after everything else.

type World3D = {
  context: Context,
  meshProp: Property<string>?,
  frameProp: Property<string>?,
  atlasProp: Property<string>?,
  meshAck: Property<number>?,
  atlasAck: Property<number>?,
  meshSrc: string,
  frameSrc: string,
  atlasSrc: string,
  width: number,
  height: number,
  scale: number,
  samples: number,
  hdrFormat: any,
  canvas: GPUCanvas?,
  msaaView: GPUTextureView?,
  hdrView: GPUTextureView?,
  depthView: GPUTextureView?,
  bloomAView: GPUTextureView?,
  bloomBView: GPUTextureView?,
  bloomCView: GPUTextureView?,
  shadowView: GPUTextureView?,
  shadowDepthView: GPUTextureView?,
  atlasView: GPUTextureView?,
  ready: boolean,
  failed: boolean,
  pipes: { [string]: GPUPipeline },
  groups: { [string]: GPUBindGroup },
  groupsDirty: boolean,
  ubo: GPUBuffer?,
  uboData: buffer,
  vbo: GPUBuffer?,
  staticCount: number,
  modelStart: { number },
  modelCount: { number },
  instBuffers: { GPUBuffer },
  instCounts: { number },
  instData: buffer,
  spriteVbo: GPUBuffer?,
  spriteCount: number,
  linSampler: GPUSampler?,
  nearSampler: GPUSampler?,
  mipSampler: GPUSampler?,
  sampler: ImageSampler,
}

local UNIFORM_FLOATS = 80
local INST_FLOATS = 16
local MAX_INSTANCES = 512
local VERTEX_BYTES = 20
local SPRITE_BYTES = 32
local SHADOW_SIZE = 2048
local DEPTH_FORMAT: 'depth24plus-stencil8' = 'depth24plus-stencil8'

local decodeTable: { [number]: number } = {}
do
  local alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/'
  for i = 1, 64 do
    decodeTable[string.byte(alphabet, i)] = i - 1
  end
end

-- decodes base64 text starting at `from` into exactly `size` bytes
local function decodeBase64(s: string, from: number, size: number): buffer
  local out = buffer.create(size)
  local o = 0
  local i = from
  local n = #s
  while i + 3 <= n and o < size do
    local a, b, c, d = string.byte(s, i, i + 3)
    local v = (decodeTable[a] or 0) * 262144 + (decodeTable[b] or 0) * 4096 + (decodeTable[c] or 0) * 64 + (decodeTable[d] or 0)
    buffer.writeu8(out, o, bit32.extract(v, 16, 8))
    if o + 1 < size then
      buffer.writeu8(out, o + 1, bit32.extract(v, 8, 8))
    end
    if o + 2 < size then
      buffer.writeu8(out, o + 2, bit32.extract(v, 0, 8))
    end
    o += 3
    i += 4
  end
  return out
end

local function target(w: number, h: number, format: any, samples: number): GPUTextureView
  local tex = GPUTexture.new({ width = math.max(1, w), height = math.max(1, h), format = format, renderTarget = true, sampleCount = samples })
  return tex:view()
end

local function makeTargets(self: World3D)
  local w, h = self.width, self.height
  local canvas = self.canvas
  if canvas == nil then
    canvas = self.context:gpuCanvas({ width = w, height = h })
    self.canvas = canvas
  else
    canvas:resize(w, h)
  end
  if canvas == nil then
    return
  end
  if self.samples > 1 then
    self.msaaView = target(w, h, self.hdrFormat, self.samples)
  end
  self.hdrView = target(w, h, self.hdrFormat, 1)
  self.depthView = target(w, h, DEPTH_FORMAT, self.samples)
  self.bloomAView = target(math.floor(w / 2), math.floor(h / 2), self.hdrFormat, 1)
  self.bloomBView = target(math.floor(w / 4), math.floor(h / 4), self.hdrFormat, 1)
  self.bloomCView = target(math.floor(w / 8), math.floor(h / 8), self.hdrFormat, 1)
  if self.shadowView == nil then
    self.shadowView = target(SHADOW_SIZE, SHADOW_SIZE, 'rgba8unorm', 1)
    self.shadowDepthView = target(SHADOW_SIZE, SHADOW_SIZE, DEPTH_FORMAT, 1)
  end
  self.groupsDirty = true
end

type PipeOpts = {
  format: any,
  samples: number,
  layouts: { any },
  depth: string?, -- 'test' (less, write), 'always', 'overlay' (less-equal, no write) or nil (no depth)
  blend: boolean?,
}

local function makePipeline(self: World3D, shader: Shader, vs: string, fs: string, o: PipeOpts): GPUPipeline
  local desc: any = {
    vertex = { module = shader, entryPoint = vs },
    fragment = { module = shader, entryPoint = fs },
    vertexLayout = o.layouts,
    colorTargets = { { format = o.format } },
    cullMode = 'none',
    sampleCount = o.samples,
  }
  if o.blend then
    desc.colorTargets = { {
      format = o.format,
      blend = { srcColor = 'src-alpha', dstColor = 'one-minus-src-alpha', srcAlpha = 'zero', dstAlpha = 'one' },
    } }
  end
  if o.depth == 'test' then
    desc.depthStencil = { format = DEPTH_FORMAT, compare = 'less', write = true }
  elseif o.depth == 'always' then
    desc.depthStencil = { format = DEPTH_FORMAT, compare = 'always', write = false }
  elseif o.depth == 'overlay' then
    desc.depthStencil = { format = DEPTH_FORMAT, compare = 'less-equal', write = false }
  end
  return GPUPipeline.new(desc)
end

local function buildPipelines(self: World3D): boolean
  local shader = self.context:shader('World3DShader')
  local canvas = self.canvas
  if shader == nil or canvas == nil then
    print('World3D: shader unavailable')
    return false
  end
  local vertexLayout: VertexBufferLayout = {
    stride = VERTEX_BYTES,
    attributes = {
      { format = 'float32x3', slot = 0, offset = 0 },
      { format = 'snorm8x4', slot = 1, offset = 12 },
      { format = 'unorm8x4', slot = 2, offset = 16 },
    },
  }
  local instanceLayout: VertexBufferLayout = {
    stride = INST_FLOATS * 4,
    stepMode = 'instance',
    attributes = {
      { format = 'float32x4', slot = 3, offset = 0 },
      { format = 'float32x4', slot = 4, offset = 16 },
      { format = 'float32x4', slot = 5, offset = 32 },
      { format = 'float32x4', slot = 6, offset = 48 },
    },
  }
  local spriteLayout: VertexBufferLayout = {
    stride = SPRITE_BYTES,
    attributes = {
      { format = 'float32x3', slot = 0, offset = 0 },
      { format = 'float32x2', slot = 1, offset = 12 },
      { format = 'float32x2', slot = 2, offset = 20 },
      { format = 'snorm8x4', slot = 3, offset = 28 },
    },
  }
  local hdr, s = self.hdrFormat, self.samples
  local p = self.pipes
  -- scene (HDR, MSAA)
  p.sky = makePipeline(self, shader, 'vs_sky', 'fs_sky', { format = hdr, samples = s, layouts = {}, depth = 'always' })
  p.static = makePipeline(self, shader, 'vs_static', 'fs_world', { format = hdr, samples = s, layouts = { vertexLayout }, depth = 'test' })
  p.inst = makePipeline(self, shader, 'vs_inst', 'fs_world', { format = hdr, samples = s, layouts = { vertexLayout, instanceLayout }, depth = 'test' })
  p.blob = makePipeline(self, shader, 'vs_inst', 'fs_shadow', { format = hdr, samples = s, layouts = { vertexLayout, instanceLayout }, depth = 'overlay', blend = true })
  p.sprite = makePipeline(self, shader, 'vs_sprite', 'fs_sprite', { format = hdr, samples = s, layouts = { spriteLayout }, depth = 'test' })
  -- sun shadow map (packed depth)
  p.lstatic = makePipeline(self, shader, 'vs_static_light', 'fs_light', { format = 'rgba8unorm', samples = 1, layouts = { vertexLayout }, depth = 'test' })
  p.linst = makePipeline(self, shader, 'vs_inst_light', 'fs_light', { format = 'rgba8unorm', samples = 1, layouts = { vertexLayout, instanceLayout }, depth = 'test' })
  p.lsprite = makePipeline(self, shader, 'vs_sprite_light', 'fs_light_sprite', { format = 'rgba8unorm', samples = 1, layouts = { spriteLayout }, depth = 'test' })
  -- post
  p.bright = makePipeline(self, shader, 'vs_full', 'fs_bright', { format = hdr, samples = 1, layouts = {} })
  p.down = makePipeline(self, shader, 'vs_full', 'fs_down', { format = hdr, samples = 1, layouts = {} })
  p.comp = makePipeline(self, shader, 'vs_full', 'fs_composite', { format = canvas.format, samples = 1, layouts = {} })

  self.ubo = GPUBuffer.new({ size = UNIFORM_FLOATS * 4, usage = 'uniform' })
  self.linSampler = GPUSampler.new({ min = 'linear', mag = 'linear', wrapU = 'clamp-to-edge', wrapV = 'clamp-to-edge' })
  self.nearSampler = GPUSampler.new({ min = 'nearest', mag = 'nearest', wrapU = 'clamp-to-edge', wrapV = 'clamp-to-edge' })
  self.mipSampler = GPUSampler.new({ min = 'linear', mag = 'linear', mipmap = 'linear', wrapU = 'clamp-to-edge', wrapV = 'clamp-to-edge' })
  self.groupsDirty = true
  return true
end

-- bind groups reference the render targets, so they are rebuilt after a resize or the atlas load
local function buildGroups(self: World3D)
  self.groupsDirty = false
  local p, g = self.pipes, self.groups
  local ubo = self.ubo :: GPUBuffer
  local shadow = self.shadowView :: GPUTextureView
  local near = self.nearSampler :: GPUSampler
  local lin = self.linSampler :: GPUSampler
  local uboOnly = function(name: string)
    g[name] = GPUBindGroup.new({ layout = p[name]:getBindGroupLayout(0), ubos = { { slot = 0, buffer = ubo } } })
  end
  uboOnly('sky')
  uboOnly('blob')
  uboOnly('lstatic')
  uboOnly('linst')
  for _, name in { 'static', 'inst' } do
    g[name] = GPUBindGroup.new({
      layout = p[name]:getBindGroupLayout(0),
      ubos = { { slot = 0, buffer = ubo } },
      textures = { { slot = 3, view = shadow } },
      samplers = { { slot = 4, sampler = near } },
    })
  end
  local atlas = self.atlasView
  if atlas then
    g.sprite = GPUBindGroup.new({
      layout = p.sprite:getBindGroupLayout(0),
      ubos = { { slot = 0, buffer = ubo } },
      textures = { { slot = 1, view = atlas }, { slot = 3, view = shadow } },
      samplers = { { slot = 2, sampler = self.mipSampler :: GPUSampler }, { slot = 4, sampler = near } },
    })
    g.lsprite = GPUBindGroup.new({
      layout = p.lsprite:getBindGroupLayout(0),
      ubos = { { slot = 0, buffer = ubo } },
      textures = { { slot = 1, view = atlas } },
      samplers = { { slot = 2, sampler = self.mipSampler :: GPUSampler } },
    })
  end
  -- post passes read their inputs from group 1
  local src = function(name: string, pipe: string, view: GPUTextureView)
    g[name] = GPUBindGroup.new({
      layout = p[pipe]:getBindGroupLayout(1),
      textures = { { slot = 0, view = view } },
      samplers = { { slot = 1, sampler = lin } },
    })
  end
  src('bright', 'bright', self.hdrView :: GPUTextureView)
  src('downB', 'down', self.bloomAView :: GPUTextureView)
  src('downC', 'down', self.bloomBView :: GPUTextureView)
  uboOnly('comp')
  g.compTex = GPUBindGroup.new({
    layout = p.comp:getBindGroupLayout(1),
    textures = {
      { slot = 0, view = self.hdrView :: GPUTextureView },
      { slot = 2, view = self.bloomAView :: GPUTextureView },
      { slot = 3, view = self.bloomBView :: GPUTextureView },
      { slot = 4, view = self.bloomCView :: GPUTextureView },
    },
    samplers = { { slot = 1, sampler = lin } },
  })
end

-- uploads the baked billboard atlas (every mip level)
local function loadAtlas(self: World3D, src: string)
  self.atlasSrc = src
  self.atlasView = nil
  self.groupsDirty = true
  local sep = string.find(src, ';', 1, true)
  if sep == nil then
    return
  end
  local head = string.split(string.sub(src, 1, sep - 1), ',')
  local w = tonumber(head[1]) or 0
  local h = tonumber(head[2]) or 0
  local levels = tonumber(head[3]) or 1
  if w <= 0 or h <= 0 then
    return
  end
  local total = 0
  local lw, lh = w, h
  for _ = 1, levels do
    total += lw * lh * 4
    lw = math.max(1, math.floor(lw / 2))
    lh = math.max(1, math.floor(lh / 2))
  end
  local bytes = decodeBase64(src, sep + 1, total)
  local tex = GPUTexture.new({ width = w, height = h, format = 'rgba8unorm', mipmaps = levels, label = 'atlas' })
  local offset = 0
  lw, lh = w, h
  for level = 0, levels - 1 do
    local size = lw * lh * 4
    local data = buffer.create(size)
    buffer.copy(data, 0, bytes, offset, size)
    tex:upload({ data = data, mipLevel = level, width = lw, height = lh })
    offset += size
    lw = math.max(1, math.floor(lw / 2))
    lh = math.max(1, math.floor(lh / 2))
  end
  self.atlasView = tex:view()
end

local function loadMesh(self: World3D, src: string)
  self.meshSrc = src
  self.vbo = nil
  self.spriteVbo = nil
  self.spriteCount = 0
  self.staticCount = 0
  self.modelStart = {}
  self.modelCount = {}
  local sep = string.find(src, ';', 1, true)
  if sep == nil then
    return
  end
  local sep2 = string.find(src, ';', sep + 1, true)
  local sep3 = if sep2 then string.find(src, ';', sep2 + 1, true) else nil
  if sep2 == nil or sep3 == nil then
    return
  end
  local sprites = tonumber(string.sub(src, sep + 1, sep2 - 1)) or 0
  if sprites > 0 then
    self.spriteCount = sprites
    self.spriteVbo = GPUBuffer.new({ size = sprites * SPRITE_BYTES, usage = 'vertex', data = decodeBase64(src, sep3 + 1, sprites * SPRITE_BYTES), immutable = true })
  end
  local total = 0
  for idx, v in string.split(string.sub(src, 1, sep - 1), ',') do
    local count = tonumber(v) or 0
    if idx == 1 then
      self.staticCount = count
    else
      table.insert(self.modelStart, total)
      table.insert(self.modelCount, count)
    end
    total += count
  end
  if total == 0 then
    return
  end
  local size = total * VERTEX_BYTES
  self.vbo = GPUBuffer.new({ size = size, usage = 'vertex', data = decodeBase64(src, sep2 + 1, size), immutable = true })
  while #self.instBuffers < #self.modelCount do
    table.insert(self.instBuffers, GPUBuffer.new({ size = MAX_INSTANCES * INST_FLOATS * 4, usage = 'vertex' }))
    table.insert(self.instCounts, 0)
  end
end

-- parses the frame string and uploads uniforms + instances
local function applyFrame(self: World3D, src: string): boolean
  local parts = string.split(src, ',')
  if #parts < UNIFORM_FLOATS then
    return false
  end
  local u = self.uboData
  for k = 0, UNIFORM_FLOATS - 1 do
    buffer.writef32(u, k * 4, tonumber(parts[k + 1]) or 0)
  end
  local ubo = self.ubo :: GPUBuffer
  ubo:write(u)
  local p = UNIFORM_FLOATS + 1
  local inst = self.instData
  for m = 1, #self.modelCount do
    local count = math.min(MAX_INSTANCES, math.floor(tonumber(parts[p]) or 0))
    p += 1
    for k = 0, count * INST_FLOATS - 1 do
      buffer.writef32(inst, k * 4, tonumber(parts[p + k]) or 0)
    end
    p += count * INST_FLOATS
    self.instCounts[m] = count
    if count > 0 then
      self.instBuffers[m]:write(inst, 0, 0, count * INST_FLOATS * 4)
    end
  end
  return true
end

function init(self: World3D, context: Context): boolean
  local vm = context:viewModel()
  if vm then
    self.meshProp = vm:getString('mesh')
    self.frameProp = vm:getString('frame')
    self.atlasProp = vm:getString('atlas')
    self.meshAck = vm:getNumber('meshAck')
    self.atlasAck = vm:getNumber('atlasAck')
  end
  local f = context:features()
  if f.maxSamples >= 4 then
    self.samples = 4
  end
  if f.colorBufferHalfFloat then
    self.hdrFormat = 'rgba16float'
  end
  return true
end

function resize(self: World3D, size: Vector, scale: number)
  self.scale = if scale > 0 then scale else 1
  local w = math.max(16, math.floor(size.x * self.scale + 0.5))
  local h = math.max(16, math.floor(size.y * self.scale + 0.5))
  if w == self.width and h == self.height then
    return
  end
  self.width = w
  self.height = h
  makeTargets(self)
end

function advance(self: World3D, seconds: number): boolean
  return true
end

-- draws every instanced model (the contact shadow model last, blended) with the given pipelines
local function drawModels(self: World3D, pass: GPURenderPass, solid: string, blob: string?)
  local vbo = self.vbo :: GPUBuffer
  pass:setPipeline(self.pipes[solid])
  pass:setBindGroup(0, self.groups[solid])
  pass:setVertexBuffer(0, vbo)
  local models = #self.modelCount
  for m = 1, models do
    local count = self.instCounts[m]
    if count > 0 and self.modelCount[m] > 0 then
      if m == models then
        if blob == nil then
          break
        end
        pass:setPipeline(self.pipes[blob])
        pass:setBindGroup(0, self.groups[blob])
      end
      pass:setVertexBuffer(1, self.instBuffers[m])
      pass:draw(self.modelCount[m], count, self.modelStart[m])
    end
  end
end

local function fullscreen(canvas: GPUCanvas, view: GPUTextureView, pipe: GPUPipeline, group: GPUBindGroup, uniforms: GPUBindGroup?, label: string)
  local pass = canvas:beginRenderPass({
    color = { { view = view, loadOp = 'clear', storeOp = 'store', clearColor = { 0, 0, 0, 1 } } },
    label = label,
  })
  pass:setPipeline(pipe)
  if uniforms then
    pass:setBindGroup(0, uniforms)
  end
  pass:setBindGroup(1, group)
  pass:draw(3)
  pass:finish()
end

function draw(self: World3D, renderer: Renderer)
  if self.failed then
    return
  end
  local canvas = self.canvas
  local meshProp = self.meshProp
  local frameProp = self.frameProp
  if canvas == nil or meshProp == nil or frameProp == nil then
    return
  end
  if not self.ready then
    self.ready = buildPipelines(self)
    if not self.ready then
      self.failed = true
      return
    end
  end
  -- the mesh and atlas are megabytes of text that the runtime hands to the script on every draw while
  -- they are set, so the game clears them once acknowledged; an empty value means "keep what is loaded"
  local mesh = meshProp.value
  if mesh ~= '' then
    if mesh ~= self.meshSrc then
      loadMesh(self, mesh)
    end
    local ack = self.meshAck
    if ack then
      ack.value += 1
    end
  end
  local atlasProp = self.atlasProp
  if atlasProp then
    local atlas = atlasProp.value
    if atlas ~= '' then
      if atlas ~= self.atlasSrc then
        loadAtlas(self, atlas)
      end
      local ack = self.atlasAck
      if ack then
        ack.value += 1
      end
    end
  end
  local frame = frameProp.value
  if frame ~= self.frameSrc then
    self.frameSrc = frame
    if not applyFrame(self, frame) then
      return
    end
  end
  if #self.frameSrc == 0 or self.vbo == nil then
    return
  end
  if self.groupsDirty then
    buildGroups(self)
    for _, name in { 'sky', 'static', 'inst', 'blob', 'lstatic', 'linst', 'bright', 'downB', 'downC', 'comp', 'compTex', 'sprite', 'lsprite' } do
      if self.groups[name] == nil then
        print('World3D: no bind group ' .. name)
      end
    end
  end
  local g = self.groups
  local hasSprites = self.spriteVbo ~= nil and self.spriteCount > 0 and g.sprite ~= nil

  -- 1. sun shadow map
  local pass = canvas:beginRenderPass({
    color = { { view = self.shadowView :: GPUTextureView, loadOp = 'clear', storeOp = 'store', clearColor = { 1, 1, 1, 1 } } },
    depthStencil = { view = self.shadowDepthView :: GPUTextureView, depthLoadOp = 'clear', depthStoreOp = 'discard', depthClearValue = 1 },
    label = 'world3d-shadow',
  })
  if self.staticCount > 0 then
    pass:setPipeline(self.pipes.lstatic)
    pass:setBindGroup(0, g.lstatic)
    pass:setVertexBuffer(0, self.vbo :: GPUBuffer)
    pass:draw(self.staticCount, 1, 0)
  end
  drawModels(self, pass, 'linst', nil)
  if hasSprites then
    pass:setPipeline(self.pipes.lsprite)
    pass:setBindGroup(0, g.lsprite)
    pass:setVertexBuffer(0, self.spriteVbo :: GPUBuffer)
    pass:draw(self.spriteCount)
  end
  pass:finish()

  -- 2. the scene in HDR
  local hdrView = self.hdrView :: GPUTextureView
  local msaaView = self.msaaView
  local color: any
  if self.samples > 1 and msaaView then
    color = { view = msaaView, resolveTarget = hdrView, loadOp = 'clear', storeOp = 'discard', clearColor = { 0, 0, 0, 1 } }
  else
    color = { view = hdrView, loadOp = 'clear', storeOp = 'store', clearColor = { 0, 0, 0, 1 } }
  end
  pass = canvas:beginRenderPass({
    color = { color },
    depthStencil = { view = self.depthView :: GPUTextureView, depthLoadOp = 'clear', depthStoreOp = 'discard', depthClearValue = 1 },
    label = 'world3d-scene',
  })
  pass:setPipeline(self.pipes.sky)
  pass:setBindGroup(0, g.sky)
  pass:draw(3)
  if self.staticCount > 0 then
    pass:setPipeline(self.pipes.static)
    pass:setBindGroup(0, g.static)
    pass:setVertexBuffer(0, self.vbo :: GPUBuffer)
    pass:draw(self.staticCount, 1, 0)
  end
  if hasSprites then
    pass:setPipeline(self.pipes.sprite)
    pass:setBindGroup(0, g.sprite)
    pass:setVertexBuffer(0, self.spriteVbo :: GPUBuffer)
    pass:draw(self.spriteCount)
  end
  drawModels(self, pass, 'inst', 'blob')
  pass:finish()

  -- 3. bloom and the filmic composite
  fullscreen(canvas, self.bloomAView :: GPUTextureView, self.pipes.bright, g.bright, nil, 'world3d-bright')
  fullscreen(canvas, self.bloomBView :: GPUTextureView, self.pipes.down, g.downB, nil, 'world3d-bloom-b')
  fullscreen(canvas, self.bloomCView :: GPUTextureView, self.pipes.down, g.downC, nil, 'world3d-bloom-c')
  fullscreen(canvas, canvas:colorView(), self.pipes.comp, g.compTex, g.comp, 'world3d-composite')

  -- the canvas is in device pixels, the layout box in points
  renderer:save()
  local inv = 1 / self.scale
  renderer:transform(Mat2D.withScale(inv, inv))
  renderer:drawImage(canvas.image, self.sampler, 'srcOver', 1)
  renderer:restore()
end

return function(context: Context): Layout<World3D>
  return {
    context = context,
    meshProp = nil,
    frameProp = nil,
    atlasProp = nil,
    meshAck = nil,
    atlasAck = nil,
    meshSrc = '',
    frameSrc = '',
    atlasSrc = '',
    width = 0,
    height = 0,
    scale = 1,
    samples = 1,
    hdrFormat = 'rgba8unorm',
    canvas = nil,
    msaaView = nil,
    hdrView = nil,
    depthView = nil,
    bloomAView = nil,
    bloomBView = nil,
    bloomCView = nil,
    shadowView = nil,
    shadowDepthView = nil,
    atlasView = nil,
    ready = false,
    failed = false,
    pipes = {},
    groups = {},
    groupsDirty = true,
    ubo = nil,
    uboData = buffer.create(UNIFORM_FLOATS * 4),
    vbo = nil,
    staticCount = 0,
    modelStart = {},
    modelCount = {},
    instBuffers = {},
    instCounts = {},
    instData = buffer.create(MAX_INSTANCES * INST_FLOATS * 4),
    spriteVbo = nil,
    spriteCount = 0,
    linSampler = nil,
    nearSampler = nil,
    mipSampler = nil,
    sampler = ImageSampler('clamp', 'clamp', 'bilinear'),
    init = init,
    resize = resize,
    advance = advance,
    draw = draw,
  }
end
