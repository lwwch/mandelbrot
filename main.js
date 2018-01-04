"use strict";
//
// Mandelbrot Sets in WebGL
// Copyright (c) 2017 Myles Hathcock
// MIT License
//

function magnitude(x, y) {
  return Math.sqrt(x*x + y*y);
}

var ZOOM_OUT_LIMIT = 0.001;
var PAN_LIMIT = 1.0 / ZOOM_OUT_LIMIT;
function panlimit(v) {
  if (v > PAN_LIMIT) return PAN_LIMIT;
  if (v < -PAN_LIMIT) return -PAN_LIMIT;
  return v;
}

class Matrix {
  constructor(buf) {
    var data = buf || [
      1, 0, 0, 0,
      0, 1, 0, 0,
      0, 0, 1, 0,
      0, 0, 0, 1
    ];
    this._data = new Float32Array(data);
  }

  multiply(m) {
    var into = new Float32Array(16);
    var A = this._data;
    var X = m._data;
    var R = 4;
    var C = 4;

    for (var r = 0; r < R; ++r) {
      for (var c = 0; c < C; ++c) {
        into[(r*R)+c] = 0.0;
        for (var i = 0; i < C; ++i) {
          into[(r*R)+c] += A[(r*R)+i] * X[(i*R)+c];
        }
      }
    }
    this._data = into;
  }

  scale(z) {
    // We use ortho projection, so we have to scale x,y instead
    // of 'zooming' in the camera closer. That would do something
    // if we used perspective.
    z = 1.0 / z;
    this.multiply(new Matrix([
      z, 0, 0, 0,
      0, z, 0, 0,
      0, 0, 1, 0,
      0, 0, 0, 1
    ]));
  }

  orthographic(width, height) {
    this.multiply(new Matrix([
      2.0/height, 0, 0, 0,
      0, 2.0/width, 0, 0,
      0, 0, 1, 0,
      0, 0, 0, 1]));
  }

  translate(x,y) {
    this.multiply(new Matrix([
      1, 0, 0, 0,
      0, 1, 0, 0,
      0, 0, 1, 0,
      x, y, 0, 1
    ]));
  }

  get buffer() {
    return this._data;
  }
};

var vertex_shader_source = `
uniform mat4 mvp;
attribute vec4 vertex;
varying vec4 complex_coord;

void main() {
  gl_Position = mvp * vertex;
  complex_coord = gl_Position;
  gl_Position = vertex;
}
`;

var fragment_shader_source = `
precision highp float;

uniform sampler2D colors;
varying vec4 complex_coord;

void main() {
  // mandelbrot set escape iterations algorithm (most basic color method)
  // z+1 = z**2 + c
  // z = X + Yi (complex plane)
  // z+1 = X**2 + 2XYi + Y**2 + Cx + CyiA
  // noting that i**2 = -1 and that |z| = (X**2 + Y**2)**-0.5
  // we can get a lower cost computation
  
  vec2 c = complex_coord.xy;
  vec2 z = vec2(0, 0);
  const int MAX = 1024;
  const float ESCAPE = 1e3;

  int iterations = 0;
  for (int i = 0; i < MAX; ++i) {
    float new_x = (z.x * z.x) - (z.y * z.y) + c.x;
    z.y = 2.0 * z.x * z.y + c.y;
    z.x = new_x;
    if ((z.x * z.x) + (z.y * z.y) >= ESCAPE) {
      break;
    }
    ++iterations;
  }

  if (iterations == MAX) {
    gl_FragColor = vec4(0.0, 0.0, 0.0, 1.0);
  } else {
    // From the wikipedia article
    float logzn = log(length(z)) / 2.0;
    float smoothed = log(logzn/log(2.0)) / log(2.0);
    float index = float(iterations) + 1.0 - smoothed;
    gl_FragColor = texture2D(colors, vec2(index * 5.0 / float(MAX), 0.5));
  }
}
`;

function load_shader(gl, type, src) {
  const shader = gl.createShader(type);
  gl.shaderSource(shader, src);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    // TODO(myles): replace the dumb alerts with a console output and
    // actual error messages.
    alert("Failed to compile shader. See log.");
    console.log(gl.getShaderInfoLog(shader));
    gl.deleteShader(shader);
    return null;
  }
  return shader;
}

function init_vertex_buffer(gl) {
  const buf = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, buf);
  const data = [
    1.0, 1.0,
    -1.0, 1.0,
    1.0, -1.0,
    -1.0, -1.0,
  ];
  // We'll never update these 'full screen' vertices in this application
  // *All* of the work is in the fragment shader.
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(data), gl.STATIC_DRAW);
  return buf;
}

function init_colorization_texture(gl) {
  const tex = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D, tex);

  const width = 5;
  const height = 1;

  // Colors adapted from UltraFractal
  const data = new Uint8Array([
      0,   7, 100, 255,
     32, 107, 203, 255,
    237, 255, 255, 255,
    255, 170,   0, 255,
      0,   2,   0, 255
  ]);

  gl.texImage2D(
    gl.TEXTURE_2D,
    0,              // level
    gl.RGBA,
    width,
    height,
    0,              // border
    gl.RGBA,
    gl.UNSIGNED_BYTE,
    data);

  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);

  return tex;
}

function init_mandelbrot_program(gl) {
  const vert_shader = load_shader(gl, gl.VERTEX_SHADER, vertex_shader_source);
  if (!vert_shader) {
    return null;
  }

  const frag_shader = load_shader(gl, gl.FRAGMENT_SHADER, fragment_shader_source);
  if (!frag_shader) {
    return null;
  }

  const prog = gl.createProgram();
  gl.attachShader(prog, vert_shader);
  gl.attachShader(prog, frag_shader);
  gl.linkProgram(prog);

  if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
    alert("Failed to link shader. See log.");
    console.log(gl.getProgramInfoLog(prog));
    return null;
  }

  const vert_buffer = init_vertex_buffer(gl);
  const color_tex = init_colorization_texture(gl);

  return {
    gl: gl,
    program: prog,
    attributes: {
      vertex: gl.getAttribLocation(prog, "vertex")
    },
    buffers: {
      vertex: vert_buffer
    },
    uniforms: {
      mvp: gl.getUniformLocation(prog, "mvp")
    },
    offset: {
      x: 0,
      y: 0
    },
    zoom: 0.001,
    mouse: {
      down: false,
      last: {
        x: 0,
        y: 0
      }
    },
    pinch: {
      down: false,
      distance: 0.0
    },
    keys: {
      shift: false
    }
  }
}

function mandelbrot_draw(app) {
  // This is a single iteration of the main draw call
  const gl = app.gl;

  gl.clearColor(1,1,1,1);
  gl.clear(gl.COLOR_BUFFER_BIT);

  gl.bindBuffer(gl.ARRAY_BUFFER, app.buffers.vertex);
  gl.vertexAttribPointer(
    app.attributes.vertex,
    2,          // components per vertex -- we're in 2d
    gl.FLOAT,
    false,      // no effect for gl.FLOAT
    0,          // no additional stride
    0           // no additional data at start (offset)
  );
  gl.enableVertexAttribArray(app.attributes.vertex);
  gl.useProgram(app.program);

  var mvp = new Matrix();
  mvp.scale(app.zoom);
  mvp.translate(app.offset.x, app.offset.y);
  mvp.orthographic(gl.drawingBufferWidth, gl.drawingBufferHeight);

  gl.uniformMatrix4fv(app.uniforms.mvp, false, mvp.buffer);
  gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
}

function main(cid, use_fullscreen) {
	// Much of the WebGL setup/helpers are adapated from:
  // https://developer.mozilla.org/en-US/docs/Web/API/WebGL_API/Tutorial/Getting_started_with_WebGL
	const canvas = document.querySelector(cid);
  const gl = canvas.getContext("webgl");
  if (!gl) {
    alert("You don't have WebGL. Get a better browser.");
    return;
  }

  var prog = init_mandelbrot_program(gl);
  function render(ts) {
    mandelbrot_draw(prog);
  }

  function resize() {
    gl.viewport(0, 0, canvas.width, canvas.height);
    requestAnimationFrame(render);
  }

  function fullscreen() {
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
    resize();
  }
  
  function mouse_down(e) {
    prog.mouse.down = true;
    prog.mouse.last.x = e.x;
    prog.mouse.last.y = e.y;
    requestAnimationFrame(render);
  }

  function mouse_up(e) {
    prog.mouse.down = false;
    requestAnimationFrame(render);
  }

  function mouse_move(e) {
    if (prog.mouse.down) {
      var dx = e.x - prog.mouse.last.x;
      var dy = e.y - prog.mouse.last.y;

      var scale = 2.0 / prog.zoom / prog.gl.drawingBufferWidth;
      var ar = prog.gl.drawingBufferWidth / prog.gl.drawingBufferHeight;

      if (prog.keys.shift) {
        // Zooming
        var z = prog.zoom;
        prog.zoom = Math.max(z - (z * dy * 0.01), ZOOM_OUT_LIMIT);
      } else {
        // Panning
        prog.offset.x = panlimit(prog.offset.x - dx * scale);
        prog.offset.y = panlimit(prog.offset.y + dy * scale * ar);
      }
      requestAnimationFrame(render);
    }
    prog.mouse.last.x = e.x;
    prog.mouse.last.y = e.y;
  }

  function key_down(e) {
    prog.keys.shift = e.altKey;
  }

  function key_up(e) {
    prog.keys.shift = e.shiftKey;
  }

  function touch_start(e) {
    e.preventDefault();
    if (e.touches.length == 1) {
      prog.mouse.down = true;
      prog.pinch.down = false;
      prog.mouse.last.x = e.touches[0].clientX;
      prog.mouse.last.y = e.touches[0].clientY;
    } else if (e.touches.length == 2) {
      prog.pinch.down = true;
      prog.mouse.down = false;
      var t0 = e.touches[0];
      var t1 = e.touches[1];
      prog.pinch.distance = magnitude(
        t1.clientX - t0.clientX,
        t1.clientY - t0.clientY);
    }
    requestAnimationFrame(render);
  }
  // TODO: disable zoom on html page?

  function touch_move(e) {
    e.preventDefault();
    if (prog.mouse.down) {
      mouse_move({
        x: e.touches[0].clientX,
        y: e.touches[0].clientY
      });
    } else if (prog.pinch.down) {
      var last_distance = prog.pinch.distance;
      var t0 = e.touches[0];
      var t1 = e.touches[1];
      prog.pinch.distance = magnitude(
        t1.clientX - t0.clientX,
        t1.clientY - t0.clientY);
      var delta = prog.pinch.distance - last_distance;
      var z = prog.zoom;
      prog.zoom = Math.max(z - (z * -delta * 0.01), ZOOM_OUT_LIMIT);
    }
    requestAnimationFrame(render);
  }

  function touch_end(e) {
    e.preventDefault();
    prog.mouse.down = false;
    prog.pinch.down = false;
  }

  canvas.onmousedown = mouse_down;
  canvas.onmouseup = mouse_up;
  canvas.onmousemove = mouse_move;
  canvas.onmouseleave = mouse_up;
  canvas.addEventListener("touchstart", touch_start);
  canvas.addEventListener("touchmove", touch_move);
  canvas.addEventListener("touchend", touch_end);
  canvas.addEventListener("touchcancel", touch_end);
  canvas.addEventListener("resize", resize);
  document.addEventListener("keydown", key_down);
  document.addEventListener("keyup", key_up);

  if (use_fullscreen) {
    fullscreen();
    window.addEventListener("resize", resize);
  }
  requestAnimationFrame(render);
}
