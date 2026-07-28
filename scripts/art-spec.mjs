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
 * الفكرة: أربعة يطلّون من جهات الإطار الأربع كأنهم ينظرون عبر نافذة، والملف
 * في الوسط. المطلوب أن تبقى مقروءة عند 48px، فالعدد أربعة لا أكثر، وبينهم
 * فجوات كحلية تفصل الصور الظلّية.
 */
export const APP_ICON_PROMPT = `A SQUARE MOBILE APP ICON, flat vector cartoon. Full-bleed, edge to edge, NO border, NO frame, NO rounded corners, NO text, NO letters, NO watermark.

COMPOSITION: exactly FOUR big-headed cartoon characters lean in from the four sides of the square - ONE from the top edge, ONE from the left edge, ONE from the right edge, ONE from the bottom edge - as if crowding around a window and peering in. Each is CROPPED by the edge so only the huge head and shoulders are visible. All four stare inward at the centre. Leave clear dark navy gaps BETWEEN the four heads so each silhouette reads as a separate bold shape - do NOT let the faces touch or merge into each other.

CENTRE: a big chunky MANILA FOLDER stands upright in the exact middle, occupying about one third of the whole square - large and dominant. Warm golden-yellow (#E8A93A) flat fill, a few crisp white paper sheets poking out of the top, a bold RED WAX SEAL with a white CHECK MARK on its face, and two darker golden horizontal bars below the seal. It is the single brightest thing in the image.

EXPRESSIONS: wide-eyed suspicion. Enormous cartoon eyes, all pupils aimed at the folder.

CHARACTERS: modern Saudi office colleagues. Two men in crisp white thobes, one with a red-and-white checkered shemagh, one with a plain white ghutra, both with black agal. Two women in coloured abayas, one teal headscarf, one plum headscarf. Varied skin tones.

PROPORTIONS: chibi mascots, head ENORMOUS - about one third of the figure, as wide as the shoulders. NOT realistic anatomy.

STYLE - STRICT: early-2000s TV action-cartoon, drawn as FLAT VECTOR ART. Bold uniform ink outline on every single shape, thick even marker-pen weight, outline colour is DARK NAVY BLUE #101A35 - never black. Completely FLAT cel shading: every colour is ONE solid flat fill plus at most ONE hard-edged darker shadow shape with a crisp edge.

ABSOLUTELY FORBIDDEN: gradients, colour ramps, airbrush, soft shading, blur, glow, vignette, ambient occlusion, 3D rendering, cloth texture, glossy highlights, painterly brushwork. Every pixel belongs to one of a small number of flat colours. If any area fades smoothly from one tone to another, it is WRONG.

BACKGROUND: one single solid flat deep midnight navy #0F1A35 filling all gaps. Perfectly uniform, no vignette, no lighting falloff.

The image must stay instantly readable shrunk to 48x48 pixels: only a few very large bold shapes, high contrast between the golden folder and the dark background.`;
