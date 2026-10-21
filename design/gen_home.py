"""Home.dc.html: role-aware, customizable home dashboard."""
import json, os, sys
sys.path.insert(0, os.path.dirname(__file__))
from gen_pay import R, svg, ICONS, sidebar, FONT, CSS, CARD, BTN, BTN_P  # noqa: E402

ROOT = os.path.join(os.path.dirname(__file__), 'project')

ICONS.update({
    'up': '<path d="M12 19V5M6 11l6-6 6 6"/>',
    'down': '<path d="M12 5v14M6 13l6 6 6-6"/>',
    'grid': '<rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/>',
    'pin': '<path d="M9 4h6l-1 6 4 3H6l4-3z"/><path d="M12 13v7"/>',
    'cake': '<path d="M4 20h16v-7H4z"/><path d="M4 16c2 1 4 1 6 0s4-1 6 0 3 1 4 0"/><path d="M12 9v4M12 5v1"/>',
    'flag': '<path d="M5 21V4h11l-2 4 2 4H5"/>',
})

JS = r'''
class Component extends DCLogic {
  constructor(props) {
    super(props);
    const layouts = {};
    Object.keys(this.users()).forEach((u) => (layouts[u] = this.users()[u].defaults.slice()));
    this.state = {
      user: 'ana',
      layouts: layouts,
      customizing: false,
      clock: { ana: { status: 'in', mins: 142 }, jose: { status: 'in', mins: 149 }, grace: { status: 'break', mins: 126 } },
      tasksDone: { t2: true },
      approvals: {},
      rsvp: {},
      secs: 0,
      toast: null
    };
  }

  componentDidMount() {
    this.timer = setInterval(() => this.setState((s) => ({ secs: s.secs + 1 })), 1000);
  }

  componentWillUnmount() {
    clearInterval(this.timer);
    clearTimeout(this.toastTimer);
  }

  flash(msg) {
    clearTimeout(this.toastTimer);
    this.setState({ toast: msg });
    this.toastTimer = setTimeout(() => this.setState({ toast: null }), 3200);
  }

  peso(n) {
    return '₱' + n.toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }

  users() {
    return {
      ana: { name: 'Ana Cruz', first: 'Ana', title: 'Software Engineer', role: 'Employee', initials: 'AC', hue: 160,
        defaults: ['clock', 'today', 'tasks', 'announce', 'hours', 'payslip', 'leave', 'around'] },
      jose: { name: 'Jose Reyes', first: 'Jose', title: 'Engineering Lead', role: 'Manager', initials: 'JR', hue: 30,
        defaults: ['clock', 'approvals', 'team', 'today', 'tasks', 'announce', 'hours'] },
      grace: { name: 'Grace Lim', first: 'Grace', title: 'HR Specialist', role: 'HR', initials: 'GL', hue: 280,
        defaults: ['clock', 'hrEx', 'payroll', 'approvals', 'team', 'announce', 'today'] },
      pastor: { name: 'Ptr. Joel Santiago', first: 'Ptr. Joel', title: 'Senior Pastor & Founder', role: 'Senior Pastor', initials: 'JS', hue: 210,
        defaults: ['today', 'approvals', 'giving', 'strategy', 'team', 'payroll', 'announce'] },
      rachel: { name: 'Rachel Uy', first: 'Rachel', title: 'CEO, Kingdom Digital', role: 'Agency CEO', initials: 'RU', hue: 340,
        defaults: ['today', 'strategy', 'myGiving', 'announce', 'around', 'celebrate'] }
    };
  }

  /** Widget catalog. `who` lists the roles allowed to add it (permissions, not just defaults). */
  catalog() {
    return {
      clock: { title: 'Time clock', size: 1, who: ['ana', 'jose', 'grace'] },
      today: { title: 'Today', size: 1, who: ['ana', 'jose', 'grace', 'pastor', 'rachel'] },
      tasks: { title: 'My tasks', size: 1, who: ['ana', 'jose', 'grace'] },
      announce: { title: 'Announcements', size: 2, who: ['ana', 'jose', 'grace', 'pastor', 'rachel'] },
      hours: { title: 'My hours this week', size: 1, who: ['ana', 'jose', 'grace'] },
      payslip: { title: 'Next payday', size: 1, who: ['ana', 'jose', 'grace'] },
      leave: { title: 'Leave balance', size: 1, who: ['ana', 'jose', 'grace'] },
      around: { title: 'Who’s around', size: 2, who: ['ana', 'jose', 'grace', 'pastor', 'rachel'] },
      approvals: { title: 'Waiting for you', size: 2, who: ['jose', 'grace', 'pastor'] },
      team: { title: 'Team right now', size: 1, who: ['jose', 'grace', 'pastor'] },
      hrEx: { title: 'Attendance exceptions', size: 1, who: ['grace'] },
      payroll: { title: 'Payroll', size: 1, who: ['grace', 'pastor'] },
      giving: { title: 'Tithes & covenant', size: 2, who: ['pastor'] },
      strategy: { title: 'CEO Strategy Room', size: 1, who: ['pastor', 'rachel'] },
      myGiving: { title: 'My giving', size: 1, who: ['rachel'] },
      celebrate: { title: 'Celebrations', size: 1, who: ['ana', 'jose', 'grace', 'pastor', 'rachel'] }
    };
  }

  attention(u) {
    const st = this.state;
    const open = (ids) => ids.filter((id) => !st.approvals[id]).length;
    const list = {
      ana: [['Your timesheet correction for Sep 29 was approved', 'ok'], ['Payday is in 7 days (Oct 15)', 'info']],
      jose: [[open(['a1', 'a2']) + ' requests from your team need approval', open(['a1', 'a2']) ? 'warn' : 'ok'], ['Nico was 10 min late today (excused)', 'info']],
      grace: [['4 attendance exceptions to resolve', 'warn'], ['Payroll for Oct 1–15 is in HR review, due Oct 13', 'warn'], [open(['a3']) ? '1 leave request waiting for HR' : 'Leave requests are all handled', open(['a3']) ? 'warn' : 'ok']],
      pastor: [[open(['a4']) ? 'Payroll for Oct 1–15 will need your approval' : 'Payroll approved', open(['a4']) ? 'warn' : 'ok'], ['2 agency CEOs are behind on covenant giving', 'warn'], ['CEO Strategy Session on Monday, 3:00 PM', 'info']],
      rachel: [['You’re ahead of your covenant commitment this year', 'ok'], ['Ptr. Joel scheduled a strategy session: Monday, 3:00 PM', 'info']]
    };
    return list[u].map((a, i) => ({
      key: u + i,
      text: a[0],
      dot: 'width: 8px; height: 8px; flex-shrink: 0; border-radius: 999px; background: ' + ({ ok: '#15803D', warn: '#B45309', info: '#2563EB' })[a[1]]
    }));
  }

  data(id, u) {
    const st = this.state;
    const U = this.users()[u];
    const fmt = (m) => Math.floor(m / 60) + ':' + String(Math.floor(m % 60)).padStart(2, '0');
    if (id === 'clock') {
      const c = st.clock[u];
      const live = c.status === 'in' ? c.mins + st.secs / 60 : c.mins;
      const secs = c.status === 'in' ? Math.floor((c.mins * 60 + st.secs) % 60) : 0;
      const set = (status, msg) => () => {
        this.setState((s) => ({ clock: Object.assign({}, s.clock, { [u]: { status: status, mins: status === 'out' ? 0 : live } }) }));
        this.flash(msg);
      };
      return {
        isIn: c.status === 'in', isBreak: c.status === 'break', isOut: c.status === 'out',
        timer: fmt(live) + ':' + String(secs).padStart(2, '0'),
        status: c.status === 'in' ? 'Clocked in at ' + (u === 'jose' ? '7:55 AM (web)' : u === 'grace' ? '7:58 AM (biometric)' : '8:02 AM (web)') : c.status === 'break' ? 'On break since 10:05 AM' : 'Not clocked in',
        shift: 'Shift 8:00 AM – 5:00 PM',
        clockIn: set('in', 'Clocked in. Have a great day.'),
        startBreak: set('break', 'Break started. Your status is On break.'),
        endBreak: set('in', 'Welcome back. Break ended.'),
        clockOut: set('out', 'Clocked out. See you tomorrow.')
      };
    }
    if (id === 'today') {
      const items = {
        ana: [['10:30 AM', 'Release go-live check', 'Huddle room'], ['2:00 PM', 'Code review with Bea', 'Engineering'], ['4:30 PM', 'End-of-day report', 'Due before clock-out']],
        jose: [['10:00 AM', 'Sprint planning (live)', 'Huddle room'], ['1:30 PM', '1:1 with Paolo', 'Focus booth'], ['3:00 PM', 'Client demo prep', 'Board room']],
        grace: [['11:00 AM', 'Onboarding: Kevin Lim', 'Lobby'], ['2:00 PM', 'Payroll review', 'Operations & HR'], ['4:00 PM', 'Interview: Support Associate', 'Huddle room']],
        pastor: [['9:00 AM', 'Morning prayer', 'Senior Pastor’s office'], ['1:00 PM', 'Lunch with Faith Castillo', 'Off-site'], ['3:00 PM', 'Sermon series planning', 'Senior Pastor’s office']],
        rachel: [['9:30 AM', 'Kingdom Digital stand-up', 'Your agency'], ['2:00 PM', 'Mentoring call with Ben Ocampo', 'Break Room'], ['Mon 3:00 PM', 'CEO Strategy Session', 'CEO Strategy Room']]
      }[u];
      return { items: items.map((x, i) => ({ key: u + 't' + i, time: x[0], what: x[1], where: x[2] })) };
    }
    if (id === 'tasks') {
      const T = { ana: [['t1', 'Fix login timeout bug'], ['t2', 'Review Bea’s pull request'], ['t3', 'Write release notes for 10:30']], jose: [['t4', 'Approve Q4 sprint scope'], ['t5', 'Prepare demo for client'], ['t6', 'Paolo’s 1:1 notes']], grace: [['t7', 'Prepare Kevin’s onboarding kit'], ['t8', 'Link badge 0047'], ['t9', 'Post Support Associate opening']] }[u];
      const items = T.map((t) => ({
        key: t[0], label: t[1], done: !!st.tasksDone[t[0]], checked: st.tasksDone[t[0]] ? 'true' : 'false',
        boxStyle: 'display: flex; align-items: center; justify-content: center; width: 20px; height: 20px; flex-shrink: 0; border-radius: 6px; ' + (st.tasksDone[t[0]] ? 'background: #15803D; color: #FFFFFF' : 'border: 2px solid #9AA39A'),
        labelStyle: 'font-size: 14px; ' + (st.tasksDone[t[0]] ? 'text-decoration: line-through; color: #586171' : 'color: #1B2230'),
        toggle: () => this.setState((s) => ({ tasksDone: Object.assign({}, s.tasksDone, { [t[0]]: !s.tasksDone[t[0]] }) }))
      }));
      return { items: items, left: items.filter((i) => !i.done).length + ' of ' + items.length + ' left' };
    }
    if (id === 'announce') {
      return { items: [
        { key: 'n1', who: 'Ptr. Joel Santiago', when: 'Pinned, Oct 6', text: 'Thanksgiving service this Sunday at 4 PM. All teams and agency partners are welcome. Dinner follows in the Break Room.' },
        { key: 'n2', who: 'Grace Lim, HR', when: 'Pinned, Oct 2', text: 'October 15 payroll cutoff: submit timesheet corrections by Oct 13. Biometric badges for new hires are ready at the Lobby.' }
      ] };
    }
    if (id === 'hours') {
      const v = { ana: [8.8, 9.0, 9.0, 8.7], jose: [9.2, 9.0, 8.4, 9.1], grace: [9.0, 8.9, 9.0, 9.0] }[u];
      const live = st.clock[u] && st.clock[u].status === 'in' ? (st.clock[u].mins + st.secs / 60) / 60 : (st.clock[u] ? st.clock[u].mins / 60 : 0);
      const all = v.concat([live]);
      const total = all.reduce((a, b) => a + b, 0);
      return {
        total: (Math.round(total * 10) / 10) + ' hrs',
        bars: ['Mon', 'Tue', 'Wed', 'Thu', 'Today'].map((d, i) => ({
          key: u + d, d: d, v: (Math.round(all[i] * 10) / 10) + 'h',
          bar: 'display: block; width: 100%; border-radius: 4px 4px 0 0; height: ' + Math.max(4, Math.round((all[i] / 10) * 70)) + 'px; background: ' + (i === 4 ? '#2563EB' : '#9DB5E0')
        }))
      };
    }
    if (id === 'payslip') {
      const net = { ana: 22015.9, jose: 40113.09, grace: 11771.3 }[u];
      return { net: this.peso(net), note: 'Estimated take-home for Oct 1–15, paid Oct 15', last: 'Last payslip: Sep 30, ' + this.peso(net * 0.998) };
    }
    if (id === 'leave') {
      return { items: [['Vacation leave', '8.5 days'], ['Sick leave', '6 days'], ['Service incentive leave', '5 days']].map((x) => ({ key: x[0], label: x[0], v: x[1] })),
        next: u === 'ana' ? 'Upcoming: Dec 22–26 (approved)' : 'No upcoming leave',
        file: () => this.flash('Opening the leave request form…') };
    }
    if (id === 'around') {
      return { rooms: [['Engineering', 4, '#15803D'], ['Huddle room', 3, '#6D28D9'], ['Sales', 2, '#15803D'], ['Break Room', 2, '#B45309'], ['Lobby', 2, '#15803D'], ['Senior Pastor’s office', 1, '#15803D']].map((r) => ({ key: r[0], name: r[0], n: r[1] + (r[1] === 1 ? ' person' : ' people'), dot: 'width: 8px; height: 8px; border-radius: 999px; background: ' + r[2] })),
        summary: '16 in the office, 2 offline', go: () => this.flash('Opening the Office Floor…') };
    }
    if (id === 'approvals') {
      const A = {
        jose: [['a1', 'Bea Villanueva', 'Timesheet correction', 'Add clock-out 5:10 PM on Sep 29'], ['a2', 'Paolo Aquino', 'Vacation leave', 'Oct 20–21 (2 days)']],
        grace: [['a3', 'Ryan Torres', 'Timesheet correction', 'Clock-in 7:58 AM on Sep 30 (manager pending)'], ['a5', 'Joy Dela Cruz', 'Sick leave', 'Oct 7 (1 day), medical certificate attached']],
        pastor: [['a4', 'Payroll Oct 1–15', 'Approve and release pay', '15 people, net ₱292,745.78, after HR review'], ['a6', 'Maria Santos', 'Budget request', 'Thanksgiving dinner, ₱35,000']]
      }[u];
      const items = A.filter((a) => !st.approvals[a[0]]).map((a) => ({
        key: a[0], who: a[1], kind: a[2], detail: a[3],
        approve: () => { this.setState((s) => ({ approvals: Object.assign({}, s.approvals, { [a[0]]: 'ok' }) })); this.flash('Approved: ' + a[2] + ' for ' + a[1] + '.'); },
        reject: () => { this.setState((s) => ({ approvals: Object.assign({}, s.approvals, { [a[0]]: 'no' }) })); this.flash('Declined. ' + a[1] + ' was notified.'); }
      }));
      return { items: items, any: items.length > 0, none: items.length === 0 };
    }
    if (id === 'team') {
      const T = {
        jose: { label: 'Engineering', rows: [['In', '6'], ['Late today', '1 (Nico, excused)'], ['Away', '1 (Emily, off shift)'], ['On leave', '0']] },
        grace: { label: 'Whole company', rows: [['Working now', '14'], ['Late today', '4'], ['No punch yet', '1'], ['On leave', '1 (Sam)']] },
        pastor: { label: 'Whole company', rows: [['Working now', '14'], ['In meetings', '3'], ['On break', '2'], ['On leave', '1']] }
      }[u];
      return { label: T.label, rows: T.rows.map((r) => ({ key: r[0], k: r[0], v: r[1] })) };
    }
    if (id === 'hrEx') {
      return { rows: [['Unlinked badge', '1'], ['Missing clock-out', '1'], ['Web and biometric mismatch', '1'], ['Late, to review', '1']].map((r) => ({ key: r[0], k: r[0], v: r[1] })), go: () => this.flash('Opening Attendance exceptions…') };
    }
    if (id === 'payroll') {
      const approved = !!st.approvals.a4;
      return { stage: approved ? 'Approved, releasing Oct 15' : 'HR review', net: '₱292,745.78', people: '15 people', due: approved ? 'Bank file ready' : u === 'pastor' ? 'Comes to you after HR review' : 'Send to Ptr. Joel by Oct 13',
        go: () => this.flash('Opening Payroll…') };
    }
    if (id === 'giving') {
      return { tithes: '₱4,658,000', cov: '₱2,400,000', covPct: '101% of commitments', rows: [['Rachel Uy', 'Ahead', '#14532D'], ['Faith Castillo', 'On track', '#14532D'], ['Andrew Tan', 'Behind', '#7C3F00'], ['Ben Ocampo', 'Behind', '#7C3F00']].map((r) => ({ key: r[0], name: r[0], s: r[1], style: 'font-size: 12.5px; font-weight: 700; color: ' + r[2] })),
        go: () => this.flash('Opening Tithes & covenant giving…') };
    }
    if (id === 'strategy') {
      const going = !!st.rsvp[u];
      return { when: 'Monday, Oct 12, 3:00 PM', title: 'CEO Strategy Session: 2027 vision', who: '4 agency CEOs invited', isPastor: u === 'pastor', notPastor: u !== 'pastor', going: going, notGoing: !going,
        summon: () => this.flash('Summoning the agency CEOs to the CEO Strategy Room…'),
        accept: () => { this.setState((s) => ({ rsvp: Object.assign({}, s.rsvp, { [u]: true }) })); this.flash('You’re going. It’s on your calendar.'); } };
    }
    if (id === 'myGiving') {
      return { tithe: '₱1,125,000', titheNote: '104% of tithe due this year', cov: '₱800,000', covNote: 'Harvest level, 119% of commitment',
        give: () => this.flash('Opening giving: bank transfer or GCash details…') };
    }
    if (id === 'celebrate') {
      return { items: [['Kim Navarro', '3 years at Covenant Creators, Oct 9'], ['Carlo Mendoza', 'Birthday, Oct 11'], ['Kevin Lim', 'Joined this week']].map((x) => ({ key: x[0], who: x[0], what: x[1] })) };
    }
    return {};
  }

  renderVals() {
    const st = this.state;
    const UU = this.users();
    const u = st.user;
    const U = UU[u];
    const CAT = this.catalog();
    const layout = st.layouts[u];
    const setLayout = (next) => this.setState((s) => ({ layouts: Object.assign({}, s.layouts, { [u]: next }) }));

    const widgets = layout.map((id, i) => {
      const w = CAT[id];
      const is = {};
      Object.keys(CAT).forEach((k) => (is[k] = k === id));
      return {
        key: u + id,
        title: w.title,
        is: is,
        d: this.data(id, u),
        cardStyle: 'grid-column: span ' + w.size + ' / span ' + w.size + '; ' + 'background: #FFFFFF; border: 1px ' + (st.customizing ? 'dashed #9DB5E0' : 'solid #DCDFD8') + '; border-radius: 14px; padding: 16px 18px; display: flex; flex-direction: column; gap: 12px; min-height: 150px',
        canUp: i > 0,
        canDown: i < layout.length - 1,
        up: () => { const n = layout.slice(); [n[i - 1], n[i]] = [n[i], n[i - 1]]; setLayout(n); },
        down: () => { const n = layout.slice(); [n[i + 1], n[i]] = [n[i], n[i + 1]]; setLayout(n); },
        remove: () => { setLayout(layout.filter((x) => x !== id)); this.flash(w.title + ' hidden. Add it back any time.'); }
      };
    });

    const available = Object.keys(CAT).filter((k) => CAT[k].who.includes(u) && !layout.includes(k)).map((k) => ({
      key: k, title: CAT[k].title, add: () => { setLayout(layout.concat([k])); this.flash(CAT[k].title + ' added to your home screen.'); }
    }));

    const people = Object.keys(UU).map((k) => {
      const on = k === u;
      return { key: k, label: UU[k].first, role: UU[k].role, pressed: on ? 'true' : 'false',
        style: 'display: flex; flex-direction: column; align-items: flex-start; justify-content: center; height: 40px; padding: 0 12px; border-radius: 8px; border: 0; font-family: inherit; cursor: pointer; line-height: 1.15; ' + (on ? 'background: #FFFFFF; color: #1B2230; box-shadow: 0 1px 2px rgba(27,34,48,0.14)' : 'background: transparent; color: #586171'),
        pick: () => this.setState({ user: k, customizing: false }) };
    });

    const greet = U.first === 'Ptr. Joel' ? 'Good morning, Ptr. Joel.' : 'Good morning, ' + U.first + '.';
    const recommended = JSON.stringify(layout) === JSON.stringify(U.defaults);

    return {
      widgets: widgets,
      available: available,
      hasAvailable: available.length > 0,
      noAvailable: available.length === 0,
      people: people,
      greet: greet,
      meName: U.name,
      meRole: U.title,
      meInitials: U.initials,
      meAvatar: 'display: flex; align-items: center; justify-content: center; width: 32px; height: 32px; border-radius: 999px; font-size: 12px; font-weight: 700; background: hsl(' + U.hue + ' 55% 88%); color: hsl(' + U.hue + ' 60% 24%)',
      attention: this.attention(u),
      layoutNote: recommended ? 'Recommended for ' + U.role.toLowerCase() + 's' : 'Customized by ' + U.first,
      customizing: st.customizing,
      notCustomizing: !st.customizing,
      startCustomize: () => this.setState({ customizing: true }),
      doneCustomize: () => { this.setState({ customizing: false }); this.flash('Saved. This layout is only for ' + U.first + '.'); },
      reset: () => { setLayout(U.defaults.slice()); this.flash('Back to the recommended layout for ' + U.role.toLowerCase() + 's.'); },
      hasToast: !!st.toast,
      toast: st.toast || ''
    };
  }
}
'''

W = {}
W['clock'] = '''<div style="display: flex; align-items: center; gap: 10px"><span class="num" style="font-size: 34px; font-weight: 700; letter-spacing: -0.01em">{{w.d.timer}}</span></div>
<p style="margin: 0; font-size: 13px; color: #586171">{{w.d.status}}. {{w.d.shift}}</p>
<div style="display: flex; flex-wrap: wrap; gap: 8px">
<sc-if value="{{w.d.isOut}}" hint-placeholder-val="{{false}}"><button type="button" onClick="{{w.d.clockIn}}" style="@BTN_P@; height: 44px; padding: 0 20px; font-size: 15px">@CLOCK@Clock in</button></sc-if>
<sc-if value="{{w.d.isIn}}" hint-placeholder-val="{{true}}"><button type="button" onClick="{{w.d.startBreak}}" style="@BTN@; height: 44px">Start break</button><button type="button" onClick="{{w.d.clockOut}}" style="@BTN@; height: 44px">Clock out</button></sc-if>
<sc-if value="{{w.d.isBreak}}" hint-placeholder-val="{{false}}"><button type="button" onClick="{{w.d.endBreak}}" style="@BTN_P@; height: 44px">End break</button></sc-if>
</div>'''
W['today'] = '''<ul style="margin: 0; padding: 0; list-style: none; display: flex; flex-direction: column">
<sc-for list="{{w.d.items}}" as="t" hint-placeholder-count="3"><li style="display: grid; grid-template-columns: 82px minmax(0, 1fr); gap: 10px; padding: 8px 0; border-top: 1px solid #ECEEE9"><span style="font-size: 13px; font-weight: 700">{{t.time}}</span><span><span style="display: block; font-size: 14px; font-weight: 600">{{t.what}}</span><span style="display: block; font-size: 12.5px; color: #586171">{{t.where}}</span></span></li></sc-for>
</ul>'''
W['tasks'] = '''<p style="margin: -6px 0 0; font-size: 12.5px; color: #586171">{{w.d.left}}</p>
<ul style="margin: 0; padding: 0; list-style: none; display: flex; flex-direction: column; gap: 4px">
<sc-for list="{{w.d.items}}" as="t" hint-placeholder-count="3"><li><button type="button" role="checkbox" aria-checked="{{t.checked}}" onClick="{{t.toggle}}" style="display: flex; align-items: center; gap: 10px; width: 100%; min-height: 36px; padding: 4px 2px; border: 0; background: transparent; font-family: inherit; text-align: left; cursor: pointer"><span style="{{t.boxStyle}}"><sc-if value="{{t.done}}" hint-placeholder-val="{{false}}">@CHECK@</sc-if></span><span style="{{t.labelStyle}}">{{t.label}}</span></button></li></sc-for>
</ul>'''
W['announce'] = '''<sc-for list="{{w.d.items}}" as="n" hint-placeholder-count="2"><article style="display: flex; gap: 12px; padding: 12px 14px; border-radius: 12px; background: #F7F8F5"><span style="display: flex; flex-shrink: 0; margin-top: 2px; color: #1F3A5F">@PIN@</span><div><p style="margin: 0; font-size: 14px; line-height: 1.5">{{n.text}}</p><p style="margin: 4px 0 0; font-size: 12.5px; color: #586171">{{n.who}}, {{n.when}}</p></div></article></sc-for>'''
W['hours'] = '''<p style="margin: -6px 0 0; font-size: 22px; font-weight: 700">{{w.d.total}}</p>
<div style="display: grid; grid-template-columns: repeat(5, minmax(0, 1fr)); gap: 8px; align-items: end; height: 108px">
<sc-for list="{{w.d.bars}}" as="b" hint-placeholder-count="5"><div style="display: flex; flex-direction: column; align-items: center; justify-content: flex-end; gap: 4px; height: 108px"><span class="num" style="font-size: 11.5px; font-weight: 600">{{b.v}}</span><span style="{{b.bar}}"></span><span style="font-size: 11.5px; color: #586171">{{b.d}}</span></div></sc-for>
</div>'''
W['payslip'] = '''<p class="num" style="margin: 0; font-size: 28px; font-weight: 700; color: #14532D">{{w.d.net}}</p>
<p style="margin: 0; font-size: 13px; color: #3F4756">{{w.d.note}}</p>
<p style="margin: 0; font-size: 12.5px; color: #586171">{{w.d.last}}</p>'''
W['leave'] = '''<dl style="margin: 0; display: grid; grid-template-columns: minmax(0, 1fr) auto; gap: 6px 10px; font-size: 14px">
<sc-for list="{{w.d.items}}" as="l" hint-placeholder-count="3"><dt style="color: #3F4756">{{l.label}}</dt><dd style="margin: 0; font-weight: 700">{{l.v}}</dd></sc-for>
</dl>
<p style="margin: 0; font-size: 12.5px; color: #586171">{{w.d.next}}</p>
<button type="button" onClick="{{w.d.file}}" style="@BTN@; align-self: flex-start">File leave</button>'''
W['around'] = '''<p style="margin: -6px 0 0; font-size: 13px; color: #586171">{{w.d.summary}}</p>
<div style="display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 8px">
<sc-for list="{{w.d.rooms}}" as="r" hint-placeholder-count="6"><div style="display: flex; align-items: center; gap: 8px; padding: 10px 12px; border-radius: 10px; background: #F7F8F5"><span style="{{r.dot}}"></span><span style="flex-grow: 1; min-width: 0; font-size: 13.5px; font-weight: 600; white-space: nowrap; overflow: hidden; text-overflow: ellipsis">{{r.name}}</span><span style="font-size: 12.5px; color: #586171; white-space: nowrap">{{r.n}}</span></div></sc-for>
</div>
<button type="button" onClick="{{w.d.go}}" style="@BTN@; align-self: flex-start">@BUILDING@Go to the Office Floor</button>'''
W['approvals'] = '''<sc-if value="{{w.d.none}}" hint-placeholder-val="{{false}}"><p style="margin: 0; padding: 14px; border-radius: 10px; background: #E3F1E8; color: #14532D; font-size: 14px; font-weight: 600">All caught up. Nothing is waiting for you.</p></sc-if>
<sc-for list="{{w.d.items}}" as="a" hint-placeholder-count="2"><div class="fresh" style="display: flex; align-items: center; gap: 12px; padding: 10px 12px; border-radius: 12px; border: 1px solid #ECEEE9"><div style="flex-grow: 1; min-width: 0"><p style="margin: 0; font-size: 14px"><span style="font-weight: 700">{{a.who}}</span> <span style="color: #586171">{{a.kind}}</span></p><p style="margin: 2px 0 0; font-size: 13px; color: #3F4756">{{a.detail}}</p></div><button type="button" onClick="{{a.reject}}" style="@BTN@">Decline</button><button type="button" onClick="{{a.approve}}" style="@BTN_P@">Approve</button></div></sc-for>'''
KV = '''<dl style="margin: 0; display: grid; grid-template-columns: minmax(0, 1fr) auto; gap: 8px 10px; font-size: 14px">
<sc-for list="{{w.d.rows}}" as="r" hint-placeholder-count="4"><dt style="color: #3F4756">{{r.k}}</dt><dd style="margin: 0; font-weight: 700; text-align: right">{{r.v}}</dd></sc-for>
</dl>'''
W['team'] = '<p style="margin: -6px 0 0; font-size: 12.5px; color: #586171">{{w.d.label}}</p>\n' + KV
W['hrEx'] = KV + '\n<button type="button" onClick="{{w.d.go}}" style="@BTN@; align-self: flex-start">Review exceptions</button>'
W['payroll'] = '''<p style="margin: 0; font-size: 13px; color: #586171">Oct 1 – 15, pay date Oct 15</p>
<p style="margin: 0; display: flex; align-items: center; gap: 8px"><span style="display: inline-flex; align-items: center; height: 26px; padding: 0 10px; border-radius: 999px; background: #E6EEFB; color: #1E3A8A; font-size: 12.5px; font-weight: 700">{{w.d.stage}}</span><span style="font-size: 13px; color: #586171">{{w.d.people}}</span></p>
<p class="num" style="margin: 0; font-size: 22px; font-weight: 700">{{w.d.net}} <span style="font-size: 13px; font-weight: 500; color: #586171">net</span></p>
<p style="margin: 0; font-size: 12.5px; color: #586171">{{w.d.due}}</p>
<button type="button" onClick="{{w.d.go}}" style="@BTN@; align-self: flex-start">Open payroll</button>'''
W['giving'] = '''<div style="display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)) minmax(0, 1.3fr); gap: 14px; align-items: start">
<div><p style="margin: 0; font-size: 13px; color: #586171">Tithes this year</p><p class="num" style="margin: 2px 0 0; font-size: 22px; font-weight: 700; color: #1F3A5F">{{w.d.tithes}}</p></div>
<div><p style="margin: 0; font-size: 13px; color: #586171">Covenant giving</p><p class="num" style="margin: 2px 0 0; font-size: 22px; font-weight: 700; color: #7A5200">{{w.d.cov}}</p><p style="margin: 2px 0 0; font-size: 12.5px; color: #586171">{{w.d.covPct}}</p></div>
<ul style="margin: 0; padding: 0; list-style: none; display: flex; flex-direction: column; gap: 6px"><sc-for list="{{w.d.rows}}" as="r" hint-placeholder-count="4"><li style="display: flex; justify-content: space-between; gap: 8px; font-size: 13.5px"><span>{{r.name}}</span><span style="{{r.style}}">{{r.s}}</span></li></sc-for></ul>
</div>
<div style="display: flex; align-items: center; justify-content: space-between; gap: 10px"><span style="display: flex; align-items: center; gap: 6px; font-size: 12.5px; color: #586171">@LOCK@Only you and the finance steward see this</span><button type="button" onClick="{{w.d.go}}" style="@BTN@">Open giving</button></div>'''
W['strategy'] = '''<p style="margin: 0; font-size: 15px; font-weight: 700">{{w.d.title}}</p>
<p style="margin: 0; font-size: 13px; color: #3F4756">{{w.d.when}}. {{w.d.who}}.</p>
<sc-if value="{{w.d.isPastor}}" hint-placeholder-val="{{false}}"><button type="button" onClick="{{w.d.summon}}" style="display: inline-flex; align-items: center; gap: 6px; align-self: flex-start; height: 38px; padding: 0 14px; border-radius: 9px; border: 1px solid #92400E; background: #92400E; color: #FFFFFF; font-family: inherit; font-size: 13.5px; font-weight: 700; cursor: pointer">@BELL@Summon CEOs now</button></sc-if>
<sc-if value="{{w.d.notPastor}}" hint-placeholder-val="{{true}}"><sc-if value="{{w.d.notGoing}}" hint-placeholder-val="{{true}}"><button type="button" onClick="{{w.d.accept}}" style="@BTN_P@; align-self: flex-start">I’ll be there</button></sc-if><sc-if value="{{w.d.going}}" hint-placeholder-val="{{false}}"><p class="fresh" style="margin: 0; font-size: 13.5px; font-weight: 700; color: #14532D">You’re going</p></sc-if></sc-if>'''
W['myGiving'] = '''<div><p style="margin: 0; font-size: 13px; color: #586171">Tithe this year</p><p class="num" style="margin: 2px 0 0; font-size: 20px; font-weight: 700; color: #1F3A5F">{{w.d.tithe}}</p><p style="margin: 2px 0 0; font-size: 12.5px; color: #586171">{{w.d.titheNote}}</p></div>
<div><p style="margin: 0; font-size: 13px; color: #586171">Covenant giving</p><p class="num" style="margin: 2px 0 0; font-size: 20px; font-weight: 700; color: #7A5200">{{w.d.cov}}</p><p style="margin: 2px 0 0; font-size: 12.5px; color: #586171">{{w.d.covNote}}</p></div>
<button type="button" onClick="{{w.d.give}}" style="@BTN@; align-self: flex-start">Give</button>'''
W['celebrate'] = '''<ul style="margin: 0; padding: 0; list-style: none; display: flex; flex-direction: column; gap: 10px">
<sc-for list="{{w.d.items}}" as="c" hint-placeholder-count="3"><li style="display: flex; gap: 10px; align-items: flex-start"><span style="display: flex; flex-shrink: 0; color: #BE185D">@CAKE@</span><span><span style="display: block; font-size: 14px; font-weight: 600">{{c.who}}</span><span style="display: block; font-size: 12.5px; color: #586171">{{c.what}}</span></span></li></sc-for>
</ul>'''


def body():
    blocks = '\n'.join('<sc-if value="{{w.is.%s}}" hint-placeholder-val="{{false}}">\n%s\n</sc-if>' % (k, v) for k, v in W.items())
    ctrl = ('<sc-if value="{{customizing}}" hint-placeholder-val="{{false}}"><span style="display: flex; gap: 4px">'
            '<sc-if value="{{w.canUp}}" hint-placeholder-val="{{true}}"><button type="button" onClick="{{w.up}}" aria-label="Move up" title="Move up" style="' + BTN + '; width: 32px; height: 32px; padding: 0">' + svg('up', 15) + '</button></sc-if>'
            '<sc-if value="{{w.canDown}}" hint-placeholder-val="{{true}}"><button type="button" onClick="{{w.down}}" aria-label="Move down" title="Move down" style="' + BTN + '; width: 32px; height: 32px; padding: 0">' + svg('down', 15) + '</button></sc-if>'
            '<button type="button" onClick="{{w.remove}}" aria-label="Hide this widget" title="Hide" style="' + BTN + '; width: 32px; height: 32px; padding: 0">' + svg('x', 15) + '</button>'
            '</span></sc-if>')
    return R('''<div id="top" style="position: relative; width: 1440px; height: 1240px; display: grid; grid-template-columns: 248px minmax(0, 1fr); background: #F4F5F1; color: #1B2230; font-family: 'Figtree', system-ui, sans-serif; overflow: hidden">
@SIDEBAR@
<div style="display: flex; flex-direction: column; min-width: 0">
<header style="height: 64px; flex-shrink: 0; display: flex; align-items: center; gap: 22px; padding: 0 32px; border-bottom: 1px solid #DCDFD8">
<span style="font-size: 14px"><span style="font-weight: 700">10:24 AM</span> <span style="color: #586171">Manila</span></span>
<span style="font-size: 14px"><span style="font-weight: 700">10:24 PM</span> <span style="color: #586171">New York</span></span>
<span style="flex-grow: 1"></span>
<span style="font-size: 12.5px; color: #586171">Preview as</span>
<div style="display: flex; gap: 3px; padding: 3px; background: #E6E9E2; border-radius: 10px"><sc-for list="{{people}}" as="p" hint-placeholder-count="5"><button type="button" onClick="{{p.pick}}" aria-pressed="{{p.pressed}}" style="{{p.style}}"><span style="font-size: 13px; font-weight: 700">{{p.label}}</span><span style="font-size: 11px; font-weight: 500">{{p.role}}</span></button></sc-for></div>
<span style="display: flex; align-items: center; gap: 10px"><span style="{{meAvatar}}">{{meInitials}}</span><span style="display: flex; flex-direction: column; line-height: 1.2"><span style="font-size: 14px; font-weight: 600">{{meName}}</span><span style="font-size: 12px; color: #586171">{{meRole}}</span></span></span>
</header>
<main style="display: flex; flex-direction: column; gap: 18px; padding: 24px 32px 28px">
<div style="display: flex; align-items: flex-end; justify-content: space-between; gap: 16px">
<div><p style="margin: 0; font-size: 14px; color: #586171">Thursday, October 8</p><h1 style="margin: 4px 0 0; font-size: 30px; font-weight: 700; letter-spacing: -0.01em">{{greet}}</h1></div>
<div style="display: flex; align-items: center; gap: 10px">
<span style="font-size: 12.5px; color: #586171">{{layoutNote}}</span>
<sc-if value="{{notCustomizing}}" hint-placeholder-val="{{true}}"><button type="button" onClick="{{startCustomize}}" style="@BTN@">@GRID@Customize</button></sc-if>
<sc-if value="{{customizing}}" hint-placeholder-val="{{false}}"><button type="button" onClick="{{reset}}" style="@BTN@">Reset to recommended</button><button type="button" onClick="{{doneCustomize}}" style="@BTN_P@">Done</button></sc-if>
</div>
</div>

<section aria-label="Needs your attention" style="display: flex; flex-wrap: wrap; gap: 8px">
<sc-for list="{{attention}}" as="a" hint-placeholder-count="3"><span class="fresh" style="display: inline-flex; align-items: center; gap: 8px; min-height: 36px; padding: 6px 14px; border-radius: 999px; background: #FFFFFF; border: 1px solid #DCDFD8; font-size: 13.5px; font-weight: 600"><span style="{{a.dot}}"></span>{{a.text}}</span></sc-for>
</section>

<sc-if value="{{customizing}}" hint-placeholder-val="{{false}}">
<section aria-label="Add widgets" class="fresh" style="@CARD@; padding: 14px 16px; display: flex; flex-wrap: wrap; align-items: center; gap: 8px; border-color: #9DB5E0; background: #F3F7FF">
<span style="font-size: 14px; font-weight: 700; margin-right: 6px">Add to your home</span>
<sc-for list="{{available}}" as="v" hint-placeholder-count="3"><button type="button" onClick="{{v.add}}" style="@BTN@">@PLUS@{{v.title}}</button></sc-for>
<sc-if value="{{noAvailable}}" hint-placeholder-val="{{false}}"><span style="font-size: 13.5px; color: #586171">Everything you can see is already on your home screen.</span></sc-if>
<span style="flex-basis: 100%; font-size: 12.5px; color: #586171">Only widgets your role is allowed to see appear here. Use the arrows to reorder and the X to hide.</span>
</section>
</sc-if>

<div style="display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 14px; align-items: start">
<sc-for list="{{widgets}}" as="w" hint-placeholder-count="6"><section aria-label="{{w.title}}" style="{{w.cardStyle}}">
<div style="display: flex; align-items: center; justify-content: space-between; gap: 8px; min-height: 32px"><h2 style="margin: 0; font-size: 15.5px; font-weight: 700">{{w.title}}</h2>@CTRL@</div>
@BLOCKS@
</section></sc-for>
</div>
</main>
</div>
<sc-if value="{{hasToast}}" hint-placeholder-val="{{false}}">
<div role="status" style="position: absolute; left: 50%; bottom: 28px; z-index: 60; transform: translateX(-50%); padding: 12px 18px; border-radius: 12px; background: #1B2230; color: #FFFFFF; font-size: 14px; font-weight: 500; white-space: nowrap; box-shadow: 0 12px 32px rgba(15,23,42,0.3)">{{toast}}</div>
</sc-if>
</div>''', SIDEBAR=sidebar('Home'), CARD=CARD, BTN=BTN, BTN_P=BTN_P, CTRL=ctrl, BLOCKS=blocks,
             GRID=svg('grid', 16), PLUS=svg('plus', 15)).replace('@BTN_P@', BTN_P).replace('@BTN@', BTN).replace(
        '@CLOCK@', svg('clock', 18)).replace('@CHECK@', svg('check', 14)).replace('@PIN@', svg('pin', 16)).replace(
        '@BUILDING@', svg('building', 16)).replace('@LOCK@', svg('lock', 14)).replace('@BELL@', svg('bell', 15)).replace('@CAKE@', svg('cake', 16))


html = ('<!doctype html>\n<html lang="en">\n<head>\n<meta charset="utf-8">\n<title>Home dashboard</title>\n'
        '<script src="./support.js"></script>\n</head>\n<body>\n<x-dc>\n<helmet>\n' + FONT + '<style>' + CSS + '</style>\n</helmet>\n'
        + body() + '\n</x-dc>\n<script type="text/x-dc" data-dc-script data-props=\'' + json.dumps({'$preview': {'width': 1440, 'height': 1240}}) + '\'>'
        + JS + '</script>\n</body>\n</html>\n')
html = html.replace('\\u2013', '–').replace('\\u2019', '’')
with open(os.path.join(ROOT, 'Home.dc.html'), 'w') as f:
    f.write(html)
print('ok', len(html))
