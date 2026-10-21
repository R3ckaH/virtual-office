"""HR attendance artboards: HR.dc.html (interactive board) and Devices.dc.html (biometric devices & sync)."""
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
    'finger': '<path d="M12 11v3a8 8 0 0 1-1.5 4.5"/><path d="M8.5 9.5a4 4 0 0 1 7 2.5v2a11 11 0 0 1-.7 3.8"/><path d="M5.5 13.5V12a6.5 6.5 0 0 1 11.2-4.5"/><path d="M18.4 10.5c.4 1 .6 2 .6 3.2a14 14 0 0 1-.4 3.3"/><path d="M5 16.5c.3-.7.5-1.4.5-2.2"/>',
    'laptop': '<rect x="4" y="5" width="16" height="11" rx="1.5"/><path d="M2 19h20"/>',
    'chart': '<path d="M4 20V10M10 20V4M16 20v-7M22 20H2"/>',
    'network': '<rect x="9" y="3" width="6" height="5" rx="1"/><rect x="3" y="16" width="6" height="5" rx="1"/><rect x="15" y="16" width="6" height="5" rx="1"/><path d="M12 8v4M6 16v-2h12v2"/>',
    'key': '<circle cx="8" cy="15" r="4"/><path d="M11 12l9-9M17 6l3 3"/>',
    'file': '<path d="M14 3H6a1 1 0 0 0-1 1v16a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1V8z"/><path d="M14 3v5h5"/>',
    'device': '<rect x="6" y="2" width="12" height="20" rx="2"/><circle cx="12" cy="14" r="3"/><path d="M10 6h4"/>',
    'x': '<path d="M6 6l12 12M18 6L6 18"/>',
    'cloud': '<path d="M7 18a5 5 0 0 1-.6-10A6 6 0 0 1 18 9a4.5 4.5 0 0 1-.5 9z"/>',
    'server': '<rect x="3" y="4" width="18" height="7" rx="1.5"/><rect x="3" y="13" width="18" height="7" rx="1.5"/><path d="M7 7.5h.01M7 16.5h.01"/>',
    'upload': '<path d="M12 16V4M7 9l5-5 5 5"/><path d="M4 16v3a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-3"/>',
    'download': '<path d="M12 4v12M7 11l5 5 5-5"/><path d="M4 16v3a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-3"/>',
    'alert': '<path d="M12 3l10 18H2z"/><path d="M12 10v5M12 18h.01"/>',
    'check': '<path d="M5 12l5 5 9-10"/>',
    'chev-l': '<path d="M15 6l-6 6 6 6"/>',
    'chev-r': '<path d="M9 6l6 6-6 6"/>',
    'plus': '<path d="M12 5v14M5 12h14"/>',
    'link': '<path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1"/><path d="M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1"/>',
}


def svg(name, size=18):
    return ('<svg width="%d" height="%d" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" '
            'stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">%s</svg>') % (size, size, ICONS[name])


def nav_item(icon, label, active):
    bg = 'rgba(255,255,255,0.15)' if active else 'transparent'
    color = '#FFFFFF' if active else 'rgba(226,232,240,0.85)'
    cur = ' aria-current="page"' if active else ''
    return ('<a href="#top"' + cur + ' style="display: flex; align-items: center; gap: 12px; padding: 8px 12px; border-radius: 8px; background: '
            + bg + '; color: ' + color + '; font-size: 14px; font-weight: 500; text-decoration: none">' + svg(icon) + '<span>' + label + '</span></a>')


def sidebar(active):
    work = [('home', 'Home'), ('building', 'Office Floor'), ('video', 'Meetings'), ('chat', 'Chat'), ('tasks', 'Tasks'),
            ('clock', 'Attendance'), ('calendar', 'Leave'), ('chart', 'Reports')]
    admin = [('users', 'People'), ('network', 'Departments'), ('finger', 'Biometric devices'), ('key', 'Login history')]
    items = '\n'.join(nav_item(i, l, l == active) for i, l in work)
    adm = '\n'.join(nav_item(i, l, l == active) for i, l in admin)
    return R('''<nav aria-label="Main" style="display: flex; flex-direction: column; gap: 3px; padding: 20px 12px 16px; background: #1F3A5F; color: #E2E8F0">
<div style="display: flex; align-items: center; gap: 10px; padding: 0 12px 18px">
<span style="display: flex; align-items: center; justify-content: center; width: 34px; height: 34px; border-radius: 9px; background: #2563EB; color: #FFFFFF; font-size: 15px; font-weight: 700">CC</span>
<span style="display: flex; flex-direction: column; line-height: 1.2"><span style="font-size: 14px; font-weight: 700; color: #FFFFFF">Covenant Creators</span><span style="font-size: 12px; color: rgba(226,232,240,0.65)">Virtual Office</span></span>
</div>
@ITEMS@
<p style="margin: 0; padding: 18px 12px 4px; font-size: 12px; font-weight: 600; color: rgba(226,232,240,0.6)">Admin &amp; HR</p>
@ADM@
<span style="flex-grow: 1"></span>
@SET@
</nav>''', ITEMS=items, ADM=adm, SET=nav_item('settings', 'Settings', False))


def topbar(title_right=''):
    return R('''<header style="height: 64px; flex-shrink: 0; display: flex; align-items: center; gap: 22px; padding: 0 32px; border-bottom: 1px solid #DCDFD8">
<span style="font-size: 14px"><span style="font-weight: 700">10:24 AM</span> <span style="color: #586171">Manila</span></span>
<span style="font-size: 14px"><span style="font-weight: 700">10:24 PM</span> <span style="color: #586171">New York</span></span>
<span style="flex-grow: 1"></span>
@RIGHT@
<span style="display: flex; align-items: center; gap: 10px">
<span style="display: flex; align-items: center; justify-content: center; width: 32px; height: 32px; border-radius: 999px; background: hsl(280 55% 88%); color: hsl(280 60% 24%); font-size: 12px; font-weight: 700">GL</span>
<span style="display: flex; flex-direction: column; line-height: 1.2"><span style="font-size: 14px; font-weight: 600">Grace Lim</span><span style="font-size: 12px; color: #586171">HR Specialist</span></span>
</span>
</header>''', RIGHT=title_right)


FONT = ('<link rel="preconnect" href="https://fonts.googleapis.com">\n'
        '<link href="https://fonts.googleapis.com/css2?family=Figtree:wght@400;500;600;700&amp;display=swap" rel="stylesheet">\n')

BASE_CSS = '''
body{margin:0;font-family:'Figtree',system-ui,sans-serif;background:#F4F5F1}
a{color:#1D4ED8}a:hover{color:#1E3A8A}
button:focus-visible,a:focus-visible,select:focus-visible{outline:2px solid #2563EB;outline-offset:2px}
@keyframes hr-in{from{opacity:0;transform:translateY(-6px)}to{opacity:1;transform:none}}
@keyframes hr-pulse{0%,100%{opacity:1}50%{opacity:.35}}
@keyframes hr-slide{from{transform:translateX(24px);opacity:0}to{transform:none;opacity:1}}
.hr-fresh{animation:hr-in .5s ease-out}
.hr-live{animation:hr-pulse 1.6s ease-in-out infinite}
.hr-drawer{animation:hr-slide .25s ease-out}
.hr-row:hover{background:#F7F8F5}
@media (prefers-reduced-motion: reduce){.hr-fresh,.hr-live,.hr-drawer{animation:none!important}}
'''


def page(title, css, body, js, props):
    return ('<!doctype html>\n<html lang="en">\n<head>\n<meta charset="utf-8">\n<title>' + title + '</title>\n'
            '<script src="./support.js"></script>\n</head>\n<body>\n<x-dc>\n<helmet>\n' + FONT + '<style>' + css + '</style>\n</helmet>\n'
            + body + '\n</x-dc>\n<script type="text/x-dc" data-dc-script data-props=\'' + json.dumps(props) + '\'>' + js + '</script>\n</body>\n</html>\n')


CARD = 'background: #FFFFFF; border: 1px solid #DCDFD8; border-radius: 14px'
BTN = 'display: inline-flex; align-items: center; justify-content: center; gap: 6px; height: 34px; padding: 0 12px; border-radius: 8px; border: 1px solid #C9CEC4; background: #FFFFFF; color: #1B2230; font-family: inherit; font-size: 13px; font-weight: 600; cursor: pointer; white-space: nowrap'
BTN_P = 'display: inline-flex; align-items: center; justify-content: center; gap: 6px; height: 34px; padding: 0 12px; border-radius: 8px; border: 1px solid #2563EB; background: #2563EB; color: #FFFFFF; font-family: inherit; font-size: 13px; font-weight: 600; cursor: pointer; white-space: nowrap'

# =============================================================== HR board ====

HR_JS = r'''
class Component extends DCLogic {
  constructor(props) {
    super(props);
    this.state = {
      tab: 'today',
      filter: 'all',
      selected: null,
      done: {},
      decisions: {},
      linkPick: 'kevin',
      ryanBreak: false,
      toast: null,
      live: [
        { key: 'l4', name: 'Joy Dela Cruz', what: 'Clock in', time: '10:21 AM', src: 'bio', where: 'Main entrance' },
        { key: 'l3', name: 'Grace Lim', what: 'Break out', time: '10:05 AM', src: 'bio', where: 'Main entrance' },
        { key: 'l2', name: 'Liza Garcia', what: 'Clock in', time: '8:14 AM', src: 'bio', where: 'Main entrance' },
        { key: 'l1', name: 'Badge 0047', what: 'Unlinked punch', time: '8:12 AM', src: 'bio', where: 'Main entrance' }
      ]
    };
  }

  componentDidMount() {
    this.t1 = setTimeout(() => {
      this.setState((s) => ({
        ryanBreak: true,
        live: [{ key: 'l5', name: 'Ryan Torres', what: 'Break out', time: '10:25 AM', src: 'bio', where: 'Main entrance', fresh: true }].concat(s.live).slice(0, 4)
      }));
    }, 5000);
  }

  componentWillUnmount() {
    clearTimeout(this.t1);
    clearTimeout(this.toastTimer);
  }

  flash(msg) {
    clearTimeout(this.toastTimer);
    this.setState({ toast: msg });
    this.toastTimer = setTimeout(() => this.setState({ toast: null }), 3400);
  }

  resolve(id, note, msg) {
    this.setState((s) => ({ done: Object.assign({}, s.done, { [id]: note }) }));
    this.flash(msg || note);
  }

  hue(name) {
    const hues = [210, 160, 30, 280, 340, 190, 100, 250];
    let h = 0;
    for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) >>> 0;
    return hues[h % hues.length];
  }

  people() {
    const st = this.state;
    const d = st.done;
    const P = [
      { id: 'maria', name: 'Maria Santos', title: 'Operations Director', setup: 'onsite', sched: '8:00 AM – 5:00 PM', status: 'ontime', hours: '2h 32m',
        ev: [['7:52 AM', 'Clock in', 'bio', 'Main entrance terminal, fingerprint']], week: [9.1, 8.8, 9.0, 8.9] },
      { id: 'paolo', name: 'Paolo Aquino', title: 'Junior Engineer', setup: 'onsite', sched: '8:00 AM – 5:00 PM', status: 'ontime', hours: '2h 44m',
        ev: [['7:40 AM', 'Clock in', 'bio', 'Main entrance terminal, face']], week: [9.3, 9.0, 9.4, 9.2] },
      { id: 'carlo', name: 'Carlo Mendoza', title: 'Account Executive', setup: 'onsite', sched: '8:00 AM – 5:00 PM', status: 'ontime', hours: '2h 35m', note: '3 punches merged',
        ev: [['7:49 AM', 'Clock in', 'bio', 'Main entrance terminal, fingerprint (3 punches within 1 minute, kept the first)']], week: [8.9, 9.0, 8.7, 9.1] },
      { id: 'kim', name: 'Kim Navarro', title: 'Operations Analyst', setup: 'onsite', sched: '8:00 AM – 5:00 PM', status: 'ontime', hours: '2h 24m',
        ev: [['8:00 AM', 'Clock in', 'bio', 'Main entrance terminal, face']], week: [9.0, 9.0, 8.8, 9.0] },
      { id: 'ryan', name: 'Ryan Torres', title: 'Sales Development Rep', setup: 'onsite', sched: '8:00 AM – 5:00 PM', status: st.ryanBreak ? 'break' : 'ontime', hours: '2h 21m', note: 'Within 5-min grace',
        ev: [['8:03 AM', 'Clock in', 'bio', 'Main entrance terminal, fingerprint']].concat(st.ryanBreak ? [['10:25 AM', 'Break out', 'bio', 'Main entrance terminal, fingerprint']] : []), week: [8.6, 9.0, 9.2, 8.8] },
      { id: 'grace', name: 'Grace Lim', title: 'HR Specialist', setup: 'onsite', sched: '8:00 AM – 5:00 PM', status: 'break', hours: '2h 07m',
        ev: [['7:58 AM', 'Clock in', 'bio', 'Main entrance terminal, face'], ['10:05 AM', 'Break out', 'bio', 'Main entrance terminal, face']], week: [9.0, 8.9, 9.0, 9.0] },
      { id: 'liza', name: 'Liza Garcia', title: 'Support Associate', setup: 'onsite', sched: '8:00 AM – 5:00 PM', status: d.liza ? 'excused' : 'late', late: '14m', hours: '2h 10m',
        ev: [['8:14 AM', 'Clock in', 'bio', 'Main entrance terminal, fingerprint']], week: [8.8, 9.0, 8.5, 9.0] },
      { id: 'joy', name: 'Joy Dela Cruz', title: 'Recruiter', setup: 'onsite', sched: '10:00 AM – 7:00 PM', status: d.joy ? 'excused' : 'late', late: '21m', hours: '0h 03m',
        ev: [['10:21 AM', 'Clock in', 'bio', 'Main entrance terminal, face']], week: [9.0, 8.9, 9.1, 9.0] },
      { id: 'kevin', name: 'Kevin Lim', title: 'Graphic Designer', setup: 'onsite', sched: '8:00 AM – 5:00 PM', status: d.link ? 'late' : 'nopunch', late: '12m', hours: d.link ? '2h 12m' : '—',
        ev: d.link ? [['8:12 AM', 'Clock in', 'bio', 'Main entrance terminal, fingerprint (badge 0047, linked by HR at 10:26 AM)']] : [], week: [8.7, 0, 9.0, 8.9], newHire: true },
      { id: 'jose', name: 'Jose Reyes', title: 'Engineering Lead', setup: 'hybrid', sched: '8:00 AM – 5:00 PM',
        status: d.jose === 'web' ? 'ontime' : d.jose ? 'late' : 'mismatch', late: '31m', hours: d.jose && d.jose !== 'web' ? '1h 53m' : '2h 29m',
        ev: [['7:55 AM', 'Clock in', 'web', 'Virtual Office, Quezon City (home network)'], ['8:31 AM', 'Badge in', 'bio', 'Main entrance terminal, face']], week: [9.2, 9.0, 8.4, 9.1] },
      { id: 'ana', name: 'Ana Cruz', title: 'Software Engineer', setup: 'remote', sched: '8:00 AM – 5:00 PM', status: 'ontime', hours: '2h 22m',
        ev: [['8:02 AM', 'Clock in', 'web', 'Virtual Office, Bulacan']], week: [8.8, 9.0, 9.0, 8.7] },
      { id: 'nico', name: 'Nico Ramos', title: 'Backend Engineer', setup: 'remote', sched: '8:00 AM – 5:00 PM', status: d.nico ? 'excused' : 'late', late: '10m', hours: '2h 14m',
        ev: [['8:10 AM', 'Clock in', 'web', 'Virtual Office, Cebu City']], week: [8.9, 8.5, 9.0, 9.0] },
      { id: 'tess', name: 'Tess Bautista', title: 'DevOps Engineer', setup: 'remote', sched: '8:00 AM – 5:00 PM', status: 'ontime', hours: '2h 26m',
        ev: [['7:58 AM', 'Clock in', 'web', 'Virtual Office, Pasig']], week: [7.1, 9.0, 9.2, 9.0] },
      { id: 'bea', name: 'Bea Villanueva', title: 'Frontend Engineer', setup: 'remote', sched: '8:00 AM – 5:00 PM', status: 'ontime', hours: '2h 24m',
        ev: [['8:00 AM', 'Clock in', 'web', 'Virtual Office, Makati']], week: [9.0, 0, 9.0, 8.9] },
      { id: 'emily', name: 'Emily Carter', title: 'QA Engineer (New York)', setup: 'remote', sched: '9:00 PM – 6:00 AM', status: d.emily ? 'done' : 'noout', hours: d.emily ? '9h 03m' : '13h 27m',
        ev: [['8:57 PM', 'Clock in (Sep 30)', 'web', 'Virtual Office, New York']].concat(d.emily ? [['6:00 AM', 'Clock out (set by HR)', 'web', 'Set to end of shift by Grace Lim']] : []), week: [9.0, 9.1, 8.9, 9.0] },
      { id: 'daniel', name: 'Daniel Brooks', title: 'Sales Manager (New York)', setup: 'remote', sched: '9:00 PM – 6:00 AM', status: 'done', hours: '9h 03m',
        ev: [['9:02 PM', 'Clock in (Sep 30)', 'web', 'Virtual Office, New York'], ['6:05 AM', 'Clock out', 'web', 'Virtual Office, New York']], week: [9.0, 9.0, 9.0, 9.1] },
      { id: 'sam', name: 'Sam Porter', title: 'Account Executive (New York)', setup: 'remote', sched: '9:00 PM – 6:00 AM', status: 'leave', hours: '—',
        ev: [], week: [9.0, 9.0, 0, 0], leave: 'Vacation leave, Sep 30 – Oct 2 (approved by Daniel Brooks)' }
    ];
    return P;
  }

  renderVals() {
    const st = this.state;
    const P = this.people();
    const CHIP = {
      ontime: ['On time', '#E3F1E8', '#14532D'],
      late: ['Late', '#FDF0DC', '#7C3F00'],
      excused: ['Late, excused', '#EEF1EC', '#3F4756'],
      break: ['On break', '#FDF0DC', '#7C3F00'],
      nopunch: ['No punch yet', '#FDE4E8', '#8A1030'],
      noout: ['Missing clock-out', '#FDE4E8', '#8A1030'],
      mismatch: ['Times don’t match', '#EEE8FB', '#4C1D95'],
      done: ['Shift done', '#EEF1EC', '#3F4756'],
      leave: ['On leave', '#E6EEFB', '#1E3A8A']
    };
    const SETUP = { onsite: ['On-site', '#1F3A5F'], remote: ['Remote', '#0F766E'], hybrid: ['Hybrid', '#6D28D9'] };
    const needs = (p) => ['late', 'nopunch', 'noout', 'mismatch'].includes(p.status);

    const visible = P.filter((p) =>
      st.filter === 'all' ? true : st.filter === 'flagged' ? needs(p) : st.filter === 'onsite' ? p.setup !== 'remote' : p.setup !== 'onsite');

    const rows = visible.map((p) => {
      const c = CHIP[p.status];
      const h = this.hue(p.name);
      const parts = p.name.split(' ');
      const first = p.ev[0];
      const lastOut = p.ev.find((e) => /out/i.test(e[1]) && !/Break/.test(e[1]));
      return {
        key: p.id,
        name: p.name,
        title: p.title,
        initials: (parts[0][0] + parts[parts.length - 1][0]).toUpperCase(),
        avatarStyle: 'display: flex; align-items: center; justify-content: center; width: 32px; height: 32px; flex-shrink: 0; border-radius: 999px; font-size: 12px; font-weight: 700; background: hsl(' + h + ' 55% 88%); color: hsl(' + h + ' 60% 24%)',
        setup: SETUP[p.setup][0],
        setupStyle: 'display: inline-flex; align-items: center; height: 22px; padding: 0 8px; border-radius: 6px; font-size: 12px; font-weight: 600; color: ' + SETUP[p.setup][1] + '; box-shadow: inset 0 0 0 1px ' + SETUP[p.setup][1] + '55',
        sched: p.sched,
        inTime: first ? first[0] : '—',
        inBio: !!first && first[2] === 'bio',
        inWeb: !!first && first[2] === 'web',
        both: p.ev.some((e) => e[2] === 'bio') && p.ev.some((e) => e[2] === 'web'),
        outTime: lastOut ? lastOut[0] : '—',
        hours: p.hours,
        chip: c[0] + ((p.status === 'late' || p.status === 'excused') && p.late ? ' ' + p.late : ''),
        chipStyle: 'display: inline-flex; align-items: center; height: 24px; padding: 0 9px; border-radius: 999px; font-size: 12px; font-weight: 700; white-space: nowrap; background: ' + c[1] + '; color: ' + c[2],
        note: p.newHire && !st.done.link ? 'New hire, badge not linked' : p.note || (p.leave ? 'Vacation leave' : ''),
        rowStyle: 'border-top: 1px solid #ECEEE9' + (st.selected === p.id ? '; background: #EEF3FE' : ''),
        pick: () => this.setState({ selected: p.id })
      };
    });

    // ---------- exceptions ----------
    const kevinLinked = !!st.done.link;
    const EX = [
      { id: 'link', kind: 'Unlinked badge', tone: '#8A1030', bg: '#FDE4E8',
        title: 'Badge 0047 punched in at 8:12 AM but isn’t linked to anyone',
        detail: 'Main entrance terminal, fingerprint. Kevin Lim started this week and has no badge linked yet, so he shows as No punch yet.',
        select: true, primary: 'Link badge',
        doPrimary: () => this.resolve('link', 'Badge 0047 linked to ' + (st.linkPick === 'kevin' ? 'Kevin Lim' : 'the selected person') + '. The 8:12 AM punch now counts as their clock-in.') },
      { id: 'emily', kind: 'Missing clock-out', tone: '#8A1030', bg: '#FDE4E8',
        title: 'Emily Carter has been clocked in for 13h 27m',
        detail: 'Shift 9:00 PM – 6:00 AM Manila time (her New York day). Clocked in on the web at 8:57 PM, no clock-out. Auto clock-out runs at 14 hours.',
        primary: 'Set clock-out to 6:00 AM', doPrimary: () => this.resolve('emily', 'Clock-out set to 6:00 AM, end of shift. Emily was notified.'),
        secondary: 'Ask Emily', doSecondary: () => this.flash('Sent Emily a message asking for her clock-out time.') },
      { id: 'jose', kind: 'Web and biometric don’t match', tone: '#4C1D95', bg: '#EEE8FB',
        title: 'Jose Reyes clocked in from home at 7:55 AM, then badged in at 8:31 AM',
        detail: 'Web clock-in from a Quezon City home network, biometric at the Main entrance 36 minutes later. Company rule: on on-site days, the biometric time counts.',
        primary: 'Use biometric 8:31 AM', doPrimary: () => this.resolve('jose', 'Using the biometric time, 8:31 AM. Jose is marked 31 minutes late.'),
        secondary: 'Keep web 7:55 AM', doSecondary: () => this.setState((s) => ({ done: Object.assign({}, s.done, { jose: 'web' }) }), () => this.flash('Keeping 7:55 AM. Jose worked from home before commuting in.')) },
      { id: 'liza', kind: 'Late', tone: '#7C3F00', bg: '#FDF0DC',
        title: 'Liza Garcia badged in 14 minutes late',
        detail: 'Scheduled 8:00 AM with a 5-minute grace period. First punch 8:14 AM. Second late arrival this month.',
        primary: 'Excuse', doPrimary: () => this.resolve('liza', 'Liza’s late arrival was excused.'),
        secondary: 'Keep as late', doSecondary: () => this.resolve('liza-keep', 'Kept as late.') },
      { id: 'nico', kind: 'Late', tone: '#7C3F00', bg: '#FDF0DC',
        title: 'Nico Ramos clocked in 10 minutes late (web)',
        detail: 'Scheduled 8:00 AM. Clocked in at 8:10 AM from Cebu City. Nico noted: “Power interruption, back on at 8:08.”',
        primary: 'Excuse', doPrimary: () => this.resolve('nico', 'Nico’s late arrival was excused.'),
        secondary: 'Keep as late', doSecondary: () => this.resolve('nico-keep', 'Kept as late.') },
      { id: 'joy', kind: 'Late', tone: '#7C3F00', bg: '#FDF0DC',
        title: 'Joy Dela Cruz badged in 21 minutes late',
        detail: 'Scheduled 10:00 AM (mid shift). First punch 10:21 AM.',
        primary: 'Excuse', doPrimary: () => this.resolve('joy', 'Joy’s late arrival was excused.'),
        secondary: 'Keep as late', doSecondary: () => this.resolve('joy-keep', 'Kept as late.') },
      { id: 'carlo', kind: 'Duplicate punches', tone: '#3F4756', bg: '#EEF1EC',
        title: 'Carlo Mendoza punched 3 times in 1 minute',
        detail: '7:49:02, 7:49:31 and 7:50:05 AM at the Main entrance. The first one was kept as his clock-in; the others were merged.',
        primary: 'OK', doPrimary: () => this.resolve('carlo', 'Noted.') }
    ];
    const isDone = (e) => !!st.done[e.id] || !!st.done[e.id + '-keep'];
    const exOpen = EX.filter((e) => !isDone(e) && !(e.id === 'jose' && st.done.jose)).map((e) => ({
      key: e.id,
      kind: e.kind,
      kindStyle: 'display: inline-flex; align-items: center; height: 22px; padding: 0 8px; border-radius: 6px; font-size: 12px; font-weight: 700; background: ' + e.bg + '; color: ' + e.tone,
      title: e.title,
      detail: e.detail,
      hasSelect: !!e.select,
      onPick: (ev) => this.setState({ linkPick: ev.target.value }),
      primary: e.primary,
      doPrimary: e.doPrimary,
      hasSecondary: !!e.secondary,
      secondary: e.secondary || '',
      doSecondary: e.doSecondary || (() => {})
    }));
    const exDone = EX.filter((e) => isDone(e) || (e.id === 'jose' && st.done.jose)).map((e) => ({
      key: e.id,
      title: e.title,
      note: st.done[e.id] === 'web' ? 'Kept the web time, 7:55 AM.' : st.done[e.id] || st.done[e.id + '-keep']
    }));

    // ---------- corrections ----------
    const CR = [
      { id: 'c1', name: 'Bea Villanueva', date: 'Tue, Sep 29', ask: 'Add a clock-out at 5:10 PM', reason: 'Forgot to clock out before logging off. My last activity in the Virtual Office was 5:08 PM.', mgr: 'Approved by Jose Reyes', mgrOk: true },
      { id: 'c2', name: 'Ryan Torres', date: 'Wed, Sep 30', ask: 'Change clock-in from 8:06 AM (web) to 7:58 AM', reason: 'The biometric wouldn’t read my finger, so I clocked in on my phone. The guard’s logbook shows 7:58 AM.', mgr: 'Waiting for Daniel Brooks', mgrOk: false },
      { id: 'c3', name: 'Tess Bautista', date: 'Mon, Sep 28', ask: 'Change clock-in from 9:12 AM to 7:30 AM', reason: 'Power outage in Pasig. I worked offline from 7:30 AM; commit history attached.', mgr: 'Approved by Jose Reyes', mgrOk: true }
    ];
    const corrections = CR.map((c) => {
      const dec = st.decisions[c.id];
      const h = this.hue(c.name);
      const parts = c.name.split(' ');
      return {
        key: c.id,
        name: c.name,
        initials: (parts[0][0] + parts[parts.length - 1][0]).toUpperCase(),
        avatarStyle: 'display: flex; align-items: center; justify-content: center; width: 36px; height: 36px; flex-shrink: 0; border-radius: 999px; font-size: 13px; font-weight: 700; background: hsl(' + h + ' 55% 88%); color: hsl(' + h + ' 60% 24%)',
        date: c.date,
        ask: c.ask,
        reason: c.reason,
        mgr: c.mgr,
        mgrStyle: 'font-size: 12.5px; font-weight: 600; color: ' + (c.mgrOk ? '#14532D' : '#7C3F00'),
        pending: !dec,
        decided: !!dec,
        decision: dec === 'ok' ? 'Approved by HR. The timesheet was updated and ' + parts[0] + ' was notified.' : 'Rejected. ' + parts[0] + ' was notified with your note.',
        decisionStyle: 'font-size: 13px; font-weight: 600; color: ' + (dec === 'ok' ? '#14532D' : '#8A1030'),
        approve: () => { this.setState((s) => ({ decisions: Object.assign({}, s.decisions, { [c.id]: 'ok' }) })); this.flash('Approved. ' + parts[0] + '’s timesheet was updated.'); },
        reject: () => { this.setState((s) => ({ decisions: Object.assign({}, s.decisions, { [c.id]: 'no' }) })); this.flash('Rejected. ' + parts[0] + ' was notified.'); }
      };
    });
    const crPending = corrections.filter((c) => c.pending).length;

    // ---------- KPIs ----------
    const working = P.filter((p) => ['ontime', 'late', 'excused', 'break', 'mismatch', 'noout'].includes(p.status));
    const kOnsite = working.filter((p) => p.setup !== 'remote').length;
    const kRemote = working.filter((p) => p.setup === 'remote').length;
    const kLate = P.filter((p) => p.status === 'late' || p.status === 'excused').length;

    // ---------- drawer ----------
    let sel = {};
    const sp = P.find((p) => p.id === st.selected);
    if (sp) {
      const c = CHIP[sp.status];
      const h = this.hue(sp.name);
      const parts = sp.name.split(' ');
      const days = ['Mon', 'Tue', 'Wed', 'Thu'];
      const today = sp.hours === '—' ? 0 : Number(sp.hours.split('h')[0]) + Number(sp.hours.split('h')[1].replace('m', '')) / 60;
      const bars = sp.week.concat([today]).map((v, i) => ({
        key: 'b' + i,
        label: i < 4 ? days[i] : 'Today',
        value: v ? (Math.round(v * 10) / 10) + 'h' : i < 4 ? 'Off' : '—',
        barStyle: 'width: 100%; border-radius: 4px 4px 0 0; height: ' + Math.max(3, Math.round((v / 10) * 80)) + 'px; background: ' + (i === 4 ? '#2563EB' : v ? '#9DB5E0' : '#DCDFD8')
      }));
      sel = {
        name: sp.name,
        title: sp.title,
        initials: (parts[0][0] + parts[parts.length - 1][0]).toUpperCase(),
        avatarStyle: 'display: flex; align-items: center; justify-content: center; width: 48px; height: 48px; flex-shrink: 0; border-radius: 999px; font-size: 16px; font-weight: 700; background: hsl(' + h + ' 55% 88%); color: hsl(' + h + ' 60% 24%)',
        chip: c[0] + ((sp.status === 'late' || sp.status === 'excused') && sp.late ? ' ' + sp.late : ''),
        chipStyle: 'display: inline-flex; align-items: center; height: 24px; padding: 0 9px; border-radius: 999px; font-size: 12px; font-weight: 700; background: ' + c[1] + '; color: ' + c[2],
        setup: SETUP[sp.setup][0],
        sched: sp.sched,
        events: sp.ev.map((e, i) => ({ key: 'e' + i, time: e[0], what: e[1], where: e[3], bio: e[2] === 'bio', web: e[2] === 'web' })),
        hasEvents: sp.ev.length > 0,
        noEvents: sp.ev.length === 0,
        empty: sp.leave || (sp.newHire ? 'No punches linked to Kevin yet. See Exceptions: badge 0047 punched in at 8:12 AM.' : 'No punches yet today.'),
        bars: bars,
        hours: sp.hours
      };
    }

    const tabBtn = (id, label) => {
      const on = st.tab === id;
      return 'display: inline-flex; align-items: center; gap: 8px; height: 42px; padding: 0 4px; margin-right: 22px; border: 0; border-bottom: 3px solid ' + (on ? '#2563EB' : 'transparent') + '; background: transparent; font-family: inherit; font-size: 15px; font-weight: 700; cursor: pointer; color: ' + (on ? '#1B2230' : '#586171');
    };
    const count = (n, tone) => 'display: inline-flex; align-items: center; justify-content: center; min-width: 22px; height: 22px; padding: 0 6px; box-sizing: border-box; border-radius: 999px; font-size: 12px; font-weight: 700; background: ' + (n ? tone : '#E6E9E2') + '; color: ' + (n ? '#FFFFFF' : '#586171');

    const filters = [['all', 'Everyone', P.length], ['onsite', 'On-site', P.filter((p) => p.setup !== 'remote').length], ['remote', 'Remote', P.filter((p) => p.setup !== 'onsite').length], ['flagged', 'Needs attention', P.filter(needs).length]].map((f) => ({
      key: f[0],
      label: f[1] + ' (' + f[2] + ')',
      pressed: st.filter === f[0] ? 'true' : 'false',
      style: 'height: 32px; padding: 0 12px; border-radius: 8px; border: 0; font-family: inherit; font-size: 13px; font-weight: 600; cursor: pointer; ' + (st.filter === f[0] ? 'background: #FFFFFF; color: #1B2230; box-shadow: 0 1px 2px rgba(27,34,48,0.12)' : 'background: transparent; color: #586171'),
      pick: () => this.setState({ filter: f[0] })
    }));

    return {
      rows: rows,
      filters: filters,
      live: st.live.map((l) => ({ key: l.key, name: l.name, what: l.what, time: l.time, where: l.where, cls: l.fresh ? 'hr-fresh' : '', itemStyle: 'display: flex; flex-direction: column; gap: 2px; min-width: 0; padding: 8px 12px; border-radius: 10px; background: ' + (l.fresh ? '#EEF3FE' : '#F7F8F5') + '; box-shadow: inset 0 0 0 1px ' + (l.fresh ? '#BFD0F6' : '#ECEEE9') })),
      kWorking: kOnsite + kRemote,
      kOnsite: kOnsite,
      kRemote: kRemote,
      kLate: kLate,
      kNoPunch: P.filter((p) => p.status === 'nopunch').length,
      kOpen: exOpen.length,
      isToday: st.tab === 'today',
      isEx: st.tab === 'exceptions',
      isCr: st.tab === 'corrections',
      tabToday: tabBtn('today'),
      tabEx: tabBtn('exceptions'),
      tabCr: tabBtn('corrections'),
      exCountStyle: count(exOpen.length, '#BE123C'),
      crCountStyle: count(crPending, '#B45309'),
      exCount: exOpen.length,
      crCount: crPending,
      goToday: () => this.setState({ tab: 'today' }),
      goEx: () => this.setState({ tab: 'exceptions' }),
      goCr: () => this.setState({ tab: 'corrections' }),
      exOpen: exOpen,
      exDone: exDone,
      hasExOpen: exOpen.length > 0,
      noExOpen: exOpen.length === 0,
      hasExDone: exDone.length > 0,
      corrections: corrections,
      hasSel: !!sp,
      sel: sel,
      close: () => this.setState({ selected: null }),
      adjust: () => this.flash('Adjusting times opens a form; every change is logged in the audit log.'),
      addNote: () => this.flash('Note added to ' + (sp ? sp.name.split(' ')[0] : '') + '’s record for today.'),
      exportIt: () => this.flash('Exporting today’s attendance to Excel…'),
      hasToast: !!st.toast,
      toast: st.toast || ''
    };
  }
}
'''


def hr_board():
    bio16 = svg('finger', 15)
    web16 = svg('laptop', 15)
    body = R('''<div id="top" style="position: relative; width: 1440px; height: 1180px; display: grid; grid-template-columns: 248px minmax(0, 1fr); background: #F4F5F1; color: #1B2230; font-family: 'Figtree', system-ui, sans-serif; overflow: hidden">
@SIDEBAR@
<div style="display: flex; flex-direction: column; min-width: 0">
@TOPBAR@
<main style="display: flex; flex-direction: column; gap: 18px; padding: 22px 32px 28px">
<div style="display: flex; align-items: flex-end; justify-content: space-between; gap: 16px">
<div>
<h1 style="margin: 0; font-size: 28px; font-weight: 700; letter-spacing: -0.01em">Attendance</h1>
<p style="margin: 4px 0 0; font-size: 15px; color: #586171">Biometric punches and Virtual Office clock-ins, combined into one record per person.</p>
</div>
<div style="display: flex; align-items: center; gap: 8px">
<button type="button" aria-label="Previous day" style="@BTN@; width: 34px; padding: 0">@CHEVL@</button>
<span style="display: flex; align-items: center; height: 34px; padding: 0 14px; border-radius: 8px; background: #FFFFFF; border: 1px solid #C9CEC4; font-size: 14px; font-weight: 600">Today, Thu Oct 1</span>
<button type="button" aria-label="Next day" disabled style="@BTN@; width: 34px; padding: 0; opacity: 0.5; cursor: default">@CHEVR@</button>
<button type="button" onClick="{{exportIt}}" style="@BTN@">@DOWNLOAD@Export</button>
</div>
</div>

<div style="display: grid; grid-template-columns: repeat(5, minmax(0, 1fr)); gap: 12px">
<div style="@CARD@; padding: 14px 16px"><p style="margin: 0; font-size: 13px; color: #586171">Working now</p><p style="margin: 4px 0 0; font-size: 30px; font-weight: 700; line-height: 1">{{kWorking}}</p><p style="margin: 6px 0 0; font-size: 12.5px; color: #586171">{{kOnsite}} on-site, {{kRemote}} remote</p></div>
<div style="@CARD@; padding: 14px 16px"><p style="margin: 0; font-size: 13px; color: #586171">Late today</p><p style="margin: 4px 0 0; font-size: 30px; font-weight: 700; line-height: 1; color: #7C3F00">{{kLate}}</p><p style="margin: 6px 0 0; font-size: 12.5px; color: #586171">After the 5-minute grace</p></div>
<div style="@CARD@; padding: 14px 16px"><p style="margin: 0; font-size: 13px; color: #586171">No punch yet</p><p style="margin: 4px 0 0; font-size: 30px; font-weight: 700; line-height: 1; color: #8A1030">{{kNoPunch}}</p><p style="margin: 6px 0 0; font-size: 12.5px; color: #586171">Scheduled, not clocked in</p></div>
<div style="@CARD@; padding: 14px 16px"><p style="margin: 0; font-size: 13px; color: #586171">On leave</p><p style="margin: 4px 0 0; font-size: 30px; font-weight: 700; line-height: 1; color: #1E3A8A">1</p><p style="margin: 6px 0 0; font-size: 12.5px; color: #586171">Not counted as absent</p></div>
<button type="button" onClick="{{goEx}}" style="@CARD@; padding: 14px 16px; text-align: left; font-family: inherit; color: inherit; cursor: pointer"><span style="display: block; font-size: 13px; color: #586171">Needs attention</span><span style="display: block; margin-top: 4px; font-size: 30px; font-weight: 700; line-height: 1; color: #8A1030">{{kOpen}}</span><span style="display: block; margin-top: 6px; font-size: 12.5px; color: #1D4ED8; font-weight: 600">Review exceptions</span></button>
</div>

<section aria-label="Live punches" style="@CARD@; padding: 12px 14px; display: flex; align-items: center; gap: 14px">
<span style="display: flex; align-items: center; gap: 8px; flex-shrink: 0; font-size: 13px; font-weight: 700"><span class="hr-live" style="width: 8px; height: 8px; border-radius: 999px; background: #15803D"></span>Live punches</span>
<div style="flex-grow: 1; display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 8px">
<sc-for list="{{live}}" as="l" hint-placeholder-count="4"><div class="{{l.cls}}" style="{{l.itemStyle}}"><span style="display: flex; align-items: center; gap: 6px; font-size: 13px; font-weight: 700; white-space: nowrap; overflow: hidden; text-overflow: ellipsis"><span style="display: flex; color: #1F3A5F">@BIO@</span>{{l.name}}</span><span style="font-size: 12px; color: #586171; white-space: nowrap">{{l.what}}, {{l.time}}, {{l.where}}</span></div></sc-for>
</div>
</section>

<div style="border-bottom: 1px solid #DCDFD8; display: flex; align-items: flex-end">
<button type="button" onClick="{{goToday}}" style="{{tabToday}}">Today's board</button>
<button type="button" onClick="{{goEx}}" style="{{tabEx}}">Exceptions <span style="{{exCountStyle}}">{{exCount}}</span></button>
<button type="button" onClick="{{goCr}}" style="{{tabCr}}">Correction requests <span style="{{crCountStyle}}">{{crCount}}</span></button>
</div>

<sc-if value="{{isToday}}" hint-placeholder-val="{{true}}">
<div style="display: flex; flex-direction: column; gap: 12px">
<div style="display: flex; align-items: center; justify-content: space-between; gap: 12px">
<div style="display: flex; gap: 4px; padding: 4px; background: #E6E9E2; border-radius: 10px">
<sc-for list="{{filters}}" as="f" hint-placeholder-count="4"><button type="button" onClick="{{f.pick}}" aria-pressed="{{f.pressed}}" style="{{f.style}}">{{f.label}}</button></sc-for>
</div>
<div style="display: flex; align-items: center; gap: 16px; font-size: 12.5px; color: #586171">
<span style="display: flex; align-items: center; gap: 6px"><span style="display: flex; color: #1F3A5F">@BIO@</span>Biometric punch</span>
<span style="display: flex; align-items: center; gap: 6px"><span style="display: flex; color: #0F766E">@WEB@</span>Virtual Office clock-in</span>
</div>
</div>
<div style="@CARD@; overflow: hidden">
<div role="table" aria-label="Today's attendance" style="font-size: 13.5px">
<div role="row" style="display: grid; grid-template-columns: minmax(0, 2.2fr) 84px 150px 118px 84px 76px 158px minmax(0, 1.3fr); column-gap: 8px; align-items: center; padding: 10px 16px; font-size: 12px; font-weight: 600; color: #586171">
<span role="columnheader">Person</span><span role="columnheader">Setup</span><span role="columnheader">Schedule</span><span role="columnheader">In</span><span role="columnheader">Out</span><span role="columnheader">Hours</span><span role="columnheader">Status</span><span role="columnheader">Note</span>
</div>
<sc-for list="{{rows}}" as="r" hint-placeholder-count="10"><div role="row" class="hr-row" style="display: grid; grid-template-columns: minmax(0, 2.2fr) 84px 150px 118px 84px 76px 158px minmax(0, 1.3fr); column-gap: 8px; align-items: center; padding: 7px 16px; {{r.rowStyle}}">
<span role="cell"><button type="button" onClick="{{r.pick}}" style="display: flex; align-items: center; gap: 10px; padding: 0; border: 0; background: transparent; font-family: inherit; color: inherit; text-align: left; cursor: pointer"><span style="{{r.avatarStyle}}">{{r.initials}}</span><span><span style="display: block; font-weight: 600">{{r.name}}</span><span style="display: block; font-size: 12px; color: #586171">{{r.title}}</span></span></button></span>
<span role="cell"><span style="{{r.setupStyle}}">{{r.setup}}</span></span>
<span role="cell" style="color: #3F4756; white-space: nowrap">{{r.sched}}</span>
<span role="cell" style="display: flex; align-items: center; gap: 6px; font-weight: 600; white-space: nowrap"><sc-if value="{{r.inBio}}" hint-placeholder-val="{{true}}"><span title="Biometric punch" style="display: flex; color: #1F3A5F">@BIO@</span></sc-if><sc-if value="{{r.inWeb}}" hint-placeholder-val="{{false}}"><span title="Virtual Office clock-in" style="display: flex; color: #0F766E">@WEB@</span></sc-if>{{r.inTime}}<sc-if value="{{r.both}}" hint-placeholder-val="{{false}}"><span title="Also badged in on the biometric" style="display: flex; color: #1F3A5F">@BIO@</span></sc-if></span>
<span role="cell" style="white-space: nowrap; color: #3F4756">{{r.outTime}}</span>
<span role="cell" style="white-space: nowrap; font-weight: 600">{{r.hours}}</span>
<span role="cell"><span style="{{r.chipStyle}}">{{r.chip}}</span></span>
<span role="cell" style="font-size: 12.5px; color: #586171">{{r.note}}</span>
</div></sc-for>
</div>
</div>
<p style="margin: 0; font-size: 12.5px; color: #586171">Not tracked: the Senior Pastor and the 4 agency CEOs (attendance is turned off for leaders in Settings).</p>
</div>
</sc-if>

<sc-if value="{{isEx}}" hint-placeholder-val="{{false}}">
<div style="display: grid; grid-template-columns: minmax(0, 1fr) 340px; gap: 20px; align-items: start">
<div style="display: flex; flex-direction: column; gap: 12px">
<sc-if value="{{noExOpen}}" hint-placeholder-val="{{false}}"><div style="@CARD@; padding: 28px; text-align: center"><p style="margin: 0; font-size: 16px; font-weight: 700">All clear for today</p><p style="margin: 6px 0 0; font-size: 14px; color: #586171">New exceptions appear here as punches come in.</p></div></sc-if>
<sc-for list="{{exOpen}}" as="e" hint-placeholder-count="3"><article style="@CARD@; padding: 16px 18px; display: flex; flex-direction: column; gap: 10px">
<span style="{{e.kindStyle}}; align-self: flex-start">{{e.kind}}</span>
<h3 style="margin: 0; font-size: 16px; font-weight: 700">{{e.title}}</h3>
<p style="margin: 0; font-size: 14px; line-height: 1.5; color: #3F4756">{{e.detail}}</p>
<div style="display: flex; flex-wrap: wrap; align-items: center; gap: 8px; padding-top: 2px">
<sc-if value="{{e.hasSelect}}" hint-placeholder-val="{{false}}"><label style="display: flex; align-items: center; gap: 8px; font-size: 13px; font-weight: 600">Link to<select onChange="{{e.onPick}}" style="height: 34px; padding: 0 8px; border-radius: 8px; border: 1px solid #C9CEC4; background: #FFFFFF; font-family: inherit; font-size: 13px"><option value="kevin">Kevin Lim (new hire, no badge)</option><option value="other">Someone else…</option></select></label></sc-if>
<button type="button" onClick="{{e.doPrimary}}" style="@BTN_P@">{{e.primary}}</button>
<sc-if value="{{e.hasSecondary}}" hint-placeholder-val="{{true}}"><button type="button" onClick="{{e.doSecondary}}" style="@BTN@">{{e.secondary}}</button></sc-if>
</div>
</article></sc-for>
</div>
<aside style="display: flex; flex-direction: column; gap: 12px">
<section style="@CARD@; padding: 16px; display: flex; flex-direction: column; gap: 8px">
<h2 style="margin: 0; font-size: 15px; font-weight: 700">How exceptions are raised</h2>
<ul style="margin: 0; padding-left: 18px; font-size: 13px; line-height: 1.55; color: #3F4756">
<li>Late: first punch after start time plus 5 minutes</li>
<li>No punch: 2 hours after start with no punch and no leave</li>
<li>Missing clock-out: still clocked in 1 hour after shift end</li>
<li>Mismatch: web and biometric clock-ins more than 15 minutes apart</li>
<li>Unlinked badge: a device user ID with no employee attached</li>
</ul>
</section>
<sc-if value="{{hasExDone}}" hint-placeholder-val="{{false}}">
<section style="@CARD@; padding: 16px; display: flex; flex-direction: column; gap: 10px">
<h2 style="margin: 0; font-size: 15px; font-weight: 700">Resolved today</h2>
<sc-for list="{{exDone}}" as="d" hint-placeholder-count="2"><div class="hr-fresh" style="display: flex; gap: 8px; font-size: 13px; line-height: 1.45"><span style="display: flex; flex-shrink: 0; margin-top: 2px; color: #15803D">@CHECK@</span><span><span style="display: block; font-weight: 600">{{d.title}}</span><span style="display: block; color: #586171">{{d.note}}</span></span></div></sc-for>
</section>
</sc-if>
</aside>
</div>
</sc-if>

<sc-if value="{{isCr}}" hint-placeholder-val="{{false}}">
<div style="display: flex; flex-direction: column; gap: 12px; max-width: 900px">
<p style="margin: 0; font-size: 14px; color: #586171">Employees request corrections from their Attendance page. Their manager approves first; HR gives the final approval and the timesheet updates.</p>
<sc-for list="{{corrections}}" as="c" hint-placeholder-count="3"><article style="@CARD@; padding: 16px 18px; display: flex; gap: 14px">
<span style="{{c.avatarStyle}}">{{c.initials}}</span>
<div style="flex-grow: 1; display: flex; flex-direction: column; gap: 6px">
<div style="display: flex; flex-wrap: wrap; align-items: baseline; gap: 4px 12px"><h3 style="margin: 0; font-size: 15px; font-weight: 700">{{c.name}}</h3><span style="font-size: 13px; color: #586171">{{c.date}}</span><span style="{{c.mgrStyle}}">{{c.mgr}}</span></div>
<p style="margin: 0; font-size: 14.5px; font-weight: 600">{{c.ask}}</p>
<p style="margin: 0; font-size: 13.5px; line-height: 1.5; color: #3F4756">“{{c.reason}}”</p>
<sc-if value="{{c.pending}}" hint-placeholder-val="{{true}}"><div style="display: flex; gap: 8px; padding-top: 4px"><button type="button" onClick="{{c.approve}}" style="@BTN_P@">Approve</button><button type="button" onClick="{{c.reject}}" style="@BTN@">Reject</button></div></sc-if>
<sc-if value="{{c.decided}}" hint-placeholder-val="{{false}}"><p class="hr-fresh" style="{{c.decisionStyle}}; margin: 0">{{c.decision}}</p></sc-if>
</div>
</article></sc-for>
</div>
</sc-if>
</main>
</div>

<sc-if value="{{hasSel}}" hint-placeholder-val="{{false}}">
<div style="position: absolute; inset: 0; z-index: 50; background: rgba(15,23,42,0.28)"></div>
<aside class="hr-drawer" role="dialog" aria-modal="true" aria-labelledby="drawer-title" style="position: absolute; top: 0; right: 0; bottom: 0; z-index: 51; width: 440px; box-sizing: border-box; display: flex; flex-direction: column; gap: 18px; padding: 22px 24px; background: #FFFFFF; box-shadow: -16px 0 40px rgba(15,23,42,0.18); overflow-y: auto">
<div style="display: flex; align-items: flex-start; gap: 12px">
<span style="{{sel.avatarStyle}}">{{sel.initials}}</span>
<div style="flex-grow: 1"><h2 id="drawer-title" style="margin: 0; font-size: 19px; font-weight: 700">{{sel.name}}</h2><p style="margin: 2px 0 0; font-size: 13px; color: #586171">{{sel.title}}</p></div>
<button type="button" onClick="{{close}}" aria-label="Close" style="display: flex; align-items: center; justify-content: center; width: 34px; height: 34px; border: 0; border-radius: 8px; background: transparent; color: #586171; cursor: pointer">@X@</button>
</div>
<div style="display: flex; flex-wrap: wrap; gap: 8px; align-items: center"><span style="{{sel.chipStyle}}">{{sel.chip}}</span><span style="font-size: 13px; color: #3F4756">{{sel.setup}}, {{sel.sched}}</span></div>
<section>
<h3 style="margin: 0 0 10px; font-size: 14px; font-weight: 700">Today's punches</h3>
<sc-if value="{{sel.hasEvents}}" hint-placeholder-val="{{true}}"><ol style="margin: 0; padding: 0; list-style: none; display: flex; flex-direction: column">
<sc-for list="{{sel.events}}" as="e" hint-placeholder-count="2"><li style="display: flex; gap: 12px; padding: 10px 0; border-top: 1px solid #ECEEE9"><span style="width: 64px; flex-shrink: 0; font-size: 13.5px; font-weight: 700">{{e.time}}</span><span style="display: flex; flex-shrink: 0; margin-top: 1px"><sc-if value="{{e.bio}}" hint-placeholder-val="{{true}}"><span style="display: flex; color: #1F3A5F">@BIO@</span></sc-if><sc-if value="{{e.web}}" hint-placeholder-val="{{false}}"><span style="display: flex; color: #0F766E">@WEB@</span></sc-if></span><span><span style="display: block; font-size: 13.5px; font-weight: 600">{{e.what}}</span><span style="display: block; font-size: 12.5px; color: #586171">{{e.where}}</span></span></li></sc-for>
</ol></sc-if>
<sc-if value="{{sel.noEvents}}" hint-placeholder-val="{{false}}"><p style="margin: 0; font-size: 13.5px; color: #586171">{{sel.empty}}</p></sc-if>
</section>
<section>
<h3 style="margin: 0 0 10px; font-size: 14px; font-weight: 700">Hours this week</h3>
<div style="display: grid; grid-template-columns: repeat(5, minmax(0, 1fr)); gap: 10px; align-items: end; height: 120px">
<sc-for list="{{sel.bars}}" as="b" hint-placeholder-count="5"><div style="display: flex; flex-direction: column; align-items: center; justify-content: flex-end; gap: 4px; height: 120px"><span style="font-size: 12px; font-weight: 600">{{b.value}}</span><span style="{{b.barStyle}}"></span><span style="font-size: 12px; color: #586171">{{b.label}}</span></div></sc-for>
</div>
</section>
<div style="display: flex; gap: 8px; margin-top: auto">
<button type="button" onClick="{{adjust}}" style="@BTN_P@; flex-grow: 1">Adjust times</button>
<button type="button" onClick="{{addNote}}" style="@BTN@; flex-grow: 1">Add a note</button>
</div>
</aside>
</sc-if>

<sc-if value="{{hasToast}}" hint-placeholder-val="{{false}}">
<div role="status" style="position: absolute; left: 50%; bottom: 28px; z-index: 60; transform: translateX(-50%); padding: 12px 18px; border-radius: 12px; background: #1B2230; color: #FFFFFF; font-size: 14px; font-weight: 500; white-space: nowrap; box-shadow: 0 12px 32px rgba(15,23,42,0.3)">{{toast}}</div>
</sc-if>
</div>''', SIDEBAR=sidebar('Attendance'), TOPBAR=topbar(), CARD=CARD, BTN=BTN, BTN_P=BTN_P, BIO=bio16, WEB=web16,
             CHEVL=svg('chev-l', 16), CHEVR=svg('chev-r', 16), DOWNLOAD=svg('download', 16), CHECK=svg('check', 16), X=svg('x'))
    return page('Attendance, HR view', BASE_CSS, body, HR_JS, {'$preview': {'width': 1440, 'height': 1180}})


# =========================================================== Devices ====

def device_card(name, model, method_icon, method, where, status, status_tone, last, today, enrolled, warn=None):
    dot = {'ok': '#15803D', 'bad': '#BE123C'}[status_tone]
    warn_html = ''
    if warn:
        warn_html = ('<p style="margin: 0; display: flex; gap: 8px; padding: 10px 12px; border-radius: 10px; background: #FDF0DC; color: #7C3F00; font-size: 13px; line-height: 1.45">'
                     '<span style="display: flex; flex-shrink: 0; margin-top: 1px">' + svg('alert', 16) + '</span><span>' + warn + '</span></p>')
    return R('''<article style="@CARD@; padding: 16px 18px; display: flex; flex-direction: column; gap: 12px">
<div style="display: flex; align-items: flex-start; gap: 12px">
<span style="display: flex; align-items: center; justify-content: center; width: 40px; height: 40px; flex-shrink: 0; border-radius: 10px; background: #EEF1F6; color: #1F3A5F">@DEV@</span>
<div style="flex-grow: 1"><h3 style="margin: 0; font-size: 16px; font-weight: 700">@NAME@</h3><p style="margin: 2px 0 0; font-size: 13px; color: #586171">@MODEL@</p></div>
<span style="display: inline-flex; align-items: center; gap: 6px; height: 26px; padding: 0 10px; border-radius: 999px; background: #F1F2EE; font-size: 12.5px; font-weight: 700"><span style="width: 8px; height: 8px; border-radius: 999px; background: @DOT@"></span>@STATUS@</span>
</div>
<dl style="margin: 0; display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 10px">
<div><dt style="font-size: 12px; color: #586171">Connection</dt><dd style="margin: 2px 0 0; display: flex; align-items: center; gap: 6px; font-size: 13.5px; font-weight: 600">@MICON@@METHOD@</dd></div>
<div><dt style="font-size: 12px; color: #586171">Location</dt><dd style="margin: 2px 0 0; font-size: 13.5px; font-weight: 600">@WHERE@</dd></div>
<div><dt style="font-size: 12px; color: #586171">Last punch received</dt><dd style="margin: 2px 0 0; font-size: 13.5px; font-weight: 600">@LAST@</dd></div>
<div><dt style="font-size: 12px; color: #586171">Punches today / enrolled</dt><dd style="margin: 2px 0 0; font-size: 13.5px; font-weight: 600">@TODAY@ / @ENROLLED@</dd></div>
</dl>
@WARN@
<div style="display: flex; gap: 8px"><button type="button" style="@BTN@">Sync now</button><button type="button" style="@BTN@">View punches</button><button type="button" style="@BTN@">Settings</button></div>
</article>''', CARD=CARD, BTN=BTN, DEV=svg('device', 20), NAME=name, MODEL=model, DOT=dot, STATUS=status, MICON=svg(method_icon, 15),
             METHOD=method, WHERE=where, LAST=last, TODAY=today, ENROLLED=enrolled, WARN=warn_html)


def devices_board():
    methods = ''.join(R('''<div style="@CARD@; padding: 16px; display: flex; flex-direction: column; gap: 8px">
<div style="display: flex; align-items: center; gap: 10px"><span style="display: flex; align-items: center; justify-content: center; width: 34px; height: 34px; border-radius: 9px; background: @BG@; color: @FG@">@ICON@</span><h3 style="margin: 0; font-size: 15px; font-weight: 700">@T@</h3></div>
<p style="margin: 0; font-size: 13.5px; line-height: 1.5; color: #3F4756">@D@</p>
<p style="margin: 0; font-size: 12.5px; font-weight: 600; color: @FG@">@TAG@</p>
</div>''', CARD=CARD, BG=bg, FG=fg, ICON=svg(ic, 18), T=t, D=d, TAG=tag) for ic, bg, fg, t, d, tag in [
        ('cloud', '#E6EEFB', '#1E3A8A', 'Cloud push', 'The device sends each punch straight to the Virtual Office over the internet. Most modern terminals support this (often called ADMS, Cloud Server or HTTP push).', 'Real time. Recommended.'),
        ('server', '#E3F1E8', '#14532D', 'Office sync agent', 'A small program on one office PC reads the devices over the office network every minute and uploads new punches. For older units without cloud push.', 'About 1 minute behind.'),
        ('upload', '#FDF0DC', '#7C3F00', 'File import', 'Export the attendance log from the device (USB stick or its software) and upload it here. Works with any brand as a fallback.', 'Manual. Duplicates are skipped.'),
    ])
    mapping_rows = [
        ('0012', 'Maria Santos', 'Fingerprint, face', True), ('0015', 'Carlo Mendoza', 'Fingerprint', True), ('0021', 'Grace Lim', 'Face', True),
        ('0033', 'Jose Reyes', 'Face', True), ('0041', 'Joy Dela Cruz', 'Face', True), ('0047', None, 'Fingerprint', False), ('0052', 'Former employee (deactivated)', 'Fingerprint', None),
    ]
    trs = ''
    for uid, who, how, ok in mapping_rows:
        if ok is True:
            state = '<span style="display: inline-flex; align-items: center; gap: 6px; font-size: 12.5px; font-weight: 700; color: #14532D"><span style="display: flex">' + svg('check', 14) + '</span>Linked</span>'
            person = '<span style="font-weight: 600">' + who + '</span>'
            act = '<button type="button" style="' + BTN + '; height: 30px">Change</button>'
        elif ok is False:
            state = '<span style="display: inline-flex; align-items: center; height: 22px; padding: 0 8px; border-radius: 6px; font-size: 12px; font-weight: 700; background: #FDE4E8; color: #8A1030">Not linked</span>'
            person = '<span style="color: #586171">1 punch today, 8:12 AM</span>'
            act = '<button type="button" style="' + BTN_P + '; height: 30px">' + svg('link', 14) + 'Link to employee</button>'
        else:
            state = '<span style="display: inline-flex; align-items: center; height: 22px; padding: 0 8px; border-radius: 6px; font-size: 12px; font-weight: 700; background: #EEF1EC; color: #3F4756">Remove from device</span>'
            person = '<span style="color: #586171">' + who + '</span>'
            act = '<button type="button" style="' + BTN + '; height: 30px">Remove</button>'
        trs += ('<tr style="border-top: 1px solid #ECEEE9"><td style="padding: 9px 16px; font-weight: 700; font-variant-numeric: tabular-nums">' + uid + '</td>'
                '<td style="padding: 9px 8px">' + person + '</td><td style="padding: 9px 8px; color: #3F4756">' + how + '</td>'
                '<td style="padding: 9px 8px">' + state + '</td><td style="padding: 9px 16px 9px 8px; text-align: right">' + act + '</td></tr>')

    rules = [
        ('Grace period', '5 minutes after scheduled start'),
        ('Duplicate punches', 'Merged when within 2 minutes'),
        ('First and last punch', 'First punch is clock-in, last punch is clock-out; punches in between are breaks'),
        ('Hybrid rule', 'On on-site days, the biometric time counts over a web clock-in'),
        ('Auto clock-out', 'After 14 hours, flagged for HR review'),
        ('Leaders', 'Senior Pastor and agency CEOs are not tracked'),
    ]
    rules_html = ''.join('<div style="display: grid; grid-template-columns: 150px minmax(0, 1fr); gap: 12px; padding: 9px 0; border-top: 1px solid #ECEEE9; font-size: 13.5px"><dt style="font-weight: 700">'
                         + a + '</dt><dd style="margin: 0; color: #3F4756">' + b + '</dd></div>' for a, b in rules)

    body = R('''<div style="position: relative; width: 1440px; height: 1180px; display: grid; grid-template-columns: 248px minmax(0, 1fr); background: #F4F5F1; color: #1B2230; font-family: 'Figtree', system-ui, sans-serif; overflow: hidden">
@SIDEBAR@
<div style="display: flex; flex-direction: column; min-width: 0">
@TOPBAR@
<main id="top" style="display: flex; flex-direction: column; gap: 20px; padding: 22px 32px 28px">
<div style="display: flex; align-items: flex-end; justify-content: space-between; gap: 16px">
<div>
<h1 style="margin: 0; font-size: 28px; font-weight: 700; letter-spacing: -0.01em">Biometric devices</h1>
<p style="margin: 4px 0 0; font-size: 15px; color: #586171">Connect the office terminals so every punch lands in Attendance next to Virtual Office clock-ins.</p>
</div>
<button type="button" style="@BTN_P@; height: 38px">@PLUS@Add a device</button>
</div>

<section aria-labelledby="how" style="display: flex; flex-direction: column; gap: 10px">
<h2 id="how" style="margin: 0; font-size: 16px; font-weight: 700">Three ways to connect, whatever the brand</h2>
<div style="display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 12px">@METHODS@</div>
</section>

<div style="display: grid; grid-template-columns: minmax(0, 1.35fr) minmax(0, 1fr); gap: 20px; align-items: start">
<section aria-labelledby="devs" style="display: flex; flex-direction: column; gap: 12px">
<h2 id="devs" style="margin: 0; font-size: 16px; font-weight: 700">Devices</h2>
@D1@
@D2@
@D3@
</section>
<div style="display: flex; flex-direction: column; gap: 20px">
<section aria-labelledby="imp" style="@CARD@; padding: 16px 18px; display: flex; flex-direction: column; gap: 12px">
<h2 id="imp" style="margin: 0; font-size: 16px; font-weight: 700">Import a log file</h2>
<button type="button" style="display: flex; flex-direction: column; align-items: center; gap: 6px; padding: 22px; border-radius: 12px; border: 2px dashed #C9CEC4; background: #FAFAF7; font-family: inherit; color: #1B2230; cursor: pointer"><span style="display: flex; color: #586171">@UPLOAD@</span><span style="font-size: 14px; font-weight: 700">Drop the device's attendance log here</span><span style="font-size: 12.5px; color: #586171">.dat, .txt, .csv or .xlsx exported by the device or its software</span></button>
<p style="margin: 0; font-size: 13px; color: #586171">Last import: Sep 28 from the Warehouse unit (USB), 212 punches added, 3 duplicates skipped, 1 unknown user ID.</p>
</section>
<section aria-labelledby="rules" style="@CARD@; padding: 16px 18px">
<div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 6px"><h2 id="rules" style="margin: 0; font-size: 16px; font-weight: 700">Attendance rules</h2><button type="button" style="@BTN@; height: 30px">Edit</button></div>
<dl style="margin: 0">@RULES@</dl>
</section>
</div>
</div>

<section aria-labelledby="map" style="@CARD@; overflow: hidden">
<div style="display: flex; align-items: center; justify-content: space-between; gap: 12px; padding: 14px 16px"><div><h2 id="map" style="margin: 0; font-size: 16px; font-weight: 700">Device users and employees</h2><p style="margin: 2px 0 0; font-size: 13px; color: #586171">Each person enrolled on a device has a user ID. Link it once and their punches follow them.</p></div><span style="display: inline-flex; align-items: center; height: 26px; padding: 0 10px; border-radius: 999px; background: #FDE4E8; color: #8A1030; font-size: 12.5px; font-weight: 700">1 not linked</span></div>
<table style="width: 100%; border-collapse: collapse; font-size: 13.5px">
<caption style="position: absolute; width: 1px; height: 1px; overflow: hidden; clip: rect(0 0 0 0)">Device users</caption>
<thead><tr style="text-align: left; font-size: 12px; color: #586171"><th scope="col" style="padding: 8px 16px; font-weight: 600">Device user ID</th><th scope="col" style="padding: 8px; font-weight: 600">Employee</th><th scope="col" style="padding: 8px; font-weight: 600">Enrolled with</th><th scope="col" style="padding: 8px; font-weight: 600">Status</th><th scope="col" style="padding: 8px 16px 8px 8px"><span style="position: absolute; width: 1px; height: 1px; overflow: hidden; clip: rect(0 0 0 0)">Actions</span></th></tr></thead>
<tbody>@TRS@</tbody>
</table>
</section>
</main>
</div>
</div>''', SIDEBAR=sidebar('Biometric devices'), TOPBAR=topbar(), CARD=CARD, BTN=BTN, BTN_P=BTN_P, PLUS=svg('plus', 16), METHODS=methods,
             UPLOAD=svg('upload', 22), RULES=rules_html, TRS=trs,
             D1=device_card('Main entrance terminal', 'Face and fingerprint terminal', 'cloud', 'Cloud push', 'Ground floor lobby', 'Online', 'ok', '10:21 AM, Joy Dela Cruz', '64', '18'),
             D2=device_card('2F Studio terminal', 'Fingerprint terminal', 'server', 'Sync agent on OPS-PC-01', '2nd floor studio', 'Online', 'ok', '9:58 AM (synced 1 min ago)', '11', '9'),
             D3=device_card('Warehouse unit', 'Older fingerprint unit, no network', 'upload', 'File import', 'Warehouse', 'Offline', 'bad', 'Sep 28, via USB import', '—', '6',
                            warn='This unit keeps punches in its own memory. Export the log weekly (or before payroll cutoff) and upload it here.'))
    return page('Biometric devices', BASE_CSS, body, '\nclass Component extends DCLogic {\n  renderVals() {\n    return {};\n  }\n}\n', {'$preview': {'width': 1440, 'height': 1180}})


with open(os.path.join(ROOT, 'HR.dc.html'), 'w') as f:
    f.write(hr_board())
with open(os.path.join(ROOT, 'Devices.dc.html'), 'w') as f:
    f.write(devices_board())
print('ok')
