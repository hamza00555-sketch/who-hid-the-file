/**
 * طاقم الشخصيات.
 *
 * الشخصيات تُرسم إجرائيًا من هذه المعطيات في `src/ui/components/Character.tsx`،
 * فإضافة شخصية جديدة = إضافة سطر هنا فقط. لا حاجة لملف صورة.
 *
 * لاستبدال الرسم الإجرائي بأصول مرسومة يدويًا لاحقًا: املأ `artSrc` بمسار الصورة
 * وسيستخدمها المكوّن بدل الرسم الإجرائي.
 */

export type Headwear = 'shemagh-red' | 'shemagh-white' | 'ghutra' | 'hijab' | 'tarha' | 'none';
export type Hair = 'short' | 'wavy' | 'curly' | 'bun' | 'buzz' | 'ponytail' | 'fringe';
export type FacialHair = 'none' | 'beard' | 'stubble' | 'moustache';
export type Accessory = 'none' | 'glasses' | 'lanyard' | 'headphones' | 'cap' | 'earring';
export type Build = 'slim' | 'regular' | 'broad';
export type Outfit = 'thobe' | 'abaya' | 'blazer' | 'polo' | 'hoodie' | 'shirt';

/** حالات الشخصية — كل حالة تغيّر الوجه ووضعية الجسد. */
export type CharacterState =
  | 'idle'
  | 'asleep'
  | 'startled'
  | 'suspicious'
  | 'hiding'
  | 'victory'
  | 'defeat'
  | 'look-right'
  | 'look-left';

export const CHARACTER_STATES: readonly CharacterState[] = [
  'idle',
  'asleep',
  'startled',
  'suspicious',
  'hiding',
  'victory',
  'defeat',
  'look-right',
  'look-left',
];

export interface CharacterDef {
  id: string;
  name: string;
  /** جملة قصيرة تظهر عند الاختيار — شخصية لا وظيفة */
  trait: string;
  skin: string;
  hairColor: string;
  outfit: Outfit;
  outfitColor: string;
  accentColor: string;
  headwear: Headwear;
  hair: Hair;
  facialHair: FacialHair;
  accessory: Accessory;
  build: Build;
  /** مسار صورة بديلة إن توفّرت أصول مرسومة لاحقًا */
  artSrc?: string;
}

export const ROSTER: readonly CharacterDef[] = [
  {
    id: 'faisal',
    name: 'فيصل',
    trait: 'يوافق على كل شيء ثم يغيّر رأيه',
    skin: '#c98a5e',
    hairColor: '#241a16',
    outfit: 'thobe',
    outfitColor: '#f2f5fb',
    accentColor: '#c2453d',
    headwear: 'shemagh-red',
    hair: 'short',
    facialHair: 'beard',
    accessory: 'none',
    build: 'regular',
  },
  {
    id: 'noura',
    name: 'نورة',
    trait: 'تكتب ملاحظات عن الجميع',
    skin: '#e0ab7c',
    hairColor: '#1c1512',
    outfit: 'abaya',
    outfitColor: '#25325c',
    accentColor: '#d98f3d',
    headwear: 'tarha',
    hair: 'wavy',
    facialHair: 'none',
    accessory: 'glasses',
    build: 'slim',
  },
  {
    id: 'majed',
    name: 'ماجد',
    trait: 'يضحك في أسوأ اللحظات',
    skin: '#8d5a36',
    hairColor: '#100c0a',
    outfit: 'polo',
    outfitColor: '#2f7f6d',
    accentColor: '#f0c04a',
    headwear: 'none',
    hair: 'buzz',
    facialHair: 'stubble',
    accessory: 'lanyard',
    build: 'broad',
  },
  {
    id: 'lama',
    name: 'لمى',
    trait: 'تشك في الجميع من الدقيقة الأولى',
    skin: '#f0c39a',
    hairColor: '#5a2c1c',
    outfit: 'blazer',
    outfitColor: '#7a3450',
    accentColor: '#f3dfe8',
    headwear: 'none',
    hair: 'bun',
    facialHair: 'none',
    accessory: 'earring',
    build: 'regular',
  },
  {
    id: 'saud',
    name: 'سعود',
    trait: 'ينام في الاجتماعات ويستيقظ في الليل',
    skin: '#b57748',
    hairColor: '#2b1f1a',
    outfit: 'thobe',
    outfitColor: '#e8eef8',
    accentColor: '#3f5f9e',
    headwear: 'ghutra',
    hair: 'short',
    facialHair: 'moustache',
    accessory: 'none',
    build: 'slim',
  },
  {
    id: 'reem',
    name: 'ريم',
    trait: 'تحفظ ترتيب الجلوس عن ظهر قلب',
    skin: '#d99a6c',
    hairColor: '#241512',
    outfit: 'abaya',
    outfitColor: '#1d2a4d',
    accentColor: '#5fc4b8',
    headwear: 'hijab',
    hair: 'fringe',
    facialHair: 'none',
    accessory: 'none',
    build: 'regular',
  },
  {
    id: 'tariq',
    name: 'طارق',
    trait: 'يحمل سماعاته دائمًا ولا يسمع شيئًا',
    skin: '#7a4b2c',
    hairColor: '#0f0c0b',
    outfit: 'hoodie',
    outfitColor: '#3d4a86',
    accentColor: '#f07a3f',
    headwear: 'none',
    hair: 'curly',
    facialHair: 'stubble',
    accessory: 'headphones',
    build: 'slim',
  },
  {
    id: 'hessa',
    name: 'حصة',
    trait: 'صوتها أعلى من الجميع في النقاش',
    skin: '#eab98d',
    hairColor: '#39231a',
    outfit: 'shirt',
    outfitColor: '#c9603f',
    accentColor: '#f7e2c8',
    headwear: 'none',
    hair: 'ponytail',
    facialHair: 'none',
    accessory: 'glasses',
    build: 'broad',
  },
  {
    id: 'bandar',
    name: 'بندر',
    trait: 'يقول «أنا بريء» قبل أن يتهمه أحد',
    skin: '#a9713f',
    hairColor: '#1a120e',
    outfit: 'thobe',
    outfitColor: '#eef2fa',
    accentColor: '#4c7c4a',
    headwear: 'shemagh-white',
    hair: 'short',
    facialHair: 'beard',
    accessory: 'none',
    build: 'broad',
  },
  {
    id: 'jood',
    name: 'جود',
    trait: 'أصغر من في الفريق وأخطرهم',
    skin: '#f2cba6',
    hairColor: '#6b3a20',
    outfit: 'hoodie',
    outfitColor: '#8a5ec2',
    accentColor: '#ffd166',
    headwear: 'none',
    hair: 'fringe',
    facialHair: 'none',
    accessory: 'cap',
    build: 'slim',
  },
];

export function characterById(id: string): CharacterDef {
  return ROSTER.find((character) => character.id === id) ?? ROSTER[0]!;
}

/** الشخصيات غير المحجوزة — لمنع تكرار الشخصية بين لاعبين. */
export function availableCharacters(takenIds: readonly string[]): CharacterDef[] {
  return ROSTER.filter((character) => !takenIds.includes(character.id));
}
