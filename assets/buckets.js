/* 3D: пять оцинкованных вёдер с банчами на ящике, как на цветочном маркете. Чистый WebGL, без библиотек. */
(function () {
  var cv = document.getElementById('bn');
  var gl = cv && (cv.getContext('webgl', { alpha: true, antialias: true, premultipliedAlpha: true }) || cv.getContext('experimental-webgl'));
  if (!gl) { document.documentElement.classList.add('no-gl'); window.BN = { scroll: function () {}, live: function () {} }; return; }
  var reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  var PI = Math.PI;

  /* ---------- математика ---------- */
  function mul(a, b) { var o = new Float32Array(16); for (var c = 0; c < 4; c++) for (var r = 0; r < 4; r++) o[c * 4 + r] = a[r] * b[c * 4] + a[4 + r] * b[c * 4 + 1] + a[8 + r] * b[c * 4 + 2] + a[12 + r] * b[c * 4 + 3]; return o; }
  function ident() { return new Float32Array([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]); }
  function trans(x, y, z) { var m = ident(); m[12] = x; m[13] = y; m[14] = z; return m; }
  function scl(x, y, z) { var m = ident(); m[0] = x; m[5] = y; m[10] = z; return m; }
  function rotX(a) { var c = Math.cos(a), s = Math.sin(a), m = ident(); m[5] = c; m[6] = s; m[9] = -s; m[10] = c; return m; }
  function rotY(a) { var c = Math.cos(a), s = Math.sin(a), m = ident(); m[0] = c; m[2] = -s; m[8] = s; m[10] = c; return m; }
  function rotZ(a) { var c = Math.cos(a), s = Math.sin(a), m = ident(); m[0] = c; m[1] = s; m[4] = -s; m[5] = c; return m; }
  function persp(fov, asp, n, f) { var t = 1 / Math.tan(fov / 2), m = new Float32Array(16); m[0] = t / asp; m[5] = t; m[10] = (f + n) / (n - f); m[11] = -1; m[14] = 2 * f * n / (n - f); return m; }
  function norm(v) { var l = Math.hypot(v[0], v[1], v[2]) || 1; return [v[0] / l, v[1] / l, v[2] / l]; }
  function cross(a, b) { return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]]; }
  function dot(a, b) { return a[0] * b[0] + a[1] * b[1] + a[2] * b[2]; }
  function lookAt(e, t) { var z = norm([e[0] - t[0], e[1] - t[1], e[2] - t[2]]), x = norm(cross([0, 1, 0], z)), y = cross(z, x); return new Float32Array([x[0], y[0], z[0], 0, x[1], y[1], z[1], 0, x[2], y[2], z[2], 0, -dot(x, e), -dot(y, e), -dot(z, e), 1]); }
  function basis(d) { var y = norm(d), up = Math.abs(y[2]) < .9 ? [0, 0, 1] : [1, 0, 0], x = norm(cross(up, y)), z = cross(x, y); return new Float32Array([x[0], x[1], x[2], 0, y[0], y[1], y[2], 0, z[0], z[1], z[2], 0, 0, 0, 0, 1]); }
  function chain() { var m = arguments[0]; for (var i = 1; i < arguments.length; i++) m = mul(m, arguments[i]); return m; }

  /* ---------- геометрия ---------- */
  function Geo() { this.d = []; }
  Geo.prototype.surf = function (F, nu, nv, M) { // F(u,v) -> [x,y,z,m], нормали по разностям
    M = M || ident(); var P = [], i, j, e = 1e-3;
    for (j = 0; j <= nv; j++) for (i = 0; i <= nu; i++) {
      var u = i / nu, v = j / nv, p = F(u, v), pu = F(Math.min(1, u + e), v), pu2 = F(Math.max(0, u - e), v), pv = F(u, Math.min(1, v + e)), pv2 = F(u, Math.max(0, v - e));
      var n = cross([pu[0] - pu2[0], pu[1] - pu2[1], pu[2] - pu2[2]], [pv[0] - pv2[0], pv[1] - pv2[1], pv[2] - pv2[2]]);
      if (!(n[0] || n[1] || n[2])) n = [0, 1, 0];
      P.push([p, norm(n)]);
    }
    var w = nu + 1;
    for (j = 0; j < nv; j++) for (i = 0; i < nu; i++) {
      var a = P[j * w + i], b = P[j * w + i + 1], c = P[(j + 1) * w + i + 1], d = P[(j + 1) * w + i];
      this.tri(a, b, c, M); this.tri(a, c, d, M);
    }
  };
  Geo.prototype.tri = function () {
    var M = arguments[3], self = this;
    for (var k = 0; k < 3; k++) {
      var q = arguments[k], p = q[0], n = q[1];
      self.d.push(M[0] * p[0] + M[4] * p[1] + M[8] * p[2] + M[12], M[1] * p[0] + M[5] * p[1] + M[9] * p[2] + M[13], M[2] * p[0] + M[6] * p[1] + M[10] * p[2] + M[14],
        M[0] * n[0] + M[4] * n[1] + M[8] * n[2], M[1] * n[0] + M[5] * n[1] + M[9] * n[2], M[2] * n[0] + M[6] * n[1] + M[10] * n[2], p[3]);
    }
  };
  Geo.prototype.upload = function () {
    var b = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, b); gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(this.d), gl.STATIC_DRAW);
    var n = this.d.length / 7; this.d = null; return { b: b, n: n };
  };

  /* лепесток: растёт вдоль y, края загибаются к центру цветка, кончик отгибается наружу */
  function petal(g, o) {
    var F = function (u, v) {
      var s = u * 2 - 1, w = o.w * Math.pow(Math.sin(PI * (.08 + .86 * v)), o.sh || .6);
      var x = s * w, y = o.l * v, z = -o.cup * s * s * w + o.curl * v * v * v * o.l;
      y -= o.tipDip ? o.tipDip * s * s * v * v : 0;
      return [x, y, z, o.m === undefined ? v : o.m];
    };
    g.surf(F, o.nu || 7, o.nv || 8, chain(rotY(o.a), trans(0, o.y || 0, o.r), rotX(o.t)));
  }
  function disc(g, r, h, m, M) { // приплюснутая полусфера: серединка, чашелистик
    g.surf(function (u, v) { var a = u * 2 * PI, b = v * PI / 2; return [Math.cos(a) * Math.cos(b) * r, Math.sin(b) * h, Math.sin(a) * Math.cos(b) * r, m]; }, 18, 5, M);
  }

  /* роза: тугой бутон внутри, раскрытые лепестки снаружи */
  var rose = new Geo(), GA = 2.39996;
  [[5, .14, .32, .5, .2, .25, .02], [5, .45, .42, .62, .3, .4, .06], [6, .8, .52, .72, .38, .5, .12], [6, 1.12, .6, .76, .44, .55, .22]].forEach(function (L, li) {
    for (var k = 0; k < L[0]; k++) petal(rose, { a: k / L[0] * 2 * PI + li * .7, t: L[1], w: L[2], l: L[3], r: L[4] * .35, cup: L[5], curl: L[6], y: -li * .05 });
  });
  disc(rose, .34, -.28, .1, ident());
  var roseB = rose.upload();

  /* кустовая роза: маленькая и раскрытая */
  var spray = new Geo();
  [[5, .5, .3, .4, .2, .35, .05], [6, 1.0, .36, .46, .3, .3, .15]].forEach(function (L, li) {
    for (var k = 0; k < L[0]; k++) petal(spray, { a: k / L[0] * 2 * PI + li * .6, t: L[1], w: L[2], l: L[3], r: L[4] * .3, cup: L[5], curl: L[6] });
  });
  disc(spray, .2, -.18, .1, ident());
  var sprayB = spray.upload();

  /* хризантема-ромашка: серединка и два ряда узких лепестков */
  var daisy = new Geo();
  [[18, 1.25, .1, .78, .02], [16, 1.5, .09, .7, .1]].forEach(function (L, li) {
    for (var k = 0; k < L[0]; k++) petal(daisy, { a: (k + li * .5) / L[0] * 2 * PI, t: L[1], w: L[2], l: L[3], r: .18, cup: .5, curl: L[4], sh: .45, nu: 3, nv: 6, y: .04 - li * .03 });
  });
  disc(daisy, .24, .14, 2, trans(0, .02, 0));
  var daisyB = daisy.upload();

  /* лист эвкалипта/зелени */
  var leaf = new Geo();
  petal(leaf, { a: 0, t: 0, w: .26, l: 1.25, r: 0, cup: .25, curl: .25, sh: .9, nv: 9 });
  var leafB = leaf.upload();

  /* обёртка: два слоя бумаги с волнистым краем, спереди ниже, чтобы цветы были видны */
  function wrapGeo(rot, lift, waves, m) {
    var g = new Geo();
    g.surf(function (u, v) {
      var a = u * 2 * PI, t = v;
      var front = Math.max(0, Math.cos(a - PI / 2 + rot));
      var top = .55 + lift - 1.0 * front * front + .16 * Math.sin(a * waves);
      var y = -3.3 + (top + 3.3) * t;
      var r = (.32 + Math.pow(t, 1.25) * .98) * (1 + .05 * Math.sin(a * waves + 1) * t);
      return [Math.cos(a) * r, y, Math.sin(a) * r, m + t * .9];
    }, 72, 14);
    return g.upload();
  }
  var wrapA = wrapGeo(0, 0, 5, 0), wrapB = wrapGeo(.5, .22, 4, 0);
  var ribbon = new Geo();
  ribbon.surf(function (u, v) { var a = u * 2 * PI, b = v * 2 * PI, R = .52, r = .07; return [Math.cos(a) * (R + Math.cos(b) * r), Math.sin(b) * r * 1.6, Math.sin(a) * (R + Math.cos(b) * r), 2]; }, 40, 8);
  [-1, 1].forEach(function (s) { // хвосты ленты
    ribbon.surf(function (u, v) { var x = s * (.1 + v * .5), y = -v * 1.2, z = .55 + Math.sin(v * 3) * .08; return [x + (u - .5) * .22, y, z + (u - .5) * .02 * s, 2]; }, 2, 8);
  });
  var ribbonB = ribbon.upload();
  var stem = new Geo();
  stem.surf(function (u, v) { var a = u * 2 * PI; return [Math.cos(a) * .05, -v * 1.1, Math.sin(a) * .05, .5]; }, 8, 1);
  var stemB = stem.upload();
  /* ---------- шейдер: цветы и дерево (uK=0), оцинкованное ведро (uK=1) ---------- */
  var VS = 'attribute vec3 aP;attribute vec3 aN;attribute float aM;uniform mat4 uVP;uniform mat4 uW;varying vec3 vW;varying vec3 vN;varying float vM;' +
    'void main(){vec4 w=uW*vec4(aP,1.);vW=w.xyz;vN=mat3(uW[0].xyz,uW[1].xyz,uW[2].xyz)*aN;vM=aM;gl_Position=uVP*w;}';
  var FS = 'precision mediump float;varying vec3 vW;varying vec3 vN;varying float vM;uniform vec3 uC1;uniform vec3 uE;uniform float uFade;uniform float uK;uniform float uGlow;' +
    'void main(){vec3 N=normalize(vN);vec3 V=normalize(uE-vW);float bk=0.;if(dot(N,V)<0.){N=-N;bk=1.;}' +
    'vec3 L1=normalize(vec3(-.5,.8,.7));vec3 L2=normalize(vec3(.85,.2,.4));vec3 H=normalize(L1+V);' +
    'float d1=max(0.,dot(N,L1)*.6+.4);float d2=max(0.,dot(N,L2))*.3;float f=1.-max(dot(N,V),0.);vec3 c;' +
    'if(uK<.5){vec3 b=vM>1.5?vec3(.98,.78,.16):uC1*mix(.55,1.,smoothstep(0.,.9,vM));' +
    'c=b*(.36+d1*.7+d2)+vec3(pow(max(dot(N,H),0.),40.)*.12)+mix(vec3(1.,.97,.9),b,.4)*pow(f,2.4)*.18+b*uGlow*.28;}' +
    'else{float sp=fract(sin(dot(floor(vW.xz*13.+vW.y*7.),vec2(12.9898,78.233)))*43758.5453);vec3 b=vec3(.76,.79,.82)*(.92+sp*.1);' +
    'c=b*(.52+d1*.48+d2)+vec3(pow(max(dot(N,H),0.),26.))*.45+vec3(.86,.9,1.)*pow(f,1.6)*.32+vec3(pow(max(dot(N,normalize(L2+V)),0.),16.))*.16;c*=mix(1.,.6,bk);}' +
    'gl_FragColor=vec4(min(c,vec3(1.))*uFade,uFade);}';
  function sh(t, s) { var o = gl.createShader(t); gl.shaderSource(o, s); gl.compileShader(o); if (!gl.getShaderParameter(o, gl.COMPILE_STATUS)) console.error(gl.getShaderInfoLog(o)); return o; }
  var pg = gl.createProgram(); gl.attachShader(pg, sh(gl.VERTEX_SHADER, VS)); gl.attachShader(pg, sh(gl.FRAGMENT_SHADER, FS)); gl.linkProgram(pg);
  var A = { p: gl.getAttribLocation(pg, 'aP'), n: gl.getAttribLocation(pg, 'aN'), m: gl.getAttribLocation(pg, 'aM') };
  var U = {}; ['uVP', 'uW', 'uC1', 'uE', 'uFade', 'uK', 'uGlow'].forEach(function (n) { U[n] = gl.getUniformLocation(pg, n); });
  gl.useProgram(pg); gl.enable(gl.DEPTH_TEST); gl.clearColor(0, 0, 0, 0);
  [A.p, A.n, A.m].forEach(function (l) { gl.enableVertexAttribArray(l); });
  function draw(buf, W, c, k, glow) {
    gl.bindBuffer(gl.ARRAY_BUFFER, buf.b);
    gl.vertexAttribPointer(A.p, 3, gl.FLOAT, false, 28, 0); gl.vertexAttribPointer(A.n, 3, gl.FLOAT, false, 28, 12); gl.vertexAttribPointer(A.m, 1, gl.FLOAT, false, 28, 24);
    gl.uniformMatrix4fv(U.uW, false, W); gl.uniform3fv(U.uC1, c || [1, 1, 1]); gl.uniform1f(U.uK, k || 0); gl.uniform1f(U.uGlow, glow || 0);
    gl.drawArrays(gl.TRIANGLES, 0, buf.n);
  }

  /* ---------- ведро: конус с двумя рёбрами, завальцованный край, дно; вода внутри ---------- */
  var BH = 1.3, BR0 = .5, BR1 = .74;
  var bucket = new Geo();
  bucket.surf(function (u, v) {
    var a = u * 2 * PI, r = BR0 + v * (BR1 - BR0) + .028 * Math.exp(-Math.pow((v - .3) / .035, 2)) + .028 * Math.exp(-Math.pow((v - .7) / .035, 2));
    return [Math.cos(a) * r, v * BH, Math.sin(a) * r, 1];
  }, 48, 36);
  bucket.surf(function (u, v) { var a = u * 2 * PI, b = v * 2 * PI, R = BR1 + .035 * Math.cos(b); return [Math.cos(a) * R, BH + .035 * Math.sin(b), Math.sin(a) * R, 1]; }, 48, 6);
  bucket.surf(function (u, v) { var a = u * 2 * PI; return [Math.cos(a) * BR0 * v, 0, Math.sin(a) * BR0 * v, 1]; }, 24, 1);
  var bucketB = bucket.upload();
  var water = new Geo();
  water.surf(function (u, v) { var a = u * 2 * PI; return [Math.cos(a) * (BR1 - .03) * v, BH - .07, Math.sin(a) * (BR1 - .03) * v, 1]; }, 24, 2);
  var waterB = water.upload();

  /* ---------- ящик под задним рядом ---------- */
  var crate = new Geo();
  function quad(o, ax, ay, m) { crate.surf(function (u, v) { return [o[0] + ax[0] * u + ay[0] * v, o[1] + ax[1] * u + ay[1] * v, o[2] + ax[2] * u + ay[2] * v, m]; }, 1, 1); }
  var CW = 3.9, CH = .42, CD = 1.7, CZ = -.85;
  quad([-CW / 2, CH, CZ - CD / 2], [CW, 0, 0], [0, 0, CD], 1);
  for (var pl = 0; pl < 2; pl++) quad([-CW / 2, pl * CH / 2 + .01, CZ + CD / 2], [CW, 0, 0], [0, CH / 2 - .02, 0], .78 + pl * .22);
  quad([-CW / 2, 0, CZ - CD / 2], [0, 0, CD], [0, CH, 0], .8);
  quad([CW / 2, 0, CZ - CD / 2], [0, 0, CD], [0, CH, 0], .8);
  var crateB = crate.upload();

  /* ---------- тюльпан ---------- */
  var tul = new Geo();
  for (var k = 0; k < 6; k++) {
    var inner = k % 2;
    petal(tul, { a: k / 6 * 2 * PI, t: .45 + (inner ? -.05 : 0), w: .34, l: .8 - inner * .04, r: .06 + inner * .02, cup: .55, curl: .02, sh: .65, nu: 6, nv: 8, y: -inner * .02 });
  }
  var tulB = tul.upload();

  /* ---------- банчи ---------- */
  var KINDS = [
    { b: sprayB, c: [.99, .52, .44], s: .4, n: 15, h: 1.95, name: 'Кустовые розы' },
    { b: daisyB, c: [.99, .98, .94], s: .38, n: 14, h: 2.0, name: 'Ромашковые хризантемы' },
    { b: roseB, c: [.88, .2, .5], s: .4, n: 9, h: 1.95, name: 'Пионовидные розы' },
    { b: tulB, c: [.98, .56, .72], s: .55, n: 13, h: 2.0, name: 'Тюльпаны' },
    { b: roseB, c: [.99, .87, .68], s: .4, n: 9, h: 2.1, name: 'Кремовые розы' }
  ];
  var POS = [[-1.62, 0, .72], [0, 0, .95], [1.62, 0, .72], [-.86, CH, -.85], [.86, CH, -.85]];
  var STEM = [.36, .55, .3], LEAF = [.33, .52, .32], WOOD = [.78, .6, .42];
  var BN = KINDS.map(function (K, i) {
    var heads = [];
    for (var q = 0; q < K.n; q++) {
      var rr = .52 * Math.sqrt((q + .5) / K.n), a = q * GA + i, j = ((q * 37 + i * 11) % 9 - 4) / 40;
      var P = [Math.cos(a) * rr, K.h - rr * rr * 1.1 + j, Math.sin(a) * rr];
      var B = [P[0] * .2, .55, P[2] * .2], dv = [P[0] - B[0], P[1] - B[1], P[2] - B[2]], L = Math.sqrt(dot(dv, dv));
      heads.push({ p: P, d: norm([P[0] * 1.3, 1, P[2] * 1.3]), sd: norm(dv), L: L, s: K.s * (1 + j * .8), spin: q * 1.9 });
    }
    var leaves = [];
    for (q = 0; q < 5; q++) { var la = q / 5 * 2 * PI + i; leaves.push({ t: [Math.cos(la) * .55, BH - .05, Math.sin(la) * .55], d: norm([Math.cos(la), .9, Math.sin(la)]) }); }
    return { k: K, heads: heads, leaves: leaves, lift: 0, grow: 0 };
  });

  /* ---------- кадр ---------- */
  var W = 0, H = 0, live = true, last = 0, time = 0, mx = 0, my = 0, tmx = 0, tmy = 0, fade = 0, scr = 0, scrT = 0, intro = 0, sel = 3, auto = 0;
  var label = document.getElementById('bnName'), lastVP = null, lastG = null;
  function setSel(i) { sel = i; auto = 0; if (label) label.textContent = KINDS[i].name; }
  function resize() {
    var rc = cv.getBoundingClientRect(), dpr = Math.min(devicePixelRatio || 1, 2);
    W = Math.max(1, Math.round(rc.width * dpr)); H = Math.max(1, Math.round(rc.height * dpr));
    if (cv.width !== W || cv.height !== H) { cv.width = W; cv.height = H; }
    gl.viewport(0, 0, W, H);
  }
  addEventListener('resize', function () { resize(); kick(); });
  if (matchMedia('(hover:hover)').matches) addEventListener('pointermove', function (e) { tmx = e.clientX / innerWidth - .5; tmy = e.clientY / innerHeight - .5; }, { passive: true });
  function proj(M, p) {
    var x = M[0] * p[0] + M[4] * p[1] + M[8] * p[2] + M[12], y = M[1] * p[0] + M[5] * p[1] + M[9] * p[2] + M[13], w = M[3] * p[0] + M[7] * p[1] + M[11] * p[2] + M[15];
    return [x / w, y / w];
  }
  cv.addEventListener('click', function (e) {
    var rc = cv.getBoundingClientRect(), x = (e.clientX - rc.left) / rc.width * 2 - 1, y = 1 - (e.clientY - rc.top) / rc.height * 2, best = -1, bd = .2;
    if (lastVP) POS.forEach(function (p, i) {
      var M = mul(lastVP, chain(lastG, trans(p[0], p[1], p[2])));
      [[0, .6, 0], [0, 1.8, 0]].forEach(function (pt) { var s = proj(M, pt), dd = (s[0] - x) * (s[0] - x) + (s[1] - y) * (s[1] - y); if (dd < bd) { bd = dd; best = i; } });
    });
    setSel(best < 0 ? (sel + 1) % 5 : best); kick();
  });

  function ease(x) { x = Math.max(0, Math.min(1, x)); return 1 - Math.pow(1 - x, 3); }
  function step(dt) {
    var k = 1 - Math.exp(-dt * 5);
    fade += (1 - fade) * (1 - Math.exp(-dt * 3));
    mx += (tmx - mx) * k; my += (tmy - my) * k; scr += (scrT - scr) * k;
    intro = reduce ? 9 : intro + dt;
    if (!reduce) { auto += dt; if (auto > 4.2 && intro > 3) setSel((sel + 1) % 5); }
    BN.forEach(function (b, i) { b.lift += ((i === sel ? 1 : 0) - b.lift) * (reduce ? 1 : 1 - Math.exp(-dt * 4)); });
  }
  function render() {
    if (!W) resize();
    var asp = W / H, d = 11.6 * Math.max(1, 1.05 / asp);
    var tg = [0, 1.45, 0], eye = [0, 4.2, d];
    var VP = mul(persp(.5, asp, 1, 80), lookAt(eye, tg));
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
    gl.uniformMatrix4fv(U.uVP, false, VP); gl.uniform3f(U.uE, eye[0], eye[1], eye[2]); gl.uniform1f(U.uFade, fade);
    var still = reduce ? 0 : 1;
    var G = chain(trans(0, -scr * .6, 0), rotY(mx * .5 - .12 + still * Math.sin(time * .25) * .12 + scr * .9), rotX(my * .12));
    lastVP = VP; lastG = G;
    draw(crateB, G, WOOD, 0);
    BN.forEach(function (b, i) {
      var p = POS[i], R = chain(G, trans(p[0], p[1], p[2]));
      draw(bucketB, R, null, 1);
      draw(waterB, R, [.16, .22, .17], 0);
      var g = ease((intro - .2 - i * .18) / .9); if (g <= 0) return;
      var lf = ease(b.lift), sway = still * Math.sin(time * 1.1 + i * 1.7) * .03;
      var Q = chain(R, trans(0, lf * .42, 0), rotZ(sway), rotY(lf * .5), scl(g * (1 + lf * .1), g * (1 + lf * .1), g * (1 + lf * .1)));
      b.leaves.forEach(function (l) { draw(leafB, chain(R, trans(l.t[0], l.t[1], l.t[2]), basis(l.d), scl(.42 * g, .55 * g, .42 * g)), LEAF); });
      b.heads.forEach(function (hd) {
        draw(stemB, chain(Q, trans(hd.p[0], hd.p[1], hd.p[2]), basis(hd.sd), scl(1, hd.L / 1.1, 1)), STEM);
        draw(b.k.b, chain(Q, trans(hd.p[0], hd.p[1], hd.p[2]), basis(hd.d), rotY(hd.spin), scl(hd.s, hd.s, hd.s)), b.k.c, 0, lf);
      });
    });
  }
  function frame_(now) {
    var dt = Math.min(.05, (now - last) / 1000 || .016); last = now; time += dt;
    step(dt); render();
    if (live) requestAnimationFrame(frame_);
  }
  var pending = false;
  function kick() {
    if (!reduce || pending) return; pending = true;
    requestAnimationFrame(function () { pending = false; step(.05); render(); });
  }
  window.BN = {
    scroll: function (p) { scrT = Math.max(0, Math.min(1, p)); kick(); },
    live: function (v) { if (reduce || v === live) return; live = v; if (v) { last = performance.now(); requestAnimationFrame(frame_); } }
  };
  resize();
  setSel(3);
  if (reduce) { live = false; fade = 1; intro = 9; kick(); } else requestAnimationFrame(frame_);
})();
