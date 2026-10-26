/*
 * Icon geometry copied from lucide-static v0.469.0 (icons/phone.svg, mail.svg,
 * linkedin.svg, github.svg), 24x24 viewBox, drawn as strokes.
 *
 * ISC License. Copyright (c) for portions of Lucide are held by Cole Bemis
 * 2013-2022 as part of Feather (MIT). All other copyright (c) for Lucide are
 * held by Lucide Contributors 2022. Permission to use, copy, modify, and/or
 * distribute this software for any purpose with or without fee is hereby
 * granted, provided that the above copyright notice and this permission notice
 * appear in all copies. THE SOFTWARE IS PROVIDED "AS IS" WITHOUT WARRANTY OF
 * ANY KIND.
 */

const icons = {
  phone: {
    paths: [
      'M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z',
    ],
  },
  mail: {
    paths: ['m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7'],
    rects: [{ x: 2, y: 4, width: 20, height: 16, rx: 2 }],
  },
  linkedin: {
    paths: ['M16 8a6 6 0 0 1 6 6v7h-4v-7a2 2 0 0 0-2-2 2 2 0 0 0-2 2v7h-4v-7a6 6 0 0 1 6-6z'],
    rects: [{ x: 2, y: 9, width: 4, height: 12 }],
    circles: [{ cx: 4, cy: 4, r: 2 }],
  },
  github: {
    paths: [
      'M15 22v-4a4.8 4.8 0 0 0-1-3.5c3 0 6-2 6-5.5.08-1.25-.27-2.48-1-3.5.28-1.15.28-2.35 0-3.5 0 0-1 0-3 1.5-2.64-.5-5.36-.5-8 0C6 2 5 2 5 2c-.3 1.15-.3 2.35 0 3.5A5.403 5.403 0 0 0 4 9c0 3.5 3 5.5 6 5.5-.39.49-.68 1.05-.85 1.65-.17.6-.22 1.23-.15 1.85v4',
      'M9 18c-4.51 2-5-2-7-2',
    ],
  },
};

module.exports = { icons };
