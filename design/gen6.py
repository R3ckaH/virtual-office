"""Covenant Creators animated Office Floor (Main.dc.html). Tokens in templates look like @NAME@."""
import json, os

ROOT = os.path.join(os.path.dirname(__file__), 'project')
W_ROOT, H_ROOT = 1440, 1000


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
    'star': '<path d="M12 3l2.6 5.6 6 .7-4.5 4.1 1.2 6L12 16.4 6.7 19.4l1.2-6L3.4 9.3l6-.7z"/>',
    'bell': '<path d="M6 16V11a6 6 0 0 1 12 0v5l2 2H4z"/><path d="M10 20a2 2 0 0 0 4 0"/>',
    'sofa': '<path d="M4 11V8a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v3"/><path d="M3 11h18v6H3z"/><path d="M5 17v2M19 17v2"/>',
    'rotl': '<path d="M4 12a8 8 0 1 0 2.3-5.7"/><path d="M4 4v4h4"/>',
    'rotr': '<path d="M20 12a8 8 0 1 1-2.3-5.7"/><path d="M20 4v4h-4"/>',
    'eye': '<path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7-10-7-10-7z"/><circle cx="12" cy="12" r="3"/>',
    'crown': '<path d="M4 17l-1-9 5 4 4-6 4 6 5-4-1 9z"/><path d="M4 20h16"/>',
}


def svg(name, size=18):
    return ('<svg width="%d" height="%d" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" '
            'stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">%s</svg>') % (size, size, ICONS[name])


# ------------------------------------------------------------------ floor plan, 800 x 620 ----
# Hallway 1 runs along y=222, hallway 2 along y=442; a connector runs down x=245 between them.
ROOMS = {
    'pastor': dict(name="Senior Pastor's office", kind='private', owner='pastor', icon='star', rect=(0, 0, 230, 200),
                   door=(115, 200, 1), slots=[(115, 92), (62, 172), (168, 172)], reserved={0: 'pastor'}),
    'ceo': dict(name='CEO Strategy Room', kind='leaders', icon='crown', rect=(260, 0, 300, 200), door=(410, 200, 1),
                slots=[(292, 128), (332, 90), (392, 90), (452, 90), (512, 90), (332, 172), (392, 172), (452, 172), (512, 172)],
                reserved={0: 'pastor'}),
    'eng': dict(name='Engineering', kind='dept', icon='users', rect=(590, 0, 210, 200), door=(695, 200, 1),
                slots=[(640, 88), (750, 88), (640, 165), (750, 165), (695, 125)]),
    'huddle': dict(name='Huddle room', kind='meeting', icon='video', rect=(0, 245, 230, 175), door=(115, 245, 1),
                   slots=[(60, 318), (115, 314), (170, 318), (60, 398), (170, 398), (115, 400)]),
    'sales': dict(name='Sales', kind='dept', icon='users', rect=(260, 245, 260, 175), door=(390, 245, 1),
                  slots=[(315, 322), (465, 322), (315, 400), (465, 400), (390, 360)]),
    'lobby': dict(name='Lobby', kind='open', icon='door', rect=(550, 245, 250, 175), door=(675, 245, 1),
                  slots=[(608, 352), (658, 352), (708, 352), (760, 400), (600, 400)]),
    'ops': dict(name='Operations & HR', kind='dept', icon='users', rect=(0, 465, 230, 155), door=(115, 465, 2),
                slots=[(55, 562), (175, 562), (115, 598)]),
    'break': dict(name='Break Room', kind='break', icon='coffee', rect=(260, 465, 300, 155), door=(410, 465, 2),
                  slots=[(300, 590), (350, 590), (428, 528), (478, 528), (512, 592), (455, 600)]),
    'focus': dict(name='Focus booth', kind='private', icon='lock', rect=(590, 465, 210, 155), door=(695, 465, 2),
                  slots=[(645, 565), (750, 565)]),
}
ENTRANCE = (800, 365)

WALL = '#7E8A7C'
HALL = '#DADFD5'

BG = {
    'dept': 'background-color: #F7F3EC; background-image: linear-gradient(90deg, rgba(120,95,60,0.07) 1px, transparent 1px); background-size: 28px 100%',
    'meeting': 'background-color: #ECE8F6',
    'leaders': 'background-color: #F6F0E1; background-image: radial-gradient(rgba(146,108,20,0.10) 1px, transparent 1px); background-size: 12px 12px',
    'private': 'background-color: #F4F1EA; background-image: repeating-linear-gradient(45deg, rgba(0,0,0,0.03) 0 6px, transparent 6px 12px)',
    'pastor': 'background-color: #EFF3F8; background-image: linear-gradient(90deg, rgba(31,58,95,0.06) 1px, transparent 1px); background-size: 24px 100%',
    'break': 'background-color: #F6F6F2; background-image: linear-gradient(45deg, #E8E9E3 25%, transparent 25%, transparent 75%, #E8E9E3 75%), linear-gradient(45deg, #E8E9E3 25%, transparent 25%, transparent 75%, #E8E9E3 75%); background-size: 20px 20px; background-position: 0 0, 10px 10px',
    'open': 'background-color: #EDF2F0',
}


def room_bg(rid, r):
    if rid == 'pastor':
        return BG['pastor']
    return BG.get(r['kind'], BG['dept'])


def room_button(rid, r):
    x, y, w, h = r['rect']
    extra = ''
    if rid == 'huddle':
        extra = '<span style="display: flex; align-items: center; gap: 5px; color: #BE123C; font-weight: 700"><span class="vo-live" style="width: 7px; height: 7px; border-radius: 999px; background: #BE123C"></span>Live</span>'
    if rid == 'ceo':
        extra = '<sc-if value="{{meetingOn}}" hint-placeholder-val="{{false}}"><span style="display: flex; align-items: center; gap: 5px; color: #92400E; font-weight: 700"><span class="vo-live" style="width: 7px; height: 7px; border-radius: 999px; background: #B45309"></span>In session</span></sc-if>'
    name = r['name'].replace('&', '&amp;')
    return R('''<button type="button" class="vo-room" onClick="{{rooms.@ID@.click}}" aria-label="{{rooms.@ID@.aria}}" title="{{rooms.@ID@.aria}}" style="position: absolute; left: @X@px; top: @Y@px; width: @W@px; height: @H@px; box-sizing: border-box; margin: 0; padding: 0; border: 3px solid {{rooms.@ID@.wall}}; border-radius: 6px; cursor: pointer; font-family: inherit; z-index: 1; @BG@">
<span class="vo-label" style="position: absolute; left: 6px; top: 6px; display: flex; align-items: center; gap: 6px; padding: 3px 9px 3px 7px; border-radius: 999px; background: rgba(255,255,255,0.92); color: #1B2230; font-size: 12px; font-weight: 600; white-space: nowrap">@ICON@<span>@NAME@</span><span style="color: #586171; font-weight: 500">{{rooms.@ID@.count}}</span>@EXTRA@<sc-if value="{{rooms.@ID@.isMine}}" hint-placeholder-val="{{false}}"><span style="color: {{accent}}; font-weight: 700">You're here</span></sc-if></span>
</button>
''', ID=rid, X=x, Y=y, W=w, H=h, BG=room_bg(rid, r), ICON=svg(r['icon'], 13), NAME=name, EXTRA=extra)


def sliding_door(key, dx, dy, vertical=False):
    """A doorway in the wall with two glass panels that slide into the wall when someone walks through."""
    if not vertical:
        org = 'transform-origin: 50% 100%; '
        gap = 'position: absolute; left: %dpx; top: %dpx; width: 38px; height: 7px; background: %s; z-index: 2; pointer-events: none' % (dx - 19, dy - 4, HALL)
        pa = 'position: absolute; left: %dpx; top: %dpx; width: 19px; height: 5px; box-sizing: border-box; border-radius: 1px; background: #B7CAD8; border: 1px solid #6F8797; z-index: 4; pointer-events: none; transition: transform 380ms cubic-bezier(.3,.7,.3,1); transform: {{doors.%s.a}}' % (dx - 19, dy - 3, key)
        pb = 'position: absolute; left: %dpx; top: %dpx; width: 19px; height: 5px; box-sizing: border-box; border-radius: 1px; background: #B7CAD8; border: 1px solid #6F8797; z-index: 4; pointer-events: none; transition: transform 380ms cubic-bezier(.3,.7,.3,1); transform: {{doors.%s.b}}' % (dx, dy - 3, key)
    else:
        org = 'transform-origin: 100% 50%; '
        gap = 'position: absolute; left: %dpx; top: %dpx; width: 7px; height: 40px; background: %s; z-index: 2; pointer-events: none' % (dx - 5, dy - 20, HALL)
        pa = 'position: absolute; left: %dpx; top: %dpx; width: 5px; height: 20px; box-sizing: border-box; border-radius: 1px; background: #B7CAD8; border: 1px solid #6F8797; z-index: 4; pointer-events: none; transition: transform 380ms cubic-bezier(.3,.7,.3,1); transform: {{doors.%s.a}}' % (dx - 4, dy - 20, key)
        pb = 'position: absolute; left: %dpx; top: %dpx; width: 5px; height: 20px; box-sizing: border-box; border-radius: 1px; background: #B7CAD8; border: 1px solid #6F8797; z-index: 4; pointer-events: none; transition: transform 380ms cubic-bezier(.3,.7,.3,1); transform: {{doors.%s.b}}' % (dx - 4, dy, key)
    pa = org + pa
    pb = org + pb
    return '<span style="%s"></span><span class="vo-door" style="%s"></span><span class="vo-door" style="%s"></span>' % (gap, pa, pb)


WALL_H = 34


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
    return '\n'.join(out)


def span(style, cls='vo-furn'):
    return '<span class="' + cls + '" style="' + style + '; pointer-events: none"></span>'


def desk(x, y, mug=False, wide=52, wood='#C8A57A', top='#DCBE97'):
    out = span(cls='vo-desk', style='position: absolute; left: %dpx; top: %dpx; width: %dpx; height: 17px; border-radius: 4px; background: %s; box-shadow: inset 0 3px 0 %s, 0 2px 0 rgba(0,0,0,0.12); z-index: %d' % (x - wide // 2, y - 13, wide, wood, top, y + 20))
    out += span(cls='vo-desk vo-on', style='position: absolute; left: %dpx; top: %dpx; width: 18px; height: 13px; border-radius: 2px 2px 0 0; background: #3B4557; z-index: %d' % (x - 9, y - 25, y + 21))
    out += span(cls='vo-desk vo-on', style='position: absolute; left: %dpx; top: %dpx; width: 4px; height: 4px; border-radius: 50%%; background: #CBD5E1; z-index: %d' % (x - 2, y - 21, y + 22))
    if mug:
        out += span(cls='vo-desk vo-on', style='position: absolute; left: %dpx; top: %dpx; width: 6px; height: 7px; border-radius: 1px 1px 2px 2px; background: #F8FAFC; border: 1px solid #94A3B8; z-index: %d' % (x + 14, y - 16, y + 22))
    return out


def plant(x, y):
    return (span('position: absolute; left: %dpx; top: %dpx; width: 24px; height: 20px; border-radius: 50%%; background: #3F8F5A; z-index: %d' % (x - 12, y - 30, y + 9))
            + span('position: absolute; left: %dpx; top: %dpx; width: 14px; height: 12px; border-radius: 50%%; background: #5FAE73; z-index: %d' % (x - 9, y - 32, y + 10))
            + span('position: absolute; left: %dpx; top: %dpx; width: 14px; height: 11px; border-radius: 0 0 4px 4px; background: #B8794F; z-index: %d' % (x - 7, y - 11, y + 10)))


def furniture():
    out = []
    # Senior Pastor's office: rug, executive desk, bookshelf, wall cross, plant
    out.append(span('position: absolute; left: 30px; top: 138px; width: 170px; height: 50px; border-radius: 12px; background: #D9E2EC; z-index: 2'))
    out.append(desk(115, 92, mug=True, wide=76, wood='#7A4E2D', top='#8F6040'))
    out.append(span('position: absolute; left: 140px; top: 10px; width: 80px; height: 16px; border-radius: 3px; background: repeating-linear-gradient(90deg, #7A4E2D 0 10px, #1F3A5F 10px 16px, #B45309 16px 22px, #7A4E2D 22px 30px); z-index: 3'))
    out.append(span('position: absolute; left: 111px; top: 34px; width: 3px; height: 16px; border-radius: 1px; background: #8F6040; z-index: 3'))
    out.append(span('position: absolute; left: 106px; top: 39px; width: 13px; height: 3px; border-radius: 1px; background: #8F6040; z-index: 3'))
    out.append(plant(212, 190))
    # CEO Strategy Room: long table, screen on the wall
    out.append(span(cls='vo-desk', style='position: absolute; left: 310px; top: 84px; width: 226px; height: 46px; border-radius: 23px; background: #6B4A2E; box-shadow: inset 0 5px 0 #7F5937; z-index: 140'))
    for tx in (332, 392, 452, 512):
        out.append(span(cls='vo-desk vo-on', style='position: absolute; left: %dpx; top: 100px; width: 14px; height: 10px; border-radius: 2px; background: #F8FAFC; border: 1px solid #94A3B8; z-index: 141' % (tx - 7)))
    out.append(span('position: absolute; left: 440px; top: 8px; width: 100px; height: 12px; border-radius: 2px; background: #1F2937; box-shadow: inset 0 0 0 2px #334155; z-index: 3'))
    out.append(plant(540, 190))
    # Engineering desks
    for i, (x, y) in enumerate(ROOMS['eng']['slots'][:4]):
        out.append(desk(x, y, mug=(i % 2 == 1)))
    out.append(plant(785, 190))
    # Huddle room: whiteboard, table
    out.append(span('position: absolute; left: 130px; top: 252px; width: 88px; height: 10px; border-radius: 2px; background: #FFFFFF; border: 1px solid #A8B0A5; z-index: 3'))
    out.append(span(cls='vo-desk', style='position: absolute; left: 32px; top: 306px; width: 166px; height: 42px; border-radius: 21px; background: #B08968; box-shadow: inset 0 4px 0 #C49A78; z-index: 360'))
    out.append(span(cls='vo-desk vo-on', style='position: absolute; left: 70px; top: 318px; width: 18px; height: 12px; border-radius: 2px; background: #3B4557; z-index: 361'))
    out.append(span(cls='vo-desk vo-on', style='position: absolute; left: 140px; top: 320px; width: 14px; height: 10px; border-radius: 2px; background: #F8FAFC; border: 1px solid #94A3B8; z-index: 361'))
    # Sales desks
    for i, (x, y) in enumerate(ROOMS['sales']['slots'][:4]):
        out.append(desk(x, y, mug=(i == 1)))
    out.append(plant(505, 412))
    # Lobby: rug, sofa, plants, welcome mat by the entrance
    out.append(span('position: absolute; left: 580px; top: 366px; width: 150px; height: 40px; border-radius: 22px; background: #D7E4DF; z-index: 2'))
    out.append(span(cls='vo-desk', style='position: absolute; left: 582px; top: 306px; width: 152px; height: 26px; border-radius: 10px 10px 4px 4px; background: #5B7B8A; z-index: 326'))
    out.append(span(cls='vo-desk', style='position: absolute; left: 578px; top: 326px; width: 160px; height: 16px; border-radius: 6px; background: #6F93A3; z-index: 327'))
    out.append(span('position: absolute; left: 770px; top: 345px; width: 24px; height: 40px; border-radius: 4px; background: #C7B299; z-index: 2'))
    out.append(plant(568, 412))
    out.append(plant(785, 285))
    # Operations & HR
    out.append(desk(55, 562))
    out.append(desk(175, 562, mug=True))
    out.append(plant(215, 612))
    # Break Room: TV, sofa, round table, coffee counter, rug
    out.append(span('position: absolute; left: 285px; top: 474px; width: 84px; height: 10px; border-radius: 2px; background: #1F2937; box-shadow: inset 0 0 0 2px #334155; z-index: 3'))
    out.append(span('position: absolute; left: 276px; top: 600px; width: 110px; height: 12px; border-radius: 6px; background: #C9A0DC; opacity: .5; z-index: 2'))
    out.append(span(cls='vo-desk', style='position: absolute; left: 276px; top: 562px; width: 106px; height: 22px; border-radius: 10px 10px 4px 4px; background: #D97757; z-index: 575'))
    out.append(span(cls='vo-desk', style='position: absolute; left: 272px; top: 578px; width: 114px; height: 14px; border-radius: 6px; background: #E8906F; z-index: 576'))
    out.append(span(cls='vo-desk', style='position: absolute; left: 432px; top: 526px; width: 44px; height: 26px; border-radius: 50%; background: #B08968; box-shadow: inset 0 3px 0 #C49A78; z-index: 545'))
    out.append(span(cls='vo-desk', style='position: absolute; left: 532px; top: 476px; width: 22px; height: 136px; border-radius: 4px; background: #CBD2C8; box-shadow: inset 4px 0 0 #DDE3DA; z-index: 612'))
    out.append(span(cls='vo-desk vo-on', style='position: absolute; left: 535px; top: 494px; width: 16px; height: 20px; border-radius: 3px; background: #334155; z-index: 613'))
    out.append(span(cls='vo-desk vo-on', style='position: absolute; left: 540px; top: 500px; width: 6px; height: 6px; border-radius: 50%; background: #F59E0B; z-index: 614'))
    out.append(span(cls='vo-desk vo-on', style='position: absolute; left: 536px; top: 530px; width: 14px; height: 14px; border-radius: 50%; background: #E9C46A; z-index: 613'))
    # Focus booth
    out.append(desk(645, 565, mug=True))
    out.append(desk(750, 565))
    return '\n'.join(out)


CHAR = '''<button type="button" class="vo-char" onClick="{{c.pick}}" aria-label="{{c.aria}}" title="{{c.aria}}" style="{{c.style}}">
<span style="{{c.shadowStyle}}"></span>
<span style="{{c.flipStyle}}">
<span class="{{c.bodyClass}}" style="{{c.bodyStyle}}">
<span class="vo-leg-l" style="position: absolute; left: 13px; top: 42px; width: 6px; height: 11px; border-radius: 3px; background: #2F3A4A"></span>
<span class="vo-leg-r" style="position: absolute; left: 21px; top: 42px; width: 6px; height: 11px; border-radius: 3px; background: #2F3A4A"></span>
<span style="{{c.shirtStyle}}"></span>
<span style="{{c.tieStyle}}"></span>
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
<sc-if value="{{c.summoned}}" hint-placeholder-val="{{false}}"><span class="vo-bell" style="position: absolute; left: 1px; top: -14px; display: flex; align-items: center; justify-content: center; width: 16px; height: 16px; border-radius: 50%; background: #B45309; color: #FFFFFF">@BELL@</span></sc-if>
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
    items += ('<span style="display: flex; align-items: center; gap: 6px"><span style="padding: 0 6px; border-radius: 999px; font-size: 10.5px; font-weight: 700; '
              'background: #FFF6DD; color: #7A5200; box-shadow: 0 0 0 1px #D4A017">Name</span>Agency CEO</span>')
    return ('<div style="display: flex; flex-wrap: wrap; align-items: center; gap: 6px 14px; font-size: 12.5px; color: #586171">' + items + '</div>')


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
@keyframes vo-ring{0%,60%,100%{transform:rotate(0)}10%{transform:rotate(-18deg)}20%{transform:rotate(16deg)}30%{transform:rotate(-12deg)}40%{transform:rotate(8deg)}}
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
.vo-bell{animation:vo-ring 1.4s ease-in-out infinite;transform-origin:top center}
.vo-plan{transition:box-shadow 900ms}
.vo-cam{transform-style:preserve-3d;transform-origin:400px 310px}
@keyframes vo-hud{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:none}}
.vo-hud{animation:vo-hud .35s ease-out}
.vo-3d,.vo-3d>*,.vo-3d>*>*,.vo-3d .vo-room{transform-style:preserve-3d}
.vo-wall{transition:transform 700ms cubic-bezier(.2,.7,.2,1) 150ms,opacity 300ms}
.vo-furn,.vo-desk,.vo-label{transition:transform 700ms cubic-bezier(.2,.7,.2,1)}
.vo-3d .vo-furn{transform:translateZ(1px)}
.vo-3d .vo-desk{transform:translateZ(16px)}
.vo-3d .vo-desk.vo-on{transform:translateZ(17px)}
.vo-3d .vo-label{transform:translateZ(2px)}
.vo-viewbtn{display:inline-flex;align-items:center;justify-content:center;gap:6px;height:32px;min-width:44px;padding:0 10px;border:0;border-radius:7px;font-family:inherit;font-size:13px;font-weight:700;cursor:pointer}
@media (prefers-reduced-motion: reduce){.vo-hud{animation:none!important}.vo-char,.vo-plan,.vo-cam,.vo-wall,.vo-furn,.vo-desk,.vo-label{transition:none!important}.vo-idle,.vo-walk,.vo-walk .vo-leg-l,.vo-walk .vo-leg-r,.vo-eye,.vo-steam,.vo-ripple,.vo-live,.vo-bell{animation:none!important}.vo-zzz,.vo-talk{animation:none!important;opacity:1}}
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
      const room = D.ROOMS[p.room];
      let i = taken[p.room] || 0;
      while (room.reserved && room.reserved[i] && room.reserved[i] !== p.id) i += 1;
      if (room.reserved && Object.keys(room.reserved).some((k) => room.reserved[k] === p.id)) {
        i = Number(Object.keys(room.reserved).find((k) => room.reserved[k] === p.id));
      } else {
        taken[p.room] = i + 1;
      }
      const s = room.slots[i];
      pos[p.id] = { x: s[0], y: s[1], room: p.room, target: p.room, slot: i, c: room.door.c, dur: 0, walking: false, facing: 'right', tmp: null };
    });
    // Joy has just clocked in: she starts outside the front door and walks into the Lobby.
    pos.joy = Object.assign({}, pos.joy, { x: 845, y: 368, room: null });
    const now = Date.now();
    this.state = {
      me: 'ana',
      view: props.startView === '3D' ? '3d' : '2d',
      depth: props.startView === '3D',
      angle: -16,
      camMode: props.walkCamera === 'First person' ? 'first' : props.walkCamera === 'Overview' ? 'off' : 'follow',
      follow: props.walkCamera !== 'Overview',
      heading: -16,
      walkLabel: '',
      pos: pos,
      doors: {},
      selected: null,
      myStatus: { ana: 'available', pastor: 'available' },
      filter: 'all',
      knockRoom: null,
      fx: null,
      toast: null,
      meeting: null,
      tick: 0,
      feed: [
        { key: 'f3', text: 'Sprint planning started in the Huddle room', ts: now - 4 * 60000 },
        { key: 'f2', text: 'Grace Lim went on break', ts: now - 6 * 60000 },
        { key: 'f1', text: 'Paolo Aquino turned on Do not disturb', ts: now - 15 * 60000 }
      ]
    };
    this.timers = [];
    this.tokens = {};
    this.doorUntil = {};
    this.feedKey = 10;
  }

  componentDidMount() {
    this.later(() => {
      const slot = this.data().ROOMS.lobby.slots[this.state.pos.joy.slot];
      this.stepAlong('joy', [[800, 368, 'entrance'], [740, 372], slot], () => {
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
    clearTimeout(this.flatTimer);
  }

  data() {
    if (this._data) return this._data;
    this._data = {
      NOW: new Date(Date.UTC(2026, 9, 1, 2, 24)),
      HALL: { 1: 222, 2: 442 },
      CONNECTOR_X: 245,
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
        { id: 'pastor', name: 'Ptr. Joel Santiago', short: 'Ptr. Joel', initials: 'JS', role: 'pastor', title: 'Senior Pastor & Founder', dept: 'Leadership', tz: 'Asia/Manila', status: 'available', room: 'pastor', message: 'Praying over this quarter’s plans' },
        { id: 'andrew', name: 'Andrew Tan', role: 'ceo', agency: 'Harvest Media', title: 'CEO, Harvest Media', dept: 'Agency CEOs', tz: 'Asia/Manila', status: 'available', room: 'lobby' },
        { id: 'rachel', name: 'Rachel Uy', role: 'ceo', agency: 'Kingdom Digital', title: 'CEO, Kingdom Digital', dept: 'Agency CEOs', tz: 'Asia/Manila', status: 'available', room: 'break' },
        { id: 'ben', name: 'Ben Ocampo', role: 'ceo', agency: 'Lighthouse Studio', title: 'CEO, Lighthouse Studio', dept: 'Agency CEOs', tz: 'Asia/Manila', status: 'available', room: 'sales' },
        { id: 'faith', name: 'Faith Castillo', role: 'ceo', agency: 'Mustard Seed Marketing', title: 'CEO, Mustard Seed Marketing', dept: 'Agency CEOs', tz: 'America/New_York', status: 'available', room: 'focus', message: 'Working late from New York' },
        { id: 'ana', name: 'Ana Cruz', title: 'Software Engineer', dept: 'Engineering', tz: 'Asia/Manila', status: 'available', room: 'eng' },
        { id: 'nico', name: 'Nico Ramos', title: 'Backend Engineer', dept: 'Engineering', tz: 'Asia/Manila', status: 'available', room: 'eng' },
        { id: 'tess', name: 'Tess Bautista', title: 'DevOps Engineer', dept: 'Engineering', tz: 'Asia/Manila', status: 'available', room: 'eng', message: 'Shipping the 10:30 release' },
        { id: 'emily', name: 'Emily Carter', title: 'QA Engineer', dept: 'Engineering', tz: 'America/New_York', status: 'away', room: 'eng', message: 'Late shift, back at 11 PM ET' },
        { id: 'jose', name: 'Jose Reyes', title: 'Engineering Lead', dept: 'Engineering', tz: 'Asia/Manila', status: 'meeting', room: 'huddle', message: 'Sprint planning until 10:45' },
        { id: 'bea', name: 'Bea Villanueva', title: 'Frontend Engineer', dept: 'Engineering', tz: 'Asia/Manila', status: 'meeting', room: 'huddle' },
        { id: 'kim', name: 'Kim Navarro', title: 'Operations Analyst', dept: 'Operations', tz: 'Asia/Manila', status: 'meeting', room: 'huddle' },
        { id: 'carlo', name: 'Carlo Mendoza', title: 'Account Executive', dept: 'Sales', tz: 'Asia/Manila', status: 'available', room: 'sales' },
        { id: 'ryan', name: 'Ryan Torres', title: 'Sales Development Rep', dept: 'Sales', tz: 'Asia/Manila', status: 'busy', room: 'sales', message: 'On a client call' },
        { id: 'joy', name: 'Joy Dela Cruz', title: 'Recruiter', dept: 'Human Resources', tz: 'Asia/Manila', status: 'available', room: 'lobby', message: 'Just clocked in' },
        { id: 'maria', name: 'Maria Santos', title: 'Operations Director', dept: 'Operations', tz: 'Asia/Manila', status: 'available', room: 'ops' },
        { id: 'liza', name: 'Liza Garcia', title: 'Support Associate', dept: 'Operations', tz: 'Asia/Manila', status: 'available', room: 'ops' },
        { id: 'grace', name: 'Grace Lim', title: 'HR Specialist', dept: 'Human Resources', tz: 'Asia/Manila', status: 'brk', room: 'break', message: 'Coffee, back by 10:40' },
        { id: 'paolo', name: 'Paolo Aquino', title: 'Junior Engineer', dept: 'Engineering', tz: 'Asia/Manila', status: 'busy', room: 'focus', message: 'Heads down until 11:00' },
        { id: 'daniel', name: 'Daniel Brooks', title: 'Sales Manager', dept: 'Sales', tz: 'America/New_York', status: 'offline', room: null, lastSeen: '6:05 PM' },
        { id: 'sam', name: 'Sam Porter', title: 'Account Executive', dept: 'Sales', tz: 'America/New_York', status: 'offline', room: null, lastSeen: '5:48 PM' }
      ]
    };
    this._data.CEOS = this._data.PEOPLE.filter((p) => p.role === 'ceo').map((p) => p.id);
    return this._data;
  }

  /* ---------------- helpers ---------------- */

  later(fn, ms) {
    const t = setTimeout(fn, ms);
    this.timers.push(t);
    if (this.timers.length > 300) this.timers = this.timers.slice(-150);
    return t;
  }

  flash(msg) {
    clearTimeout(this.toastTimer);
    this.setState({ toast: msg });
    this.toastTimer = setTimeout(() => this.setState({ toast: null }), 3600);
  }

  log(text) {
    this.feedKey += 1;
    const item = { key: 'k' + this.feedKey, text: text, ts: Date.now() };
    this.setState((s) => ({ feed: [item].concat(s.feed).slice(0, 4) }));
  }

  hash(name) {
    let h = 0;
    for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) >>> 0;
    return h;
  }

  person(id) {
    return this.data().PEOPLE.find((p) => p.id === id);
  }

  short(id) {
    const p = this.person(id);
    return p.short || p.name.split(' ')[0];
  }

  me() {
    return this.state.me;
  }

  isLeader(id) {
    const p = this.person(id);
    return p.role === 'pastor' || p.role === 'ceo';
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
    const p = this.person(id);
    const s = this.state.pos[id];
    if (p.status === 'offline') return 'offline';
    const kind = s && s.room ? D.ROOMS[s.room].kind : null;
    if (kind === 'meeting' || kind === 'leaders') return 'meeting';
    if (kind === 'break') return 'brk';
    if (s && s.tmp) return s.tmp;
    if (this.state.myStatus[id]) return this.state.myStatus[id];
    return p.status;
  }

  /* ---------------- 2D / 3D view ---------------- */

  setView(v) {
    if (v === this.state.view) return;
    clearTimeout(this.flatTimer);
    if (v === '3d') {
      this.setState({ view: '3d', depth: true });
    } else {
      // Keep the 3D context while the camera flattens, then drop it.
      this.setState({ view: '2d' });
      this.flatTimer = setTimeout(() => {
        if (!this.isFollowing()) this.setState({ depth: false });
      }, 950);
    }
  }

  isFollowing() {
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

  rotate(step) {
    this.setState((s) => ({ angle: Math.max(-60, Math.min(60, s.angle + step)) }));
  }

  /* ---------------- doors ---------------- */

  openDoor(key, ms) {
    const until = Date.now() + ms;
    if ((this.doorUntil[key] || 0) < until) this.doorUntil[key] = until;
    if (!this.state.doors[key]) this.setState((s) => ({ doors: Object.assign({}, s.doors, { [key]: true }) }));
    this.later(() => {
      if (Date.now() >= this.doorUntil[key] - 30) this.setState((s) => ({ doors: Object.assign({}, s.doors, { [key]: false }) }));
    }, ms);
  }

  /* ---------------- movement ---------------- */

  patchPos(id, patch) {
    this.setState((s) => {
      const next = Object.assign({}, s.pos);
      next[id] = Object.assign({}, s.pos[id], patch);
      return { pos: next };
    });
  }

  /** Walks through a list of [x, y, doorKey?] points. Doors slide open as the walker reaches them. */
  stepAlong(id, pts, done) {
    const token = (this.tokens[id] = (this.tokens[id] || 0) + 1);
    const go = (i) => {
      if (this.tokens[id] !== token) return;
      if (i >= pts.length) {
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
      }
      const ms = Math.max(80, Math.round(Math.hypot(nx - cur.x, ny - cur.y) / this.speed()));
      const facing = nx < cur.x - 1 ? 'left' : nx > cur.x + 1 ? 'right' : cur.facing;
      if (pts[i][2]) {
        const key = pts[i][2];
        this.later(() => this.openDoor(key, 1500), Math.max(0, ms - 650));
      }
      if (i > 0 && pts[i - 1][2]) this.openDoor(pts[i - 1][2], Math.min(ms, 700) + 500);
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
      pts.push([d.x, d.y, p.room]);
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
      pts.push([t.x, t.y, toRoom]);
      pts.push(D.ROOMS[toRoom].slots[slotIdx]);
    }
    return pts;
  }

  freeSlot(room, forId) {
    const R = this.data().ROOMS[room];
    const reserved = R.reserved || {};
    const used = {};
    Object.keys(this.state.pos).forEach((id) => {
      const q = this.state.pos[id];
      if (id !== forId && q.target === room && q.slot !== null) used[q.slot] = true;
    });
    const mine = Object.keys(reserved).find((k) => reserved[k] === forId);
    if (mine !== undefined && !used[mine]) return Number(mine);
    for (let i = 0; i < R.slots.length; i++) if (!used[i] && !reserved[i]) return i;
    return null;
  }

  moveTo(id, room, done) {
    const D = this.data();
    const slot = this.freeSlot(room, id);
    if (slot === null) {
      if (id === this.me()) this.flash(D.ROOMS[room].name + ' is full right now.');
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
    const me = this.me();
    const pos = this.state.pos[me];
    if (pos.walking) {
      this.flash("You're already on your way.");
      return;
    }
    if (pos.room === rid) {
      this.flash("You're already in " + r.name + '.');
      return;
    }
    if (r.kind === 'leaders' && !this.isLeader(me)) {
      this.flash('The CEO Strategy Room is for the Senior Pastor and agency CEOs.');
      return;
    }
    if (r.kind === 'private' && r.owner !== me) {
      this.setState({ knockRoom: rid });
      return;
    }
    this.setState({ walkLabel: 'Walking to ' + r.name });
    this.moveTo(me, rid, () => {
      if (r.kind === 'meeting' || r.kind === 'leaders') this.flash('You joined the call in ' + r.name + '.');
      else if (r.kind === 'break') this.flash('Enjoy your break. Your status is On break.');
      else this.flash('You walked into ' + r.name + '.');
    });
  }

  sendKnock() {
    const D = this.data();
    const me = this.me();
    const rid = this.state.knockRoom;
    const r = D.ROOMS[rid];
    const d = r.door;
    const inside = Object.keys(this.state.pos).filter((id) => id !== me && this.state.pos[id].room === rid);
    this.setState({ knockRoom: null, walkLabel: 'Walking to the door of ' + r.name });
    const pts = this.route(me, rid, null);
    pts.push([d.x + 26, d.y < D.HALL[d.c] ? d.y + 15 : d.y - 15]);
    this.patchPos(me, { room: null, target: null, slot: null, c: d.c });
    this.stepAlong(me, pts, () => {
      this.setState({ fx: { x: d.x, y: d.y } });
      if (!inside.length) {
        this.flash('No one is in ' + r.name + ' right now.');
        this.later(() => this.setState({ fx: null }), 1600);
        return;
      }
      const host = inside.find((id) => this.effStatus(id) !== 'busy') || inside[0];
      const name = this.short(host);
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
        this.setState({ walkLabel: 'Walking into ' + r.name });
        this.moveTo(me, rid, null);
      }, 2300);
    });
  }

  /* ---------------- CEO summons (Senior Pastor only) ---------------- */

  summon(ids) {
    const D = this.data();
    const homes = Object.assign({}, (this.state.meeting && this.state.meeting.homes) || {});
    const called = Object.assign({}, (this.state.meeting && this.state.meeting.called) || {});
    const ps = this.state.pos.pastor;
    if (ps.room !== 'ceo' && ps.target !== 'ceo') {
      homes.pastor = ps.room || 'pastor';
      if (this.me() === 'pastor') this.setState({ walkLabel: 'Walking to the CEO Strategy Room' });
      this.moveTo('pastor', 'ceo', null);
    }
    let n = 0;
    ids.forEach((id) => {
      const s = this.state.pos[id];
      if (!s || s.room === 'ceo' || s.target === 'ceo') return;
      homes[id] = s.room || s.target || this.person(id).room;
      called[id] = true;
      const delay = 900 + n * 500;
      n += 1;
      this.later(() => {
        this.patchPos(id, { tmp: null });
        this.moveTo(id, 'ceo', () => {
          this.log(this.person(id).name + ' joined the strategy meeting');
          this.setState((st) => {
            if (!st.meeting) return {};
            const c = Object.assign({}, st.meeting.called);
            delete c[id];
            return { meeting: Object.assign({}, st.meeting, { called: c }) };
          });
        });
      }, delay);
    });
    if (!n && ps.room === 'ceo') {
      this.flash('Everyone you called is already here.');
      return;
    }
    this.setState({ meeting: { homes: homes, called: called } });
    const who = ids.length === 1 ? this.person(ids[0]).name : 'the agency CEOs';
    this.log('Ptr. Joel called ' + who + ' to the CEO Strategy Room');
    this.flash(this.me() === 'pastor' ? 'Summoned ' + who + '. They have been notified and are on their way.' : 'Ptr. Joel called ' + who + ' to a strategy meeting.');
  }

  endMeeting() {
    const m = this.state.meeting;
    if (!m) return;
    let n = 0;
    Object.keys(m.homes).forEach((id) => {
      const home = m.homes[id];
      const delay = 300 + n * 400;
      n += 1;
      this.later(() => this.moveTo(id, home, null), delay);
    });
    this.setState({ meeting: null });
    this.log('The strategy meeting ended');
    this.flash('Strategy meeting ended. Everyone is heading back.');
  }

  /* ---------------- ambient office life ---------------- */

  officeLife() {
    if (this.props.officeLife === false) return;
    const order = ['carlo', 'nico', 'liza', 'tess'];
    this.lifeIdx = ((this.lifeIdx || 0) + 1) % order.length;
    const id = order[this.lifeIdx];
    if (id === this.me()) return;
    const s = this.state.pos[id];
    if (!s || s.walking || !s.room || s.room === 'break') return;
    const D = this.data();
    const home = s.room;
    const name = this.short(id);
    this.moveTo(id, 'break', () => {
      this.log(name + ' is taking a coffee break');
      this.later(() => {
        const now = this.state.pos[id];
        if (!now || now.room !== 'break') return;
        this.moveTo(id, home, () => this.log(name + ' is back in ' + D.ROOMS[home].name));
      }, 6000);
    });
  }

  /* ---------------- render ---------------- */

  renderVals() {
    const accent = this.props.accent ?? '#2563EB';
    const showNames = this.props.showNames ?? true;
    const st = this.state;
    const D = this.data();
    const me = st.me;
    const meP = this.person(me);
    const SKIN = ['#F1C7A5', '#E0AC85', '#C68B62', '#9C6644', '#F3D2B8'];
    const HAIR = ['#2B2118', '#4A3222', '#1C1C1C', '#6B4423', '#8A5A2B'];
    const SHIRT = ['#2563EB', '#0F766E', '#B45309', '#7C3AED', '#BE185D', '#15803D', '#334155', '#C2410C'];
    const SUIT = ['#1F2937', '#1E3A5F', '#3F3F46', '#312E81'];
    const HUES = [210, 160, 30, 280, 340, 190, 100, 250];
    const dimmed = (p, status) =>
      (st.filter === 'leaders' && p.role !== 'ceo' && p.role !== 'pastor') || (st.filter === 'available' && status !== 'available');
    const dotCss = (status) => (status === 'away' ? 'background: #FFFFFF; border: 2px solid #6B7280' : 'background: ' + D.STATUS[status].color);
    const called = (st.meeting && st.meeting.called) || {};

    const mp = st.pos[me];
    const following = st.follow && !!mp && mp.walking;
    const fp = following && st.camMode === 'first';
    const is3d = st.view === '3d' || following;
    const tilt = fp ? 88 : following ? 64 : this.props.tilt ?? 54;
    const EYE = 36;
    const FP_PERSP = 520;
    const angle = following ? st.heading : st.angle;
    const billboard = is3d ? 'rotateZ(' + (-angle) + 'deg) rotateX(' + (-tilt) + 'deg)' : 'rotateZ(0deg) rotateX(0deg)';
    const talkIdx = {};
    const chars = D.PEOPLE.filter((p) => st.pos[p.id]).map((p) => {
      const s = st.pos[p.id];
      const status = this.effStatus(p.id);
      const h = this.hash(p.name);
      const hairKind = (h >> 7) % 3;
      const hair = HAIR[(h >> 3) % HAIR.length];
      const isMe = p.id === me;
      const leader = p.role === 'ceo' || p.role === 'pastor';
      const selected = st.selected === p.id;
      const kind = s.room ? D.ROOMS[s.room].kind : null;
      const inMeeting = (kind === 'meeting' || kind === 'leaders') && status === 'meeting';
      let talkDelay = '0s';
      if (inMeeting) {
        const k = talkIdx[s.room] || 0;
        talkIdx[s.room] = k + 1;
        talkDelay = (k * 1.2).toFixed(1) + 's';
      }
      let tag;
      if (isMe) tag = 'background: ' + accent + '; color: #FFFFFF';
      else if (p.role === 'pastor') tag = 'background: #1F3A5F; color: #FFFFFF';
      else if (p.role === 'ceo') tag = 'background: #FFF6DD; color: #7A5200; box-shadow: 0 0 0 1px #D4A017';
      else tag = 'background: rgba(255,255,255,0.95); color: #1B2230; box-shadow: 0 0 0 1px #DCDFD8';
      return {
        key: p.id,
        aria: (isMe ? 'You' : p.name) + (p.role === 'ceo' ? ' (' + p.title + ')' : p.role === 'pastor' ? ' (Senior Pastor)' : '') + ', ' + D.STATUS[status].label + (s.room ? ', in ' + D.ROOMS[s.room].name : ', walking'),
        style: 'left: ' + (s.x - 20) + 'px; top: ' + (s.y - 54) + 'px; z-index: ' + (Math.round(s.y) + 10) + '; transform-origin: 20px 52px; transform: ' + billboard + '; transition: left ' + s.dur + 'ms linear, top ' + s.dur + 'ms linear, opacity 300ms, transform ' + (fp ? '550ms ease-out' : '850ms cubic-bezier(.25,.7,.25,1)') + '; opacity: ' + (fp && isMe ? '0' : dimmed(p, status) ? '0.3' : '1'),
        flipStyle: 'position: absolute; left: 0; top: 0; width: 40px; height: 56px; transform: scaleX(' + (s.facing === 'left' ? '-1' : '1') + ')',
        bodyClass: s.walking ? 'vo-body vo-walk' : 'vo-body vo-idle',
        bodyStyle: 'position: absolute; left: 0; top: 0; width: 40px; height: 56px; animation-delay: -' + ((h % 20) / 10).toFixed(1) + 's' + (status === 'away' ? '; filter: saturate(0.35)' : ''),
        shadowStyle: 'position: absolute; left: 8px; top: 50px; width: 24px; height: 7px; border-radius: 50%; background: ' + (selected ? accent : 'rgba(27,34,48,0.2)') + (selected ? '; box-shadow: 0 0 0 3px ' + accent + '55' : ''),
        shirtStyle: 'position: absolute; left: 10px; top: 27px; width: 20px; height: 18px; border-radius: 9px 9px 4px 4px; background: ' + (leader ? SUIT[h % SUIT.length] : SHIRT[(h >> 5) % SHIRT.length]),
        tieStyle: leader ? 'position: absolute; left: 18px; top: 28px; width: 4px; height: 11px; border-radius: 0 0 2px 2px; background: ' + (p.role === 'pastor' ? '#FFFFFF' : '#B91C1C') : 'display: none',
        skinStyle: 'position: absolute; left: 10px; top: 8px; width: 20px; height: 20px; border-radius: 50%; background: ' + SKIN[h % SKIN.length],
        hairStyle: 'position: absolute; left: 9px; top: 5px; width: 22px; height: 11px; border-radius: 11px 11px 5px 5px; background: ' + (p.role === 'pastor' ? '#6B7280' : hair),
        sideStyle: hairKind === 1 && p.role !== 'pastor' ? 'position: absolute; left: 7px; top: 8px; width: 26px; height: 17px; border-radius: 7px; background: ' + hair : 'display: none',
        bunStyle: hairKind === 2 && p.role !== 'pastor' ? 'position: absolute; left: 15px; top: 0px; width: 10px; height: 9px; border-radius: 50%; background: ' + hair : 'display: none',
        blinkDelay: '-' + ((h % 46) / 10).toFixed(1) + 's',
        badgeStyle: 'position: absolute; left: 28px; top: 2px; width: 11px; height: 11px; box-sizing: border-box; border-radius: 50%; box-shadow: 0 0 0 2px #FFFFFF; ' + dotCss(status),
        badgeBarStyle: status === 'busy' ? 'position: absolute; left: 2px; right: 2px; top: 4.5px; height: 2px; border-radius: 1px; background: #FFFFFF' : 'display: none',
        busy: status === 'busy',
        brk: status === 'brk',
        away: status === 'away',
        talking: inMeeting,
        talkDelay: talkDelay,
        summoned: !!called[p.id],
        tagStyle: (showNames ? '' : 'display: none; ') + 'position: absolute; left: 50%; top: 57px; transform: translateX(-50%); padding: 1px 7px; border-radius: 999px; font-size: 11px; font-weight: 600; line-height: 15px; white-space: nowrap; ' + tag,
        first: isMe ? 'You' : p.short || p.name.split(' ')[0],
        pick: () => this.setState({ selected: p.id })
      };
    });

    const rooms = {};
    Object.keys(D.ROOMS).forEach((rid) => {
      const r = D.ROOMS[rid];
      const n = Object.keys(st.pos).filter((id) => st.pos[id].room === rid).length;
      const mine = st.pos[me].room === rid;
      let action;
      if (mine) action = "You're here";
      else if (r.kind === 'leaders') action = this.isLeader(me) ? 'Click to join' : 'Senior Pastor and agency CEOs only';
      else if (r.kind === 'private') action = r.owner === me ? 'Click to go to your office' : 'Click to knock';
      else if (r.kind === 'meeting') action = n ? 'Click to join the call' : 'Click to start a call';
      else if (r.kind === 'break') action = 'Click to take a break';
      else action = 'Click to walk in';
      rooms[rid] = {
        count: n ? String(n) : '',
        isMine: mine,
        wall: mine ? accent : rid === 'ceo' ? '#A07A1E' : rid === 'pastor' ? '#1F3A5F' : '#7E8A7C',
        aria: r.name + (n ? ', ' + n + (n === 1 ? ' person' : ' people') : ', empty') + '. ' + action,
        click: () => this.roomClick(rid)
      };
    });

    const doors = {};
    Object.keys(D.ROOMS).concat(['entrance']).forEach((k) => {
      const open = !!st.doors[k];
      const axis = k === 'entrance' ? 'translateY' : 'translateX';
      const dh = fp ? 12 : 6;
      const stand = k === 'entrance' ? (is3d ? ' rotateY(90deg) scaleX(' + dh + ')' : ' rotateY(0deg) scaleX(1)') : (is3d ? ' rotateX(-90deg) scaleY(' + dh + ')' : ' rotateX(0deg) scaleY(1)');
      doors[k] = { a: axis + '(' + (open ? -18 : 0) + 'px)' + stand, b: axis + '(' + (open ? 18 : 0) + 'px)' + stand };
    });

    let sel = {};
    const sp = st.selected ? this.person(st.selected) : null;
    if (sp) {
      const s = st.pos[sp.id];
      const status = this.effStatus(sp.id);
      const parts = sp.name.replace('Ptr. ', '').split(' ');
      const hue = HUES[this.hash(sp.name) % HUES.length];
      const offline = status === 'offline';
      const room = s && s.room ? D.ROOMS[s.room] : null;
      const sameRoom = !!room && s.room === st.pos[me].room;
      const message = s && s.room === 'break' && !sp.message ? 'Taking a break' : sp.message || '';
      const isMe = sp.id === me;
      let goLabel = '';
      if (room) {
        if (room.kind === 'leaders') goLabel = this.isLeader(me) ? 'Join the strategy meeting' : '';
        else if (room.kind === 'private') goLabel = room.owner === me ? 'Go to your office' : 'Knock on ' + room.name;
        else if (room.kind === 'meeting') goLabel = 'Join their call';
        else goLabel = 'Walk over to ' + room.name;
      }
      sel = {
        name: isMe ? sp.name + ' (you)' : sp.name,
        title: sp.title,
        dept: sp.role === 'ceo' ? 'Agency CEO' : sp.dept,
        initials: sp.initials || (parts[0][0] + parts[parts.length - 1][0]).toUpperCase(),
        avatarStyle: 'display: flex; align-items: center; justify-content: center; width: 52px; height: 52px; flex-shrink: 0; border-radius: 999px; font-size: 17px; font-weight: 700; background: hsl(' + hue + ' 55% 88%); color: hsl(' + hue + ' 60% 24%)',
        statusLabel: D.STATUS[status].label,
        pillDotStyle: 'width: 10px; height: 10px; border-radius: 999px; box-sizing: border-box; ' + dotCss(status),
        message: message,
        hasMessage: !!message,
        localTime: this.timeIn(sp.tz),
        city: sp.tz.split('/').pop().replace('_', ' '),
        offset: this.offsetOf(sp.tz),
        where: offline ? 'Last seen ' + sp.lastSeen + ' their time' : !room ? (s.walking ? 'On the move' : 'In the hallway') : sameRoom && !isMe ? 'Here with you in ' + room.name : 'In ' + room.name,
        canAct: !isMe && !offline,
        hasGo: !isMe && !offline && !!room && !sameRoom && !!goLabel,
        goLabel: goLabel,
        go: () => (room ? this.roomClick(s.room) : null),
        canSummon: me === 'pastor' && sp.role === 'ceo' && !!s && s.room !== 'ceo' && s.target !== 'ceo',
        summonIt: () => this.summon([sp.id]),
        messageIt: () => this.flash('Opening a chat with ' + this.short(sp.id) + '…'),
        callIt: () => this.flash(status === 'busy' ? this.short(sp.id) + ' is on Do not disturb. Send a message instead?' : 'Calling ' + this.short(sp.id) + '…')
      };
    }

    const myOptions = [['available', 'Available'], ['busy', 'Busy'], ['brk', 'On break'], ['away', 'Away']].map((o) => {
      const on = st.myStatus[me] === o[0];
      return {
        key: o[0],
        label: o[1],
        pressed: on ? 'true' : 'false',
        style: 'display: flex; align-items: center; gap: 8px; height: 38px; padding: 0 12px; border-radius: 10px; font-family: inherit; font-size: 13.5px; font-weight: 600; cursor: pointer; color: #1B2230; background: ' + (on ? '#E8EEFB' : '#FFFFFF') + '; border: ' + (on ? '2px solid ' + accent : '1px solid #C9CEC4'),
        dotStyle: 'width: 10px; height: 10px; border-radius: 999px; box-sizing: border-box; ' + dotCss(o[0]),
        pick: () => this.setState((s) => ({ myStatus: Object.assign({}, s.myStatus, { [me]: o[0] }) }))
      };
    });

    const filters = [['all', 'Everyone'], ['leaders', 'Leaders'], ['available', 'Available now']].map((f) => {
      const on = st.filter === f[0];
      return {
        key: f[0],
        label: f[1],
        pressed: on ? 'true' : 'false',
        style: 'height: 34px; padding: 0 14px; border-radius: 8px; border: 0; font-family: inherit; font-size: 13.5px; font-weight: 600; cursor: pointer; ' + (on ? 'background: #FFFFFF; color: #1B2230; box-shadow: 0 1px 2px rgba(27,34,48,0.12)' : 'background: transparent; color: #586171'),
        pick: () => this.setState({ filter: f[0] })
      };
    });

    const views = [['ana', 'Ana Cruz', 'Employee'], ['pastor', 'Ptr. Joel', 'Senior Pastor']].map((v) => {
      const on = me === v[0];
      return {
        key: v[0],
        label: v[1],
        role: v[2],
        pressed: on ? 'true' : 'false',
        style: 'display: flex; flex-direction: column; align-items: flex-start; justify-content: center; height: 40px; padding: 0 12px; border-radius: 8px; border: 0; font-family: inherit; cursor: pointer; line-height: 1.15; ' + (on ? 'background: #FFFFFF; color: #1B2230; box-shadow: 0 1px 2px rgba(27,34,48,0.14)' : 'background: transparent; color: #586171'),
        pick: () => this.setState({ me: v[0], selected: null, knockRoom: null })
      };
    });

    const offline = D.PEOPLE.filter((p) => p.status === 'offline').map((p) => {
      const parts = p.name.split(' ');
      return {
        key: p.id,
        name: p.name,
        initials: (parts[0][0] + parts[parts.length - 1][0]).toUpperCase(),
        aria: p.name + ', offline, ' + this.timeIn(p.tz) + ' in ' + p.tz.split('/').pop().replace('_', ' '),
        localTime: this.timeIn(p.tz),
        chipStyle: 'display: flex; align-items: center; gap: 8px; height: 32px; padding: 0 12px 0 4px; border-radius: 999px; border: 1px solid ' + (st.selected === p.id ? '#1B2230' : '#DCDFD8') + '; background: #FFFFFF; font-family: inherit; font-size: 13px; color: #1B2230; cursor: pointer; opacity: ' + (dimmed(p, 'offline') ? '0.4' : '1'),
        pick: () => this.setState({ selected: p.id })
      };
    });

    const ceos = D.CEOS.map((id) => {
      const p = this.person(id);
      const s = st.pos[id];
      let where;
      let tone;
      if (s.room === 'ceo') { where = 'In the room'; tone = '#15803D'; }
      else if (s.target === 'ceo') { where = 'On the way'; tone = '#B45309'; }
      else { where = s.room ? 'In ' + D.ROOMS[s.room].name : 'In the hallway'; tone = '#586171'; }
      return { key: id, name: p.name, agency: p.agency, where: where, whereStyle: 'font-size: 12.5px; font-weight: 600; white-space: nowrap; color: ' + tone };
    });
    const ceosHere = D.CEOS.filter((id) => st.pos[id].room === 'ceo').length;

    let knockTitle = '';
    let knockBody = '';
    let knockCta = 'Knock';
    if (st.knockRoom) {
      const room = D.ROOMS[st.knockRoom];
      const inside = Object.keys(st.pos).filter((id) => id !== me && st.pos[id].room === st.knockRoom);
      knockTitle = 'Knock on ' + room.name + '?';
      const host = inside.find((id) => this.effStatus(id) !== 'busy') || inside[0];
      if (!inside.length) {
        knockBody = 'No one is in this room right now.';
        knockCta = 'Walk over anyway';
      } else if (this.effStatus(host) === 'busy') {
        knockBody = this.person(host).name + ' is on Do not disturb. You will walk to the door and they will see your knock when they are free.';
      } else {
        knockBody = 'You will walk to the door and knock. ' + this.person(host).name + ' gets a notification and can let you in.';
      }
    }

    const fx = st.fx;
    const ring = (delay) => (fx ? 'position: absolute; left: ' + fx.x + 'px; top: ' + fx.y + 'px; width: 34px; height: 34px; box-sizing: border-box; border: 3px solid ' + accent + '; border-radius: 50%; z-index: 900; pointer-events: none; animation-delay: ' + delay : 'display: none');

    const mePos = st.pos[me];
    const meKind = mePos.room ? D.ROOMS[mePos.room].kind : null;
    const meNote = meKind === 'meeting' || meKind === 'leaders'
      ? "Showing as In a meeting while you're in " + D.ROOMS[mePos.room].name + '.'
      : meKind === 'break' ? "Showing as On break while you're in the Break Room." : '';
    const hue = HUES[this.hash(meP.name) % HUES.length];
    const meParts = meP.name.replace('Ptr. ', '').split(' ');

    const btn = (on) => 'background: ' + (on ? '#1B2230' : 'transparent') + '; color: ' + (on ? '#FFFFFF' : '#3F4756');
    return {
      is3d: is3d,
      planClass: 'vo-plan' + (st.depth || following ? ' vo-3d' : ''),
      planOverflow: st.depth || following ? 'visible' : 'hidden',
      camTransform: fp
        ? 'translateY(' + EYE + 'px) translateZ(' + (FP_PERSP - 34) + 'px) rotateX(' + tilt + 'deg) rotateZ(' + angle + 'deg) scale3d(1, 1, 1)'
        : following
          ? 'translateY(170px) translateZ(0px) rotateX(' + tilt + 'deg) rotateZ(' + angle + 'deg) scale3d(1.8, 1.8, 1.8)'
          : is3d
            ? 'translateY(26px) translateZ(0px) rotateX(' + tilt + 'deg) rotateZ(' + angle + 'deg) scale3d(0.8, 0.8, 0.8)'
            : 'translateY(0px) translateZ(0px) rotateX(0deg) rotateZ(0deg) scale3d(1, 1, 1)',
      camTransition: fp ? 'transform 550ms ease-out' : 'transform 850ms cubic-bezier(.25,.7,.25,1)',
      perspOrigin: fp ? '50% 50%' : '50% 30%',
      fp: fp,
      camLabel: fp ? 'First person' : following ? 'Follow cam' : '',
      planTransform: following ? 'translate(' + (400 - mp.x) + 'px, ' + (310 - mp.y) + 'px)' : 'translate(0px, 0px)',
      planTransition: following ? 'transform ' + mp.dur + 'ms linear, box-shadow 900ms' : 'transform 850ms cubic-bezier(.25,.7,.25,1), box-shadow 900ms',
      persp: fp ? FP_PERSP + 'px' : following ? '1100px' : '1700px',
      following: following,
      walkLabel: st.walkLabel || 'On the move',
      camModes: [
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
      })),
      planShadow: is3d ? '0 0 0 8px #AEB6A8, 0 40px 60px rgba(27,34,48,0.25)' : '0 0 0 0 rgba(0,0,0,0)',
      stageBg: fp ? '#D6DEE6' : is3d ? '#E3E7DF' : '#C4CABF',
      wallH: is3d ? 'rotateX(-90deg) scaleY(' + (fp ? 1.9 : 1) + ')' : 'rotateX(-90deg) scaleY(0.01)',
      wallV: is3d ? 'rotateY(90deg) scaleX(' + (fp ? 1.9 : 1) + ')' : 'rotateY(90deg) scaleX(0.01)',
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
      chars: chars,
      rooms: rooms,
      doors: doors,
      views: views,
      hasSel: !!sp,
      noSel: !sp,
      sel: sel,
      clearSel: () => this.setState({ selected: null }),
      myOptions: myOptions,
      filters: filters,
      offline: offline,
      feed: st.feed.map((f) => ({ key: f.key, text: f.text, ago: this.ago(f.ts) })),
      summary: Object.keys(st.pos).length + ' in the office, ' + offline.length + ' offline',
      manilaTime: this.timeIn('Asia/Manila'),
      nyTime: this.timeIn('America/New_York'),
      meName: meP.name,
      meRole: me === 'pastor' ? 'Senior Pastor' : 'Employee',
      meInitials: meP.initials || (meParts[0][0] + meParts[meParts.length - 1][0]).toUpperCase(),
      meAvatarStyle: 'display: flex; align-items: center; justify-content: center; width: 32px; height: 32px; border-radius: 999px; font-size: 12px; font-weight: 700; background: hsl(' + hue + ' 55% 88%); color: hsl(' + hue + ' 60% 24%)',
      meWhere: mePos.room ? 'In ' + D.ROOMS[mePos.room].name : mePos.walking ? 'On the move' : 'In the hallway',
      hasMeNote: !!meNote,
      meNote: meNote,
      isPastor: me === 'pastor',
      ceos: ceos,
      meetingOn: !!st.meeting,
      noMeeting: !st.meeting,
      ceosHere: ceosHere,
      ceoTotal: D.CEOS.length,
      meetingBanner: ceosHere + ' of ' + D.CEOS.length + ' agency CEOs are in the room',
      summonAll: () => this.summon(D.CEOS),
      endMeeting: () => this.endMeeting(),
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
        o = {'name': r['name'], 'kind': r['kind'], 'door': {'x': dx, 'y': dy, 'c': c}, 'slots': [list(s) for s in r['slots']]}
        if r.get('owner'):
            o['owner'] = r['owner']
        if r.get('reserved'):
            o['reserved'] = {str(k): v for k, v in r['reserved'].items()}
        out[rid] = o
    return json.dumps(out)


CARD = 'background: #FFFFFF; border: 1px solid #DCDFD8; border-radius: 14px; padding: 16px; display: flex; flex-direction: column; gap: 12px'
BTN2 = 'display: flex; align-items: center; justify-content: center; gap: 8px; height: 38px; border-radius: 10px; border: 1px solid #C9CEC4; background: #FFFFFF; color: #1B2230; font-family: inherit; font-size: 14px; font-weight: 600; cursor: pointer'
GOLD_BTN = 'display: flex; align-items: center; justify-content: center; gap: 8px; height: 40px; border-radius: 10px; border: 1px solid #92400E; background: #92400E; color: #FFFFFF; font-family: inherit; font-size: 14px; font-weight: 700; cursor: pointer'


def build():
    rooms = ''.join(room_button(rid, r) for rid, r in ROOMS.items())
    doors = '\n'.join(sliding_door(rid, r['door'][0], r['door'][1]) for rid, r in ROOMS.items())
    doors += '\n' + sliding_door('entrance', ENTRANCE[0], ENTRANCE[1], vertical=True)
    nav = '\n'.join(nav_item(*n) for n in NAV)
    body = R('''<div style="position: relative; width: @WR@px; height: @HR@px; display: grid; grid-template-columns: 248px minmax(0, 1fr); background: #F4F5F1; color: #1B2230; font-family: 'Figtree', system-ui, sans-serif; overflow: hidden; --vo-accent: {{accent}}">
<nav aria-label="Main" style="display: flex; flex-direction: column; gap: 4px; padding: 20px 12px 16px; background: #1F3A5F; color: #E2E8F0">
<div style="display: flex; align-items: center; gap: 10px; padding: 0 12px 18px">
<span style="display: flex; align-items: center; justify-content: center; width: 34px; height: 34px; border-radius: 9px; background: {{accent}}; color: #FFFFFF; font-size: 15px; font-weight: 700">CC</span>
<span style="display: flex; flex-direction: column; line-height: 1.2"><span style="font-size: 14px; font-weight: 700; color: #FFFFFF">Covenant Creators</span><span style="font-size: 12px; color: rgba(226,232,240,0.65)">Virtual Office</span></span>
</div>
@NAV@
<span style="flex-grow: 1"></span>
@SETTINGS@
</nav>
<div style="display: flex; flex-direction: column; min-width: 0; height: 985px">
<header style="height: 64px; flex-shrink: 0; display: flex; align-items: center; gap: 22px; padding: 0 32px; border-bottom: 1px solid #DCDFD8">
<span style="font-size: 14px"><span style="font-weight: 700">{{manilaTime}}</span> <span style="color: #586171">Manila</span></span>
<span style="font-size: 14px"><span style="font-weight: 700">{{nyTime}}</span> <span style="color: #586171">New York</span></span>
<span style="flex-grow: 1"></span>
<span style="font-size: 12.5px; color: #586171">Preview as</span>
<div style="display: flex; gap: 4px; padding: 3px; background: #E6E9E2; border-radius: 10px">
<sc-for list="{{views}}" as="v" hint-placeholder-count="2"><button type="button" onClick="{{v.pick}}" aria-pressed="{{v.pressed}}" style="{{v.style}}"><span style="font-size: 13px; font-weight: 700">{{v.label}}</span><span style="font-size: 11px; font-weight: 500">{{v.role}}</span></button></sc-for>
</div>
<span style="display: flex; align-items: center; gap: 10px">
<span style="{{meAvatarStyle}}">{{meInitials}}</span>
<span style="display: flex; flex-direction: column; line-height: 1.2"><span style="font-size: 14px; font-weight: 600">{{meName}}</span><span style="font-size: 12px; color: #586171">{{meRole}}</span></span>
</span>
</header>
<main id="floor" style="display: flex; flex-direction: column; gap: 12px; padding: 18px 32px; min-height: 0">
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
<sc-if value="{{meetingOn}}" hint-placeholder-val="{{false}}">
<div role="status" style="display: flex; align-items: center; gap: 12px; width: 820px; box-sizing: border-box; padding: 10px 14px; border-radius: 12px; background: #FFF6DD; border: 1px solid #E7C66A; color: #5C3D00">
<span style="display: flex; align-items: center; justify-content: center; width: 30px; height: 30px; flex-shrink: 0; border-radius: 50%; background: #92400E; color: #FFFFFF">@CROWN16@</span>
<span style="flex-grow: 1; font-size: 14px"><span style="font-weight: 700">Strategy meeting in session.</span> Ptr. Joel called the agency CEOs to the CEO Strategy Room. {{meetingBanner}}.</span>
<sc-if value="{{isPastor}}" hint-placeholder-val="{{false}}"><button type="button" onClick="{{endMeeting}}" style="height: 34px; padding: 0 14px; border-radius: 8px; border: 1px solid #92400E; background: #FFFFFF; color: #92400E; font-family: inherit; font-size: 13px; font-weight: 700; cursor: pointer; white-space: nowrap">End meeting</button></sc-if>
</div>
</sc-if>
<div style="display: flex; gap: 20px; align-items: flex-start; min-height: 0">
<div style="display: flex; flex-direction: column; gap: 10px; flex-shrink: 0">
<div style="position: relative; padding: 10px; background: {{stageBg}}; border-radius: 16px; overflow: hidden; perspective: {{persp}}; perspective-origin: {{perspOrigin}}; transition: background 600ms, perspective 700ms, perspective-origin 700ms">
<div role="group" aria-label="Floor view" style="position: absolute; right: 18px; top: 18px; z-index: 3000; display: flex; align-items: center; gap: 6px">
<sc-if value="{{is3d}}" hint-placeholder-val="{{false}}">
<button type="button" class="vo-viewbtn" onClick="{{rotLeft}}" aria-label="Rotate view left" title="Rotate view left" style="background: rgba(255,255,255,0.92); color: #1B2230; box-shadow: 0 1px 3px rgba(27,34,48,0.18)">@ROTL@</button>
<button type="button" class="vo-viewbtn" onClick="{{rotRight}}" aria-label="Rotate view right" title="Rotate view right" style="background: rgba(255,255,255,0.92); color: #1B2230; box-shadow: 0 1px 3px rgba(27,34,48,0.18)">@ROTR@</button>
</sc-if>
<div role="group" aria-label="Camera while you walk" style="display: flex; align-items: center; gap: 3px; padding: 3px; border-radius: 10px; background: rgba(255,255,255,0.92); box-shadow: 0 1px 3px rgba(27,34,48,0.18)">
<span style="padding: 0 6px 0 4px; font-size: 12px; font-weight: 600; color: #586171">Walk cam</span>
<sc-for list="{{camModes}}" as="m" hint-placeholder-count="3"><button type="button" class="vo-viewbtn" onClick="{{m.pick}}" aria-pressed="{{m.pressed}}" title="{{m.hint}}" style="{{m.style}}">{{m.label}}</button></sc-for>
</div>
<div style="display: flex; gap: 3px; padding: 3px; border-radius: 10px; background: rgba(255,255,255,0.92); box-shadow: 0 1px 3px rgba(27,34,48,0.18)">
<button type="button" class="vo-viewbtn" onClick="{{to2d}}" aria-pressed="{{pressed2d}}" style="{{btn2d}}">2D</button>
<button type="button" class="vo-viewbtn" onClick="{{to3d}}" aria-pressed="{{pressed3d}}" style="{{btn3d}}">3D</button>
</div>
</div>
<sc-if value="{{following}}" hint-placeholder-val="{{false}}"><div class="vo-hud" role="status" style="position: absolute; left: 22px; bottom: 22px; z-index: 3000; display: flex; align-items: center; gap: 10px; padding: 9px 14px; border-radius: 999px; background: rgba(27,34,48,0.88); color: #FFFFFF; font-size: 14px; font-weight: 600; box-shadow: 0 6px 18px rgba(27,34,48,0.3)"><span class="vo-live" style="width: 8px; height: 8px; border-radius: 999px; background: #4ADE80"></span>{{walkLabel}}<span style="font-weight: 500; color: rgba(255,255,255,0.7)">{{camLabel}}</span></div></sc-if>
<sc-if value="{{fp}}" hint-placeholder-val="{{false}}"><div aria-hidden="true" style="position: absolute; left: 50%; top: 50%; z-index: 2999; width: 10px; height: 10px; margin: -5px 0 0 -5px; border-radius: 50%; box-shadow: 0 0 0 2px rgba(255,255,255,0.9), 0 0 0 3px rgba(27,34,48,0.35); pointer-events: none"></div></sc-if>
<div class="vo-cam" style="width: 800px; height: 620px; transform: {{camTransform}}; transition: {{camTransition}}">
<div aria-label="Office floor plan" class="{{planClass}}" style="position: relative; width: 800px; height: 620px; overflow: {{planOverflow}}; border-radius: 8px; background-color: @HALL@; background-image: radial-gradient(rgba(0,0,0,0.05) 1px, transparent 1px); background-size: 16px 16px; transform: {{planTransform}}; transition: {{planTransition}}; box-shadow: {{planShadow}}">
@ROOMS@
@DOORS@
@WALLS@
@FURNITURE@
<sc-for list="{{chars}}" as="c" hint-placeholder-count="6">
@CHAR@
</sc-for>
<sc-if value="{{hasFx}}" hint-placeholder-val="{{false}}"><span class="vo-ripple" style="{{ring1}}"></span><span class="vo-ripple" style="{{ring2}}"></span><span class="vo-ripple" style="{{ring3}}"></span></sc-if>
</div>
</div>
</div>
<div style="display: flex; align-items: center; justify-content: space-between; gap: 12px; width: 820px">
@LEGEND@
<div style="display: flex; align-items: center; gap: 6px">
<span style="font-size: 13px; font-weight: 700">Offline</span>
<sc-for list="{{offline}}" as="o" hint-placeholder-count="2"><button type="button" onClick="{{o.pick}}" aria-label="{{o.aria}}" title="{{o.aria}}" style="{{o.chipStyle}}"><span style="display: flex; align-items: center; justify-content: center; width: 24px; height: 24px; border-radius: 999px; font-size: 10.5px; font-weight: 700; background: #E5E7EB; color: #4B5563">{{o.initials}}</span><span style="font-weight: 600">{{o.name}}</span></button></sc-for>
</div>
</div>
</div>
<aside aria-label="Details" style="flex-grow: 1; min-width: 0; max-height: 790px; overflow-y: auto; display: flex; flex-direction: column; gap: 12px">
<sc-if value="{{hasSel}}" hint-placeholder-val="{{false}}">
<section aria-label="Person details" style="@CARD@">
<div style="display: flex; gap: 12px; align-items: flex-start">
<span style="{{sel.avatarStyle}}">{{sel.initials}}</span>
<div style="flex-grow: 1; min-width: 0">
<h2 style="margin: 0; font-size: 17px; font-weight: 700">{{sel.name}}</h2>
<p style="margin: 2px 0 0; font-size: 13px; color: #586171">{{sel.title}}</p>
</div>
<button type="button" onClick="{{clearSel}}" aria-label="Close details" style="display: flex; align-items: center; justify-content: center; width: 32px; height: 32px; flex-shrink: 0; border: 0; border-radius: 8px; background: transparent; color: #586171; cursor: pointer">@X@</button>
</div>
<span style="display: flex; align-items: center; gap: 8px; align-self: flex-start; height: 28px; padding: 0 12px; border-radius: 999px; background: #F1F2EE; font-size: 13px; font-weight: 600"><span style="{{sel.pillDotStyle}}"></span>{{sel.statusLabel}}</span>
<sc-if value="{{sel.hasMessage}}" hint-placeholder-val="{{false}}"><p style="margin: 0; font-size: 14px; line-height: 1.45">“{{sel.message}}”</p></sc-if>
<dl style="margin: 0; display: grid; grid-template-columns: auto minmax(0, 1fr); gap: 6px 12px; font-size: 13.5px">
<dt style="color: #586171">Local time</dt><dd style="margin: 0"><span style="font-weight: 600">{{sel.localTime}}</span> in {{sel.city}} ({{sel.offset}})</dd>
<dt style="color: #586171">Where</dt><dd style="margin: 0">{{sel.where}}</dd>
</dl>
<sc-if value="{{sel.canSummon}}" hint-placeholder-val="{{false}}"><button type="button" onClick="{{sel.summonIt}}" style="@GOLD_BTN@">@BELL16@Summon to the Strategy Room</button></sc-if>
<sc-if value="{{sel.canAct}}" hint-placeholder-val="{{false}}">
<div style="display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 8px">
<button type="button" onClick="{{sel.messageIt}}" style="@BTN2@">@CHAT@Message</button>
<button type="button" onClick="{{sel.callIt}}" style="@BTN2@">@PHONE@Call</button>
</div>
</sc-if>
<sc-if value="{{sel.hasGo}}" hint-placeholder-val="{{false}}"><button type="button" onClick="{{sel.go}}" style="height: 38px; border-radius: 10px; border: 1px solid {{accent}}; background: {{accent}}; color: #FFFFFF; font-family: inherit; font-size: 14px; font-weight: 600; cursor: pointer">{{sel.goLabel}}</button></sc-if>
</section>
</sc-if>
<sc-if value="{{isPastor}}" hint-placeholder-val="{{false}}">
<section aria-label="CEO Strategy Room" style="@CARD@; border-color: #E7C66A; background: #FFFCF3">
<div style="display: flex; align-items: center; gap: 8px"><span style="display: flex; color: #92400E">@CROWN16@</span><h2 style="margin: 0; font-size: 15px; font-weight: 700">CEO Strategy Room</h2></div>
<p style="margin: 0; font-size: 13px; line-height: 1.45; color: #4B3A1A">Call the agency CEOs in. They get a notification and walk over, and the meeting shows on everyone's floor.</p>
<ul style="margin: 0; padding: 0; list-style: none; display: flex; flex-direction: column; gap: 8px">
<sc-for list="{{ceos}}" as="c" hint-placeholder-count="4"><li style="display: flex; align-items: center; gap: 8px; font-size: 13px"><span style="flex-grow: 1; min-width: 0"><span style="display: block; font-weight: 600">{{c.name}}</span><span style="display: block; font-size: 12px; color: #6B5B3A">{{c.agency}}</span></span><span style="{{c.whereStyle}}">{{c.where}}</span></li></sc-for>
</ul>
<sc-if value="{{noMeeting}}" hint-placeholder-val="{{true}}"><button type="button" onClick="{{summonAll}}" style="@GOLD_BTN@">@BELL16@Summon all CEOs</button></sc-if>
<sc-if value="{{meetingOn}}" hint-placeholder-val="{{false}}"><button type="button" onClick="{{endMeeting}}" style="@BTN2@">End strategy meeting</button></sc-if>
</section>
</sc-if>
<sc-if value="{{noSel}}" hint-placeholder-val="{{true}}">
<section aria-label="Tip" style="@CARD@; border-style: dashed; background: transparent">
<p style="margin: 0; font-size: 13.5px; line-height: 1.5; color: #586171">Click a room and your character walks there; the doors slide open as you pass. Private offices need a knock. Switch between 2D and 3D at the top right of the floor; use Walk cam to ride behind yourself (Follow) or see through your own eyes (First person) as you walk. Use Preview as to switch to the Senior Pastor and summon the CEOs.</p>
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
<sc-if value="{{hasMeNote}}" hint-placeholder-val="{{false}}"><p style="margin: 0; font-size: 13px; font-weight: 600; color: #6D28D9">{{meNote}}</p></sc-if>
</section>
<section aria-label="Around the office" style="@CARD@">
<h2 style="margin: 0; font-size: 15px; font-weight: 700">Around the office</h2>
<ul style="margin: 0; padding: 0; list-style: none; display: flex; flex-direction: column; gap: 9px">
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
''', WR=W_ROOT, HR=H_ROOT, NAV=nav, SETTINGS=nav_item('settings', 'Settings', False), HALL=HALL, ROOMS=rooms, DOORS=doors,
             FURNITURE=furniture(), CHAR=CHAR.replace('@BELL@', svg('bell', 10)), WALLS=walls(), ROTL=svg('rotl', 16), CAM=svg('video', 15), ROTR=svg('rotr', 16), LEGEND=legend(), CARD=CARD, BTN2=BTN2, GOLD_BTN=GOLD_BTN,
             X=svg('x'), CHAT=svg('chat', 16), PHONE=svg('phone', 16), BELL16=svg('bell', 16), CROWN16=svg('crown', 16))

    props = {
        'accent': {'editor': 'color', 'default': '#2563EB', 'options': ['#2563EB', '#0F766E', '#7C3AED', '#C2410C']},
        'showNames': {'editor': 'boolean', 'default': True},
        'officeLife': {'editor': 'boolean', 'default': True},
        'walkSpeed': {'editor': 'range', 'default': 1, 'min': 0.5, 'max': 2, 'step': 0.1},
        'startView': {'editor': 'enum', 'options': ['2D', '3D'], 'default': '2D'},
        'walkCamera': {'editor': 'enum', 'options': ['Overview', 'Follow', 'First person'], 'default': 'Follow'},
        'tilt': {'editor': 'range', 'default': 54, 'min': 35, 'max': 65, 'step': 1, 'unit': 'deg'},
        '$preview': {'width': W_ROOT, 'height': H_ROOT},
    }
    head = ('<!doctype html>\n<html lang="en">\n<head>\n<meta charset="utf-8">\n<title>Covenant Creators Office Floor</title>\n'
            '<script src="./support.js"></script>\n</head>\n<body>\n<x-dc>\n<helmet>\n'
            '<link rel="preconnect" href="https://fonts.googleapis.com">\n'
            '<link href="https://fonts.googleapis.com/css2?family=Figtree:wght@400;500;600;700&amp;display=swap" rel="stylesheet">\n'
            '<style>' + CSS + '</style>\n</helmet>\n')
    script = ("<script type=\"text/x-dc\" data-dc-script data-props='" + json.dumps(props) + "'>"
              + JS.replace('__ROOMS__', js_rooms()) + '</script>\n')
    return head + body + '</x-dc>\n' + script + '</body>\n</html>\n'


html = build()
assert "'" not in json.dumps({'x': 1})
with open(os.path.join(ROOT, 'Main.dc.html'), 'w') as f:
    f.write(html)
print('ok', len(html))
