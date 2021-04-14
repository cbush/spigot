import { TextDocument } from "vscode-languageserver-textdocument";
import { Parser } from "./Parser";

let parser = new Parser();

beforeEach(() => {
  parser = new Parser();
});

describe("findReferences", () => {
  it("finds no references", () => {
    const document = TextDocument.create(
      "test",
      "",
      0,
      `
There are no references in this document.
:ref: is close, but not.
:ref:\`? forget it.
`
    );

    const references = parser.findReferences(document);
    expect(references.length).toBe(0);
  });

  it("finds a target-only reference", () => {
    const document = TextDocument.create(
      "test",
      "",
      0,
      "This document has :ref:`one-reference`"
    );

    const references = parser.findReferences(document);
    expect(references.length).toBe(1);
    expect(references[0].location.uri).toBe("test");
    expect(references[0].location.range.start.line).toBe(0);
    expect(references[0].location.range.start.character).toBe(18);
    expect(document.getText(references[0].location.range)).toBe(
      ":ref:`one-reference`"
    );
    expect(references[0].name).toBe("one-reference");
    expect(references[0].type).toBe("rst.role.ref");
  });

  it("finds a reference with text", () => {
    const document = TextDocument.create(
      "test",
      "",
      0,
      "This document has :ref:`a reference with text <reference-with-text>`"
    );

    const references = parser.findReferences(document);
    expect(references.length).toBe(1);
    expect(references[0].location.range.start.line).toBe(0);
    expect(references[0].location.range.start.character).toBe(18);
    expect(document.getText(references[0].location.range)).toBe(
      ":ref:`a reference with text <reference-with-text>`"
    );
    expect(references[0].name).toBe("reference-with-text");
  });

  it("finds a multi-line reference with text", () => {
    const document = TextDocument.create(
      "test",
      "",
      0,
      `This document has :ref:\`a reference with text
that spans multiple lines <multiline>\`
`
    );

    const references = parser.findReferences(document);
    expect(references.length).toBe(1);
    expect(references[0].location.range.start.line).toBe(0);
    expect(references[0].location.range.start.character).toBe(18);
    expect(references[0].location.range.end.line).toBe(1);
    expect(references[0].location.range.end.character).toBe(38);
    expect(document.getText(references[0].location.range))
      .toBe(`:ref:\`a reference with text
that spans multiple lines <multiline>\``);
    expect(references[0].name).toBe("multiline");
  });

  it("finds multiple references", () => {
    const document = TextDocument.create(
      "test",
      "",
      0,
      `
This document has :ref:\`one-reference\`.
This document has :ref:\`another-reference\`.
`
    );

    const references = parser.findReferences(document);
    expect(references.length).toBe(2);
    expect(references[0].name).toBe("one-reference");
    expect(references[1].name).toBe("another-reference");
  });

  it("finds multiple kinds of references", () => {
    const document = TextDocument.create(
      "test",
      "",
      0,
      `
This document has :ref:\`one-reference\`.
This document has :ref:\`another-reference\`.
This document has :ref:\`another kind of reference <one-reference>\`.
This document even has :ref:\`invalid references <invalid reference >\`, but parser.findReferences() doesn't care.
There are :ref:\`multiline
references <multiline>\` here.
This document also has things that look like a reference :ref: :REF:\`nope\` but aren't.
`
    );

    const references = parser.findReferences(document);
    expect(references.length).toBe(5);
    expect(references[0].name).toBe("one-reference");
    expect(references[1].name).toBe("another-reference");
    expect(references[2].name).toBe("one-reference");
    expect(references[3].name).toBe("invalid reference ");
    expect(references[4].name).toBe("multiline");
    expect(document.getText(references[4].location.range))
      .toBe(`:ref:\`multiline
references <multiline>\``);
  });

  it("ignores commented-out references", () => {
    const document = TextDocument.create(
      "test",
      "",
      0,
      `
.. This document has :ref:\`one-reference\` but it's commented out

This document has :ref:\`an-uncommented-reference\` as well

.. :ref:\`this one <one-reference>\` is also commented out
`
    );

    const references = parser.findReferences(document);
    expect(references.length).toBe(1);
    expect(references[0].name).toBe("an-uncommented-reference");
  });

  it("finds references in directives", () => {
    const document = TextDocument.create(
      "test",
      "",
      0,
      `This :ref:\`ref <first-ref>\` is in normal text.

.. example::
   
   Test.
   This :ref:\`one <second-ref>\` is in a seealso text.
   Oh, here's :ref:\`another one\` is in a seealso text.
   
   .. seealso::
      
      And this :ref:\`one 
      <fourth-ref>\` spans multiple lines.
`
    );

    const references = parser.findReferences(document);
    expect(references.length).toBe(4);
    expect(references[0].location.range).toMatchObject({
      start: {
        character: 5,
        line: 0,
      },
      end: {
        character: 27,
        line: 0,
      },
    });
    expect(references[1].location.range).toMatchObject({
      start: {
        character: 8,
        line: 5,
      },
      end: {
        character: 31,
        line: 5,
      },
    });
    expect(references[2].location.range).toMatchObject({
      start: {
        character: 14,
        line: 6,
      },
      end: {
        character: 32,
        line: 6,
      },
    });
    expect(references[3].location.range).toMatchObject({
      start: {
        character: 15,
        line: 10,
      },
      end: {
        character: 19,
        line: 11,
      },
    });
  });
});
