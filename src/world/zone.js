// Everdawn Vale layout. World units are metres. +X east, +Z south (north is -Z). Water level is y = 0.
export const MAP = { size: 1024, half: 512 };
export const WATER_Y = 0;

export const PLACES = {
  village: { x: 10, z: 150, r: 58, h: 6.5, name: 'Dawnhollow' },
  farms: { x: -150, z: 105, r: 75, name: 'Goldfield Farms' },
  forest: { x: 150, z: 55, r: 95, name: 'Whisperwood' },
  lake: { x: -70, z: -42, rx: 74, rz: 60, name: 'Mirrormere Lake' },
  mine: { x: -165, z: -119, name: 'Candlerock Mine' },
  webwood: { x: 165, z: -135, r: 62, name: 'Webwood Hollow' },
  ruins: { x: 172, z: 190, r: 46, name: 'Redcloak Ruins' },
  portal: { x: 0, z: -282, h: 52, name: 'The Ember Maw' },
  peak: { x: 0, z: -410, r: 210, h: 235, name: 'Ember Peak' },
  waterfall: { x: -70, z: -112 },
  pass: { x: 322, z: 64, name: 'Kingsroad Pass' }, // the gate east to the Crownlands
};

// Candlerock cliffs: a ridge band on the north-west side of the lake.
export const RIDGE = [[-250, -128], [-190, -122], [-130, -128], [-75, -112], [-25, -122], [5, -138]];

// Dirt roads (control points, smoothed with Catmull-Rom).
export const ROADS = [
  { w: 4.2, pts: [[10, 150], [-35, 142], [-95, 122], [-150, 104], [-215, 92]] },           // west to farms
  { w: 4.2, pts: [[10, 150], [58, 142], [108, 112], [160, 84], [230, 72], [282, 66], [340, 64], [420, 64]] }, // east to forest, then the Kingsroad Pass
  { w: 4.6, pts: [[10, 150], [14, 104], [24, 44], [40, -28], [52, -96], [50, -150], [74, -188], [36, -208], [64, -236], [22, -252], [4, -270]] }, // north: Ember Road (switchbacks)
  { w: 3.4, pts: [[20, 62], [-18, 44], [-54, 20]] },                                        // lake dock
  { w: 3.4, pts: [[58, 142], [108, 168], [148, 184]] },                                     // ruins
  { w: 3.2, pts: [[52, -96], [100, -112], [138, -126]] },                                   // webwood
  { w: 3.2, pts: [[-18, 44], [-92, 30], [-150, 4], [-172, -50], [-166, -108]] },                        // mine
];

// Mob camps: type, centre, radius, count, level range.
export const CAMPS = [
  { mob: 'boar', x: -150, z: 108, r: 55, n: 12, lv: [1, 3] },
  { mob: 'boar', x: -95, z: 170, r: 30, n: 5, lv: [1, 2] },
  { mob: 'wolf', x: 118, z: 100, r: 45, n: 10, lv: [1, 3] },
  { mob: 'wolf', x: 185, z: 35, r: 45, n: 8, lv: [3, 5] },
  { mob: 'gurgler', x: -128, z: -30, r: 30, n: 8, lv: [3, 5] },
  { mob: 'gurgler', x: -8, z: -40, r: 24, n: 6, lv: [4, 6] },
  { mob: 'kobold', x: -172, z: -86, r: 34, n: 12, lv: [4, 7] },
  { mob: 'spider', x: 165, z: -135, r: 50, n: 12, lv: [5, 8] },
  { mob: 'bandit', x: 172, z: 190, r: 40, n: 12, lv: [6, 9] },
];
