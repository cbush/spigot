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
      blanklines: [],
      children: [
        {
          blanklines: ["\n"],
          children: [
            {
              position: {
                end: {
                  column: 1,
                  line: 3,
                  offset: 13,
                },
                start: {
                  column: 1,
                  line: 2,
                  offset: 1,
                },
              },
              type: "text",
              value: "This is rST\n",
            },
          ],
          position: {
            end: {
              column: 1,
              line: 3,
              offset: 13,
            },
            start: {
              column: 1,
              line: 2,
              offset: 1,
            },
          },
          type: "paragraph",
        },
        {
          blanklines: ["\n"],
          children: [
            {
              blanklines: [],
              children: [
                {
                  position: {
                    end: {
                      column: 7,
                      line: 5,
                      offset: 27,
                    },
                    start: {
                      column: 1,
                      line: 5,
                      offset: 21,
                    },
                  },
                  type: "text",
                  value: "Header",
                },
              ],
              position: {
                end: {
                  column: 1,
                  line: 7,
                  offset: 35,
                },
                start: {
                  column: 1,
                  line: 4,
                  offset: 14,
                },
              },
              type: "title",
            },
            {
              blanklines: ["\n"],
              children: [
                {
                  position: {
                    end: {
                      column: 1,
                      line: 9,
                      offset: 64,
                    },
                    start: {
                      column: 1,
                      line: 8,
                      offset: 36,
                    },
                  },
                  type: "text",
                  value: "This is the heading section\n",
                },
              ],
              position: {
                end: {
                  column: 1,
                  line: 9,
                  offset: 64,
                },
                start: {
                  column: 1,
                  line: 8,
                  offset: 36,
                },
              },
              type: "paragraph",
            },
            {
              blanklines: ["\n"],
              children: [
                {
                  blanklines: [],
                  children: [
                    {
                      position: {
                        end: {
                          column: 11,
                          line: 10,
                          offset: 75,
                        },
                        start: {
                          column: 1,
                          line: 10,
                          offset: 65,
                        },
                      },
                      type: "text",
                      value: "Subsection",
                    },
                  ],
                  position: {
                    end: {
                      column: 1,
                      line: 12,
                      offset: 87,
                    },
                    start: {
                      column: 1,
                      line: 10,
                      offset: 65,
                    },
                  },
                  type: "title",
                },
                {
                  blanklines: [],
                  children: [
                    {
                      position: {
                        end: {
                          column: 1,
                          line: 13,
                          offset: 108,
                        },
                        start: {
                          column: 1,
                          line: 12,
                          offset: 87,
                        },
                      },
                      type: "text",
                      value: "This is a subsection\n",
                    },
                  ],
                  position: {
                    end: {
                      column: 1,
                      line: 13,
                      offset: 108,
                    },
                    start: {
                      column: 1,
                      line: 12,
                      offset: 87,
                    },
                  },
                  type: "paragraph",
                },
                {
                  blanklines: ["\n"],
                  children: [
                    {
                      blanklines: [],
                      children: [
                        {
                          position: {
                            end: {
                              column: 1,
                              line: 17,
                              offset: 155,
                            },
                            start: {
                              column: 4,
                              line: 16,
                              offset: 132,
                            },
                          },
                          type: "text",
                          value: "This is some directive\n",
                        },
                      ],
                      position: {
                        end: {
                          column: 1,
                          line: 17,
                          offset: 155,
                        },
                        start: {
                          column: 1,
                          line: 16,
                          offset: 129,
                        },
                      },
                      type: "paragraph",
                    },
                  ],
                  directive: "some-directive",
                  indent: {
                    offset: 3,
                    width: 3,
                  },
                  position: {
                    end: {
                      column: 1,
                      line: 18,
                      offset: 157,
                    },
                    start: {
                      column: 1,
                      line: 14,
                      offset: 109,
                    },
                  },
                  type: "directive",
                },
              ],
              depth: 2,
              position: {
                end: {
                  column: 1,
                  line: 18,
                  offset: 157,
                },
                start: {
                  column: 1,
                  line: 9,
                  offset: 64,
                },
              },
              type: "section",
            },
          ],
          depth: 1,
          position: {
            end: {
              column: 1,
              line: 18,
              offset: 157,
            },
            start: {
              column: 1,
              line: 3,
              offset: 13,
            },
          },
          type: "section",
        },
      ],
      position: {
        end: {
          column: 5,
          line: 18,
          offset: 161,
        },
        start: {
          column: 1,
          line: 1,
          offset: 0,
        },
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
              type: "text",
              value: "_my-target:",
            },
          ],
          type: "comment",
        },
        {
          children: [
            {
              children: [
                {
                  type: "text",
                  value: "Section 1",
                },
              ],
              type: "title",
            },
            {
              children: [
                {
                  type: "text",
                  value: "Some text\n",
                },
              ],
              type: "paragraph",
            },
            {
              children: [
                {
                  type: "text",
                  value: "_my-target2:", // Not associated with the next section
                },
              ],
              type: "comment",
            },
            {
              children: [
                {
                  children: [
                    {
                      type: "text",
                      value: "Sub-section",
                    },
                  ],
                  type: "title",
                },
                {
                  children: [
                    {
                      type: "text",
                      value: "Some more text\n",
                    },
                  ],
                  type: "paragraph",
                },
                {
                  children: [
                    {
                      type: "text",
                      value: "_my-target3:",
                    },
                  ],
                  type: "comment",
                },
              ],
              depth: 2,
              type: "section",
            },
          ],
          depth: 1,
          type: "section",
        },
        {
          children: [
            {
              children: [
                {
                  type: "text",
                  value: "Section 2",
                },
              ],
              type: "title",
            },
            {
              children: [
                {
                  type: "text",
                  value: "Even more text\n",
                },
              ],
              type: "paragraph",
            },
          ],
          depth: 1,
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

  it("parses text within directives", () => {
    const parser = new Parser();
    const document = TextDocument.create(
      "test.txt",
      "restructuredtext",
      0,
      `
.. seealso:: 
   :option: foo, bar
   :option2: another value

   This is :ref:\`parsed\`

.. code-block::
   :option: foo, bar

   This is :ref:\`not parsed\`
`
    );
    const result = parser.parse(document);
    expect(result).toStrictEqual({
      blanklines: [],
      children: [
        {
          blanklines: ["\n"],
          children: [
            {
              blanklines: [],
              children: [
                {
                  position: {
                    end: {
                      column: 1,
                      line: 4,
                      offset: 35,
                    },
                    start: {
                      column: 4,
                      line: 3,
                      offset: 17,
                    },
                  },
                  type: "text",
                  value: ":option: foo, bar\n",
                },
                {
                  position: {
                    end: {
                      column: 1,
                      line: 5,
                      offset: 62,
                    },
                    start: {
                      column: 4,
                      line: 4,
                      offset: 38,
                    },
                  },
                  type: "text",
                  value: ":option2: another value\n",
                },
              ],
              position: {
                end: {
                  column: 1,
                  line: 5,
                  offset: 62,
                },
                start: {
                  column: 1,
                  line: 3,
                  offset: 14,
                },
              },
              type: "paragraph",
            },
            {
              blanklines: ["\n"],
              children: [
                {
                  position: {
                    end: {
                      column: 12,
                      line: 6,
                      offset: 74,
                    },
                    start: {
                      column: 4,
                      line: 6,
                      offset: 66,
                    },
                  },
                  type: "text",
                  value: "This is ",
                },
                {
                  blanklines: [],
                  children: [
                    {
                      position: {
                        end: {
                          column: 25,
                          line: 6,
                          offset: 87,
                        },
                        start: {
                          column: 18,
                          line: 6,
                          offset: 80,
                        },
                      },
                      type: "text",
                      value: "parsed",
                    },
                  ],
                  position: {
                    end: {
                      column: 25,
                      line: 6,
                      offset: 87,
                    },
                    start: {
                      column: 12,
                      line: 6,
                      offset: 74,
                    },
                  },
                  role: "ref",
                  type: "interpreted_text",
                },
                {
                  position: {
                    end: {
                      column: 1,
                      line: 7,
                      offset: 88,
                    },
                    start: {
                      column: 4,
                      line: 6,
                      offset: 66,
                    },
                  },
                  type: "text",
                  value: "\n",
                },
              ],
              position: {
                end: {
                  column: 1,
                  line: 7,
                  offset: 88,
                },
                start: {
                  column: 1,
                  line: 6,
                  offset: 63,
                },
              },
              type: "paragraph",
            },
          ],
          directive: "seealso",
          indent: {
            offset: 3,
            width: 3,
          },
          position: {
            end: {
              column: 1,
              line: 8,
              offset: 90,
            },
            start: {
              column: 1,
              line: 2,
              offset: 1,
            },
          },
          type: "directive",
        },
        {
          blanklines: [],
          children: [
            {
              position: {
                end: {
                  column: 1,
                  line: 12,
                  offset: 157,
                },
                start: {
                  column: 1,
                  line: 9,
                  offset: 106,
                },
              },
              type: "text",
              value: ":option: foo, bar",
            },
            {
              position: {
                end: {
                  column: 1,
                  line: 12,
                  offset: 157,
                },
                start: {
                  column: 1,
                  line: 9,
                  offset: 106,
                },
              },
              type: "text",
              value: "This is :ref:`not parsed`",
            },
          ],
          directive: "code-block",
          indent: {
            offset: 3,
            width: 3,
          },
          position: {
            end: {
              column: 1,
              line: 12,
              offset: 157,
            },
            start: {
              column: 1,
              line: 8,
              offset: 90,
            },
          },
          type: "directive",
        },
      ],
      position: {
        end: {
          column: 1,
          line: 12,
          offset: 157,
        },
        start: {
          column: 1,
          line: 1,
          offset: 0,
        },
      },
      type: "document",
    });
  });
});
