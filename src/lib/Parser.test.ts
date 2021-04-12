import { strict as assert } from "assert";
import { Parser } from "./Parser";
import { TextDocument } from "vscode-languageserver-textdocument";

describe("Parser", () => {
  it("parses rST", () => {
    const parser = new Parser();
    const document = TextDocument.create(
      "test.txt",
      "restructuredtext",
      0,
      `
This is rST

======
Header
======

This is the heading section

Subsection
==========
This is a subsection

.. some-directive::

   This is some directive

    `
    );
    const result = parser.parse(document);
    expect(result).toStrictEqual({
      children: [
        {
          children: [
            {
              position: {
                end: { column: 1, line: 3, offset: 13 },
                start: { column: 1, line: 2, offset: 1 },
              },
              type: "text",
              value: "This is rST\n",
            },
          ],
          position: {
            end: { column: 1, line: 3, offset: 13 },
            start: { column: 1, line: 2, offset: 1 },
          },
          type: "paragraph",
        },
        {
          children: [
            {
              children: [
                {
                  position: {
                    end: { column: 7, line: 5, offset: 27 },
                    start: { column: 1, line: 5, offset: 21 },
                  },
                  type: "text",
                  value: "Header",
                },
              ],
              position: {
                end: { column: 1, line: 7, offset: 35 },
                start: { column: 1, line: 4, offset: 14 },
              },
              type: "title",
            },
            {
              children: [
                {
                  position: {
                    end: { column: 1, line: 9, offset: 64 },
                    start: { column: 1, line: 8, offset: 36 },
                  },
                  type: "text",
                  value: "This is the heading section\n",
                },
              ],
              position: {
                end: { column: 1, line: 9, offset: 64 },
                start: { column: 1, line: 8, offset: 36 },
              },
              type: "paragraph",
            },
            {
              children: [
                {
                  children: [
                    {
                      position: {
                        end: { column: 11, line: 10, offset: 75 },
                        start: { column: 1, line: 10, offset: 65 },
                      },
                      type: "text",
                      value: "Subsection",
                    },
                  ],
                  position: {
                    end: { column: 1, line: 12, offset: 87 },
                    start: { column: 1, line: 10, offset: 65 },
                  },
                  type: "title",
                },
                {
                  children: [
                    {
                      position: {
                        end: { column: 1, line: 13, offset: 108 },
                        start: { column: 1, line: 12, offset: 87 },
                      },
                      type: "text",
                      value: "This is a subsection\n",
                    },
                  ],
                  position: {
                    end: { column: 1, line: 13, offset: 108 },
                    start: { column: 1, line: 12, offset: 87 },
                  },
                  type: "paragraph",
                },
                {
                  children: [
                    {
                      position: {
                        end: { column: 1, line: 18, offset: 157 },
                        start: { column: 1, line: 15, offset: 129 },
                      },
                      type: "text",
                      value: "This is some directive",
                    },
                  ],
                  directive: "some-directive",
                  position: {
                    end: { column: 1, line: 18, offset: 157 },
                    start: { column: 1, line: 14, offset: 109 },
                  },
                  type: "directive",
                },
              ],
              depth: 2,
              position: {
                end: { column: 1, line: 18, offset: 157 },
                start: { column: 1, line: 9, offset: 64 },
              },
              type: "section",
            },
          ],
          depth: 1,
          position: {
            end: { column: 1, line: 18, offset: 157 },
            start: { column: 1, line: 3, offset: 13 },
          },
          type: "section",
        },
      ],
      position: {
        end: { column: 5, line: 18, offset: 161 },
        start: { column: 1, line: 1, offset: 0 },
      },
      type: "document",
    });
  });

  it("reuses cached results", () => {
    const parser = new Parser();
    const document = TextDocument.create(
      "test.txt",
      "restructuredtext",
      0,
      "This is rST"
    );
    const document2 = TextDocument.create(
      "test2.txt",
      "restructuredtext",
      0,
      "This is rST"
    );
    const result = parser.parse(document);
    const result2 = parser.parse(document2);
    // Use strict equality to see whether it is the exact same instance, not a new
    // copy
    expect(result !== result2).toBeTruthy();

    const result3 = parser.parse(document);
    expect(result === result3).toBeTruthy();

    const document3 = TextDocument.create(
      "test.txt", // same as first
      "restructuredtext",
      1,
      "This is rST"
    );
    const result4 = parser.parse(document3);
    expect(result !== result4).toBeTruthy();
  });

  it("finds interpreted text roles", () => {
    const parser = new Parser();
    const document = TextDocument.create(
      "test.txt",
      "restructuredtext",
      0,
      `It seems that this :ref:\`interpreted text <interpreted-text>\` actually works.`
    );
    const result = parser.parse(document);
    expect(result).toMatchObject({
      type: "document",
      children: [
        {
          type: "paragraph",
          children: [
            {
              type: "text",
              value: "It seems that this ",
            },
            {
              children: [
                {
                  type: "text",
                  value: "interpreted text <interpreted-text>",
                },
              ],
              role: "ref",
              type: "interpreted_text",
            },
            {
              type: "text",
              value: " actually works.",
            },
          ],
        },
      ],
    });
  });

  it("treats targets as comments", () => {
    // This is a limitation of the `restructured` node library.
    const parser = new Parser();
    const document = TextDocument.create(
      "test.txt",
      "restructuredtext",
      0,
      ".. _my-target:"
    );
    const result = parser.parse(document);
    expect(result).toMatchObject({
      type: "document",
      children: [
        {
          type: "comment",
          children: [
            {
              type: "text",
              value: "_my-target:",
            },
          ],
        },
      ],
    });
  });

  it("has 1-based lines and columns", () => {
    // This is a limitation of the `restructured` node library.
    const parser = new Parser();
    const document = TextDocument.create(
      "test.txt",
      "restructuredtext",
      0,
      "Line"
    );
    const result = parser.parse(document);
    assert(result.children !== undefined);
    const paragraph = result.children[0];
    assert(paragraph.children !== undefined);
    const text = paragraph.children[0];
    expect(text.position).toStrictEqual({
      end: {
        column: 5,
        line: 1,
        offset: 4,
      },
      start: {
        column: 1,
        line: 1,
        offset: 0,
      },
    });

    expect(
      document.offsetAt({
        // TextDocument has 0-based line and character (column), so subtract 1
        // from each to convert
        line: text.position.start.line - 1,
        character: text.position.start.column - 1,
      })
    ).toBe(0);

    expect(
      document.offsetAt({
        line: text.position.start.line,
        character: text.position.start.column,
      })
    ).toBe(4); // This would be the WRONG answer. We did not convert.
  });

  it("includes targets as comments in previous section", () => {
    // This is a limitation of the `restructured` node library.
    const parser = new Parser();
    const document = TextDocument.create(
      "test.txt",
      "restructuredtext",
      0,
      `
.. _my-target:

Section 1
---------      

Some text

.. _my-target2:

Sub-section
~~~~~~~~~~~

Some more text

.. _my-target3:

Section 2
--------- 

Even more text
`
    );
    const result = parser.parse(document);
    expect(result).toMatchObject({
      type: "document",
      children: [
        {
          children: [
            {
              position: {
                end: {
                  column: 1,
                  line: 3,
                  offset: 16,
                },
                start: {
                  column: 1,
                  line: 2,
                  offset: 1,
                },
              },
              type: "text",
              value: "_my-target:",
            },
          ],
          position: {
            end: {
              column: 1,
              line: 3,
              offset: 16,
            },
            start: {
              column: 1,
              line: 2,
              offset: 1,
            },
          },
          type: "comment",
        },
        {
          children: [
            {
              children: [
                {
                  position: {
                    end: {
                      column: 10,
                      line: 4,
                      offset: 26,
                    },
                    start: {
                      column: 1,
                      line: 4,
                      offset: 17,
                    },
                  },
                  type: "text",
                  value: "Section 1",
                },
              ],
              position: {
                end: {
                  column: 1,
                  line: 6,
                  offset: 43,
                },
                start: {
                  column: 1,
                  line: 4,
                  offset: 17,
                },
              },
              type: "title",
            },
            {
              children: [
                {
                  position: {
                    end: {
                      column: 1,
                      line: 8,
                      offset: 54,
                    },
                    start: {
                      column: 1,
                      line: 7,
                      offset: 44,
                    },
                  },
                  type: "text",
                  value: "Some text\n",
                },
              ],
              position: {
                end: {
                  column: 1,
                  line: 8,
                  offset: 54,
                },
                start: {
                  column: 1,
                  line: 7,
                  offset: 44,
                },
              },
              type: "paragraph",
            },
            {
              children: [
                {
                  position: {
                    end: {
                      column: 1,
                      line: 10,
                      offset: 71,
                    },
                    start: {
                      column: 1,
                      line: 9,
                      offset: 55,
                    },
                  },
                  type: "text",
                  value: "_my-target2:", // Not associated with the next section
                },
              ],
              position: {
                end: {
                  column: 1,
                  line: 10,
                  offset: 71,
                },
                start: {
                  column: 1,
                  line: 9,
                  offset: 55,
                },
              },
              type: "comment",
            },
            {
              children: [
                {
                  children: [
                    {
                      position: {
                        end: {
                          column: 12,
                          line: 11,
                          offset: 83,
                        },
                        start: {
                          column: 1,
                          line: 11,
                          offset: 72,
                        },
                      },
                      type: "text",
                      value: "Sub-section",
                    },
                  ],
                  position: {
                    end: {
                      column: 1,
                      line: 13,
                      offset: 96,
                    },
                    start: {
                      column: 1,
                      line: 11,
                      offset: 72,
                    },
                  },
                  type: "title",
                },
                {
                  children: [
                    {
                      position: {
                        end: {
                          column: 1,
                          line: 15,
                          offset: 112,
                        },
                        start: {
                          column: 1,
                          line: 14,
                          offset: 97,
                        },
                      },
                      type: "text",
                      value: "Some more text\n",
                    },
                  ],
                  position: {
                    end: {
                      column: 1,
                      line: 15,
                      offset: 112,
                    },
                    start: {
                      column: 1,
                      line: 14,
                      offset: 97,
                    },
                  },
                  type: "paragraph",
                },
                {
                  children: [
                    {
                      position: {
                        end: {
                          column: 1,
                          line: 17,
                          offset: 129,
                        },
                        start: {
                          column: 1,
                          line: 16,
                          offset: 113,
                        },
                      },
                      type: "text",
                      value: "_my-target3:",
                    },
                  ],
                  position: {
                    end: {
                      column: 1,
                      line: 17,
                      offset: 129,
                    },
                    start: {
                      column: 1,
                      line: 16,
                      offset: 113,
                    },
                  },
                  type: "comment",
                },
              ],
              depth: 2,
              position: {
                end: {
                  column: 1,
                  line: 17,
                  offset: 129,
                },
                start: {
                  column: 1,
                  line: 10,
                  offset: 71,
                },
              },
              type: "section",
            },
          ],
          depth: 1,
          position: {
            end: {
              column: 1,
              line: 17,
              offset: 129,
            },
            start: {
              column: 1,
              line: 3,
              offset: 16,
            },
          },
          type: "section",
        },
        {
          children: [
            {
              children: [
                {
                  position: {
                    end: {
                      column: 10,
                      line: 18,
                      offset: 139,
                    },
                    start: {
                      column: 1,
                      line: 18,
                      offset: 130,
                    },
                  },
                  type: "text",
                  value: "Section 2",
                },
              ],
              position: {
                end: {
                  column: 1,
                  line: 20,
                  offset: 151,
                },
                start: {
                  column: 1,
                  line: 18,
                  offset: 130,
                },
              },
              type: "title",
            },
            {
              children: [
                {
                  position: {
                    end: {
                      column: 1,
                      line: 22,
                      offset: 167,
                    },
                    start: {
                      column: 1,
                      line: 21,
                      offset: 152,
                    },
                  },
                  type: "text",
                  value: "Even more text\n",
                },
              ],
              position: {
                end: {
                  column: 1,
                  line: 22,
                  offset: 167,
                },
                start: {
                  column: 1,
                  line: 21,
                  offset: 152,
                },
              },
              type: "paragraph",
            },
          ],
          depth: 1,
          position: {
            end: {
              column: 1,
              line: 22,
              offset: 167,
            },
            start: {
              column: 1,
              line: 17,
              offset: 129,
            },
          },
          type: "section",
        },
      ],
    });
  });

  it("doesn't seem to care about errors", () => {
    const parser = new Parser();
    const document = TextDocument.create(
      "test.txt",
      "restructuredtext",
      0,
      "it's an unclosed :ref:`ref-role"
    );
    const result = parser.parse(document);
    expect(result).toBeDefined();
  });
});
