import { Renderer, Stave, StaveNote, Voice, Formatter } from 'vexflow';

console.log("Starting simple VexFlow 5 test...");

function drawTest() {
  const container = document.getElementById('output');
  if (!container) return;

  try {
    const renderer = new Renderer(container, Renderer.Backends.SVG);
    renderer.resize(500, 200);
    const context = renderer.getContext();

    const stave = new Stave(10, 40, 400);
    stave.addClef('treble').setContext(context).draw();

    const notes = [
      new StaveNote({ keys: ["c/4"], duration: "q" }),
      new StaveNote({ keys: ["d/4"], duration: "q" }),
      new StaveNote({ keys: ["e/4"], duration: "q" }),
      new StaveNote({ keys: ["f/4"], duration: "q" })
    ];

    const voice = new Voice({ num_beats: 4, beat_value: 4 });
    voice.addTickables(notes);

    new Formatter().joinVoices([voice]).format([voice], 350);

    voice.draw(context, stave);

    console.log("Simple VexFlow 5 test: Draw successful!");
    const msg = document.createElement('p');
    msg.innerText = "✅ Rendering successful!";
    msg.style.color = "green";
    document.body.appendChild(msg);
  } catch (e) {
    console.error("Simple VexFlow 5 test: Draw failed!", e);
    const msg = document.createElement('p');
    msg.innerText = "❌ Rendering failed: " + e.message;
    msg.style.color = "red";
    document.body.appendChild(msg);
  }
}

window.onload = drawTest;
// Fallback if load event already fired
if (document.readyState === 'complete') drawTest();
