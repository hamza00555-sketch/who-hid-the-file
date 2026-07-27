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
