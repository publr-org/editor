// The document the model parses HTML in. The model never reaches for the page's globals
// on its own: a host (or a test) hands it a document, and only when none was given does
// it make an inert one from the current realm.
let current: Document | null = null;

export function useParsingDocument(doc: Document): void {
  current = doc;
}

export function parsingDocument(): Document {
  if (!current) {
    const realm = globalThis as unknown as { document?: Document };
    if (!realm.document) throw new Error("editor: no document to parse HTML in; call useParsingDocument");
    current = realm.document.implementation.createHTMLDocument("");
  }
  return current;
}
