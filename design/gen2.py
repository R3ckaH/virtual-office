"""Animated Office Floor artboard (Main.dc.html). Tokens in templates look like @NAME@."""
import json, os

ROOT = os.path.join(os.path.dirname(__file__), 'project')


def R(tpl, **kw):
    for k, v in kw.items():
        tpl = tpl.replace('@' + k + '@', str(v))
    return tpl


ICONS = {
    'home': '<path d="M3 11l9-7 9 7"/><path d="M5 10v10h14V10"/>',
    'building': '<rect x="4" y="3" width="16" height="18" rx="1"/><path d="M9 7h1M14 7h1M9 11h1M14 11h1M9 15h1M14 15h1M10 21v-3h4v3"/>',
    'video': '<rect x="3" y="6" width="13" height="12" rx="2"/><path d="M16 10l5-3v10l-5-3"/>',
    'chat': '<path d="M4 5h16v11H9l-5 4z"/>',
    'tasks': '<path d="M10 6h10M10 12h10M10 18h10M4 6l1 1 2-2M4 12l1 1 2-2M4 18l1 1 2-2"/>',
    'clock': '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
    'calendar': '<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M3 10h18M8 3v4M16 3v4"/>',
    'settings': '<path d="M4 7h10M18 7h2M4 17h4M12 17h8"/><circle cx="16" cy="7" r="2"/><circle cx="10" cy="17" r="2"/>',
    'users': '<circle cx="9" cy="8" r="3"/><path d="M3 20c0-3.3 2.7-6 6-6s6 2.7 6 6"/><path d="M16 11a3 3 0 1 0 0-6M21 20c0-2.6-1.6-4.8-4-5.6"/>',
    'lock': '<rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/>',
    'coffee': '<path d="M4 9h13v5a5 5 0 0 1-5 5H9a5 5 0 0 1-5-5z"/><path d="M17 11h1.5a2.5 2.5 0 0 1 0 5H17M8 3v3M12 3v3"/>',
    'door': '<path d="M5 21V4a1 1 0 0 1 1-1h12a1 1 0 0 1 1 1v17M3 21h18"/><path d="M15 12h.01"/>',
    'x': '<path d="M6 6l12 12M18 6L6 18"/>',
    'phone': '<path d="M5 4h4l2 5-2.5 1.5a11 11 0 0 0 5 5L15 13l5 2v4a2 2 0 0 1-2 2A16 16 0 0 1 3 6a2 2 0 0 1 2-2z"/>',
}


def svg(name, size=18):
    return ('<svg width="%d" height="%d" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" '
            'stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">%s</svg>') % (size, size, ICONS[name])


# ------------------------------------------------------------------ the floor plan (800 x 620) ----
# rect = x, y, w, h. door = point on the wall; c = which hallway it opens onto (1: y=235, 2: y=465).
# slots = where people stand/sit (feet position).
ROOMS = {
    'eng': dict(name='Engineering', kind='dept', icon='users', rect=(0, 0, 480, 210), door=(240, 210, 1),
                slots=[(60, 95), (150, 95), (330, 95), (420, 95), (60, 180), (420, 180)], desks=True),
    'maria': dict(name="Maria's office", kind='private', icon='lock', rect=(510, 0, 290, 210), door=(655, 210, 1),
                  slots=[(655, 120), (600, 188), (710, 188)]),
    'huddle': dict(name='Huddle room', kind='meeting', icon='video', rect=(0, 260, 250, 180), door=(125, 260, 1),
                   slots=[(75, 340), (125, 336), (175, 340), (75, 418), (175, 418), (125, 420)]),
    'sales': dict(name='Sales', kind='dept', icon='users', rect=(280, 260, 250, 180), door=(405, 260, 1),
                  slots=[(335, 335), (475, 335), (335, 415), (475, 415)], desks=True),
    'lobby': dict(name='Lobby', kind='open', icon='door', rect=(560, 260, 240, 180), door=(680, 260, 1),
                  slots=[(620, 368), (670, 368), (720, 368), (765, 418), (610, 418)]),
    'ops': dict(name='Operations & HR', kind='dept', icon='users', rect=(0, 490, 250, 130), door=(125, 490, 2),
                slots=[(55, 585), (195, 585), (125, 600)]),
    'pantry': dict(name='Pantry', kind='open', icon='coffee', rect=(280, 490, 250, 130), door=(405, 490, 2),
                   slots=[(330, 560), (390, 560), (450, 560), (360, 603), (430, 603)]),
    'focus': dict(name='Focus booth', kind='private', icon='lock', rect=(560, 490, 110, 130), door=(615, 490, 2),
                  slots=[(615, 585)]),
    'board': dict(name='Board room', kind='meeting', icon='video', rect=(690, 490, 110, 130), door=(745, 490, 2),
                  slots=[(722, 548), (768, 548), (745, 610)]),
}

WALL = '#7E8A7C'
HALL = '#DADFD5'

BG = {
    'dept': 'background-color: #F7F3EC; background-image: linear-gradient(90deg, rgba(120,95,60,0.07) 1px, transparent 1px); background-size: 28px 100%',
    'meeting': 'background-color: #ECE8F6',
    'private': 'background-color: #F4F1EA; background-image: repeating-linear-gradient(45deg, rgba(0,0,0,0.03) 0 6px, transparent 6px 12px)',
    'pantry': 'background-color: #F6F6F2; background-image: linear-gradient(45deg, #E8E9E3 25%, transparent 25%, transparent 75%, #E8E9E3 75%), linear-gradient(45deg, #E8E9E3 25%, transparent 25%, transparent 75%, #E8E9E3 75%); background-size: 20px 20px; background-position: 0 0, 10px 10px',
    'lobby': 'background-color: #EDF2F0',
}


def room_bg(rid, r):
    if rid == 'pantry':
        return BG['pantry']
    if rid == 'lobby':
        return BG['lobby']
    return BG[r['kind']] if r['kind'] in BG else BG['dept']


def room_button(rid, r):
    x, y, w, h = r['rect']
    extra = ''
    if rid == 'huddle':
        extra = '<span style="display: flex; align-items: center; gap: 5px; color: #BE123C; font-weight: 700"><span class="vo-live" style="width: 7px; height: 7px; border-radius: 999px; background: #BE123C"></span>Live</span>'
    if rid == 'board':
        extra = ''
    name = r['name'].replace('&', '&amp;')
    return R('''<button type="button" class="vo-room" onClick="{{rooms.@ID@.click}}" aria-label="{{rooms.@ID@.aria}}" title="{{rooms.@ID@.aria}}" style="position: absolute; left: @X@px; top: @Y@px; width: @W@px; height: @H@px; box-sizing: border-box; margin: 0; padding: 0; border: 3px solid {{rooms.@ID@.wall}}; border-radius: 6px; cursor: pointer; font-family: inherit; z-index: 1; @BG@">
<span style="position: absolute; left: 6px; top: 6px; display: flex; align-items: center; gap: 6px; padding: 3px 9px 3px 7px; border-radius: 999px; background: rgba(255,255,255,0.9); color: #1B2230; font-size: 12px; font-weight: 600; white-space: nowrap">@ICON@<span>@NAME@</span><span style="color: #586171; font-weight: 500">{{rooms.@ID@.count}}</span>@EXTRA@<sc-if value="{{rooms.@ID@.isMine}}" hint-placeholder-val="{{false}}"><span style="color: {{accent}}; font-weight: 700">You're here</span></sc-if></span>
</button>
''', ID=rid, X=x, Y=y, W=w, H=h, BG=room_bg(rid, r), ICON=svg(r['icon'], 13), NAME=name, EXTRA=extra)


def door(rid, r):
    dx, dy, c = r['door']
    return R('<span style="position: absolute; left: @L@px; top: @T@px; width: 36px; height: 6px; background: @HALL@; z-index: 2; pointer-events: none"></span>',
             L=dx - 18, T=dy - 3, HALL=HALL)


def span(style):
    return '<span style="' + style + '; pointer-events: none"></span>'


def desk(x, y, mug=False):
    out = span('position: absolute; left: %dpx; top: %dpx; width: 52px; height: 17px; border-radius: 4px; background: #C8A57A; box-shadow: inset 0 3px 0 #DCBE97, 0 2px 0 rgba(0,0,0,0.12); z-index: %d' % (x - 26, y - 13, y + 20))
    out += span('position: absolute; left: %dpx; top: %dpx; width: 18px; height: 13px; border-radius: 2px 2px 0 0; background: #3B4557; z-index: %d' % (x - 9, y - 25, y + 21))
    out += span('position: absolute; left: %dpx; top: %dpx; width: 4px; height: 4px; border-radius: 50%%; background: #CBD5E1; z-index: %d' % (x - 2, y - 21, y + 22))
    if mug:
        out += span('position: absolute; left: %dpx; top: %dpx; width: 6px; height: 7px; border-radius: 1px 1px 2px 2px; background: #F8FAFC; border: 1px solid #94A3B8; z-index: %d' % (x + 14, y - 16, y + 22))
    return out


def plant(x, y):
    return (span('position: absolute; left: %dpx; top: %dpx; width: 24px; height: 20px; border-radius: 50%%; background: #3F8F5A; z-index: %d' % (x - 12, y - 30, y + 9))
            + span('position: absolute; left: %dpx; top: %dpx; width: 14px; height: 12px; border-radius: 50%%; background: #5FAE73; z-index: %d' % (x - 9, y - 32, y + 10))
            + span('position: absolute; left: %dpx; top: %dpx; width: 14px; height: 11px; border-radius: 0 0 4px 4px; background: #B8794F; z-index: %d' % (x - 7, y - 11, y + 10)))


def furniture():
    out = []
    for rid, r in ROOMS.items():
        if r.get('desks'):
            for i, (x, y) in enumerate(r['slots'][:6]):
                out.append(desk(x, y, mug=(i % 3 == 1)))
    # Maria's office: desk, bookshelf, rug, plant
    out.append(span('position: absolute; left: 585px; top: 150px; width: 140px; height: 50px; border-radius: 10px; background: #E6DCCB; z-index: 2'))
    out.append(desk(655, 120, mug=True))
    out.append(span('position: absolute; left: 700px; top: 12px; width: 90px; height: 16px; border-radius: 3px; background: repeating-linear-gradient(90deg, #8B5E3C 0 10px, #B45309 10px 16px, #0F766E 16px 22px, #8B5E3C 22px 30px); z-index: 3'))
    out.append(plant(780, 195))
    # Huddle room: whiteboard, table
    out.append(span('position: absolute; left: 150px; top: 267px; width: 88px; height: 10px; border-radius: 2px; background: #FFFFFF; border: 1px solid #A8B0A5; z-index: 3'))
    out.append(span('position: absolute; left: 45px; top: 330px; width: 160px; height: 42px; border-radius: 21px; background: #B08968; box-shadow: inset 0 4px 0 #C49A78; z-index: 385'))
    out.append(span('position: absolute; left: 82px; top: 342px; width: 18px; height: 12px; border-radius: 2px; background: #3B4557; z-index: 386'))
    out.append(span('position: absolute; left: 150px; top: 344px; width: 14px; height: 10px; border-radius: 2px; background: #F8FAFC; border: 1px solid #94A3B8; z-index: 386'))
    # Lobby: rug, sofa, plants, reception sign
    out.append(span('position: absolute; left: 590px; top: 380px; width: 150px; height: 42px; border-radius: 22px; background: #D7E4DF; z-index: 2'))
    out.append(span('position: absolute; left: 592px; top: 322px; width: 156px; height: 26px; border-radius: 10px 10px 4px 4px; background: #5B7B8A; z-index: 340'))
    out.append(span('position: absolute; left: 588px; top: 342px; width: 164px; height: 16px; border-radius: 6px; background: #6F93A3; z-index: 341'))
    out.append(plant(580, 425))
    out.append(plant(785, 300))
    # Sales, Ops, Focus desks + plants
    out.append(plant(515, 425))
    out.append(desk(55, 585))
    out.append(desk(195, 585, mug=True))
    out.append(plant(232, 612))
    out.append(desk(615, 585, mug=True))
    # Pantry: counter along the right wall with a coffee machine, high table
    out.append(span('position: absolute; left: 500px; top: 500px; width: 24px; height: 112px; border-radius: 4px; background: #CBD2C8; box-shadow: inset 4px 0 0 #DDE3DA; z-index: 620'))
    out.append(span('position: absolute; left: 503px; top: 520px; width: 18px; height: 22px; border-radius: 3px; background: #334155; z-index: 621'))
    out.append(span('position: absolute; left: 509px; top: 526px; width: 6px; height: 6px; border-radius: 50%; background: #F59E0B; z-index: 622'))
    out.append(span('position: absolute; left: 372px; top: 575px; width: 76px; height: 16px; border-radius: 8px; background: #B08968; z-index: 592'))
    # Board room table + screen
    out.append(span('position: absolute; left: 702px; top: 544px; width: 86px; height: 28px; border-radius: 14px; background: #B08968; box-shadow: inset 0 3px 0 #C49A78; z-index: 590'))
    out.append(span('position: absolute; left: 716px; top: 497px; width: 58px; height: 8px; border-radius: 2px; background: #334155; z-index: 3'))
    # Engineering plant
    out.append(plant(462, 198))
    return '\n'.join(out)


CHAR = '''<button type="button" class="vo-char" onClick="{{c.pick}}" aria-label="{{c.aria}}" title="{{c.aria}}" style="{{c.style}}">
<span style="{{c.shadowStyle}}"></span>
<span style="{{c.flipStyle}}">
<span class="{{c.bodyClass}}" style="{{c.bodyStyle}}">
<span class="vo-leg-l" style="position: absolute; left: 13px; top: 42px; width: 6px; height: 11px; border-radius: 3px; background: #2F3A4A"></span>
<span class="vo-leg-r" style="position: absolute; left: 21px; top: 42px; width: 6px; height: 11px; border-radius: 3px; background: #2F3A4A"></span>
<span style="{{c.shirtStyle}}"></span>
<span style="{{c.sideStyle}}"></span>
<span style="{{c.skinStyle}}"></span>
<span class="vo-eye" style="position: absolute; left: 15px; top: 18px; width: 3px; height: 4px; border-radius: 2px; background: #1F2937; animation-delay: {{c.blinkDelay}}"></span>
<span class="vo-eye" style="position: absolute; left: 22px; top: 18px; width: 3px; height: 4px; border-radius: 2px; background: #1F2937; animation-delay: {{c.blinkDelay}}"></span>
<span style="{{c.hairStyle}}"></span>
<span style="{{c.bunStyle}}"></span>
<sc-if value="{{c.busy}}" hint-placeholder-val="{{false}}"><span style="position: absolute; left: 7px; top: 3px; width: 26px; height: 14px; box-sizing: border-box; border: 3px solid #1F2937; border-bottom-color: transparent; border-radius: 13px 13px 0 0"></span><span style="position: absolute; left: 5px; top: 13px; width: 7px; height: 10px; border-radius: 3px; background: #1F2937"></span><span style="position: absolute; left: 28px; top: 13px; width: 7px; height: 10px; border-radius: 3px; background: #1F2937"></span></sc-if>
<sc-if value="{{c.brk}}" hint-placeholder-val="{{false}}"><span class="vo-steam" style="position: absolute; left: 29px; top: 22px; width: 2px; height: 6px; border-radius: 1px; background: rgba(100,116,139,0.7)"></span><span class="vo-steam" style="position: absolute; left: 33px; top: 22px; width: 2px; height: 6px; border-radius: 1px; background: rgba(100,116,139,0.7); animation-delay: 0.9s"></span><span style="position: absolute; left: 27px; top: 30px; width: 9px; height: 10px; box-sizing: border-box; border-radius: 1px 1px 3px 3px; background: #FFFFFF; border: 1.5px solid #8B5E3C"></span></sc-if>
</span>
</span>
<span style="{{c.badgeStyle}}"><span style="{{c.badgeBarStyle}}"></span></span>
<sc-if value="{{c.away}}" hint-placeholder-val="{{false}}"><span class="vo-zzz" style="position: absolute; left: 26px; top: -4px; font-size: 11px; font-weight: 700; color: #586171">z</span><span class="vo-zzz" style="position: absolute; left: 30px; top: -8px; font-size: 9px; font-weight: 700; color: #586171; animation-delay: 1.3s">z</span></sc-if>
<sc-if value="{{c.talking}}" hint-placeholder-val="{{false}}"><span class="vo-talk" style="position: absolute; left: 20px; top: -17px; width: 26px; height: 15px; box-sizing: border-box; border: 1px solid #C9CEC4; border-radius: 8px 8px 8px 2px; background: #FFFFFF; color: #6D28D9; font-size: 10px; font-weight: 700; line-height: 12px; letter-spacing: 1px; text-align: center; animation-delay: {{c.talkDelay}}">&#8226;&#8226;&#8226;</span></sc-if>
<span style="{{c.tagStyle}}">{{c.first}}</span>
</button>'''

NAV = [('home', 'Home', False), ('building', 'Office Floor', True), ('video', 'Meetings', False), ('chat', 'Chat', False),
       ('tasks', 'Tasks', False), ('clock', 'Attendance', False), ('calendar', 'Leave', False)]


def nav_item(icon, label, active):
    bg = 'rgba(255,255,255,0.15)' if active else 'transparent'
    color = '#FFFFFF' if active else 'rgba(226,232,240,0.85)'
    cur = ' aria-current="page"' if active else ''
    return ('<a href="#floor"' + cur + ' style="display: flex; align-items: center; gap: 12px; padding: 9px 12px; border-radius: 8px; background: '
            + bg + '; color: ' + color + '; font-size: 14px; font-weight: 500; text-decoration: none">' + svg(icon) + '<span>' + label + '</span></a>')


LEGEND = [('Available', 'background: #15803D'), ('In a meeting', 'background: #6D28D9'),
          ('Do not disturb', 'background: #BE123C'), ('On break', 'background: #B45309'),
          ('Away', 'background: #FFFFFF; border: 2px solid #6B7280; box-sizing: border-box')]


def legend():
    items = ''.join('<span style="display: flex; align-items: center; gap: 6px"><span style="width: 10px; height: 10px; border-radius: 999px; '
                    + s + '"></span>' + l + '</span>' for l, s in LEGEND)
    return ('<div style="display: flex; flex-wrap: wrap; align-items: center; gap: 6px 16px; font-size: 12.5px; color: #586171">' + items + '</div>')


CSS = '''
body{margin:0;font-family:'Figtree',system-ui,sans-serif;background:#F4F5F1}
a{color:#1D4ED8}a:hover{color:#1E3A8A}
button:focus-visible,a:focus-visible{outline:2px solid #2563EB;outline-offset:2px}
.vo-room:hover{border-color:var(--vo-accent)!important}
.vo-char{position:absolute;width:40px;height:76px;margin:0;padding:0;border:0;background:transparent;cursor:pointer;font-family:inherit}
.vo-char:hover .vo-body{filter:brightness(1.06)}
@keyframes vo-breathe{0%,100%{transform:translateY(0)}50%{transform:translateY(-1.2px)}}
@keyframes vo-bounce{from{transform:translateY(0)}to{transform:translateY(-2px)}}
@keyframes vo-step{from{transform:translateY(0)}to{transform:translateY(-3.5px)}}
@keyframes vo-blink{0%,93%,100%{transform:scaleY(1)}96%{transform:scaleY(0.1)}}
@keyframes vo-steam{0%{opacity:0;transform:translateY(0)}30%{opacity:.9}100%{opacity:0;transform:translateY(-9px)}}
@keyframes vo-zzz{0%{opacity:0;transform:translate(0,0) scale(.7)}30%{opacity:1}100%{opacity:0;transform:translate(8px,-14px) scale(1.1)}}
@keyframes vo-talk{0%,34%{opacity:1;transform:scale(1)}40%,100%{opacity:0;transform:scale(.5)}}
@keyframes vo-ripple{from{transform:translate(-50%,-50%) scale(.3);opacity:.9}to{transform:translate(-50%,-50%) scale(2.4);opacity:0}}
@keyframes vo-live{0%,100%{opacity:1}50%{opacity:.35}}
.vo-idle{animation:vo-breathe 2.8s ease-in-out infinite}
.vo-walk{animation:vo-bounce .3s ease-in-out infinite alternate}
.vo-walk .vo-leg-l{animation:vo-step .3s ease-in-out infinite alternate}
.vo-walk .vo-leg-r{animation:vo-step .3s ease-in-out infinite alternate-reverse}
.vo-eye{animation:vo-blink 4.6s infinite;transform-origin:center}
.vo-steam{animation:vo-steam 1.8s ease-out infinite}
.vo-zzz{animation:vo-zzz 2.6s ease-out infinite;opacity:0}
.vo-talk{animation:vo-talk 3.6s infinite;opacity:0;transform-origin:bottom left}
.vo-ripple{animation:vo-ripple 1.2s ease-out infinite}
.vo-live{animation:vo-live 1.6s ease-in-out infinite}
@media (prefers-reduced-motion: reduce){.vo-char{transition:none!important}.vo-idle,.vo-walk,.vo-walk .vo-leg-l,.vo-walk .vo-leg-r,.vo-eye,.vo-steam,.vo-ripple,.vo-live{animation:none!important}.vo-zzz,.vo-talk{animation:none!important;opacity:1}}
'''

JS = r'''
class Component extends DCLogic {
  constructor(props) {
    super(props);
    const D = this.data();
    const pos = {};
    const taken = {};
    D.PEOPLE.forEach((p) => {
      if (!p.room) return;
      const i = taken[p.room] || 0;
      taken[p.room] = i + 1;
      const s = D.ROOMS[p.room].slots[i];
      pos[p.id] = { x: s[0], y: s[1], room: p.room, target: p.room, slot: i, c: D.ROOMS[p.room].door.c, dur: 0, walking: false, facing: 'right', tmp: null };
    });
    // Joy has just clocked in: she starts outside the front door and walks into the Lobby.
    pos.joy = Object.assign({}, pos.joy, { x: 840, y: 395, room: null });
    const now = Date.now();
    this.state = {
      pos: pos,
      selected: null,
      myStatus: 'available',
      filter: 'all',
      knockRoom: null,
      fx: null,
      toast: null,
      tick: 0,
      feed: [
        { key: 'f3', text: 'Sprint planning started in the Huddle room', ts: now - 4 * 60000 },
        { key: 'f2', text: 'Grace Lim went on break', ts: now - 6 * 60000 },
        { key: 'f1', text: 'Paolo Aquino turned on Do not disturb', ts: now - 15 * 60000 }
      ]
    };
    this.timers = [];
    this.tokens = {};
    this.feedKey = 10;
  }

  componentDidMount() {
    this.later(() => {
      const slot = this.data().ROOMS.lobby.slots[this.state.pos.joy.slot];
      this.stepAlong('joy', [[780, 395], [720, 400], slot], () => {
        this.patchPos('joy', { room: 'lobby' });
        this.log('Joy Dela Cruz clocked in and walked into the Lobby');
      });
    }, 700);
    this.ticker = setInterval(() => this.setState((s) => ({ tick: s.tick + 1 })), 5000);
    this.life = setInterval(() => this.officeLife(), 9000);
  }

  componentWillUnmount() {
    this.timers.forEach((t) => clearTimeout(t));
    clearInterval(this.ticker);
    clearInterval(this.life);
    clearTimeout(this.toastTimer);
  }

  data() {
    if (this._data) return this._data;
    this._data = {
      NOW: new Date(Date.UTC(2026, 9, 1, 2, 24)),
      HALL: { 1: 235, 2: 465 },
      CONNECTOR_X: 265,
      STATUS: {
        available: { label: 'Available', color: '#15803D' },
        meeting: { label: 'In a meeting', color: '#6D28D9' },
        busy: { label: 'Busy, do not disturb', color: '#BE123C' },
        brk: { label: 'On break', color: '#B45309' },
        away: { label: 'Away', color: '#6B7280' },
        offline: { label: 'Offline', color: '#9CA3AF' }
      },
      ROOMS: __ROOMS__,
      PEOPLE: [
        { id: 'ana', name: 'Ana Cruz', title: 'Software Engineer', dept: 'Engineering', tz: 'Asia/Manila', status: 'available', room: 'eng', me: true },
        { id: 'nico', name: 'Nico Ramos', title: 'Backend Engineer', dept: 'Engineering', tz: 'Asia/Manila', status: 'available', room: 'eng' },
        { id: 'tess', name: 'Tess Bautista', title: 'DevOps Engineer', dept: 'Engineering', tz: 'Asia/Manila', status: 'available', room: 'eng', message: 'Shipping the 10:30 release' },
        { id: 'emily', name: 'Emily Carter', title: 'QA Engineer', dept: 'Engineering', tz: 'America/New_York', status: 'away', room: 'eng', message: 'Late shift, back at 11 PM ET' },
        { id: 'maria', name: 'Maria Santos', title: 'Operations Director', dept: 'Operations', tz: 'Asia/Manila', status: 'available', room: 'maria' },
        { id: 'jose', name: 'Jose Reyes', title: 'Engineering Lead', dept: 'Engineering', tz: 'Asia/Manila', status: 'meeting', room: 'huddle', message: 'Sprint planning until 10:45' },
        { id: 'bea', name: 'Bea Villanueva', title: 'Frontend Engineer', dept: 'Engineering', tz: 'Asia/Manila', status: 'meeting', room: 'huddle' },
        { id: 'kim', name: 'Kim Navarro', title: 'Operations Analyst', dept: 'Operations', tz: 'Asia/Manila', status: 'meeting', room: 'huddle' },
        { id: 'carlo', name: 'Carlo Mendoza', title: 'Account Executive', dept: 'Sales', tz: 'Asia/Manila', status: 'available', room: 'sales' },
        { id: 'ryan', name: 'Ryan Torres', title: 'Sales Development Rep', dept: 'Sales', tz: 'Asia/Manila', status: 'busy', room: 'sales', message: 'On a client call' },
        { id: 'joy', name: 'Joy Dela Cruz', title: 'Recruiter', dept: 'Human Resources', tz: 'Asia/Manila', status: 'available', room: 'lobby', message: 'Just clocked in' },
        { id: 'liza', name: 'Liza Garcia', title: 'Support Associate', dept: 'Operations', tz: 'Asia/Manila', status: 'available', room: 'ops' },
        { id: 'grace', name: 'Grace Lim', title: 'HR Specialist', dept: 'Human Resources', tz: 'Asia/Manila', status: 'brk', room: 'pantry', message: 'Coffee, back by 10:40' },
        { id: 'paolo', name: 'Paolo Aquino', title: 'Junior Engineer', dept: 'Engineering', tz: 'Asia/Manila', status: 'busy', room: 'focus', message: 'Heads down until 11:00' },
        { id: 'daniel', name: 'Daniel Brooks', title: 'Sales Manager', dept: 'Sales', tz: 'America/New_York', status: 'offline', room: null, lastSeen: '6:05 PM' },
        { id: 'sam', name: 'Sam Porter', title: 'Account Executive', dept: 'Sales', tz: 'America/New_York', status: 'offline', room: null, lastSeen: '5:48 PM' }
      ]
    };
    return this._data;
  }

  /* ---------------- helpers ---------------- */

  later(fn, ms) {
    const t = setTimeout(fn, ms);
    this.timers.push(t);
    if (this.timers.length > 200) this.timers = this.timers.slice(-100);
    return t;
  }

  flash(msg) {
    clearTimeout(this.toastTimer);
    this.setState({ toast: msg });
    this.toastTimer = setTimeout(() => this.setState({ toast: null }), 3400);
  }

  log(text) {
    this.feedKey += 1;
    const item = { key: 'k' + this.feedKey, text: text, ts: Date.now() };
    this.setState((s) => ({ feed: [item].concat(s.feed).slice(0, 5) }));
  }

  hash(name) {
    let h = 0;
    for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) >>> 0;
    return h;
  }

  first(id) {
    return this.data().PEOPLE.find((p) => p.id === id).name.split(' ')[0];
  }

  timeIn(tz) {
    return new Intl.DateTimeFormat('en-US', { timeZone: tz, hour: 'numeric', minute: '2-digit' }).format(this.data().NOW);
  }

  offsetOf(tz) {
    const part = new Intl.DateTimeFormat('en-US', { timeZone: tz, timeZoneName: 'shortOffset' })
      .formatToParts(this.data().NOW).find((x) => x.type === 'timeZoneName');
    return part ? part.value : '';
  }

  ago(ts) {
    const s = Math.floor((Date.now() - ts) / 1000);
    if (s < 10) return 'just now';
    if (s < 60) return s + 's ago';
    return Math.floor(s / 60) + ' min ago';
  }

  speed() {
    return 0.13 * (this.props.walkSpeed ?? 1);
  }

  effStatus(id) {
    const D = this.data();
    const p = D.PEOPLE.find((q) => q.id === id);
    const s = this.state.pos[id];
    if (p.me) {
      const kind = s && s.room ? D.ROOMS[s.room].kind : null;
      return kind === 'meeting' ? 'meeting' : this.state.myStatus;
    }
    if (s && s.tmp) return s.tmp;
    return p.status;
  }

  /* ---------------- movement ---------------- */

  patchPos(id, patch) {
    this.setState((s) => {
      const next = Object.assign({}, s.pos);
      next[id] = Object.assign({}, s.pos[id], patch);
      return { pos: next };
    });
  }

  stepAlong(id, pts, done) {
    const token = (this.tokens[id] = (this.tokens[id] || 0) + 1);
    const go = (i) => {
      if (this.tokens[id] !== token) return;
      if (i >= pts.length) {
        this.patchPos(id, { walking: false });
        if (done) done();
        return;
      }
      const cur = this.state.pos[id];
      const nx = pts[i][0];
      const ny = pts[i][1];
      const ms = Math.max(80, Math.round(Math.hypot(nx - cur.x, ny - cur.y) / this.speed()));
      const facing = nx < cur.x - 1 ? 'left' : nx > cur.x + 1 ? 'right' : cur.facing;
      this.patchPos(id, { x: nx, y: ny, dur: ms, walking: true, facing: facing });
      this.later(() => go(i + 1), ms);
    };
    go(0);
  }

  /** Door → hallway → (connector) → hallway → door → seat. */
  route(id, toRoom, slotIdx) {
    const D = this.data();
    const p = this.state.pos[id];
    const pts = [];
    let c = p.c;
    if (p.room) {
      const d = D.ROOMS[p.room].door;
      pts.push([d.x, d.y]);
      pts.push([d.x, D.HALL[d.c]]);
      c = d.c;
    }
    const t = D.ROOMS[toRoom].door;
    if (c !== t.c) {
      pts.push([D.CONNECTOR_X, D.HALL[c]]);
      pts.push([D.CONNECTOR_X, D.HALL[t.c]]);
    }
    pts.push([t.x, D.HALL[t.c]]);
    if (slotIdx !== null && slotIdx !== undefined) {
      pts.push([t.x, t.y]);
      pts.push(D.ROOMS[toRoom].slots[slotIdx]);
    }
    return pts;
  }

  freeSlot(room, forId) {
    const used = {};
    Object.keys(this.state.pos).forEach((id) => {
      const q = this.state.pos[id];
      if (id !== forId && q.target === room && q.slot !== null) used[q.slot] = true;
    });
    const n = this.data().ROOMS[room].slots.length;
    for (let i = 0; i < n; i++) if (!used[i]) return i;
    return null;
  }

  moveTo(id, room, done) {
    const D = this.data();
    const slot = this.freeSlot(room, id);
    if (slot === null) {
      if (id === 'ana') this.flash(D.ROOMS[room].name + ' is full right now.');
      return false;
    }
    const pts = this.route(id, room, slot);
    this.patchPos(id, { room: null, target: room, slot: slot, c: D.ROOMS[room].door.c });
    this.stepAlong(id, pts, () => {
      this.patchPos(id, { room: room });
      if (done) done();
    });
    return true;
  }

  /* ---------------- your actions ---------------- */

  roomClick(rid) {
    const D = this.data();
    const r = D.ROOMS[rid];
    const me = this.state.pos.ana;
    if (me.walking) {
      this.flash("You're already on your way.");
      return;
    }
    if (me.room === rid) {
      this.flash("You're already in " + r.name + '.');
      return;
    }
    if (r.kind === 'private') {
      this.setState({ knockRoom: rid });
      return;
    }
    this.moveTo('ana', rid, () => {
      if (r.kind === 'meeting') {
        this.flash('You joined the call in ' + r.name + '.');
        this.log('You joined the call in ' + r.name);
      } else {
        this.flash('You walked into ' + r.name + '.');
      }
    });
  }

  sendKnock() {
    const D = this.data();
    const rid = this.state.knockRoom;
    const r = D.ROOMS[rid];
    const d = r.door;
    const inside = Object.keys(this.state.pos).filter((id) => id !== 'ana' && this.state.pos[id].room === rid);
    this.setState({ knockRoom: null });
    const pts = this.route('ana', rid, null);
    const outY = d.y < D.HALL[d.c] ? d.y + 16 : d.y - 16;
    pts.push([d.x + 24, outY]);
    this.patchPos('ana', { room: null, target: null, slot: null, c: d.c });
    this.stepAlong('ana', pts, () => {
      this.setState({ fx: { x: d.x, y: d.y } });
      if (!inside.length) {
        this.flash('No one is in ' + r.name + ' right now.');
        this.later(() => this.setState({ fx: null }), 1600);
        return;
      }
      const host = inside[0];
      const name = this.first(host);
      this.log('You knocked on ' + r.name);
      if (this.effStatus(host) === 'busy') {
        this.flash('Knock knock. ' + name + ' is on Do not disturb and will see it when free.');
        this.later(() => this.setState({ fx: null }), 2400);
        return;
      }
      this.flash('Knock knock. Waiting for ' + name + '…');
      this.later(() => {
        this.setState({ fx: null });
        this.flash(name + ' let you in.');
        this.moveTo('ana', rid, null);
      }, 2300);
    });
  }

  /* ---------------- ambient office life ---------------- */

  officeLife() {
    if (this.props.officeLife === false) return;
    const order = ['carlo', 'nico', 'liza', 'tess'];
    this.lifeIdx = ((this.lifeIdx || 0) + 1) % order.length;
    const id = order[this.lifeIdx];
    const s = this.state.pos[id];
    if (!s || s.walking || !s.room || s.room === 'pantry' || s.tmp) return;
    const D = this.data();
    const home = s.room;
    const name = this.first(id);
    this.moveTo(id, 'pantry', () => {
      this.patchPos(id, { tmp: 'brk' });
      this.log(name + ' is grabbing a coffee in the Pantry');
      this.later(() => {
        this.patchPos(id, { tmp: null });
        this.moveTo(id, home, () => this.log(name + ' is back in ' + D.ROOMS[home].name));
      }, 5500);
    });
  }

  /* ---------------- render ---------------- */

  renderVals() {
    const accent = this.props.accent ?? '#2563EB';
    const showNames = this.props.showNames ?? true;
    const st = this.state;
    const D = this.data();
    const SKIN = ['#F1C7A5', '#E0AC85', '#C68B62', '#9C6644', '#F3D2B8'];
    const HAIR = ['#2B2118', '#4A3222', '#1C1C1C', '#6B4423', '#8A5A2B'];
    const SHIRT = ['#2563EB', '#0F766E', '#B45309', '#7C3AED', '#BE185D', '#15803D', '#334155', '#C2410C'];
    const HUES = [210, 160, 30, 280, 340, 190, 100, 250];
    const dimmed = (p, status) => (st.filter === 'eng' && p.dept !== 'Engineering') || (st.filter === 'available' && status !== 'available');
    const dotCss = (status) => (status === 'away' ? 'background: #FFFFFF; border: 2px solid #6B7280' : 'background: ' + D.STATUS[status].color);

    const talkIdx = {};
    const chars = D.PEOPLE.filter((p) => st.pos[p.id]).map((p) => {
      const s = st.pos[p.id];
      const status = this.effStatus(p.id);
      const h = this.hash(p.name);
      const hairKind = (h >> 7) % 3;
      const hair = HAIR[(h >> 3) % HAIR.length];
      const selected = st.selected === p.id;
      const inMeeting = !!s.room && D.ROOMS[s.room].kind === 'meeting' && status === 'meeting';
      let talkDelay = '0s';
      if (inMeeting) {
        const k = talkIdx[s.room] || 0;
        talkIdx[s.room] = k + 1;
        talkDelay = (k * 1.2).toFixed(1) + 's';
      }
      return {
        key: p.id,
        aria: (p.me ? 'You' : p.name) + ', ' + D.STATUS[status].label + (s.room ? ', in ' + D.ROOMS[s.room].name : ', walking'),
        style: 'left: ' + (s.x - 20) + 'px; top: ' + (s.y - 54) + 'px; z-index: ' + (Math.round(s.y) + 10) + '; transition: left ' + s.dur + 'ms linear, top ' + s.dur + 'ms linear, opacity 300ms; opacity: ' + (dimmed(p, status) ? '0.3' : '1'),
        flipStyle: 'position: absolute; left: 0; top: 0; width: 40px; height: 56px; transform: scaleX(' + (s.facing === 'left' ? '-1' : '1') + ')',
        bodyClass: s.walking ? 'vo-body vo-walk' : 'vo-body vo-idle',
        bodyStyle: 'position: absolute; left: 0; top: 0; width: 40px; height: 56px; animation-delay: -' + ((h % 20) / 10).toFixed(1) + 's' + (status === 'away' ? '; filter: saturate(0.35)' : ''),
        shadowStyle: 'position: absolute; left: 8px; top: 50px; width: 24px; height: 7px; border-radius: 50%; background: ' + (selected ? accent : 'rgba(27,34,48,0.2)') + (selected ? '; box-shadow: 0 0 0 3px ' + accent + '55' : ''),
        shirtStyle: 'position: absolute; left: 10px; top: 27px; width: 20px; height: 18px; border-radius: 9px 9px 4px 4px; background: ' + SHIRT[(h >> 5) % SHIRT.length],
        skinStyle: 'position: absolute; left: 10px; top: 8px; width: 20px; height: 20px; border-radius: 50%; background: ' + SKIN[h % SKIN.length],
        hairStyle: 'position: absolute; left: 9px; top: 5px; width: 22px; height: 11px; border-radius: 11px 11px 5px 5px; background: ' + hair,
        sideStyle: hairKind === 1 ? 'position: absolute; left: 7px; top: 8px; width: 26px; height: 17px; border-radius: 7px; background: ' + hair : 'display: none',
        bunStyle: hairKind === 2 ? 'position: absolute; left: 15px; top: 0px; width: 10px; height: 9px; border-radius: 50%; background: ' + hair : 'display: none',
        blinkDelay: '-' + ((h % 46) / 10).toFixed(1) + 's',
        badgeStyle: 'position: absolute; left: 28px; top: 2px; width: 11px; height: 11px; box-sizing: border-box; border-radius: 50%; box-shadow: 0 0 0 2px #FFFFFF; ' + dotCss(status),
        badgeBarStyle: status === 'busy' ? 'position: absolute; left: 2px; right: 2px; top: 4.5px; height: 2px; border-radius: 1px; background: #FFFFFF' : 'display: none',
        busy: status === 'busy',
        brk: status === 'brk',
        away: status === 'away',
        talking: inMeeting,
        talkDelay: talkDelay,
        tagStyle: (showNames ? '' : 'display: none; ') + 'position: absolute; left: 50%; top: 57px; transform: translateX(-50%); padding: 1px 7px; border-radius: 999px; font-size: 11px; font-weight: 600; line-height: 15px; white-space: nowrap; ' + (p.me ? 'background: ' + accent + '; color: #FFFFFF' : 'background: rgba(255,255,255,0.95); color: #1B2230; box-shadow: 0 0 0 1px #DCDFD8'),
        first: p.me ? 'You' : p.name.split(' ')[0],
        pick: () => this.setState({ selected: p.id })
      };
    });

    const rooms = {};
    Object.keys(D.ROOMS).forEach((rid) => {
      const r = D.ROOMS[rid];
      const n = Object.keys(st.pos).filter((id) => st.pos[id].room === rid).length;
      const mine = st.pos.ana.room === rid;
      const action = mine ? "You're here" : r.kind === 'private' ? 'Click to knock' : r.kind === 'meeting' ? (n ? 'Click to join the call' : 'Click to start a call') : 'Click to walk in';
      rooms[rid] = {
        count: n ? String(n) : '',
        isMine: mine,
        wall: mine ? accent : '#7E8A7C',
        aria: r.name + (n ? ', ' + n + (n === 1 ? ' person' : ' people') : ', empty') + '. ' + action,
        click: () => this.roomClick(rid)
      };
    });

    let sel = {};
    const sp = D.PEOPLE.find((p) => p.id === st.selected);
    if (sp) {
      const s = st.pos[sp.id];
      const status = this.effStatus(sp.id);
      const parts = sp.name.split(' ');
      const hue = HUES[this.hash(sp.name) % HUES.length];
      const offline = status === 'offline';
      const room = s && s.room ? D.ROOMS[s.room] : null;
      const sameRoom = !!room && s.room === st.pos.ana.room;
      const message = s && s.tmp === 'brk' ? 'Grabbing a coffee' : sp.message || '';
      sel = {
        name: sp.me ? sp.name + ' (you)' : sp.name,
        title: sp.title,
        dept: sp.dept,
        initials: (parts[0][0] + parts[parts.length - 1][0]).toUpperCase(),
        avatarStyle: 'display: flex; align-items: center; justify-content: center; width: 52px; height: 52px; border-radius: 999px; font-size: 17px; font-weight: 700; background: hsl(' + hue + ' 55% 88%); color: hsl(' + hue + ' 60% 24%)',
        statusLabel: D.STATUS[status].label,
        pillDotStyle: 'width: 10px; height: 10px; border-radius: 999px; box-sizing: border-box; ' + dotCss(status),
        message: message,
        hasMessage: !!message,
        localTime: this.timeIn(sp.tz),
        city: sp.tz.split('/').pop().replace('_', ' '),
        offset: this.offsetOf(sp.tz),
        where: offline ? 'Last seen ' + sp.lastSeen + ' their time' : !room ? (s.walking ? 'On the move' : 'In the hallway') : sameRoom && !sp.me ? 'Here with you in ' + room.name : 'In ' + room.name,
        canAct: !sp.me && !offline,
        hasGo: !sp.me && !offline && !!room && !sameRoom,
        goLabel: !room ? '' : room.kind === 'private' ? 'Knock on ' + room.name : room.kind === 'meeting' ? 'Join their call' : 'Walk over to ' + room.name,
        go: () => (room ? this.roomClick(s.room) : null),
        messageIt: () => this.flash('Opening a chat with ' + parts[0] + '…'),
        callIt: () => this.flash(status === 'busy' ? parts[0] + ' is on Do not disturb. Send a message instead?' : 'Calling ' + parts[0] + '…')
      };
    }

    const myOptions = [['available', 'Available'], ['busy', 'Busy'], ['brk', 'On break'], ['away', 'Away']].map((o) => {
      const on = st.myStatus === o[0];
      return {
        key: o[0],
        label: o[1],
        pressed: on ? 'true' : 'false',
        style: 'display: flex; align-items: center; gap: 8px; height: 38px; padding: 0 12px; border-radius: 10px; font-family: inherit; font-size: 13.5px; font-weight: 600; cursor: pointer; color: #1B2230; background: ' + (on ? '#E8EEFB' : '#FFFFFF') + '; border: ' + (on ? '2px solid ' + accent : '1px solid #C9CEC4'),
        dotStyle: 'width: 10px; height: 10px; border-radius: 999px; box-sizing: border-box; ' + dotCss(o[0]),
        pick: () => this.setState({ myStatus: o[0] })
      };
    });

    const filters = [['all', 'Everyone'], ['eng', 'Engineering'], ['available', 'Available now']].map((f) => {
      const on = st.filter === f[0];
      return {
        key: f[0],
        label: f[1],
        pressed: on ? 'true' : 'false',
        style: 'height: 34px; padding: 0 14px; border-radius: 8px; border: 0; font-family: inherit; font-size: 13.5px; font-weight: 600; cursor: pointer; ' + (on ? 'background: #FFFFFF; color: #1B2230; box-shadow: 0 1px 2px rgba(27,34,48,0.12)' : 'background: transparent; color: #586171'),
        pick: () => this.setState({ filter: f[0] })
      };
    });

    const offline = D.PEOPLE.filter((p) => p.status === 'offline').map((p) => {
      const parts = p.name.split(' ');
      return {
        key: p.id,
        name: p.name,
        initials: (parts[0][0] + parts[parts.length - 1][0]).toUpperCase(),
        aria: p.name + ', offline',
        localTime: this.timeIn(p.tz),
        city: p.tz.split('/').pop().replace('_', ' '),
        chipStyle: 'display: flex; align-items: center; gap: 8px; height: 34px; padding: 0 12px 0 4px; border-radius: 999px; border: 1px solid ' + (st.selected === p.id ? '#1B2230' : '#DCDFD8') + '; background: #FFFFFF; font-family: inherit; font-size: 13px; color: #1B2230; cursor: pointer; opacity: ' + (dimmed(p, 'offline') ? '0.4' : '1'),
        pick: () => this.setState({ selected: p.id })
      };
    });

    let knockTitle = '';
    let knockBody = '';
    let knockCta = 'Knock';
    if (st.knockRoom) {
      const room = D.ROOMS[st.knockRoom];
      const inside = Object.keys(st.pos).filter((id) => id !== 'ana' && st.pos[id].room === st.knockRoom);
      knockTitle = 'Knock on ' + room.name + '?';
      if (!inside.length) {
        knockBody = 'No one is in this room right now.';
        knockCta = 'Walk over anyway';
      } else if (this.effStatus(inside[0]) === 'busy') {
        knockBody = D.PEOPLE.find((p) => p.id === inside[0]).name + ' is on Do not disturb. You will walk to the door and they will see your knock when they are free.';
      } else {
        knockBody = 'You will walk to the door and knock. ' + D.PEOPLE.find((p) => p.id === inside[0]).name + ' gets a notification and can let you in.';
      }
    }

    const fx = st.fx;
    const ring = (delay) => (fx ? 'position: absolute; left: ' + fx.x + 'px; top: ' + fx.y + 'px; width: 34px; height: 34px; box-sizing: border-box; border: 3px solid ' + accent + '; border-radius: 50%; z-index: 900; pointer-events: none; animation-delay: ' + delay : 'display: none');

    const me = st.pos.ana;
    const inCount = Object.keys(st.pos).length;

    return {
      accent: accent,
      chars: chars,
      rooms: rooms,
      hasSel: !!sp,
      noSel: !sp,
      sel: sel,
      clearSel: () => this.setState({ selected: null }),
      myOptions: myOptions,
      filters: filters,
      offline: offline,
      feed: st.feed.map((f) => ({ key: f.key, text: f.text, ago: this.ago(f.ts) })),
      summary: inCount + ' in the office, ' + offline.length + ' offline',
      manilaTime: this.timeIn('Asia/Manila'),
      nyTime: this.timeIn('America/New_York'),
      meWhere: me.room ? 'In ' + D.ROOMS[me.room].name : me.walking ? 'On the move' : 'In the hallway',
      inMeetingRoom: !!me.room && D.ROOMS[me.room].kind === 'meeting',
      meRoomName: me.room ? D.ROOMS[me.room].name : '',
      knock: !!st.knockRoom,
      knockTitle: knockTitle,
      knockBody: knockBody,
      knockCta: knockCta,
      sendKnock: () => this.sendKnock(),
      cancelKnock: () => this.setState({ knockRoom: null }),
      hasFx: !!fx,
      ring1: ring('0s'),
      ring2: ring('0.4s'),
      ring3: ring('0.8s'),
      hasToast: !!st.toast,
      toast: st.toast || ''
    };
  }
}
'''


def js_rooms():
    out = {}
    for rid, r in ROOMS.items():
        dx, dy, c = r['door']
        out[rid] = {'name': r['name'], 'kind': r['kind'], 'door': {'x': dx, 'y': dy, 'c': c}, 'slots': [list(s) for s in r['slots']]}
    return json.dumps(out)


CARD = 'background: #FFFFFF; border: 1px solid #DCDFD8; border-radius: 14px; padding: 16px; display: flex; flex-direction: column; gap: 12px'
BTN2 = 'display: flex; align-items: center; justify-content: center; gap: 8px; height: 38px; border-radius: 10px; border: 1px solid #C9CEC4; background: #FFFFFF; color: #1B2230; font-family: inherit; font-size: 14px; font-weight: 600; cursor: pointer'


def build():
    rooms = ''.join(room_button(rid, r) for rid, r in ROOMS.items())
    doors = '\n'.join(door(rid, r) for rid, r in ROOMS.items())
    nav = '\n'.join(nav_item(*n) for n in NAV)
    body = R('''<div style="position: relative; width: 1440px; height: 960px; display: grid; grid-template-columns: 248px minmax(0, 1fr); background: #F4F5F1; color: #1B2230; font-family: 'Figtree', system-ui, sans-serif; overflow: hidden; --vo-accent: {{accent}}">
<nav aria-label="Main" style="display: flex; flex-direction: column; gap: 4px; padding: 20px 12px 16px; background: #1F3A5F; color: #E2E8F0">
<div style="display: flex; align-items: center; gap: 10px; padding: 0 12px 18px">
<span style="display: flex; align-items: center; justify-content: center; width: 32px; height: 32px; border-radius: 8px; background: {{accent}}; color: #FFFFFF; font-size: 14px; font-weight: 700">A</span>
<span style="display: flex; flex-direction: column; line-height: 1.2"><span style="font-size: 14px; font-weight: 700; color: #FFFFFF">Acme Corp</span><span style="font-size: 12px; color: rgba(226,232,240,0.65)">Virtual Office</span></span>
</div>
@NAV@
<span style="flex-grow: 1"></span>
@SETTINGS@
</nav>
<div style="display: flex; flex-direction: column; min-width: 0">
<header style="height: 64px; flex-shrink: 0; display: flex; align-items: center; gap: 24px; padding: 0 32px; border-bottom: 1px solid #DCDFD8">
<span style="font-size: 14px"><span style="font-weight: 700">{{manilaTime}}</span> <span style="color: #586171">Manila (you)</span></span>
<span style="font-size: 14px"><span style="font-weight: 700">{{nyTime}}</span> <span style="color: #586171">New York</span></span>
<span style="flex-grow: 1"></span>
<span style="display: flex; align-items: center; gap: 8px; height: 34px; padding: 0 14px; border-radius: 999px; background: #E3F1E8; color: #14532D; font-size: 13px; font-weight: 600"><span style="width: 8px; height: 8px; border-radius: 999px; background: #15803D"></span>Clocked in at 8:02 AM</span>
<span style="display: flex; align-items: center; gap: 10px">
<span style="display: flex; align-items: center; justify-content: center; width: 32px; height: 32px; border-radius: 999px; background: hsl(160 55% 88%); color: hsl(160 60% 24%); font-size: 12px; font-weight: 700">AC</span>
<span style="display: flex; flex-direction: column; line-height: 1.2"><span style="font-size: 14px; font-weight: 600">Ana Cruz</span><span style="font-size: 12px; color: #586171">Employee</span></span>
</span>
</header>
<main id="floor" style="display: flex; flex-direction: column; gap: 14px; padding: 20px 32px; min-height: 0">
<div style="display: flex; align-items: flex-end; justify-content: space-between; gap: 16px">
<div>
<h1 style="margin: 0; font-size: 28px; font-weight: 700; letter-spacing: -0.01em">Office Floor</h1>
<p style="margin: 4px 0 0; font-size: 15px; color: #586171">{{summary}}. Click a room to walk there, or click someone to see what they're up to.</p>
</div>
<div style="display: flex; align-items: center; gap: 10px">
<span style="font-size: 13px; color: #586171">Show</span>
<div style="display: flex; gap: 4px; padding: 4px; background: #E6E9E2; border-radius: 10px">
<sc-for list="{{filters}}" as="f" hint-placeholder-count="3"><button type="button" onClick="{{f.pick}}" aria-pressed="{{f.pressed}}" style="{{f.style}}">{{f.label}}</button></sc-for>
</div>
</div>
</div>
<div style="display: flex; gap: 20px; align-items: flex-start; min-height: 0">
<div style="display: flex; flex-direction: column; gap: 12px; flex-shrink: 0">
<div style="padding: 10px; background: #C4CABF; border-radius: 16px">
<div aria-label="Office floor plan" style="position: relative; width: 800px; height: 620px; overflow: hidden; border-radius: 8px; background-color: @HALL@; background-image: radial-gradient(rgba(0,0,0,0.05) 1px, transparent 1px); background-size: 16px 16px">
@ROOMS@
@DOORS@
<span style="position: absolute; left: 796px; top: 375px; width: 6px; height: 40px; background: @HALL@; z-index: 2; pointer-events: none"></span>
@FURNITURE@
<sc-for list="{{chars}}" as="c" hint-placeholder-count="6">
@CHAR@
</sc-for>
<sc-if value="{{hasFx}}" hint-placeholder-val="{{false}}"><span class="vo-ripple" style="{{ring1}}"></span><span class="vo-ripple" style="{{ring2}}"></span><span class="vo-ripple" style="{{ring3}}"></span></sc-if>
</div>
</div>
<div style="display: flex; align-items: center; justify-content: space-between; gap: 16px; width: 820px">
@LEGEND@
<div style="display: flex; align-items: center; gap: 8px">
<span style="font-size: 13px; font-weight: 700">Offline</span>
<sc-for list="{{offline}}" as="o" hint-placeholder-count="2"><button type="button" onClick="{{o.pick}}" aria-label="{{o.aria}}" style="{{o.chipStyle}}"><span style="display: flex; align-items: center; justify-content: center; width: 26px; height: 26px; border-radius: 999px; font-size: 11px; font-weight: 700; background: #E5E7EB; color: #4B5563">{{o.initials}}</span><span style="font-weight: 600">{{o.name}}</span><span style="color: #586171">{{o.localTime}}</span></button></sc-for>
</div>
</div>
</div>
<aside aria-label="Details" style="flex-grow: 1; min-width: 0; display: flex; flex-direction: column; gap: 14px">
<sc-if value="{{hasSel}}" hint-placeholder-val="{{false}}">
<section aria-label="Person details" style="@CARD@">
<div style="display: flex; gap: 12px; align-items: flex-start">
<span style="{{sel.avatarStyle}}">{{sel.initials}}</span>
<div style="flex-grow: 1; min-width: 0">
<h2 style="margin: 0; font-size: 17px; font-weight: 700">{{sel.name}}</h2>
<p style="margin: 2px 0 0; font-size: 13px; color: #586171">{{sel.title}}, {{sel.dept}}</p>
</div>
<button type="button" onClick="{{clearSel}}" aria-label="Close details" style="display: flex; align-items: center; justify-content: center; width: 32px; height: 32px; flex-shrink: 0; border: 0; border-radius: 8px; background: transparent; color: #586171; cursor: pointer">@X@</button>
</div>
<span style="display: flex; align-items: center; gap: 8px; align-self: flex-start; height: 28px; padding: 0 12px; border-radius: 999px; background: #F1F2EE; font-size: 13px; font-weight: 600"><span style="{{sel.pillDotStyle}}"></span>{{sel.statusLabel}}</span>
<sc-if value="{{sel.hasMessage}}" hint-placeholder-val="{{false}}"><p style="margin: 0; font-size: 14px; line-height: 1.45">“{{sel.message}}”</p></sc-if>
<dl style="margin: 0; display: grid; grid-template-columns: auto minmax(0, 1fr); gap: 6px 12px; font-size: 13.5px">
<dt style="color: #586171">Local time</dt><dd style="margin: 0"><span style="font-weight: 600">{{sel.localTime}}</span> in {{sel.city}} ({{sel.offset}})</dd>
<dt style="color: #586171">Where</dt><dd style="margin: 0">{{sel.where}}</dd>
</dl>
<sc-if value="{{sel.canAct}}" hint-placeholder-val="{{false}}">
<div style="display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 8px">
<button type="button" onClick="{{sel.messageIt}}" style="@BTN2@">@CHAT@Message</button>
<button type="button" onClick="{{sel.callIt}}" style="@BTN2@">@PHONE@Call</button>
</div>
</sc-if>
<sc-if value="{{sel.hasGo}}" hint-placeholder-val="{{false}}"><button type="button" onClick="{{sel.go}}" style="height: 38px; border-radius: 10px; border: 1px solid {{accent}}; background: {{accent}}; color: #FFFFFF; font-family: inherit; font-size: 14px; font-weight: 600; cursor: pointer">{{sel.goLabel}}</button></sc-if>
</section>
</sc-if>
<sc-if value="{{noSel}}" hint-placeholder-val="{{true}}">
<section aria-label="Tip" style="@CARD@; border-style: dashed; background: transparent">
<p style="margin: 0; font-size: 14px; line-height: 1.5; color: #586171">Click a room and your character walks there. Private offices need a knock. Click anyone to see their status and local time.</p>
</section>
</sc-if>
<section aria-label="Your status" style="@CARD@">
<div style="display: flex; align-items: baseline; justify-content: space-between; gap: 8px">
<h2 style="margin: 0; font-size: 15px; font-weight: 700">Your status</h2>
<span style="font-size: 13px; color: #586171">{{meWhere}}</span>
</div>
<div style="display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 8px">
<sc-for list="{{myOptions}}" as="o" hint-placeholder-count="4"><button type="button" onClick="{{o.pick}}" aria-pressed="{{o.pressed}}" style="{{o.style}}"><span style="{{o.dotStyle}}"></span>{{o.label}}</button></sc-for>
</div>
<sc-if value="{{inMeetingRoom}}" hint-placeholder-val="{{false}}"><p style="margin: 0; font-size: 13px; font-weight: 600; color: #6D28D9">Showing as In a meeting while you're in {{meRoomName}}.</p></sc-if>
</section>
<section aria-label="Around the office" style="@CARD@">
<h2 style="margin: 0; font-size: 15px; font-weight: 700">Around the office</h2>
<ul style="margin: 0; padding: 0; list-style: none; display: flex; flex-direction: column; gap: 10px">
<sc-for list="{{feed}}" as="f" hint-placeholder-count="3"><li style="display: flex; gap: 10px; font-size: 13px; line-height: 1.4"><span style="width: 6px; height: 6px; margin-top: 7px; flex-shrink: 0; border-radius: 999px; background: #9CA3AF"></span><span style="flex-grow: 1">{{f.text}}</span><span style="color: #586171; white-space: nowrap">{{f.ago}}</span></li></sc-for>
</ul>
</section>
</aside>
</div>
</main>
</div>
<sc-if value="{{knock}}" hint-placeholder-val="{{false}}">
<div style="position: absolute; inset: 0; z-index: 2000; display: flex; align-items: center; justify-content: center; background: rgba(15,23,42,0.45)">
<div role="dialog" aria-modal="true" aria-labelledby="knock-title" style="width: 420px; display: flex; flex-direction: column; gap: 14px; padding: 24px; background: #FFFFFF; border-radius: 16px; box-shadow: 0 24px 60px rgba(15,23,42,0.28)">
<h2 id="knock-title" style="margin: 0; font-size: 20px; font-weight: 700">{{knockTitle}}</h2>
<p style="margin: 0; font-size: 15px; line-height: 1.5; color: #3F4756">{{knockBody}}</p>
<div style="display: flex; justify-content: flex-end; gap: 8px; padding-top: 4px">
<button type="button" onClick="{{cancelKnock}}" style="height: 40px; padding: 0 16px; border-radius: 10px; border: 1px solid #C9CEC4; background: #FFFFFF; color: #1B2230; font-family: inherit; font-size: 14px; font-weight: 600; cursor: pointer">Cancel</button>
<button type="button" onClick="{{sendKnock}}" style="height: 40px; padding: 0 18px; border-radius: 10px; border: 1px solid {{accent}}; background: {{accent}}; color: #FFFFFF; font-family: inherit; font-size: 14px; font-weight: 600; cursor: pointer">{{knockCta}}</button>
</div>
</div>
</div>
</sc-if>
<sc-if value="{{hasToast}}" hint-placeholder-val="{{false}}">
<div role="status" style="position: absolute; left: 50%; bottom: 28px; z-index: 2001; transform: translateX(-50%); padding: 12px 18px; border-radius: 12px; background: #1B2230; color: #FFFFFF; font-size: 14px; font-weight: 500; white-space: nowrap; box-shadow: 0 12px 32px rgba(15,23,42,0.3)">{{toast}}</div>
</sc-if>
</div>
''', NAV=nav, SETTINGS=nav_item('settings', 'Settings', False), HALL=HALL, ROOMS=rooms, DOORS=doors, FURNITURE=furniture(),
             CHAR=CHAR, LEGEND=legend(), CARD=CARD, BTN2=BTN2, X=svg('x'), CHAT=svg('chat', 16), PHONE=svg('phone', 16))

    props = {
        'accent': {'editor': 'color', 'default': '#2563EB', 'options': ['#2563EB', '#0F766E', '#7C3AED', '#C2410C']},
        'showNames': {'editor': 'boolean', 'default': True},
        'officeLife': {'editor': 'boolean', 'default': True},
        'walkSpeed': {'editor': 'range', 'default': 1, 'min': 0.5, 'max': 2, 'step': 0.1},
        '$preview': {'width': 1440, 'height': 960},
    }
    head = ('<!doctype html>\n<html lang="en">\n<head>\n<meta charset="utf-8">\n<title>Office Floor, animated</title>\n'
            '<script src="./support.js"></script>\n</head>\n<body>\n<x-dc>\n<helmet>\n'
            '<link rel="preconnect" href="https://fonts.googleapis.com">\n'
            '<link href="https://fonts.googleapis.com/css2?family=Figtree:wght@400;500;600;700&amp;display=swap" rel="stylesheet">\n'
            '<style>' + CSS + '</style>\n</helmet>\n')
    script = ("<script type=\"text/x-dc\" data-dc-script data-props='" + json.dumps(props) + "'>"
              + JS.replace('__ROOMS__', js_rooms()).replace("'", "'") + '</script>\n')
    return head + body + '</x-dc>\n' + script + '</body>\n</html>\n'


html = build()
with open(os.path.join(ROOT, 'Main.dc.html'), 'w') as f:
    f.write(html)

with open(os.path.join(ROOT, 'canvas.json')) as f:
    canvas = json.load(f)
canvas['boards']['Main.dc.html']['title'] = 'Office Floor, animated (click Play)'
canvas['notes']['title']['text'] = 'Office Floor (Phase 3)'
with open(os.path.join(ROOT, 'canvas.json'), 'w') as f:
    json.dump(canvas, f, indent=2)
print('ok', len(html))
