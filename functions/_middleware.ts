import { onRequest as handleEnglishEntry } from "./en/[[path]]";

type PagesContext = {
  request: Request;
  next(): Promise<Response>;
};

const ENGLISH_ENTRY_PATHS = new Set(["/en", "/en/", "/en/index.html"]);

export async function onRequest(context: PagesContext): Promise<Response> {
  const { pathname } = new URL(context.request.url);

  if (ENGLISH_ENTRY_PATHS.has(pathname)) {
    return handleEnglishEntry(context);
  }

  return context.next();
}
