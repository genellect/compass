import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import ts from 'typescript';

// Parse only the JSX-compatible markup emitted by our own React components.
// This extracts assertion text; it is not an HTML sanitizer or an HTML sink.
export function markupText(markup: string): string {
  const tree = ts.createSourceFile('rendered.tsx', `<>${markup}</>`, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const chunks: string[] = [];
  const visit = (node: ts.Node) => {
    if (ts.isJsxText(node)) chunks.push(node.text);
    else ts.forEachChild(node, visit);
  };
  visit(tree);
  return chunks.join('').replace(/\s/g, '');
}

export const copyText = (text: string) => markupText(renderToStaticMarkup(React.createElement(React.Fragment, null, text)));
