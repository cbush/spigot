import { Diagnostic, DiagnosticSeverity } from "vscode-languageserver";
import { TextDocument } from "vscode-languageserver-textdocument";
import { connection } from "./server";
import { declarations } from "./workspace";

export async function validateTextDocument(
  textDocument: TextDocument
): Promise<void> {
  const text = textDocument.getText();

  // :ref:`some text <label>`
  const labelAndTextPattern = /:ref:`[^<>]*?<([^`>]*?)>`/gms;

  // :ref:`label`
  const labelPattern = /:ref:`([^<>`]*?)`/gms;

  let m: RegExpExecArray | null;

  const diagnostics: Diagnostic[] = [];
  while ((m = labelAndTextPattern.exec(text) || labelPattern.exec(text))) {
    const label = m[1];
    if (declarations.has(label)) {
      continue;
    }

    let diagnostic: Diagnostic = {
      severity: DiagnosticSeverity.Error,
      range: {
        start: textDocument.positionAt(m.index),
        end: textDocument.positionAt(m.index + m[0].length),
      },
      message: `Unknown label: ${label}.`,
      source: "snoot",
    };
    diagnostics.push(diagnostic);
  }

  // Send the computed diagnostics to VSCode.
  connection.sendDiagnostics({ uri: textDocument.uri, diagnostics });
}
