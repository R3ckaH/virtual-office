"""Payroll.dc.html (PH payroll run) and Giving.dc.html (tithes & covenant giving monitor)."""
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
    'chart': '<path d="M4 20V10M10 20V4M16 20v-7M22 20H2"/>',
    'network': '<rect x="9" y="3" width="6" height="5" rx="1"/><rect x="3" y="16" width="6" height="5" rx="1"/><rect x="15" y="16" width="6" height="5" rx="1"/><path d="M12 8v4M6 16v-2h12v2"/>',
    'wallet': '<rect x="3" y="6" width="18" height="14" rx="2"/><path d="M3 10h18M16 15h2"/>',
    'heart': '<path d="M12 20s-7-4.4-7-10a4 4 0 0 1 7-2.6A4 4 0 0 1 19 10c0 5.6-7 10-7 10z"/>',
    'x': '<path d="M6 6l12 12M18 6L6 18"/>',
    'check': '<path d="M5 12l5 5 9-10"/>',
    'download': '<path d="M12 4v12M7 11l5 5 5-5"/><path d="M4 16v3a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-3"/>',
    'lock': '<rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/>',
    'alert': '<path d="M12 3l10 18H2z"/><path d="M12 10v5M12 18h.01"/>',
    'plus': '<path d="M12 5v14M5 12h14"/>',
    'bell': '<path d="M6 16V11a6 6 0 0 1 12 0v5l2 2H4z"/><path d="M10 20a2 2 0 0 0 4 0"/>',
    'crown': '<path d="M4 17l-1-9 5 4 4-6 4 6 5-4-1 9z"/><path d="M4 20h16"/>',
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
    admin = [('users', 'People'), ('wallet', 'Payroll'), ('heart', 'Giving'), ('finger', 'Biometric devices'), ('network', 'Departments')]
    return R('''<nav aria-label="Main" style="display: flex; flex-direction: column; gap: 3px; padding: 20px 12px 16px; background: #1F3A5F; color: #E2E8F0">
<div style="display: flex; align-items: center; gap: 10px; padding: 0 12px 18px">
<span style="display: flex; align-items: center; justify-content: center; width: 34px; height: 34px; border-radius: 9px; background: #2563EB; color: #FFFFFF; font-size: 15px; font-weight: 700">CC</span>
<span style="display: flex; flex-direction: column; line-height: 1.2"><span style="font-size: 14px; font-weight: 700; color: #FFFFFF">Covenant Creators</span><span style="font-size: 12px; color: rgba(226,232,240,0.65)">Virtual Office</span></span>
</div>
@ITEMS@
<p style="margin: 0; padding: 18px 12px 4px; font-size: 12px; font-weight: 600; color: rgba(226,232,240,0.6)">Admin, HR &amp; Finance</p>
@ADM@
<span style="flex-grow: 1"></span>
@SET@
</nav>''', ITEMS='\n'.join(nav_item(i, l, l == active) for i, l in work),
             ADM='\n'.join(nav_item(i, l, l == active) for i, l in admin), SET=nav_item('settings', 'Settings', False))


def topbar(name, role, initials, hue):
    return R('''<header style="height: 64px; flex-shrink: 0; display: flex; align-items: center; gap: 22px; padding: 0 32px; border-bottom: 1px solid #DCDFD8">
<span style="font-size: 14px"><span style="font-weight: 700">6:38 PM</span> <span style="color: #586171">Manila</span></span>
<span style="font-size: 14px"><span style="font-weight: 700">6:38 AM</span> <span style="color: #586171">New York</span></span>
<span style="flex-grow: 1"></span>
<span style="display: flex; align-items: center; gap: 10px">
<span style="display: flex; align-items: center; justify-content: center; width: 32px; height: 32px; border-radius: 999px; background: hsl(@H@ 55% 88%); color: hsl(@H@ 60% 24%); font-size: 12px; font-weight: 700">@INI@</span>
<span style="display: flex; flex-direction: column; line-height: 1.2"><span style="font-size: 14px; font-weight: 600">@NAME@</span><span style="font-size: 12px; color: #586171">@ROLE@</span></span>
</span>
</header>''', NAME=name, ROLE=role, INI=initials, H=hue)


FONT = ('<link rel="preconnect" href="https://fonts.googleapis.com">\n'
        '<link href="https://fonts.googleapis.com/css2?family=Figtree:wght@400;500;600;700&amp;display=swap" rel="stylesheet">\n')

CSS = '''
body{margin:0;font-family:'Figtree',system-ui,sans-serif;background:#F4F5F1}
a{color:#1D4ED8}a:hover{color:#1E3A8A}
button:focus-visible,a:focus-visible,select:focus-visible,input:focus-visible{outline:2px solid #2563EB;outline-offset:2px}
.num{font-variant-numeric:tabular-nums}
.row:hover{background:#F7F8F5}
@keyframes pin{from{opacity:0;transform:translateY(-4px)}to{opacity:1;transform:none}}
@keyframes slide{from{transform:translateX(24px);opacity:0}to{transform:none;opacity:1}}
.fresh{animation:pin .4s ease-out}
.drawer{animation:slide .25s ease-out}
@media (prefers-reduced-motion: reduce){.fresh,.drawer{animation:none!important}}
'''


def page(title, body, js, props):
    return ('<!doctype html>\n<html lang="en">\n<head>\n<meta charset="utf-8">\n<title>' + title + '</title>\n'
            '<script src="./support.js"></script>\n</head>\n<body>\n<x-dc>\n<helmet>\n' + FONT + '<style>' + CSS + '</style>\n</helmet>\n'
            + body + '\n</x-dc>\n<script type="text/x-dc" data-dc-script data-props=\'' + json.dumps(props) + '\'>' + js + '</script>\n</body>\n</html>\n')


CARD = 'background: #FFFFFF; border: 1px solid #DCDFD8; border-radius: 14px'
BTN = 'display: inline-flex; align-items: center; justify-content: center; gap: 6px; height: 36px; padding: 0 14px; border-radius: 9px; border: 1px solid #C9CEC4; background: #FFFFFF; color: #1B2230; font-family: inherit; font-size: 13.5px; font-weight: 600; cursor: pointer; white-space: nowrap'
BTN_P = 'display: inline-flex; align-items: center; justify-content: center; gap: 6px; height: 36px; padding: 0 14px; border-radius: 9px; border: 1px solid #2563EB; background: #2563EB; color: #FFFFFF; font-family: inherit; font-size: 13.5px; font-weight: 600; cursor: pointer; white-space: nowrap'
SR = 'position: absolute; width: 1px; height: 1px; overflow: hidden; clip: rect(0 0 0 0); white-space: nowrap'

# ================================================================ PAYROLL ====

PAY_JS = r'''
class Component extends DCLogic {
  constructor(props) {
    super(props);
    this.state = {
      inc: { sss: true, philhealth: true, pagibig: true, tax: true, premiums: true, giving: true },
      split: 'split',
      govOff: { emily: true },
      step: 1,
      selected: null,
      toast: null
    };
  }

  componentWillUnmount() {
    clearTimeout(this.toastTimer);
  }

  flash(msg) {
    clearTimeout(this.toastTimer);
    this.setState({ toast: msg });
    this.toastTimer = setTimeout(() => this.setState({ toast: null }), 3400);
  }

  peso(n) {
    return '₱' + (Math.round(n * 100) / 100).toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }

  hue(name) {
    const hues = [210, 160, 30, 280, 340, 190, 100, 250];
    let h = 0;
    for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) >>> 0;
    return hues[h % hues.length];
  }

  employees() {
    return [
      { id: 'maria', name: 'Maria Santos', title: 'Operations Director', monthly: 85000 },
      { id: 'jose', name: 'Jose Reyes', title: 'Engineering Lead', monthly: 95000, ot: 4 },
      { id: 'ana', name: 'Ana Cruz', title: 'Software Engineer', monthly: 60000, give: 3000 },
      { id: 'nico', name: 'Nico Ramos', title: 'Backend Engineer', monthly: 55000 },
      { id: 'tess', name: 'Tess Bautista', title: 'DevOps Engineer', monthly: 58000, ot: 3 },
      { id: 'bea', name: 'Bea Villanueva', title: 'Frontend Engineer', monthly: 52000 },
      { id: 'paolo', name: 'Paolo Aquino', title: 'Junior Engineer', monthly: 30000 },
      { id: 'kim', name: 'Kim Navarro', title: 'Operations Analyst', monthly: 32000, loans: [['SSS salary loan', 1150]] },
      { id: 'grace', name: 'Grace Lim', title: 'HR Specialist', monthly: 30000, give: 1500 },
      { id: 'carlo', name: 'Carlo Mendoza', title: 'Account Executive', monthly: 28000, commission: 6000 },
      { id: 'joy', name: 'Joy Dela Cruz', title: 'Recruiter', monthly: 26000, lateMin: 21, loans: [['Cash advance', 1000]], give: 500 },
      { id: 'kevin', name: 'Kevin Lim', title: 'Graphic Designer', monthly: 25000, days: 8, note: 'Started Oct 6: 8 of 11 working days' },
      { id: 'ryan', name: 'Ryan Torres', title: 'Sales Development Rep', monthly: 22000, loans: [['Pag-IBIG multi-purpose loan', 900]] },
      { id: 'liza', name: 'Liza Garcia', title: 'Support Associate', monthly: 18000, lateMin: 14 },
      { id: 'emily', name: 'Emily Carter', title: 'QA Engineer, contractor (US)', monthly: 70000, contractor: true, note: 'Independent contractor abroad: no PH contributions or withholding' }
    ];
  }

  /** Withholding tax, BIR semi-monthly table (TRAIN law, 2023 onward). */
  semiTax(t) {
    if (t <= 10417) return 0;
    if (t < 16667) return (t - 10417) * 0.15;
    if (t < 33333) return 937.5 + (t - 16667) * 0.2;
    if (t < 83333) return 4270.7 + (t - 33333) * 0.25;
    if (t < 333333) return 16770.7 + (t - 83333) * 0.3;
    return 91770.7 + (t - 333333) * 0.35;
  }

  compute(e) {
    const st = this.state;
    const inc = st.inc;
    const govOn = !e.contractor && !st.govOff[e.id];
    const share = st.split === 'split' ? 0.5 : 0; // this run is the 1st cutoff
    const daily = (e.monthly * 12) / 261;
    const hourly = daily / 8;
    const basic = (e.monthly / 2) * ((e.days || 11) / 11);
    const otPay = inc.premiums && e.ot ? hourly * 1.25 * e.ot : 0;
    const commission = e.commission || 0;
    const late = e.lateMin ? (hourly / 60) * e.lateMin : 0;
    const gross = basic + otPay + commission - late;

    const msc = Math.min(35000, Math.max(5000, Math.floor((e.monthly + 250) / 500) * 500));
    const sssEE = govOn && inc.sss ? 0.05 * msc * share : 0;
    const sssER = govOn && inc.sss ? (0.1 * msc + (msc <= 14500 ? 10 : 30)) * share : 0;
    const phBase = Math.min(100000, Math.max(10000, e.monthly));
    const phEE = govOn && inc.philhealth ? phBase * 0.025 * share : 0;
    const phER = phEE;
    const piBase = Math.min(10000, e.monthly);
    const piEE = govOn && inc.pagibig ? piBase * 0.02 * share : 0;
    const piER = piEE;

    const taxable = gross - sssEE - phEE - piEE;
    const tax = !e.contractor && inc.tax ? this.semiTax(taxable) : 0;
    const loans = (e.loans || []).reduce((a, l) => a + l[1], 0);
    const give = inc.giving && e.give ? e.give : 0;
    const other = loans + give;
    const net = gross - sssEE - phEE - piEE - tax - other;
    return { govOn, basic, otPay, commission, late, gross, sssEE, sssER, phEE, phER, piEE, piER, taxable, tax, loans, give, other, net, msc, hourly, thirteenth: basic / 12 };
  }

  renderVals() {
    const st = this.state;
    const E = this.employees();
    const P = (n) => this.peso(n);
    const locked = st.step >= 2;
    const rowsData = E.map((e) => ({ e: e, c: this.compute(e) }));
    const T = rowsData.reduce((a, r) => {
      ['gross', 'sssEE', 'sssER', 'phEE', 'phER', 'piEE', 'piER', 'tax', 'other', 'net', 'give', 'thirteenth'].forEach((k) => (a[k] = (a[k] || 0) + r.c[k]));
      return a;
    }, {});
    const dash = (n) => (n ? P(n) : '—');

    const rows = rowsData.map(({ e, c }) => {
      const h = this.hue(e.name);
      const parts = e.name.split(' ');
      const adj = [];
      if (c.otPay) adj.push('+' + P(c.otPay) + ' OT');
      if (c.commission) adj.push('+' + P(c.commission) + ' commission');
      if (c.late) adj.push('−' + P(c.late) + ' late (' + e.lateMin + 'm)');
      return {
        key: e.id,
        name: e.name,
        title: e.title,
        initials: (parts[0][0] + parts[parts.length - 1][0]).toUpperCase(),
        avatarStyle: 'display: flex; align-items: center; justify-content: center; width: 30px; height: 30px; flex-shrink: 0; border-radius: 999px; font-size: 11.5px; font-weight: 700; background: hsl(' + h + ' 55% 88%); color: hsl(' + h + ' 60% 24%)',
        basic: P(c.basic),
        adj: adj.length ? adj.join(', ') : e.note && e.days ? 'Prorated' : '—',
        gross: P(c.gross),
        sss: dash(c.sssEE),
        ph: dash(c.phEE),
        pi: dash(c.piEE),
        tax: dash(c.tax),
        other: dash(c.other),
        net: P(c.net),
        govOff: !c.govOn,
        govTag: e.contractor ? 'Contractor' : 'Contributions off',
        rowStyle: 'border-top: 1px solid #ECEEE9' + (st.selected === e.id ? '; background: #EEF3FE' : ''),
        pick: () => this.setState({ selected: e.id })
      };
    });

    // ---------- inclusion switches ----------
    const SW = [
      ['sss', 'SSS', 'Employee 5%, employer 10% + EC of the monthly salary credit (₱5,000–₱35,000)'],
      ['philhealth', 'PhilHealth', '5% of basic salary, split 2.5% / 2.5% (floor ₱10,000, ceiling ₱100,000)'],
      ['pagibig', 'Pag-IBIG', '2% / 2% of up to ₱10,000'],
      ['tax', 'Withholding tax', 'BIR semi-monthly table (TRAIN law)'],
      ['premiums', 'OT, holiday and night premiums', 'From approved overtime in Attendance'],
      ['giving', 'Voluntary giving deductions', 'Only for staff with a signed authorization']
    ];
    const switches = SW.map((s) => {
      const on = !!st.inc[s[0]];
      return {
        key: s[0],
        label: s[1],
        hint: s[2],
        checked: on ? 'true' : 'false',
        trackStyle: 'position: relative; display: block; width: 40px; height: 24px; flex-shrink: 0; border-radius: 999px; transition: background 150ms; background: ' + (on ? '#2563EB' : '#C9CEC4'),
        knobStyle: 'position: absolute; top: 3px; left: ' + (on ? '19px' : '3px') + '; width: 18px; height: 18px; border-radius: 50%; background: #FFFFFF; box-shadow: 0 1px 2px rgba(0,0,0,0.25); transition: left 150ms',
        btnStyle: 'display: flex; align-items: flex-start; gap: 10px; padding: 10px 12px; border-radius: 10px; border: 1px solid ' + (on ? '#BFD0F6' : '#DCDFD8') + '; background: ' + (on ? '#F3F7FF' : '#FFFFFF') + '; font-family: inherit; color: inherit; text-align: left; cursor: ' + (locked ? 'not-allowed' : 'pointer') + '; opacity: ' + (locked ? '0.6' : '1'),
        toggle: () => {
          if (locked) return this.flash('This run is approved. Reopen it to change what is included.');
          this.setState((p) => ({ inc: Object.assign({}, p.inc, { [s[0]]: !p.inc[s[0]] }) }));
        }
      };
    });
    const govAllOff = !st.inc.sss || !st.inc.philhealth || !st.inc.pagibig;

    const splits = [['split', 'Half each cutoff'], ['second', 'All on the 2nd cutoff']].map((o) => ({
      key: o[0],
      label: o[1],
      pressed: st.split === o[0] ? 'true' : 'false',
      style: 'height: 32px; padding: 0 12px; border-radius: 8px; border: 0; font-family: inherit; font-size: 13px; font-weight: 600; cursor: pointer; ' + (st.split === o[0] ? 'background: #FFFFFF; color: #1B2230; box-shadow: 0 1px 2px rgba(27,34,48,0.12)' : 'background: transparent; color: #586171'),
      pick: () => (locked ? this.flash('This run is approved. Reopen it to change the schedule.') : this.setState({ split: o[0] }))
    }));

    // ---------- run steps ----------
    const STEPS = ['Draft', 'HR review', 'Pastor approval', 'Paid'];
    const steps = STEPS.map((label, i) => ({
      key: 's' + i,
      label: label,
      dotStyle: 'display: flex; align-items: center; justify-content: center; width: 24px; height: 24px; flex-shrink: 0; border-radius: 50%; font-size: 12px; font-weight: 700; ' + (i < st.step ? 'background: #15803D; color: #FFFFFF' : i === st.step ? 'background: #2563EB; color: #FFFFFF' : 'background: #E6E9E2; color: #586171'),
      num: i < st.step ? '✓' : String(i + 1),
      labelStyle: 'font-size: 13.5px; font-weight: ' + (i === st.step ? '700' : '600') + '; color: ' + (i <= st.step ? '#1B2230' : '#586171'),
      lineStyle: i < STEPS.length - 1 ? 'flex-grow: 1; height: 2px; min-width: 24px; background: ' + (i < st.step ? '#15803D' : '#DCDFD8') : 'display: none'
    }));
    const primary = ['Mark as reviewed', 'Approve as HR and send to Ptr. Joel', 'Approve and release pay', 'Download bank file'][st.step];
    const advance = () => {
      if (st.step === 1) {
        this.setState({ step: 2 });
        this.flash('Sent to Ptr. Joel for approval. Contributions and amounts are now locked.');
      } else if (st.step === 2) {
        this.setState({ step: 3 });
        this.flash('Pay released for Oct 15. Payslips were emailed to ' + E.length + ' people.');
      } else if (st.step === 3) {
        this.flash('Downloading the bank payroll file (CSV)…');
      }
    };

    // ---------- payslip drawer ----------
    let sel = {};
    const se = E.find((e) => e.id === st.selected);
    if (se) {
      const c = this.compute(se);
      const parts = se.name.split(' ');
      const h = this.hue(se.name);
      const line = (label, amount, note) => ({ key: label, label: label, amount: P(amount), note: note || '', hasNote: !!note });
      const earnings = [line('Basic pay', c.basic, se.days ? se.note : 'Half of ' + P(se.monthly) + ' monthly')];
      if (c.otPay) earnings.push(line('Overtime', c.otPay, se.ot + ' hrs at 125% of ' + P(c.hourly) + '/hr'));
      if (c.commission) earnings.push(line('Commission', c.commission, 'September closed deals'));
      if (c.late) earnings.push(line('Late deduction', -c.late, se.lateMin + ' minutes, from Attendance'));
      const deductions = [];
      if (c.govOn) {
        if (st.inc.sss) deductions.push(line('SSS', c.sssEE, 'Monthly salary credit ' + P(c.msc)));
        if (st.inc.philhealth) deductions.push(line('PhilHealth', c.phEE, ''));
        if (st.inc.pagibig) deductions.push(line('Pag-IBIG', c.piEE, ''));
      }
      if (c.tax) deductions.push(line('Withholding tax', c.tax, 'On taxable pay of ' + P(c.taxable)));
      (se.loans || []).forEach((l) => deductions.push(line(l[0], l[1], 'Scheduled installment')));
      if (c.give) deductions.push(line('Tithe (voluntary)', c.give, 'Authorized by ' + parts[0] + ', Jan 5'));
      const employer = c.govOn
        ? [line('SSS employer share + EC', c.sssER, ''), line('PhilHealth employer share', c.phER, ''), line('Pag-IBIG employer share', c.piER, '')].filter((x) => x.amount !== P(0))
        : [];
      sel = {
        name: se.name,
        title: se.title,
        initials: (parts[0][0] + parts[parts.length - 1][0]).toUpperCase(),
        avatarStyle: 'display: flex; align-items: center; justify-content: center; width: 46px; height: 46px; flex-shrink: 0; border-radius: 999px; font-size: 15px; font-weight: 700; background: hsl(' + h + ' 55% 88%); color: hsl(' + h + ' 60% 24%)',
        earnings: earnings,
        deductions: deductions,
        hasDeductions: deductions.length > 0,
        noDeductions: deductions.length === 0,
        employer: employer,
        hasEmployer: employer.length > 0,
        gross: P(c.gross),
        net: P(c.net),
        thirteenth: P(c.thirteenth),
        thirteenthYtd: P((se.monthly * 9) / 12 + c.thirteenth),
        contractor: !!se.contractor,
        notContractor: !se.contractor,
        govChecked: c.govOn ? 'true' : 'false',
        govTrack: 'position: relative; display: block; width: 40px; height: 24px; flex-shrink: 0; border-radius: 999px; background: ' + (c.govOn ? '#2563EB' : '#C9CEC4'),
        govKnob: 'position: absolute; top: 3px; left: ' + (c.govOn ? '19px' : '3px') + '; width: 18px; height: 18px; border-radius: 50%; background: #FFFFFF; box-shadow: 0 1px 2px rgba(0,0,0,0.25); transition: left 150ms',
        toggleGov: () => {
          if (locked) return this.flash('This run is approved. Reopen it to change contributions.');
          this.setState((p) => ({ govOff: Object.assign({}, p.govOff, { [se.id]: !p.govOff[se.id] }) }));
        },
        govOffWarn: !c.govOn && !se.contractor
      };
    }

    return {
      rows: rows,
      switches: switches,
      splits: splits,
      govAllOff: govAllOff,
      steps: steps,
      primary: primary,
      advance: advance,
      locked: locked,
      canReopen: st.step === 2,
      reopen: () => { this.setState({ step: 1 }); this.flash('Run reopened for changes.'); },
      paid: st.step === 3,
      tGross: P(T.gross),
      tNet: P(T.net),
      tEE: P(T.sssEE + T.phEE + T.piEE),
      tER: P(T.sssER + T.phER + T.piER),
      tTax: P(T.tax),
      tOther: P(T.other),
      tCost: P(T.gross + T.sssER + T.phER + T.piER),
      remSss: P(T.sssEE + T.sssER),
      remPh: P(T.phEE + T.phER),
      remPi: P(T.piEE + T.piER),
      remTax: P(T.tax),
      tGive: P(T.give),
      t13: P(T.thirteenth),
      headcount: E.length,
      hasSel: !!se,
      sel: sel,
      close: () => this.setState({ selected: null }),
      exportIt: () => this.flash('Exporting the payroll register to Excel…'),
      hasToast: !!st.toast,
      toast: st.toast || ''
    };
  }
}
'''

COLS = 'grid-template-columns: minmax(0, 1.7fr) 96px minmax(0, 1fr) 100px 76px 82px 70px 86px 82px 104px; column-gap: 10px; align-items: center'


def payroll():
    body = R('''<div id="top" style="position: relative; width: 1440px; height: 1320px; display: grid; grid-template-columns: 248px minmax(0, 1fr); background: #F4F5F1; color: #1B2230; font-family: 'Figtree', system-ui, sans-serif; overflow: hidden">
@SIDEBAR@
<div style="display: flex; flex-direction: column; min-width: 0">
@TOPBAR@
<main style="display: flex; flex-direction: column; gap: 18px; padding: 22px 32px 28px">
<div style="display: flex; align-items: flex-end; justify-content: space-between; gap: 16px">
<div>
<h1 style="margin: 0; font-size: 28px; font-weight: 700; letter-spacing: -0.01em">Payroll</h1>
<p style="margin: 4px 0 0; font-size: 15px; color: #586171">Semi-monthly, Philippine peso. Hours, lates and overtime come straight from Attendance.</p>
</div>
<div style="display: flex; align-items: center; gap: 8px">
<label style="display: flex; align-items: center; gap: 8px; font-size: 13px; color: #586171">Pay period<select style="height: 36px; padding: 0 10px; border-radius: 9px; border: 1px solid #C9CEC4; background: #FFFFFF; font-family: inherit; font-size: 14px; font-weight: 600; color: #1B2230"><option>Oct 1 – 15, 2026 (pay date Oct 15)</option><option>Sep 16 – 30, 2026 (paid)</option><option>Sep 1 – 15, 2026 (paid)</option></select></label>
<button type="button" onClick="{{exportIt}}" style="@BTN@">@DOWNLOAD@Payroll register</button>
</div>
</div>

<section aria-label="Run status" style="@CARD@; padding: 14px 18px; display: flex; align-items: center; gap: 18px">
<ol style="flex-grow: 1; margin: 0; padding: 0; list-style: none; display: flex; align-items: center; gap: 10px">
<sc-for list="{{steps}}" as="s" hint-placeholder-count="4"><li style="display: flex; align-items: center; gap: 8px; flex-grow: 1"><span style="{{s.dotStyle}}">{{s.num}}</span><span style="{{s.labelStyle}}">{{s.label}}</span><span style="{{s.lineStyle}}"></span></li></sc-for>
</ol>
<sc-if value="{{canReopen}}" hint-placeholder-val="{{false}}"><button type="button" onClick="{{reopen}}" style="@BTN@">Reopen</button></sc-if>
<button type="button" onClick="{{advance}}" style="@BTN_P@">{{primary}}</button>
</section>

<div style="display: grid; grid-template-columns: repeat(5, minmax(0, 1fr)); gap: 12px">
<div style="@CARD@; padding: 14px 16px"><p style="margin: 0; font-size: 13px; color: #586171">Gross pay</p><p class="num" style="margin: 4px 0 0; font-size: 24px; font-weight: 700">{{tGross}}</p><p style="margin: 4px 0 0; font-size: 12.5px; color: #586171">{{headcount}} people this cutoff</p></div>
<div style="@CARD@; padding: 14px 16px"><p style="margin: 0; font-size: 13px; color: #586171">Employee contributions</p><p class="num" style="margin: 4px 0 0; font-size: 24px; font-weight: 700">{{tEE}}</p><p style="margin: 4px 0 0; font-size: 12.5px; color: #586171">SSS, PhilHealth, Pag-IBIG</p></div>
<div style="@CARD@; padding: 14px 16px"><p style="margin: 0; font-size: 13px; color: #586171">Withholding tax</p><p class="num" style="margin: 4px 0 0; font-size: 24px; font-weight: 700">{{tTax}}</p><p style="margin: 4px 0 0; font-size: 12.5px; color: #586171">Remitted to BIR (1601-C)</p></div>
<div style="@CARD@; padding: 14px 16px"><p style="margin: 0; font-size: 13px; color: #586171">Net pay to release</p><p class="num" style="margin: 4px 0 0; font-size: 24px; font-weight: 700; color: #14532D">{{tNet}}</p><p style="margin: 4px 0 0; font-size: 12.5px; color: #586171">To employee bank accounts</p></div>
<div style="@CARD@; padding: 14px 16px"><p style="margin: 0; font-size: 13px; color: #586171">Total cost to company</p><p class="num" style="margin: 4px 0 0; font-size: 24px; font-weight: 700">{{tCost}}</p><p style="margin: 4px 0 0; font-size: 12.5px; color: #586171">Gross + {{tER}} employer share</p></div>
</div>

<section aria-labelledby="inc" style="@CARD@; padding: 16px 18px; display: flex; flex-direction: column; gap: 12px">
<div style="display: flex; align-items: center; justify-content: space-between; gap: 12px">
<div><h2 id="inc" style="margin: 0; font-size: 16px; font-weight: 700">What this run includes</h2><p style="margin: 2px 0 0; font-size: 13px; color: #586171">Government-mandated contributions are on by default. Turn one off for the whole run here, or for one person in their payslip.</p></div>
<div style="display: flex; align-items: center; gap: 8px"><span style="font-size: 13px; color: #586171">Deduct contributions</span><div style="display: flex; gap: 4px; padding: 4px; background: #E6E9E2; border-radius: 10px"><sc-for list="{{splits}}" as="o" hint-placeholder-count="2"><button type="button" onClick="{{o.pick}}" aria-pressed="{{o.pressed}}" style="{{o.style}}">{{o.label}}</button></sc-for></div></div>
</div>
<div style="display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 10px">
<sc-for list="{{switches}}" as="w" hint-placeholder-count="6"><button type="button" role="switch" aria-checked="{{w.checked}}" onClick="{{w.toggle}}" style="{{w.btnStyle}}"><span style="{{w.trackStyle}}"><span style="{{w.knobStyle}}"></span></span><span><span style="display: block; font-size: 14px; font-weight: 700">{{w.label}}</span><span style="display: block; margin-top: 2px; font-size: 12.5px; line-height: 1.4; color: #586171">{{w.hint}}</span></span></button></sc-for>
</div>
<sc-if value="{{govAllOff}}" hint-placeholder-val="{{false}}"><p class="fresh" style="margin: 0; display: flex; gap: 8px; padding: 10px 12px; border-radius: 10px; background: #FDF0DC; color: #7C3F00; font-size: 13px; line-height: 1.45"><span style="display: flex; flex-shrink: 0; margin-top: 1px">@ALERT@</span><span>SSS, PhilHealth and Pag-IBIG are required by law for employees. Turn them off only for runs that pay contractors or consultants, not employees.</span></p></sc-if>
</section>

<div style="@CARD@; overflow: hidden">
<div role="table" aria-label="Payroll, Oct 1 to 15" style="font-size: 13.5px">
<div role="row" style="display: grid; @COLS@; padding: 10px 16px; font-size: 12px; font-weight: 600; color: #586171">
<span role="columnheader">Person</span><span role="columnheader" style="text-align: right">Basic</span><span role="columnheader">Adjustments</span><span role="columnheader" style="text-align: right">Gross</span><span role="columnheader" style="text-align: right">SSS</span><span role="columnheader" style="text-align: right">PhilHealth</span><span role="columnheader" style="text-align: right">Pag-IBIG</span><span role="columnheader" style="text-align: right">Tax</span><span role="columnheader" style="text-align: right">Other</span><span role="columnheader" style="text-align: right">Net pay</span>
</div>
<sc-for list="{{rows}}" as="r" hint-placeholder-count="12"><div role="row" class="row" style="display: grid; @COLS@; padding: 7px 16px; {{r.rowStyle}}">
<span role="cell"><button type="button" onClick="{{r.pick}}" style="display: flex; align-items: center; gap: 10px; padding: 0; border: 0; background: transparent; font-family: inherit; color: inherit; text-align: left; cursor: pointer"><span style="{{r.avatarStyle}}">{{r.initials}}</span><span><span style="display: flex; align-items: center; gap: 6px; font-weight: 600">{{r.name}}<sc-if value="{{r.govOff}}" hint-placeholder-val="{{false}}"><span style="display: inline-flex; align-items: center; height: 20px; padding: 0 7px; border-radius: 6px; font-size: 11px; font-weight: 700; background: #EEF1EC; color: #3F4756">{{r.govTag}}</span></sc-if></span><span style="display: block; font-size: 12px; color: #586171">{{r.title}}</span></span></button></span>
<span role="cell" class="num" style="text-align: right">{{r.basic}}</span>
<span role="cell" style="font-size: 12.5px; color: #3F4756">{{r.adj}}</span>
<span role="cell" class="num" style="text-align: right; font-weight: 600">{{r.gross}}</span>
<span role="cell" class="num" style="text-align: right; color: #3F4756">{{r.sss}}</span>
<span role="cell" class="num" style="text-align: right; color: #3F4756">{{r.ph}}</span>
<span role="cell" class="num" style="text-align: right; color: #3F4756">{{r.pi}}</span>
<span role="cell" class="num" style="text-align: right; color: #3F4756">{{r.tax}}</span>
<span role="cell" class="num" style="text-align: right; color: #3F4756">{{r.other}}</span>
<span role="cell" class="num" style="text-align: right; font-weight: 700">{{r.net}}</span>
</div></sc-for>
</div>
</div>

<div style="display: grid; grid-template-columns: minmax(0, 1.3fr) minmax(0, 1fr); gap: 16px; align-items: start">
<section aria-labelledby="rem" style="@CARD@; padding: 16px 18px">
<h2 id="rem" style="margin: 0 0 4px; font-size: 16px; font-weight: 700">Remittances from this cutoff</h2>
<p style="margin: 0 0 10px; font-size: 13px; color: #586171">Employee and employer shares, added to October's remittance. Due dates follow each agency's schedule; reminders are set in Settings.</p>
<dl style="margin: 0; display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 10px">
<div style="padding: 10px 12px; border-radius: 10px; background: #F7F8F5"><dt style="font-size: 12.5px; color: #586171">SSS</dt><dd class="num" style="margin: 2px 0 0; font-size: 16px; font-weight: 700">{{remSss}}</dd></div>
<div style="padding: 10px 12px; border-radius: 10px; background: #F7F8F5"><dt style="font-size: 12.5px; color: #586171">PhilHealth</dt><dd class="num" style="margin: 2px 0 0; font-size: 16px; font-weight: 700">{{remPh}}</dd></div>
<div style="padding: 10px 12px; border-radius: 10px; background: #F7F8F5"><dt style="font-size: 12.5px; color: #586171">Pag-IBIG</dt><dd class="num" style="margin: 2px 0 0; font-size: 16px; font-weight: 700">{{remPi}}</dd></div>
<div style="padding: 10px 12px; border-radius: 10px; background: #F7F8F5"><dt style="font-size: 12.5px; color: #586171">BIR withholding</dt><dd class="num" style="margin: 2px 0 0; font-size: 16px; font-weight: 700">{{remTax}}</dd></div>
</dl>
</section>
<section aria-labelledby="ben" style="@CARD@; padding: 16px 18px; display: flex; flex-direction: column; gap: 8px">
<h2 id="ben" style="margin: 0; font-size: 16px; font-weight: 700">Mandated benefits tracked</h2>
<div style="display: grid; grid-template-columns: minmax(0, 1fr) auto; gap: 6px 12px; font-size: 13.5px">
<span>13th-month pay accrued this cutoff</span><span class="num" style="font-weight: 700">{{t13}}</span>
<span style="color: #586171">Paid on or before Dec 24; tax-free up to ₱90,000 a year with other benefits</span><span></span>
<span>Holidays in this cutoff</span><span style="font-weight: 600">None</span>
<span>Service incentive leave</span><span style="font-weight: 600">5 days a year, from Leave</span>
<span>Voluntary giving deducted</span><span class="num" style="font-weight: 700">{{tGive}}</span>
</div>
</section>
</div>
</main>
</div>

<sc-if value="{{hasSel}}" hint-placeholder-val="{{false}}">
<div style="position: absolute; inset: 0; z-index: 50; background: rgba(15,23,42,0.28)"></div>
<aside class="drawer" role="dialog" aria-modal="true" aria-labelledby="slip-title" style="position: absolute; top: 0; right: 0; bottom: 0; z-index: 51; width: 460px; box-sizing: border-box; display: flex; flex-direction: column; gap: 16px; padding: 22px 24px; background: #FFFFFF; box-shadow: -16px 0 40px rgba(15,23,42,0.18); overflow-y: auto">
<div style="display: flex; align-items: flex-start; gap: 12px">
<span style="{{sel.avatarStyle}}">{{sel.initials}}</span>
<div style="flex-grow: 1"><h2 id="slip-title" style="margin: 0; font-size: 19px; font-weight: 700">{{sel.name}}</h2><p style="margin: 2px 0 0; font-size: 13px; color: #586171">{{sel.title}}. Payslip for Oct 1 – 15, 2026</p></div>
<button type="button" onClick="{{close}}" aria-label="Close" style="display: flex; align-items: center; justify-content: center; width: 34px; height: 34px; border: 0; border-radius: 8px; background: transparent; color: #586171; cursor: pointer">@X@</button>
</div>
<sc-if value="{{sel.notContractor}}" hint-placeholder-val="{{true}}"><button type="button" role="switch" aria-checked="{{sel.govChecked}}" onClick="{{sel.toggleGov}}" style="display: flex; align-items: center; gap: 10px; padding: 10px 12px; border-radius: 10px; border: 1px solid #DCDFD8; background: #FAFAF7; font-family: inherit; color: inherit; text-align: left; cursor: pointer"><span style="{{sel.govTrack}}"><span style="{{sel.govKnob}}"></span></span><span style="font-size: 14px; font-weight: 600">Include SSS, PhilHealth and Pag-IBIG for this person</span></button></sc-if>
<sc-if value="{{sel.govOffWarn}}" hint-placeholder-val="{{false}}"><p style="margin: 0; padding: 10px 12px; border-radius: 10px; background: #FDF0DC; color: #7C3F00; font-size: 13px; line-height: 1.45">Contributions are off for this person. That's only allowed if they are not an employee (for example a consultant paid by invoice).</p></sc-if>
<sc-if value="{{sel.contractor}}" hint-placeholder-val="{{false}}"><p style="margin: 0; padding: 10px 12px; border-radius: 10px; background: #F1F2EE; color: #3F4756; font-size: 13px; line-height: 1.45">Paid as an independent contractor abroad: no SSS, PhilHealth, Pag-IBIG or Philippine withholding. Converted to USD at payout.</p></sc-if>
<section>
<h3 style="margin: 0 0 6px; font-size: 14px; font-weight: 700">Earnings</h3>
<sc-for list="{{sel.earnings}}" as="l" hint-placeholder-count="2"><div style="display: flex; justify-content: space-between; gap: 12px; padding: 8px 0; border-top: 1px solid #ECEEE9"><span><span style="display: block; font-size: 13.5px">{{l.label}}</span><sc-if value="{{l.hasNote}}" hint-placeholder-val="{{false}}"><span style="display: block; font-size: 12px; color: #586171">{{l.note}}</span></sc-if></span><span class="num" style="font-size: 13.5px; font-weight: 600">{{l.amount}}</span></div></sc-for>
<div style="display: flex; justify-content: space-between; padding: 8px 0; border-top: 2px solid #DCDFD8; font-weight: 700"><span>Gross pay</span><span class="num">{{sel.gross}}</span></div>
</section>
<section>
<h3 style="margin: 0 0 6px; font-size: 14px; font-weight: 700">Deductions</h3>
<sc-if value="{{sel.noDeductions}}" hint-placeholder-val="{{false}}"><p style="margin: 0; font-size: 13px; color: #586171">No deductions this cutoff.</p></sc-if>
<sc-for list="{{sel.deductions}}" as="l" hint-placeholder-count="4"><div style="display: flex; justify-content: space-between; gap: 12px; padding: 8px 0; border-top: 1px solid #ECEEE9"><span><span style="display: block; font-size: 13.5px">{{l.label}}</span><sc-if value="{{l.hasNote}}" hint-placeholder-val="{{false}}"><span style="display: block; font-size: 12px; color: #586171">{{l.note}}</span></sc-if></span><span class="num" style="font-size: 13.5px; font-weight: 600">{{l.amount}}</span></div></sc-for>
</section>
<div style="display: flex; justify-content: space-between; align-items: baseline; padding: 12px 14px; border-radius: 12px; background: #E3F1E8; color: #14532D"><span style="font-size: 15px; font-weight: 700">Net pay</span><span class="num" style="font-size: 22px; font-weight: 700">{{sel.net}}</span></div>
<sc-if value="{{sel.hasEmployer}}" hint-placeholder-val="{{false}}">
<section>
<h3 style="margin: 0 0 6px; font-size: 14px; font-weight: 700">Paid by Covenant Creators on top</h3>
<sc-for list="{{sel.employer}}" as="l" hint-placeholder-count="3"><div style="display: flex; justify-content: space-between; gap: 12px; padding: 7px 0; border-top: 1px solid #ECEEE9; font-size: 13px; color: #3F4756"><span>{{l.label}}</span><span class="num">{{l.amount}}</span></div></sc-for>
</section>
</sc-if>
<p style="margin: 0; font-size: 13px; color: #586171">13th-month pay: {{sel.thirteenth}} accrued this cutoff, {{sel.thirteenthYtd}} so far this year.</p>
</aside>
</sc-if>

<sc-if value="{{hasToast}}" hint-placeholder-val="{{false}}">
<div role="status" style="position: absolute; left: 50%; bottom: 28px; z-index: 60; transform: translateX(-50%); padding: 12px 18px; border-radius: 12px; background: #1B2230; color: #FFFFFF; font-size: 14px; font-weight: 500; white-space: nowrap; box-shadow: 0 12px 32px rgba(15,23,42,0.3)">{{toast}}</div>
</sc-if>
</div>''', SIDEBAR=sidebar('Payroll'), TOPBAR=topbar('Grace Lim', 'HR Specialist', 'GL', 280), CARD=CARD, BTN=BTN, BTN_P=BTN_P,
             COLS=COLS, DOWNLOAD=svg('download', 16), ALERT=svg('alert', 16), X=svg('x'))
    body = body.replace('\\u2013', '–').replace('\\u20b1', '₱')
    return page('Payroll', body, PAY_JS, {'$preview': {'width': 1440, 'height': 1320}})


# ================================================================ GIVING ====

MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct']
CEOS = [
    {'id': 'andrew', 'name': 'Andrew Tan', 'agency': 'Harvest Media', 'income': 450000, 'tier': 'growth', 'declared': 'Jul 1 (Q3)',
     'tithe': [45000, 45000, 42000, 45000, 45000, 45000, 0, 45000, 45000, 0], 'cov': [30000, 30000, 30000, 30000, 30000, 30000, 30000, 0, 0, 0]},
    {'id': 'rachel', 'name': 'Rachel Uy', 'agency': 'Kingdom Digital', 'income': 1200000, 'tier': 'harvest', 'declared': 'Jul 1 (Q3)',
     'tithe': [110000, 115000, 120000, 120000, 120000, 120000, 120000, 120000, 120000, 60000], 'cov': [75000] * 8 + [125000, 75000]},
    {'id': 'ben', 'name': 'Ben Ocampo', 'agency': 'Lighthouse Studio', 'income': 260000, 'tier': 'seed', 'declared': 'Jul 1 (Q3)',
     'tithe': [26000, 0, 26000, 26000, 20000, 26000, 26000, 0, 26000, 0], 'cov': [10000, 0, 10000, 0, 10000, 0, 10000, 0, 0, 0]},
    {'id': 'faith', 'name': 'Faith Castillo', 'agency': 'Mustard Seed Marketing', 'income': 3400000, 'tier': 'kingdom', 'declared': 'Jul 1 (Q3)',
     'tithe': [300000, 320000, 340000, 340000, 340000, 340000, 340000, 340000, 340000, 0], 'cov': [150000] * 9 + [0]},
]

GIVE_JS = r'''
class Component extends DCLogic {
  constructor(props) {
    super(props);
    const C = __CEOS__;
    const tiers = {};
    C.forEach((c) => (tiers[c.id] = c.tier));
    this.state = { tiers: tiers, extra: {}, reminded: {}, form: null, toast: null, open: null };
  }

  componentWillUnmount() {
    clearTimeout(this.toastTimer);
  }

  flash(msg) {
    clearTimeout(this.toastTimer);
    this.setState({ toast: msg });
    this.toastTimer = setTimeout(() => this.setState({ toast: null }), 3400);
  }

  peso(n) {
    return '₱' + Math.round(n).toLocaleString('en-PH');
  }

  short(n) {
    if (n >= 1000000) return '₱' + (Math.round(n / 100000) / 10) + 'M';
    if (n >= 1000) return '₱' + Math.round(n / 1000) + 'k';
    return '₱' + n;
  }

  hue(name) {
    const hues = [210, 160, 30, 280, 340, 190, 100, 250];
    let h = 0;
    for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) >>> 0;
    return hues[h % hues.length];
  }

  tiersDef() {
    return {
      seed: { label: 'Seed', range: 'Under ₱300k net a month', pledge: 10000 },
      growth: { label: 'Growth', range: '₱300k – ₱1M', pledge: 30000 },
      harvest: { label: 'Harvest', range: '₱1M – ₱3M', pledge: 75000 },
      kingdom: { label: 'Kingdom', range: 'Over ₱3M', pledge: 150000 }
    };
  }

  suggested(income) {
    return income < 300000 ? 'seed' : income < 1000000 ? 'growth' : income < 3000000 ? 'harvest' : 'kingdom';
  }

  renderVals() {
    const st = this.state;
    const C = __CEOS__;
    const MONTHS = __MONTHS__;
    const TD = this.tiersDef();
    const P = (n) => this.peso(n);
    const NOW = 9; // October, in progress (day 8)
    const DUE = 9; // full months due: Jan to Sep
    let totT = 0, totC = 0, totPledged = 0, onTrack = 0;

    const ceos = C.map((c) => {
      const extra = st.extra[c.id] || { tithe: 0, cov: 0 };
      const tithe = c.tithe.slice();
      const cov = c.cov.slice();
      tithe[NOW] += extra.tithe;
      cov[NOW] += extra.cov;
      const tierId = st.tiers[c.id];
      const tier = TD[tierId];
      const titheExp = c.income * 0.1;
      const tYtd = tithe.reduce((a, b) => a + b, 0);
      const cYtd = cov.reduce((a, b) => a + b, 0);
      const tDue = titheExp * DUE;
      const cDue = tier.pledge * DUE;
      totT += tYtd;
      totC += cYtd;
      totPledged += cDue;
      const tPct = Math.min(100, Math.round((tYtd / tDue) * 100));
      const cPct = Math.min(130, Math.round((cYtd / cDue) * 100));
      const gap = cDue - cYtd;
      let status, chip;
      if (cYtd >= cDue * 1.05) { status = 'Ahead of covenant'; chip = ['#E3F1E8', '#14532D']; }
      else if (cYtd >= cDue * 0.9 && tYtd >= tDue * 0.9) { status = 'On track'; chip = ['#E3F1E8', '#14532D']; }
      else { status = 'Behind ' + this.short(Math.max(gap, 0) + Math.max(tDue - tYtd, 0)); chip = ['#FDF0DC', '#7C3F00']; }
      if (status === 'On track' || status === 'Ahead of covenant') onTrack += 1;
      const h = this.hue(c.name);
      const parts = c.name.split(' ');
      const months = MONTHS.map((m, i) => {
        const tOk = tithe[i] >= titheExp * 0.95;
        const cOk = cov[i] >= tier.pledge * 0.95;
        const any = tithe[i] + cov[i] > 0;
        let bg = '#F1F2EE', fg = '#586171', label = 'Nothing yet';
        if (i === NOW && !any) { bg = '#FFFFFF'; label = 'October in progress'; }
        else if (tOk && cOk) { bg = '#15803D'; fg = '#FFFFFF'; label = 'Tithe and covenant'; }
        else if (any) { bg = '#E7C66A'; fg = '#3D2B00'; label = tOk ? 'Tithe only' : cOk ? 'Covenant only' : 'Partial'; }
        else { bg = '#F4D3D9'; fg = '#8A1030'; label = 'No giving recorded'; }
        return {
          key: c.id + m,
          m: m,
          title: m + ': ' + label + '. Tithe ' + P(tithe[i]) + ', covenant ' + P(cov[i]),
          style: 'display: flex; align-items: center; justify-content: center; height: 28px; border-radius: 6px; font-size: 11.5px; font-weight: 700; background: ' + bg + '; color: ' + fg + (i === NOW ? '; box-shadow: inset 0 0 0 2px #2563EB' : '')
        };
      });
      const suggestedId = this.suggested(c.income);
      return {
        key: c.id,
        name: c.name,
        agency: c.agency,
        initials: (parts[0][0] + parts[parts.length - 1][0]).toUpperCase(),
        avatarStyle: 'display: flex; align-items: center; justify-content: center; width: 44px; height: 44px; flex-shrink: 0; border-radius: 999px; font-size: 15px; font-weight: 700; background: hsl(' + h + ' 55% 88%); color: hsl(' + h + ' 60% 24%)',
        income: P(c.income),
        declared: c.declared,
        tierLabel: tier.label,
        pledge: P(tier.pledge),
        suggestedNote: suggestedId === tierId ? 'Matches their capacity' : 'Capacity suggests ' + TD[suggestedId].label,
        titheExp: P(titheExp),
        tYtd: P(tYtd),
        tDue: P(tDue),
        cYtd: P(cYtd),
        cDue: P(cDue),
        tBar: 'display: block; height: 100%; border-radius: 999px; background: #1F3A5F; width: ' + tPct + '%',
        cBar: 'display: block; height: 100%; border-radius: 999px; background: #A07A1E; width: ' + Math.min(100, cPct) + '%',
        tPct: tPct + '%',
        cPct: cPct + '%',
        status: status,
        chipStyle: 'display: inline-flex; align-items: center; height: 26px; padding: 0 10px; border-radius: 999px; font-size: 12.5px; font-weight: 700; white-space: nowrap; background: ' + chip[0] + '; color: ' + chip[1],
        behind: status.indexOf('Behind') === 0,
        reminded: !!st.reminded[c.id],
        notReminded: !st.reminded[c.id],
        months: months,
        tiers: Object.keys(TD).map((k) => ({ key: k, value: k, label: TD[k].label + ' – ' + this.short(TD[k].pledge) + '/mo', selected: k === tierId })),
        tierValue: tierId,
        setTier: (ev) => {
          const v = ev.target.value;
          this.setState((s) => ({ tiers: Object.assign({}, s.tiers, { [c.id]: v }) }));
          this.flash(c.name.split(' ')[0] + '’s covenant is now ' + TD[v].label + ', ' + P(TD[v].pledge) + ' a month.');
        },
        remind: () => {
          this.setState((s) => ({ reminded: Object.assign({}, s.reminded, { [c.id]: true }) }));
          this.flash('A gentle note from Ptr. Joel was sent to ' + c.name.split(' ')[0] + '. Amounts are never included in the message.');
        },
        checkin: () => this.flash('Check-in with ' + c.name.split(' ')[0] + ' booked in the Senior Pastor’s office, Monday 3:00 PM.'),
        record: () => this.setState({ form: { id: c.id, type: 'tithe', amount: '' } })
      };
    });

    const f = st.form;
    const fc = f ? C.find((c) => c.id === f.id) : null;
    const types = [['tithe', 'Tithe'], ['cov', 'Covenant giving'], ['offering', 'Love offering']].map((t) => ({
      key: t[0], label: t[1], pressed: f && f.type === t[0] ? 'true' : 'false',
      style: 'flex-grow: 1; height: 36px; border-radius: 8px; border: 0; font-family: inherit; font-size: 13.5px; font-weight: 600; cursor: pointer; ' + (f && f.type === t[0] ? 'background: #FFFFFF; color: #1B2230; box-shadow: 0 1px 2px rgba(27,34,48,0.12)' : 'background: transparent; color: #586171'),
      pick: () => this.setState((s) => ({ form: Object.assign({}, s.form, { type: t[0] }) }))
    }));
    const save = () => {
      const amt = Number(String(f.amount).replace(/[^0-9.]/g, ''));
      if (!amt) return this.flash('Enter an amount first.');
      const key = f.type === 'tithe' ? 'tithe' : 'cov';
      this.setState((s) => {
        const prev = s.extra[f.id] || { tithe: 0, cov: 0 };
        const next = Object.assign({}, prev, { [key]: prev[key] + (f.type === 'offering' ? 0 : amt) });
        return { extra: Object.assign({}, s.extra, { [f.id]: next }), form: null };
      });
      this.flash('Recorded ' + P(amt) + ' ' + (f.type === 'tithe' ? 'tithe' : f.type === 'cov' ? 'covenant giving' : 'love offering') + ' from ' + fc.name + '. A receipt was emailed.');
    };

    return {
      ceos: ceos,
      totT: P(totT),
      totC: P(totC),
      totPledged: P(totPledged),
      covPct: Math.round((totC / totPledged) * 100) + '%',
      onTrack: onTrack + ' of ' + C.length,
      tiersDef: Object.keys(TD).map((k) => ({ key: k, label: TD[k].label, range: TD[k].range, pledge: P(TD[k].pledge) })),
      hasForm: !!f,
      formName: fc ? fc.name : '',
      types: types,
      amount: f ? f.amount : '',
      onAmount: (ev) => { const v = ev.target.value; this.setState((s) => ({ form: Object.assign({}, s.form, { amount: v }) })); },
      save: save,
      cancel: () => this.setState({ form: null }),
      hasToast: !!st.toast,
      toast: st.toast || ''
    };
  }
}
'''


def giving():
    body = R('''<div id="top" style="position: relative; width: 1440px; height: 1320px; display: grid; grid-template-columns: 248px minmax(0, 1fr); background: #F4F5F1; color: #1B2230; font-family: 'Figtree', system-ui, sans-serif; overflow: hidden">
@SIDEBAR@
<div style="display: flex; flex-direction: column; min-width: 0">
@TOPBAR@
<main style="display: flex; flex-direction: column; gap: 18px; padding: 22px 32px 28px">
<div style="display: flex; align-items: flex-end; justify-content: space-between; gap: 16px">
<div>
<h1 style="margin: 0; font-size: 28px; font-weight: 700; letter-spacing: -0.01em">Tithes &amp; covenant giving</h1>
<p style="margin: 4px 0 0; font-size: 15px; color: #586171">Agency CEOs' tithe (10% of declared income) and covenant commitment set by capacity. 2026, January to date.</p>
</div>
<span style="display: inline-flex; align-items: center; gap: 8px; height: 34px; padding: 0 12px; border-radius: 9px; background: #EEF1F6; color: #1F3A5F; font-size: 13px; font-weight: 600"><span style="display: flex">@LOCK@</span>Visible to Ptr. Joel and the finance steward only</span>
</div>

<div style="display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 12px">
<div style="@CARD@; padding: 14px 16px"><p style="margin: 0; font-size: 13px; color: #586171">Tithes received</p><p class="num" style="margin: 4px 0 0; font-size: 26px; font-weight: 700; color: #1F3A5F">{{totT}}</p><p style="margin: 4px 0 0; font-size: 12.5px; color: #586171">From 4 agency CEOs, year to date</p></div>
<div style="@CARD@; padding: 14px 16px"><p style="margin: 0; font-size: 13px; color: #586171">Covenant giving received</p><p class="num" style="margin: 4px 0 0; font-size: 26px; font-weight: 700; color: #7A5200">{{totC}}</p><p style="margin: 4px 0 0; font-size: 12.5px; color: #586171">{{covPct}} of {{totPledged}} committed (Jan–Sep)</p></div>
<div style="@CARD@; padding: 14px 16px"><p style="margin: 0; font-size: 13px; color: #586171">CEOs on track</p><p style="margin: 4px 0 0; font-size: 26px; font-weight: 700">{{onTrack}}</p><p style="margin: 4px 0 0; font-size: 12.5px; color: #586171">Within 10% of tithe and covenant</p></div>
<div style="@CARD@; padding: 14px 16px"><p style="margin: 0; font-size: 13px; color: #586171">Staff giving through payroll</p><p class="num" style="margin: 4px 0 0; font-size: 26px; font-weight: 700">3 people</p><p style="margin: 4px 0 0; font-size: 12.5px; color: #586171">Voluntary, by signed authorization. Names stay private.</p></div>
</div>

<section aria-label="Agency CEOs" style="display: flex; flex-direction: column; gap: 12px">
<sc-for list="{{ceos}}" as="c" hint-placeholder-count="4"><article style="@CARD@; padding: 16px 18px; display: grid; grid-template-columns: 260px minmax(0, 1fr) 210px; gap: 20px; align-items: start">
<div style="display: flex; flex-direction: column; gap: 10px">
<div style="display: flex; gap: 12px; align-items: center"><span style="{{c.avatarStyle}}">{{c.initials}}</span><div><h2 style="margin: 0; font-size: 16px; font-weight: 700">{{c.name}}</h2><p style="margin: 2px 0 0; font-size: 13px; color: #586171">CEO, {{c.agency}}</p></div></div>
<dl style="margin: 0; display: grid; grid-template-columns: auto minmax(0, 1fr); gap: 4px 10px; font-size: 13px">
<dt style="color: #586171">Declared income</dt><dd class="num" style="margin: 0; font-weight: 700">{{c.income}}/mo</dd>
<dt style="color: #586171">Declared</dt><dd style="margin: 0">{{c.declared}}</dd>
</dl>
<label style="display: flex; flex-direction: column; gap: 4px; font-size: 12.5px; font-weight: 600; color: #586171">Covenant level<select value="{{c.tierValue}}" onChange="{{c.setTier}}" style="height: 36px; padding: 0 8px; border-radius: 9px; border: 1px solid #C9CEC4; background: #FFFFFF; font-family: inherit; font-size: 13.5px; font-weight: 600; color: #1B2230"><sc-for list="{{c.tiers}}" as="t" hint-placeholder-count="4"><option value="{{t.value}}">{{t.label}}</option></sc-for></select></label>
<span style="font-size: 12px; color: #586171">{{c.suggestedNote}}</span>
</div>
<div style="display: flex; flex-direction: column; gap: 12px">
<div>
<div style="display: flex; justify-content: space-between; gap: 8px; font-size: 13px"><span style="font-weight: 700">Tithe <span style="font-weight: 500; color: #586171">({{c.titheExp}} a month)</span></span><span class="num"><span style="font-weight: 700">{{c.tYtd}}</span> <span style="color: #586171">of {{c.tDue}} due, {{c.tPct}}</span></span></div>
<span style="display: block; height: 10px; margin-top: 6px; border-radius: 999px; background: #E6E9E2; overflow: hidden"><span style="{{c.tBar}}"></span></span>
</div>
<div>
<div style="display: flex; justify-content: space-between; gap: 8px; font-size: 13px"><span style="font-weight: 700">Covenant <span style="font-weight: 500; color: #586171">({{c.tierLabel}}, {{c.pledge}} a month)</span></span><span class="num"><span style="font-weight: 700">{{c.cYtd}}</span> <span style="color: #586171">of {{c.cDue}} committed, {{c.cPct}}</span></span></div>
<span style="display: block; height: 10px; margin-top: 6px; border-radius: 999px; background: #E6E9E2; overflow: hidden"><span style="{{c.cBar}}"></span></span>
</div>
<div style="display: grid; grid-template-columns: repeat(10, minmax(0, 1fr)); gap: 4px" aria-label="Giving by month">
<sc-for list="{{c.months}}" as="m" hint-placeholder-count="10"><span title="{{m.title}}" aria-label="{{m.title}}" style="{{m.style}}">{{m.m}}</span></sc-for>
</div>
</div>
<div style="display: flex; flex-direction: column; gap: 8px; align-items: stretch">
<span style="{{c.chipStyle}}; align-self: flex-start">{{c.status}}</span>
<button type="button" onClick="{{c.record}}" style="@BTN_P@">@PLUS@Record a gift</button>
<sc-if value="{{c.behind}}" hint-placeholder-val="{{false}}"><sc-if value="{{c.notReminded}}" hint-placeholder-val="{{true}}"><button type="button" onClick="{{c.remind}}" style="@BTN@">@BELL@Send a gentle note</button></sc-if><sc-if value="{{c.reminded}}" hint-placeholder-val="{{false}}"><span class="fresh" style="font-size: 12.5px; font-weight: 600; color: #14532D">Note sent today</span></sc-if></sc-if>
<button type="button" onClick="{{c.checkin}}" style="@BTN@">Book a check-in</button>
</div>
</article></sc-for>
</section>

<div style="display: flex; flex-wrap: wrap; align-items: center; gap: 8px 16px; font-size: 12.5px; color: #586171">
<span style="display: flex; align-items: center; gap: 6px"><span style="width: 14px; height: 14px; border-radius: 4px; background: #15803D"></span>Tithe and covenant given</span>
<span style="display: flex; align-items: center; gap: 6px"><span style="width: 14px; height: 14px; border-radius: 4px; background: #E7C66A"></span>Partly given</span>
<span style="display: flex; align-items: center; gap: 6px"><span style="width: 14px; height: 14px; border-radius: 4px; background: #F4D3D9"></span>Nothing recorded</span>
<span style="display: flex; align-items: center; gap: 6px"><span style="width: 14px; height: 14px; border-radius: 4px; background: #FFFFFF; box-shadow: inset 0 0 0 2px #2563EB"></span>October, in progress</span>
</div>

<div style="display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, 1fr); gap: 16px; align-items: start">
<section aria-labelledby="lv" style="@CARD@; padding: 16px 18px">
<h2 id="lv" style="margin: 0 0 4px; font-size: 16px; font-weight: 700">Covenant levels by capacity</h2>
<p style="margin: 0 0 10px; font-size: 13px; color: #586171">Each CEO declares their agency's net income every quarter. The level is suggested from it, and Ptr. Joel can adjust it after talking with them.</p>
<sc-for list="{{tiersDef}}" as="t" hint-placeholder-count="4"><div style="display: grid; grid-template-columns: 90px minmax(0, 1fr) auto; gap: 12px; padding: 8px 0; border-top: 1px solid #ECEEE9; font-size: 13.5px"><span style="font-weight: 700">{{t.label}}</span><span style="color: #3F4756">{{t.range}}</span><span class="num" style="font-weight: 700">{{t.pledge}}/mo</span></div></sc-for>
</section>
<section aria-labelledby="pv" style="@CARD@; padding: 16px 18px; display: flex; flex-direction: column; gap: 8px">
<h2 id="pv" style="margin: 0; font-size: 16px; font-weight: 700">Privacy and care</h2>
<ul style="margin: 0; padding-left: 18px; font-size: 13px; line-height: 1.55; color: #3F4756">
<li>Giving records reveal religious affiliation, which is sensitive personal information under the Data Privacy Act (RA 10173). They are encrypted and every view is logged.</li>
<li>Only Ptr. Joel and the finance steward see amounts. Each CEO sees only their own giving and receipts.</li>
<li>Staff tithes are deducted from pay only with a signed authorization, and can be stopped at any time.</li>
<li>Reminders are pastoral and never state an amount owed.</li>
</ul>
</section>
</div>
</main>
</div>

<sc-if value="{{hasForm}}" hint-placeholder-val="{{false}}">
<div style="position: absolute; inset: 0; z-index: 50; display: flex; align-items: center; justify-content: center; background: rgba(15,23,42,0.4)">
<div role="dialog" aria-modal="true" aria-labelledby="gift-title" style="width: 440px; display: flex; flex-direction: column; gap: 14px; padding: 24px; background: #FFFFFF; border-radius: 16px; box-shadow: 0 24px 60px rgba(15,23,42,0.28)">
<h2 id="gift-title" style="margin: 0; font-size: 20px; font-weight: 700">Record a gift from {{formName}}</h2>
<div role="group" aria-label="Type of gift" style="display: flex; gap: 4px; padding: 4px; background: #E6E9E2; border-radius: 10px"><sc-for list="{{types}}" as="t" hint-placeholder-count="3"><button type="button" onClick="{{t.pick}}" aria-pressed="{{t.pressed}}" style="{{t.style}}">{{t.label}}</button></sc-for></div>
<label style="display: flex; flex-direction: column; gap: 6px; font-size: 14px; font-weight: 600">Amount (PHP)<input type="text" inputmode="decimal" value="{{amount}}" onChange="{{onAmount}}" placeholder="45,000" style="height: 42px; padding: 0 12px; border-radius: 10px; border: 1px solid #C9CEC4; font-family: inherit; font-size: 16px"></label>
<div style="display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 10px">
<label style="display: flex; flex-direction: column; gap: 6px; font-size: 14px; font-weight: 600">Date<input type="date" value="2026-10-08" style="height: 42px; padding: 0 10px; border-radius: 10px; border: 1px solid #C9CEC4; font-family: inherit; font-size: 14px"></label>
<label style="display: flex; flex-direction: column; gap: 6px; font-size: 14px; font-weight: 600">Received by<select style="height: 42px; padding: 0 10px; border-radius: 10px; border: 1px solid #C9CEC4; background: #FFFFFF; font-family: inherit; font-size: 14px"><option>Bank transfer</option><option>GCash</option><option>Check</option><option>Cash</option></select></label>
</div>
<div style="display: flex; justify-content: flex-end; gap: 8px; padding-top: 4px">
<button type="button" onClick="{{cancel}}" style="@BTN@">Cancel</button>
<button type="button" onClick="{{save}}" style="@BTN_P@">Record and send receipt</button>
</div>
</div>
</div>
</sc-if>

<sc-if value="{{hasToast}}" hint-placeholder-val="{{false}}">
<div role="status" style="position: absolute; left: 50%; bottom: 28px; z-index: 60; transform: translateX(-50%); padding: 12px 18px; border-radius: 12px; background: #1B2230; color: #FFFFFF; font-size: 14px; font-weight: 500; white-space: nowrap; box-shadow: 0 12px 32px rgba(15,23,42,0.3)">{{toast}}</div>
</sc-if>
</div>''', SIDEBAR=sidebar('Giving'), TOPBAR=topbar('Ptr. Joel Santiago', 'Senior Pastor', 'JS', 210), CARD=CARD, BTN=BTN, BTN_P=BTN_P,
             LOCK=svg('lock', 15), PLUS=svg('plus', 15), BELL=svg('bell', 15))
    body = body.replace('\\u2013', '–')
    js = GIVE_JS.replace('__CEOS__', json.dumps(CEOS)).replace('__MONTHS__', json.dumps(MONTHS))
    return page('Tithes and covenant giving', body, js, {'$preview': {'width': 1440, 'height': 1320}})


with open(os.path.join(ROOT, 'Payroll.dc.html'), 'w') as f:
    f.write(payroll())
with open(os.path.join(ROOT, 'Giving.dc.html'), 'w') as f:
    f.write(giving())
print('ok')
