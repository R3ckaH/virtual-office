"""Turns gen3.py (2D floor) into gen4.py (2D/3D floor with a toggle)."""
import os

HERE = os.path.dirname(__file__)
s = open(os.path.join(HERE, 'gen3.py')).read()


def rep(a, b):
    global s
    assert a in s, 'missing: ' + a[:90]
    s = s.replace(a, b)


# 1. keep the user's height edit on the main column
rep('''<div style="display: flex; flex-direction: column; min-width: 0">
<header style="height: 64px; flex-shrink: 0; display: flex; align-items: center; gap: 22px;''',
    '''<div style="display: flex; flex-direction: column; min-width: 0; height: 985px">
<header style="height: 64px; flex-shrink: 0; display: flex; align-items: center; gap: 22px;''')

# 2. icons
rep("    'crown':", "    'rotl': '<path d=\"M4 12a8 8 0 1 0 2.3-5.7\"/><path d=\"M4 4v4h4\"/>',\n"
    "    'rotr': '<path d=\"M20 12a8 8 0 1 1-2.3-5.7\"/><path d=\"M20 4v4h-4\"/>',\n"
    "    'crown':")

# 3. furniture gets classes so it can rise in 3D (desks/tables), decor lifts slightly
rep('''def span(style):
    return '<span style="' + style + '; pointer-events: none"></span>\'''',
    '''def span(style, cls='vo-furn'):
    return '<span class="' + cls + '" style="' + style + '; pointer-events: none"></span>\'''')
rep('''    out = span('position: absolute; left: %dpx; top: %dpx; width: %dpx; height: 17px;''',
    '''    out = span(cls='vo-desk', style='position: absolute; left: %dpx; top: %dpx; width: %dpx; height: 17px;''')
rep('''    out += span('position: absolute; left: %dpx; top: %dpx; width: 18px; height: 13px; border-radius: 2px 2px 0 0; background: #3B4557; z-index: %d' % (x - 9, y - 25, y + 21))
    out += span('position: absolute; left: %dpx; top: %dpx; width: 4px; height: 4px; border-radius: 50%%; background: #CBD5E1; z-index: %d' % (x - 2, y - 21, y + 22))
    if mug:
        out += span('position: absolute; left: %dpx; top: %dpx; width: 6px; height: 7px; border-radius: 1px 1px 2px 2px; background: #F8FAFC; border: 1px solid #94A3B8; z-index: %d' % (x + 14, y - 16, y + 22))''',
    '''    out += span(cls='vo-desk vo-on', style='position: absolute; left: %dpx; top: %dpx; width: 18px; height: 13px; border-radius: 2px 2px 0 0; background: #3B4557; z-index: %d' % (x - 9, y - 25, y + 21))
    out += span(cls='vo-desk vo-on', style='position: absolute; left: %dpx; top: %dpx; width: 4px; height: 4px; border-radius: 50%%; background: #CBD5E1; z-index: %d' % (x - 2, y - 21, y + 22))
    if mug:
        out += span(cls='vo-desk vo-on', style='position: absolute; left: %dpx; top: %dpx; width: 6px; height: 7px; border-radius: 1px 1px 2px 2px; background: #F8FAFC; border: 1px solid #94A3B8; z-index: %d' % (x + 14, y - 16, y + 22))''')
# big tables and sofas become raised too
for frag in ["width: 226px; height: 46px; border-radius: 23px; background: #6B4A2E",
             "width: 166px; height: 42px; border-radius: 21px; background: #B08968",
             "width: 152px; height: 26px; border-radius: 10px 10px 4px 4px; background: #5B7B8A",
             "width: 160px; height: 16px; border-radius: 6px; background: #6F93A3",
             "width: 106px; height: 22px; border-radius: 10px 10px 4px 4px; background: #D97757",
             "width: 114px; height: 14px; border-radius: 6px; background: #E8906F",
             "width: 44px; height: 26px; border-radius: 50%; background: #B08968",
             "width: 22px; height: 136px; border-radius: 4px; background: #CBD2C8"]:
    i = s.index(frag)
    j = s.rindex("out.append(span('", 0, i)
    s = s[:j] + "out.append(span(cls='vo-desk', style='" + s[j + len("out.append(span('"):]
for frag in ["left: %dpx; top: 100px; width: 14px; height: 10px",
             "left: 70px; top: 318px; width: 18px",
             "left: 140px; top: 320px; width: 14px",
             "left: 535px; top: 494px; width: 16px",
             "left: 540px; top: 500px; width: 6px",
             "left: 536px; top: 530px; width: 14px"]:
    i = s.index(frag)
    j = s.rindex("span('", 0, i)
    s = s[:j] + "span(cls='vo-desk vo-on', style='" + s[j + len("span('"):]


# 4. glass walls that rise in 3D (hidden in 2D)
rep('''def span(style, cls='vo-furn'):''', '''WALL_H = 34


def walls():
    out = []

    def color(rid):
        return {'pastor': '31,58,95', 'ceo': '160,122,30'}.get(rid, '110,124,108')

    def hseg(x1, x2, y, rid):
        if x2 - x1 < 2:
            return
        c = color(rid)
        out.append('<span class="vo-wall" style="position: absolute; left: %dpx; top: %dpx; width: %dpx; height: %dpx; box-sizing: border-box; '
                   'background: rgba(%s,0.16); border-top: 3px solid rgb(%s); transform-origin: 50%% 100%%; pointer-events: none; '
                   'transform: {{wallH}}; opacity: {{wallOpacity}}"></span>' % (x1, y - WALL_H, x2 - x1, WALL_H, c, c))

    def vseg(y1, y2, x, rid):
        if y2 - y1 < 2:
            return
        c = color(rid)
        out.append('<span class="vo-wall" style="position: absolute; left: %dpx; top: %dpx; width: %dpx; height: %dpx; box-sizing: border-box; '
                   'background: rgba(%s,0.16); border-left: 3px solid rgb(%s); transform-origin: 100%% 50%%; pointer-events: none; '
                   'transform: {{wallV}}; opacity: {{wallOpacity}}"></span>' % (x - WALL_H, y1, WALL_H, y2 - y1, c, c))

    for rid, r in ROOMS.items():
        x, y, w, h = r['rect']
        dx, dy, _ = r['door']
        for ey in (y, y + h):
            if dy == ey:
                hseg(x, dx - 19, ey, rid)
                hseg(dx + 19, x + w, ey, rid)
            else:
                hseg(x, x + w, ey, rid)
        vseg(y, y + h, x, rid)
        if rid == 'lobby':
            vseg(y, ENTRANCE[1] - 20, x + w, rid)
            vseg(ENTRANCE[1] + 20, y + h, x + w, rid)
        else:
            vseg(y, y + h, x + w, rid)
    return '\\n'.join(out)


def span(style, cls='vo-furn'):''')

# 5. doors stand up in 3D
rep('''    if not vertical:
        gap = ''', '''    if not vertical:
        org = 'transform-origin: 50% 100%; '
        gap = ''')
rep('''    else:
        gap = 'position: absolute; left: %dpx; top: %dpx; width: 7px; height: 40px;''', '''    else:
        org = 'transform-origin: 100% 50%; '
        gap = 'position: absolute; left: %dpx; top: %dpx; width: 7px; height: 40px;''')
rep('''    return '<span style="%s"></span><span style="%s"></span><span style="%s"></span>' % (gap, pa, pb)''',
    '''    pa = org + pa
    pb = org + pb
    return '<span style="%s"></span><span class="vo-door" style="%s"></span><span class="vo-door" style="%s"></span>' % (gap, pa, pb)''')
s = s.replace("transition: transform 380ms cubic-bezier(.3,.7,.3,1); transform: {{doors.%s.a}}", "transition: transform 380ms cubic-bezier(.3,.7,.3,1); transform: {{doors.%s.a}}")

# 6. room labels lift in 3D
rep('''<span style="position: absolute; left: 6px; top: 6px; display: flex; align-items: center; gap: 6px; padding: 3px 9px 3px 7px;''',
    '''<span class="vo-label" style="position: absolute; left: 6px; top: 6px; display: flex; align-items: center; gap: 6px; padding: 3px 9px 3px 7px;''')

# 7. CSS
rep('''.vo-bell{animation:vo-ring 1.4s ease-in-out infinite;transform-origin:top center}''',
    '''.vo-bell{animation:vo-ring 1.4s ease-in-out infinite;transform-origin:top center}
.vo-plan{transition:transform 900ms cubic-bezier(.2,.7,.2,1),box-shadow 900ms}
.vo-3d,.vo-3d>*,.vo-3d>*>*,.vo-3d .vo-room{transform-style:preserve-3d}
.vo-wall{transition:transform 700ms cubic-bezier(.2,.7,.2,1) 150ms,opacity 300ms}
.vo-furn,.vo-desk,.vo-label{transition:transform 700ms cubic-bezier(.2,.7,.2,1)}
.vo-3d .vo-furn{transform:translateZ(1px)}
.vo-3d .vo-desk{transform:translateZ(16px)}
.vo-3d .vo-desk.vo-on{transform:translateZ(17px)}
.vo-3d .vo-label{transform:translateZ(2px)}
.vo-viewbtn{display:inline-flex;align-items:center;justify-content:center;gap:6px;height:32px;min-width:44px;padding:0 10px;border:0;border-radius:7px;font-family:inherit;font-size:13px;font-weight:700;cursor:pointer}''')
rep('''@media (prefers-reduced-motion: reduce){.vo-char{transition:none!important}''',
    '''@media (prefers-reduced-motion: reduce){.vo-char,.vo-plan,.vo-wall,.vo-furn,.vo-desk,.vo-label{transition:none!important}''')

# 8. the floor plan container: perspective wrapper + view controls + rotating plane
rep('''<div style="padding: 10px; background: #C4CABF; border-radius: 16px">
<div aria-label="Office floor plan" style="position: relative; width: 800px; height: 620px; overflow: hidden; border-radius: 8px; background-color: @HALL@; background-image: radial-gradient(rgba(0,0,0,0.05) 1px, transparent 1px); background-size: 16px 16px">
@ROOMS@
@DOORS@''', '''<div style="position: relative; padding: 10px; background: {{stageBg}}; border-radius: 16px; perspective: 1700px; perspective-origin: 50% 30%; transition: background 600ms">
<div role="group" aria-label="Floor view" style="position: absolute; right: 18px; top: 18px; z-index: 3000; display: flex; align-items: center; gap: 6px">
<sc-if value="{{is3d}}" hint-placeholder-val="{{false}}">
<button type="button" class="vo-viewbtn" onClick="{{rotLeft}}" aria-label="Rotate view left" title="Rotate view left" style="background: rgba(255,255,255,0.92); color: #1B2230; box-shadow: 0 1px 3px rgba(27,34,48,0.18)">@ROTL@</button>
<button type="button" class="vo-viewbtn" onClick="{{rotRight}}" aria-label="Rotate view right" title="Rotate view right" style="background: rgba(255,255,255,0.92); color: #1B2230; box-shadow: 0 1px 3px rgba(27,34,48,0.18)">@ROTR@</button>
</sc-if>
<div style="display: flex; gap: 3px; padding: 3px; border-radius: 10px; background: rgba(255,255,255,0.92); box-shadow: 0 1px 3px rgba(27,34,48,0.18)">
<button type="button" class="vo-viewbtn" onClick="{{to2d}}" aria-pressed="{{pressed2d}}" style="{{btn2d}}">2D</button>
<button type="button" class="vo-viewbtn" onClick="{{to3d}}" aria-pressed="{{pressed3d}}" style="{{btn3d}}">3D</button>
</div>
</div>
<div aria-label="Office floor plan" class="{{planClass}}" style="position: relative; width: 800px; height: 620px; overflow: {{planOverflow}}; border-radius: 8px; background-color: @HALL@; background-image: radial-gradient(rgba(0,0,0,0.05) 1px, transparent 1px); background-size: 16px 16px; transform: {{planTransform}}; box-shadow: {{planShadow}}">
@ROOMS@
@DOORS@
@WALLS@''')
rep("CHAR=CHAR.replace('@BELL@', svg('bell', 10)),", "CHAR=CHAR.replace('@BELL@', svg('bell', 10)), WALLS=walls(), ROTL=svg('rotl', 16), ROTR=svg('rotr', 16),")

# 9. props
rep("""        'walkSpeed': {'editor': 'range', 'default': 1, 'min': 0.5, 'max': 2, 'step': 0.1},""",
    """        'walkSpeed': {'editor': 'range', 'default': 1, 'min': 0.5, 'max': 2, 'step': 0.1},
        'startView': {'editor': 'enum', 'options': ['2D', '3D'], 'default': '2D'},
        'tilt': {'editor': 'range', 'default': 54, 'min': 35, 'max': 65, 'step': 1, 'unit': 'deg'},""")

# 10. JS state and handlers
rep("""      me: 'ana',
      pos: pos,""", """      me: 'ana',
      view: props.startView === '3D' ? '3d' : '2d',
      depth: props.startView === '3D',
      angle: -16,
      pos: pos,""")
rep("""  /* ---------------- doors ---------------- */""", """  /* ---------------- 2D / 3D view ---------------- */

  setView(v) {
    if (v === this.state.view) return;
    clearTimeout(this.flatTimer);
    if (v === '3d') {
      this.setState({ view: '3d', depth: true });
    } else {
      // Keep the 3D context while the camera flattens, then drop it.
      this.setState({ view: '2d' });
      this.flatTimer = setTimeout(() => this.setState({ depth: false }), 950);
    }
  }

  rotate(step) {
    this.setState((s) => ({ angle: Math.max(-60, Math.min(60, s.angle + step)) }));
  }

  /* ---------------- doors ---------------- */""")
rep("""    clearTimeout(this.toastTimer);
  }

  data() {""", """    clearTimeout(this.toastTimer);
    clearTimeout(this.flatTimer);
  }

  data() {""")

# 11. characters billboard in 3D
rep("""    const talkIdx = {};
    const chars = D.PEOPLE""", """    const is3d = st.view === '3d';
    const tilt = this.props.tilt ?? 54;
    const angle = st.angle;
    const billboard = is3d ? 'rotateZ(' + (-angle) + 'deg) rotateX(' + (-tilt) + 'deg)' : 'rotateZ(0deg) rotateX(0deg)';
    const talkIdx = {};
    const chars = D.PEOPLE""")
rep("""        style: 'left: ' + (s.x - 20) + 'px; top: ' + (s.y - 54) + 'px; z-index: ' + (Math.round(s.y) + 10) + '; transition: left ' + s.dur + 'ms linear, top ' + s.dur + 'ms linear, opacity 300ms; opacity: ' + (dimmed(p, status) ? '0.3' : '1'),""",
    """        style: 'left: ' + (s.x - 20) + 'px; top: ' + (s.y - 54) + 'px; z-index: ' + (Math.round(s.y) + 10) + '; transform-origin: 20px 52px; transform: ' + billboard + '; transition: left ' + s.dur + 'ms linear, top ' + s.dur + 'ms linear, opacity 300ms, transform 900ms cubic-bezier(.2,.7,.2,1); opacity: ' + (dimmed(p, status) ? '0.3' : '1'),""")

# 12. doors stand up in 3D
rep("""      const axis = k === 'entrance' ? 'translateY' : 'translateX';
      doors[k] = { a: open ? axis + '(-18px)' : 'none', b: open ? axis + '(18px)' : 'none' };""",
    """      const axis = k === 'entrance' ? 'translateY' : 'translateX';
      const stand = k === 'entrance' ? (is3d ? ' rotateY(90deg) scaleX(6)' : ' rotateY(0deg) scaleX(1)') : (is3d ? ' rotateX(-90deg) scaleY(6)' : ' rotateX(0deg) scaleY(1)');
      doors[k] = { a: axis + '(' + (open ? -18 : 0) + 'px)' + stand, b: axis + '(' + (open ? 18 : 0) + 'px)' + stand };""")

# 13. render values for the view
rep("""    return {
      accent: accent,
      chars: chars,""", """    const btn = (on) => 'background: ' + (on ? '#1B2230' : 'transparent') + '; color: ' + (on ? '#FFFFFF' : '#3F4756');
    return {
      is3d: is3d,
      planClass: 'vo-plan' + (st.depth ? ' vo-3d' : ''),
      planOverflow: st.depth ? 'visible' : 'hidden',
      planTransform: is3d ? 'translateY(26px) rotateX(' + tilt + 'deg) rotateZ(' + angle + 'deg) scale3d(0.8, 0.8, 0.8)' : 'translateY(0px) rotateX(0deg) rotateZ(0deg) scale3d(1, 1, 1)',
      planShadow: is3d ? '0 0 0 8px #AEB6A8, 0 40px 60px rgba(27,34,48,0.25)' : '0 0 0 0 rgba(0,0,0,0)',
      stageBg: is3d ? '#E3E7DF' : '#C4CABF',
      wallH: is3d ? 'rotateX(-90deg) scaleY(1)' : 'rotateX(-90deg) scaleY(0.01)',
      wallV: is3d ? 'rotateY(90deg) scaleX(1)' : 'rotateY(90deg) scaleX(0.01)',
      wallOpacity: is3d ? '1' : '0',
      to2d: () => this.setView('2d'),
      to3d: () => this.setView('3d'),
      pressed2d: is3d ? 'false' : 'true',
      pressed3d: is3d ? 'true' : 'false',
      btn2d: btn(!is3d),
      btn3d: btn(is3d),
      rotLeft: () => this.rotate(-15),
      rotRight: () => this.rotate(15),
      accent: accent,
      chars: chars,""")

# 14. tip text mentions the toggle
rep("Use Preview as to switch to the Senior Pastor and summon the CEOs.", "Switch between 2D and 3D at the top right of the floor. Use Preview as to switch to the Senior Pastor and summon the CEOs.")

open(os.path.join(HERE, 'gen4.py'), 'w').write(s)
print('patched')
