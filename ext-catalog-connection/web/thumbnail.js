// SPDX-FileCopyrightText: 2026 Massimo Antonini
// SPDX-License-Identifier: MPL-2.0

/**
 * The thumbnail of a connection without an uploaded image (EXT-011), generated from its name so that
 * nine connections of one type do not look alike: a hash of the name chooses the hue, the silhouette
 * and the way the silhouette is drawn. The same name always gives the same thumbnail.
 */

const SVG = 'http://www.w3.org/2000/svg';
const WIDTH = 160;
const HEIGHT = 100;

/** The silhouettes a thumbnail is drawn with. */
export const SILHOUETTES = ['circles', 'waves', 'bars', 'peaks', 'diamonds', 'dots', 'rings', 'hills'];

/** FNV-1a, 32 bits, of the name as people see it (trimmed, Unicode normalized, in lower case). */
export function nameHash(name) {
  const text = String(name ?? '').trim().normalize('NFC').toLowerCase();
  let hash = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}

/** A sequence of numbers in [0, 1) that depends only on the seed (mulberry32). */
function sequence(seed) {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** What the thumbnail of a name is made of: its hue, its silhouette and the seed of its drawing. */
export function thumbnailOf(name) {
  const hash = nameHash(name);
  return { hue: hash % 360, silhouette: SILHOUETTES[(hash >>> 9) % SILHOUETTES.length], seed: hash };
}

function element(name, attributes) {
  const node = document.createElementNS(SVG, name);
  for (const [key, value] of Object.entries(attributes)) {
    node.setAttribute(key, String(value));
  }
  return node;
}

const round = (value) => Math.round(value * 10) / 10;

/** The shapes of a silhouette, with the colours given. */
function shapes(silhouette, next, fill, accent) {
  const between = (low, high) => round(low + next() * (high - low));
  const result = [];
  switch (silhouette) {
    case 'circles':
      for (let i = 0; i < 3; i++) {
        result.push(element('circle', { cx: between(20, 140), cy: between(25, 75), r: between(12, 34), fill: i % 2 ? accent : fill, 'fill-opacity': 0.85 }));
      }
      break;
    case 'waves':
      for (let i = 0; i < 3; i++) {
        const y = 35 + i * 20;
        const amplitude = between(6, 16);
        const phase = between(0, 40);
        result.push(element('path', {
          d: `M0 ${y} C ${40 + phase} ${y - amplitude}, ${80 - phase} ${y + amplitude}, 160 ${y}`,
          fill: 'none', stroke: i % 2 ? accent : fill, 'stroke-width': between(5, 10), 'stroke-linecap': 'round',
        }));
      }
      break;
    case 'bars': {
      const count = 4 + Math.floor(next() * 4);
      const width = 120 / count;
      for (let i = 0; i < count; i++) {
        const height = between(15, 75);
        result.push(element('rect', { x: round(20 + i * width + 2), y: round(90 - height), width: round(width - 4), height, rx: 2, fill: i % 3 === 0 ? accent : fill }));
      }
      break;
    }
    case 'peaks':
      for (let i = 0; i < 3; i++) {
        const x = between(10, 150);
        const height = between(35, 75);
        const half = between(25, 50);
        result.push(element('path', { d: `M${round(x - half)} 100 L${x} ${round(100 - height)} L${round(x + half)} 100 Z`, fill: i === 1 ? accent : fill, 'fill-opacity': 0.9 }));
      }
      break;
    case 'diamonds':
      for (let i = 0; i < 3; i++) {
        const size = between(14, 30);
        const x = between(25, 135);
        const y = between(30, 70);
        result.push(element('rect', { x: round(x - size / 2), y: round(y - size / 2), width: size, height: size, fill: i % 2 ? accent : fill, transform: `rotate(45 ${x} ${y})` }));
      }
      break;
    case 'dots': {
      const big = Math.floor(next() * 15);
      for (let row = 0; row < 3; row++) {
        for (let column = 0; column < 5; column++) {
          const index = row * 5 + column;
          result.push(element('circle', { cx: 32 + column * 24, cy: 26 + row * 24, r: index === big ? 10 : between(3, 7), fill: index === big ? accent : fill }));
        }
      }
      break;
    }
    case 'rings': {
      const cx = between(50, 110);
      const cy = between(40, 60);
      for (let i = 3; i > 0; i--) {
        result.push(element('circle', { cx, cy, r: i * between(9, 14), fill: 'none', stroke: i % 2 ? fill : accent, 'stroke-width': between(4, 8) }));
      }
      break;
    }
    default: // hills
      for (let i = 0; i < 3; i++) {
        result.push(element('ellipse', { cx: between(0, 160), cy: 100, rx: between(40, 80), ry: between(25, 55), fill: i === 2 ? accent : fill, 'fill-opacity': 0.8 }));
      }
  }
  return result;
}

/**
 * The thumbnail generated from a name, an SVG image that says its hue and silhouette in
 * data-hue and data-silhouette.
 */
export function generatedThumbnail(name) {
  const { hue, silhouette, seed } = thumbnailOf(name);
  const next = sequence(seed);
  const svg = element('svg', { viewBox: `0 0 ${WIDTH} ${HEIGHT}`, preserveAspectRatio: 'xMidYMid slice', 'aria-hidden': 'true', focusable: 'false' });
  svg.dataset.hue = String(hue);
  svg.dataset.silhouette = silhouette;
  svg.append(element('rect', { width: WIDTH, height: HEIGHT, fill: `hsl(${hue} 55% 90%)` }));
  svg.append(...shapes(silhouette, next, `hsl(${hue} 50% 45%)`, `hsl(${(hue + 40) % 360} 60% 60%)`));
  return svg;
}
