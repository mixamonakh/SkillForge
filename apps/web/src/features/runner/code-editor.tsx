'use client';

import { javascript } from '@codemirror/lang-javascript';
import { EditorState } from '@codemirror/state';
import { EditorView, keymap, lineNumbers } from '@codemirror/view';
import { defaultKeymap, history, historyKeymap } from '@codemirror/commands';
import { useEffect, useRef } from 'react';

export function CodeEditor({
  value,
  onChange,
  language = 'javascript',
  ariaLabel = 'Редактор кода',
}: {
  value: string;
  onChange: (value: string) => void;
  language?: string;
  ariaLabel?: string;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const viewRef = useRef<EditorView | null>(null);
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;

  useEffect(() => {
    if (!containerRef.current) return;
    const state = EditorState.create({
      doc: value,
      extensions: [
        lineNumbers(),
        history(),
        keymap.of([...defaultKeymap, ...historyKeymap]),
        javascript({ typescript: language === 'typescript' }),
        EditorView.lineWrapping,
        EditorView.contentAttributes.of({ 'aria-label': ariaLabel }),
        EditorView.updateListener.of((update) => {
          if (update.docChanged) onChangeRef.current(update.state.doc.toString());
        }),
        EditorView.theme({
          '&': { minHeight: '320px', border: '1px solid #b7c8df', borderRadius: '10px' },
          '.cm-scroller': { fontFamily: 'var(--font-jetbrains), monospace', lineHeight: '1.55' },
          '.cm-content': { minHeight: '300px', padding: '12px 0' },
          '&.cm-focused': { outline: '2px solid #104ff2', outlineOffset: '2px' },
        }),
      ],
    });
    const view = new EditorView({ state, parent: containerRef.current });
    viewRef.current = view;
    return () => {
      view.destroy();
      viewRef.current = null;
    };
  }, [ariaLabel, language]);

  useEffect(() => {
    const view = viewRef.current;
    if (!view || view.state.doc.toString() === value) return;
    view.dispatch({ changes: { from: 0, to: view.state.doc.length, insert: value } });
  }, [value]);

  return <div ref={containerRef} className="sf-code-editor" />;
}
