/**
 * مواصفات توليد الفن — المصدر الوحيد لكل موجّه يُرسل إلى GPT Image.
 *
 * كتلة الأسلوب واحدة لكل الأصول، فأي تعديل عليها يعيد توليد اللعبة كلها
 * بأسلوب متسق. لا تكتب موجّهًا خارج هذا الملف.
 */

/** كتلة الأسلوب المشتركة — لا تُعدَّل إلا لتغيير الهوية البصرية كاملة. */
export const STYLE = `PROPORTIONS - THIS IS THE MOST IMPORTANT RULE: the whole figure is EXACTLY 3 HEADS TALL. The head is ENORMOUS, one third of the total height, as wide as the shoulders. The body is short and stubby, arms and legs are short and simple. This is a stylised big-headed mascot, absolutely NOT realistic human anatomy. If the figure looks like a normally proportioned adult, it is WRONG.

STYLE: early-2000s American TV action-cartoon. Bold uniform ink outline on every single shape, thick marker-pen weight, outline colour is DARK NAVY BLUE (hex #101A35) - never pure black. Completely FLAT cel shading: each colour is one solid fill plus at most ONE hard-edged darker shadow shape. Absolutely NO gradients, NO airbrush, NO soft blending, NO fabric texture, NO rendering, NO glossy highlights. Enormous expressive cartoon eyes with clean white sclera and big round dark pupils, taking up a large part of the face. Thick simple eyebrows. Minimal detail - no buttons, no pockets, no seams. Extremely strong readable silhouette that stays legible when shrunk to 50 pixels tall.

Plain flat solid mid-grey background #808080, absolutely nothing else. No ground shadow, no props, no text, no logo, no watermark, no border, no frame. Figure centred with generous empty margin on all four sides.`;

/** أوصاف الشخصيات — مطابقة لـ src/game/roster.ts */
export const CHARACTERS = {
  faisal:
    'A Saudi man in his 30s. Crisp white thobe, red-and-white checkered shemagh with black agal, warm brown skin, short full black beard.',
  noura:
    'A Saudi woman in her late 20s. Navy-blue abaya over smart work clothes, light teal tarha headscarf worn loosely so the front of her dark wavy hair shows, light-tan skin, round dark-rimmed glasses.',
  majed:
    'A Saudi man in his 30s, broad heavy build, deep brown skin. Teal-green polo shirt, dark trousers, very short buzz-cut black hair, light stubble, a work ID badge on a yellow lanyard around his neck.',
  lama: 'A Saudi woman in her 30s, fair skin, auburn-brown hair pulled into a neat high bun. Deep plum-burgundy tailored blazer over a pale blouse, dark trousers, small gold hoop earring.',
  saud: 'A Saudi man in his 40s, slim, medium brown skin. Off-white thobe and a plain WHITE ghutra headdress with black agal. Neat black moustache and NO beard.',
  reem: 'A Saudi woman in her 20s, warm tan skin. Dark navy abaya over work clothes, a teal-green hijab fully covering her hair.',
  tariq:
    'A Saudi man in his 20s, slim, dark brown skin. Blue-violet hoodie, dark jeans, short curly black hair, light stubble, large orange over-ear headphones resting around his neck.',
  hessa:
    'A Saudi woman in her 30s, sturdy broad build, light golden skin. Rust-coral button shirt, dark wide trousers, dark brown hair in a high ponytail, rectangular glasses.',
  bandar:
    'A Saudi man in his 30s, broad build, medium brown skin. Crisp white thobe, plain WHITE checkered shemagh with black agal, full short black beard.',
  jood: 'A Saudi young woman, 19 years old, slim, very fair skin. Bright purple hoodie, black jeans, chestnut-brown hair with a straight blunt fringe, a yellow baseball cap worn forward.',
};

/**
 * الحالات التسع. كل حالة تصف الوضعية والتعبير فقط — الهوية تأتي من صورة
 * مرجعية للحالة العادية حتى تبقى الشخصية نفسها عبر الحالات.
 */
export const STATES = {
  idle: 'POSE: standing squarely facing the viewer, short arms hanging relaxed at the sides, feet together. EXPRESSION: calm, friendly, eyes open, small pleasant smile.',
  asleep:
    'POSE: standing but fast asleep, head tilted over to one shoulder, arms limp at the sides, body slumped slightly. EXPRESSION: both eyes closed as simple curved lines, mouth a small open oval, deeply asleep.',
  startled:
    'POSE: recoiling backwards in shock, both short arms flung up and out beside the head, shoulders raised. EXPRESSION: hugely wide open eyes with tiny pupils, eyebrows shot up high, mouth wide open in a gasp.',
  suspicious:
    'POSE: leaning forward, one short arm folded across the chest, head tilted, narrowing in on someone. EXPRESSION: heavily narrowed suspicious eyes, one eyebrow raised much higher than the other, mouth a flat skeptical line.',
  hiding:
    'POSE: turned slightly away, glancing sideways over the shoulder, one short hand raised beside the mouth as if hiding a secret, other arm tucked behind the back. EXPRESSION: eyes glancing hard to the side, sly guilty smirk, a single sweat drop on the temple.',
  victory:
    'POSE: both short arms thrown straight up in the air in triumph, one leg kicked up, jumping with joy. EXPRESSION: eyes squeezed shut into happy upward arcs, enormous open celebrating grin, rosy blush on both cheeks.',
  defeat:
    'POSE: shoulders slumped heavily, head hanging down and forward, both arms dangling limply, knees slightly bent. EXPRESSION: droopy defeated half-closed eyes, eyebrows sloping down at the outer edges, big downturned frown.',
  'look-right':
    'POSE: standing still, head turned sharply to the character right, body still facing forward. EXPRESSION: both eyes and pupils looking far to the character right, curious alert look, small closed mouth.',
  'look-left':
    'POSE: standing still, head turned sharply to the character left, body still facing forward. EXPRESSION: both eyes and pupils looking far to the character left, curious alert look, small closed mouth.',
};

export function characterPrompt(characterId, stateId) {
  return `A CHIBI CARTOON MASCOT character.\n\nCHARACTER: ${CHARACTERS[characterId]}\n\n${STATES[stateId]}\n\n${STYLE}`;
}

/**
 * أيقونة التطبيق.
 *
 * لا تستعمل كتلة `STYLE` كما هي: تلك تفرض خلفية رمادية مسطّحة وهامشًا حول
 * شخصية واحدة، والأيقونة عكس ذلك تمامًا — ملء الإطار من حافة إلى حافة.
 * فقرة الأسلوب هنا مكرّرة عمدًا بما يخص الأيقونة وحدها.
 *
 * الفكرة: خمسة موظفين يتحلّقون حول الملف كأنهم يطلّون عليه، والخلفية مكتب
 * بدرجات زرقاء. يملؤون الإطار كله.
 *
 * **التعابير أهم سطر في هذا الموجّه.** أول جيل جاء بحواجب مائلة للأسفل في كل
 * الوجوه، فقرأت الأيقونة كغضب وعِراك — وهو انطباع خاطئ عن لعبة اجتماعية مرحة.
 * المطلوب فضول وحيرة: حواجب مرفوعة، عيون متسعة، إصبع على الذقن، ابتسامات
 * خفيفة. المنع هنا صريح ومكرّر لأن النموذج يميل إلى الغضب افتراضيًا.
 *
 * الخلفية زرقاء بالكامل عمدًا: مكتب يُقرأ كمكان عمل لكنه داكن ومنخفض التباين،
 * فيبقى الملف الذهبي أسطع شيء في الأيقونة ويظلّ مميّزًا عند 32px.
 *
 * الملف المعتمد `art/app-icon-source.png` وُلِّد خارج هذا الأنبوب (تعذّر
 * استدعاء أداة التوليد)، وهذا الموجّه هو مرجعه لإعادة التوليد.
 */
export const APP_ICON_PROMPT = `A SQUARE MOBILE APP ICON, flat vector cartoon. Full-bleed, edge to edge, NO border, NO frame, NO rounded corners, NO text, NO letters, NO watermark.

COMPOSITION: FIVE big-headed cartoon characters crowd in from all sides of the square and FILL THE FRAME, cropped by the edges - one leaning in from the TOP, one from the UPPER LEFT, one from the RIGHT, one from the LOWER LEFT, one from the BOTTOM. Their heads and shoulders cover the corners. They lean inward around a folder in the centre, like colleagues huddling over a desk to peek at something.

EXPRESSIONS - CRITICAL: they are CURIOUS and PUZZLED, never angry. This is a light-hearted party game, not a confrontation. Eyebrows are RAISED HIGH and CURVED in surprise and interest. ABSOLUTELY NO angry eyebrows, NO eyebrows slanted down toward the nose, NO furrowed brow, NO scowl, NO glare, NO frown, NO menacing look. If any face looks angry or stern, it is WRONG. Big round eyes wide open with curiosity, pupils looking toward the folder. Mouths: two small soft smiles, one small round 'oh' of surprise, two neutral relaxed. One character rests a finger on the chin thinking, one tilts the head. Overall mood: playful intrigue, amused wondering.

CENTRE: a chunky MANILA FOLDER stands upright in the middle, about one quarter of the square, warm golden-yellow (#E8A93A) flat fill, crisp white paper sheets poking out of the top, a bold RED WAX SEAL with a white CHECK MARK on its face, two darker golden horizontal bars below. It is the brightest thing in the image and fully visible.

CHARACTERS: modern Saudi office colleagues. Two men in crisp white thobes - one red-and-white checkered shemagh, one plain white ghutra, both black agal. Three women in coloured abayas: one teal headscarf, one plum headscarf, and one in a dark navy niqab with only her expressive eyes showing. Varied skin tones.

PROPORTIONS: chibi mascots, head ENORMOUS relative to body, as wide as the shoulders. NOT realistic anatomy.

BACKGROUND - an OFFICE INTERIOR entirely in BLUE SHADES: simplified flat shapes of desks, desktop monitors, a shelf with binders, tall window blinds, all in a narrow range of muted blues from deep midnight navy to dusty steel blue. Reads as a modern workplace but stays dark, low-contrast and quiet so the characters and golden folder pop. Visible only in the gaps between heads. NO warm colours in the background.

STYLE - STRICT: early-2000s TV action-cartoon as FLAT VECTOR ART. Bold uniform ink outline on every shape, thick even marker-pen weight, outline colour DARK NAVY BLUE #101A35 - never black. Completely FLAT cel shading: one solid fill plus at most one hard-edged shadow shape.

FORBIDDEN: gradients, airbrush, soft shading, blur, glow, vignette, 3D rendering, cloth texture, glossy highlights, painterly brushwork.

Must stay readable shrunk to 48x48 pixels.`;
