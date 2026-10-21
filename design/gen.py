import json, os

ROOT = os.path.join(os.path.dirname(__file__), 'project')

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
    'menu': '<path d="M4 7h16M4 12h16M4 17h16"/>',
}


def svg(name, size=18):
    return ('<svg width="%d" height="%d" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" '
            'stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">%s</svg>') % (size, size, ICONS[name])


FONT = '<link rel="preconnect" href="https://fonts.googleapis.com">\n<link href="https://fonts.googleapis.com/css2?family=Figtree:wght@400;500;600;700&amp;display=swap" rel="stylesheet">'

HEAD = '''<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>__TITLE__</title>
<script src="./support.js"></script>
</head>
<body>
<x-dc>
<helmet>
__FONT__
<style>
body{margin:0;font-family:'Figtree',system-ui,sans-serif;background:#F4F5F1}
a{color:#1D4ED8}a:hover{color:#1E3A8A}
button:focus-visible,a:focus-visible{outline:2px solid #2563EB;outline-offset:2px}
</style>
</helmet>
'''

BTN = ('height: 30px; padding: 0 12px; border-radius: 8px; border: 1px solid #C9CEC4; background: #FFFFFF; color: #1B2230; '
       'font-family: inherit; font-size: 13px; font-weight: 600; cursor: pointer; white-space: nowrap')
BTN_ACCENT = ('height: 30px; padding: 0 12px; border-radius: 8px; border: 1px solid {{accent}}; background: {{accent}}; color: #FFFFFF; '
              'font-family: inherit; font-size: 13px; font-weight: 600; cursor: pointer; white-space: nowrap')

PERSON = '''<button type="button" onClick="{{p.pick}}" aria-label="{{p.aria}}" title="{{p.aria}}" style="{{p.btnStyle}}">
<span style="position: relative; display: block; width: 40px; height: 40px">
<span style="{{p.avatarStyle}}">{{p.initials}}</span>
<span style="{{p.dotStyle}}"><span style="{{p.barStyle}}"></span></span>
</span>
<span style="{{p.nameStyle}}">{{p.first}}</span>
</button>'''


def room(rid, name, icon, span, private=False, meeting_line='', empty_text='No one here'):
    bg = '#FAFAF7' if private else '#FFFFFF'
    border = 'dashed' if private else 'solid'
    r = 'rooms.' + rid
    return f'''<section aria-label="{name}" style="grid-column: span {span} / span {span}; display: flex; flex-direction: column; gap: 10px; padding: 14px 14px 12px; background: {bg}; border: 1px {border} #C9CEC4; border-radius: 12px; box-shadow: {{{{{r}.ring}}}}">
<div style="display: flex; flex-wrap: wrap; align-items: center; gap: 6px 8px; min-height: 30px">
<span style="display: flex; color: #586171">{svg(icon, 16)}</span>
<h3 style="margin: 0; font-size: 15px; font-weight: 600; color: #1B2230; white-space: nowrap">{name}</h3>
<span style="font-size: 12px; color: #586171; white-space: nowrap">{{{{{r}.countLabel}}}}</span>
<span style="flex-grow: 1"></span>
<sc-if value="{{{{{r}.isMine}}}}" hint-placeholder-val="{{{{false}}}}"><span style="font-size: 12px; font-weight: 700; color: {{{{accent}}}}; white-space: nowrap">You're here</span></sc-if>
<sc-if value="{{{{{r}.canEnter}}}}" hint-placeholder-val="{{{{false}}}}"><button type="button" onClick="{{{{{r}.enter}}}}" style="{BTN}">Walk in</button></sc-if>
<sc-if value="{{{{{r}.canKnock}}}}" hint-placeholder-val="{{{{false}}}}"><button type="button" onClick="{{{{{r}.knock}}}}" style="{BTN}">Knock</button></sc-if>
<sc-if value="{{{{{r}.canJoin}}}}" hint-placeholder-val="{{{{false}}}}"><button type="button" onClick="{{{{{r}.enter}}}}" style="{BTN_ACCENT}">{{{{{r}.joinLabel}}}}</button></sc-if>
<sc-if value="{{{{{r}.isWaiting}}}}" hint-placeholder-val="{{{{false}}}}"><span style="font-size: 12px; font-weight: 600; color: #B45309; white-space: nowrap">Knocked, waiting</span></sc-if>
</div>
{meeting_line}<div style="display: flex; flex-wrap: wrap; gap: 2px; align-content: flex-start">
<sc-for list="{{{{{r}.people}}}}" as="p" hint-placeholder-count="2">
{PERSON}
</sc-for>
<sc-if value="{{{{{r}.empty}}}}" hint-placeholder-val="{{{{false}}}}"><span style="font-size: 13px; color: #586171; padding: 10px 2px">{empty_text}</span></sc-if>
</div>
</section>
'''


LIVE = ('<div style="display: flex; flex-wrap: wrap; align-items: center; gap: 4px 8px; font-size: 13px; color: #1B2230">'
        '<span style="width: 8px; height: 8px; border-radius: 999px; background: #BE123C"></span>'
        '<span style="font-weight: 600">Sprint planning</span>'
        '<span style="color: #586171">10:00–10:45 AM, live</span></div>\n')
NEXT = ('<div style="font-size: 12.5px; color: #586171">Next: Client demo, 2:00 PM</div>\n')

NAV = [('home', 'Home', False), ('building', 'Office Floor', True), ('video', 'Meetings', False), ('chat', 'Chat', False),
       ('tasks', 'Tasks', False), ('clock', 'Attendance', False), ('calendar', 'Leave', False)]


def nav_item(icon, label, active):
    bg = 'rgba(255,255,255,0.15)' if active else 'transparent'
    color = '#FFFFFF' if active else 'rgba(226,232,240,0.85)'
    cur = ' aria-current="page"' if active else ''
    return (f'<a href="#floor"{cur} style="display: flex; align-items: center; gap: 12px; padding: 9px 12px; border-radius: 8px; '
            f'background: {bg}; color: {color}; font-size: 14px; font-weight: 500; text-decoration: none">{svg(icon)}<span>{label}</span></a>')


LEGEND = [('Available', 'background: #15803D'), ('In a meeting', 'background: #6D28D9'),
          ('Busy, do not disturb', 'background: #BE123C'), ('On break', 'background: #B45309'),
          ('Away', 'background: #FFFFFF; border: 2px solid #6B7280; box-sizing: border-box')]


def legend():
    items = ''.join(
        f'<span style="display: flex; align-items: center; gap: 6px"><span style="width: 10px; height: 10px; border-radius: 999px; {s}"></span>{l}</span>'
        for l, s in LEGEND)
    return ('<div style="display: flex; flex-wrap: wrap; align-items: center; gap: 8px 18px; font-size: 12.5px; color: #586171">'
            + items + '</div>')


MAIN_JS = r'''
class Component extends DCLogic {
  constructor(props) {
    super(props);
    this.state = { selected: 'jose', myRoom: 'eng', myStatus: 'available', filter: 'all', knockRoom: null, waiting: null, toast: null };
  }

  componentWillUnmount() {
    clearTimeout(this.toastTimer);
    clearTimeout(this.knockTimer);
  }

  data() {
    if (this._data) return this._data;
    this._data = {
      NOW: new Date(Date.UTC(2026, 9, 1, 2, 24)),
      STATUS: {
        available: { label: 'Available', color: '#15803D' },
        meeting: { label: 'In a meeting', color: '#6D28D9' },
        busy: { label: 'Busy, do not disturb', color: '#BE123C' },
        brk: { label: 'On break', color: '#B45309' },
        away: { label: 'Away', color: '#6B7280' },
        offline: { label: 'Offline', color: '#9CA3AF' }
      },
      ROOMS: {
        eng: { name: 'Engineering', kind: 'dept' },
        maria: { name: "Maria's office", kind: 'private' },
        huddle: { name: 'Huddle room', kind: 'meeting' },
        sales: { name: 'Sales', kind: 'dept' },
        lobby: { name: 'Lobby', kind: 'open' },
        ops: { name: 'Operations & HR', kind: 'dept' },
        pantry: { name: 'Pantry', kind: 'open' },
        focus: { name: 'Focus booth', kind: 'private' },
        board: { name: 'Board room', kind: 'meeting' }
      },
      PEOPLE: [
        { id: 'ana', name: 'Ana Cruz', title: 'Software Engineer', dept: 'Engineering', tz: 'Asia/Manila', status: 'available', room: 'eng', me: true },
        { id: 'nico', name: 'Nico Ramos', title: 'Backend Engineer', dept: 'Engineering', tz: 'Asia/Manila', status: 'available', room: 'eng' },
        { id: 'tess', name: 'Tess Bautista', title: 'DevOps Engineer', dept: 'Engineering', tz: 'Asia/Manila', status: 'available', room: 'eng', message: 'Shipping the 10:30 release' },
        { id: 'emily', name: 'Emily Carter', title: 'QA Engineer', dept: 'Engineering', tz: 'America/New_York', status: 'away', room: 'eng', message: 'Late shift, back at 11 PM ET' },
        { id: 'maria', name: 'Maria Santos', title: 'Operations Director', dept: 'Operations', tz: 'Asia/Manila', status: 'available', room: 'maria' },
        { id: 'jose', name: 'Jose Reyes', title: 'Engineering Lead', dept: 'Engineering', tz: 'Asia/Manila', status: 'meeting', room: 'huddle' },
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

  flash(msg) {
    clearTimeout(this.toastTimer);
    this.setState({ toast: msg });
    this.toastTimer = setTimeout(() => this.setState({ toast: null }), 3200);
  }

  hue(name) {
    const hues = [210, 160, 30, 280, 340, 190, 100, 250];
    let h = 0;
    for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) >>> 0;
    return hues[h % hues.length];
  }

  timeIn(tz) {
    return new Intl.DateTimeFormat('en-US', { timeZone: tz, hour: 'numeric', minute: '2-digit' }).format(this.data().NOW);
  }

  offsetOf(tz) {
    const part = new Intl.DateTimeFormat('en-US', { timeZone: tz, timeZoneName: 'shortOffset' })
      .formatToParts(this.data().NOW).find((x) => x.type === 'timeZoneName');
    return part ? part.value : '';
  }

  enterRoom(rid) {
    const D = this.data();
    const room = D.ROOMS[rid];
    this.setState({ myRoom: rid, knockRoom: null, waiting: null });
    this.flash(room.kind === 'meeting' ? 'You joined the call in ' + room.name + '.' : 'You walked into ' + room.name + '.');
  }

  sendKnock(rid, occupants) {
    const D = this.data();
    const dnd = occupants.length > 0 && occupants.every((p) => p.status === 'busy');
    this.setState({ knockRoom: null, waiting: rid });
    if (!occupants.length) {
      this.flash('No one is in ' + D.ROOMS[rid].name + ' right now.');
      this.setState({ waiting: null });
      return;
    }
    if (dnd) {
      this.flash(occupants[0].name.split(' ')[0] + ' will see your knock when they are free.');
      return;
    }
    this.flash('Knock sent to ' + occupants[0].name.split(' ')[0] + '.');
    clearTimeout(this.knockTimer);
    this.knockTimer = setTimeout(() => {
      this.setState({ myRoom: rid, waiting: null });
      this.flash(occupants[0].name.split(' ')[0] + ' let you in.');
    }, 2600);
  }

  renderVals() {
    const accent = this.props.accent ?? '#2563EB';
    const showNames = this.props.showNames ?? true;
    const st = this.state;
    const D = this.data();
    const myKind = D.ROOMS[st.myRoom].kind;
    const people = D.PEOPLE.map((p) => (p.me ? Object.assign({}, p, { room: st.myRoom, status: myKind === 'meeting' ? 'meeting' : st.myStatus }) : p));

    const dotCss = (status, size, ring) => {
      const base = 'position: absolute; right: -1px; bottom: -1px; width: ' + size + 'px; height: ' + size + 'px; border-radius: 999px; box-sizing: border-box; box-shadow: 0 0 0 ' + ring + 'px #FFFFFF; ';
      if (status === 'away') return base + 'background: #FFFFFF; border: 2px solid #6B7280';
      return base + 'background: ' + D.STATUS[status].color;
    };
    const barCss = (status, size) =>
      status === 'busy'
        ? 'position: absolute; left: ' + Math.round(size * 0.22) + 'px; right: ' + Math.round(size * 0.22) + 'px; top: ' + Math.round(size / 2 - 1) + 'px; height: 2px; border-radius: 1px; background: #FFFFFF'
        : 'display: none';

    const dimmed = (p) => (st.filter === 'eng' && p.dept !== 'Engineering') || (st.filter === 'available' && p.status !== 'available');

    const decorate = (p) => {
      const h = this.hue(p.name);
      const parts = p.name.split(' ');
      const initials = (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
      const selected = st.selected === p.id;
      const ring = p.me ? '0 0 0 2px #FFFFFF, 0 0 0 4px ' + accent : selected ? '0 0 0 2px #FFFFFF, 0 0 0 4px #1B2230' : 'none';
      const status = D.STATUS[p.status];
      const room = p.room ? D.ROOMS[p.room] : null;
      return {
        id: p.id,
        name: p.name,
        first: p.me ? 'You' : parts[0],
        title: p.title,
        dept: p.dept,
        initials: initials,
        status: p.status,
        statusLabel: status.label,
        message: p.message || '',
        hasMessage: !!p.message,
        room: p.room,
        roomName: room ? room.name : '',
        localTime: this.timeIn(p.tz),
        city: p.tz.split('/').pop().replace('_', ' '),
        offset: this.offsetOf(p.tz),
        lastSeen: p.lastSeen || '',
        me: !!p.me,
        aria: (p.me ? 'You' : p.name) + ', ' + status.label,
        avatarStyle: 'display: flex; align-items: center; justify-content: center; width: 40px; height: 40px; border-radius: 999px; font-size: 13px; font-weight: 700; background: hsl(' + h + ' 55% 88%); color: hsl(' + h + ' 60% 24%); box-shadow: ' + ring,
        bigAvatarStyle: 'display: flex; align-items: center; justify-content: center; width: 56px; height: 56px; border-radius: 999px; font-size: 18px; font-weight: 700; background: hsl(' + h + ' 55% 88%); color: hsl(' + h + ' 60% 24%)',
        dotStyle: dotCss(p.status, 13, 2),
        barStyle: barCss(p.status, 13),
        bigDotStyle: dotCss(p.status, 16, 3),
        bigBarStyle: barCss(p.status, 16),
        pillDotStyle: 'width: 10px; height: 10px; border-radius: 999px; box-sizing: border-box; ' + (p.status === 'away' ? 'border: 2px solid #6B7280' : 'background: ' + status.color),
        btnStyle: 'display: flex; flex-direction: column; align-items: center; gap: 5px; width: 60px; padding: 6px 2px 4px; border: 0; border-radius: 10px; background: ' + (selected ? '#E8EEFB' : 'transparent') + '; cursor: pointer; font-family: inherit; opacity: ' + (dimmed(p) ? '0.28' : '1'),
        nameStyle: (showNames ? 'display: block' : 'display: none') + '; max-width: 58px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-size: 12px; font-weight: ' + (p.me ? '700' : '500') + '; color: #1B2230',
        pick: () => this.setState({ selected: p.id })
      };
    };

    const rooms = {};
    Object.keys(D.ROOMS).forEach((rid) => {
      const r = D.ROOMS[rid];
      const inRoom = people.filter((p) => p.room === rid);
      const n = inRoom.length;
      const isMine = st.myRoom === rid;
      const isWaiting = st.waiting === rid;
      rooms[rid] = {
        people: inRoom.map(decorate),
        empty: n === 0,
        countLabel: n === 0 ? '' : n === 1 ? '1 person' : n + ' people',
        isMine: isMine,
        canEnter: !isMine && (r.kind === 'dept' || r.kind === 'open'),
        canKnock: !isMine && r.kind === 'private' && !isWaiting,
        canJoin: !isMine && r.kind === 'meeting',
        joinLabel: n ? 'Join call' : 'Start a call',
        isWaiting: isWaiting,
        ring: isMine ? '0 0 0 2px ' + accent : 'none',
        enter: () => this.enterRoom(rid),
        knock: () => this.setState({ knockRoom: rid })
      };
    });

    let sel = null;
    const selRaw = people.find((p) => p.id === st.selected);
    if (selRaw) {
      sel = decorate(selRaw);
      const r = selRaw.room ? D.ROOMS[selRaw.room] : null;
      const sameRoom = selRaw.room === st.myRoom;
      sel.isOffline = selRaw.status === 'offline';
      sel.canAct = !sel.me && !sel.isOffline;
      sel.where = sel.isOffline ? 'Last seen ' + sel.lastSeen + ' their time' : sameRoom && !sel.me ? 'Here with you in ' + r.name : 'In ' + r.name;
      sel.hasGo = sel.canAct && !sameRoom;
      sel.goLabel = !r ? '' : r.kind === 'private' ? 'Knock on ' + r.name : r.kind === 'meeting' ? 'Join their call' : 'Walk over to ' + r.name;
      sel.go = () => (r && r.kind === 'private' ? this.setState({ knockRoom: selRaw.room }) : this.enterRoom(selRaw.room));
      sel.messageIt = () => this.flash('Opening a chat with ' + selRaw.name.split(' ')[0] + '…');
      sel.callIt = () => this.flash(selRaw.status === 'busy' ? selRaw.name.split(' ')[0] + ' is set to Do not disturb. Send a message instead?' : 'Calling ' + selRaw.name.split(' ')[0] + '…');
    }

    const myOptions = [['available', 'Available'], ['busy', 'Busy'], ['brk', 'On break'], ['away', 'Away']].map(([id, label]) => {
      const on = st.myStatus === id;
      return {
        label: label,
        pressed: on ? 'true' : 'false',
        style: 'display: flex; align-items: center; gap: 8px; height: 40px; padding: 0 12px; border-radius: 10px; font-family: inherit; font-size: 14px; font-weight: 600; cursor: pointer; color: #1B2230; background: ' + (on ? '#E8EEFB' : '#FFFFFF') + '; border: ' + (on ? '2px solid ' + accent : '1px solid #C9CEC4'),
        dotStyle: 'width: 10px; height: 10px; border-radius: 999px; box-sizing: border-box; ' + (id === 'away' ? 'border: 2px solid #6B7280' : 'background: ' + D.STATUS[id].color),
        pick: () => this.setState({ myStatus: id })
      };
    });

    const filters = [['all', 'Everyone'], ['eng', 'Engineering'], ['available', 'Available now']].map(([id, label]) => {
      const on = st.filter === id;
      return {
        label: label,
        pressed: on ? 'true' : 'false',
        style: 'height: 34px; padding: 0 14px; border-radius: 8px; border: 0; font-family: inherit; font-size: 13.5px; font-weight: 600; cursor: pointer; ' + (on ? 'background: #FFFFFF; color: #1B2230; box-shadow: 0 1px 2px rgba(27,34,48,0.12)' : 'background: transparent; color: #586171'),
        pick: () => this.setState({ filter: id })
      };
    });

    const offline = people.filter((p) => p.status === 'offline').map((p) => {
      const d = decorate(p);
      d.chipStyle = 'display: flex; align-items: center; gap: 8px; height: 34px; padding: 0 12px 0 4px; border-radius: 999px; border: 1px solid ' + (st.selected === p.id ? '#1B2230' : '#DCDFD8') + '; background: #FFFFFF; font-family: inherit; font-size: 13px; color: #1B2230; cursor: pointer; opacity: ' + (dimmed(p) ? '0.4' : '1');
      d.smallAvatarStyle = 'display: flex; align-items: center; justify-content: center; width: 26px; height: 26px; border-radius: 999px; font-size: 11px; font-weight: 700; background: #E5E7EB; color: #4B5563';
      return d;
    });

    const inCount = people.filter((p) => p.status !== 'offline').length;
    let knockTitle = '', knockBody = '';
    let occupants = [];
    if (st.knockRoom) {
      occupants = people.filter((p) => p.room === st.knockRoom && !p.me);
      const room = D.ROOMS[st.knockRoom];
      knockTitle = 'Knock on ' + room.name + '?';
      if (!occupants.length) knockBody = 'No one is in this room right now.';
      else if (occupants.every((p) => p.status === 'busy')) knockBody = occupants[0].name + ' is set to Do not disturb. They will see your knock when they are free.';
      else knockBody = occupants[0].name + ' will get a notification and can let you in. You will move into the room once they do.';
    }
    const knockRid = st.knockRoom;
    const me = people.find((p) => p.me);

    return {
      accent: accent,
      rooms: rooms,
      hasSel: !!sel,
      noSel: !sel,
      sel: sel || {},
      clearSel: () => this.setState({ selected: null }),
      myOptions: myOptions,
      filters: filters,
      offline: offline,
      summary: inCount + ' in the office, ' + offline.length + ' offline',
      manilaTime: this.timeIn('Asia/Manila'),
      nyTime: this.timeIn('America/New_York'),
      meRoom: D.ROOMS[st.myRoom].name,
      meStatusLabel: D.STATUS[me.status].label,
      inMeetingRoom: myKind === 'meeting',
      knock: !!st.knockRoom,
      knockTitle: knockTitle,
      knockBody: knockBody,
      knockCta: occupants.length ? 'Knock' : 'OK',
      sendKnock: () => this.sendKnock(knockRid, occupants),
      cancelKnock: () => this.setState({ knockRoom: null }),
      hasToast: !!st.toast,
      toast: st.toast || ''
    };
  }
}
'''


def main_board():
    card = 'background: #FFFFFF; border: 1px solid #DCDFD8; border-radius: 14px; padding: 18px; display: flex; flex-direction: column; gap: 14px'
    rooms = (
        room('eng', 'Engineering', 'users', 4)
        + room('maria', "Maria's office", 'lock', 2, private=True)
        + room('huddle', 'Huddle room', 'video', 2, meeting_line=LIVE)
        + room('sales', 'Sales', 'users', 2)
        + room('lobby', 'Lobby', 'door', 2)
        + room('ops', 'Operations &amp; HR', 'users', 2)
        + room('pantry', 'Pantry', 'coffee', 2, empty_text='Grab a coffee')
        + room('focus', 'Focus booth', 'lock', 1, private=True)
        + room('board', 'Board room', 'video', 1, meeting_line=NEXT, empty_text='Free now')
    )
    nav = '\n'.join(nav_item(*n) for n in NAV)
    body = f'''<div style="position: relative; width: 1440px; height: 960px; display: grid; grid-template-columns: 248px minmax(0, 1fr); background: #F4F5F1; color: #1B2230; font-family: 'Figtree', system-ui, sans-serif; overflow: hidden">
<nav aria-label="Main" style="display: flex; flex-direction: column; gap: 4px; padding: 20px 12px 16px; background: #1F3A5F; color: #E2E8F0">
<div style="display: flex; align-items: center; gap: 10px; padding: 0 12px 18px">
<span style="display: flex; align-items: center; justify-content: center; width: 32px; height: 32px; border-radius: 8px; background: {{{{accent}}}}; color: #FFFFFF; font-size: 14px; font-weight: 700">A</span>
<span style="display: flex; flex-direction: column; line-height: 1.2"><span style="font-size: 14px; font-weight: 700; color: #FFFFFF">Acme Corp</span><span style="font-size: 12px; color: rgba(226,232,240,0.65)">Virtual Office</span></span>
</div>
{nav}
<span style="flex-grow: 1"></span>
{nav_item('settings', 'Settings', False)}
</nav>
<div style="display: flex; flex-direction: column; min-width: 0">
<header style="height: 64px; flex-shrink: 0; display: flex; align-items: center; gap: 24px; padding: 0 32px; border-bottom: 1px solid #DCDFD8">
<span style="font-size: 14px"><span style="font-weight: 700">{{{{manilaTime}}}}</span> <span style="color: #586171">Manila (you)</span></span>
<span style="font-size: 14px"><span style="font-weight: 700">{{{{nyTime}}}}</span> <span style="color: #586171">New York</span></span>
<span style="flex-grow: 1"></span>
<span style="display: flex; align-items: center; gap: 8px; height: 34px; padding: 0 14px; border-radius: 999px; background: #E3F1E8; color: #14532D; font-size: 13px; font-weight: 600"><span style="width: 8px; height: 8px; border-radius: 999px; background: #15803D"></span>Clocked in at 8:02 AM</span>
<span style="display: flex; align-items: center; gap: 10px">
<span style="display: flex; align-items: center; justify-content: center; width: 32px; height: 32px; border-radius: 999px; background: hsl(160 55% 88%); color: hsl(160 60% 24%); font-size: 12px; font-weight: 700">AC</span>
<span style="display: flex; flex-direction: column; line-height: 1.2"><span style="font-size: 14px; font-weight: 600">Ana Cruz</span><span style="font-size: 12px; color: #586171">Employee</span></span>
</span>
</header>
<main id="floor" style="display: flex; flex-direction: column; gap: 18px; padding: 24px 32px; min-height: 0">
<div style="display: flex; align-items: flex-end; justify-content: space-between; gap: 16px">
<div>
<h1 style="margin: 0; font-size: 28px; font-weight: 700; letter-spacing: -0.01em">Office Floor</h1>
<p style="margin: 4px 0 0; font-size: 15px; color: #586171">{{{{summary}}}}. Thursday, October 1.</p>
</div>
<div style="display: flex; align-items: center; gap: 10px">
<span style="font-size: 13px; color: #586171">Show</span>
<div style="display: flex; gap: 4px; padding: 4px; background: #E6E9E2; border-radius: 10px">
<sc-for list="{{{{filters}}}}" as="f" hint-placeholder-count="3"><button type="button" onClick="{{{{f.pick}}}}" aria-pressed="{{{{f.pressed}}}}" style="{{{{f.style}}}}">{{{{f.label}}}}</button></sc-for>
</div>
</div>
</div>
<div style="display: flex; gap: 24px; align-items: flex-start; min-height: 0">
<div style="flex-grow: 1; min-width: 0; display: flex; flex-direction: column; gap: 14px">
<div style="display: grid; grid-template-columns: repeat(6, minmax(0, 1fr)); gap: 10px; padding: 12px; background: #E6E9E2; border: 2px solid #C9CEC4; border-radius: 18px">
{rooms}</div>
{legend()}
<div style="display: flex; flex-wrap: wrap; align-items: center; gap: 8px">
<span style="font-size: 13px; font-weight: 700; margin-right: 4px">Offline</span>
<sc-for list="{{{{offline}}}}" as="o" hint-placeholder-count="2"><button type="button" onClick="{{{{o.pick}}}}" aria-label="{{{{o.aria}}}}" style="{{{{o.chipStyle}}}}"><span style="{{{{o.smallAvatarStyle}}}}">{{{{o.initials}}}}</span><span style="font-weight: 600">{{{{o.name}}}}</span><span style="color: #586171">{{{{o.localTime}}}} in {{{{o.city}}}}</span></button></sc-for>
</div>
</div>
<aside aria-label="Details" style="width: 320px; flex-shrink: 0; display: flex; flex-direction: column; gap: 16px">
<sc-if value="{{{{hasSel}}}}" hint-placeholder-val="{{{{true}}}}">
<section aria-label="Person details" style="{card}">
<div style="display: flex; gap: 12px; align-items: flex-start">
<span style="position: relative; display: block; width: 56px; height: 56px; flex-shrink: 0"><span style="{{{{sel.bigAvatarStyle}}}}">{{{{sel.initials}}}}</span><span style="{{{{sel.bigDotStyle}}}}"><span style="{{{{sel.bigBarStyle}}}}"></span></span></span>
<div style="flex-grow: 1; min-width: 0">
<h2 style="margin: 0; font-size: 18px; font-weight: 700">{{{{sel.name}}}}</h2>
<p style="margin: 2px 0 0; font-size: 13px; color: #586171">{{{{sel.title}}}}, {{{{sel.dept}}}}</p>
</div>
<button type="button" onClick="{{{{clearSel}}}}" aria-label="Close details" style="display: flex; align-items: center; justify-content: center; width: 32px; height: 32px; border: 0; border-radius: 8px; background: transparent; color: #586171; cursor: pointer">{svg('x')}</button>
</div>
<span style="display: flex; align-items: center; gap: 8px; align-self: flex-start; height: 30px; padding: 0 12px; border-radius: 999px; background: #F1F2EE; font-size: 13px; font-weight: 600"><span style="{{{{sel.pillDotStyle}}}}"></span>{{{{sel.statusLabel}}}}</span>
<sc-if value="{{{{sel.hasMessage}}}}" hint-placeholder-val="{{{{true}}}}"><p style="margin: 0; font-size: 14px; line-height: 1.45">“{{{{sel.message}}}}”</p></sc-if>
<dl style="margin: 0; display: grid; grid-template-columns: auto minmax(0, 1fr); gap: 8px 14px; font-size: 13.5px">
<dt style="color: #586171">Local time</dt><dd style="margin: 0"><span style="font-weight: 600">{{{{sel.localTime}}}}</span> in {{{{sel.city}}}} ({{{{sel.offset}}}})</dd>
<dt style="color: #586171">Where</dt><dd style="margin: 0">{{{{sel.where}}}}</dd>
</dl>
<sc-if value="{{{{sel.canAct}}}}" hint-placeholder-val="{{{{true}}}}">
<div style="display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 8px">
<button type="button" onClick="{{{{sel.messageIt}}}}" style="display: flex; align-items: center; justify-content: center; gap: 8px; height: 40px; border-radius: 10px; border: 1px solid #C9CEC4; background: #FFFFFF; color: #1B2230; font-family: inherit; font-size: 14px; font-weight: 600; cursor: pointer">{svg('chat', 16)}Message</button>
<button type="button" onClick="{{{{sel.callIt}}}}" style="display: flex; align-items: center; justify-content: center; gap: 8px; height: 40px; border-radius: 10px; border: 1px solid #C9CEC4; background: #FFFFFF; color: #1B2230; font-family: inherit; font-size: 14px; font-weight: 600; cursor: pointer">{svg('phone', 16)}Call</button>
</div>
<sc-if value="{{{{sel.hasGo}}}}" hint-placeholder-val="{{{{true}}}}"><button type="button" onClick="{{{{sel.go}}}}" style="height: 40px; border-radius: 10px; border: 1px solid {{{{accent}}}}; background: {{{{accent}}}}; color: #FFFFFF; font-family: inherit; font-size: 14px; font-weight: 600; cursor: pointer">{{{{sel.goLabel}}}}</button></sc-if>
</sc-if>
</section>
</sc-if>
<sc-if value="{{{{noSel}}}}" hint-placeholder-val="{{{{false}}}}">
<section aria-label="Tip" style="{card}; border-style: dashed; background: transparent">
<p style="margin: 0; font-size: 14px; line-height: 1.5; color: #586171">Click anyone to see their status and local time. Use Walk in to move rooms, or Knock on a private office.</p>
</section>
</sc-if>
<section aria-label="Your status" style="{card}">
<div style="display: flex; align-items: baseline; justify-content: space-between; gap: 8px">
<h2 style="margin: 0; font-size: 15px; font-weight: 700">Your status</h2>
<span style="font-size: 13px; color: #586171">In {{{{meRoom}}}}</span>
</div>
<div style="display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 8px">
<sc-for list="{{{{myOptions}}}}" as="o" hint-placeholder-count="4"><button type="button" onClick="{{{{o.pick}}}}" aria-pressed="{{{{o.pressed}}}}" style="{{{{o.style}}}}"><span style="{{{{o.dotStyle}}}}"></span>{{{{o.label}}}}</button></sc-for>
</div>
<sc-if value="{{{{inMeetingRoom}}}}" hint-placeholder-val="{{{{false}}}}"><p style="margin: 0; font-size: 13px; font-weight: 600; color: #6D28D9">Showing as In a meeting while you're in {{{{meRoom}}}}.</p></sc-if>
<p style="margin: 0; font-size: 12.5px; line-height: 1.45; color: #586171">Your status also changes on its own: On break when you start a break, Away after 15 minutes without activity, In a meeting during calls.</p>
</section>
</aside>
</div>
</main>
</div>
<sc-if value="{{{{knock}}}}" hint-placeholder-val="{{{{false}}}}">
<div style="position: absolute; inset: 0; display: flex; align-items: center; justify-content: center; background: rgba(15,23,42,0.45)">
<div role="dialog" aria-modal="true" aria-labelledby="knock-title" style="width: 420px; display: flex; flex-direction: column; gap: 14px; padding: 24px; background: #FFFFFF; border-radius: 16px; box-shadow: 0 24px 60px rgba(15,23,42,0.28)">
<h2 id="knock-title" style="margin: 0; font-size: 20px; font-weight: 700">{{{{knockTitle}}}}</h2>
<p style="margin: 0; font-size: 15px; line-height: 1.5; color: #3F4756">{{{{knockBody}}}}</p>
<div style="display: flex; justify-content: flex-end; gap: 8px; padding-top: 4px">
<button type="button" onClick="{{{{cancelKnock}}}}" style="height: 40px; padding: 0 16px; border-radius: 10px; border: 1px solid #C9CEC4; background: #FFFFFF; color: #1B2230; font-family: inherit; font-size: 14px; font-weight: 600; cursor: pointer">Cancel</button>
<button type="button" onClick="{{{{sendKnock}}}}" style="height: 40px; padding: 0 18px; border-radius: 10px; border: 1px solid {{{{accent}}}}; background: {{{{accent}}}}; color: #FFFFFF; font-family: inherit; font-size: 14px; font-weight: 600; cursor: pointer">{{{{knockCta}}}}</button>
</div>
</div>
</div>
</sc-if>
<sc-if value="{{{{hasToast}}}}" hint-placeholder-val="{{{{false}}}}">
<div role="status" style="position: absolute; left: 50%; bottom: 28px; transform: translateX(-50%); padding: 12px 18px; border-radius: 12px; background: #1B2230; color: #FFFFFF; font-size: 14px; font-weight: 500; white-space: nowrap; box-shadow: 0 12px 32px rgba(15,23,42,0.3)">{{{{toast}}}}</div>
</sc-if>
</div>
</x-dc>
'''
    props = {
        'accent': {'editor': 'color', 'default': '#2563EB', 'options': ['#2563EB', '#0F766E', '#7C3AED', '#C2410C']},
        'showNames': {'editor': 'boolean', 'default': True},
        '$preview': {'width': 1440, 'height': 960},
    }
    html = (HEAD.replace('__TITLE__', 'Office Floor, desktop').replace('__FONT__', FONT) + body
            + "<script type=\"text/x-dc\" data-dc-script data-props='" + json.dumps(props).replace('&', '&amp;') + "'>"
            + MAIN_JS + '</script>\n</body>\n</html>\n')
    return html


# ---------------------------------------------------------------- phone ----

HUES = [210, 160, 30, 280, 340, 190, 100, 250]
COLORS = {'available': '#15803D', 'meeting': '#6D28D9', 'busy': '#BE123C', 'brk': '#B45309'}


def hue(name):
    h = 0
    for c in name:
        h = (h * 31 + ord(c)) & 0xFFFFFFFF
    return HUES[h % len(HUES)]


def m_avatar(name, status, label=None, me=False, size=36):
    h = hue(name)
    parts = name.split(' ')
    ini = (parts[0][0] + parts[-1][0]).upper()
    ring = '; box-shadow: 0 0 0 2px #FFFFFF, 0 0 0 4px #2563EB' if me else ''
    if status == 'away':
        dot = 'background: #FFFFFF; border: 2px solid #6B7280'
    else:
        dot = 'background: ' + COLORS[status]
    bar = ('<span style="position: absolute; left: 3px; right: 3px; top: 5px; height: 2px; border-radius: 1px; background: #FFFFFF"></span>'
           if status == 'busy' else '')
    first = label or parts[0]
    return (f'<span style="display: flex; flex-direction: column; align-items: center; gap: 4px; width: 52px">'
            f'<span style="position: relative; display: block; width: {size}px; height: {size}px">'
            f'<span style="display: flex; align-items: center; justify-content: center; width: {size}px; height: {size}px; border-radius: 999px; font-size: 12px; font-weight: 700; background: hsl({h} 55% 88%); color: hsl({h} 60% 24%){ring}">{ini}</span>'
            f'<span style="position: absolute; right: -1px; bottom: -1px; width: 12px; height: 12px; border-radius: 999px; box-sizing: border-box; box-shadow: 0 0 0 2px #FFFFFF; {dot}">{bar}</span>'
            f'</span><span style="font-size: 11.5px; font-weight: {"700" if me else "500"}; color: #1B2230; white-space: nowrap">{first}</span></span>')


def m_room(name, icon, count, people, action='', line='', private=False, mine=False):
    border = '2px solid #2563EB' if mine else ('1px dashed #C9CEC4' if private else '1px solid #DCDFD8')
    bg = '#FAFAF7' if private else '#FFFFFF'
    return (f'<section aria-label="{name}" style="display: flex; flex-direction: column; gap: 10px; padding: 12px 14px; background: {bg}; border: {border}; border-radius: 12px">'
            f'<div style="display: flex; align-items: center; gap: 8px"><span style="display: flex; color: #586171">{svg(icon, 16)}</span>'
            f'<h3 style="margin: 0; font-size: 15px; font-weight: 600">{name}</h3><span style="font-size: 12px; color: #586171">{count}</span>'
            f'<span style="flex-grow: 1"></span>{action}</div>{line}'
            f'<div style="display: flex; flex-wrap: wrap; gap: 2px">{"".join(people)}</div></section>')


def phone_board():
    sbtn = ('height: 32px; padding: 0 12px; border-radius: 8px; border: 1px solid #C9CEC4; background: #FFFFFF; color: #1B2230; '
            'font-family: inherit; font-size: 13px; font-weight: 600')
    abtn = ('height: 32px; padding: 0 12px; border-radius: 8px; border: 1px solid #2563EB; background: #2563EB; color: #FFFFFF; '
            'font-family: inherit; font-size: 13px; font-weight: 600')
    here = '<span style="font-size: 12px; font-weight: 700; color: #2563EB">You\'re here</span>'
    rooms = ''.join([
        m_room('Engineering', 'users', '4 people', [m_avatar('Ana Cruz', 'available', 'You', True), m_avatar('Nico Ramos', 'available'),
                                                    m_avatar('Tess Bautista', 'available'), m_avatar('Emily Carter', 'away')], here, mine=True),
        m_room('Huddle room', 'video', '3 people', [m_avatar('Jose Reyes', 'meeting'), m_avatar('Bea Villanueva', 'meeting'), m_avatar('Kim Navarro', 'meeting')],
               f'<button type="button" style="{abtn}">Join call</button>',
               '<div style="display: flex; align-items: center; gap: 6px; font-size: 12.5px"><span style="width: 8px; height: 8px; border-radius: 999px; background: #BE123C"></span><span style="font-weight: 600">Sprint planning</span><span style="color: #586171">live until 10:45</span></div>'),
        m_room('Sales', 'users', '2 people', [m_avatar('Carlo Mendoza', 'available'), m_avatar('Ryan Torres', 'busy')],
               f'<button type="button" style="{sbtn}">Walk in</button>'),
        m_room("Maria's office", 'lock', '1 person', [m_avatar('Maria Santos', 'available')],
               f'<button type="button" style="{sbtn}">Knock</button>', private=True),
    ])
    body = f'''<div style="position: relative; width: 390px; height: 844px; display: flex; flex-direction: column; background: #F4F5F1; color: #1B2230; font-family: 'Figtree', system-ui, sans-serif; overflow: hidden">
<header style="height: 56px; flex-shrink: 0; display: flex; align-items: center; gap: 10px; padding: 0 12px; border-bottom: 1px solid #DCDFD8">
<button type="button" aria-label="Open menu" style="display: flex; align-items: center; justify-content: center; width: 44px; height: 44px; border: 0; border-radius: 10px; background: transparent; color: #1B2230">{svg('menu', 22)}</button>
<span style="font-size: 17px; font-weight: 700">Office Floor</span>
<span style="flex-grow: 1"></span>
<span style="display: flex; align-items: center; gap: 6px; height: 30px; padding: 0 10px; border-radius: 999px; background: #E3F1E8; color: #14532D; font-size: 12px; font-weight: 600"><span style="width: 7px; height: 7px; border-radius: 999px; background: #15803D"></span>In since 8:02</span>
</header>
<main style="display: flex; flex-direction: column; gap: 12px; padding: 14px 16px">
<div style="display: flex; align-items: center; gap: 10px; padding: 10px 12px; background: #FFFFFF; border: 1px solid #DCDFD8; border-radius: 12px">
<span style="width: 10px; height: 10px; border-radius: 999px; background: #15803D"></span>
<span style="font-size: 14px"><span style="font-weight: 700">Available</span> <span style="color: #586171">in Engineering</span></span>
<span style="flex-grow: 1"></span>
<button type="button" style="{sbtn}">Change</button>
</div>
<div style="display: flex; gap: 4px; padding: 4px; background: #E6E9E2; border-radius: 10px">
<button type="button" aria-pressed="true" style="flex-grow: 1; height: 34px; border: 0; border-radius: 8px; background: #FFFFFF; font-family: inherit; font-size: 13px; font-weight: 600; color: #1B2230; box-shadow: 0 1px 2px rgba(27,34,48,0.12)">Everyone</button>
<button type="button" aria-pressed="false" style="flex-grow: 1; height: 34px; border: 0; border-radius: 8px; background: transparent; font-family: inherit; font-size: 13px; font-weight: 600; color: #586171">Engineering</button>
<button type="button" aria-pressed="false" style="flex-grow: 1; height: 34px; border: 0; border-radius: 8px; background: transparent; font-family: inherit; font-size: 13px; font-weight: 600; color: #586171">Available</button>
</div>
{rooms}
</main>
<div style="position: absolute; inset: 0; background: rgba(15,23,42,0.4)"></div>
<section role="dialog" aria-label="Jose Reyes" style="position: absolute; left: 0; right: 0; bottom: 0; display: flex; flex-direction: column; gap: 14px; padding: 10px 20px 28px; background: #FFFFFF; border-radius: 20px 20px 0 0; box-shadow: 0 -12px 40px rgba(15,23,42,0.2)">
<span style="align-self: center; width: 40px; height: 4px; border-radius: 999px; background: #C9CEC4"></span>
<div style="display: flex; align-items: center; gap: 12px">
<span style="position: relative; display: block; width: 52px; height: 52px"><span style="display: flex; align-items: center; justify-content: center; width: 52px; height: 52px; border-radius: 999px; font-size: 17px; font-weight: 700; background: hsl({hue('Jose Reyes')} 55% 88%); color: hsl({hue('Jose Reyes')} 60% 24%)">JR</span><span style="position: absolute; right: -1px; bottom: -1px; width: 15px; height: 15px; border-radius: 999px; box-shadow: 0 0 0 3px #FFFFFF; background: #6D28D9"></span></span>
<div style="flex-grow: 1">
<h2 style="margin: 0; font-size: 18px; font-weight: 700">Jose Reyes</h2>
<p style="margin: 2px 0 0; font-size: 13px; color: #586171">Engineering Lead, Engineering</p>
</div>
<button type="button" aria-label="Close" style="display: flex; align-items: center; justify-content: center; width: 44px; height: 44px; border: 0; border-radius: 10px; background: transparent; color: #586171">{svg('x', 20)}</button>
</div>
<div style="display: flex; flex-wrap: wrap; gap: 8px; font-size: 13.5px">
<span style="display: flex; align-items: center; gap: 8px; height: 30px; padding: 0 12px; border-radius: 999px; background: #F1F2EE; font-weight: 600"><span style="width: 10px; height: 10px; border-radius: 999px; background: #6D28D9"></span>In a meeting</span>
<span style="display: flex; align-items: center; height: 30px; padding: 0 12px; border-radius: 999px; background: #F1F2EE"><span style="font-weight: 600">10:24 AM</span>&nbsp;in Manila</span>
</div>
<p style="margin: 0; font-size: 14px; color: #3F4756">In Huddle room for Sprint planning, until 10:45 AM.</p>
<div style="display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 8px">
<button type="button" style="display: flex; align-items: center; justify-content: center; gap: 8px; height: 44px; border-radius: 10px; border: 1px solid #C9CEC4; background: #FFFFFF; color: #1B2230; font-family: inherit; font-size: 14px; font-weight: 600">{svg('chat', 16)}Message</button>
<button type="button" style="display: flex; align-items: center; justify-content: center; gap: 8px; height: 44px; border-radius: 10px; border: 1px solid #C9CEC4; background: #FFFFFF; color: #1B2230; font-family: inherit; font-size: 14px; font-weight: 600">{svg('phone', 16)}Call</button>
</div>
<button type="button" style="height: 46px; border-radius: 10px; border: 1px solid #2563EB; background: #2563EB; color: #FFFFFF; font-family: inherit; font-size: 15px; font-weight: 600">Join their call</button>
</section>
</div>
</x-dc>
'''
    props = {'$preview': {'width': 390, 'height': 844}}
    js = '\nclass Component extends DCLogic {\n  renderVals() {\n    return {};\n  }\n}\n'
    return (HEAD.replace('__TITLE__', 'Office Floor, phone').replace('__FONT__', FONT) + body
            + "<script type=\"text/x-dc\" data-dc-script data-props='" + json.dumps(props) + "'>" + js + '</script>\n</body>\n</html>\n')


canvas = {
    'v': 3,
    'createdOnFiles': {'v': 1, 'at': '2026-09-30T16:55:00Z'},
    'title': 'Virtual Office Floor',
    'launch': {'view': 'canvas'},
    'pages': [],
    'boards': {
        'Main.dc.html': {'x': 0, 'y': 0, 'w': 1440, 'h': 960, 'title': 'Office Floor, desktop (clickable)', 'is_interactive': True},
        'Phone.dc.html': {'x': 1520, 'y': 0, 'w': 390, 'h': 844, 'title': 'Office Floor, phone with person sheet'},
    },
    'order': ['Main.dc.html', 'Phone.dc.html'],
    'notes': {'title': {'x': 0, 'y': -260, 'text': 'Office Floor (Phase 3)', 'kind': 'title1', 'maxW': 1910}},
    'designSystems': [],
}

with open(os.path.join(ROOT, 'canvas.json'), 'w') as f:
    json.dump(canvas, f, indent=2)
with open(os.path.join(ROOT, 'Main.dc.html'), 'w') as f:
    f.write(main_board())
with open(os.path.join(ROOT, 'Phone.dc.html'), 'w') as f:
    f.write(phone_board())
print('written')
