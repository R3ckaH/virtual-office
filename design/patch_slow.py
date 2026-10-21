"""gen5.py -> gen5s.py: slower, gentler camera turns at corners while following."""
import os
HERE = os.path.dirname(__file__)
s = open(os.path.join(HERE, 'gen5.py')).read()
def rep(a, b):
    global s
    assert a in s, 'missing: ' + a[:100]
    s = s.replace(a, b)
rep('''<div class="vo-cam" style="width: 800px; height: 620px; transform: {{camTransform}}; transition: transform 850ms cubic-bezier(.25,.7,.25,1)">''',
    '''<div class="vo-cam" style="width: 800px; height: 620px; transform: {{camTransform}}; transition: {{camTransition}}">''')
rep("opacity 300ms, transform 850ms cubic-bezier(.25,.7,.25,1); opacity:",
    "opacity 300ms, transform ' + camEase + '; opacity:")
rep("""    const billboard = is3d ?""", """    // Corners: turn slowly with a soft ease-in-out so the view never whips around.
    const camEase = following ? '1800ms cubic-bezier(.45,0,.25,1)' : '850ms cubic-bezier(.25,.7,.25,1)';
    const billboard = is3d ?""")
rep("""      persp: following ? '1100px' : '1700px',""", """      persp: following ? '1100px' : '1700px',
      camTransition: 'transform ' + camEase,""")
open(os.path.join(HERE, 'gen5s.py'), 'w').write(s)
print('patched')
