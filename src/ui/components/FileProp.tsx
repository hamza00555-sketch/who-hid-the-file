/**
 * الملف — العنصر الفيزيائي في منتصف الطاولة، ونسخته المرسومة داخل اللعبة.
 * الشكل هو نفسه المرجع البصري للقطعة المطبوعة 3D (راجع printable-assets/).
 *
 * الأصول: `public/props/file.png` و `public/props/file-taken.png`.
 */

import './file-prop.css';

type PropState = 'idle' | 'breathing' | 'taken' | 'returned';

interface Props {
  state?: PropState;
  size?: number;
  className?: string;
}

export function FileProp({ state = 'idle', size = 160, className = '' }: Props) {
  const taken = state === 'taken';

  return (
    <span
      className={`file-prop file-prop--${state} ${className}`}
      style={{ height: size }}
      role="img"
      aria-label={taken ? 'مكان الملف فارغ' : 'الملف'}
    >
      <img
        src={taken ? '/props/file-taken.png' : '/props/file.png'}
        alt=""
        height={size}
        decoding="async"
        style={{ height: size, width: 'auto' }}
      />
      {state === 'returned' && (
        <span className="file-prop__sparks" aria-hidden="true">
          <i />
          <i />
          <i />
        </span>
      )}
    </span>
  );
}
