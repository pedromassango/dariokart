-- Dariokart 3D world renderer (Rive Scripting: a Luau layout script driving a WGSL shader).
--
-- It renders the whole race world on the GPU with a depth buffer: sky dome, course, walls, scenery and
-- instanced 3D karts / items, lit and fogged by World3DShader.wgsl. The game drives it through two
-- strings on the `World` view model:
--
--   mesh  : "<staticVerts>,<model0Verts>,<model1Verts>,...;<base64 vertex bytes>"
--           20 bytes per vertex: position f32x3, normal snorm8x4, colour unorm8x4 (alpha = material).
--           Static geometry first, then each instanced model. Rebuilt when a race starts.
--   frame : comma separated numbers: 56 uniform floats (the shader's `U` struct), then for every
--           model: instanceCount followed by instanceCount * 16 floats. Updated every frame.
--           The last model is the soft blob shadow, drawn alpha-blended after everything else.

type World3D = {
  context: Context,
  meshProp: Property<string>?,
  frameProp: Property<string>?,
  meshSrc: string,
  frameSrc: string,
  width: number,
  height: number,
  scale: number,
  samples: number,
  canvas: GPUCanvas?,
  msaaView: GPUTextureView?,
  depthView: GPUTextureView?,
  ready: boolean,
  failed: boolean,
  skyPipe: GPUPipeline?,
  staticPipe: GPUPipeline?,
  instPipe: GPUPipeline?,
  shadowPipe: GPUPipeline?,
  shadowGroup: GPUBindGroup?,
  skyGroup: GPUBindGroup?,
  staticGroup: GPUBindGroup?,
  instGroup: GPUBindGroup?,
  ubo: GPUBuffer?,
  uboData: buffer,
  vbo: GPUBuffer?,
  staticCount: number,
  modelStart: { number },
  modelCount: { number },
  instBuffers: { GPUBuffer },
  instCounts: { number },
  instData: buffer,
  sampler: ImageSampler,
}

local UNIFORM_FLOATS = 56
local INST_FLOATS = 16
local MAX_INSTANCES = 512
local VERTEX_BYTES = 20
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
    local ms = GPUTexture.new({ width = w, height = h, format = canvas.format, renderTarget = true, sampleCount = self.samples })
    self.msaaView = ms:view()
  end
  local depth = GPUTexture.new({ width = w, height = h, format = DEPTH_FORMAT, renderTarget = true, sampleCount = self.samples })
  self.depthView = depth:view()
end

local function makePipeline(self: World3D, shader: Shader, vs: string, fs: string, layouts: { any }, depthTest: boolean): GPUPipeline
  local canvas = self.canvas :: GPUCanvas
  return GPUPipeline.new({
    vertex = { module = shader, entryPoint = vs },
    fragment = { module = shader, entryPoint = fs },
    vertexLayout = layouts,
    colorTargets = { { format = canvas.format } },
    depthStencil = { format = DEPTH_FORMAT, compare = if depthTest then 'less' else 'always', write = depthTest },
    cullMode = 'none',
    sampleCount = self.samples,
  })
end

local function buildPipelines(self: World3D): boolean
  local shader = self.context:shader('World3DShader')
  if shader == nil or self.canvas == nil then
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
  local sky = makePipeline(self, shader, 'vs_sky', 'fs_sky', {}, false)
  local stat = makePipeline(self, shader, 'vs_static', 'fs_world', { vertexLayout }, true)
  local inst = makePipeline(self, shader, 'vs_inst', 'fs_world', { vertexLayout, instanceLayout }, true)
  self.skyPipe = sky
  self.staticPipe = stat
  self.instPipe = inst
  local canvas = self.canvas :: GPUCanvas
  local shadow = GPUPipeline.new({
    vertex = { module = shader, entryPoint = 'vs_inst' },
    fragment = { module = shader, entryPoint = 'fs_shadow' },
    vertexLayout = { vertexLayout, instanceLayout },
    colorTargets = { {
      format = canvas.format,
      blend = { srcColor = 'src-alpha', dstColor = 'one-minus-src-alpha', srcAlpha = 'zero', dstAlpha = 'one' },
    } },
    depthStencil = { format = DEPTH_FORMAT, compare = 'less-equal', write = false },
    cullMode = 'none',
    sampleCount = self.samples,
  })
  self.shadowPipe = shadow
  local ubo = GPUBuffer.new({ size = UNIFORM_FLOATS * 4, usage = 'uniform' })
  self.ubo = ubo
  self.skyGroup = GPUBindGroup.new({ layout = sky:getBindGroupLayout(0), ubos = { { slot = 0, buffer = ubo } } })
  self.staticGroup = GPUBindGroup.new({ layout = stat:getBindGroupLayout(0), ubos = { { slot = 0, buffer = ubo } } })
  self.instGroup = GPUBindGroup.new({ layout = inst:getBindGroupLayout(0), ubos = { { slot = 0, buffer = ubo } } })
  self.shadowGroup = GPUBindGroup.new({ layout = shadow:getBindGroupLayout(0), ubos = { { slot = 0, buffer = ubo } } })
  return true
end

local function loadMesh(self: World3D, src: string)
  self.meshSrc = src
  self.vbo = nil
  self.staticCount = 0
  self.modelStart = {}
  self.modelCount = {}
  local sep = string.find(src, ';', 1, true)
  if sep == nil then
    return
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
  self.vbo = GPUBuffer.new({ size = size, usage = 'vertex', data = decodeBase64(src, sep + 1, size), immutable = true })
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
  end
  if context:features().maxSamples >= 4 then
    self.samples = 4
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
  local mesh = meshProp.value
  if mesh ~= self.meshSrc then
    loadMesh(self, mesh)
  end
  local frame = frameProp.value
  if frame ~= self.frameSrc then
    self.frameSrc = frame
    if not applyFrame(self, frame) then
      return
    end
  end
  if #self.frameSrc == 0 then
    return
  end

  local u = self.uboData
  local clear = { buffer.readf32(u, 80), buffer.readf32(u, 84), buffer.readf32(u, 88), 1 }
  local depthView = self.depthView
  if depthView == nil then
    return
  end
  local pass: GPURenderPass
  local msaaView = self.msaaView
  if self.samples > 1 and msaaView then
    pass = canvas:beginRenderPass({
      color = { { view = msaaView, resolveTarget = canvas:colorView(), loadOp = 'clear', storeOp = 'discard', clearColor = clear } },
      depthStencil = { view = depthView, depthLoadOp = 'clear', depthStoreOp = 'discard', depthClearValue = 1 },
      label = 'world3d',
    })
  else
    pass = canvas:beginRenderPass({
      color = { { loadOp = 'clear', storeOp = 'store', clearColor = clear } },
      depthStencil = { view = depthView, depthLoadOp = 'clear', depthStoreOp = 'discard', depthClearValue = 1 },
      label = 'world3d',
    })
  end
  pass:setPipeline(self.skyPipe :: GPUPipeline)
  pass:setBindGroup(0, self.skyGroup :: GPUBindGroup)
  pass:draw(3)
  local vbo = self.vbo
  if vbo then
    if self.staticCount > 0 then
      pass:setPipeline(self.staticPipe :: GPUPipeline)
      pass:setBindGroup(0, self.staticGroup :: GPUBindGroup)
      pass:setVertexBuffer(0, vbo)
      pass:draw(self.staticCount, 1, 0)
    end
    pass:setPipeline(self.instPipe :: GPUPipeline)
    pass:setBindGroup(0, self.instGroup :: GPUBindGroup)
    pass:setVertexBuffer(0, vbo)
    local models = #self.modelCount
    for m = 1, models do
      local count = self.instCounts[m]
      if count > 0 and self.modelCount[m] > 0 then
        if m == models then
          pass:setPipeline(self.shadowPipe :: GPUPipeline)
          pass:setBindGroup(0, self.shadowGroup :: GPUBindGroup)
        end
        pass:setVertexBuffer(1, self.instBuffers[m])
        pass:draw(self.modelCount[m], count, self.modelStart[m])
      end
    end
  end
  pass:finish()
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
    meshSrc = '',
    frameSrc = '',
    width = 0,
    height = 0,
    scale = 1,
    samples = 1,
    canvas = nil,
    msaaView = nil,
    depthView = nil,
    ready = false,
    failed = false,
    skyPipe = nil,
    staticPipe = nil,
    instPipe = nil,
    shadowPipe = nil,
    shadowGroup = nil,
    skyGroup = nil,
    staticGroup = nil,
    instGroup = nil,
    ubo = nil,
    uboData = buffer.create(UNIFORM_FLOATS * 4),
    vbo = nil,
    staticCount = 0,
    modelStart = {},
    modelCount = {},
    instBuffers = {},
    instCounts = {},
    instData = buffer.create(MAX_INSTANCES * INST_FLOATS * 4),
    sampler = ImageSampler('clamp', 'clamp', 'bilinear'),
    init = init,
    resize = resize,
    advance = advance,
    draw = draw,
  }
end
