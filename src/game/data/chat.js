// SimPlayer voice: names, guilds, personalities and several hundred chat lines. {p} = player name, {n} = speaker,
// {t} = random other SimPlayer, {item} = random item link, {place}, {mob}, {guild}. Lowercase and typos are intentional.
export const NAME_PARTS = {
  pre: ['Leg', 'Ar', 'Shadow', 'Dark', 'Moon', 'Frost', 'Holy', 'Heal', 'Stab', 'Tank', 'Pew', 'Loot', 'Brew', 'Grim', 'Thun', 'Sneak', 'Crit', 'Dot', 'Lol', 'Mage', 'Rage', 'Star', 'Night', 'Storm', 'Blood', 'Fire', 'Iron', 'Wolf', 'Bear', 'Kitty', 'Pally', 'Priest', 'Axe', 'Gank', 'Chunk', 'Nerf', 'Buff', 'Epic', 'Afk', 'Mana'],
  post: ['olas', 'thas', 'blade', 'walker', 'fury', 'heart', 'bot', 'zor', 'stein', 'lazor', 'master', 'beard', 'hoof', 'ster', 'bane', 'shot', 'face', 'man', 'lord', 'queen', 'wrath', 'fist', 'tickle', 'ninja', 'dude', 'boi', 'ette', 'tastic', 'nator', 'licious', 'y', 'lock', 'wing', 'fang', 'sauce'],
};
export const CURATED_NAMES = [
  'Legolaas', 'Arthaswrath', 'Healbot', 'Stabbyjoe', 'Xxdarkshadowxx', 'Moonkinfury', 'Lootmaster', 'Brewbeard', 'Chucknorriz', 'Tankenstein',
  'Pewpewlazor', 'Sneakypete', 'Grandmaheals', 'Leafyboi', 'Dotsandbots', 'Gankalf', 'Holycowz', 'Ragequitt', 'Brbpizza', 'Frostyflakes',
  'Mcstabberson', 'Pyrotechnix', 'Sirlootsalot', 'Notabot', 'Healzorz', 'Critsalot', 'Bubblehearth', 'Lolwut', 'Tauntalot', 'Fishbait',
  'Oldmanjenkins', 'Barrenschat', 'Shieldwall', 'Omgwtfbbq', 'Dpsdad', 'Momsreroll', 'Ninjalooter', 'Pullingnow', 'Clickyclick', 'Keyboardturner',
  'Standinfire', 'Afkmcgee', 'Buffpls', 'Wipeitt', 'Lagmonster', 'Dinglebert', 'Grumblebeard', 'Aelindra', 'Thornwhisper', 'Kaelthan',
  'Brunhilda', 'Morgrash', 'Zugzugg', 'Ironhoof', 'Seraphel', 'Valyndra', 'Mistral', 'Durgan', 'Elowen', 'Thrakk',
];
export const GUILDS = ['Tax Evasion', 'Salt Mine', 'Loot Council Survivors', 'Pull Timer', 'Casual Friday', 'The Wipe Club', 'Stand Behind Me', 'Dad Guild', 'Fishing Enthusiasts', 'Afk Legends', 'Bots of Lastlight', 'Mount Collectors', 'Ninja Loot Inc', 'Raid Or Die', 'Stay Hydrated'];

// personality archetypes: weights for each chat pool
export const ARCHETYPES = {
  tryhard: { chatty: 0.5, skill: 0.9, pools: ['vet', 'lfg', 'general'] },
  noob: { chatty: 0.7, skill: 0.25, pools: ['noob', 'question', 'general'] },
  troll: { chatty: 0.8, skill: 0.6, pools: ['troll', 'general', 'trade'] },
  roleplayer: { chatty: 0.5, skill: 0.6, pools: ['rp'] },
  veteran: { chatty: 0.4, skill: 0.85, pools: ['vet', 'answer', 'general'] },
  lootgoblin: { chatty: 0.6, skill: 0.6, pools: ['trade', 'general'] },
  afk: { chatty: 0.2, skill: 0.4, pools: ['afk', 'general'] },
  leeroy: { chatty: 0.6, skill: 0.4, pools: ['troll', 'general'] },
  wholesome: { chatty: 0.6, skill: 0.6, pools: ['wholesome', 'answer', 'general'] },
  dad: { chatty: 0.5, skill: 0.55, pools: ['dad', 'general'] },
  silent: { chatty: 0.05, skill: 0.7, pools: ['general'] },
};

export const LINES = {
  general: [
    'anyone else up at 3am grinding', 'this music slaps honestly', 'i miss when this game was new', 'remember when this realm had like 5000 people online',
    'brb pizza', 'my cat just walked across my keyboard sry', 'hey guys', 'gm vale', 'gn everyone', 'does anyone actually read quest text', 'i just want to fish in peace',
    'the fishing here is so relaxing', 'who wants to duel outside town', 'is it just me or is the dragon harder every night', 'that windmill has been spinning since 2004',
    'boars in this zone have more hp than me', 'lol', 'lmao', 'wow', 'anyone doing the dragon tonight', 'need a break from the raid tbh', 'this zone is so pretty at sunset',
    'why do kobolds even want candles', 'the gurglers are gurgling again', 'is the inn open', 'just dinged 7 lets goooo', 'bored', 'hello?', 'chat is dead today',
    'first time back in years, nothing changed lol', 'shoutout to whoever keeps killing the wolves by the road', 'why is there always a guy dancing on the mailbox',
    'does the inn have a bard or is that just a guy screaming', 'the sunsets in this zone hit different', 'petition to make boars drop more than 1 haunch', 'just spent 20 min looking for greymaw, he was behind me the whole time',
    'why does the windmill spin when there is no wind', 'my bags are full of spider legs, send help', 'somebody named their character Notabot, sus', 'i died to a boar. a BOAR.', 'imagine not having a pet rock', 'anyone else hear the mountain rumbling',
    'the fisherman has been standing on that dock since 2005', 'blacksmith charged me 5g for a repair, robbery', 'guild recruiting for our raid team, must have ears', 'what is the drop rate on the drake mount anyway', 'lf1m to hold my hand through webwood', 'the gurglers stole my fishing rod',
    'somebody pls kill greymaw hes camping the path again', 'hot take: wheat fields are the best part of this game', 'i put 4000 hours into this realm and i regret nothing',
    'the dragon took my lunch money', 'ok who pulled the entire kobold camp', 'lf someone to talk to lol', '/dance', 'o/', 'yo', 'sup vale',
  ],
  question: [
    'anyone know where the kobold mine is?', 'how do i get to the raid', 'where do i turn in the wolf quest', 'is there a mount in this game??', 'whats the max level',
    'is this server dead?', 'where does old greymaw spawn', 'how do i get out of the lake', 'wheres the fisherman', 'where do i find spider silk',
    'what does int do', 'can someone explain what a "parse" is', 'how do i change my action bar', 'is the dragon hard?', 'whats the best class for the raid',
    'where is Vex Redcloak', 'how do u loot', 'does anyone know a good healer',
  ],
  answer: [
    'follow the road north past the lake', 'press M for the map', 'its in the cliffs west of the lake', 'turn left at the windmill', 'ask the marshal in town',
    'idk im lost too', 'google it lol', 'its behind the big volcano, you cant miss it', 'kill the spiders north east, they drop it', 'just follow the quest tracker',
    'mage is ez mode tbh', 'priests are always needed for raids', 'the ruins south east', 'right click the corpse', 'yeah its in the forest east, bring friends',
  ],
  trade: [
    'WTS {item} cheap PST', 'WTB {item} paying well', 'LF enchanter', 'selling portals to anywhere (the inn)', 'WTS {item} slightly used',
    'anyone selling bags?', 'WTS {item} 5g OBO', 'LF blacksmith to craft me something shiny', 'buying ALL {item}', 'WTS [Candlerock Candle] only a little melted',
    'selling boar meat, fresh, dont ask', 'WTT {item} for {item}', 'pst for cheap carries through the kobold mine', 'LF someone to buy my junk plz',
  ],
  lfg: [
    'LFG Greymaw need 1 more', 'LF1M healer for the dragon', 'LFM Ember Maw 8/10 need heals + dps /w me', 'LF tank', 'any healers?? just need 1',
    'LFG anything lol', 'LF2M Redcloak Ruins quest', 'LFM dragon farm, know the fight, no ninjas', 'forming raid at the gate, /w for inv', 'need dps for kobold chief',
  ],
  vet: [
    'back in my day the dragon had 3 phases and we LIKED it', 'ppl dont know how good they have it', 'use your cooldowns people', 'stack on the tank for breath, spread for fire',
    'if you stand in fire you are the problem', 'rotation > gear', 'parse or go home', 'nobody reads the tactics anymore', 'i was world first on this dragon in 2006',
    'dps is fine but have you tried not dying', 'healers: renew is free healing', 'mages - hot streak is everything, fire blast on heating up',
  ],
  noob: [
    'how do i attack', 'why cant i use my sword', 'whats a tank', 'is this game free', 'lol i just fell off a cliff', 'how do i whisper ppl',
    '/w how do i whisper', 'i accidentally sold my weapon', 'what button is jump', 'why is everyone dancing', 'how do i get out of ghost mode',
    'whats aggro', 'is it bad to stand in the orange circle', 'which way is north', 'i think i broke my quest log', 'can i pet the wolves',
  ],
  troll: [
    'anyone know where the auction house is? oh wait', 'i heard if you /dance in the raid you get a mount', 'chuck norris solos the dragon naked', 'just pull the boss when rdy (not rdy)',
    'real players only lol jk', 'whoever keeps killing the boars, the boars have families', 'selling [Air] 10g', 'LFG to stand in fire with', 'my dps is so high the meter gave up',
    'what if we are the bots', 'report me', 'the dragon is actually friendly if you /hug it', 'is the dragon single?', 'LEEEEEROOOOOOY',
  ],
  rp: [
    'Hail, traveler! May the Light guide thy steps.', '*sharpens axe menacingly*', 'By my beard, what a fine morning in the vale!', 'The mountain grumbles. I like it not.',
    'Mayhaps we shall meet again upon the field of battle.', '*tips hat*', 'Innkeeper! Your finest ale, and be quick about it!', 'I seek the dragon. For honor. And also for loot.',
    'Stay thy blade, friend, I mean no harm.', '*gazes wistfully at the volcano*', 'The wolves sing tonight. Someone will not see the dawn.',
  ],
  afk: ['brb', 'afk', 'sry was afk', 'back', 'brb bio', 'brb dog', 'ok back', 'afk 5 min', 'sorry my mom called me for dinner'],
  wholesome: [
    'you got this everyone', 'gz everyone who dinged today', 'if anyone needs help just whisper me :)', 'love this community', 'drink water between pulls',
    'no rush, take your time', 'good luck on the dragon tonight!', 'thanks for the heals earlier whoever that was', 'what a nice day in the vale',
  ],
  dad: [
    'my kid is asleep finally, 1 hour of gaming lets go', 'why did the kobold cross the road? to get to the other SIDE of the mine', 'hi hungry, im dad',
    'back in my day we walked uphill to the raid both ways', 'my wife says i have to log off after this dragon', 'anyone else here over 40 lol',
    'i told my son i was fighting a dragon, he said "cool dad" and left', 'grilling irl, brb',
  ],
  eerie: [
    'does anyone else feel like we have done this before', 'i cant remember the last time i logged out', 'is anyone here real?', 'someone new just logged in',
    'welcome {p}. we have been waiting.', 'the servers were supposed to close in 2012 right?', 'hello {p}', 'every night the same dragon. every night.',
    'do you ever wonder what happens to the realm when nobody is watching', 'it is nice to have a human around again',
  ],
  localdefense: [
    'Old Greymaw spotted in Whisperwood!', 'Redcloaks on the south-east road, careful', 'kobolds pushing out of the mine again', 'is the volcano glowing more than usual??',
    'gurglers raiding the dock AGAIN', 'Greymaw just ate a lowbie by the road',
  ],
};

export const REACT = {
  ding: ['gz', 'grats!', 'DING!', 'grats :D', 'gg', 'nice', 'grats {p}', 'gz gz', 'welcome to the grind', 'ding grats', 'grats! only a few more to go', 'gratz'],
  dingSelf: ['DING!', 'ding :)', 'finally dinged', 'ding! only took forever'],
  death: ['lol', 'rip', 'F', 'oof', 'u ok?', 'happens to the best of us', 'rip in peace', 'did u stand in something', 'ouch'],
  epic: ['gz!', 'ninja', 'lucky', 'grats on the epic!', 'jelly', 'wow gz', 'nice drop!!', 'i have been farming that for weeks...'],
  ks: ['ks much?', 'thx for the ks', 'wow ok', 'that was my mob', 'rude', 'dude', 'i had that one'],
  wave: ['o/', 'hi', 'hey', 'sup', 'hello!', 'hiya', 'yo', '*waves*'],
  thanks: ['ty', 'thx', 'ty!', 'thanks!!', 'appreciate it', 'ur the best'],
  bye: ['gtg ty for group', 'ty for grp!', 'gotta go, dinner', 'thx guys cya', 'leaving, gl!', 'gn all'],
  inviteYes: ['sure!', 'omw', 'inv pls', 'yes', 'ok!', 'lets go'],
  inviteNo: ['sry busy', 'no ty', 'already in a group', 'maybe later', 'im afk sorry'],
  duelWin: ['gg', 'ez', 'gg wp', 'good fight!', 'better luck next time :)'],
  duelLose: ['gg', 'gg wp', 'nice', 'u got lucky lol', 'rematch?'],
};

export const WHISPERS = [
  'hi', 'wanna group?', 'nice gear', 'can u help me with greymaw?', 'r u new?', 'u a bot?', 'spare some copper?', 'lol nice', 'ur the first new face in years',
  'hey are you doing the dragon tonight?', 'how did you get that weapon', 'wanna duel?', 'can i follow u, im lost', 'hey friend :)', 'is ur name a reference to something?',
];

// replies to things the player types (lowercased keyword → pool)
export const REPLIES = [
  { k: ['bot'], r: ['no ur a bot', 'beep boop. i mean. no', '...no?', 'why does everyone keep asking that', 'r u?', 'define bot'] },
  { k: ['real', 'human'], r: ['as real as you are', 'last time i checked', 'what does real even mean', 'yes. probably.', 'are YOU real?'] },
  { k: ['hi', 'hello', 'hey', 'sup', 'yo', 'o/'], r: ['hey!', 'hi :)', 'o/', 'sup', 'hello friend', 'hiya'] },
  { k: ['lol', 'lmao', 'haha'], r: ['lol', 'haha', 'lmao', ':D'] },
  { k: ['gz', 'grats', 'congrats'], r: ['ty!', 'thx :)', 'ty ty'] },
  { k: ['help'], r: ['sure what u need', 'omw', 'where are u?', 'ask the marshal in town'] },
  { k: ['where'], r: ['press M', 'follow the road', 'its up north', 'idk lol', 'near the lake'] },
  { k: ['duel'], r: ['ok bring it', 'u sure?', 'lets go'] },
  { k: ['dance'], r: ['/dance', 'you first', '*dances*'] },
  { k: ['dragon', 'raid'], r: ['raid forms at the gate every night', 'u need lvl 10 first', 'bring potions', 'dont stand in the breath'] },
  { k: ['who are you', 'who r u'], r: ['just a player like you :)', 'a humble adventurer', 'nobody special', 'i have been here a long time'] },
  { k: ['?'], r: ['idk', 'no clue', '??', 'ask trade chat'] },
];
export const DEFAULT_REPLY = ['lol', 'ok', 'sure', 'cool', '?', 'nice', 'true', 'haha', 'ya'];
