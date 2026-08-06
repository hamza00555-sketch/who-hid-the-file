/**
 * حارس الشاشة — آخر خطّ بين خطأ في العرض وجهازٍ أسود.
 *
 * حين ترمي شجرة React تُفكَّك كاملةً ويبقى `<main>` فارغًا: لا نصّ، لا زر،
 * ولا شيء يقول إن ثمّة عطلًا. وهذا ما حدث فعلًا حين كان سرٌّ ناقص من الشبكة
 * يرمي TypeError — «شاشة اختفت ولم تعد إلا بتحديث الصفحة».
 *
 * لا يمنع الحارس الخطأ، لكنه يحوّله إلى شيء يُقرأ ويُتجاوَز: سبب مكتوب، وزرّ
 * إعادة محاولة يُعيد بناء الشجرة بلا فقد الجلسة، وتحديثٌ كامل عند اللزوم.
 */

import { Component, type ErrorInfo, type ReactNode } from 'react';

interface Props {
  children: ReactNode;
}

interface State {
  error: Error | null;
}

export class ScreenGuard extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    // يبقى في سجلّ المتصفح لمن يفتحه — لا يُرسل إلى أي جهة
    console.error('انهارت الشاشة:', error, info.componentStack);
  }

  render() {
    const { error } = this.state;
    if (!error) return this.props.children;

    return (
      <div className="screen screen--guard">
        <div className="screen__body screen-guard">
          <h2>تعثّرت الشاشة</h2>
          <p className="lede">
            الجلسة ما زالت قائمة على بقية الأجهزة. أعد المحاولة، وإن تكرّر فحدّث
            الصفحة — سيعيدك التطبيق إلى مكانك في الجولة.
          </p>
          <p className="screen-guard__reason" dir="auto">
            {error.message}
          </p>
          <div className="row">
            <button type="button" className="btn btn--md btn--primary" onClick={() => this.setState({ error: null })}>
              أعد المحاولة
            </button>
            <button
              type="button"
              className="btn btn--md btn--quiet"
              onClick={() => window.location.reload()}
            >
              حدّث الصفحة
            </button>
          </div>
        </div>
      </div>
    );
  }
}
