"""gen5.py (follow camera) -> gen6.py (camera modes: Overview / Follow / First person)."""
import os

HERE = os.path.dirname(__file__)
s = open(os.path.join(HERE, 'gen5.py')).read()


def rep(a, b):
    global s
    assert a in s, 'missing: ' + a[:100]
    s = s.replace(a, b)


# --- icons
rep("    'crown':", "    'eye': '<path d=\"M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7-10-7-10-7z\"/><circle cx=\"12\" cy=\"12\" r=\"3\"/>',\n    'crown':")

# --- stage perspective origin from state
rep("perspective: {{persp}}; perspective-origin: 50% 30%; transition: background 600ms, perspective 800ms",
    "perspective: {{persp}}; perspective-origin: {{perspOrigin}}; transition: background 600ms, perspective 700ms, perspective-origin 700ms")

# --- camera transition from state
rep('''<div class="vo-cam" style="width: 800px; height: 620px; transform: {{camTransform}}; transition: transform 850ms cubic-bezier(.25,.7,.25,1)">''',
    '''<div class="vo-cam" style="width: 800px; height: 620px; transform: {{camTransform}}; transition: {{camTransition}}">''')

# --- the single Follow button becomes a three-way walk camera picker
rep('''<button type="button" class="vo-viewbtn" onClick="{{toggleFollow}}" aria-pressed="{{followPressed}}" title="Follow camera: zooms in behind you while you walk" style="{{followBtn}}">@CAM@<span>Follow</span></button>''',
    '''<div role="group" aria-label="Camera while you walk" style="display: flex; align-items: center; gap: 3px; padding: 3px; border-radius: 10px; background: rgba(255,255,255,0.92); box-shadow: 0 1px 3px rgba(27,34,48,0.18)">
<span style="padding: 0 6px 0 4px; font-size: 12px; font-weight: 600; color: #586171">Walk cam</span>
<sc-for list="{{camModes}}" as="m" hint-placeholder-count="3"><button type="button" class="vo-viewbtn" onClick="{{m.pick}}" aria-pressed="{{m.pressed}}" title="{{m.hint}}" style="{{m.style}}">{{m.label}}</button></sc-for>
</div>''')

# HUD shows which camera is riding
rep('''<span class="vo-live" style="width: 8px; height: 8px; border-radius: 999px; background: #4ADE80"></span>{{walkLabel}}</div></sc-if>''',
    '''<span class="vo-live" style="width: 8px; height: 8px; border-radius: 999px; background: #4ADE80"></span>{{walkLabel}}<span style="font-weight: 500; color: rgba(255,255,255,0.7)">{{camLabel}}</span></div></sc-if>
<sc-if value="{{fp}}" hint-placeholder-val="{{false}}"><div aria-hidden="true" style="position: absolute; left: 50%; top: 50%; z-index: 2999; width: 10px; height: 10px; margin: -5px 0 0 -5px; border-radius: 50%; box-shadow: 0 0 0 2px rgba(255,255,255,0.9), 0 0 0 3px rgba(27,34,48,0.35); pointer-events: none"></div></sc-if>''')

# --- props
rep("""        'followCam': {'editor': 'boolean', 'default': True},""",
    """        'walkCamera': {'editor': 'enum', 'options': ['Overview', 'Follow', 'First person'], 'default': 'Follow'},""")

# --- state
rep("""      follow: props.followCam !== false,""",
    """      camMode: props.walkCamera === 'First person' ? 'first' : props.walkCamera === 'Overview' ? 'off' : 'follow',
      follow: props.walkCamera !== 'Overview',""")

# --- camera math
rep("""    const following = st.follow && !!mp && mp.walking;
    const is3d = st.view === '3d' || following;
    const tilt = following ? 64 : this.props.tilt ?? 54;""",
    """    const following = st.follow && !!mp && mp.walking;
    const fp = following && st.camMode === 'first';
    const is3d = st.view === '3d' || following;
    const tilt = fp ? 88 : following ? 64 : this.props.tilt ?? 54;
    const EYE = 36;
    const FP_PERSP = 520;""")

# your own character disappears when the camera is behind your eyes
rep("""opacity 300ms, transform 850ms cubic-bezier(.25,.7,.25,1); opacity: ' + (dimmed(p, status) ? '0.3' : '1'),""",
    """opacity 300ms, transform ' + (fp ? '550ms ease-out' : '850ms cubic-bezier(.25,.7,.25,1)') + '; opacity: ' + (fp && isMe ? '0' : dimmed(p, status) ? '0.3' : '1'),""")

# doors and walls grow to full height in first person so you walk between real rooms
rep("""      const stand = k === 'entrance' ? (is3d ? ' rotateY(90deg) scaleX(6)' : ' rotateY(0deg) scaleX(1)') : (is3d ? ' rotateX(-90deg) scaleY(6)' : ' rotateX(0deg) scaleY(1)');""",
    """      const dh = fp ? 12 : 6;
      const stand = k === 'entrance' ? (is3d ? ' rotateY(90deg) scaleX(' + dh + ')' : ' rotateY(0deg) scaleX(1)') : (is3d ? ' rotateX(-90deg) scaleY(' + dh + ')' : ' rotateX(0deg) scaleY(1)');""")
rep("""      wallH: is3d ? 'rotateX(-90deg) scaleY(1)' : 'rotateX(-90deg) scaleY(0.01)',
      wallV: is3d ? 'rotateY(90deg) scaleX(1)' : 'rotateY(90deg) scaleX(0.01)',""",
    """      wallH: is3d ? 'rotateX(-90deg) scaleY(' + (fp ? 1.9 : 1) + ')' : 'rotateX(-90deg) scaleY(0.01)',
      wallV: is3d ? 'rotateY(90deg) scaleX(' + (fp ? 1.9 : 1) + ')' : 'rotateY(90deg) scaleX(0.01)',""")

# same transform function list in every mode so the camera glides smoothly between them
rep("""      camTransform: following
        ? 'translateY(170px) rotateX(' + tilt + 'deg) rotateZ(' + angle + 'deg) scale3d(1.8, 1.8, 1.8)'
        : is3d
          ? 'translateY(26px) rotateX(' + tilt + 'deg) rotateZ(' + angle + 'deg) scale3d(0.8, 0.8, 0.8)'
          : 'translateY(0px) rotateX(0deg) rotateZ(0deg) scale3d(1, 1, 1)',""",
    """      camTransform: fp
        ? 'translateY(' + EYE + 'px) translateZ(' + (FP_PERSP - 34) + 'px) rotateX(' + tilt + 'deg) rotateZ(' + angle + 'deg) scale3d(1, 1, 1)'
        : following
          ? 'translateY(170px) translateZ(0px) rotateX(' + tilt + 'deg) rotateZ(' + angle + 'deg) scale3d(1.8, 1.8, 1.8)'
          : is3d
            ? 'translateY(26px) translateZ(0px) rotateX(' + tilt + 'deg) rotateZ(' + angle + 'deg) scale3d(0.8, 0.8, 0.8)'
            : 'translateY(0px) translateZ(0px) rotateX(0deg) rotateZ(0deg) scale3d(1, 1, 1)',
      camTransition: fp ? 'transform 550ms ease-out' : 'transform 850ms cubic-bezier(.25,.7,.25,1)',
      perspOrigin: fp ? '50% 50%' : '50% 30%',
      fp: fp,
      camLabel: fp ? 'First person' : following ? 'Follow cam' : '',""")
rep("""      persp: following ? '1100px' : '1700px',""", """      persp: fp ? FP_PERSP + 'px' : following ? '1100px' : '1700px',""")
rep("""      stageBg: is3d ? '#E3E7DF' : '#C4CABF',""", """      stageBg: fp ? '#D6DEE6' : is3d ? '#E3E7DF' : '#C4CABF',""")

# camera mode picker values (replaces the old Follow toggle values)
rep("""      toggleFollow: () => this.setState((s) => ({ follow: !s.follow })),
      followPressed: st.follow ? 'true' : 'false',
      followBtn: 'background: ' + (st.follow ? '#1B2230' : 'rgba(255,255,255,0.92)') + '; color: ' + (st.follow ? '#FFFFFF' : '#1B2230') + '; box-shadow: 0 1px 3px rgba(27,34,48,0.18)',""",
    """      camModes: [
        ['off', 'Off', 'Keep the current view while you walk'],
        ['follow', 'Follow', 'Camera rides behind you while you walk'],
        ['first', 'First person', 'See the office through your own eyes while you walk']
      ].map((m) => ({
        key: m[0],
        label: m[1],
        hint: m[2],
        pressed: st.camMode === m[0] ? 'true' : 'false',
        style: 'background: ' + (st.camMode === m[0] ? '#1B2230' : 'transparent') + '; color: ' + (st.camMode === m[0] ? '#FFFFFF' : '#3F4756'),
        pick: () => this.setState({ camMode: m[0], follow: m[0] !== 'off' })
      })),""")

rep("with Follow on, the camera rides behind you as you walk.", "use Walk cam to ride behind yourself (Follow) or see through your own eyes (First person) as you walk.")

open(os.path.join(HERE, 'gen6.py'), 'w').write(s)
print('patched')
