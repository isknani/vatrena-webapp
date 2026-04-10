import * as THREE from 'three';

export const SketchShader = {
    uniforms: {
        'tDiffuse': { value: null },
        'resolution': { value: new THREE.Vector2(window.innerWidth, window.innerHeight) },
        'uNoiseScale': { value: 0.5 }
    },
    vertexShader: `
        varying vec2 vUv;
        void main() {
            vUv = uv;
            gl_Position = projectionMatrix * modelViewMatrix * vec4( position, 1.0 );
        }`,
    fragmentShader: `
        uniform sampler2D tDiffuse;
        uniform vec2 resolution;
        varying vec2 vUv;
        float random(vec2 p) { return fract(sin(dot(p.xy, vec2(12.9898, 78.233))) * 43758.5453); }
        void main() {
            vec2 texel = vec2(1.0 / resolution.x, 1.0 / resolution.y);
            vec4 color = texture2D(tDiffuse, vUv);
            float luminance = dot(color.rgb, vec3(0.299, 0.587, 0.114));
            float gx = 0.0; float gy = 0.0;
            gx += -1.0 * texture2D(tDiffuse, vUv + vec2(-1.0, -1.0) * texel).r;
            gx += -2.0 * texture2D(tDiffuse, vUv + vec2(-1.0,  0.0) * texel).r;
            gx += -1.0 * texture2D(tDiffuse, vUv + vec2(-1.0,  1.0) * texel).r;
            gx +=  1.0 * texture2D(tDiffuse, vUv + vec2( 1.0, -1.0) * texel).r;
            gx +=  2.0 * texture2D(tDiffuse, vUv + vec2( 1.0,  0.0) * texel).r;
            gx +=  1.0 * texture2D(tDiffuse, vUv + vec2( 1.0,  1.0) * texel).r;
            gy += -1.0 * texture2D(tDiffuse, vUv + vec2(-1.0, -1.0) * texel).r;
            gy += -2.0 * texture2D(tDiffuse, vUv + vec2( 0.0, -1.0) * texel).r;
            gy += -1.0 * texture2D(tDiffuse, vUv + vec2( 1.0, -1.0) * texel).r;
            gy +=  1.0 * texture2D(tDiffuse, vUv + vec2(-1.0,  1.0) * texel).r;
            gy +=  2.0 * texture2D(tDiffuse, vUv + vec2( 0.0,  1.0) * texel).r;
            gy +=  1.0 * texture2D(tDiffuse, vUv + vec2( 1.0,  1.0) * texel).r;
            float edge = sqrt(gx*gx + gy*gy);
            float lineIntensity = smoothstep(0.05, 0.3, edge);
            float shading = 1.0;
            if (luminance < 0.5) { shading = 0.8; }
            if (luminance < 0.2) { shading = 0.6; }
            float noise = random(vUv) * 0.1;
            float paperColor = 1.0 - noise;
            float finalVal = paperColor * (1.0 - lineIntensity) * shading;
            finalVal = pow(finalVal, 0.8);
            gl_FragColor = vec4(vec3(finalVal), 1.0);
        }`
};

export const SharpenShader = {
    uniforms: {
        'tDiffuse': { value: null },
        'resolution': { value: new THREE.Vector2(window.innerWidth, window.innerHeight) },
        'sharpness': { value: 0.4 }
    },
    vertexShader: `
        varying vec2 vUv;
        void main() {
            vUv = uv;
            gl_Position = projectionMatrix * modelViewMatrix * vec4( position, 1.0 );
        }`,
    fragmentShader: `
        uniform sampler2D tDiffuse;
        uniform vec2 resolution;
        uniform float sharpness;
        varying vec2 vUv;
        void main() {
            vec2 texel = vec2(1.0 / resolution.x, 1.0 / resolution.y);
            vec4 center = texture2D(tDiffuse, vUv);
            vec4 top = texture2D(tDiffuse, vUv + vec2(0.0, texel.y));
            vec4 bottom = texture2D(tDiffuse, vUv - vec2(0.0, texel.y));
            vec4 left = texture2D(tDiffuse, vUv - vec2(texel.x, 0.0));
            vec4 right = texture2D(tDiffuse, vUv + vec2(texel.x, 0.0));
            vec4 sharpened = center * (1.0 + 4.0 * sharpness) - (top + bottom + left + right) * sharpness;
            gl_FragColor = vec4(clamp(sharpened.rgb, 0.0, 1.0), center.a);
        }`
};
