// Temporary developer HUD (replaced by src/ui once integrated). Plain DOM, minimal styling.
import { bus } from './events.js';
import { SPELLS } from './data/spells.js';
import { QUEST } from './data/quests.js';

export class DebugHUD {
  constructor(game) {
    this.g = game;
    const el = this.el = document.createElement('div');
    el.style.cssText = 'position:fixed;inset:0;pointer-events:none;font:13px "Roboto Condensed",sans-serif;color:#fff;text-shadow:0 1px 2px #000;z-index:10';
    el.innerHTML = `<div id="dh-p" style="position:absolute;left:12px;top:12px"></div><div id="dh-t" style="position:absolute;left:300px;top:12px"></div>
      <div id="dh-c" style="position:absolute;left:50%;bottom:120px;transform:translateX(-50%)"></div><div id="dh-b" style="position:absolute;left:50%;bottom:16px;transform:translateX(-50%);display:flex;gap:4px"></div>
      <div id="dh-e" style="position:absolute;left:0;right:0;top:18%;text-align:center;color:#ff3030;font-size:18px"></div>
      <div id="dh-l" style="position:absolute;left:12px;bottom:12px;width:420px;max-height:220px;overflow:hidden;background:rgba(0,0,0,.25);padding:4px"></div>
      <div id="dh-q" style="position:absolute;right:12px;top:200px;width:260px"></div>`;
    document.body.appendChild(el);
    this.$ = id => el.querySelector('#dh-' + id);
    this.log = [];
    const L = (t, c = '#ddd') => { this.log.push(`<div style="color:${c}">${t}</div>`); if (this.log.length > 14) this.log.shift(); this.$('l').innerHTML = this.log.join(''); };
    bus.on('error', e => { if (e.unit === game.player) { this.$('e').textContent = e.msg; clearTimeout(this.et); this.et = setTimeout(() => this.$('e').textContent = '', 1500); } });
    bus.on('damage', e => { if (e.src === game.player || e.dst === game.player) L(`${e.src.name} → ${e.dst.name}: ${e.amount}${e.crit ? ' CRIT' : ''} ${e.spellId || 'melee'}`, e.dst === game.player ? '#f88' : '#fff'); });
    bus.on('heal', e => { if (e.src === game.player) L(`heal ${e.dst.name} +${e.amount}`, '#8f8'); });
    bus.on('xp', e => L(`+${e.amount} XP`, '#b8f'));
    bus.on('level_up', e => L(`DING! Level ${e.level} ${e.learned.map(i => SPELLS[i].name).join(', ')}`, '#ff0'));
    bus.on('say', e => L(`${e.unit.name} ${e.yell ? 'yells' : 'says'}: ${e.text}`, e.yell ? '#f44' : '#fff'));
    bus.on('emote', e => L(e.text, '#fa6'));
    bus.on('quest_progress', e => L(`${e.obj.label}: ${e.value}/${e.obj.count ?? 1}`, '#ff8'));
    bus.on('gossip', e => { L(`[${e.def.name}] ${e.def.greet || ''}`, '#ffd'); for (const o of e.offers) { if (o.kind === 'offer') { game.acceptQuest(o.q.id); L(`Quest accepted: ${o.q.title}`, '#ff0'); } else if (o.kind === 'complete') { const ch = game.questRewardChoices(o.q); game.completeQuest(o.q.id, ch?.[0]); L(`Quest completed: ${o.q.title}`, '#ff0'); } } });
    bus.on('loot_open', e => { game.lootAll(e.corpse); });
    const CH = { general: '#ffc0c0', trade: '#ffc0c0', lfg: '#ffc0c0', localdefense: '#ffc0c0', guild: '#40ff40', party: '#aaaaff', whisper: '#ff80ff', whisper_out: '#ff80ff', say: '#fff', yell: '#ff4040', emote: '#ff8040', system: '#ffff00' };
    const NAMES = { general: '[1. General] ', trade: '[2. Trade] ', lfg: '[4. LookingForGroup] ', localdefense: '[3. LocalDefense] ', guild: '[Guild] ', party: '[Party] ' };
    this.chat = [];
    bus.on('chat', e => { const who = e.from ? `[${e.from}]` : ''; const line = e.ch === 'whisper' ? `${who} whispers: ${e.text}` : e.ch === 'whisper_out' ? `To [${e.to}]: ${e.text}` : e.ch === 'emote' || e.ch === 'system' ? e.text : `${NAMES[e.ch] || ''}${who}${e.ch === 'yell' ? ' yells' : e.ch === 'say' ? ' says' : ''}: ${e.text}`; L(line, CH[e.ch] || '#ddd'); this.chat.push(line); });
    bus.on('popup', e => { L(e.text + ' (auto-accepted)', '#ff0'); setTimeout(() => e.onAccept?.(), 500); });
    bus.on('loot_item', e => L(`You receive loot: ${e.item?.name || e.id}`, '#1eff00'));
  }
  bar(v, max, col, w = 200) { const p = max ? Math.max(0, Math.min(1, v / max)) : 0; return `<div style="width:${w}px;height:14px;background:#222;border:1px solid #000;margin-top:2px"><div style="width:${p * 100}%;height:100%;background:${col}"></div></div>`; }
  update() {
    const g = this.g, p = g.player; if (!p) return;
    const pcBar = (g.pc || this.g.pc);
    const pc = p.powerType === 'rage' ? '#c22' : '#22c';
    this.$('p').innerHTML = `<b>${p.name}</b> L${p.level} ${p.cls} ${p.dead ? 'DEAD' : ''}${p.ghost ? ' GHOST' : ''}${this.bar(p.hp, p.hpMax, '#2a2')}${p.hp}/${p.hpMax}${this.bar(p.power, p.powerMax, pc)}${Math.round(p.power)}${this.bar(p.xp, 180 + p.level * 95, '#a4f', 200)} gold ${p.gold}`;
    const t = p.target;
    this.$('t').innerHTML = t ? `<b>${t.name}</b> L${t.level}${t.elite ? ' (Elite)' : ''} ${t.dead ? 'dead' : ''}${this.bar(t.hp, t.hpMax, t.hostile ? '#c22' : '#2a2')}${t.hp}/${t.hpMax} ${t.questMark || ''}` : '';
    const c = p.casting;
    this.$('c').innerHTML = c ? `${c.spell.name}${this.bar(c.t, c.dur, '#fc0', 260)}` : '';
    this.$('b').innerHTML = pcBar.bar.map((id, i) => id ? `<div style="width:46px;height:46px;background:#333;border:1px solid #888;font-size:10px;position:relative;overflow:hidden">${(SPELLS[id]?.name || id).slice(0, 12)}<div style="position:absolute;right:2px;bottom:1px;color:#ff0">${i + 1}</div>${p.cdLeft(id) > 0 ? `<div style="position:absolute;inset:0;background:rgba(0,0,0,.6);text-align:center;line-height:46px">${p.cdLeft(id).toFixed(0)}</div>` : ''}</div>` : '').join('');
    this.$('q').innerHTML = this.raidMode && g.boss ? `<div style="color:#f84">${g.boss.name} ${(g.boss.hpPct*100).toFixed(1)}% P${g.boss.brain.phase} ${g.state} attempt ${g.attempt}</div>` + g.raiders.map(m => `<div style="color:${m.dead?'#888':'#fff'}">${m.name} ${m.raidRole} ${Math.round(m.hp)}/${m.hpMax} dmg ${Math.round(m.meter.dmg)} heal ${Math.round(m.meter.heal)}</div>`).join('') : p.quests.map(a => { const q = QUEST[a.id]; return `<div style="color:#fd0">${q.title}</div>` + q.obj.map((o, i) => `<div style="margin-left:8px">- ${o.label}: ${a.progress[i]}/${o.count ?? 1}</div>`).join(''); }).join('');
  }
}
