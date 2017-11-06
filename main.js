//
// Mandelbrot Sets in WebGL
// Copyright (c) 2017 Myles Hathcock
// MIT License
//

var vertex_shader_source = `
attribute vec4 vertex;
void main() {
    gl_Position = vertex;
}
`;

var fragment_shader_source = `
// Just set the color for now, still doing all of the boilerplate stuff.
void main() {
    gl_FragColor = vec4(.123, .123, .123, 1.0);
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
    gl.bindBuffer(buf, gl.POSITION_BUFFER);
    const data = [
        1.0, 1.0,
        -1.0, 1.0,
        -1.0, -1.0,
        1.0, -1.0
    ];
    // We'll never update these 'full screen' vertices in this application
    // *All* of the work is in the fragment shader.
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(data), gl.STATIC_DRAW);
    return buf;
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

    return {
        gl: gl,
        program: prog,
        attributes: {
            vertex: gl.getAttribLocation(prog, "vertex")
        },
        buffers: {
            vertex: vert_buffer
        }
    }
}

function mandelbrot_draw(app) {
    // This is a single iteration of the main draw call
    const gl = app.gl;

    gl.clearColor(0,0,0,1);
    gl.clear(gl.COLOR_BUFFER_BIT);

    // Our projection matrix is fixed-fov orthographic since we
    // just want to fill the screen with the square for our fragment shader
    // to work on. Translation and zooming of the mandelbrot set will be
    // manged manually through translation & coordinate bounds as uniforms
    // passed into the fragment shader.
    // 
    // Fortunately, the above description means I can largely use WebGL defaults :)

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
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
}

function main() {

	// Much of the WebGL setup/helpers are adapated from:
    // https://developer.mozilla.org/en-US/docs/Web/API/WebGL_API/Tutorial/Getting_started_with_WebGL
	const canvas = document.querySelector("#mandelbrot");
    const gl = canvas.getContext("webgl");
    if (!gl) {
        alert("You don't have WebGL. Get a better browser.");
        return;
    }

    const prog = init_mandelbrot_program(gl);
    mandelbrot_draw(prog);

}

main();
