"""gen4.py (2D/3D floor) -> gen5.py (adds a follow camera while you walk)."""
import os

HERE = os.path.dirname(__file__)
s = open(os.path.join(HERE, 'gen4.py')).read()


def rep(a, b):
    global s
    assert a in s, 'missing: ' + a[:100]
    s = s.replace(a, b)


# --- CSS: plan transform transition now comes from state
rep(".vo-plan{transition:transform 900ms cubic-bezier(.2,.7,.2,1),box-shadow 900ms}",
    ".vo-plan{transition:box-shadow 900ms}\n.vo-cam{transform-style:preserve-3d;transform-origin:400px 310px}\n"
    "@keyframes vo-hud{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:none}}\n.vo-hud{animation:vo-hud .35s ease-out}")
rep("@media (prefers-reduced-motion: reduce){.vo-char,.vo-plan,", "@media (prefers-reduced-motion: reduce){.vo-hud{animation:none!important}.vo-char,.vo-plan,.vo-cam,")

# --- stage: clip, perspective from state, camera wrapper, follow button, HUD
rep('''<div style="position: relative; padding: 10px; background: {{stageBg}}; border-radius: 16px; perspective: 1700px; perspective-origin: 50% 30%; transition: background 600ms">''',
    '''<div style="position: relative; padding: 10px; background: {{stageBg}}; border-radius: 16px; overflow: hidden; perspective: {{persp}}; perspective-origin: 50% 30%; transition: background 600ms, perspective 800ms">''')
rep('''<div style="display: flex; gap: 3px; padding: 3px; border-radius: 10px; background: rgba(255,255,255,0.92); box-shadow: 0 1px 3px rgba(27,34,48,0.18)">
<button type="button" class="vo-viewbtn" onClick="{{to2d}}"''',
    '''<button type="button" class="vo-viewbtn" onClick="{{toggleFollow}}" aria-pressed="{{followPressed}}" title="Follow camera: zooms in behind you while you walk" style="{{followBtn}}">@CAM@<span>Follow</span></button>
<div style="display: flex; gap: 3px; padding: 3px; border-radius: 10px; background: rgba(255,255,255,0.92); box-shadow: 0 1px 3px rgba(27,34,48,0.18)">
<button type="button" class="vo-viewbtn" onClick="{{to2d}}"''')
rep('''<div aria-label="Office floor plan" class="{{planClass}}" style="position: relative; width: 800px; height: 620px; overflow: {{planOverflow}}; border-radius: 8px; background-color: @HALL@; background-image: radial-gradient(rgba(0,0,0,0.05) 1px, transparent 1px); background-size: 16px 16px; transform: {{planTransform}}; box-shadow: {{planShadow}}">''',
    '''<sc-if value="{{following}}" hint-placeholder-val="{{false}}"><div class="vo-hud" role="status" style="position: absolute; left: 22px; bottom: 22px; z-index: 3000; display: flex; align-items: center; gap: 10px; padding: 9px 14px; border-radius: 999px; background: rgba(27,34,48,0.88); color: #FFFFFF; font-size: 14px; font-weight: 600; box-shadow: 0 6px 18px rgba(27,34,48,0.3)"><span class="vo-live" style="width: 8px; height: 8px; border-radius: 999px; background: #4ADE80"></span>{{walkLabel}}</div></sc-if>
<div class="vo-cam" style="width: 800px; height: 620px; transform: {{camTransform}}; transition: transform 850ms cubic-bezier(.25,.7,.25,1)">
<div aria-label="Office floor plan" class="{{planClass}}" style="position: relative; width: 800px; height: 620px; overflow: {{planOverflow}}; border-radius: 8px; background-color: @HALL@; background-image: radial-gradient(rgba(0,0,0,0.05) 1px, transparent 1px); background-size: 16px 16px; transform: {{planTransform}}; transition: {{planTransition}}; box-shadow: {{planShadow}}">''')
# close the camera wrapper right after the plan div closes (the plan ends before the ripple sc-if's closing </div>)
rep('''<sc-if value="{{hasFx}}" hint-placeholder-val="{{false}}"><span class="vo-ripple" style="{{ring1}}"></span><span class="vo-ripple" style="{{ring2}}"></span><span class="vo-ripple" style="{{ring3}}"></span></sc-if>
</div>
</div>''', '''<sc-if value="{{hasFx}}" hint-placeholder-val="{{false}}"><span class="vo-ripple" style="{{ring1}}"></span><span class="vo-ripple" style="{{ring2}}"></span><span class="vo-ripple" style="{{ring3}}"></span></sc-if>
</div>
</div>
</div>''')
rep("ROTL=svg('rotl', 16),", "ROTL=svg('rotl', 16), CAM=svg('video', 15),")

# --- props
rep("""        'startView': {'editor': 'enum', 'options': ['2D', '3D'], 'default': '2D'},""",
    """        'startView': {'editor': 'enum', 'options': ['2D', '3D'], 'default': '2D'},
        'followCam': {'editor': 'boolean', 'default': True},""")

# --- state
rep("""      angle: -16,
      pos: pos,""", """      angle: -16,
      follow: props.followCam !== false,
      heading: -16,
      walkLabel: '',
      pos: pos,""")

# --- view switching respects an active follow walk
rep("""      // Keep the 3D context while the camera flattens, then drop it.
      this.setState({ view: '2d' });
      this.flatTimer = setTimeout(() => this.setState({ depth: false }), 950);""",
    """      // Keep the 3D context while the camera flattens, then drop it.
      this.setState({ view: '2d' });
      this.flatTimer = setTimeout(() => {
        if (!this.isFollowing()) this.setState({ depth: false });
      }, 950);""")
rep("""  rotate(step) {""", """  isFollowing() {
    const p = this.state.pos[this.me()];
    return this.state.follow && !!p && p.walking;
  }

  /** Called when your own walk starts or ends, to bring the 3D scene in and out. */
  followWalk(walking) {
    if (!this.state.follow) return;
    clearTimeout(this.flatTimer);
    if (walking) {
      if (!this.state.depth) this.setState({ depth: true });
    } else if (this.state.view === '2d') {
      this.flatTimer = setTimeout(() => {
        if (!this.isFollowing() && this.state.view === '2d') this.setState({ depth: false });
      }, 950);
    }
  }

  rotate(step) {""")

# --- stepAlong: track heading for your character and drive the camera
rep("""      if (i >= pts.length) {
        this.patchPos(id, { walking: false });
        if (done) done();
        return;
      }
      const cur = this.state.pos[id];
      const nx = pts[i][0];
      const ny = pts[i][1];""", """      if (i >= pts.length) {
        this.patchPos(id, { walking: false });
        if (id === this.me()) {
          this.followWalk(false);
          this.setState({ walkLabel: '' });
        }
        if (done) done();
        return;
      }
      const cur = this.state.pos[id];
      const nx = pts[i][0];
      const ny = pts[i][1];
      if (id === this.me()) {
        if (i === 0) {
          this.followWalk(true);
          if (!cur.walking) this.setState({ heading: this.state.angle });
        }
        const dxh = nx - cur.x;
        const dyh = ny - cur.y;
        if (Math.hypot(dxh, dyh) > 1) {
          // Turn the camera so the walking direction points away from the viewer.
          const target = -90 - (Math.atan2(dyh, dxh) * 180) / Math.PI;
          this.setState((s) => {
            const prev = i === 0 && !cur.walking ? s.angle : s.heading;
            const delta = ((((target - prev) % 360) + 540) % 360) - 180;
            return { heading: prev + delta };
          });
        }
      }""")

# --- destination labels
rep("""    this.moveTo(me, rid, () => {
      if (r.kind === 'meeting' || r.kind === 'leaders')""", """    this.setState({ walkLabel: 'Walking to ' + r.name });
    this.moveTo(me, rid, () => {
      if (r.kind === 'meeting' || r.kind === 'leaders')""")
rep("""    this.setState({ knockRoom: null });
    const pts = this.route(me, rid, null);""", """    this.setState({ knockRoom: null, walkLabel: 'Walking to the door of ' + r.name });
    const pts = this.route(me, rid, null);""")
rep("""        this.flash(name + ' let you in.');
        this.moveTo(me, rid, null);""", """        this.flash(name + ' let you in.');
        this.setState({ walkLabel: 'Walking into ' + r.name });
        this.moveTo(me, rid, null);""")
rep("""    if (ps.room !== 'ceo' && ps.target !== 'ceo') {
      homes.pastor = ps.room || 'pastor';
      this.moveTo('pastor', 'ceo', null);""", """    if (ps.room !== 'ceo' && ps.target !== 'ceo') {
      homes.pastor = ps.room || 'pastor';
      if (this.me() === 'pastor') this.setState({ walkLabel: 'Walking to the CEO Strategy Room' });
      this.moveTo('pastor', 'ceo', null);""")

# --- camera math in renderVals
rep("""    const is3d = st.view === '3d';
    const tilt = this.props.tilt ?? 54;
    const angle = st.angle;
    const billboard = is3d ? 'rotateZ(' + (-angle) + 'deg) rotateX(' + (-tilt) + 'deg)' : 'rotateZ(0deg) rotateX(0deg)';""",
    """    const mp = st.pos[me];
    const following = st.follow && !!mp && mp.walking;
    const is3d = st.view === '3d' || following;
    const tilt = following ? 64 : this.props.tilt ?? 54;
    const angle = following ? st.heading : st.angle;
    const billboard = is3d ? 'rotateZ(' + (-angle) + 'deg) rotateX(' + (-tilt) + 'deg)' : 'rotateZ(0deg) rotateX(0deg)';""")
rep("transform-origin: 20px 52px; transform: ' + billboard + '; transition: left ' + s.dur + 'ms linear, top ' + s.dur + 'ms linear, opacity 300ms, transform 900ms cubic-bezier(.2,.7,.2,1);",
    "transform-origin: 20px 52px; transform: ' + billboard + '; transition: left ' + s.dur + 'ms linear, top ' + s.dur + 'ms linear, opacity 300ms, transform 850ms cubic-bezier(.25,.7,.25,1);")
rep("""      planClass: 'vo-plan' + (st.depth ? ' vo-3d' : ''),
      planOverflow: st.depth ? 'visible' : 'hidden',
      planTransform: is3d ? 'translateY(26px) rotateX(' + tilt + 'deg) rotateZ(' + angle + 'deg) scale3d(0.8, 0.8, 0.8)' : 'translateY(0px) rotateX(0deg) rotateZ(0deg) scale3d(1, 1, 1)',""",
    """      planClass: 'vo-plan' + (st.depth || following ? ' vo-3d' : ''),
      planOverflow: st.depth || following ? 'visible' : 'hidden',
      camTransform: following
        ? 'translateY(170px) rotateX(' + tilt + 'deg) rotateZ(' + angle + 'deg) scale3d(1.8, 1.8, 1.8)'
        : is3d
          ? 'translateY(26px) rotateX(' + tilt + 'deg) rotateZ(' + angle + 'deg) scale3d(0.8, 0.8, 0.8)'
          : 'translateY(0px) rotateX(0deg) rotateZ(0deg) scale3d(1, 1, 1)',
      planTransform: following ? 'translate(' + (400 - mp.x) + 'px, ' + (310 - mp.y) + 'px)' : 'translate(0px, 0px)',
      planTransition: following ? 'transform ' + mp.dur + 'ms linear, box-shadow 900ms' : 'transform 850ms cubic-bezier(.25,.7,.25,1), box-shadow 900ms',
      persp: following ? '1100px' : '1700px',
      following: following,
      walkLabel: st.walkLabel || 'On the move',
      toggleFollow: () => this.setState((s) => ({ follow: !s.follow })),
      followPressed: st.follow ? 'true' : 'false',
      followBtn: 'background: ' + (st.follow ? '#1B2230' : 'rgba(255,255,255,0.92)') + '; color: ' + (st.follow ? '#FFFFFF' : '#1B2230') + '; box-shadow: 0 1px 3px rgba(27,34,48,0.18)',""")

rep("Switch between 2D and 3D at the top right of the floor.", "Switch between 2D and 3D at the top right of the floor; with Follow on, the camera rides behind you as you walk.")

open(os.path.join(HERE, 'gen5.py'), 'w').write(s)
print('patched')
