// Zones you can be in: Everdawn Vale (Dawnhollow, the Ember Maw) and the Crownlands (Aurelion, the Crown City).
// Each has its camps, where SimPlayers live and loiter, a graveyard, its way out, and what its map says.
// The terrain and buildings live in world/ (zone.js for the Vale, crown.js for the Crownlands).
import { CAMPS, PLACES } from '../world/zone.js';
import { CROWN, CITY } from '../world/crown.js';

const E = -Math.PI / 2, Wd = Math.PI / 2; // facing east / west (0 = north, -Z)

export const ZONES = {
  vale: {
    id: 'vale', name: 'Everdawn Vale', home: 'Dawnhollow', music: 'vale', pop: 34,
    camps: CAMPS, named: [['greymaw', 176, 22, 7], ['waxbeard', -165, -104, 6], ['vex', 172, 186, 9]],
    graveyard: [52, 118], simSpawn: { x: PLACES.village.x, z: PLACES.village.z - 60, r: 200 },
    town: [
      { x: 4, z: 142, act: 'mailbox' }, { x: 10, z: 157, act: 'statue' }, { x: -6, z: 136, act: 'inn' }, { x: 22, z: 164, act: 'well' },
      { x: 2, z: 160, act: 'bench', sit: true }, { x: 18, z: 143, act: 'bench', sit: true }, { x: 30, z: 170, act: 'smithy' }, { x: 12, z: 132, act: 'questgiver' },
      { x: -2, z: 147, act: 'square' }, { x: 20, z: 152, act: 'square' },
    ],
    fish: [{ x: -54, z: 4, face: Math.PI }, { x: -52, z: 2, face: Math.PI * 0.9 }, { x: -96, z: 0, face: -0.3 }, { x: -20, z: -8, face: 0.9 }],
    // walk through the Kingsroad gate in the east to reach the Crownlands
    exits: [{ to: 'crown', x: PLACES.pass.x + 8, z: PLACES.pass.z, r: 7, arrive: { x: -392, z: 4, facing: E } }],
    arrive: { x: PLACES.pass.x - 16, z: PLACES.pass.z + 1, facing: Wd },
    flightArrive: { x: 64, z: 146, facing: Wd },
    hearth: { x: PLACES.village.x - 8, z: PLACES.village.z - 18 },
    mapZ: [-440, 280], areas: null, // map.js AREAS
    labels: [
      ['Dawnhollow', 10, 165, 'town'], ['Goldfield Farms', -160, 125, 'zone', '1-3'], ['Whisperwood', 150, 70, 'zone', '2-5'], ['Mirrormere Lake', -70, -45, 'zone', '3-6'],
      ['Candlerock Mine', -168, -125, 'poi', '4-7'], ['Webwood Hollow', 165, -150, 'danger', '5-8'], ['Redcloak Ruins', 172, 215, 'danger', '6-9'], ['The Ember Maw', 0, -300, 'danger', 'Raid'],
      ['Ember Peak', 0, -400, 'poi'], ['Kingsroad Pass', PLACES.pass.x - 10, PLACES.pass.z + 22, 'poi', 'to the Crownlands'],
    ],
  },
  crown: {
    id: 'crown', name: 'The Crownlands', home: 'Aurelion', music: 'vale', pop: 40,
    camps: [
      { mob: 'hedgeBoar', x: -130, z: 60, r: 44, n: 10, lv: [5, 7] },
      { mob: 'prowler', x: -240, z: -60, r: 50, n: 10, lv: [6, 8] },
      { mob: 'greymask', x: CROWN.places.camp.x, z: CROWN.places.camp.z, r: 40, n: 12, lv: [7, 9] },
      { mob: 'quarryKobold', x: CROWN.places.quarry.x, z: CROWN.places.quarry.z, r: 38, n: 12, lv: [7, 9] },
      { mob: 'saltfin', x: CROWN.places.coast.x, z: CROWN.places.coast.z, r: 40, n: 10, lv: [8, 10] },
      { mob: 'creeper', x: CROWN.places.grove.x, z: CROWN.places.grove.z, r: 50, n: 10, lv: [8, 10] },
    ],
    named: [['gnash', -272, -214, 10], ['saltfinCaptain', 252, 262, 10]],
    graveyard: [-70, 30], simSpawn: { x: CITY.x, z: CITY.z, r: 125, city: true },
    town: [
      { x: 120, z: 18, act: 'square' }, { x: 104, z: -12, act: 'square' }, { x: 136, z: -14, act: 'square' }, { x: 118, z: 30, act: 'bank' },
      { x: 40, z: 6, act: 'shops' }, { x: 10, z: -6, act: 'shops' }, { x: 70, z: 8, act: 'shops' }, { x: 150, z: 26, act: 'inn' },
      { x: 262, z: -6, act: 'harbor' }, { x: 262, z: 14, act: 'harbor' }, { x: 150, z: -62, act: 'cathedral' }, { x: 186, z: 58, act: 'smithy' },
      { x: 196, z: -54, act: 'keep' }, { x: 120, z: 12, act: 'bench', sit: true }, { x: 108, z: 6, act: 'bench', sit: true }, { x: -48, z: 4, act: 'statue' },
    ],
    fish: [{ x: 304, z: -58, face: E }, { x: 300, z: 22, face: E }, { x: 306, z: 66, face: E }, { x: 150, z: -45.5, face: 0 }],
    // the Kingsroad gate in the west leads back to Everdawn Vale
    exits: [{ to: 'vale', x: CROWN.places.entrance.x - 8, z: CROWN.places.entrance.z, r: 7, arrive: { x: PLACES.pass.x - 16, z: PLACES.pass.z + 1, facing: Wd } }],
    arrive: { x: -392, z: 4, facing: E },
    flightArrive: { x: 136, z: 30, facing: Wd },
    hearth: null,
    mapZ: [-380, 340],
    areas: [
      { name: 'Aurelion', x: CITY.x, z: CITY.z, r: CITY.r + 10 }, { name: 'Trade District', x: 30, z: 0, r: 34 }, { name: 'Cathedral Square', x: 150, z: -80, r: 34 },
      { name: 'The Royal Keep', x: 196, z: -88, r: 32 }, { name: 'Old Town', x: 60, z: 100, r: 48 }, { name: 'Dwarven District', x: 200, z: 84, r: 38 },
      { name: 'Aurelion Harbor', x: 272, z: 0, r: 50 }, { name: 'Mage Quarter', x: 44, z: -96, r: 30 }, { name: 'Valley of Kings', x: -84, z: 0, r: 44 },
      { name: 'The Kingsroad', x: -290, z: 0, r: 90 }, { name: 'Goldmeadow Farms', x: -150, z: 100, r: 80 }, { name: 'Greymask Hideout', x: -176, z: 196, r: 46 },
      { name: "The King's Quarry", x: -262, z: -196, r: 50 }, { name: 'The Thornwood', x: -10, z: -262, r: 70 }, { name: 'Saltfin Shore', x: 236, z: 246, r: 50 },
    ],
    labels: [
      ['Aurelion', 120, -10, 'town'], ['Trade District', 30, 30, 'poi'], ['Cathedral Square', 150, -130, 'poi'], ['The Royal Keep', 214, -130, 'poi'],
      ['Old Town', 60, 110, 'poi'], ['Dwarven District', 206, 104, 'poi'], ['Harbor', 280, 0, 'poi'], ['Mage Quarter', 40, -128, 'poi'],
      ['Valley of Kings', -84, -26, 'poi'], ['The Kingsroad', -290, -24, 'zone', '5-8'], ['Goldmeadow Farms', -150, 70, 'zone', '5-7'],
      ['Greymask Hideout', -176, 230, 'danger', '7-9'], ["The King's Quarry", -262, -236, 'danger', '7-10'], ['The Thornwood', -10, -300, 'danger', '8-10'],
      ['Saltfin Shore', 236, 284, 'danger', '8-10'], ['Kingsroad Gate', -408, -24, 'poi', 'to Everdawn Vale'],
    ],
  },
};
export const zoneOf = id => ZONES[id] || ZONES.vale;
